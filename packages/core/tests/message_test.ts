// /loco/monorepo/webtorrent/tests/message_test.ts

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
