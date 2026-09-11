// /loco/monorepo/webtorrent/src/utils/metainfo-identity.ts
/**
 * Torrent identity utilities — preserve exact bencoded `info` bytes for
 * faithful hash computation.
 *
 * A torrent's identity is the SHA-1 (v1) or SHA-256 (v2) digest of the
 * bytes originally present in its `info` value. Re-encoding a decoded
 * object is deliberately avoided.
 *
 * Adaptado de deno-torrent/metainfo/identity.ts.
 * Browser-first: accepts Uint8Array (no Deno Reader).
 */

import { decode, encode } from "./bencode.ts";
import { TorrentParseError } from "./errors.ts";
import { parseMetainfo } from "./metainfo-parser.ts";
import type { ParseTorrentOptions, Torrent, TorrentPieceLayer } from "./torrent-types.ts";

// ── Types ───────────────────────────────────────────────────────────────

/** A parsed torrent together with its exact BEP-3 swarm identity. */
export interface TorrentIdentity {
  /** Validated, decoded metainfo. */
  torrent: Torrent;
  /** Exact bencoded bytes of the root `info` dictionary. */
  infoBytes: Uint8Array;
  /** SHA-1 digest of infoBytes (20 bytes) when v1 is present. */
  infoHashV1?: Uint8Array;
  /** Full BEP-52 SHA-256 digest of infoBytes (32 bytes) when v2 is present. */
  infoHashV2?: Uint8Array;
  /** 20-byte handshake hash (v1 full, or v2 truncated). */
  infoHash: Uint8Array;
  /** Lower-case hex of infoHash. */
  infoHashHex: string;
  /** Metadata format after structural and hybrid-layout validation. */
  version: "v1" | "v2" | "hybrid";
}

/** Optional outer metainfo fields for wrapping BEP-9 metadata. */
export interface WrapInfoOptions {
  announce?: string;
  announceList?: string[][];
  pieceLayers?: readonly TorrentPieceLayer[];
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Extract the exact bencoded `info` dictionary from complete metainfo bytes.
 * Validates the full bencode stream first (rejects duplicate keys, trailing
 * bytes, malformed integers), then byte-scans to locate the `info` value.
 */
export function extractInfoBytes(metainfo: Uint8Array): Uint8Array {
  try {
    decode(metainfo, { maxBytes: metainfo.length });
  } catch (error) {
    throw new TorrentParseError("Invalid bencoded torrent data", { cause: error });
  }

  const cursor = { offset: 0 };
  expect(metainfo, cursor, 0x64, "Torrent root must be a bencode dictionary");
  let result: Uint8Array | undefined;

  while (peek(metainfo, cursor) !== 0x65) {
    const key = readByteString(metainfo, cursor);
    const valueStart = cursor.offset;
    skipValue(metainfo, cursor, 1);
    if (equalsAscii(key, "info")) {
      if (metainfo[valueStart] !== 0x64) {
        throw new TorrentParseError("Torrent info value must be a dictionary");
      }
      result = metainfo.slice(valueStart, cursor.offset);
    }
  }
  cursor.offset++;

  if (result === undefined) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }
  return new Uint8Array(result);
}

/** Calculate the BEP-3 v1 info hash (SHA-1) for exact bencoded info bytes. */
export async function calculateInfoHash(
  infoBytes: Uint8Array,
): Promise<Uint8Array> {
  validateInfoBytes(infoBytes);
  const buffer = new ArrayBuffer(infoBytes.byteLength);
  new Uint8Array(buffer).set(infoBytes);
  return new Uint8Array(
    await crypto.subtle.digest("SHA-1", buffer),
  );
}

/** Calculate the full BEP-52 v2 info hash (SHA-256) for exact bencoded info bytes. */
export async function calculateInfoHashV2(
  infoBytes: Uint8Array,
): Promise<Uint8Array> {
  validateInfoBytes(infoBytes);
  const buffer = new ArrayBuffer(infoBytes.byteLength);
  new Uint8Array(buffer).set(infoBytes);
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", buffer),
  );
}

/**
 * Wrap an exact BEP-9 `info` dictionary in complete torrent metainfo.
 * The supplied bytes are inserted verbatim, so the info hash cannot change.
 */
