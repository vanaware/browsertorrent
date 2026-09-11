import { decodeHex, encodeHex } from '@std/encoding/hex';

/**
 * array1 xor array2, if array1.length !== array2.length, min(array1.length, array2.length) will be used
 * @param array1 Uint8Array
 * @param array2 Uint8Array
 * @returns Uint8Array
 */
function xorBytes(array1: Uint8Array, array2: Uint8Array) {
  const length = Math.min(array1.length, array2.length);
  const result = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = array1[i] ^ array2[i];
  }

  return result;
}

/** Concatenates byte arrays into a newly allocated array. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((total, array) => total + array.length, 0);
  if (!Number.isSafeInteger(totalLength)) {
    throw new RangeError('combined byte length exceeds Number.MAX_SAFE_INTEGER');
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

/** Returns `true` when two byte arrays have identical contents. */
function equals(array1: Uint8Array, array2: Uint8Array): boolean {
  return array1.length === array2.length && array1.every((byte, index) => byte === array2[index]);
}

/** Compares byte arrays in lexicographic order. */
function compare(array1: Uint8Array, array2: Uint8Array): -1 | 0 | 1 {
  const sharedLength = Math.min(array1.length, array2.length);
  for (let index = 0; index < sharedLength; index++) {
    if (array1[index] < array2[index]) return -1;
    if (array1[index] > array2[index]) return 1;
  }
  if (array1.length < array2.length) return -1;
  if (array1.length > array2.length) return 1;
  return 0;
}

/**
 * xor two numbers or two Uint8Arrays
 * @param a
 * @param b
 * @returns
 */
function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an integer in the range [0, 255]`);
  }
}

function xor(a: number, b: number): Uint8Array;
function xor(a: Uint8Array, b: Uint8Array): Uint8Array;
function xor(a: number | Uint8Array, b: number | Uint8Array): Uint8Array {
  if (typeof a === 'number' && typeof b === 'number') {
    assertByte(a, 'a');
    assertByte(b, 'b');
    return Uint8Array.from([a ^ b]);
  } else if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return xorBytes(a, b);
  }
  throw new Error('a and b must be the same type');
}

/**
 * convert Uint8Array to binary string
 * @param value Uint8Array
 * @returns string
 */
function bytes2BinStr(value: Uint8Array): string {
  const parts = new Array<string>(value.length);
  for (let index = 0; index < value.length; index++) {
    parts[index] = value[index].toString(2).padStart(8, '0');
  }
  return parts.join('');
}

/**
 * convert binary string to Uint8Array
 * @param value such as '00000001'
 * @returns
 */
function binStr2Bytes(value: string): Uint8Array {
  if (!/^[01]*$/.test(value)) {
    throw new TypeError('value must contain only binary digits');
  }
  if (value.length % 8 !== 0) {
    throw new RangeError('value length must be a multiple of 8');
  }

  const length = value.length / 8;
  const result = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = parseInt(value.slice(i * 8, (i + 1) * 8), 2);
  }

  return result;
}

/**
 * convert Uint8Array to number
 * @param value
 * @returns
 */
function bytes2Int(value: Uint8Array): number {
  if (value.length > 6) {
    throw new RangeError('value exceeds Number.MAX_SAFE_INTEGER');
  }

  let result = 0;
  for (const byte of value) {
    result = result * 0x100 + byte;
  }
  return result;
}

/**
 * Converts an unsigned big-endian byte sequence to a bigint.
 * An empty sequence represents zero.
 */
function bytes2BigInt(value: Uint8Array): bigint {
  let result = 0n;
  for (const byte of value) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Converts a non-negative bigint to an unsigned big-endian byte sequence.
 * When `length` is provided, the result is left-padded to that exact length.
 *
 * @throws {RangeError} If `value` is negative, `length` is invalid, or the value does not fit.
 */
function bigInt2Bytes(value: bigint, length?: number): Uint8Array {
  if (value < 0n) {
    throw new RangeError('value must be a non-negative bigint');
  }
  if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) {
    throw new RangeError('length must be a non-negative safe integer');
  }

  let byteLength = value === 0n ? 1 : 0;
  for (let remaining = value; remaining > 0n; remaining >>= 8n) {
    byteLength++;
  }

  if (length !== undefined) {
    if (value !== 0n && byteLength > length) {
      throw new RangeError('value does not fit in the requested byte length');
    }
    byteLength = length;
  }

  const result = new Uint8Array(byteLength);
  for (let index = byteLength - 1, remaining = value; index >= 0; index--, remaining >>= 8n) {
    result[index] = Number(remaining & 0xffn);
  }
  return result;
}

/**
 * convert number to Uint8Array
 * @param value
 * @returns
 */
function int2Bytes(value: number): Uint8Array {
  assertByte(value, 'value');
  return Uint8Array.from([value]);
}

/**
 * convert Uint8Array to hex string
 * @deprecated Use `encodeHex` from `@std/encoding/hex` directly.
 * @param value
 * @returns
 */
function bytes2HexStr(value: Uint8Array): string {
  return encodeHex(value);
}

/**
 * convert hex string to Uint8Array
 * @deprecated use std/encoding/hex.ts decodeHex instead
 * @param value
 * @returns
 */
function hexStr2Bytes(value: string): Uint8Array {
  return decodeHex(value);
}

/**
 * convert Uint8Array to Unit8Array []
 * e.g. chunkLenth is 4, Uint8Array [1,2,3,4,5,6,7,8] => [Uint8Array [1,2,3,4], Uint8Array [5,6,7,8]]
 *
 * @param data  Uint8Array
 */
function chunkBytes(data: Uint8Array, chunkLength: number): Uint8Array[] {
  if (!Number.isSafeInteger(chunkLength) || chunkLength <= 0) {
    throw new RangeError('chunkLength must be a positive safe integer');
  }

  // if data.length <= chunkLength, return [data]
  if (data.length <= chunkLength) {
    return [data];
  }

  const result: Uint8Array[] = [];
  const chunkCount = Math.ceil(data.length / chunkLength);
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkLength;
    const end = (i + 1) * chunkLength;
    const chunk = data.slice(start, end);
    result.push(chunk);
  }

  return result;
}

/** Byte-array conversion, comparison, and chunking utilities. */
const BytesUtil = {
  concat,
  equals,
  compare,
  xor,
  bytes2BinStr,
  binStr2Bytes,
  bytes2Int,
  bytes2BigInt,
  int2Bytes,
  bigInt2Bytes,
  bytes2HexStr,
  hexStr2Bytes,
  chunkBytes,
};

export { BytesUtil };
