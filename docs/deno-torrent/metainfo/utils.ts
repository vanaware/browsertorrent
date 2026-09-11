/**
 * File discovery, piece layout, hashing, and version helpers used by generation.
 * @module
 */

import { walk } from '@std/fs/walk';
import { basename, relative, SEPARATOR } from '@std/path';
import { BytesUtil, HashUtil, MultiFileReader } from '@deno-torrent/toolkit';
import { PieceSizeEnum } from './types.ts';

import denoConfig from '../deno.json' with { type: 'json' };

const PACKAGE_VERSION: string = denoConfig.version;
const HASH_CHUNK_SIZE = 1024 * 1024;
const ZERO_CHUNK = new Uint8Array(HASH_CHUNK_SIZE);

/** Incrementally hashes one logical piece at a time with bounded memory. */
class PieceHasher {
  readonly #pieceSize: number;
  readonly #digests: Uint8Array[] = [];
  readonly #hasher = HashUtil.createSha1();
  #pieceOffset = 0;

  constructor(pieceSize: number) {
    this.#pieceSize = pieceSize;
  }

  update(data: Uint8Array): void {
    let offset = 0;
    while (offset < data.length) {
      const length = Math.min(this.#pieceSize - this.#pieceOffset, data.length - offset);
      this.#hasher.update(data.subarray(offset, offset + length));
      this.#pieceOffset += length;
      offset += length;
      if (this.#pieceOffset === this.#pieceSize) this.#finishPiece();
    }
  }

  updateZeros(length: number): void {
    let remaining = length;
    while (remaining > 0) {
      const count = Math.min(remaining, ZERO_CHUNK.length);
      this.update(ZERO_CHUNK.subarray(0, count));
      remaining -= count;
    }
  }

  digest(): Uint8Array {
    if (this.#pieceOffset > 0) this.#finishPiece();
    return BytesUtil.concat(...this.#digests);
  }

  #finishPiece(): void {
    this.#digests.push(this.#hasher.digest());
    this.#hasher.reset();
    this.#pieceOffset = 0;
  }
}

/**
 * Returns all files under `entry`.
 *
 * - If `entry` is a regular file the single-element array `[entry]` is returned.
 * - If `entry` is a directory it is walked recursively; directories themselves
 *   are excluded from the result.
 *
 * @param entry - Absolute path to a file or directory.
 * @param ignoreHiddenFile - When `true`, entries whose base name starts with
 *   `.` are omitted.
 * @returns Ordered list of absolute file paths found under `entry`.
 * @throws {Deno.errors.NotFound} If `entry` does not exist.
 */
export async function obtainFiles(
  entry: string,
  ignoreHiddenFile: boolean,
): Promise<string[]> {
  const stat = await Deno.stat(entry);
  if (stat.isFile) return ignoreHiddenFile && isHiddenFile(entry) ? [] : [entry];

  const files: string[] = [];
  for await (const item of walk(entry, { includeFiles: true, includeDirs: false })) {
    if (
      ignoreHiddenFile &&
      relative(entry, item.path).split(SEPARATOR).some((component) => component.startsWith('.'))
    ) continue;
    files.push(item.path);
  }
  return files;
}

/**
 * Computes the concatenated SHA-1 digests (pieces) for a set of files.
 *
 * Files are read sequentially as a single byte stream using
 * {@link MultiFileReader}.  The stream is divided into chunks of `pieceSize`
 * bytes; the last chunk may be smaller.  Each chunk's SHA-1 digest (20 bytes)
 * is appended to the result.
 *
 * @param files - Ordered list of file paths to hash.
 * @param pieceSize - Number of bytes per piece (must be ≥ 1).
 * @param alignPiece - When `true`, inserts zero-filled BEP-47 padding between files.
 * @returns `Uint8Array` whose length is a multiple of 20 (20 bytes per piece).
 * @throws {RangeError} If `pieceSize` is less than 1.
 */
export async function sha1sum(
  files: string[],
  pieceSize: number,
  alignPiece = false,
  alignedFiles?: readonly PieceFile[],
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(pieceSize) || pieceSize < 1) {
    throw new RangeError('pieceSize must be a positive safe integer');
  }

  if (alignPiece) return await sha1sumAligned(alignedFiles ?? await buildPieceFiles(files, pieceSize), pieceSize);

  const pieceHasher = new PieceHasher(pieceSize);
  const reader = new MultiFileReader(files);
  try {
    for await (const chunk of reader.chunks(HASH_CHUNK_SIZE)) {
      pieceHasher.update(chunk);
    }
  } finally {
    reader.close();
  }

  return pieceHasher.digest();
}

export type PieceFile = {
  file: string | null;
  length: number;
  padding: boolean;
};

/** Builds the logical file stream used by BEP-47 piece-aligned torrents. */
export async function buildPieceFiles(
  files: string[],
  pieceSize: number,
  knownSizes?: readonly number[],
): Promise<PieceFile[]> {
  if (!Number.isSafeInteger(pieceSize) || pieceSize < 1) {
    throw new RangeError('pieceSize must be a positive safe integer');
  }
  if (knownSizes !== undefined && knownSizes.length !== files.length) {
    throw new RangeError('knownSizes must contain one size for every file');
  }
  const sizes = knownSizes ?? await Promise.all(files.map(async (file) => (await Deno.stat(file)).size));
  if (sizes.some((size) => !Number.isSafeInteger(size) || size < 0)) {
    throw new RangeError('File sizes must be non-negative safe integers');
  }
  const pieceFiles: PieceFile[] = [];
  let pieceOffset = 0;

  for (let index = 0; index < files.length; index++) {
    const length = sizes[index];
    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset;
      pieceFiles.push({ file: null, length: paddingLength, padding: true });
      pieceOffset = 0;
    }

    pieceFiles.push({ file: files[index], length, padding: false });
    pieceOffset = (pieceOffset + length) % pieceSize;
  }

  return pieceFiles;
}

async function sha1sumAligned(pieceFiles: readonly PieceFile[], pieceSize: number): Promise<Uint8Array> {
  const pieceHasher = new PieceHasher(pieceSize);

  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      pieceHasher.updateZeros(pieceFile.length);
      continue;
    }

