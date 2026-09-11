// /loco/monorepo/webtorrent/tests/wire_test.ts

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
