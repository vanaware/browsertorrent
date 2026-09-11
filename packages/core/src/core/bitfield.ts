// /loco/monorepo/webtorrent/src/core/bitfield.ts

import { BitfieldError } from "../utils/errors.ts";

export interface BitfieldOptions {
  length: number;
  grow?: boolean | number;
}

export class Bitfield {
  private buffer: Uint8Array;
  private _length: number;
  private grow: boolean | number;

  constructor(length: number | BitfieldOptions, opts?: { grow?: boolean | number }) {
    if (typeof length === "object") {
      this._length = length.length;
      this.grow = length.grow ?? false;
    } else {
      this._length = length;
      this.grow = opts?.grow ?? false;
    }

    const byteLength = Math.ceil(this._length / 8);
    this.buffer = new Uint8Array(byteLength);
  }

  static fromBytes(buffer: Uint8Array, length: number, opts?: { grow?: boolean | number }): Bitfield {
    const requiredBytes = Math.ceil(length / 8);
    if (buffer.length !== requiredBytes) {
      throw new BitfieldError(`Invalid buffer length. Expected ${requiredBytes}, got ${buffer.length}`, "INVALID_BUFFER_LENGTH");
    }

    // Check spare bits in the last byte
    const spareBits = (8 - (length % 8)) % 8;
    if (spareBits > 0) {
      const lastByte = buffer[buffer.length - 1]!;
      const mask = (1 << spareBits) - 1;
      if (lastByte & mask) {
        throw new BitfieldError("Spare bits must be zero", "SPARE_BITS_NON_ZERO");
      }
    }

    const bitfield = new Bitfield(length, opts);
    bitfield.buffer = new Uint8Array(buffer);
    return bitfield;
  }

  get length(): number {
    return this._length;
  }

  get(index: number): boolean {
    if (index < 0) return false;
    if (index >= this._length) {
      if (this.grow === false) return false;
      return false;
    }
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (this.buffer[byteIndex]! & (128 >> bitIndex)) !== 0;
  }

  set(index: number): void {
    if (index < 0) {
      throw new BitfieldError("Cannot set negative index", "NEGATIVE_INDEX");
    }

    if (index >= this._length) {
      if (this.grow === false) {
        throw new BitfieldError(`Index ${index} is out of range (length: ${this._length})`, "INDEX_OUT_OF_RANGE");
      }
      const newLength = typeof this.grow === "number"
        ? Math.max(this._length + this.grow, index + 1)
        : index + 1;
      this._resize(newLength);
    }

    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! |= (128 >> bitIndex);
  }

  unset(index: number): void {
    if (index < 0 || index >= this._length) return;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! &= ~(128 >> bitIndex);
  }

  count(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.get(i)) count++;
    }
    return count;
  }

  toBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  private _resize(newLength: number): void {
    const newByteLength = Math.ceil(newLength / 8);
    const newBuffer = new Uint8Array(newByteLength);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    this._length = newLength;
  }
}