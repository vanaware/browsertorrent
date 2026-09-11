/**
 * A sequential multi-file reader that treats multiple files as a single
 * continuous byte stream, reading fixed-size chunks across file boundaries.
 *
 * @module
 */

/**
 * Reads across multiple files sequentially as if they were one contiguous stream.
 * Implements {@link Disposable} for use with `using` declarations (Deno ≥ 1.38).
 *
 * @example
 * ```ts
 * const reader = new MultiFileReader(["/a/file1.bin", "/a/file2.bin"]);
 * try {
 *   let chunk: Uint8Array | null;
 *   while ((chunk = await reader.readChunk(512 * 1024)) !== null) {
 *     // process chunk ...
 *   }
 * } finally {
 *   reader.close();
 * }
 * ```
 */
export class MultiFileReader implements Disposable {
  readonly #files: string[]
  #fileIndex = 0
  #currentFile: Deno.FsFile | null = null

  /**
   * Creates a new MultiFileReader.
   * @param files - Ordered list of absolute file paths to read sequentially.
   */
  constructor(files: string[]) {
    this.#files = [...files]
  }

  /**
   * Reads up to `size` bytes from the combined stream.
   *
   * Transparently crosses file boundaries.  Returns `null` when all files
   * have been exhausted.
   *
   * @param size - Maximum number of bytes to read (must be > 0).
   * @returns A `Uint8Array` with 1–`size` bytes, or `null` at end-of-stream.
   * @throws {RangeError} If `size` is not a positive integer.
   */
  async readChunk(size: number): Promise<Uint8Array | null> {
    if (size <= 0 || !Number.isInteger(size)) {
      throw new RangeError(`size must be a positive integer, got ${size}`)
    }

    const parts: Uint8Array[] = []
    let remaining = size

    while (remaining > 0) {
      // Open the next file if we have no current handle
      if (this.#currentFile === null) {
        if (this.#fileIndex >= this.#files.length) break
        this.#currentFile = await Deno.open(this.#files[this.#fileIndex++])
      }

      const buf = new Uint8Array(remaining)
      const n = await this.#currentFile.read(buf)

      if (n === null) {
        // Current file exhausted – close and move to the next
        this.#currentFile.close()
        this.#currentFile = null
        continue
      }

      parts.push(buf.subarray(0, n))
      remaining -= n
    }

    if (parts.length === 0) return null

    // Fast path: single chunk, no copy needed
    if (parts.length === 1) return parts[0]

    const result = new Uint8Array(size - remaining)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }
    return result
  }

  /** Closes the currently open file handle, if any. */
  close(): void {
    if (this.#currentFile !== null) {
      this.#currentFile.close()
      this.#currentFile = null
    }
  }

  /** Alias for {@link close} – called automatically by `using` declarations. */
  [Symbol.dispose](): void {
    this.close()
  }
}
