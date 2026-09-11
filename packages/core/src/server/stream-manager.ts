// /loco/monorepo/webtorrent/src/server/stream-manager.ts

import type { File } from "../core/file.ts";

/**
 * Internal record stored in the {@link StreamManager} for each registered file.
 *
 * One entry exists per `(infoHash, fileIndex)` pair.  The file instance
 * itself is responsible for materializing bytes from the underlying
 * `ChunkStore`; the manager just keeps the references together so the
 * service-worker bridge can look them up by URL.
 */
export interface StreamEntry {
  infoHash: string;
  fileIndex: number;
  file: File;
}

/**
 * Central registry that maps `(infoHash, fileIndex)` pairs to the live
 * {@link File} instances produced by the {@link Torrent} pipeline.
 *
 * The service-worker bridge (see {@link createServer}) receives a
 * `webtorrent-request` message with `infoHash` + `fileIndex` (encoded in
 * the URL path) and uses this manager to look up the corresponding file.
 * Without the registry the SW would have no way to know which
 * `ChunkStore` to read from, since the SW runs in a separate context.
 *
 * The manager is a plain in-memory `Map`; it is intentionally simple and
 * single-instance.  All {@link WebTorrent} clients in the same realm share
 * the same singleton — this matches the way `webtorrent.min.js` exposes
 * a global `createServer` that takes any `WebTorrent` and wires it up to
 * the same SW controller.
 */
export class StreamManager {
  private readonly entries: Map<string, StreamEntry> = new Map();

  /**
   * Registers (or replaces) the file entry for a `(infoHash, fileIndex)`.
   *
   * The same `File` object is also bound back to the entry through
   * `infoHash`/`fileIndex` so {@link File.streamURL} can produce a URL
   * that resolves back to the same record.
   *
   * @param infoHash - 40-char hex info hash identifying the torrent.
   * @param fileIndex - Zero-based file index inside the torrent.
   * @param file - The {@link File} instance to serve.
   */
  register(infoHash: string, fileIndex: number, file: File): void {
    const key = this._key(infoHash, fileIndex);
    this.entries.set(key, { infoHash, fileIndex, file });
  }

  /**
   * Removes a single file entry.  Safe to call when the entry does not
   * exist.
   */
  unregister(infoHash: string, fileIndex: number): void {
    this.entries.delete(this._key(infoHash, fileIndex));
  }

  /**
   * Removes every file entry that belongs to the given torrent.  Used
   * when a torrent is removed from the client so the SW cannot keep
   * streaming after the underlying data is gone.
   */
  unregisterTorrent(infoHash: string): void {
    const prefix = `${infoHash}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /**
   * Returns the file entry for a `(infoHash, fileIndex)` or `undefined`
   * if no such file is registered.
   */
  get(infoHash: string, fileIndex: number): StreamEntry | undefined {
    return this.entries.get(this._key(infoHash, fileIndex));
  }

  /**
   * Lists every currently registered file entry.  Used by tests and
   * diagnostics — not by the hot path of the streaming protocol.
   */
  list(): StreamEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Returns the total number of registered file entries.  Useful for
   * shutdown checks and for tests asserting cleanup behaviour.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Removes every entry.  Called by the test suite and (in the future)
   * by a full client destruction path that wants to wipe state without
   * touching each torrent individually.
   */
  clear(): void {
    this.entries.clear();
  }

  private _key(infoHash: string, fileIndex: number): string {
    return `${infoHash}:${fileIndex}`;
  }
}

/**
 * Process-wide singleton used by both {@link createServer} and the
 * public `WebTorrent` API.  Importing modules that need to look up
 * `File` instances from the SW bridge get a stable reference.
 */
export const streamManager: StreamManager = new StreamManager();

/**
 * Builds the virtual URL served by the Service Worker for a given file.
 *
 * Format: `<scope>webtorrent/<infoHash>/<fileIndex>/<encodedName>`.
 *
 * The `infoHash` and `fileIndex` are the only fields the SW needs to
 * look up the underlying file; the file name is appended for nicer
 * browser caching/UI behaviour (e.g. video elements show the file name
 * when hovered).
 *
 * @param scope - SW registration scope (usually ends with `/`).
 * @param infoHash - 40-char hex info hash.
 * @param fileIndex - Zero-based file index.
 * @param name - Original file name (URL-encoded).
 */
export function buildStreamURL(
  scope: string,
  infoHash: string,
  fileIndex: number,
  name: string,
): string {
  const safeName = encodeURIComponent(name);
  return `${scope}webtorrent/${infoHash}/${fileIndex}/${safeName}`;
}

/**
 * Parses a virtual stream URL back into its components.  Returns `null`
 * if the URL does not match the expected `/webtorrent/<infoHash>/<idx>/<name>`
 * shape.  The `infoHash` is validated to be 40 hex characters and
 * `fileIndex` must be a non-negative safe integer.
 */
export interface ParsedStreamURL {
  infoHash: string;
  fileIndex: number;
  name: string;
}

export function parseStreamURL(url: string, scope: string): ParsedStreamURL | null {
  const prefix = `${scope}webtorrent/`;
  if (!url.startsWith(prefix)) return null;

  const rest = url.slice(prefix.length);
  const parts = rest.split("/");
  if (parts.length < 3) return null;

  const infoHash = parts[0]!;
  const fileIndex = Number.parseInt(parts[1]!, 10);
  const name = decodeURIComponent(parts.slice(2).join("/"));

  if (!/^[0-9a-fA-F]{40}$/.test(infoHash)) return null;
  if (!Number.isSafeInteger(fileIndex) || fileIndex < 0) return null;

  return { infoHash: infoHash.toLowerCase(), fileIndex, name };
}
