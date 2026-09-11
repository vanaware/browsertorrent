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
