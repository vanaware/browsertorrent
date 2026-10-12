/**
 * @module torrent-generator
 *
 * # @vanaware/browsertorrent/torrent-generator
 *
 * High-speed OPFS-based `.torrent` metainfo generator for the browser.
 * Reads files directly from the Origin Private File System (`FileSystemFileHandle` or `FileSystemDirectoryHandle`),
 * calculates SHA-1 piece hashes incrementally with low memory overhead, and encodes bencoded `.torrent` metainfo.
 *
 * @example
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "jsr:@vanaware/browsertorrent/torrent-generator";
 *
 * const rootDir = await navigator.storage.getDirectory();
 * const chunks: Uint8Array[] = [];
 * const writer = {
 *   async write(chunk: Uint8Array) {
 *     chunks.push(chunk);
 *     return chunk.length;
 *   }
 * };
 *
 * const torrent = await generateTorrent({
 *   writer,
 *   entry: rootDir,
 *   pieceSize: PieceSizeEnum.SIZE_AUTO,
 *   trackers: ["wss://tracker.webtorrent.dev"],
 * });
 * console.log("Generated torrent:", torrent.info.name);
 * ```
 */

export { decode, encode, } from "../utils/bencode.ts";
export { generateTorrent, } from "./generator.ts";
export { getOPFSFileSize, walkOPFSDir, } from "./opfs-walker.ts";
export { OPFSMultiFileReader, } from "./opfs-reader.ts";
export {
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  getDefaultCreatedBy,
  isHiddenFile,
  sha1sum,
} from "./util.ts";
export { PieceSizeEnum, } from "./types.ts";
export type {
  BencodeDict,
  BencodeKey,
  BencodeList,
  BencodeMap,
  BencodeValue,
  DecodeOptions,
  GeneratorOptions,
  OPFSFileEntry,
  PieceFile,
  Torrent,
  Writer,
} from "./types.ts";
