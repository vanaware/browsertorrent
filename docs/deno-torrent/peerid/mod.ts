/**
 * @module
 *
 * @deno-torrent/peerid — BitTorrent PeerId 编解码库。
 *
 * 支持 Azureus 风格（`-XX####-...`）和 Shadow 风格（`X###---...`）两种格式的编解码。
 *
 * @example 解码
 * ```ts
 * import { decode } from "@deno-torrent/peerid";
 *
 * decode("-AZ2060-Mb?3kG/qpRd^");
 * // => { code: "AZ", name: "Azureus", version: "2.0.60" }
 * ```
 *
 * @example 编码
 * ```ts
 * import { encodeAzStyle, encodeShadowStyle } from "@deno-torrent/peerid";
 *
 * new TextDecoder().decode(encodeAzStyle("AZ", "2.0.60"));
 * // => "-AZ2060-xxxxxxxxxx"
 *
 * new TextDecoder().decode(encodeShadowStyle("S", "5.8.11"));
 * // => "S58B-----xxxxxxxxxx"
 * ```
 */
export {
  decode,
  encode,
  encodeAzStyle,
  encodeShadowStyle,
} from "./src/peerid.ts";
export type { Client } from "./src/type.ts";
export { AZStyleClient, ShadowStyleClient } from "./src/enum.ts";
