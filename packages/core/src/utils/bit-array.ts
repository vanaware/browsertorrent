// /loco/monorepo/webtorrent/src/utils/bit-array.ts
/**
 * Compact bit array with explicit bit numbering (msb0 / lsb0).
 *
 * Adaptado de deno-torrent/toolkit/bytes/bit_array.ts.
 * Dependência BytesUtil.bytes2HexStr inlinada (toHex).
 *
 * BitArray é genérico (não é BitTorrent-specific). Para o Bitfield do
 * BitTorrent (que usa msb0 e tem grow/spare-bit validation), veja
 * src/core/bitfield.ts.
 */

/** Bit numbering within each byte, while bytes remain in array order. */
export type BitOrder = "lsb0" | "msb0";

export class BitArray {
  #data: Uint8Array;

  private constructor(data: Uint8Array) {
    this.#data = data;
  }

  // ========================================================================
  // Factory methods
  // ========================================================================

  static fromBinaryString(data: string): BitArray {
    if (!BitArray.isBinaryString(data)) {
      throw new TypeError("data must be a non-empty binary string");
    }
    const bytesLength = Math.ceil(data.length / 8);
    const number = BigInt(`0b${data}`);
    const bytes = new Uint8Array(bytesLength);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number((number >> BigInt(8 * (bytes.length - 1 - i))) & BigInt(0xff));
    }
    return new BitArray(bytes);
  }

  /**
   * Creates a BitArray from a byte array (copies the input).
   */
  static fromUint8Array(data: Uint8Array): BitArray {
    return new BitArray(data.slice());
  }

  static fromInt(data: number, length = 0): BitArray {
    if (!Number.isSafeInteger(data) || data < 0) {
      throw new RangeError("data must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError("length must be a non-negative safe integer");
    }
    const binaryString = data.toString(2);
    const safeLength = Math.max(binaryString.length, length);
    return BitArray.fromBinaryString(data.toString(2).padStart(safeLength, "0"));
  }

  static fromBigInt(data: bigint, length = 0): BitArray {
    if (data < 0n) {
      throw new RangeError("data must be non-negative");
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError("length must be a non-negative safe integer");
    }
    const binaryString = data.toString(2);
    const safeLength = Math.max(binaryString.length, length);
    return BitArray.fromBinaryString(data.toString(2).padStart(safeLength, "0"));
  }

  static isBinaryString(data: string): boolean {
    if (data.length === 0) return false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== "0" && data[i] !== "1") return false;
    }
    return true;
  }

  // ========================================================================
  // Properties
  // ========================================================================

  get length(): number {
    return this.#data.length * 8;
  }

  /** Copy of the underlying bytes. Mutating the returned array is safe. */
  get bytes(): Uint8Array {
    return this.#data.slice();
  }

  // ========================================================================
  // getBit / setBit (explicit BitOrder)
  // ========================================================================

  getBit(index: number, order: BitOrder = "lsb0"): boolean {
    this.#assertBitIndex(index);
    const byteIndex = Math.floor(index / 8);
    const mask = order === "msb0" ? 0x80 >> (index % 8) : 1 << (index % 8);
    return (this.#data[byteIndex]! & mask) !== 0;
  }

  setBit(index: number, value: boolean, order: BitOrder = "lsb0"): void {
    this.#assertBitIndex(index);
    const byteIndex = Math.floor(index / 8);
    const mask = order === "msb0" ? 0x80 >> (index % 8) : 1 << (index % 8);
    if (value) {
      this.#data[byteIndex]! |= mask;
    } else {
      this.#data[byteIndex]! &= ~mask;
    }
  }

  // ========================================================================
  // get / set (legacy zeroIndex API — maps to BitOrder)
  // ========================================================================

  get(index: number, zeroIndex: "lowest" | "highest" = "lowest"): boolean {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }
    const order: BitOrder = zeroIndex === "lowest" ? "lsb0" : "msb0";
    return this.getBit(index, order);
  }

  set(index: number, value: boolean, zeroIndex: "lowest" | "highest" = "lowest"): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }
    const order: BitOrder = zeroIndex === "lowest" ? "lsb0" : "msb0";
    this.setBit(index, value, order);
  }

  // ========================================================================
  // Operations
  // ========================================================================

  xor(other: BitArray): BitArray {
    if (this.length !== other.length) {
      throw new RangeError("Bit arrays must have the same length for xor");
    }
    const data = new Uint8Array(this.#data.length);
    for (let i = 0; i < this.#data.length; i++) {
      data[i] = this.#data[i]! ^ other.#data[i]!;
    }
    return new BitArray(data);
  }

  diff(other: BitArray): number[] {
    if (this.length !== other.length) {
      throw new RangeError("bit arrays must have the same length for diff");
    }
    const diffIndex: number[] = [];
    for (let i = 0; i < this.length; i++) {
      if (this.get(i) !== other.get(i)) {
        diffIndex.push(i);
      }
    }
    return diffIndex;
  }

  // ========================================================================
  // Comparisons
  // ========================================================================

  equals(other: BitArray): boolean {
    if (this.length !== other.length) return false;
    return this.#data.every((byte, index) => byte === other.#data[index]);
  }

  greaterThan(other: BitArray): boolean {
    return this.toBigInt() > other.toBigInt();
  }

  greaterThanOrEqual(other: BitArray): boolean {
    return this.greaterThan(other) || this.equals(other);
  }

  lessThan(other: BitArray): boolean {
    return this.toBigInt() < other.toBigInt();
  }

  lessThanOrEqual(other: BitArray): boolean {
    return this.lessThan(other) || this.equals(other);
  }

  // ========================================================================
  // Conversions
  // ========================================================================

  toBigInt(): bigint {
    return BigInt(`0b${this.toString()}`);
  }

  toString(): string {
    return this.#data.reduce((prev, curr) => prev + curr.toString(2).padStart(8, "0"), "");
  }

  toHexString(): string {
    return Array.from(this.#data, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  toIntString(): string {
    return this.toBigInt().toString();
  }

  // ========================================================================
  // Private
  // ========================================================================

  #assertBitIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }
  }
}
