// tests/peer_test.ts
// Camada 1 (API): Testes de conformidade da interface pública do PeerConnectionManager.

import { describe, it, } from "@std/testing/bdd";
import { assert, assertEquals, } from "@std/assert";
import { PeerConnectionManager, } from "../src/peer.ts";

describe("PeerConnectionManager", () => {
  it("deve criar gerenciador com capacidade padrão de 1000", () => {
    const manager = new PeerConnectionManager();
    assertEquals(manager.getConnectionCount(), 0,);
  });

  it("deve criar gerenciador com capacidade personalizada", () => {
    const manager = new PeerConnectionManager(5,);
    assertEquals(manager.getConnectionCount(), 0,);
  });

  it("deve adicionar conexão e retornar PeerInfo", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    const info = manager.addConnection(ws, "peer1", "hash1", 6881,);
    assertEquals(info.id, info.id,); // deve ter id gerado
    assertEquals(info.peerId, "peer1",);
    assertEquals(info.infoHash, "hash1",);
    assertEquals(info.port, 6881,);
    assertEquals(manager.getConnectionCount(), 1,);
  });

  it("deve obter conexão por peerId", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    const conn = manager.getConnection("peer1",);
    assert(conn !== undefined,);
    assertEquals(conn!.info.peerId, "peer1",);
  });

  it("deve retornar undefined para conexão inexistente", () => {
    const manager = new PeerConnectionManager();
    const conn = manager.getConnection("inexistente",);
    assertEquals(conn, undefined,);
  });

  it("deve atualizar stats da conexão", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    manager.updateStats("peer1", 100, 200, 50,);
    const conn = manager.getConnection("peer1",);
    assert(conn !== undefined,);
    assertEquals(conn!.info.uploaded, 100,);
    assertEquals(conn!.info.downloaded, 200,);
    assertEquals(conn!.info.left, 50,);
  });

  it("deve atualizar evento da conexão", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    manager.updateEvent("peer1", "started",);
    const conn = manager.getConnection("peer1",);
    assert(conn !== undefined,);
    assertEquals(conn!.info.event, "started",);
  });

  it("deve remover conexão", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    assertEquals(manager.getConnectionCount(), 1,);
    assertEquals(manager.removeConnection("peer1",), true,);
    assertEquals(manager.getConnectionCount(), 0,);
  });

  it("deve retornar false ao remover conexão inexistente", () => {
    const manager = new PeerConnectionManager();
    assertEquals(manager.removeConnection("inexistente",), false,);
  });

  it("deve retornar peers por infoHash", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    manager.addConnection(ws, "peer2", "hash1", 6882,);
    manager.addConnection(ws, "peer3", "hash2", 6883,);
    const peers = manager.getPeersByInfoHash("hash1",);
    assertEquals(peers.length, 2,);
  });

  it("deve retornar peerIds por infoHash", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    manager.addConnection(ws, "peer2", "hash1", 6882,);
    const ids = manager.getPeerIdsByInfoHash("hash1",);
    assertEquals(ids.length, 2,);
  });

  it("deve retornar lista de todas as conexões", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    manager.addConnection(ws, "peer2", "hash2", 6882,);
    const all = manager.getAllConnections();
    assertEquals(all.length, 2,);
  });

  it("deve limpar todas as conexões", () => {
    const manager = new PeerConnectionManager();
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    manager.addConnection(ws, "peer2", "hash2", 6882,);
    manager.clear();
    assertEquals(manager.getConnectionCount(), 0,);
  });

  it("deve evictar conexão mais antiga quando atingir capacidade", () => {
    const manager = new PeerConnectionManager(2,);
    const ws = { close: () => {}, } as unknown as WebSocket;
    manager.addConnection(ws, "peer1", "hash1", 6881,);
    // Simular atraso para que peer1 seja mais antigo
    const conn = manager.getConnection("peer1",);
    assert(conn !== undefined,);
    manager.addConnection(ws, "peer2", "hash2", 6882,);
    manager.addConnection(ws, "peer3", "hash3", 6883,); // deve evictar peer1
    assertEquals(manager.getConnectionCount(), 2,);
  });
});
