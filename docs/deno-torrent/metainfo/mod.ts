/**
 * Parse and generate BitTorrent `.torrent` metainfo files.
 *
 * This package combines the public APIs of `@deno-torrent/torrent-parser`
 * and `@deno-torrent/torrent-generator` behind one shared type model.
 * @module
 */
export { generateTorrent } from './src/generator.ts';
export {
  calculateInfoHash,
  calculateInfoHashV2,
  extractInfoBytes,
  parseTorrentWithIdentity,
  toHex,
  wrapInfoBytes,
} from './src/identity.ts';
export type { TorrentIdentity, WrapInfoOptions } from './src/identity.ts';
export { parseTorrent, TorrentParseError } from './src/parser.ts';
export { flattenV2Files, validateV2PieceLayers } from './src/v2.ts';
export type { TorrentV2FileEntry } from './src/v2.ts';
export { DEFAULT_MAX_METAINFO_SIZE, PieceSizeEnum } from './src/types.ts';
export type {
  GeneratorOption,
  ParseTorrentOptions,
  Reader,
  Torrent,
  Torrent as GeneratorTorrent,
  TorrentFile,
  TorrentFileTree,
  TorrentInfo,
  TorrentInfoCommon,
  TorrentPieceLayer,
  TorrentV1Info,
  TorrentV2File,
  TorrentV2Info,
  Writer,
} from './src/types.ts';
