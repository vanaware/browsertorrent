// /loco/monorepo/webtorrent/tests/ut-metadata_test.ts

import { assertEquals, } from "@std/assert";
import { UtMetadata, } from "../src/extensions/ut-metadata.ts";
import { encode, } from "../src/utils/bencode.ts";
import type { Wire, } from "../src/core/wire.ts";
import type { ExtensionHost, } from "../src/core/extension-host.ts";

class MockWire {
  public extendedHandshake: Record<string, unknown> = { metadata_size: 100, };
  public extendedCalls: { type: string; payload: Uint8Array }[] = [];

  extended(type: string, payload: Uint8Array,) {
    this.extendedCalls.push({ type, payload, },);
  }

  public extensionHost = {
    peerExtensions: new Map<string, number>(),
    localExtensions: new Map<string, number>(),
    setHandshakeField: (_name: string, _value: unknown,) => {},
  };

  sendExtended(_type: number, _payload: Uint8Array,) {
    this.extendedCalls.push({ type: "extended", payload: _payload, },);
  }
}

Deno.test("ut-metadata: initializes correctly", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as unknown as Wire,);
  assertEquals(ut.name, "ut_metadata",);
  assertEquals(ut.metadata, null,);
});

Deno.test("ut-metadata: processes extended handshake", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as unknown as Wire,);

  // Registra a extensão no extensionHost para que _extensionId seja definido
  mockWire.extensionHost.localExtensions.set("ut_metadata", 1,);
  ut.onRegister({
    host: mockWire.extensionHost as unknown as ExtensionHost,
    send: async () => {},
  },);

  ut.onExtendedHandshake({
    m: { ut_metadata: 1, },
    metadata_size: 50000,
  },);

  // 50000 bytes / 16384 = 3.05 -> 4 peças. Deve ter solicitado 4 vezes.
  assertEquals(mockWire.extendedCalls.length, 4,);
});

Deno.test("ut-metadata: rejects invalid metadata size", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as unknown as Wire,);
  let warningEmitted = false;

  ut.on("warning", () => {
    warningEmitted = true;
  },);

  ut.onExtendedHandshake({
    metadata_size: -1,
    m: { ut_metadata: 1, },
  },);

  assertEquals(warningEmitted, true,);
});

Deno.test("ut-metadata: setMetadata marks as complete", () => {
  const mockWire = new MockWire();
  const ut = new UtMetadata(mockWire as unknown as Wire,);

  // Buffer inválido de propósito para testar a resiliência do try/catch
  const fakeMetadata = new Uint8Array(100,).fill(42,);

  // 🔥 CORREÇÃO: Isso não deve mais travar o sistema, pois o decode falho é capturado
  // e o evento "metadata" é emitido com o buffer bruto, sem reprocessamento inseguro.
  const result = ut.setMetadata(fakeMetadata,);

  assertEquals(result, true,);
  assertEquals(ut.metadata, fakeMetadata,);
});
