// /loco/monorepo/webtorrent/tests/utils_test.ts
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