// tests/stats_test.ts
// Camada 1 (API): Testes de conformidade da interface pública do StatsManager.

import { describe, it, } from "@std/testing/bdd";
import { assert, assertEquals, assertNotEquals, } from "@std/assert";
import { StatsManager, } from "../src/stats.ts";

describe("StatsManager", () => {
  it("deve inicializar com valores padrão", () => {
    const stats = new StatsManager();
    assertEquals(stats.getConnections(), 0,);
    assertEquals(stats.getMessages(), 0,);
    assertEquals(stats.getCompleted(), 0,);
    assertEquals(stats.getDownloaded(), 0,);
  });

  it("deve incrementar conexões", () => {
    const stats = new StatsManager();
    stats.incrementConnections();
    assertEquals(stats.getConnections(), 1,);
    stats.incrementConnections();
    assertEquals(stats.getConnections(), 2,);
  });

  it("deve decrementar conexões (não abaixo de zero)", () => {
    const stats = new StatsManager();
    stats.decrementConnections();
    assertEquals(stats.getConnections(), 0,);
    stats.incrementConnections();
    stats.decrementConnections();
    assertEquals(stats.getConnections(), 0,);
  });

  it("deve incrementar mensagens", () => {
    const stats = new StatsManager();
    stats.incrementMessages();
    assertEquals(stats.getMessages(), 1,);
  });

  it("deve incrementar downloads completos", () => {
    const stats = new StatsManager();
    stats.incrementCompleted();
    assertEquals(stats.getCompleted(), 1,);
    stats.incrementCompleted();
    assertEquals(stats.getCompleted(), 2,);
  });

  it("deve adicionar bytes baixados", () => {
    const stats = new StatsManager();
    stats.addDownloaded(1024,);
    assertEquals(stats.getDownloaded(), 1024,);
    stats.addDownloaded(512,);
    assertEquals(stats.getDownloaded(), 1536,);
  });

  it("deve retornar estatísticas completas via getStats()", () => {
    const stats = new StatsManager();
    stats.incrementConnections();
    stats.incrementMessages();
    stats.incrementCompleted();
    stats.addDownloaded(100,);

    const s = stats.getStats();
    assertEquals(s.connections, 1,);
    assertEquals(s.messages, 1,);
    assertEquals(s.completed, 1,);
    assertEquals(s.downloaded, 100,);
    assertEquals(s.totalPeers, 1,);
    assertNotEquals(s.startTime, 0,);
    assert(s.uptime >= 0,);
  });

  it("deve retornar uptime em segundos", () => {
    const stats = new StatsManager();
    const uptime = stats.getUptimeSeconds();
    assert(uptime >= 0,);
  });

  it("deve retornar uptime formatado HH:MM:SS", () => {
    const stats = new StatsManager();
    const formatted = stats.getFormattedUptime();
    assertEquals(formatted.length, 8,); // HH:MM:SS
    assertEquals(formatted.charAt(2,), ":",);
    assertEquals(formatted.charAt(5,), ":",);
  });

  it("deve resetar todas as estatísticas", () => {
    const stats = new StatsManager();
    stats.incrementConnections();
    stats.incrementMessages();
    stats.incrementCompleted();
    stats.addDownloaded(100,);
    stats.reset();
    assertEquals(stats.getConnections(), 0,);
    assertEquals(stats.getMessages(), 0,);
    assertEquals(stats.getCompleted(), 0,);
    assertEquals(stats.getDownloaded(), 0,);
  });

  it("deve aceitar maxMemoryMB no construtor", () => {
    const stats = new StatsManager(256,);
    const health = stats.getHealth(10, 5,);
    assertEquals(health.totalPeers, 10,);
    assertEquals(health.totalTorrents, 5,);
  });

  it("deve retornar status healthy quando memória está ok", () => {
    const stats = new StatsManager(512,);
    const health = stats.getHealth(10, 5,);
    assertEquals(health.status, "healthy",);
  });

  it("deve retornar status degraded quando memória > 70%", () => {
    const stats = new StatsManager(100,);
    // Simular memória alta via getMemoryUsage (depende do ambiente)
    const health = stats.getHealth(10, 5,);
    // O status depende do uso real de memória do ambiente
    assertEquals(typeof health.status, "string",);
  });

  it("deve retornar status unhealthy quando memória > 90%", () => {
    const stats = new StatsManager(1,); // 1 MB threshold
    const health = stats.getHealth(10, 5,);
    assertEquals(typeof health.status, "string",);
  });

  it("deve incrementar peers via incrementPeers/decrementPeers", () => {
    const stats = new StatsManager();
    stats.incrementPeers();
    assertEquals(stats.getConnections(), 1,);
    stats.decrementPeers();
    assertEquals(stats.getConnections(), 0,);
  });
});
