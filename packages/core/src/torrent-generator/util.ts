// /loco/monorepo/webtorrent/src/torrent-generator/util.ts
/**
 * Pure helper functions for the OPFS torrent generator.
 *
 * Replaces `deno-torrent/torrent-generator/util.ts`.  All filesystem-side
 * calls (`Deno.stat`, `Deno.open`) are removed; file I/O is handled by
 * `OPFSMultiFileReader` and `OPFSFileReader`.
 *
 * Pure functions carry no side-effects and need no test mocking.
 */

import { PieceSizeEnum } from "./types.ts";
import type { OPFSFileEntry, PieceFile } from "./types.ts";
import { OPFSMultiFileReader } from "./opfs-reader.ts";

/**
 * Sums the byte sizes of all given file entries.
 *
 * @param files - OPFS file entries whose sizes are summed.
 * @returns Total size in bytes.
 */
export function fileSizeSum(files: OPFSFileEntry[]): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}

/**
 * Selects an appropriate piece size for the given total file size.
 *
 * When `pieceSizeEnum` is `PieceSizeEnum.SIZE_AUTO` the function returns the
 * smallest preset that is larger than `fileSize`, capped at
 * `PieceSizeEnum.SIZE_512MB`.  For any other preset the supplied value is
 * returned unchanged.
 *
 * @param fileSize - Total content size in bytes.
 * @param pieceSizeEnum - Desired preset, or `SIZE_AUTO` for heuristic selection.
 * @returns Piece size in bytes (≥ 1).
 */
export function calcPieceSize(fileSize: number, pieceSizeEnum: PieceSizeEnum | number): number {
  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum as number;
  }

  const presets = (Object.values(PieceSizeEnum) as number[])
    .filter((v) => v !== 0 && typeof v === "number")
    .sort((a, b) => a - b);

  const selected = presets.find((p) => fileSize < p) ?? presets[presets.length - 1] ?? 0;
  return Math.min(selected!, PieceSizeEnum.SIZE_512KB as number);
}

/**
 * Returns `true` when the base name of a path starts with `"."`.
 *
 * @param name - File name or path.
 */
export function isHiddenFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base.startsWith(".");
}

/**
 * Builds the logical file stream used by BEP-47 piece-aligned torrents.
 *
 * Splits `files` into real entries and synthetic padding entries (`.pad/...`).
 * When a real file doesn't start on a piece boundary, a zero-filled padding
 * block is inserted before it so every real file begins at `pieceSize` offsets.
 *
 * @param files - Sorted list of OPFS file entries (BEP-3 order).
 * @param pieceSize - Target piece size in bytes.
 * @returns Ordered list of piece-file descriptors.
 */
export function buildPieceFiles(files: OPFSFileEntry[], pieceSize: number): PieceFile[] {
  const pieceFiles: PieceFile[] = [];
  let pieceOffset = 0;

  for (let i = 0; i < files.length; i++) {
    const entry = files[i]!;
    const length = entry.size;

    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset;
      pieceFiles.push({ file: null, length: paddingLength, padding: true });
      pieceOffset = 0;
    }

    pieceFiles.push({ file: entry, length, padding: false });
    pieceOffset = (pieceOffset + length) % pieceSize;
  }

  return pieceFiles;
}

/**
 * Computes the concatenated SHA-1 piece hashes for a list of files.
 *
 * Files are read sequentially as a single byte stream using
 * `OPFSMultiFileReader`.  The stream is divided into `pieceSize` chunks;
 * the last chunk may be smaller.  Each chunk's SHA-1 digest (20 bytes) is
 * appended to the result.
 *
 * When `alignPiece` is true, BEP-47 padding zeros are included in the
 * stream before each non-aligned file.
 *
 * @param files - Ordered list of OPFS file entries to hash.
 * @param pieceSize - Number of bytes per piece (must be ≥ 1).
 * @param alignPiece - When true, inject zero padding between files (BEP-47).
 * @returns `Uint8Array` whose length is a multiple of 20.
 */
export async function sha1sum(
  files: OPFSFileEntry[],
  pieceSize: number,
  alignPiece = false,
): Promise<Uint8Array> {
  if (pieceSize < 1) throw new RangeError("pieceSize must be ≥ 1");

  if (alignPiece) return sha1sumAligned(files, pieceSize);

  const totalSize = fileSizeSum(files);
  const pieceCount = Math.ceil(totalSize / pieceSize);

  const digestParts: Uint8Array[] = [];
  const reader = new OPFSMultiFileReader(files);
  try {
    let chunk: Uint8Array | null;
    while ((chunk = await reader.readChunk(pieceSize)) !== null) {
      const digest = await crypto.subtle.digest(
        "SHA-1",
        chunk as unknown as Uint8Array<ArrayBuffer>,
      );
      digestParts.push(new Uint8Array(digest));
    }
  } finally {
    reader.close();
  }

  const result = new Uint8Array(digestParts.length * 20);
  let offset = 0;
  for (const d of digestParts) {
    result.set(d, offset);
    offset += 20;
  }

  if (digestParts.length !== pieceCount) {
    console.warn(
      `[sha1sum] expected ${pieceCount} pieces, got ${digestParts.length}`,
    );
  }

  return result;
}

/** BEP-47 variant: inject padding zeros before each non-aligned file. */
async function sha1sumAligned(files: OPFSFileEntry[], pieceSize: number): Promise<Uint8Array> {
  const pieceFiles = buildPieceFiles(files, pieceSize);
  const digests: Uint8Array[] = [];
  const piece = new Uint8Array(pieceSize);
  let pieceOffset = 0;

  const digestPiece = async (len: number): Promise<void> => {
    const digest = await crypto.subtle.digest(
      "SHA-1",
      piece.subarray(0, len) as unknown as Uint8Array<ArrayBuffer>,
    );
    digests.push(new Uint8Array(digest));
  };

  const reader = new OPFSMultiFileReader(pieceFiles.map((pf) => pf.file!).filter(Boolean) as OPFSFileEntry[]);
  let readerIndex = 0;

  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      piece.fill(0, pieceOffset, pieceOffset + pieceFile.length);
      pieceOffset += pieceFile.length;
      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize);
        pieceOffset = 0;
      }
      continue;
    }

    const fileEntry = pieceFile.file!;
    const file = await fileEntry.handle!.getFile();
    let fileOffset = 0;

    while (fileOffset < file.size) {
      const want = Math.min(pieceSize - pieceOffset, file.size - fileOffset);
      const blob = file.slice(fileOffset, fileOffset + want);
      const buf = new Uint8Array(await blob.arrayBuffer());
      fileOffset += buf.length;

      piece.set(buf, pieceOffset);
      pieceOffset += buf.length;

      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize);
        pieceOffset = 0;
      }
    }
  }

  if (pieceOffset > 0) await digestPiece(pieceOffset);

  const result = new Uint8Array(digests.length * 20);
  digests.forEach((d, i) => result.set(d, i * 20));
  return result;
}

/**
 * Returns the default `"created by"` string embedded in generated torrents.
 *
 * In the browser we cannot call `git describe --tags`.  The version is
 * hardcoded as `"loco-torrent-generator@1.0.0"` — callers can override via
 * the `createdBy` option.
 *
 * @returns Creator identifier string.
 */
export function getDefaultCreatedBy(): string {
  return "loco-torrent-generator@1.0.0";
}
