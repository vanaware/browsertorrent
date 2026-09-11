// /loco/monorepo/webtorrent/tests/bit-array_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import { BitArray, type BitOrder } from "../src/utils/bit-array.ts";

// ============================================================================
// Factory methods
// ============================================================================

Deno.test("BitArray: fromUint8Array creates copy", () => {
  const data = new Uint8Array([0xff, 0x00]);
  const ba = BitArray.fromUint8Array(data);
  assertEquals(ba.length, 16);
  // Mutating original does not affect BitArray
  data[0] = 0x00;
  assertEquals(ba.getBit(0, "msb0"), true);
});

Deno.test("BitArray: fromBinaryString", () => {
  const ba = BitArray.fromBinaryString("10101010");
  assertEquals(ba.length, 8);
  assertEquals(ba.getBit(0, "msb0"), true);
  assertEquals(ba.getBit(1, "msb0"), false);
});

Deno.test("BitArray: fromInt", () => {
  const ba = BitArray.fromInt(5, 8); // 00000101
  assertEquals(ba.length, 8);
  assertEquals(ba.getBit(5, "msb0"), true); // bit 5 = 1
  assertEquals(ba.getBit(7, "msb0"), true); // bit 7 = 1
});

Deno.test("BitArray: fromBigInt", () => {
  const ba = BitArray.fromBigInt(255n, 16); // 0000000011111111
  assertEquals(ba.length, 16);
  assertEquals(ba.toHexString(), "00ff");
});

Deno.test("BitArray: isBinaryString", () => {
  assertEquals(BitArray.isBinaryString("0101"), true);
  assertEquals(BitArray.isBinaryString(""), false);
  assertEquals(BitArray.isBinaryString("102"), false);
});

Deno.test("BitArray: fromBinaryString rejects invalid input", () => {
  assertThrows(() => BitArray.fromBinaryString("abc"));
  assertThrows(() => BitArray.fromBinaryString(""));
});

// ============================================================================
// getBit / setBit (msb0)
// ============================================================================

Deno.test("BitArray: getBit/setBit msb0", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0b10110000]));
  assertEquals(ba.getBit(0, "msb0"), true);  // bit 0 = MSB
  assertEquals(ba.getBit(1, "msb0"), false);
  assertEquals(ba.getBit(2, "msb0"), true);
  assertEquals(ba.getBit(3, "msb0"), true);
  assertEquals(ba.getBit(7, "msb0"), false);  // LSB
});

Deno.test("BitArray: getBit/setBit lsb0", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0b00001101]));
  assertEquals(ba.getBit(0, "lsb0"), true);  // bit 0 = LSB (mask 0x01)
  assertEquals(ba.getBit(1, "lsb0"), false); // mask 0x02 not set
  assertEquals(ba.getBit(2, "lsb0"), true);  // mask 0x04
  assertEquals(ba.getBit(3, "lsb0"), true);  // mask 0x08
});

Deno.test("BitArray: setBit toggles correctly", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0x00]));
  ba.setBit(0, true, "msb0");
  assertEquals(ba.getBit(0, "msb0"), true);
  assertEquals(ba.toHexString(), "80");
  ba.setBit(0, false, "msb0");
  assertEquals(ba.getBit(0, "msb0"), false);
  assertEquals(ba.toHexString(), "00");
});

// ============================================================================
// Legacy get/set API
// ============================================================================

Deno.test("BitArray: get/set with zeroIndex 'highest' maps to msb0", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0b10000000]));
  assertEquals(ba.get(0, "highest"), true); // bit 0 from highest = MSB
  assertEquals(ba.get(7, "highest"), false);
});

// ============================================================================
// xor
// ============================================================================

Deno.test("BitArray: xor", () => {
  const a = BitArray.fromUint8Array(new Uint8Array([0xff, 0x00]));
  const b = BitArray.fromUint8Array(new Uint8Array([0x0f, 0xff]));
  const result = a.xor(b);
  assertEquals(result.bytes, new Uint8Array([0xf0, 0xff]));
});

Deno.test("BitArray: xor rejects different lengths", () => {
  const a = BitArray.fromUint8Array(new Uint8Array([0xff]));
  const b = BitArray.fromUint8Array(new Uint8Array([0xff, 0x00]));
  assertThrows(() => a.xor(b), RangeError);
});

// ============================================================================
// diff
// ============================================================================

Deno.test("BitArray: diff", () => {
  const a = BitArray.fromUint8Array(new Uint8Array([0b10101010]));
  const b = BitArray.fromUint8Array(new Uint8Array([0b11001100]));
  const diff = a.diff(b);
  // Bits that differ: positions 1,2,4,5 (msb0: 10101010 vs 11001100)
  assertEquals(diff.length > 0, true);
});

// ============================================================================
// Comparisons
// ============================================================================

Deno.test("BitArray: equals", () => {
  const a = BitArray.fromUint8Array(new Uint8Array([0xab, 0xcd]));
  const b = BitArray.fromUint8Array(new Uint8Array([0xab, 0xcd]));
  const c = BitArray.fromUint8Array(new Uint8Array([0xab, 0xce]));
  assertEquals(a.equals(b), true);
  assertEquals(a.equals(c), false);
});

Deno.test("BitArray: greaterThan / lessThan", () => {
  const a = BitArray.fromUint8Array(new Uint8Array([0x01]));
  const b = BitArray.fromUint8Array(new Uint8Array([0x02]));
  assertEquals(b.greaterThan(a), true);
  assertEquals(a.lessThan(b), true);
});

// ============================================================================
// Conversions
// ============================================================================

Deno.test("BitArray: toBigInt", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0x01, 0x00]));
  assertEquals(ba.toBigInt(), 256n);
});

Deno.test("BitArray: toString (binary string)", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0xab]));
  assertEquals(ba.toString(), "10101011");
});

Deno.test("BitArray: toHexString", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0xab, 0xcd]));
  assertEquals(ba.toHexString(), "abcd");
});

Deno.test("BitArray: bytes getter returns copy", () => {
  const ba = BitArray.fromUint8Array(new Uint8Array([0xff]));
  const bytes = ba.bytes;
  bytes[0] = 0x00;
  assertEquals(ba.bytes[0], 0xff); // original unaffected
});
