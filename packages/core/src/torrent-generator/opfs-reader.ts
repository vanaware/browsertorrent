// /loco/monorepo/webtorrent/src/torrent-generator/opfs-reader.ts
/**
 * Sequential multi-file reader for OPFS file handles.
 *
 * Replaces the Deno `MultiFileReader` from
 * `deno-torrent/torrent-generator/reader.ts`.  Reads across multiple
 * `FileSystemFileHandle` instances as if they were a single contiguous
 * byte stream, transparently crossing file boundaries.
 *
 * Browser-native primitives used:
 * - `FileSystemFileHandle.getFile()` → `File` object
 * - `File.slice(start, end)` → `Blob` slice
 * - `Blob.arrayBuffer()` → `ArrayBuffer`
 *
 * No `Deno.open`, no `Deno.FsFile`, no path strings.
 */

import type { OPFSFileEntry } from "./types.ts";

/**
 * Reads across multiple OPFS files sequentially as a single byte stream.
 *
 * @example
 * ```ts
 * const reader = new OPFSMultiFileReader(entries);
 * try {
 *   for await (const chunk of reader.chunks(64 * 1024)) {
 *     // process chunk ...
 *   }
 * } finally {
 *   reader.close();
 * }
 * ```
 */
export class OPFSMultiFileReader {
  readonly #entries: OPFSFileEntry[];
  #fileIndex = 0;
  #fileOffset = 0;
  #currentFile: File | null = null;
  #currentSize = 0;
  #closed = false;

  /**
   * @param entries - Ordered list of OPFS file entries to read sequentially.
   *   Each entry must have either a `handle` set, or a `size` matching a
   *   pre-fetched `File` (see {@link withFile}).
   */
  constructor(entries: OPFSFileEntry[]) {
    this.#entries = [...entries];
  }

  /**
   * Attaches a pre-fetched `File` for the entry at `index`.  Useful when
   * the caller already obtained the `File` from the file handle and wants
   * to avoid re-fetching.
   *
   * @param index - Index into the entries list.
   * @param file - The `File` object for that entry.
   */
  withFile(index: number, file: File): void {
    if (index < 0 || index >= this.#entries.length) {
      throw new RangeError(`index out of range: ${index}`);
    }
    if (index === this.#fileIndex) {
      this.#currentFile = file;
      this.#currentSize = file.size;
    }
  }

  /**
   * Reads up to `size` bytes from the combined stream.
   *
   * @param size - Maximum number of bytes to read (must be > 0).
   * @returns `Uint8Array` with 1–`size` bytes, or `null` at end-of-stream.
   * @throws {RangeError} If `size` is not a positive integer.
   */
  async readChunk(size: number): Promise<Uint8Array | null> {
    if (size <= 0 || !Number.isInteger(size)) {
      throw new RangeError(`size must be a positive integer, got ${size}`);
    }

    if (this.#closed) throw new Error("reader is closed");

    const parts: Uint8Array[] = [];
    let remaining = size;

    while (remaining > 0) {
      // Open the next file if we have no current handle
      if (this.#currentFile === null) {
        if (this.#fileIndex >= this.#entries.length) break;
        const entry = this.#entries[this.#fileIndex++]!;
        if (!entry.handle) {
          throw new Error(`entry ${entry.name} has no OPFS handle attached`);
        }
        this.#currentFile = await entry.handle.getFile();
        this.#currentSize = this.#currentFile.size;
        this.#fileOffset = 0;
      }

      const available = this.#currentSize - this.#fileOffset;
      if (available === 0) {
        this.#currentFile = null;
        continue;
      }

      const want = Math.min(remaining, available);
      const blob = this.#currentFile.slice(this.#fileOffset, this.#fileOffset + want);
      const buf = new Uint8Array(await blob.arrayBuffer());
      this.#fileOffset += buf.length;

      if (buf.length === 0) {
        this.#currentFile = null;
        continue;
      }

      parts.push(buf);
      remaining -= buf.length;
    }

    if (parts.length === 0) return null;

    const first = parts[0]!;
    if (parts.length === 1) return first;

    const result = new Uint8Array(size - remaining);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  /**
   * Async-iterable interface — yields chunks of at most `size` bytes.
   *
   * @param size - Maximum chunk size in bytes (default 64 KiB).
   */
  async *chunks(size = 64 * 1024): AsyncIterableIterator<Uint8Array> {
    while (true) {
      const chunk = await this.readChunk(size);
      if (chunk === null) return;
      yield chunk;
    }
  }

  /** Releases any held handles.  Idempotent. */
  close(): void {
    this.#currentFile = null;
    this.#closed = true;
  }

  /** Whether {@link close} has been called. */
  get closed(): boolean {
    return this.#closed;
  }
}
