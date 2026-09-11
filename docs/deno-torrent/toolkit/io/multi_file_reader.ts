/**
 * MultiFileReader — reads multiple files as a single contiguous byte stream.
 *
 * @example
 * ```ts
 * const reader = new MultiFileReader(['a.bin', 'b.bin', 'c.bin']);
 * let chunk: Uint8Array | null;
 * while ((chunk = await reader.readChunk(512)) !== null) {
 *   // process chunk…
 * }
 * reader.close();
 * ```
 * @module
 */

import { SimpleBuffer } from './simple_buffer.ts';

/** Default upper bound for a single {@link MultiFileReader.readChunk} call. */
export const DEFAULT_MAX_CHUNK_SIZE = 16 * 1024 * 1024;

/** Default chunk size yielded by {@link MultiFileReader}'s async iterator. */
export const DEFAULT_ITERATOR_CHUNK_SIZE = 64 * 1024;

/** Configuration for {@link MultiFileReader}. */
export interface MultiFileReaderOptions {
  /** Maximum number of bytes accepted by one {@link MultiFileReader.readChunk} call. */
  maxChunkSize?: number;
  /** Cancels pending and future reads when aborted. */
  signal?: AbortSignal;
}

/**
 * Presents an ordered list of files as a single readable byte stream.
 *
 * File handles are opened lazily and closed as soon as their EOF is reached,
 * so only one handle is open at a time.
 *
 * ### Read primitives
 * | Method | Description |
 * |---|---|
 * | {@link MultiFileReader.read} | Low-level; fills a caller-supplied buffer, may cross to the next file transparently. |
 * | {@link MultiFileReader.readChunk} | High-level; returns exactly `length` bytes, crossing file boundaries as needed. |
 */
export class MultiFileReader implements AsyncIterable<Uint8Array>, Disposable {
  readonly #files: string[];
  #fileIndex = 0;
  #currentFile: Deno.FsFile | null = null;
  #eof = false;
  readonly #maxChunkSize: number;
  readonly #signal: AbortSignal | undefined;
  /** Accumulator used by readChunk across multiple read() calls. */
  readonly #accumulator: SimpleBuffer;

  /**
   * @param files - Ordered list of file paths to read through.
   * @throws {RangeError} If `files` is empty.
   */
  constructor(files: string[], options: MultiFileReaderOptions = {}) {
    if (files.length === 0) throw new RangeError('files must not be empty');
    const maxChunkSize = options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
    if (!Number.isSafeInteger(maxChunkSize) || maxChunkSize <= 0) {
      throw new RangeError('maxChunkSize must be a positive safe integer');
    }
    this.#files = [...files];
    this.#maxChunkSize = maxChunkSize;
    this.#signal = options.signal;
    this.#accumulator = new SimpleBuffer({ maxCapacity: maxChunkSize });
  }

