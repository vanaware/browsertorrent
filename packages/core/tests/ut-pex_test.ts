// /loco/monorepo/webtorrent/tests/ut-pex_test.ts
//
// Testes para a extensão ut_pex (BEP 11 - Peer Exchange)

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  UtPexExtension,
  encodePexUpdate,
  decodePexUpdate,
  PexPeerFlag,
  type PexPeer,
  type PexUpdate,
} from "../src/extensions/ut-pex.ts";
import { encode, decode } from "../src/utils/bencode.ts";

// Helper: cria um peer IPv4 compacto
function makePeer(ip: number[], port: number, flags?: number): PexPeer {
  return {
    address: new Uint8Array(ip),
    port,
    flags,
  };
}

Deno.test("ut_pex: encode e decode de update com peers IPv4", () => {
  const update: PexUpdate = {
    added: [
      makePeer([192, 168, 1, 1], 6881, PexPeerFlag.Utp),
      makePeer([10, 0, 0, 2], 51413, PexPeerFlag.Seed),
    ],
    dropped: [
      makePeer([172, 16, 0, 1], 8080),
    ],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 2);
  assertEquals(decoded.dropped.length, 1);

  // Verifica primeiro peer adicionado
  assertEquals(Array.from(decoded.added[0]!.address), [192, 168, 1, 1]);
  assertEquals(decoded.added[0]!.port, 6881);
  assertEquals(decoded.added[0]!.flags, PexPeerFlag.Utp);

  // Verifica segundo peer adicionado
  assertEquals(Array.from(decoded.added[1]!.address), [10, 0, 0, 2]);
  assertEquals(decoded.added[1]!.port, 51413);
  assertEquals(decoded.added[1]!.flags, PexPeerFlag.Seed);

  // Verifica peer removido
  assertEquals(Array.from(decoded.dropped[0]!.address), [172, 16, 0, 1]);
  assertEquals(decoded.dropped[0]!.port, 8080);
});

Deno.test("ut_pex: encode com apenas added (sem dropped)", () => {
  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 1);
  assertEquals(decoded.dropped.length, 0);
  assertEquals(Array.from(decoded.added[0]!.address), [1, 2, 3, 4]);
  assertEquals(decoded.added[0]!.port, 1234);
});

Deno.test("ut_pex: encode com apenas dropped (sem added)", () => {
  const update: PexUpdate = {
    added: [],
    dropped: [makePeer([5, 6, 7, 8], 5678)],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 0);
  assertEquals(decoded.dropped.length, 1);
  assertEquals(Array.from(decoded.dropped[0]!.address), [5, 6, 7, 8]);
  assertEquals(decoded.dropped[0]!.port, 5678);
});

Deno.test("ut_pex: encode vazio (sem added e sem dropped)", () => {
  const update: PexUpdate = {
    added: [],
    dropped: [],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added.length, 0);
  assertEquals(decoded.dropped.length, 0);
});

Deno.test("ut_pex: rejeita endereço IPv4 inválido (não 4 nem 16 bytes)", () => {
  const update: PexUpdate = {
    added: [{ address: new Uint8Array([1, 2, 3]), port: 1234 }],
    dropped: [],
  };

  assertThrows(
    () => encodePexUpdate(update),
    RangeError,
    "PEX addresses must contain four or sixteen bytes",
  );
});

Deno.test("ut_pex: rejeita porta inválida (zero)", () => {
  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 0)],
    dropped: [],
  };

  assertThrows(
    () => encodePexUpdate(update),
    RangeError,
    "PEX peer port must be in the range 1..65535",
  );
});

Deno.test("ut_pex: rejeita porta inválida (maior que 65535)", () => {
  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 70000)],
    dropped: [],
  };

  assertThrows(
    () => encodePexUpdate(update),
    RangeError,
    "PEX peer port must be in the range 1..65535",
  );
});

Deno.test("ut_pex: respeita maxPeers ao decodificar", () => {
  const peers: PexPeer[] = [];
  for (let i = 1; i <= 5; i++) {
    peers.push(makePeer([10, 0, 0, i], 1000 + i));
  }
  const update: PexUpdate = { added: peers, dropped: [] };
  const encoded = encodePexUpdate(update);

  // maxPeers = 3 deve rejeitar (5 peers > 3)
  assertThrows(
    () => decodePexUpdate(encoded, 3),
    Error,
    "exceeds 3 peers",
  );

  // maxPeers = 10 deve aceitar
  const decoded = decodePexUpdate(encoded, 10);
  assertEquals(decoded.added.length, 5);
});

