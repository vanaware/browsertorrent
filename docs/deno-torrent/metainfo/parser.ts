/**
 * @module
 *
 * Lightweight `.torrent` file parser for Deno.
 *
 * @example
 * ```ts
 * import { parseTorrent } from 'jsr:@deno-torrent/metainfo@1'
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

import { BencodeDecodeError, decode } from '@deno-torrent/bencode';
import { IoUtil } from '@deno-torrent/toolkit';
import { isSafePathComponent } from './path.ts';
import { DEFAULT_MAX_METAINFO_SIZE } from './types.ts';
import type { ParseTorrentOptions, Reader, Torrent } from './types.ts';
import type { TorrentPieceLayer, TorrentV2Info } from './types.ts';
import { flattenV2Files, validateHybridLayout, validateV2PieceLayers } from './v2.ts';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Convert bencode 2.x Map dictionaries to the plain objects exposed by this package. */
function normalizeDecodedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== 'string') {
        throw new TorrentParseError('Torrent dictionary keys must be strings');
      }
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value: normalizeDecodedValue(entry),
        writable: true,
      });
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
    value.length > 0 &&
    value.every((tier) =>
      Array.isArray(tier) && tier.length > 0 &&
      tier.every((tracker) => typeof tracker === 'string' && tracker.length > 0)
    )
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
  if (value['attr'] !== undefined && typeof value['attr'] !== 'string') {
    throw new TorrentParseError(`Invalid "info.files[${index}].attr" field — expected a string`);
  }
  if (
    !Array.isArray(value['path']) || value['path'].length === 0 ||
    !value['path'].every(isSafePathComponent)
  ) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].path" field — expected safe, non-empty path components`,
    );
  }
}