  /** Closes the active file and throws if the configured signal was aborted. */
  #throwIfAborted(): void {
    if (this.#signal?.aborted) {
      this.close();
      throw new DOMException('MultiFileReader operation was aborted', 'AbortError');
    }
  }

  // ---------------------------------------------------------------------------
  // Low-level read
  // ---------------------------------------------------------------------------

  /**
   * Reads bytes into `p`, advancing through files transparently at each EOF.
   *
   * Follows the `Deno.Reader` contract: returns the number of bytes placed
   * into `p`, or `null` when every file has been fully consumed.
   *
   * @param p - Destination buffer.
   * @returns Number of bytes written into `p`, or `null` at end-of-stream.
   */
  async read(p: Uint8Array): Promise<number | null> {
    this.#throwIfAborted();
    if (p.length === 0) return 0;

    while (!this.#eof) {
      // Open current file lazily.
      if (this.#currentFile === null) {
        this.#currentFile = await Deno.open(this.#files[this.#fileIndex], { read: true });
        this.#throwIfAborted();
      }

      const n = await this.#currentFile.read(p);
      this.#throwIfAborted();

      if (n === null) {
        // Current file exhausted — close it and advance to the next.
        this.#currentFile.close();
        this.#currentFile = null;
        this.#fileIndex++;

        if (this.#fileIndex >= this.#files.length) {
          this.#eof = true;
          return null;
        }

        continue;
      }

      return n;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // High-level chunk read
  // ---------------------------------------------------------------------------

  /**
   * Collects exactly `length` bytes, spanning file boundaries as needed.
   *
   * If the remaining bytes across all files sum to less than `length`, the
   * partial data already accumulated is returned. Returns `null` only when the
   * entire stream was already exhausted before this call.
   *
   * @param length - Desired chunk size in bytes (must be a positive integer).
   * @returns A `Uint8Array` of at most `length` bytes, or `null` at EOS.
   * @throws {RangeError} If `length` is invalid or exceeds `maxChunkSize`.
   */
  async readChunk(length: number): Promise<Uint8Array | null> {
    this.#throwIfAborted();
    if (!Number.isSafeInteger(length) || length <= 0) {
      throw new RangeError(`length must be a positive safe integer, got ${length}`);
    }
    if (length > this.#maxChunkSize) {
      throw new RangeError(`length must not exceed maxChunkSize (${this.#maxChunkSize})`);
    }

    if (this.#eof && !this.#accumulator.hasNext()) return null;

    const tmp = new Uint8Array(length);

    while (this.#accumulator.length < length) {
      // Limit each read to the outstanding bytes. A file boundary may otherwise
      // cause read() to return a full temporary buffer after a partial chunk was
      // already accumulated, exceeding the bounded accumulator capacity.
      const remaining = length - this.#accumulator.length;
      const n = await this.read(tmp.subarray(0, remaining));

      if (n === null) {
        // Stream ended — return whatever accumulated bytes remain.
        return this.#accumulator.hasNext()
          ? this.#accumulator.readBytes(this.#accumulator.length)
          : null;
      }

      this.#accumulator.write(tmp.subarray(0, n));
    }

    return this.#accumulator.readBytes(length);
  }

  /**
   * Yields chunks from the current reader position until end-of-stream.
   * Breaking early closes the currently open file handle.
   * This is the bounded-memory API for logical pieces larger than
   * {@link DEFAULT_MAX_CHUNK_SIZE}; hash each yielded chunk incrementally
   * instead of calling `readChunk()` with a whole piece length.
   *
   * @param chunkSize - Maximum bytes in each yielded chunk.
   * @throws {RangeError} If `chunkSize` is invalid or exceeds `maxChunkSize`.
   *
   * @example
   * ```ts
   * const hasher = HashUtil.createSha1();
   * for await (const chunk of reader.chunks(64 * 1024)) hasher.update(chunk);
   * const pieceHash = hasher.digest();
   * ```
   */
  async *chunks(
    chunkSize: number = Math.min(DEFAULT_ITERATOR_CHUNK_SIZE, this.#maxChunkSize),
  ): AsyncGenerator<Uint8Array> {
    try {
      let chunk: Uint8Array | null;
      while ((chunk = await this.readChunk(chunkSize)) !== null) {
        yield chunk;
      }
    } finally {
      this.close();
    }
  }

  /** Iterates over chunks of up to {@link DEFAULT_ITERATOR_CHUNK_SIZE} bytes. */
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return this.chunks();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Closes any currently open file handle.
   *
   * Should be called when you stop reading before the stream is naturally
   * exhausted, to avoid leaking OS file descriptors.
   */
  close(): void {
    if (this.#currentFile !== null) {
      try {
        this.#currentFile.close();
      } catch {
        // Already closed — ignore.
      }
      this.#currentFile = null;
    }
  }

  /** Equivalent to {@link close}; enables `using reader = ...` where supported. */
  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Resets the reader back to the beginning of the first file.
   *
   * The currently open file handle (if any) is closed and the internal
   * accumulator is cleared.
   */
  reset(): void {
    this.close();
    this.#fileIndex = 0;
    this.#eof = false;
    this.#accumulator.reset();
  }
}