    const reader = new MultiFileReader([pieceFile.file!]);
    try {
      for await (const chunk of reader.chunks(HASH_CHUNK_SIZE)) {
        pieceHasher.update(chunk);
      }
    } finally {
      reader.close();
    }
  }

  return pieceHasher.digest();
}

/**
 * Selects an appropriate piece size for the given total file size.
 *
 * When `pieceSizeEnum` is {@link PieceSizeEnum.SIZE_AUTO} the function
 * returns the smallest preset that is larger than `fileSize`, capped at
 * {@link PieceSizeEnum.SIZE_512MB}.  For any other preset the supplied value
 * is returned unchanged.
 *
 * @param fileSize - Total content size in bytes.
 * @param pieceSizeEnum - Desired preset, or `SIZE_AUTO` for heuristic selection.
 * @returns Piece size in bytes (≥ 1).
 */
export function calcPieceSize(fileSize: number, pieceSizeEnum: PieceSizeEnum): number {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new RangeError('fileSize must be a non-negative safe integer');
  }

  const allowedValues = Object.values(PieceSizeEnum).filter((value): value is number => typeof value === 'number');
  if (!Number.isSafeInteger(pieceSizeEnum) || !allowedValues.includes(pieceSizeEnum)) {
    throw new RangeError(`pieceSizeEnum is not a supported preset: ${pieceSizeEnum}`);
  }

  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum;
  }

  // Numeric enums also expose their member names, so keep only byte values.
  const presets = allowedValues
    .filter((value) => value !== 0)
    .sort((a, b) => a - b);

  // Pick the smallest preset that exceeds the total file size.
  const selected = presets.find((preset) => fileSize < preset) ?? presets[presets.length - 1];

  // Cap at SIZE_512MB to avoid unreasonably large pieces
  return Math.min(selected, PieceSizeEnum.SIZE_512MB as number);
}

/**
 * Returns the default `created by` string embedded in new torrents.
 *
 * Format: `deno-torrent-metainfo@<version>`.
 *
 * @returns Creator identifier string.
 */
export function getDefaultCreatedBy(): string {
  return `deno-torrent-metainfo@${PACKAGE_VERSION}`;
}

/**
 * Returns `true` when the base name of `filePath` starts with `.`.
 *
 * @param filePath - Any file path (absolute or relative).
 * @returns Whether the file is considered hidden.
 *
 * @example
 * ```ts
 * isHiddenFile(".DS_Store")   // true
 * isHiddenFile("readme.txt")  // false
 * ```
 */
export function isHiddenFile(filePath: string): boolean {
  return basename(filePath).startsWith('.');
}
