// /loco/monorepo/webtorrent/src/utils/torrent-types.ts
/**
 * Shared type contracts for torrent parsing (BEP 3, BEP 12, BEP 19, BEP 47, BEP 52).
 *
 * Adaptado de deno-torrent/metainfo/types.ts.
 * Browser-first: no Reader/Writer interfaces (those are Deno-only).
 */

import { TorrentParseError } from "./errors.ts";

/** Default maximum encoded torrent size accepted by the parser. */
export const DEFAULT_MAX_METAINFO_SIZE = 16 * 1024 * 1024;

/** Resource limits for torrent parsing. */
export interface ParseTorrentOptions {
  /** Maximum encoded metainfo size in bytes. Defaults to 16 MiB. */
  maxBytes?: number;
  /** Allow BEP-9 v2 info metadata before its outer piece layers are fetched. */
  allowMissingPieceLayers?: boolean;
}

/** Piece-size presets (for future torrent generator). */
export enum PieceSizeEnum {
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
  "pieces root"?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
}

/** Recursive BEP-52 file tree. File properties stored under the empty key. */
export interface TorrentFileTree {
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
  "piece length": number;
  /** Private flag; `1` tells clients not to use DHT or peer exchange. */
  private?: 0 | 1;
};

/** Complete single-file or multi-file BEP-3 `info` dictionary. */
export type TorrentV1Info = TorrentInfoCommon & {
  /** Concatenated 20-byte SHA-1 hashes, one per piece. */
  pieces: Uint8Array;
} & (
  | { length: number; files?: never }
  | { files: TorrentFile[]; length?: never }
);

/** BEP-52 info dictionary. Optional v1 fields make this a hybrid torrent. */
export type TorrentV2Info = TorrentInfoCommon & {
  "meta version": 2;
  "file tree": TorrentFileTree;
  pieces?: Uint8Array;
  length?: number;
  files?: TorrentFile[];
};

/** A validated BEP-3, BEP-52, or hybrid info dictionary. */
export type TorrentInfo = TorrentV1Info | TorrentV2Info;

/**
 * Public representation of a parsed `.torrent` dictionary.
 * Keys follow the official BitTorrent specification naming conventions.
 */
export type Torrent = {
  "created by"?: string;
  "creation date"?: number;
  announce?: string;
  "announce-list"?: string[][];
  "url-list"?: string | string[];
  info: TorrentInfo;
  "piece layers"?: TorrentPieceLayer[];
  comment?: string;
  source?: string;
};

// ── Path validation ─────────────────────────────────────────────────────

/**
 * Returns whether a torrent path component is safe to interpret.
 * Rejects separators, NUL, and traversal components.
 * Adaptado de deno-torrent/metainfo/path.ts.
 */
export function isSafePathComponent(component: unknown): component is string {
  return typeof component === "string" &&
    component.length > 0 &&
    component !== "." &&
    component !== ".." &&
    !component.includes("/") &&
    !component.includes("\\") &&
    !component.includes("\0");
}

/** Compare strings deterministically (locale-independent). */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Validate that a bencode-decoded torrent dict has safe file paths.
 * Throws TorrentParseError on violation.
 */
export function validateTorrentFilePaths(
  files: Record<string, unknown>[],
): void {
  const entries = new Map<string, { length: number; padding: boolean }>();
  const directoryPrefixes = new Set<string>();

  for (const file of files) {
    const path = file["path"] as string[];
    const key = path.join("\0");
    const padding =
      typeof file["attr"] === "string" && file["attr"].includes("p");
    const previous = entries.get(key);
    if (
      previous !== undefined &&
      !(padding && previous.padding && previous.length === file["length"] as number)
    ) {
      throw new TorrentParseError(
        `Duplicate or conflicting file path: ${path.join("/")}`,
      );
    }
    if (directoryPrefixes.has(key)) {
      throw new TorrentParseError(
        `File path conflicts with a directory path: ${path.join("/")}`,
      );
    }
    for (let index = 1; index < path.length; index++) {
      const prefix = path.slice(0, index).join("\0");
      if (entries.has(prefix)) {
        throw new TorrentParseError(
          `File path is nested below another file: ${path.join("/")}`,
        );
      }
      directoryPrefixes.add(prefix);
    }
    entries.set(key, {
      length: file["length"] as number,
      padding,
    });
  }
}
