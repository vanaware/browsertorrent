// /loco/monorepo/webtorrent/src/torrent-generator/mod.ts
/**
 * Public surface of the OPFS-backed torrent generator.
 */

export { decode, encode } from "../utils/bencode.ts";
export { generateTorrent } from "./generator.ts";
export { walkOPFSDir, getOPFSFileSize } from "./opfs-walker.ts";
export { OPFSMultiFileReader } from "./opfs-reader.ts";
export {
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  getDefaultCreatedBy,
  isHiddenFile,
  sha1sum,
} from "./util.ts";
export { PieceSizeEnum } from "./types.ts";
export type {
  BencodeValue,
  GeneratorOptions,
  OPFSFileEntry,
  PieceFile,
  Torrent,
  Writer,
} from "./types.ts";
