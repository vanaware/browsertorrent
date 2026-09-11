// /loco/monorepo/webtorrent/tests/magnet_test.ts

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
