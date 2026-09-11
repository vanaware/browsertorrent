// /loco/monorepo/webtorrent/tests/bitfield_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import { Bitfield } from "../src/core/bitfield.ts";
import { BitfieldError } from "../src/utils/errors.ts";

Deno.test("bitfield: fromBytes validates buffer length", () => {
  // Valid case: 16 pieces = 2 bytes
  const validBuffer = new Uint8Array([0b10101010, 0b01010101]);
  const bitfield = Bitfield.fromBytes(validBuffer, 16);
  assertEquals(bitfield.length, 16);
});

Deno.test("bitfield: fromBytes rejects incorrect buffer length", () => {
  const buffer = new Uint8Array([0b10101010]);
  
  // 16 pieces require 2 bytes
  assertThrows(() => {
    Bitfield.fromBytes(buffer, 16);
  }, BitfieldError, "Invalid buffer length. Expected 2, got 1");
});

Deno.test("bitfield: fromBytes validates spare bits (8 pieces)", () => {
  // 8 pieces = exactly 1 byte, no spare bits
  const buffer = new Uint8Array([0b10101010]);
  Bitfield.fromBytes(buffer, 8);
});

Deno.test("bitfield: fromBytes validates spare bits (9 pieces)", () => {
  // 9 pieces = 2 bytes, last byte has 7 spare bits
  const validBuffer = new Uint8Array([0b10101010, 0b10000000]);
  Bitfield.fromBytes(validBuffer, 9);

  const invalidBuffer = new Uint8Array([0b10101010, 0b10000001]); // spare bit set
  assertThrows(() => {
    Bitfield.fromBytes(invalidBuffer, 9);
  }, BitfieldError, "Spare bits must be zero");
});

Deno.test("bitfield: fromBytes handles edge case (0 pieces)", () => {
  const buffer = new Uint8Array([]);
  const bitfield = Bitfield.fromBytes(buffer, 0);
  assertEquals(bitfield.length, 0);
  assertEquals(bitfield.toBuffer().length, 0);
});