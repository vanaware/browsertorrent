/**
 * @module
 *
 * Lightweight `.torrent` file parser for Deno.
 *
 * @example
 * ```ts
 * import { parseTorrent } from './mod.ts'
 *
 * const fd = await Deno.open('example.torrent', { read: true })
 * try {
 *   const torrent = await parseTorrent(fd)
 *   console.log(torrent.info.name)
 * } finally {
 *   fd.close()
 * }
 * ```
 */

import { BencodeDecodeError, decode } from 'bencode';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Minimal readable interface — satisfied by `Deno.FsFile` and other Deno readers. */
interface Reader {
  read(p: Uint8Array): Promise<number | null>;
}

/** Options controlling resource usage while parsing a torrent. */
export type ParseTorrentOptions = {
  /** Maximum number of input bytes to read. Defaults to no limit. */
  maxBytes?: number;
};

/** Read all bytes from a `Reader` until EOF, enforcing an optional size limit. */
async function readAll(reader: Reader, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(32 * 1024);
  let total = 0;
  while (true) {
    const n = await reader.read(buf);
    if (n === null) break;
    if (n <= 0 || n > buf.length) {
      throw new Error(`Reader returned an invalid byte count: ${n}`);
    }
    total += n;
    if (total > maxBytes) {
      throw new RangeError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    chunks.push(buf.slice(0, n));
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Convert bencode 2.x Map dictionaries to the plain objects exposed by this package. */
function normalizeDecodedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== 'string') {
        throw new TorrentParseError('Torrent dictionary keys must be strings');
      }
      object[key] = normalizeDecodedValue(entry);
    }
    return object;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDecodedValue);
  }

  return value;
}

/** Return whether a decoded value is a plain bencode dictionary. */
function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/** Return whether a value is an integer representable without precision loss. */
function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Return whether a value is a non-negative safe integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

/** Validate an optional string-valued field. */
function validateOptionalString(dict: Record<string, unknown>, field: string): void {
  if (dict[field] !== undefined && typeof dict[field] !== 'string') {
    throw new TorrentParseError(`Invalid "${field}" field — expected a UTF-8 string`);
  }
}

/** Validate the optional tracker tier list. */
function validateAnnounceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((tier) => Array.isArray(tier) && tier.every((tracker) => typeof tracker === 'string'))
  );
}