/** Reject ambiguous paths while allowing identical BEP-47 padding entries. */
function validateFilePaths(files: Record<string, unknown>[]): void {
  const entries = new Map<string, { length: number; padding: boolean }>();
  const directoryPrefixes = new Set<string>();

  for (const file of files) {
    const path = file['path'] as string[];
    const key = path.join('\0');
    const padding = typeof file['attr'] === 'string' && file['attr'].includes('p');
    const previous = entries.get(key);
    if (previous !== undefined && !(padding && previous.padding && previous.length === file['length'])) {
      throw new TorrentParseError(`Duplicate or conflicting file path: ${path.join('/')}`);
    }
    if (directoryPrefixes.has(key)) {
      throw new TorrentParseError(`File path conflicts with a directory path: ${path.join('/')}`);
    }
    for (let index = 1; index < path.length; index++) {
      const prefix = path.slice(0, index).join('\0');
      if (entries.has(prefix)) {
        throw new TorrentParseError(`File path is nested below another file: ${path.join('/')}`);
      }
      directoryPrefixes.add(prefix);
    }
    entries.set(key, { length: file['length'] as number, padding });
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when input cannot be parsed as a valid `.torrent` file.
 *
 * @example
 * ```ts
 * import { parseTorrent, TorrentParseError } from 'jsr:@deno-torrent/metainfo@1'
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
  /** Create a parser error and optionally retain the underlying failure. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TorrentParseError';
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses a `.torrent` file from a `Uint8Array` or any `Reader` (e.g. `Deno.FsFile`).
 *
 * Reader input is consumed sequentially to EOF and does not need to support
 * seeking. Encoded input is limited to 16 MiB by default; trusted callers may
 * provide a different positive `maxBytes` value.
 *
 * @param source - Raw torrent bytes **or** any object implementing the `Reader` interface.
 * @param options - Optional resource limits for the input.
 * @returns The fully typed {@link Torrent} object.
 * @throws {TorrentParseError} If decoding fails, the resource limit is exceeded,
 *   required BEP-3 fields are missing, or piece/file metadata is inconsistent.
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
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (maxBytes <= 0 || !Number.isSafeInteger(maxBytes)) {
    throw new TorrentParseError('Invalid "maxBytes" option — expected a positive safe integer');
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
      bytes = await IoUtil.readAll(source, { maxBytes });
    } catch (error) {
      throw new TorrentParseError('Failed to read torrent data', { cause: error });
    }
  }

  // ── 2. Decode bencode ──────────────────────────────────────────────────────
  let decoded: unknown;
  let pieceLayers: TorrentPieceLayer[] | undefined;
  try {
    const raw = decode(bytes);
    if (raw instanceof Map && raw.has('piece layers')) {
      pieceLayers = normalizePieceLayers(raw.get('piece layers'));
      raw.delete('piece layers');
    }
    decoded = normalizeDecodedValue(raw);
  } catch (error) {
    const message = error instanceof BencodeDecodeError ? error.message : 'Invalid bencode data';
    throw new TorrentParseError(message, { cause: error });
  }

  // ── 3. Validate structure ──────────────────────────────────────────────────
  if (!isDictionary(decoded)) {
    throw new TorrentParseError(
      'Torrent root must be a bencode dictionary, got: ' + (Array.isArray(decoded) ? 'list' : typeof decoded),
    );
  }

  const dictionary = decoded;
  if (pieceLayers !== undefined) dictionary['piece layers'] = pieceLayers;
  validateOptionalString(dictionary, 'announce');
  if (dictionary['announce'] === '') {
    throw new TorrentParseError('Invalid "announce" field — expected a non-empty URL string');
  }
  validateOptionalString(dictionary, 'comment');
  validateOptionalString(dictionary, 'created by');
  validateOptionalString(dictionary, 'source');
  if (dictionary['announce-list'] !== undefined && !validateAnnounceList(dictionary['announce-list'])) {
    throw new TorrentParseError('Invalid "announce-list" field — expected a string array of string arrays');
  }
  if (
    dictionary['url-list'] !== undefined &&
    !(typeof dictionary['url-list'] === 'string' ||
      (Array.isArray(dictionary['url-list']) && dictionary['url-list'].length > 0 &&
        dictionary['url-list'].every((url) => typeof url === 'string' && url.length > 0)))
  ) {
    throw new TorrentParseError('Invalid "url-list" field — expected a non-empty string or non-empty string array');
  }
  if (dictionary['url-list'] === '') {
    throw new TorrentParseError('Invalid "url-list" field — expected a non-empty URL string');
  }
  if (dictionary['creation date'] !== undefined && !isNonNegativeInteger(dictionary['creation date'])) {
    throw new TorrentParseError('Invalid "creation date" field — expected a non-negative integer');
  }

  const info = dictionary['info'];

  if (!isDictionary(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }

  const infoDict = info;

  if (infoDict['meta version'] !== undefined && infoDict['meta version'] !== 2) {
    throw new TorrentParseError(`Unsupported "info.meta version": ${String(infoDict['meta version'])}`);
  }

  if (!isSafePathComponent(infoDict['name'])) {
    throw new TorrentParseError('Missing or invalid "info.name" field — expected a safe file or directory name');
  }

  if (!isSafeInteger(infoDict['piece length']) || infoDict['piece length'] <= 0) {
    throw new TorrentParseError('Missing or invalid "info.piece length" field — expected a positive integer');
  }

  if (infoDict['private'] !== undefined && infoDict['private'] !== 0 && infoDict['private'] !== 1) {
    throw new TorrentParseError('Invalid "info.private" field — expected 0 or 1');
  }

  if (infoDict['meta version'] === 2) {
    const hasV1Fields = infoDict['pieces'] !== undefined || infoDict['length'] !== undefined ||
      infoDict['files'] !== undefined;
    if (hasV1Fields) validateV1Fields(infoDict);
    const files = pieceLayers === undefined && options.allowMissingPieceLayers === true
      ? flattenV2Files(infoDict as unknown as TorrentV2Info)
      : await validateV2PieceLayers(infoDict as unknown as TorrentV2Info, pieceLayers ?? []);
    validateHybridLayout(infoDict as unknown as Torrent['info'], files);
  } else {
    if (pieceLayers !== undefined) throw new TorrentParseError('BEP-3 torrent must not contain "piece layers"');
    validateV1Fields(infoDict);
  }

  return decoded as Torrent;
}

function validateV1Fields(infoDict: Record<string, unknown>): void {
  if (typeof infoDict['pieces'] === 'string') infoDict['pieces'] = new TextEncoder().encode(infoDict['pieces']);
  if (!(infoDict['pieces'] instanceof Uint8Array) || infoDict['pieces'].length % 20 !== 0) {
    throw new TorrentParseError('Invalid "info.pieces" field — expected a Uint8Array whose length is a multiple of 20');
  }
  if (infoDict['length'] !== undefined && !isNonNegativeInteger(infoDict['length'])) {
    throw new TorrentParseError('Invalid "info.length" field — expected a non-negative integer');
  }
  if (infoDict['files'] !== undefined) {
    if (!Array.isArray(infoDict['files']) || infoDict['files'].length === 0) {
      throw new TorrentParseError('Invalid "info.files" field — expected at least one file');
    }
    if (infoDict['length'] !== undefined) {
      throw new TorrentParseError('Torrent info must not contain both "length" and "files"');
    }
    infoDict['files'].forEach(validateTorrentFile);
    validateFilePaths(infoDict['files']);
  }
  if (infoDict['length'] === undefined && infoDict['files'] === undefined) {
    throw new TorrentParseError('Torrent info must contain either "length" or "files"');
  }
  const totalLength = infoDict['length'] ??
    (infoDict['files'] as Record<string, unknown>[]).reduce((total, file) => total + (file['length'] as number), 0);
  if (!Number.isSafeInteger(totalLength)) {
    throw new TorrentParseError('Torrent content length exceeds the safe integer range');
  }
  const expectedPiecesLength = Math.ceil((totalLength as number) / (infoDict['piece length'] as number)) * 20;
  if (infoDict['pieces'].length !== expectedPiecesLength) {
    throw new TorrentParseError(
      `Invalid "info.pieces" field — expected ${expectedPiecesLength} bytes for ${totalLength} content bytes`,
    );
  }
}

function normalizePieceLayers(value: unknown): TorrentPieceLayer[] {
  if (!(value instanceof Map)) throw new TorrentParseError('Invalid "piece layers" field — expected a dictionary');
  const layers: TorrentPieceLayer[] = [];
  for (const [root, hashes] of value) {
    const piecesRoot = binaryBytes(root);
    const hashBytes = binaryBytes(hashes);
    layers.push({ piecesRoot, hashes: hashBytes });
  }
  return layers;
}

function binaryBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  throw new TorrentParseError('BEP-52 hash fields must be byte strings');
}
