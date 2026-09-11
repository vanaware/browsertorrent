// /loco/monorepo/webtorrent/tests/net_test.ts

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
