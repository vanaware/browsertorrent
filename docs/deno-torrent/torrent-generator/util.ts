/**
 * Internal utility functions for torrent generation.
 * @module
 */

import { walk } from "@std/fs/walk"
import { basename } from "@std/path"
import { crypto } from "@std/crypto/crypto"
import { logd } from "./log.ts"
import { MultiFileReader } from "./reader.ts"
import { PieceSizeEnum } from "./types.ts"

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
  const stat = await Deno.stat(entry)
  if (stat.isFile) return [entry]

  const files: string[] = []
  for await (const item of walk(entry, { includeFiles: true, includeDirs: false })) {
    if (ignoreHiddenFile && isHiddenFile(item.path)) continue
    files.push(item.path)
  }
  return files
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
): Promise<Uint8Array> {
  if (pieceSize < 1) throw new RangeError("pieceSize must be ≥ 1")

  if (alignPiece) return await sha1sumAligned(files, pieceSize)

  const totalSize = await fileSizeSum(files)
  const pieceCount = Math.ceil(totalSize / pieceSize)
  logd(`pieceSize=${pieceSize}, pieceCount=${pieceCount}, files=${files.length}`)

  const digestParts: Uint8Array[] = []
  const reader = new MultiFileReader(files)
  try {
    let chunk: Uint8Array | null
    while ((chunk = await reader.readChunk(pieceSize)) !== null) {
      const digest = await crypto.subtle.digest("SHA-1", chunk as unknown as Uint8Array<ArrayBuffer>)
      digestParts.push(new Uint8Array(digest))
    }
  } finally {
    reader.close()
  }

  // Concatenate all 20-byte digests
  const result = new Uint8Array(digestParts.length * 20)
  let offset = 0
  for (const d of digestParts) {
    result.set(d, offset)
    offset += 20
  }

  // Sanity check
  if (digestParts.length !== pieceCount) {
    logd(`Warning: expected ${pieceCount} pieces, got ${digestParts.length}`)
  }

  return result
}

type PieceFile = {
  file: string | null
  length: number
  padding: boolean
}

/** Builds the logical file stream used by BEP-47 piece-aligned torrents. */
export async function buildPieceFiles(files: string[], pieceSize: number): Promise<PieceFile[]> {
  const sizes = await Promise.all(files.map(async (file) => (await Deno.stat(file)).size))
  const pieceFiles: PieceFile[] = []
  let pieceOffset = 0

  for (let index = 0; index < files.length; index++) {
    const length = sizes[index]
    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset
      pieceFiles.push({ file: null, length: paddingLength, padding: true })
      pieceOffset = 0
    }

    pieceFiles.push({ file: files[index], length, padding: false })
    pieceOffset = (pieceOffset + length) % pieceSize
  }

  return pieceFiles
}

async function sha1sumAligned(files: string[], pieceSize: number): Promise<Uint8Array> {
  const pieceFiles = await buildPieceFiles(files, pieceSize)
  const digests: Uint8Array[] = []
  const piece = new Uint8Array(pieceSize)
  let pieceOffset = 0

  const digestPiece = async (length: number): Promise<void> => {
    const digest = await crypto.subtle.digest("SHA-1", piece.subarray(0, length) as Uint8Array<ArrayBuffer>)
    digests.push(new Uint8Array(digest))
  }

  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      piece.fill(0, pieceOffset, pieceOffset + pieceFile.length)
      pieceOffset += pieceFile.length
      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize)
        pieceOffset = 0
      }
      continue
    }

    const reader = new MultiFileReader([pieceFile.file!])
    try {
      let chunk: Uint8Array | null
      while ((chunk = await reader.readChunk(pieceSize - pieceOffset)) !== null) {
        piece.set(chunk, pieceOffset)
        pieceOffset += chunk.length
        if (pieceOffset === pieceSize) {
          await digestPiece(pieceSize)
          pieceOffset = 0
        }
      }
    } finally {
      reader.close()
    }
  }

  if (pieceOffset > 0) await digestPiece(pieceOffset)

  const result = new Uint8Array(digests.length * 20)
  digests.forEach((digest, index) => result.set(digest, index * 20))
  return result
}

/**
 * Sums the byte sizes of all given files.
 *
 * @param files - Absolute file paths whose sizes are summed.
 * @returns Total size in bytes.
 */
export async function fileSizeSum(files: string[]): Promise<number> {
  let total = 0
  for (const file of files) {
    const { size } = await Deno.stat(file)
    total += size
  }
  return total
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
  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum as number
  }

  // All numeric preset values in ascending order, excluding SIZE_AUTO (0)
  const presets = (Object.values(PieceSizeEnum) as number[])
    .filter((v) => v !== 0 && typeof v === "number")
    .sort((a, b) => a - b)

  // Pick the smallest preset that exceeds the total file size
  const selected = presets.find((p) => fileSize < p) ?? presets[presets.length - 1]

  // Cap at SIZE_512MB to avoid unreasonably large pieces
  return Math.min(selected, PieceSizeEnum.SIZE_512MB as number)
}

/**
 * Returns the latest git tag from the repository in `major.minor.patch` form.
 *
 * Falls back to `"0.0.0"` if git is not available or the repository has no
 * tags.
 *
 * @returns Version string, e.g. `"1.2.3"`.
 */
export async function getLatestTag(): Promise<string> {
  const DEFAULT = "0.0.0"
  try {
    const cmd = new Deno.Command("git", {
      args: ["describe", "--tags", "--abbrev=0"],
      stdout: "piped",
      stderr: "null",
    })
    const { code, stdout } = await cmd.output()
    if (code !== 0) return DEFAULT
    const tag = new TextDecoder().decode(stdout).trim()
    return /^\d+\.\d+\.\d+/.test(tag) ? tag : DEFAULT
  } catch {
    return DEFAULT
  }
}

/**
 * Returns the default `created by` string embedded in new torrents.
 *
 * Format: `deno-torrent-generator@<version>`.
 *
 * @returns Creator identifier string.
 */
export async function getDefaultCreatedBy(): Promise<string> {
  return `deno-torrent-generator@${await getLatestTag()}`
}

/**
 * @deprecated Renamed to {@link getDefaultCreatedBy} (fixed typo in name).
 * Will be removed in a future version.
 */
export const getDefaultCraetedBy = getDefaultCreatedBy

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
  return basename(filePath).startsWith(".")
}
