// tests/server_test.ts
// Camada 1 (API) + Camada 2 (Comportamento): Testes de interface pública e comportamento do WebSocketTracker.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertNotEquals, assertStrictEquals } from "@std/assert";
import { WebSocketTracker } from "../src/server.ts";

describe("WebSocketTracker", () => {
  it("deve criar instância com valores padrão", () => {
    const tracker = new WebSocketTracker();
    assertEquals(tracker.getStats().totalPeers, 0);
    assertEquals(tracker.getStats().totalTorrents, 0);
    assertEquals(tracker.getStats().connections, 0);
  });

  it("deve criar instância com porta personalizada", () => {
    const tracker = new WebSocketTracker(9000);
    assertEquals(tracker.getStats().totalPeers, 0);
  });

  it("deve criar instância com opções personalizadas", () => {
    const tracker = new WebSocketTracker(8000, {
      maxPeers: 500, maxPeersPerTorrent: 25, maxTorrents: 50,
      hostname: "127.0.0.1", idleTimeout: 60000, intervalMs: 60000,
    });
    assertEquals(tracker.getStats().totalPeers, 0);
  });

  it("deve retornar stats via getStats()", () => {
    const tracker = new WebSocketTracker();
    const stats = tracker.getStats();
    assertEquals(stats.totalPeers, 0);
    assertEquals(stats.totalTorrents, 0);
    assertEquals(stats.connections, 0);
    assertEquals(stats.messages, 0);
    assertEquals(stats.completed, 0);
    assertEquals(stats.downloaded, 0);
    assertNotEquals(stats.uptime, 0);
    assertNotEquals(stats.startTime, 0);
  });

  it("deve retornar stats após buildAnnounceResponse", () => {
    const tracker = new WebSocketTracker();
    const peer = {
      id: "test-peer", ws: {} as WebSocket, infoHash: "hash123", peerId: "peer123",
      port: 6881, uploaded: 0, downloaded: 0, left: 100,
      connectedAt: Date.now(), infoHashes: ["hash123"],
    };
    const response = tracker.buildAnnounceResponse("hash123", peer);
    assertEquals(response.action, "announce");
    assertEquals(response.interval, 120);
    assertEquals(response.complete, 0);
    assertEquals(response.incomplete, 0);
    assertEquals(response.peers.length, 0);
  });

  it("deve retornar stats após handleHttpAnnounce", async () => {
    const tracker = new WebSocketTracker();
    const req = new Request("http://localhost:8000/announce?info_hash=abc&peer_id=def&port=6881&event=started");
    const res = await tracker.handleHttpAnnounce(new URL("http://localhost:8000/announce?info_hash=abc&peer_id=def&port=6881&event=started"), req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.action, "announce");
    assertEquals(body.interval, 120);
    assertEquals(body.complete, 0);
    assertEquals(body.incomplete, 0);
    assertEquals(Array.isArray(body.peers), true);
  });

  it("deve retornar erro para handleHttpAnnounce sem info_hash", async () => {
    const tracker = new WebSocketTracker();
    const req = new Request("http://localhost:8000/announce?peer_id=def&port=6881");
    const res = await tracker.handleHttpAnnounce(new URL("http://localhost:8000/announce?peer_id=def&port=6881"), req);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.action, "error");
    assertEquals(body.error, "Missing required parameters: info_hash and peer_id");
  });

  it("deve retornar stats após handleHttpScrape", async () => {
    const tracker = new WebSocketTracker();
    const req = new Request("http://localhost:8000/scrape?info_hash=abc");
    const res = await tracker.handleHttpScrape(new URL("http://localhost:8000/scrape?info_hash=abc"), req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.action, "scrape");
    assertEquals(body.info_hash, "abc");
    assertEquals(body.complete, 0);
    assertEquals(body.incomplete, 0);
    assertEquals(body.downloaded, 0);
  });

  it("deve retornar erro para handleHttpScrape sem info_hash", async () => {
    const tracker = new WebSocketTracker();
    const req = new Request("http://localhost:8000/scrape");
    const res = await tracker.handleHttpScrape(new URL("http://localhost:8000/scrape"), req);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.action, "error");
    assertEquals(body.error, "Missing required parameter: info_hash");
  });

  it("deve retornar stats após close", () => {
    const tracker = new WebSocketTracker();
    tracker.close();
    const stats = tracker.getStats();
    assertEquals(stats.connections, 0);
  });

  it("deve retornar stats após getStats (múltiplas chamadas)", () => {
    const tracker = new WebSocketTracker();
    const stats1 = tracker.getStats();
    const stats2 = tracker.getStats();
    assertStrictEquals(stats1, stats2);
  });
});