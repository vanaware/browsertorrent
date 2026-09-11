import { type BencodeKey, type BencodeValue, decode, encode } from '@deno-torrent/bencode';
import { IoUtil } from '@deno-torrent/toolkit';
import { parseTorrent, TorrentParseError } from './parser.ts';
import { DEFAULT_MAX_METAINFO_SIZE } from './types.ts';
import type { ParseTorrentOptions, Reader, Torrent, TorrentPieceLayer } from './types.ts';

/** A parsed torrent together with its exact BEP-3 swarm identity. */
export interface TorrentIdentity {
  /** Validated, decoded metainfo. */
  torrent: Torrent;
  /** Exact bencoded bytes of the root `info` dictionary. */
  infoBytes: Uint8Array<ArrayBuffer>;
  /** SHA-1 digest of {@link infoBytes}. */
  infoHash: Uint8Array<ArrayBuffer>;
  /** Lower-case hexadecimal form of {@link infoHash}. */
  infoHashHex: string;
  /** Metadata format after structural and hybrid-layout validation. */
  version: 'v1' | 'v2' | 'hybrid';
  /** Full BEP-3 SHA-1 identity when v1 metadata is present. */
  infoHashV1?: Uint8Array<ArrayBuffer>;
  /** Full BEP-52 SHA-256 identity when v2 metadata is present. */
  infoHashV2?: Uint8Array<ArrayBuffer>;
}

/** Optional outer metainfo fields used when wrapping BEP-9 metadata. */
export interface WrapInfoOptions {
  /** Optional primary tracker URL. */
  announce?: string;
  /** Optional BEP-12 tracker tiers. */
  announceList?: string[][];
  /** Validated BEP-52 piece layers fetched separately from BEP-9 info metadata. */
  pieceLayers?: readonly TorrentPieceLayer[];
}

/**
 * Parse metainfo and retain the exact bytes used to calculate its v1 info hash.
 *
 * Re-encoding a decoded object is deliberately avoided: a torrent's identity
 * is the SHA-1 digest of the bytes originally present in its `info` value.
 */
export async function parseTorrentWithIdentity(
  source: Reader | Uint8Array,
  options: ParseTorrentOptions = {},
): Promise<TorrentIdentity> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TorrentParseError('Invalid "maxBytes" option — expected a positive safe integer');
  }

  let bytes: Uint8Array<ArrayBuffer>;
  if (source instanceof Uint8Array) {
    if (source.length > maxBytes) {
      throw new TorrentParseError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    bytes = Uint8Array.from(source);
  } else {
    try {
      bytes = Uint8Array.from(await IoUtil.readAll(source, { maxBytes }));
    } catch (error) {
      throw new TorrentParseError('Failed to read torrent data', { cause: error });
    }
  }

  const torrent = await parseTorrent(bytes, options);
  const infoBytes = extractInfoBytes(bytes);
  const hasV2 = torrent.info['meta version'] === 2;
  const hasV1 = !hasV2 || torrent.info.pieces !== undefined;
  const infoHashV1 = hasV1 ? await calculateInfoHash(infoBytes) : undefined;
  const infoHashV2 = hasV2 ? await calculateInfoHashV2(infoBytes) : undefined;
  const infoHash = infoHashV1 ?? infoHashV2!.slice(0, 20);
  const version = hasV2 ? (hasV1 ? 'hybrid' : 'v2') : 'v1';
  return { torrent, infoBytes, infoHash, infoHashHex: toHex(infoHash), version, infoHashV1, infoHashV2 };
}

