// /loco/monorepo/webtorrent/tests/bencode_test.ts

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
