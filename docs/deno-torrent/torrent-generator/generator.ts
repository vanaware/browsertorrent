/**
 * Core torrent generation logic.
 *
 * Exposes a single async function {@link generateTorrent} that reads files,
 * computes SHA-1 piece hashes, and writes a complete `.torrent` file in
 * Bencode format.
 *
 * @module
 */

import { basename, relative, SEPARATOR } from "@std/path"
import { encode } from "@deno-torrent/bencode"
import type { BencodeValue } from "@deno-torrent/bencode"
import { PieceSizeEnum } from "./types.ts"
import type { GeneratorOption } from "./types.ts"
import { buildPieceFiles, calcPieceSize, fileSizeSum, getDefaultCreatedBy, obtainFiles, sha1sum } from "./util.ts"

/**
 * Generates a BitTorrent `.torrent` file and writes it to `options.writer`.
 *
 * Supports both *single-file* (when `entry` points to a regular file) and
 * *multi-file* (when `entry` points to a directory) torrents.
 *
 * File ordering is stable: paths with fewer directory components appear first;
 * within the same depth files are sorted lexicographically.
 *
 * @param options - Generation parameters; see {@link GeneratorOption}.
 *
 * @example Single-file torrent
 * ```ts
 * import { generateTorrent } from "@deno-torrent/torrent-generator"
 *
 * const out = await Deno.open("video.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/media/video.mkv",
 *   writer: out,
 *   trackers: [new URL("udp://tracker.openbittracker.com:6969/announce")],
 * })
 * out.close()
 * ```
 *
 * @example Multi-file torrent with all options
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "@deno-torrent/torrent-generator"
 *
 * const out = await Deno.open("album.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/media/my-album",
 *   writer: out,
 *   pieceSizeEnum: PieceSizeEnum.SIZE_512MB,
 *   ignoreHiddenFile: true,
 *   isPrivate: true,
 *   trackers: [
 *     new URL("udp://tracker1.example.com:6969"),
 *     new URL("udp://tracker2.example.com:6969"),
 *   ],
 *   webSeeds: [new URL("https://mirror.example.com/my-album/")],
 *   source: "https://example.com/releases/my-album",
 *   comment: "My favourite album",
 *   createdBy: "my-app@1.0.0",
 * })
 * out.close()
 * ```
 *
 * @throws {Deno.errors.NotFound} If `entry` does not exist on the filesystem.
 * @throws {Error} If `trackers` is empty (no announce URL can be set).
 */
export async function generateTorrent({
  writer,
  entry,
  pieceSizeEnum = PieceSizeEnum.SIZE_AUTO,
  ignoreHiddenFile = false,
  alignPiece = false,
  isPrivate = false,
  trackers = [],
  webSeeds = [],
  source,
  comment,
  createdBy,
  createdAt = Math.floor(Date.now() / 1000),
}: GeneratorOption): Promise<void> {
  const entryStat = await Deno.stat(entry)

  // Collect and sort files by path depth (shallowest first), then lexically
  let files = await obtainFiles(entry, ignoreHiddenFile)
  files = files.sort((a, b) => {
    const depthDiff = a.split(SEPARATOR).length - b.split(SEPARATOR).length
    return depthDiff !== 0 ? depthDiff : a.localeCompare(b)
  })

  if (files.length === 0) {
    throw new Error(`No files found under entry: ${entry}`)
  }

  const singleFileMode = entryStat.isFile
  const totalSize = await fileSizeSum(files)
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum)

  const info = new Map<string, BencodeValue>([
    ["name", basename(entry)],
    ["piece length", pieceSize],
  ])
  const torrent = new Map<string, BencodeValue>([
    ["created by", createdBy ?? (await getDefaultCreatedBy())],
    ["creation date", createdAt],
    ["info", info],
  ])

  // ── Trackers ─────────────────────────────────────────────────────────────
  if (trackers.length > 0) {
    // Sort for deterministic output
    trackers = [...trackers].sort((a, b) => a.href.localeCompare(b.href))
    torrent.set("announce", trackers[0].href)
    if (trackers.length > 1) {
      // announce-list: each tracker in its own tier (BEP-12)
      torrent.set("announce-list", trackers.map((t) => [t.href]))
    }
  }

  // ── Web seeds (BEP-19) ────────────────────────────────────────────────────
  if (webSeeds && webSeeds.length > 0) {
    webSeeds = [...webSeeds].sort((a, b) => a.href.localeCompare(b.href))
    torrent.set("url-list", webSeeds.length === 1 ? webSeeds[0].href : webSeeds.map((w) => w.href))
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  if (isPrivate) info.set("private", 1)
  if (comment) torrent.set("comment", comment)
  if (source) torrent.set("source", source)

  // ── Piece hashes & file metadata ──────────────────────────────────────────
  if (singleFileMode) {
    const { size } = await Deno.stat(files[0])
    info.set("length", size)
    info.set("pieces", await sha1sum(files, pieceSize))
  } else {
    const pieceFiles = alignPiece
      ? await buildPieceFiles(files, pieceSize)
      : files.map((file) => ({ file, length: 0, padding: false }))
    const torrentFiles = await Promise.all(pieceFiles.map(async (pieceFile, index) => ({
      length: pieceFile.padding ? pieceFile.length : (await Deno.stat(pieceFile.file!)).size,
      path: pieceFile.padding
        ? [".pad", `${pieceFile.length}-${index}`]
        : relative(entry, pieceFile.file!).split(SEPARATOR),
    })))
    info.set(
      "files",
      torrentFiles.map(({ length, path }) =>
        new Map<string, BencodeValue>([
          ["length", length],
          ["path", path],
        ])
      ),
    )
    info.set("pieces", await sha1sum(files, pieceSize, alignPiece))
  }

  // ── Encode and write ──────────────────────────────────────────────────────
  await writer.write(encode(torrent))
}
