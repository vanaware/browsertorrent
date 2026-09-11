// /loco/monorepo/webtorrent/src/torrent-generator/generator.ts
/**
 * OPFS-backed BitTorrent `.torrent` file generator.
 *
 * Replaces `deno-torrent/torrent-generator/generator.ts` for browser
 * environments.  Reads files from OPFS (`FileSystemDirectoryHandle`) via
 * `File.slice()` + `Blob.arrayBuffer()` instead of `Deno.open` +
 * `Deno.FsFile.read`.
 *
 * Supports:
 * - Multi-file torrents from OPFS directories
 * - BEP-47 piece-aligned padding
 * - BEP-3 file ordering (shallowest first, then lexicographic)
 * - BEP-12 tracker lists
 * - BEP-19 web seeds
 * - Private torrents
 *
 * @module
 */

import { encode } from "../utils/bencode.ts";
import type { BencodeValue, GeneratorOptions, OPFSFileEntry, PieceFile } from "./types.ts";
import { PieceSizeEnum } from "./types.ts";
import { walkOPFSDir } from "./opfs-walker.ts";
import {
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  getDefaultCreatedBy,
  sha1sum,
} from "./util.ts";

/**
 * Generates a BitTorrent `.torrent` file and writes it to `options.writer`.
 *
 * The `entry` option accepts:
 * - A `FileSystemDirectoryHandle` — recursively scanned for files.
 * - A plain array of `OPFSFileEntry` — for callers that have already
 *   performed the walk and fetched file sizes.
 *
 * @param options - Generation parameters.  See {@link GeneratorOptions}.
 *
 * @example Multi-file torrent from an OPFS directory
 * ```ts
 * import { generateTorrent } from "@loco/webtorrent/torrent-generator";
 *
 * const rootHandle = await navigator.storage.getDirectory();
 * // ... populate rootHandle with files ...
 *
 * const chunks: Uint8Array[] = [];
 * await generateTorrent({
 *   entry: rootHandle,
 *   writer: { write: async (p) => { chunks.push(p); return p.length; } },
 *   trackers: ["udp://tracker.example.com:6969/announce"],
 * });
 * const torrentBytes = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
 * // flatten chunks into torrentBytes...
 * ```
 */
export async function generateTorrent(options: GeneratorOptions): Promise<void> {
  const {
    writer,
    entry,
    pieceSize: pieceSizeEnum = PieceSizeEnum.SIZE_AUTO,
    ignoreHiddenFile = false,
    alignPiece = false,
    isPrivate = false,
    trackers = [],
    webSeeds = [],
    source,
    comment,
    createdBy,
    createdAt = Math.floor(Date.now() / 1000),
  } = options;

  // ── Resolve entries ─────────────────────────────────────────────────────
  let files: OPFSFileEntry[];
  let rootName: string;

  if (Array.isArray(entry)) {
    files = entry;
    rootName = inferRootName(entry);
  } else {
    rootName = entry.name;
    files = await walkOPFSDir(entry, ignoreHiddenFile);
  }

  if (files.length === 0) {
    throw new Error(`No files found in entry`);
  }

  // ── Metadata ─────────────────────────────────────────────────────────────
  const totalSize = fileSizeSum(files);
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum as PieceSizeEnum);

  const info = new Map<string, BencodeValue>([
    ["name", rootName],
    ["piece length", pieceSize],
  ]);

  const torrent = new Map<string, BencodeValue>([
    ["created by", createdBy ?? getDefaultCreatedBy()],
    ["creation date", createdAt],
    ["info", info],
  ]);

  // ── Trackers (BEP-12) ───────────────────────────────────────────────────
  if (trackers.length > 0) {
    const sorted = [...trackers].sort((a, b) => a.localeCompare(b));
    torrent.set("announce", sorted[0]!);
    if (sorted.length > 1) {
      torrent.set("announce-list", sorted.map((t) => [t]));
    }
  }

  // ── Web seeds (BEP-19) ──────────────────────────────────────────────────
  if (webSeeds.length > 0) {
    const sorted = [...webSeeds].sort((a, b) => a.localeCompare(b));
    torrent.set(
      "url-list",
      sorted.length === 1 ? sorted[0]! : sorted,
    );
  }

  // ── Optional fields ──────────────────────────────────────────────────────
  if (isPrivate) info.set("private", 1);
  if (comment) torrent.set("comment", comment);
  if (source) torrent.set("source", source);

  // ── Piece hashes & file metadata ─────────────────────────────────────────
  if (files.length === 1 && !files[0]!.name.includes("/")) {
    // Single-file torrent
    info.set("length", files[0]!.size);
    info.set("pieces", await sha1sum(files, pieceSize));
  } else {
    // Multi-file torrent
    const pieceFiles: PieceFile[] = alignPiece
      ? buildPieceFiles(files, pieceSize)
      : files.map((file) => ({ file, length: file.size, padding: false }));

    const torrentFiles = pieceFiles.map((pieceFile, index) => {
      if (pieceFile.padding) {
        return new Map<string, BencodeValue>([
          ["length", pieceFile.length],
          ["path", [".pad", `${pieceFile.length}-${index}`]],
        ]);
      }
      return new Map<string, BencodeValue>([
        ["length", pieceFile.file!.size],
        ["path", pieceFile.file!.name.split("/")],
      ]);
    });

    info.set("files", torrentFiles);
    info.set("pieces", await sha1sum(files, pieceSize, alignPiece));
  }

  // ── Encode and write ────────────────────────────────────────────────────
  await writer.write(encode(torrent));
}

/**
 * Infers the torrent root name from a list of file entries.
 * Uses the common prefix of all entry names (if any), otherwise the
 * first entry's first path component.
 */
function inferRootName(entries: OPFSFileEntry[]): string {
  if (entries.length === 0) return "torrent";
  const first = entries[0]!;

  // If all entries share a common first segment, use it as root.
  const firstParts = first.name.split("/");
  if (firstParts.length <= 1) return firstParts[0] ?? first.name;

  let commonPrefixLength = 1;
  for (let d = 1; d < firstParts.length; d++) {
    const prefix = firstParts.slice(0, d + 1).join("/");
    if (entries.every((e) => e.name.startsWith(prefix + "/"))) {
      commonPrefixLength = d + 1;
    } else {
      break;
    }
  }

  return firstParts.slice(0, commonPrefixLength).join("/");
}
