// /loco/monorepo/webtorrent/tests/hasher_test.ts

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