/** Extract the exact bencoded `info` dictionary from complete metainfo bytes. */
export function extractInfoBytes(metainfo: Uint8Array): Uint8Array<ArrayBuffer> {
  // Validate the complete bencode stream first. This rejects duplicate keys,
  // malformed integers and trailing bytes before the byte locator is used.
  try {
    decode(metainfo, { maxBytes: metainfo.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded torrent data', { cause: error });
  }

  const cursor = { offset: 0 };
  expect(metainfo, cursor, 0x64, 'Torrent root must be a bencode dictionary');
  let result: Uint8Array<ArrayBuffer> | undefined;
  while (peek(metainfo, cursor) !== 0x65) {
    const key = readByteString(metainfo, cursor);
    const valueStart = cursor.offset;
    skipValue(metainfo, cursor, 1);
    if (equalsAscii(key, 'info')) {
      if (metainfo[valueStart] !== 0x64) {
        throw new TorrentParseError('Torrent info value must be a dictionary');
      }
      result = metainfo.slice(valueStart, cursor.offset);
    }
  }
  cursor.offset++;
  if (result === undefined) throw new TorrentParseError('Missing or invalid "info" dictionary');
  return result;
}

/** Calculate the BEP-3 v1 info hash for exact bencoded `info` bytes. */
export async function calculateInfoHash(infoBytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded info dictionary', { cause: error });
  }
  if (!(decoded instanceof Map)) {
    throw new TorrentParseError('Info bytes must contain one bencode dictionary');
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-1', Uint8Array.from(infoBytes)));
}

/** Calculate the full BEP-52 SHA-256 info hash for exact bencoded `info` bytes. */
export async function calculateInfoHashV2(infoBytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded info dictionary', { cause: error });
  }
  if (!(decoded instanceof Map)) throw new TorrentParseError('Info bytes must contain one bencode dictionary');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(infoBytes)));
}

/**
 * Wrap an exact BEP-9 `info` dictionary in complete torrent metainfo.
 * The supplied bytes are inserted verbatim, so their info hash cannot change.
 */
export function wrapInfoBytes(infoBytes: Uint8Array, options: WrapInfoOptions = {}): Uint8Array<ArrayBuffer> {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded info dictionary', { cause: error });
  }
  if (!(decoded instanceof Map)) throw new TorrentParseError('Info bytes must contain one bencode dictionary');

  const fields: Array<{ key: string; value: Uint8Array }> = [{ key: 'info', value: infoBytes }];
  if (options.announce !== undefined) {
    fields.push({ key: 'announce', value: Uint8Array.from(encode(options.announce)) });
  }
  if (options.announceList !== undefined) {
    fields.push({ key: 'announce-list', value: Uint8Array.from(encode(options.announceList)) });
  }
  if (options.pieceLayers !== undefined) {
    const layers = new Map<BencodeKey, BencodeValue>();
    for (const layer of options.pieceLayers) layers.set(layer.piecesRoot, layer.hashes);
    fields.push({ key: 'piece layers', value: Uint8Array.from(encode(layers)) });
  }
  fields.sort((left, right) => left.key === right.key ? 0 : left.key < right.key ? -1 : 1);
  const chunks = fields.flatMap((field) => [Uint8Array.from(encode(field.key)), field.value]);
  const length = 2 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  output[0] = 0x64;
  let offset = 1;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  output[offset] = 0x65;
  return output;
}

/** Convert binary data to lower-case hexadecimal text. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function skipValue(bytes: Uint8Array, cursor: { offset: number }, depth: number): void {
  if (depth > 256) throw new TorrentParseError('Torrent nesting is too deep');
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
  throw new TorrentParseError(`Invalid bencode marker at byte ${cursor.offset}`);
}

function readByteString(bytes: Uint8Array, cursor: { offset: number }): Uint8Array {
  const start = cursor.offset;
  while (peek(bytes, cursor) !== 0x3a) cursor.offset++;
  const length = Number(new TextDecoder().decode(bytes.subarray(start, cursor.offset)));
  cursor.offset++;
  if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > bytes.length) {
    throw new TorrentParseError(`Invalid byte string length at byte ${start}`);
  }
  const value = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return value;
}

function peek(bytes: Uint8Array, cursor: { offset: number }): number {
  const byte = bytes[cursor.offset];
  if (byte === undefined) throw new TorrentParseError('Unexpected end of torrent data');
  return byte;
}

function expect(bytes: Uint8Array, cursor: { offset: number }, expected: number, message: string): void {
  if (peek(bytes, cursor) !== expected) throw new TorrentParseError(message);
  cursor.offset++;
}

function equalsAscii(bytes: Uint8Array, value: string): boolean {
  return bytes.length === value.length && bytes.every((byte, index) => byte === value.charCodeAt(index));
}
