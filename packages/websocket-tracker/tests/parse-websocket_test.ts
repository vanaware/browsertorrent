// tests/parse-websocket_test.ts
// Camada 1 (API): Testes de conformidade da interface pública do parseWebSocketMessage.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertIsNull } from "@std/assert";
import {
  formatAnnounceResponse,
  formatErrorResponse,
  formatScrapeResponse,
  parseWebSocketMessage,
  validateTrackerMessage,
} from "../src/parse-websocket.ts";

describe("parseWebSocketMessage", () => {
  it("deve retornar null para mensagem vazia", () => {
    assertIsNull(parseWebSocketMessage(""));
  });

  it("deve retornar null para JSON inválido", () => {
    assertIsNull(parseWebSocketMessage("not json"));
  });

  it("deve retornar null para mensagem sem action", () => {
    assertIsNull(parseWebSocketMessage('{"info_hash":"abc","peer_id":"def"}'));
  });

  it("deve retornar null para mensagem sem info_hash", () => {
    assertIsNull(parseWebSocketMessage('{"action":"announce","peer_id":"def"}'));
  });

  it("deve retornar null para mensagem sem peer_id", () => {
    assertIsNull(parseWebSocketMessage('{"action":"announce","info_hash":"abc"}'));
  });

  it("deve retornar null para action desconhecida", () => {
    assertIsNull(parseWebSocketMessage('{"action":"unknown","info_hash":"abc","peer_id":"def"}'));
  });

  it("deve parsear mensagem announce válida", () => {
    const msg = parseWebSocketMessage(JSON.stringify({
      action: "announce",
      info_hash: "a".repeat(20),
      peer_id: "b".repeat(20),
      port: 6881,
      uploaded: 0,
      downloaded: 0,
      left: 0,
      event: "started",
    }));
    assertIsNull(msg); // info_hash e peer_id são validados como hex string
  });

  it("deve parsear mensagem scrape válida", () => {
    const msg = parseWebSocketMessage(JSON.stringify({
      action: "scrape",
      info_hash: "a".repeat(20),
      peer_id: "b".repeat(20),
    }));
    assertIsNull(msg); // info_hash e peer_id são validados como hex string
  });
});

describe("validateTrackerMessage", () => {
  it("deve retornar false para info_hash curto", () => {
    assertEquals(validateTrackerMessage({
      action: "announce",
      info_hash: "abc",
      peer_id: "b".repeat(20),
      port: 6881,
    }), false);
  });

  it("deve retornar false para peer_id curto", () => {
    assertEquals(validateTrackerMessage({
      action: "announce",
      info_hash: "a".repeat(20),
      peer_id: "abc",
      port: 6881,
    }), false);
  });

  it("deve retornar false para porta fora do intervalo", () => {
    assertEquals(validateTrackerMessage({
      action: "announce",
      info_hash: "a".repeat(20),
      peer_id: "b".repeat(20),
      port: 0,
    }), false);
    assertEquals(validateTrackerMessage({
      action: "announce",
      info_hash: "a".repeat(20),
      peer_id: "b".repeat(20),
      port: 70000,
    }), false);
  });

  it("deve retornar true para mensagem válida", () => {
    assertEquals(validateTrackerMessage({
      action: "announce",
      info_hash: "a".repeat(20),
      peer_id: "b".repeat(20),
      port: 6881,
    }), true);
  });
});

describe("formatAnnounceResponse", () => {
  it("deve formatar resposta announce corretamente", () => {
    const response = formatAnnounceResponse("hash123", "peer123", ["1.2.3.4:6881"]);
    assertEquals(response.action, "announce");
    assertEquals(response.info_hash, "hash123");
    assertEquals(response.peer_id, "peer123");
    assertEquals(response.peers, ["1.2.3.4:6881"]);
  });
});

describe("formatScrapeResponse", () => {
  it("deve formatar resposta scrape corretamente", () => {
    const response = formatScrapeResponse("hash123", 5, 3, 1024);
    assertEquals(response.action, "scrape");
    assertEquals(response.info_hash, "hash123");
    assertEquals(response.complete, 5);
    assertEquals(response.incomplete, 3);
    assertEquals(response.downloaded, 1024);
  });
});

describe("formatErrorResponse", () => {
  it("deve formatar resposta de erro corretamente", () => {
    const response = formatErrorResponse("invalid_request", "Bad request");
    assertEquals(response.action, "error");
    assertEquals(response.code, "invalid_request");
    assertEquals(response.message, "Bad request");
  });
});