export function wrapInfoBytes(
  infoBytes: Uint8Array,
  options: WrapInfoOptions = {},
): Uint8Array {
  validateInfoBytes(infoBytes);

  const fields: Array<{ key: string; value: Uint8Array }> = [
    { key: "info", value: infoBytes },
  ];
  if (options.announce !== undefined) {
    fields.push({ key: "announce", value: encode(options.announce) });
  }
  if (options.announceList !== undefined) {
    fields.push({ key: "announce-list", value: encode(options.announceList) });
  }
  if (options.pieceLayers !== undefined) {
    const layers = new Map<Uint8Array, Uint8Array>();
    for (const layer of options.pieceLayers) {
      layers.set(layer.piecesRoot, layer.hashes);
    }
    fields.push({ key: "piece layers", value: encode(layers) });
  }

  fields.sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  const chunks = fields.flatMap((field) => [
    encode(field.key),
    field.value,
  ]);
  const length = 2 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  output[0] = 0x64; // 'd'
  let offset = 1;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  output[offset] = 0x65; // 'e'
  return output;
}

/**
 * Parse and validate metainfo while retaining the exact `info` bytes used to
 * calculate its info hash. Re-encoding a decoded object is deliberately avoided.
 *
 * @param bytes  Complete bencoded torrent bytes.
 * @param options  Optional resource limits (forwarded to `parseMetainfo`).
 */
export async function parseTorrentWithIdentity(
  bytes: Uint8Array,
  options: ParseTorrentOptions = {},
): Promise<TorrentIdentity> {
  const torrent = await parseMetainfo(bytes, options);

  const infoBytes = extractInfoBytes(bytes);
  const info = torrent.info;
  const hasV2 = (info as Record<string, unknown>)["meta version"] === 2;
  const hasV1 = !hasV2 || (info as Record<string, unknown>)["pieces"] !== undefined;

  const infoHashV1 = hasV1 ? await calculateInfoHash(infoBytes) : undefined;
  const infoHashV2 = hasV2 ? await calculateInfoHashV2(infoBytes) : undefined;
  const infoHash = infoHashV1 ?? infoHashV2!.slice(0, 20);
  const version = hasV2 ? (hasV1 ? "hybrid" : "v2") : "v1";

  return {
    torrent,
    infoBytes,
    infoHashV1,
    infoHashV2,
    infoHash,
    infoHashHex: toHex(infoHash),
    version,
  };
}

/** Convert binary data to lowercase hexadecimal text. */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

// ── Internal helpers ────────────────────────────────────────────────────

function validateInfoBytes(infoBytes: Uint8Array): void {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length, useMap: true });
  } catch (error) {
    throw new TorrentParseError("Invalid bencoded info dictionary", { cause: error });
  }
  if (!(decoded instanceof Map)) {
    throw new TorrentParseError("Info bytes must contain one bencode dictionary");
  }
}

function skipValue(
  bytes: Uint8Array,
  cursor: { offset: number },
  depth: number,
): void {
  if (depth > 256) {
    throw new TorrentParseError("Torrent nesting is too deep");
  }
  const marker = peek(bytes, cursor);
  if (marker >= 0x30 && marker <= 0x39) {
    readByteString(bytes, cursor);
    return;
  }
  if (marker === 0x69) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) cursor.offset++;
    cursor.offset++;
    return;
  }
  if (marker === 0x6c) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) skipValue(bytes, cursor, depth + 1);
    cursor.offset++;
    return;
  }
  if (marker === 0x64) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) {
      readByteString(bytes, cursor);
      skipValue(bytes, cursor, depth + 1);
    }
    cursor.offset++;
    return;
  }
  throw new TorrentParseError(
    `Invalid bencode marker at byte ${cursor.offset}`,
  );
}

function readByteString(
  bytes: Uint8Array,
  cursor: { offset: number },
): Uint8Array {
  const start = cursor.offset;
  while (peek(bytes, cursor) !== 0x3a) cursor.offset++;
  const length = Number(
    new TextDecoder().decode(bytes.subarray(start, cursor.offset)),
  );
  cursor.offset++;
  if (
    !Number.isSafeInteger(length) || length < 0 ||
    cursor.offset + length > bytes.length
  ) {
    throw new TorrentParseError(`Invalid byte string length at byte ${start}`);
  }
  const value = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return value;
}

function peek(bytes: Uint8Array, cursor: { offset: number }): number {
  const byte = bytes[cursor.offset];
  if (byte === undefined) {
    throw new TorrentParseError("Unexpected end of torrent data");
  }
  return byte;
}

function expect(
  bytes: Uint8Array,
  cursor: { offset: number },
  expected: number,
  message: string,
): void {
  if (peek(bytes, cursor) !== expected) {
    throw new TorrentParseError(message);
  }
  cursor.offset++;
}

function equalsAscii(bytes: Uint8Array, value: string): boolean {
  if (bytes.length !== value.length) return false;
  for (let i = 0; i < value.length; i++) {
    if (bytes[i] !== value.charCodeAt(i)) return false;
  }
  return true;
}
