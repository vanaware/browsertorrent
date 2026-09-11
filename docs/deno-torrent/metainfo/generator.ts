/**
 * Core torrent generation logic.
 *
 * Exposes a single async function {@link generateTorrent} that reads files,
 * computes SHA-1 piece hashes, and writes a complete `.torrent` file in
 * Bencode format.
 *
 * @module
 */

import { basename, relative, resolve, SEPARATOR } from '@std/path';
import { encode } from '@deno-torrent/bencode';
import type { BencodeValue } from '@deno-torrent/bencode';
import { IoUtil } from '@deno-torrent/toolkit';
import { PieceSizeEnum } from './types.ts';
import type { GeneratorOption } from './types.ts';
import { compareStrings, isSafePathComponent } from './path.ts';
import { buildPieceFiles, calcPieceSize, getDefaultCreatedBy, obtainFiles, sha1sum } from './utils.ts';

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
 * import { generateTorrent } from 'jsr:@deno-torrent/metainfo@1'
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
 * import { generateTorrent, PieceSizeEnum } from 'jsr:@deno-torrent/metainfo@1'
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
 * @throws {Error} If the entry contains no files or the destination writer fails.
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
  if (writer === null || typeof writer !== 'object' || typeof writer.write !== 'function') {
    throw new TypeError('writer must implement write(Uint8Array)');
  }
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new TypeError('entry must be a non-empty path string');
  }
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new RangeError('createdAt must be a non-negative safe integer');
  }
  if (![ignoreHiddenFile, alignPiece, isPrivate].every((value) => typeof value === 'boolean')) {
    throw new TypeError('ignoreHiddenFile, alignPiece, and isPrivate must be booleans');
  }
  if (!Array.isArray(trackers) || !trackers.every((tracker) => tracker instanceof URL)) {
    throw new TypeError('trackers must be an array of URL objects');
  }
  if (!Array.isArray(webSeeds) || !webSeeds.every((webSeed) => webSeed instanceof URL)) {
    throw new TypeError('webSeeds must be an array of URL objects');
  }
  for (const [name, value] of Object.entries({ source, comment, createdBy })) {
    if (value !== undefined && typeof value !== 'string') {
      throw new TypeError(`${name} must be a string when provided`);
    }
  }

  entry = resolve(entry);
  const torrentName = basename(entry);
  if (!isSafePathComponent(torrentName)) {
    throw new TypeError(`entry does not resolve to a safe torrent name: ${torrentName || '<empty>'}`);
  }

  const entryStat = await Deno.stat(entry);

  // Stable ordering makes repeated generation reproducible.
  let files = await obtainFiles(entry, ignoreHiddenFile);
  files = files.sort((a, b) => {
    const depthDiff = a.split(SEPARATOR).length - b.split(SEPARATOR).length;
    return depthDiff !== 0 ? depthDiff : compareStrings(a, b);
  });

  if (files.length === 0) {
    throw new Error(`No files found under entry: ${entry}`);
  }
  for (const file of files) {
    const components = relative(entryStat.isFile ? resolve(entry, '..') : entry, file).split(SEPARATOR);
    if (!components.every(isSafePathComponent)) {
      throw new Error(`Source path cannot be represented safely in torrent metainfo: ${file}`);
    }
  }

  const singleFileMode = entryStat.isFile;
  const initialSizes = await Promise.all(files.map(async (file) => (await Deno.stat(file)).size));
  const totalSize = initialSizes.reduce((total, size) => {
    const next = total + size;
    if (!Number.isSafeInteger(next)) throw new RangeError('Total file size exceeds the safe integer range');
    return next;
  }, 0);
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum);

  const info = new Map<string, BencodeValue>([
    ['name', torrentName],
    ['piece length', pieceSize],
  ]);
  const torrent = new Map<string, BencodeValue>([
    ['created by', createdBy ?? getDefaultCreatedBy()],
    ['creation date', createdAt],
    ['info', info],
  ]);

  // ── Trackers ─────────────────────────────────────────────────────────────
  if (trackers.length > 0) {
    // URL ordering is canonical even when callers pass a different order.
    trackers = [...trackers].sort((a, b) => compareStrings(a.href, b.href));
    torrent.set('announce', trackers[0].href);
    if (trackers.length > 1) {
      // announce-list: each tracker in its own tier (BEP-12)
      torrent.set('announce-list', trackers.map((t) => [t.href]));
    }
  }

  // ── Web seeds (BEP-19) ────────────────────────────────────────────────────
  if (webSeeds && webSeeds.length > 0) {
    webSeeds = [...webSeeds].sort((a, b) => compareStrings(a.href, b.href));
    torrent.set('url-list', webSeeds.length === 1 ? webSeeds[0].href : webSeeds.map((w) => w.href));
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  if (isPrivate) info.set('private', 1);
  if (comment) torrent.set('comment', comment);
  if (source) torrent.set('source', source);

  // ── Piece hashes & file metadata ──────────────────────────────────────────
  if (singleFileMode) {
    info.set('length', initialSizes[0]);
    info.set('pieces', await sha1sum(files, pieceSize));
  } else {
    const pieceFiles = alignPiece
      ? await buildPieceFiles(files, pieceSize, initialSizes)
      : files.map((file, index) => ({ file, length: initialSizes[index], padding: false }));
    const torrentFiles = pieceFiles.map((pieceFile, index) => ({
      attr: pieceFile.padding ? 'p' : undefined,
      length: pieceFile.length,
      path: pieceFile.padding
        ? ['.pad', `${pieceFile.length}-${index}`]
        : relative(entry, pieceFile.file!).split(SEPARATOR),
    }));
    info.set(
      'files',
      torrentFiles.map(({ attr, length, path }) => {
        const file = new Map<string, BencodeValue>([
          ['length', length],
          ['path', path],
        ]);
        if (attr !== undefined) file.set('attr', attr);
        return file;
      }),
    );
    info.set('pieces', await sha1sum(files, pieceSize, alignPiece, pieceFiles));
  }

  const finalSizes = await Promise.all(files.map(async (file) => (await Deno.stat(file)).size));
  if (finalSizes.some((size, index) => size !== initialSizes[index])) {
    throw new Error('Source files changed size while the torrent was being generated');
  }

  // Complete partial writes so filesystem and streaming destinations are safe.
  await IoUtil.writeAll(writer, encode(torrent));
}
