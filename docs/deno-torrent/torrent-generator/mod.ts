/**
 * @module
 * @description
 * **torrent-generator** — a lightweight Deno library for generating
 * BitTorrent `.torrent` files from files and directories.
 *
 * ## Quick start
 *
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "@deno-torrent/torrent-generator"
 *
 * const out = await Deno.open("output.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "./my-folder",
 *   writer: out,
 *   trackers: [new URL("udp://tracker.example.com:6969/announce")],
 * })
 * out.close()
 * ```
 */

export { generateTorrent } from "./src/generator.ts"
export { PieceSizeEnum } from "./src/types.ts"
export type { GeneratorOption, Torrent, Writer } from "./src/types.ts"
export { disableDebug, enableDebug } from "./src/log.ts"
