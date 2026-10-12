// /browsertorrent/monorepo/webtorrent/src/core/bitfield.ts
/**
 * @file bitfield.ts
 * @description Bitfield implementation for tracking piece availability across swarms.
 */

import { BitfieldError, } from "../utils/errors.ts";

/**
 * Configuration options for initializing a {@link Bitfield}.
 */
export interface BitfieldOptions {
  /** Total number of bits in the bitfield. */
  length: number;
  /** Whether the bitfield can dynamically grow, or the increment size. */
  grow?: boolean | number;
}

/**
 * Bitfield data structure used in the BitTorrent protocol to track piece availability.
 * Provides high-speed bitwise manipulation, spare bits validation, and byte buffer serialization.
 *
 * @example
 * ```ts
 * import { Bitfield } from "jsr:@vanaware/browsertorrent";
 *
 * const bitfield = new Bitfield(16);
 * bitfield.set(0);
 * bitfield.set(5);
 * console.log("Has piece 0:", bitfield.get(0)); // true
 * console.log("Total downloaded:", bitfield.count()); // 2
 * ```
 */
export class Bitfield {
  private buffer: Uint8Array;
  private _length: number;
  private grow: boolean | number;

  /**
   * Creates a new Bitfield instance.
   *
   * @param length - Total number of bits or BitfieldOptions configuration.
   * @param opts - Optional grow configuration if length is passed as number.
   */
  constructor(
    length: number | BitfieldOptions,
    opts?: { grow?: boolean | number },
  ) {
    if (typeof length === "object") {
      this._length = length.length;
      this.grow = length.grow ?? false;
    } else {
      this._length = length;
      this.grow = opts?.grow ?? false;
    }

    const byteLength = Math.ceil(this._length / 8,);
    this.buffer = new Uint8Array(byteLength,);
  }

  /**
   * Instantiates a Bitfield from an existing raw byte buffer.
   *
   * @param buffer - Incoming byte array containing packed bits.
   * @param length - Number of active bits expected.
   * @param opts - Grow options.
   * @returns Initialized {@link Bitfield}.
   * @throws {BitfieldError} If buffer length or spare bits are invalid.
   */
  static fromBytes(
    buffer: Uint8Array,
    length: number,
    opts?: { grow?: boolean | number },
  ): Bitfield {
    const requiredBytes = Math.ceil(length / 8,);
    if (buffer.length !== requiredBytes) {
      throw new BitfieldError(
        `Invalid buffer length. Expected ${requiredBytes}, got ${buffer.length}`,
        "INVALID_BUFFER_LENGTH",
      );
    }

    // Check spare bits in the last byte
    const spareBits = (8 - (length % 8)) % 8;
    if (spareBits > 0) {
      const lastByte = buffer[buffer.length - 1]!;
      const mask = (1 << spareBits) - 1;
      if (lastByte & mask) {
        throw new BitfieldError(
          "Spare bits must be zero",
          "SPARE_BITS_NON_ZERO",
        );
      }
    }

    const bitfield = new Bitfield(length, opts,);
    bitfield.buffer = new Uint8Array(buffer,);
    return bitfield;
  }

  /**
   * Total number of bits tracked by this bitfield.
   */
  get length(): number {
    return this._length;
  }

  /**
   * Checks whether the bit at the given index is set (1).
   *
   * @param index - Zero-based bit index.
   * @returns `true` if the bit is 1, `false` otherwise.
   */
  get(index: number,): boolean {
    if (index < 0) return false;
    if (index >= this._length) {
      if (this.grow === false) return false;
      return false;
    }
    const byteIndex = Math.floor(index / 8,);
    const bitIndex = index % 8;
    return (this.buffer[byteIndex]! & (128 >> bitIndex)) !== 0;
  }

  /**
   * Sets the bit at the given index to 1.
   *
   * @param index - Zero-based bit index.
   * @throws {BitfieldError} If index is negative or out of range when grow is disabled.
   */
  set(index: number,): void {
    if (index < 0) {
      throw new BitfieldError("Cannot set negative index", "NEGATIVE_INDEX",);
    }

    if (index >= this._length) {
      if (this.grow === false) {
        throw new BitfieldError(
          `Index ${index} is out of range (length: ${this._length})`,
          "INDEX_OUT_OF_RANGE",
        );
      }
      const newLength = typeof this.grow === "number"
        ? Math.max(this._length + this.grow, index + 1,)
        : index + 1;
      this.#resize(newLength,);
    }

    const byteIndex = Math.floor(index / 8,);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! |= 128 >> bitIndex;
  }

  /**
   * Unsets the bit at the given index (sets to 0).
   *
   * @param index - Zero-based bit index.
   */
  unset(index: number,): void {
    if (index < 0 || index >= this._length) return;
    const byteIndex = Math.floor(index / 8,);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! &= ~(128 >> bitIndex);
  }

  /**
   * Counts the total number of set bits (1s) across the bitfield.
   *
   * @returns Number of set bits.
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.get(i,)) count++;
    }
    return count;
  }

  /**
   * Returns a copy of the underlying packed bitfield byte buffer.
   *
   * @returns Binary {@link Uint8Array} representing the bitfield.
   */
  toBuffer(): Uint8Array {
    return new Uint8Array(this.buffer,);
  }

  #resize(newLength: number,): void {
    const newByteLength = Math.ceil(newLength / 8,);
    const newBuffer = new Uint8Array(newByteLength,);
    newBuffer.set(this.buffer,);
    this.buffer = newBuffer;
    this._length = newLength;
  }
}
