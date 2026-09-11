import { isSafePathComponent } from './path.ts';
import { TorrentParseError } from './parser.ts';
import type {
  TorrentFile,
  TorrentFileTree,
  TorrentInfo,
  TorrentPieceLayer,
  TorrentV2File,
  TorrentV2Info,
} from './types.ts';

const BLOCK_LENGTH = 16 * 1024;
const MAX_FILE_TREE_DEPTH = 256;
const MAX_FILE_COUNT = 1_000_000;

/** One flattened file in the BEP-52 piece address space. */
export interface TorrentV2FileEntry {
  /** Safe path components from the file-tree root. */
  path: string[];
  /** File size in bytes. */
  length: number;
  /** File Merkle root, absent only for empty files. */
  piecesRoot?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
  /** First piece index in the v2 piece address space. */
  pieceStart: number;
  /** Number of logical torrent pieces occupied by this file. */
  pieceCount: number;
}

/** Flatten and validate a BEP-52 file tree in its canonical traversal order. */
export function flattenV2Files(info: TorrentV2Info): TorrentV2FileEntry[] {
  if (
    !Number.isSafeInteger(info['piece length']) || info['piece length'] < BLOCK_LENGTH ||
    !isPowerOfTwo(info['piece length'])
  ) {
    throw new TorrentParseError('Invalid "info.piece length" field for v2 — expected a power of two of at least 16384');
  }
  if (!isDictionary(info['file tree'])) throw new TorrentParseError('Missing or invalid "info.file tree" dictionary');

  const files: TorrentV2FileEntry[] = [];
  const stack: Array<{ node: TorrentFileTree; path: string[]; depth: number }> = [
    { node: info['file tree'], path: [], depth: 0 },
  ];
  let pieceStart = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > MAX_FILE_TREE_DEPTH) throw new TorrentParseError('Torrent v2 file tree is too deep');
    const entries = Object.entries(current.node);
    if (entries.length === 0) throw new TorrentParseError('Torrent v2 file tree contains an empty directory');
    const terminal = Object.prototype.hasOwnProperty.call(current.node, '');
    if (terminal) {
      if (current.path.length === 0) throw new TorrentParseError('Torrent v2 file tree root must not be a file');
      if (entries.length !== 1) throw new TorrentParseError('Torrent v2 file entry must not contain child paths');
      const properties = current.node[''];
      validateFileProperties(properties, current.path);
      const file = properties as TorrentV2File;
      const pieceCount = file.length === 0 ? 0 : Math.ceil(file.length / info['piece length']);
      files.push({
        path: current.path,
        length: file.length,
        piecesRoot: file['pieces root'],
        attr: file.attr,
        pieceStart,
        pieceCount,
      });
      pieceStart += pieceCount;
      if (files.length > MAX_FILE_COUNT) throw new TorrentParseError('Torrent v2 contains too many files');
      continue;
    }

    for (let index = entries.length - 1; index >= 0; index--) {
      const [component, child] = entries[index];
      if (!isSafePathComponent(component)) {
        throw new TorrentParseError(`Invalid v2 file tree path component: ${JSON.stringify(component)}`);
      }
      if (!isDictionary(child)) {
        throw new TorrentParseError(`Invalid v2 file tree node: ${[...current.path, component].join('/')}`);
      }
      stack.push({ node: child as TorrentFileTree, path: [...current.path, component], depth: current.depth + 1 });
    }
  }
  if (files.length === 0) throw new TorrentParseError('Torrent v2 file tree must contain at least one file');
  return files;
}

