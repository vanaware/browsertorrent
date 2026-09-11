// /loco/monorepo/webtorrent/tests/ut-metadata_test.ts

import { assertEquals } from "@std/assert";
import { UtMetadata } from "../src/extensions/ut-metadata.ts";
import { encode } from "../src/utils/bencode.ts";

class MockWire {
  public extendedHandshake: any = { metadata_size: 100 };
  public extendedCalls: { type: string; payload: Uint8Array }[] = [];

  extended(type: string, payload: Uint8Array) {
    this.extendedCalls.push({ type, payload });
  }
}

Deno.test("ut-metadata: initializes correctly", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);
  assertEquals(ut.name, "ut_metadata");
  assertEquals(ut.metadata, null);
});

Deno.test("ut-metadata: processes extended handshake", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);

  ut.onExtendedHandshake({
    m: { ut_metadata: 1 },
    metadata_size: 50000,
  });

  // 50000 bytes / 16384 = 3.05 -> 4 peças. Deve ter solicitado 4 vezes.
  assertEquals(mockWire.extendedCalls.length, 4);
});

Deno.test("ut-metadata: rejects invalid metadata size", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);
  let warningEmitted = false;

  ut.on("warning", () => { warningEmitted = true; });

  ut.onExtendedHandshake({
    metadata_size: -1,
    m: { ut_metadata: 1 },
  });

  assertEquals(warningEmitted, true);
});

Deno.test("ut-metadata: setMetadata marks as complete", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire);
  
  // Buffer inválido de propósito para testar a resiliência do try/catch
  const fakeMetadata = new Uint8Array(100).fill(42);

  // 🔥 CORREÇÃO: Isso não deve mais travar o sistema, pois o decode falho é capturado
  // e o evento "metadata" é emitido com o buffer bruto, sem reprocessamento inseguro.
  const result = ut.setMetadata(fakeMetadata);
  
  assertEquals(result, true);
  assertEquals(ut.metadata, fakeMetadata);
});