/**
 * bencode 2.0 — a protocol-faithful Bencode encoder/decoder for Deno.
 *
 * @example
 * ```ts
 * import { encode, decode } from 'jsr:@deno-torrent/bencode'
 *
 * const value = new Map([
 *   ['announce', 'https://tracker.example.com'],
 *   ['info', new Map([['name', 'test'], ['length', 1024]])]
 * ])
 * const bytes = encode(value)
 * const decoded = decode(bytes)
 * ```
 *
 * @module
 */

export type {
  BencodeByteString,
  BencodeDict,
  BencodeInteger,
  BencodeKey,
  BencodeList,
  BencodeValue,
} from "./src/types.ts";
export { BencodeDecodeError, BencodeEncodeError } from "./src/types.ts";
export { encode } from "./src/encode.ts";
export { decode, type DecodeOptions } from "./src/decode.ts";