Deno.test("ut_pex: round-trip preserve flags corretamente", () => {
  const update: PexUpdate = {
    added: [
      {
        address: new Uint8Array([192, 168, 0, 1]),
        port: 6881,
        flags: PexPeerFlag.PrefersEncryption | PexPeerFlag.Utp | PexPeerFlag.Holepunch,
      },
    ],
    dropped: [],
  };

  const encoded = encodePexUpdate(update);
  const decoded = decodePexUpdate(encoded);

  assertEquals(decoded.added[0]!.flags, PexPeerFlag.PrefersEncryption | PexPeerFlag.Utp | PexPeerFlag.Holepunch);
});

Deno.test("ut_pex: UtPexExtension registra listeners onUpdate", () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire);

  let receivedUpdate: PexUpdate | null = null;
  const unsubscribe = ext.onUpdate((update) => {
    receivedUpdate = update;
  });

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };
  const payload = encodePexUpdate(update);
  ext.onMessage(payload);

  assertEquals(receivedUpdate !== null, true);
  assertEquals(receivedUpdate!.added.length, 1);
  assertEquals(receivedUpdate!.dropped.length, 0);

  // Testa unsubscribe
  unsubscribe();
  receivedUpdate = null;
  ext.onMessage(payload);
  assertEquals(receivedUpdate, null);
});

Deno.test("ut_pex: UtPexExtension rejeita send sem registro prévio", async () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire);

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  await assertRejects(
    async () => await ext.send(update),
    Error,
    "ut_pex is not registered",
  );
});

Deno.test("ut_pex: UtPexExtension envia após registro no handshake estendido", async () => {
  let sentPayload: Uint8Array | null = null;
  let sentId: number | null = null;
  const wire = {
    extended: (id: number, payload: Uint8Array) => {
      sentId = id;
      sentPayload = payload;
    },
  };

  const ext = new UtPexExtension(wire, { minSendIntervalMs: 0 });

  // Simula extended handshake do peer anunciando ut_pex com ID 5
  ext.onExtendedHandshake({ m: { ut_pex: 5 } });

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  await ext.send(update);

  assertEquals(sentId, 5);
  assertEquals(sentPayload !== null, true);

  // Verifica que o payload é decodificável
  const decoded = decodePexUpdate(sentPayload!);
  assertEquals(decoded.added.length, 1);
  assertEquals(Array.from(decoded.added[0]!.address), [1, 2, 3, 4]);
  assertEquals(decoded.added[0]!.port, 1234);
});

Deno.test("ut_pex: UtPexExtension respeita intervalo mínimo entre sends", async () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire, { minSendIntervalMs: 60_000 });

  ext.onExtendedHandshake({ m: { ut_pex: 1 } });

  const update: PexUpdate = {
    added: [makePeer([1, 2, 3, 4], 1234)],
    dropped: [],
  };

  // Primeiro send deve funcionar
  await ext.send(update);

  // Segundo send imediato deve falhar (dentro do intervalo)
  await assertRejects(
    async () => await ext.send(update),
    Error,
    "may not be sent this frequently",
  );
});

Deno.test("ut_pex: UtPexExtension rejeita update excedendo maxPeers", async () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire, { minSendIntervalMs: 0, maxPeersPerMessage: 2 });

  ext.onExtendedHandshake({ m: { ut_pex: 1 } });

  const update: PexUpdate = {
    added: [
      makePeer([1, 2, 3, 4], 1001),
      makePeer([5, 6, 7, 8], 1002),
      makePeer([9, 10, 11, 12], 1003),
    ],
    dropped: [],
  };

  await assertRejects(
    async () => await ext.send(update),
    RangeError,
    "exceeds 2 peers",
  );
});

Deno.test("ut_pex: UtPexExtension lida com payload inválido gracefully", () => {
  const wire = { extended: () => {} };
  const ext = new UtPexExtension(wire);

  let warningReceived = false;
  ext.on("warning", () => {
    warningReceived = true;
  });

  // Payload bencode inválido
  const invalidPayload = new TextEncoder().encode("not valid bencode!!!");
  ext.onMessage(invalidPayload);

  assertEquals(warningReceived, true);
});
