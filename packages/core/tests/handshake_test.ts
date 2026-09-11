// /loco/monorepo/webtorrent/tests/handshake_test.ts

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
  const peerId = "-LO0100-123456789012"; // exactly 20 bytes
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
