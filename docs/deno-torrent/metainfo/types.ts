/**
 * Shared public contracts for torrent parsing and generation.
 * @module
 */

/** Minimal asynchronous byte source implemented by `Deno.FsFile`. */
export interface Reader {
  /** Fill `buffer`, returning the byte count or `null` at end-of-stream. */
  read(buffer: Uint8Array): Promise<number | null>;
}

/** Default maximum encoded torrent size accepted by {@link parseTorrent}. */
export const DEFAULT_MAX_METAINFO_SIZE = 16 * 1024 * 1024;

/** Resource limits accepted by {@link parseTorrent}. */
export interface ParseTorrentOptions {
  /** Maximum encoded metainfo size in bytes. Defaults to 16 MiB. */
  maxBytes?: number;
  /** Allow BEP-9 v2 info metadata before its outer piece layers are fetched. */
  allowMissingPieceLayers?: boolean;
}

/**
 * A minimal write interface compatible with {@link Deno.FsFile} and any
 * destination that accepts raw byte chunks.
 *
 * Use `Deno.openSync` / `Deno.open` to obtain a compatible writer backed by
 * a real file, or create an in-memory buffer for testing.
 */
export interface Writer {
  /** Write up to `p.length` bytes and return the number accepted. */
  write(p: Uint8Array): Promise<number>;
}

/**
 * Piece-size presets for torrent generation.
 *
 * The values represent the actual byte size of each piece.
 * `SIZE_AUTO` instructs the generator to select an appropriate size
 * automatically based on the total size of the input files.
 *
 * Presets range from 16 MiB to 16 GiB. Piece hashing is incremental, so the
 * selected logical piece length does not determine memory-buffer size.
 *
 * @example
 * ```ts
 * import { PieceSizeEnum } from 'jsr:@deno-torrent/metainfo@1'
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
 * import { generateTorrent, PieceSizeEnum } from 'jsr:@deno-torrent/metainfo@1'
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
  writer: Writer;

  /**
   * Absolute path to the file or directory to include in the torrent.
   * For a single file this produces a *single-file* torrent; for a directory
   * a *multi-file* torrent is produced.
   */
  entry: string;

  /**
   * Piece size preset.  Defaults to {@link PieceSizeEnum.SIZE_AUTO}, which
   * selects the smallest preset larger than the total content size (capped at
   * {@link PieceSizeEnum.SIZE_512MB}).
   */
  pieceSizeEnum?: PieceSizeEnum;

  /**
   * When `true`, files and directories whose names begin with `.` are
   * excluded from the torrent.  Defaults to `false`.
   */
  ignoreHiddenFile?: boolean;

  /**
   * When `true`, inserts BEP-47 padding files between non-empty files so each
   * real file starts on a piece boundary. Padding files are logical torrent
   * entries filled with zero bytes and are not created on disk. Defaults to
   * `false` to preserve the standard continuous multi-file layout.
   */
  alignPiece?: boolean;

  /**
   * When `true`, sets the `info.private` flag to `1` in the torrent, which
   * prevents DHT and PEX from being used by compatible clients.
   * Defaults to `false`.
   */
  isPrivate?: boolean;

  /**
   * One or more tracker announce URLs.
   * The first (after sorting) becomes the `announce` field; when more than
   * one tracker is given, an `announce-list` field is also written.
   */
  trackers: readonly URL[];

  /**
   * Optional list of HTTP/FTP web-seed URLs (BEP-19 / GetRight style).
   * A single URL is stored as a string; multiple URLs as a string array.
   */
  webSeeds?: readonly URL[];

  /**
   * Optional free-form source string (e.g. the URL of the page where the
   * torrent was first announced).
   */
  source?: string;

  /** Optional human-readable comment embedded in the torrent metadata. */
  comment?: string;

  /**
   * Name of the program that created the torrent.
   * Defaults to `deno-torrent-metainfo@<version>`.
   */
  createdBy?: string;

  /**
   * Unix timestamp (seconds) for the `creation date` field.
   * Defaults to the current time at the moment `generateTorrent` is called.
   */
  createdAt?: number;
};

/** A file entry inside the `info.files` list of a multi-file torrent. */
export interface TorrentFile {
  /** File size in bytes. */
  length: number;
  /** Path components relative to the torrent's top-level directory. */
  path: string[];
  /** BEP-47 file attributes; padding entries contain `p`. */
  attr?: string;
}

/** One file terminal in a BEP-52 file tree. */
export interface TorrentV2File {
  /** File size in bytes. */
  length: number;
  /** SHA-256 Merkle root for non-empty file content. */
  'pieces root'?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
}

/** Recursive BEP-52 file tree. File properties are stored under the empty key. */
export interface TorrentFileTree {
  /** A safe path component, or the empty terminal key containing file properties. */
  [component: string]: TorrentFileTree | TorrentV2File;
}

/** One BEP-52 piece layer, keyed by its file's Merkle root. */
export interface TorrentPieceLayer {
  /** The 32-byte Merkle root identifying the file. */
  piecesRoot: Uint8Array;
  /** Concatenated 32-byte SHA-256 hashes at the torrent piece layer. */
  hashes: Uint8Array;
}

/** Fields shared by BEP-3 and BEP-52 info dictionaries. */
export type TorrentInfoCommon = {
  /** Suggested file name or top-level directory name. */
  name: string;
  /** Nominal piece size in bytes. */
  'piece length': number;
  /** Private flag; `1` tells clients not to use DHT or peer exchange. */
  private?: 0 | 1;
};

/** Complete single-file or multi-file BEP-3 `info` dictionary. */
export type TorrentV1Info =
  & TorrentInfoCommon
  & {
    /** Concatenated 20-byte SHA-1 hashes, one per piece. */
    pieces: Uint8Array;
    'meta version'?: never;
    'file tree'?: never;
  }
  & (
    | { length: number; files?: never }
    | { files: TorrentFile[]; length?: never }
  );

/** BEP-52 info dictionary. Optional v1 fields make this a hybrid torrent. */
export type TorrentV2Info = TorrentInfoCommon & {
  'meta version': 2;
  'file tree': TorrentFileTree;
  pieces?: Uint8Array;
  length?: number;
  files?: TorrentFile[];
};

/** A validated BEP-3, BEP-52, or hybrid info dictionary. */
export type TorrentInfo = TorrentV1Info | TorrentV2Info;

/**
 * Public representation of a parsed or generated `.torrent` dictionary.
 *
 * Keys follow the official BitTorrent specification naming conventions
 * (including spaces and hyphens).
 */
export type Torrent = {
  /** Name and version of the creating program, when recorded. */
  'created by'?: string;
  /** Unix timestamp (seconds since epoch), when recorded. */
  'creation date'?: number;
  /** Primary tracker announce URL (first tracker, sorted). */
  announce?: string;
  /**
   * Full tracker list in the multi-tracker extension format (BEP-12).
   * Each inner array is a tier; currently each tier contains exactly one URL.
   */
  'announce-list'?: string[][];
  /**
   * Web-seed URL(s) (BEP-19).
   * A single URL is stored as a plain string; multiple URLs as an array.
   */
  'url-list'?: string | string[];
  /** Core metadata dictionary hashed to produce the info-hash. */
  info: TorrentInfo;
  /** BEP-52 hashes at the logical piece layer. */
  'piece layers'?: TorrentPieceLayer[];
  /** Optional human-readable comment. */
  comment?: string;
  /** Optional source identifier. */
  source?: string;
};