/** Validate a multi-file torrent file entry. */
function validateTorrentFile(value: unknown, index: number): asserts value is Record<string, unknown> {
  if (!isDictionary(value)) {
    throw new TorrentParseError(`Invalid "info.files[${index}]" entry — expected a dictionary`);
  }
  if (!isNonNegativeInteger(value['length'])) {
    throw new TorrentParseError(`Invalid "info.files[${index}].length" field — expected a non-negative integer`);
  }
  if (
    !Array.isArray(value['path']) || value['path'].length === 0 ||
    !value['path'].every((part) => typeof part === 'string')
  ) {
    throw new TorrentParseError(`Invalid "info.files[${index}].path" field — expected a non-empty string array`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single file entry in a multi-file torrent.
 */
export type TorrentFile = {
  /** File size in bytes. */
  length: number;
  /**
   * Path components relative to the torrent root directory.
   *
   * @example `["subdir", "file.txt"]` represents `<name>/subdir/file.txt`
   */
  path: string[];
};

/**
 * The `info` dictionary of a torrent file, containing core metadata.
 *
 * Either `length` (single-file) or `files` (multi-file) will be present, but not both.
 */
export type TorrentInfo = {
  /** Suggested name for the file or top-level directory. */
  name: string;
  /** Number of bytes in each piece. Always a power of two. */
  'piece length': number;
  /**
   * Concatenated SHA-1 hashes, one per piece (20 bytes each).
   * Decoded as `Uint8Array` because the raw bytes are not valid UTF-8.
   */
  pieces?: Uint8Array;
  /** Total file size in bytes — present in single-file torrents only. */
  length?: number;
  /** List of files — present in multi-file torrents only. */
  files?: TorrentFile[];
  /** Whether the torrent is private (`1` = private, clients must not use DHT). */
  private?: number;
};

/**
 * Represents a fully parsed `.torrent` file.
 *
 * @see {@link https://www.bittorrent.org/beps/bep_0003.html BEP-3: The BitTorrent Protocol Specification}
 */
export type Torrent = {
  /** Primary tracker announce URL. */
  announce?: string;
  /**
   * Tiered tracker list (BEP-12).
   * Each inner array is a tier; clients try trackers within a tier in random order.
   */
  'announce-list'?: string[][];
  /** Human-readable comment embedded by the torrent creator. */
  comment?: string;
  /** Name of the software used to create the torrent. */
  'created by': string;
  /** Creation time as a Unix epoch timestamp (seconds since 1970-01-01T00:00:00Z). */
  'creation date': number;
  /** Web seed URL(s) (BEP-19). May be a single URL string or an array. */
  'url-list'?: string | string[];
  /** Identifies the source of the torrent (used by private trackers). */
  source?: string;
  /** Core torrent metadata. */
  info: TorrentInfo;
};

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when input cannot be parsed as a valid `.torrent` file.
 *
 * @example
 * ```ts
 * import { parseTorrent, TorrentParseError } from './mod.ts'
 *
 * try {
 *   await parseTorrent(badBytes)
 * } catch (err) {
 *   if (err instanceof TorrentParseError) {
 *     console.error('Parse failed:', err.message)
 *   }
 * }
 * ```
 */
export class TorrentParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TorrentParseError';
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses a `.torrent` file from a `Uint8Array` or any `Reader` (e.g. `Deno.FsFile`).
 *
 * Reading from a `Reader` is done in a single `readAll` call, so the source does
 * not need to support seeking.
 *
 * @param source - Raw torrent bytes **or** any object implementing the `Reader` interface.
 * @param options - Optional resource limits for the input.
 * @returns The fully typed {@link Torrent} object.
 * @throws {TorrentParseError} If the bytes are not valid bencode, or if required
 *   fields (`info`, `info.name`, `info.piece length`) are missing or have wrong types.
 *
 * @example Parse from an open file handle
 * ```ts
 * const fd = await Deno.open('./example.torrent', { read: true })
 * try {
 *   const torrent = await parseTorrent(fd)
 *   console.log(torrent.info.name)
 * } finally {
 *   fd.close()
 * }
 * ```
 *
 * @example Parse from a byte array
 * ```ts
 * const bytes = await Deno.readFile('./example.torrent')
 * const torrent = await parseTorrent(bytes)
 * ```
 */
export async function parseTorrent(source: Reader | Uint8Array, options: ParseTorrentOptions = {}): Promise<Torrent> {
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  if (maxBytes !== Number.POSITIVE_INFINITY && (maxBytes < 0 || !Number.isSafeInteger(maxBytes))) {
    throw new TorrentParseError('Invalid "maxBytes" option — expected a non-negative safe integer');
  }

  // ── 1. Read bytes ──────────────────────────────────────────────────────────
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) {
    if (source.length > maxBytes) {
      throw new TorrentParseError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    bytes = source;
  } else {
    try {
      bytes = await readAll(source, maxBytes);
    } catch (err) {
      throw new TorrentParseError('Failed to read torrent data', { cause: err });
    }
  }

  // ── 2. Decode bencode ──────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = normalizeDecodedValue(decode(bytes));
  } catch (err) {
    const msg = err instanceof BencodeDecodeError ? err.message : 'Invalid bencode data';
    throw new TorrentParseError(msg, { cause: err });
  }

  // ── 3. Validate structure ──────────────────────────────────────────────────
  if (!isDictionary(raw)) {
    throw new TorrentParseError(
      'Torrent root must be a bencode dictionary, got: ' + (Array.isArray(raw) ? 'list' : typeof raw),
    );
  }

  const dict = raw;
  validateOptionalString(dict, 'announce');
  validateOptionalString(dict, 'comment');
  validateOptionalString(dict, 'created by');
  validateOptionalString(dict, 'source');
  if (dict['announce-list'] !== undefined && !validateAnnounceList(dict['announce-list'])) {
    throw new TorrentParseError('Invalid "announce-list" field — expected a string array of string arrays');
  }
  if (
    dict['url-list'] !== undefined &&
    !(typeof dict['url-list'] === 'string' ||
      (Array.isArray(dict['url-list']) && dict['url-list'].every((url) => typeof url === 'string')))
  ) {
    throw new TorrentParseError('Invalid "url-list" field — expected a string or string array');
  }
  if (dict['creation date'] !== undefined && !isSafeInteger(dict['creation date'])) {
    throw new TorrentParseError('Invalid "creation date" field — expected an integer');
  }

  const info = dict['info'];

  if (!isDictionary(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }

  const infoDict = info;

  if (typeof infoDict['name'] !== 'string') {
    throw new TorrentParseError('Missing or invalid "info.name" field — expected a UTF-8 string');
  }

  if (!isSafeInteger(infoDict['piece length']) || infoDict['piece length'] <= 0) {
    throw new TorrentParseError('Missing or invalid "info.piece length" field — expected a positive integer');
  }

  if (
    infoDict['pieces'] !== undefined &&
    (!(infoDict['pieces'] instanceof Uint8Array) || infoDict['pieces'].length % 20 !== 0)
  ) {
    throw new TorrentParseError('Invalid "info.pieces" field — expected a Uint8Array whose length is a multiple of 20');
  }

  if (infoDict['length'] !== undefined && !isNonNegativeInteger(infoDict['length'])) {
    throw new TorrentParseError('Invalid "info.length" field — expected a non-negative integer');
  }

  if (infoDict['files'] !== undefined) {
    if (!Array.isArray(infoDict['files'])) {
      throw new TorrentParseError('Invalid "info.files" field — expected an array');
    }
    if (infoDict['length'] !== undefined) {
      throw new TorrentParseError('Torrent info must not contain both "length" and "files"');
    }
    infoDict['files'].forEach(validateTorrentFile);
  }

  if (infoDict['private'] !== undefined && !isSafeInteger(infoDict['private'])) {
    throw new TorrentParseError('Invalid "info.private" field — expected an integer');
  }

  return raw as unknown as Torrent;
}