/** Validate all BEP-52 piece layers against the file-tree Merkle roots. */
export async function validateV2PieceLayers(
  info: TorrentV2Info,
  layers: readonly TorrentPieceLayer[],
): Promise<TorrentV2FileEntry[]> {
  const files = flattenV2Files(info);
  const byRoot = new Map<string, TorrentPieceLayer>();
  for (const layer of layers) {
    if (layer.piecesRoot.length !== 32) throw new TorrentParseError('Invalid "piece layers" key — expected 32 bytes');
    if (layer.hashes.length === 0 || layer.hashes.length % 32 !== 0) {
      throw new TorrentParseError('Invalid "piece layers" value — expected one or more 32-byte hashes');
    }
    const key = toHex(layer.piecesRoot);
    if (byRoot.has(key)) throw new TorrentParseError('Duplicate BEP-52 piece layer root');
    byRoot.set(key, layer);
  }

  const used = new Set<string>();
  for (const file of files) {
    if (file.length === 0) {
      if (file.piecesRoot !== undefined) {
        throw new TorrentParseError(`Empty v2 file must not have a pieces root: ${file.path.join('/')}`);
      }
      continue;
    }
    if (file.piecesRoot?.length !== 32) {
      throw new TorrentParseError(`Non-empty v2 file has no valid pieces root: ${file.path.join('/')}`);
    }
    if (file.length <= info['piece length']) continue;
    const key = toHex(file.piecesRoot);
    const layer = byRoot.get(key);
    if (!layer) throw new TorrentParseError(`Missing piece layer for v2 file: ${file.path.join('/')}`);
    if (layer.hashes.length !== file.pieceCount * 32) {
      throw new TorrentParseError(`Invalid piece layer hash count for v2 file: ${file.path.join('/')}`);
    }
    const calculated = await merkleRootFromPieceLayer(layer.hashes, info['piece length']);
    if (!equals(calculated, file.piecesRoot)) {
      throw new TorrentParseError(`Piece layer does not match pieces root for v2 file: ${file.path.join('/')}`);
    }
    used.add(key);
  }
  if (used.size !== byRoot.size) {
    throw new TorrentParseError('Piece layers contain an entry not required by the v2 file tree');
  }
  return files;
}

/** Ensure the v1 and v2 halves of a hybrid torrent describe identical files and alignment. */
export function validateHybridLayout(info: TorrentInfo, v2Files: readonly TorrentV2FileEntry[]): void {
  if (info['meta version'] !== 2 || info.pieces === undefined) return;
  const v1Files: TorrentFile[] = info.files ?? [{ length: info.length!, path: [info.name] }];
  const realV1 = v1Files.filter((file) => !file.attr?.includes('p'));
  if (realV1.length !== v2Files.length) throw new TorrentParseError('Hybrid torrent v1/v2 file counts do not match');

  let v1Offset = 0;
  let realIndex = 0;
  for (const file of v1Files) {
    if (file.attr?.includes('p')) {
      v1Offset += file.length;
      continue;
    }
    const v2 = v2Files[realIndex++];
    if (v1Offset % info['piece length'] !== 0 && realIndex > 1) {
      throw new TorrentParseError(`Hybrid torrent file is not piece-aligned: ${file.path.join('/')}`);
    }
    if (file.length !== v2.length || !samePath(file.path, v2.path)) {
      throw new TorrentParseError(`Hybrid torrent v1/v2 file layout differs at: ${file.path.join('/')}`);
    }
    v1Offset += file.length;
  }
}

async function merkleRootFromPieceLayer(hashes: Uint8Array, pieceLength: number): Promise<Uint8Array> {
  const nodes = splitHashes(hashes);
  const target = nextPowerOfTwo(nodes.length);
  let zero: Uint8Array<ArrayBufferLike> = new Uint8Array(32);
  for (let size = BLOCK_LENGTH; size < pieceLength; size *= 2) zero = await hashPair(zero, zero);
  while (nodes.length < target) nodes.push(zero);
  while (nodes.length > 1) {
    const next: Uint8Array[] = [];
    for (let index = 0; index < nodes.length; index += 2) next.push(await hashPair(nodes[index], nodes[index + 1]));
    nodes.splice(0, nodes.length, ...next);
  }
  return nodes[0];
}

async function hashPair(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const bytes = new Uint8Array(64);
  bytes.set(left);
  bytes.set(right, 32);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function splitHashes(bytes: Uint8Array): Uint8Array[] {
  const hashes: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32) hashes.push(bytes.slice(offset, offset + 32));
  return hashes;
}

function validateFileProperties(value: unknown, path: readonly string[]): void {
  if (!isDictionary(value)) throw new TorrentParseError(`Invalid v2 file properties: ${path.join('/')}`);
  if (!Number.isSafeInteger(value.length) || (value.length as number) < 0) {
    throw new TorrentParseError(`Invalid v2 file length: ${path.join('/')}`);
  }
  if (value.attr !== undefined && typeof value.attr !== 'string') {
    throw new TorrentParseError(`Invalid v2 file attributes: ${path.join('/')}`);
  }
  if (typeof value['pieces root'] === 'string') value['pieces root'] = new TextEncoder().encode(value['pieces root']);
  if (value['pieces root'] !== undefined && !(value['pieces root'] instanceof Uint8Array)) {
    throw new TorrentParseError(`Invalid v2 pieces root: ${path.join('/')}`);
  }
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (Math.log2(value) % 1 === 0);
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function equals(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
