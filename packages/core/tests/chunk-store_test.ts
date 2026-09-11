// /loco/monorepo/webtorrent/tests/chunk-store_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";

Deno.test("chunk-store: put and get chunk", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const chunk = new Uint8Array(1024).fill(42);
  
  await store.put(0, chunk);
  const retrieved = await store.get(0);
  
  assertEquals(retrieved.length, 1024);
  assertEquals(retrieved[0], 42);
  assertEquals(retrieved[1023], 42);
});

Deno.test("chunk-store: get with offset and length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const chunk = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) chunk[i] = i % 256;
  
  await store.put(0, chunk);
  const sliced = await store.get(0, { offset: 100, length: 50 });
  
  assertEquals(sliced.length, 50);
  assertEquals(sliced[0], 100);
  assertEquals(sliced[49], 149);
});

Deno.test("chunk-store: throws on invalid chunk length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  const invalidChunk = new Uint8Array(512);
  
  await assertRejects(
    async () => await store.put(0, invalidChunk),
    Error,
    "Invalid chunk length"
  );
});

Deno.test("chunk-store: throws on chunk not found", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  
  await assertRejects(
    async () => await store.get(999),
    Error,
    "not found"
  );
});

Deno.test("chunk-store: handles last chunk with different length", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024, length: 2500 });
  
  const chunk0 = new Uint8Array(1024).fill(1);
  const chunk1 = new Uint8Array(1024).fill(2);
  const chunk2 = new Uint8Array(452).fill(3); 
  
  await store.put(0, chunk0);
  await store.put(1, chunk1);
  await store.put(2, chunk2);
  
  const retrieved2 = await store.get(2);
  assertEquals(retrieved2.length, 452);
  assertEquals(retrieved2[0], 3);
});

Deno.test("chunk-store: close prevents further operations", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  await store.close();
  
  await assertRejects(
    async () => await store.put(0, new Uint8Array(1024)),
    Error,
    "closed"
  );
});

Deno.test("chunk-store: destroy clears all chunks", async () => {
  const store = new MemoryChunkStore({ chunkLength: 1024 });
  await store.put(0, new Uint8Array(1024));
  await store.destroy();
  
  await assertRejects(
    async () => await store.get(0),
    Error,
    "closed"
  );
});