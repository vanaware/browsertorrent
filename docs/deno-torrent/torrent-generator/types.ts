/**
 * Type definitions and enumerations for the torrent generator.
 * @module
 */

/**
 * A minimal write interface compatible with {@link Deno.FsFile} and any
 * object that can accept raw bytes.
 *
 * Use `Deno.openSync` / `Deno.open` to obtain a compatible writer backed by
 * a real file, or create an in-memory buffer for testing.
 */
export interface Writer {
  /** Write all bytes in `p` and return the number of bytes written. */
  write(p: Uint8Array): Promise<number>
}

/**
 * Piece-size presets for torrent generation.
 *
 * The values represent the actual byte size of each piece.
 * `SIZE_AUTO` instructs the generator to select an appropriate size
 * automatically based on the total size of the input files.
 *
 * Standard BitTorrent clients use piece sizes ranging from 16 MB to 16 GB
 * for large content; `SIZE_AUTO` follows the same heuristic.
 *
 * @example
 * ```ts
 * import { PieceSizeEnum } from "@deno-torrent/torrent-generator"
 * console.log(PieceSizeEnum.SIZE_AUTO)   // 0
 * console.log(PieceSizeEnum.SIZE_16MB)   // 16777216
 * ```
 */
export enum PieceSizeEnum {
  /** Automatically select the best piece size based on total file size. */
  SIZE_AUTO = 0,
  SIZE_16MB = 16 * 1024 * 1024,
  SIZE_32MB = 32 * 1024 * 1024,
  SIZE_64MB = 64 * 1024 * 1024,
  SIZE_128MB = 128 * 1024 * 1024,
  SIZE_256MB = 256 * 1024 * 1024,
  SIZE_512MB = 512 * 1024 * 1024,
  SIZE_1GB = 1024 * 1024 * 1024,
  SIZE_2GB = 2 * 1024 * 1024 * 1024,
  SIZE_4GB = 4 * 1024 * 1024 * 1024,
  SIZE_8GB = 8 * 1024 * 1024 * 1024,
  SIZE_16GB = 16 * 1024 * 1024 * 1024,
}

/**
 * Options for {@link generateTorrent}.
 *
 * @example
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "@deno-torrent/torrent-generator"
 *
 * const file = await Deno.open("output.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/path/to/content",
 *   writer: file,
 *   trackers: [new URL("udp://tracker.example.com:6969")],
 * })
 * file.close()
 * ```
 */
export type GeneratorOption = {
  /**
   * Destination writer that receives the raw bencoded torrent bytes.
   * Compatible with any {@link Deno.FsFile} or in-memory buffer.
   */
  writer: Writer

  /**
   * Absolute path to the file or directory to include in the torrent.
   * For a single file this produces a *single-file* torrent; for a directory
   * a *multi-file* torrent is produced.
   */
  entry: string

  /**
   * Piece size preset.  Defaults to {@link PieceSizeEnum.SIZE_AUTO}, which
   * selects the smallest preset larger than the total content size (capped at
   * {@link PieceSizeEnum.SIZE_512MB}).
   */
  pieceSizeEnum?: PieceSizeEnum

  /**
   * When `true`, files and directories whose names begin with `.` are
   * excluded from the torrent.  Defaults to `false`.
   */
  ignoreHiddenFile?: boolean

  /**
   * When `true`, inserts BEP-47 padding files between non-empty files so each
   * real file starts on a piece boundary. Padding files are logical torrent
   * entries filled with zero bytes and are not created on disk. Defaults to
   * `false` to preserve the standard continuous multi-file layout.
   */
  alignPiece?: boolean

  /**
   * When `true`, sets the `info.private` flag to `1` in the torrent, which
   * prevents DHT and PEX from being used by compatible clients.
   * Defaults to `false`.
   */
  isPrivate?: boolean

  /**
   * One or more tracker announce URLs.
   * The first (after sorting) becomes the `announce` field; when more than
   * one tracker is given, an `announce-list` field is also written.
   */
  trackers: readonly URL[]

  /**
   * Optional list of HTTP/FTP web-seed URLs (BEP-19 / GetRight style).
   * A single URL is stored as a string; multiple URLs as a string array.
   */
  webSeeds?: readonly URL[]

  /**
   * Optional free-form source string (e.g. the URL of the page where the
   * torrent was first announced).
   */
  source?: string

  /** Optional human-readable comment embedded in the torrent metadata. */
  comment?: string

  /**
   * Name of the program that created the torrent.
   * Defaults to `deno-torrent-generator@<version>`.
   */
  createdBy?: string

  /**
   * Unix timestamp (seconds) for the `creation date` field.
   * Defaults to the current time at the moment `generateTorrent` is called.
   */
  createdAt?: number
}

/**
 * Internal representation of a `.torrent` file's bencoded dictionary.
 *
 * Keys follow the official BitTorrent specification naming conventions
 * (including spaces and hyphens).
 */
export type Torrent = {
  /** Name and version of the program that created the torrent. */
  "created by": string
  /** Unix timestamp (seconds since epoch) of torrent creation. */
  "creation date": number
  /** Primary tracker announce URL (first tracker, sorted). */
  announce?: string
  /**
   * Full tracker list in the multi-tracker extension format (BEP-12).
   * Each inner array is a tier; currently each tier contains exactly one URL.
   */
  "announce-list"?: string[][]
  /**
   * Web-seed URL(s) (BEP-19).
   * A single URL is stored as a plain string; multiple URLs as an array.
   */
  "url-list"?: string | string[]
  /** Core metadata dictionary hashed to produce the info-hash. */
  info: {
    /** Display name – base name of `entry` (file name or directory name). */
    name: string
    /** Size in bytes of each piece (except possibly the last). */
    "piece length": number
    /**
     * Concatenation of SHA-1 digests (20 bytes each) for every piece.
     * Stored as raw bytes in the bencode output.
     */
    pieces?: Uint8Array
    /** *Single-file mode only* – total byte length of the file. */
    length?: number
    /**
     * *Multi-file mode only* – ordered list of files included in the torrent.
     * Each entry contains a path component array and the file's byte length.
     */
    files?: { path: string[]; length: number }[]
    /** Set to `1` to mark the torrent as private (disables DHT/PEX). */
    private?: number
  }
  /** Optional human-readable comment. */
  comment?: string
  /** Optional source identifier. */
  source?: string
}
