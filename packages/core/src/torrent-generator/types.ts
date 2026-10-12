// /browsertorrent/monorepo/webtorrent/src/torrent-generator/types.ts
/**
 * @file types.ts
 * @description Types for the OPFS-backed torrent generator.
 * Adapted for browser-native OPFS handles (FileSystemFileHandle, FileSystemDirectoryHandle).
 */

import type {
  BencodeDict,
  BencodeKey,
  BencodeList,
  BencodeMap,
  BencodeValue,
  DecodeOptions,
} from "../utils/bencode.ts";

/**
 * A simple sink interface for writing out the generated bencoded `.torrent` file.
 */
export interface Writer {
  /**
   * Writes the provided chunk of bytes to the underlying sink.
   *
   * @param p - Bytes to write.
   * @returns The number of bytes written.
   */
  write(p: Uint8Array): Promise<number>;
}

/** Standard piece-size presets (BEP 3). `SIZE_AUTO` defers to automatic calculation. */
export enum PieceSizeEnum {
  /** Automatically calculate optimal piece size based on total content length. */
  SIZE_AUTO = 0,
  /** 16 KiB piece size. */
  SIZE_16KB = 16 * 1024,
  /** 32 KiB piece size. */
  SIZE_32KB = 32 * 1024,
  /** 64 KiB piece size. */
  SIZE_64KB = 64 * 1024,
  /** 128 KiB piece size. */
  SIZE_128KB = 128 * 1024,
  /** 256 KiB piece size. */
  SIZE_256KB = 256 * 1024,
  /** 512 KiB piece size. */
  SIZE_512KB = 512 * 1024,
  /** 1 MiB piece size. */
  SIZE_1MB = 1024 * 1024,
  /** 2 MiB piece size. */
  SIZE_2MB = 2 * 1024 * 1024,
  /** 4 MiB piece size. */
  SIZE_4MB = 4 * 1024 * 1024,
  /** 8 MiB piece size. */
  SIZE_8MB = 8 * 1024 * 1024,
  /** 16 MiB piece size. */
  SIZE_16MB = 16 * 1024 * 1024,
}

/** A file inside an OPFS directory, with its logical name and size. */
export interface OPFSFileEntry {
  /** Logical path relative to the entry root (e.g. `"folder/video.mp4"`). */
  name: string;
  /** Total size in bytes. */
  size: number;
  /** OPFS file handle, if known at construction time. */
  handle?: FileSystemFileHandle;
}

/** Input options for `generateTorrent`. */
export interface GeneratorOptions {
  /** Where to write the bencoded `.torrent` bytes. */
  writer: Writer;
  /**
   * OPFS directory handle to scan, **or** a list of file entries.
   *
   * When given a `FileSystemDirectoryHandle`, the generator walks it
   * recursively and computes sizes from `getFile()` handles.
   *
   * When given a list of `OPFSFileEntry`, the caller has already done
   * the walk and we use the supplied sizes.
   */
  entry: FileSystemDirectoryHandle | OPFSFileEntry[];
  /** Piece-size preset or `SIZE_AUTO` (default). */
  pieceSize?: PieceSizeEnum | number;
  /** Skip files whose name starts with `"."` (default `false`). */
  ignoreHiddenFile?: boolean;
  /** BEP-47: align real files on piece boundaries (inserts `.pad/...` entries). */
  alignPiece?: boolean;
  /** Mark torrent as private (`info.private = 1`). */
  isPrivate?: boolean;
  /** Trackers (BEP-12). May be empty. */
  trackers?: readonly string[];
  /** Web seeds (BEP-19). */
  webSeeds?: readonly string[];
  /** Human-readable source string. */
  source?: string;
  /** Free-form comment. */
  comment?: string;
  /** Default `deno-torrent-generator` if omitted. */
  createdBy?: string;
  /** Unix seconds; default `Date.now() / 1000`. */
  createdAt?: number;
}

/** Internal piece-file (real or BEP-47 padding). */
export interface PieceFile {
  /** `null` for padding entries. */
  file: OPFSFileEntry | null;
  /** Bytes this entry contributes to the torrent. */
  length: number;
  /** True for synthetic BEP-47 padding. */
  padding: boolean;
}

/** Logical shape of a generated torrent. */
export interface Torrent {
  /** Software name that created the torrent metainfo. */
  "created by": string;
  /** Unix timestamp in seconds when the torrent was created. */
  "creation date": number;
  /** Primary tracker announce URL. */
  announce?: string;
  /** Tiered announce list for multiple backup trackers (BEP 12). */
  "announce-list"?: string[][];
  /** Web seed URLs for HTTP direct streaming (BEP 19). */
  "url-list"?: string | string[];
  /** Torrent info dictionary containing file layout and SHA-1 piece hashes. */
  info: {
    /** Root name of the torrent or single file. */
    name: string;
    /** Byte length of each piece. */
    "piece length": number;
    /** Concatenated 20-byte SHA-1 hashes of all pieces. */
    pieces?: Uint8Array;
    /** Total byte length for single-file torrents. */
    length?: number;
    /** File manifest for multi-file torrents. */
    files?: Array<{ path: string[]; length: number }>;
    /** Private flag disabling DHT and PEX peer discovery (BEP 27). */
    private?: number;
  };
  /** Free-form comment describing the contents. */
  comment?: string;
  /** Content source identifier. */
  source?: string;
}

/** Bencode re-exports. */
export type {
  BencodeDict,
  BencodeKey,
  BencodeList,
  BencodeMap,
  BencodeValue,
  DecodeOptions,
};
