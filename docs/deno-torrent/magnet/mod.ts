/**
 * @module
 * @deno-torrent/magnet 公共入口。
 * Public entry point for @deno-torrent/magnet.
 */

export type {
  MagnetBuildOptions,
  MagnetInfo,
  MagnetParseOptions,
} from "./src/magnet.ts";

export {
  build,
  buildV2,
  isBase32,
  isBase64,
  isHex,
  isSha1Base32,
  isSha1Hex,
  isValid,
  parse,
} from "./src/magnet.ts";
