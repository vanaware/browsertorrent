// /loco/monorepo/webtorrent/src/torrent-generator/types.ts
/**
 * Types for the OPFS-backed torrent generator.
 *
 * Adapted from `deno-torrent/torrent-generator/types.ts`, replacing
 * the Deno filesystem surface (`Deno.FsFile`, path strings) with
 * browser-native OPFS handles (`FileSystemFileHandle`,
 * `FileSystemDirectoryHandle`).
 */

import type { BencodeValue } from "../utils/bencode.ts";

/** A simple sink for the bencoded `.torrent` file. */
export interface Writer {
  write(p: Uint8Array): Promise<number>;
}

/** Standard piece-size presets (BEP-3).  `SIZE_AUTO` defers to `calcPieceSize`. */
export enum PieceSizeEnum {
  SIZE_AUTO = 0,
  SIZE_16KB = 16 * 1024,
  SIZE_32KB = 32 * 1024,
  SIZE_64KB = 64 * 1024,
  SIZE_128KB = 128 * 1024,
  SIZE_256KB = 256 * 1024,
  SIZE_512KB = 512 * 1024,
  SIZE_1MB = 1024 * 1024,
  SIZE_2MB = 2 * 1024 * 1024,
  SIZE_4MB = 4 * 1024 * 1024,
  SIZE_8MB = 8 * 1024 * 1024,
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
  "created by": string;
  "creation date": number;
  announce?: string;
  "announce-list"?: string[][];
  "url-list"?: string | string[];
  info: {
    name: string;
    "piece length": number;
    pieces?: Uint8Array;
    length?: number;
    files?: Array<{ path: string[]; length: number }>;
    private?: number;
  };
  comment?: string;
  source?: string;
}

/** Bencode re-export. */
export type { BencodeValue };
