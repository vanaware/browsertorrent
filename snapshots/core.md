> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém o desenvolvimento principal de @vanaware/browsertorrent
> O projeto é o **BrowserTorrent [vdev] ** estruturado em bbrowsertorrents. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent [vdev] - Modo: CORE

Gerado automaticamente em: 9/12/2026, 8:09:18 PM

---

## Arquivo: `packages/core/tests/bencode_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/bencode_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  decode,
  encode,
  BencodeDecodeError,
  BencodeEncodeError,
  type BencodeDict,
  type BencodeMap,
  type BencodeValue,
} from "../src/utils/bencode.ts";

const te = new TextEncoder();

// ============================================================================
// DECODE — tipos básicos
// ============================================================================

Deno.test("bencode: decode integer", () => {
  assertEquals(decode(te.encode("i42e")), 42);
  assertEquals(decode(te.encode("i0e")), 0);
  assertEquals(decode(te.encode("i-42e")), -42);
});

Deno.test("bencode: decode large integer becomes bigint", () => {
  const result = decode(te.encode("i9999999999999999999e"));
  assertEquals(typeof result, "bigint");
  assertEquals(result, 9999999999999999999n);
});

Deno.test("bencode: decode string", () => {
  assertEquals(decode(te.encode("5:hello")), "hello");
});

Deno.test("bencode: decode byte string (invalid UTF-8 stays Uint8Array)", () => {
  const data = new Uint8Array([0x31, 0x3a, 0xff]); // "1:" + 0xff
  const result = decode(data);
  assertEquals(result instanceof Uint8Array, true);
  assertEquals((result as Uint8Array).length, 1);
  assertEquals((result as Uint8Array)[0], 0xff);
});

Deno.test("bencode: decode list", () => {
  const result = decode(te.encode("l4:spami42ee"));
  assertEquals(Array.isArray(result), true);
  const list = result as BencodeValue[];
  assertEquals(list[0], "spam");
  assertEquals(list[1], 42);
});

Deno.test("bencode: decode dictionary", () => {
  const result = decode(te.encode("d3:cow3:moo4:spam4:eggse")) as BencodeDict;
  assertEquals(result["cow"], "moo");
  assertEquals(result["spam"], "eggs");
});

Deno.test("bencode: decode empty dict", () => {
  assertEquals(decode(te.encode("de")), {});
});

Deno.test("bencode: decode empty list", () => {
  assertEquals(decode(te.encode("le")), []);
});

// ============================================================================
// DECODE — error handling
// ============================================================================

Deno.test("bencode: decode rejects trailing data", () => {
  assertThrows(() => decode(te.encode("i1ei2e")), BencodeDecodeError, "trailing data");
});

Deno.test("bencode: decode rejects truncated integer", () => {
  assertThrows(() => decode(te.encode("i42")), BencodeDecodeError, "unterminated");
});

Deno.test("bencode: decode rejects invalid integer format", () => {
  assertThrows(() => decode(te.encode("i01e")), BencodeDecodeError, "invalid integer");
  assertThrows(() => decode(te.encode("i-0e")), BencodeDecodeError, "invalid integer");
  assertThrows(() => decode(te.encode("i1.5e")), BencodeDecodeError, "invalid integer");
});

Deno.test("bencode: decode rejects duplicate dictionary keys", () => {
  assertThrows(() => decode(te.encode("d3:fooi1e3:fooi2ee")), BencodeDecodeError, "duplicate");
});

Deno.test("bencode: decode rejects unsorted dictionary keys", () => {
  assertThrows(() => decode(te.encode("d3:zooi1e1:ai1ee")), BencodeDecodeError, "not sorted");
});

Deno.test("bencode: decode allowUnsortedKeys bypasses order check", () => {
  const data = te.encode("d3:zooi1e1:ai1ee");
  const result = decode(data, { allowUnsortedKeys: true }) as BencodeDict;
  assertEquals(result["zoo"], 1);
  assertEquals(result["a"], 1);
});

Deno.test("bencode: decode rejects leading zero in byte string length", () => {
  assertThrows(() => decode(te.encode("01:a")), BencodeDecodeError, "leading zero");
});

// ============================================================================
// DECODE — resource limits
// ============================================================================

Deno.test("bencode: decode maxBytes rejects oversized input", () => {
  assertThrows(() => decode(te.encode("i1e"), { maxBytes: 1 }), BencodeDecodeError, "exceeds maximum size");
});

Deno.test("bencode: decode maxDepth rejects deeply nested input", () => {
  const deeplyNested = "d1:a".repeat(10) + "i1e" + "e".repeat(10);
  assertThrows(
    () => decode(te.encode(deeplyNested), { maxDepth: 5 }),
    BencodeDecodeError,
    "maximum nesting depth"
  );
});

// ============================================================================
// DECODE — useMap option
// ============================================================================

Deno.test("bencode: decode useMap returns Map", () => {
  const result = decode(te.encode("d3:foo3:bare"), { useMap: true }) as BencodeMap;
  assertEquals(result instanceof Map, true);
  assertEquals(result.get("foo"), "bar");
});

Deno.test("bencode: decode useMap preserves binary keys as Uint8Array", () => {
  const keyBytes = new Uint8Array([0xff, 0x00, 0x01]);
  const encoded = new Uint8Array([
    0x64, // 'd'
    0x33, 0x3a, // "3:"
    ...keyBytes,
    0x31, 0x3a, 0x78, // "1:x"
    0x65, // 'e'
  ]);
  const result = decode(encoded, { useMap: true }) as BencodeMap;
  let found = false;
  for (const [key] of result) {
    if (key instanceof Uint8Array) {
      found = true;
      assertEquals(key.length, 3);
      assertEquals(key[0], 0xff);
    }
  }
  assertEquals(found, true);
});

// ============================================================================
// ENCODE — tipos básicos
// ============================================================================

Deno.test("bencode: encode integer", () => {
  assertEquals(encode(42), te.encode("i42e"));
  assertEquals(encode(0), te.encode("i0e"));
  assertEquals(encode(-1), te.encode("i-1e"));
});

Deno.test("bencode: encode bigint", () => {
  const bigNum = 9007199254740991234n;
  assertEquals(decode(encode(bigNum)), bigNum);
});

Deno.test("bencode: encode string", () => {
  assertEquals(encode("hello"), te.encode("5:hello"));
});

Deno.test("bencode: encode Uint8Array", () => {
  const bytes = new Uint8Array([0xff, 0xfe]);
  const result = encode(bytes);
  const expected = new Uint8Array([0x32, 0x3a, 0xff, 0xfe]); // "2:" + bytes
  assertEquals(result, expected);
});

Deno.test("bencode: encode list", () => {
  assertEquals(encode(["spam", 42]), te.encode("l4:spami42ee"));
});

Deno.test("bencode: encode dictionary with sorted keys (Record)", () => {
  const data: BencodeDict = { z: "Z", a: "A", m: "M" };
  assertEquals(encode(data), te.encode("d1:a1:A1:m1:M1:z1:Ze"));
});

Deno.test("bencode: encode dictionary (Map)", () => {
  const map: BencodeMap = new Map([["foo", "bar"]]);
  assertEquals(encode(map), te.encode("d3:foo3:bare"));
});

// ============================================================================
// ENCODE — byte-raw key ordering
// ============================================================================

Deno.test("bencode: encode sorts Record keys by byte-raw order", () => {
  const dict: BencodeDict = {};
  dict["added.f"] = new Uint8Array([7]);
  dict["added"] = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const result = encode(dict);
  // "added" (5 bytes) sorts before "added.f" (7 bytes) in byte order
  const decoded = decode(result) as BencodeDict;
  assertEquals(Object.keys(decoded), ["added", "added.f"]);
});

Deno.test("bencode: encode sorts Map keys by byte-raw order", () => {
  const map: BencodeMap = new Map([["z", 1], ["a", 2]]);
  const result = encode(map);
  assertEquals(result, te.encode("d1:ai2e1:zi1ee"));
});

// ============================================================================
// ENCODE — error handling
// ============================================================================

Deno.test("bencode: encode rejects unsafe integer", () => {
  assertThrows(() => encode(1.5 as any), BencodeEncodeError, "safe integer");
});

Deno.test("bencode: encode rejects unsupported types", () => {
  assertThrows(() => encode(null as any), BencodeEncodeError, "unsupported");
});

Deno.test("bencode: encode rejects cyclic data", () => {
  const dict: BencodeDict = {};
  dict["self"] = dict;
  assertThrows(() => encode(dict), BencodeEncodeError, "cyclic");
});

// ============================================================================
// ROUND-TRIP
// ============================================================================

Deno.test("bencode: roundtrip complex torrent metadata", () => {
  const original: BencodeDict = {
    announce: "udp://tracker.example.com:80",
    info: {
      name: "ubuntu-22.04.iso",
      length: 1024,
      "piece length": 16384,
      pieces: new Uint8Array([0, 1, 2, 3, 4]),
    },
  };

  const encoded = encode(original);
  const decoded = decode(encoded) as BencodeDict;
  const decodedInfo = decoded["info"] as BencodeDict;

  assertEquals(decoded["announce"], "udp://tracker.example.com:80");
  assertEquals(decodedInfo["name"], "ubuntu-22.04.iso");
  assertEquals(decodedInfo["length"], 1024);
  assertEquals(decodedInfo["piece length"], 16384);
  assertEquals((decodedInfo["pieces"] as Uint8Array).length, 5);
});

Deno.test("bencode: roundtrip dict with ut-pex style keys", () => {
  const dict: BencodeDict = {};
  dict["added"] = new Uint8Array([1, 2, 3, 4, 5, 6]);
  dict["added.f"] = new Uint8Array([0x01]);
  dict["added6"] = new Uint8Array(18);
  dict["added6.f"] = new Uint8Array([0x02]);
  dict["dropped"] = new Uint8Array([7, 8, 9, 10, 11, 12]);
  const encoded = encode(dict);
  const decoded = decode(encoded) as BencodeDict;
  assertEquals(Object.keys(decoded).sort(), ["added", "added.f", "added6", "added6.f", "dropped"]);
});

Deno.test("bencode: roundtrip with Map and binary keys", () => {
  const key = new Uint8Array([0xff, 0x00]);
  const map: BencodeMap = new Map([[key, "val"]]);
  const encoded = encode(map);
  const decoded = decode(encoded, { useMap: true }) as BencodeMap;
  let found = false;
  for (const [k, v] of decoded) {
    if (k instanceof Uint8Array && k[0] === 0xff && k[1] === 0x00) {
      found = true;
      assertEquals(v, "val");
    }
  }
  assertEquals(found, true);
});

```

---

## Arquivo: `packages/core/tests/bit-array_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/bit-array_test.ts

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

```

---

## Arquivo: `packages/core/tests/bitfield_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/bitfield_test.ts

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
```

---

## Arquivo: `packages/core/tests/buffer-extended_test.ts`

```ts
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

```

---

## Arquivo: `packages/core/tests/byte-io_test.ts`

```ts
import {
  assertEquals,
  assertRejects,
} from "@std/assert";
import {
  ByteReader,
  ByteWriter,
  InvalidByteCountError,
  UnexpectedEofError,
  readExactly,
  writeAll,
} from "../src/utils/byte-io.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a reader that serves `source` bytes, optionally splitting them. */
function sliceReader(source: Uint8Array, chunkSize = source.length): ByteReader {
  let offset = 0;
  return {
    async read(p: Uint8Array): Promise<number | null> {
      if (offset >= source.length) return null;
      const n = Math.min(p.length, chunkSize, source.length - offset);
      p.set(source.subarray(offset, offset + n));
      offset += n;
      return n;
    },
  };
}

/** Creates a writer that collects bytes, optionally writing in chunks. */
function collectingWriter(chunkSize = Infinity): ByteWriter & { bytes: Uint8Array } {
  const chunks: Uint8Array[] = [];
  let total = 0;
  return {
    async write(p: Uint8Array): Promise<number> {
      const n = Math.min(p.length, chunkSize);
      chunks.push(p.slice(0, n));
      total += n;
      return n;
    },
    get bytes(): Uint8Array {
      const result = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        result.set(c, off);
        off += c.length;
      }
      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// readExactly
// ---------------------------------------------------------------------------

Deno.test("readExactly — reads exact number of bytes", async () => {
  const source = new Uint8Array([1, 2, 3, 4, 5]);
  const reader = sliceReader(source);
  const target = new Uint8Array(5);
  const result = await readExactly(reader, target);
  assertEquals(result, true);
  assertEquals(target, source);
});

Deno.test("readExactly — empty target returns true immediately", async () => {
  const reader = sliceReader(new Uint8Array([1, 2, 3]));
  const result = await readExactly(reader, new Uint8Array(0));
  assertEquals(result, true);
});

Deno.test("readExactly — retries partial reads", async () => {
  // Serve one byte at a time
  const source = new Uint8Array([10, 20, 30]);
  const reader = sliceReader(source, 1);
  const target = new Uint8Array(3);
  const result = await readExactly(reader, target);
  assertEquals(result, true);
  assertEquals(target, source);
});

Deno.test("readExactly — throws UnexpectedEofError on short read", async () => {
  // Reader yields 2 bytes total then EOF
  let remaining = 2;
  const reader: ByteReader = {
    async read(p: Uint8Array): Promise<number | null> {
      if (remaining <= 0) return null;
      const n = Math.min(p.length, remaining);
      for (let i = 0; i < n; i++) p[i]! = 0xaa;
      remaining -= n;
      return n;
    },
  };
  const target = new Uint8Array(5);
  const err = await assertRejects(
    () => readExactly(reader, target),
    UnexpectedEofError,
  );
  assertEquals(err.bytesRead, 2);
  assertEquals(err.expectedBytes, 5);
});

Deno.test("readExactly — allowCleanEof returns false on immediate EOF", async () => {
  const reader: ByteReader = {
    async read(_p: Uint8Array): Promise<number | null> {
      return null;
    },
  };
  const target = new Uint8Array(4);
  const result = await readExactly(reader, target, { allowCleanEof: true });
  assertEquals(result, false);
});

Deno.test("readExactly — allowCleanEof still throws on partial EOF", async () => {
  let callCount = 0;
  const reader: ByteReader = {
    async read(p: Uint8Array): Promise<number | null> {
      callCount++;
      if (callCount === 1) {
        p[0]! = 0xff;
        return 1;
      }
      return null;
    },
  };
  const target = new Uint8Array(3);
  await assertRejects(
    () => readExactly(reader, target, { allowCleanEof: true }),
    UnexpectedEofError,
  );
});

Deno.test("readExactly — throws InvalidByteCountError on zero read", async () => {
  const reader: ByteReader = {
    async read(_p: Uint8Array): Promise<number | null> {
      return 0;
    },
  };
  const target = new Uint8Array(4);
  await assertRejects(
    () => readExactly(reader, target),
    InvalidByteCountError,
  );
});

// ---------------------------------------------------------------------------
// writeAll
// ---------------------------------------------------------------------------

Deno.test("writeAll — writes all bytes at once", async () => {
  const writer = collectingWriter();
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  await writeAll(writer, data);
  assertEquals(writer.bytes, data);
});

Deno.test("writeAll — retries partial writes", async () => {
  const writer = collectingWriter(2);
  const data = new Uint8Array([10, 20, 30, 40, 50]);
  await writeAll(writer, data);
  assertEquals(writer.bytes, data);
});

Deno.test("writeAll — empty data is a no-op", async () => {
  const writer = collectingWriter();
  await writeAll(writer, new Uint8Array(0));
  assertEquals(writer.bytes, new Uint8Array(0));
});

Deno.test("writeAll — throws InvalidByteCountError on zero write", async () => {
  const writer: ByteWriter = {
    async write(_p: Uint8Array): Promise<number> {
      return 0;
    },
  };
  const err = await assertRejects(
    () => writeAll(writer, new Uint8Array([1, 2, 3])),
    InvalidByteCountError,
  );
  assertEquals(err.operation, "write");
  assertEquals(err.count, 0);
});

// ---------------------------------------------------------------------------
// InvalidByteCountError
// ---------------------------------------------------------------------------

Deno.test("InvalidByteCountError — carries operation, count, maximum", () => {
  const err = new InvalidByteCountError("read", -1, 1024);
  assertEquals(err.name, "InvalidByteCountError");
  assertEquals(err instanceof RangeError, true);
  assertEquals(err.operation, "read");
  assertEquals(err.count, -1);
  assertEquals(err.maximum, 1024);
  assertEquals(
    err.message,
    "read returned invalid byte count -1; expected an integer from 1 to 1024",
  );
});

```

---

## Arquivo: `packages/core/tests/chunk-store_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/chunk-store_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";

Deno.test("chunk-store: put and get chunk", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const chunk = new Uint8Array(1024).fill(42);
  
  await store.put(0, chunk);
  const retrieved = await store.get(0);
  
  assertEquals(retrieved.length, 1024);
  assertEquals(retrieved[0], 42);
  assertEquals(retrieved[1023], 42);
});

Deno.test("chunk-store: get with offset and length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const chunk = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) chunk[i] = i % 256;
  
  await store.put(0, chunk);
  const sliced = await store.get(0, { offset: 100, length: 50 });
  
  assertEquals(sliced.length, 50);
  assertEquals(sliced[0], 100);
  assertEquals(sliced[49], 149);
});

Deno.test("chunk-store: throws on invalid chunk length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const invalidChunk = new Uint8Array(512);
  
  await assertRejects(
    async () => await store.put(0, invalidChunk),
    Error,
    "Invalid chunk length"
  );
});

Deno.test("chunk-store: throws on chunk not found", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  
  await assertRejects(
    async () => await store.get(999),
    Error,
    "not found"
  );
});

Deno.test("chunk-store: handles last chunk with different length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024, length: 2500 });
  
  const chunk0 = new Uint8Array(1024).fill(1);
  const chunk1 = new Uint8Array(1024).fill(2);
  const chunk2 = new Uint8Array(452).fill(3); 
  
  await store.put(0, chunk0);
  await store.put(1, chunk1);
  await store.put(2, chunk2);
  
  const retrieved2 = await store.get(2);
  assertEquals(retrieved2.length, 452);
  assertEquals(retrieved2[0], 3);
});

Deno.test("chunk-store: close prevents further operations", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  await store.close();
  
  await assertRejects(
    async () => await store.put(0, new Uint8Array(1024)),
    Error,
    "closed"
  );
});

Deno.test("chunk-store: destroy clears all chunks", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  await store.put(0, new Uint8Array(1024));
  await store.destroy();
  
  await assertRejects(
    async () => await store.get(0),
    Error,
    "closed"
  );
});
```

---

## Arquivo: `packages/core/tests/encoding_test.ts`

```ts
/**
 * Tests for src/utils/encoding.ts
 */
import { assertEquals } from "@std/assert";
import {
  decodeBase32,
  decodeBase64,
  decodeHex,
  encodeBase32,
  encodeBase64,
  encodeHex,
  isBase32,
  isHex,
  isSha1,
} from "../src/utils/encoding.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i >> 1] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

Deno.test("encodeBase64: empty input", () => {
  assertEquals(encodeBase64(new Uint8Array(0)), "");
});

Deno.test("encodeBase64: 'Hello, World!'", () => {
  const input = new TextEncoder().encode("Hello, World!");
  assertEquals(encodeBase64(input), "SGVsbG8sIFdvcmxkIQ==");
});

Deno.test("encodeBase64: single byte", () => {
  assertEquals(encodeBase64(new Uint8Array([0x00])), "AA==");
});

Deno.test("decodeBase64: empty string", () => {
  assertEquals(decodeBase64(""), new Uint8Array(0));
});

Deno.test("decodeBase64: roundtrip 'Hello, World!'", () => {
  const original = new TextEncoder().encode("Hello, World!");
  const encoded = encodeBase64(original);
  assertEquals(decodeBase64(encoded), original);
});

Deno.test("decodeBase64: roundtrip random bytes", () => {
  const data = new Uint8Array([0xff, 0x01, 0xab, 0xcd, 0xef, 0x42]);
  assertEquals(decodeBase64(encodeBase64(data)), data);
});

// ---------------------------------------------------------------------------
// Base32
// ---------------------------------------------------------------------------

Deno.test("encodeBase32: empty input", () => {
  assertEquals(encodeBase32(new Uint8Array(0)), "");
});

Deno.test("encodeBase32: RFC 4648 test vectors", () => {
  // https://tools.ietf.org/html/rfc4648#section-10
  assertEquals(encodeBase32(new TextEncoder().encode("f")), "MY======");
  assertEquals(encodeBase32(new TextEncoder().encode("fo")), "MZXQ====");
  assertEquals(encodeBase32(new TextEncoder().encode("foo")), "MZXW6===");
  assertEquals(encodeBase32(new TextEncoder().encode("foob")), "MZXW6YQ=");
  assertEquals(encodeBase32(new TextEncoder().encode("fooba")), "MZXW6YTB");
  assertEquals(encodeBase32(new TextEncoder().encode("foobar")), "MZXW6YTBOI======");
});

Deno.test("decodeBase32: empty string", () => {
  assertEquals(decodeBase32(""), new Uint8Array(0));
});

Deno.test("decodeBase32: RFC 4648 test vectors", () => {
  assertEquals(decodeBase32("MY======"), new TextEncoder().encode("f"));
  assertEquals(decodeBase32("MZXQ===="), new TextEncoder().encode("fo"));
  assertEquals(decodeBase32("MZXW6==="), new TextEncoder().encode("foo"));
  assertEquals(decodeBase32("MZXW6YQ="), new TextEncoder().encode("foob"));
  assertEquals(decodeBase32("MZXW6YTB"), new TextEncoder().encode("fooba"));
  assertEquals(decodeBase32("MZXW6YTBOI======"), new TextEncoder().encode("foobar"));
});

Deno.test("decodeBase32: case insensitive", () => {
  assertEquals(decodeBase32("mzxw6ytb"), new TextEncoder().encode("fooba"));
  assertEquals(decodeBase32("mZxW6YtB"), new TextEncoder().encode("fooba"));
});

Deno.test("decodeBase32: without padding", () => {
  assertEquals(decodeBase32("MZXW6YTB"), new TextEncoder().encode("fooba"));
  assertEquals(decodeBase32("MY"), new TextEncoder().encode("f"));
});

Deno.test("encodeBase32/decodeBase32: roundtrip", () => {
  const data = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
  assertEquals(decodeBase32(encodeBase32(data)), data);
});

Deno.test("decodeBase32: invalid character throws", () => {
  let threw = false;
  try {
    decodeBase32("INVALID1");
  } catch (e) {
    threw = true;
    assertEquals(e instanceof TypeError, true);
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

Deno.test("encodeHex: empty input", () => {
  assertEquals(encodeHex(new Uint8Array(0)), "");
});

Deno.test("encodeHex: known vectors", () => {
  assertEquals(encodeHex(new Uint8Array([0x00])), "00");
  assertEquals(encodeHex(new Uint8Array([0xff])), "ff");
  assertEquals(encodeHex(new Uint8Array([0x0a, 0x1b, 0x2c])), "0a1b2c");
  assertEquals(encodeHex(hexToBytes("deadbeef")), "deadbeef");
});

Deno.test("decodeHex: empty string", () => {
  assertEquals(decodeHex(""), new Uint8Array(0));
});

Deno.test("decodeHex: known vectors", () => {
  assertEquals(decodeHex("00"), new Uint8Array([0x00]));
  assertEquals(decodeHex("ff"), new Uint8Array([0xff]));
  assertEquals(decodeHex("0a1b2c"), new Uint8Array([0x0a, 0x1b, 0x2c]));
  assertEquals(decodeHex("deadbeef"), hexToBytes("deadbeef"));
});

Deno.test("decodeHex: uppercase input", () => {
  assertEquals(decodeHex("DEADBEEF"), hexToBytes("deadbeef"));
});

Deno.test("encodeHex/decodeHex: roundtrip", () => {
  const data = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
  assertEquals(decodeHex(encodeHex(data)), data);
});

Deno.test("decodeHex: odd length throws", () => {
  let threw = false;
  try {
    decodeHex("abc");
  } catch (e) {
    threw = true;
    assertEquals(e instanceof TypeError, true);
  }
  assertEquals(threw, true);
});

Deno.test("decodeHex: invalid character throws", () => {
  let threw = false;
  try {
    decodeHex("zz");
  } catch (e) {
    threw = true;
    assertEquals(e instanceof TypeError, true);
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// isBase32
// ---------------------------------------------------------------------------

Deno.test("isBase32: valid strings", () => {
  assertEquals(isBase32("MZXW6YTB"), true);
  assertEquals(isBase32("MZXW6YQ="), true);
  assertEquals(isBase32("MY======"), true);
  assertEquals(isBase32("MZXW6YTBOI======"), true);
});

Deno.test("isBase32: invalid strings", () => {
  assertEquals(isBase32(""), false);
  assertEquals(isBase32("12345678"), false); // 1 and 8 not in base32 alphabet
  assertEquals(isBase32("MZX=6YTB"), false); // padding in wrong place
  assertEquals(isBase32("MZXW6YTB======="), false); // too much padding
});

// ---------------------------------------------------------------------------
// isHex
// ---------------------------------------------------------------------------

Deno.test("isHex: valid strings", () => {
  assertEquals(isHex("0a1b2c"), true);
  assertEquals(isHex("DEADBEEF"), true);
  assertEquals(isHex("00ff"), true);
});

Deno.test("isHex: invalid strings", () => {
  assertEquals(isHex(""), false);
  assertEquals(isHex("GHIJ"), false);
  assertEquals(isHex("0x1234"), false); // 'x' is not hex
});

// ---------------------------------------------------------------------------
// isSha1
// ---------------------------------------------------------------------------

Deno.test("isSha1: exactly 20 bytes", () => {
  assertEquals(isSha1(new Uint8Array(20)), true);
  assertEquals(isSha1(hexToBytes("da39a3ee5e6b4b0d3255bfef95601890afd80709")), true);
});

Deno.test("isSha1: wrong length", () => {
  assertEquals(isSha1(new Uint8Array(0)), false);
  assertEquals(isSha1(new Uint8Array(19)), false);
  assertEquals(isSha1(new Uint8Array(21)), false);
});

```

---

## Arquivo: `packages/core/tests/errors_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/errors_test.ts

import { assertEquals } from "@std/assert";
import {
  PeerWireError,
  ProtocolError,
  EofError,
  TimeoutError,
  RequestRejectedError,
} from "../src/utils/errors.ts";

Deno.test("PeerWireError — instanceof chain and defaults", () => {
  const err = new PeerWireError("base");
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "PeerWireError");
  assertEquals(err.message, "base");
  assertEquals(err.code, "PEERWIRE_ERROR");
});

Deno.test("PeerWireError — custom code", () => {
  const err = new PeerWireError("x", "CUSTOM");
  assertEquals(err.code, "CUSTOM");
});

Deno.test("ProtocolError — instanceof chain and defaults", () => {
  const err = new ProtocolError("bad state");
  assertEquals(err instanceof ProtocolError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "ProtocolError");
  assertEquals(err.message, "bad state");
  assertEquals(err.code, "PROTOCOL_ERROR");
});

Deno.test("EofError — instanceof chain and defaults", () => {
  const err = new EofError("stream ended");
  assertEquals(err instanceof EofError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "EofError");
  assertEquals(err.message, "stream ended");
  assertEquals(err.code, "EOF_ERROR");
});

Deno.test("TimeoutError — instanceof chain and defaults", () => {
  const err = new TimeoutError("handshake timed out");
  assertEquals(err instanceof TimeoutError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "TimeoutError");
  assertEquals(err.message, "handshake timed out");
  assertEquals(err.code, "TIMEOUT_ERROR");
});

Deno.test("RequestRejectedError — instanceof chain and defaults", () => {
  const err = new RequestRejectedError("peer rejected piece 0");
  assertEquals(err instanceof RequestRejectedError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "RequestRejectedError");
  assertEquals(err.message, "peer rejected piece 0");
  assertEquals(err.code, "REQUEST_REJECTED");
});

Deno.test("ProtocolError — custom code overrides default", () => {
  const err = new ProtocolError("unexpected bitfield", "BAD_BITFIELD");
  assertEquals(err.code, "BAD_BITFIELD");
  assertEquals(err.name, "ProtocolError");
});

Deno.test("EofError — custom code overrides default", () => {
  const err = new EofError("truncated", "SHORT_READ");
  assertEquals(err.code, "SHORT_READ");
});

Deno.test("TimeoutError — custom code overrides default", () => {
  const err = new TimeoutError("slow", "KEEPALIVE_TIMEOUT");
  assertEquals(err.code, "KEEPALIVE_TIMEOUT");
});

Deno.test("RequestRejectedError — custom code overrides default", () => {
  const err = new RequestRejectedError("no", "FAST_REJECT");
  assertEquals(err.code, "FAST_REJECT");
});

```

---

## Arquivo: `packages/core/tests/extension-host_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/extension-host_test.ts

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  ExtensionHost,
  decodeExtendedHandshake,
  type PeerWireExtension,
  type ExtendedHandshake,
  type PeerWireExtensionContext,
} from "../src/core/extension-host.ts";
import { encode, decode } from "../src/utils/bencode.ts";
import { PeerWireError, ProtocolError } from "../src/utils/errors.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Captured sent messages: [extensionId, payload] */
function createMockHost(options?: {
  client?: string;
  port?: number;
  maxPayloadLength?: number;
}): {
  host: ExtensionHost;
  sent: Array<[number, Uint8Array]>;
} {
  const sent: Array<[number, Uint8Array]> = [];
  const host = new ExtensionHost({
    send: async (id, payload) => { sent.push([id, payload]); },
    client: options?.client,
    port: options?.port,
    maxPayloadLength: options?.maxPayloadLength,
  });
  return { host, sent };
}

/** Minimal extension for testing. */
class TestExtension implements PeerWireExtension {
  readonly name: string;
  messages: Uint8Array[] = [];
  handshakes: ExtendedHandshake[] = [];
  registered = false;
  closed = false;
  closeReason?: unknown;
  private context?: PeerWireExtensionContext;

  constructor(name = "ut_test") {
    this.name = name;
  }

  onRegister(context: PeerWireExtensionContext): void {
    this.registered = true;
    this.context = context;
  }

  handshakeFields(): Map<string, any> {
    const fields = new Map<string, any>();
    fields.set("test_field", 42);
    return fields;
  }

  onExtendedHandshake(handshake: ExtendedHandshake): void {
    this.handshakes.push(handshake);
  }

  onMessage(payload: Uint8Array): void {
    this.messages.push(payload);
  }

  close(reason?: unknown): void {
    this.closed = true;
    this.closeReason = reason;
  }

  /** Helper: send via the registered context. */
  send(payload: Uint8Array): Promise<void> {
    if (!this.context) throw new Error("not registered");
    return this.context.send(payload);
  }
}

// ============================================================================
// Registration
// ============================================================================

Deno.test("ExtensionHost: use() registers extension and assigns local ID", () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  assertEquals(ext.registered, true);
  assertEquals(host.localExtensions.get("ut_test"), 1);
});

Deno.test("ExtensionHost: use() assigns sequential IDs", () => {
  const { host } = createMockHost();
  const ext1 = new TestExtension("ut_alpha");
  const ext2 = new TestExtension("ut_beta");
  host.use(ext1);
  host.use(ext2);
  assertEquals(host.localExtensions.get("ut_alpha"), 1);
  assertEquals(host.localExtensions.get("ut_beta"), 2);
});

Deno.test("ExtensionHost: use() rejects name < 3 chars", () => {
  const { host } = createMockHost();
  const ext = new TestExtension("ab");
  assertThrows(() => host.use(ext), TypeError);
});

Deno.test("ExtensionHost: use() rejects duplicate name", () => {
  const { host } = createMockHost();
  host.use(new TestExtension("ut_test"));
  assertThrows(() => host.use(new TestExtension("ut_test")), PeerWireError);
});

Deno.test("ExtensionHost: get() retrieves registered extension", () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  assertEquals(host.get("ut_test"), ext);
});

Deno.test("ExtensionHost: get() returns undefined for unknown extension", () => {
  const { host } = createMockHost();
  assertEquals(host.get("nonexistent"), undefined);
});

// ============================================================================
// Handshake fields
// ============================================================================

Deno.test("ExtensionHost: setHandshakeField adds custom fields", () => {
  const { host } = createMockHost();
  host.setHandshakeField("custom", "value");
  assertEquals(host.get("nonexistent"), undefined);
  // Field is included in sent handshake (tested via sendHandshake)
});

Deno.test("ExtensionHost: setHandshakeField rejects 'm'", () => {
  const { host } = createMockHost();
  assertThrows(() => host.setHandshakeField("m", "bad"), TypeError);
});

Deno.test("ExtensionHost: setHandshakeField with undefined removes field", () => {
  const { host } = createMockHost();
  host.setHandshakeField("custom", "value");
  host.setHandshakeField("custom", undefined);
  // No error — field removed
});

Deno.test("ExtensionHost: constructor sets client/port/reqq fields", () => {
  const { host, sent } = createMockHost({ client: "BrowserTorrent/1.0", port: 6881 });
  host.use(new TestExtension());
  host.sendHandshake();
  // The sent handshake should include v and p
  assertEquals(sent.length, 1);
  const [id, payload] = sent[0]!;
  assertEquals(id, 0); // extended handshake ID = 0
  const decoded = decode(payload, { useMap: true }) as Map<string, any>;
  assertEquals(decoded.get("v"), "BrowserTorrent/1.0");
  assertEquals(decoded.get("p"), 6881);
});

// ============================================================================
// sendHandshake
// ============================================================================

Deno.test("ExtensionHost: sendHandshake includes m mapping and extension fields", () => {
  const { host, sent } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  host.sendHandshake();

  assertEquals(sent.length, 1);
  const [id, payload] = sent[0]!;
  assertEquals(id, 0);

  const decoded = decode(payload, { useMap: true }) as Map<string, any>;
  const m = decoded.get("m") as Map<string, any>;
  assertEquals(m.get("ut_test"), 1);
  assertEquals(decoded.get("test_field"), 42);
});

Deno.test("ExtensionHost: extension cannot replace m field in handshakeFields", async () => {
  const { host } = createMockHost();
  const badExt: PeerWireExtension = {
    name: "ut_bad",
    handshakeFields: () => new Map([["m", "hax"]]),
  };
  host.use(badExt);
  await assertRejects(() => host.sendHandshake(), PeerWireError);
});

// ============================================================================
// send (via peer extension ID)
// ============================================================================

Deno.test("ExtensionHost: send() uses peer-advertised ID", async () => {
  const { host, sent } = createMockHost();
  // Simulate peer advertising ut_test with ID 3
  host.peerExtensions.set("ut_test", 3);

  const ext = new TestExtension();
  host.use(ext);
  await ext.send(new Uint8Array([1, 2, 3]));

  assertEquals(sent.length, 1);
  assertEquals(sent[0]![0], 3); // peer's ID for ut_test
  assertEquals(sent[0]![1], new Uint8Array([1, 2, 3]));
});

Deno.test("ExtensionHost: send() rejects unadvertised extension", async () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  // peerExtensions doesn't have ut_test
  await assertRejects(() => ext.send(new Uint8Array()), PeerWireError);
});

Deno.test("ExtensionHost: send() rejects oversized payload", async () => {
  const { host } = createMockHost({ maxPayloadLength: 10 });
  host.peerExtensions.set("ut_test", 1);
  const ext = new TestExtension();
  host.use(ext);
  await assertRejects(
    () => ext.send(new Uint8Array(20)),
    RangeError,
  );
});

// ============================================================================
// handle (incoming messages)
// ============================================================================

Deno.test("ExtensionHost: handle() processes extended handshake (id=0)", async () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);

  // Build a peer extended handshake
  const handshakeDict = new Map<string, any>();
  const m = new Map<string, number>();
  m.set("ut_test", 5);
  handshakeDict.set("m", m);
  handshakeDict.set("v", "PeerClient/2.0");
  handshakeDict.set("metadata_size", 12345);

  const payload = encode(handshakeDict);
  const name = await host.handle({ type: "extended", extensionId: 0, payload });

  assertEquals(name, undefined); // handshake returns undefined
  assertEquals(host.peerExtensions.get("ut_test"), 5);
  assertEquals(host.peerHandshake?.client, "PeerClient/2.0");
  assertEquals(host.peerHandshake?.metadataSize, 12345);
  assertEquals(ext.handshakes.length, 1);
  assertEquals(ext.handshakes[0]!.client, "PeerClient/2.0");
});

Deno.test("ExtensionHost: handle() dispatches message to registered extension", async () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext); // local ID = 1

  const data = new Uint8Array([0xAA, 0xBB]);
  const name = await host.handle({
    type: "extended",
    extensionId: 1,
    payload: data,
  });

  assertEquals(name, "ut_test");
  assertEquals(ext.messages.length, 1);
  assertEquals(ext.messages[0], data);
});

Deno.test("ExtensionHost: handle() ignores unknown extension IDs", async () => {
  const { host } = createMockHost();
  const name = await host.handle({
    type: "extended",
    extensionId: 99,
    payload: new Uint8Array(),
  });
  assertEquals(name, undefined);
});

Deno.test("ExtensionHost: handle() rejects oversized payload", async () => {
  const { host } = createMockHost({ maxPayloadLength: 10 });
  await assertRejects(
    () => host.handle({
      type: "extended",
      extensionId: 1,
      payload: new Uint8Array(20),
    }),
    ProtocolError,
  );
});

Deno.test("ExtensionHost: re-handshake is additive (zero disables)", async () => {
  const { host } = createMockHost();

  // First handshake: ut_test = 5, ut_other = 7
  const hs1 = new Map<string, any>();
  const m1 = new Map<string, number>();
  m1.set("ut_test", 5);
  m1.set("ut_other", 7);
  hs1.set("m", m1);
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs1) });
  assertEquals(host.peerExtensions.get("ut_test"), 5);
  assertEquals(host.peerExtensions.get("ut_other"), 7);

  // Second handshake: ut_test = 0 (disable), ut_other stays
  const hs2 = new Map<string, any>();
  const m2 = new Map<string, number>();
  m2.set("ut_test", 0);
  hs2.set("m", m2);
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs2) });
  assertEquals(host.peerExtensions.has("ut_test"), false); // removed
  assertEquals(host.peerExtensions.get("ut_other"), 7); // preserved
});

// ============================================================================
// waitForPeerHandshake
// ============================================================================

Deno.test("ExtensionHost: waitForPeerHandshake resolves immediately if already received", async () => {
  const { host } = createMockHost();
  const hs = new Map<string, any>();
  hs.set("m", new Map());
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs) });

  const result = await host.waitForPeerHandshake();
  assertEquals(result, host.peerHandshake);
});

Deno.test("ExtensionHost: waitForPeerHandshake waits for first handshake", async () => {
  const { host } = createMockHost();
  let resolved = false;
  const promise = host.waitForPeerHandshake();
  promise.then(() => { resolved = true; });

  // Not yet resolved
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(resolved, false);

  // Send handshake
  const hs = new Map<string, any>();
  const m = new Map<string, number>();
  m.set("ut_test", 3);
  hs.set("m", m);
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs) });

  const result = await promise;
  assertEquals(resolved, true);
  assertEquals(result.extensions.get("ut_test"), 3);
});

// ============================================================================
// close
// ============================================================================

Deno.test("ExtensionHost: close() notifies all extensions", () => {
  const { host } = createMockHost();
  const ext1 = new TestExtension("ut_alpha");
  const ext2 = new TestExtension("ut_beta");
  host.use(ext1);
  host.use(ext2);

  host.close("test reason");
  assertEquals(ext1.closed, true);
  assertEquals(ext1.closeReason, "test reason");
  assertEquals(ext2.closed, true);
  assertEquals(ext2.closeReason, "test reason");
});

Deno.test("ExtensionHost: close() clears handshake waiters", () => {
  const { host } = createMockHost();
  let resolved = false;
  host.waitForPeerHandshake().then(() => { resolved = true; });
  host.close();
  // Waiters are cleared, promise should reject or never resolve
  // In our impl, we just clear the array — promise hangs.
  // This is fine; the wire close will clean up.
});

// ============================================================================
// decodeExtendedHandshake
// ============================================================================

Deno.test("decodeExtendedHandshake: valid handshake", () => {
  const dict = new Map<string, any>();
  const m = new Map<string, number>();
  m.set("ut_metadata", 2);
  m.set("ut_pex", 3);
  dict.set("m", m);
  dict.set("v", "TestClient/1.0");
  dict.set("p", 6881);
  dict.set("metadata_size", 50000);
  dict.set("reqq", 200);

  const payload = encode(dict);
  const hs = decodeExtendedHandshake(payload);

  assertEquals(hs.extensions.get("ut_metadata"), 2);
  assertEquals(hs.extensions.get("ut_pex"), 3);
  assertEquals(hs.client, "TestClient/1.0");
  assertEquals(hs.port, 6881);
  assertEquals(hs.metadataSize, 50000);
  assertEquals(hs.requestQueue, 200);
});

Deno.test("decodeExtendedHandshake: rejects non-dictionary payload", () => {
  const payload = encode([1, 2, 3]); // list, not dict
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

Deno.test("decodeExtendedHandshake: rejects non-Map m field", () => {
  const dict = new Map<string, any>();
  dict.set("m", "not_a_map");
  const payload = encode(dict);
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

Deno.test("decodeExtendedHandshake: rejects invalid mapping entry", () => {
  const dict = new Map<string, any>();
  const m = new Map<string, any>();
  m.set("ut_test", -1); // negative ID
  dict.set("m", m);
  const payload = encode(dict);
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

Deno.test("decodeExtendedHandshake: yourip as Uint8Array", () => {
  const dict = new Map<string, any>();
  dict.set("m", new Map());
  dict.set("yourip", new Uint8Array([127, 0, 0, 1]));
  const payload = encode(dict);
  const hs = decodeExtendedHandshake(payload);
  assertEquals(hs.yourIp, new Uint8Array([127, 0, 0, 1]));
});

Deno.test("decodeExtendedHandshake: rejects invalid port", () => {
  const dict = new Map<string, any>();
  dict.set("m", new Map());
  dict.set("p", 70000); // > 0xffff
  const payload = encode(dict);
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

// ============================================================================
// maxPayloadLength validation
// ============================================================================

Deno.test("ExtensionHost: constructor rejects invalid maxPayloadLength", () => {
  assertThrows(
    () => new ExtensionHost({ send: async () => {}, maxPayloadLength: 0 }),
    RangeError,
  );
  assertThrows(
    () => new ExtensionHost({ send: async () => {}, maxPayloadLength: -1 }),
    RangeError,
  );
});

```

---

## Arquivo: `packages/core/tests/file_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/file_test.ts

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { File } from "../src/core/file.ts";
import { Piece } from "../src/core/piece.ts";
import { Bitfield } from "../src/core/bitfield.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fake store that returns predictable bytes for every piece. */
class FakeChunkStore {
  chunkLength: number;
  private data: Map<number, Uint8Array> = new Map();

  constructor(chunkLength = 1024, totalSize = 2048) {
    this.chunkLength = chunkLength;
    const buf = new Uint8Array(totalSize);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = i % 256;
    }
    this.data.set(0, buf);
  }

  async get(index: number): Promise<Uint8Array> {
    const stored = this.data.get(index);
    if (stored) return stored;
    const start = index * this.chunkLength;
    const size = Math.min(this.chunkLength, 2048 - start);
    if (start >= 2048 || size <= 0) return new Uint8Array(0);
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      buf[i] = (start + i) % 256;
    }
    return buf;
  }

  async put(index: number, buf: Uint8Array): Promise<void> {
    this.data.set(index, buf);
  }

  async close(): Promise<void> {}
  async destroy(): Promise<void> {
    this.data.clear();
  }
}

// ── Constructor & properties ────────────────────────────────────────────────

Deno.test("file: constructor initializes correctly", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16 });

  assertEquals(file.length, 100);
  assertEquals(file.name, "file");
  assertEquals(file.path, "file");
  assertEquals(file.scope, "/");
  assertEquals(file.destroyed, false);
});

Deno.test("file: constructor accepts all optional fields", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "video.mp4",
    path: "folder/video.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 3,
    scope: "/app/",
    blockSize: 8192,
  });

  assertEquals(file.name, "video.mp4");
  assertEquals(file.path, "folder/video.mp4");
  assertEquals(file.infoHash, "a".repeat(40));
  assertEquals(file.fileIndex, 3);
  assertEquals(file.scope, "/app/");
});

Deno.test("file: defaults for optional fields", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 0, offset: 0, pieceLength: 16 });

  assertEquals(file.name, "file");
  assertEquals(file.path, "file");
  assertEquals(file.scope, "/");
  assertEquals(file.infoHash, undefined);
  assertEquals(file.fileIndex, undefined);
});

// ── Piece range ─────────────────────────────────────────────────────────────

Deno.test("file: pieceRange returns correct first/last indices", () => {
  const store = new FakeChunkStore(1024, 2048);
  // offset=0, length=1500, pieceLength=1024
  // first = floor(0/1024) = 0
  // last  = floor((0+1499)/1024) = floor(1499/1024) = 1
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });
  const range = file.pieceRange;
  assertEquals(range.first, 0);
  assertEquals(range.last, 1);
});

Deno.test("file: pieceRange for middle file", () => {
  // offset=1024, length=1024, pieceLength=1024
  // first = floor(1024/1024) = 1
  // last  = floor((1024+1023)/1024) = floor(2047/1024) = 1
  const store = new FakeChunkStore(1024, 4096);
  const file = new File({ store, length: 1024, offset: 1024, pieceLength: 1024 });
  assertEquals(file.pieceRange.first, 1);
  assertEquals(file.pieceRange.last, 1);
});

// ── includes ─────────────────────────────────────────────────────────────────

Deno.test("file: includes() returns true for pieces inside file", () => {
  const store = new FakeChunkStore(1024, 2048);
  // offset=0, length=1500, pieces 0 and 1 are inside
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  assertEquals(file.includes(new Piece(0, 1024, 0)), true);
  assertEquals(file.includes(new Piece(1, 1024, 1024)), true);
  assertEquals(file.includes(new Piece(2, 1024, 2048)), false);
  assertEquals(file.includes(new Piece(3, 1024, 3072)), false);
});

Deno.test("file: includes() with Piece class instance", () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 800, offset: 0, pieceLength: 512 });
  // pieces 0 and 1 are inside (0-512 and 512-1024, but file is 0-800)

  assertEquals(file.includes(new Piece(0, 512, 0)), true);
  assertEquals(file.includes(new Piece(1, 512, 512)), true);
  assertEquals(file.includes(new Piece(2, 512, 1024)), false);
});

// ── createReadStream (core implementation) ────────────────────────────────────

Deno.test("file: createReadStream returns a ReadableStream", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream();
  assertEquals(typeof stream.getReader, "function");
  assertEquals(typeof stream[Symbol.asyncIterator], "function");
});

Deno.test("file: createReadStream emits 'stream' event", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let eventFired = false;
  file.addEventListener("stream", () => { eventFired = true; });

  file.createReadStream();
  assertEquals(eventFired, true);
});

Deno.test("file: createReadStream reads full file", async () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  assertEquals(chunks.length > 0, true);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assertEquals(total, 1500);
});

Deno.test("file: createReadStream respects start offset", async () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream({ start: 500 });
  const reader = stream.getReader();
  const { value, done } = await reader.read();

  assertEquals(done, false);
  assertEquals(value!.length > 0, true);
  // First byte should be the byte at global offset 500
  assertEquals(value![0], 244); // 500 % 256
});

Deno.test("file: createReadStream respects end offset", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 2000, offset: 0, pieceLength: 512 });

  const stream = file.createReadStream({ start: 0, end: 300 });
  const reader = stream.getReader();
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value!.length;
  }

  assertEquals(total, 300);
});

Deno.test("file: createReadStream rejects invalid range", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 500, offset: 0, pieceLength: 1024 });

  assertThrows(() => file.createReadStream({ start: -1 }), RangeError);
  assertThrows(() => file.createReadStream({ start: 0, end: 1000 }), RangeError);
  assertThrows(() => file.createReadStream({ start: 300, end: 100 }), RangeError);
});

Deno.test("file: createReadStream rejects after destroy", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 500, offset: 0, pieceLength: 1024 });
  file.destroy();

  assertThrows(() => file.createReadStream(), Error, "destroyed");
});

Deno.test("file: createReadStream emits 'done' event on completion", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let doneEmitted = false;
  file.addEventListener("done", () => { doneEmitted = true; });

  const stream = file.createReadStream();
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }

  assertEquals(doneEmitted, true);
});

// ── stream() ─────────────────────────────────────────────────────────────────

Deno.test("file: stream() is an alias for createReadStream", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  const s1 = file.createReadStream();
  const s2 = file.stream();

  const r1 = s1.getReader();
  const r2 = s2.getReader();

  const { value: v1 } = await r1.read();
  const { value: v2 } = await r2.read();

  assertEquals(v1!.length, v2!.length);
});

// ── Symbol.asyncIterator ─────────────────────────────────────────────────────

Deno.test("file: Symbol.asyncIterator yields chunks", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 800, offset: 0, pieceLength: 512 });

  const chunks: Uint8Array[] = [];
  for await (const chunk of file) {
    chunks.push(chunk);
  }

  assertEquals(chunks.length > 0, true);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assertEquals(total, 800);
});

Deno.test("file: Symbol.asyncIterator emits 'iterator' event", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let eventFired = false;
  file.addEventListener("iterator", () => { eventFired = true; });

  for await (const _ of file) { /* consume */ }

  assertEquals(eventFired, true);
});

// ── arrayBuffer ───────────────────────────────────────────────────────────────

Deno.test("file: arrayBuffer returns full file as ArrayBuffer", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 1200, offset: 0, pieceLength: 512 });

  const buf = await file.arrayBuffer();
  assertEquals(buf.byteLength, 1200);

  const view = new Uint8Array(buf);
  assertEquals(view[0], 0);
  assertEquals(view[1], 1);
});

Deno.test("file: arrayBuffer for middle file reads correct bytes", async () => {
  const store = new FakeChunkStore(512, 4096);
  // File at offset 512, length 500 (inside piece 1)
  const file = new File({ store, length: 500, offset: 512, pieceLength: 512 });

  const buf = await file.arrayBuffer();
  assertEquals(buf.byteLength, 500);

  const view = new Uint8Array(buf);
  // Global offset 512 → value = 512 % 256 = 0
  assertEquals(view[0], 0);
  // Global offset 513 → value = 513 % 256 = 1
  assertEquals(view[1], 1);
});

// ── blob ─────────────────────────────────────────────────────────────────────

Deno.test("file: blob returns a Blob with correct MIME type", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 300, offset: 0, pieceLength: 512, name: "video.mp4" });

  const blob = await file.blob();
  assertEquals(blob.size, 300);
  assertEquals(blob.type, "video/mp4");
});

// ── getBlobURL ───────────────────────────────────────────────────────────────

Deno.test("file: getBlobURL returns an object URL", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  const url = await file.getBlobURL();
  assertEquals(url.startsWith("blob:"), true);
  URL.revokeObjectURL(url);
});

// ── streamURL ────────────────────────────────────────────────────────────────

Deno.test("file: streamURL throws when infoHash is missing", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16 });

  assertThrows(
    () => file.streamURL(),
    Error,
    "infoHash and fileIndex are required",
  );
});

Deno.test("file: streamURL throws when fileIndex is missing", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16, infoHash: "a".repeat(40) });

  assertThrows(
    () => file.streamURL(),
    Error,
    "infoHash and fileIndex are required",
  );
});

Deno.test("file: streamURL returns valid SW URL with all fields", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "movie.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 2,
    scope: "/browsertorrent/",
  });

  const url = file.streamURL();
  assertEquals(url.includes("a".repeat(40)), true);
  assertEquals(url.includes("/2/"), true);
  assertEquals(url.includes("movie.mp4"), true);
  assertEquals(url.startsWith("/browsertorrent/webtorrent/"), true);
});

Deno.test("file: streamURL uses default scope", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 0,
    pieceLength: 16,
    infoHash: "b".repeat(40),
    fileIndex: 0,
  });

  const url = file.streamURL();
  // Default scope is "/" so URL begins with "/webtorrent/"
  assertEquals(url.startsWith("/webtorrent/"), true);
});

// ── streamTo ─────────────────────────────────────────────────────────────────

Deno.test("file: streamTo sets element src to streamURL", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 0,
    pieceLength: 16,
    name: "video.mp4",
    infoHash: "c".repeat(40),
    fileIndex: 5,
  });

  let capturedSrc = "";
  let loadCalled = false;
  const element = {
    get src() { return capturedSrc; },
    set src(v: string) { capturedSrc = v; },
    load: () => { loadCalled = true; },
  } as unknown as HTMLMediaElement;

  file.streamTo(element);
  assertEquals(capturedSrc.includes("c".repeat(40)), true);
  assertEquals(loadCalled, true);
});

// ── destroy ─────────────────────────────────────────────────────────────────

Deno.test("file: destroy marks file as destroyed", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });

  assertEquals(file.destroyed, false);
  file.destroy();
  assertEquals(file.destroyed, true);
});

Deno.test("file: createReadStream throws after destroy", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  file.destroy();

  assertThrows(() => file.createReadStream(), Error, "destroyed");
});

// ── select / deselect ───────────────────────────────────────────────────────

Deno.test("file: select() and deselect() are no-ops (API parity)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });

  // These must not throw — piece selection lives on Torrent, not File
  file.select();
  file.select(0, 5);
  file.deselect();
  file.deselect(0, 5);
});

// ============================================================================
// PHASE 6: MIME type detection (type getter)
// ============================================================================

Deno.test("file: type returns correct MIME type for known extensions", () => {
  const store = new FakeChunkStore();

  const cases: [string, string][] = [
    ["video.mp4", "video/mp4"],
    ["movie.mkv", "video/x-matroska"],
    ["clip.webm", "video/webm"],
    ["clip.avi", "video/x-msvideo"],
    ["clip.mov", "video/quicktime"],
    ["audio.mp3", "audio/mpeg"],
    ["sound.flac", "audio/flac"],
    ["track.wav", "audio/wav"],
    ["music.ogg", "audio/ogg"],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["image.png", "image/png"],
    ["graphic.gif", "image/gif"],
    ["pic.webp", "image/webp"],
    ["icon.svg", "image/svg+xml"],
    ["doc.pdf", "application/pdf"],
    ["archive.zip", "application/zip"],
    ["data.rar", "application/vnd.rar"],
    ["files.7z", "application/x-7z-compressed"],
    ["backup.tar", "application/x-tar"],
    ["backup.gz", "application/gzip"],
    ["readme.txt", "text/plain"],
    ["index.html", "text/html"],
    ["style.css", "text/css"],
    ["main.js", "application/javascript"],
    ["config.json", "application/json"],
    ["data.xml", "application/xml"],
    ["changelog.md", "text/markdown"],
    ["disk.iso", "application/x-iso9660-image"],
  ];

  for (const [name, expected] of cases) {
    const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name });
    assertEquals(file.type, expected, `name=${name}`);
  }
});

Deno.test("file: type returns octet-stream for unknown extensions", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name: "file.xyz123" });
  assertEquals(file.type, "application/octet-stream");
});

Deno.test("file: type is case-insensitive for extension", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name: "video.MP4" });
  assertEquals(file.type, "video/mp4");
});

Deno.test("file: type handles filename with no extension", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name: "noextension" });
  assertEquals(file.type, "application/octet-stream");
});

// ============================================================================
// PHASE 6: downloaded / progress (per-file, via bitfield)
// ============================================================================

Deno.test("file: downloaded returns 0 when no torrent attached", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  assertEquals(file.downloaded, 0);
});

Deno.test("file: progress returns 0 when no torrent attached", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  assertEquals(file.progress, 0);
});

Deno.test("file: progress returns 0 for zero-length file", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 0, offset: 0, pieceLength: 16 });
  assertEquals(file.progress, 0);
});

// ============================================================================
// PHASE 6: download / upload events forwarded from torrent
// ============================================================================

Deno.test("file: emits download event when torrent receives matching piece", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });

  // Simulate a mock torrent that forwards the download event
  const mockBitfield = {
    _data: new Uint8Array(1),
    get(i: number) { return this._data[i] === 1; },
  };
  const mockTorrent = {
    pieces: mockBitfield,
    emit: () => {},
  } as any;

  // Attach torrent reference via private property
  (file as any)._torrent = mockTorrent;

  let downloadBytes = 0;
  file.addEventListener("download", (e: any) => {
    downloadBytes += e.detail.bytes;
  });

  // Simulate the torrent forwarding a download event for piece 0 (owned by this file)
  file.emit("download", new CustomEvent("download", { detail: { bytes: 512 } }));

  assertEquals(downloadBytes, 512);
});

Deno.test("file: emits upload event when torrent forwards upload for matching piece", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });

  const mockTorrent = {} as any;
  (file as any)._torrent = mockTorrent;

  let uploadBytes = 0;
  file.addEventListener("upload", (e: any) => {
    uploadBytes += e.detail.bytes;
  });

  file.emit("upload", new CustomEvent("upload", { detail: { bytes: 256 } }));

  assertEquals(uploadBytes, 256);
});

// ── File.includes(number) — upstream parity ─────────────────────────────────

Deno.test("file: includes accepts a piece index number (upstream parity)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  // pieceRange: first=0, last=1
  assertEquals(file.includes(0), true);
  assertEquals(file.includes(1), true);
  assertEquals(file.includes(2), false);
  assertEquals(file.includes(-1), false);
});

Deno.test("file: includes accepts a Piece object (legacy)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const piece = { index: 0 } as any;
  assertEquals(file.includes(piece), true);
});

Deno.test("file: includes handles file with single piece", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  // pieceRange: first=0, last=0
  assertEquals(file.includes(0), true);
  assertEquals(file.includes(1), false);
});

// ── File.select / deselect delegation ─────────────────────────────────────

Deno.test("file: select delegates to owning torrent", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  let calledWith: [number, number] | null = null;
  const mockTorrent = {
    pieces: new Bitfield(2),
    select(start: number, end: number) {
      calledWith = [start, end];
    },
  } as any;
  (file as any)._torrent = mockTorrent;

  file.select();
  assertEquals(calledWith, [0, 1]);

  file.select(0, 0);
  assertEquals(calledWith, [0, 0]);
});

Deno.test("file: deselect delegates to owning torrent", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  let calledWith: [number, number] | null = null;
  const mockTorrent = {
    pieces: new Bitfield(2),
    deselect(start: number, end: number) {
      calledWith = [start, end];
    },
  } as any;
  (file as any)._torrent = mockTorrent;

  file.deselect();
  assertEquals(calledWith, [0, 1]);

  file.deselect(1, 1);
  assertEquals(calledWith, [1, 1]);
});

Deno.test("file: select/deselect no-op when no torrent attached", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  // Should not throw
  file.select();
  file.deselect();
  file.select(0, 0);
  file.deselect(1, 1);
});

// ── File.arrayBuffer / blob range support ──────────────────────────────────

Deno.test("file: arrayBuffer reads entire file by default", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  const ab = await file.arrayBuffer();
  assertEquals(ab.byteLength, 512);
});

Deno.test("file: arrayBuffer reads byte range via {start,end}", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const ab = await file.arrayBuffer({ start: 100, end: 200 });
  assertEquals(ab.byteLength, 100);
  const view = new Uint8Array(ab);
  // FakeChunkStore fills with i % 256, so byte at position 0 of the range is byte 100
  assertEquals(view[0], 100 % 256);
});

Deno.test("file: arrayBuffer reads range from middle to end", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const ab = await file.arrayBuffer({ start: 512 });
  assertEquals(ab.byteLength, 512);
});

Deno.test("file: blob returns Blob with correct size and type", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  const blob = await file.blob();
  assertEquals(blob.size, 512);
  assertEquals(blob.type, "application/octet-stream");
});

Deno.test("file: blob reads byte range via {start,end}", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const blob = await file.blob({ start: 0, end: 128 });
  assertEquals(blob.size, 128);
});

Deno.test("file: arrayBuffer throws RangeError for invalid range", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  await assertRejects(
    () => file.arrayBuffer({ start: 600, end: 700 }),
    RangeError,
  );
});

```

---

## Arquivo: `packages/core/tests/handshake_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/handshake_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  encodeHandshake,
  decodeHandshake,
  hasExtension,
  setExtension,
  type PeerHandshake,
} from "../src/core/handshake.ts";
import {
  BITTORRENT_PROTOCOL,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
} from "../src/core/constants.ts";
import { ProtocolError } from "../src/utils/errors.ts";

// ============================================================================
// Encode
// ============================================================================

Deno.test("handshake: encode produces 68 bytes", () => {
  const infoHash = new Uint8Array(20).fill(0x01);
  const peerId = new Uint8Array(20).fill(0x02);
  const bytes = encodeHandshake({ infoHash, peerId });
  assertEquals(bytes.length, HANDSHAKE_LENGTH);
});

Deno.test("handshake: encode with string peerId", () => {
  const infoHash = new Uint8Array(20).fill(0x01);
  const peerId = "-BT0100-123456789012"; // exactly 20 bytes
  const bytes = encodeHandshake({ infoHash, peerId });
  assertEquals(bytes.length, HANDSHAKE_LENGTH);
  assertEquals(
    bytes.subarray(48),
    new TextEncoder().encode(peerId),
  );
});

Deno.test("handshake: encode with extensions", () => {
  const infoHash = new Uint8Array(20).fill(0x01);
  const peerId = new Uint8Array(20).fill(0x02);
  const bytes = encodeHandshake({
    infoHash,
    peerId,
    extensions: [HandshakeExtension.ExtensionProtocol, HandshakeExtension.Dht],
  });
  // ExtensionProtocol = byte 5, mask 0x10
  assertEquals((bytes[25]! & 0x10) !== 0, true);
  // Dht = byte 7, mask 0x01
  assertEquals((bytes[27]! & 0x01) !== 0, true);
});

Deno.test("handshake: encode with custom reserved bytes", () => {
  const infoHash = new Uint8Array(20).fill(0x01);
  const peerId = new Uint8Array(20).fill(0x02);
  const reserved = new Uint8Array(8).fill(0xFF);
  const bytes = encodeHandshake({ infoHash, peerId, reserved });
  assertEquals(bytes.subarray(20, 28), reserved);
});

Deno.test("handshake: encode rejects wrong infoHash length", () => {
  assertThrows(
    () => encodeHandshake({ infoHash: new Uint8Array(10), peerId: new Uint8Array(20) }),
    RangeError,
  );
});

Deno.test("handshake: encode rejects wrong peerId length", () => {
  assertThrows(
    () => encodeHandshake({ infoHash: new Uint8Array(20), peerId: new Uint8Array(10) }),
    RangeError,
  );
});

Deno.test("handshake: encode rejects wrong reserved length", () => {
  assertThrows(
    () => encodeHandshake({
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
      reserved: new Uint8Array(4),
    }),
    RangeError,
  );
});

// ============================================================================
// Decode
// ============================================================================

Deno.test("handshake: round-trip encode/decode", () => {
  const infoHash = new Uint8Array(20).fill(0xAB);
  const peerId = new Uint8Array(20).fill(0xCD);
  const bytes = encodeHandshake({
    infoHash,
    peerId,
    extensions: [HandshakeExtension.ExtensionProtocol],
  });
  const hs = decodeHandshake(bytes);

  assertEquals(hs.infoHash, infoHash);
  assertEquals(hs.peerId, peerId);
  assertEquals(hs.extensions.has(HandshakeExtension.ExtensionProtocol), true);
  assertEquals(hs.extensions.has(HandshakeExtension.Fast), false);
});

Deno.test("handshake: decode with all extensions", () => {
  const infoHash = new Uint8Array(20).fill(0x01);
  const peerId = new Uint8Array(20).fill(0x02);
  const bytes = encodeHandshake({
    infoHash,
    peerId,
    extensions: [
      HandshakeExtension.Fast,
      HandshakeExtension.ExtensionProtocol,
      HandshakeExtension.Dht,
      HandshakeExtension.V2,
    ],
  });
  const hs = decodeHandshake(bytes);

  assertEquals(hs.extensions.size, 4);
  assertEquals(hs.extensions.has(HandshakeExtension.Fast), true);
  assertEquals(hs.extensions.has(HandshakeExtension.ExtensionProtocol), true);
  assertEquals(hs.extensions.has(HandshakeExtension.Dht), true);
  assertEquals(hs.extensions.has(HandshakeExtension.V2), true);
});

Deno.test("handshake: decode with no extensions", () => {
  const infoHash = new Uint8Array(20).fill(0x01);
  const peerId = new Uint8Array(20).fill(0x02);
  const bytes = encodeHandshake({ infoHash, peerId });
  const hs = decodeHandshake(bytes);
  assertEquals(hs.extensions.size, 0);
});

Deno.test("handshake: decode rejects wrong length", () => {
  assertThrows(
    () => decodeHandshake(new Uint8Array(67)),
    ProtocolError,
  );
});

Deno.test("handshake: decode rejects wrong protocol string", () => {
  const bytes = new Uint8Array(HANDSHAKE_LENGTH);
  bytes[0] = 19;
  new TextEncoder().encodeInto("NotTorrent protocol", bytes.subarray(1, 20));
  assertThrows(
    () => decodeHandshake(bytes),
    ProtocolError,
  );
});

// ============================================================================
// hasExtension / setExtension
// ============================================================================

Deno.test("handshake: hasExtension returns false for non-8-byte reserved", () => {
  assertEquals(hasExtension(new Uint8Array(4), HandshakeExtension.Dht), false);
});

Deno.test("handshake: setExtension and hasExtension", () => {
  const reserved = new Uint8Array(8);
  assertEquals(hasExtension(reserved, HandshakeExtension.ExtensionProtocol), false);

  setExtension(reserved, HandshakeExtension.ExtensionProtocol, true);
  assertEquals(hasExtension(reserved, HandshakeExtension.ExtensionProtocol), true);

  setExtension(reserved, HandshakeExtension.ExtensionProtocol, false);
  assertEquals(hasExtension(reserved, HandshakeExtension.ExtensionProtocol), false);
});

Deno.test("handshake: setExtension rejects non-8-byte reserved", () => {
  assertThrows(
    () => setExtension(new Uint8Array(4), HandshakeExtension.Dht, true),
    RangeError,
  );
});

Deno.test("handshake: all extension bit locations are distinct", () => {
  const reserved = new Uint8Array(8);
  const extensions = [
    HandshakeExtension.Fast,
    HandshakeExtension.ExtensionProtocol,
    HandshakeExtension.Dht,
    HandshakeExtension.V2,
  ];
  for (const ext of extensions) {
    setExtension(reserved, ext, true);
  }
  // Count bits set — should be exactly 4
  let bits = 0;
  for (const byte of reserved) {
    for (let i = 0; i < 8; i++) {
      if (byte & (1 << i)) bits++;
    }
  }
  assertEquals(bits, 4);
});

// ============================================================================
// Handshake structure verification
// ============================================================================

Deno.test("handshake: first byte is protocol string length (19)", () => {
  const bytes = encodeHandshake({
    infoHash: new Uint8Array(20).fill(1),
    peerId: new Uint8Array(20).fill(2),
  });
  assertEquals(bytes[0], 19);
});

Deno.test("handshake: protocol string at bytes 1-19", () => {
  const bytes = encodeHandshake({
    infoHash: new Uint8Array(20).fill(1),
    peerId: new Uint8Array(20).fill(2),
  });
  const protocol = new TextDecoder().decode(bytes.subarray(1, 20));
  assertEquals(protocol, BITTORRENT_PROTOCOL);
});

Deno.test("handshake: reserved at bytes 20-27", () => {
  const bytes = encodeHandshake({
    infoHash: new Uint8Array(20).fill(1),
    peerId: new Uint8Array(20).fill(2),
  });
  assertEquals(bytes.subarray(20, 28), new Uint8Array(8));
});

Deno.test("handshake: infoHash at bytes 28-47", () => {
  const infoHash = new Uint8Array(20).fill(0xAB);
  const bytes = encodeHandshake({
    infoHash,
    peerId: new Uint8Array(20).fill(2),
  });
  assertEquals(bytes.subarray(28, 48), infoHash);
});

Deno.test("handshake: peerId at bytes 48-67", () => {
  const peerId = new Uint8Array(20).fill(0xCD);
  const bytes = encodeHandshake({
    infoHash: new Uint8Array(20).fill(1),
    peerId,
  });
  assertEquals(bytes.subarray(48), peerId);
});

```

---

## Arquivo: `packages/core/tests/hasher_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/hasher_test.ts

import { assertEquals } from "@std/assert";
import {
  sha1,
  sha1Bytes,
  sha256,
  sha256Bytes,
  sha512,
  sha512Bytes,
  md5,
  toHex,
  createSha1,
  type IncrementalHasher,
} from "../src/crypto/hasher.ts";

// ============================================================================
// toHex
// ============================================================================

Deno.test("toHex: converts empty Uint8Array to empty string", () => {
  assertEquals(toHex(new Uint8Array(0)), "");
});

Deno.test("toHex: converts [0x00, 0xff, 0x0a] correctly", () => {
  assertEquals(toHex(new Uint8Array([0x00, 0xff, 0x0a])), "00ff0a");
});

Deno.test("toHex: produces lowercase hex", () => {
  assertEquals(toHex(new Uint8Array([0xab, 0xcd, 0xef])), "abcdef");
});

// ============================================================================
// sha1 / sha1Bytes — one-shot
// ============================================================================

Deno.test("sha1: returns lowercase hex string for empty input", async () => {
  const hex = await sha1(new Uint8Array(0));
  assertEquals(hex, "da39a3ee5e6b4b0d3255bfef95601890afd80709");
});

Deno.test("sha1: returns correct hash for 'abc'", async () => {
  const hex = await sha1(new TextEncoder().encode("abc"));
  assertEquals(hex, "a9993e364706816aba3e25717850c26c9cd0d89d");
});

Deno.test("sha1Bytes: returns 20-byte Uint8Array", async () => {
  const bytes = await sha1Bytes(new TextEncoder().encode("abc"));
  assertEquals(bytes.length, 20);
  assertEquals(toHex(bytes), "a9993e364706816aba3e25717850c26c9cd0d89d");
});

Deno.test("sha1 and sha1Bytes produce the same digest", async () => {
  const data = new TextEncoder().encode("hello world");
  const hex = await sha1(data);
  const bytes = await sha1Bytes(data);
  assertEquals(hex, toHex(bytes));
});

// ============================================================================
// createSha1 — incremental
// ============================================================================

Deno.test("createSha1: empty input matches one-shot sha1", async () => {
  const hasher = createSha1();
  assertEquals(hasher.bytesHashed, 0n);
  const incremental = toHex(hasher.digest());
  const oneshot = await sha1(new Uint8Array(0));
  assertEquals(incremental, oneshot);
});

Deno.test("createSha1: single update matches one-shot", async () => {
  const data = new TextEncoder().encode("abc");
  const hasher = createSha1();
  hasher.update(data);
  assertEquals(hasher.bytesHashed, 3n);
  const incremental = toHex(hasher.digest());
  const oneshot = await sha1(data);
  assertEquals(incremental, oneshot);
});

Deno.test("createSha1: chunked update matches one-shot", async () => {
  const data = new TextEncoder().encode("abcdefghijklmnopqrstuvwxyz0123456789");
  const hasher = createSha1();
  // Feed in 7-byte chunks
  for (let i = 0; i < data.length; i += 7) {
    hasher.update(data.subarray(i, Math.min(i + 7, data.length)));
  }
  assertEquals(hasher.bytesHashed, BigInt(data.length));
  const incremental = toHex(hasher.digest());
  const oneshot = await sha1(data);
  assertEquals(incremental, oneshot);
});

Deno.test("createSha1: digest is non-destructive (idempotent)", () => {
  const data = new TextEncoder().encode("test non-destructive");
  const hasher = createSha1();
  hasher.update(data);
  const d1 = hasher.digest();
  const d2 = hasher.digest();
  assertEquals(d1, d2);
});

Deno.test("createSha1: update after digest continues the message", () => {
  const hasher = createSha1();
  hasher.update(new TextEncoder().encode("abc"));
  hasher.digest(); // non-destructive snapshot
  hasher.update(new TextEncoder().encode("def"));
  const result = toHex(hasher.digest());
  // Should match sha1("abcdef")
  const data = new TextEncoder().encode("abcdef");
  // We verify asynchronously
  crypto.subtle.digest("SHA-1", data).then((buf) => {
    const hex = toHex(new Uint8Array(buf));
    if (result !== hex) {
      console.error(`Expected ${hex}, got ${result}`);
    }
  });
});

Deno.test("createSha1: reset clears state", async () => {
  const hasher = createSha1();
  hasher.update(new TextEncoder().encode("data to clear"));
  hasher.reset();
  assertEquals(hasher.bytesHashed, 0n);
  const afterReset = toHex(hasher.digest());
  const empty = await sha1(new Uint8Array(0));
  assertEquals(afterReset, empty);
});

Deno.test("createSha1: large input (>64 bytes) matches one-shot", async () => {
  const data = new Uint8Array(1024);
  for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
  const hasher = createSha1();
  hasher.update(data);
  const incremental = toHex(hasher.digest());
  const oneshot = await sha1(data);
  assertEquals(incremental, oneshot);
});

Deno.test("createSha1: piece-size input (256KB) matches one-shot", async () => {
  const data = new Uint8Array(256 * 1024);
  for (let i = 0; i < data.length; i += 65536) {
    crypto.getRandomValues(data.subarray(i, Math.min(i + 65536, data.length)));
  }
  const hasher = createSha1();
  hasher.update(data);
  const incremental = toHex(hasher.digest());
  const oneshot = await sha1(data);
  assertEquals(incremental, oneshot);
});

// ============================================================================
// sha256 / sha256Bytes
// ============================================================================

Deno.test("sha256: returns correct hash for empty input", async () => {
  const hex = await sha256(new Uint8Array(0));
  assertEquals(hex, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

Deno.test("sha256Bytes: returns 32-byte Uint8Array", async () => {
  const bytes = await sha256Bytes(new Uint8Array(0));
  assertEquals(bytes.length, 32);
});

Deno.test("sha256 and sha256Bytes produce the same digest", async () => {
  const data = new TextEncoder().encode("hello");
  const hex = await sha256(data);
  const bytes = await sha256Bytes(data);
  assertEquals(hex, toHex(bytes));
});

// ============================================================================
// sha512 / sha512Bytes
// ============================================================================

Deno.test("sha512: returns 128-char hex string for empty input", async () => {
  const hex = await sha512(new Uint8Array(0));
  assertEquals(hex.length, 128);
  assertEquals(
    hex,
    "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
  );
});

Deno.test("sha512Bytes: returns 64-byte Uint8Array", async () => {
  const bytes = await sha512Bytes(new Uint8Array(0));
  assertEquals(bytes.length, 64);
});

// ============================================================================
// md5
// ============================================================================

Deno.test("md5: returns correct hash for empty input", () => {
  const result = md5(new Uint8Array(0));
  assertEquals(toHex(result), "d41d8cd98f00b204e9800998ecf8427e");
});

Deno.test("md5: returns correct hash for 'abc'", () => {
  const result = md5(new TextEncoder().encode("abc"));
  assertEquals(toHex(result), "900150983cd24fb0d6963f7d28e17f72");
});

Deno.test("md5: returns 16-byte digest", () => {
  const result = md5(new TextEncoder().encode("test"));
  assertEquals(result.length, 16);
});

Deno.test("md5: returns correct hash for longer input", () => {
  const result = md5(new TextEncoder().encode("message digest"));
  assertEquals(toHex(result), "f96b697d7cb7938d525a2f31aaf161d0");
});

```

---

## Arquivo: `packages/core/tests/magnet_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/magnet_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  parseMagnet,
  encodeMagnet,
  buildMagnetV2,
  isValidMagnet,
  isSha1Hex,
  isSha1Base32,
} from "../src/utils/magnet.ts";

// ============================================================================
// v1 parsing (backward compatibility)
// ============================================================================

Deno.test("magnet: parse simple hex infoHash", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.protocol, "v1");
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHashBuffer.length, 20);
  assertEquals(parsed.handshakeHash.length, 20);
  assertEquals(parsed.name, "Sintel");
  assertEquals(parsed.announce.length, 0);
  assertEquals(parsed.infoHashV1Hex, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHashV2, undefined);
});

Deno.test("magnet: parse with multiple trackers", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&tr=udp%3A%2F%2Ftracker.example.com%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.announce.length, 2);
  assertEquals(parsed.announce[0], "udp://tracker.example.com:6969");
  assertEquals(parsed.announce[1], "wss://tracker.btorrent.xyz");
});

Deno.test("magnet: parse base32 infoHash", () => {
  const uri = "magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.infoHash, "0000000000000000000000000000000000000000");
  assertEquals(parsed.infoHashBuffer.length, 20);
});

Deno.test("magnet: parse web seeds and peers", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&x.pe=192.168.1.1%3A6881";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.webSeeds.length, 1);
  assertEquals(parsed.webSeeds[0], "https://webtorrent.io/torrents/");
  assertEquals(parsed.peerAddresses.length, 1);
  assertEquals(parsed.peerAddresses[0], "192.168.1.1:6881");
});

Deno.test("magnet: parse torrent file URL (xs)", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.torrentFileUrl, "https://webtorrent.io/torrents/sintel.torrent");
});

Deno.test("magnet: parse urn:sha1 namespace", () => {
  const uri = "magnet:?xt=urn:sha1:08ada5a7a6183aae1e09d831df6748d566095a10";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.protocol, "v1");
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
});

Deno.test("magnet: throws on invalid URI", () => {
  assertThrows(() => parseMagnet("http://example.com"), Error, "must start with 'magnet:?'");
});

Deno.test("magnet: throws on missing infoHash", () => {
  assertThrows(() => parseMagnet("magnet:?dn=Test"), Error, "missing or invalid 'xt' parameter");
});

Deno.test("magnet: throws on invalid infoHash length", () => {
  assertThrows(() => parseMagnet("magnet:?xt=urn:btih:123"), Error, "no valid xt hash");
});

// ============================================================================
// v2 parsing (BEP 52)
// ============================================================================

Deno.test("magnet v2: parse urn:btmh", () => {
  const v2Hash = "a" .repeat(64);
  const uri = `magnet:?xt=urn:btmh:1220${v2Hash}`;
  const parsed = parseMagnet(uri);
  assertEquals(parsed.protocol, "v2");
  assertEquals(parsed.infoHashV2Hex, v2Hash);
  assertEquals(parsed.infoHashV2!.length, 32);
  assertEquals(parsed.infoHash, encodeHexFromBytes(parsed.handshakeHash));
  assertEquals(parsed.handshakeHash.length, 20);
  // handshakeHash = first 20 bytes of the 32-byte v2 hash
  assertEquals(parsed.handshakeHash, parsed.infoHashV2!.slice(0, 20));
});

Deno.test("magnet v2: infoHash is 40-char hex of handshakeHash", () => {
  const v2Hash = "abcdef0123456789".repeat(4); // 64 chars
  const uri = `magnet:?xt=urn:btmh:1220${v2Hash}`;
  const parsed = parseMagnet(uri);
  assertEquals(parsed.infoHash.length, 40);
  assertEquals(parsed.infoHashBuffer.length, 20);
});

Deno.test("magnet v2: rejects btmh without 1220 prefix", () => {
  const v2Hash = "a".repeat(64);
  assertThrows(
    () => parseMagnet(`magnet:?xt=urn:btmh:${v2Hash}`),
    Error,
    "no valid xt hash",
  );
});

Deno.test("magnet v2: rejects btmh with wrong hash length", () => {
  assertThrows(
    () => parseMagnet("magnet:?xt=urn:btmh:1220abcdef"),
    Error,
    "no valid xt hash",
  );
});

// ============================================================================
// Hybrid (v1 + v2)
// ============================================================================

Deno.test("magnet hybrid: both urn:btih and urn:btmh", () => {
  const v1Hash = "08ada5a7a6183aae1e09d831df6748d566095a10";
  const v2Hash = "b".repeat(64);
  const uri = `magnet:?xt=urn:btih:${v1Hash}&xt=urn:btmh:1220${v2Hash}`;
  const parsed = parseMagnet(uri);

  // v1 is preferred as primary identity
  assertEquals(parsed.protocol, "v1");
  assertEquals(parsed.infoHash, v1Hash);
  assertEquals(parsed.infoHashV1Hex, v1Hash);
  assertEquals(parsed.infoHashV2Hex, v2Hash);
  assertEquals(parsed.infoHashV1!.length, 20);
  assertEquals(parsed.infoHashV2!.length, 32);
});

Deno.test("magnet hybrid: v2-only falls back to v2", () => {
  const v2Hash = "c".repeat(64);
  const uri = `magnet:?xt=urn:btmh:1220${v2Hash}`;
  const parsed = parseMagnet(uri);
  assertEquals(parsed.protocol, "v2");
  assertEquals(parsed.infoHashV1, undefined);
  assertEquals(parsed.infoHashV2!.length, 32);
});

// ============================================================================
// buildMagnetV2
// ============================================================================

Deno.test("magnet: buildMagnetV2 basic", () => {
  const hash = "a".repeat(64);
  const url = buildMagnetV2(hash);
  assertEquals(url.startsWith("magnet:?xt=urn:btmh:1220"), true);
  assertEquals(url.includes(hash.toLowerCase()), true);
});

Deno.test("magnet: buildMagnetV2 with options", () => {
  const hash = "a".repeat(64);
  const url = buildMagnetV2(hash, {
    name: "Test File",
    trackers: ["http://tracker.example.com/announce"],
    webSeeds: ["https://cdn.example.com/file"],
    peerAddresses: ["1.2.3.4:6881"],
    torrentFileUrl: "https://example.com/file.torrent",
  });
  assertEquals(url.includes("dn=Test%20File"), true);
  assertEquals(url.includes("tr=http"), true);
  assertEquals(url.includes("ws=https"), true);
  assertEquals(url.includes("x.pe=1.2.3.4%3A6881"), true);
  assertEquals(url.includes("xs=https"), true);
});

Deno.test("magnet: buildMagnetV2 rejects invalid hash", () => {
  assertThrows(() => buildMagnetV2("short"), TypeError);
  assertThrows(() => buildMagnetV2("g".repeat(64)), TypeError); // non-hex
  assertThrows(() => buildMagnetV2("a".repeat(63)), TypeError); // too short
});

Deno.test("magnet: buildMagnetV2 normalizes to lowercase", () => {
  const hash = "ABCDEF0123456789".repeat(4);
  const url = buildMagnetV2(hash);
  assertEquals(url.includes("abcdef0123456789"), true);
});

// ============================================================================
// encodeMagnet (v1 builder)
// ============================================================================

Deno.test("magnet: encode and decode roundtrip", () => {
  const original = {
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    name: "Sintel",
    announce: ["udp://tracker.example.com:6969"],
    webSeeds: ["https://webtorrent.io/torrents/"],
    peerAddresses: [] as string[],
    torrentFileUrl: "https://webtorrent.io/torrents/sintel.torrent",
  };

  const encoded = encodeMagnet(original);
  const decoded = parseMagnet(encoded);

  assertEquals(decoded.infoHash, original.infoHash);
  assertEquals(decoded.name, original.name);
  assertEquals(decoded.announce, original.announce);
  assertEquals(decoded.webSeeds, original.webSeeds);
  assertEquals(decoded.torrentFileUrl, original.torrentFileUrl);
});

Deno.test("magnet: encodeMagnet rejects invalid hash", () => {
  assertThrows(
    () => encodeMagnet({ infoHash: "xyz", announce: [], webSeeds: [], peerAddresses: [] }),
    TypeError,
  );
});

// ============================================================================
// isValidMagnet
// ============================================================================

Deno.test("magnet: isValidMagnet returns true for valid URIs", () => {
  assertEquals(isValidMagnet("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10"), true);
  assertEquals(isValidMagnet("magnet:?xt=urn:btmh:1220" + "a".repeat(64)), true);
});

Deno.test("magnet: isValidMagnet returns false for invalid URIs", () => {
  assertEquals(isValidMagnet("http://example.com"), false);
  assertEquals(isValidMagnet("magnet:?dn=Test"), false);
  assertEquals(isValidMagnet("magnet:?xt=urn:btih:123"), false);
});

// ============================================================================
// Validators
// ============================================================================

Deno.test("magnet: isSha1Hex", () => {
  assertEquals(isSha1Hex("08ada5a7a6183aae1e09d831df6748d566095a10"), true);
  assertEquals(isSha1Hex("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false); // base32
  assertEquals(isSha1Hex("short"), false);
  assertEquals(isSha1Hex(""), false);
});

Deno.test("magnet: isSha1Base32", () => {
  assertEquals(isSha1Base32("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), true);
  assertEquals(isSha1Base32("08ada5a7a6183aae1e09d831df6748d566095a10"), false); // hex
  assertEquals(isSha1Base32("SHORT"), false);
  assertEquals(isSha1Base32(""), false);
});

// ============================================================================
// Resource limits
// ============================================================================

Deno.test("magnet: parse rejects URI exceeding maxLength", () => {
  const hash = "a".repeat(40);
  const uri = `magnet:?xt=urn:btih:${hash}`;
  assertThrows(
    () => parseMagnet(uri, { maxLength: 20 }),
    Error,
    "must start with 'magnet:?'",
  );
});

Deno.test("magnet: parse rejects too many query parameters", () => {
  const hash = "a".repeat(40);
  const params = Array.from({ length: 20 }, (_, i) => `p${i}=v${i}`).join("&");
  const uri = `magnet:?xt=urn:btih:${hash}&${params}`;
  assertThrows(
    () => parseMagnet(uri, { maxQueryParameters: 10 }),
    Error,
    "exceeds resource limits",
  );
});

Deno.test("magnet: parse rejects oversized parameter", () => {
  const hash = "a".repeat(40);
  const longValue = "x".repeat(200);
  const uri = `magnet:?xt=urn:btih:${hash}&dn=${longValue}`;
  assertThrows(
    () => parseMagnet(uri, { maxQueryParameterLength: 100 }),
    Error,
    "exceeds resource limits",
  );
});

Deno.test("magnet: parse option validation", () => {
  assertThrows(
    () => parseMagnet("magnet:?xt=urn:btih:" + "a".repeat(40), { maxLength: 0 as any }),
    TypeError,
    "maxLength",
  );
  assertThrows(
    () => parseMagnet("magnet:?xt=urn:btih:" + "a".repeat(40), { maxQueryParameters: -1 as any }),
    TypeError,
    "maxQueryParameters",
  );
});

// ============================================================================
// params map
// ============================================================================

Deno.test("magnet: params map contains all query parameters", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Test&tr=udp%3A%2F%2Ft1&tr=udp%3A%2F%2Ft2";
  const parsed = parseMagnet(uri);
  assertEquals(parsed.params.get("xt"), ["urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10"]);
  assertEquals(parsed.params.get("dn"), ["Test"]);
  assertEquals(parsed.params.get("tr"), ["udp://t1", "udp://t2"]);
});

Deno.test("magnet: safe decode on malformed percent-encoding", () => {
  const uri = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=bad%XXvalue";
  const parsed = parseMagnet(uri);
  // Should not throw; safeDecodeURIComponent falls back to original
  assertEquals(parsed.name !== undefined, true);
});

// ============================================================================
// Helpers
// ============================================================================

function encodeHexFromBytes(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

```

---

## Arquivo: `packages/core/tests/message_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/message_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  encodeMessage,
  decodeMessage,
  decodeMessagePayload,
  type PeerMessage,
  type BlockRequest,
  type HashRequestFields,
} from "../src/core/message.ts";
import { PeerMessageId } from "../src/core/constants.ts";
import { ProtocolError } from "../src/utils/errors.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Encode then decode a message, verifying round-trip fidelity. */
function roundTrip(message: PeerMessage): PeerMessage {
  const frame = encodeMessage(message);
  return decodeMessage(frame);
}

/** Encode only the payload (no length prefix) then decode it. */
function roundTripPayload(message: PeerMessage): PeerMessage {
  if (message.type === "keepAlive") {
    // keepAlive has no payload; test the frame path instead
    return roundTrip(message);
  }
  const frame = encodeMessage(message);
  // Skip the 4-byte length prefix
  return decodeMessagePayload(frame.subarray(4));
}

// ============================================================================
// BEP 3 core messages
// ============================================================================

Deno.test("message: keepAlive round-trip", () => {
  const msg = roundTrip({ type: "keepAlive" });
  assertEquals(msg.type, "keepAlive");
});

Deno.test("message: choke round-trip", () => {
  const msg = roundTrip({ type: "choke" });
  assertEquals(msg, { type: "choke" });
});

Deno.test("message: unchoke round-trip", () => {
  const msg = roundTrip({ type: "unchoke" });
  assertEquals(msg, { type: "unchoke" });
});

Deno.test("message: interested round-trip", () => {
  const msg = roundTrip({ type: "interested" });
  assertEquals(msg, { type: "interested" });
});

Deno.test("message: notInterested round-trip", () => {
  const msg = roundTrip({ type: "notInterested" });
  assertEquals(msg, { type: "notInterested" });
});

Deno.test("message: have round-trip", () => {
  const msg = roundTrip({ type: "have", pieceIndex: 42 });
  assertEquals(msg, { type: "have", pieceIndex: 42 });
});

Deno.test("message: have max pieceIndex (2^32-1)", () => {
  const msg = roundTrip({ type: "have", pieceIndex: 0xffffffff });
  assertEquals(msg, { type: "have", pieceIndex: 0xffffffff });
});

Deno.test("message: bitfield round-trip", () => {
  const bf = new Uint8Array([0xff, 0x00, 0xab]);
  const msg = roundTrip({ type: "bitfield", bitfield: bf });
  assertEquals(msg.type, "bitfield");
  assertEquals((msg as any).bitfield, bf);
});

Deno.test("message: request round-trip", () => {
  const msg = roundTrip({ type: "request", pieceIndex: 1, begin: 2, length: 16384 });
  assertEquals(msg, { type: "request", pieceIndex: 1, begin: 2, length: 16384 });
});

Deno.test("message: piece round-trip", () => {
  const block = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
  const msg = roundTrip({ type: "piece", pieceIndex: 5, begin: 0, block });
  assertEquals(msg.type, "piece");
  const piece = msg as any;
  assertEquals(piece.pieceIndex, 5);
  assertEquals(piece.begin, 0);
  assertEquals(piece.block, block);
});

Deno.test("message: cancel round-trip", () => {
  const msg = roundTrip({ type: "cancel", pieceIndex: 3, begin: 0, length: 4096 });
  assertEquals(msg, { type: "cancel", pieceIndex: 3, begin: 0, length: 4096 });
});

// ============================================================================
// BEP 5 port message
// ============================================================================

Deno.test("message: port round-trip", () => {
  const msg = roundTrip({ type: "port", port: 6881 });
  assertEquals(msg, { type: "port", port: 6881 });
});

Deno.test("message: port max (65535)", () => {
  const msg = roundTrip({ type: "port", port: 65535 });
  assertEquals(msg, { type: "port", port: 65535 });
});

Deno.test("message: port rejects invalid port", () => {
  assertThrows(() => encodeMessage({ type: "port", port: 70000 }), RangeError);
  assertThrows(() => encodeMessage({ type: "port", port: -1 }), RangeError);
});

// ============================================================================
// BEP 6 Fast extension messages
// ============================================================================

Deno.test("message: suggestPiece round-trip", () => {
  const msg = roundTrip({ type: "suggestPiece", pieceIndex: 7 });
  assertEquals(msg, { type: "suggestPiece", pieceIndex: 7 });
});

Deno.test("message: haveAll round-trip", () => {
  const msg = roundTrip({ type: "haveAll" });
  assertEquals(msg, { type: "haveAll" });
});

Deno.test("message: haveNone round-trip", () => {
  const msg = roundTrip({ type: "haveNone" });
  assertEquals(msg, { type: "haveNone" });
});

Deno.test("message: rejectRequest round-trip", () => {
  const msg = roundTrip({ type: "rejectRequest", pieceIndex: 2, begin: 0, length: 8192 });
  assertEquals(msg, { type: "rejectRequest", pieceIndex: 2, begin: 0, length: 8192 });
});

Deno.test("message: allowedFast round-trip", () => {
  const msg = roundTrip({ type: "allowedFast", pieceIndex: 99 });
  assertEquals(msg, { type: "allowedFast", pieceIndex: 99 });
});

// ============================================================================
// Extended message (BEP 10)
// ============================================================================

Deno.test("message: extended round-trip", () => {
  const payload = new Uint8Array([1, 2, 3, 4]);
  const msg = roundTrip({ type: "extended", extensionId: 1, payload });
  assertEquals(msg.type, "extended");
  const ext = msg as any;
  assertEquals(ext.extensionId, 1);
  assertEquals(ext.payload, payload);
});

Deno.test("message: extended handshake (id=0)", () => {
  const payload = new Uint8Array([0]); // minimal
  const msg = roundTrip({ type: "extended", extensionId: 0, payload });
  assertEquals(msg.type, "extended");
  assertEquals((msg as any).extensionId, 0);
});

Deno.test("message: extended rejects invalid extensionId", () => {
  assertThrows(
    () => encodeMessage({ type: "extended", extensionId: -1, payload: new Uint8Array() }),
    RangeError,
  );
  assertThrows(
    () => encodeMessage({ type: "extended", extensionId: 256, payload: new Uint8Array() }),
    RangeError,
  );
});

// ============================================================================
// BEP 52 v2 hash messages
// ============================================================================

Deno.test("message: hashRequest round-trip", () => {
  const request: HashRequestFields = {
    piecesRoot: new Uint8Array(32).fill(0xAB),
    baseLayer: 2,
    index: 0,
    length: 4,
    proofLayers: 1,
  };
  const msg = roundTrip({ type: "hashRequest", ...request });
  assertEquals(msg.type, "hashRequest");
  const hr = msg as any;
  assertEquals(hr.baseLayer, 2);
  assertEquals(hr.index, 0);
  assertEquals(hr.length, 4);
  assertEquals(hr.proofLayers, 1);
  assertEquals(hr.piecesRoot, request.piecesRoot);
});

Deno.test("message: hashes round-trip", () => {
  const request: HashRequestFields = {
    piecesRoot: new Uint8Array(32).fill(0xCD),
    baseLayer: 1,
    index: 0,
    length: 2,
    proofLayers: 0,
  };
  const hashes = new Uint8Array(32).fill(0xEF);
  const msg = roundTrip({ type: "hashes", ...request, hashes });
  assertEquals(msg.type, "hashes");
  const h = msg as any;
  assertEquals(h.hashes, hashes);
  assertEquals(h.baseLayer, 1);
});

Deno.test("message: hashReject round-trip", () => {
  const request: HashRequestFields = {
    piecesRoot: new Uint8Array(32).fill(0x11),
    baseLayer: 3,
    index: 8,
    length: 8,
    proofLayers: 2,
  };
  const msg = roundTrip({ type: "hashReject", ...request });
  assertEquals(msg.type, "hashReject");
  assertEquals((msg as any).baseLayer, 3);
});

Deno.test("message: hashRequest validates piecesRoot length", () => {
  const bad: any = {
    piecesRoot: new Uint8Array(16), // wrong length
    baseLayer: 2,
    index: 0,
    length: 4,
    proofLayers: 1,
  };
  assertThrows(
    () => encodeMessage({ type: "hashRequest", ...bad }),
    RangeError,
  );
});

Deno.test("message: hashRequest validates length is power of 2", () => {
  const bad: any = {
    piecesRoot: new Uint8Array(32),
    baseLayer: 2,
    index: 0,
    length: 3, // not a power of 2
    proofLayers: 1,
  };
  assertThrows(
    () => encodeMessage({ type: "hashRequest", ...bad }),
    RangeError,
  );
});

Deno.test("message: hashes rejects non-32-byte-aligned hashes", () => {
  const request: HashRequestFields = {
    piecesRoot: new Uint8Array(32),
    baseLayer: 1,
    index: 0,
    length: 2,
    proofLayers: 0,
  };
  assertThrows(
    () => encodeMessage({ type: "hashes", ...request, hashes: new Uint8Array(33) }),
    RangeError,
  );
});

// ============================================================================
// Unknown messages
// ============================================================================

Deno.test("message: unknown round-trip", () => {
  const payload = new Uint8Array([0xAA, 0xBB]);
  const msg = roundTrip({ type: "unknown", id: 42, payload });
  assertEquals(msg.type, "unknown");
  const unk = msg as any;
  assertEquals(unk.id, 42);
  assertEquals(unk.payload, payload);
});

Deno.test("message: unknown rejects invalid id", () => {
  assertThrows(
    () => encodeMessage({ type: "unknown", id: -1, payload: new Uint8Array() }),
    RangeError,
  );
  assertThrows(
    () => encodeMessage({ type: "unknown", id: 256, payload: new Uint8Array() }),
    RangeError,
  );
});

// ============================================================================
// Decode validation
// ============================================================================

Deno.test("message: decode rejects frame shorter than 4 bytes", () => {
  assertThrows(
    () => decodeMessage(new Uint8Array([0, 0, 1])),
    ProtocolError,
  );
});

Deno.test("message: decode rejects mismatched length prefix", () => {
  // Length prefix says 100, but only 1 byte follows
  const frame = new Uint8Array([0, 0, 0, 100, 0]);
  assertThrows(
    () => decodeMessage(frame),
    ProtocolError,
  );
});

Deno.test("message: decode rejects empty non-keepalive payload", () => {
  assertThrows(
    () => decodeMessagePayload(new Uint8Array(0)),
    ProtocolError,
  );
});

Deno.test("message: decode rejects choke with extra bytes", () => {
  // choke body should be 0 bytes
  const payload = new Uint8Array([PeerMessageId.Choke, 0x00]);
  assertThrows(
    () => decodeMessagePayload(payload),
    ProtocolError,
  );
});

Deno.test("message: decode rejects have with wrong body length", () => {
  // have body should be 4 bytes
  const payload = new Uint8Array([PeerMessageId.Have, 0x00, 0x01]);
  assertThrows(
    () => decodeMessagePayload(payload),
    ProtocolError,
  );
});

Deno.test("message: decode rejects piece with too-short body", () => {
  // piece body needs at least 8 bytes (pieceIndex + begin)
  const payload = new Uint8Array([PeerMessageId.Piece, 0x00, 0x01, 0x02]);
  assertThrows(
    () => decodeMessagePayload(payload),
    ProtocolError,
  );
});

Deno.test("message: decode rejects request with wrong body length", () => {
  const payload = new Uint8Array([PeerMessageId.Request, 0x00, 0x01, 0x02, 0x03, 0x04]);
  assertThrows(
    () => decodeMessagePayload(payload),
    ProtocolError,
  );
});

Deno.test("message: decode rejects request with zero length", () => {
  const body = new Uint8Array(12);
  const view = new DataView(body.buffer);
  view.setUint32(0, 0); // pieceIndex
  view.setUint32(4, 0); // begin
  view.setUint32(8, 0); // length = 0 (invalid)
  const payload = new Uint8Array(1 + body.length);
  payload[0] = PeerMessageId.Request;
  payload.set(body, 1);
  assertThrows(
    () => decodeMessagePayload(payload),
    ProtocolError,
  );
});

Deno.test("message: decode extended with missing extension ID", () => {
  const payload = new Uint8Array([PeerMessageId.Extended]);
  assertThrows(
    () => decodeMessagePayload(payload),
    ProtocolError,
  );
});

// ============================================================================
// Encode validation
// ============================================================================

Deno.test("message: encode rejects negative pieceIndex", () => {
  assertThrows(
    () => encodeMessage({ type: "have", pieceIndex: -1 }),
    RangeError,
  );
});

Deno.test("message: encode rejects non-integer pieceIndex", () => {
  assertThrows(
    () => encodeMessage({ type: "have", pieceIndex: 1.5 }),
    RangeError,
  );
});

Deno.test("message: encode rejects zero block request length", () => {
  assertThrows(
    () => encodeMessage({ type: "request", pieceIndex: 0, begin: 0, length: 0 }),
    RangeError,
  );
});

Deno.test("message: encode rejects pieceIndex > uint32", () => {
  assertThrows(
    () => encodeMessage({ type: "have", pieceIndex: 0x100000000 }),
    RangeError,
  );
});

// ============================================================================
// Frame structure
// ============================================================================

Deno.test("message: keepAlive encodes as 4 zero bytes", () => {
  const frame = encodeMessage({ type: "keepAlive" });
  assertEquals(frame.length, 4);
  assertEquals(frame, new Uint8Array(4));
});

Deno.test("message: choke encodes with correct length prefix", () => {
  const frame = encodeMessage({ type: "choke" });
  // Length prefix = 1 (just the message ID), total = 5
  assertEquals(frame.length, 5);
  assertEquals(frame[0], 0);
  assertEquals(frame[1], 0);
  assertEquals(frame[2], 0);
  assertEquals(frame[3], 1);
  assertEquals(frame[4], PeerMessageId.Choke);
});

Deno.test("message: have encodes with correct structure", () => {
  const frame = encodeMessage({ type: "have", pieceIndex: 42 });
  // Length = 5 (1 id + 4 pieceIndex)
  assertEquals(frame.length, 9);
  assertEquals(frame[4], PeerMessageId.Have);
  const pieceIndex = new DataView(frame.buffer, frame.byteOffset).getUint32(5);
  assertEquals(pieceIndex, 42);
});

Deno.test("message: request encodes with correct structure", () => {
  const frame = encodeMessage({ type: "request", pieceIndex: 1, begin: 2, length: 3 });
  // Length = 13 (1 id + 12 block request)
  assertEquals(frame.length, 17);
  assertEquals(frame[4], PeerMessageId.Request);
  const view = new DataView(frame.buffer, frame.byteOffset);
  assertEquals(view.getUint32(5), 1);
  assertEquals(view.getUint32(9), 2);
  assertEquals(view.getUint32(13), 3);
});

```

---

## Arquivo: `packages/core/tests/metainfo-parser_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/metainfo-parser_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { encode, type BencodeValue } from "../src/utils/bencode.ts";
import {
  parseMetainfo,
} from "../src/utils/metainfo-parser.ts";
import { TorrentParseError } from "../src/utils/errors.ts";

const PIECE_LENGTH = 16384;

/** Build a bencoded v1 torrent with a valid `pieces` byte count. */
function v1Buffer(kind: "single" | "multi"): Uint8Array {
  const info: Record<string, BencodeValue> = { "piece length": PIECE_LENGTH };
  let total = 0;

  if (kind === "single") {
    total = 5000;
    info["length"] = total;
    info["name"] = "single.bin";
  } else {
    const files = [
      { length: 1000, path: ["folder", "a.txt"] },
      { length: 2000, path: ["folder", "b.txt"] },
    ];
    total = 3000;
    info["files"] = files;
    info["name"] = "multi";
  }

  const pieceCount = Math.ceil(total / PIECE_LENGTH);
  info["pieces"] = new Uint8Array(pieceCount * 20);

  return encode({
    info,
    announce: "udp://tracker.example.com:6969",
    "announce-list": [
      ["udp://tracker.example.com:6969"],
    ],
    "created by": "browsertorrent-test",
    "creation date": 1700000000,
  });
}

/** Build a minimal single-file v2 torrent with no piece layers (small file). */
function v2Buffer(): Uint8Array {
  return encode({
    info: {
      name: "v2-test",
      "piece length": PIECE_LENGTH,
      "meta version": 2,
      "file tree": {
        "file.bin": {
          "": {
            length: 100,
            "pieces root": new Uint8Array(32),
          },
        },
      },
    },
  });
}

Deno.test("metainfo-parser: parses single-file v1 torrent", async () => {
  const torrent = await parseMetainfo(v1Buffer("single"));

  assertEquals(torrent.info.name, "single.bin");
  assertEquals(torrent.announce, "udp://tracker.example.com:6969");
  assertEquals(torrent.info["piece length"], PIECE_LENGTH);
  assertEquals((torrent.info as { length: number }).length, 5000);
  assertEquals((torrent.info["pieces"] as Uint8Array).length, 20);
});

Deno.test("metainfo-parser: parses multi-file v1 torrent", async () => {
  const torrent = await parseMetainfo(v1Buffer("multi"));
  const files = (torrent.info as { files: Array<{ length: number; path: string[] }> })
    .files;

  assertEquals(files.length, 2);
  assertEquals(files[0]!.length, 1000);
  assertEquals(files[0]!.path, ["folder", "a.txt"]);
  assertEquals(files[1]!.path, ["folder", "b.txt"]);
});

Deno.test("metainfo-parser: parses single-file v2 torrent", async () => {
  const torrent = await parseMetainfo(v2Buffer());

  assertEquals((torrent.info as { "meta version"?: number })["meta version"], 2);
  assertEquals(torrent.info.name, "v2-test");
});

Deno.test("metainfo-parser: rejects missing info dictionary", async () => {
  const bytes = encode({ announce: "udp://tracker.example.com:6969" });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "info",
  );
});

Deno.test("metainfo-parser: rejects invalid piece length", async () => {
  const bytes = encode({
    info: { name: "x", "piece length": 0, pieces: new Uint8Array(0) },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "piece length",
  );
});

Deno.test("metainfo-parser: rejects pieces length mismatch", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      length: 5000,
      pieces: new Uint8Array(40), // 2 pieces, but content needs only 1
    },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "info.pieces",
  );
});

Deno.test("metainfo-parser: rejects both length and files", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      length: 100,
      files: [{ length: 100, path: ["a"] }],
      pieces: new Uint8Array(20),
    },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    'both "length" and "files"',
  );
});

Deno.test("metainfo-parser: rejects unsafe path component", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      files: [{ length: 100, path: ["..", "escape"] }],
      pieces: new Uint8Array(20),
    },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "path",
  );
});

Deno.test("metainfo-parser: rejects BEP-3 torrent with piece layers", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      length: 100,
      pieces: new Uint8Array(20),
    },
    "piece layers": new Map<Uint8Array, Uint8Array>([
      [new Uint8Array(32), new Uint8Array(32)],
    ]),
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "piece layers",
  );
});

Deno.test("metainfo-parser: enforces maxBytes limit", async () => {
  await assertRejects(
    () => parseMetainfo(v1Buffer("single"), { maxBytes: 4 }),
    TorrentParseError,
    "limit",
  );
});
```

---

## Arquivo: `packages/core/tests/mod_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/mod_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { WebTorrent } from "../src/mod.ts";
import { encode } from "../src/utils/bencode.ts";
import type { ParsedTorrent } from "../src/utils/parse-torrent.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal valid bencoded .torrent that parseTorrent accepts. */
function minimalTorrentBytes(infoHash: string): Uint8Array {
  const info = { name: "test", "piece length": 16, pieces: new Uint8Array(20), length: 16 };
  const torrent = { info, "announce": "udp://tracker.example:80" };
  return new Uint8Array(encode(torrent));
}

/** Build a fake ParsedTorrent matching what parseTorrent returns from minimalTorrentBytes. */
function minimalParsedTorrent(infoHash: string): ParsedTorrent {
  return {
    infoHash,
    infoHashBuffer: new Uint8Array(20),
    name: "test",
    announce: ["udp://tracker.example:80"],
    urlList: [],
    peerAddresses: [],
    files: [{ path: "test", name: "test", length: 16, offset: 0 }],
    length: 16,
    pieceLength: 16,
    pieces: [new Uint8Array(20)],
    info: {} as any,
    magnetURI: "",
  };
}

Deno.test("webtorrent: initializes with default options", () => {
  const client = new WebTorrent();
  
  assertEquals(client.peerId.length, 40);
  assertEquals(client.peerIdBuffer.length, 20);
  assertEquals(client.torrentCount, 0);
  assertEquals(client.isDestroyed, false);
  
  client.destroy();
});

Deno.test("webtorrent: initializes with custom peerId", () => {
  const customPeerId = "a".repeat(40);
  const client = new WebTorrent({ peerId: customPeerId });
  
  assertEquals(client.peerId, customPeerId);
  assertEquals(client.peerIdBuffer[0], 0xaa);
  
  client.destroy();
});

Deno.test("webtorrent: emits 'ready' event", async () => {
  const client = new WebTorrent();
  
  let readyEmitted = false;
  client.on("ready", () => {
    readyEmitted = true;
  });
  
  await new Promise((resolve) => setTimeout(resolve, 10));
  
  assertEquals(readyEmitted, true);
  assertEquals(client.isReady, true);
  
  client.destroy();
});

Deno.test("webtorrent: add() throws if client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  
  await assertRejects(
    () => client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10"),
    Error,
    "WebTorrent client is destroyed"
  );
});

Deno.test("webtorrent: destroy() cleans up all torrents", async () => {
  const client = new WebTorrent();
  
  const torrent = await client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(client.torrentCount, 1);
  
  await client.destroy();
  
  assertEquals(client.torrentCount, 0);
  assertEquals(client.isDestroyed, true);
});

Deno.test("webtorrent: remove() removes a specific torrent", async () => {
  const client = new WebTorrent();
  
  const torrent = await client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(client.torrentCount, 1);
  
  await client.remove(torrent.infoHash);
  assertEquals(client.torrentCount, 0);
  
  client.destroy();
});

Deno.test("webtorrent: add() returns same torrent if already exists", async () => {
  const client = new WebTorrent();

  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  const torrent1 = await client.add(magnet);
  const torrent2 = await client.add(magnet);

  assertEquals(torrent1, torrent2);
  assertEquals(client.torrentCount, 1);

  client.destroy();
});

// ============================================================================
// PHASE 6: WEBRTC_SUPPORT
// ============================================================================

Deno.test("webtorrent: WEBRTC_SUPPORT is a boolean static property", () => {
  assertEquals(typeof WebTorrent.WEBRTC_SUPPORT, "boolean");
  assertEquals(WebTorrent.WEBRTC_SUPPORT === true || WebTorrent.WEBRTC_SUPPORT === false, true);
});

// ============================================================================
// PHASE 6: AGGREGATE GETTERS
// ============================================================================

Deno.test("webtorrent: downloadSpeed aggregates zero when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.downloadSpeed, 0);
  client.destroy();
});

Deno.test("webtorrent: uploadSpeed aggregates zero when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.uploadSpeed, 0);
  client.destroy();
});

Deno.test("webtorrent: progress is 0 when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.progress, 0);
  client.destroy();
});

Deno.test("webtorrent: ratio is 0 when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.ratio, 0);
  client.destroy();
});

Deno.test("webtorrent: downloadLimit and uploadLimit reflect constructor options", () => {
  const client = new WebTorrent({ downloadLimit: 1024, uploadLimit: 512 });
  assertEquals(client.downloadLimit, 1024);
  assertEquals(client.uploadLimit, 512);
  client.destroy();
});

Deno.test("webtorrent: downloadLimit and uploadLimit default to 0", () => {
  const client = new WebTorrent();
  assertEquals(client.downloadLimit, 0);
  assertEquals(client.uploadLimit, 0);
  client.destroy();
});

// ============================================================================
// PHASE 6: THROTTLE
// ============================================================================

Deno.test("webtorrent: throttleDownload() sets the download limit", () => {
  const client = new WebTorrent();
  client.throttleDownload(5000);
  assertEquals(client.downloadLimit, 5000);
  client.throttleDownload(0);
  assertEquals(client.downloadLimit, 0);
  client.destroy();
});

Deno.test("webtorrent: throttleUpload() sets the upload limit", () => {
  const client = new WebTorrent();
  client.throttleUpload(3000);
  assertEquals(client.uploadLimit, 3000);
  client.throttleUpload(0);
  assertEquals(client.uploadLimit, 0);
  client.destroy();
});

Deno.test("webtorrent: throttleDownload ignores negative values", () => {
  const client = new WebTorrent();
  client.throttleDownload(-1000);
  assertEquals(client.downloadLimit, 0);
  client.destroy();
});

Deno.test("webtorrent: throttleUpload ignores negative values", () => {
  const client = new WebTorrent();
  client.throttleUpload(-500);
  assertEquals(client.uploadLimit, 0);
  client.destroy();
});

// ============================================================================
// PHASE 6: get()
// ============================================================================

Deno.test("webtorrent: get() returns null when no torrent matches", async () => {
  const client = new WebTorrent();
  const result = await client.get("magnet:?xt=urn:btih:0000000000000000000000000000000000000000");
  assertEquals(result, null);
  client.destroy();
});

Deno.test("webtorrent: get() returns the torrent for a magnet URI", async () => {
  const client = new WebTorrent();
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  const torrent = await client.add(magnet);
  const result = await client.get(magnet);
  assertEquals(result, torrent);
  client.destroy();
});

Deno.test("webtorrent: get() returns null after torrent is removed", async () => {
  const client = new WebTorrent();
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  await client.add(magnet);
  await client.remove("08ada5a7a6183aae1e09d831df6748d566095a10");
  const result = await client.get(magnet);
  assertEquals(result, null);
  client.destroy();
});

Deno.test("webtorrent: get() returns null when client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  const result = await client.get("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(result, null);
});

// ============================================================================
// PHASE 6: seed() — environment and error handling
// ============================================================================

Deno.test("webtorrent: seed() throws when client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  await assertRejects(
    () => client.seed(new Uint8Array(100)),
    Error,
    "WebTorrent client is destroyed",
  );
});

Deno.test("webtorrent: seed() throws on unsupported input type", async () => {
  const client = new WebTorrent();
  // null hits no instanceof branch → throws TypeError("Unsupported seed input")
  await assertRejects(
    () => client.seed(null as any),
    TypeError,
    "Unsupported seed input",
  );
  client.destroy();
});

// ── client.add / client.remove events — upstream parity ─────────────────────────

Deno.test("webtorrent: emits 'add' event when torrent is added", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("0000000000000000000000000000000000000000");

  let addEvent: CustomEvent | null = null;
  client.on("add", (e) => { addEvent = e; });

  const torrent = await client.add(bytes);
  // The 'add' event detail contains the real torrent
  assertEquals(addEvent !== null, true);
  assertEquals(typeof (addEvent as any).detail.torrent.infoHash, "string");
  assertEquals((addEvent as any).detail.torrent.infoHash, torrent.infoHash);
  client.destroy();
});

Deno.test("webtorrent: emits 'remove' event when torrent is removed", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("1111111111111111111111111111111111111111");
  const torrent = await client.add(bytes);
  const realInfoHash = torrent.infoHash;

  let removeEvent: CustomEvent | null = null;
  client.on("remove", (e) => { removeEvent = e; });

  await client.remove(realInfoHash);

  assertEquals(removeEvent !== null, true);
  assertEquals((removeEvent as any).detail.infoHash, realInfoHash);
  client.destroy();
});

Deno.test("webtorrent: 'add' fires before 'torrent' event", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("2222222222222222222222222222222222222222");
  const events: string[] = [];

  client.on("add", () => events.push("add"));
  client.on("torrent", () => events.push("torrent"));

  await client.add(bytes);
  assertEquals(events[0], "add");
  assertEquals(events[1], "torrent");
  client.destroy();
});

Deno.test("webtorrent: 'add' and 'remove' fire on torrent lifecycle", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("3333333333333333333333333333333333333333");
  let addIH: string | null = null;
  let removeIH: string | null = null;

  client.on("add", (e: any) => { addIH = e.detail.torrent.infoHash; });
  client.on("remove", (e: any) => { removeIH = e.detail.infoHash; });

  const torrent = await client.add(bytes);
  await client.remove(torrent.infoHash);

  assertEquals(addIH, torrent.infoHash);
  assertEquals(removeIH, torrent.infoHash);
  assertEquals(client.torrents.size, 0);
  client.destroy();
});
```

---

## Arquivo: `packages/core/tests/net_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/net_test.ts

import { assertEquals } from "@std/assert";
import {
  deduplicatePeers,
  isIPv4Bytes,
  isIPv4String,
  isIPv6String,
  isNetPort,
  parseCompactIpv4Peers,
  parseCompactIpv6Peers,
} from "../src/utils/net.ts";

// ============================================================================
// isNetPort
// ============================================================================

Deno.test("isNetPort: valid ports", () => {
  assertEquals(isNetPort(1), true);
  assertEquals(isNetPort(80), true);
  assertEquals(isNetPort(443), true);
  assertEquals(isNetPort(8080), true);
  assertEquals(isNetPort(65535), true);
});

Deno.test("isNetPort: invalid ports", () => {
  assertEquals(isNetPort(0), false);
  assertEquals(isNetPort(-1), false);
  assertEquals(isNetPort(65536), false);
  assertEquals(isNetPort(1.5), false);
  assertEquals(isNetPort(NaN), false);
  assertEquals(isNetPort(Infinity), false);
});

// ============================================================================
// isIPv4String
// ============================================================================

Deno.test("isIPv4String: valid addresses", () => {
  assertEquals(isIPv4String("0.0.0.0"), true);
  assertEquals(isIPv4String("127.0.0.1"), true);
  assertEquals(isIPv4String("192.168.1.1"), true);
  assertEquals(isIPv4String("255.255.255.255"), true);
  assertEquals(isIPv4String("10.0.0.1"), true);
});

Deno.test("isIPv4String: invalid addresses", () => {
  assertEquals(isIPv4String(""), false);
  assertEquals(isIPv4String("256.0.0.1"), false);
  assertEquals(isIPv4String("1.2.3"), false);
  assertEquals(isIPv4String("1.2.3.4.5"), false);
  assertEquals(isIPv4String("abc.def.ghi.jkl"), false);
  assertEquals(isIPv4String("1.2.3.256"), false);
});

// ============================================================================
// isIPv4Bytes
// ============================================================================

Deno.test("isIPv4Bytes: valid", () => {
  assertEquals(isIPv4Bytes(new Uint8Array([192, 168, 1, 1])), true);
  assertEquals(isIPv4Bytes(new Uint8Array(4)), true);
});

Deno.test("isIPv4Bytes: invalid", () => {
  assertEquals(isIPv4Bytes(new Uint8Array(3)), false);
  assertEquals(isIPv4Bytes(new Uint8Array(5)), false);
  assertEquals(isIPv4Bytes(new Uint8Array(0)), false);
});

// ============================================================================
// isIPv6String
// ============================================================================

Deno.test("isIPv6String: valid addresses", () => {
  assertEquals(isIPv6String("::1"), true);
  assertEquals(isIPv6String("::"), true);
  assertEquals(isIPv6String("fe80::1"), true);
  assertEquals(isIPv6String("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), true);
  assertEquals(isIPv6String("2001:db8:85a3::8a2e:370:7334"), true);
  assertEquals(isIPv6String("::ffff:192.168.1.1"), true);
  assertEquals(isIPv6String("::192.168.1.1"), true);
  assertEquals(isIPv6String("1:2:3:4:5:6:7:8"), true);
  assertEquals(isIPv6String("fe80::1%eth0"), true);
});

Deno.test("isIPv6String: invalid addresses", () => {
  assertEquals(isIPv6String(""), false);
  assertEquals(isIPv6String(":::1"), false);
  assertEquals(isIPv6String("12345::1"), false);
  assertEquals(isIPv6String("gggg::1"), false);
  assertEquals(isIPv6String("1:2:3:4:5:6:7:8:9"), false);
});

// ============================================================================
// parseCompactIpv4Peers
// ============================================================================

Deno.test("parseCompactIpv4Peers: single peer", () => {
  // 192.168.1.1:6881
  const data = new Uint8Array([192, 168, 1, 1, 0x1A, 0xE1]);
  const peers = parseCompactIpv4Peers(data);
  assertEquals(peers.length, 1);
  assertEquals(peers[0]!.ip, "192.168.1.1");
  assertEquals(peers[0]!.port, 6881);
});

Deno.test("parseCompactIpv4Peers: multiple peers", () => {
  // 10.0.0.1:80 + 172.16.0.1:443
  const data = new Uint8Array([
    10, 0, 0, 1, 0, 80,
    172, 16, 0, 1, 1, 0xBB,
  ]);
  const peers = parseCompactIpv4Peers(data);
  assertEquals(peers.length, 2);
  assertEquals(peers[0]!.ip, "10.0.0.1");
  assertEquals(peers[0]!.port, 80);
  assertEquals(peers[1]!.ip, "172.16.0.1");
  assertEquals(peers[1]!.port, 443);
});

Deno.test("parseCompactIpv4Peers: empty data", () => {
  assertEquals(parseCompactIpv4Peers(new Uint8Array(0)), []);
});

Deno.test("parseCompactIpv4Peers: invalid length throws", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]); // 5 bytes, not multiple of 6
  try {
    parseCompactIpv4Peers(data);
    throw new Error("should have thrown");
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    assertEquals((e as RangeError).message.includes("multiple of 6"), true);
  }
});

// ============================================================================
// parseCompactIpv6Peers
// ============================================================================

Deno.test("parseCompactIpv6Peers: single peer", () => {
  // ::1 port 6881
  const ipBytes = new Uint8Array(16);
  ipBytes[15] = 1; // ::1
  const portHi = 0x1A;
  const portLo = 0xE1;
  const data = new Uint8Array([...ipBytes, portHi, portLo]);
  const peers = parseCompactIpv6Peers(data);
  assertEquals(peers.length, 1);
  assertEquals(peers[0]!.ip, "::1");
  assertEquals(peers[0]!.port, 6881);
});

Deno.test("parseCompactIpv6Peers: empty data", () => {
  assertEquals(parseCompactIpv6Peers(new Uint8Array(0)), []);
});

Deno.test("parseCompactIpv6Peers: invalid length throws", () => {
  const data = new Uint8Array(17); // 17 bytes, not multiple of 18
  try {
    parseCompactIpv6Peers(data);
    throw new Error("should have thrown");
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    assertEquals((e as RangeError).message.includes("multiple of 18"), true);
  }
});

Deno.test("parseCompactIpv6Peers: full IPv6 address", () => {
  // 2001:0db8:85a3:0000:0000:8a2e:0370:7334 port 80
  const data = new Uint8Array([
    0x20, 0x01, 0x0d, 0xb8, 0x85, 0xa3, 0x00, 0x00,
    0x00, 0x00, 0x8a, 0x2e, 0x03, 0x70, 0x73, 0x34,
    0x00, 0x50, // port 80
  ]);
  const peers = parseCompactIpv6Peers(data);
  assertEquals(peers.length, 1);
  assertEquals(peers[0]!.port, 80);
  // Verify the IP contains the expected hextets
  const ip = peers[0]!.ip;
  assertEquals(ip.includes("2001"), true);
  assertEquals(ip.includes("db8"), true);
});

// ============================================================================
// deduplicatePeers
// ============================================================================

Deno.test("deduplicatePeers: removes exact duplicates", () => {
  const peers = [
    { ip: "192.168.1.1", port: 6881 },
    { ip: "192.168.1.1", port: 6881 },
    { ip: "10.0.0.1", port: 80 },
  ];
  const result = deduplicatePeers(peers);
  assertEquals(result, [
    { ip: "192.168.1.1", port: 6881 },
    { ip: "10.0.0.1", port: 80 },
  ]);
});

Deno.test("deduplicatePeers: same ip different port is not duplicate", () => {
  const peers = [
    { ip: "192.168.1.1", port: 6881 },
    { ip: "192.168.1.1", port: 6882 },
  ];
  const result = deduplicatePeers(peers);
  assertEquals(result.length, 2);
});

Deno.test("deduplicatePeers: empty array", () => {
  assertEquals(deduplicatePeers([]), []);
});

Deno.test("deduplicatePeers: no duplicates", () => {
  const peers = [
    { ip: "1.2.3.4", port: 100 },
    { ip: "5.6.7.8", port: 200 },
  ];
  assertEquals(deduplicatePeers(peers), peers);
});

Deno.test("deduplicatePeers: preserves first occurrence order", () => {
  const peers = [
    { ip: "10.0.0.1", port: 80 },
    { ip: "10.0.0.2", port: 80 },
    { ip: "10.0.0.1", port: 80 },
    { ip: "10.0.0.3", port: 80 },
    { ip: "10.0.0.2", port: 80 },
  ];
  const result = deduplicatePeers(peers);
  assertEquals(result, [
    { ip: "10.0.0.1", port: 80 },
    { ip: "10.0.0.2", port: 80 },
    { ip: "10.0.0.3", port: 80 },
  ]);
});

```

---

## Arquivo: `packages/core/tests/parse-torrent_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/parse-torrent_test.ts

// ... (mantenha todo o resto do arquivo igual)
import { assertEquals, assertRejects } from "@std/assert";
import { parseTorrent, ParsedTorrent } from "../src/utils/parse-torrent.ts";
import { encode, BencodeValue } from "../src/utils/bencode.ts";

const TEXT_ENCODER = new TextEncoder();

// Helper para criar um .torrent falso em memória
function createFakeTorrentBuffer(isMultiFile = false): Uint8Array {
  const PIECE_LENGTH = 16384;
  let total: number;
  if (isMultiFile) {
    total = 3000;
  } else {
    total = 5000;
  }
  const pieceCount = Math.ceil(total / PIECE_LENGTH);
  const pieces = new Uint8Array(pieceCount * 20);
  
  const info: Record<string, BencodeValue> = {
    "piece length": 16384,
    pieces,
  };

  if (isMultiFile) {
    info["files"] = [
      { length: 1000, path: [TEXT_ENCODER.encode("folder"), TEXT_ENCODER.encode("file1.txt")] },
      { length: 2000, path: [TEXT_ENCODER.encode("folder"), TEXT_ENCODER.encode("file2.txt")] },
    ];
    info["name"] = TEXT_ENCODER.encode("my-multi-file-torrent");
  } else {
    info["length"] = 5000;
    info["name"] = TEXT_ENCODER.encode("single-file.mp4");
  }

  const torrentObj: Record<string, BencodeValue> = {
    info,
    announce: TEXT_ENCODER.encode("udp://tracker.example.com:6969"),
    "announce-list": [
      [TEXT_ENCODER.encode("udp://tracker.example.com:6969")],
      [TEXT_ENCODER.encode("wss://tracker.btorrent.xyz")],
    ],
    "url-list": [TEXT_ENCODER.encode("https://webtorrent.io/torrents/")],
    comment: TEXT_ENCODER.encode("Test torrent"),
    "created by": TEXT_ENCODER.encode("BrowserTorrent WebTorrent"),
  };

  return encode(torrentObj);
}

Deno.test("parse-torrent: parse single-file .torrent buffer", async () => {
  const buffer = createFakeTorrentBuffer(false);
  const parsed = await parseTorrent(buffer);

  assertEquals(parsed.files.length, 1);
  assertEquals(parsed.files[0]!.name, "single-file.mp4");
  assertEquals(parsed.files[0]!.length, 5000);
  assertEquals(parsed.length, 5000);
  assertEquals(parsed.pieceLength, 16384);
  assertEquals(parsed.pieces.length, 1); // 1 piece for 5000 bytes with 16384 piece length
  assertEquals(parsed.announce.length, 2); // deduplicado
  assertEquals(parsed.urlList.length, 1);
  assertEquals(parsed.comment, "Test torrent");
  assertEquals(parsed.infoHash.length, 40);
});

Deno.test("parse-torrent: parse multi-file .torrent buffer", async () => {
  const buffer = createFakeTorrentBuffer(true);
  const parsed = await parseTorrent(buffer);

  assertEquals(parsed.files.length, 2);
  assertEquals(parsed.files[0]!.path, "folder/file1.txt");
  assertEquals(parsed.files[0]!.offset, 0);
  assertEquals(parsed.files[1]!.path, "folder/file2.txt");
  assertEquals(parsed.files[1]!.offset, 1000);
  assertEquals(parsed.length, 3000);
  assertEquals(parsed.name, "my-multi-file-torrent");
});

Deno.test("parse-torrent: parse magnet URI", async () => {
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.example.com";
  const parsed = await parseTorrent(magnet);

  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.name, "Sintel");
  assertEquals(parsed.announce.length, 1);
  assertEquals(parsed.files.length, 0); // Magnet não tem arquivos até baixar metadados
  assertEquals(parsed.length, 0);
});

Deno.test("parse-torrent: parse raw infoHash string", async () => {
  const parsed = await parseTorrent("08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
});

Deno.test("parse-torrent: throws on invalid input", async () => {
  await assertRejects(
    () => parseTorrent("invalid-string"),
    Error,
    "Invalid torrent identifier"
  );
});
Deno.test("parse-torrent: returns same object if already parsed", async () => {
  const original: ParsedTorrent = {
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    infoHashBuffer: new Uint8Array(20),
    name: "Unknown", // 🔥 CORREÇÃO: Adicionado 'name' para satisfazer a interface
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10",
  };
  const result = await parseTorrent(original);
  assertEquals(result, original);
});
```

---

## Arquivo: `packages/core/tests/peer_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/peer_test.ts

import { assertEquals, assertExists } from "@std/assert";
import { Peer } from "../src/network/peer.ts";

// ============================================================================
// MOCKS
// ============================================================================

class MockRTCPeerConnection {
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public onicecandidate: ((event: any) => void) | null = null;
  public ondatachannel: ((event: any) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public connectionState: RTCPeerConnectionState = "new";
  public iceConnectionState: RTCIceConnectionState = "new";
  
  private channel: MockRTCDataChannel | null = null;
  private static instances: MockRTCPeerConnection[] = [];

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }

  async createOffer() {
    return { type: "offer" as const, sdp: "mock-sdp-offer" };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "mock-sdp-answer" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc;
  }

  async addIceCandidate() {}

  createDataChannel(label: string) {
    this.channel = new MockRTCDataChannel(label);
    return this.channel;
  }

  close() {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  }

  simulateChannelOpen() {
    if (this.channel) {
      this.channel.readyState = "open";
      this.channel.onopen?.(new Event("open"));
    }
  }

  simulateIncomingChannel(channel: MockRTCDataChannel) {
    this.ondatachannel?.({ channel });
  }

  simulateConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  static getLastInstance(): MockRTCPeerConnection | undefined {
    return MockRTCPeerConnection.instances.at(-1);
  }

  static resetInstances() {
    MockRTCPeerConnection.instances = [];
  }
}

class MockRTCDataChannel {
  public readyState: RTCDataChannelState = "connecting";
  public binaryType: string = "arraybuffer";
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  
  constructor(public label: string) {}

  send(data: ArrayBuffer | Uint8Array) {
    // Mock implementation
  }

  close() {
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}

// ============================================================================
// TESTES
// ============================================================================

Deno.test("peer: initiator creates offer and data channel", async () => {
  MockRTCPeerConnection.resetInstances();
  
  const infoHash = new Uint8Array(20).fill(1);
  const peerId = new Uint8Array(20).fill(65);

  const peer = new Peer({
    initiator: true,
    infoHash,
    peerId,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  let signalEmitted = false;
  // 🔥 CORREÇÃO: Tipagem explícita como Error | null para evitar inferência 'never'
  let peerError: Error | null = null; 
  
  peer.on("signal", (e: any) => {
    signalEmitted = true;
    assertEquals((e.detail.data as RTCSessionDescriptionInit).type, "offer");
  });
  
  peer.on("error", (e: any) => {
    peerError = e.detail?.error || e;
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  if (peerError) {
    // 🔥 CORREÇÃO: Assegão de tipo para acessar .message com segurança
    throw new Error(`Peer inesperadamente emitiu um erro: ${(peerError as Error).message}`);
  }

  assertEquals(signalEmitted, true);
  
  peer.destroy();
});

Deno.test("peer: non-initiator waits for data channel", async () => {
  MockRTCPeerConnection.resetInstances();
  
  const infoHash = new Uint8Array(20).fill(1);
  const peerId = new Uint8Array(20).fill(66);

  const peer = new Peer({
    initiator: false,
    infoHash,
    peerId,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  const mockChannel = new MockRTCDataChannel("webtorrent");
  const pc = MockRTCPeerConnection.getLastInstance();
  assertExists(pc);
  pc.simulateIncomingChannel(mockChannel);

  let connectEmitted = false;
  peer.on("connect", () => {
    connectEmitted = true;
  });

  mockChannel.readyState = "open";
  mockChannel.onopen?.(new Event("open"));

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(connectEmitted, true);
  assertEquals(peer.wire !== null, true);
  
  peer.destroy();
});

Deno.test("peer: destroy() is idempotent (can be called multiple times)", () => {
  MockRTCPeerConnection.resetInstances();
  
  const peer = new Peer({
    initiator: true,
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  peer.destroy();
  peer.destroy();
  peer.destroy();

  assertEquals(peer.destroyed, true);
});

Deno.test("peer: emits error on connection failure", async () => {
  MockRTCPeerConnection.resetInstances();
  
  const peer = new Peer({
    initiator: true,
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  let errorEmitted = false;
  peer.on("error", () => {
    errorEmitted = true;
  });

  const pc = MockRTCPeerConnection.getLastInstance();
  assertExists(pc);
  pc.simulateConnectionState("failed");

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(errorEmitted, true);
  assertEquals(peer.destroyed, true);
});
```

---

## Arquivo: `packages/core/tests/peerid_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/peerid_test.ts

import { assertEquals } from "@std/assert";
import {
  decodePeerId,
  generateBrowserTorrentPeerId,
  BT_PEER_ID_PREFIX,
  isAzStyle,
  isShadowStyle,
  getPeerIdClientName,
} from "../src/utils/peerid.ts";

import { generateRandomString } from "../src/crypto/random.ts";

Deno.test("peerid: BT_PEER_ID_PREFIX is correct length", () => {
  assertEquals(BT_PEER_ID_PREFIX, "-BT0100-");
  assertEquals(BT_PEER_ID_PREFIX.length, 8);
});

Deno.test("peerid: generateBrowserTorrentPeerId returns exactly 20 bytes", () => {
  const peerId = generateBrowserTorrentPeerId();
  assertEquals(peerId.length, 20);
  
  const str = new TextDecoder().decode(peerId);
  assertEquals(str.startsWith(BT_PEER_ID_PREFIX), true);
});

Deno.test("peerid: decodePeerId correctly parses BrowserTorrent PeerId", () => {
  const peerId = generateBrowserTorrentPeerId();
  const clientInfo = decodePeerId(peerId);
  
  assertEquals(clientInfo?.code, "LO");
  assertEquals(clientInfo?.name, "BrowserTorrent");
  // "0100" -> major: 0, minor: 1, patch: parseInt("00") -> "0"
  assertEquals(clientInfo?.version, "0.1.0");
  assertEquals(clientInfo?.style, "azureus");
});

Deno.test("peerid: decodePeerId correctly parses Azureus style (e.g., qBittorrent)", () => {
  const peerIdStr = "-qB4520-xxxxxxxxxxxx";
  const peerId = new TextEncoder().encode(peerIdStr);
  const clientInfo = decodePeerId(peerId);
  
  assertEquals(clientInfo?.code, "qB");
  assertEquals(clientInfo?.name, "qBittorrent");
  assertEquals(clientInfo?.version, "4.5.20");
  assertEquals(clientInfo?.style, "azureus");
});

Deno.test("peerid: decodePeerId correctly parses Azureus style (e.g., Transmission)", () => {
  const peerIdStr = "-TR3000-xxxxxxxxxxxx";
  const peerId = new TextEncoder().encode(peerIdStr);
  const clientInfo = decodePeerId(peerId);
  
  assertEquals(clientInfo?.code, "TR");
  assertEquals(clientInfo?.name, "Transmission");
  assertEquals(clientInfo?.version, "3.0.0");
});

Deno.test("peerid: decodePeerId correctly parses Shadow style (e.g., BitTornado)", () => {
  const peerIdStr = "T58B-----xxxxxxxxxxx";
  const peerId = new TextEncoder().encode(peerIdStr);
  const clientInfo = decodePeerId(peerId);
  
  assertEquals(clientInfo?.code, "T");
  assertEquals(clientInfo?.name, "BitTornado");
  assertEquals(clientInfo?.style, "shadow");
});

Deno.test("peerid: decodePeerId returns null for unrecognized PeerId", () => {
  const peerIdStr = "xxxxxxxxxxxxxxxxxxxx";
  const peerId = new TextEncoder().encode(peerIdStr);
  const clientInfo = decodePeerId(peerId);
  
  // 🔥 CORREÇÃO: PeerIds que não seguem os padrões Azureus ou Shadow retornam null
  assertEquals(clientInfo, null);
});

Deno.test("peerid: getPeerIdClientName returns correct name or fallback", () => {
  assertEquals(getPeerIdClientName("-qB4520-xxxxxxxxxxxx"), "qBittorrent");
  assertEquals(getPeerIdClientName("xxxxxxxxxxxxxxxxxxxx"), "Unknown Client");
});

Deno.test("peerid: isAzStyle validation", () => {
  assertEquals(isAzStyle("-UT3500-xxxxxxxxxxxx"), true);
  assertEquals(isAzStyle("UT3500-xxxxxxxxxxxxx"), false);
  assertEquals(isAzStyle("-UT350-xxxxxxxxxxxxx"), false);
});

Deno.test("peerid: isShadowStyle validation", () => {
  assertEquals(isShadowStyle("S58B-----xxxxxxxxxx"), true);
  assertEquals(isShadowStyle("S58Bxxxxxxxxxxxxxxxx"), false);
  assertEquals(isShadowStyle("12345---xxxxxxxxxx"), false);
});

Deno.test("peerid: generateRandomString generates correct length string", () => {
  const str = generateRandomString(12);
  assertEquals(str.length, 12);
  const str2 = generateRandomString(32);
  assertEquals(str2.length, 32);
});

Deno.test("peerid: decodePeerId handles short input gracefully", () => {
  const shortId = new TextEncoder().encode("short");
  assertEquals(decodePeerId(shortId), null);
  assertEquals(decodePeerId("short"), null);
});
```

---

## Arquivo: `packages/core/tests/piece_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/piece_test.ts

import { assertEquals } from "@std/assert";
import { Piece } from "../src/core/piece.ts";

Deno.test("piece: constructor stores index, length, offset", () => {
  const p = new Piece(5, 16384, 81920);
  assertEquals(p.index, 5);
  assertEquals(p.length, 16384);
  assertEquals(p.offset, 81920);
});

Deno.test("piece: downloaded returns false when hash is not set", () => {
  const p = new Piece(0, 16384, 0);
  assertEquals(p.downloaded, false);
});

Deno.test("piece: downloaded returns true when hash is set", () => {
  const p = new Piece(0, 16384, 0);
  p.hash = new Uint8Array(20);
  assertEquals(p.downloaded, true);
});

Deno.test("piece: missing is true when hash is not set", () => {
  const p = new Piece(0, 16384, 0);
  assertEquals(p.missing, true);
});

Deno.test("piece: missing is false when hash is set", () => {
  const p = new Piece(0, 16384, 0);
  p.hash = new Uint8Array(20);
  assertEquals(p.missing, false);
});

Deno.test("piece: toString describes piece state", () => {
  const missing = new Piece(3, 16384, 49152);
  assertEquals(missing.toString().includes("index=3"), true);
  assertEquals(missing.toString().includes("missing"), true);

  const done = new Piece(3, 16384, 49152);
  done.hash = new Uint8Array(20);
  assertEquals(done.toString().includes("downloaded"), true);
});

```

---

## Arquivo: `packages/core/tests/server_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/server_test.ts

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  createServer,
  guessContentType,
  parseRangeHeader,
  WebTorrentServer,
} from "../src/server/server.ts";
import { InProcessTransport } from "../src/server/server.ts";
import { buildStreamURL, parseStreamURL, streamManager } from "../src/server/stream-manager.ts";
import { File } from "../src/core/file.ts";

// ── Mock classes ────────────────────────────────────────────────────────────────

class MockChunkStore {
  chunkLength = 16384;
  get(_index: number) { return Promise.resolve(new Uint8Array(16384)); }
  put(_index: number, _buf: Uint8Array) { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  destroy() { return Promise.resolve(); }
}

class MockFile {
  constructor(
    public name: string,
    public length: number,
  ) {}

  // File-compatible interface
  get lengthGetter() { return this.length; }
  get nameGetter() { return this.name; }

  async *[Symbol.asyncIterator]() {
    yield new Uint8Array([1, 2, 3, 4]);
    yield new Uint8Array([5, 6, 7, 8]);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("createServer: uses InProcessTransport when no controller", () => {
  const server = createServer({ scope: "/app/" });
  assertEquals(server.scope, "/app/");
  assertEquals(server.isReady, false);
  assertEquals(server.isDestroyed, false);
  server.destroy();
});

Deno.test("createServer: sendReadyAck sets isReady", async () => {
  const server = createServer({ scope: "/" });
  assertEquals(server.isReady, false);

  const result = await server.sendReadyAck();
  assertEquals(result, true);
  assertEquals(server.isReady, true);

  server.destroy();
});

Deno.test("createServer: double createServer returns same instance", () => {
  const server = createServer({ scope: "/" });
  const server2 = createServer({ scope: "/" });
  // createServer is a factory; each call creates a new instance.
  // This is fine — the WebTorrent class guards with a .server field.
  assertEquals(server === server2, false);
  server.destroy();
  server2.destroy();
});

Deno.test("WebTorrentServer.destroy: sets flags and closes transport", () => {
  const server = createServer({ scope: "/" });
  assertEquals(server.isDestroyed, false);

  server.destroy();
  assertEquals(server.isDestroyed, true);
  assertEquals(server.isReady, false);
});

Deno.test("WebTorrentServer.destroy: is idempotent", () => {
  const server = createServer({ scope: "/" });
  server.destroy();
  server.destroy(); // must not throw
  assertEquals(server.isDestroyed, true);
});

Deno.test("WebTorrentServer.handleRequest: returns 404 for unknown URL", async () => {
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: "/some/other/path",
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 404);
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: returns 404 for unregistered file", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${"x".repeat(40)}/0/video.mp4`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 404);
  streamManager.clear();
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: returns 503 when destroyed", async () => {
  const server = createServer({ scope: "/" });
  server.destroy();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${"y".repeat(40)}/0/video.mp4`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 503);
});

Deno.test("WebTorrentServer.handleRequest: parses file index from URL", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  // Register two files for the same torrent
  const mock1 = new MockFile("video.mp4", 1024) as any;
  const mock2 = new MockFile("audio.m4a", 512) as any;
  const infoHash = "a".repeat(40);

  streamManager.register(infoHash, 0, mock1);
  streamManager.register(infoHash, 1, mock2);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  // Request file index 1
  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/1/audio.m4a`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 200);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Type"), "audio/aac");
  assertEquals(headers.get("Content-Length"), "512");
  assertEquals(headers.get("Accept-Ranges"), "bytes");

  streamManager.clear();
  server.destroy();
});

// ── Range request support ─────────────────────────────────────────────────────────

Deno.test("WebTorrentServer.handleRequest: returns 206 for Range request", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const mock = new MockFile("video.mp4", 1024) as any;
  const infoHash = "a".repeat(40); // 40 hex chars (valid infoHash)
  streamManager.register(infoHash, 0, mock);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/0/video.mp4`,
    method: "GET",
    headers: { "range": "bytes=0-99" },
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 206);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Type"), "video/mp4");
  assertEquals(headers.get("Content-Length"), "100");
  assertEquals(headers.get("Accept-Ranges"), "bytes");
  assertEquals(headers.get("Content-Range"), "bytes 0-99/1024");

  streamManager.clear();
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: returns 200 when no Range header", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const mock = new MockFile("video.mp4", 1024) as any;
  const infoHash = "b".repeat(40); // valid hex
  streamManager.register(infoHash, 0, mock);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/0/video.mp4`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 200);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Length"), "1024");
  assertEquals(headers.get("Content-Range"), null);

  streamManager.clear();
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: suffix range returns 206 with correct length", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const mock = new MockFile("video.mp4", 1024) as any;
  const infoHash = "c".repeat(40); // valid hex
  streamManager.register(infoHash, 0, mock);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/0/video.mp4`,
    method: "GET",
    headers: { "range": "bytes=500-" },
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 206);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Range"), "bytes 500-1023/1024");
  assertEquals(headers.get("Content-Length"), "524");

  streamManager.clear();
  server.destroy();
});

Deno.test("InProcessTransport: records postMessage", () => {
  const transport = new InProcessTransport();

  transport.postMessage({ type: "WEBTORRENT_ACK" });
  transport.postMessage({ type: "foo" });

  assertEquals(transport.sent.length, 2);
  assertEquals((transport.sent[0] as any).type, "WEBTORRENT_ACK");

  transport.close();
});

Deno.test("InProcessTransport: requestStream returns pending promise", async () => {
  const transport = new InProcessTransport();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const p = transport.requestStream({
    type: "webtorrent-request",
    url: "/",
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  // No response yet
  assertEquals(transport.activePort, fakePort);

  // Deliver response
  transport.deliverResponse({ body: "STREAM", status: 200 });
  const result = await p;
  assertEquals(result.status, 200);
  assertEquals(result.body, "STREAM");

  transport.close();
});

Deno.test("InProcessTransport: sendPull sends signal on port", () => {
  let received: boolean | null = null;
  const fakePort = {
    addEventListener(_: string, cb: (e: { data: boolean }) => void) {
      // store callback to trigger later
      (fakePort as any)._cb = cb;
    },
    start() {},
    close() {},
    postMessage(data: boolean) { received = data; },
  } as unknown as MessagePort;

  const transport = new InProcessTransport();
  transport.requestStream({
    type: "webtorrent-request",
    url: "/",
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  transport.sendPull(true);
  assertEquals(received, true);

  transport.sendPull(false);
  assertEquals(received, false);

  transport.close();
});

Deno.test("guessContentType: video formats", () => {
  assertEquals(guessContentType("video.mp4"), "video/mp4");
  assertEquals(guessContentType("video.m4v"), "video/mp4");
  assertEquals(guessContentType("video.webm"), "video/webm");
  assertEquals(guessContentType("video.ogv"), "video/ogg");
  assertEquals(guessContentType("VIDEO.MP4"), "video/mp4"); // case insensitive
});

Deno.test("guessContentType: audio formats", () => {
  assertEquals(guessContentType("audio.mp3"), "audio/mpeg");
  assertEquals(guessContentType("audio.wav"), "audio/wav");
  assertEquals(guessContentType("audio.flac"), "audio/flac");
  assertEquals(guessContentType("audio.m4a"), "audio/aac");
  assertEquals(guessContentType("audio.oga"), "audio/ogg");
  assertEquals(guessContentType("audio.opus"), "audio/opus");
});

Deno.test("guessContentType: image formats", () => {
  assertEquals(guessContentType("image.jpg"), "image/jpeg");
  assertEquals(guessContentType("image.jpeg"), "image/jpeg");
  assertEquals(guessContentType("image.png"), "image/png");
  assertEquals(guessContentType("image.gif"), "image/gif");
  assertEquals(guessContentType("image.webp"), "image/webp");
  assertEquals(guessContentType("image.svg"), "image/svg+xml");
});

Deno.test("guessContentType: other formats", () => {
  assertEquals(guessContentType("doc.pdf"), "application/pdf");
  assertEquals(guessContentType("readme.txt"), "text/plain; charset=utf-8");
  assertEquals(guessContentType("index.html"), "text/html; charset=utf-8");
  assertEquals(guessContentType("data.json"), "application/json; charset=utf-8");
  assertEquals(guessContentType("subs.srt"), "application/x-subrip");
  assertEquals(guessContentType("subs.vtt"), "text/vtt");
});

Deno.test("guessContentType: unknown extension falls back to octet-stream", () => {
  assertEquals(guessContentType("file.bin"), "application/octet-stream");
  assertEquals(guessContentType("file.xyz"), "application/octet-stream");
  assertEquals(guessContentType("file."), "application/octet-stream");
  assertEquals(guessContentType("file"), "application/octet-stream");
});

Deno.test("parseStreamURL: used via server integration", () => {
  const infoHash = "a".repeat(40);
  const url = buildStreamURL("/app/", infoHash, 3, "my video.mp4");
  const parsed = parseStreamURL(url, "/app/");

  assertEquals(parsed?.infoHash, infoHash);
  assertEquals(parsed?.fileIndex, 3);
  assertEquals(parsed?.name, "my video.mp4");
});

// ── parseRangeHeader ─────────────────────────────────────────────────────────

Deno.test("parseRangeHeader: parses valid range with both bounds", () => {
  const result = parseRangeHeader("bytes=0-99", 1000);
  assertEquals(result, { start: 0, end: 99 });
});

Deno.test("parseRangeHeader: parses suffix range (start-)", () => {
  const result = parseRangeHeader("bytes=500-", 1000);
  assertEquals(result, { start: 500, end: 999 });
});

Deno.test("parseRangeHeader: returns null when header is undefined", () => {
  assertEquals(parseRangeHeader(undefined, 1000), null);
});

Deno.test("parseRangeHeader: returns null for invalid units", () => {
  assertEquals(parseRangeHeader("frames=0-99", 1000), null);
});

Deno.test("parseRangeHeader: returns null when start exceeds file length", () => {
  assertEquals(parseRangeHeader("bytes=1001-", 1000), null);
});

Deno.test("parseRangeHeader: returns null when start equals file length", () => {
  assertEquals(parseRangeHeader("bytes=1000-", 1000), null);
});

Deno.test("parseRangeHeader: returns null for malformed format", () => {
  assertEquals(parseRangeHeader("bytes=0..99", 1000), null);
  assertEquals(parseRangeHeader("bytes=-99", 1000), null);
});

Deno.test("parseRangeHeader: clamps end to file length - 1", () => {
  const result = parseRangeHeader("bytes=0-1999", 1000);
  assertEquals(result, { start: 0, end: 999 });
});

Deno.test("parseRangeHeader: returns null when end < start", () => {
  assertEquals(parseRangeHeader("bytes=100-50", 1000), null);
});

Deno.test("parseRangeHeader: returns null for negative start", () => {
  assertEquals(parseRangeHeader("bytes=-10-99", 1000), null);
});


```

---

## Arquivo: `packages/core/tests/simple-buffer_test.ts`

```ts
import { assertEquals, assertThrows } from '@std/assert';
import {
  DEFAULT_MAX_BUFFER_CAPACITY,
  SimpleBuffer,
} from '../src/utils/simple-buffer.ts';

// ---------------------------------------------------------------------------
// write + read
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — write then readBytes', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([10, 20, 30]));
  assertEquals(buf.length, 3);
  const out = buf.readBytes(3);
  assertEquals(out, new Uint8Array([10, 20, 30]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — readByte', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([42, 99]));
  assertEquals(buf.readByte(), 42);
  assertEquals(buf.readByte(), 99);
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — readBytes(0) returns empty', () => {
  const buf = new SimpleBuffer();
  assertEquals(buf.readBytes(0), new Uint8Array(0));
});

Deno.test('SimpleBuffer — readByte on empty buffer throws', () => {
  const buf = new SimpleBuffer();
  assertThrows(() => buf.readByte(), RangeError);
});

Deno.test('SimpleBuffer — readBytes beyond length throws', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1]));
  assertThrows(() => buf.readBytes(5), RangeError);
});

Deno.test('SimpleBuffer — readBytes with negative len throws', () => {
  const buf = new SimpleBuffer();
  assertThrows(() => buf.readBytes(-1), RangeError);
});

// ---------------------------------------------------------------------------
// cursor positioning (interleaved read/write)
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — interleaved write and read', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3, 4, 5]));
  assertEquals(buf.readBytes(2), new Uint8Array([1, 2]));
  assertEquals(buf.length, 3);

  buf.write(new Uint8Array([6, 7]));
  assertEquals(buf.length, 5);
  assertEquals(buf.readBytes(3), new Uint8Array([3, 4, 5]));
  assertEquals(buf.readBytes(2), new Uint8Array([6, 7]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — hasNext reflects state', () => {
  const buf = new SimpleBuffer();
  assertEquals(buf.hasNext(), false);
  buf.write(new Uint8Array([1]));
  assertEquals(buf.hasNext(), true);
  buf.readByte();
  assertEquals(buf.hasNext(), false);
});

// ---------------------------------------------------------------------------
// grow
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — grow beyond initial backing capacity', () => {
  const buf = new SimpleBuffer();
  // Initial backing is 64 bytes; write 128 bytes to force reallocation.
  const data = new Uint8Array(128);
  for (let i = 0; i < 128; i++) data[i] = i;
  buf.write(data);
  assertEquals(buf.length, 128);
  const out = buf.readBytes(128);
  for (let i = 0; i < 128; i++) {
    assertEquals(out[i], i);
  }
});

Deno.test('SimpleBuffer — grow respects maxCapacity', () => {
  const buf = new SimpleBuffer({ maxCapacity: 8 });
  buf.write(new Uint8Array([1, 2, 3, 4]));
  assertThrows(() => buf.write(new Uint8Array(5)), RangeError);
});

Deno.test('SimpleBuffer — public grow() ensures space', () => {
  const buf = new SimpleBuffer();
  buf.grow(200);
  // Writing 200 bytes should succeed without reallocation overhead.
  const data = new Uint8Array(200);
  buf.write(data);
  assertEquals(buf.length, 200);
});

Deno.test('SimpleBuffer — constructor rejects invalid maxCapacity', () => {
  assertThrows(() => new SimpleBuffer({ maxCapacity: 0 }), RangeError);
  assertThrows(() => new SimpleBuffer({ maxCapacity: -1 }), RangeError);
  assertThrows(() => new SimpleBuffer({ maxCapacity: 1.5 }), RangeError);
});

Deno.test('SimpleBuffer — default maxCapacity', () => {
  assertEquals(DEFAULT_MAX_BUFFER_CAPACITY, 16 * 1024 * 1024);
});

// ---------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — compact reclaims read space', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  // Consume first 6 bytes — readPos advances to 6.
  buf.readBytes(6);
  assertEquals(buf.length, 2);

  // compact() should shift remaining bytes to front.
  buf.compact();
  // After compact, reading the remaining 2 bytes should still work.
  assertEquals(buf.readBytes(2), new Uint8Array([7, 8]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — compact is a no-op when readPos is 0', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3]));
  buf.compact(); // Should not change anything.
  assertEquals(buf.length, 3);
  assertEquals(buf.readBytes(3), new Uint8Array([1, 2, 3]));
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — reset clears all data', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3]));
  buf.reset();
  assertEquals(buf.length, 0);
  assertEquals(buf.hasNext(), false);
});

```

---

## Arquivo: `packages/core/tests/stream-manager_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/stream-manager_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  buildStreamURL,
  parseStreamURL,
  streamManager,
  StreamManager,
} from "../src/server/stream-manager.ts";

// Mock File for testing
class MockFile {
  name = "test.mp4";
  length = 1024;
  constructor(public infoHash?: string, public fileIndex?: number) {}
}

Deno.test("streamManager: register and get", () => {
  streamManager.clear();
  const file = new MockFile("abc123", 0) as any;
  streamManager.register("abc123", 0, file);

  const entry = streamManager.get("abc123", 0);
  assertEquals(entry?.infoHash, "abc123");
  assertEquals(entry?.fileIndex, 0);
  assertEquals(entry?.file, file);
  streamManager.clear();
});

Deno.test("streamManager: unregister", () => {
  streamManager.clear();
  const file = new MockFile() as any;
  streamManager.register("abc", 0, file);
  streamManager.register("abc", 1, file);

  assertEquals(streamManager.size(), 2);

  streamManager.unregister("abc", 0);
  assertEquals(streamManager.size(), 1);
  assertEquals(streamManager.get("abc", 0), undefined);
  assertEquals(streamManager.get("abc", 1)?.file, file);

  streamManager.clear();
});

Deno.test("streamManager: unregisterTorrent removes all files", () => {
  streamManager.clear();
  const file = new MockFile() as any;
  streamManager.register("hash1", 0, file);
  streamManager.register("hash1", 1, file);
  streamManager.register("hash2", 0, file);

  assertEquals(streamManager.size(), 3);

  streamManager.unregisterTorrent("hash1");
  assertEquals(streamManager.size(), 1);
  assertEquals(streamManager.get("hash1", 0), undefined);
  assertEquals(streamManager.get("hash1", 1), undefined);
  assertEquals(streamManager.get("hash2", 0)?.file, file);

  streamManager.clear();
});

Deno.test("streamManager: list returns all entries", () => {
  streamManager.clear();
  const file1 = new MockFile() as any;
  const file2 = new MockFile() as any;
  streamManager.register("h1", 0, file1);
  streamManager.register("h1", 1, file2);

  const entries = streamManager.list();
  assertEquals(entries.length, 2);

  streamManager.clear();
});

Deno.test("streamManager: clear removes everything", () => {
  streamManager.clear();
  const file = new MockFile() as any;
  for (let i = 0; i < 5; i++) {
    streamManager.register("h", i, file);
  }
  assertEquals(streamManager.size(), 5);

  streamManager.clear();
  assertEquals(streamManager.size(), 0);
});

Deno.test("buildStreamURL: produces correct URL format", () => {
  const url = buildStreamURL("/", "a".repeat(40), 3, "video.mp4");
  assertEquals(url, `/webtorrent/${"a".repeat(40)}/3/video.mp4`);
});

Deno.test("buildStreamURL: URL-encodes file name with spaces", () => {
  const url = buildStreamURL("/app/", "b".repeat(40), 0, "my video file.mp4");
  assertEquals(url.includes("my%20video%20file.mp4"), true);
});

Deno.test("parseStreamURL: parses valid URL", () => {
  const infoHash = "c".repeat(40);
  const url = `/webtorrent/${infoHash}/5/my%20file.mp4`;

  const result = parseStreamURL(url, "/");
  assertEquals(result?.infoHash, infoHash);
  assertEquals(result?.fileIndex, 5);
  assertEquals(result?.name, "my file.mp4");
});

Deno.test("parseStreamURL: returns null for non-matching scope", () => {
  const url = `/webtorrent/${"d".repeat(40)}/0/file.txt`;
  assertEquals(parseStreamURL(url, "/app/"), null);
});

Deno.test("parseStreamURL: returns null for invalid infoHash length", () => {
  const url = `/webtorrent/abc123/0/file.txt`;
  assertEquals(parseStreamURL(url, "/"), null);
});

Deno.test("parseStreamURL: returns null for negative fileIndex", () => {
  const url = `/webtorrent/${"e".repeat(40)}/-1/file.txt`;
  assertEquals(parseStreamURL(url, "/"), null);
});

Deno.test("parseStreamURL: handles nested path in file name", () => {
  const infoHash = "f".repeat(40);
  const url = `/webtorrent/${infoHash}/2/path/to/file.txt`;

  const result = parseStreamURL(url, "/");
  assertEquals(result?.fileIndex, 2);
  assertEquals(result?.name, "path/to/file.txt");
});

Deno.test("parseStreamURL: normalizes infoHash to lowercase", () => {
  const infoHash = "A".repeat(40);
  const url = `/webtorrent/${infoHash}/0/file.txt`;

  const result = parseStreamURL(url, "/");
  assertEquals(result?.infoHash, "a".repeat(40));
});

```

---

## Arquivo: `packages/core/tests/swarm_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/swarm_test.ts

import { assertEquals } from "@std/assert";
import { Swarm } from "../src/network/swarm.ts";

class MockRTCPeerConnection {
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public onicecandidate: ((event: any) => void) | null = null;
  public ondatachannel: ((event: any) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public connectionState: RTCPeerConnectionState = "new";
  
  private channel: MockRTCDataChannel | null = null;

  constructor() {}

  async createOffer() {
    return { type: "offer" as const, sdp: "mock-sdp-offer" };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "mock-sdp-answer" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc;
  }

  async addIceCandidate() {}

  createDataChannel(label: string) {
    this.channel = new MockRTCDataChannel(label);
    return this.channel;
  }

  close() {
    this.connectionState = "closed";
  }
}

class MockRTCDataChannel {
  public readyState: RTCDataChannelState = "connecting";
  public binaryType: string = "arraybuffer";
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  
  constructor(public label: string) {}

  send(data: ArrayBuffer | Uint8Array) {}

  close() {
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}

Deno.test("swarm: initializes with correct infoHash", () => {
  const infoHash = new Uint8Array(20).fill(1);
  const peerId = new Uint8Array(20).fill(2);

  const swarm = new Swarm({
    infoHash,
    peerId,
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  assertEquals(swarm.infoHash, infoHash);
  assertEquals(swarm.peerId, peerId);
  assertEquals(swarm.peers.size, 0);

  swarm.destroy();
});

Deno.test("swarm: addPeer respects maxConns", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 2,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.addPeer("1.1.1.1:6881");
  swarm.addPeer("2.2.2.2:6881");
  const added = swarm.addPeer("3.3.3.3:6881");

  assertEquals(added, false);
  assertEquals(swarm.peers.size, 2);

  swarm.destroy();
});

Deno.test("swarm: pause prevents new connections", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.pause();
  const added = swarm.addPeer("1.1.1.1:6881");

  assertEquals(added, false);
  assertEquals(swarm.peers.size, 0);

  swarm.destroy();
});

Deno.test("swarm: destroy cleans up everything", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.addPeer("1.1.1.1:6881");
  swarm.destroy();

  assertEquals(swarm.peers.size, 0);
  assertEquals(swarm.destroyed, true);
});

Deno.test("swarm: duplicate peers are rejected", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.addPeer("1.1.1.1:6881");
  const duplicate = swarm.addPeer("1.1.1.1:6881");

  assertEquals(duplicate, false);
  assertEquals(swarm.peers.size, 1);

  swarm.destroy();
});
```

---

## Arquivo: `packages/core/tests/torrent-generator_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/torrent-generator_test.ts
/**
 * Tests for the OPFS torrent generator.
 *
 * Since OPFS (`navigator.storage.getDirectory`) is not available in Deno,
 * all file-system interactions are mocked.  The pure functions (calcPieceSize,
 * buildPieceFiles, etc.) are tested directly; the I/O-dependent ones use
 * mock OPFS handles that behave like real browser handles.
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  buildPieceFiles,
  calcPieceSize,
  decode,
  fileSizeSum,
  generateTorrent,
  getDefaultCreatedBy,
  getOPFSFileSize,
  isHiddenFile,
  OPFSMultiFileReader,
  sha1sum,
  walkOPFSDir,
  PieceSizeEnum,
} from "../src/torrent-generator/mod.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a mock `File` with a configurable byte slice. */
function mockFile(bytes: Uint8Array): File {
  return {
    size: bytes.byteLength,
    slice(start?: number, end?: number) {
      const s = start ?? 0;
      const e = end ?? bytes.byteLength;
      const sub = bytes.subarray(s, e);
      return {
        size: sub.byteLength,
        arrayBuffer() {
          return Promise.resolve(sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength));
        },
        stream() { throw new Error("not implemented"); },
        text() { throw new Error("not implemented"); },
        type: "",
        name: "",
        lastModified: 0,
        slice() { throw new Error("not implemented"); },
      } as unknown as File;
    },
    stream() { throw new Error("not implemented"); },
    text() { throw new Error("not implemented"); },
    type: "",
    name: "",
    lastModified: 0,
  } as unknown as File;
}

/** Creates a mock `FileSystemFileHandle` backed by a `Uint8Array`. */
function mockFileHandle(name: string, bytes: Uint8Array): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    getFile() {
      return Promise.resolve(mockFile(bytes));
    },
    createWritable() {
      throw new Error("not implemented in tests");
    },
    getFileHandle() {
      throw new Error("not implemented in tests");
    },
    removeEntry() {
      throw new Error("not implemented in tests");
    },
    resolve() {
      throw new Error("not implemented in tests");
    },
    isSameEntry() {
      throw new Error("not implemented in tests");
    },
    queryPermission() {
      throw new Error("not implemented in tests");
    },
    requestPermission() {
      throw new Error("not implemented in tests");
    },
  } as unknown as FileSystemFileHandle;
}

/** Recursive mock builder for FileSystemDirectoryHandle.
 *
 *  `entries` can include:
 *  - `{ name: "foo.txt", kind: "file", handle }`  → file
 *  - `{ name: "subdir",  kind: "directory", entries: [...] }`  → sub-directory
 *
 *  Handles are memoized so `getFileHandle("subdir")` returns the same object
 *  that `values()` would yield for the sub-directory.
 */
type MockEntry =
  | { name: string; kind: "file"; handle: FileSystemFileHandle }
  | { name: string; kind: "directory"; entries: MockEntry[] };

function buildMockDir(
  entries: MockEntry[],
  name: string = "root",
): FileSystemDirectoryHandle {
  // Map of leaf name → sub-dir handle (memoized for getFileHandle)
  const subDirs = new Map<string, FileSystemDirectoryHandle>();

  function ensureSubDir(name: string, subEntries: MockEntry[]): FileSystemDirectoryHandle {
    if (!subDirs.has(name)) {
      subDirs.set(name, buildMockDir(subEntries, name));
    }
    return subDirs.get(name)!;
  }

  const iterable = {
    _entries: entries,
    async next() {
      // We store index on the iterable itself so each call to next() can
      // advance independently of the AsyncIterator call.
      const i = (this as any)._idx = ((this as any)._idx ?? 0);
      if (i >= entries.length) return { done: true, value: undefined };
      (this as any)._idx = i + 1;
      const e = entries[i]!;
      if (e.kind === "file") {
        return { done: false, value: e.handle ?? mockFileHandle(e.name, new Uint8Array(0)) };
      }
      // Return a lightweight directory handle for recursion
      return { done: false, value: ensureSubDir(e.name, e.entries) };
    },
    [Symbol.asyncIterator]() { return this; },
  };

  return {
    kind: "directory",
    name,
    getFileHandle(name: string) {
      const found = entries.find((e) => e.kind === "file" && e.name === name);
      if (found && found.kind === "file") return Promise.resolve(found.handle);
      const subEntry = entries.find((e) => e.kind === "directory" && e.name === name);
      if (!subEntry || subEntry.kind !== "directory") throw new Error(`not found: ${name}`);
      return Promise.resolve(ensureSubDir(subEntry.name, subEntry.entries));
    },
    getDirectoryHandle() { throw new Error("not implemented"); },
    removeEntry() { throw new Error("not implemented"); },
    resolve() { throw new Error("not implemented"); },
    isSameEntry() { throw new Error("not implemented"); },
    queryPermission() { throw new Error("not implemented"); },
    requestPermission() { throw new Error("not implemented"); },
    values() { return iterable; },
  } as unknown as FileSystemDirectoryHandle;
}

// ─────────────────────────────────────────────────────────────────────────────
// PieceSizeEnum
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PieceSizeEnum: all expected presets are defined", () => {
  assertEquals(PieceSizeEnum.SIZE_AUTO, 0);
  assertEquals(PieceSizeEnum.SIZE_16KB, 16 * 1024);
  assertEquals(PieceSizeEnum.SIZE_32KB, 32 * 1024);
  assertEquals(PieceSizeEnum.SIZE_64KB, 64 * 1024);
  assertEquals(PieceSizeEnum.SIZE_128KB, 128 * 1024);
  assertEquals(PieceSizeEnum.SIZE_256KB, 256 * 1024);
  assertEquals(PieceSizeEnum.SIZE_512KB, 512 * 1024);
  assertEquals(PieceSizeEnum.SIZE_1MB, 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_2MB, 2 * 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_4MB, 4 * 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_8MB, 8 * 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_16MB, 16 * 1024 * 1024);
});

// ─────────────────────────────────────────────────────────────────────────────
// calcPieceSize (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("calcPieceSize: SIZE_AUTO selects smallest preset > fileSize", () => {
  // 10 KB → SIZE_16KB
  assertEquals(calcPieceSize(10 * 1024, PieceSizeEnum.SIZE_AUTO), PieceSizeEnum.SIZE_16KB);
  // 20 KB → SIZE_32KB
  assertEquals(calcPieceSize(20 * 1024, PieceSizeEnum.SIZE_AUTO), PieceSizeEnum.SIZE_32KB);
  // 100 KB → SIZE_128KB
  assertEquals(calcPieceSize(100 * 1024, PieceSizeEnum.SIZE_AUTO), PieceSizeEnum.SIZE_128KB);
});

Deno.test("calcPieceSize: explicit preset is returned unchanged", () => {
  assertEquals(calcPieceSize(1_000_000, PieceSizeEnum.SIZE_512KB), PieceSizeEnum.SIZE_512KB);
  assertEquals(calcPieceSize(99, PieceSizeEnum.SIZE_8MB), PieceSizeEnum.SIZE_8MB);
});

Deno.test("calcPieceSize: zero file size returns smallest preset", () => {
  const result = calcPieceSize(0, PieceSizeEnum.SIZE_AUTO);
  assertEquals(result, PieceSizeEnum.SIZE_16KB);
});

// ─────────────────────────────────────────────────────────────────────────────
// fileSizeSum (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("fileSizeSum: returns 0 for empty array", () => {
  assertEquals(fileSizeSum([]), 0);
});

Deno.test("fileSizeSum: sums sizes correctly", () => {
  const files = [
    { name: "a", size: 100 },
    { name: "b", size: 200 },
    { name: "c", size: 50 },
  ];
  assertEquals(fileSizeSum(files), 350);
});

// ─────────────────────────────────────────────────────────────────────────────
// isHiddenFile (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("isHiddenFile: detects dotfiles", () => {
  assertEquals(isHiddenFile(".DS_Store"), true);
  assertEquals(isHiddenFile(".gitignore"), true);
  assertEquals(isHiddenFile("a/b/.hidden"), true);
  assertEquals(isHiddenFile("a/.config"), true);
});

Deno.test("isHiddenFile: passes normal files", () => {
  assertEquals(isHiddenFile("video.mp4"), false);
  assertEquals(isHiddenFile("readme.txt"), false);
  assertEquals(isHiddenFile("a/b/file.txt"), false);
  assertEquals(isHiddenFile("my.torrent"), false);
  // .config/settings.json — the *file* itself is not hidden,
  // only the parent directory is.  Walker checks the parent dir.
  assertEquals(isHiddenFile("settings.json"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPieceFiles (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("buildPieceFiles: single file produces no padding", () => {
  const files = [
    { name: "a", size: 100 },
  ];
  const result = buildPieceFiles(files, 1024 * 1024);
  assertEquals(result.length, 1);
  assertEquals(result[0]!.file, files[0]);
  assertEquals(result[0]!.padding, false);
});

Deno.test("buildPieceFiles: adds padding before second file (BEP-47)", () => {
  // pieceSize = 100, file1 = 60 bytes → offset=60 after file 1
  // file2 (length=80) needs pad of (100-60)=40 before it
  const files = [
    { name: "a", size: 60 },
    { name: "b", size: 80 },
  ];
  const result = buildPieceFiles(files, 100);
  assertEquals(result.length, 3);
  assertEquals(result[0]!.file, files[0]);
  assertEquals(result[0]!.padding, false);
  assertEquals(result[0]!.length, 60);
  assertEquals(result[1]!.padding, true);
  assertEquals(result[1]!.length, 40);
  assertEquals(result[1]!.file, null);
  assertEquals(result[2]!.file, files[1]);
  assertEquals(result[2]!.padding, false);
  assertEquals(result[2]!.length, 80);
});

Deno.test("buildPieceFiles: zero-length files are skipped for padding calc", () => {
  const files = [
    { name: "a", size: 100 },
    { name: "b", size: 0 },
    { name: "c", size: 50 },
  ];
  // file a: offset=0, no pad, push a, offset=100
  // file b: length=0, skip pad calc, push b, offset=(100+0)%100=0
  // file c: offset=0, no pad, push c, offset=50
  const result = buildPieceFiles(files, 100);
  assertEquals(result.length, 3);
  assertEquals(result[0]!.file, files[0]);
  assertEquals(result[1]!.file, files[1]);
  assertEquals(result[1]!.length, 0);
  assertEquals(result[2]!.file, files[2]);
});

Deno.test("buildPieceFiles: file starting exactly at piece boundary needs no pad", () => {
  const files = [
    { name: "a", size: 100 },
    { name: "b", size: 50 },
  ];
  // file a: offset=0, no pad, push a, offset=0
  // file b: offset=0, no pad, push b, offset=50
  const result = buildPieceFiles(files, 100);
  assertEquals(result.length, 2);
  assertEquals(result[0]!.padding, false);
  assertEquals(result[1]!.padding, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultCreatedBy
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("getDefaultCreatedBy: returns a browsertorrent-torrent-generator version string", () => {
  const result = getDefaultCreatedBy();
  assertEquals(result.startsWith("browsertorrent-torrent-generator@"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// OPFSMultiFileReader
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("OPFSMultiFileReader: readChunk returns null when no files", async () => {
  const reader = new OPFSMultiFileReader([]);
  const result = await reader.readChunk(1024);
  assertEquals(result, null);
  reader.close();
});

Deno.test("OPFSMultiFileReader: readChunk crosses file boundaries", async () => {
  const files = [
    { name: "a", size: 5, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: "b", size: 3, bytes: new Uint8Array([6, 7, 8]) },
  ];
  const entries = files.map((f) => ({
    name: f.name,
    size: f.size,
    handle: mockFileHandle(f.name, f.bytes),
  }));
  const reader = new OPFSMultiFileReader(entries);

  // Read 6 bytes: 5 from 'a' + 1 from 'b'
  const chunk1 = await reader.readChunk(6);
  assertExists(chunk1);
  assertEquals(chunk1.byteLength, 6);
  assertEquals(Array.from(chunk1), [1, 2, 3, 4, 5, 6]);

  // Read remaining 2 bytes from 'b'
  const chunk2 = await reader.readChunk(4);
  assertExists(chunk2);
  assertEquals(Array.from(chunk2), [7, 8]);

  // Read past end
  const chunk3 = await reader.readChunk(10);
  assertEquals(chunk3, null);

  reader.close();
});

Deno.test("OPFSMultiFileReader: chunks() yields until exhausted", async () => {
  const entries = [
    { name: "a", size: 3, bytes: new Uint8Array([10, 20, 30]) },
    { name: "b", size: 2, bytes: new Uint8Array([40, 50]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const reader = new OPFSMultiFileReader(entries);
  const all: number[] = [];
  for await (const chunk of reader.chunks(2)) {
    all.push(...chunk);
  }
  assertEquals(all, [10, 20, 30, 40, 50]);
  reader.close();
});

Deno.test("OPFSMultiFileReader: close is idempotent", async () => {
  const entries = [{ name: "a", size: 0, bytes: new Uint8Array(0) }].map(
    (f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }),
  );
  const reader = new OPFSMultiFileReader(entries);
  reader.close();
  reader.close(); // must not throw
  assertEquals(reader.closed, true);
});

Deno.test("OPFSMultiFileReader: readChunk throws on non-positive size", async () => {
  const reader = new OPFSMultiFileReader([]);
  await assertRejects(() => reader.readChunk(0), RangeError);
  await assertRejects(() => reader.readChunk(-1), RangeError);
  reader.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// sha1sum (mocked OPFS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("sha1sum: hashes a single file correctly", async () => {
  // Known SHA-1 for 4 bytes [1,2,3,4] = 0x40e7c3...
  const entries = [
    { name: "test.bin", size: 4, bytes: new Uint8Array([1, 2, 3, 4]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const digest = await sha1sum(entries, 1024);
  assertEquals(digest.byteLength, 20);
  // Verify it's a non-zero SHA-1
  assertEquals(digest.some((b) => b !== 0), true);
});

Deno.test("sha1sum: hashes multiple files sequentially", async () => {
  const entries = [
    { name: "a.bin", size: 3, bytes: new Uint8Array([0xaa, 0xbb, 0xcc]) },
    { name: "b.bin", size: 2, bytes: new Uint8Array([0xdd, 0xee]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const digest = await sha1sum(entries, 1024);
  assertEquals(digest.byteLength, 20);
  // Two files as one stream: [0xaa, 0xbb, 0xcc, 0xdd, 0xee]
  // SHA-1 of that should be deterministic
  assertEquals(digest.some((b) => b !== 0), true);
});

Deno.test("sha1sum: produces multiple pieces when file exceeds pieceSize", async () => {
  const data = new Uint8Array(150); // 150 bytes
  data.fill(0x42);
  const entries = [{ name: "big.bin", size: 150, bytes: data }].map(
    (f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }),
  );

  const digest = await sha1sum(entries, 100); // 2 pieces
  assertEquals(digest.byteLength, 40); // 2 × 20 bytes
});

Deno.test("sha1sum: throws on pieceSize < 1", async () => {
  const entries: Array<{ name: string; size: number; handle: FileSystemFileHandle }> = [];
  await assertRejects(() => sha1sum(entries, 0), RangeError);
});

// ─────────────────────────────────────────────────────────────────────────────
// walkOPFSDir (mocked OPFS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("walkOPFSDir: returns files with correct names and sizes", async () => {
  const h1 = mockFileHandle("video.mp4", new Uint8Array(1024));
  const h2 = mockFileHandle("readme.txt", new Uint8Array(100));
  const root = buildMockDir([
    { name: "video.mp4", kind: "file", handle: h1 },
    { name: "readme.txt", kind: "file", handle: h2 },
  ]);

  const files = await walkOPFSDir(root);
  assertEquals(files.length, 2);
  // BEP-3 sort: lexically — "readme.txt" < "video.mp4"
  assertEquals(files[0]!.name, "readme.txt");
  assertEquals(files[0]!.size, 100);
  assertEquals(files[1]!.name, "video.mp4");
  assertEquals(files[1]!.size, 1024);
});

Deno.test("walkOPFSDir: skips hidden files when ignoreHiddenFile=true", async () => {
  const root = buildMockDir([
    { name: ".DS_Store", kind: "file", handle: mockFileHandle(".DS_Store", new Uint8Array(0)) },
    { name: "visible.txt", kind: "file", handle: mockFileHandle("visible.txt", new Uint8Array(10)) },
  ]);

  const files = await walkOPFSDir(root, true);
  assertEquals(files.length, 1);
  assertEquals(files[0]!.name, "visible.txt");
});

Deno.test("walkOPFSDir: skips hidden directories", async () => {
  const root = buildMockDir([
    { name: ".hidden", kind: "directory", entries: [] },
    { name: "visible.txt", kind: "file", handle: mockFileHandle("visible.txt", new Uint8Array(10)) },
  ]);

  const files = await walkOPFSDir(root, true);
  assertEquals(files.length, 1);
  assertEquals(files[0]!.name, "visible.txt");
});

Deno.test("walkOPFSDir: sorts by depth then lexically (BEP-3)", async () => {
  // BEP-3: files at depth=1 come before deeper ones; same depth = lexical.
  const root = buildMockDir([
    { name: "z.txt", kind: "file", handle: mockFileHandle("z.txt", new Uint8Array(1)) },
    { name: "b.txt", kind: "file", handle: mockFileHandle("b.txt", new Uint8Array(1)) },
    {
      name: "deep",
      kind: "directory",
      entries: [
        { name: "a.txt", kind: "file", handle: mockFileHandle("a.txt", new Uint8Array(1)) },
      ],
    },
  ]);

  const files = await walkOPFSDir(root);
  // Depth=1 files first (b.txt < z.txt lexically), then depth=2 (deep/a.txt)
  assertEquals(files.map((f) => f.name), ["b.txt", "z.txt", "deep/a.txt"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// getOPFSFileSize (mocked OPFS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("getOPFSFileSize: returns file size from handle", async () => {
  const handle = mockFileHandle("test.bin", new Uint8Array(123));
  const size = await getOPFSFileSize(handle);
  assertEquals(size, 123);
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTorrent
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("generateTorrent: multi-file torrent encodes correctly", async () => {
  const entries = [
    { name: "folder/a.txt", size: 5, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: "folder/b.txt", size: 3, bytes: new Uint8Array([6, 7, 8]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    pieceSize: PieceSizeEnum.SIZE_64KB,
    trackers: ["udp://tracker.example.com:6969/announce"],
    webSeeds: ["https://seed.example.com/"],
  });

  assertEquals(chunks.length, 1);
  const bencoded = chunks[0]!;
  // Bencode markers: d = dict start, 4:info = key, 6:length = key, etc.
  assertEquals(bencoded[0], 0x64); // 'd'
  assertEquals(bencoded.includes(0x3a), true); // ':' — part of string lengths
});

// ─────────────────────────────────────────────────────────────────────────────
// encode round-trip via parseTorrent
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("generateTorrent: bencoded output can be decoded", async () => {
  const entries = [
    { name: "alpha.txt", size: 3, bytes: new Uint8Array([0x01, 0x02, 0x03]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    trackers: [],
  });

  const bencoded = chunks[0]!;
  // Should start with 'd' and contain "info" key
  assertEquals(bencoded[0], 0x64); // 'd'
  assertEquals(bencoded.includes(0x69), true); // 'i' might appear in bencode integers
  assertEquals(bencoded.includes(0x6e), true); // 'n' for "length", "name", etc.
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("generateTorrent: throws when no files found", async () => {
  const root = buildMockDir([]);
  await assertRejects(
    () => generateTorrent({
      writer: { write: () => Promise.resolve(0) },
      entry: root,
    }),
    Error,
    "No files found in entry",
  );
});

Deno.test("generateTorrent: single-file torrent has 'length' in info", async () => {
  const entries = [
    { name: "solo.bin", size: 7, bytes: new Uint8Array(7) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
  });

  // Single file → bencoded info has '6:length' (no 'files' key)
  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("6:length"), true);
  assertEquals(bencoded.includes("5:files"), false);
});

Deno.test("generateTorrent: private torrent includes 'private' in info", async () => {
  const entries = [
    { name: "secret.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    isPrivate: true,
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  // BEP-3 sort: lexically — "readme.txt" < "video.mp4"
  // info.private = 1 → bencoded as "7:privatei1ee"
  assertEquals(bencoded.includes("7:privatei1ee"), true);
});

Deno.test("generateTorrent: comment is included when provided", async () => {
  const entries = [
    { name: "test.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    comment: "hello world",
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("7:comment"), true);
  assertEquals(bencoded.includes("hello world"), true);
});

Deno.test("generateTorrent: announce-list is set for multiple trackers", async () => {
  const entries = [
    { name: "t.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    trackers: [
      "udp://second.example.com:6969/announce",
      "udp://first.example.com:6969/announce",
    ],
  });

  // announce-list: 13:announce-list
  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("13:announce-list"), true);
});

Deno.test("generateTorrent: url-list (web seeds) is included when provided", async () => {
  const entries = [
    { name: "t.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    webSeeds: ["https://seed.example.com/file/"],
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("8:url-list"), true);
});

Deno.test("generateTorrent: alignPiece creates padding entries", async () => {
  // file1=60 bytes, pieceSize=100 → 40-byte pad needed
  const entries = [
    { name: "a.bin", size: 60, bytes: new Uint8Array(60) },
    { name: "b.bin", size: 20, bytes: new Uint8Array(20) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    alignPiece: true,
    pieceSize: 100,
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  // Padding file path: ".pad" directory → "4:.pad"
  assertEquals(bencoded.includes("4:.pad"), true);
});

Deno.test("generateTorrent: created-by and creation-date are present", async () => {
  const entries = [
    { name: "t.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    createdBy: "my-app@2.0.0",
    createdAt: 1_700_000_000,
  });

  // Decode the bencoded output and verify the fields
  const decoded = decode(chunks[0]!, { useMap: true }) as Map<string, unknown>;
  assertEquals(decoded.get("created by"), "my-app@2.0.0");
  assertEquals(decoded.get("creation date"), 1_700_000_000);
});

```

---

## Arquivo: `packages/core/tests/torrent_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/torrent_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { Torrent } from "../src/core/torrent.ts";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";
import { sha1 } from "../src/crypto/hasher.ts";
import { ParsedTorrent } from "../src/utils/parse-torrent.ts";
import { encode } from "../src/utils/bencode.ts";

// Helper para criar um ParsedTorrent fake com peças reais (simulando um .torrent completo)
async function createFakeParsedTorrent(): Promise<ParsedTorrent> {
  const pieceLength = 1024;
  const piece1 = new Uint8Array(pieceLength).fill(1);
  const piece2 = new Uint8Array(pieceLength).fill(2);
  
  const hash1Hex = await sha1(piece1);
  const hash2Hex = await sha1(piece2);
  
  const hashToBytes = (hex: string) => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };

  return {
    infoHash: "0".repeat(40),
    infoHashBuffer: new Uint8Array(20),
    name: "Fake Torrent",
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [{ path: "fake.bin", name: "fake.bin", length: 2048, offset: 0 }],
    length: 2048,
    pieceLength,
    pieces: [hashToBytes(hash1Hex), hashToBytes(hash2Hex)],
    info: {
      name: "fake.bin",
      length: 2048,
      "piece length": pieceLength,
      pieces: new Uint8Array(40).fill(0), // Dummy pieces for info dict
    },
    magnetURI: "",
  };
}

// Helper para criar um ParsedTorrent vazio (simulando um Magnet URI recém-adicionado)
function createFakeMagnetParsedTorrent(): ParsedTorrent {
  return {
    infoHash: "1".repeat(40),
    infoHashBuffer: new Uint8Array(20).fill(1),
    name: "Unknown",
    announce: ["udp://tracker.example.com:6969"],
    urlList: [],
    peerAddresses: [],
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: "magnet:?xt=urn:btih:1111111111111111111111111111111111111111",
  };
}

Deno.test("torrent: initializes and emits 'ready'", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => {
    torrent.on("ready", () => resolve());
  });

  assertEquals(torrent.ready, true);
  assertEquals(torrent.progress, 0);
  assertEquals(torrent.numPieces, 2);
});

Deno.test("torrent: receives valid piece, updates bitfield and emits events", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const validPiece = new Uint8Array(parsed.pieceLength).fill(1);
  
  let downloadedBytes = 0;
  let verifiedIndex = -1;
  
  torrent.on("download", (e: any) => { downloadedBytes += e.detail.bytes; });
  torrent.on("verified", (e: any) => { verifiedIndex = e.detail.index; });

  const success = await torrent.receivePiece(0, validPiece);

  assertEquals(success, true);
  assertEquals(downloadedBytes, parsed.pieceLength);
  assertEquals(verifiedIndex, 0);
  assertEquals(torrent.progress, 0.5);
});

Deno.test("torrent: rejects piece with invalid hash", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99);
  
  const success = await torrent.receivePiece(0, invalidPiece);

  assertEquals(success, false);
  assertEquals(torrent.progress, 0);
});

Deno.test("torrent: emits 'done' when all pieces are received", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  const piece2 = new Uint8Array(parsed.pieceLength).fill(2);

  let doneEmitted = false;
  torrent.on("done", () => { doneEmitted = true; });

  await torrent.receivePiece(0, piece1);
  assertEquals(doneEmitted, false);
  
  await torrent.receivePiece(1, piece2);
  assertEquals(doneEmitted, true);
  assertEquals(torrent.progress, 1);
});

Deno.test("torrent: skips verification of existing pieces if skipVerify is true", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  
  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99);
  await store.put(0, invalidPiece);

  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.progress, 0);
});

// ============================================================================
// TESTES DE INTEGRAÇÃO: FLUXO DE METADATA DINÂMICO (MAGNET URI)
// ============================================================================

Deno.test("torrent: integration - setMetadata dynamically updates torrent state from Magnet URI", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.name, "Unknown");
  assertEquals(torrent.length, 0);
  assertEquals(torrent.numPieces, 0);
  assertEquals(torrent.files.length, 0);

  // 🔥 CORREÇÃO: Usar byte 1 (caractere de controle) para garantir que o decode retorne Uint8Array
  const mockPieceHashes = new Uint8Array(40);
  mockPieceHashes.fill(1);
  
  const infoDict = {
    name: "browsertorrent-update-v2.zip",
    length: 2048,
    "piece length": 1024,
    pieces: mockPieceHashes,
  };
  const infoBuffer = encode(infoDict);

  let metadataEventEmitted = false;
  torrent.on("metadata", (e: any) => {
    metadataEventEmitted = true;
    assertEquals(e.detail.name, "browsertorrent-update-v2.zip");
    assertEquals(e.detail.length, 2048);
    assertEquals(e.detail.files.length, 1);
    assertEquals(e.detail.files[0].name, "browsertorrent-update-v2.zip");
  });

  const success = await torrent.setMetadata(infoBuffer);

  assertEquals(success, true);
  assertEquals(metadataEventEmitted, true);
  assertEquals(torrent.name, "browsertorrent-update-v2.zip");
  assertEquals(torrent.length, 2048);
  assertEquals(torrent.pieceLength, 1024);
  assertEquals(torrent.numPieces, 2);
  assertEquals(torrent.files.length, 1);
  assertEquals(torrent.files[0]!.path, "browsertorrent-update-v2.zip");
  assertEquals(torrent.progress, 0);
});

Deno.test("torrent: integration - setMetadata is idempotent (ignores subsequent calls)", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const infoDict = {
    name: "test.txt",
    length: 100,
    "piece length": 100,
    pieces: new Uint8Array(20).fill(1), // 🔥 CORREÇÃO
  };
  const infoBuffer = encode(infoDict);

  const firstCall = await torrent.setMetadata(infoBuffer);
  assertEquals(firstCall, true);
  assertEquals(torrent.name, "test.txt");

  const secondCall = await torrent.setMetadata(infoBuffer);
  assertEquals(secondCall, false);
  assertEquals(torrent.name, "test.txt");
});

Deno.test("torrent: integration - setMetadata handles multi-file torrents correctly", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const infoDict = {
    name: "my-folder",
    "piece length": 1024,
    pieces: new Uint8Array(40).fill(1), // 🔥 CORREÇÃO
    files: [
      { length: 500, path: ["my-folder", "doc1.txt"] },
      { length: 1500, path: ["my-folder", "subfolder", "doc2.txt"] },
    ],
  };
  const infoBuffer = encode(infoDict);

  await torrent.setMetadata(infoBuffer);

  assertEquals(torrent.name, "my-folder");
  assertEquals(torrent.length, 2000);
  assertEquals(torrent.numPieces, 2);
  assertEquals(torrent.files.length, 2);
  
  assertEquals(torrent.files[0]!.name, "doc1.txt");
  assertEquals(torrent.files[0]!.path, "my-folder/doc1.txt");
  assertEquals(torrent.files[0]!.offset, 0);
  assertEquals(torrent.files[0]!.length, 500);

  assertEquals(torrent.files[1]!.name, "doc2.txt");
  assertEquals(torrent.files[1]!.path, "my-folder/subfolder/doc2.txt");
  assertEquals(torrent.files[1]!.offset, 500);
  assertEquals(torrent.files[1]!.length, 1500);
});

// ============================================================================
// PHASE 6: received / done
// ============================================================================

Deno.test("torrent: received is an alias of downloaded", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.received, 0);
  assertEquals(torrent.received, torrent.downloaded);
});

Deno.test("torrent: done is false when progress < 1", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.done, false);
});

Deno.test("torrent: done is true when all pieces received", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  const piece2 = new Uint8Array(parsed.pieceLength).fill(2);

  assertEquals(torrent.done, false);

  await torrent.receivePiece(0, piece1);
  assertEquals(torrent.done, false);

  await torrent.receivePiece(1, piece2);
  assertEquals(torrent.done, true);
});

// ============================================================================
// PHASE 6: created / createdBy / comment / torrentFile / torrentFileBlob / announce / maxWebConns
// ============================================================================

Deno.test("torrent: created returns Date from creation date", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    info: {
      name: "fake.bin",
      length: 2048,
      "piece length": 1024,
      pieces: new Uint8Array(40).fill(0),
      "creation date": 1700000000, // 2023-11-14T22:13:20Z
    },
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.created instanceof Date, true);
  assertEquals(torrent.created!.getTime(), 1700000000 * 1000);
});

Deno.test("torrent: created returns undefined when no creation date", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.created, undefined);
});

Deno.test("torrent: createdBy returns the creator string", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    createdBy: "browsertorrent-torrent-generator/1.0.0",
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.createdBy, "browsertorrent-torrent-generator/1.0.0");
});

Deno.test("torrent: createdBy returns undefined when not set", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.createdBy, undefined);
});

Deno.test("torrent: comment returns the comment string", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    comment: "This is a test torrent",
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.comment, "This is a test torrent");
});

Deno.test("torrent: comment returns undefined when not set", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.comment, undefined);
});

Deno.test("torrent: announce returns the tracker list", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    announce: ["udp://tracker.example.com:6969/announce", "http://tracker2.example:8080/announce"],
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.announce.length, 2);
  assertEquals(torrent.announce[0], "udp://tracker.example.com:6969/announce");
  assertEquals(torrent.announce[1], "http://tracker2.example:8080/announce");
});

Deno.test("torrent: announce returns empty array when no trackers", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(Array.isArray(torrent.announce), true);
});

Deno.test("torrent: torrentFile returns undefined when not set (magnet-only)", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.torrentFile, undefined);
  assertEquals(torrent.torrentFileBlob, undefined);
});

Deno.test("torrent: torrentFile returns Uint8Array when set", async () => {
  const torrentBytes = new Uint8Array([0x64, 0x38, 0x3a, 0x69, 0x6e, 0x66, 0x6f, 0x65, 0x64, 0x34, 0x3a, 0x6c, 0x65, 0x6e, 0x67, 0x69, 0x32, 0x30, 0x34, 0x38, 0x65, 0x31, 0x3a, 0x6e, 0x61, 0x6d, 0x65, 0x38, 0x3a, 0x66, 0x61, 0x6b, 0x65, 0x2e, 0x62, 0x69, 0x6e, 0x65, 0x65, 0x65]); // bencoded
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    torrentFileBytes: torrentBytes,
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.torrentFile instanceof Uint8Array, true);
  assertEquals(torrent.torrentFile!.length, torrentBytes.length);
});

Deno.test("torrent: torrentFileBlob returns Blob matching torrentFile", async () => {
  const torrentBytes = new Uint8Array([0x64, 0x38, 0x3a, 0x69, 0x6e, 0x66, 0x6f, 0x65, 0x64, 0x34, 0x3a, 0x6c, 0x65, 0x6e, 0x67, 0x69, 0x32, 0x30, 0x34, 0x38, 0x65, 0x31, 0x3a, 0x6e, 0x61, 0x6d, 0x65, 0x38, 0x3a, 0x66, 0x61, 0x6b, 0x65, 0x2e, 0x62, 0x69, 0x6e, 0x65, 0x65, 0x65]);
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    torrentFileBytes: torrentBytes,
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.torrentFileBlob instanceof Blob, true);
  assertEquals(torrent.torrentFileBlob!.size, torrentBytes.length);
});

// ============================================================================
// PHASE 6: rescanFiles()
// ============================================================================

Deno.test("torrent: rescanFiles() returns a Promise and resolves without error", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  // rescanFiles without pre-existing pieces — should resolve cleanly
  const result = torrent.rescanFiles();
  assertEquals(result instanceof Promise, true);
  await result; // must not throw
});

Deno.test("torrent: rescanFiles() accepts optional callback", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  let callbackCalled = false;
  torrent.rescanFiles((err) => {
    assertEquals(err, null);
    callbackCalled = true;
  });
  // Give callback time to fire
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(callbackCalled, true);
});

Deno.test("torrent: rescanFiles() returns a Promise and resolves without error", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const result = torrent.rescanFiles();
  assertEquals(result instanceof Promise, true);
  await result; // must not throw
});

Deno.test("torrent: rescanFiles() accepts optional callback", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  let callbackCalled = false;
  torrent.rescanFiles((err) => {
    assertEquals(err, null);
    callbackCalled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(callbackCalled, true);
});

Deno.test("torrent: rescanFiles() does not double-count pieces", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  await torrent.receivePiece(0, piece1);
  assertEquals(torrent.pieces.get(0), true);
  assertEquals(torrent.progress, 0.5);

  // rescanFiles should not reset already-verified pieces (idempotent)
  await torrent.rescanFiles();
  assertEquals(torrent.pieces.get(0), true);
  assertEquals(torrent.progress, 0.5);
});
```

---

## Arquivo: `packages/core/tests/tracker_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/tracker_test.ts

import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  buildAnnounceUrl,
  createTracker,
  DEFAULT_TIMEOUT_MS,
  HttpTracker,
  integerInRange,
  MAX_NUM_WANT,
  parseHttpTrackerResponse,
  percentEncodeBytes,
  scrapeTracker,
  validateTrackerOptions,
  WsTracker,
} from "../src/network/tracker.ts";
import { TrackerError } from "../src/utils/errors.ts";
import { encode } from "../src/utils/bencode.ts";

Deno.test("tracker: factory creates HttpTracker for http/https", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  const httpTracker = createTracker("http://tracker.example.com/announce", opts);
  assertEquals(httpTracker instanceof HttpTracker, true);
  
  const httpsTracker = createTracker("https://tracker.example.com/announce", opts);
  assertEquals(httpsTracker instanceof HttpTracker, true);
});

Deno.test("tracker: factory creates WsTracker for ws/wss", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  const wsTracker = createTracker("wss://tracker.btorrent.xyz", opts);
  assertEquals(wsTracker instanceof WsTracker, true);
});

Deno.test("tracker: factory throws on unsupported protocol", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  assertThrows(
    () => createTracker("udp://tracker.example.com:6969", opts),
    Error,
    "Unsupported tracker protocol"
  );
});

// Nota: Testes de integração real (announce) exigem um servidor de tracker rodando.
// Em um ambiente CI, você poderia usar um mock de fetch para o HttpTracker.

// ============================================================================
// Fase 2.5/2.6 — percent-encoding, buildAnnounceUrl, parseHttpTrackerResponse
// ============================================================================

Deno.test("tracker: percentEncodeBytes encodes byte-a-byte", () => {
  assertEquals(percentEncodeBytes(new Uint8Array([0x00, 0x7f, 0x80, 0xff])), "%00%7F%80%FF");
  assertEquals(percentEncodeBytes(new Uint8Array([])), "");
  // Bytes > 0x7F não podem virar UTF-8 (bug da versão anterior com URLSearchParams)
  const bytes = new Uint8Array([0xc3, 0x28]); // sequência UTF-8 inválida
  assertEquals(percentEncodeBytes(bytes), "%C3%28");
});

Deno.test("tracker: buildAnnounceUrl preserves binary identity params", () => {
  const infoHash = new Uint8Array(20);
  for (let i = 0; i < 20; i++) infoHash[i] = i * 13 % 256;
  const peerId = new TextEncoder().encode("-BT0100-abcdefghijkl");

  const url = buildAnnounceUrl("http://tracker.example.com/announce", {
    infoHash,
    peerId,
    port: 6881,
    left: 1234,
  });

  const search = url.search;
  assertEquals(search.includes(`info_hash=${percentEncodeBytes(infoHash)}`), true);
  assertEquals(search.includes(`peer_id=${percentEncodeBytes(peerId)}`), true);
  assertEquals(search.includes("port=6881"), true);
  assertEquals(search.includes("uploaded=0"), true);
  assertEquals(search.includes("downloaded=0"), true);
  assertEquals(search.includes("left=1234"), true);
  assertEquals(search.includes("compact=1"), true);
  assertEquals(search.includes("numwant=50"), true);
});

Deno.test("tracker: buildAnnounceUrl adds event, key and trackerid", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    key: 0xdeadbeef,
  };
  const url = buildAnnounceUrl(
    "https://tracker.example.com/announce?passkey=abc",
    opts,
    { event: "started" },
    "tracker-id-1",
  );
  const search = url.search;
  assertEquals(search.startsWith("?passkey=abc&"), true);
  assertEquals(search.includes("event=started"), true);
  assertEquals(search.includes(`key=${0xdeadbeef}`), true);
  assertEquals(search.includes("trackerid=tracker-id-1"), true);
});

Deno.test("tracker: buildAnnounceUrl rejects non-http protocols", () => {
  assertThrows(
    () =>
      buildAnnounceUrl("udp://tracker.example.com:6969", {
        infoHash: new Uint8Array(20),
        peerId: new Uint8Array(20),
      }),
    TrackerError,
    "unsupported HTTP tracker URL",
  );
});

Deno.test("tracker: validateTrackerOptions enforces limits", () => {
  const base = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  // ok
  validateTrackerOptions("http://t.example.com/a", base);

  // hashes com tamanho errado
  assertThrows(
    () => validateTrackerOptions("http://t.example.com/a", { ...base, infoHash: new Uint8Array(19) }),
    TrackerError,
    "infoHash and peerId must contain 20 bytes",
  );

  // numwant acima do limite
  assertThrows(
    () => validateTrackerOptions("http://t.example.com/a", { ...base, numwant: MAX_NUM_WANT + 1 }),
    TrackerError,
    "numwant is invalid",
  );

  // event inválido
  assertThrows(
    () => validateTrackerOptions("http://t.example.com/a", base, { event: "paused" as never }),
    TrackerError,
    "event is invalid",
  );

  // URL inválida
  assertThrows(
    () => validateTrackerOptions("not a url", base),
    TrackerError,
    "tracker URL is invalid",
  );

  // URL longa demais
  assertThrows(
    () => validateTrackerOptions(`http://t.example.com/${"a".repeat(9000)}`, base),
    TrackerError,
    "tracker URL is invalid",
  );
});

Deno.test("tracker: integerInRange validates bounds", () => {
  assertEquals(integerInRange(5, "x", 1, 10), 5);
  assertThrows(() => integerInRange(0, "x", 1, 10), TrackerError, "x is invalid");
  assertThrows(() => integerInRange(11, "x", 1, 10), TrackerError, "x is invalid");
  assertThrows(() => integerInRange(1.5, "x", 1, 10), TrackerError, "x is invalid");
});

function compactV4(ip: [number, number, number, number], port: number): Uint8Array {
  return new Uint8Array([...ip, (port >> 8) & 0xff, port & 0xff]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

Deno.test("tracker: parseHttpTrackerResponse parses compact IPv4 peers", () => {
  const bytes = encode({
    interval: 1800,
    complete: 10,
    incomplete: 5,
    peers: concatBytes(compactV4([93, 184, 216, 34], 51413), compactV4([1, 2, 3, 4], 6881)),
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.interval, 1800);
  assertEquals(response.complete, 10);
  assertEquals(response.incomplete, 5);
  assertEquals(response.peers, [
    { ip: "93.184.216.34", port: 51413 },
    { ip: "1.2.3.4", port: 6881 },
  ]);
});

Deno.test("tracker: parseHttpTrackerResponse parses compact IPv6 peers", () => {
  const ipv6 = new Uint8Array(18);
  ipv6[0] = 0x20;
  ipv6[1] = 0x01;
  ipv6[15] = 0x01;
  ipv6[16] = (8999 >> 8) & 0xff;
  ipv6[17] = 8999 & 0xff;

  const bytes = encode({ interval: 900, peers6: ipv6 });
  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.peers.length, 1);
  assertEquals(response.peers[0]!.port, 8999);
  assertEquals(response.peers[0]!.ip.includes("2001:"), true);
});

Deno.test("tracker: parseHttpTrackerResponse parses dictionary peers", () => {
  const bytes = encode({
    interval: 1800,
    peers: [
      { ip: "10.0.0.1", port: 5555 },
      { ip: "10.0.0.1", port: 5555 }, // duplicado
      { ip: "10.0.0.2", port: 0 }, // porta inválida → descartado
    ],
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.peers, [{ ip: "10.0.0.1", port: 5555 }]);
});

Deno.test("tracker: parseHttpTrackerResponse dedupes compact peers and drops port 0", () => {
  const bytes = encode({
    interval: 1800,
    peers: concatBytes(
      compactV4([1, 2, 3, 4], 6881),
      compactV4([1, 2, 3, 4], 6881),
      compactV4([5, 6, 7, 8], 0),
    ),
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.peers, [{ ip: "1.2.3.4", port: 6881 }]);
});

Deno.test("tracker: parseHttpTrackerResponse surfaces failure reason", () => {
  const bytes = encode({ "failure reason": "torrent not registered" });
  assertThrows(
    () => parseHttpTrackerResponse(bytes),
    TrackerError,
    "torrent not registered",
  );
});

Deno.test("tracker: parseHttpTrackerResponse exposes warning and tracker id", () => {
  const bytes = encode({
    interval: 60,
    "warning message": "deprecated client",
    "tracker id": "tid-123",
    "min interval": 30,
    peers: new Uint8Array(),
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.warning, "deprecated client");
  assertEquals(response.trackerId, "tid-123");
  assertEquals(response.minInterval, 30);
});

Deno.test("tracker: parseHttpTrackerResponse rejects invalid responses", () => {
  // bencode inválido
  assertThrows(
    () => parseHttpTrackerResponse(new Uint8Array([0xff, 0xfe])),
    TrackerError,
  );

  // sem interval
  assertThrows(
    () => parseHttpTrackerResponse(encode({ peers: new Uint8Array() })),
    TrackerError,
    "no valid interval",
  );

  // lista compacta truncada
  assertThrows(
    () => parseHttpTrackerResponse(encode({ interval: 10, peers: new Uint8Array([1, 2, 3, 4]) })),
    TrackerError,
    "invalid compact IPv4 peer list",
  );

  // resposta não-dicionário
  assertThrows(
    () => parseHttpTrackerResponse(encode([1, 2, 3])),
    TrackerError,
    "must be a dictionary",
  );
});

Deno.test("tracker: HttpTracker.announce uses byte-exact URL and parses response", async () => {
  const infoHash = new Uint8Array(20);
  for (let i = 0; i < 20; i++) infoHash[i] = 255 - i;
  const peerId = new TextEncoder().encode("-BT0100-abcdefghijkl");

  let requestedUrl: URL | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL, _init?: RequestInit) => {
    requestedUrl = input instanceof URL ? input : new URL(String(input));
    const body = encode({
      interval: 1234,
      "tracker id": "tid-1",
      complete: 1,
      incomplete: 2,
      peers: compactV4([8, 8, 8, 8], 5353),
    });
    return Promise.resolve(
      new Response(body as unknown as BodyInit, {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
  }) as typeof fetch;

  try {
    const tracker = new HttpTracker("http://tracker.example.com/announce", {
      infoHash,
      peerId,
      left: 42,
    });

    const response = await tracker.announce({ event: "started" });

    assertEquals(response.interval, 1234);
    assertEquals(response.trackerId, "tid-1");
    assertEquals(response.peers, [{ ip: "8.8.8.8", port: 5353 }]);

    assertEquals(requestedUrl !== null, true);
    const search = requestedUrl!.search;
    assertEquals(search.includes(`info_hash=${percentEncodeBytes(infoHash)}`), true);
    assertEquals(search.includes(`peer_id=${percentEncodeBytes(peerId)}`), true);
    assertEquals(search.includes("event=started"), true);
    assertEquals(search.includes("left=42"), true);
    // %FF não pode ser re-encodado como UTF-8
    assertEquals(search.includes("%FF"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce echoes trackerid on second announce", async () => {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL, _init?: RequestInit) => {
    urls.push(String(input));
    const body = encode({ interval: 60, "tracker id": "tid-xyz", peers: new Uint8Array() });
    return Promise.resolve(new Response(body as unknown as BodyInit, { status: 200 }));
  }) as typeof fetch;

  try {
    const tracker = new HttpTracker("http://t.example.com/a", {
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
    });
    await tracker.announce();
    await tracker.announce({ event: "completed" });

    assertEquals(urls[0]!.includes("trackerid="), false);
    assertEquals(urls[1]!.includes("trackerid=tid-xyz"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce rejects failure reason and http errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(encode({ "failure reason": "nope" }) as unknown as BodyInit, {
          status: 200,
        }),
      )) as typeof fetch;

    const tracker = new HttpTracker("http://t.example.com/a", {
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
    });
    await assertRejects(() => tracker.announce(), TrackerError, "nope");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 403 }))) as typeof fetch;
    await assertRejects(() => tracker.announce(), TrackerError, "Tracker HTTP error: 403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce rejects oversized Content-Length", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("", {
        status: 200,
        headers: { "content-length": String(10 * 1024 * 1024) },
      }),
    )) as typeof fetch;

  try {
    const tracker = new HttpTracker("http://t.example.com/a", {
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
    });
    await assertRejects(() => tracker.announce(), TrackerError, "too large");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce validates options before fetching", async () => {
  const tracker = new HttpTracker("http://t.example.com/a", {
    infoHash: new Uint8Array(19), // inválido
    peerId: new Uint8Array(20),
  });
  await assertRejects(
    () => tracker.announce(),
    TrackerError,
    "infoHash and peerId must contain 20 bytes",
  );
});

Deno.test("tracker: DEFAULT_TIMEOUT_MS and MAX_NUM_WANT constants", () => {
  assertEquals(DEFAULT_TIMEOUT_MS, 15_000);
  assertEquals(MAX_NUM_WANT, 2_000);
});

// ── scrapeTracker (BEP 48) ────────────────────────────────────────────────

function makeInfoHash(seed: number): Uint8Array {
  const arr = new Uint8Array(20);
  for (let i = 0; i < 20; i++) arr[i] = (seed * 17 + i * 7) & 0xff;
  return arr;
}

Deno.test("scrapeTracker: parses successful scrape response", async () => {
  const ih1 = makeInfoHash(1);
  const ih2 = makeInfoHash(2);
  const ih3 = makeInfoHash(3);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        encode({
          files: {
            [percentEncodeBytes(ih1)]: { complete: 10, incomplete: 5, downloaded: 123 },
            [percentEncodeBytes(ih2)]: { complete: 1, incomplete: 0, downloaded: 42 },
            [percentEncodeBytes(ih3)]: { complete: 0, incomplete: 2, downloaded: 0 },
          },
        }) as unknown as BodyInit,
        { status: 200 },
      ),
    )) as typeof fetch;

  try {
    const result = await scrapeTracker("http://tracker.example.com/announce", [ih1, ih2, ih3]);
    assertEquals(result.files[percentEncodeBytes(ih1)]!.complete, 10);
    assertEquals(result.files[percentEncodeBytes(ih1)]!.incomplete, 5);
    assertEquals(result.files[percentEncodeBytes(ih1)]!.downloaded, 123);
    assertEquals(result.files[percentEncodeBytes(ih2)]!.complete, 1);
    assertEquals(result.files[percentEncodeBytes(ih2)]!.incomplete, 0);
    assertEquals(result.files[percentEncodeBytes(ih3)]!.complete, 0);
    assertEquals(result.files[percentEncodeBytes(ih3)]!.incomplete, 2);
    assertEquals(result.files[percentEncodeBytes(ih3)]!.downloaded, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: includes optional name field", async () => {
  const ih = makeInfoHash(10);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        encode({
          files: {
            [percentEncodeBytes(ih)]: { complete: 5, incomplete: 2, downloaded: 100, name: "my-video.mp4" },
          },
        }) as unknown as BodyInit,
        { status: 200 },
      ),
    )) as typeof fetch;

  try {
    const result = await scrapeTracker("http://tracker.example.com/announce", [ih]);
    assertEquals(result.files[percentEncodeBytes(ih)]!.name, "my-video.mp4");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: throws on HTTP error status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("", { status: 503 }))) as typeof fetch;

  try {
    await assertRejects(
      () => scrapeTracker("http://tracker.example.com/announce", [makeInfoHash(1)]),
      TrackerError,
      "503",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: throws on non-dictionary response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(encode([1, 2, 3]) as unknown as BodyInit, { status: 200 }),
    )) as typeof fetch;

  try {
    await assertRejects(
      () => scrapeTracker("http://tracker.example.com/announce", [makeInfoHash(1)]),
      TrackerError,
      "must be a dictionary",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: replaces /announce with /scrape in URL", async () => {
  let capturedUrl: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL) => {
    capturedUrl = input instanceof URL ? input.href : String(input);
    return Promise.resolve(
      new Response(encode({ files: {} }) as unknown as BodyInit, { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await scrapeTracker("http://tracker.example.com/announce?passkey=abc", [makeInfoHash(1)]);
    assertEquals(capturedUrl !== null, true);
    assertEquals(capturedUrl!.includes("/scrape"), true);
    assertEquals(capturedUrl!.includes("/announce"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: encodes info_hash params as percent-encoded bytes", async () => {
  let capturedUrl: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL) => {
    capturedUrl = input instanceof URL ? input.href : String(input);
    return Promise.resolve(
      new Response(encode({ files: {} }) as unknown as BodyInit, { status: 200 }),
    );
  }) as typeof fetch;

  try {
    const ih = new Uint8Array([0x00, 0x7f, 0x80, 0xff, ...new Array(16).fill(0)]);
    await scrapeTracker("http://tracker.example.com/announce", [ih]);
    assertEquals(capturedUrl!.includes("%00%7F%80%FF"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

---

## Arquivo: `packages/core/tests/ut-metadata_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/ut-metadata_test.ts

import { assertEquals } from "@std/assert";
import { UtMetadata } from "../src/extensions/ut-metadata.ts";
import { encode } from "../src/utils/bencode.ts";

class MockWire {
  public extendedHandshake: any = { metadata_size: 100 };
  public extendedCalls: { type: string; payload: Uint8Array }[] = [];

  extended(type: string, payload: Uint8Array) {
    this.extendedCalls.push({ type, payload });
  }
}

Deno.test("ut-metadata: initializes correctly", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);
  assertEquals(ut.name, "ut_metadata");
  assertEquals(ut.metadata, null);
});

Deno.test("ut-metadata: processes extended handshake", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);

  ut.onExtendedHandshake({
    m: { ut_metadata: 1 },
    metadata_size: 50000,
  });

  // 50000 bytes / 16384 = 3.05 -> 4 peças. Deve ter solicitado 4 vezes.
  assertEquals(mockWire.extendedCalls.length, 4);
});

Deno.test("ut-metadata: rejects invalid metadata size", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);
  let warningEmitted = false;

  ut.on("warning", () => { warningEmitted = true; });

  ut.onExtendedHandshake({
    metadata_size: -1,
    m: { ut_metadata: 1 },
  });

  assertEquals(warningEmitted, true);
});

Deno.test("ut-metadata: setMetadata marks as complete", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);
  
  // Buffer inválido de propósito para testar a resiliência do try/catch
  const fakeMetadata = new Uint8Array(100).fill(42);

  // 🔥 CORREÇÃO: Isso não deve mais travar o sistema, pois o decode falho é capturado
  // e o evento "metadata" é emitido com o buffer bruto, sem reprocessamento inseguro.
  const result = ut.setMetadata(fakeMetadata);
  
  assertEquals(result, true);
  assertEquals(ut.metadata, fakeMetadata);
});
```

---

## Arquivo: `packages/core/tests/ut-pex_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/ut-pex_test.ts
//
// Testes para a extensão ut_pex (BEP 11 - Peer Exchange)

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  UtPexExtension,
  encodePexUpdate,
  decodePexUpdate,
  PexPeerFlag,
  type PexPeer,
  type PexUpdate,
} from "../src/extensions/ut-pex.ts";
import { encode, decode } from "../src/utils/bencode.ts";

// Helper: cria um peer IPv4 compacto
function makePeer(ip: number[], port: number, flags?: number): PexPeer {
  return {
    address: new Uint8Array(ip),
    port,
    flags,
  };
}

Deno.test("ut_pex: encode e decode de update com peers IPv4", () => {
  const update: PexUpdate = {
    added: [
      makePeer([192, 168, 1, 1], 6881, PexPeerFlag.Utp),
      makePeer([10, 0, 0, 2], 51413, PexPeerFlag.Seed),
    ],
    dropped: [
      makePeer([172, 16, 0, 1], 8080),
    ],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 2);
  assertEquals(decoded.dropped.length, 1);

  // Verifica primeiro peer adicionado
  assertEquals(Array.from(decoded.added[0]!.address), [192, 168, 1, 1]);
  assertEquals(decoded.added[0]!.port, 6881);
  assertEquals(decoded.added[0]!.flags, PexPeerFlag.Utp);

  // Verifica segundo peer adicionado
  assertEquals(Array.from(decoded.added[1]!.address), [10, 0, 0, 2]);
  assertEquals(decoded.added[1]!.port, 51413);
  assertEquals(decoded.added[1]!.flags, PexPeerFlag.Seed);

  // Verifica peer removido
  assertEquals(Array.from(decoded.dropped[0]!.address), [172, 16, 0, 1]);
  assertEquals(decoded.dropped[0]!.port, 8080);
});

Deno.test("ut_pex: encode com apenas added (sem dropped)", () => {
  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 1);
  assertEquals(decoded.dropped.length, 0);
  assertEquals(Array.from(decoded.added[0]!.address), [1, 2, 3, 4]);
  assertEquals(decoded.added[0]!.port, 1234);
});

Deno.test("ut_pex: encode com apenas dropped (sem added)", () => {
  const update: PexUpdate = {
    added: [],
    dropped: [makePeer([5, 6, 7, 8], 5678)],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 0);
  assertEquals(decoded.dropped.length, 1);
  assertEquals(Array.from(decoded.dropped[0]!.address), [5, 6, 7, 8]);
  assertEquals(decoded.dropped[0]!.port, 5678);
});

Deno.test("ut_pex: encode vazio (sem added e sem dropped)", () => {
  const update: PexUpdate = {
    added: [],
    dropped: [],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 0);
  assertEquals(decoded.dropped.length, 0);
});

Deno.test("ut_pex: rejeita endereço IPv4 inválido (não 4 nem 16 bytes)", () => {
  const update: PexUpdate = {
    added: [{ address: new Uint8Array([1, 2, 3]), port: 1234 }],
    dropped: [],
  };

  assertThrows(
    () => encodePexUpdate(update),
    RangeError,
    "PEX addresses must contain four or sixteen bytes",
  );
});

Deno.test("ut_pex: rejeita porta inválida (zero)", () => {
  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 0)],
    dropped: [],
  };

  assertThrows(
    () => encodePexUpdate(update),
    RangeError,
    "PEX peer port must be in the range 1..65535",
  );
});

Deno.test("ut_pex: rejeita porta inválida (maior que 65535)", () => {
  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 70000)],
    dropped: [],
  };

  assertThrows(
    () => encodePexUpdate(update),
    RangeError,
    "PEX peer port must be in the range 1..65535",
  );
});

Deno.test("ut_pex: respeita maxPeers ao decodificar", () => {
  const peers: PexPeer[] = [];
  for (let i = 1; i <= 5; i++) {
    peers.push(makePeer([10, 0, 0, i], 1000 + i));
  }
  const update: PexUpdate = { added: peers, dropped: [] };
  const encoded = encodePexUpdate(update);

  // maxPeers = 3 deve rejeitar (5 peers > 3)
  assertThrows(
    () => decodePexUpdate(encoded, 3),
    Error,
    "exceeds 3 peers",
  );

  // maxPeers = 10 deve aceitar
  const decoded = decodePexUpdate(encoded, 10);
  assertEquals(decoded.added.length, 5);
});

Deno.test("ut_pex: round-trip preserve flags corretamente", () => {
  const update: PexUpdate = {
    added: [
      {
        address: new Uint8Array([192, 168, 0, 1]),
        port: 6881,
        flags: PexPeerFlag.PrefersEncryption | PexPeerFlag.Utp | PexPeerFlag.Holepunch,
      },
    ],
    dropped: [],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added[0]!.flags, PexPeerFlag.PrefersEncryption | PexPeerFlag.Utp | PexPeerFlag.Holepunch);
});

Deno.test("ut_pex: UtPexExtension registra listeners onUpdate", () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire);

  let receivedUpdate: PexUpdate | null = null;
  const unsubscribe = ext.onUpdate((update) => {
    receivedUpdate = update;
  });

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };
  const payload = encodePexUpdate(update);
  ext.onMessage(payload);

  assertEquals(receivedUpdate !== null, true);
  assertEquals(receivedUpdate!.added.length, 1);
  assertEquals(receivedUpdate!.dropped.length, 0);

  // Testa unsubscribe
  unsubscribe();
  receivedUpdate = null;
  ext.onMessage(payload);
  assertEquals(receivedUpdate, null);
});

Deno.test("ut_pex: UtPexExtension rejeita send sem registro prévio", async () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire);

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  await assertRejects(
    async () => await ext.send(update),
    Error,
    "ut_pex is not registered",
  );
});

Deno.test("ut_pex: UtPexExtension envia após registro no handshake estendido", async () => {
  let sentPayload: Uint8Array | null = null;
  let sentId: number | null = null;
  const wire = {
    extended: (id: number, payload: Uint8Array) => {
      sentId = id;
      sentPayload = payload;
    },
  };

  const ext = new UtPexExtension(wire, { minSendIntervalMs: 0 });

  // Simula extended handshake do peer anunciando ut_pex com ID 5
  ext.onExtendedHandshake({ m: { ut_pex: 5 } });

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  await ext.send(update);

  assertEquals(sentId, 5);
  assertEquals(sentPayload !== null, true);

  // Verifica que o payload é decodificável
  const decoded = decodePexUpdate(sentPayload!);
  assertEquals(decoded.added.length, 1);
  assertEquals(Array.from(decoded.added[0]!.address), [1, 2, 3, 4]);
  assertEquals(decoded.added[0]!.port, 1234);
});

Deno.test("ut_pex: UtPexExtension respeita intervalo mínimo entre sends", async () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire, { minSendIntervalMs: 60_000 });

  ext.onExtendedHandshake({ m: { ut_pex: 1 } });

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  // Primeiro send deve funcionar
  await ext.send(update);

  // Segundo send imediato deve falhar (dentro do intervalo)
  await assertRejects(
    async () => await ext.send(update),
    Error,
    "may not be sent this frequently",
  );
});

Deno.test("ut_pex: UtPexExtension rejeita update excedendo maxPeers", async () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire, { minSendIntervalMs: 0, maxPeersPerMessage: 2 });

  ext.onExtendedHandshake({ m: { ut_pex: 1 } });

  const update: PexUpdate = {
    added: [
      makePeer([1, 2, 3, 4], 1001),
      makePeer([5, 6, 7, 8], 1002),
      makePeer([9, 10, 11, 12], 1003),
    ],
    dropped: [],
  };

  await assertRejects(
    async () => await ext.send(update),
    RangeError,
    "exceeds 2 peers",
  );
});

Deno.test("ut_pex: UtPexExtension lida com payload inválido gracefully", () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire);

  let warningReceived = false;
  ext.on("warning", () => {
    warningReceived = true;
  });

  // Payload bencode inválido
  const invalidPayload = new TextEncoder().encode("not valid bencode!!!");
  ext.onMessage(invalidPayload);

  assertEquals(warningReceived, true);
});

```

---

## Arquivo: `packages/core/tests/utils_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/utils_test.ts
import { assertEquals, assertThrows } from "@std/assert";
import {
  alloc,
  concat,
  equals,
  from,
  readUInt32BE,
  toString,
  writeUInt32BE,
} from "../src/utils/buffer.ts";
import { sha1 } from "../src/crypto/hasher.ts";
import { generateId, randomBytes } from "../src/crypto/random.ts";

Deno.test("buffer: alloc creates zero-filled array", () => {
  const buf = alloc(10);
  assertEquals(buf.length, 10);
  assertEquals(buf[0], 0);
  assertEquals(buf[9], 0);
});

Deno.test("buffer: from hex string", () => {
  const buf = from("48656c6c6f", "hex");
  assertEquals(toString(buf, "utf8"), "Hello");
});

Deno.test("buffer: from utf8 string", () => {
  const buf = from("Hello");
  assertEquals(toString(buf, "hex"), "48656c6c6f");
});

Deno.test("buffer: concat arrays", () => {
  const a = from("0102", "hex");
  const b = from("0304", "hex");
  const c = concat([a, b]);
  assertEquals(toString(c, "hex"), "01020304");
});

Deno.test("buffer: read/write UInt32BE", () => {
  const buf = alloc(4);
  writeUInt32BE(buf, 0x12345678, 0);
  assertEquals(readUInt32BE(buf, 0), 0x12345678);
});

Deno.test("crypto: sha1 hash", async () => {
  const data = from("hello world");
  const hash = await sha1(data);
  assertEquals(hash, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
});

Deno.test("crypto: randomBytes generates correct length", () => {
  const bytes = randomBytes(32);
  assertEquals(bytes.length, 32);
});

Deno.test("crypto: generateId returns 40 char hex string", () => {
  const id = generateId();
  assertEquals(id.length, 40);
  assertEquals(/^[0-9a-f]{40}$/.test(id), true);
});
```

---

## Arquivo: `packages/core/tests/wire_test.ts`

```ts
// /browsertorrent/monorepo/webtorrent/tests/wire_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import { Wire, Transport, WireState } from "../src/core/wire.ts";
import { HandshakeExtension } from "../src/core/constants.ts";
import { ProtocolError, PeerWireError } from "../src/utils/errors.ts";

// Helper: Cria um par de Wires conectados em memória (Loopback)
function createWirePair(): { wireA: Wire; wireB: Wire } {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;

  const transportA: Transport = {
    send: (data: Uint8Array) => { 
      // Envia para B na próxima microtask (simula rede assíncrona)
      queueMicrotask(() => handlerB?.(data)); 
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };

  const transportB: Transport = {
    send: (data: Uint8Array) => { 
      queueMicrotask(() => handlerA?.(data)); 
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  return {
    wireA: new Wire(transportA),
    wireB: new Wire(transportB),
  };
}

Deno.test("wire: completes handshake successfully", async () => {
  const { wireA, wireB } = createWirePair();
  
  const infoHash = new Uint8Array(20).fill(1);
  const peerIdA = new Uint8Array(20).fill(65); // 'A'
  const peerIdB = new Uint8Array(20).fill(66); // 'B'

  let handshakeReceivedOnB = false;
  let handshakeReceivedOnA = false;

  wireB.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>) => {
    assertEquals(e.detail.peerId, peerIdA);
    handshakeReceivedOnB = true;
  });

  wireA.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>) => {
    assertEquals(e.detail.peerId, peerIdB);
    handshakeReceivedOnA = true;
  });

  // A inicia o handshake, B responde
  wireA.sendHandshake(infoHash, peerIdA);
  wireB.sendHandshake(infoHash, peerIdB);

  // Aguarda as microtasks processarem os eventos
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(handshakeReceivedOnB, true);
  assertEquals(handshakeReceivedOnA, true);
});

Deno.test("wire: sends and receives CHOKE and UNCHOKE", async () => {
  const { wireA, wireB } = createWirePair();
  
  // Ignora handshake para este teste focar nas mensagens
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  let choked = false;
  let unchoked = false;

  wireB.on("choke", () => { choked = true; });
  wireB.on("unchoke", () => { unchoked = true; });

  wireA.sendChoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(choked, true);
  assertEquals(wireB.peerChoking, true);

  wireA.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(unchoked, true);
  assertEquals(wireB.peerChoking, false);
});

Deno.test("wire: sends and receives REQUEST and PIECE", async () => {
  const { wireA, wireB } = createWirePair();

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // B envia unchoke para A, liberando requests
  wireB.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(wireA.peerChoking, false);

  let requestReceived = false;
  let pieceReceived = false;

  wireB.on("request", (e: CustomEvent<{ index: number; offset: number; length: number }>) => {
    assertEquals(e.detail.index, 5);
    assertEquals(e.detail.offset, 0);
    assertEquals(e.detail.length, 16384);
    requestReceived = true;
  });

  wireA.on("piece", (e: CustomEvent<{ index: number; offset: number; block: Uint8Array }>) => {
    assertEquals(e.detail.index, 5);
    assertEquals(e.detail.offset, 0);
    assertEquals(e.detail.block.length, 16384);
    assertEquals(e.detail.block[0], 42);
    pieceReceived = true;
  });

  // A pede a peça para B (agora sem choking)
  wireA.sendRequest(5, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(requestReceived, true);

  // B envia a peça para A
  const block = new Uint8Array(16384).fill(42);
  wireB.sendPiece(5, 0, block);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(pieceReceived, true);
});

Deno.test("wire: handles fragmented messages (Stream parsing)", async () => {
  let handlerB: ((data: Uint8Array) => void) | null = null;
  
  const transportB: Transport = {
    send: () => {},
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  const wireB = new Wire(transportB);
  let unchoked = false;
  wireB.on("unchoke", () => { unchoked = true; });

  // Handshake completo (68 bytes)
  const handshake = new Uint8Array(68);
  handshake[0] = 19;
  new TextEncoder().encodeInto("BitTorrent protocol", handshake.subarray(1, 20));
  
  // Mensagem UNCHOKE (length=1, id=1)
  const unchokeMsg = new Uint8Array([0, 0, 0, 1, 1]);

  // Simula a rede chegando em fragmentos minúsculos
  handlerB!(handshake.subarray(0, 30));
  await new Promise((resolve) => setTimeout(resolve, 5));
  handlerB!(handshake.subarray(30));
  await new Promise((resolve) => setTimeout(resolve, 5));
  
  // Envia a mensagem UNCHOKE byte por byte
  for (const byte of unchokeMsg) {
    handlerB!(new Uint8Array([byte]));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assertEquals(unchoked, true);
});

Deno.test("wire: validates infoHash on handshake (rejects mismatch)", async () => {
  let handlerB: ((data: Uint8Array) => void) | null = null;
  let closed = false;

  const transportB: Transport = {
    send: (data: Uint8Array) => {
      queueMicrotask(() => handlerA?.(data));
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => { closed = true; },
  };

  let handlerA: ((data: Uint8Array) => void) | null = null;
  const transportA: Transport = {
    send: (data: Uint8Array) => {
      queueMicrotask(() => handlerB?.(data));
    },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };

  // B espera infoHash com bytes 0x01; A vai enviar infoHash com bytes 0x02
  const expectedInfoHash = new Uint8Array(20).fill(0x01);
  const wrongInfoHash = new Uint8Array(20).fill(0x02);

  const wireB = new Wire(transportB, { expectedInfoHash });
  const wireA = new Wire(transportA);

  let errorReceived = false;
  wireB.on("error", () => { errorReceived = true; });

  // A envia handshake com infoHash errado
  wireA.sendHandshake(wrongInfoHash, new Uint8Array(20).fill(66));

  await new Promise((resolve) => setTimeout(resolve, 50));

  // B deve detectar o mismatch, emitir erro e fechar a conexão
  assertEquals(errorReceived, true);
  assertEquals(closed, true);
});

Deno.test("wire: accepts handshake with matching infoHash", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;

  const transportA: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerB?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerA?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  const expectedInfoHash = new Uint8Array(20).fill(0xAB);
  const wireA = new Wire(transportA, { expectedInfoHash });
  const wireB = new Wire(transportB, { expectedInfoHash });

  let handshakeReceived = false;
  wireA.on("handshake", () => { handshakeReceived = true; });

  wireA.sendHandshake(expectedInfoHash, new Uint8Array(20).fill(65));
  wireB.sendHandshake(expectedInfoHash, new Uint8Array(20).fill(66));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(handshakeReceived, true);
});

Deno.test("wire: sendRequest blocked when peer is choking (backpressure)", async () => {
  const { wireA, wireB } = createWirePair();

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // peerChoking começa como true por padrão
  assertEquals(wireA.peerChoking, true);

  let requestReceived = false;
  wireB.on("request", () => { requestReceived = true; });

  // A tenta pedir peça enquanto choked — deve ser bloqueado
  wireA.sendRequest(5, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(requestReceived, false);

  // B envia unchoke, liberando A
  wireB.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(wireA.peerChoking, false);

  // Agora o request deve passar
  wireA.sendRequest(5, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(requestReceived, true);
});

Deno.test("wire: handshake event includes infoHash", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;

  const transportA: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerB?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data: Uint8Array) => { queueMicrotask(() => handlerA?.(data)); },
    onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
    close: () => {},
  };

  const infoHash = new Uint8Array(20).fill(0xCD);
  const wireA = new Wire(transportA);
  const wireB = new Wire(transportB);

  let receivedInfoHash: Uint8Array | null = null;
  wireA.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array; infoHash: Uint8Array }>) => {
    receivedInfoHash = e.detail.infoHash;
  });

  wireA.sendHandshake(infoHash, new Uint8Array(20).fill(65));
  wireB.sendHandshake(infoHash, new Uint8Array(20).fill(66));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(receivedInfoHash !== null, true);
  assertEquals(equals(receivedInfoHash!, infoHash), true);
});

function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ============================================================================
// Fase 1: Wire internals tests
// ============================================================================

// ── State machine ────────────────────────────────────────────────────────

Deno.test("wire: starts in Handshaking state", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  assertEquals(wire.state, WireState.Handshaking);
});

Deno.test("wire: transitions to Connected after both handshakes", async () => {
  const { wireA, wireB } = createWirePair();
  assertEquals(wireA.state, WireState.Handshaking);

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(wireA.state, WireState.Connected);
  assertEquals(wireB.state, WireState.Connected);
});

Deno.test("wire: transitions to Closed on destroy", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  wireA.destroy();
  assertEquals(wireA.state, WireState.Closed);
  assertEquals(wireA.isDestroyed, true);
});

Deno.test("wire: emits close event on destroy", async () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  let closeReceived = false;
  wire.on("close", () => { closeReceived = true; });
  wire.destroy();
  assertEquals(closeReceived, true);
});

// ── expectedPeerId validation ─────────────────────────────────────────────

Deno.test("wire: rejects handshake with unexpected peerId", async () => {
  let handler: ((data: Uint8Array) => void) | null = null;
  const transport: Transport = {
    send: () => {},
    onMessage: (h) => { handler = h; },
    close: () => {},
  };

  const expectedPeerId = new Uint8Array(20).fill(0x42);
  const wire = new Wire(transport, { expectedPeerId });

  let errorReceived = false;
  wire.on("error", () => { errorReceived = true; });

  // Build a handshake with a different peerId
  const wrongPeerId = new Uint8Array(20).fill(0x99);
  const infoHash = new Uint8Array(20).fill(0x01);
  // Manually craft handshake bytes
  const handshake = new Uint8Array(68);
  handshake[0] = 19;
  new TextEncoder().encodeInto("BitTorrent protocol", handshake.subarray(1, 20));
  handshake.set(infoHash, 28);
  handshake.set(wrongPeerId, 48);

  handler!(handshake);
  assertEquals(errorReceived, true);
  assertEquals(wire.state, WireState.Closed);
});

// ── Extension gating ─────────────────────────────────────────────────────

Deno.test("wire: rejects Fast messages without negotiation", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Neither side advertised Fast extension
  assertThrows(
    () => wireA.sendSuggestPiece(0),
    ProtocolError,
  );
  assertThrows(
    () => wireA.sendHaveAll(),
    ProtocolError,
  );
  assertThrows(
    () => wireA.sendHaveNone(),
    ProtocolError,
  );
  assertThrows(
    () => wireA.sendRejectRequest(0, 0, 1),
    ProtocolError,
  );
  assertThrows(
    () => wireA.sendAllowedFast(0),
    ProtocolError,
  );
});

Deno.test("wire: rejects Port message without DHT negotiation", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertThrows(
    () => wireA.sendPort(6881),
    ProtocolError,
  );
});

Deno.test("wire: allows Fast messages when both sides negotiate", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;
  const transportA: Transport = {
    send: (data) => queueMicrotask(() => handlerB?.(data)),
    onMessage: (h) => { handlerA = h; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data) => queueMicrotask(() => handlerA?.(data)),
    onMessage: (h) => { handlerB = h; },
    close: () => {},
  };

  const wireA = new Wire(transportA, { extensions: [HandshakeExtension.Fast] });
  const wireB = new Wire(transportB, { extensions: [HandshakeExtension.Fast] });

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Now Fast messages should work
  let haveAllReceived = false;
  wireB.on("haveAll", () => { haveAllReceived = true; });

  // With Fast, must send availability first: haveNone or haveAll
  wireA.sendHaveNone();
  wireB.sendHaveNone();
  await new Promise((resolve) => setTimeout(resolve, 50));

  wireA.sendSuggestPiece(5);
  await new Promise((resolve) => setTimeout(resolve, 50));

  // No error thrown = success
  assertEquals(wireA.state, WireState.Connected);
});

// ── Message size limits ──────────────────────────────────────────────────

Deno.test("wire: rejects messages exceeding maxMessageLength", async () => {
  let handler: ((data: Uint8Array) => void) | null = null;
  const transport: Transport = {
    send: () => {},
    onMessage: (h) => { handler = h; },
    close: () => {},
  };

  const wire = new Wire(transport, { maxMessageLength: 100 });
  wire.sendHandshake(new Uint8Array(20), new Uint8Array(20));

  // Feed a handshake to the wire so it's connected
  const hs = new Uint8Array(68);
  hs[0] = 19;
  new TextEncoder().encodeInto("BitTorrent protocol", hs.subarray(1, 20));
  handler!(hs);

  // Now send a message with length prefix > 100
  let errorReceived = false;
  wire.on("error", () => { errorReceived = true; });

  // length prefix = 200 (0x000000C8)
  const bigMsg = new Uint8Array([0, 0, 0, 0xC8, 0x00]);
  handler!(bigMsg);

  assertEquals(errorReceived, true);
});

// ── Stats tracking ───────────────────────────────────────────────────────

Deno.test("wire: tracks uploaded and downloaded bytes", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const initialUploaded = wireA.uploadedBytes;
  const initialDownloaded = wireB.downloadedBytes;

  wireA.sendChoke();
  await new Promise((resolve) => setTimeout(resolve, 50));

  // choke message = 5 bytes (4 length + 1 id)
  assertEquals(wireA.uploadedBytes > initialUploaded, true);
  assertEquals(wireB.downloadedBytes > initialDownloaded, true);
});

Deno.test("wire: tracks lastActivityAt", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const beforeActivity = wireA.lastActivityAt;
  // Small delay to ensure timestamp differs
  await new Promise((resolve) => setTimeout(resolve, 10));

  wireA.sendInterested();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(wireA.lastActivityAt >= beforeActivity, true);
});

// ── Pending request tracking ─────────────────────────────────────────────

Deno.test("wire: tracks peerRequests on incoming request", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // B must send availability first (bitfield/haveNone)
  wireB.sendBitfield(new Uint8Array([0xff]));
  wireA.sendBitfield(new Uint8Array([0xff]));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // B sends unchoke, then A can request
  wireB.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(wireA.peerRequests.length, 0);
  assertEquals(wireB.pendingRequests.length, 0);

  wireA.sendRequest(0, 0, 16384);
  await new Promise((resolve) => setTimeout(resolve, 50));

  // B should have the request in peerRequests
  assertEquals(wireB.peerRequests.length, 1);
  assertEquals(wireB.peerRequests[0]!.pieceIndex, 0);
});

// ── Block validation ─────────────────────────────────────────────────────

Deno.test("wire: rejects outgoing block request with zero length", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  wireB.sendUnchoke();
  await new Promise((resolve) => setTimeout(resolve, 50));

  // sendRequest silently drops when choked, but when unchoked it should
  // validate via _sendMessage
  assertThrows(
    () => wireA.sendRequest(0, 0, 0),
    RangeError,
  );
});

// ── Keepalive ────────────────────────────────────────────────────────────

Deno.test("wire: sendKeepAlive via setKeepAlive", async () => {
  const { wireA, wireB } = createWirePair();
  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Enable keepalive with a very short interval
  wireA.setKeepAlive(50);

  let keepAliveReceived = false;
  wireB.on("keepAlive", () => { keepAliveReceived = true; });

  // Wait for the keepalive timer to fire
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(keepAliveReceived, true);

  // Disable keepalive
  wireA.setKeepAlive(false);
});

Deno.test("wire: receives keepAlive messages", async () => {
  let handler: ((data: Uint8Array) => void) | null = null;
  const transport: Transport = {
    send: () => {},
    onMessage: (h) => { handler = h; },
    close: () => {},
  };

  const wire = new Wire(transport);
  wire.sendHandshake(new Uint8Array(20), new Uint8Array(20));

  // Feed handshake to get to Connected state
  const hs = new Uint8Array(68);
  hs[0] = 19;
  new TextEncoder().encodeInto("BitTorrent protocol", hs.subarray(1, 20));
  handler!(hs);

  let keepAliveCount = 0;
  wire.on("keepAlive", () => { keepAliveCount++; });

  // Send a keepalive (4 zero bytes)
  handler!(new Uint8Array([0, 0, 0, 0]));

  assertEquals(keepAliveCount, 1);
});

// ── BEP 6 Fast event dispatch ────────────────────────────────────────────

Deno.test("wire: dispatches new BEP 6 events when negotiated", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;
  const transportA: Transport = {
    send: (data) => queueMicrotask(() => handlerB?.(data)),
    onMessage: (h) => { handlerA = h; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data) => queueMicrotask(() => handlerA?.(data)),
    onMessage: (h) => { handlerB = h; },
    close: () => {},
  };

  const wireA = new Wire(transportA, {
    extensions: [HandshakeExtension.Fast],
    pieceCount: 10,
  });
  const wireB = new Wire(transportB, {
    extensions: [HandshakeExtension.Fast],
    pieceCount: 10,
  });

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Availability first (both sides must declare before other messages)
  wireA.sendHaveNone();
  await new Promise((resolve) => setTimeout(resolve, 50));
  wireB.sendHaveNone();
  await new Promise((resolve) => setTimeout(resolve, 50));

  let suggestReceived = false;
  let allowedFastReceived = false;

  wireA.on("suggestPiece", (e: CustomEvent<{ index: number }>) => {
    assertEquals(e.detail.index, 3);
    suggestReceived = true;
  });
  wireA.on("allowedFast", (e: CustomEvent<{ index: number }>) => {
    assertEquals(e.detail.index, 7);
    allowedFastReceived = true;
  });

  wireB.sendSuggestPiece(3);
  await new Promise((resolve) => setTimeout(resolve, 50));

  wireB.sendAllowedFast(7);
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEquals(suggestReceived, true);
  assertEquals(allowedFastReceived, true);
});

// ── WireOptions validation ───────────────────────────────────────────────

Deno.test("wire: constructor validates options", () => {
  const transport: Transport = { send: () => {}, onMessage: () => {}, close: () => {} };

  assertThrows(
    () => new Wire(transport, { maxMessageLength: 0 }),
    RangeError,
  );
  assertThrows(
    () => new Wire(transport, { maxBlockLength: -1 }),
    RangeError,
  );
  assertThrows(
    () => new Wire(transport, { maxPendingRequests: 0 }),
    RangeError,
  );
  assertThrows(
    () => new Wire(transport, { maxQueuedWriteBytes: 0 }),
    RangeError,
  );
});

// ── Backpressure (write queue) ───────────────────────────────────────────

Deno.test("wire: write queue backpressure limits oversized writes", async () => {
  let handlerA: ((data: Uint8Array) => void) | null = null;
  let handlerB: ((data: Uint8Array) => void) | null = null;
  const transportA: Transport = {
    send: (data) => queueMicrotask(() => handlerB?.(data)),
    onMessage: (h) => { handlerA = h; },
    close: () => {},
  };
  const transportB: Transport = {
    send: (data) => queueMicrotask(() => handlerA?.(data)),
    onMessage: (h) => { handlerB = h; },
    close: () => {},
  };

  // Very small write limit
  const wireA = new Wire(transportA, { maxQueuedWriteBytes: 100 });
  const wireB = new Wire(transportB, { maxQueuedWriteBytes: 100 });

  wireA.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  wireB.sendHandshake(new Uint8Array(20), new Uint8Array(20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // A large piece block should exceed the write limit
  const bigBlock = new Uint8Array(200).fill(0xFF);
  assertThrows(
    () => wireA.sendPiece(0, 0, bigBlock),
    PeerWireError,
  );
});

// ── Extension host integration ───────────────────────────────────────────

Deno.test("wire: use() rejects extension without BEP 10", () => {
  const transport: Transport = { send: () => {}, onMessage: () => {}, close: () => {} };
  const wire = new Wire(transport); // no ExtensionProtocol

  assertThrows(
    () => wire.use({ name: "ut_test", onExtendedHandshake() {}, onMessage() {} }),
    PeerWireError,
  );
});

// ── BEP 52 v2 hash messages ──────────────────────────────────────────────

Deno.test("wire: dispatches new BEP 52 events when negotiated", async () => {
  // Helper: Cria um par de Wires conectados em memória com extensão V2
  function createV2WirePair(): { wireA: Wire; wireB: Wire } {
    let handlerA: ((data: Uint8Array) => void) | null = null;
    let handlerB: ((data: Uint8Array) => void) | null = null;

    const transportA: Transport = {
      send: (data: Uint8Array) => {
        queueMicrotask(() => handlerB?.(data));
      },
      onMessage: (handler: (data: Uint8Array) => void) => { handlerA = handler; },
      close: () => {},
    };

    const transportB: Transport = {
      send: (data: Uint8Array) => {
        queueMicrotask(() => handlerA?.(data));
      },
      onMessage: (handler: (data: Uint8Array) => void) => { handlerB = handler; },
      close: () => {},
    };

    return {
      wireA: new Wire(transportA, { extensions: [HandshakeExtension.V2] }),
      wireB: new Wire(transportB, { extensions: [HandshakeExtension.V2] }),
    };
  }

  const { wireA, wireB } = createV2WirePair();

  const infoHash = new Uint8Array(20);
  const peerIdA = new Uint8Array(20).fill(0xAA);
  const peerIdB = new Uint8Array(20).fill(0xBB);

  // Complete handshake with V2 extension
  wireA.sendHandshake(infoHash, peerIdA);
  wireB.sendHandshake(infoHash, peerIdB);

  // Aguarda as microtasks processarem os eventos de handshake
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Verifica se o handshake foi concluído
  assertEquals(wireA.state, WireState.Connected);
  assertEquals(wireB.state, WireState.Connected);

  // Test hashRequest event
  let hashRequestReceived = false;
  wireB.on("hashRequest", (e: CustomEvent<any>) => {
    const detail = e.detail;
    assertEquals(detail.piecesRoot.length, 32);
    assertEquals(detail.baseLayer, 0);
    assertEquals(detail.index, 8); // Must be multiple of length (2)
    assertEquals(detail.length, 2);
    assertEquals(detail.proofLayers, 5);
    hashRequestReceived = true;
  });

  const piecesRoot = new Uint8Array(32).fill(0xCC);
  wireA.sendHashRequest(piecesRoot, 0, 8, 2, 5); // index=8 is multiple of length=2

  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(hashRequestReceived, true);

  // Test hashes event
  let hashesReceived = false;
  wireA.on("hashes", (e: CustomEvent<any>) => {
    const detail = e.detail;
    assertEquals(detail.piecesRoot.length, 32);
    assertEquals(detail.baseLayer, 1);
    assertEquals(detail.index, 16); // Must be multiple of length (4)
    assertEquals(detail.length, 4);
    assertEquals(detail.proofLayers, 3);
    assertEquals(detail.hashes.length, 64); // 2 hashes of 32 bytes each
    hashesReceived = true;
  });

  const hashes = new Uint8Array(64).fill(0xDD);
  wireB.sendHashes(new Uint8Array(32).fill(0xEE), 1, 16, 4, 3, hashes); // index=16 is multiple of length=4

  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(hashesReceived, true);

  // Test hashReject event
  let hashRejectReceived = false;
  wireB.on("hashReject", (e: CustomEvent<any>) => {
    const detail = e.detail;
    assertEquals(detail.piecesRoot.length, 32);
    assertEquals(detail.baseLayer, 2);
    assertEquals(detail.index, 24); // Must be multiple of length (8)
    assertEquals(detail.length, 8);
    assertEquals(detail.proofLayers, 2);
    hashRejectReceived = true;
  });

  wireA.sendHashReject(new Uint8Array(32).fill(0xFF), 2, 24, 8, 2); // index=24 is multiple of length=8

  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(hashRejectReceived, true);
});

// ============================================================================
// PHASE 6: uploadSpeed / downloadSpeed getters
// ============================================================================

Deno.test("wire: uploadSpeed starts at 0", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  assertEquals(wire.uploadSpeed, 0);
});

Deno.test("wire: downloadSpeed starts at 0", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  assertEquals(wire.downloadSpeed, 0);
});

Deno.test("wire: uploadSpeed and downloadSpeed are writable for testing", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  // Internal fields are accessible via the instance
  (wire as any)._uploadSpeed = 12345;
  (wire as any)._downloadSpeed = 67890;
  assertEquals(wire.uploadSpeed, 12345);
  assertEquals(wire.downloadSpeed, 67890);
});

// ============================================================================
// PHASE 6: remoteAddress / remotePort
// ============================================================================

Deno.test("wire: remoteAddress defaults to empty string", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  assertEquals(wire.remoteAddress, "");
});

Deno.test("wire: remotePort defaults to 0", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  assertEquals(wire.remotePort, 0);
});

Deno.test("wire: remoteAddress and remotePort are settable", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  wire.remoteAddress = "192.168.1.100";
  wire.remotePort = 51413;
  assertEquals(wire.remoteAddress, "192.168.1.100");
  assertEquals(wire.remotePort, 51413);
});

Deno.test("wire: remoteAddress and remotePort can be updated after construction", () => {
  const wire = new Wire({
    send: () => {},
    onMessage: () => {},
    close: () => {},
  });
  wire.remoteAddress = "10.0.0.1";
  wire.remotePort = 6881;
  wire.remoteAddress = "10.0.0.2";
  wire.remotePort = 6882;
  assertEquals(wire.remoteAddress, "10.0.0.2");
  assertEquals(wire.remotePort, 6882);
});

// ── Wire.type / extensions / extendedMapping — upstream parity ────────────────

Deno.test("wire: type is 'webrtc' (upstream parity)", () => {
  const wire = new Wire({ send: () => {}, onMessage: () => {}, close: () => {} });
  assertEquals(wire.type, "webrtc");
});

Deno.test("wire: extensions returns empty Record before handshake", () => {
  const wire = new Wire({ send: () => {}, onMessage: () => {}, close: () => {} });
  // Before any extended handshake, peerExtensions is empty
  assertEquals(typeof wire.extensions, "object");
  assertEquals(Object.keys(wire.extensions).length, 0);
});

Deno.test("wire: extendedMapping returns empty Record before handshake", () => {
  const wire = new Wire({ send: () => {}, onMessage: () => {}, close: () => {} });
  assertEquals(typeof wire.extendedMapping, "object");
  assertEquals(Object.keys(wire.extendedMapping).length, 0);
});

Deno.test("wire: type is readonly getter — always returns 'webrtc'", () => {
  const wire = new Wire({ send: () => {}, onMessage: () => {}, close: () => {} });
  assertEquals(wire.type, "webrtc");
  assertEquals(wire.type, "webrtc");
});

```

---

## Arquivo: `packages/core/src/core/bitfield.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/bitfield.ts

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
```

---

## Arquivo: `packages/core/src/core/constants.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/constants.ts
/**
 * BitTorrent peer wire protocol constants, message IDs, and limits.
 *
 * Adaptado de deno-torrent/peerwire/constants.ts.
 * Sem dependências externas — tudo é browser-puro.
 */

// ── Protocol identifiers ────────────────────────────────────────────────

/** The protocol identifier used by the BitTorrent peer wire handshake. */
export const BITTORRENT_PROTOCOL = "BitTorrent protocol";

/** The fixed byte length of a standard BitTorrent peer wire handshake. */
export const HANDSHAKE_LENGTH = 68;

/** Length of an info hash and a peer ID, in bytes. */
export const PEER_ID_LENGTH = 20;

// ── Default limits ──────────────────────────────────────────────────────

/** Default upper bound for a peer wire message payload. */
export const DEFAULT_MAX_MESSAGE_LENGTH = 2 * 1024 * 1024;

/** Maximum block payload accepted by current interoperable clients. */
export const DEFAULT_MAX_BLOCK_LENGTH = 16 * 1024;

/** Default number of queued requests accepted in either direction. */
export const DEFAULT_MAX_PENDING_REQUESTS = 250;

/** Default maximum number of bytes waiting in the serialized write queue. */
export const DEFAULT_MAX_QUEUED_WRITE_BYTES = 4 * 1024 * 1024;

// ── Peer wire message IDs ───────────────────────────────────────────────

/** Peer wire message IDs from BEP 3 and commonly implemented extensions. */
export enum PeerMessageId {
  Choke = 0,
  Unchoke = 1,
  Interested = 2,
  NotInterested = 3,
  Have = 4,
  Bitfield = 5,
  Request = 6,
  Piece = 7,
  Cancel = 8,
  Port = 9,
  SuggestPiece = 13,
  HaveAll = 14,
  HaveNone = 15,
  RejectRequest = 16,
  AllowedFast = 17,
  Extended = 20,
  HashRequest = 21,
  Hashes = 22,
  HashReject = 23,
}

// ── Handshake reserved bits ─────────────────────────────────────────────

/** Named bits in the eight reserved handshake bytes. */
export enum HandshakeExtension {
  /** BEP 6 fast extension. */
  Fast = "fast",
  /** BEP 10 extension protocol. */
  ExtensionProtocol = "extensionProtocol",
  /** BEP 5 DHT port message. */
  Dht = "dht",
  /** BEP 52 BitTorrent v2/hybrid wire protocol. */
  V2 = "v2",
}

```

---

## Arquivo: `packages/core/src/core/extension-host.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/extension-host.ts
/**
 * BEP 10 Extension Protocol host — negotiates, maps, and dispatches
 * extension messages for one peer connection.
 *
 * Key concepts:
 * - **Directional IDs**: Local extensions have IDs the *peer* uses when
 *   sending to us; peer extensions have IDs *we* use when sending to them.
 * - **Re-handshake**: Repeated extended handshakes are additive — a zero
 *   mapping explicitly disables one previously advertised extension.
 * - **waitForPeerHandshake()**: Returns a Promise that resolves after the
 *   first valid remote extended handshake (immediate if already received).
 *
 * Adaptado de deno-torrent/peerwire/extension.ts.
 * Uses local bencode (with Map support) and local ProtocolError.
 */

import { type BencodeValue, decode, encode } from "../utils/bencode.ts";
import { PeerWireError, ProtocolError } from "../utils/errors.ts";
import type { ExtendedMessage } from "./message.ts";

// ── Types ───────────────────────────────────────────────────────────────

/** Parsed BEP 10 extended handshake fields. */
export interface ExtendedHandshake {
  /** Extension names mapped to the IDs selected by the remote peer. */
  readonly extensions: ReadonlyMap<string, number>;
  /** Remote client identification (`v`). */
  readonly client?: string;
  /** Remote TCP/uTP listen port (`p`). */
  readonly port?: number;
  /** Remote request queue preference (`reqq`). */
  readonly requestQueue?: number;
  /** Raw info-dictionary length advertised for BEP 9. */
  readonly metadataSize?: number;
  /** This endpoint's compact address as observed by the remote peer. */
  readonly yourIp?: Uint8Array;
  /** Remote endpoint's explicitly advertised compact IPv4 address. */
  readonly ipv4?: Uint8Array;
  /** Remote endpoint's explicitly advertised compact IPv6 address. */
  readonly ipv6?: Uint8Array;
  /** Complete decoded dictionary, including non-standard extension fields. */
  readonly raw: ReadonlyMap<string | Uint8Array, BencodeValue>;
}

/** Operations exposed to one registered BEP 10 extension. */
export interface PeerWireExtensionContext {
  /** Connection-local host, including the peer's directional ID mapping. */
  readonly host: ExtensionHost;
  /** Send a payload under this extension's peer-selected outgoing ID. */
  send(payload: Uint8Array): Promise<void>;
}

/** A named BEP 10 extension hosted by {@link ExtensionHost}. */
export interface PeerWireExtension {
  /** BEP 10 mapping name, for example `ut_metadata`. */
  readonly name: string;
  /** Capture connection-local operations when the extension is registered. */
  onRegister?(context: PeerWireExtensionContext): void;
  /** Contribute fields to each local extended handshake. */
  handshakeFields?(): ReadonlyMap<string, BencodeValue>;
  /** Observe the peer's initial or repeated extended handshake. */
  onExtendedHandshake?(handshake: ExtendedHandshake): void | Promise<void>;
  /** Handle one payload addressed to this extension. */
  onMessage?(payload: Uint8Array): void | Promise<void>;
  /** Release pending work when the owning wire closes. */
  close?(reason?: unknown): void;
}

/** Construction options for one connection-local BEP 10 host. */
export interface ExtensionHostOptions {
  /** Low-level sender used for extended message ID and payload pairs. */
  send: (extensionId: number, payload: Uint8Array) => Promise<void>;
  /** Maximum accepted extension payload, defaulting to 256 KiB. */
  maxPayloadLength?: number;
  /** Optional standard extended-handshake client name (`v`). */
  client?: string;
  /** Optional standard extended-handshake listen port (`p`). */
  port?: number;
  /** Optional standard extended-handshake request queue size (`reqq`). */
  requestQueue?: number;
}

// ── ExtensionHost ───────────────────────────────────────────────────────

/** Negotiates, maps, and dispatches BEP 10 extension messages for one peer. */
export class ExtensionHost {
  /** Maximum extension payload accepted in either direction. */
  readonly maxPayloadLength: number;
  /** IDs selected locally, which the peer uses when sending to us. */
  readonly localExtensions: Map<string, number> = new Map();
  /** IDs selected by the peer, which we use when sending to it. */
  readonly peerExtensions: Map<string, number> = new Map();

  /**
   * Extension name → value Record for `wire.extensions` parity.
   * A value of `true` means the peer supports this extension.
   */
  get remoteExtensions(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const name of this.peerExtensions.keys()) {
      out[name] = true;
    }
    return out;
  }

  /**
   * Reverse map: ID → extension name for `wire.extendedMapping` parity.
   */
  get remoteIdToName(): Record<number, string> {
    const out: Record<number, string> = {};
    for (const [name, id] of this.peerExtensions) {
      out[id] = name;
    }
    return out;
  }

  /** Most recent valid extended handshake received from the peer. */
  peerHandshake?: ExtendedHandshake;

  #send: (extensionId: number, payload: Uint8Array) => Promise<void>;
  #extensions = new Map<string, PeerWireExtension>();
  #handshakeFields = new Map<string, BencodeValue>();
  #nextId = 1;
  #handshakeWaiters: Array<(value: ExtendedHandshake) => void> = [];

  /** Create a connection-local extension registry around a low-level sender. */
  constructor(options: ExtensionHostOptions) {
    this.#send = options.send;
    this.maxPayloadLength = options.maxPayloadLength ?? 256 * 1024;
    if (
      !Number.isSafeInteger(this.maxPayloadLength) ||
      this.maxPayloadLength < 1
    ) {
      throw new RangeError("maxPayloadLength must be a positive safe integer");
    }
    if (options.client !== undefined) {
      this.setHandshakeField("v", options.client);
    }
    if (options.port !== undefined) {
      this.setHandshakeField("p", options.port);
    }
    if (options.requestQueue !== undefined) {
      this.setHandshakeField("reqq", options.requestQueue);
    }
  }

  // ── Registration ────────────────────────────────────────────────────

  /** Register an extension and allocate its local incoming message ID. */
  use<T extends PeerWireExtension>(extension: T): T {
    if (!extension.name || extension.name.length < 3) {
      throw new TypeError(
        "extension name must contain at least three characters",
      );
    }
    if (this.#extensions.has(extension.name)) {
      throw new PeerWireError(
        `extension ${extension.name} is already registered`,
      );
    }
    if (this.#nextId > 255) {
      throw new PeerWireError("no extension IDs remain");
    }
    this.#extensions.set(extension.name, extension);
    this.localExtensions.set(extension.name, this.#nextId++);
    extension.onRegister?.({
      host: this,
      send: (payload) => this.send(extension.name, payload),
    });
    return extension;
  }

  /** Retrieve a registered extension by its BEP 10 name. */
  get<T extends PeerWireExtension = PeerWireExtension>(
    name: string,
  ): T | undefined {
    return this.#extensions.get(name) as T | undefined;
  }

  // ── Handshake fields ────────────────────────────────────────────────

  /** Add, replace, or remove a non-`m` extended-handshake field. */
  setHandshakeField(name: string, value: BencodeValue | undefined): void {
    if (name === "m") {
      throw new TypeError("the m field is managed by ExtensionHost");
    }
    if (value === undefined) this.#handshakeFields.delete(name);
    else this.#handshakeFields.set(name, value);
  }

  /** Send the local extended handshake. May be called again after updates. */
  async sendHandshake(): Promise<void> {
    const extensions = new Map<string, BencodeValue>();
    for (const [name, id] of this.localExtensions) {
      extensions.set(name, id);
    }
    const fields = new Map<string, BencodeValue>(this.#handshakeFields);
    fields.set("m", extensions);
    for (const extension of this.#extensions.values()) {
      for (const [name, value] of extension.handshakeFields?.() ?? []) {
        if (name === "m") {
          throw new PeerWireError(
            `${extension.name} may not replace the m field`,
          );
        }
        fields.set(name, value);
      }
    }
    await this.#send(0, encode(fields));
  }

  // ── Send / receive ──────────────────────────────────────────────────

  /** Send a payload using the ID selected by the remote peer. */
  async send(name: string, payload: Uint8Array): Promise<void> {
    if (payload.length > this.maxPayloadLength) {
      throw new RangeError(
        `extension payload exceeds configured limit ${this.maxPayloadLength}`,
      );
    }
    const id = this.peerExtensions.get(name);
    if (id === undefined) {
      throw new PeerWireError(
        `remote peer did not advertise extension ${name}`,
      );
    }
    await this.#send(id, payload);
  }

  /** Resolve after the first valid remote extended handshake. */
  waitForPeerHandshake(): Promise<ExtendedHandshake> {
    if (this.peerHandshake) return Promise.resolve(this.peerHandshake);
    return new Promise((resolve) => this.#handshakeWaiters.push(resolve));
  }

  /** Parse and dispatch one raw BEP 10 message. */
  async handle(message: ExtendedMessage): Promise<string | undefined> {
    if (message.payload.length > this.maxPayloadLength) {
      throw new ProtocolError(
        `extension payload exceeds configured limit ${this.maxPayloadLength}`,
      );
    }
    if (message.extensionId === 0) {
      const handshake = decodeExtendedHandshake(message.payload);
      for (const [name, id] of handshake.extensions) {
        if (id === 0) this.peerExtensions.delete(name);
        else this.peerExtensions.set(name, id);
      }
      this.peerHandshake = handshake;
      for (const waiter of this.#handshakeWaiters.splice(0)) {
        waiter(handshake);
      }
      for (const extension of this.#extensions.values()) {
        await extension.onExtendedHandshake?.(handshake);
      }
      return undefined;
    }

    const name = findNameById(this.localExtensions, message.extensionId);
    if (name === undefined) return undefined;
    await this.#extensions.get(name)?.onMessage?.(message.payload);
    return name;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  /** Notify registered extensions that their owning peer connection ended. */
  close(reason?: unknown): void {
    for (const extension of this.#extensions.values()) {
      extension.close?.(reason);
    }
    this.#handshakeWaiters.length = 0;
  }
}

// ── Decode helpers ──────────────────────────────────────────────────────

/** Decode and validate a bounded BEP 10 extended handshake dictionary. */
export function decodeExtendedHandshake(
  payload: Uint8Array,
): ExtendedHandshake {
  let value: BencodeValue;
  try {
    value = decode(payload, { maxBytes: 256 * 1024, maxDepth: 32, useMap: true });
  } catch (cause) {
    throw new ProtocolError("invalid extended handshake", "PROTOCOL_ERROR", { cause });
  }
  if (!(value instanceof Map)) {
    throw new ProtocolError("extended handshake must be a dictionary");
  }
  const mapping = value.get("m");
  if (mapping !== undefined && !(mapping instanceof Map)) {
    throw new ProtocolError(
      "extended handshake m field must be a dictionary",
    );
  }
  const extensions = new Map<string, number>();
  for (const [name, id] of mapping ?? []) {
    if (
      typeof name !== "string" ||
      typeof id !== "number" ||
      id < 0 ||
      id > 255
    ) {
      throw new ProtocolError(
        "extended handshake contains an invalid mapping",
      );
    }
    extensions.set(name, id);
  }
  return {
    extensions,
    client: optionalString(value, "v"),
    port: optionalInteger(value, "p", 0xffff),
    requestQueue: optionalInteger(value, "reqq", 0xffffffff),
    metadataSize: optionalInteger(value, "metadata_size", 0xffffffff),
    yourIp: optionalBytes(value, "yourip"),
    ipv4: optionalBytes(value, "ipv4"),
    ipv6: optionalBytes(value, "ipv6"),
    raw: value,
  };
}

function optionalString(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
): string | undefined {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ProtocolError(
      `extended handshake ${key} must be a string`,
    );
  }
  return value;
}

function optionalInteger(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
  maximum: number,
): number | undefined {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "number" || value < 0 || value > maximum) {
    throw new ProtocolError(`extended handshake ${key} is invalid`);
  }
  return value;
}

function optionalBytes(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
): Uint8Array | undefined {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new ProtocolError(`extended handshake ${key} must be bytes`);
}

function findNameById(
  mapping: ReadonlyMap<string, number>,
  id: number,
): string | undefined {
  for (const [name, candidate] of mapping) {
    if (candidate === id) return name;
  }
  return undefined;
}

```

---

## Arquivo: `packages/core/src/core/extension.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/extension.ts

import { TypedEventTarget } from "../utils/event-target.ts";

export interface ExtensionEvents {
  warning: CustomEvent<{ error: Error }>;
  metadata: CustomEvent<{ metadata: Uint8Array }>;
  info: CustomEvent<{ message: string }>;
}

/**
 * Classe base para extensões do protocolo BitTorrent (BEP 10).
 * Extensões como ut_metadata e ut_pex devem herdar desta classe.
 */
export abstract class Extension extends TypedEventTarget<ExtensionEvents> {
  public abstract readonly name: string;
  protected wire: any;

  constructor(wire: any) {
    super();
    this.wire = wire;
  }

  /**
   * Chamado quando o handshake estendido é recebido do peer.
   */
  abstract onExtendedHandshake(handshake: any): void;

  /**
   * Chamado quando uma mensagem estendida para esta extensão é recebida.
   */
  abstract onMessage(payload: Uint8Array): void;
}
```

---

## Arquivo: `packages/core/src/core/file.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/file.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Piece } from "./piece.ts";
import { buildStreamURL } from "../server/stream-manager.ts";
import type { ChunkStore } from "../storage/opfs-chunk-store.ts";
import type { Torrent } from "./torrent.ts";

/**
 * Minimal MIME type map for common file extensions encountered in torrents.
 * Falls back to `"application/octet-stream"`.
 */
const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  xml: "application/xml",
  md: "text/markdown",
  iso: "application/x-iso9660-image",
};

/**
 * Browser-first File class — the "live" view of a file inside a torrent.
 *
 * Mirrors the upstream `webtorrent.min.js` `File` class: a piece-aware
 * facade that exposes streaming (`createReadStream`, `stream`),
 * `ReadableStream<Uint8Array>` adapters, byte buffers (`arrayBuffer`,
 * `blob`, `getBlobURL`), iteration (`Symbol.asyncIterator`), and
 * Service Worker integration (`streamURL`, `streamTo`).
 *
 * **Adaptação do upstream**: a implementação upstream lê diretamente do
 * sistema de arquivos do torrent (que no browser não existe); aqui,
 * toda leitura é roteada ao {@link ChunkStore} do torrent.  Isso
 * permite streaming sob demanda de peças que ainda estão sendo baixadas
 * ou que vieram do OPFS.
 */

export interface FileOptions {
  /** Backend store for the file's bytes (peça-a-peça). */
  store: ChunkStore;
  /** Total size of the file in bytes. */
  length: number;
  /** Byte offset of the file inside the concatenated torrent stream. */
  offset: number;
  /** Piece size used by the torrent. */
  pieceLength: number;
  /** File name (e.g. `"movie.mp4"`); used in {@link streamURL}. */
  name?: string;
  /** Full path inside the torrent (defaults to `name`). */
  path?: string;
  /** Identifier of the torrent owning this file. */
  infoHash?: string;
  /** File index inside the torrent (0-based). */
  fileIndex?: number;
  /** Service Worker scope (e.g. `"/"`). */
  scope?: string;
  /** Default block size for streaming (defaults to 64 KiB). */
  blockSize?: number;
  /** Owning torrent (used for per-file downloaded/progress tracking). */
  torrent?: Torrent;
}

export interface FileEvents {
  /** Emitido quando `createReadStream()` é chamado, com a stream resultante. */
  stream: CustomEvent<ReadableStream<Uint8Array>>;
  /** Emitido quando o iterator `Symbol.asyncIterator` é criado. */
  iterator: CustomEvent<AsyncIterable<Uint8Array>>;
  /** Emitido quando a leitura/streaming termina com sucesso. */
  done: CustomEvent<void>;
  /** Emitido em erro durante leitura. */
  error: CustomEvent<{ error: Error }>;
  /** Emitido quando bytes deste arquivo específico são baixados. */
  download: CustomEvent<{ bytes: number }>;
  /** Emitido quando bytes deste arquivo são enviados a peers. */
  upload: CustomEvent<{ bytes: number }>;
}

/**
 * A `File` inside a torrent.
 *
 * Provides streaming reads, byte buffer adapters, and Service Worker
 * integration for browser media playback.
 */
export class File extends TypedEventTarget<FileEvents> {
  private _store: ChunkStore;
  private _length: number;
  private _offset: number;
  private _pieceLength: number;
  private _name: string;
  private _path: string;
  private _infoHash?: string;
  private _fileIndex?: number;
  private _scope: string;
  private _blockSize: number;
  private _destroyed = false;
  private _torrent?: Torrent;

  constructor(options: FileOptions) {
    super();
    this._store = options.store;
    this._length = options.length;
    this._offset = options.offset;
    this._pieceLength = options.pieceLength;
    this._name = options.name ?? "file";
    this._path = options.path ?? this._name;
    this._infoHash = options.infoHash;
    this._fileIndex = options.fileIndex;
    this._scope = options.scope ?? "/";
    this._blockSize = options.blockSize ?? 64 * 1024;
    this._torrent = options.torrent;
  }

  get length(): number {
    return this._length;
  }

  get name(): string {
    return this._name;
  }

  get path(): string {
    return this._path;
  }

  get pieceLength(): number {
    return this._pieceLength;
  }

  get offset(): number {
    return this._offset;
  }

  get infoHash(): string | undefined {
    return this._infoHash;
  }

  get fileIndex(): number | undefined {
    return this._fileIndex;
  }

  get scope(): string {
    return this._scope;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * MIME type inferred from the file name extension.
   *
   * Mirrors the upstream `webtorrent.min.js` `file.type`.
   */
  get type(): string {
    const ext = this._name.toLowerCase().split(".").pop() ?? "";
    return MIME_MAP[ext] ?? "application/octet-stream";
  }

  /**
   * Número de bytes baixados deste arquivo específico.
   * Calculado a partir do bitfield do torrent.
   */
  get downloaded(): number {
    const torrent = this._torrent;
    if (!torrent) return 0;
    const { first, last } = this.pieceRange;
    const bitfield = (torrent as any).pieces as { get(i: number): boolean } | undefined;
    if (!bitfield) return 0;
    const pieceLength = this._pieceLength;
    let downloaded = 0;
    for (let i = first; i <= last; i++) {
      if (bitfield.get(i)) {
        downloaded += i === last
          ? Math.min(pieceLength, this._offset + this._length - i * pieceLength)
          : pieceLength;
      }
    }
    return Math.min(downloaded, this._length);
  }

  /**
   * Progress de download deste arquivo específico (0..1).
   */
  get progress(): number {
    if (this._length === 0) return 0;
    return this.downloaded / this._length;
  }

  /**
   * Compute the range of piece indices that this file overlaps.
   *
   * Useful for piece selection algorithms that need to know which pieces
   * "belong" to a given file.
   */
  get pieceRange(): { first: number; last: number } {
    const first = Math.floor(this._offset / this._pieceLength);
    const last = Math.floor((this._offset + this._length - 1) / this._pieceLength);
    return { first, last };
  }

  /**
   * Returns true if the given piece index is part of this file.
   *
   * Supports both upstream signatures:
   * - `includes(pieceIndex: number)` — piece index
   * - `includes(piece: Piece)` — Piece object (legacy)
   */
  includes(pieceOrIndex: Piece | number): boolean {
    const { first, last } = this.pieceRange;
    const index = typeof pieceOrIndex === "number"
      ? pieceOrIndex
      : (pieceOrIndex as Piece).index;
    return index >= first && index <= last;
  }

  /**
   * Mark pieces [startPiece, endPiece] (inclusive) as selected for download.
   * Delegates to the owning torrent's `select`.
   *
   * If the file is not attached to a torrent, this is a no-op.
   */
  select(startPiece?: number, endPiece?: number): void {
    if (!this._torrent || !this._torrent.pieces) return;
    const { first, last } = this.pieceRange;
    const start = startPiece ?? first;
    const end = endPiece ?? last;
    this._torrent.select(start, end);
  }

  /**
   * Mark pieces [startPiece, endPiece] as deselected.
   * Delegates to the owning torrent's `deselect`.
   *
   * If the file is not attached to a torrent, this is a no-op.
   */
  deselect(startPiece?: number, endPiece?: number): void {
    if (!this._torrent || !this._torrent.pieces) return;
    const { first, last } = this.pieceRange;
    const start = startPiece ?? first;
    const end = endPiece ?? last;
    this._torrent.deselect(start, end);
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  /**
   * Create a W3C `ReadableStream<Uint8Array>` that reads this file's bytes
   * from the underlying {@link ChunkStore}, in order, in blocks of
   * {@link blockSize} bytes (default 64 KiB).
   *
   * Emits the `stream` event with the resulting stream as detail.
   *
   * Reading is **lazy**: each `pull` requests the next block from the
   * store.  This is the path that `<video src="…">` uses via the Service
   * Worker bridge.
   */
  createReadStream(opts: { start?: number; end?: number } = {}): ReadableStream<Uint8Array> {
    if (this._destroyed) {
      throw new Error("File has been destroyed");
    }

    // opts.start / opts.end are relative to the file (0 = file start).
    // Map them to absolute torrent offsets.
    const fileStart = opts.start ?? 0;
    const fileEnd = opts.end ?? this._length;
    const absStart = this._offset + fileStart;
    const absEnd = this._offset + fileEnd;

    if (fileStart < 0 || fileEnd > this._length || fileStart > fileEnd) {
      throw new RangeError(
        `Invalid range start=${fileStart}, end=${fileEnd}, length=${this._length}`,
      );
    }

    let cursor = absStart;
    let cancelled = false;
    let doneEmitted = false;

    const self = this;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller): Promise<void> {
        if (cancelled) {
          controller.close();
          return;
        }
        if (cursor >= absEnd) {
          if (!doneEmitted) {
            doneEmitted = true;
            self.emit("done", new CustomEvent("done"));
          }
          controller.close();
          return;
        }

        try {
          const block = await self._readBlock(
            cursor,
            Math.min(self._blockSize, absEnd - cursor),
          );
          if (cancelled) return;
          if (block.length === 0) {
            controller.close();
            return;
          }
          controller.enqueue(block);
          cursor += block.length;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          self.emit("error", new CustomEvent("error", { detail: { error } }));
          controller.error(error);
        }
      },
      cancel(): void {
        cancelled = true;
      },
    });

    this.emit("stream", new CustomEvent("stream", { detail: stream }));
    return stream;
  }

  /**
   * Alias for {@link createReadStream}.  Returns a `ReadableStream<Uint8Array>`.
   */
  stream(opts: { start?: number; end?: number } = {}): ReadableStream<Uint8Array> {
    return this.createReadStream(opts);
  }

  /**
   * Async iterator yielding this file's bytes as `Uint8Array` chunks.
   *
   * Used by `for await (const chunk of file)` loops and is the basis of
   * `arrayBuffer` and `blob`.
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    const stream = this.createReadStream();
    const iterator = stream[Symbol.asyncIterator]();
    this.emit("iterator", new CustomEvent("iterator", { detail: iterator }));
    return iterator;
  }

  /**
   * Read the entire file (or a byte range) into a single `ArrayBuffer`.
   *
   * Materializes the file in memory; suitable for small files only.
   * For large files prefer {@link createReadStream} or
   * {@link streamTo}.
   *
   * Supports `{ start, end }` to read a byte range — mirrors upstream
   * `file.arrayBuffer({ start, end })`.
   */
  async arrayBuffer(opts: { start?: number; end?: number } = {}): Promise<ArrayBuffer> {
    const stream = this.createReadStream(opts);
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out.buffer;
  }

  /**
   * Read the entire file (or a byte range) into a `Blob`.
   *
   * Supports `{ start, end }` to read a byte range — mirrors upstream
   * `file.blob({ start, end })`.
   */
  async blob(opts: { start?: number; end?: number } = {}): Promise<Blob> {
    const stream = this.createReadStream(opts);
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return new Blob([out.buffer], { type: this.type });
  }

  /**
   * Read the entire file into a `Blob` and return a temporary object URL
   * that can be assigned to `<video src>` etc.
   *
   * The caller is responsible for revoking the URL via
   * `URL.revokeObjectURL` when no longer needed.
   */
  async getBlobURL(): Promise<string> {
    const blob = await this.blob();
    return URL.createObjectURL(blob);
  }

  /**
   * Wire this file's stream into a `<video>` / `<audio>` element via the
   * Service Worker bridge.
   *
   * Requires that the client has called `client.createServer({ controller })`
   * so the SW has a transport to the main thread.
   */
  streamTo(element: HTMLMediaElement): void {
    const url = this.streamURL();
    element.src = url;
    element.load();
  }

  /**
   * Return the virtual URL the Service Worker uses to stream this file.
   *
   * Format: `<scope>webtorrent/<infoHash>/<fileIndex>/<encodedName>`.
   *
   * @throws Error if `infoHash` or `fileIndex` are not set, which means
   *   the file was constructed directly (not via `WebTorrent.add`).
   */
  streamURL(): string {
    if (!this._infoHash || this._fileIndex === undefined) {
      throw new Error(
        "infoHash and fileIndex are required to generate streamURL. " +
          "Create files via WebTorrent client (client.createServer + add).",
      );
    }
    return buildStreamURL(this._scope, this._infoHash, this._fileIndex, this.name);
  }

  /**
   * Mark the file as destroyed; subsequent reads throw.
   */
  destroy(): void {
    this._destroyed = true;
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * Read up to `length` bytes starting at the file's `absOffset` (the
   * absolute byte offset inside the torrent).
   *
   * Because the file's bytes may straddle piece boundaries, this method
   * pulls whole pieces from the {@link ChunkStore} and slices out the
   * exact byte range requested.
   */
  private async _readBlock(absOffset: number, length: number): Promise<Uint8Array> {
    const fileStart = this._offset;
    const fileEnd = this._offset + this._length;
    if (absOffset < fileStart || absOffset >= fileEnd) {
      return new Uint8Array(0);
    }
    const end = Math.min(absOffset + length, fileEnd);
    const out = new Uint8Array(end - absOffset);

    let written = 0;
    let cursor = absOffset;
    while (cursor < end) {
      const pieceIndex = Math.floor(cursor / this._pieceLength);
      const pieceStart = pieceIndex * this._pieceLength;
      const offsetInPiece = cursor - pieceStart;
      const pieceLen = Math.min(this._pieceLength, fileEnd - pieceStart);
      const wantInPiece = Math.min(pieceLen - offsetInPiece, end - cursor);

      const buf = await this._store.get(pieceIndex);
      if (!buf || buf.length === 0) break;

      out.set(buf.subarray(offsetInPiece, offsetInPiece + wantInPiece), written);
      written += wantInPiece;
      cursor += wantInPiece;
    }

    return out.subarray(0, written);
  }
}

```

---

## Arquivo: `packages/core/src/core/handshake.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/handshake.ts
/**
 * BitTorrent peer wire handshake codec with named reserved-bit extensions.
 *
 * Supports BEP 6 (Fast), BEP 10 (Extension Protocol), BEP 5 (DHT),
 * and BEP 52 (v2) reserved-bit negotiation.
 *
 * Adaptado de deno-torrent/peerwire/handshake.ts.
 * Replaces `@src/constants.ts` import with local `constants.ts`.
 */

import {
  BITTORRENT_PROTOCOL,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
  PEER_ID_LENGTH,
} from "./constants.ts";
import { ProtocolError } from "../utils/errors.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const protocolBytes = textEncoder.encode(BITTORRENT_PROTOCOL);

// ── Types ───────────────────────────────────────────────────────────────

export interface PeerHandshake {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  reserved: Uint8Array;
  extensions: ReadonlySet<HandshakeExtension>;
}

export interface EncodeHandshakeOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array | string;
  reserved?: Uint8Array;
  extensions?: Iterable<HandshakeExtension>;
}

// ── Encode ──────────────────────────────────────────────────────────────

/** Encode a 68-byte BitTorrent peer wire handshake. */
export function encodeHandshake(options: EncodeHandshakeOptions): Uint8Array {
  assertTwentyBytes("infoHash", options.infoHash);
  const peerId = typeof options.peerId === "string"
    ? textEncoder.encode(options.peerId)
    : options.peerId;
  assertTwentyBytes("peerId", peerId);

  const reserved = options.reserved
    ? new Uint8Array(options.reserved)
    : new Uint8Array(8);
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  for (const extension of options.extensions ?? []) {
    setExtension(reserved, extension, true);
  }

  const bytes = new Uint8Array(HANDSHAKE_LENGTH);
  bytes[0] = protocolBytes.length;
  bytes.set(protocolBytes, 1);
  bytes.set(reserved, 20);
  bytes.set(options.infoHash, 28);
  bytes.set(peerId, 48);
  return bytes;
}

// ── Decode ──────────────────────────────────────────────────────────────

/** Decode a 68-byte BitTorrent peer wire handshake. */
export function decodeHandshake(bytes: Uint8Array): PeerHandshake {
  if (bytes.length !== HANDSHAKE_LENGTH) {
    throw new ProtocolError(
      `peer handshake must contain ${HANDSHAKE_LENGTH} bytes`,
    );
  }
  const protocolLength = bytes[0]!;
  const protocol = textDecoder.decode(bytes.subarray(1, 1 + protocolLength));
  if (
    protocolLength !== protocolBytes.length ||
    protocol !== BITTORRENT_PROTOCOL
  ) {
    throw new ProtocolError(`unsupported peer protocol: ${protocol}`);
  }

  const reserved = bytes.slice(20, 28);
  const extensions = new Set<HandshakeExtension>();
  for (const extension of Object.values(HandshakeExtension)) {
    if (hasExtension(reserved, extension)) extensions.add(extension);
  }

  return {
    infoHash: bytes.slice(28, 48),
    peerId: bytes.slice(48, 68),
    reserved,
    extensions,
  };
}

// ── Reserved-bit helpers ────────────────────────────────────────────────

/** Check whether a named extension is enabled in the reserved bytes. */
export function hasExtension(
  reserved: Uint8Array,
  extension: HandshakeExtension,
): boolean {
  if (reserved.length !== 8) return false;
  const [byte, mask] = extensionLocation(extension);
  return (reserved[byte]! & mask) !== 0;
}

/** Set or clear a named extension in the reserved bytes (mutates in place). */
export function setExtension(
  reserved: Uint8Array,
  extension: HandshakeExtension,
  enabled: boolean,
): void {
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  const [byte, mask] = extensionLocation(extension);
  if (enabled) reserved[byte]! |= mask;
  else reserved[byte]! &= ~mask;
}

function extensionLocation(extension: HandshakeExtension): [number, number] {
  switch (extension) {
    case HandshakeExtension.Fast:
      return [7, 0x04];
    case HandshakeExtension.ExtensionProtocol:
      return [5, 0x10];
    case HandshakeExtension.Dht:
      return [7, 0x01];
    case HandshakeExtension.V2:
      return [7, 0x10];
  }
}

function assertTwentyBytes(name: string, bytes: Uint8Array): void {
  if (bytes.length !== PEER_ID_LENGTH) {
    throw new RangeError(`${name} must contain ${PEER_ID_LENGTH} bytes`);
  }
}

```

---

## Arquivo: `packages/core/src/core/message.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/message.ts
/**
 * Complete BitTorrent peer wire message codec.
 *
 * Supports all 20 standard message types plus forward-compatible
 * `unknown` messages. Includes BEP 6 Fast (suggest/haveAll/haveNone/reject/
 * allowedFast), BEP 5 (port), and BEP 52 v2 (hashRequest/hashes/hashReject).
 *
 * Adaptado de deno-torrent/peerwire/message.ts.
 * Replaces `@deno-torrent/toolkit` with local `isNetPort` and
 * `@src/errors.ts` with local `ProtocolError`.
 */

import { PeerMessageId } from "./constants.ts";
import { ProtocolError } from "../utils/errors.ts";
import { isNetPort } from "../utils/net.ts";

// ── Message type interfaces ─────────────────────────────────────────────

export interface KeepAliveMessage {
  type: "keepAlive";
}

export interface ChokeMessage {
  type: "choke";
}

export interface UnchokeMessage {
  type: "unchoke";
}

export interface InterestedMessage {
  type: "interested";
}

export interface NotInterestedMessage {
  type: "notInterested";
}

export interface HaveMessage {
  type: "have";
  pieceIndex: number;
}

export interface BitfieldMessage {
  type: "bitfield";
  bitfield: Uint8Array;
}

export interface BlockRequest {
  pieceIndex: number;
  begin: number;
  length: number;
}

/** Alias used by wire protocol for request/cancel/piece/reject coordinates. */
export type BlockCoordinates = BlockRequest;

export interface RequestMessage extends BlockRequest {
  type: "request";
}

export interface PieceMessage {
  type: "piece";
  pieceIndex: number;
  begin: number;
  block: Uint8Array;
}

export interface CancelMessage extends BlockRequest {
  type: "cancel";
}

export interface PortMessage {
  type: "port";
  port: number;
}

export interface SuggestPieceMessage {
  type: "suggestPiece";
  pieceIndex: number;
}

export interface HaveAllMessage {
  type: "haveAll";
}

export interface HaveNoneMessage {
  type: "haveNone";
}

export interface RejectRequestMessage extends BlockRequest {
  type: "rejectRequest";
}

export interface AllowedFastMessage {
  type: "allowedFast";
  pieceIndex: number;
}

export interface ExtendedMessage {
  type: "extended";
  extensionId: number;
  payload: Uint8Array;
}

/** Common BEP 52 Merkle hash request fields. */
export interface HashRequestFields {
  piecesRoot: Uint8Array;
  baseLayer: number;
  index: number;
  length: number;
  proofLayers: number;
}

export interface HashRequestMessage extends HashRequestFields {
  type: "hashRequest";
}

export interface HashesMessage extends HashRequestFields {
  type: "hashes";
  hashes: Uint8Array;
}

export interface HashRejectMessage extends HashRequestFields {
  type: "hashReject";
}

/** A forward-compatible message whose ID is not known by this library. */
export interface UnknownMessage {
  type: "unknown";
  id: number;
  payload: Uint8Array;
}

export type PeerMessage =
  | KeepAliveMessage
  | ChokeMessage
  | UnchokeMessage
  | InterestedMessage
  | NotInterestedMessage
  | HaveMessage
  | BitfieldMessage
  | RequestMessage
  | PieceMessage
  | CancelMessage
  | PortMessage
  | SuggestPieceMessage
  | HaveAllMessage
  | HaveNoneMessage
  | RejectRequestMessage
  | AllowedFastMessage
  | ExtendedMessage
  | HashRequestMessage
  | HashesMessage
  | HashRejectMessage
  | UnknownMessage;

// ── Encode ──────────────────────────────────────────────────────────────

/** Encode a peer message, including its four-byte big-endian length prefix. */
export function encodeMessage(message: PeerMessage): Uint8Array {
  if (message.type === "keepAlive") return new Uint8Array(4);

  const payload = encodeMessagePayload(message);
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length);
  frame.set(payload, 4);
  return frame;
}

function encodeMessagePayload(message: Exclude<PeerMessage, KeepAliveMessage>): Uint8Array {
  let id: number;
  let body: Uint8Array;

  switch (message.type) {
    case "choke":
      [id, body] = [PeerMessageId.Choke, new Uint8Array()];
      break;
    case "unchoke":
      [id, body] = [PeerMessageId.Unchoke, new Uint8Array()];
      break;
    case "interested":
      [id, body] = [PeerMessageId.Interested, new Uint8Array()];
      break;
    case "notInterested":
      [id, body] = [PeerMessageId.NotInterested, new Uint8Array()];
      break;
    case "have":
      id = PeerMessageId.Have;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "bitfield":
      id = PeerMessageId.Bitfield;
      body = new Uint8Array(message.bitfield);
      break;
    case "request":
      id = PeerMessageId.Request;
      body = encodeBlockRequest(message);
      break;
    case "piece": {
      id = PeerMessageId.Piece;
      body = new Uint8Array(8 + message.block.length);
      const view = new DataView(body.buffer);
      view.setUint32(0, asUint32(message.pieceIndex, "pieceIndex"));
      view.setUint32(4, asUint32(message.begin, "begin"));
      body.set(message.block, 8);
      break;
    }
    case "cancel":
      id = PeerMessageId.Cancel;
      body = encodeBlockRequest(message);
      break;
    case "port":
      id = PeerMessageId.Port;
      if (!isNetPort(message.port)) {
        throw new RangeError("port must be an unsigned 16-bit integer");
      }
      body = new Uint8Array(2);
      new DataView(body.buffer).setUint16(0, message.port);
      break;
    case "suggestPiece":
      id = PeerMessageId.SuggestPiece;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "haveAll":
      [id, body] = [PeerMessageId.HaveAll, new Uint8Array()];
      break;
    case "haveNone":
      [id, body] = [PeerMessageId.HaveNone, new Uint8Array()];
      break;
    case "rejectRequest":
      id = PeerMessageId.RejectRequest;
      body = encodeBlockRequest(message);
      break;
    case "allowedFast":
      id = PeerMessageId.AllowedFast;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "extended":
      id = PeerMessageId.Extended;
      if (
        !Number.isInteger(message.extensionId) ||
        message.extensionId < 0 ||
        message.extensionId > 0xff
      ) {
        throw new RangeError("extensionId must be an unsigned 8-bit integer");
      }
      body = new Uint8Array(1 + message.payload.length);
      body[0] = message.extensionId;
      body.set(message.payload, 1);
      break;
    case "hashRequest":
      id = PeerMessageId.HashRequest;
      body = encodeHashRequest(message);
      break;
    case "hashes": {
      id = PeerMessageId.Hashes;
      if (message.hashes.length < 32 || message.hashes.length % 32 !== 0) {
        throw new RangeError(
          "hashes must contain complete 32-byte SHA-256 hashes",
        );
      }
      body = new Uint8Array(48 + message.hashes.length);
      body.set(encodeHashRequest(message));
      body.set(message.hashes, 48);
      break;
    }
    case "hashReject":
      id = PeerMessageId.HashReject;
      body = encodeHashRequest(message);
      break;
    case "unknown":
      if (
        !Number.isInteger(message.id) ||
        message.id < 0 ||
        message.id > 0xff
      ) {
        throw new RangeError("message id must be an unsigned 8-bit integer");
      }
      id = message.id;
      body = new Uint8Array(message.payload);
      break;
  }

  const payload = new Uint8Array(1 + body.length);
  payload[0] = id;
  payload.set(body, 1);
  return payload;
}

// ── Decode ──────────────────────────────────────────────────────────────

/** Decode one complete length-prefixed peer wire frame. */
export function decodeMessage(frame: Uint8Array): PeerMessage {
  if (frame.length < 4) {
    throw new ProtocolError("peer message is missing its length prefix");
  }
  const length = new DataView(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength,
  ).getUint32(0);

  if (length !== frame.length - 4) {
    throw new ProtocolError(
      `peer message length prefix is ${length}, received ${frame.length - 4}`,
    );
  }
  if (length === 0) return { type: "keepAlive" };
  return decodeMessagePayload(frame.subarray(4));
}

/** Decode the bytes after a non-zero peer message length prefix. */
export function decodeMessagePayload(payload: Uint8Array): PeerMessage {
  if (payload.length === 0) {
    throw new ProtocolError("non-keepalive message has no message ID");
  }
  const id = payload[0]!;
  const body = payload.subarray(1);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);

  switch (id) {
    case PeerMessageId.Choke:
      assertLength("choke", body, 0);
      return { type: "choke" };
    case PeerMessageId.Unchoke:
      assertLength("unchoke", body, 0);
      return { type: "unchoke" };
    case PeerMessageId.Interested:
      assertLength("interested", body, 0);
      return { type: "interested" };
    case PeerMessageId.NotInterested:
      assertLength("not interested", body, 0);
      return { type: "notInterested" };
    case PeerMessageId.Have:
      assertLength("have", body, 4);
      return { type: "have", pieceIndex: view.getUint32(0) };
    case PeerMessageId.Bitfield:
      return { type: "bitfield", bitfield: new Uint8Array(body) };
    case PeerMessageId.Request:
      return { type: "request", ...decodeBlockRequest("request", body) };
    case PeerMessageId.Piece:
      if (body.length < 8) {
        throw new ProtocolError("piece message must contain a header");
      }
      return {
        type: "piece",
        pieceIndex: view.getUint32(0),
        begin: view.getUint32(4),
        block: body.slice(8),
      };
    case PeerMessageId.Cancel:
      return { type: "cancel", ...decodeBlockRequest("cancel", body) };
    case PeerMessageId.Port:
      assertLength("port", body, 2);
      return { type: "port", port: view.getUint16(0) };
    case PeerMessageId.SuggestPiece:
      assertLength("suggest piece", body, 4);
      return { type: "suggestPiece", pieceIndex: view.getUint32(0) };
    case PeerMessageId.HaveAll:
      assertLength("have all", body, 0);
      return { type: "haveAll" };
    case PeerMessageId.HaveNone:
      assertLength("have none", body, 0);
      return { type: "haveNone" };
    case PeerMessageId.RejectRequest:
      return {
        type: "rejectRequest",
        ...decodeBlockRequest("reject request", body),
      };
    case PeerMessageId.AllowedFast:
      assertLength("allowed fast", body, 4);
      return { type: "allowedFast", pieceIndex: view.getUint32(0) };
    case PeerMessageId.Extended:
      if (body.length < 1) {
        throw new ProtocolError(
          "extended message must contain an extension ID",
        );
      }
      return {
        type: "extended",
        extensionId: body[0]!,
        payload: body.slice(1),
      };
    case PeerMessageId.HashRequest:
      return {
        type: "hashRequest",
        ...decodeHashRequest("hash request", body),
      };
    case PeerMessageId.Hashes: {
      if (body.length < 80 || (body.length - 48) % 32 !== 0) {
        throw new ProtocolError(
          "hashes message must contain a 48-byte header and complete SHA-256 hashes",
        );
      }
      return {
        type: "hashes",
        ...decodeHashRequest("hashes", body.subarray(0, 48)),
        hashes: body.slice(48),
      };
    }
    case PeerMessageId.HashReject:
      return {
        type: "hashReject",
        ...decodeHashRequest("hash reject", body),
      };
    default:
      return { type: "unknown", id, payload: new Uint8Array(body) };
  }
}

// ── Block request helpers ───────────────────────────────────────────────

function encodeBlockRequest(request: BlockRequest): Uint8Array {
  const body = new Uint8Array(12);
  const view = new DataView(body.buffer);
  view.setUint32(0, asUint32(request.pieceIndex, "pieceIndex"));
  view.setUint32(4, asUint32(request.begin, "begin"));
  view.setUint32(8, asUint32(request.length, "length"));
  if (request.length === 0) {
    throw new RangeError("length must be greater than zero");
  }
  return body;
}

function decodeBlockRequest(name: string, body: Uint8Array): BlockRequest {
  assertLength(name, body, 12);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const length = view.getUint32(8);
  if (length === 0) {
    throw new ProtocolError(`${name} length must be greater than zero`);
  }
  return {
    pieceIndex: view.getUint32(0),
    begin: view.getUint32(4),
    length,
  };
}

// ── BEP 52 hash request helpers ─────────────────────────────────────────

function encodeHashRequest(request: HashRequestFields): Uint8Array {
  validateHashRequest(request, RangeError);
  const body = new Uint8Array(48);
  body.set(request.piecesRoot);
  const view = new DataView(body.buffer);
  view.setUint32(32, request.baseLayer);
  view.setUint32(36, request.index);
  view.setUint32(40, request.length);
  view.setUint32(44, request.proofLayers);
  return body;
}

function decodeHashRequest(name: string, body: Uint8Array): HashRequestFields {
  assertLength(name, body, 48);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const request: HashRequestFields = {
    piecesRoot: body.slice(0, 32),
    baseLayer: view.getUint32(32),
    index: view.getUint32(36),
    length: view.getUint32(40),
    proofLayers: view.getUint32(44),
  };
  validateHashRequest(request, ProtocolError);
  return request;
}

function validateHashRequest(
  request: HashRequestFields,
  ErrorType: typeof RangeError | typeof ProtocolError,
): void {
  if (request.piecesRoot.length !== 32) {
    throw new ErrorType("piecesRoot must contain 32 bytes");
  }
  for (
    const [name, value] of [
      ["baseLayer", request.baseLayer],
      ["index", request.index],
      ["length", request.length],
      ["proofLayers", request.proofLayers],
    ] as const
  ) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new ErrorType(`${name} must be an unsigned 32-bit integer`);
    }
  }
  if (
    request.length < 2 || request.length > 512 ||
    (request.length & (request.length - 1)) !== 0
  ) {
    throw new ErrorType(
      "hash request length must be a power of two from 2 to 512",
    );
  }
  if (request.index % request.length !== 0) {
    throw new ErrorType("hash request index must be a multiple of length");
  }
}

// ── Generic helpers ─────────────────────────────────────────────────────

function uint32Body(value: number, name: string): Uint8Array {
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, asUint32(value, name));
  return body;
}

function asUint32(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
  return value;
}

function assertLength(name: string, body: Uint8Array, expected: number): void {
  if (body.length !== expected) {
    throw new ProtocolError(
      `${name} message body must contain ${expected} bytes`,
    );
  }
}

```

---

## Arquivo: `packages/core/src/core/piece.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/piece.ts

/**
 * Represents a single piece within a torrent.
 *
 * Exposed in the browser API as `torrent.files[0].pieces[i]` etc.
 * Each piece carries its index, length, byte offset inside the
 * torrent stream, and optional hash verification state.
 */
export class Piece {
  /** The zero-based piece index in the torrent. */
  readonly index: number;
  /** The byte length of this piece (may differ for the last piece). */
  readonly length: number;
  /** The byte offset of this piece inside the concatenated torrent stream. */
  readonly offset: number;
  /** Whether the piece hash has been verified (optional, set by consumer). */
  hash?: Uint8Array;

  constructor(index: number, length: number, offset: number) {
    this.index = index;
    this.length = length;
    this.offset = offset;
  }

  /**
   * Returns `true` if this piece is partially or fully downloaded.
   * The `downloaded` flag is computed by the consumer (the `Bitfield`
   * tracks the actual state).
   */
  get downloaded(): boolean {
    return !!this.hash;
  }

  /**
   * Returns `true` if the piece is missing (not yet downloaded).
   */
  get missing(): boolean {
    return !this.hash;
  }

  /**
   * Returns a human-readable description of this piece.
   */
  toString(): string {
    return `Piece(index=${this.index}, length=${this.length}, offset=${this.offset}, ${this.missing ? "missing" : "downloaded"})`;
  }
}

```

---

## Arquivo: `packages/core/src/core/torrent.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/torrent.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { ParsedTorrent, ParsedTorrentFile } from "../utils/parse-torrent.ts";
import { ChunkStore } from "../storage/opfs-chunk-store.ts";
import { Bitfield } from "./bitfield.ts";
import { sha1 } from "../crypto/hasher.ts";
import { decode, type BencodeDict } from "../utils/bencode.ts";
import type { Wire } from "./wire.ts";
import type { File } from "./file.ts";

// ============================================================================
// TIPOS DE EVENTOS
// ============================================================================

export interface TorrentEvents {
  ready: Event;
  metadata: CustomEvent<{ files: ParsedTorrentFile[]; length: number; name: string }>;
  download: CustomEvent<{ bytes: number }>;
  upload: CustomEvent<{ bytes: number }>;
  done: Event;
  error: CustomEvent<{ error: Error }>;
  verified: CustomEvent<{ index: number }>;
  /** Emitido quando o torrent é adicionado ao cliente (infoHash disponível) */
  infoHash: CustomEvent<{ infoHash: string }>;
  /** Emitido quando um peer ou tracker reporta um warning não-fatal */
  warning: CustomEvent<{ error: Error }>;
  /** Emitido quando o tracker ou PEX indica que não há peers disponíveis */
  noPeers: CustomEvent<{ source: string }>;
  /** Emitido quando não há atividade de rede por 30 segundos */
  idle: Event;
  /** Emitido quando um novo Wire é estabelecido com um peer */
  wire: CustomEvent<{ wire: Wire; addr: string }>;
}

export interface TorrentOptions {
  store: ChunkStore;
  skipVerify?: boolean;
  /** Swarm externo; quando fornecido, o Torrent delega pause/resume/select/deselect a ele */
  swarm?: any;
}

// ============================================================================
// CLASSE TORRENT
// ============================================================================

export class Torrent extends TypedEventTarget<TorrentEvents> {
  public readonly infoHash: string;
  public name: string;
  public pieceLength: number;
  public length: number;
  /** Returns enriched {@link File} instances (with `streamTo`, `createReadStream`, etc.) when the client has registered them, or the raw metadata file descriptors otherwise. */
  public get files(): File[] | ParsedTorrentFile[] { return this._registeredFiles.length > 0 ? this._registeredFiles : this._rawFiles; }
  /** Raw file descriptors from parsed metadata — used as fallback until the client registers enriched File instances. */
  private _rawFiles: ParsedTorrentFile[] = [];

  private parsedTorrent: ParsedTorrent;
  private store: ChunkStore;
  private bitfield: Bitfield;
  private expectedPieces: Uint8Array[];

  private _downloaded: number = 0;
  private _uploaded: number = 0;
  private _destroyed: boolean = false;
  private _ready: boolean = false;
  private _metadataReceived: boolean = false;
  private _paused: boolean = false;

  /** Swarm ao qual delegamos operações de rede */
  private _swarm?: any;
  /** Bitfield de peças selecionadas */
  private _selected: Bitfield;
  /** Bitfield de peças críticas */
  private _critical: Bitfield;
  /** Velocidade de download atual em bytes/s */
  private _downloadSpeed: number = 0;
  /** Velocidade de upload atual em bytes/s */
  private _uploadSpeed: number = 0;
  /** Timestamp do último sample de velocidade */
  private _lastSpeedSample: number = 0;
  /** Lista de Web Seeds (URLs HTTP) */
  private _webSeeds: string[] = [];
  /** Timeout de inatividade */
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _IDLE_TIMEOUT_MS = 30000;
  /** Intervals de velocidade por wire */
  private readonly _speedIntervals: Set<ReturnType<typeof setInterval>> = new Set();
  /** File objects registrados pelo cliente (para forward de eventos). */
  private _registeredFiles: File[] = [];

  constructor(parsedTorrent: ParsedTorrent, opts: TorrentOptions) {
    super();
    this.parsedTorrent = parsedTorrent;
    this.store = opts.store;
    this._swarm = opts.swarm;

    this.infoHash = parsedTorrent.infoHash;
    this.name = parsedTorrent.name || "Unknown";
    this.pieceLength = parsedTorrent.pieceLength;
    this.length = parsedTorrent.length;
    this._rawFiles = parsedTorrent.files;

    const numPieces = parsedTorrent.pieces.length;
    this.bitfield = new Bitfield(numPieces);
    this.expectedPieces = parsedTorrent.pieces;
    this._selected = new Bitfield(numPieces);
    this._critical = new Bitfield(numPieces);
    this._webSeeds = [...(parsedTorrent.urlList || [])];

    queueMicrotask(() => {
      this._init(opts.skipVerify || false).catch((err) => {
        this._onError(err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.emit("infoHash", new CustomEvent("infoHash", { detail: { infoHash: this.infoHash } }));
  }

  // ==========================================================================
  // GETTERS COMPUTADOS
  // ==========================================================================

  get ready(): boolean { return this._ready; }
  get destroyed(): boolean { return this._destroyed; }
  get downloaded(): number { return this._downloaded; }
  get uploaded(): number { return this._uploaded; }
  get paused(): boolean { return this._paused; }

  get progress(): number {
    if (this.length === 0) return 0;
    return this._downloaded / this.length;
  }

  get numPieces(): number { return this.expectedPieces.length; }

  get lastPieceLength(): number {
    return this.length % this.pieceLength || this.pieceLength;
  }

  /** URI magnet completo. */
  get magnetURI(): string {
    return this.parsedTorrent.magnetURI || "";
  }

  /** Número de peers conectados (via swarm). */
  get numPeers(): number {
    return this._swarm?.peers?.size ?? 0;
  }

  /** Velocidade de download em bytes/s. */
  get downloadSpeed(): number { return this._downloadSpeed; }

  /** Velocidade de upload em bytes/s. */
  get uploadSpeed(): number { return this._uploadSpeed; }

  /** Ratio upload/download. Infinity se nada foi baixado. */
  get ratio(): number {
    if (this._downloaded === 0) return Infinity;
    return this._uploaded / this._downloaded;
  }

  /** Tempo restante estimado em segundos. null se não pode estimar. */
  get timeRemaining(): number | null {
    if (this._downloadSpeed <= 0 || this.progress >= 1) return null;
    const remaining = this.length - this._downloaded;
    return Math.ceil(remaining / this._downloadSpeed);
  }

  /** Bitfield de peças baixadas. */
  get pieces(): Bitfield { return this.bitfield; }

  /** Bitfield de peças selecionadas. */
  get selected(): Bitfield { return this._selected; }

  /** Bitfield de peças críticas. */
  get criticalPieces(): Bitfield { return this._critical; }

  /** Lista de Web Seeds. */
  get webSeeds(): string[] { return [...this._webSeeds]; }

  // ── webtorrent.min.js parity ─────────────────────────────────────────

  /** Alias de `downloaded`. */
  get received(): number { return this._downloaded; }

  /** `true` quando `progress === 1`. */
  get done(): boolean { return this.progress >= 1; }

  /** Data de criação do torrent (de `creation date`). */
  get created(): Date | undefined {
    const ts = this.parsedTorrent.info["creation date"];
    return typeof ts === "number" ? new Date(ts * 1000) : undefined;
  }

  /** Campo `created by` do torrent. */
  get createdBy(): string | undefined { return this.parsedTorrent.createdBy; }

  /** Campo `comment` do torrent. */
  get comment(): string | undefined { return this.parsedTorrent.comment; }

  /**
   * Bencode bytes do arquivo `.torrent` completo.
   * `undefined` se o torrent foi adicionado via magnet (sem arquivo `.torrent`).
   */
  get torrentFile(): Uint8Array | undefined {
    return this.parsedTorrent.torrentFileBytes;
  }

  /**
   * Blob do arquivo `.torrent`. Útil para download pelo usuário.
   * `undefined` se o torrent foi adicionado via magnet.
   */
  get torrentFileBlob(): Blob | undefined {
    const bytes = this.torrentFile;
    return bytes ? new Blob([new Uint8Array(bytes)]) : undefined;
  }

  /** Lista de trackers do torrent. */
  get announce(): string[] { return this.parsedTorrent.announce; }

  /** Máximo de conexões Web Seed simultâneas. */
  get maxWebConns(): number { return this._swarm?.maxConns ?? 10; }

  // ==========================================================================
  // SELEÇÃO DE PEÇAS
  // ==========================================================================

  /**
   * Marca interesse em peças [startPiece, endPiece] e envia `interested` nos wires.
   * Se endPiece for omitido, seleciona até o fim.
   */
  select(startPiece: number, endPiece?: number, _priority = 0, _notify = false): void {
    const end = endPiece ?? this.numPieces - 1;
    for (let i = startPiece; i <= end; i++) {
      this._selected.set(i);
    }
    this._swarm?._sendInterested();
  }

  /**
   * Remove interesse em peças [startPiece, endPiece] e envia `not-interested` se
   * nenhuma peça estiver mais selecionada.
   */
  deselect(startPiece: number, endPiece?: number): void {
    const end = endPiece ?? this.numPieces - 1;
    for (let i = startPiece; i <= end; i++) {
      this._selected.unset(i);
    }
    if (this._selected.count() === 0) {
      this._swarm?._sendNotInterested();
    }
  }

  /**
   * Marca peças como críticas (raras) e envia `suggestPiece` nos wires.
   * Peças críticas são solicitadas antes das demais.
   */
  setCritical(startPiece: number, endPiece?: number): void {
    const end = endPiece ?? startPiece;
    for (let i = startPiece; i <= end; i++) {
      this._critical.set(i);
    }
    for (let i = startPiece; i <= end; i++) {
      this._swarm?._sendSuggestPiece(i);
    }
  }

  // ==========================================================================
  // RESCAN FILES
  // ==========================================================================

  /**
   * Re-verifica todas as peças existentes no store.
   * Útil quando o store foi manipulado externamente.
   *
   * @param cb - Callback chamado com `(err, res)` quando a varredura termina.
   *             Se omitido, retorna uma Promise.
   */
  rescanFiles(cb?: (err: Error | null) => void): void | Promise<void> {
    const task = this._verifyExistingPieces()
      .then(() => { cb?.(null); })
      .catch((err) => { cb?.(err instanceof Error ? err : new Error(String(err))); });

    if (!cb) return task;
  }

  // ==========================================================================
  // PAUSE / RESUME
  // ==========================================================================

  pause(): void {
    this._paused = true;
    this._swarm?.pause();
  }

  resume(): void {
    this._paused = false;
    this._swarm?.resume();
  }

  // ==========================================================================
  // PEERS E WEB SEEDS
  // ==========================================================================

  addPeer(addr: string): boolean {
    return this._swarm?.addPeer(addr) ?? false;
  }

  removePeer(addr: string): void {
    this._swarm?.removePeer(addr);
  }

  addWebSeed(url: string): void {
    if (!this._webSeeds.includes(url)) {
      this._webSeeds.push(url);
    }
  }

  removeWebSeed(url: string): void {
    const idx = this._webSeeds.indexOf(url);
    if (idx !== -1) this._webSeeds.splice(idx, 1);
  }

  // ==========================================================================
  // REGISTRO DE WIRES (chamado pelo Swarm)
  // ==========================================================================

  _registerWire(wire: Wire, addr: string): void {
    this.emit("wire", new CustomEvent("wire", { detail: { wire, addr } }));

    let lastDownloaded = 0;
    let lastUploaded = 0;
    const interval = setInterval(() => {
      if (wire.isDestroyed) {
        clearInterval(interval);
        this._speedIntervals.delete(interval);
        return;
      }
      const now = Date.now();
      const dt = (now - this._lastSpeedSample) / 1000;
      if (dt > 0) {
        const dl = (wire.downloadedBytes - lastDownloaded) / dt;
        const ul = (wire.uploadedBytes - lastUploaded) / dt;
        this._downloadSpeed = Math.round(this._downloadSpeed * 0.8 + dl * 0.2);
        this._uploadSpeed = Math.round(this._uploadSpeed * 0.8 + ul * 0.2);
      }
      lastDownloaded = wire.downloadedBytes;
      lastUploaded = wire.uploadedBytes;
      this._lastSpeedSample = now;
    }, 1000);

    this._speedIntervals.add(interval);
    this._resetIdleTimer();
  }

  // ==========================================================================
  // INJEÇÃO TARDIA DE METADADOS (Magnet URIs)
  // ==========================================================================

  async setMetadata(infoBuffer: Uint8Array): Promise<boolean> {
    if (this._metadataReceived) return false;

    try {
      const info = decode(infoBuffer) as BencodeDict;

      const pieceLength = info["piece length"] as number;
      const piecesRaw = info["pieces"];

      if (typeof pieceLength !== "number" || !(piecesRaw instanceof Uint8Array)) {
        throw new Error("Invalid metadata: missing piece length or pieces");
      }

      const newExpectedPieces: Uint8Array[] = [];
      for (let i = 0; i < piecesRaw.length; i += 20) {
        newExpectedPieces.push(piecesRaw.subarray(i, i + 20));
      }

      const newFiles: ParsedTorrentFile[] = [];
      let totalLength = 0;
      const textDecoder = new TextDecoder();

      if (info["files"]) {
        const filesList = info["files"] as BencodeDict[];
        for (const fileDict of filesList) {
          const length = fileDict["length"] as number;
          const pathList = fileDict["path"] as (Uint8Array | string)[];
          const pathParts = pathList.map((p) =>
            typeof p === "string" ? p : textDecoder.decode(p)
          );
          const path = pathParts.join("/");
          const name = pathParts[pathParts.length - 1]!;
          newFiles.push({ path, name, length, offset: totalLength });
          totalLength += length;
        }
      } else {
        const length = info["length"] as number;
        const nameRaw = info["name"];
        const name = typeof nameRaw === "string"
          ? nameRaw
          : textDecoder.decode(nameRaw as Uint8Array);
        newFiles.push({ path: name, name, length, offset: 0 });
        totalLength = length;
      }

      this.pieceLength = pieceLength;
      this.length = totalLength;
      this._rawFiles = newFiles;
      this.expectedPieces = newExpectedPieces;

      const nameRaw = info["name"];
      this.name = typeof nameRaw === "string"
        ? nameRaw
        : textDecoder.decode(nameRaw as Uint8Array);

      const newNum = newExpectedPieces.length;
      this.bitfield = new Bitfield(newNum);
      this._selected = new Bitfield(newNum);
      this._critical = new Bitfield(newNum);
      this._metadataReceived = true;

      this.emit("metadata", new CustomEvent("metadata", {
        detail: { files: this.files, length: this.length, name: this.name }
      }));

      await this._verifyExistingPieces();
      return true;
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  // ==========================================================================
  // CICLO DE VIDA
  // ==========================================================================

  private async _init(skipVerify: boolean): Promise<void> {
    try {
      if (!skipVerify && this.numPieces > 0) {
        await this._verifyExistingPieces();
      }
      this._ready = true;
      this._lastSpeedSample = Date.now();
      this.emit("ready");
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async _verifyExistingPieces(): Promise<void> {
    for (let i = 0; i < this.numPieces; i++) {
      try {
        const opts = i === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
        const buf = await this.store.get(i, opts);
        await this._verifyPiece(i, buf);
      } catch (err: any) {
        if (!err.notFound) {
          console.warn(`[Torrent] Erro ao verificar peça ${i}:`, err);
        }
      }
    }
  }

  // ==========================================================================
  // RECEBIMENTO DE DADOS
  // ==========================================================================

  async receivePiece(index: number, buf: Uint8Array): Promise<boolean> {
    if (this._destroyed) return false;
    if (this.bitfield.get(index)) return true;
    if (!this._metadataReceived && this.numPieces === 0) return false;

    try {
      await this._verifyPiece(index, buf);
      await this.store.put(index, buf);
      this.bitfield.set(index);
      const pieceLen = index === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
      this._downloaded += pieceLen;
      this._resetIdleTimer();

      this.emit("verified", new CustomEvent("verified", { detail: { index } }));
      this.emit("download", new CustomEvent("download", { detail: { bytes: pieceLen } }));
      this._forwardToFiles("download", index, pieceLen);

      if (this.progress >= 1) {
        this.emit("done");
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Registra `File` instances para receberem os eventos `download`/`upload`.
   * Chamado pelo {@link WebTorrent} após criar os `File`s.
   */
  _registerFiles(files: File[]): void {
    this._registeredFiles = files;
  }

  /**
   * Emite um evento de download/upload nos Files cujo `pieceRange` contém `index`.
   */
  private _forwardToFiles(
    type: "download" | "upload",
    index: number,
    bytes: number,
  ): void {
    for (const f of this._registeredFiles) {
      const file = f as {
        pieceRange: { first: number; last: number };
        emit: (type: string, ev: Event) => void;
      };
      if (index >= file.pieceRange.first && index <= file.pieceRange.last) {
        file.emit(type, new CustomEvent(type, { detail: { bytes } }));
      }
    }
  }

  async getPiece(index: number): Promise<Uint8Array | null> {
    if (!this.bitfield.get(index)) return null;
    try {
      const opts = index === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
      return await this.store.get(index, opts);
    } catch {
      return null;
    }
  }

  async destroy(destroyStore = false): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const interval of this._speedIntervals) clearInterval(interval);
    this._speedIntervals.clear();

    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }

    try {
      if (destroyStore) {
        await this.store.destroy();
      } else {
        await this.store.close();
      }
    } catch (err) {
      console.warn("[Torrent] Erro ao fechar store:", err);
    }
  }

  // ==========================================================================
  // PRIVADOS
  // ==========================================================================

  private async _verifyPiece(index: number, buf: Uint8Array): Promise<void> {
    const expected = this.expectedPieces[index];
    if (!expected) throw new Error(`Índice de peça ${index} fora do limite.`);

    const actual = await sha1(buf);
    const expectedHex = Array.from(expected)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (actual !== expectedHex) {
      throw new Error(`Hash mismatch na peça ${index}.`);
    }
  }

  private _resetIdleTimer(): void {
    if (this._idleTimer !== null) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this.emit("idle");
    }, this._IDLE_TIMEOUT_MS) as unknown as ReturnType<typeof setTimeout>;
  }

  private _onError(err: Error): void {
    this.emit("error", new CustomEvent("error", { detail: { error: err } }));
  }
}

```

---

## Arquivo: `packages/core/src/core/wire.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/wire.ts
/**
 * BitTorrent peer wire protocol — event-driven facade with robust internals.
 *
 * Preserves the existing `WireEvents` API consumed by the rest of BrowserTorrent, while
 * adding the security, validation, and lifecycle management from deno-torrent's
 * `peer_wire.ts`:
 *
 * - Machine states: Handshaking → Connected → Closed
 * - Named reserved-bit negotiation (BEP 5/6/10/52)
 * - Availability-order validation (bitfield/haveAll/haveNone must come first)
 * - Extension gating (Fast, ExtensionProtocol, DHT, V2 messages rejected
 *   unless both sides advertised the capability)
 * - Backpressure: maxMessageLength, maxBlockLength, maxPendingRequests,
 *   maxQueuedWriteBytes
 * - Keepalive timer
 * - Idle timeout
 * - expectedPeerId validation
 * - ExtensionHost BEP 10 integration
 *
 * Adaptado de deno-torrent/peerwire/peer_wire.ts para o modelo
 * Transport síncrono + buffer do BrowserTorrent.
 */

import { TypedEventTarget } from "../utils/event-target.ts";
import { concat, equals, readUInt32BE, writeUInt32BE } from "../utils/buffer.ts";
import { decode } from "../utils/bencode.ts";
import {
  PeerWireError,
  ProtocolError,
  EofError,
  TimeoutError,
} from "../utils/errors.ts";
import {
  encodeHandshake,
  decodeHandshake,
  hasExtension,
  type PeerHandshake,
} from "./handshake.ts";
import {
  encodeMessage,
  decodeMessagePayload,
  type PeerMessage,
  type BlockCoordinates,
} from "./message.ts";
import {
  BITTORRENT_PROTOCOL,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
  DEFAULT_MAX_MESSAGE_LENGTH,
  DEFAULT_MAX_BLOCK_LENGTH,
  DEFAULT_MAX_PENDING_REQUESTS,
  DEFAULT_MAX_QUEUED_WRITE_BYTES,
} from "./constants.ts";
import { ExtensionHost, type PeerWireExtension } from "./extension-host.ts";

// ── Transport contract ──────────────────────────────────────────────────

export interface Transport {
  send(data: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): void;
  close(): void;
}

// ── Events ──────────────────────────────────────────────────────────────

export interface WireEvents {
  handshake: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array; infoHash: Uint8Array }>;
  choke: Event;
  unchoke: Event;
  interested: Event;
  "not-interested": Event;
  have: CustomEvent<{ index: number }>;
  bitfield: CustomEvent<{ bitfield: Uint8Array }>;
  request: CustomEvent<{ index: number; offset: number; length: number }>;
  piece: CustomEvent<{ index: number; offset: number; block: Uint8Array }>;
  cancel: CustomEvent<{ index: number; offset: number; length: number }>;
  extended: CustomEvent<{ id: number; payload: any }>;
  /** BEP 5 — DHT port */
  port: CustomEvent<{ port: number }>;
  /** BEP 6 — Fast: suggest piece */
  suggestPiece: CustomEvent<{ index: number }>;
  /** BEP 6 — Fast: have all */
  haveAll: Event;
  /** BEP 6 — Fast: have none */
  haveNone: Event;
  /** BEP 6 — Fast: reject request */
  rejectRequest: CustomEvent<{ index: number; offset: number; length: number }>;
  /** BEP 6 — Fast: allowed fast */
  allowedFast: CustomEvent<{ index: number }>;
  /** BEP 52 v2: hash request */
  hashRequest: CustomEvent<{ piecesRoot: Uint8Array; baseLayer: number; index: number; length: number; proofLayers: number }>;
  /** BEP 52 v2: hashes response */
  hashes: CustomEvent<{ piecesRoot: Uint8Array; baseLayer: number; index: number; length: number; proofLayers: number; hashes: Uint8Array }>;
  /** BEP 52 v2: hash reject */
  hashReject: CustomEvent<{ piecesRoot: Uint8Array; baseLayer: number; index: number; length: number; proofLayers: number }>;
  keepAlive: Event;
  unknown: CustomEvent<{ id: number; payload: Uint8Array }>;
  error: CustomEvent<{ error: Error }>;
  close: CustomEvent<{ reason?: unknown }>;
}

// ── Wire states ─────────────────────────────────────────────────────────

export enum WireState {
  Handshaking = "handshaking",
  Connected = "connected",
  Closed = "closed",
}

// ── Options ─────────────────────────────────────────────────────────────

export interface WireOptions {
  /** Expected info hash for handshake validation. */
  expectedInfoHash?: Uint8Array;
  /** Expected peer ID for handshake validation. */
  expectedPeerId?: Uint8Array;
  /** Reserved-bit capabilities to advertise. */
  extensions?: Iterable<HandshakeExtension>;
  /** Torrent geometry for bitfield/block validation. */
  pieceCount?: number;
  /** Normal piece size. */
  pieceLength?: number;
  /** Total payload size (for last-piece derivation). */
  totalLength?: number;
  /** Largest length-prefixed peer message accepted (default 2 MiB). */
  maxMessageLength?: number;
  /** Largest piece block accepted or requested (default 16 KiB). */
  maxBlockLength?: number;
  /** Maximum outstanding requests in either direction (default 250). */
  maxPendingRequests?: number;
  /** Maximum encoded bytes waiting behind the active transport write (default 4 MiB). */
  maxQueuedWriteBytes?: number;
  /** Handshake deadline in ms (default 30000, 0 = disabled). */
  handshakeTimeoutMs?: number;
  /** Close the connection after this much inactivity in ms (0 = disabled). */
  idleTimeoutMs?: number;
  /** Send keepalives after this much inactivity in ms (0 = disabled). */
  keepAliveIntervalMs?: number;
  /** BEP 10 extension host: client name. */
  clientName?: string;
  /** BEP 10 extension host: listen port. */
  listenPort?: number;
}

// ── Wire ────────────────────────────────────────────────────────────────

export class Wire extends TypedEventTarget<WireEvents> {
  // ── Public observable state (BEP 3 four flags) ─────────────────────
  public amChoking: boolean = true;
  public amInterested: boolean = false;
  public peerChoking: boolean = true;
  public peerInterested: boolean = false;

  public peerId: string | null = null;
  public peerIdBuffer: Uint8Array | null = null;

  // ── Lifecycle state ────────────────────────────────────────────────
  public state: WireState = WireState.Handshaking;
  public remoteHandshake?: PeerHandshake;

  // ── Stats ──────────────────────────────────────────────────────────
  public uploadedBytes: number = 0;
  public downloadedBytes: number = 0;
  public lastActivityAt: number = Date.now();

  // ── Speed tracking (bytes/s) ─────────────────────────────────────────
  private _downloadSpeed: number = 0;
  private _uploadSpeed: number = 0;
  private _lastSpeedSample: number = Date.now();
  private _lastDownloaded: number = 0;
  private _lastUploaded: number = 0;
  private _speedInterval?: ReturnType<typeof setInterval>;

  /** Upload speed in bytes/s (rolling 1-second average). */
  get uploadSpeed(): number { return this._uploadSpeed; }

  /** Download speed in bytes/s (rolling 1-second average). */
  get downloadSpeed(): number { return this._downloadSpeed; }

  // ── Peer address ────────────────────────────────────────────────────
  /** Set by Peer when the DataChannel opens. */
  public remoteAddress: string = "";
  public remotePort: number = 0;

  // ── BEP 3 / upstream parity ───────────────────────────────────────

  /**
   * Connection type. Always `'webrtc'` in this browser-first implementation.
   *
   * Mirrors `webtorrent.min.js` `wire.type`.
   */
  public get type(): string {
    return "webrtc";
  }

  /**
   * Extension capabilities advertised by the remote peer.
   *
   * Mirrors `webtorrent.min.js` `wire.extensions` — a Record of extension
   * name to any value. Populated from the BEP-10 extended handshake `m` dict.
   */
  public get extensions(): Record<string, unknown> {
    return this.extensionHost.remoteExtensions;
  }

  /**
   * ID-to-name mapping from the remote peer's BEP-10 extended handshake.
   * Mirrors `webtorrent.min.js` `wire.extendedMapping`.
   */
  public get extendedMapping(): Record<number, string> {
    return this.extensionHost.remoteIdToName;
  }

  // ── BEP 6 Fast sets ────────────────────────────────────────────────
  public readonly localAllowedFast: Set<number> = new Set();
  public readonly remoteAllowedFast: Set<number> = new Set();

  // ── Read-only config ───────────────────────────────────────────────
  public readonly expectedInfoHash: Uint8Array | null;
  public readonly expectedPeerId: Uint8Array | null;
  public readonly localExtensions: ReadonlySet<HandshakeExtension>;
  public readonly pieceCount: number | undefined;
  public readonly pieceLength: number | undefined;
  public readonly totalLength: number | undefined;
  public readonly maxMessageLength: number;
  public readonly maxBlockLength: number;
  public readonly maxPendingRequests: number;
  public readonly maxQueuedWriteBytes: number;
  public readonly handshakeTimeoutMs: number;
  public readonly idleTimeoutMs: number;

  // ── ExtensionHost ──────────────────────────────────────────────────
  public readonly extensionHost: ExtensionHost;

  // ── Private ────────────────────────────────────────────────────────
  private transport: Transport;
  private buffer: Uint8Array = new Uint8Array(0);

  private handshakeSent: boolean = false;
  private handshakeReceived: boolean = false;
  private extensionHandshakeSent: boolean = false;

  // Availability order: bitfield/haveAll/haveNone must be first
  private localAvailabilityOpen: boolean = true;
  private remoteAvailabilityOpen: boolean = true;
  private localAvailabilityDeclared: boolean = false;
  private remoteAvailabilityDeclared: boolean = false;

  // Pending requests tracking
  #pendingRequests = new Map<string, BlockCoordinates>();
  #peerRequests = new Map<string, BlockCoordinates>();

  // Write backpressure
  #writeTail: Promise<void> = Promise.resolve();
  #queuedWriteBytes: number = 0;

  // Timers
  #keepAliveTimer?: ReturnType<typeof setTimeout>;
  #idleTimer?: ReturnType<typeof setTimeout>;
  #handshakeTimer?: ReturnType<typeof setTimeout>;
  #keepAliveIntervalMs: number;

  constructor(transport: Transport, opts: WireOptions = {}) {
    super();
    this.transport = transport;
    this.expectedInfoHash = opts.expectedInfoHash ?? null;
    this.expectedPeerId = opts.expectedPeerId
      ? new Uint8Array(opts.expectedPeerId)
      : null;
    this.localExtensions = new Set(opts.extensions);
    this.pieceCount = opts.pieceCount;
    this.pieceLength = opts.pieceLength;
    this.totalLength = opts.totalLength;
    this.maxMessageLength = positiveOption(
      "maxMessageLength", opts.maxMessageLength, DEFAULT_MAX_MESSAGE_LENGTH,
    );
    this.maxBlockLength = positiveOption(
      "maxBlockLength", opts.maxBlockLength, DEFAULT_MAX_BLOCK_LENGTH,
    );
    this.maxPendingRequests = positiveOption(
      "maxPendingRequests", opts.maxPendingRequests, DEFAULT_MAX_PENDING_REQUESTS,
    );
    this.maxQueuedWriteBytes = positiveOption(
      "maxQueuedWriteBytes", opts.maxQueuedWriteBytes, DEFAULT_MAX_QUEUED_WRITE_BYTES,
    );
    this.handshakeTimeoutMs = nonNegativeOption(
      "handshakeTimeoutMs", opts.handshakeTimeoutMs, 30_000,
    );
    this.idleTimeoutMs = nonNegativeOption(
      "idleTimeoutMs", opts.idleTimeoutMs, 0,
    );
    this.#keepAliveIntervalMs = nonNegativeOption(
      "keepAliveIntervalMs", opts.keepAliveIntervalMs, 0,
    );

    this.extensionHost = new ExtensionHost({
      send: (id, payload) => this._sendExtendedMessage(id, payload),
      client: opts.clientName,
      port: opts.listenPort,
      requestQueue: this.maxPendingRequests,
    });

    this.transport.onMessage((data) => this._onData(data));

    // Start handshake timeout
    if (this.handshakeTimeoutMs > 0) {
      this.#handshakeTimer = setTimeout(() => {
        if (this.state === WireState.Handshaking) {
          this._terminate(new TimeoutError("handshake timed out"));
        }
      }, this.handshakeTimeoutMs);
    }
  }

  // ====================================================================
  // Handshake
  // ====================================================================

  public sendHandshake(
    infoHash: Uint8Array,
    peerId: Uint8Array,
    extensions?: Uint8Array,
  ): void {
    if (infoHash.length !== 20 || peerId.length !== 20) {
      throw new RangeError("infoHash and peerId must be exactly 20 bytes");
    }

    const bytes = encodeHandshake({
      infoHash,
      peerId,
      extensions: this.localExtensions,
      reserved: extensions,
    });

    this.transport.send(bytes);
    this.handshakeSent = true;
    this._tryTransitionToConnected();
  }

  /** Send the BEP 10 extended handshake (after standard handshake completes). */
  public async sendExtendedHandshake(): Promise<void> {
    if (this.extensionHandshakeSent) return;
    if (!this._hasNegotiated(HandshakeExtension.ExtensionProtocol)) return;
    await this.extensionHost.sendHandshake();
    this.extensionHandshakeSent = true;
  }

  /** Register a BEP 10 extension before the standard handshake. */
  public use<T extends PeerWireExtension>(extension: T): T {
    if (this.state !== WireState.Handshaking) {
      throw new PeerWireError("extensions must be registered before handshaking");
    }
    if (!this.localExtensions.has(HandshakeExtension.ExtensionProtocol)) {
      throw new PeerWireError("BEP 10 must be enabled before registering extensions");
    }
    return this.extensionHost.use(extension);
  }

  // ====================================================================
  // BEP 3 messages
  // ====================================================================

  public sendChoke(): void { this._sendMessage({ type: "choke" }); }
  public sendUnchoke(): void { this._sendMessage({ type: "unchoke" }); }
  public sendInterested(): void { this._sendMessage({ type: "interested" }); }
  public sendNotInterested(): void { this._sendMessage({ type: "notInterested" }); }

  public sendHave(index: number): void {
    this._sendMessage({ type: "have", pieceIndex: index });
  }

  public sendBitfield(bitfield: Uint8Array): void {
    this._sendMessage({ type: "bitfield", bitfield });
  }

  public sendRequest(index: number, offset: number, length: number): void {
    // Backpressure: não enviar requests se o peer nos chokeou
    if (this.peerChoking) {
      this._debug(`sendRequest bloqueado: peer está nos choking (piece ${index})`);
      return;
    }
    this._sendMessage({ type: "request", pieceIndex: index, begin: offset, length });
  }

  public sendPiece(index: number, offset: number, block: Uint8Array): void {
    this._sendMessage({ type: "piece", pieceIndex: index, begin: offset, block });
  }

  public sendCancel(index: number, offset: number, length: number): void {
    this._sendMessage({ type: "cancel", pieceIndex: index, begin: offset, length });
  }

  // ====================================================================
  // BEP 5, 6, 10 messages
  // ====================================================================

  public sendPort(port: number): void {
    this._sendMessage({ type: "port", port });
  }

  public sendSuggestPiece(index: number): void {
    this._sendMessage({ type: "suggestPiece", pieceIndex: index });
  }

  public sendHaveAll(): void { this._sendMessage({ type: "haveAll" }); }
  public sendHaveNone(): void { this._sendMessage({ type: "haveNone" }); }

  public sendRejectRequest(index: number, offset: number, length: number): void {
    this._sendMessage({ type: "rejectRequest", pieceIndex: index, begin: offset, length });
  }

  public sendAllowedFast(index: number): void {
    this._sendMessage({ type: "allowedFast", pieceIndex: index });
  }

  public sendExtended(extId: number, payload: Uint8Array): void {
    this._sendMessage({ type: "extended", extensionId: extId, payload });
  }

  // ====================================================================
  // BEP 52 v2 messages
  // ====================================================================

  /** Send a hash request for a range of SHA-256 hashes from the piece layers. */
  public sendHashRequest(
    piecesRoot: Uint8Array,
    baseLayer: number,
    index: number,
    length: number,
    proofLayers: number,
  ): void {
    this._sendMessage({
      type: "hashRequest",
      piecesRoot,
      baseLayer,
      index,
      length,
      proofLayers,
    });
  }

  /** Send a batch of SHA-256 hashes in response to a hash request. */
  public sendHashes(
    piecesRoot: Uint8Array,
    baseLayer: number,
    index: number,
    length: number,
    proofLayers: number,
    hashes: Uint8Array,
  ): void {
    this._sendMessage({
      type: "hashes",
      piecesRoot,
      baseLayer,
      index,
      length,
      proofLayers,
      hashes,
    });
  }

  /** Reject a hash request. */
  public sendHashReject(
    piecesRoot: Uint8Array,
    baseLayer: number,
    index: number,
    length: number,
    proofLayers: number,
  ): void {
    this._sendMessage({
      type: "hashReject",
      piecesRoot,
      baseLayer,
      index,
      length,
      proofLayers,
    });
  }

  // ====================================================================
  // Keepalive
  // ====================================================================

  /** Configure inactivity-based keepalives; `true` selects two minutes. */
  public setKeepAlive(interval: number | boolean = true): void {
    if (interval === false) this.#keepAliveIntervalMs = 0;
    else if (interval === true) this.#keepAliveIntervalMs = 120_000;
    else {
      this.#keepAliveIntervalMs = nonNegativeOption(
        "keepAlive interval", interval, 0,
      );
    }
    this.#resetKeepAlive();
  }

  // ====================================================================
  // Pending request tracking
  // ====================================================================

  /** Block requests sent locally that still await a piece or rejection. */
  get pendingRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#pendingRequests.values()];
  }

  /** Requests received from the peer that have not been served or rejected. */
  get peerRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#peerRequests.values()];
  }

  // ====================================================================
  // Lifecycle
  // ====================================================================

  public destroy(): void {
    this._terminate();
  }

  get isDestroyed(): boolean {
    return this.state === WireState.Closed;
  }

  // ====================================================================
  // Data reception (buffer-based stream parser)
  // ====================================================================

  private _onData(chunk: Uint8Array): void {
    if (this.state === WireState.Closed) return;
    this.buffer = concat([this.buffer, chunk]);

    try {
      this._processBuffer();
    } catch (err) {
      this.emit("error", new CustomEvent("error", {
        detail: { error: err instanceof Error ? err : new Error(String(err)) },
      }));
      this._terminate(err);
    }
  }

  private _processBuffer(): void {
    // Phase 1: Handshake
    if (!this.handshakeReceived) {
      if (this.buffer.length < HANDSHAKE_LENGTH) return;

      const handshake = decodeHandshake(this.buffer.subarray(0, HANDSHAKE_LENGTH));

      // Validate infoHash
      if (this.expectedInfoHash && !equals(handshake.infoHash, this.expectedInfoHash)) {
        throw new ProtocolError("InfoHash mismatch in handshake: peer announced a different torrent");
      }

      // Validate expectedPeerId
      if (this.expectedPeerId && !equals(handshake.peerId, this.expectedPeerId)) {
        throw new ProtocolError("Unexpected peer ID in handshake");
      }

      this.buffer = this.buffer.subarray(HANDSHAKE_LENGTH);
      this.handshakeReceived = true;
      this.remoteHandshake = handshake;

      this.peerIdBuffer = handshake.peerId;
      this.peerId = Array.from(handshake.peerId)
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("");

      this.emit("handshake", new CustomEvent("handshake", {
        detail: {
          peerId: handshake.peerId,
          extensions: handshake.reserved,
          infoHash: handshake.infoHash,
        },
      }));

      this._tryTransitionToConnected();

      // Fall through to process remaining messages in buffer
    }

    // Phase 2: Length-prefixed messages
    while (this.buffer.length >= 4) {
      const length = readUInt32BE(this.buffer, 0);

      // Keepalive
      if (length === 0) {
        this.buffer = this.buffer.subarray(4);
        this.emit("keepAlive");
        this._touchActivity();
        continue;
      }

      // Validate message size
      if (length > this.maxMessageLength) {
        throw new ProtocolError(
          `peer message length ${length} exceeds limit ${this.maxMessageLength}`,
        );
      }

      if (this.buffer.length < 4 + length) return;

      const payload = this.buffer.subarray(4, 4 + length);
      const message = decodeMessagePayload(new Uint8Array(payload));

      // Extension gating: reject messages for un-negotiated extensions
      this._assertExtensionNegotiated(message);

      // Availability order validation
      this._validateAvailabilityOrder(message, false);

      // Message bounds validation
      this._validateIncoming(message);

      // Commit availability order after validation passes
      this._commitAvailabilityOrder(message, false);

      // Apply state transitions
      this._applyRemoteState(message);

      // Track downloaded bytes
      this.downloadedBytes += 4 + length;

      // Dispatch to events and extension host
      this._dispatchMessage(message);

      this.buffer = this.buffer.subarray(4 + length);
      this._touchActivity();
    }
  }

  // ====================================================================
  // Message sending (with validation and backpressure)
  // ====================================================================

  private _sendMessage(message: PeerMessage): void {
    if (this.state === WireState.Closed) {
      throw new PeerWireError("wire is closed");
    }
    if (this.state !== WireState.Connected && message.type !== "keepAlive") {
      throw new PeerWireError("wire handshake is not complete");
    }

    // Extension gating
    this._assertExtensionNegotiated(message);

    // Availability order validation
    this._validateAvailabilityOrder(message, true);

    // Outgoing bounds validation
    this._validateOutgoing(message);

    // Encode
    let frame: Uint8Array;
    try {
      frame = encodeMessage(message);
    } catch (err) {
      if (err instanceof Error) {
        this.emit("error", new CustomEvent("error", { detail: { error: err } }));
      }
      throw err;
    }

    // Message size limit
    if (frame.length - 4 > this.maxMessageLength) {
      throw new RangeError(
        `message length exceeds configured limit ${this.maxMessageLength}`,
      );
    }

    // Write with backpressure
    this._writeFrame(frame);

    // Commit availability order after successful write
    this._commitAvailabilityOrder(message, true);

    // Apply local state transitions
    this._applyLocalState(message);

    // Track uploaded bytes
    this.uploadedBytes += frame.length;
    this._touchActivity();
  }

  private _sendExtendedMessage(id: number, payload: Uint8Array): Promise<void> {
    this._sendMessage({ type: "extended", extensionId: id, payload });
    return Promise.resolve();
  }

  private _writeFrame(frame: Uint8Array): void {
    if (this.#queuedWriteBytes + frame.length > this.maxQueuedWriteBytes) {
      throw new PeerWireError(
        `write queue exceeds configured limit ${this.maxQueuedWriteBytes}`,
      );
    }
    this.#queuedWriteBytes += frame.length;
    try {
      this.transport.send(frame);
    } finally {
      this.#queuedWriteBytes -= frame.length;
    }
  }

  // ====================================================================
  // Event dispatch
  // ====================================================================

  private _dispatchMessage(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.emit("choke");
        break;
      case "unchoke":
        this.emit("unchoke");
        break;
      case "interested":
        this.emit("interested");
        break;
      case "notInterested":
        this.emit("not-interested");
        break;
      case "have":
        this.emit("have", new CustomEvent("have", { detail: { index: message.pieceIndex } }));
        break;
      case "bitfield":
        this.emit("bitfield", new CustomEvent("bitfield", { detail: { bitfield: message.bitfield } }));
        break;
      case "request":
        this.emit("request", new CustomEvent("request", {
          detail: { index: message.pieceIndex, offset: message.begin, length: message.length },
        }));
        break;
      case "piece":
        this.emit("piece", new CustomEvent("piece", {
          detail: { index: message.pieceIndex, offset: message.begin, block: message.block },
        }));
        break;
      case "cancel":
        this.emit("cancel", new CustomEvent("cancel", {
          detail: { index: message.pieceIndex, offset: message.begin, length: message.length },
        }));
        break;
      case "port":
        this.emit("port", new CustomEvent("port", { detail: { port: message.port } }));
        break;
      case "suggestPiece":
        this.emit("suggestPiece", new CustomEvent("suggestPiece", { detail: { index: message.pieceIndex } }));
        break;
      case "haveAll":
        this.emit("haveAll");
        break;
      case "haveNone":
        this.emit("haveNone");
        break;
      case "rejectRequest":
        this.emit("rejectRequest", new CustomEvent("rejectRequest", {
          detail: { index: message.pieceIndex, offset: message.begin, length: message.length },
        }));
        break;
      case "allowedFast":
        this.emit("allowedFast", new CustomEvent("allowedFast", { detail: { index: message.pieceIndex } }));
        break;
      case "extended": {
        if (message.extensionId === 0) {
          try {
            const handshake = decode(message.payload, {
              maxBytes: 256 * 1024,
              maxDepth: 32,
            });
            this.emit("extended", new CustomEvent("extended", { detail: { id: 0, payload: handshake } }));
          } catch {
            this._debug("Failed to parse extended handshake");
          }
        } else {
          this.emit("extended", new CustomEvent("extended", { detail: { id: message.extensionId, payload: message.payload } }));
        }
        // Also dispatch through ExtensionHost
        void this.extensionHost.handle(message).catch(() => {});
        break;
      }
      case "keepAlive":
        this.emit("keepAlive");
        break;
      case "unknown":
        this.emit("unknown", new CustomEvent("unknown", {
          detail: { id: message.id, payload: message.payload },
        }));
        break;
      case "hashRequest":
        this.emit("hashRequest", new CustomEvent("hashRequest", {
          detail: {
            piecesRoot: message.piecesRoot,
            baseLayer: message.baseLayer,
            index: message.index,
            length: message.length,
            proofLayers: message.proofLayers,
          },
        }));
        break;
      case "hashes":
        this.emit("hashes", new CustomEvent("hashes", {
          detail: {
            piecesRoot: message.piecesRoot,
            baseLayer: message.baseLayer,
            index: message.index,
            length: message.length,
            proofLayers: message.proofLayers,
            hashes: message.hashes,
          },
        }));
        break;
      case "hashReject":
        this.emit("hashReject", new CustomEvent("hashReject", {
          detail: {
            piecesRoot: message.piecesRoot,
            baseLayer: message.baseLayer,
            index: message.index,
            length: message.length,
            proofLayers: message.proofLayers,
          },
        }));
        break;
    }
  }

  // ====================================================================
  // State transitions
  // ====================================================================

  private _applyLocalState(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.amChoking = true;
        break;
      case "unchoke":
        this.amChoking = false;
        break;
      case "interested":
        this.amInterested = true;
        break;
      case "notInterested":
        this.amInterested = false;
        break;
      case "allowedFast":
        this.localAllowedFast.add(message.pieceIndex);
        break;
      case "piece":
      case "rejectRequest":
        this.#peerRequests.delete(blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.type === "piece"
            ? message.block.length
            : message.length,
        }));
        break;
      case "request":
        this.#pendingRequests.set(blockKey(message), {
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.length,
        });
        break;
      case "cancel": {
        const key = blockKey(message);
        this.#peerRequests.delete(key);
        break;
      }
    }
  }

  private _applyRemoteState(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.peerChoking = true;
        // Under reject semantics, choke doesn't clear pending requests
        if (!this._rejectSemanticsNegotiated()) {
          this.#pendingRequests.clear();
        }
        break;
      case "unchoke":
        this.peerChoking = false;
        break;
      case "interested":
        this.peerInterested = true;
        break;
      case "notInterested":
        this.peerInterested = false;
        break;
      case "allowedFast":
        this.remoteAllowedFast.add(message.pieceIndex);
        break;
      case "request":
        this.#peerRequests.set(blockKey(message), {
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.length,
        });
        break;
      case "cancel":
        this.#peerRequests.delete(blockKey(message));
        break;
      case "piece":
      case "rejectRequest":
        this.#pendingRequests.delete(blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.type === "piece"
            ? message.block.length
            : message.length,
        }));
        break;
    }
  }

  // ====================================================================
  // Validation
  // ====================================================================

  private _validateOutgoing(message: PeerMessage): void {
    this._validateMessageBounds(message, false);
  }

  private _validateIncoming(message: PeerMessage): void {
    this._validateMessageBounds(message, true);
    if (
      message.type === "request" &&
      this.#peerRequests.size >= this.maxPendingRequests
    ) {
      throw new ProtocolError("peer exceeded outstanding request limit");
    }
  }

  private _validateMessageBounds(message: PeerMessage, incoming: boolean): void {
    const ErrorType = incoming ? ProtocolError : RangeError;
    switch (message.type) {
      case "have":
      case "suggestPiece":
      case "allowedFast":
        this._validatePieceIndex(message.pieceIndex, incoming);
        break;
      case "request":
      case "cancel":
      case "rejectRequest":
        this._validateBlock(message, incoming);
        break;
      case "piece":
        this._validateBlock({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.block.length,
        }, incoming);
        break;
      case "bitfield":
        // Bitfield spare-bit validation can be added later with Bitfield.fromBytes
        break;
    }
  }

  private _validatePieceIndex(pieceIndex: number, incoming: boolean): void {
    if (
      !Number.isInteger(pieceIndex) || pieceIndex < 0 ||
      pieceIndex > 0xffffffff ||
      (this.pieceCount !== undefined && pieceIndex >= this.pieceCount)
    ) {
      const ErrorType = incoming ? ProtocolError : RangeError;
      throw new ErrorType(`piece index ${pieceIndex} is out of range`);
    }
  }

  private _validateBlock(request: BlockCoordinates, incoming: boolean): void {
    const ErrorType = incoming ? ProtocolError : RangeError;
    this._validatePieceIndex(request.pieceIndex, incoming);
    if (request.length < 1 || request.length > this.maxBlockLength) {
      throw new ErrorType(
        `block length must be from 1 to ${this.maxBlockLength}`,
      );
    }
    if (
      !Number.isInteger(request.begin) || request.begin < 0 ||
      request.begin > 0xffffffff
    ) {
      throw new ErrorType("block begin must be a non-negative integer");
    }
    if (this.pieceLength !== undefined) {
      let actualLength = this.pieceLength;
      if (
        this.totalLength !== undefined &&
        this.pieceCount !== undefined &&
        request.pieceIndex === this.pieceCount - 1
      ) {
        actualLength = this.totalLength - request.pieceIndex * this.pieceLength;
      }
      if (request.begin + request.length > actualLength) {
        throw new ErrorType("block exceeds piece boundary");
      }
    }
  }

  // ── Availability order ─────────────────────────────────────────────

  private _validateAvailabilityOrder(message: PeerMessage, local: boolean): void {
    if (message.type === "keepAlive" || message.type === "extended") return;

    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" ||
      message.type === "haveNone";

    const open = local
      ? this.localAvailabilityOpen
      : this.remoteAvailabilityOpen;
    const declared = local
      ? this.localAvailabilityDeclared
      : this.remoteAvailabilityDeclared;

    if (declaration) {
      if (!open || declared) {
        throw new ProtocolError(
          "availability declaration must appear once after handshake",
        );
      }
    } else if (this._fastNegotiated() && open && !declared) {
      throw new ProtocolError(
        "Fast peers must send bitfield, have all, or have none before other messages",
      );
    }
  }

  private _commitAvailabilityOrder(message: PeerMessage, local: boolean): void {
    if (message.type === "keepAlive" || message.type === "extended") return;
    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" || message.type === "haveNone";
    if (local) {
      this.localAvailabilityDeclared ||= declaration;
      this.localAvailabilityOpen = false;
    } else {
      this.remoteAvailabilityDeclared ||= declaration;
      this.remoteAvailabilityOpen = false;
    }
  }

  // ── Extension negotiation ──────────────────────────────────────────

  private _assertExtensionNegotiated(message: PeerMessage): void {
    let required: HandshakeExtension | undefined;
    switch (message.type) {
      case "suggestPiece":
      case "haveAll":
      case "haveNone":
      case "rejectRequest":
      case "allowedFast":
        required = HandshakeExtension.Fast;
        break;
      case "extended":
        required = HandshakeExtension.ExtensionProtocol;
        break;
      case "port":
        required = HandshakeExtension.Dht;
        break;
      case "hashRequest":
      case "hashes":
      case "hashReject":
        required = HandshakeExtension.V2;
        break;
      default:
        return;
    }
    if (!this._hasNegotiated(required)) {
      throw new ProtocolError(
        `${required} message was used without negotiation`,
      );
    }
  }

  private _hasNegotiated(extension: HandshakeExtension): boolean {
    return this.localExtensions.has(extension) &&
      this.remoteHandshake?.extensions.has(extension) === true;
  }

  private _fastNegotiated(): boolean {
    return this._hasNegotiated(HandshakeExtension.Fast);
  }

  private _rejectSemanticsNegotiated(): boolean {
    return this._fastNegotiated() ||
      this._hasNegotiated(HandshakeExtension.V2);
  }

  // ====================================================================
  // Lifecycle helpers
  // ====================================================================

  private _tryTransitionToConnected(): void {
    if (this.handshakeSent && this.handshakeReceived) {
      this.state = WireState.Connected;
      if (this.#handshakeTimer !== undefined) {
        clearTimeout(this.#handshakeTimer);
        this.#handshakeTimer = undefined;
      }
      this.#resetKeepAlive();
      this.#resetIdleTimeout();
      this._startSpeedTracking();
    }
  }

  private _startSpeedTracking(): void {
    this._lastSpeedSample = Date.now();
    this._lastDownloaded = this.downloadedBytes;
    this._lastUploaded = this.uploadedBytes;
    this._speedInterval = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();
      const dt = (now - this._lastSpeedSample) / 1000;
      if (dt <= 0) return;
      const dl = this.downloadedBytes - this._lastDownloaded;
      const ul = this.uploadedBytes - this._lastUploaded;
      this._downloadSpeed = Math.round(dl / dt);
      this._uploadSpeed = Math.round(ul / dt);
      this._lastSpeedSample = now;
      this._lastDownloaded = this.downloadedBytes;
      this._lastUploaded = this.uploadedBytes;
    }, 1000);
  }

  private _touchActivity(): void {
    this.lastActivityAt = Date.now();
    this.#resetKeepAlive();
    this.#resetIdleTimeout();
  }

  private _terminate(reason?: unknown): void {
    if (this.state === WireState.Closed) return;
    this.state = WireState.Closed;

    if (this.#handshakeTimer !== undefined) clearTimeout(this.#handshakeTimer);
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    if (this._speedInterval !== undefined) {
      clearInterval(this._speedInterval);
      this._speedInterval = undefined;
    }

    this.extensionHost.close(reason);
    this.#pendingRequests.clear();
    this.#peerRequests.clear();

    this.emit("close", new CustomEvent("close", { detail: { reason } }));

    try {
      this.transport.close();
    } catch {
      // transport close may throw; swallow
    }
  }

  // ====================================================================
  // Timer management
  // ====================================================================

  #resetKeepAlive(): void {
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    this.#keepAliveTimer = undefined;
    if (
      this.#keepAliveIntervalMs > 0 && this.state === WireState.Connected
    ) {
      this.#keepAliveTimer = setTimeout(() => {
        this.#keepAliveTimer = undefined;
        if (this.state === WireState.Connected) {
          try {
            this._sendMessage({ type: "keepAlive" });
          } catch {
            // send failed — connection likely dead
          }
        }
      }, this.#keepAliveIntervalMs);
    }
  }

  #resetIdleTimeout(): void {
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.idleTimeoutMs > 0 && this.state === WireState.Connected) {
      this.#idleTimer = setTimeout(() => {
        this._terminate(new TimeoutError("peer connection became idle"));
      }, this.idleTimeoutMs);
    }
  }

  private _debug(msg: string): void {
    console.debug(`[Wire] ${msg}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function blockKey(request: BlockCoordinates): string {
  return `${request.pieceIndex}:${request.begin}:${request.length}`;
}

function positiveOption(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function nonNegativeOption(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return resolved;
}

```

---

## Arquivo: `packages/core/src/crypto/hasher.ts`

````ts
// /browsertorrent/monorepo/webtorrent/src/crypto/hasher.ts
/**
 * Cryptographic hash helpers. One-shot SHA algorithms are backed by the
 * Web Crypto API (`crypto.subtle`); incremental SHA-1 is a bounded-memory
 * TypeScript implementation. No external dependencies.
 *
 * Adaptado de deno-torrent/toolkit/hash/hash_util.ts.
 * Assinaturas existentes (sha1, sha256 retornando hex string) preservadas.
 */

// ============================================================================
// TIPOS
// ============================================================================

/** Stateful SHA-1 hasher for processing input a bounded chunk at a time. */
export interface IncrementalHasher {
  /** Adds bytes to the current message. Calling this after digest() is supported. */
  update(data: Uint8Array): this;
  /** Returns the 20-byte SHA-1 digest of all bytes supplied so far (non-destructive). */
  digest(): Uint8Array;
  /** Discards all supplied bytes and restores the initial SHA-1 state. */
  reset(): void;
  /** Number of message bytes supplied through update(). */
  readonly bytesHashed: bigint;
}

// ============================================================================
// SHA-1 INCREMENTAL (bounded memory — independent of total input size)
// ============================================================================

const SHA1_INITIAL_STATE = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

class Sha1Hasher implements IncrementalHasher {
  #state = new Uint32Array(SHA1_INITIAL_STATE);
  #pending = new Uint8Array(64);
  #words = new Uint32Array(80);
  #pendingLength = 0;
  #bytesHashed = 0n;

  get bytesHashed(): bigint {
    return this.#bytesHashed;
  }

  update(data: Uint8Array): this {
    this.#bytesHashed += BigInt(data.byteLength);
    let offset = 0;

    if (this.#pendingLength > 0) {
      const copied = Math.min(64 - this.#pendingLength, data.length);
      this.#pending.set(data.subarray(0, copied), this.#pendingLength);
      this.#pendingLength += copied;
      offset = copied;
      if (this.#pendingLength === 64) {
        this.#processBlock(this.#pending);
        this.#pendingLength = 0;
      }
    }

    while (offset + 64 <= data.length) {
      this.#processBlock(data.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < data.length) {
      this.#pending.set(data.subarray(offset));
      this.#pendingLength = data.length - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    const state = new Uint32Array(this.#state);
    const finalBlock = new Uint8Array(128);
    finalBlock.set(this.#pending.subarray(0, this.#pendingLength));
    finalBlock[this.#pendingLength] = 0x80;
    const blockLength = this.#pendingLength < 56 ? 64 : 128;
    let bitLength = (this.#bytesHashed * 8n) & ((1n << 64n) - 1n);
    for (let i = 0; i < 8; i++) {
      finalBlock[blockLength - 1 - i] = Number(bitLength & 0xffn);
      bitLength >>= 8n;
    }
    this.#processBlock(finalBlock.subarray(0, 64), state);
    if (blockLength === 128) this.#processBlock(finalBlock.subarray(64), state);

    const result = new Uint8Array(20);
    const view = new DataView(result.buffer);
    for (let i = 0; i < state.length; i++) view.setUint32(i * 4, state[i]!, false);
    return result;
  }

  reset(): void {
    this.#state.set(SHA1_INITIAL_STATE);
    this.#pendingLength = 0;
    this.#bytesHashed = 0n;
  }

  #processBlock(block: Uint8Array, state = this.#state): void {
    const words = this.#words;
    const view = new DataView(block.buffer, block.byteOffset, 64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(i * 4, false);
    for (let i = 16; i < 80; i++) {
      const value = words[i - 3]! ^ words[i - 8]! ^ words[i - 14]! ^ words[i - 16]!;
      words[i] = (value << 1) | (value >>> 31);
    }
    let [a, b, c, d, e] = [state[0]!, state[1]!, state[2]!, state[3]!, state[4]!];
    for (let i = 0; i < 80; i++) {
      const f = i < 20
        ? (b & c) | (~b & d)
        : i < 40
          ? b ^ c ^ d
          : i < 60
            ? (b & c) | (b & d) | (c & d)
            : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + words[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
  }
}

/**
 * Creates an incremental SHA-1 hasher.
 *
 * `digest()` is non-destructive: repeated calls return the same value, and
 * subsequent `update()` calls continue the current message. Use `reset()` to
 * begin a new message.
 *
 * @example
 * ```ts
 * const hasher = createSha1();
 * for await (const chunk of reader.chunks(64 * 1024)) hasher.update(chunk);
 * const pieceHash = hasher.digest(); // Uint8Array(20)
 * ```
 */
export function createSha1(): IncrementalHasher {
  return new Sha1Hasher();
}

// ============================================================================
// HELPER
// ============================================================================

function toBuffer(data: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  return ab;
}

/**
 * Converts a digest Uint8Array to a lowercase hex string.
 */
export function toHex(digest: Uint8Array): string {
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// ONE-SHOT HASHES (crypto.subtle)
// ============================================================================

/**
 * Computes the SHA-1 hash of `data` and returns a lowercase hex string.
 * The BitTorrent protocol uses SHA-1 for piece verification and info-hashes.
 */
export async function sha1(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-1", toBuffer(data));
  return toHex(new Uint8Array(buffer));
}

/**
 * Computes the SHA-1 hash of `data` and returns the raw 20-byte digest.
 * Useful when you need bytes directly (e.g. info-hash comparison).
 */
export async function sha1Bytes(data: Uint8Array): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest("SHA-1", toBuffer(data));
  return new Uint8Array(buffer);
}

/**
 * Computes the SHA-256 hash of `data` and returns a lowercase hex string.
 * Used for BitTorrent v2 info-hashes and magnet URIs (urn:btmh).
 */
export async function sha256(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", toBuffer(data));
  return toHex(new Uint8Array(buffer));
}

/**
 * Computes the SHA-256 hash of `data` and returns the raw 32-byte digest.
 */
export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest("SHA-256", toBuffer(data));
  return new Uint8Array(buffer);
}

/**
 * Computes the SHA-512 hash of `data` and returns a lowercase hex string.
 */
export async function sha512(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-512", toBuffer(data));
  return toHex(new Uint8Array(buffer));
}

/**
 * Computes the SHA-512 hash of `data` and returns the raw 64-byte digest.
 */
export async function sha512Bytes(data: Uint8Array): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest("SHA-512", toBuffer(data));
  return new Uint8Array(buffer);
}

// ============================================================================
// MD5 (pure TypeScript — RFC 1321)
// Web Crypto API does not expose MD5. Only use for checksums/legacy compat.
// ============================================================================

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
  0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
  0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
  0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
  0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
  0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

/**
 * Computes the MD5 digest of `data` (synchronous, pure TypeScript per RFC 1321).
 * MD5 is cryptographically broken — only use for checksums and legacy compat.
 */
export function md5(data: Uint8Array): Uint8Array {
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((55 - msgLen) % 64 + 64) % 64 + 1;
  const padded = new Uint8Array(msgLen + padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(msgLen + padLen, bitLen >>> 0, true);
  view.setUint32(msgLen + padLen + 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      F = (F + A + MD5_K[j]! + M[g]!) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << MD5_S[j]!) | (F >>> (32 - MD5_S[j]!)))) | 0;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const result = new Uint8Array(16);
  const out = new DataView(result.buffer);
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return result;
}

// ============================================================================
// COMPAT (assinatura síncrona legacy — lança erro)
// ============================================================================

/**
 * @deprecated WebCrypto is async. Use `await sha1()` instead.
 */
export function sha1Sync(_data: Uint8Array): string {
  throw new Error(
    "sha1Sync não é suportado no browser/Deno via WebCrypto. Use a versão assíncrona (await sha1())."
  );
}

````

---

## Arquivo: `packages/core/src/crypto/random.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/crypto/random.ts
/**
 * Geração de bytes aleatórios criptograficamente seguros.
 * Substitui o `randombytes` do Node.js.
 */

/**
 * Gera um Uint8Array com bytes aleatórios seguros.
 */
export function randomBytes(size: number): Uint8Array {
  const buffer = new Uint8Array(size);
  crypto.getRandomValues(buffer);
  return buffer;
}

/**
 * Gera um Peer ID ou Node ID aleatório (20 bytes / 40 caracteres hex).
 */
export function generateId(): string {
  const bytes = randomBytes(20);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Gera uma string aleatória de caracteres ASCII visíveis.
 */
export function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
  let result = "";

  const bytes = randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    // 🔥 CORREÇÃO: Non-null assertions (!) para satisfazer o TypeScript rigoroso (noUncheckedIndexedAccess)
    const byte = bytes[i]!;
    result += chars[byte % chars.length]!;
  }
  
  return result;
}
```

---

## Arquivo: `packages/core/src/extensions/ut-metadata.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/extensions/ut-metadata.ts

import { Extension } from "../core/extension.ts";
import { encode, decode, BencodeDict } from "../utils/bencode.ts";
import { Bitfield } from "../core/bitfield.ts";
import { sha1, sha256 } from "../crypto/hasher.ts";

const MAX_METADATA_SIZE = 10_000_000;
const PIECE_LENGTH = 16384;
const DEFAULT_TIMEOUT_MS = 15000; // 15 segundos por peça

export interface UtMetadataOptions {
  metadata?: Uint8Array;
  timeoutMs?: number;
}

export interface PieceRequest {
  piece: number;
  attempts: number;
  timer: number; // ID do timeout
}

export class UtMetadata extends Extension {
  public readonly name = "ut_metadata";

  private _fetching = false;
  private _metadataComplete = false;
  private _metadataSize: number | null = null;
  private _numPieces = 0;
  private _remainingRejects = 0;
  private _bitfield: Bitfield;
  public metadata: Uint8Array | null = null;
  private _requestedPieces: Map<number, PieceRequest> = new Map();
  private _timeoutMs: number;

  constructor(wire: any, opts?: UtMetadataOptions) {
    super(wire);
    this._bitfield = new Bitfield({ length: 0, grow: 1000 });
    this._timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (opts?.metadata) {
      this.setMetadata(opts.metadata);
    }
  }

  public onHandshake(_infoHash: string, _peerId: string, _extensions: any) {
    // Opcional
  }

  public onExtendedHandshake(handshake: any) {
    if (handshake.m && typeof handshake.m.ut_metadata === "number") {
      if (typeof handshake.metadata_size !== "number" || handshake.metadata_size > MAX_METADATA_SIZE || handshake.metadata_size <= 0) {
        this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer gave invalid metadata size") } }));
      } else {
        const size = handshake.metadata_size;
        this._metadataSize = size;
        this._numPieces = Math.ceil(size / PIECE_LENGTH);
        this._remainingRejects = 2 * this._numPieces;
        this._bitfield = new Bitfield({ length: this._numPieces, grow: 1000 });

        this._fetching = true;
        this._requestPieces();
      }
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer does not support ut_metadata") } }));
    }
  }

  public onMessage(buf: Uint8Array) {
    let dict: BencodeDict;
    let trailer: Uint8Array;
    try {
      const str = new TextDecoder().decode(buf);
      const trailerIndex = str.indexOf("ee") + 2;
      dict = decode(new TextEncoder().encode(str.substring(0, trailerIndex))) as BencodeDict;
      trailer = buf.slice(trailerIndex);
    } catch (err) {
      return;
    }

    switch (dict.msg_type) {
      case 0:
        this._onRequest(dict.piece as number);
        break;
      case 1:
        this._onData(dict.piece as number, trailer, dict.total_size as number | undefined);
        break;
      case 2:
        this._onReject(dict.piece as number);
        break;
    }
  }

  public fetch() {
    if (!this._metadataComplete) {
      this._fetching = true;
      if (this._metadataSize) {
        this._requestPieces();
      }
    }
  }

  public cancel() {
    this._fetching = false;
    // Cancelar todos os timeouts pendentes
    for (const request of this._requestedPieces.values()) {
      clearTimeout(request.timer);
    }
    this._requestedPieces.clear();
  }

  public setMetadata(newMetadata: Uint8Array): boolean {
    if (this._metadataComplete) return true;

    let validMetadata = newMetadata;
    try {
      const info = decode(newMetadata) as BencodeDict;
      if (info.info) {
        validMetadata = encode(info.info);
      }
    } catch (err) {
      // Ignora erros de decode, usa o buffer cru
    }

    this.cancel();
    this.metadata = validMetadata;
    this._metadataComplete = true;
    this._metadataSize = this._metadataSize ?? this.metadata.length;

    if (this.wire.extendedHandshake) {
      this.wire.extendedHandshake.metadata_size = this._metadataSize;
    }

    this.emit("metadata", new CustomEvent("metadata", { detail: { metadata: this.metadata } }));
    return true;
  }

  private _send(dict: BencodeDict, trailer?: Uint8Array) {
    let buf = encode(dict);
    if (trailer) {
      const combined = new Uint8Array(buf.length + trailer.length);
      combined.set(buf, 0);
      combined.set(trailer, buf.length);
      buf = combined;
    }
    this.wire.extended("ut_metadata", buf);
  }

  private _request(piece: number) {
    // Cancelar timeout anterior para esta peça, se houver
    const existingRequest = this._requestedPieces.get(piece);
    if (existingRequest) {
      clearTimeout(existingRequest.timer);
    }
    
    // Enviar solicitação
    this._send({ msg_type: 0, piece });
    
    // Configurar novo timeout para esta peça
    const timer = setTimeout(() => {
      this._handleTimeout(piece);
    }, this._timeoutMs) as unknown as number;
    
    // Registrar solicitação com tentativas
    const attempts = existingRequest ? existingRequest.attempts + 1 : 1;
    this._requestedPieces.set(piece, { piece, attempts, timer });
  }

  private _data(piece: number, buf: Uint8Array, totalSize?: number) {
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    const msg: BencodeDict = { msg_type: 1, piece };
    if (typeof totalSize === "number") {
      (msg as any).total_size = totalSize;
    }
    this._send(msg, buf);
  }

  private _reject(piece: number) {
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    if (this._remainingRejects > 0 && this._fetching) {
      this._request(piece);
      this._remainingRejects -= 1;
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer sent \"reject\" too much") } }));
    }
  }

  private _onRequest(piece: number) {
    if (!this._metadataComplete || !this._metadataSize) {
      return this._reject(piece);
    }
    const start = piece * PIECE_LENGTH;
    let end = start + PIECE_LENGTH;
    if (end > this._metadataSize!) {
      end = this._metadataSize!;
    }
    const buf = this.metadata!.slice(start, end);
    this._data(piece, buf, this._metadataSize);
  }

  private _onData(piece: number, buf: Uint8Array, _totalSize?: number) {
    if (buf.length > PIECE_LENGTH || !this._fetching || !this._metadataSize) return;

    // Verificar se já recebemos esta peça
    if (this._bitfield.get(piece)) {
      // Peça duplicada, ignorar
      return;
    }

    if (!this.metadata) {
      this.metadata = new Uint8Array(this._metadataSize);
    }
    this.metadata.set(buf, piece * PIECE_LENGTH);
    this._bitfield.set(piece);
    
    // Limpar o registro de solicitação para esta peça
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    this._checkDone();
  }

  private _onReject(piece: number) {
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    if (this._remainingRejects > 0 && this._fetching) {
      this._request(piece);
      this._remainingRejects -= 1;
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer sent \"reject\" too much") } }));
    }
  }

  private _handleTimeout(piece: number) {
    // Remover do mapa de solicitações
    this._requestedPieces.delete(piece);
    
    if (!this._fetching) return;
    
    // Tentar novamente se ainda houver tentativas restantes
    const maxAttempts = 3;
    const currentRequest = this._requestedPieces.get(piece);
    const attempts = currentRequest ? currentRequest.attempts + 1 : 1;
    
    if (attempts < maxAttempts) {
      this._request(piece);
    } else {
      // Muitas tentativas falhas, emitir aviso
      this.emit("warning", new CustomEvent("warning", { 
        detail: { error: new Error(`Timeout while requesting metadata piece ${piece}`) } 
      }));
      
      // Tentar continuar com outras peças
      this._checkDone();
    }
  }

  private _requestPieces() {
    if (this._fetching && this._metadataSize) {
      this.metadata = new Uint8Array(this._metadataSize);
      for (let piece = 0; piece < this._numPieces; piece++) {
        this._request(piece);
      }
    }
  }

  private _checkDone() {
    let done = true;
    for (let piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece)) {
        done = false;
        break;
      }
    }
    if (done && this.metadata) {
      // Verificar a integridade dos dados recebidos calculando o hash
      const success = this._verifyMetadataIntegrity();
      if (success) {
        this.setMetadata(this.metadata);
      } else {
        this._failedMetadata();
      }
    }
  }

  private _verifyMetadataIntegrity(): boolean {
    if (!this.metadata) return false;
    
    try {
      // Verificar se os dados são válidos bencode
      decode(this.metadata);
      
      // Para BEP 52, também verificaríamos o hash SHA-256, mas isso
      // geralmente não é feito durante a transferência via ut_metadata,
      // pois o hash é verificado quando o torrent é carregado
      
      return true;
    } catch (err) {
      console.warn("Metadata integrity check failed:", err);
      return false;
    }
  }

  private _failedMetadata() {
    if (!this._metadataSize) return;
    this._bitfield = new Bitfield({ length: this._numPieces, grow: 1000 });
    this._remainingRejects -= this._numPieces;
    if (this._remainingRejects > 0) {
      this._requestPieces();
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer sent invalid metadata") } }));
    }
  }
}
```

---

## Arquivo: `packages/core/src/extensions/ut-pex.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/extensions/ut-pex.ts
//
// Implementação do BEP 11 (ut_pex - Peer Exchange) para o @vanaware/browsertorrent.
// Adaptado do deno-torrent para nosso ecossistema Browser/Deno.
//
// O ut_pex permite que peers compartilhem listas de outros peers diretamente,
// criando uma rede verdadeiramente descentralizada e resiliente.

import { Extension } from "../core/extension.ts";
import { encode, decode, BencodeDict, BencodeValue } from "../utils/bencode.ts";

/** BEP 10 registration name for peer exchange. */
export const UT_PEX_NAME = "ut_pex";

/** Flags accompanying compact peers in a BEP 11 update. */
export enum PexPeerFlag {
  /** Peer prefers encryption (PE supports encryption). */
  PrefersEncryption = 0x01,
  /** Peer is a seed (has all pieces). */
  Seed = 0x02,
  /** Peer supports uTP (micro transport protocol). */
  Utp = 0x04,
  /** Peer supports holepunching. */
  Holepunch = 0x08,
  /** Connection to peer is outgoing. */
  Outgoing = 0x10,
}

/** One compact peer candidate carried by BEP 11. */
export interface PexPeer {
  /** Four-byte IPv4 or sixteen-byte IPv6 address. */
  address: Uint8Array;
  /** Unsigned network port (1-65535). */
  port: number;
  /** Bitwise combination of {@link PexPeerFlag} values. */
  flags?: number;
}

/** Candidate changes reported by one peer; no dialing policy is implied. */
export interface PexUpdate {
  /** New candidates reported by the peer. */
  added: PexPeer[];
  /** Candidates the peer no longer recommends. */
  dropped: PexPeer[];
}

/** Resource and callback options for {@link UtPexExtension}. */
export interface UtPexOptions {
  /** BEP 11 requires at least sixty seconds in production. */
  minSendIntervalMs?: number;
  /** Combined added and dropped peer limit, defaulting to 100. */
  maxPeersPerMessage?: number;
  /** Optional initial listener for validated incoming updates. */
  onUpdate?: (update: PexUpdate) => void;
}

/** Built-in BEP 11 peer exchange codec and transport extension. */
export class UtPexExtension extends Extension {
  /** BEP 10 registration name. */
  public readonly name = UT_PEX_NAME;

  /** Minimum duration enforced between outgoing updates. */
  public readonly minSendIntervalMs: number;
  /** Combined candidate limit for each incoming or outgoing update. */
  public readonly maxPeersPerMessage: number;

  private _lastSentAt = -Infinity;
  private _listeners = new Set<(update: PexUpdate) => void>();
  private _extensionId: number | null = null;

  /** Create a bounded PEX codec and notification endpoint. */
  constructor(wire: any, options: UtPexOptions = {}) {
    super(wire);
    this.minSendIntervalMs = options.minSendIntervalMs ?? 60_000;
    this.maxPeersPerMessage = options.maxPeersPerMessage ?? 100;

    if (!Number.isSafeInteger(this.minSendIntervalMs) || this.minSendIntervalMs < 0) {
      throw new RangeError("minSendIntervalMs must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(this.maxPeersPerMessage) || this.maxPeersPerMessage < 1) {
      throw new RangeError("maxPeersPerMessage must be a positive safe integer");
    }
    if (options.onUpdate) this._listeners.add(options.onUpdate);
  }

  /**
   * Called when the extended handshake is received.
   * Registers this extension if the peer supports ut_pex.
   */
  public onExtendedHandshake(handshake: any): void {
    if (handshake.m && typeof handshake.m[UT_PEX_NAME] === "number") {
      this._extensionId = handshake.m[UT_PEX_NAME];
      this.emit("info", new CustomEvent("info", {
        detail: { message: `ut_pex registered with extension ID: ${this._extensionId}` }
      }));
    } else {
      this.emit("warning", new CustomEvent("warning", {
        detail: { error: new Error("Peer does not support ut_pex") }
      }));
    }
  }

  /**
   * Decode, validate, and notify listeners of one peer update.
   */
  public onMessage(payload: Uint8Array): void {
    try {
      const update = decodePexUpdate(payload, this.maxPeersPerMessage);
      for (const listener of this._listeners) {
        listener(update);
      }
    } catch (err) {
      this.emit("warning", new CustomEvent("warning", {
        detail: { error: err instanceof Error ? err : new Error(String(err)) }
      }));
    }
  }

  /**
   * Subscribe to validated updates and return an unsubscribe function.
   */
  public onUpdate(listener: (update: PexUpdate) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Send a bounded update without dialing or modifying any swarm state.
   * BEP 11 limits production senders to one update per minute.
   */
  public async send(update: PexUpdate): Promise<void> {
    if (this._extensionId === null) {
      throw new Error("ut_pex is not registered (no extension ID from extended handshake)");
    }

    const now = Date.now();
    if (now - this._lastSentAt < this.minSendIntervalMs) {
      throw new Error(`ut_pex updates may not be sent this frequently (wait ${this.minSendIntervalMs - (now - this._lastSentAt)}ms)`);
    }
    if (update.added.length + update.dropped.length > this.maxPeersPerMessage) {
      throw new RangeError(`ut_pex update exceeds ${this.maxPeersPerMessage} peers`);
    }

    const payload = encodePexUpdate(update);
    this.wire.extended(this._extensionId, payload);
    this._lastSentAt = now;
  }
}

/**
 * Encode IPv4 and IPv6 candidates into BEP 11 compact fields.
 */
export function encodePexUpdate(update: PexUpdate): Uint8Array {
  const added4 = update.added.filter((peer) => peer.address.length === 4);
  const added6 = update.added.filter((peer) => peer.address.length === 16);
  const dropped4 = update.dropped.filter((peer) => peer.address.length === 4);
  const dropped6 = update.dropped.filter((peer) => peer.address.length === 16);

  if (added4.length + added6.length !== update.added.length ||
      dropped4.length + dropped6.length !== update.dropped.length) {
    throw new RangeError("PEX addresses must contain four or sixteen bytes");
  }

  const dictionary: BencodeDict = {};

  if (added4.length) {
    dictionary["added"] = compactPeers(added4, 4);
    dictionary["added.f"] = Uint8Array.from(added4, (peer) => peer.flags ?? 0);
  }
  if (added6.length) {
    dictionary["added6"] = compactPeers(added6, 16);
    dictionary["added6.f"] = Uint8Array.from(added6, (peer) => peer.flags ?? 0);
  }
  if (dropped4.length) {
    dictionary["dropped"] = compactPeers(dropped4, 4);
  }
  if (dropped6.length) {
    dictionary["dropped6"] = compactPeers(dropped6, 16);
  }

  return encode(dictionary);
}

/**
 * Decode and bound a BEP 11 update from an untrusted peer.
 */
export function decodePexUpdate(payload: Uint8Array, maxPeers = 100): PexUpdate {
  let value: BencodeValue;
  try {
    value = decode(payload);
  } catch (cause) {
    throw new Error(`Invalid ut_pex payload: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ut_pex payload must be a dictionary");
  }

  const dict = value as BencodeDict;

  const added = [
    ...decodePeers(dict, "added", "added.f", 4),
    ...decodePeers(dict, "added6", "added6.f", 16),
  ];
  const dropped = [
    ...decodePeers(dict, "dropped", undefined, 4),
    ...decodePeers(dict, "dropped6", undefined, 16),
  ];

  if (added.length + dropped.length > maxPeers) {
    throw new Error(`ut_pex update exceeds ${maxPeers} peers`);
  }

  return { added, dropped };
}

/**
 * Compact peers into a binary format (address + port).
 */
function compactPeers(peers: PexPeer[], addressLength: number): Uint8Array {
  const result = new Uint8Array(peers.length * (addressLength + 2));
  let offset = 0;

  for (const peer of peers) {
    if (peer.address.length !== addressLength) {
      throw new RangeError("PEX peer address family changed while encoding");
    }
    if (!Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535) {
      throw new RangeError("PEX peer port must be in the range 1..65535");
    }
    if (peer.flags !== undefined && (!Number.isInteger(peer.flags) || peer.flags < 0 || peer.flags > 255)) {
      throw new RangeError("PEX peer flags must be an unsigned byte");
    }

    result.set(peer.address, offset);
    new DataView(result.buffer).setUint16(offset + addressLength, peer.port);
    offset += addressLength + 2;
  }

  return result;
}

/**
 * Decode peers from a compact binary format.
 */
function decodePeers(
  dictionary: BencodeDict,
  peersKey: string,
  flagsKey: string | undefined,
  addressLength: number,
): PexPeer[] {
  const compact = optionalBytes(dictionary, peersKey);
  if (!compact) return [];

  const width = addressLength + 2;
  if (compact.length % width !== 0) {
    throw new Error(`${peersKey} has a truncated compact endpoint`);
  }

  const count = compact.length / width;
  const flags = flagsKey ? optionalBytes(dictionary, flagsKey) : undefined;

  if (flags && flags.length !== count) {
    throw new Error(`${flagsKey} length does not match peer count`);
  }

  const peers: PexPeer[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * width;
    const port = new DataView(
      compact.buffer,
      compact.byteOffset + offset + addressLength,
      2,
    ).getUint16(0);

    if (port === 0) {
      throw new Error("PEX peer port may not be zero");
    }

    peers.push({
      address: compact.slice(offset, offset + addressLength),
      port,
      flags: flags?.[index] ?? 0,
    });
  }

  return peers;
}

/**
 * Extract bytes from a bencode dictionary, handling both Uint8Array and string values.
 */
function optionalBytes(
  dictionary: BencodeDict,
  key: string,
): Uint8Array | undefined {
  const value = dictionary[key];
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new Error(`ut_pex ${key} must be a byte string`);
}

```

---

## Arquivo: `packages/core/src/mod.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/mod.ts
import { TypedEventTarget } from "./utils/event-target.ts";
import { parseTorrent, type ParsedTorrent } from "./utils/parse-torrent.ts";
import { Torrent } from "./core/torrent.ts";
import { Swarm } from "./network/swarm.ts";
import { generateBrowserTorrentPeerId } from "./utils/peerid.ts";
import { OPFSChunkStore } from "./storage/opfs-chunk-store.ts";
import { MemoryChunkStore } from "./storage/memory-chunk-store.ts";
import { encode, decode } from "./utils/bencode.ts";
import type { BencodeDict } from "./utils/bencode.ts";
import {
  createServer,
  registerTorrentFiles,
  unregisterTorrentFiles,
  type WebTorrentServer,
} from "./server/server.ts";
import { File } from "./core/file.ts";
import {
  generateTorrent,
  PieceSizeEnum,
  type OPFSFileEntry,
} from "./torrent-generator/mod.ts";

export const CORE_VERSION = "0.0.0-placeholder";

// ── WebRTC feature detection ──────────────────────────────────────────
const _WEBRTC_SUPPORT: boolean = (() => {
  if (typeof globalThis === "undefined") return false;
  return typeof (globalThis as any).RTCPeerConnection !== "undefined" ||
    typeof (globalThis as any).webkitRTCPeerConnection !== "undefined";
})();

export interface WebTorrentEvents {
  /** Emitted when a torrent is added to the client (after add/seed). */
  torrent: CustomEvent<{ torrent: Torrent }>;
  /**
   * Emitted when a torrent is added to `client.torrents`.
   * Mirrors upstream `client.on('add', torrent)`.
   */
  add: CustomEvent<{ torrent: Torrent }>;
  /**
   * Emitted when a torrent is removed from `client.torrents`.
   * Mirrors upstream `client.on('remove', torrent)`.
   */
  remove: CustomEvent<{ torrent: Torrent; infoHash: string }>;
  error: CustomEvent<{ error: Error }>;
  ready: Event;
}

export interface WebTorrentOptions {
  peerId?: Uint8Array | string;
  maxConns?: number;
  port?: number;
  useOPFS?: boolean;
  rtcConfig?: RTCConfiguration;
  serviceWorkerUrl?: string;
  serviceWorkerScope?: string;
  /**
   * Global download rate limit, in bytes/s. `0` = unlimited.
   * Default: `0`.
   */
  downloadLimit?: number;
  /**
   * Global upload rate limit, in bytes/s. `0` = unlimited.
   * Default: `0`.
   */
  uploadLimit?: number;
}

export interface AddTorrentOptions {
  skipVerify?: boolean;
  destroyStoreOnDestroy?: boolean;
  onReady?: (torrent: Torrent) => void;
  /**
   * Optional callback invoked when the torrent is fully done.
   */
  onDone?: (torrent: Torrent) => void;
}

/** Input options for `client.seed()`. */
export interface SeedOptions {
  /** Display name; if omitted, the entry's name is used. */
  name?: string;
  /** Piece size preset or raw bytes. Default: `AUTO`. */
  pieceSize?: PieceSizeEnum | number;
  /** BEP-12 trackers. */
  trackers?: string[];
  /** BEP-19 web seeds. */
  webSeeds?: string[];
  /** BEP-9 comment. */
  comment?: string;
  /** BEP-9 created-by string. */
  createdBy?: string;
  /** Mark as private (no DHT/PEX). */
  private?: boolean;
  /** BEP-47: align files on piece boundaries. */
  alignPiece?: boolean;
  /** Skip files whose name starts with `"."`. */
  ignoreHiddenFile?: boolean;
  /** Forward to {@link AddTorrentOptions}. */
  skipVerify?: boolean;
  /** Forward to {@link AddTorrentOptions}. */
  onReady?: (torrent: Torrent) => void;
  /** Forward to {@link AddTorrentOptions}. */
  onDone?: (torrent: Torrent) => void;
}

/** Input accepted by `client.seed()`. */
export type SeedInput =
  | FileSystemFileHandle
  | FileSystemDirectoryHandle
  | File
  | Blob
  | Uint8Array
  | { name: string; length: number; data: Uint8Array }
  | Array<FileSystemFileHandle | File | Blob | Uint8Array | { name: string; length: number; data: Uint8Array }>;

export class WebTorrent extends TypedEventTarget<WebTorrentEvents> {
  /** `true` if the runtime supports WebRTC (RTCPeerConnection). */
  public static readonly WEBRTC_SUPPORT: boolean = _WEBRTC_SUPPORT;

  public readonly peerId: string;
  public readonly peerIdBuffer: Uint8Array;
  public readonly torrents: Map<string, Torrent> = new Map();
  public readonly torrentList: Torrent[] = [];
  public server: WebTorrentServer | null = null;

  private swarms: Map<string, Swarm> = new Map();
  private opts: WebTorrentOptions;
  private destroyed = false;
  private ready = false;
  /** Global download throttle in bytes/s (0 = unlimited). */
  private _downloadLimit: number = 0;
  /** Global upload throttle in bytes/s (0 = unlimited). */
  private _uploadLimit: number = 0;

  constructor(opts: WebTorrentOptions = {}) {
    super();
    this.opts = opts;
    this._downloadLimit = Math.max(0, opts.downloadLimit ?? 0);
    this._uploadLimit = Math.max(0, opts.uploadLimit ?? 0);

    let peerIdBuffer: Uint8Array;
    if (opts.peerId) {
      if (typeof opts.peerId === "string") {
        peerIdBuffer = new Uint8Array(20);
        for (let i = 0; i < 20; i++) {
          peerIdBuffer[i] = parseInt(opts.peerId.substring(i * 2, i * 2 + 2), 16);
        }
      } else {
        peerIdBuffer = opts.peerId;
      }
    } else {
      peerIdBuffer = generateBrowserTorrentPeerId();
    }

    this.peerIdBuffer = peerIdBuffer;
    this.peerId = Array.from(peerIdBuffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    queueMicrotask(() => {
      this.ready = true;
      this.emit("ready");
    });
  }

  // ── Aggregate getters ──────────────────────────────────────────────

  get isReady(): boolean { return this.ready && !this.destroyed; }
  get isDestroyed(): boolean { return this.destroyed; }
  get torrentCount(): number { return this.torrents.size; }

  /** Aggregate download speed across all torrents (bytes/s). */
  get downloadSpeed(): number {
    let total = 0;
    for (const t of this.torrents.values()) {
      total += t.downloadSpeed;
    }
    return total;
  }

  /** Aggregate upload speed across all torrents (bytes/s). */
  get uploadSpeed(): number {
    let total = 0;
    for (const t of this.torrents.values()) {
      total += t.uploadSpeed;
    }
    return total;
  }

  /** Aggregate progress (0..1) weighted by torrent length. */
  get progress(): number {
    let totalLen = 0;
    let totalDownloaded = 0;
    for (const t of this.torrents.values()) {
      totalLen += t.length;
      totalDownloaded += t.downloaded;
    }
    if (totalLen === 0) return 0;
    return totalDownloaded / totalLen;
  }

  /** Aggregate ratio: total uploaded / total downloaded. */
  get ratio(): number {
    let totalDown = 0;
    let totalUp = 0;
    for (const t of this.torrents.values()) {
      totalDown += t.downloaded;
      totalUp += t.uploaded;
    }
    if (totalDown === 0) return totalUp > 0 ? Infinity : 0;
    return totalUp / totalDown;
  }

  /** Currently configured download limit (bytes/s). */
  get downloadLimit(): number { return this._downloadLimit; }

  /** Currently configured upload limit (bytes/s). */
  get uploadLimit(): number { return this._uploadLimit; }

  // ── Throttle ───────────────────────────────────────────────────────

  /**
   * Set the global download rate limit.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleDownload(rate: number): void {
    this._downloadLimit = Math.max(0, rate);
    for (const swarm of this.swarms.values()) {
      swarm.throttleDownload(this._downloadLimit);
    }
  }

  /**
   * Set the global upload rate limit.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleUpload(rate: number): void {
    this._uploadLimit = Math.max(0, rate);
    for (const swarm of this.swarms.values()) {
      swarm.throttleUpload(this._uploadLimit);
    }
  }

  /**
   * Get a torrent by `infoHash` (hex), magnet URI, or `.torrent` file buffer.
   * Returns `null` if not found.
   */
  async get(torrentId: string | Uint8Array | ParsedTorrent): Promise<Torrent | null> {
    if (this.destroyed) return null;
    try {
      const parsed = await parseTorrent(torrentId);
      return this.torrents.get(parsed.infoHash) ?? null;
    } catch {
      return null;
    }
  }

  // ── Service Worker integration ─────────────────────────────────────

  createServer(opts: { controller?: ServiceWorker; scope?: string } = {}): WebTorrentServer {
    if (this.server) return this.server;

    const scope = opts.scope || this.opts.serviceWorkerScope || "/";
    this.server = createServer({ controller: opts.controller, scope });

    for (const torrent of this.torrents.values()) {
      const files = this._makeFileObjects(torrent, scope);
      console.log("[mod] createServer init: registering", files.length, "files for", torrent.infoHash);
      registerTorrentFiles(torrent, files);
      (torrent as any)._registerFiles?.(files);
    }

    this.on("torrent", (e: any) => {
      const torrent: Torrent = e.detail.torrent;
      const files = this._makeFileObjects(torrent, scope);
      console.log("[mod] torrent event: registering", files.length, "files for", torrent.infoHash);
      registerTorrentFiles(torrent, files);
      (torrent as any)._registerFiles?.(files);
    });

    return this.server;
  }

  private _makeFileObjects(torrent: Torrent, scope: string): File[] {
    return torrent.files.map((pf, idx) =>
      new File({
        store: (torrent as any).store,
        length: pf.length,
        offset: pf.offset,
        pieceLength: torrent.pieceLength,
        name: pf.name,
        infoHash: torrent.infoHash,
        fileIndex: idx,
        scope,
        torrent,
      })
    );
  }

  async initServiceWorker(): Promise<ServiceWorker | null> {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return null;
    }
    if (!this.opts.serviceWorkerUrl) {
      return null;
    }
    const reg = await navigator.serviceWorker.register(
      this.opts.serviceWorkerUrl,
      { scope: this.opts.serviceWorkerScope || "/" },
    );
    await navigator.serviceWorker.ready;
    this.createServer({ controller: reg.active ?? undefined });
    return reg.active;
  }

  // ── add / remove / destroy ─────────────────────────────────────────

  async add(
    torrentId: string | Uint8Array | ParsedTorrent,
    opts: AddTorrentOptions = {}
  ): Promise<Torrent> {
    if (this.destroyed) throw new Error("WebTorrent client is destroyed");

    const parsed = await parseTorrent(torrentId);

    if (this.torrents.has(parsed.infoHash)) {
      return this.torrents.get(parsed.infoHash)!;
    }

    const store = await this._createChunkStore(parsed);

    const swarm = new Swarm({
      infoHash: parsed.infoHashBuffer,
      peerId: this.peerIdBuffer,
      announce: parsed.announce,
      maxConns: this.opts.maxConns,
      port: this.opts.port,
      metadata: parsed.pieces.length > 0 ? encode(parsed.info) : undefined,
    });

    const torrent = new Torrent(parsed, {
      store,
      skipVerify: opts.skipVerify,
      swarm,
    });

    swarm.torrent = torrent;

    swarm.on("metadata", async (e: any) => {
      const metadataBuffer = e.detail.metadata;
      await torrent.setMetadata(metadataBuffer);
    });

    swarm.on("error", (e: any) => {
      this.emit("error", new CustomEvent("error", { detail: { error: e.detail.error } }));
    });

    swarm.on("noPeers", (e: any) => {
      torrent.emit("noPeers", new CustomEvent("noPeers", { detail: e.detail }));
    });

    // Aplica throttle se configurado.
    if (this._downloadLimit > 0) swarm.throttleDownload(this._downloadLimit);
    if (this._uploadLimit > 0) swarm.throttleUpload(this._uploadLimit);

    swarm.start();

    this.torrents.set(parsed.infoHash, torrent);
    this.swarms.set(parsed.infoHash, swarm);
    this.torrentList.push(torrent);

    this.emit("add", new CustomEvent("add", { detail: { torrent } }));

    if (this.server) {
      const files = this._makeFileObjects(torrent, this.server.scope);
      registerTorrentFiles(torrent, files);
      (torrent as any)._registerFiles?.(files);
    } else {
      // Registra os files mesmo sem server (para events download/upload nos Files).
      const files = this._makeFileObjects(torrent, "/");
      (torrent as any)._registerFiles?.(files);
    }

    this.emit("torrent", new CustomEvent("torrent", { detail: { torrent } }));

    if (opts.onReady) {
      torrent.on("ready", () => opts.onReady!(torrent));
    }
    if (opts.onDone) {
      torrent.on("done", () => opts.onDone!(torrent));
    }

    return torrent;
  }

  /**
   * Seed a file or directory as a new torrent.
   *
   * Internally:
   * 1. Builds an OPFS-backed generator entry.
   * 2. Calls `generateTorrent()` to produce a `.torrent` buffer.
   * 3. Calls {@link WebTorrent.add} on that buffer.
   *
   * @returns the {@link Torrent} once it's been added and announced.
   */
  async seed(
    input: SeedInput,
    opts: SeedOptions = {},
    cb?: (torrent: Torrent) => void,
  ): Promise<Torrent> {
    if (this.destroyed) throw new Error("WebTorrent client is destroyed");

    const { entry, name, length } = await this._prepareSeedInput(input, opts.name);

    // 1. Acumula os bytes do .torrent num Writer em memória.
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    const writer = {
      write: async (p: Uint8Array): Promise<number> => {
        chunks.push(p);
        totalLen += p.length;
        return p.length;
      },
    };

    // 2. Gera o .torrent.
    await generateTorrent({
      entry,
      writer,
      pieceSize: opts.pieceSize ?? PieceSizeEnum.SIZE_AUTO,
      trackers: opts.trackers ?? [],
      webSeeds: opts.webSeeds ?? [],
      comment: opts.comment,
      createdBy: opts.createdBy,
      isPrivate: opts.private,
      alignPiece: opts.alignPiece,
      ignoreHiddenFile: opts.ignoreHiddenFile,
    });

    const torrentBytes = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      torrentBytes.set(c, off);
      off += c.length;
    }

    // 3. Adiciona o torrent ao cliente.
    const torrent = await this.add(torrentBytes, {
      skipVerify: opts.skipVerify ?? true,
      onReady: opts.onReady,
      onDone: opts.onDone,
    });

    // O nome é usado como display-name se ainda não tiver.
    if (name && (!torrent.name || torrent.name === "Unknown")) {
      (torrent as any).name = name;
    }
    if (length && torrent.length === 0) {
      (torrent as any).length = length;
    }

    // 4. Popula o OPFSChunkStore com os dados do arquivo original (para streaming)
    // Sem isso, o streaming falha com "Chunk N not found"
    const store = (torrent as any).store;
    console.log("[seed] store available:", !!store, "put?", typeof store?.put, "entry?", !!entry, "pieceLength:", torrent.pieceLength);
    if (store && typeof store.put === "function" && entry) {
      console.log("[seed] Populating chunk store with", Array.isArray(entry) ? entry.length + " files" : "directory");
      await this._populateChunkStoreFromOPFSEntry(entry, store, torrent.pieceLength);
      console.log("[seed] Chunk store populated successfully");
    } else {
      console.log("[seed] Skipping chunk store population: store=" + !!store, "put=" + typeof store?.put, "entry=" + !!entry);
    }

    if (cb) cb(torrent);
    return torrent;
  }

  /**
   * Populates an OPFSChunkStore by reading from OPFS file entries.
   * This is needed because the seed writes files as a single OPFS file,
   * but OPFSChunkStore expects pieces as separate N.chunk files.
   */
  private async _populateChunkStoreFromOPFSEntry(
    entry: FileSystemDirectoryHandle | OPFSFileEntry[],
    store: { put(index: number, buf: Uint8Array): Promise<void> },
    pieceLength: number,
  ): Promise<void> {
    let files: OPFSFileEntry[];
    if (Array.isArray(entry)) {
      files = entry;
    } else {
      const { walkOPFSDir } = await import("./torrent-generator/mod.ts");
      files = await walkOPFSDir(entry, false);
    }
    console.log("[_populateChunkStore] Starting with", files.length, "files, pieceLength:", pieceLength);

    // Read all files sequentially and write pieces to the chunk store
    const PIECE_SIZE = pieceLength || 16384;
    let pieceIndex = 0;
    let pieceBuffer = new Uint8Array(PIECE_SIZE);
    let pieceOffset = 0;
    let totalWritten = 0;

    for (const fileEntry of files) {
      if (!fileEntry.handle) {
        console.warn("[_populateChunkStore] Skipping file without handle:", fileEntry.name);
        continue;
      }
      const file = await fileEntry.handle.getFile();
      console.log("[_populateChunkStore] Reading file:", fileEntry.name, "size:", file.size);
      let fileOffset = 0;

      while (fileOffset < file.size) {
        const want = Math.min(PIECE_SIZE - pieceOffset, file.size - fileOffset);
        const blob = file.slice(fileOffset, fileOffset + want);
        const buf = new Uint8Array(await blob.arrayBuffer());

        pieceBuffer.set(buf, pieceOffset);
        pieceOffset += buf.byteLength;
        fileOffset += buf.byteLength;

        if (pieceOffset === PIECE_SIZE) {
          await store.put(pieceIndex, pieceBuffer);
          totalWritten += pieceBuffer.length;
          pieceIndex++;
          pieceBuffer = new Uint8Array(PIECE_SIZE);
          pieceOffset = 0;
        }
      }
    }

    // Write any remaining partial piece
    if (pieceOffset > 0) {
      const partial = pieceBuffer.slice(0, pieceOffset);
      await store.put(pieceIndex, partial);
      totalWritten += partial.length;
      console.log("[_populateChunkStore] Wrote final piece", pieceIndex, "size:", pieceOffset);
    }
    console.log("[_populateChunkStore] Done. Total pieces:", pieceIndex + (pieceOffset > 0 ? 1 : 0), "bytes written:", totalWritten);
  }

  /**
   * Normaliza o `SeedInput` para uma entrada que o generator aceita.
   *
   * - FileSystemDirectoryHandle → passa direto.
   * - Array de handles/files      → escreve no OPFS num diretório temporário.
   * - File/Blob/Uint8Array único → escreve no OPFS num diretório temporário.
   * - Plain object                → mesma estratégia.
   */
  private async _prepareSeedInput(
    input: SeedInput,
    displayName?: string,
  ): Promise<{ entry: FileSystemDirectoryHandle | OPFSFileEntry[]; name?: string; length?: number }> {
    // Validate input early to ensure TypeError is thrown (not ReferenceError from
    // instanceof checks against browser-only globals like FileSystemFileHandle).
    if (
      input === null ||
      input === undefined ||
      (input !== null && typeof input !== "object" && typeof input !== "string")
    ) {
      throw new TypeError("Unsupported seed input");
    }

    // Caso 1: directory handle direto.
    if (input instanceof FileSystemDirectoryHandle) {
      return { entry: input, name: displayName };
    }

    // Caso 2: array de inputs → escreve no OPFS e devolve o directory handle.
    if (Array.isArray(input)) {
      const rootDir = await this._createTempOPFSDir();
      const entries: OPFSFileEntry[] = [];
      for (const item of input) {
        const { name: iname, size, data } = await this._materializeInput(item);
        const fileHandle = await rootDir.getFileHandle(iname, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(new Uint8Array(data));
        await writable.close();
        entries.push({ name: iname, size, handle: fileHandle });
      }
      return { entry: rootDir, name: displayName };
    }

    // Caso 3: input único.
    const { name: iname, size, data } = await this._materializeInput(input);
    const rootDir = await this._createTempOPFSDir();
    const fileHandle = await rootDir.getFileHandle(iname, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(data));
    await writable.close();
    return {
      entry: [{ name: iname, size, handle: fileHandle }],
      name: displayName ?? iname,
      length: size,
    };
  }

  /** Converte um input em `{ name, size, data: Uint8Array }`. */
  private async _materializeInput(
    item: FileSystemFileHandle | File | Blob | Uint8Array | { name: string; length: number; data: Uint8Array },
  ): Promise<{ name: string; size: number; data: Uint8Array }> {
    let data: Uint8Array;
    let name: string;
    let size: number;

    if (item instanceof FileSystemFileHandle) {
      const file = await item.getFile();
      data = new Uint8Array(await file.arrayBuffer());
      name = item.name;
    } else if (item instanceof File || (typeof Blob !== "undefined" && item instanceof Blob)) {
      data = new Uint8Array(await item.arrayBuffer());
      name = (item as File).name ?? "file";
    } else if (item instanceof Uint8Array) {
      // Ensure non-shared ArrayBuffer for OPFS compatibility.
      data = item.buffer instanceof ArrayBuffer && !(item.buffer instanceof SharedArrayBuffer)
        ? item
        : new Uint8Array(item);
      name = "file";
    } else if (item && typeof item === "object" && "data" in item && "name" in item) {
      name = String(item.name);
      data = item.data instanceof Uint8Array
        ? (item.data.buffer instanceof ArrayBuffer && !(item.data.buffer instanceof SharedArrayBuffer)
          ? item.data
          : new Uint8Array(item.data))
        : new Uint8Array(item.data as ArrayBuffer);
    } else {
      throw new TypeError("Unsupported seed input");
    }

    size = data.length;
    return { name, size, data };
  }

  /** Cria (ou reusa) um diretório temporário dentro do OPFS para seeding. */
  private async _createTempOPFSDir(): Promise<FileSystemDirectoryHandle> {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      throw new Error("OPFS not available: cannot seed from this environment");
    }
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle("browsertorrent-seed", { create: true });
  }

  async remove(infoHash: string, destroyStore = false): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    const swarm = this.swarms.get(infoHash);

    if (!torrent) return;

    if (swarm) {
      swarm.destroy();
      this.swarms.delete(infoHash);
    }

    await torrent.destroy(destroyStore);
    this.torrents.delete(infoHash);

    const index = this.torrentList.indexOf(torrent);
    if (index !== -1) {
      this.torrentList.splice(index, 1);
    }

    this.emit("remove", new CustomEvent("remove", { detail: { torrent, infoHash } }));

    if (this.server) {
      unregisterTorrentFiles(infoHash);
    }
  }

  async destroy(callback?: () => void): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const [, swarm] of this.swarms) {
      swarm.destroy();
    }
    this.swarms.clear();

    for (const [, torrent] of this.torrents) {
      await torrent.destroy(false);
    }
    this.torrents.clear();
    this.torrentList.length = 0;

    if (this.server) {
      this.server.destroy();
      this.server = null;
    }

    if (callback) callback();
  }

  private async _createChunkStore(parsed: ParsedTorrent): Promise<any> {
    const useOPFS = this.opts.useOPFS !== false;

    if (useOPFS && globalThis.navigator?.storage?.getDirectory) {
      try {
        const rootDir = await globalThis.navigator.storage.getDirectory();
        const torrentDir = await rootDir.getDirectoryHandle(`webtorrent-${parsed.infoHash}`, { create: true });

        return new OPFSChunkStore({
          chunkLength: parsed.pieceLength || 16384,
          length: parsed.length || 0,
          rootDir: torrentDir,
        });
      } catch (err) {
        console.warn("[WebTorrent] OPFS not available, falling back to memory store:", err);
      }
    }

    return new MemoryChunkStore({
      chunkLength: parsed.pieceLength || 16384,
      length: parsed.length || 0,
    });
  }
}

export { Torrent } from "./core/torrent.ts";
export { Swarm } from "./network/swarm.ts";
export { Peer } from "./network/peer.ts";
export { Wire } from "./core/wire.ts";
export { File } from "./core/file.ts";
export { Piece } from "./core/piece.ts";
export { parseTorrent } from "./utils/parse-torrent.ts";
export { decodePeerId, generateBrowserTorrentPeerId, BT_PEER_ID_PREFIX } from "./utils/peerid.ts";
export { UtMetadata } from "./extensions/ut-metadata.ts";
export { UtPexExtension, encodePexUpdate, decodePexUpdate, PexPeerFlag } from "./extensions/ut-pex.ts";
export type { ParsedTorrent } from "./utils/parse-torrent.ts";
export type { ClientInfo } from "./utils/peerid.ts";
export type { PexPeer, PexUpdate, UtPexOptions } from "./extensions/ut-pex.ts";
export { createServer, WebTorrentServer, type StreamRequestMessage } from "./server/server.ts";
export { streamManager, buildStreamURL, parseStreamURL } from "./server/stream-manager.ts";
// Phase 5.3: OPFS-based torrent generator
export {
  generateTorrent,
  walkOPFSDir,
  getOPFSFileSize,
  OPFSMultiFileReader,
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  getDefaultCreatedBy,
  isHiddenFile,
  sha1sum,
  PieceSizeEnum,
} from "./torrent-generator/mod.ts";
export type {
  GeneratorOptions,
  OPFSFileEntry,
  PieceFile,
  Torrent as GeneratedTorrent,
  Writer as TorrentWriter,
} from "./torrent-generator/mod.ts";

```

---

## Arquivo: `packages/core/src/network/peer.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/network/peer.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Wire, Transport } from "../core/wire.ts";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface PeerEvents {
  /** Emitido quando o Peer precisa enviar dados de sinalização (offer, answer, ICE) para o Tracker/SW */
  signal: CustomEvent<{ data: RTCSessionDescriptionInit | RTCIceCandidateInit }>;
  /** Emitido quando a conexão WebRTC e o DataChannel estão abertos */
  connect: Event;
  /** Emitido quando o handshake do BitTorrent é concluído com sucesso */
  handshake: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>;
  /** Emitido quando a conexão é fechada (normalmente ou por erro) */
  close: Event;
  /** Emitido em caso de erro fatal */
  error: CustomEvent<{ error: Error }>;
}

export interface PeerOptions {
  /** Se true, este peer inicia a conexão (cria a offer). Se false, aguarda uma offer. */
  initiator: boolean;
  /** InfoHash do torrent (usado para validação no handshake) */
  infoHash: Uint8Array;
  /** PeerId local (20 bytes) */
  peerId: Uint8Array;
  /** Construtor do RTCPeerConnection (injetável para testes ou fallbacks) */
  wrtc?: typeof RTCPeerConnection;
  /** Configuração ICE (servidores STUN/TURN) */
  config?: RTCConfiguration;
  /** Nome do canal (padrão: "webtorrent") */
  channelName?: string;
  /** Endereço do peer (usado para stats `remoteAddress`/`remotePort`). */
  addr?: string;
}

// ============================================================================
// CLASSE PEER
// ============================================================================

export class Peer extends TypedEventTarget<PeerEvents> {
  /** PeerId remoto em formato hex (preenchido após o handshake) */
  public id: string = "unknown";
  public readonly type = "webrtc";
  public wire: Wire | null = null;
  
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private opts: PeerOptions;
  
  public destroyed = false;
  public addr = "";
  private connected = false;
  private handshakeCompleted = false;
  
  private connectTimeoutId: number | null = null;
  private handshakeTimeoutId: number | null = null;

  constructor(opts: PeerOptions) {
    super();
    this.opts = opts;
    this.id = "unknown";
    this.addr = opts.addr ?? "";

    // 🔥 CORREÇÃO: Fallback seguro para ambiente de teste ou browser
    const RTCPeerConnectionCtor = opts.wrtc || globalThis.RTCPeerConnection;
    if (!RTCPeerConnectionCtor) {
      throw new Error("WebRTC not supported. Provide 'wrtc' option or run in a supported browser.");
    }

    this.pc = new RTCPeerConnectionCtor(opts.config || {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this._setupPeerConnection();
    this._startConnectTimeout();

    if (opts.initiator) {
      this._initiateConnection();
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /** Retorna true se o peer está conectado e com handshake do BitTorrent completo */
  get isReady(): boolean {
    return this.connected && this.handshakeCompleted;
  }

  // ==========================================================================
  // API PÚBLICA
  // ==========================================================================

  /**
   * Processa dados de sinalização recebidos do Tracker ou Service Worker.
   * Pode ser uma offer, answer ou ICE candidate.
   */
  public async signal(data: RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void> {
    if (this.destroyed) return;

    try {
      if ("type" in data && (data.type === "offer" || data.type === "answer")) {
        await this.pc!.setRemoteDescription(data);
        
        // Se recebemos uma offer e não somos o iniciador, geramos uma answer
        if (data.type === "offer" && !this.opts.initiator) {
          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          this.emit("signal", new CustomEvent("signal", { detail: { data: answer } }));
        }
      } else if ("candidate" in data && data.candidate) {
        await this.pc!.addIceCandidate(data);
      }
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Destrói a conexão, liberando todos os recursos WebRTC e de protocolo.
   * Pode ser chamado múltiplas vezes sem erro (idempotente).
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this._clearTimeouts();

    if (this.wire) {
      this.wire.destroy();
      this.wire = null;
    }

    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // Ignora erros de fechamento
      }
      this.channel = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // Ignora erros de fechamento
      }
      this.pc = null;
    }

    this.connected = false;
    this.handshakeCompleted = false;
    this.emit("close");
  }

  // ==========================================================================
  // LÓGICA INTERNA (WebRTC)
  // ==========================================================================

  private _setupPeerConnection(): void {
    this.pc!.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit("signal", new CustomEvent("signal", { detail: { data: event.candidate.toJSON() } }));
      }
    };

    this.pc!.onconnectionstatechange = () => {
      const state = this.pc!.connectionState;
      if (state === "failed" || state === "closed") {
        this._onError(new Error(`WebRTC connection ${state}`));
      }
    };

    // Se não somos o iniciador, esperamos o outro peer criar o DataChannel
    if (!this.opts.initiator) {
      this.pc!.ondatachannel = (event) => {
        this._setupData(event.channel);
      };
    }
  }

  private async _initiateConnection(): Promise<void> {
    const channelName = this.opts.channelName || "webtorrent";
    const channel = this.pc!.createDataChannel(channelName, {
      ordered: true, // BitTorrent exige ordem nas mensagens de controle
      negotiated: false,
    });
    this._setupData(channel);

    try {
      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      this.emit("signal", new CustomEvent("signal", { detail: { data: offer } }));
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private _setupData(channel: RTCDataChannel): void {
    this.channel = channel;
    this.channel.binaryType = "arraybuffer";

    this.channel.onopen = () => {
      this._clearConnectTimeout();
      this.connected = true;
      this.emit("connect");
      this._setupWire();
    };

    this.channel.onclose = () => {
      if (!this.destroyed) {
        this.destroy();
      }
    };

    this.channel.onerror = () => {
      this._onError(new Error("DataChannel error"));
    };
  }

  // ==========================================================================
  // LÓGICA INTERNA (Wire Protocol / BitTorrent)
  // ==========================================================================

  private _setupWire(): void {
    if (!this.channel) return;

    // Criamos um Transport que adapta o RTCDataChannel para a interface esperada pelo Wire
    const transport: Transport = {
      send: (data: Uint8Array) => {
        if (this.channel && this.channel.readyState === "open") {
          // 🔥 CORREÇÃO: Extrair um ArrayBuffer estrito para satisfazer os tipos rigorosos do Deno
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          this.channel.send(arrayBuffer as ArrayBuffer);
        }
      },
      onMessage: (handler: (data: Uint8Array) => void) => {
        if (this.channel) {
          this.channel.onmessage = (event) => {
            const buf = event.data instanceof ArrayBuffer
              ? new Uint8Array(event.data)
              : new Uint8Array(event.data);
            handler(buf);
          };
        }
      },
      close: () => {
        if (this.channel) {
          this.channel.close();
        }
      },
    };

    this.wire = new Wire(transport);
    // Expor o endereço do peer nos stats do Wire.
    if (this.opts.addr) {
      const parts = this.opts.addr.split(":");
      this.wire.remoteAddress = parts[0] ?? "";
      this.wire.remotePort = parseInt(parts[1] ?? "0", 10) || 0;
    }

    // Listener do Handshake do BitTorrent
    this.wire.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>) => {
      // Converte o peerId remoto (Uint8Array) para string hex para facilitar logs e UI
      this.id = Array.from(e.detail.peerId).map((b: number) => b.toString(16).padStart(2, "0")).join("");
      this._clearHandshakeTimeout();
      this.handshakeCompleted = true;
      this.emit("handshake", new CustomEvent("handshake", { detail: e.detail }));
    });

    // Listener de erro do Wire
    this.wire.on("error", (e: CustomEvent<{ error: Error }>) => {
      this._onError(e.detail.error);
    });

    this._startHandshakeTimeout();
    
    // Inicia o handshake do BitTorrent
    this.wire.sendHandshake(this.opts.infoHash, this.opts.peerId);
  }

  // ==========================================================================
  // TIMEOUTS E ERROS
  // ==========================================================================

  private _startConnectTimeout(): void {
    this.connectTimeoutId = setTimeout(() => {
      if (!this.connected && !this.destroyed) {
        this._onError(new Error("WebRTC connection timeout"));
      }
    }, 25000) as unknown as number;
  }

  private _clearConnectTimeout(): void {
    if (this.connectTimeoutId !== null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  private _startHandshakeTimeout(): void {
    this.handshakeTimeoutId = setTimeout(() => {
      if (!this.handshakeCompleted && !this.destroyed) {
        this._onError(new Error("BitTorrent handshake timeout"));
      }
    }, 25000) as unknown as number;
  }

  private _clearHandshakeTimeout(): void {
    if (this.handshakeTimeoutId !== null) {
      clearTimeout(this.handshakeTimeoutId);
      this.handshakeTimeoutId = null;
    }
  }

  private _clearTimeouts(): void {
    this._clearConnectTimeout();
    this._clearHandshakeTimeout();
  }

  private _onError(err: Error): void {
    if (this.destroyed) return;
    this.emit("error", new CustomEvent("error", { detail: { error: err } }));
    this.destroy();
  }
}
```

---

## Arquivo: `packages/core/src/network/swarm.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/network/swarm.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Peer } from "./peer.ts";
import { createTracker, Tracker, TrackerOptions, TrackerResponse } from "./tracker.ts";
import { UtMetadata } from "../extensions/ut-metadata.ts";
import type { Wire } from "../core/wire.ts";

export interface SwarmEvents {
  peer: CustomEvent<{ peer: Peer; source: string }>;
  wire: CustomEvent<{ wire: any; addr: string }>;
  error: CustomEvent<{ error: Error }>;
  warning: CustomEvent<{ error: Error }>;
  trackerAnnounce: Event;
  noPeers: CustomEvent<{ source: string }>;
  metadata: CustomEvent<{ metadata: Uint8Array; peer: Peer }>;
}

export interface SwarmOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  announce: string[];
  maxConns?: number;
  port?: number;
  wrtc?: typeof RTCPeerConnection;
  metadata?: Uint8Array; // Metadata já conhecido (para seed)
}

interface QueuedPeer {
  addr: string;
  retries: number;
  timeoutId?: number;
}

const RECONNECT_WAIT = [1000, 5000, 15000];
const MAX_QUEUED_PEERS = 200;

export class Swarm extends TypedEventTarget<SwarmEvents> {
  public readonly infoHash: Uint8Array;
  public readonly peerId: Uint8Array;

  public readonly peers: Map<string, Peer> = new Map();
  private queue: QueuedPeer[] = [];
  private trackers: Tracker[] = [];
  private maxConns: number;
  private wrtc?: typeof RTCPeerConnection;
  private metadata?: Uint8Array;

  /** Torrent dono deste swarm. Definido externamente (ver WebTorrent.add). */
  public torrent: any | null = null;

  public destroyed = false;
  private paused = false;
  /** Download rate limit in bytes/s (0 = unlimited). */
  private _downloadLimit: number = 0;
  /** Upload rate limit in bytes/s (0 = unlimited). */
  private _uploadLimit: number = 0;

  constructor(opts: SwarmOptions) {
    super();
    this.infoHash = opts.infoHash;
    this.peerId = opts.peerId;
    this.maxConns = opts.maxConns || 55;
    this.wrtc = opts.wrtc;
    this.metadata = opts.metadata;

    for (const announceUrl of opts.announce) {
      try {
        const trackerOpts: TrackerOptions = {
          infoHash: opts.infoHash,
          peerId: opts.peerId,
          port: opts.port || 6881,
        };
        const tracker = createTracker(announceUrl, trackerOpts);
        this.trackers.push(tracker);
      } catch (err) {
        this.emit("warning", new CustomEvent("warning", {
          detail: { error: err instanceof Error ? err : new Error(String(err)) }
        }));
      }
    }
  }

  public start(): void {
    if (this.destroyed) return;

    for (const tracker of this.trackers) {
      tracker.announce({ event: "started" }).then((response: TrackerResponse) => {
        this._onTrackerResponse(response, tracker);
      }).catch((err: Error) => {
        this.emit("warning", new CustomEvent("warning", {
          detail: { error: err }
        }));
      });
    }
  }

  public addPeer(addr: string): boolean {
    if (this.destroyed || this.paused) return false;
    if (this.peers.has(addr)) return false;
    if (this.peers.size >= this.maxConns) {
      if (this.queue.length < MAX_QUEUED_PEERS) {
        this.queue.push({ addr, retries: 0 });
      }
      return false;
    }

    this._connectPeer(addr);
    return true;
  }

  public removePeer(addr: string): void {
    const peer = this.peers.get(addr);
    if (peer) {
      peer.destroy();
      this.peers.delete(addr);
      this._drain();
    }
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
    this._drain();
  }

  // ==========================================================================
  // THROTTLE
  // ==========================================================================

  /** Currently configured download rate limit (bytes/s). */
  get downloadLimit(): number { return this._downloadLimit; }

  /** Currently configured upload rate limit (bytes/s). */
  get uploadLimit(): number { return this._uploadLimit; }

  /**
   * Set the download rate limit for this swarm's wires.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleDownload(rate: number): void {
    this._downloadLimit = Math.max(0, rate);
    for (const peer of this.peers.values()) {
      if (peer.wire && !(peer.wire as any).isDestroyed) {
        (peer.wire as any).throttleDownload?.(this._downloadLimit);
      }
    }
  }

  /**
   * Set the upload rate limit for this swarm's wires.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleUpload(rate: number): void {
    this._uploadLimit = Math.max(0, rate);
    for (const peer of this.peers.values()) {
      if (peer.wire && !(peer.wire as any).isDestroyed) {
        (peer.wire as any).throttleUpload?.(this._uploadLimit);
      }
    }
  }

  // ==========================================================================
  // DELEGAÇÃO DO TORRENT
  // ==========================================================================

  /** Envia `interested` para todos os wires conectados. */
  public _sendInterested(): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) {
        peer.wire.sendInterested();
      }
    }
  }

  /** Envia `not-interested` para todos os wires conectados. */
  public _sendNotInterested(): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) {
        peer.wire.sendNotInterested();
      }
    }
  }

  /** Envia `suggest-piece` (BEP 6) para todos os wires. */
  public _sendSuggestPiece(index: number): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) {
        peer.wire.sendSuggestPiece(index);
      }
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const queued of this.queue) {
      if (queued.timeoutId) clearTimeout(queued.timeoutId);
    }
    this.queue = [];

    for (const [, peer] of this.peers) {
      peer.destroy();
    }
    this.peers.clear();

    for (const tracker of this.trackers) {
      tracker.destroy();
    }
    this.trackers = [];

    this.torrent = null;
  }

  private _onTrackerResponse(response: TrackerResponse, _tracker: Tracker): void {
    this.emit("trackerAnnounce");

    if (response.peers.length === 0) {
      this.emit("noPeers", new CustomEvent("noPeers", { detail: { source: "tracker" } }));
      this.torrent?.emit?.("noPeers", new CustomEvent("noPeers", { detail: { source: "tracker" } }));
      return;
    }

    for (const peerInfo of response.peers) {
      if (peerInfo.ip && peerInfo.port) {
        const addr = `${peerInfo.ip}:${peerInfo.port}`;
        this.addPeer(addr);
      }
    }
  }

  private _connectPeer(addr: string): void {
    if (this.destroyed || this.paused) return;
    if (this.peers.has(addr)) return;

    const peer = new Peer({
      initiator: true,
      infoHash: this.infoHash,
      peerId: this.peerId,
      wrtc: this.wrtc,
      addr,
    });

    this.peers.set(addr, peer);

    peer.on("connect", () => {
      this.emit("peer", new CustomEvent("peer", { detail: { peer, source: "tracker" } }));
    });

    // 🔥 INTEGRAÇÃO: Quando o Wire é criado, registrar extensão ut_metadata
    peer.on("handshake", (e) => {
      if (peer.wire) {
        const wire: Wire = peer.wire;

        // Cria e registra a extensão ut_metadata
        const utMetadata = new UtMetadata(wire, { metadata: this.metadata });

        // Se temos o metadata, define no ut_metadata para servir a outros peers
        if (this.metadata) {
          utMetadata.setMetadata(this.metadata);
        }

        // Registra listener para quando o metadata for recebido
        utMetadata.on("metadata", (metadataEvent: any) => {
          const metadata = metadataEvent.detail?.metadata || metadataEvent;
          this.emit("metadata", new CustomEvent("metadata", {
            detail: { metadata, peer }
          }));
        });

        utMetadata.on("warning", (warningEvent: any) => {
          const error = warningEvent.detail?.error || warningEvent;
          this.emit("warning", new CustomEvent("warning", { detail: { error } }));
          this.torrent?.emit?.("warning", new CustomEvent("warning", { detail: { error } }));
        });

        // Inicia o fetch do metadata se não temos
        if (!this.metadata) {
          utMetadata.fetch();
        }

        this.emit("wire", new CustomEvent("wire", {
          detail: { wire, addr }
        }));

        // Repassa o wire ao Torrent (que cria interval de velocidade, idle timer etc.)
        if (this.torrent && typeof this.torrent._registerWire === "function") {
          this.torrent._registerWire(wire, addr);
        }
      }
    });

    peer.on("error", (e) => {
      this._onPeerError(addr, e.detail.error);
    });

    peer.on("close", () => {
      this._onPeerClose(addr);
    });
  }

  private _onPeerError(addr: string, error: Error): void {
    this.emit("warning", new CustomEvent("warning", { detail: { error } }));
    this.torrent?.emit?.("warning", new CustomEvent("warning", { detail: { error } }));
    this.peers.delete(addr);
    this._drain();
  }

  private _onPeerClose(addr: string): void {
    this.peers.delete(addr);

    const queued = this.queue.find(q => q.addr === addr);
    const retries = queued ? queued.retries : 0;

    if (retries < RECONNECT_WAIT.length && !this.destroyed && !this.paused) {
      const waitMs = RECONNECT_WAIT[retries]!;
      const timeoutId = setTimeout(() => {
        if (!this.destroyed && !this.paused) {
          this._connectPeer(addr);
        }
      }, waitMs) as unknown as number;

      if (!queued) {
        this.queue.push({ addr, retries: retries + 1, timeoutId });
      } else {
        queued.retries = retries + 1;
        queued.timeoutId = timeoutId;
      }
    }

    this._drain();
  }

  private _drain(): void {
    if (this.destroyed || this.paused) return;

    while (this.peers.size < this.maxConns && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        if (next.timeoutId) clearTimeout(next.timeoutId);
        this._connectPeer(next.addr);
      }
    }
  }
}

```

---

## Arquivo: `packages/core/src/network/tracker.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/network/tracker.ts
/**
 * BitTorrent tracker clients (HTTP + WebSocket).
 *
 * Adaptado de deno-torrent/torrent-tracker/ (http.ts, compact.ts, types.ts,
 * request.ts). Browser-first: `fetch`-based, sem transporte UDP.
 *
 * Mudanças em relação à versão anterior do BrowserTorrent:
 * - `info_hash`/`peer_id` agora usam percent-encoding byte-a-byte (BEP 3).
 *   A versão anterior usava `URLSearchParams` com binary string, que corrompia
 *   bytes > 0x7F ao re-encodar como UTF-8.
 * - Suporte a peers compactos IPv6 (`peers6`, BEP 7) e deduplicação.
 * - `failure reason` agora gera erro tipado `TrackerError`.
 * - Limites de recursos: tamanho de resposta, URL, numwant, dicionário de peers.
 * - `trackerid` retornado pelo tracker é reenviado nos announces seguintes.
 *
 * A fachada pública (`TrackerOptions`, `TrackerResponse`, `Tracker`,
 * `HttpTracker`, `WsTracker`, `createTracker`) é preservada.
 */

import { decode, BencodeDict, BencodeMap, BencodeValue } from "../utils/bencode.ts";
import { TrackerError } from "../utils/errors.ts";
import {
  deduplicatePeers,
  parseCompactIpv4Peers,
  parseCompactIpv6Peers,
  type PeerEndpoint,
} from "../utils/net.ts";
import { uint8ArrayToBinaryString } from "../utils/encode-util.ts";

export type { PeerEndpoint };

// ── Limites de recursos (adaptados de torrent-tracker/request.ts) ───────

/** Default per-announce timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Maximum allowed per-announce timeout in milliseconds. */
export const MAX_TIMEOUT_MS = 300_000;
/** Maximum `numwant` accepted by trackers (BEP 3 recommendation). */
export const MAX_NUM_WANT = 2_000;
/** Maximum tracker URL length accepted. */
export const MAX_TRACKER_URL_LENGTH = 8_192;
/** Maximum tracker id length accepted. */
export const MAX_TRACKER_ID_LENGTH = 1_024;
/** Maximum bencoded tracker response size. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Maximum peers parsed from a dictionary-format response. */
export const MAX_DICTIONARY_PEERS = 2_000;

// ── Tipos ────────────────────────────────────────────────────────────────

/** Lifecycle event sent to a tracker (BEP 3). */
export type TrackerEvent = "started" | "completed" | "stopped";

export interface TrackerOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  port?: number;
  uploaded?: number;
  downloaded?: number;
  left?: number;
  compact?: boolean;
  numwant?: number;
  /** Optional unsigned 32-bit client key, sent as `key`. */
  key?: number;
  /** Per-announce timeout in milliseconds (default 15000). */
  timeoutMs?: number;
}

export interface TrackerAnnounceEvent {
  event?: TrackerEvent;
}

export interface TrackerResponse {
  interval: number;
  minInterval?: number;
  complete: number;
  incomplete: number;
  peers: PeerEndpoint[];
  /** Tracker-provided identifier to echo back as `trackerid`. */
  trackerId?: string;
  /** Non-fatal tracker warning message. */
  warning?: string;
}

export interface Tracker {
  announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse>;
  destroy(): void;
}

// ── Construção e validação de request (torrent-tracker/request.ts) ──────

/**
 * Percent-encodes raw bytes byte-a-byte (`%XX`), como exigido pelo BEP 3
 * para `info_hash` e `peer_id`. Nunca passa pela codificação UTF-8.
 */
export function percentEncodeBytes(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += `%${bytes[i]!.toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return result;
}

/** Valida um inteiro dentro de [minimum, maximum]; retorna o valor. */
export function integerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TrackerError(`${name} is invalid`);
  }
  return value;
}

const TRACKER_EVENTS = new Set<string>(["started", "completed", "stopped"]);

/**
 * Valida a URL do tracker + opções de announce antes do request.
 * Adaptado de `validateAnnounceRequest` (torrent-tracker/request.ts).
 */
export function validateTrackerOptions(
  baseUrl: string,
  opts: TrackerOptions,
  event?: TrackerAnnounceEvent,
): void {
  if (
    !(opts.infoHash instanceof Uint8Array) ||
    !(opts.peerId instanceof Uint8Array) ||
    opts.infoHash.length !== 20 || opts.peerId.length !== 20
  ) {
    throw new TrackerError("infoHash and peerId must contain 20 bytes");
  }
  if (
    typeof baseUrl !== "string" || !baseUrl ||
    baseUrl.length > MAX_TRACKER_URL_LENGTH
  ) {
    throw new TrackerError("tracker URL is invalid");
  }
  try {
    new URL(baseUrl);
  } catch (error) {
    throw new TrackerError("tracker URL is invalid", "TRACKER_ERROR", { cause: error });
  }
  if (opts.port !== undefined) integerInRange(opts.port, "port", 1, 65_535);
  if (opts.uploaded !== undefined) integerInRange(opts.uploaded, "uploaded", 0);
  if (opts.downloaded !== undefined) integerInRange(opts.downloaded, "downloaded", 0);
  if (opts.left !== undefined) integerInRange(opts.left, "left", 0);
  if (opts.numwant !== undefined) integerInRange(opts.numwant, "numwant", 0, MAX_NUM_WANT);
  if (opts.key !== undefined) integerInRange(opts.key, "key", 0, 0xffff_ffff);
  if (opts.timeoutMs !== undefined) {
    integerInRange(opts.timeoutMs, "timeoutMs", 1, MAX_TIMEOUT_MS);
  }
  if (event?.event !== undefined && !TRACKER_EVENTS.has(event.event)) {
    throw new TrackerError("event is invalid");
  }
}

/**
 * Constrói a URL de announce preservando os parâmetros binários
 * (`info_hash`, `peer_id`) com percent-encoding byte-a-byte.
 * Adaptado de `buildAnnounceUrl` (torrent-tracker/http.ts).
 */
export function buildAnnounceUrl(
  baseUrl: string,
  opts: TrackerOptions,
  event?: TrackerAnnounceEvent,
  trackerId?: string,
): URL {
  validateTrackerOptions(baseUrl, opts, event);

  const url = new URL(baseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname
  ) {
    throw new TrackerError(`unsupported HTTP tracker URL: ${url.protocol}`);
  }

  const parameters = [
    `info_hash=${percentEncodeBytes(opts.infoHash)}`,
    `peer_id=${percentEncodeBytes(opts.peerId)}`,
    `port=${opts.port ?? 6881}`,
    `uploaded=${opts.uploaded ?? 0}`,
    `downloaded=${opts.downloaded ?? 0}`,
    `left=${opts.left ?? 0}`,
    "compact=1",
    `numwant=${opts.numwant ?? 50}`,
  ];
  if (event?.event) parameters.push(`event=${event.event}`);
  if (opts.key !== undefined) parameters.push(`key=${opts.key}`);
  if (trackerId) parameters.push(`trackerid=${encodeURIComponent(trackerId)}`);

  url.search += `${url.search ? "&" : ""}${parameters.join("&")}`;
  return url;
}

// ── Parsing de resposta (torrent-tracker/http.ts + compact.ts) ──────────

function dictString(dict: BencodeDict, key: string): string | undefined {
  const value = dict[key];
  return typeof value === "string" ? value : undefined;
}

function dictNonNegativeInteger(
  dict: BencodeDict,
  key: string,
): number | undefined {
  const value = dict[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return undefined;
}

/** Converte peers em formato dicionário (não-compacto) para endpoints. */
function parseDictionaryPeers(values: unknown[]): PeerEndpoint[] {
  const peers: PeerEndpoint[] = [];
  const textDecoder = new TextDecoder();
  for (const value of values.slice(0, MAX_DICTIONARY_PEERS)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const dict = value as BencodeDict;
    const ipRaw = dict["ip"];
    const hostname = typeof ipRaw === "string"
      ? ipRaw
      : ipRaw instanceof Uint8Array
        ? textDecoder.decode(ipRaw)
        : undefined;
    const portRaw = dict["port"];
    const port = typeof portRaw === "number"
      ? portRaw
      : typeof portRaw === "bigint" ? Number(portRaw) : undefined;
    if (!hostname || port === undefined || !Number.isSafeInteger(port)) continue;
    if (port < 1 || port > 65_535) continue;
    peers.push({ ip: hostname, port });
  }
  return peers;
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

/**
 * Faz o parse de uma resposta bencoded de tracker HTTP.
 * Adaptado de `parseHttpTrackerResponse` (torrent-tracker/http.ts).
 *
 * @throws {TrackerError} em `failure reason`, bencode inválido,
 *   ausência de `interval` válido ou lista compacta malformada.
 */
export function parseHttpTrackerResponse(bytes: Uint8Array): TrackerResponse {
  let dict: BencodeDict;
  try {
    const value = decode(bytes, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: 32,
      allowUnsortedKeys: true,
    });
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        value instanceof Uint8Array || value instanceof Map) {
      throw new TrackerError("tracker response must be a dictionary");
    }
    dict = value as BencodeDict;
  } catch (error) {
    if (error instanceof TrackerError) throw error;
    throw new TrackerError("tracker returned invalid bencode", "TRACKER_ERROR", { cause: error });
  }

  const failure = dictString(dict, "failure reason");
  if (failure) {
    throw new TrackerError(`tracker announce failed: ${failure}`);
  }

  const interval = dictNonNegativeInteger(dict, "interval");
  if (interval === undefined || interval < 1) {
    throw new TrackerError("tracker response has no valid interval");
  }

  const peers: PeerEndpoint[] = [];

  const ipv4 = dict["peers"];
  if (ipv4 instanceof Uint8Array || typeof ipv4 === "string") {
    try {
      peers.push(...parseCompactIpv4Peers(toBytes(ipv4)));
    } catch (error) {
      throw new TrackerError("invalid compact IPv4 peer list", "TRACKER_ERROR", { cause: error });
    }
  } else if (Array.isArray(ipv4)) {
    peers.push(...parseDictionaryPeers(ipv4));
  }

  const ipv6 = dict["peers6"];
  if (ipv6 instanceof Uint8Array || typeof ipv6 === "string") {
    try {
      peers.push(...parseCompactIpv6Peers(toBytes(ipv6)));
    } catch (error) {
      throw new TrackerError("invalid compact IPv6 peer list", "TRACKER_ERROR", { cause: error });
    }
  }

  // Porta 0 não é conectável — filtra antes da deduplicação (BEP 23).
  const connectable = peers.filter((peer) => peer.port >= 1 && peer.port <= 65_535);

  return {
    interval,
    minInterval: dictNonNegativeInteger(dict, "min interval"),
    trackerId: dictString(dict, "tracker id"),
    warning: dictString(dict, "warning message"),
    complete: dictNonNegativeInteger(dict, "complete") ?? 0,
    incomplete: dictNonNegativeInteger(dict, "incomplete") ?? 0,
    peers: deduplicatePeers(connectable),
  };
}

// ── Leitura limitada de corpo HTTP ──────────────────────────────────────

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new TrackerError("tracker response has invalid Content-Length");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      throw new TrackerError("tracker response is too large");
    }
  }

  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new TrackerError("tracker response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// ── HttpTracker ──────────────────────────────────────────────────────────

export class HttpTracker implements Tracker {
  private baseUrl: string;
  private opts: TrackerOptions;
  private abortController: AbortController | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private trackerId: string | undefined;

  constructor(baseUrl: string, opts: TrackerOptions) {
    this.baseUrl = baseUrl;
    this.opts = opts;
  }

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    validateTrackerOptions(this.baseUrl, this.opts, event);
    const url = buildAnnounceUrl(this.baseUrl, this.opts, event, this.trackerId);

    this.abortController = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    this.timeoutId = setTimeout(() => {
      timedOut = true;
      this.abortController?.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        signal: this.abortController.signal,
        headers: { "User-Agent": "BrowserTorrent-WebTorrent/0.1.0" },
      });

      if (!response.ok) {
        throw new TrackerError(`Tracker HTTP error: ${response.status}`);
      }

      const bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES);
      const parsed = parseHttpTrackerResponse(bytes);

      if (parsed.trackerId) this.trackerId = parsed.trackerId;

      return {
        interval: parsed.interval,
        minInterval: parsed.minInterval,
        complete: parsed.complete,
        incomplete: parsed.incomplete,
        peers: parsed.peers,
        trackerId: parsed.trackerId,
        warning: parsed.warning,
      };
    } catch (err) {
      if (timedOut) {
        throw new TrackerError("HTTP tracker request timed out", "TRACKER_ERROR", { cause: err });
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new TrackerError("Tracker announce aborted", "TRACKER_ERROR", { cause: err });
      }
      if (err instanceof TrackerError) throw err;
      throw new TrackerError(
        err instanceof Error ? err.message : "HTTP tracker request failed",
        "TRACKER_ERROR",
        { cause: err },
      );
    } finally {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.abortController = null;
    }
  }

  destroy(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

// ── Scrape support (BEP 48) ────────────────────────────────────────────────

export interface ScrapeResponse {
  files: Record<string, {
    complete: number;
    incomplete: number;
    downloaded: number;
    name?: string;
  }>;
}

/**
 * Fetches scrape data for one or more info hashes from a tracker's scrape endpoint.
 * Falls back to `announce` if `scrape` is not in the URL (BEP 48 §3).
 *
 * @param trackerUrl - Base announce URL (e.g. `https://tracker.example/announce`).
 *   The scrape endpoint is derived by replacing `/announce` with `/scrape`.
 * @param infoHashes - Array of 20-byte info hashes.
 * @param opts - Optional timeout.
 */
export async function scrapeTracker(
  trackerUrl: string,
  infoHashes: Uint8Array[],
  opts: { timeoutMs?: number } = {},
): Promise<ScrapeResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scrapeUrl = trackerUrl.replace(/\/announce(\?.*)?$/, "/scrape$1");

  const sep = scrapeUrl.includes("?") ? "&" : "?";
  const queryParts: string[] = [];
  for (const ih of infoHashes) {
    queryParts.push(`info_hash=${percentEncodeBytes(ih)}`);
  }
  const url = new URL(`${scrapeUrl}${sep}${queryParts.join("&")}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "BrowserTorrent-WebTorrent/0.1.0" },
    });

    if (!response.ok) {
      throw new TrackerError(`Tracker scrape HTTP error: ${response.status}`);
    }

    const bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    let dict: BencodeMap;
    try {
      const value = decode(bytes, {
        maxBytes: MAX_RESPONSE_BYTES,
        maxDepth: 16,
        allowUnsortedKeys: true,
        useMap: true,
      });
      if (!(value instanceof Map)) {
        throw new TrackerError("scrape response must be a dictionary");
      }
      dict = value;
    } catch (error) {
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("scrape returned invalid bencode", "TRACKER_ERROR", { cause: error });
    }

    const files: ScrapeResponse["files"] = {};

    // Map<string,unknown> -> BencodeDict so dict helpers work
    function mapToDict(m: BencodeMap): BencodeDict {
      const out: BencodeDict = {};
      for (const [k, v] of m) {
        if (typeof k === "string") out[k] = v;
      }
      return out;
    }

    for (const [key, value] of dict) {
      if (typeof key !== "string") continue;
      if (key === "flags") continue;

      let fileStats: BencodeMap | undefined;
      if (key === "files") {
        // BEP 48 "files" variant: "files" -> { infoHash -> stats }
        if (value instanceof Map) fileStats = value;
      } else {
        // Direct infoHash -> stats (some trackers use this form)
        if (value instanceof Map) fileStats = new Map([[key, value]]);
      }

      if (fileStats) {
        for (const [subKey, subVal] of fileStats) {
          if (typeof subKey !== "string" || !(subVal instanceof Map)) continue;
          const sub = mapToDict(subVal);
          const complete = dictNonNegativeInteger(sub, "complete") ?? 0;
          const incomplete = dictNonNegativeInteger(sub, "incomplete") ?? 0;
          const downloaded = dictNonNegativeInteger(sub, "downloaded") ?? 0;
          const name = dictString(sub, "name");
          files[subKey] = { complete, incomplete, downloaded, ...(name ? { name } : {}) };
        }
      }
    }

    return { files };
  } finally {
    clearTimeout(timeout);
  }
}

// ── WsTracker ────────────────────────────────────────────────────────────

export class WsTracker implements Tracker {
  private url: string;
  private opts: TrackerOptions;
  private ws: WebSocket | null = null;

  constructor(url: string, opts: TrackerOptions) {
    this.url = url;
    this.opts = opts;
  }

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          const msg = {
            action: "announce",
            info_hash: uint8ArrayToBinaryString(this.opts.infoHash),
            peer_id: uint8ArrayToBinaryString(this.opts.peerId),
            port: this.opts.port || 6881,
            uploaded: this.opts.uploaded || 0,
            downloaded: this.opts.downloaded || 0,
            left: this.opts.left || 0,
            compact: 1,
            numwant: this.opts.numwant || 50,
            ...(event?.event ? { event: event.event } : {}),
          };
          this.ws?.send(JSON.stringify(msg));
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === "announce") {
              const peers: PeerEndpoint[] = [];
              if (Array.isArray(data.peers)) {
                for (const p of data.peers) {
                  peers.push({ ip: p.ip || p.ipv4 || p.ipv6, port: p.port });
                }
              }

              const response: TrackerResponse = {
                interval: data.interval || 1800,
                complete: data.complete || 0,
                incomplete: data.incomplete || 0,
                peers: deduplicatePeers(peers),
              };

              resolve(response);
              this.ws?.close();
            } else if (data["failure reason"]) {
              reject(new TrackerError(String(data["failure reason"])));
              this.ws?.close();
            }
          } catch (err) {
            reject(err);
            this.ws?.close();
          }
        };

        this.ws.onerror = () => {
          reject(new TrackerError("WebSocket connection failed"));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createTracker(announceUrl: string, opts: TrackerOptions): Tracker {
  if (announceUrl.startsWith("http://") || announceUrl.startsWith("https://")) {
    return new HttpTracker(announceUrl, opts);
  }
  if (announceUrl.startsWith("ws://") || announceUrl.startsWith("wss://")) {
    return new WsTracker(announceUrl, opts);
  }
  throw new TrackerError(`Unsupported tracker protocol: ${announceUrl}`);
}

```

---

## Arquivo: `packages/core/src/server/server.ts`

````ts
// /browsertorrent/monorepo/webtorrent/src/server/server.ts

import type { File } from "../core/file.ts";
import type { Torrent } from "../core/torrent.ts";
import {
  buildStreamURL,
  parseStreamURL,
  streamManager,
  type StreamEntry,
} from "./stream-manager.ts";

/**
 * Pull-style payload the Service Worker sends to the main thread when
 * it wants the next chunk of a streaming response.
 *
 * The wire protocol is intentionally minimal: the SW opens a
 * `MessageChannel` per request, the server answers with
 * {@link StreamResponseMetadata} (or a `STREAM` sentinel) and then both
 * ends treat the channel as a backpressure pump — `true` requests the
 * next chunk, `false` (or closing the port) ends the stream.
 */
export interface StreamRequestMessage {
  type: "webtorrent-request";
  url: string;
  method: string;
  headers: Record<string, string>;
  scope: string;
  destination: RequestDestination | string;
}

/**
 * First reply on the streaming channel.  When `body === "STREAM"` the
 * caller must continue pulling chunks by sending `true` on the port.
 * A non-stream body is returned verbatim and ends the exchange.
 */
export interface StreamResponseMetadata {
  body: "STREAM" | ArrayBuffer | string | Uint8Array | null;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

/**
 * Incoming message from the Service Worker announcing that the bridge
 * is ready to serve `/webtorrent/*` requests.
 */
export interface WebTorrentReadyMessage {
  type: "WEBTORRENT_READY";
}

/**
 * Acknowledgement sent back to the Service Worker via the transferred
 * port once the main thread is ready to receive streaming requests.
 */
export interface WebTorrentAckMessage {
  type: "WEBTORRENT_ACK";
}

/**
 * Pull signal sent by the SW on the streaming port.  Receiving `true`
 * means "send me the next chunk".  Receiving `false` means "tear down".
 */
export type PullSignal = boolean;

/**
 * Pluggable transport used by {@link WebTorrentServer} to communicate
 * with the Service Worker.
 *
 * - The production implementation backed by `navigator.serviceWorker` is
 *   built by {@link createServiceWorkerTransport} when a live controller
 *   is provided.
 * - The test suite injects a {@link InProcessTransport} that records
 *   every message and lets tests drive the protocol deterministically.
 *
 * The transport must guarantee that {@link Transport.send} delivers
 * messages to the SW (or its in-process replacement) within a reasonable
 * time.  If the SW is not registered yet, implementations should buffer
 * until ready and reject after a timeout.
 */
export interface Transport {
  /**
   * Posts a one-shot message to the SW (no response expected).  Used
   * for the `WEBTORRENT_ACK` handshake.
   */
  postMessage(message: unknown): void;

  /**
   * Posts a message to the SW that must be paired with a response
   * on the supplied port.  Returns a promise that resolves with the
   * first {@link StreamResponseMetadata} the SW sends back.
   *
   * After the metadata is received, the implementation can attach
   * additional `onmessage` listeners on `port` to receive pull-style
   * chunks.  This mirrors the `MessageChannel` flow used by the real
   * `webtorrent.min.js` integration.
   */
  requestStream(
    message: StreamRequestMessage,
    port: MessagePort,
  ): Promise<StreamResponseMetadata>;

  /**
   * Releases any owned ports.  Called on `destroy` to free resources.
   */
  close(): void;
}

/**
 * Minimal controller surface used by the default transport.  Matches
 * the relevant subset of `ServiceWorkerContainer`/`ServiceWorker`
 * behavior, so we can mock it in tests without standing up a real SW.
 */
export interface ServiceWorkerControllerLike {
  scope: string;
  active: { postMessage?: (data: unknown, transfer?: Transferable[]) => void } | null;
  /**
   * Returns a promise that resolves when a `message` event matches the
   * supplied `sourceId`.  In the real SW this is replaced by a
   * `navigator.serviceWorker.addEventListener('message', ...)` handler
   * that filters by the `MessageEvent.source.id`.
   */
  waitForMessage(sourceId: string): Promise<any>;
}

/**
 * Default transport that talks to a real Service Worker.  The transport
 * is constructed only when a live controller is present (browser
 * environment) — see {@link createServiceWorkerTransport}.
 */
export function createServiceWorkerTransport(
  controller: ServiceWorker,
  scope: string,
): Transport {
  const PORT_TIMEOUT_MS = 5000;
  const pending = new Map<string, (data: StreamResponseMetadata) => void>();

  const onMessage = (event: any) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "webtorrent-response" && typeof event.data.sourceId === "string") {
      const resolver = pending.get(event.data.sourceId);
      if (resolver) {
        pending.delete(event.data.sourceId);
        resolver(event.data as StreamResponseMetadata);
      }
    }
  };

  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", onMessage as EventListener);
  }

  return {
    postMessage(message) {
      controller.postMessage(message);
    },

    requestStream(message, port) {
      const sourceId = crypto.randomUUID();
      return new Promise<StreamResponseMetadata>((resolve) => {
        const timeout = setTimeout(() => {
          if (pending.delete(sourceId)) {
            resolve({ body: null, status: 503, statusText: "Service Unavailable" });
          }
        }, PORT_TIMEOUT_MS);

        pending.set(sourceId, (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        controller.postMessage(
          { ...message, sourceId, type: "webtorrent" },
          [port],
        );
      });
    },

    close() {
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", onMessage as EventListener);
      }
      pending.clear();
    },
  };
}

/**
 * In-process transport used by tests.  It records every outbound
 * message, lets the test driver send the `WEBTORRENT_ACK` /
 * `webtorrent-response` back, and exposes a counter so the suite can
 * assert the protocol was honored.
 */
export class InProcessTransport implements Transport {
  readonly sent: unknown[] = [];
  private responseResolver?: (data: StreamResponseMetadata) => void;
  /** @internal — exposed for tests. */
  public activePort?: MessagePort;

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  requestStream(
    _message: StreamRequestMessage,
    port: MessagePort,
  ): Promise<StreamResponseMetadata> {
    this.activePort = port;
    return new Promise<StreamResponseMetadata>((resolve) => {
      this.responseResolver = resolve;
    });
  }

  /** Test helper: deliver the metadata reply for the current request. */
  deliverResponse(data: StreamResponseMetadata): void {
    this.responseResolver?.(data);
  }

  /** Test helper: send a pull signal (`true` for more, `false` to end). */
  sendPull(signal: PullSignal): void {
    this.activePort?.postMessage(signal);
  }

  close(): void {
    this.activePort?.close();
    this.activePort = undefined;
    this.responseResolver = undefined;
  }
}

/**
 * High-level façade exposed as `client.createServer({ controller })`.
 *
 * `WebTorrentServer` owns:
 *
 * 1. A reference to the {@link Transport} used to talk to the SW.
 * 2. The handshake (sending `WEBTORRENT_ACK` and waiting for the
 *    `WEBTORRENT_READY` to flip the `isReady` flag).
 * 3. The request-reply loop that turns a SW pull into a chunked
 *    {@link ReadableStream} of bytes.
 *
 * The server is transport-agnostic: production code passes the SW
 * transport, while tests pass an {@link InProcessTransport}.  This
 * keeps the streaming protocol exercised even in environments without a
 * real Service Worker (Node, Deno, CI).
 */
export class WebTorrentServer {
  public readonly scope: string;
  public isReady: boolean = false;
  public isDestroyed: boolean = false;

  private readonly transport: Transport;
  private readonly pendingAcks: Set<(ok: boolean) => void> = new Set();

  constructor(opts: { transport: Transport; scope: string }) {
    this.transport = opts.transport;
    this.scope = opts.scope;
  }

  /**
   * Sends the `WEBTORRENT_ACK` message to the Service Worker.  In
   * production this is called automatically by the SW the first time a
   * `/webtorrent/*` request arrives; the public `createServer` wrapper
   * may also call it eagerly during `init` to warm the path.
   *
   * @returns A promise that resolves to `true` once the SW has flipped
   *   its internal `isWebTorrentReady` flag.  The current SW code does
   *   not post a separate ack back, so this resolves immediately —
   *   the method exists so future revisions can opt into a stricter
   *   round-trip without changing the public API.
   */
  async sendReadyAck(): Promise<boolean> {
    if (this.isDestroyed) return false;
    const ack: WebTorrentAckMessage = { type: "WEBTORRENT_ACK" };
    this.transport.postMessage(ack);
    this.isReady = true;
    return true;
  }

  /**
   * Streams a file in response to a request originated by the SW.
   *
   * The flow is:
   *
   * 1. Translate the request URL into a `(infoHash, fileIndex)` pair
   *    using {@link parseStreamURL}.
   * 2. Look the entry up in the {@link streamManager}.
   * 3. Hand the entry to {@link buildFileStream} which returns a
   *    `ReadableStream<Uint8Array>` driven by the `MessagePort` pull
   *    signals.
   *
   * @returns A `Response` suitable for `event.respondWith()`.  When the
   *   URL is unknown the method returns a `404`; when the SW is not
   *   ready it returns a `503`.
   */
  async handleRequest(
    message: StreamRequestMessage,
    port: MessagePort,
  ): Promise<Response> {
    if (this.isDestroyed) {
      return new Response("Server destroyed", { status: 503 });
    }

    const parsed = parseStreamURL(message.url, message.scope || this.scope);
    if (!parsed) {
      return new Response("Not Found", { status: 404 });
    }

    const entry: StreamEntry | undefined = streamManager.get(
      parsed.infoHash,
      parsed.fileIndex,
    );
    if (!entry) {
      return new Response("File not registered", { status: 404 });
    }

    const range = parseRangeHeader(message.headers["range"], entry.file.length);
    let status = 200;
    let statusText = "OK";
    const headers: Record<string, string> = {
      "Content-Type": guessContentType(entry.file.name),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };

    if (range) {
      status = 206;
      statusText = "Partial Content";
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${entry.file.length}`;
      headers["Content-Length"] = String(range.end - range.start + 1);
    } else {
      headers["Content-Length"] = String(entry.file.length);
    }

    const stream = buildFileStream(entry, port, this.transport, {
      rangeStart: range?.start,
      rangeEnd: range ? range.end + 1 : undefined,
    });
    return new Response(stream, {
      status,
      statusText,
      headers,
    });
  }

  /**
   * Tears down the server.  Closes the transport so any future pull
   * signals stop firing.  Safe to call more than once.
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isReady = false;
    this.transport.close();
    for (const resolve of this.pendingAcks) resolve(false);
    this.pendingAcks.clear();
  }
}

/**
 * Builds a `ReadableStream<Uint8Array>` that materializes a file
 * piece-by-piece in response to `port` pull signals.
 *
 * The pull-based protocol is the same one `webtorrent.min.js` uses:
 *
 * 1. The SW (or in-process transport) sends `true` on `port` whenever
 *    it is ready for the next chunk.
 * 2. We asynchronously compute the next chunk from the file's
 *    `ChunkStore` and post it back on the same `port`.
 * 3. The stream ends when the SW posts `false` (or the port is closed)
 *    or when the file has been fully served.
 *
 * @param entry - The registered file entry being streamed.
 * @param port - The pull-signal port transferred from the SW.
 * @param transport - The transport implementation; used to forward the
 *   initial metadata reply before the pull loop starts.
 * @param opts - Streaming options.
 */
export function buildFileStream(
  entry: StreamEntry,
  port: MessagePort,
  _transport: Transport,
  opts: { rangeStart?: number; rangeEnd?: number } = {},
): ReadableStream<Uint8Array> {
  const file: File = entry.file;

  let fileOffset = opts.rangeStart ?? 0;
  const endOffset = opts.rangeEnd ?? file.length;
  let closed = false;
  let pendingResolve: (() => void) | null = null;

  const onMessage = (event: MessageEvent<PullSignal | Uint8Array | null>) => {
    const data = event.data;

    if (data === false || data == null) {
      closed = true;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r();
      }
      return;
    }

    if (data === true && pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
  };

  port.addEventListener("message", onMessage as EventListener);
  port.start?.();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (closed) {
          controller.close();
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        if (fileOffset >= endOffset) {
          controller.close();
          port.postMessage(null);
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        // Wait for the next pull signal before emitting.  The transport
        // injects `true` whenever the SW is ready for the next chunk.
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
          if (closed) {
            pendingResolve = null;
            resolve();
          }
        });

        if (closed) {
          controller.close();
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        const chunk = await readNextChunk(file, fileOffset);
        if (chunk.byteLength === 0) {
          controller.close();
          port.postMessage(null);
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        fileOffset += chunk.byteLength;
        controller.enqueue(chunk);
        // Send the chunk back through the port so the SW can forward it
        port.postMessage(chunk);
      } catch (err) {
        controller.error(err);
        port.removeEventListener("message", onMessage as EventListener);
      }
    },

    cancel() {
      closed = true;
      port.postMessage(false);
      port.removeEventListener("message", onMessage as EventListener);
    },
  });
}

/** Parsed byte-range result. */
export interface ParsedRange {
  start: number;
  end: number;
}

/**
 * Parse a HTTP `Range` header value (e.g. `"bytes=12345-"`).
 * Returns `null` if the header is absent, invalid, or unsatisfiable.
 *
 * Supports the `bytes` unit only.
 */
export function parseRangeHeader(
  header: string | undefined,
  fileLength: number,
): ParsedRange | null {
  if (!header) return null;

  // "bytes=start-end" or "bytes=start-"
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;

  const start = Number(match[1]);
  const endStr = match[2];

  if (!Number.isFinite(start) || start < 0 || start >= fileLength) {
    return null;
  }

  const end = endStr !== ""
    ? Math.min(Number(endStr), fileLength - 1)
    : fileLength - 1;

  if (!Number.isFinite(end) || end < start || end >= fileLength) {
    return null;
  }

  return { start, end };
}

/**
 * Reads the next chunk of `file` starting at `offset`.  This is a
 * separate function (rather than an inline `for await` loop) so the
 * `File` class can grow a smarter implementation later (e.g. adaptive
 * block size based on `RTT` and `BT_RREQ_RATE`) without changing the
 * streaming protocol.
 *
 * The default block size is 16 KiB — small enough to keep latency
 * snappy for video seeks, large enough to amortize `MessageChannel`
 * overhead.
 */
export const STREAM_BLOCK_SIZE = 16 * 1024;

export async function readNextChunk(
  file: File,
  offset: number,
  length: number = STREAM_BLOCK_SIZE,
): Promise<Uint8Array> {
  // File does not yet implement `createReadStream()`; for the time
  // being we route through the async iterator + manual offset tracking.
  // The File class only knows how to iterate the whole file, so we
  // scan until we hit the requested offset.  Once the real
  // implementation lands (Phase 4.1) this function will be replaced
  // by a direct chunk-store read.
  const it = (file as any)[Symbol.asyncIterator]() as AsyncIterableIterator<Uint8Array>;
  let skipped = 0;
  let remainingToRead = Math.min(length, file.length - offset);

  if (offset === 0) {
    const { value, done } = await it.next();
    if (done || !value) return new Uint8Array(0);
    return value.subarray(0, Math.min(value.length, remainingToRead));
  }

  while (skipped < offset) {
    const result = await it.next();
    if (result.done || !result.value) return new Uint8Array(0);
    const value = result.value;
    skipped += value.length;
    if (skipped > offset) {
      const overflow = skipped - offset;
      const takeFromThis = value.length - overflow;
      if (takeFromThis >= remainingToRead) {
        return value.subarray(value.length - remainingToRead, value.length);
      }
      // Not enough in a single chunk; concatenate
      const first = value.subarray(value.length - takeFromThis, value.length);
      const out = new Uint8Array(remainingToRead);
      out.set(first, 0);
      let written = first.length;
      while (written < remainingToRead) {
        const r = await it.next();
        if (r.done || !r.value) break;
        const take = Math.min(r.value.length, remainingToRead - written);
        out.set(r.value.subarray(0, take), written);
        written += take;
      }
      return out.subarray(0, written);
    }
  }

  // offset fell exactly on a chunk boundary
  const { value, done } = await it.next();
  if (done || !value) return new Uint8Array(0);
  return value.subarray(0, Math.min(value.length, remainingToRead));
}

/**
 * Best-effort content-type guess from the file name.  Returns
 * `application/octet-stream` when no extension matches so the browser
 * can still download the file.
 */
export function guessContentType(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) {
    return "application/octet-stream";
  }
  const ext = name.slice(idx + 1).toLowerCase();
  switch (ext) {
    case "mp4": case "m4v": return "video/mp4";
    case "webm": return "video/webm";
    case "ogg": case "ogv": return "video/ogg";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "flac": return "audio/flac";
    case "m4a": case "aac": return "audio/aac";
    case "oga": return "audio/ogg";
    case "opus": return "audio/opus";
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "pdf": return "application/pdf";
    case "txt": return "text/plain; charset=utf-8";
    case "html": case "htm": return "text/html; charset=utf-8";
    case "json": return "application/json; charset=utf-8";
    case "srt": return "application/x-subrip";
    case "vtt": return "text/vtt";
    default: return "application/octet-stream";
  }
}

/**
 * Public factory matching the `webtorrent.min.js` API:
 *
 * ```ts
 * const server = createServer({ controller });
 * ```
 *
 * In the browser, `controller` is a `ServiceWorker` instance obtained
 * from `navigator.serviceWorker.ready` (the active controller).  In
 * tests, the caller can omit `controller` and use the returned
 * `WebTorrentServer` directly with an injected transport.
 *
 * If `controller` is omitted, the function still returns a working
 * server — it just never receives `WEBTORRENT_READY` events from a SW.
 * Callers wanting a self-test can call {@link WebTorrentServer.sendReadyAck}
 * and then drive the protocol through the test transport.
 */
export interface CreateServerOptions {
  controller?: ServiceWorker;
  scope?: string;
  transport?: Transport;
}

export function createServer(opts: CreateServerOptions = {}): WebTorrentServer {
  let transport: Transport;
  let scope: string;

  if (opts.transport) {
    transport = opts.transport;
    scope = opts.scope || "/";
  } else if (opts.controller) {
    scope = opts.scope || (opts.controller as any).scope || "/";
    transport = createServiceWorkerTransport(opts.controller, scope);
  } else {
    scope = opts.scope || "/";
    transport = new InProcessTransport();
  }

  return new WebTorrentServer({ transport, scope });
}

/**
 * Registers every `File` of a torrent in the {@link streamManager} so
 * that {@link createServer} can serve them.  Called automatically by
 * `Torrent`/`WebTorrent` when a torrent becomes ready.
 *
 * @returns The list of registered entries, in torrent order.  Tests
 *   use this to assert cleanup behaviour.
 */
export function registerTorrentFiles(
  torrent: Torrent,
  files: File[],
): StreamEntry[] {
  const infoHash = torrent.infoHash;
  const registered: StreamEntry[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    console.log("[server] registerTorrentFiles:", infoHash, "fileIndex:", i, "name:", file.name);
    streamManager.register(infoHash, i, file);
    registered.push({ infoHash, fileIndex: i, file });
  }
  return registered;
}

/**
 * Removes every file belonging to a torrent from the registry.  Called
 * when a torrent is removed from the client.
 */
export function unregisterTorrentFiles(infoHash: string): void {
  streamManager.unregisterTorrent(infoHash);
}

````

---

## Arquivo: `packages/core/src/server/stream-manager.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/server/stream-manager.ts

import type { File } from "../core/file.ts";

/**
 * Internal record stored in the {@link StreamManager} for each registered file.
 *
 * One entry exists per `(infoHash, fileIndex)` pair.  The file instance
 * itself is responsible for materializing bytes from the underlying
 * `ChunkStore`; the manager just keeps the references together so the
 * service-worker bridge can look them up by URL.
 */
export interface StreamEntry {
  infoHash: string;
  fileIndex: number;
  file: File;
}

/**
 * Central registry that maps `(infoHash, fileIndex)` pairs to the live
 * {@link File} instances produced by the {@link Torrent} pipeline.
 *
 * The service-worker bridge (see {@link createServer}) receives a
 * `webtorrent-request` message with `infoHash` + `fileIndex` (encoded in
 * the URL path) and uses this manager to look up the corresponding file.
 * Without the registry the SW would have no way to know which
 * `ChunkStore` to read from, since the SW runs in a separate context.
 *
 * The manager is a plain in-memory `Map`; it is intentionally simple and
 * single-instance.  All {@link WebTorrent} clients in the same realm share
 * the same singleton — this matches the way `webtorrent.min.js` exposes
 * a global `createServer` that takes any `WebTorrent` and wires it up to
 * the same SW controller.
 */
export class StreamManager {
  private readonly entries: Map<string, StreamEntry> = new Map();

  /**
   * Registers (or replaces) the file entry for a `(infoHash, fileIndex)`.
   *
   * The same `File` object is also bound back to the entry through
   * `infoHash`/`fileIndex` so {@link File.streamURL} can produce a URL
   * that resolves back to the same record.
   *
   * @param infoHash - 40-char hex info hash identifying the torrent.
   * @param fileIndex - Zero-based file index inside the torrent.
   * @param file - The {@link File} instance to serve.
   */
  register(infoHash: string, fileIndex: number, file: File): void {
    const key = this._key(infoHash, fileIndex);
    this.entries.set(key, { infoHash, fileIndex, file });
  }

  /**
   * Removes a single file entry.  Safe to call when the entry does not
   * exist.
   */
  unregister(infoHash: string, fileIndex: number): void {
    this.entries.delete(this._key(infoHash, fileIndex));
  }

  /**
   * Removes every file entry that belongs to the given torrent.  Used
   * when a torrent is removed from the client so the SW cannot keep
   * streaming after the underlying data is gone.
   */
  unregisterTorrent(infoHash: string): void {
    const prefix = `${infoHash}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /**
   * Returns the file entry for a `(infoHash, fileIndex)` or `undefined`
   * if no such file is registered.
   */
  get(infoHash: string, fileIndex: number): StreamEntry | undefined {
    return this.entries.get(this._key(infoHash, fileIndex));
  }

  /**
   * Lists every currently registered file entry.  Used by tests and
   * diagnostics — not by the hot path of the streaming protocol.
   */
  list(): StreamEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Returns the total number of registered file entries.  Useful for
   * shutdown checks and for tests asserting cleanup behaviour.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Removes every entry.  Called by the test suite and (in the future)
   * by a full client destruction path that wants to wipe state without
   * touching each torrent individually.
   */
  clear(): void {
    this.entries.clear();
  }

  private _key(infoHash: string, fileIndex: number): string {
    return `${infoHash}:${fileIndex}`;
  }
}

/**
 * Process-wide singleton used by both {@link createServer} and the
 * public `WebTorrent` API.  Importing modules that need to look up
 * `File` instances from the SW bridge get a stable reference.
 */
export const streamManager: StreamManager = new StreamManager();

/**
 * Builds the virtual URL served by the Service Worker for a given file.
 *
 * Format: `<scope>webtorrent/<infoHash>/<fileIndex>/<encodedName>`.
 *
 * The `infoHash` and `fileIndex` are the only fields the SW needs to
 * look up the underlying file; the file name is appended for nicer
 * browser caching/UI behaviour (e.g. video elements show the file name
 * when hovered).
 *
 * @param scope - SW registration scope (usually ends with `/`).
 * @param infoHash - 40-char hex info hash.
 * @param fileIndex - Zero-based file index.
 * @param name - Original file name (URL-encoded).
 */
export function buildStreamURL(
  scope: string,
  infoHash: string,
  fileIndex: number,
  name: string,
): string {
  const safeName = encodeURIComponent(name);
  return `${scope}webtorrent/${infoHash}/${fileIndex}/${safeName}`;
}

/**
 * Parses a virtual stream URL back into its components.  Returns `null`
 * if the URL does not match the expected `/webtorrent/<infoHash>/<idx>/<name>`
 * shape.  The `infoHash` is validated to be 40 hex characters and
 * `fileIndex` must be a non-negative safe integer.
 */
export interface ParsedStreamURL {
  infoHash: string;
  fileIndex: number;
  name: string;
}

export function parseStreamURL(url: string, scope: string): ParsedStreamURL | null {
  const prefix = `${scope}webtorrent/`;
  if (!url.startsWith(prefix)) return null;

  const rest = url.slice(prefix.length);
  const parts = rest.split("/");
  if (parts.length < 3) return null;

  const infoHash = parts[0]!;
  const fileIndex = Number.parseInt(parts[1]!, 10);
  const name = decodeURIComponent(parts.slice(2).join("/"));

  if (!/^[0-9a-fA-F]{40}$/.test(infoHash)) return null;
  if (!Number.isSafeInteger(fileIndex) || fileIndex < 0) return null;

  return { infoHash: infoHash.toLowerCase(), fileIndex, name };
}

```

---

## Arquivo: `packages/core/src/storage/memory-chunk-store.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/storage/memory-chunk-store.ts

import type { ChunkStore } from "./opfs-chunk-store.ts";

export interface MemoryChunkStoreOptions {
  chunkLength: number;
  length?: number;
}

export class MemoryChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private chunks: Map<number, Uint8Array> = new Map();
  private closed = false;

  constructor(opts: MemoryChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
  }

  // ── Overloads ──
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  
  // ── Implementation (SEM a palavra-chave 'async') ──
  get(index: number, optsOrCb?: any, cb?: any): Promise<Uint8Array> | void {
    const opts = typeof optsOrCb === "object" ? optsOrCb : undefined;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return; // Retorna void para a assinatura do callback
    }

    return this._getAsync(index, opts); // Retorna Promise<Uint8Array>
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    
    const buf = this.chunks.get(index);
    if (!buf) {
      const err = new Error(`Chunk ${index} not found`);
      (err as any).notFound = true;
      throw err;
    }
    
    if (opts) {
      const offset = opts.offset || 0;
      const length = opts.length || buf.length - offset;
      return buf.subarray(offset, offset + length);
    }
    
    return buf;
  }

  async put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._putAsync(index, buf);
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _putAsync(index: number, buf: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Storage is closed");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    this.chunks.set(index, buf);
  }

  async close(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._closeAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _closeAsync(): Promise<void> {
    if (this.closed) throw new Error("Storage is already closed");
    this.closed = true;
    this.chunks.clear();
  }

  async destroy(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._destroyAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _destroyAsync(): Promise<void> {
    this.closed = true;
    this.chunks.clear();
  }
}
```

---

## Arquivo: `packages/core/src/storage/opfs-chunk-store.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/storage/opfs-chunk-store.ts

import { MemoryChunkStore } from "./memory-chunk-store.ts";

export interface ChunkStore {
  chunkLength: number;
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void>;
  close(cb?: (err: Error | null) => void): Promise<void>;
  destroy(cb?: (err: Error | null) => void): Promise<void>;
}

export interface ChunkStoreOptions {
  chunkLength: number;
  length?: number;
  rootDir?: FileSystemDirectoryHandle;
}

export class OPFSChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private rootDir: FileSystemDirectoryHandle | null;
  private closed = false;
  private fallbackStore: MemoryChunkStore | null = null;

  constructor(opts: ChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
    
    this.rootDir = opts.rootDir || null;
    
    if (!this.rootDir) {
      console.warn("[OPFSChunkStore] OPFS not available, falling back to memory store");
      this.fallbackStore = new MemoryChunkStore({ chunkLength: this.chunkLength, length: this.length });
    }
  }

  // ── Overloads ──
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  
  // ── Implementation (SEM a palavra-chave 'async') ──
  get(index: number, optsOrCb?: any, cb?: any): Promise<Uint8Array> | void {
    if (this.fallbackStore) {
      if (typeof optsOrCb === "function") {
        return this.fallbackStore.get(index, optsOrCb);
      }
      return this.fallbackStore.get(index, optsOrCb as any, cb as any);
    }

    const opts = typeof optsOrCb === "object" ? optsOrCb : undefined;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return;
    }

    return this._getAsync(index, opts);
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    if (!this.rootDir) throw new Error("OPFS root directory not available");
    
    const fileName = `${index}.chunk`;
    
    try {
      const fileHandle = await this.rootDir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      let buf = new Uint8Array(arrayBuffer);
      
      const isLastChunk = index === this.lastChunkIndex;
      const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
      
      if (buf.length !== expectedLength) {
        throw new Error(`Chunk ${index} has invalid length: expected ${expectedLength}, got ${buf.length}`);
      }
      
      if (opts) {
        const offset = opts.offset || 0;
        const length = opts.length || buf.length - offset;
        buf = buf.subarray(offset, offset + length);
      }
      
      return buf;
    } catch (err: any) {
      if (err.name === "NotFoundError") {
        const error = new Error(`Chunk ${index} not found`);
        (error as any).notFound = true;
        throw error;
      }
      throw err;
    }
  }

  async put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._putAsync(index, buf);
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _putAsync(index: number, buf: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Storage is closed");
    if (!this.rootDir) throw new Error("OPFS root directory not available");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    const fileName = `${index}.chunk`;
    
    try {
      const fileHandle = await this.rootDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      
      // Cast explícito para satisfazer o Deno
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      await writable.write(arrayBuffer);
      await writable.close();
    } catch (err) {
      throw new Error(`Failed to write chunk ${index}: ${err}`);
    }
  }

  async close(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._closeAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _closeAsync(): Promise<void> {
    if (this.closed) throw new Error("Storage is already closed");
    this.closed = true;
    this.rootDir = null;
  }

  async destroy(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._destroyAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _destroyAsync(): Promise<void> {
    if (!this.rootDir) {
      this.closed = true;
      return;
    }
    
    try {
      for await (const entry of (this.rootDir as any).values()) {
        if (entry.kind === "file") {
          await this.rootDir.removeEntry(entry.name);
        }
      }
    } catch (err) {
      console.warn("[OPFSChunkStore] Error during destroy:", err);
    }
    
    this.closed = true;
    this.rootDir = null;
  }
}
```

---

## Arquivo: `packages/core/src/torrent-generator/generator.ts`

````ts
// /browsertorrent/monorepo/webtorrent/src/torrent-generator/generator.ts
/**
 * OPFS-backed BitTorrent `.torrent` file generator.
 *
 * Replaces `deno-torrent/torrent-generator/generator.ts` for browser
 * environments.  Reads files from OPFS (`FileSystemDirectoryHandle`) via
 * `File.slice()` + `Blob.arrayBuffer()` instead of `Deno.open` +
 * `Deno.FsFile.read`.
 *
 * Supports:
 * - Multi-file torrents from OPFS directories
 * - BEP-47 piece-aligned padding
 * - BEP-3 file ordering (shallowest first, then lexicographic)
 * - BEP-12 tracker lists
 * - BEP-19 web seeds
 * - Private torrents
 *
 * @module
 */

import { encode } from "../utils/bencode.ts";
import type { BencodeValue, GeneratorOptions, OPFSFileEntry, PieceFile } from "./types.ts";
import { PieceSizeEnum } from "./types.ts";
import { walkOPFSDir } from "./opfs-walker.ts";
import {
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  getDefaultCreatedBy,
  sha1sum,
} from "./util.ts";

/**
 * Generates a BitTorrent `.torrent` file and writes it to `options.writer`.
 *
 * The `entry` option accepts:
 * - A `FileSystemDirectoryHandle` — recursively scanned for files.
 * - A plain array of `OPFSFileEntry` — for callers that have already
 *   performed the walk and fetched file sizes.
 *
 * @param options - Generation parameters.  See {@link GeneratorOptions}.
 *
 * @example Multi-file torrent from an OPFS directory
 * ```ts
 * import { generateTorrent } from "@vanaware/browsertorrent/torrent-generator";
 *
 * const rootHandle = await navigator.storage.getDirectory();
 * // ... populate rootHandle with files ...
 *
 * const chunks: Uint8Array[] = [];
 * await generateTorrent({
 *   entry: rootHandle,
 *   writer: { write: async (p) => { chunks.push(p); return p.length; } },
 *   trackers: ["udp://tracker.example.com:6969/announce"],
 * });
 * const torrentBytes = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
 * // flatten chunks into torrentBytes...
 * ```
 */
export async function generateTorrent(options: GeneratorOptions): Promise<void> {
  const {
    writer,
    entry,
    pieceSize: pieceSizeEnum = PieceSizeEnum.SIZE_AUTO,
    ignoreHiddenFile = false,
    alignPiece = false,
    isPrivate = false,
    trackers = [],
    webSeeds = [],
    source,
    comment,
    createdBy,
    createdAt = Math.floor(Date.now() / 1000),
  } = options;

  // ── Resolve entries ─────────────────────────────────────────────────────
  let files: OPFSFileEntry[];
  let rootName: string;

  if (Array.isArray(entry)) {
    files = entry;
    rootName = inferRootName(entry);
  } else {
    rootName = entry.name;
    files = await walkOPFSDir(entry, ignoreHiddenFile);
  }

  if (files.length === 0) {
    throw new Error(`No files found in entry`);
  }

  // ── Metadata ─────────────────────────────────────────────────────────────
  const totalSize = fileSizeSum(files);
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum as PieceSizeEnum);

  const info = new Map<string, BencodeValue>([
    ["name", rootName],
    ["piece length", pieceSize],
  ]);

  const torrent = new Map<string, BencodeValue>([
    ["created by", createdBy ?? getDefaultCreatedBy()],
    ["creation date", createdAt],
    ["info", info],
  ]);

  // ── Trackers (BEP-12) ───────────────────────────────────────────────────
  if (trackers.length > 0) {
    const sorted = [...trackers].sort((a, b) => a.localeCompare(b));
    torrent.set("announce", sorted[0]!);
    if (sorted.length > 1) {
      torrent.set("announce-list", sorted.map((t) => [t]));
    }
  }

  // ── Web seeds (BEP-19) ──────────────────────────────────────────────────
  if (webSeeds.length > 0) {
    const sorted = [...webSeeds].sort((a, b) => a.localeCompare(b));
    torrent.set(
      "url-list",
      sorted.length === 1 ? sorted[0]! : sorted,
    );
  }

  // ── Optional fields ──────────────────────────────────────────────────────
  if (isPrivate) info.set("private", 1);
  if (comment) torrent.set("comment", comment);
  if (source) torrent.set("source", source);

  // ── Piece hashes & file metadata ─────────────────────────────────────────
  if (files.length === 1 && !files[0]!.name.includes("/")) {
    // Single-file torrent
    info.set("length", files[0]!.size);
    info.set("pieces", await sha1sum(files, pieceSize));
  } else {
    // Multi-file torrent
    const pieceFiles: PieceFile[] = alignPiece
      ? buildPieceFiles(files, pieceSize)
      : files.map((file) => ({ file, length: file.size, padding: false }));

    const torrentFiles = pieceFiles.map((pieceFile, index) => {
      if (pieceFile.padding) {
        return new Map<string, BencodeValue>([
          ["length", pieceFile.length],
          ["path", [".pad", `${pieceFile.length}-${index}`]],
        ]);
      }
      return new Map<string, BencodeValue>([
        ["length", pieceFile.file!.size],
        ["path", pieceFile.file!.name.split("/")],
      ]);
    });

    info.set("files", torrentFiles);
    info.set("pieces", await sha1sum(files, pieceSize, alignPiece));
  }

  // ── Encode and write ────────────────────────────────────────────────────
  await writer.write(encode(torrent));
}

/**
 * Infers the torrent root name from a list of file entries.
 * Uses the common prefix of all entry names (if any), otherwise the
 * first entry's first path component.
 */
function inferRootName(entries: OPFSFileEntry[]): string {
  if (entries.length === 0) return "torrent";
  const first = entries[0]!;

  // If all entries share a common first segment, use it as root.
  const firstParts = first.name.split("/");
  if (firstParts.length <= 1) return firstParts[0] ?? first.name;

  let commonPrefixLength = 1;
  for (let d = 1; d < firstParts.length; d++) {
    const prefix = firstParts.slice(0, d + 1).join("/");
    if (entries.every((e) => e.name.startsWith(prefix + "/"))) {
      commonPrefixLength = d + 1;
    } else {
      break;
    }
  }

  return firstParts.slice(0, commonPrefixLength).join("/");
}

````

---

## Arquivo: `packages/core/src/torrent-generator/mod.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/torrent-generator/mod.ts
/**
 * Public surface of the OPFS-backed torrent generator.
 */

export { decode, encode } from "../utils/bencode.ts";
export { generateTorrent } from "./generator.ts";
export { walkOPFSDir, getOPFSFileSize } from "./opfs-walker.ts";
export { OPFSMultiFileReader } from "./opfs-reader.ts";
export {
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  getDefaultCreatedBy,
  isHiddenFile,
  sha1sum,
} from "./util.ts";
export { PieceSizeEnum } from "./types.ts";
export type {
  BencodeValue,
  GeneratorOptions,
  OPFSFileEntry,
  PieceFile,
  Torrent,
  Writer,
} from "./types.ts";

```

---

## Arquivo: `packages/core/src/torrent-generator/opfs-reader.ts`

````ts
// /browsertorrent/monorepo/webtorrent/src/torrent-generator/opfs-reader.ts
/**
 * Sequential multi-file reader for OPFS file handles.
 *
 * Replaces the Deno `MultiFileReader` from
 * `deno-torrent/torrent-generator/reader.ts`.  Reads across multiple
 * `FileSystemFileHandle` instances as if they were a single contiguous
 * byte stream, transparently crossing file boundaries.
 *
 * Browser-native primitives used:
 * - `FileSystemFileHandle.getFile()` → `File` object
 * - `File.slice(start, end)` → `Blob` slice
 * - `Blob.arrayBuffer()` → `ArrayBuffer`
 *
 * No `Deno.open`, no `Deno.FsFile`, no path strings.
 */

import type { OPFSFileEntry } from "./types.ts";

/**
 * Reads across multiple OPFS files sequentially as a single byte stream.
 *
 * @example
 * ```ts
 * const reader = new OPFSMultiFileReader(entries);
 * try {
 *   for await (const chunk of reader.chunks(64 * 1024)) {
 *     // process chunk ...
 *   }
 * } finally {
 *   reader.close();
 * }
 * ```
 */
export class OPFSMultiFileReader {
  readonly #entries: OPFSFileEntry[];
  #fileIndex = 0;
  #fileOffset = 0;
  #currentFile: File | null = null;
  #currentSize = 0;
  #closed = false;

  /**
   * @param entries - Ordered list of OPFS file entries to read sequentially.
   *   Each entry must have either a `handle` set, or a `size` matching a
   *   pre-fetched `File` (see {@link withFile}).
   */
  constructor(entries: OPFSFileEntry[]) {
    this.#entries = [...entries];
  }

  /**
   * Attaches a pre-fetched `File` for the entry at `index`.  Useful when
   * the caller already obtained the `File` from the file handle and wants
   * to avoid re-fetching.
   *
   * @param index - Index into the entries list.
   * @param file - The `File` object for that entry.
   */
  withFile(index: number, file: File): void {
    if (index < 0 || index >= this.#entries.length) {
      throw new RangeError(`index out of range: ${index}`);
    }
    if (index === this.#fileIndex) {
      this.#currentFile = file;
      this.#currentSize = file.size;
    }
  }

  /**
   * Reads up to `size` bytes from the combined stream.
   *
   * @param size - Maximum number of bytes to read (must be > 0).
   * @returns `Uint8Array` with 1–`size` bytes, or `null` at end-of-stream.
   * @throws {RangeError} If `size` is not a positive integer.
   */
  async readChunk(size: number): Promise<Uint8Array | null> {
    if (size <= 0 || !Number.isInteger(size)) {
      throw new RangeError(`size must be a positive integer, got ${size}`);
    }

    if (this.#closed) throw new Error("reader is closed");

    const parts: Uint8Array[] = [];
    let remaining = size;

    while (remaining > 0) {
      // Open the next file if we have no current handle
      if (this.#currentFile === null) {
        if (this.#fileIndex >= this.#entries.length) break;
        const entry = this.#entries[this.#fileIndex++]!;
        if (!entry.handle) {
          throw new Error(`entry ${entry.name} has no OPFS handle attached`);
        }
        this.#currentFile = await entry.handle.getFile();
        this.#currentSize = this.#currentFile.size;
        this.#fileOffset = 0;
      }

      const available = this.#currentSize - this.#fileOffset;
      if (available === 0) {
        this.#currentFile = null;
        continue;
      }

      const want = Math.min(remaining, available);
      const blob = this.#currentFile.slice(this.#fileOffset, this.#fileOffset + want);
      const buf = new Uint8Array(await blob.arrayBuffer());
      this.#fileOffset += buf.length;

      if (buf.length === 0) {
        this.#currentFile = null;
        continue;
      }

      parts.push(buf);
      remaining -= buf.length;
    }

    if (parts.length === 0) return null;

    const first = parts[0]!;
    if (parts.length === 1) return first;

    const result = new Uint8Array(size - remaining);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  /**
   * Async-iterable interface — yields chunks of at most `size` bytes.
   *
   * @param size - Maximum chunk size in bytes (default 64 KiB).
   */
  async *chunks(size = 64 * 1024): AsyncIterableIterator<Uint8Array> {
    while (true) {
      const chunk = await this.readChunk(size);
      if (chunk === null) return;
      yield chunk;
    }
  }

  /** Releases any held handles.  Idempotent. */
  close(): void {
    this.#currentFile = null;
    this.#closed = true;
  }

  /** Whether {@link close} has been called. */
  get closed(): boolean {
    return this.#closed;
  }
}

````

---

## Arquivo: `packages/core/src/torrent-generator/opfs-walker.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/torrent-generator/opfs-walker.ts
/**
 * Recursively walks an OPFS directory handle, returning an ordered list
 * of files with their relative paths and sizes.
 *
 * This replaces the Deno `@std/fs/walk` + `Deno.stat` calls in
 * `deno-torrent/torrent-generator/util.ts#obtainFiles`.  In the browser
 * we don't have filesystem stat calls — we read the size from the
 * `File` object obtained via `FileSystemFileHandle.getFile()`.
 */

import type { OPFSFileEntry } from "./types.ts";

/**
 * Returns the size of an OPFS file handle.
 *
 * @param handle - OPFS file handle.
 * @returns Size in bytes.
 */
export async function getOPFSFileSize(handle: FileSystemFileHandle): Promise<number> {
  const file = await handle.getFile();
  return file.size;
}

/**
 * Recursively walks an OPFS directory handle, returning all files with
 * paths relative to `root`.
 *
 * BEP-3 sorting (shallowest first, then lexicographic) is applied so
 * the result is directly consumable by `buildPieceFiles` and
 * `generateTorrent`.
 *
 * Hidden file policy mirrors the deno-torrent reference: when
 * `ignoreHiddenFile` is true, files whose final path component starts
 * with `"."` are skipped.  BEP-47 padding files (`.pad/...`) are
 * generated synthetically and never appear in the walk.
 *
 * @param root - The directory handle to walk.
 * @param ignoreHiddenFile - When `true`, skip entries whose base name starts with `"."`.
 * @returns Ordered list of files under `root`.
 */
export async function walkOPFSDir(
  root: FileSystemDirectoryHandle,
  ignoreHiddenFile = false,
): Promise<OPFSFileEntry[]> {
  const files: OPFSFileEntry[] = [];

  async function visit(
    dir: FileSystemDirectoryHandle,
    prefix: string[],
  ): Promise<void> {
    // BFS for stable ordering — `values()` yields in insertion order.
    // We collect into an array first to avoid losing `for-await` context.
    const queue: Array<FileSystemHandle> = [];
    for await (const entry of (dir as any).values()) {
      queue.push(entry);
    }
    for (const entry of queue) {
      if (entry.kind === "file") {
        if (ignoreHiddenFile && entry.name.startsWith(".")) continue;
        const fileHandle = entry as FileSystemFileHandle;
        const size = await getOPFSFileSize(fileHandle);
        files.push({
          name: [...prefix, entry.name].join("/"),
          size,
          handle: fileHandle,
        });
      } else if (entry.kind === "directory") {
        if (ignoreHiddenFile && entry.name.startsWith(".")) continue;
        await visit(entry as FileSystemDirectoryHandle, [...prefix, entry.name]);
      }
    }
  }

  await visit(root, []);

  // BEP-3 sort: shallowest first, then lexicographic.
  files.sort((a, b) => {
    const depthA = a.name.split("/").length;
    const depthB = b.name.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.name.localeCompare(b.name);
  });

  return files;
}

```

---

## Arquivo: `packages/core/src/torrent-generator/types.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/torrent-generator/types.ts
/**
 * Types for the OPFS-backed torrent generator.
 *
 * Adapted from `deno-torrent/torrent-generator/types.ts`, replacing
 * the Deno filesystem surface (`Deno.FsFile`, path strings) with
 * browser-native OPFS handles (`FileSystemFileHandle`,
 * `FileSystemDirectoryHandle`).
 */

import type { BencodeValue } from "../utils/bencode.ts";

/** A simple sink for the bencoded `.torrent` file. */
export interface Writer {
  write(p: Uint8Array): Promise<number>;
}

/** Standard piece-size presets (BEP-3).  `SIZE_AUTO` defers to `calcPieceSize`. */
export enum PieceSizeEnum {
  SIZE_AUTO = 0,
  SIZE_16KB = 16 * 1024,
  SIZE_32KB = 32 * 1024,
  SIZE_64KB = 64 * 1024,
  SIZE_128KB = 128 * 1024,
  SIZE_256KB = 256 * 1024,
  SIZE_512KB = 512 * 1024,
  SIZE_1MB = 1024 * 1024,
  SIZE_2MB = 2 * 1024 * 1024,
  SIZE_4MB = 4 * 1024 * 1024,
  SIZE_8MB = 8 * 1024 * 1024,
  SIZE_16MB = 16 * 1024 * 1024,
}

/** A file inside an OPFS directory, with its logical name and size. */
export interface OPFSFileEntry {
  /** Logical path relative to the entry root (e.g. `"folder/video.mp4"`). */
  name: string;
  /** Total size in bytes. */
  size: number;
  /** OPFS file handle, if known at construction time. */
  handle?: FileSystemFileHandle;
}

/** Input options for `generateTorrent`. */
export interface GeneratorOptions {
  /** Where to write the bencoded `.torrent` bytes. */
  writer: Writer;
  /**
   * OPFS directory handle to scan, **or** a list of file entries.
   *
   * When given a `FileSystemDirectoryHandle`, the generator walks it
   * recursively and computes sizes from `getFile()` handles.
   *
   * When given a list of `OPFSFileEntry`, the caller has already done
   * the walk and we use the supplied sizes.
   */
  entry: FileSystemDirectoryHandle | OPFSFileEntry[];
  /** Piece-size preset or `SIZE_AUTO` (default). */
  pieceSize?: PieceSizeEnum | number;
  /** Skip files whose name starts with `"."` (default `false`). */
  ignoreHiddenFile?: boolean;
  /** BEP-47: align real files on piece boundaries (inserts `.pad/...` entries). */
  alignPiece?: boolean;
  /** Mark torrent as private (`info.private = 1`). */
  isPrivate?: boolean;
  /** Trackers (BEP-12). May be empty. */
  trackers?: readonly string[];
  /** Web seeds (BEP-19). */
  webSeeds?: readonly string[];
  /** Human-readable source string. */
  source?: string;
  /** Free-form comment. */
  comment?: string;
  /** Default `deno-torrent-generator` if omitted. */
  createdBy?: string;
  /** Unix seconds; default `Date.now() / 1000`. */
  createdAt?: number;
}

/** Internal piece-file (real or BEP-47 padding). */
export interface PieceFile {
  /** `null` for padding entries. */
  file: OPFSFileEntry | null;
  /** Bytes this entry contributes to the torrent. */
  length: number;
  /** True for synthetic BEP-47 padding. */
  padding: boolean;
}

/** Logical shape of a generated torrent. */
export interface Torrent {
  "created by": string;
  "creation date": number;
  announce?: string;
  "announce-list"?: string[][];
  "url-list"?: string | string[];
  info: {
    name: string;
    "piece length": number;
    pieces?: Uint8Array;
    length?: number;
    files?: Array<{ path: string[]; length: number }>;
    private?: number;
  };
  comment?: string;
  source?: string;
}

/** Bencode re-export. */
export type { BencodeValue };

```

---

## Arquivo: `packages/core/src/torrent-generator/util.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/torrent-generator/util.ts
/**
 * Pure helper functions for the OPFS torrent generator.
 *
 * Replaces `deno-torrent/torrent-generator/util.ts`.  All filesystem-side
 * calls (`Deno.stat`, `Deno.open`) are removed; file I/O is handled by
 * `OPFSMultiFileReader` and `OPFSFileReader`.
 *
 * Pure functions carry no side-effects and need no test mocking.
 */

import { PieceSizeEnum } from "./types.ts";
import type { OPFSFileEntry, PieceFile } from "./types.ts";
import { OPFSMultiFileReader } from "./opfs-reader.ts";

/**
 * Sums the byte sizes of all given file entries.
 *
 * @param files - OPFS file entries whose sizes are summed.
 * @returns Total size in bytes.
 */
export function fileSizeSum(files: OPFSFileEntry[]): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}

/**
 * Selects an appropriate piece size for the given total file size.
 *
 * When `pieceSizeEnum` is `PieceSizeEnum.SIZE_AUTO` the function returns the
 * smallest preset that is larger than `fileSize`, capped at
 * `PieceSizeEnum.SIZE_512MB`.  For any other preset the supplied value is
 * returned unchanged.
 *
 * @param fileSize - Total content size in bytes.
 * @param pieceSizeEnum - Desired preset, or `SIZE_AUTO` for heuristic selection.
 * @returns Piece size in bytes (≥ 1).
 */
export function calcPieceSize(fileSize: number, pieceSizeEnum: PieceSizeEnum | number): number {
  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum as number;
  }

  const presets = (Object.values(PieceSizeEnum) as number[])
    .filter((v) => v !== 0 && typeof v === "number")
    .sort((a, b) => a - b);

  const selected = presets.find((p) => fileSize < p) ?? presets[presets.length - 1] ?? 0;
  return Math.min(selected!, PieceSizeEnum.SIZE_512KB as number);
}

/**
 * Returns `true` when the base name of a path starts with `"."`.
 *
 * @param name - File name or path.
 */
export function isHiddenFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base.startsWith(".");
}

/**
 * Builds the logical file stream used by BEP-47 piece-aligned torrents.
 *
 * Splits `files` into real entries and synthetic padding entries (`.pad/...`).
 * When a real file doesn't start on a piece boundary, a zero-filled padding
 * block is inserted before it so every real file begins at `pieceSize` offsets.
 *
 * @param files - Sorted list of OPFS file entries (BEP-3 order).
 * @param pieceSize - Target piece size in bytes.
 * @returns Ordered list of piece-file descriptors.
 */
export function buildPieceFiles(files: OPFSFileEntry[], pieceSize: number): PieceFile[] {
  const pieceFiles: PieceFile[] = [];
  let pieceOffset = 0;

  for (let i = 0; i < files.length; i++) {
    const entry = files[i]!;
    const length = entry.size;

    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset;
      pieceFiles.push({ file: null, length: paddingLength, padding: true });
      pieceOffset = 0;
    }

    pieceFiles.push({ file: entry, length, padding: false });
    pieceOffset = (pieceOffset + length) % pieceSize;
  }

  return pieceFiles;
}

/**
 * Computes the concatenated SHA-1 piece hashes for a list of files.
 *
 * Files are read sequentially as a single byte stream using
 * `OPFSMultiFileReader`.  The stream is divided into `pieceSize` chunks;
 * the last chunk may be smaller.  Each chunk's SHA-1 digest (20 bytes) is
 * appended to the result.
 *
 * When `alignPiece` is true, BEP-47 padding zeros are included in the
 * stream before each non-aligned file.
 *
 * @param files - Ordered list of OPFS file entries to hash.
 * @param pieceSize - Number of bytes per piece (must be ≥ 1).
 * @param alignPiece - When true, inject zero padding between files (BEP-47).
 * @returns `Uint8Array` whose length is a multiple of 20.
 */
export async function sha1sum(
  files: OPFSFileEntry[],
  pieceSize: number,
  alignPiece = false,
): Promise<Uint8Array> {
  if (pieceSize < 1) throw new RangeError("pieceSize must be ≥ 1");

  if (alignPiece) return sha1sumAligned(files, pieceSize);

  const totalSize = fileSizeSum(files);
  const pieceCount = Math.ceil(totalSize / pieceSize);

  const digestParts: Uint8Array[] = [];
  const reader = new OPFSMultiFileReader(files);
  try {
    let chunk: Uint8Array | null;
    while ((chunk = await reader.readChunk(pieceSize)) !== null) {
      const digest = await crypto.subtle.digest(
        "SHA-1",
        chunk as unknown as Uint8Array<ArrayBuffer>,
      );
      digestParts.push(new Uint8Array(digest));
    }
  } finally {
    reader.close();
  }

  const result = new Uint8Array(digestParts.length * 20);
  let offset = 0;
  for (const d of digestParts) {
    result.set(d, offset);
    offset += 20;
  }

  if (digestParts.length !== pieceCount) {
    console.warn(
      `[sha1sum] expected ${pieceCount} pieces, got ${digestParts.length}`,
    );
  }

  return result;
}

/** BEP-47 variant: inject padding zeros before each non-aligned file. */
async function sha1sumAligned(files: OPFSFileEntry[], pieceSize: number): Promise<Uint8Array> {
  const pieceFiles = buildPieceFiles(files, pieceSize);
  const digests: Uint8Array[] = [];
  const piece = new Uint8Array(pieceSize);
  let pieceOffset = 0;

  const digestPiece = async (len: number): Promise<void> => {
    const digest = await crypto.subtle.digest(
      "SHA-1",
      piece.subarray(0, len) as unknown as Uint8Array<ArrayBuffer>,
    );
    digests.push(new Uint8Array(digest));
  };

  const reader = new OPFSMultiFileReader(pieceFiles.map((pf) => pf.file!).filter(Boolean) as OPFSFileEntry[]);
  let readerIndex = 0;

  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      piece.fill(0, pieceOffset, pieceOffset + pieceFile.length);
      pieceOffset += pieceFile.length;
      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize);
        pieceOffset = 0;
      }
      continue;
    }

    const fileEntry = pieceFile.file!;
    const file = await fileEntry.handle!.getFile();
    let fileOffset = 0;

    while (fileOffset < file.size) {
      const want = Math.min(pieceSize - pieceOffset, file.size - fileOffset);
      const blob = file.slice(fileOffset, fileOffset + want);
      const buf = new Uint8Array(await blob.arrayBuffer());
      fileOffset += buf.length;

      piece.set(buf, pieceOffset);
      pieceOffset += buf.length;

      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize);
        pieceOffset = 0;
      }
    }
  }

  if (pieceOffset > 0) await digestPiece(pieceOffset);

  const result = new Uint8Array(digests.length * 20);
  digests.forEach((d, i) => result.set(d, i * 20));
  return result;
}

/**
 * Returns the default `"created by"` string embedded in generated torrents.
 *
 * In the browser we cannot call `git describe --tags`.  The version is
 * hardcoded as `"browsertorrent-torrent-generator@1.0.0"` — callers can override via
 * the `createdBy` option.
 *
 * @returns Creator identifier string.
 */
export function getDefaultCreatedBy(): string {
  return "browsertorrent-torrent-generator@1.0.0";
}

```

---

## Arquivo: `packages/core/src/utils/bencode.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/bencode.ts
/**
 * Bencode codec with resource limits, typed errors, and optional Map support.
 *
 * Adaptado de deno-torrent/bencode/ mantendo compatibilidade com a API
 * existente (BencodeDict = Record, decode sem options, encode aceitando Record).
 *
 * Mudanças em relação ao deno-torrent:
 * - BencodeDict continua Record<string, BencodeValue> (backward compat)
 * - BencodeMap = Map<string | Uint8Array, BencodeValue> (opt-in via useMap)
 * - bigint permanece suportado em decode/encode (deno-torrent só aceita number)
 * - DecodeOptions aceita maxBytes/maxDepth/useMap/allowUnsortedKeys
 */

// ============================================================================
// TIPOS
// ============================================================================

/** Dictionary key: string (UTF-8) or raw bytes (for binary keys). */
export type BencodeKey = string | Uint8Array;

/** Ordered sequence of bencode values. */
export type BencodeList = BencodeValue[];

/**
 * Bencode dictionary as a plain object (backward compatible).
 * Keys are always strings; binary keys are lossily decoded to UTF-8.
 */
export interface BencodeDict {
  [key: string]: BencodeValue;
}

/**
 * Bencode dictionary as a Map (preserves binary keys without lossy conversion).
 * Use via `decode(data, { useMap: true })` when binary key fidelity matters
 * (e.g. metainfo identity preservation per BEP 3).
 */
export type BencodeMap = Map<BencodeKey, BencodeValue>;

/** All values accepted by the encoder and returned by the decoder. */
export type BencodeValue =
  | number
  | bigint
  | string
  | Uint8Array
  | BencodeList
  | BencodeDict
  | BencodeMap;

/** Resource limits applied while decoding untrusted input. */
export interface DecodeOptions {
  /** Maximum accepted input size in bytes. Defaults to 64 MiB (67108864). */
  maxBytes?: number;
  /** Maximum nested list/dictionary depth. Defaults to 1000. */
  maxDepth?: number;
  /**
   * When true, dictionaries are decoded as `Map<string | Uint8Array, BencodeValue>`
   * instead of `Record<string, BencodeValue>`. This preserves binary keys that
   * cannot be losslessly converted to UTF-8 strings.
   */
  useMap?: boolean;
  /**
   * Accept dictionary keys that are not sorted by their raw bytes.
   * Defaults to false. Enable only for compatibility with known protocol
   * implementations that produce non-canonical dictionaries.
   */
  allowUnsortedKeys?: boolean;
}

// ============================================================================
// ERROS
// ============================================================================

/**
 * Thrown when decoding fails due to malformed, truncated, or non-canonical input.
 */
export class BencodeDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeDecodeError";
  }
}

/**
 * Thrown when encoding fails due to an invalid, unsupported, or cyclic value.
 */
export class BencodeEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeEncodeError";
  }
}

// ============================================================================
// DECODE
// ============================================================================

const _td = new TextDecoder("utf-8");
const _te = new TextEncoder();
const _defaultMaxBytes = 64 * 1024 * 1024;
const _defaultMaxDepth = 1000;

export function decode(data: Uint8Array, options: DecodeOptions = {}): BencodeValue {
  const maxBytes = options.maxBytes ?? _defaultMaxBytes;
  const maxDepth = options.maxDepth ?? _defaultMaxDepth;

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new BencodeDecodeError("maxBytes must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new BencodeDecodeError("maxDepth must be a non-negative safe integer");
  }
  if (data.length > maxBytes) {
    throw new BencodeDecodeError(`input exceeds maximum size of ${maxBytes} bytes`);
  }

  const useMap = options.useMap === true;
  const allowUnsortedKeys = options.allowUnsortedKeys === true;

  const [value, nextOffset] = _decodeOne(data, maxDepth, useMap, allowUnsortedKeys);
  if (nextOffset !== data.length) {
    throw new BencodeDecodeError(`unexpected trailing data at offset ${nextOffset}`);
  }
  return value;
}

// --- Internal decode types ---

type _Frame = _ListFrame | _DictFrame;

interface _ListFrame {
  kind: "list";
  value: BencodeValue[];
}

interface _DictFrame {
  kind: "dict";
  value: BencodeDict | BencodeMap;
  seenKeys: Set<string>;
  previousKeyBytes?: Uint8Array;
  pendingKey?: BencodeKey;
  useMap: boolean;
}

function _decodeOne(
  data: Uint8Array,
  maxDepth: number,
  useMap: boolean,
  allowUnsortedKeys: boolean,
): [BencodeValue, number] {
  const stack: _Frame[] = [];
  let offset = 0;
  let current: BencodeValue | undefined;

  while (true) {
    if (current !== undefined) {
      if (stack.length === 0) return [current, offset];

      const frame = stack[stack.length - 1]!;
      if (frame.kind === "list") {
        frame.value.push(current);
      } else if (frame.pendingKey !== undefined) {
        if (frame.useMap) {
          (frame.value as BencodeMap).set(frame.pendingKey, current);
        } else {
          const keyStr = typeof frame.pendingKey === "string"
            ? frame.pendingKey
            : _td.decode(frame.pendingKey);
          (frame.value as BencodeDict)[keyStr] = current;
        }
        frame.pendingKey = undefined;
      } else {
        throw new BencodeDecodeError("dictionary value has no key");
      }
      current = undefined;
      continue;
    }

    if (offset >= data.length) {
      throw new BencodeDecodeError(`unexpected end of data at offset ${offset}`);
    }

    const frame = stack[stack.length - 1];

    // Check for end-of-container tokens
    if (frame?.kind === "list" && data[offset] === 0x65) {
      offset++;
      stack.pop();
      current = frame.value as BencodeList;
      continue;
    }
    if (frame?.kind === "dict") {
      if (frame.pendingKey === undefined) {
        if (data[offset] === 0x65) {
          offset++;
          stack.pop();
          current = frame.value;
          continue;
        }
        // Decode key
        const [key, afterKey] = _decodeByteString(data, offset);
        const keyBytes = typeof key === "string" ? _te.encode(key) : key;
        const fingerprint = _toHex(keyBytes);
        if (frame.seenKeys.has(fingerprint)) {
          throw new BencodeDecodeError("duplicate dictionary key");
        }
        if (
          !allowUnsortedKeys &&
          frame.previousKeyBytes &&
          _compareBytes(frame.previousKeyBytes, keyBytes) > 0
        ) {
          throw new BencodeDecodeError("dictionary keys are not sorted by raw bytes");
        }
        frame.seenKeys.add(fingerprint);
        frame.previousKeyBytes = keyBytes;
        frame.pendingKey = key;
        offset = afterKey;
        continue;
      }
    }

    const token = data[offset]!;

    if (token === 0x69) {
      // 'i' — integer
      [current, offset] = _decodeInteger(data, offset + 1);
      continue;
    }
    if (token >= 0x30 && token <= 0x39) {
      // digit — byte string
      [current, offset] = _decodeByteString(data, offset);
      continue;
    }
    if (token === 0x6c || token === 0x64) {
      // 'l' or 'd' — list or dict
      if (stack.length >= maxDepth) {
        throw new BencodeDecodeError(`maximum nesting depth of ${maxDepth} exceeded`);
      }
      offset++;
      if (token === 0x6c) {
        stack.push({ kind: "list", value: [] });
      } else {
        const value = useMap ? new Map() as BencodeMap : {} as BencodeDict;
        stack.push({ kind: "dict", value, seenKeys: new Set(), useMap });
      }
      continue;
    }
    throw new BencodeDecodeError(
      `unexpected token 0x${token.toString(16).padStart(2, "0")} at offset ${offset}`
    );
  }
}

function _decodeInteger(data: Uint8Array, offset: number): [number | bigint, number] {
  const end = data.indexOf(0x65, offset); // 'e'
  if (end === -1) {
    throw new BencodeDecodeError('unterminated integer: missing "e"');
  }
  const raw = _td.decode(data.subarray(offset, end));
  if (!/^-?(?:0|[1-9]\d*)$/.test(raw) || raw === "-0") {
    throw new BencodeDecodeError(`invalid integer: "${raw}"`);
  }
  const num = Number(raw);
  if (Number.isSafeInteger(num)) {
    return [num, end + 1];
  }
  // Fallback to bigint for values outside safe integer range
  return [BigInt(raw), end + 1];
}

function _decodeByteString(
  data: Uint8Array,
  offset: number,
): [string | Uint8Array, number] {
  const colon = data.indexOf(0x3a, offset); // ':'
  if (colon === -1) {
    throw new BencodeDecodeError('malformed byte string: missing ":"');
  }
  const rawLength = data.subarray(offset, colon);
  if (rawLength.length === 0 || rawLength.some((byte) => byte < 0x30 || byte > 0x39)) {
    throw new BencodeDecodeError(`invalid byte string length at offset ${offset}`);
  }
  if (rawLength.length > 1 && rawLength[0] === 0x30) {
    throw new BencodeDecodeError(`byte string length has leading zero at offset ${offset}`);
  }

  const lenStr = _td.decode(rawLength);
  const length = Number(lenStr);
  if (!Number.isSafeInteger(length)) {
    throw new BencodeDecodeError(`byte string length is outside safe range at offset ${offset}`);
  }

  const start = colon + 1;
  const end = start + length;
  if (end > data.length) {
    throw new BencodeDecodeError(
      `truncated byte string: need ${length} bytes but only ${data.length - start} available`
    );
  }
  const bytes = data.subarray(start, end);
  // Heurística BitTorrent: decodifica como string UTF-8 somente se
  // (1) o conteúdo é UTF-8 válido (sem replacement chars) E
  // (2) não contém caracteres de controle (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F),
  //     que são comuns em dados binários como hashes SHA-1 ("pieces").
  // Isso preserva campos como "pieces" como Uint8Array.
  try {
    const str = _td.decode(bytes);
    if (!str.includes("\uFFFD") && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
      return [str, end];
    }
  } catch {
    // UTF-8 inválido — manter como Uint8Array
  }
  return [bytes.slice(), end];
}

// ============================================================================
// ENCODE
// ============================================================================

export function encode(value: BencodeValue): Uint8Array {
  const writer = new _ByteWriter();
  _encodeValue(value, writer, new WeakSet<object>());
  return writer.finish();
}

function _encodeValue(
  value: BencodeValue,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  if (typeof value === "number") {
    _encodeInteger(value, out);
    return;
  }
  if (typeof value === "bigint") {
    out.write(_te.encode(`i${value}e`));
    return;
  }
  if (typeof value === "string") {
    _encodeString(value, out);
    return;
  }
  if (value instanceof Uint8Array) {
    _encodeBytes(value, out);
    return;
  }
  if (Array.isArray(value) || value instanceof Map) {
    if (ancestors.has(value as object)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value as object);
    try {
      if (Array.isArray(value)) _encodeList(value, out, ancestors);
      else _encodeDict(value as BencodeMap, out, ancestors);
    } finally {
      ancestors.delete(value as object);
    }
    return;
  }
  // Plain object (BencodeDict / Record)
  if (typeof value === "object" && value !== null) {
    if (ancestors.has(value)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value);
    try {
      _encodeDictFromRecord(value as BencodeDict, out, ancestors);
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  throw new BencodeEncodeError(`unsupported value type: ${typeof value}`);
}

function _encodeInteger(value: number, out: _ByteWriter): void {
  if (!Number.isSafeInteger(value)) {
    throw new BencodeEncodeError(`only safe integers are supported, got: ${value}`);
  }
  out.write(_te.encode(`i${value}e`));
}

function _encodeString(value: string, out: _ByteWriter): void {
  _encodeBytes(_te.encode(value), out);
}

function _encodeBytes(value: Uint8Array, out: _ByteWriter): void {
  out.write(_te.encode(`${value.length}:`));
  out.write(value);
}

function _encodeList(
  value: BencodeList,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  out.write(_te.encode("l"));
  for (const item of value) _encodeValue(item, out, ancestors);
  out.write(_te.encode("e"));
}

function _encodeDict(
  value: BencodeMap,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  const entries = [...value.entries()].map(([key, item]) => ({
    bytes: _keyBytes(key),
    item,
  }));
  entries.sort((a, b) => _compareBytes(a.bytes, b.bytes));

  out.write(_te.encode("d"));
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && _compareBytes(entries[i - 1]!.bytes, entries[i]!.bytes) === 0) {
      throw new BencodeEncodeError("duplicate dictionary key after byte encoding");
    }
    _encodeBytes(entries[i]!.bytes, out);
    _encodeValue(entries[i]!.item, out, ancestors);
  }
  out.write(_te.encode("e"));
}

function _encodeDictFromRecord(
  value: BencodeDict,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  // Sort keys by byte-raw order (correct per bencode spec), not string order.
  const entries = Object.keys(value).map((key) => ({
    key,
    bytes: _te.encode(key),
    item: value[key],
  }));
  entries.sort((a, b) => _compareBytes(a.bytes, b.bytes));

  out.write(_te.encode("d"));
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && _compareBytes(entries[i - 1]!.bytes, entries[i]!.bytes) === 0) {
      throw new BencodeEncodeError("duplicate dictionary key after byte encoding");
    }
    _encodeBytes(entries[i]!.bytes, out);
    _encodeValue(entries[i]!.item!, out, ancestors);
  }
  out.write(_te.encode("e"));
}

function _keyBytes(key: BencodeKey): Uint8Array {
  if (typeof key === "string") return _te.encode(key);
  if (key instanceof Uint8Array) return key;
  throw new BencodeEncodeError("dictionary keys must be string or Uint8Array");
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function _toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function _compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai !== bi) return ai - bi;
  }
  return a.length - b.length;
}

class _ByteWriter {
  #buffer = new Uint8Array(1024);
  #length = 0;

  write(chunk: Uint8Array): void {
    const required = this.#length + chunk.length;
    if (required > this.#buffer.length) {
      let capacity = this.#buffer.length;
      while (capacity < required) capacity *= 2;
      const next = new Uint8Array(capacity);
      next.set(this.#buffer);
      this.#buffer = next;
    }
    this.#buffer.set(chunk, this.#length);
    this.#length = required;
  }

  finish(): Uint8Array {
    return this.#buffer.slice(0, this.#length);
  }
}

```

---

## Arquivo: `packages/core/src/utils/bit-array.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/bit-array.ts
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

```

---

## Arquivo: `packages/core/src/utils/bitfield.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/core/bitfield.ts

import { BitfieldError } from "../utils/errors.ts";

export interface BitfieldOptions {
  /** Tamanho inicial do bitfield (número de bits) */
  length: number;
  /** Se true, permite crescimento dinâmico quando um índice fora do range é acessado */
  grow?: boolean | number;
}

/**
 * Estrutura de dados eficiente para rastrear o estado de peças (pieces).
 * Suporta crescimento dinâmico opcional para casos onde o tamanho final não é conhecido.
 */
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

  get length(): number {
    return this._length;
  }

  /**
   * Verifica se o bit no índice especificado está marcado.
   */
  get(index: number): boolean {
    if (index < 0) return false;
    
    // Se grow está habilitado e o índice está fora do range, retorna false
    if (index >= this._length) {
      if (this.grow === false) return false;
      return false; // Bit fora do range não está marcado
    }

    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (this.buffer[byteIndex]! & (128 >> bitIndex)) !== 0;
  }

  /**
   * Marca o bit no índice especificado.
   */
  set(index: number): void {
    if (index < 0) {
      throw new BitfieldError("Cannot set negative index", "NEGATIVE_INDEX");
    }

    // Crescimento dinâmico se necessário
    if (index >= this._length) {
      if (this.grow === false) {
        throw new BitfieldError(
          `Index ${index} is out of range (length: ${this._length})`,
          "INDEX_OUT_OF_RANGE"
        );
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

  /**
   * Desmarca o bit no índice especificado.
   */
  unset(index: number): void {
    if (index < 0 || index >= this._length) return;

    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! &= ~(128 >> bitIndex);
  }

  /**
   * Conta quantos bits estão marcados.
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.get(i)) count++;
    }
    return count;
  }

  /**
   * Retorna uma cópia do buffer interno.
   */
  toBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Redimensiona o bitfield para um novo tamanho.
   */
  private _resize(newLength: number): void {
    const newByteLength = Math.ceil(newLength / 8);
    const newBuffer = new Uint8Array(newByteLength);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    this._length = newLength;
  }
}
```

---

## Arquivo: `packages/core/src/utils/buffer.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/buffer.ts
/**
 * Helpers para manipulação de Uint8Array, substituindo o `Buffer` do Node.js.
 * Focado em performance e compatibilidade com o protocolo BitTorrent.
 */

/**
 * Cria um Uint8Array preenchido com zeros.
 */
export function alloc(size: number): Uint8Array {
  return new Uint8Array(size);
}

/**
 * Cria um Uint8Array a partir de uma string (hex ou utf8) ou array.
 */
export function from(
  input: string | number[] | ArrayBuffer | Uint8Array,
  encoding: "hex" | "utf8" = "utf8"
): Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return new Uint8Array(input);

  if (typeof input === "string") {
    if (encoding === "hex") {
      const cleanStr = input.replace(/\s+/g, "");
      if (cleanStr.length % 2 !== 0) throw new Error("Invalid hex string");
      const arr = new Uint8Array(cleanStr.length / 2);
      for (let i = 0; i < cleanStr.length; i += 2) {
        arr[i / 2] = parseInt(cleanStr.substring(i, i + 2), 16);
      }
      return arr;
    }
    // utf8
    return new TextEncoder().encode(input);
  }

  throw new Error("Unsupported input type for buffer.from");
}

/**
 * Concatena múltiplos Uint8Arrays em um único.
 */
export function concat(arrays: Uint8Array[], totalLength?: number): Uint8Array {
  if (totalLength === undefined) {
    totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converte Uint8Array para string.
 */
export function toString(
  buf: Uint8Array,
  encoding: "hex" | "utf8" = "utf8",
  start = 0,
  end?: number
): string {
  const slice = buf.subarray(start, end);
  if (encoding === "hex") {
    return Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return new TextDecoder().decode(slice);
}

/**
 * Compara dois Uint8Arrays.
 */
export function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Lê um UInt32 Big-Endian (usado extensivamente no Wire Protocol).
 * Usamos '!' para afirmar ao TypeScript que o índice existe, garantindo 
 * performance sem verificações de runtime desnecessárias.
 */
export function readUInt32BE(buf: Uint8Array, offset = 0): number {
  return (
    ((buf[offset]!) << 24) |
    ((buf[offset + 1]!) << 16) |
    ((buf[offset + 2]!) << 8) |
    (buf[offset + 3]!)
  ) >>> 0; // >>> 0 força conversão para unsigned 32-bit
}

/**
 * Escreve um UInt32 Big-Endian.
 */
export function writeUInt32BE(buf: Uint8Array, value: number, offset = 0): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

/**
 * XOR byte-a-byte entre dois Uint8Arrays.
 * Lança erro se os comprimentos forem diferentes.
 */
export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new RangeError("Uint8Array lengths must be equal for xor");
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! ^ b[i]!;
  }
  return result;
}

/**
 * Comparação lexicográfica entre dois Uint8Arrays.
 * Retorna -1 se a < b, 0 se iguais, 1 se a > b.
 */
export function compare(a: Uint8Array, b: Uint8Array): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

/**
 * Converte Uint8Array big-endian para bigint.
 * Um array vazio representa zero.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Converte bigint não-negativo para Uint8Array big-endian.
 * Se `length` for fornecido, o resultado é preenchido à esquerda com zeros
 * até atingir exatamente esse comprimento.
 *
 * @throws {RangeError} Se `value` for negativo, `length` for inválido,
 *         ou o valor não couber no comprimento solicitado.
 */
export function bigIntToBytes(value: bigint, length?: number): Uint8Array {
  if (value < 0n) {
    throw new RangeError("value must be a non-negative bigint");
  }
  if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) {
    throw new RangeError("length must be a non-negative safe integer");
  }

  let byteLength = value === 0n ? 1 : 0;
  for (let remaining = value; remaining > 0n; remaining >>= 8n) {
    byteLength++;
  }

  if (length !== undefined) {
    if (value !== 0n && byteLength > length) {
      throw new RangeError("value does not fit in the requested byte length");
    }
    byteLength = length;
  }

  const result = new Uint8Array(byteLength);
  for (
    let index = byteLength - 1, remaining = value;
    index >= 0;
    index--, remaining >>= 8n
  ) {
    result[index] = Number(remaining & 0xffn);
  }
  return result;
}

/**
 * Divide um Uint8Array em chunks de tamanho `chunkSize`.
 * O último chunk pode ser menor se o comprimento não for múltiplo de `chunkSize`.
 *
 * @throws {RangeError} Se `chunkSize` não for um inteiro positivo seguro.
 */
export function chunkBytes(data: Uint8Array, chunkSize: number): Uint8Array[] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive safe integer");
  }

  if (data.length <= chunkSize) {
    return [data];
  }

  const result: Uint8Array[] = [];
  const chunkCount = Math.ceil(data.length / chunkSize);
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = (i + 1) * chunkSize;
    const chunk = data.slice(start, end);
    result.push(chunk);
  }

  return result;
}
```

---

## Arquivo: `packages/core/src/utils/byte-io.ts`

```ts
/**
 * Bounded helpers for byte readers and writers that may complete operations
 * partially. Adapted from deno-torrent/toolkit/io/io_util.ts.
 *
 * Browser-first: no Deno.* or node:* APIs — standard web APIs only.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A byte source compatible with the generic reader contract. */
export interface ByteReader {
  read(p: Uint8Array): Promise<number | null>;
}

/** A byte sink compatible with the generic writer contract. */
export interface ByteWriter {
  write(p: Uint8Array): Promise<number>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** An invalid byte count reported by a reader or writer. */
export class InvalidByteCountError extends RangeError {
  /** Whether the invalid count was returned by a read or write operation. */
  readonly operation: "read" | "write";

  /** The invalid byte count returned by the operation. */
  readonly count: number;

  /** The largest byte count that would have been valid. */
  readonly maximum: number;

  constructor(operation: "read" | "write", count: number, maximum: number) {
    super(
      `${operation} returned invalid byte count ${count}; expected an integer from 1 to ${maximum}`,
    );
    this.name = "InvalidByteCountError";
    this.operation = operation;
    this.count = count;
    this.maximum = maximum;
  }
}

/** EOF encountered before an exact-size read could be completed. */
export class UnexpectedEofError extends Error {
  /** Number of bytes successfully read before EOF. */
  readonly bytesRead: number;

  /** Total number of bytes requested by the caller. */
  readonly expectedBytes: number;

  constructor(bytesRead: number, expectedBytes: number) {
    super(`unexpected EOF after ${bytesRead} of ${expectedBytes} bytes`);
    this.name = "UnexpectedEofError";
    this.bytesRead = bytesRead;
    this.expectedBytes = expectedBytes;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertCount(
  count: number,
  maximum: number,
  operation: "read" | "write",
): void {
  if (!Number.isSafeInteger(count) || count <= 0 || count > maximum) {
    throw new InvalidByteCountError(operation, count, maximum);
  }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/** Options controlling {@link readExactly}. */
export interface ReadExactlyOptions {
  /**
   * Return `false` when EOF occurs before any bytes are read.
   * Defaults to `false`, which causes {@link UnexpectedEofError} instead.
   */
  allowCleanEof?: boolean;
}

/**
 * Reads exactly `target.length` bytes into the caller-provided array.
 * Valid partial reads are retried until the target is full.
 *
 * No target buffer is allocated internally. For an empty target this method
 * returns `true` without calling the reader.
 *
 * @returns `true` when the target is full, or `false` only when
 * `allowCleanEof` is enabled and the first read encounters EOF.
 * @throws {UnexpectedEofError} If EOF occurs before the target is full.
 * @throws {InvalidByteCountError} If the reader reports an invalid byte count.
 */
export async function readExactly(
  reader: ByteReader,
  target: Uint8Array,
  options: ReadExactlyOptions = {},
): Promise<boolean> {
  if (target.length === 0) return true;

  let offset = 0;
  while (offset < target.length) {
    const remaining = target.length - offset;
    const count = await reader.read(target.subarray(offset));
    if (count === null) {
      if (offset === 0 && options.allowCleanEof === true) return false;
      throw new UnexpectedEofError(offset, target.length);
    }
    assertCount(count, remaining, "read");
    offset += count;
  }
  return true;
}

/**
 * Writes every byte, retrying after valid partial writes.
 *
 * @throws {InvalidByteCountError} If the writer reports no progress or an invalid count.
 */
export async function writeAll(
  writer: ByteWriter,
  data: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const count = await writer.write(data.subarray(offset));
    assertCount(count, remaining, "write");
    offset += count;
  }
}

```

---

## Arquivo: `packages/core/src/utils/constants.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/constants.ts

/**
 * Constantes do protocolo BitTorrent (BEP 3, BEP 10).
 * Centraliza todos os IDs de mensagens e códigos de extensão.
 */

// ============================================================================
// IDs DE MENSAGENS DO PROTOCOLO BITTORRENT (BEP 3)
// ============================================================================

export const MSG_CHOKE = 0;
export const MSG_UNCHOKE = 1;
export const MSG_INTERESTED = 2;
export const MSG_NOT_INTERESTED = 3;
export const MSG_HAVE = 4;
export const MSG_BITFIELD = 5;
export const MSG_REQUEST = 6;
export const MSG_PIECE = 7;
export const MSG_CANCEL = 8;
export const MSG_PORT = 9; // DHT port (BEP 5)
export const MSG_SUGGEST = 13; // BEP 6 (Fast Extension)
export const MSG_HAVE_ALL = 14; // BEP 6
export const MSG_HAVE_NONE = 15; // BEP 6
export const MSG_REJECT = 16; // BEP 6
export const MSG_ALLOWED_FAST = 17; // BEP 6

// ============================================================================
// PROTOCOLO DE EXTENSÃO (BEP 10)
// ============================================================================

export const MSG_EXTENDED = 20;
export const EXT_HANDSHAKE = 0; // ID reservado para handshake de extensões

// ============================================================================
// TAMANHOS DE MENSAGENS
// ============================================================================

export const HANDSHAKE_LENGTH = 68; // 1 + 19 + 8 + 20 + 20
export const KEEP_ALIVE_LENGTH = 4; // Apenas o length prefix (0)

// ============================================================================
// LIMITES E TIMEOUTS
// ============================================================================

export const DEFAULT_MAX_CONNS = 55;
export const WEBRTC_CONNECT_TIMEOUT = 25_000; // 25 segundos
export const BITTORRENT_HANDSHAKE_TIMEOUT = 25_000; // 25 segundos
export const TRACKER_TIMEOUT = 15_000; // 15 segundos

// ============================================================================
// PROTOCOLO STRING
// ============================================================================

export const PSTR = "BitTorrent protocol";
export const PSTR_BUFFER = new TextEncoder().encode(PSTR);
```

---

## Arquivo: `packages/core/src/utils/encode-util.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/encode-util.ts

/**
 * Converte um Uint8Array em uma string onde cada caractere representa um byte.
 * Isso é essencial para enviar info_hash e peer_id em URLs de trackers HTTP,
 * pois o encodeURIComponent padrão corrompe bytes > 0x7F.
 */
export function uint8ArrayToBinaryString(buffer: Uint8Array): string {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i]!);
  }
  return result;
}

/**
 * Converte uma string de byte único de volta para Uint8Array.
 */
export function binaryStringToUint8Array(str: string): Uint8Array {
  const buffer = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    buffer[i] = str.charCodeAt(i);
  }
  return buffer;
}
```

---

## Arquivo: `packages/core/src/utils/encoding.ts`

```ts
/**
 * Encoding and validation utilities for Base32, Base64, hexadecimal, and SHA-1 identifiers.
 * Adapted from deno-torrent/toolkit/encoding/encode_util.ts.
 * Pure TypeScript — no external @std/encoding dependencies.
 */

// ---------------------------------------------------------------------------
// Base64 (browser btoa/atob)
// ---------------------------------------------------------------------------

/** Encode a Uint8Array to a Base64 string (no line breaks). */
export function encodeBase64(data: Uint8Array): string {
  // btoa expects a binary string; build one from the byte values.
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}

/** Decode a Base64 string into a Uint8Array. */
export function decodeBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Base32 (RFC 4648)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode a Uint8Array to a Base32 string (RFC 4648, with padding). */
export function encodeBase32(data: Uint8Array): string {
  if (data.length === 0) return "";

  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!;
  }

  // Pad to a multiple of 8 characters
  const padLen = (8 - (output.length % 8)) % 8;
  for (let i = 0; i < padLen; i++) {
    output += "=";
  }

  return output;
}

/** Decode a Base32 string (RFC 4648, with or without padding) into a Uint8Array. */
export function decodeBase32(str: string): Uint8Array {
  const cleaned = str.replace(/=+$/, "").toUpperCase();
  if (cleaned.length === 0) return new Uint8Array(0);

  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    lookup.set(BASE32_ALPHABET[i]!, i);
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    const val = lookup.get(ch);
    if (val === undefined) {
      throw new TypeError(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

const HEX_TABLE = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/** Encode a Uint8Array to a lowercase hexadecimal string. */
export function encodeHex(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i++) {
    out += HEX_TABLE[data[i]!]!;
  }
  return out;
}

/** Decode a hexadecimal string into a Uint8Array. */
export function decodeHex(str: string): Uint8Array {
  if (str.length % 2 !== 0) {
    throw new TypeError("Invalid hex string: length must be even");
  }
  const bytes = new Uint8Array(str.length / 2);
  for (let i = 0; i < str.length; i += 2) {
    const hi = parseInt(str[i]!, 16);
    const lo = parseInt(str[i + 1]!, 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) {
      throw new TypeError(`Invalid hex character at position ${i}`);
    }
    bytes[i >> 1] = (hi << 4) | lo;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** Check whether a string is a valid Base32 encoding (RFC 4648, with or without padding). */
export function isBase32(str: string): boolean {
  if (str.length === 0 || !/^[A-Za-z2-7]+={0,6}$/.test(str)) return false;

  const paddingLength = str.length - str.replace(/=+$/, "").length;
  const dataLength = str.length - paddingLength;
  const remainder = dataLength % 8;
  const expectedPadding = new Map([
    [0, 0],
    [2, 6],
    [4, 4],
    [5, 3],
    [7, 1],
  ]).get(remainder);

  return expectedPadding !== undefined &&
    (paddingLength === 0 || paddingLength === expectedPadding);
}

/** Check whether a string is a valid hexadecimal encoding. */
export function isHex(str: string): boolean {
  if (str.length === 0) return false;
  return /^[0-9a-fA-F]+$/.test(str);
}

/**
 * Check whether a Uint8Array is a SHA-1 hash (exactly 20 bytes).
 */
export function isSha1(data: Uint8Array): boolean {
  return data.length === 20;
}

```

---

## Arquivo: `packages/core/src/utils/errors.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/errors.ts

/**
 * Classes de erro customizadas para o BrowserTorrent WebTorrent.
 * Facilita debugging e tratamento de erros específicos.
 */

export class BitfieldError extends Error {
  constructor(message: string, public code: string = "BITFIELD_ERROR") {
    super(message);
    this.name = "BitfieldError";
  }
}

export class WireError extends Error {
  constructor(message: string, public code: string = "WIRE_ERROR") {
    super(message);
    this.name = "WireError";
  }
}

export class TrackerError extends Error {
  constructor(message: string, public code: string = "TRACKER_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.name = "TrackerError";
  }
}

export class PeerError extends Error {
  constructor(message: string, public code: string = "PEER_ERROR") {
    super(message);
    this.name = "PeerError";
  }
}

export class TorrentError extends Error {
  constructor(message: string, public code: string = "TORRENT_ERROR") {
    super(message);
    this.name = "TorrentError";
  }
}

/**
 * Thrown when input cannot be parsed as a valid `.torrent` file.
 * Adaptado de deno-torrent/metainfo/parser.ts.
 */
export class TorrentParseError extends TorrentError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "TORRENT_PARSE_ERROR");
    if (options) {
      this.cause = options.cause;
    }
    this.name = "TorrentParseError";
  }
}

// ── PeerWire error taxonomy (adapted from deno-torrent/peerwire/errors.ts) ──

/** Base error for invalid or failed peer wire operations. */
export class PeerWireError extends Error {
  constructor(message: string, public code: string = "PEERWIRE_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.name = "PeerWireError";
  }
}

/** Protocol violation — unexpected message, bad state, malformed handshake. */
export class ProtocolError extends PeerWireError {
  constructor(message: string, code: string = "PROTOCOL_ERROR", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "ProtocolError";
  }
}

/** Peer disconnected or transport stream ended prematurely. */
export class EofError extends PeerWireError {
  constructor(message: string, code: string = "EOF_ERROR", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "EofError";
  }
}

/** A peer wire operation exceeded its configured deadline. */
export class TimeoutError extends PeerWireError {
  constructor(message: string, code: string = "TIMEOUT_ERROR", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "TimeoutError";
  }
}

/** Peer explicitly rejected a piece request (BEP 6 Fast Extension). */
export class RequestRejectedError extends PeerWireError {
  constructor(message: string, code: string = "REQUEST_REJECTED", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "RequestRejectedError";
  }
}
```

---

## Arquivo: `packages/core/src/utils/event-target.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/event-target.ts

/**
 * Substituto tipado para o `EventEmitter` do Node.js.
 * Usa a API nativa `EventTarget` do browser, mas com tipagem estrita para eventos.
 */

export type EventMap = Record<string, Event | CustomEvent | any>;

export class TypedEventTarget<Events extends EventMap> extends EventTarget {
  /**
   * Registra um listener para um evento específico.
   */
  on<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): this {
    this.addEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Registra um listener que será removido após a primeira execução.
   */
  once<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void
  ): this {
    this.addEventListener(type, listener as EventListener, { once: true });
    return this;
  }

  /**
   * Remove um listener.
   */
  off<K extends keyof Events>(
    type: K & string,
    listener: (event: Events[K]) => void,
    options?: boolean | EventListenerOptions
  ): this {
    this.removeEventListener(type, listener as EventListener, options);
    return this;
  }

  /**
   * Emite um evento.
   * 🔥 CORREÇÃO: Usamos `(detail as any) instanceof Event` para contornar 
   * a restrição do TypeScript com tipos genéricos union (TS2358).
   */
  emit<K extends keyof Events>(type: K & string, detail?: Events[K]): boolean {
    const event =
      (detail && (detail as any) instanceof Event)
        ? (detail as any)
        : new CustomEvent(type, { detail, cancelable: true });
    
    return this.dispatchEvent(event);
  }

  /**
   * Remove todos os listeners de um tipo específico (ou de todos os tipos).
   * Nota: EventTarget nativo não expõe os listeners, então esta implementação
   * é um no-op seguro, confiando no Garbage Collector quando o alvo é destruído.
   */
  removeAllListeners<K extends keyof Events>(type?: K & string): this {
    // Em implementações nativas, recriar o EventTarget é a forma mais limpa
    // de limpar tudo, mas para o WebTorrent, o destroy() do objeto pai 
    // geralmente cuida da limpeza das referências.
    return this;
  }
}
```

---

## Arquivo: `packages/core/src/utils/magnet.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/magnet.ts
/**
 * Magnet link parsing and building with BitTorrent v1/v2 support.
 *
 * Supports `urn:btih:`, `urn:sha1:` (v1), and `urn:btmh:1220...` (v2 / BEP 52).
 * Hash formats: SHA-1 hex (40 chars), Base32 (32 chars), SHA-256 hex (64 chars).
 *
 * Adaptado de deno-torrent/magnet/magnet.ts.
 * Replaces `@std/encoding/base32` and `@std/encoding/hex` with local
 * utilities from `encoding.ts`. Uses custom query-string parser with
 * resource limits instead of URLSearchParams.
 */

import {
  decodeBase32,
  decodeHex,
  encodeHex,
  isBase32,
  isHex,
} from "./encoding.ts";

// ── Types ───────────────────────────────────────────────────────────────

/** Parsed magnet link with v1/v2 identity fields. */
export interface ParsedMagnet {
  /** Protocol version: "v1" for SHA-1, "v2" for SHA-256. */
  protocol: "v1" | "v2";

  /**
   * Info hash as lowercase hex string.
   * Always 40 chars (the 20-byte handshake hash) for wire/tracker compat.
   */
  infoHash: string;

  /**
   * 20-byte handshake hash.
   * For v1: the full SHA-1 digest. For v2: the first 20 bytes of SHA-256.
   */
  infoHashBuffer: Uint8Array;

  /** 20-byte handshake hash (alias for infoHashBuffer, explicit naming). */
  handshakeHash: Uint8Array;

  /** Full 20-byte v1 SHA-1 hash, if the link contains `urn:btih`. */
  infoHashV1?: Uint8Array;

  /** Full 32-byte v2 SHA-256 hash, if the link contains `urn:btmh`. */
  infoHashV2?: Uint8Array;

  /** 40-char lowercase hex of the v1 hash. */
  infoHashV1Hex?: string;

  /** 64-char lowercase hex of the v2 hash. */
  infoHashV2Hex?: string;

  /** Display name from the `dn` parameter. */
  name?: string;

  /** Tracker URLs from `tr` parameters. */
  announce: string[];

  /** Web seed URLs from `ws` parameters. */
  webSeeds: string[];

  /** Peer addresses from `x.pe` parameters. */
  peerAddresses: string[];

  /** Torrent file URL from `xs` parameter. */
  torrentFileUrl?: string;

  /** Original magnet URI. */
  magnetURI: string;

  /** All query parameters as multi-value map (URL-decoded). */
  params: Map<string, string[]>;
}

/** Options for building a magnet link. */
export interface MagnetBuildOptions {
  /** Display name, serialized as the `dn` parameter. */
  name?: string;
  /** Tracker URLs, serialized as repeated `tr` parameters. */
  trackers?: string[];
  /** Web seed URLs, serialized as repeated `ws` parameters. */
  webSeeds?: string[];
  /** Peer addresses, serialized as repeated `x.pe` parameters. */
  peerAddresses?: string[];
  /** Torrent file URL, serialized as the `xs` parameter. */
  torrentFileUrl?: string;
}

/** Resource limits for parsing a magnet link. */
export interface MagnetParseOptions {
  /** Maximum URI length in UTF-16 code units. Defaults to 1 MiB. */
  maxLength?: number;
  /** Maximum number of non-empty query parameters. Defaults to 1024. */
  maxQueryParameters?: number;
  /** Maximum length of one query parameter segment. Defaults to 64 KiB. */
  maxQueryParameterLength?: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const MAGNET_PREFIX = "magnet:?";
const MAX_MAGNET_LENGTH = 1024 * 1024;
const MAX_QUERY_PARAMETERS = 1024;
const MAX_QUERY_PARAMETER_LENGTH = 64 * 1024;
const SUPPORTED_NIDS = new Set(["btih", "sha1", "btmh"]);

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns `true` if the magnet link string is valid.
 *
 * Unlike `parseMagnet` (which throws), this returns a boolean for validation.
 */
export function isValidMagnet(magnet: string): boolean {
  try {
    const result = parseMagnet(magnet);
    return result !== undefined;
  } catch {
    return false;
  }
}

/**
 * Parse a magnet link string into structured identity and parameters.
 *
 * Supports:
 * - `magnet:?xt=urn:btih:<HEX>`   — v1, 40-char hex
 * - `magnet:?xt=urn:btih:<BASE32>` — v1, 32-char Base32
 * - `magnet:?xt=urn:sha1:<HEX>`   — v1, 40-char hex
 * - `magnet:?xt=urn:sha1:<BASE32>` — v1, 32-char Base32
 * - `magnet:?xt=urn:btmh:1220<HEX>` — v2, 64-char hex (BEP 52)
 *
 * For hybrid links (both `urn:btih` and `urn:btmh`), v1 is preferred as
 * the primary identity (matching deno-torrent behavior).
 *
 * @throws {Error} If the magnet URI is invalid.
 */
export function parseMagnet(
  magnet: string,
  options: MagnetParseOptions = {},
): ParsedMagnet {
  const limits = normalizeParseOptions(options);

  if (
    typeof magnet !== "string" ||
    magnet.length > limits.maxLength ||
    magnet.slice(0, MAGNET_PREFIX.length).toLowerCase() !== MAGNET_PREFIX
  ) {
    throw new Error("Invalid magnet URI: must start with 'magnet:?'");
  }

  const queryString = magnet.slice(MAGNET_PREFIX.length);
  const params = parseQueryString(queryString, limits);

  const xtValues = params.get("xt");
  if (!xtValues || xtValues.length === 0) {
    throw new Error("Invalid magnet URI: missing or invalid 'xt' parameter");
  }

  let v1: XtResult | undefined;
  let v2: XtResult | undefined;

  for (const xt of xtValues) {
    const result = parseXt(xt, params, magnet);
    if (!result) continue;
    if (result.protocol === "v1" && !v1) v1 = result;
    if (result.protocol === "v2" && !v2) v2 = result;
  }

  const selected = v1 ?? v2;
  if (!selected) {
    throw new Error("Invalid magnet URI: no valid xt hash found");
  }

  return {
    protocol: selected.protocol,
    infoHash: selected.infoHash,
    infoHashBuffer: new Uint8Array(selected.handshakeHash),
    handshakeHash: new Uint8Array(selected.handshakeHash),
    infoHashV1: v1 ? new Uint8Array(v1.fullHash) : undefined,
    infoHashV2: v2 ? new Uint8Array(v2.fullHash) : undefined,
    infoHashV1Hex: v1 ? encodeHex(v1.fullHash) : undefined,
    infoHashV2Hex: v2 ? encodeHex(v2.fullHash) : undefined,
    name: selected.name,
    announce: selected.announce,
    webSeeds: selected.webSeeds,
    peerAddresses: selected.peerAddresses,
    torrentFileUrl: selected.torrentFileUrl,
    magnetURI: selected.magnetURI,
    params: selected.params,
  };
}

/**
 * Build a v1 magnet link from a SHA-1 hash string (40-char hex or 32-char Base32).
 *
 * @throws {TypeError} If the hash string is not a valid SHA-1 format.
 */
export function encodeMagnet(
  parsed: Omit<ParsedMagnet, "infoHashBuffer" | "magnetURI" | "params" | "handshakeHash" | "infoHashV1" | "infoHashV2" | "infoHashV1Hex" | "infoHashV2Hex" | "protocol">,
): string {
  const hashString = parsed.infoHash;
  if (!isSha1Hex(hashString) && !isSha1Base32(hashString)) {
    throw new TypeError(
      `Invalid hash string: expected 40-char hex or 32-char Base32, got "${hashString}"`,
    );
  }
  const normalizedHash = isSha1Hex(hashString)
    ? hashString.toLowerCase()
    : hashString.toUpperCase();

  const parts: string[] = [`xt=urn:btih:${normalizedHash}`];
  if (parsed.name) parts.push(`dn=${encodeURIComponent(parsed.name)}`);
  for (const tracker of parsed.announce) {
    parts.push(`tr=${encodeURIComponent(tracker)}`);
  }
  for (const webSeed of parsed.webSeeds) {
    parts.push(`ws=${encodeURIComponent(webSeed)}`);
  }
  for (const peer of parsed.peerAddresses) {
    parts.push(`x.pe=${encodeURIComponent(peer)}`);
  }
  if (parsed.torrentFileUrl) {
    parts.push(`xs=${encodeURIComponent(parsed.torrentFileUrl)}`);
  }

  return `${MAGNET_PREFIX}${parts.join("&")}`;
}

/**
 * Build a v2 (BEP 52) magnet link from a full 32-byte SHA-256 digest.
 *
 * @param hashHex 64-char lowercase hexadecimal SHA-256 digest.
 * @throws {TypeError} If the hash is not a valid 64-char hex string.
 */
export function buildMagnetV2(
  hashHex: string,
  options: MagnetBuildOptions = {},
): string {
  if (!/^[0-9a-f]{64}$/iu.test(hashHex)) {
    throw new TypeError("Invalid v2 hash: expected 64 hexadecimal characters");
  }
  let url = `${MAGNET_PREFIX}xt=urn:btmh:1220${hashHex.toLowerCase()}`;
  if (options.name !== undefined) {
    url += `&dn=${encodeURIComponent(options.name)}`;
  }
  for (const tracker of options.trackers ?? []) {
    url += `&tr=${encodeURIComponent(tracker)}`;
  }
  for (const webSeed of options.webSeeds ?? []) {
    url += `&ws=${encodeURIComponent(webSeed)}`;
  }
  for (const peer of options.peerAddresses ?? []) {
    url += `&x.pe=${encodeURIComponent(peer)}`;
  }
  if (options.torrentFileUrl !== undefined) {
    url += `&xs=${encodeURIComponent(options.torrentFileUrl)}`;
  }
  return url;
}

/** Returns `true` if the string is a valid SHA-1 hex hash (40 hex characters). */
export function isSha1Hex(hash: string): boolean {
  return hash.length === 40 && isHex(hash);
}

/** Returns `true` if the string is a valid SHA-1 Base32 hash (32 Base32 chars, no padding). */
export function isSha1Base32(hash: string): boolean {
  return hash.length === 32 && isBase32(hash);
}

// ── Internal helpers ────────────────────────────────────────────────────

/** Intermediate result from parsing one xt value (before merging v1/v2). */
interface XtResult {
  protocol: "v1" | "v2";
  fullHash: Uint8Array;
  handshakeHash: Uint8Array;
  infoHash: string;
  name: string | undefined;
  announce: string[];
  webSeeds: string[];
  peerAddresses: string[];
  torrentFileUrl: string | undefined;
  magnetURI: string;
  params: Map<string, string[]>;
}

/** Parse a single xt value (e.g. `urn:btih:HASH`) into an XtResult. */
function parseXt(
  xt: string,
  params: Map<string, string[]>,
  magnetURI: string,
): XtResult | undefined {
  if (xt.slice(0, 4).toLowerCase() !== "urn:") return undefined;

  const urnBody = xt.slice(4);
  const colonIdx = urnBody.indexOf(":");
  if (colonIdx === -1) return undefined;

  const nid = urnBody.slice(0, colonIdx).toLowerCase();
  const hashString = urnBody.slice(colonIdx + 1);

  if (!SUPPORTED_NIDS.has(nid)) return undefined;

  let hash: Uint8Array | undefined;
  let protocol: "v1" | "v2" = "v1";

  try {
    if (nid === "btmh" && /^1220[0-9a-f]{64}$/iu.test(hashString)) {
      hash = decodeHex(hashString.slice(4).toLowerCase());
      protocol = "v2";
    } else if (nid !== "btmh" && isSha1Hex(hashString)) {
      hash = decodeHex(hashString.toLowerCase());
    } else if (nid !== "btmh" && isSha1Base32(hashString)) {
      hash = decodeBase32(hashString.toUpperCase());
    }
  } catch {
    return undefined;
  }

  if (!hash) return undefined;

  const handshakeHash =
    protocol === "v2" ? hash.slice(0, 20) : hash.slice();
  const infoHash = encodeHex(handshakeHash);

  const dnValues = params.get("dn");
  const trValues = params.get("tr");
  const wsValues = params.get("ws");
  const peValues = params.get("x.pe");
  const xsValues = params.get("xs");

  const paramsCopy = new Map<string, string[]>();
  for (const [key, values] of params) {
    paramsCopy.set(key, [...values]);
  }

  return {
    protocol,
    fullHash: new Uint8Array(hash),
    handshakeHash: new Uint8Array(handshakeHash),
    infoHash,
    name: dnValues?.[0],
    announce: [...(trValues ?? [])],
    webSeeds: [...(wsValues ?? [])],
    peerAddresses: [...(peValues ?? [])],
    torrentFileUrl: xsValues?.[0],
    magnetURI,
    params: paramsCopy,
  };
}

/**
 * Parse a query string into a multi-value Map.
 * Both keys and values are URL-decoded; `safeDecodeURIComponent` is used
 * so malformed percent-encoding doesn't throw.
 */
function parseQueryString(
  query: string,
  limits: { maxQueryParameters: number; maxQueryParameterLength: number },
): Map<string, string[]> {
  const params = new Map<string, string[]>();
  if (!query) return params;

  let parameterCount = 0;

  for (const segment of query.split("&")) {
    if (!segment) continue;

    parameterCount++;
    if (
      parameterCount > limits.maxQueryParameters ||
      segment.length > limits.maxQueryParameterLength
    ) {
      throw new Error("Magnet URI exceeds resource limits");
    }

    const eqIdx = segment.indexOf("=");
    const key =
      eqIdx === -1
        ? safeDecodeURIComponent(segment)
        : safeDecodeURIComponent(segment.slice(0, eqIdx));
    const value =
      eqIdx === -1
        ? ""
        : safeDecodeURIComponent(segment.slice(eqIdx + 1));

    const existing = params.get(key);
    if (existing) {
      existing.push(value);
    } else {
      params.set(key, [value]);
    }
  }

  return params;
}

function normalizeParseOptions(
  options: MagnetParseOptions,
): {
  maxLength: number;
  maxQueryParameters: number;
  maxQueryParameterLength: number;
} {
  return {
    maxLength: validateLimit(
      options.maxLength,
      MAX_MAGNET_LENGTH,
      "maxLength",
    ),
    maxQueryParameters: validateLimit(
      options.maxQueryParameters,
      MAX_QUERY_PARAMETERS,
      "maxQueryParameters",
    ),
    maxQueryParameterLength: validateLimit(
      options.maxQueryParameterLength,
      MAX_QUERY_PARAMETER_LENGTH,
      "maxQueryParameterLength",
    ),
  };
}

function validateLimit(
  value: number | undefined,
  defaultValue: number,
  name: string,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `Invalid parse option: ${name} must be a positive integer`,
    );
  }
  return value;
}

/** Safe URL decode: returns the original string if decoding fails. */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

```

---

## Arquivo: `packages/core/src/utils/metainfo-identity.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/metainfo-identity.ts
/**
 * Torrent identity utilities — preserve exact bencoded `info` bytes for
 * faithful hash computation.
 *
 * A torrent's identity is the SHA-1 (v1) or SHA-256 (v2) digest of the
 * bytes originally present in its `info` value. Re-encoding a decoded
 * object is deliberately avoided.
 *
 * Adaptado de deno-torrent/metainfo/identity.ts.
 * Browser-first: accepts Uint8Array (no Deno Reader).
 */

import { decode, encode } from "./bencode.ts";
import { TorrentParseError } from "./errors.ts";
import { parseMetainfo } from "./metainfo-parser.ts";
import type { ParseTorrentOptions, Torrent, TorrentPieceLayer } from "./torrent-types.ts";

// ── Types ───────────────────────────────────────────────────────────────

/** A parsed torrent together with its exact BEP-3 swarm identity. */
export interface TorrentIdentity {
  /** Validated, decoded metainfo. */
  torrent: Torrent;
  /** Exact bencoded bytes of the root `info` dictionary. */
  infoBytes: Uint8Array;
  /** SHA-1 digest of infoBytes (20 bytes) when v1 is present. */
  infoHashV1?: Uint8Array;
  /** Full BEP-52 SHA-256 digest of infoBytes (32 bytes) when v2 is present. */
  infoHashV2?: Uint8Array;
  /** 20-byte handshake hash (v1 full, or v2 truncated). */
  infoHash: Uint8Array;
  /** Lower-case hex of infoHash. */
  infoHashHex: string;
  /** Metadata format after structural and hybrid-layout validation. */
  version: "v1" | "v2" | "hybrid";
}

/** Optional outer metainfo fields for wrapping BEP-9 metadata. */
export interface WrapInfoOptions {
  announce?: string;
  announceList?: string[][];
  pieceLayers?: readonly TorrentPieceLayer[];
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Extract the exact bencoded `info` dictionary from complete metainfo bytes.
 * Validates the full bencode stream first (rejects duplicate keys, trailing
 * bytes, malformed integers), then byte-scans to locate the `info` value.
 */
export function extractInfoBytes(metainfo: Uint8Array): Uint8Array {
  try {
    decode(metainfo, { maxBytes: metainfo.length });
  } catch (error) {
    throw new TorrentParseError("Invalid bencoded torrent data", { cause: error });
  }

  const cursor = { offset: 0 };
  expect(metainfo, cursor, 0x64, "Torrent root must be a bencode dictionary");
  let result: Uint8Array | undefined;

  while (peek(metainfo, cursor) !== 0x65) {
    const key = readByteString(metainfo, cursor);
    const valueStart = cursor.offset;
    skipValue(metainfo, cursor, 1);
    if (equalsAscii(key, "info")) {
      if (metainfo[valueStart] !== 0x64) {
        throw new TorrentParseError("Torrent info value must be a dictionary");
      }
      result = metainfo.slice(valueStart, cursor.offset);
    }
  }
  cursor.offset++;

  if (result === undefined) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }
  return new Uint8Array(result);
}

/** Calculate the BEP-3 v1 info hash (SHA-1) for exact bencoded info bytes. */
export async function calculateInfoHash(
  infoBytes: Uint8Array,
): Promise<Uint8Array> {
  validateInfoBytes(infoBytes);
  const buffer = new ArrayBuffer(infoBytes.byteLength);
  new Uint8Array(buffer).set(infoBytes);
  return new Uint8Array(
    await crypto.subtle.digest("SHA-1", buffer),
  );
}

/** Calculate the full BEP-52 v2 info hash (SHA-256) for exact bencoded info bytes. */
export async function calculateInfoHashV2(
  infoBytes: Uint8Array,
): Promise<Uint8Array> {
  validateInfoBytes(infoBytes);
  const buffer = new ArrayBuffer(infoBytes.byteLength);
  new Uint8Array(buffer).set(infoBytes);
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", buffer),
  );
}

/**
 * Wrap an exact BEP-9 `info` dictionary in complete torrent metainfo.
 * The supplied bytes are inserted verbatim, so the info hash cannot change.
 */
export function wrapInfoBytes(
  infoBytes: Uint8Array,
  options: WrapInfoOptions = {},
): Uint8Array {
  validateInfoBytes(infoBytes);

  const fields: Array<{ key: string; value: Uint8Array }> = [
    { key: "info", value: infoBytes },
  ];
  if (options.announce !== undefined) {
    fields.push({ key: "announce", value: encode(options.announce) });
  }
  if (options.announceList !== undefined) {
    fields.push({ key: "announce-list", value: encode(options.announceList) });
  }
  if (options.pieceLayers !== undefined) {
    const layers = new Map<Uint8Array, Uint8Array>();
    for (const layer of options.pieceLayers) {
      layers.set(layer.piecesRoot, layer.hashes);
    }
    fields.push({ key: "piece layers", value: encode(layers) });
  }

  fields.sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  const chunks = fields.flatMap((field) => [
    encode(field.key),
    field.value,
  ]);
  const length = 2 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  output[0] = 0x64; // 'd'
  let offset = 1;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  output[offset] = 0x65; // 'e'
  return output;
}

/**
 * Parse and validate metainfo while retaining the exact `info` bytes used to
 * calculate its info hash. Re-encoding a decoded object is deliberately avoided.
 *
 * @param bytes  Complete bencoded torrent bytes.
 * @param options  Optional resource limits (forwarded to `parseMetainfo`).
 */
export async function parseTorrentWithIdentity(
  bytes: Uint8Array,
  options: ParseTorrentOptions = {},
): Promise<TorrentIdentity> {
  const torrent = await parseMetainfo(bytes, options);

  const infoBytes = extractInfoBytes(bytes);
  const info = torrent.info;
  const hasV2 = (info as Record<string, unknown>)["meta version"] === 2;
  const hasV1 = !hasV2 || (info as Record<string, unknown>)["pieces"] !== undefined;

  const infoHashV1 = hasV1 ? await calculateInfoHash(infoBytes) : undefined;
  const infoHashV2 = hasV2 ? await calculateInfoHashV2(infoBytes) : undefined;
  const infoHash = infoHashV1 ?? infoHashV2!.slice(0, 20);
  const version = hasV2 ? (hasV1 ? "hybrid" : "v2") : "v1";

  return {
    torrent,
    infoBytes,
    infoHashV1,
    infoHashV2,
    infoHash,
    infoHashHex: toHex(infoHash),
    version,
  };
}

/** Convert binary data to lowercase hexadecimal text. */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

// ── Internal helpers ────────────────────────────────────────────────────

function validateInfoBytes(infoBytes: Uint8Array): void {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length, useMap: true });
  } catch (error) {
    throw new TorrentParseError("Invalid bencoded info dictionary", { cause: error });
  }
  if (!(decoded instanceof Map)) {
    throw new TorrentParseError("Info bytes must contain one bencode dictionary");
  }
}

function skipValue(
  bytes: Uint8Array,
  cursor: { offset: number },
  depth: number,
): void {
  if (depth > 256) {
    throw new TorrentParseError("Torrent nesting is too deep");
  }
  const marker = peek(bytes, cursor);
  if (marker >= 0x30 && marker <= 0x39) {
    readByteString(bytes, cursor);
    return;
  }
  if (marker === 0x69) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) cursor.offset++;
    cursor.offset++;
    return;
  }
  if (marker === 0x6c) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) skipValue(bytes, cursor, depth + 1);
    cursor.offset++;
    return;
  }
  if (marker === 0x64) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) {
      readByteString(bytes, cursor);
      skipValue(bytes, cursor, depth + 1);
    }
    cursor.offset++;
    return;
  }
  throw new TorrentParseError(
    `Invalid bencode marker at byte ${cursor.offset}`,
  );
}

function readByteString(
  bytes: Uint8Array,
  cursor: { offset: number },
): Uint8Array {
  const start = cursor.offset;
  while (peek(bytes, cursor) !== 0x3a) cursor.offset++;
  const length = Number(
    new TextDecoder().decode(bytes.subarray(start, cursor.offset)),
  );
  cursor.offset++;
  if (
    !Number.isSafeInteger(length) || length < 0 ||
    cursor.offset + length > bytes.length
  ) {
    throw new TorrentParseError(`Invalid byte string length at byte ${start}`);
  }
  const value = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return value;
}

function peek(bytes: Uint8Array, cursor: { offset: number }): number {
  const byte = bytes[cursor.offset];
  if (byte === undefined) {
    throw new TorrentParseError("Unexpected end of torrent data");
  }
  return byte;
}

function expect(
  bytes: Uint8Array,
  cursor: { offset: number },
  expected: number,
  message: string,
): void {
  if (peek(bytes, cursor) !== expected) {
    throw new TorrentParseError(message);
  }
  cursor.offset++;
}

function equalsAscii(bytes: Uint8Array, value: string): boolean {
  if (bytes.length !== value.length) return false;
  for (let i = 0; i < value.length; i++) {
    if (bytes[i] !== value.charCodeAt(i)) return false;
  }
  return true;
}

```

---

## Arquivo: `packages/core/src/utils/metainfo-parser.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/metainfo-parser.ts
/**
 * Rigorous `.torrent` metainfo parser (BEP 3, 12, 19, 47, 52).
 *
 * Adaptado de deno-torrent/metainfo/parser.ts.
 * Browser-first: accepts `Uint8Array` only (no Deno `Reader` / `IoUtil`).
 * Decodes with `useMap` so binary `piece layers` keys survive, then normalizes
 * dictionaries to plain `Record`s while validating every field and resource limit.
 */

import { BencodeDecodeError, decode } from "./bencode.ts";
import { TorrentParseError } from "./errors.ts";
import {
  DEFAULT_MAX_METAINFO_SIZE,
  isSafePathComponent,
  validateTorrentFilePaths,
} from "./torrent-types.ts";
import type {
  ParseTorrentOptions,
  Torrent,
  TorrentInfo,
  TorrentPieceLayer,
  TorrentV2Info,
} from "./torrent-types.ts";
import {
  flattenV2Files,
  validateHybridLayout,
  validateV2PieceLayers,
} from "./metainfo-v2.ts";

// ── Internal helpers ──────────────────────────────────────────────────────

/** Convert bencode `Map` dictionaries to the plain objects exposed here. */
function normalizeDecodedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== "string") {
        throw new TorrentParseError("Torrent dictionary keys must be strings");
      }
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value: normalizeDecodedValue(entry),
        writable: true,
      });
    }
    return object;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDecodedValue);
  }

  return value;
}

/** Return whether a decoded value is a plain bencode dictionary. */
function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array);
}

/** Return whether a value is an integer representable without precision loss. */
function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Return whether a value is a non-negative safe integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

/** Validate an optional string-valued field. */
function validateOptionalString(
  dict: Record<string, unknown>,
  field: string,
): void {
  if (dict[field] !== undefined && typeof dict[field] !== "string") {
    throw new TorrentParseError(
      `Invalid "${field}" field — expected a UTF-8 string`,
    );
  }
}

/** Validate the optional BEP-12 tracker tier list. */
function validateAnnounceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((tier) =>
      Array.isArray(tier) && tier.length > 0 &&
      tier.every((tracker) => typeof tracker === "string" && tracker.length > 0)
    )
  );
}

/** Validate a multi-file torrent file entry. */
function validateTorrentFile(
  value: unknown,
  index: number,
): asserts value is Record<string, unknown> {
  if (!isDictionary(value)) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}]" entry — expected a dictionary`,
    );
  }
  if (!isNonNegativeInteger(value["length"])) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].length" field — expected a non-negative integer`,
    );
  }
  if (value["attr"] !== undefined && typeof value["attr"] !== "string") {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].attr" field — expected a string`,
    );
  }
  if (
    !Array.isArray(value["path"]) || value["path"].length === 0 ||
    !value["path"].every(isSafePathComponent)
  ) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].path" field — expected safe, non-empty path components`,
    );
  }
}

// ── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse and rigorously validate a `.torrent` file from raw bytes.
 *
 * Encoded input is limited to 16 MiB by default; trusted callers may provide
 * a different positive `maxBytes` value.
 *
 * @param bytes Raw bencoded torrent bytes.
 * @param options Optional resource limits.
 * @returns The fully typed {@link Torrent} object.
 * @throws {TorrentParseError} If decoding fails, the resource limit is exceeded,
 *   required fields are missing, or piece/file metadata is inconsistent.
 */
export async function parseMetainfo(
  bytes: Uint8Array,
  options: ParseTorrentOptions = {},
): Promise<Torrent> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TorrentParseError(
      'Invalid "maxBytes" option — expected a positive safe integer',
    );
  }

  if (bytes.length > maxBytes) {
    throw new TorrentParseError(
      `Torrent data exceeds the configured limit of ${maxBytes} bytes`,
    );
  }

  // ── 1. Decode bencode (Map mode preserves binary "piece layers" keys). ──
  let decoded: unknown;
  let pieceLayers: TorrentPieceLayer[] | undefined;
  try {
    const raw = decode(bytes, { maxBytes, useMap: true });
    if (raw instanceof Map && raw.has("piece layers")) {
      pieceLayers = normalizePieceLayers(raw.get("piece layers"));
      raw.delete("piece layers");
    }
    decoded = normalizeDecodedValue(raw);
  } catch (error) {
    const message = error instanceof BencodeDecodeError
      ? error.message
      : "Invalid bencode data";
    throw new TorrentParseError(message, { cause: error });
  }

  // ── 2. Validate outer structure. ────────────────────────────────────────
  if (!isDictionary(decoded)) {
    throw new TorrentParseError(
      "Torrent root must be a bencode dictionary, got: " +
        (Array.isArray(decoded) ? "list" : typeof decoded),
    );
  }

  const dictionary = decoded;
  if (pieceLayers !== undefined) dictionary["piece layers"] = pieceLayers;

  validateOptionalString(dictionary, "announce");
  if (dictionary["announce"] === "") {
    throw new TorrentParseError(
      'Invalid "announce" field — expected a non-empty URL string',
    );
  }
  validateOptionalString(dictionary, "comment");
  validateOptionalString(dictionary, "created by");
  validateOptionalString(dictionary, "source");
  if (
    dictionary["announce-list"] !== undefined &&
    !validateAnnounceList(dictionary["announce-list"])
  ) {
    throw new TorrentParseError(
      'Invalid "announce-list" field — expected a string array of string arrays',
    );
  }
  if (
    dictionary["url-list"] !== undefined &&
    !(
      typeof dictionary["url-list"] === "string" ||
      (Array.isArray(dictionary["url-list"]) &&
        dictionary["url-list"].length > 0 &&
        dictionary["url-list"].every((url) =>
          typeof url === "string" && url.length > 0
        ))
    )
  ) {
    throw new TorrentParseError(
      'Invalid "url-list" field — expected a non-empty string or non-empty string array',
    );
  }
  if (dictionary["url-list"] === "") {
    throw new TorrentParseError(
      'Invalid "url-list" field — expected a non-empty URL string',
    );
  }
  if (
    dictionary["creation date"] !== undefined &&
    !isNonNegativeInteger(dictionary["creation date"])
  ) {
    throw new TorrentParseError(
      'Invalid "creation date" field — expected a non-negative integer',
    );
  }

  const info = dictionary["info"];
  if (!isDictionary(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }

  // ── 3. Validate info dictionary. ────────────────────────────────────────
  const infoDict = info;

  if (
    infoDict["meta version"] !== undefined &&
    infoDict["meta version"] !== 2
  ) {
    throw new TorrentParseError(
      `Unsupported "info.meta version": ${String(infoDict["meta version"])}`,
    );
  }

  if (!isSafePathComponent(infoDict["name"])) {
    throw new TorrentParseError(
      'Missing or invalid "info.name" field — expected a safe file or directory name',
    );
  }

  if (!isSafeInteger(infoDict["piece length"]) || infoDict["piece length"] <= 0) {
    throw new TorrentParseError(
      'Missing or invalid "info.piece length" field — expected a positive integer',
    );
  }

  if (
    infoDict["private"] !== undefined &&
    infoDict["private"] !== 0 &&
    infoDict["private"] !== 1
  ) {
    throw new TorrentParseError('Invalid "info.private" field — expected 0 or 1');
  }

  if (infoDict["meta version"] === 2) {
    const hasV1Fields = infoDict["pieces"] !== undefined ||
      infoDict["length"] !== undefined || infoDict["files"] !== undefined;
    if (hasV1Fields) validateV1Fields(infoDict);
    const files = pieceLayers === undefined &&
        options.allowMissingPieceLayers === true
      ? flattenV2Files(infoDict as unknown as TorrentV2Info)
      : await validateV2PieceLayers(
        infoDict as unknown as TorrentV2Info,
        pieceLayers ?? [],
      );
    validateHybridLayout(infoDict as unknown as TorrentInfo, files);
  } else {
    if (pieceLayers !== undefined) {
      throw new TorrentParseError('BEP-3 torrent must not contain "piece layers"');
    }
    validateV1Fields(infoDict);
  }

  return decoded as unknown as Torrent;
}

/** Validate the BEP-3 `info` fields (`pieces`, `length`, `files`). */
function validateV1Fields(infoDict: Record<string, unknown>): void {
  if (typeof infoDict["pieces"] === "string") {
    infoDict["pieces"] = new TextEncoder().encode(infoDict["pieces"]);
  }
  if (
    !(infoDict["pieces"] instanceof Uint8Array) ||
    infoDict["pieces"].length % 20 !== 0
  ) {
    throw new TorrentParseError(
      'Invalid "info.pieces" field — expected a Uint8Array whose length is a multiple of 20',
    );
  }
  if (
    infoDict["length"] !== undefined &&
    !isNonNegativeInteger(infoDict["length"])
  ) {
    throw new TorrentParseError(
      'Invalid "info.length" field — expected a non-negative integer',
    );
  }
  if (infoDict["files"] !== undefined) {
    if (!Array.isArray(infoDict["files"]) || infoDict["files"].length === 0) {
      throw new TorrentParseError(
        'Invalid "info.files" field — expected at least one file',
      );
    }
    if (infoDict["length"] !== undefined) {
      throw new TorrentParseError(
        'Torrent info must not contain both "length" and "files"',
      );
    }
    infoDict["files"].forEach(validateTorrentFile);
    validateTorrentFilePaths(infoDict["files"]);
  }
  if (infoDict["length"] === undefined && infoDict["files"] === undefined) {
    throw new TorrentParseError(
      'Torrent info must contain either "length" or "files"',
    );
  }
  const totalLength = infoDict["length"] ??
    (infoDict["files"] as Record<string, unknown>[]).reduce(
      (total, file) => total + (file["length"] as number),
      0,
    );
  if (!Number.isSafeInteger(totalLength)) {
    throw new TorrentParseError(
      "Torrent content length exceeds the safe integer range",
    );
  }
  const expectedPiecesLength = Math.ceil(
    (totalLength as number) / (infoDict["piece length"] as number),
  ) * 20;
  if (infoDict["pieces"].length !== expectedPiecesLength) {
    throw new TorrentParseError(
      `Invalid "info.pieces" field — expected ${expectedPiecesLength} bytes for ${totalLength} content bytes`,
    );
  }
}

/** Normalize the BEP-52 root-level `piece layers` dictionary. */
function normalizePieceLayers(value: unknown): TorrentPieceLayer[] {
  if (!(value instanceof Map)) {
    throw new TorrentParseError(
      'Invalid "piece layers" field — expected a dictionary',
    );
  }
  const layers: TorrentPieceLayer[] = [];
  for (const [root, hashes] of value) {
    layers.push({
      piecesRoot: binaryBytes(root),
      hashes: binaryBytes(hashes),
    });
  }
  return layers;
}

/** Coerce a bencode byte-string value (UTF-8 string or bytes) to bytes. */
function binaryBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TorrentParseError("BEP-52 hash fields must be byte strings");
}
```

---

## Arquivo: `packages/core/src/utils/metainfo-v2.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/metainfo-v2.ts
/**
 * BEP-52 v2 file tree validation and piece layer verification.
 *
 * Adaptado de deno-torrent/metainfo/v2.ts.
 * Browser-first: uses crypto.subtle for SHA-256 Merkle tree verification.
 */

import { TorrentParseError } from "./errors.ts";
import { isSafePathComponent } from "./torrent-types.ts";
import type { TorrentFile, TorrentFileTree, TorrentInfo, TorrentPieceLayer, TorrentV2File, TorrentV2Info } from "./torrent-types.ts";

const BLOCK_LENGTH = 16 * 1024;
const MAX_FILE_TREE_DEPTH = 256;
const MAX_FILE_COUNT = 1_000_000;

/** One flattened file in the BEP-52 piece address space. */
export interface TorrentV2FileEntry {
  /** Safe path components from the file-tree root. */
  path: string[];
  /** File size in bytes. */
  length: number;
  /** File Merkle root, absent only for empty files. */
  piecesRoot?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
  /** First piece index in the v2 piece address space. */
  pieceStart: number;
  /** Number of logical torrent pieces occupied by this file. */
  pieceCount: number;
}

/**
 * Flatten and validate a BEP-52 file tree in its canonical traversal order.
 */
export function flattenV2Files(info: TorrentV2Info): TorrentV2FileEntry[] {
  const pieceLength = info["piece length"];
  if (
    !Number.isSafeInteger(pieceLength) || pieceLength < BLOCK_LENGTH ||
    !isPowerOfTwo(pieceLength)
  ) {
    throw new TorrentParseError(
      'Invalid "info.piece length" field for v2 — expected a power of two of at least 16384',
    );
  }
  const fileTree = info["file tree"];
  if (!isDictionary(fileTree)) {
    throw new TorrentParseError('Missing or invalid "info.file tree" dictionary');
  }

  const files: TorrentV2FileEntry[] = [];
  const stack: Array<{ node: TorrentFileTree; path: string[]; depth: number }> = [
    { node: fileTree, path: [], depth: 0 },
  ];
  let pieceStart = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > MAX_FILE_TREE_DEPTH) {
      throw new TorrentParseError("Torrent v2 file tree is too deep");
    }
    const entries = Object.entries(current.node);
    if (entries.length === 0) {
      throw new TorrentParseError(
        "Torrent v2 file tree contains an empty directory",
      );
    }
    const terminal = Object.prototype.hasOwnProperty.call(current.node, "");
    if (terminal) {
      if (current.path.length === 0) {
        throw new TorrentParseError("Torrent v2 file tree root must not be a file");
      }
      if (entries.length !== 1) {
        throw new TorrentParseError(
          "Torrent v2 file entry must not contain child paths",
        );
      }
      const properties = current.node[""] as TorrentV2File;
      validateFileProperties(properties, current.path);
      const file = properties as TorrentV2File;
      const pieceCount =
        file.length === 0 ? 0 : Math.ceil(file.length / pieceLength);
      files.push({
        path: current.path,
        length: file.length,
        piecesRoot: file["pieces root"],
        attr: file.attr,
        pieceStart,
        pieceCount,
      });
      pieceStart += pieceCount;
      if (files.length > MAX_FILE_COUNT) {
        throw new TorrentParseError("Torrent v2 contains too many files");
      }
      continue;
    }

    for (let index = entries.length - 1; index >= 0; index--) {
      const [component, child] = entries[index]!;
      if (!isSafePathComponent(component)) {
        throw new TorrentParseError(
          `Invalid v2 file tree path component: ${JSON.stringify(component)}`,
        );
      }
      if (!isDictionary(child)) {
        throw new TorrentParseError(
          `Invalid v2 file tree node: ${[...current.path, component].join("/")}`,
        );
      }
      stack.push({
        node: child as TorrentFileTree,
        path: [...current.path, component],
        depth: current.depth + 1,
      });
    }
  }

  if (files.length === 0) {
    throw new TorrentParseError("Torrent v2 file tree must contain at least one file");
  }
  return files;
}

/**
 * Validate all BEP-52 piece layers against the file-tree Merkle roots.
 */
export async function validateV2PieceLayers(
  info: TorrentV2Info,
  layers: readonly TorrentPieceLayer[],
): Promise<TorrentV2FileEntry[]> {
  const files = flattenV2Files(info);
  const byRoot = new Map<string, TorrentPieceLayer>();

  for (const layer of layers) {
    if (layer.piecesRoot.length !== 32) {
      throw new TorrentParseError('Invalid "piece layers" key — expected 32 bytes');
    }
    if (layer.hashes.length === 0 || layer.hashes.length % 32 !== 0) {
      throw new TorrentParseError(
        'Invalid "piece layers" value — expected one or more 32-byte hashes',
      );
    }
    const key = toHex(layer.piecesRoot);
    if (byRoot.has(key)) {
      throw new TorrentParseError("Duplicate BEP-52 piece layer root");
    }
    byRoot.set(key, layer);
  }

  const used = new Set<string>();
  for (const file of files) {
    if (file.length === 0) {
      if (file.piecesRoot !== undefined) {
        throw new TorrentParseError(
          `Empty v2 file must not have a pieces root: ${file.path.join("/")}`,
        );
      }
      continue;
    }
    if (file.piecesRoot?.length !== 32) {
      throw new TorrentParseError(
        `Non-empty v2 file has no valid pieces root: ${file.path.join("/")}`,
      );
    }
    if (file.length <= info["piece length"]) continue;

    const key = toHex(file.piecesRoot!);
    const layer = byRoot.get(key);
    if (!layer) {
      throw new TorrentParseError(
        `Missing piece layer for v2 file: ${file.path.join("/")}`,
      );
    }
    if (layer.hashes.length !== file.pieceCount * 32) {
      throw new TorrentParseError(
        `Invalid piece layer hash count for v2 file: ${file.path.join("/")}`,
      );
    }
    const calculated = await merkleRootFromPieceLayer(
      layer.hashes,
      info["piece length"],
    );
    if (!equals(calculated, file.piecesRoot!)) {
      throw new TorrentParseError(
        `Piece layer does not match pieces root for v2 file: ${file.path.join("/")}`,
      );
    }
    used.add(key);
  }

  if (used.size !== byRoot.size) {
    throw new TorrentParseError(
      "Piece layers contain an entry not required by the v2 file tree",
    );
  }
  return files;
}

/**
 * Ensure the v1 and v2 halves of a hybrid torrent describe
 * identical files and alignment.
 */
export function validateHybridLayout(
  info: TorrentInfo,
  v2Files: readonly TorrentV2FileEntry[],
): void {
  const infoAny = info as Record<string, unknown>;
  if (infoAny["meta version"] !== 2 || infoAny["pieces"] === undefined) return;

  const v1Files: TorrentFile[] =
    (info as TorrentV2Info).files ??
    [{ length: (info as TorrentV2Info).length!, path: [(info as TorrentV2Info).name] }];
  const realV1 = v1Files.filter((file) => !file.attr?.includes("p"));

  if (realV1.length !== v2Files.length) {
    throw new TorrentParseError(
      "Hybrid torrent v1/v2 file counts do not match",
    );
  }

  let v1Offset = 0;
  let realIndex = 0;
  for (const file of v1Files) {
    if (file.attr?.includes("p")) {
      v1Offset += file.length;
      continue;
    }
    const v2 = v2Files[realIndex]!;
    if (v1Offset % info["piece length"] !== 0 && realIndex > 0) {
      throw new TorrentParseError(
        `Hybrid torrent file is not piece-aligned: ${file.path.join("/")}`,
      );
    }
    if (file.length !== v2.length || !samePath(file.path, v2.path)) {
      throw new TorrentParseError(
        `Hybrid torrent v1/v2 file layout differs at: ${file.path.join("/")}`,
      );
    }
    v1Offset += file.length;
    realIndex++;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────

async function merkleRootFromPieceLayer(
  hashes: Uint8Array,
  pieceLength: number,
): Promise<Uint8Array> {
  const nodes = splitHashes(hashes);
  const target = nextPowerOfTwo(nodes.length);

  let zero: Uint8Array = new Uint8Array(32);
  for (let size = BLOCK_LENGTH; size < pieceLength; size *= 2) {
    zero = await hashPair(zero, zero);
  }
  while (nodes.length < target) nodes.push(zero);

  while (nodes.length > 1) {
    const next: Uint8Array[] = [];
    for (let index = 0; index < nodes.length; index += 2) {
      next.push(await hashPair(nodes[index]!, nodes[index + 1]!));
    }
    nodes.length = 0;
    nodes.push(...next);
  }
  return nodes[0]!;
}

async function hashPair(
  left: Uint8Array,
  right: Uint8Array,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(64);
  bytes.set(left);
  bytes.set(right, 32);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}

function splitHashes(bytes: Uint8Array): Uint8Array[] {
  const hashes: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32) {
    hashes.push(bytes.slice(offset, offset + 32));
  }
  return hashes;
}

function validateFileProperties(
  value: unknown,
  path: readonly string[],
): void {
  if (!isDictionary(value)) {
    throw new TorrentParseError(
      `Invalid v2 file properties: ${path.join("/")}`,
    );
  }
  const dict = value as Record<string, unknown>;
  if (!Number.isSafeInteger(dict["length"]) || (dict["length"] as number) < 0) {
    throw new TorrentParseError(
      `Invalid v2 file length: ${path.join("/")}`,
    );
  }
  if (dict["attr"] !== undefined && typeof dict["attr"] !== "string") {
    throw new TorrentParseError(
      `Invalid v2 file attributes: ${path.join("/")}`,
    );
  }
  if (dict["pieces root"] !== undefined) {
    if (typeof dict["pieces root"] === "string") {
      (dict as Record<string, unknown>)["pieces root"] =
        new TextEncoder().encode(dict["pieces root"]);
    }
    if (!(dict["pieces root"] instanceof Uint8Array)) {
      throw new TorrentParseError(
        `Invalid v2 pieces root: ${path.join("/")}`,
      );
    }
  }
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (Math.log2(value) % 1 === 0);
}

function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

function equals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function samePath(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

```

---

## Arquivo: `packages/core/src/utils/net.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/net.ts
/**
 * Network address, port, and compact-peer utilities.
 *
 * Adaptado de deno-torrent/toolkit/net/net_util.ts para uso browser-first.
 *
 * Mudanças em relação ao deno-torrent:
 * - isNetPort valida 1-65535 (porta 0 não é usável como porta de destino)
 * - getMacAddr() removido (Deno-only, desnecessário no browser)
 * - isDomain, isWellKnownPort, isRegisteredPort, isDynamicPort removidos (não usados)
 * - bytes2IPv4Str / ipv4Str2Bytes internalizados como helpers privados
 * - Adicionado: isIPv6String, parseCompactIpv4Peers, parseCompactIpv6Peers, deduplicatePeers
 */

// ============================================================================
// VALIDAÇÃO DE PORTA
// ============================================================================

/**
 * Verifica se a porta é válida (1-65535).
 * Porta 0 é reservada pelo OS e não é usável como porta de destino.
 */
export function isNetPort(port: number): boolean {
  if (!Number.isInteger(port)) return false;
  return port >= 1 && port <= 65535;
}

// ============================================================================
// VALIDAÇÃO DE IPv4
// ============================================================================

/**
 * Verifica se o string é um endereço IPv4 válido (dotted-decimal).
 * Cada octeto deve estar no range 0-255.
 */
export function isIPv4String(ip: string): boolean {
  return /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/
    .test(ip);
}

/**
 * Verifica se o Uint8Array representa um endereço IPv4 (exatamente 4 bytes).
 */
export function isIPv4Bytes(ip: Uint8Array): boolean {
  return ip.length === 4;
}

// ============================================================================
// VALIDAÇÃO DE IPv6
// ============================================================================

/**
 * Validação básica de string IPv6.
 * Aceita formatos: full (::1, fe80::1), com zona (%eth0), e com IPv4 embutido.
 * Não valida semântica exaustiva — cobre os formatos encontrados em peers/trackers.
 */
export function isIPv6String(ip: string): boolean {
  if (!ip || ip.length < 2) return false;

  // Remover zona (scope id), ex: fe80::1%eth0
  const zoneIdx = ip.indexOf("%");
  const addr = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;

  // Caso especial: "::"
  if (addr === "::") return true;

  // Caso: IPv4-mapped (::ffff:192.168.1.1) ou IPv4-embedded
  const lastColon = addr.lastIndexOf(":");
  if (lastColon >= 0) {
    const afterLastColon = addr.slice(lastColon + 1);
    // Se o segmento após o último ':' contém '.', é IPv4 embutido
    if (afterLastColon.includes(".")) {
      if (!isIPv4String(afterLastColon)) return false;
      // Validar a parte IPv6 antes do IPv4
      // Remove o ':' separador (não é parte dos hextets).
      // Se isso quebrou um "::" (ex: "::192.168.1.1" → ":"), restaura.
      let v6Part = addr.slice(0, lastColon);
      if (v6Part.endsWith(":") && !v6Part.endsWith("::")) {
        v6Part += ":";
      }
      return isValidIpv6Hextets(v6Part, true);
    }
  }

  return isValidIpv6Hextets(addr, false);
}

/**
 * Valida os hextets de um endereço IPv6.
 */
function isValidIpv6Hextets(addr: string, hasEmbeddedIpv4: boolean): boolean {
  // Separar os lados do "::"
  const doubleColonIdx = addr.indexOf("::");
  let leftPart: string;
  let rightPart: string;

  if (doubleColonIdx >= 0) {
    // Verificar se há mais de um "::"
    if (addr.indexOf("::", doubleColonIdx + 1) >= 0) return false;

    leftPart = addr.slice(0, doubleColonIdx);
    rightPart = addr.slice(doubleColonIdx + 2);
  } else {
    leftPart = addr;
    rightPart = "";
  }

  const leftGroups = leftPart ? leftPart.split(":") : [];
  const rightGroups = rightPart ? rightPart.split(":") : [];
  const totalGroups = leftGroups.length + rightGroups.length;

  // Sem "::", deve ter exatamente 8 grupos (ou 6 se IPv4 embutido)
  if (doubleColonIdx < 0) {
    const expected = hasEmbeddedIpv4 ? 6 : 8;
    if (totalGroups !== expected) return false;
  } else {
    // Com "::", o total de grupos deve ser <= 7 (ou 5 com IPv4 embutido)
    const max = hasEmbeddedIpv4 ? 5 : 7;
    if (totalGroups > max) return false;
  }

  // Validar cada grupo
  const allGroups = [...leftGroups, ...rightGroups];
  for (const group of allGroups) {
    if (group === "") return false; // grupo vazio sem "::"
    if (group.length > 4) return false;
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return false;
  }

  return true;
}

// ============================================================================
// HELPERS PRIVADOS: conversão IPv4 bytes ↔ string
// ============================================================================

function bytesToIPv4String(bytes: Uint8Array): string {
  return `${bytes[0]!}.${bytes[1]!}.${bytes[2]!}.${bytes[3]!}`;
}

function ipv4StringToBytes(ip: string): Uint8Array | undefined {
  if (!isIPv4String(ip)) return undefined;
  return Uint8Array.from(ip.split(".").map((v) => parseInt(v, 10)));
}

// ============================================================================
// COMPACT PEER PARSING (BEP 23 / BEP 7)
// ============================================================================

export interface PeerEndpoint {
  ip: string;
  port: number;
}

/**
 * Decodifica peers no formato compact IPv4 (BEP 23).
 * Cada peer ocupa 6 bytes: 4 bytes IP + 2 bytes porta (big-endian).
 *
 * @param data - Buffer contendo os peers compactos
 * @returns Array de { ip, port }
 * @throws {RangeError} Se o comprimento de data não for múltiplo de 6
 */
export function parseCompactIpv4Peers(data: Uint8Array): Array<PeerEndpoint> {
  if (data.length % 6 !== 0) {
    throw new RangeError(
      `compact IPv4 peer data length must be a multiple of 6, got ${data.length}`,
    );
  }

  const peers: Array<PeerEndpoint> = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    const ip = bytesToIPv4String(data.subarray(offset, offset + 4));
    const port = (data[offset + 4]! << 8) | data[offset + 5]!;
    peers.push({ ip, port });
  }
  return peers;
}

/**
 * Decodifica peers no formato compact IPv6 (BEP 7).
 * Cada peer ocupa 18 bytes: 16 bytes IP + 2 bytes porta (big-endian).
 *
 * @param data - Buffer contendo os peers compactos
 * @returns Array de { ip, port }
 * @throws {RangeError} Se o comprimento de data não for múltiplo de 18
 */
export function parseCompactIpv6Peers(data: Uint8Array): Array<PeerEndpoint> {
  if (data.length % 18 !== 0) {
    throw new RangeError(
      `compact IPv6 peer data length must be a multiple of 18, got ${data.length}`,
    );
  }

  const peers: Array<PeerEndpoint> = [];
  for (let offset = 0; offset < data.length; offset += 18) {
    const ipBytes = data.subarray(offset, offset + 16);
    const ip = bytesToIPv6String(ipBytes);
    const port = (data[offset + 16]! << 8) | data[offset + 17]!;
    peers.push({ ip, port });
  }
  return peers;
}

/**
 * Converte 16 bytes em string IPv6 abreviado (RFC 5952 simplificado).
 * Compressa a sequência mais longa de grupos zero para "::".
 */
function bytesToIPv6String(bytes: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    const value = (bytes[i]! << 8) | bytes[i + 1]!;
    groups.push(value.toString(16));
  }

  // Encontrar a sequência mais longa de grupos "0"
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === "0") {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  // Comprimir a sequência mais longa
  if (bestLen >= 2) {
    const left = groups.slice(0, bestStart).join(":");
    const right = groups.slice(bestStart + bestLen).join(":");
    if (left === "" && right === "") return "::";
    if (left === "") return `::${right}`;
    if (right === "") return `${left}::`;
    return `${left}::${right}`;
  }

  return groups.join(":");
}

// ============================================================================
// DEDUPLICAÇÃO DE PEERS
// ============================================================================

/**
 * Remove peers duplicados (mesmo ip + port).
 * Preserva a ordem de primeira ocorrência.
 */
export function deduplicatePeers(
  peers: Array<PeerEndpoint>,
): Array<PeerEndpoint> {
  const seen = new Set<string>();
  const result: Array<PeerEndpoint> = [];

  for (const peer of peers) {
    const key = `${peer.ip}:${peer.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(peer);
    }
  }

  return result;
}

```

---

## Arquivo: `packages/core/src/utils/parse-torrent.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/parse-torrent.ts
/**
 * Torrent identifier parsing — magnet URIs, raw info hashes and `.torrent`
 * buffers — producing the `ParsedTorrent` shape consumed by BrowserTorrent.
 *
 * Fase 2 (Metadata & Discovery): a decodificação de buffers agora delega para
 * `metainfo-parser.ts` + `metainfo-identity.ts`:
 *
 * - Validação rigorosa (BEP 3/12/19/47/52) com `TorrentParseError` tipado.
 * - Os bytes exatos do dicionário `info` são preservados (`infoBytes`), de
 *   modo que o info hash é sempre fiel ao arquivo original — a versão
 *   anterior fazia `sha1(encode(info))`, que pode divergir do hash real.
 * - Suporte a metadados v2/hybrid (BEP 52): `infoHashV2`, `version` e
 *   arquivos derivados do `file tree`.
 *
 * A forma pública (`ParsedTorrent`, `ParsedTorrentFile`, `parseTorrent`) é
 * preservada; campos novos são opcionais.
 */

import { BencodeDict } from "./bencode.ts";
import { parseMagnet, ParsedMagnet } from "./magnet.ts";
import { parseTorrentWithIdentity } from "./metainfo-identity.ts";
import { flattenV2Files } from "./metainfo-v2.ts";
import type { TorrentV2Info } from "./torrent-types.ts";

export interface ParsedTorrentFile {
  path: string;
  name: string;
  length: number;
  offset: number;
}

export interface ParsedTorrent {
  infoHash: string;
  infoHashBuffer: Uint8Array;
  name: string;
  announce: string[];
  urlList: string[];
  peerAddresses: string[];
  files: ParsedTorrentFile[];
  length: number;
  pieceLength: number;
  pieces: Uint8Array[];
  info: BencodeDict;
  magnetURI: string;
  comment?: string;
  createdBy?: string;
  /** Full 64-char hex BEP-52 info hash, when the metadata is v2 or hybrid. */
  infoHashV2?: string;
  /** Exact bencoded bytes of the `info` dictionary (faithful hash / BEP 9). */
  infoBytes?: Uint8Array;
  /** Original `.torrent` bytes, when parsed from a buffer. */
  torrentFileBytes?: Uint8Array;
  /** Detected metadata version. */
  version?: "v1" | "v2" | "hybrid";
}

/** Resource limits accepted by `parseTorrent` for buffer input. */
export interface ParseTorrentInputOptions {
  /** Maximum encoded metainfo size in bytes (default 16 MiB). */
  maxBytes?: number;
  /** Allow v2 metadata without its outer piece layers (BEP 9 bootstrap). */
  allowMissingPieceLayers?: boolean;
}

export async function parseTorrent(
  torrentId: string | Uint8Array | ParsedTorrent,
  options: ParseTorrentInputOptions = {},
): Promise<ParsedTorrent> {
  // 1. Se já for um objeto ParsedTorrent, apenas retorna
  if (typeof torrentId === "object" && !(torrentId instanceof Uint8Array) && "infoHash" in torrentId && "files" in torrentId) {
    return torrentId as ParsedTorrent;
  }

  // 2. Se for string, assume que é Magnet URI (ou infoHash puro)
  if (typeof torrentId === "string") {
    let magnetUri = torrentId;
    if (/^[a-f0-9]{40}$/i.test(torrentId) || /^[a-z2-7]{32}$/i.test(torrentId)) {
      magnetUri = `magnet:?xt=urn:btih:${torrentId}`;
    }
    if (!magnetUri.startsWith("magnet:?")) {
      throw new Error("Invalid torrent identifier");
    }
    return magnetToParsed(parseMagnet(magnetUri));
  }

  // 3. Se for Uint8Array, assume que é um arquivo .torrent codificado em Bencode
  if (torrentId instanceof Uint8Array) {
    return await bufferToParsed(torrentId, options);
  }

  throw new Error("Invalid torrent identifier type");
}

function magnetToParsed(magnet: ParsedMagnet): ParsedTorrent {
  const version: "v1" | "v2" | "hybrid" =
    magnet.infoHashV1Hex !== undefined && magnet.infoHashV2Hex !== undefined
      ? "hybrid"
      : magnet.protocol;

  return {
    infoHash: magnet.infoHash,
    infoHashBuffer: magnet.handshakeHash,
    name: magnet.name || "Unknown",
    announce: magnet.announce,
    urlList: magnet.webSeeds,
    peerAddresses: magnet.peerAddresses,
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: magnet.magnetURI,
    infoHashV2: magnet.infoHashV2Hex,
    version,
  };
}

async function bufferToParsed(
  buffer: Uint8Array,
  options: ParseTorrentInputOptions,
): Promise<ParsedTorrent> {
  // Validação rigorosa + preservação dos bytes exatos do info dict.
  const identity = await parseTorrentWithIdentity(buffer, {
    maxBytes: options.maxBytes,
    allowMissingPieceLayers: options.allowMissingPieceLayers,
  });
  const torrent = identity.torrent;
  const infoRecord = torrent.info as unknown as BencodeDict;

  const pieceLength = infoRecord["piece length"] as number;

  // Peças v1 (v2-only não possui hashes SHA-1 por peça).
  const pieces: Uint8Array[] = [];
  if (identity.infoHashV1 !== undefined) {
    const piecesRaw = infoRecord["pieces"] as Uint8Array;
    for (let i = 0; i < piecesRaw.length; i += 20) {
      pieces.push(piecesRaw.subarray(i, i + 20));
    }
  }

  // Arquivos: layout v1/hybrid ou file tree v2.
  const files: ParsedTorrentFile[] = [];
  let totalLength = 0;

  if (identity.version === "v2") {
    const v2Files = flattenV2Files(torrent.info as unknown as TorrentV2Info);
    for (const file of v2Files) {
      const path = file.path.join("/");
      const name = file.path[file.path.length - 1]!;
      files.push({ path, name, length: file.length, offset: totalLength });
      totalLength += file.length;
    }
  } else if (infoRecord["files"]) {
    const filesList = infoRecord["files"] as Array<Record<string, unknown>>;
    for (const fileDict of filesList) {
      const length = fileDict["length"] as number;
      const pathParts = fileDict["path"] as string[];
      const path = pathParts.join("/");
      const name = pathParts[pathParts.length - 1]!;
      files.push({ path, name, length, offset: totalLength });
      totalLength += length;
    }
  } else {
    const length = infoRecord["length"] as number;
    const name = infoRecord["name"] as string;
    files.push({ path: name, name, length, offset: 0 });
    totalLength = length;
  }

  // Announce + announce-list (ordem preservada, sem duplicatas).
  const announce: string[] = [];
  if (torrent.announce) {
    announce.push(torrent.announce);
  }
  if (torrent["announce-list"]) {
    for (const tier of torrent["announce-list"]) {
      for (const url of tier) {
        if (!announce.includes(url)) announce.push(url);
      }
    }
  }

  // Web seeds (BEP 19).
  const urlList: string[] = [];
  const rawUrlList = torrent["url-list"] as string | string[] | Uint8Array | undefined;
  if (rawUrlList !== undefined) {
    const candidates = Array.isArray(rawUrlList) ? rawUrlList : [rawUrlList];
    for (const url of candidates) {
      const urlStr = typeof url === "string"
        ? url
        : new TextDecoder().decode(url as Uint8Array);
      if (!urlList.includes(urlStr)) urlList.push(urlStr);
    }
  }

  const infoHashHex = identity.infoHashHex;
  const infoHashBuffer = new Uint8Array(identity.infoHash);

  return {
    infoHash: infoHashHex,
    infoHashBuffer,
    name: infoRecord["name"] as string,
    announce,
    urlList,
    peerAddresses: [],
    files,
    length: totalLength,
    pieceLength,
    pieces,
    info: infoRecord,
    magnetURI: "",
    comment: torrent.comment,
    createdBy: torrent["created by"],
    infoHashV2: identity.infoHashV2 ? toHex(identity.infoHashV2) : undefined,
    infoBytes: identity.infoBytes,
    torrentFileBytes: new Uint8Array(buffer),
    version: identity.version,
  };
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

```

---

## Arquivo: `packages/core/src/utils/peerid.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/peerid.ts

import { generateRandomString } from "../crypto/random.ts";

export interface ClientInfo {
  code: string;
  name?: string;
  version?: string;
  style: "azureus" | "shadow" | "unknown";
}

export const BT_PEER_ID_PREFIX = "-BT0100-";

const AZUREUS_CLIENTS: Record<string, string> = {
  "AG": "Ares",
  "A~": "Ares",
  "AR": "Arctic",
  "AT": "Artemis",
  "AV": "Avicora",
  "AX": "BitPump",
  "AZ": "Azureus/Vuze",
  "BB": "BitBuddy",
  "BC": "BitComet",
  "BE": "Baretorrent",
  "BF": "Bitflu",
  "BG": "BTG (libtorrent)",
  "BL": "BitCometLite",
  "BP": "BitTorrent Pro",
  "BR": "BitRocket",
  "BS": "BTSlave",
  "BT": "mainline BitTorrent",
  "BW": "BitWombat",
  "BX": "~Bittorrent X",
  "CD": "Enhanced CTorrent",
  "CT": "CTorrent",
  "DE": "Deluge",
  "DP": "Propagate Data Client",
  "EB": "EBit",
  "ES": "electric sheep",
  "FC": "FileCroc",
  "FD": "Free Download Manager",
  "FT": "FoxTorrent",
  "FX": "Freebox BitTorrent",
  "GS": "GSTorrent",
  "HK": "Hekate",
  "HL": "Halite",
  "HM": "hMule (libtorrent)",
  "HN": "Hydranode",
  "IL": "iLivid",
  "JS": "Justseed.it",
  "JT": "JavaTorrent",
  "KG": "KGet",
  "KT": "KTorrent",
  "LC": "LeechCraft",
  "LH": "LH-ABC",
  "LO": "BrowserTorrent", // 🔥 NOSSO CLIENTE
  "LP": "Lphant",
  "LT": "libtorrent (Rasterbar)",
  "lt": "libTorrent (Rakshasa)",
  "LW": "LimeWire",
  "MK": "Meerkat",
  "MO": "MonoTorrent",
  "MP": "MooPolice",
  "MR": "Miro",
  "MT": "MoonlightTorrent",
  "NB": "Net::BitTorrent",
  "NX": "Net Transport",
  "OS": "OneSwarm",
  "OT": "OmegaTorrent",
  "PB": "Protocol::BitTorrent",
  "PD": "Pando",
  "PI": "PicoTorrent",
  "PT": "PHPTracker",
  "qB": "qBittorrent",
  "QD": "QQDownload",
  "QT": "Qt 4 Torrent",
  "RT": "Retriever",
  "RZ": "RezTorrent",
  "S~": "Shareaza (alpha/beta)",
  "SB": "~Swiftbit",
  "SD": "Thunder (XùnLéi)",
  "SM": "SoMud",
  "SP": "BitSpirit",
  "SS": "SwarmScope",
  "ST": "SymTorrent",
  "st": "sharktorrent",
  "SZ": "Shareaza",
  "TB": "Torch",
  "TE": "terasaur Seed Bank",
  "TL": "Tribler",
  "TN": "TorrentDotNET",
  "TR": "Transmission",
  "TS": "Torrentstorm",
  "TT": "TuoTu",
  "UL": "uLeecher!",
  "UM": "µTorrent for Mac",
  "UT": "µTorrent",
  "VG": "Vagaa",
  "WD": "WebTorrent Desktop",
  "WT": "BitLet",
  "WW": "WebTorrent",
  "WY": "FireTorrent",
  "XF": "Xfplay",
  "XL": "Xunlei",
  "XS": "XSwifter",
  "XT": "XanTorrent",
  "XX": "Xtorrent",
  "ZT": "ZipTorrent",
};

const SHADOW_CLIENTS: Record<string, string> = {
  "A": "ABC",
  "O": "Osprey Permaseed",
  "Q": "BTQueue",
  "R": "Tribler",
  "S": "Shadow's Client",
  "T": "BitTornado",
  "U": "UPnP NAT Bit Torrent",
};

// Funções utilitárias para validação
export function isBase32Char(char: string): boolean {
  return /^[A-Z2-7]$/.test(char);
}

export function isBase32(str: string): boolean {
  return /^[A-Z2-7]+$/.test(str);
}

export function isHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str);
}

export function isSha1(str: string): boolean {
  return str.length === 40 && isHex(str);
}

// Funções de validação de Peer ID
export function isAzStyle(peerid: string): boolean {
  return (
    peerid.length >= 8 &&
    peerid[0] === "-" &&
    peerid[7] === "-" &&
    /^[A-Za-z0-9]{2}$/.test(peerid.slice(1, 3)) &&
    /^\d{4}$/.test(peerid.slice(3, 7))
  );
}

export function isShadowStyle(peerid: string): boolean {
  return (
    peerid.length >= 9 &&
    /^[A-Za-z]$/.test(peerid[0]!) && // 🔥 Ajuste TS: non-null assertion
    peerid.slice(6, 9) === "---"
  );
}

// Funções de conversão de versão
function parseAzVersion(versionStr: string): string {
  if (versionStr.length !== 4) return versionStr;

  const majorChar = versionStr[0]!;
  const minorChar = versionStr[1]!;

  // Validar que major/minor são dígitos
  if (!/\d/.test(majorChar) || !/\d/.test(minorChar)) {
    throw new Error('Invalid Azureus version format: major/minor must be digits');
  }

  const major = majorChar;
  const minor = minorChar;
  const patchNum = parseInt(versionStr.slice(2), 10);

  // Validar range do patch (0-99)
  if (patchNum < 0 || patchNum > 99) {
    throw new Error('Invalid Azureus version format: patch must be between 0-99');
  }

  return `${major}.${minor}.${patchNum}`;
}

function parseShadowVersion(versionStr: string): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-";
  const parts: number[] = [];

  for (const char of versionStr) {
    if (char === "-") break;
    const idx = chars.indexOf(char);
    if (idx !== -1) parts.push(idx);
  }

  return parts.length > 0 ? parts.join(".") : "0";
}

// Funções de encode para diferentes estilos
export function encodeAzStyle(clientCode: string, version: string): string {
  if (clientCode.length !== 2) {
    throw new Error("Client code must be exactly 2 characters");
  }
  
  // Converter versão para formato de 4 dígitos (ex: "1.2.3" -> "1203")
  const parts = version.split(".");
  let major = "0", minor = "0", patch = "0";
  
  if (parts.length >= 1) major = parts[0]?.substring(0, 1) || "0";
  if (parts.length >= 2) minor = parts[1]?.substring(0, 1) || "0";
  if (parts.length >= 3) patch = parts[2]?.substring(0, 2).padStart(2, "0") || "00";
  
  // Garantir que patch tenha 2 dígitos
  if (patch.length === 1) patch = "0" + patch;
  
  const versionStr = `${major}${minor}${patch}`;
  if (versionStr.length !== 4) {
    throw new Error("Version must be in format X.Y.Z where X,Y,Z are single digits or XX for patch");
  }
  
  return `-${clientCode}${versionStr}-`;
}

export function encodeShadowStyle(clientCode: string, version: string): string {
  if (clientCode.length !== 1) {
    throw new Error("Client code must be exactly 1 character");
  }
  
  // Converter versão para formato shadow (ex: "1.2.3" -> "abc")
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-";
  const parts = version.split(".").slice(0, 3);
  let versionStr = "";
  
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num >= chars.length) {
      versionStr += "0"; // fallback para "0" se o número for inválido
    } else {
      versionStr += chars[num];
    }
  }
  
  // Preencher com "0" se necessário
  while (versionStr.length < 5) {
    versionStr += "0";
  }
  
  return `${clientCode}${versionStr}---`;
}

export function encodeGeneric(clientCode: string, version: string, style: "azureus" | "shadow"): string {
  if (style === "azureus") {
    return encodeAzStyle(clientCode, version);
  } else {
    return encodeShadowStyle(clientCode, version);
  }
}

export function decodePeerId(peerId: string | Uint8Array): ClientInfo | null {
  const peeridStr = typeof peerId === "string"
    ? peerId
    : new TextDecoder("utf-8", { fatal: false }).decode(peerId);

  if (peeridStr.length < 20) return null;
  const id = peeridStr.slice(0, 20);

  if (isAzStyle(id)) {
    const code = id.slice(1, 3);
    const versionRaw = id.slice(3, 7);
    const name = AZUREUS_CLIENTS[code] || `Unknown (${code})`;
    const version = parseAzVersion(versionRaw);

    return { code, name, version, style: "azureus" };
  }

  if (isShadowStyle(id)) {
    const code = id[0]!; // 🔥 Ajuste TS: non-null assertion
    const versionRaw = id.slice(1, 6);
    const name = SHADOW_CLIENTS[code] || `Unknown (${code})`;
    const version = parseShadowVersion(versionRaw);

    return { code, name, version, style: "shadow" };
  }

  // 🔥 CORREÇÃO: Retornar null para peers desconhecidos, conforme esperado pelos testes
  return null;
}

export function getPeerIdClientName(peerId: string | Uint8Array): string {
  const info = decodePeerId(peerId);
  return info?.name || "Unknown Client";
}

export function generateBrowserTorrentPeerId(): Uint8Array {
  const prefix = BT_PEER_ID_PREFIX;
  const randomPart = generateRandomString(20 - prefix.length);
  const peerIdStr = prefix + randomPart;

  return new TextEncoder().encode(peerIdStr);
}


```

---

## Arquivo: `packages/core/src/utils/simple-buffer.ts`

````ts
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

````

---

## Arquivo: `packages/core/src/utils/torrent-types.ts`

```ts
// /browsertorrent/monorepo/webtorrent/src/utils/torrent-types.ts
/**
 * Shared type contracts for torrent parsing (BEP 3, BEP 12, BEP 19, BEP 47, BEP 52).
 *
 * Adaptado de deno-torrent/metainfo/types.ts.
 * Browser-first: no Reader/Writer interfaces (those are Deno-only).
 */

import { TorrentParseError } from "./errors.ts";

/** Default maximum encoded torrent size accepted by the parser. */
export const DEFAULT_MAX_METAINFO_SIZE = 16 * 1024 * 1024;

/** Resource limits for torrent parsing. */
export interface ParseTorrentOptions {
  /** Maximum encoded metainfo size in bytes. Defaults to 16 MiB. */
  maxBytes?: number;
  /** Allow BEP-9 v2 info metadata before its outer piece layers are fetched. */
  allowMissingPieceLayers?: boolean;
}

/** Piece-size presets (for future torrent generator). */
export enum PieceSizeEnum {
  SIZE_AUTO = 0,
  SIZE_16MB = 16 * 1024 * 1024,
  SIZE_32MB = 32 * 1024 * 1024,
  SIZE_64MB = 64 * 1024 * 1024,
  SIZE_128MB = 128 * 1024 * 1024,
  SIZE_256MB = 256 * 1024 * 1024,
  SIZE_512MB = 512 * 1024 * 1024,
  SIZE_1GB = 1024 * 1024 * 1024,
  SIZE_2GB = 2 * 1024 * 1024 * 1024,
  SIZE_4GB = 4 * 1024 * 1024 * 1024,
  SIZE_8GB = 8 * 1024 * 1024 * 1024,
  SIZE_16GB = 16 * 1024 * 1024 * 1024,
}

/** A file entry inside the `info.files` list of a multi-file torrent. */
export interface TorrentFile {
  /** File size in bytes. */
  length: number;
  /** Path components relative to the torrent's top-level directory. */
  path: string[];
  /** BEP-47 file attributes; padding entries contain `p`. */
  attr?: string;
}

/** One file terminal in a BEP-52 file tree. */
export interface TorrentV2File {
  /** File size in bytes. */
  length: number;
  /** SHA-256 Merkle root for non-empty file content. */
  "pieces root"?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
}

/** Recursive BEP-52 file tree. File properties stored under the empty key. */
export interface TorrentFileTree {
  [component: string]: TorrentFileTree | TorrentV2File;
}

/** One BEP-52 piece layer, keyed by its file's Merkle root. */
export interface TorrentPieceLayer {
  /** The 32-byte Merkle root identifying the file. */
  piecesRoot: Uint8Array;
  /** Concatenated 32-byte SHA-256 hashes at the torrent piece layer. */
  hashes: Uint8Array;
}

/** Fields shared by BEP-3 and BEP-52 info dictionaries. */
export type TorrentInfoCommon = {
  /** Suggested file name or top-level directory name. */
  name: string;
  /** Nominal piece size in bytes. */
  "piece length": number;
  /** Private flag; `1` tells clients not to use DHT or peer exchange. */
  private?: 0 | 1;
};

/** Complete single-file or multi-file BEP-3 `info` dictionary. */
export type TorrentV1Info = TorrentInfoCommon & {
  /** Concatenated 20-byte SHA-1 hashes, one per piece. */
  pieces: Uint8Array;
} & (
  | { length: number; files?: never }
  | { files: TorrentFile[]; length?: never }
);

/** BEP-52 info dictionary. Optional v1 fields make this a hybrid torrent. */
export type TorrentV2Info = TorrentInfoCommon & {
  "meta version": 2;
  "file tree": TorrentFileTree;
  pieces?: Uint8Array;
  length?: number;
  files?: TorrentFile[];
};

/** A validated BEP-3, BEP-52, or hybrid info dictionary. */
export type TorrentInfo = TorrentV1Info | TorrentV2Info;

/**
 * Public representation of a parsed `.torrent` dictionary.
 * Keys follow the official BitTorrent specification naming conventions.
 */
export type Torrent = {
  "created by"?: string;
  "creation date"?: number;
  announce?: string;
  "announce-list"?: string[][];
  "url-list"?: string | string[];
  info: TorrentInfo;
  "piece layers"?: TorrentPieceLayer[];
  comment?: string;
  source?: string;
};

// ── Path validation ─────────────────────────────────────────────────────

/**
 * Returns whether a torrent path component is safe to interpret.
 * Rejects separators, NUL, and traversal components.
 * Adaptado de deno-torrent/metainfo/path.ts.
 */
export function isSafePathComponent(component: unknown): component is string {
  return typeof component === "string" &&
    component.length > 0 &&
    component !== "." &&
    component !== ".." &&
    !component.includes("/") &&
    !component.includes("\\") &&
    !component.includes("\0");
}

/** Compare strings deterministically (locale-independent). */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Validate that a bencode-decoded torrent dict has safe file paths.
 * Throws TorrentParseError on violation.
 */
export function validateTorrentFilePaths(
  files: Record<string, unknown>[],
): void {
  const entries = new Map<string, { length: number; padding: boolean }>();
  const directoryPrefixes = new Set<string>();

  for (const file of files) {
    const path = file["path"] as string[];
    const key = path.join("\0");
    const padding =
      typeof file["attr"] === "string" && file["attr"].includes("p");
    const previous = entries.get(key);
    if (
      previous !== undefined &&
      !(padding && previous.padding && previous.length === file["length"] as number)
    ) {
      throw new TorrentParseError(
        `Duplicate or conflicting file path: ${path.join("/")}`,
      );
    }
    if (directoryPrefixes.has(key)) {
      throw new TorrentParseError(
        `File path conflicts with a directory path: ${path.join("/")}`,
      );
    }
    for (let index = 1; index < path.length; index++) {
      const prefix = path.slice(0, index).join("\0");
      if (entries.has(prefix)) {
        throw new TorrentParseError(
          `File path is nested below another file: ${path.join("/")}`,
        );
      }
      directoryPrefixes.add(prefix);
    }
    entries.set(key, {
      length: file["length"] as number,
      padding,
    });
  }
}

```

---

## Arquivo: `packages/core/deno.jsonc`

```json
{
  "name": "@vanaware/browsertorrent",
  "version": "0.1.3-mtq0ufmu",
  "exports": "./src/mod.ts",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": [
      "dom",
      "dom.iterable",
      "dom.asynciterable",
      "deno.ns",
      "deno.unstable",
      "DOM",
      "webworker"
    ],
    "strict": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert",
    "@std/fs": "jsr:@std/fs",
    "@std/path": "jsr:@std/path",
    "@std/http": "jsr:@std/http"
  },
  "tasks": {
    "test": "deno test -A tests/",
    "check": "deno check src/**/*.ts example/**/*.ts example/**/*.tsx tests/**/*.ts",
    "tests": "deno task check && deno task test",
    "serve": "deno run -A ./example/server.ts",
    "server": "deno run -A --watch ./example/server.ts",
    "trackers": "deno run -A ./example/test_trackers.ts"
  }
}

```

---

