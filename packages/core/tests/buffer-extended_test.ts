import { assertEquals, assertThrows } from "@std/assert";
import {
  alloc,
  bigIntToBytes,
  bytesToBigInt,
  chunkBytes,
  compare,
  concat,
  equals,
  from,
  readUInt32BE,
  toString,
  writeUInt32BE,
  xor,
} from "../src/utils/buffer.ts";

// ─── xor ────────────────────────────────────────────────────────────────────

Deno.test("xor: byte-wise XOR of equal-length arrays", () => {
  const a = new Uint8Array([0xff, 0x0f, 0x00, 0xaa]);
  const b = new Uint8Array([0x0f, 0xff, 0x00, 0x55]);
  assertEquals(xor(a, b), new Uint8Array([0xf0, 0xf0, 0x00, 0xff]));
});

Deno.test("xor: XOR with zeros is identity", () => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([0, 0, 0]);
  assertEquals(xor(a, b), a);
});

Deno.test("xor: throws when lengths differ", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([1]);
  assertThrows(() => xor(a, b), RangeError);
});

// ─── compare ────────────────────────────────────────────────────────────────

Deno.test("compare: equal arrays return 0", () => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([1, 2, 3]);
  assertEquals(compare(a, b), 0);
});

Deno.test("compare: first differing byte determines order", () => {
  const a = new Uint8Array([1, 0]);
  const b = new Uint8Array([2, 0]);
  assertEquals(compare(a, b), -1);
  assertEquals(compare(b, a), 1);
});

Deno.test("compare: shorter prefix is less", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([1, 2, 3]);
  assertEquals(compare(a, b), -1);
  assertEquals(compare(b, a), 1);
});

Deno.test("compare: empty vs non-empty", () => {
  const empty = new Uint8Array(0);
  const nonEmpty = new Uint8Array([0]);
  assertEquals(compare(empty, nonEmpty), -1);
  assertEquals(compare(nonEmpty, empty), 1);
});

// ─── bytesToBigInt ──────────────────────────────────────────────────────────

Deno.test("bytesToBigInt: zero", () => {
  assertEquals(bytesToBigInt(new Uint8Array([0])), 0n);
  assertEquals(bytesToBigInt(new Uint8Array(0)), 0n);
});

Deno.test("bytesToBigInt: small values", () => {
  assertEquals(bytesToBigInt(new Uint8Array([1])), 1n);
  assertEquals(bytesToBigInt(new Uint8Array([0xff])), 255n);
  assertEquals(bytesToBigInt(new Uint8Array([0x01, 0x00])), 256n);
});

Deno.test("bytesToBigInt: large value", () => {
  // 2^64 - 1
  const bytes = new Uint8Array([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  ]);
  assertEquals(bytesToBigInt(bytes), 18446744073709551615n);
});

// ─── bigIntToBytes ──────────────────────────────────────────────────────────

Deno.test("bigIntToBytes: zero", () => {
  assertEquals(bigIntToBytes(0n), new Uint8Array([0]));
});

Deno.test("bigIntToBytes: small values", () => {
  assertEquals(bigIntToBytes(1n), new Uint8Array([1]));
  assertEquals(bigIntToBytes(255n), new Uint8Array([0xff]));
  assertEquals(bigIntToBytes(256n), new Uint8Array([0x01, 0x00]));
});

Deno.test("bigIntToBytes: with explicit length pads with zeros", () => {
  assertEquals(bigIntToBytes(1n, 4), new Uint8Array([0, 0, 0, 1]));
  assertEquals(bigIntToBytes(0n, 2), new Uint8Array([0, 0]));
});

Deno.test("bigIntToBytes: throws on negative", () => {
  assertThrows(() => bigIntToBytes(-1n), RangeError);
});

Deno.test("bigIntToBytes: throws when value doesn't fit length", () => {
  assertThrows(() => bigIntToBytes(256n, 1), RangeError);
});

Deno.test("bigIntToBytes: throws on invalid length", () => {
  assertThrows(() => bigIntToBytes(0n, -1), RangeError);
  assertThrows(() => bigIntToBytes(0n, 1.5), RangeError);
});

// ─── chunkBytes ─────────────────────────────────────────────────────────────

Deno.test("chunkBytes: even division", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const chunks = chunkBytes(data, 3);
  assertEquals(chunks.length, 2);
  assertEquals(chunks[0], new Uint8Array([1, 2, 3]));
  assertEquals(chunks[1], new Uint8Array([4, 5, 6]));
});

Deno.test("chunkBytes: last chunk is shorter", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const chunks = chunkBytes(data, 2);
  assertEquals(chunks.length, 3);
  assertEquals(chunks[0], new Uint8Array([1, 2]));
  assertEquals(chunks[1], new Uint8Array([3, 4]));
  assertEquals(chunks[2], new Uint8Array([5]));
});

Deno.test("chunkBytes: data shorter than chunkSize returns [data]", () => {
  const data = new Uint8Array([1, 2]);
  const chunks = chunkBytes(data, 5);
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0], data);
});

Deno.test("chunkBytes: single element", () => {
  const data = new Uint8Array([42]);
  const chunks = chunkBytes(data, 1);
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0], new Uint8Array([42]));
});

Deno.test("chunkBytes: throws on invalid chunkSize", () => {
  assertThrows(() => chunkBytes(new Uint8Array(1), 0), RangeError);
  assertThrows(() => chunkBytes(new Uint8Array(1), -1), RangeError);
  assertThrows(() => chunkBytes(new Uint8Array(1), 1.5), RangeError);
});

// ─── Existing functions still work ──────────────────────────────────────────

Deno.test("alloc: creates zero-filled array", () => {
  const buf = alloc(4);
  assertEquals(buf.length, 4);
  assertEquals(buf, new Uint8Array(4));
});

Deno.test("from: hex string", () => {
  assertEquals(from("01020a", "hex"), new Uint8Array([1, 2, 10]));
});

Deno.test("from: utf8 string", () => {
  assertEquals(from("hi", "utf8"), new TextEncoder().encode("hi"));
});

Deno.test("concat: joins arrays", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([3, 4]);
  assertEquals(concat([a, b]), new Uint8Array([1, 2, 3, 4]));
});

Deno.test("toString: hex encoding", () => {
  assertEquals(toString(new Uint8Array([1, 2, 10]), "hex"), "01020a");
});

Deno.test("equals: detects equality and inequality", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([1, 2]);
  const c = new Uint8Array([1, 3]);
  assertEquals(equals(a, b), true);
  assertEquals(equals(a, c), false);
  assertEquals(equals(a, new Uint8Array([1])), false);
});

Deno.test("readUInt32BE / writeUInt32BE round-trip", () => {
  const buf = alloc(4);
  writeUInt32BE(buf, 0x01020304);
  assertEquals(readUInt32BE(buf), 0x01020304);
});

Deno.test("bytesToBigInt / bigIntToBytes round-trip", () => {
  const value = 1099511627776n; // 2^40
  const bytes = bigIntToBytes(value);
  assertEquals(bytesToBigInt(bytes), value);
});
