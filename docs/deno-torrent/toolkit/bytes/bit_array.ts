import { BytesUtil } from './bytes_util.ts';

/** Bit numbering within each byte, while bytes remain in array order. */
export type BitOrder = 'lsb0' | 'msb0';

/**
 * A bit array is an array data structure that compactly stores bits. It can be used to implement a simple set data structure.
 */
export class BitArray {
  #data: Uint8Array;

  private constructor(data: Uint8Array) {
    this.#data = data;
  }

  toBigInt(): bigint {
    return BigInt(`0b${this.toString()}`);
  }

  /**
   * create a bit array from a binary string, e.g. 0101 0101
   * @param data the binary string, e.g. 0101 0101
   */
  static fromBinaryString(data: string): BitArray {
    // check the data is a binary string
    if (!BitArray.isBinaryString(data)) {
      throw new TypeError('data must be a non-empty binary string');
    }

    const bytesLength = Math.ceil(data.length / 8);

    // int range is small, so we can use BigInt to convert binary string to number
    const number = BigInt(`0b${data}`);
    const bytes = new Uint8Array(bytesLength);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number((number >> BigInt(8 * (bytes.length - 1 - i))) & BigInt(0xff));
    }

    return new BitArray(bytes);
  }

  /**
   * Creates a bit array from a byte array.
   *
   * The input is copied, so later mutations to `data` do not affect the
   * returned bit array.
   *
   * @param data - Bytes to copy into the bit array.
   */
  static fromUint8Array(data: Uint8Array): BitArray {
    return new BitArray(data.slice());
  }

  /**
   * create a bit array from a number
   * @param data
   * @param length the bit length of the number, if the bit length of the number is less than length, fill the number with 0 from the highest bit
   * @returns
   */
  static fromInt(data: number, length = 0): BitArray {
    if (!Number.isSafeInteger(data) || data < 0) {
      throw new RangeError('data must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError('length must be a non-negative safe integer');
    }

    const binaryString = data.toString(2);
    const safeLength = Math.max(binaryString.length, length);
    return this.fromBinaryString(data.toString(2).padStart(safeLength, '0'));
  }

  /**
   * @param data
   * @param length the bit length of the number, if the bit length of the number is less than length, fill the number with 0 from the highest bit
   * @returns
   */
  static fromBigInt(data: bigint, length = 0): BitArray {
    if (data < 0n) {
      throw new RangeError('data must be non-negative');
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError('length must be a non-negative safe integer');
    }

    const binaryString = data.toString(2);
    const safeLength = Math.max(binaryString.length, length);
    return this.fromBinaryString(data.toString(2).padStart(safeLength, '0'));
  }

  static isBinaryString(data: string): boolean {
    if (data.length === 0) return false;

    // if data has any character other than 0 and 1, it is not a binary string
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== '0' && data[i] !== '1') {
        return false;
      }
    }
    return true;
  }

  /**
   * get the length of the bit array
   */
  get length(): number {
    return this.#data.length * 8;
  }

  /**
   * Gets a copy of the bytes in this bit array.
   *
   * Mutating the returned array does not modify this bit array.
   */
  get bytes(): Uint8Array {
    return this.#data.slice();
  }

  /**
   * Gets a bit using explicit per-byte bit numbering.
   *
   * Bytes are always traversed in `Uint8Array` order. With `lsb0`, index 0
   * selects `0x01` in the first byte; with `msb0`, it selects `0x80`.
   *
   * @param index - Zero-based bit index.
   * @param order - Bit numbering within each byte. Defaults to `lsb0`.
   * @throws {RangeError} If `index` is not a valid bit index.
   */
  getBit(index: number, order: BitOrder = 'lsb0'): boolean {
    this.assertBitIndex(index);
    const byteIndex = Math.floor(index / 8);
    const mask = order === 'msb0' ? 0x80 >> (index % 8) : 1 << (index % 8);
    return (this.#data[byteIndex] & mask) !== 0;
  }

  /**
   * Sets a bit using explicit per-byte bit numbering.
   *
   * Bytes are always traversed in `Uint8Array` order. With `lsb0`, index 0
   * selects `0x01` in the first byte; with `msb0`, it selects `0x80`.
   *
   * @param index - Zero-based bit index.
   * @param value - Whether the selected bit should be set.
   * @param order - Bit numbering within each byte. Defaults to `lsb0`.
   * @throws {RangeError} If `index` is not a valid bit index.
   */
  setBit(index: number, value: boolean, order: BitOrder = 'lsb0'): void {
    this.assertBitIndex(index);
    const byteIndex = Math.floor(index / 8);
    const mask = order === 'msb0' ? 0x80 >> (index % 8) : 1 << (index % 8);
    if (value) {
      this.#data[byteIndex] |= mask;
    } else {
      this.#data[byteIndex] &= ~mask;
    }
  }

  private assertBitIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }
  }

  /**
   * compare this bit array with the other bit array
   * @param other
   * @returns
   */
  greaterThan(other: BitArray): boolean {
    return this.toBigInt() > other.toBigInt();
  }

  greaterThanOrEqual(other: BitArray): boolean {
    return this.greaterThan(other) || this.equals(other);
  }

  /**
   * compare this bit array with the other bit array
   * @param other
   * @returns
   */
  lessThan(other: BitArray): boolean {
    return this.toBigInt() < other.toBigInt();
  }

  lessThanOrEqual(other: BitArray): boolean {
    return this.lessThan(other) || this.equals(other);
  }

  /**
   * compare this bit array with the other bit array
   * @param other
   * @returns
   */
  equals(other: BitArray): boolean {
    if (this.length !== other.length) return false;
    return this.#data.every((byte, index) => byte === other.#data[index]);
  }

  /**
   * calculate the xor of this bit array and the other bit array
   * @param other the other bit array
   * @returns a new bit array
   * @throws {RangeError} If the bit arrays have different lengths.
   */
  xor(other: BitArray): BitArray {
    if (this.length !== other.length) {
      throw new RangeError('Bit arrays must have the same length for xor');
    }

    const data = new Uint8Array(this.#data.length);
    for (let i = 0; i < this.#data.length; i++) {
      data[i] = this.#data[i] ^ other.#data[i];
    }
    return new BitArray(data);
  }

  /**
   * set the bit at the index
   * @param index the index of the bit
   * @param value the value of the bit
   * @param zeroIndex the index of the zero bit, lowest or highest, default is lowest ,if the bit array is 1010 1010, the lowest zero bit is 0, the highest zero bit is 7
   */
  set(index: number, value: boolean, zeroIndex: 'lowest' | 'highest' = 'lowest'): void {
    // out of range check
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }

    if (zeroIndex === 'lowest') {
      this.setBitFromLowest(index, value);
    } else if (zeroIndex === 'highest') {
      this.setBitFromHighest(index, value);
    }
  }

  private setBitFromHighest(index: number, value: boolean): void {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'highest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'highest');

    // set the bit
    if (value) {
      this.#data[byteIndex] = byte | (1 << bitIndex);
    } else {
      this.#data[byteIndex] = byte & ~(1 << bitIndex);
    }
  }

  private setBitFromLowest(index: number, value: boolean): void {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'lowest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'lowest');

    // set the bit
    if (value) {
      this.#data[byteIndex] = byte | (1 << bitIndex);
    } else {
      this.#data[byteIndex] = byte & ~(1 << bitIndex);
    }
  }

  /**
   * get the bit at the index
   * @param index  the index of the bit
   * @param zeroIndex the index of the zero bit, lowest or highest, default is lowest ,if the bit array is 1010 1010, the lowest zero bit is 0, the highest zero bit is 7
   */
  get(index: number, zeroIndex: 'lowest' | 'highest' = 'lowest'): boolean {
    // out of range check
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }

    if (zeroIndex === 'lowest') {
      return this.getBitFromLowest(index);
    } else {
      return this.getBitFromHighest(index);
    }
  }

  /**
   * get the bit from the highest bit
   * @param index the index of the bit
   * @returns the bit
   */
  private getBitFromHighest(index: number): boolean {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'highest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'highest');

    // get the bit
    return (byte & (1 << bitIndex)) !== 0;
  }

  /**
   * get the bit from the lowest bit
   * @param index the index of the bit
   * @returns the bit
   */
  private getBitFromLowest(index: number): boolean {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'lowest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'lowest');

    // get the bit
    return (byte & (1 << bitIndex)) !== 0;
  }

  /**
   * get the byte index which contains the bit
   * @param bitIndex bit index
   * @param zeroIndex the index of the zero bit, lowest or highest, default is lowest ,if the bit array is 1010 1010, the lowest zero bit is 0, the highest zero bit is 7
   * @returns the byte index
   */
  private getByteIndex(bitIndex: number, zeroIndex: 'lowest' | 'highest'): number {
    if (zeroIndex === 'lowest') {
      return Math.floor(bitIndex / 8);
    } else {
      return this.#data.length - 1 - Math.floor(bitIndex / 8);
    }
  }

  /**
   * get the bit offset in the byte
   * @param byteIndex the byte index
   * @param zeroIndex
   * @returns the bit offset in the byte
   */
  private getBitOffsetInByte(byteIndex: number, zeroIndex: 'lowest' | 'highest'): number {
    if (zeroIndex === 'lowest') {
      return byteIndex % 8;
    } else {
      return 7 - (byteIndex % 8);
    }
  }

  /**
   * print the bit array as a binary string, e.g. 0101 0101
   * @returns
   */
  toString(): string {
    return this.#data.reduce((prev, curr) => prev + curr.toString(2).padStart(8, '0'), '');
  }

  toIntString(): string {
    return this.toBigInt().toString();
  }

  toHexString(): string {
    return BytesUtil.bytes2HexStr(this.#data);
  }

  /**
   * return a index array include the index of the different bits
   * @param other
   */
  diff(other: BitArray): number[] {
    // if the length of the bit array is not equal, throw an error
    if (this.length !== other.length) {
      throw new RangeError('bit arrays must have the same length for diff');
    }
    const diffIndex: number[] = [];
    for (let i = 0; i < this.length; i++) {
      if (this.get(i) !== other.get(i)) {
        diffIndex.push(i);
      }
    }
    return diffIndex;
  }
}
