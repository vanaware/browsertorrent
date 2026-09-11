/**
 * SimpleBuffer — a lightweight, synchronous, growable byte buffer backed by
 * native `Uint8Array`. No external dependencies.
 *
 * @example
 * ```ts
 * const buf = new SimpleBuffer();
 * buf.write(new Uint8Array([1, 2, 3, 4]));
 * console.log(buf.readByte());   // 1
 * console.log(buf.readBytes(2)); // Uint8Array [2, 3]
 * ```
 * @module
 */

/** Default upper bound for unread bytes held by a {@link SimpleBuffer}. */
export const DEFAULT_MAX_BUFFER_CAPACITY = 16 * 1024 * 1024;

/** Configuration for {@link SimpleBuffer}. */
export interface SimpleBufferOptions {
  /** Maximum number of unread bytes that may be buffered. */
  maxCapacity?: number;
}

/**
 * A lightweight, synchronous, growable byte buffer.
 *
 * Bytes are appended with {@link SimpleBuffer.write} and consumed from the
 * front with {@link SimpleBuffer.readByte} / {@link SimpleBuffer.readBytes}.
 */
export class SimpleBuffer {
  /** Internal storage; live data lives in `[#readPos, #writePos)`. */
  #buf: Uint8Array = new Uint8Array(64);
  #readPos = 0;
  #writePos = 0;
  readonly #maxCapacity: number;

  /**
   * @param options - Buffer capacity configuration.
   * @throws {RangeError} If `maxCapacity` is not a positive safe integer.
   */
  constructor(options: SimpleBufferOptions = {}) {
    const maxCapacity = options.maxCapacity ?? DEFAULT_MAX_BUFFER_CAPACITY;
    if (!Number.isSafeInteger(maxCapacity) || maxCapacity <= 0) {
      throw new RangeError('maxCapacity must be a positive safe integer');
    }
    this.#maxCapacity = maxCapacity;
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Appends `data` to the end of the buffer.
   *
   * @param data - Bytes to append.
   */
  write(data: Uint8Array): void {
    this.#grow(data.length);
    this.#buf.set(data, this.#writePos);
    this.#writePos += data.length;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Reads and consumes exactly `len` bytes from the front of the buffer.
   *
   * @param len - Number of bytes to consume.
   * @returns A new `Uint8Array` containing the bytes.
   * @throws {RangeError} When `len` is negative or greater than {@link length}.
   */
  readBytes(len: number): Uint8Array {
    if (!Number.isSafeInteger(len) || len < 0) {
      throw new RangeError(`len must be a non-negative safe integer, got ${len}`);
    }
    if (len === 0) return new Uint8Array(0);
    if (len > this.length) {
      throw new RangeError(
        `Cannot read ${len} bytes — buffer only has ${this.length}`,
      );
    }
    const result = this.#buf.slice(this.#readPos, this.#readPos + len);
    this.#readPos += len;
    return result;
  }

  /**
   * Reads and consumes a single byte from the front of the buffer.
   *
   * @returns Byte value in the range [0, 255].
   * @throws {RangeError} When the buffer is empty.
   */
  readByte(): number {
    if (this.length === 0) throw new RangeError('Cannot read from an empty buffer');
    // readBytes(1) always returns a 1-element Uint8Array when length > 0
    return this.readBytes(1)[0]!;
  }

  // ---------------------------------------------------------------------------
  // Inspection
  // ---------------------------------------------------------------------------

  /**
   * Number of unread bytes currently held in the buffer.
   */
  get length(): number {
    return this.#writePos - this.#readPos;
  }

  /**
   * `true` when at least one unread byte is available.
   */
  hasNext(): boolean {
    return this.length > 0;
  }

  /**
   * Resets the buffer to an empty state, discarding all data.
   */
  reset(): void {
    this.#readPos = 0;
    this.#writePos = 0;
    this.#buf = new Uint8Array(64);
  }

  // ---------------------------------------------------------------------------
  // Compact & Grow (public)
  // ---------------------------------------------------------------------------

  /**
   * Compacts the internal storage by shifting live data to the front,
   * freeing space at the tail without reallocating.
   *
   * This is a no-op when `readPos` is already 0.
   */
  compact(): void {
    if (this.#readPos === 0) return;
    this.#buf.copyWithin(0, this.#readPos, this.#writePos);
    this.#writePos -= this.#readPos;
    this.#readPos = 0;
  }

  /**
   * Ensures space for `extra` more bytes, compacting or expanding as needed.
   *
   * @param extra - Number of additional bytes to accommodate.
   * @throws {RangeError} When the required capacity exceeds {@link maxCapacity}.
   */
  grow(extra: number): void {
    this.#grow(extra);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Ensures space for `extra` more bytes, compacting or expanding as needed. */
  #grow(extra: number): void {
    if (this.length + extra > this.#maxCapacity) {
      throw new RangeError(`buffer capacity must not exceed maxCapacity (${this.#maxCapacity})`);
    }

    const free = this.#buf.length - this.#writePos;
    if (free >= extra) return;

    // Compact first — shift live bytes to the front.
    if (this.#readPos > 0) {
      this.#buf.copyWithin(0, this.#readPos, this.#writePos);
      this.#writePos -= this.#readPos;
      this.#readPos = 0;
      if (this.#buf.length - this.#writePos >= extra) return;
    }

    // Still not enough — allocate a larger buffer.
    const needed = this.#writePos + extra;
    let newSize = Math.max(this.#buf.length * 2, 64);
    while (newSize < needed) newSize *= 2;

    const next = new Uint8Array(newSize);
    next.set(this.#buf.subarray(0, this.#writePos));
    this.#buf = next;
  }
}
