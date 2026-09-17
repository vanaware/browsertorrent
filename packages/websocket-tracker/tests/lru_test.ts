// tests/lru_test.ts
// Camada 1 (API): Testes de conformidade da interface pública do LRUCache.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertUndefined, assert } from "@std/assert";
import { LRUCache } from "../src/lru.ts";

describe("LRUCache", () => {
  it("deve criar cache com capacidade padrão de 100", () => {
    const cache = new LRUCache<string>();
    assertEquals(cache.getSize(), 0);
    assertUndefined(cache.get("inexistente"));
    assertEquals(cache.keys().length, 0);
  });

  it("deve criar cache com capacidade personalizada", () => {
    const cache = new LRUCache<number>(3);
    cache.put("a", 1);
    cache.put("b", 2);
    cache.put("c", 3);
    assertEquals(cache.getSize(), 3);
    // Adicionar um quarto item deve evictar o menos recentemente usado
    cache.put("d", 4);
    assertEquals(cache.getSize(), 3);
    assertUndefined(cache.get("a"));
  });

  it("deve retornar valor ao obter e marcar como mais recentemente usado", () => {
    const cache = new LRUCache<string>(3);
    cache.put("a", "alpha");
    cache.put("b", "bravo");
    cache.put("c", "charlie");

    // Acessar "a" move para frente
    assertEquals(cache.get("a"), "alpha");

    // Adicionar "d" deve evictar "b" (menos recentemente usado)
    cache.put("d", "delta");
    assertUndefined(cache.get("b"));
    assert(cache.get("a") !== undefined);
    assert(cache.get("c") !== undefined);
    assert(cache.get("d") !== undefined);
  });

  it("deve atualizar valor existente sem duplicar tamanho", () => {
    const cache = new LRUCache<string>(2);
    cache.put("a", "v1");
    cache.put("a", "v2");
    assertEquals(cache.getSize(), 1);
    assertEquals(cache.get("a"), "v2");
  });

  it("deve verificar existência com has()", () => {
    const cache = new LRUCache<number>(5);
    cache.put("x", 42);
    assertEquals(cache.has("x"), true);
    assertEquals(cache.has("y"), false);
  });

  it("deve remover item com remove()", () => {
    const cache = new LRUCache<string>(5);
    cache.put("a", "alpha");
    assertEquals(cache.remove("a"), true);
    assertEquals(cache.has("a"), false);
    assertEquals(cache.remove("a"), false);
  });

  it("deve limpar todo o cache com clear()", () => {
    const cache = new LRUCache<number>(10);
    cache.put("a", 1);
    cache.put("b", 2);
    cache.clear();
    assertEquals(cache.getSize(), 0);
    assertEquals(cache.keys().length, 0);
    assertEquals(cache.values().length, 0);
    assertEquals(cache.entries().length, 0);
  });

  it("deve retornar chaves em ordem de uso recente (MRU → LRU)", () => {
    const cache = new LRUCache<string>(5);
    cache.put("a", "1");
    cache.put("b", "2");
    cache.put("c", "3");
    cache.get("a"); // move "a" to front
    const keys = cache.keys();
    assertEquals(keys[0], "a");
    assertEquals(keys[keys.length - 1], "c");
  });

  it("deve retornar valores em ordem de uso recente (MRU → LRU)", () => {
    const cache = new LRUCache<number>(5);
    cache.put("a", 1);
    cache.put("b", 2);
    cache.get("a");
    const values = cache.values();
    assertEquals(values[0], 1);
    assertEquals(values[values.length - 1], 2);
  });

  it("deve retornar entradas como pares [chave, valor]", () => {
    const cache = new LRUCache<string>(5);
    cache.put("a", "alpha");
    const entries = cache.entries();
    assertEquals(entries.length, 1);
    assertEquals(entries[0][0], "a");
    assertEquals(entries[0][1], "alpha");
  });

  it("deve evictar item menos recentemente usado quando atingir capacidade", () => {
    const cache = new LRUCache<string>(2);
    cache.put("a", "alpha");
    cache.put("b", "bravo");
    cache.get("a"); // "a" becomes MRU, "b" becomes LRU
    cache.put("c", "charlie"); // should evict "b"
    assertUndefined(cache.get("b"));
    assert(cache.get("a") !== undefined);
    assert(cache.get("c") !== undefined);
    assertEquals(cache.getSize(), 2);
  });

  it("deve funcionar com tipos complexos como Set", () => {
    const cache = new LRUCache<Set<string>>(3);
    const s1 = new Set(["x", "y"]);
    cache.put("swarm1", s1);
    const retrieved = cache.get("swarm1");
    assert(retrieved !== undefined);
    assertEquals(retrieved?.size, 2);
    assertEquals(retrieved?.has("x"), true);
  });

  it("deve retornar undefined para chaves inexistentes", () => {
    const cache = new LRUCache<number>(5);
    assertUndefined(cache.get("nao_existe"));
    assertEquals(cache.has("nao_existe"), false);
  });

  it("deve manter tamanho correto após operações mistas", () => {
    const cache = new LRUCache<string>(10);
    cache.put("a", "1");
    cache.put("b", "2");
    cache.put("c", "3");
    assertEquals(cache.getSize(), 3);
    cache.remove("b");
    assertEquals(cache.getSize(), 2);
    cache.put("d", "4");
    assertEquals(cache.getSize(), 3);
    cache.clear();
    assertEquals(cache.getSize(), 0);
  });
});