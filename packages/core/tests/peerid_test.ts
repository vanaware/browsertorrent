// /loco/monorepo/webtorrent/tests/peerid_test.ts

import { assertEquals } from "@std/assert";
import {
  decodePeerId,
  generateLocoPeerId,
  LOCO_PEER_ID_PREFIX,
  isAzStyle,
  isShadowStyle,
  getPeerIdClientName,
} from "../src/utils/peerid.ts";

import { generateRandomString } from "../src/crypto/random.ts";

Deno.test("peerid: LOCO_PEER_ID_PREFIX is correct length", () => {
  assertEquals(LOCO_PEER_ID_PREFIX, "-LO0100-");
  assertEquals(LOCO_PEER_ID_PREFIX.length, 8);
});

Deno.test("peerid: generateLocoPeerId returns exactly 20 bytes", () => {
  const peerId = generateLocoPeerId();
  assertEquals(peerId.length, 20);
  
  const str = new TextDecoder().decode(peerId);
  assertEquals(str.startsWith(LOCO_PEER_ID_PREFIX), true);
});

Deno.test("peerid: decodePeerId correctly parses Loco PeerId", () => {
  const peerId = generateLocoPeerId();
  const clientInfo = decodePeerId(peerId);
  
  assertEquals(clientInfo?.code, "LO");
  assertEquals(clientInfo?.name, "Loco");
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