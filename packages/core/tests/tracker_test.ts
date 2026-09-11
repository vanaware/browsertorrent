// /loco/monorepo/webtorrent/tests/tracker_test.ts

import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  buildAnnounceUrl,
  createTracker,
  DEFAULT_TIMEOUT_MS,
  HttpTracker,
  integerInRange,
  MAX_NUM_WANT,
  parseHttpTrackerResponse,
  percentEncodeBytes,
  scrapeTracker,
  validateTrackerOptions,
  WsTracker,
} from "../src/network/tracker.ts";
import { TrackerError } from "../src/utils/errors.ts";
import { encode } from "../src/utils/bencode.ts";

Deno.test("tracker: factory creates HttpTracker for http/https", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  const httpTracker = createTracker("http://tracker.example.com/announce", opts);
  assertEquals(httpTracker instanceof HttpTracker, true);
  
  const httpsTracker = createTracker("https://tracker.example.com/announce", opts);
  assertEquals(httpsTracker instanceof HttpTracker, true);
});

Deno.test("tracker: factory creates WsTracker for ws/wss", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  const wsTracker = createTracker("wss://tracker.btorrent.xyz", opts);
  assertEquals(wsTracker instanceof WsTracker, true);
});

Deno.test("tracker: factory throws on unsupported protocol", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  
  assertThrows(
    () => createTracker("udp://tracker.example.com:6969", opts),
    Error,
    "Unsupported tracker protocol"
  );
});

// Nota: Testes de integração real (announce) exigem um servidor de tracker rodando.
// Em um ambiente CI, você poderia usar um mock de fetch para o HttpTracker.

// ============================================================================
// Fase 2.5/2.6 — percent-encoding, buildAnnounceUrl, parseHttpTrackerResponse
// ============================================================================

Deno.test("tracker: percentEncodeBytes encodes byte-a-byte", () => {
  assertEquals(percentEncodeBytes(new Uint8Array([0x00, 0x7f, 0x80, 0xff])), "%00%7F%80%FF");
  assertEquals(percentEncodeBytes(new Uint8Array([])), "");
  // Bytes > 0x7F não podem virar UTF-8 (bug da versão anterior com URLSearchParams)
  const bytes = new Uint8Array([0xc3, 0x28]); // sequência UTF-8 inválida
  assertEquals(percentEncodeBytes(bytes), "%C3%28");
});

Deno.test("tracker: buildAnnounceUrl preserves binary identity params", () => {
  const infoHash = new Uint8Array(20);
  for (let i = 0; i < 20; i++) infoHash[i] = i * 13 % 256;
  const peerId = new TextEncoder().encode("-LO0100-abcdefghijkl");

  const url = buildAnnounceUrl("http://tracker.example.com/announce", {
    infoHash,
    peerId,
    port: 6881,
    left: 1234,
  });

  const search = url.search;
  assertEquals(search.includes(`info_hash=${percentEncodeBytes(infoHash)}`), true);
  assertEquals(search.includes(`peer_id=${percentEncodeBytes(peerId)}`), true);
  assertEquals(search.includes("port=6881"), true);
  assertEquals(search.includes("uploaded=0"), true);
  assertEquals(search.includes("downloaded=0"), true);
  assertEquals(search.includes("left=1234"), true);
  assertEquals(search.includes("compact=1"), true);
  assertEquals(search.includes("numwant=50"), true);
});

Deno.test("tracker: buildAnnounceUrl adds event, key and trackerid", () => {
  const opts = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    key: 0xdeadbeef,
  };
  const url = buildAnnounceUrl(
    "https://tracker.example.com/announce?passkey=abc",
    opts,
    { event: "started" },
    "tracker-id-1",
  );
  const search = url.search;
  assertEquals(search.startsWith("?passkey=abc&"), true);
  assertEquals(search.includes("event=started"), true);
  assertEquals(search.includes(`key=${0xdeadbeef}`), true);
  assertEquals(search.includes("trackerid=tracker-id-1"), true);
});

Deno.test("tracker: buildAnnounceUrl rejects non-http protocols", () => {
  assertThrows(
    () =>
      buildAnnounceUrl("udp://tracker.example.com:6969", {
        infoHash: new Uint8Array(20),
        peerId: new Uint8Array(20),
      }),
    TrackerError,
    "unsupported HTTP tracker URL",
  );
});

Deno.test("tracker: validateTrackerOptions enforces limits", () => {
  const base = {
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
  };
  // ok
  validateTrackerOptions("http://t.example.com/a", base);

  // hashes com tamanho errado
  assertThrows(
    () => validateTrackerOptions("http://t.example.com/a", { ...base, infoHash: new Uint8Array(19) }),
    TrackerError,
    "infoHash and peerId must contain 20 bytes",
  );

  // numwant acima do limite
  assertThrows(
    () => validateTrackerOptions("http://t.example.com/a", { ...base, numwant: MAX_NUM_WANT + 1 }),
    TrackerError,
    "numwant is invalid",
  );

  // event inválido
  assertThrows(
    () => validateTrackerOptions("http://t.example.com/a", base, { event: "paused" as never }),
    TrackerError,
    "event is invalid",
  );

  // URL inválida
  assertThrows(
    () => validateTrackerOptions("not a url", base),
    TrackerError,
    "tracker URL is invalid",
  );

  // URL longa demais
  assertThrows(
    () => validateTrackerOptions(`http://t.example.com/${"a".repeat(9000)}`, base),
    TrackerError,
    "tracker URL is invalid",
  );
});

Deno.test("tracker: integerInRange validates bounds", () => {
  assertEquals(integerInRange(5, "x", 1, 10), 5);
  assertThrows(() => integerInRange(0, "x", 1, 10), TrackerError, "x is invalid");
  assertThrows(() => integerInRange(11, "x", 1, 10), TrackerError, "x is invalid");
  assertThrows(() => integerInRange(1.5, "x", 1, 10), TrackerError, "x is invalid");
});

function compactV4(ip: [number, number, number, number], port: number): Uint8Array {
  return new Uint8Array([...ip, (port >> 8) & 0xff, port & 0xff]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

Deno.test("tracker: parseHttpTrackerResponse parses compact IPv4 peers", () => {
  const bytes = encode({
    interval: 1800,
    complete: 10,
    incomplete: 5,
    peers: concatBytes(compactV4([93, 184, 216, 34], 51413), compactV4([1, 2, 3, 4], 6881)),
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.interval, 1800);
  assertEquals(response.complete, 10);
  assertEquals(response.incomplete, 5);
  assertEquals(response.peers, [
    { ip: "93.184.216.34", port: 51413 },
    { ip: "1.2.3.4", port: 6881 },
  ]);
});

Deno.test("tracker: parseHttpTrackerResponse parses compact IPv6 peers", () => {
  const ipv6 = new Uint8Array(18);
  ipv6[0] = 0x20;
  ipv6[1] = 0x01;
  ipv6[15] = 0x01;
  ipv6[16] = (8999 >> 8) & 0xff;
  ipv6[17] = 8999 & 0xff;

  const bytes = encode({ interval: 900, peers6: ipv6 });
  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.peers.length, 1);
  assertEquals(response.peers[0]!.port, 8999);
  assertEquals(response.peers[0]!.ip.includes("2001:"), true);
});

Deno.test("tracker: parseHttpTrackerResponse parses dictionary peers", () => {
  const bytes = encode({
    interval: 1800,
    peers: [
      { ip: "10.0.0.1", port: 5555 },
      { ip: "10.0.0.1", port: 5555 }, // duplicado
      { ip: "10.0.0.2", port: 0 }, // porta inválida → descartado
    ],
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.peers, [{ ip: "10.0.0.1", port: 5555 }]);
});

Deno.test("tracker: parseHttpTrackerResponse dedupes compact peers and drops port 0", () => {
  const bytes = encode({
    interval: 1800,
    peers: concatBytes(
      compactV4([1, 2, 3, 4], 6881),
      compactV4([1, 2, 3, 4], 6881),
      compactV4([5, 6, 7, 8], 0),
    ),
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.peers, [{ ip: "1.2.3.4", port: 6881 }]);
});

Deno.test("tracker: parseHttpTrackerResponse surfaces failure reason", () => {
  const bytes = encode({ "failure reason": "torrent not registered" });
  assertThrows(
    () => parseHttpTrackerResponse(bytes),
    TrackerError,
    "torrent not registered",
  );
});

Deno.test("tracker: parseHttpTrackerResponse exposes warning and tracker id", () => {
  const bytes = encode({
    interval: 60,
    "warning message": "deprecated client",
    "tracker id": "tid-123",
    "min interval": 30,
    peers: new Uint8Array(),
  });

  const response = parseHttpTrackerResponse(bytes);
  assertEquals(response.warning, "deprecated client");
  assertEquals(response.trackerId, "tid-123");
  assertEquals(response.minInterval, 30);
});

Deno.test("tracker: parseHttpTrackerResponse rejects invalid responses", () => {
  // bencode inválido
  assertThrows(
    () => parseHttpTrackerResponse(new Uint8Array([0xff, 0xfe])),
    TrackerError,
  );

  // sem interval
  assertThrows(
    () => parseHttpTrackerResponse(encode({ peers: new Uint8Array() })),
    TrackerError,
    "no valid interval",
  );

  // lista compacta truncada
  assertThrows(
    () => parseHttpTrackerResponse(encode({ interval: 10, peers: new Uint8Array([1, 2, 3, 4]) })),
    TrackerError,
    "invalid compact IPv4 peer list",
  );

  // resposta não-dicionário
  assertThrows(
    () => parseHttpTrackerResponse(encode([1, 2, 3])),
    TrackerError,
    "must be a dictionary",
  );
});

Deno.test("tracker: HttpTracker.announce uses byte-exact URL and parses response", async () => {
  const infoHash = new Uint8Array(20);
  for (let i = 0; i < 20; i++) infoHash[i] = 255 - i;
  const peerId = new TextEncoder().encode("-LO0100-abcdefghijkl");

  let requestedUrl: URL | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL, _init?: RequestInit) => {
    requestedUrl = input instanceof URL ? input : new URL(String(input));
    const body = encode({
      interval: 1234,
      "tracker id": "tid-1",
      complete: 1,
      incomplete: 2,
      peers: compactV4([8, 8, 8, 8], 5353),
    });
    return Promise.resolve(
      new Response(body as unknown as BodyInit, {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
  }) as typeof fetch;

  try {
    const tracker = new HttpTracker("http://tracker.example.com/announce", {
      infoHash,
      peerId,
      left: 42,
    });

    const response = await tracker.announce({ event: "started" });

    assertEquals(response.interval, 1234);
    assertEquals(response.trackerId, "tid-1");
    assertEquals(response.peers, [{ ip: "8.8.8.8", port: 5353 }]);

    assertEquals(requestedUrl !== null, true);
    const search = requestedUrl!.search;
    assertEquals(search.includes(`info_hash=${percentEncodeBytes(infoHash)}`), true);
    assertEquals(search.includes(`peer_id=${percentEncodeBytes(peerId)}`), true);
    assertEquals(search.includes("event=started"), true);
    assertEquals(search.includes("left=42"), true);
    // %FF não pode ser re-encodado como UTF-8
    assertEquals(search.includes("%FF"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce echoes trackerid on second announce", async () => {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL, _init?: RequestInit) => {
    urls.push(String(input));
    const body = encode({ interval: 60, "tracker id": "tid-xyz", peers: new Uint8Array() });
    return Promise.resolve(new Response(body as unknown as BodyInit, { status: 200 }));
  }) as typeof fetch;

  try {
    const tracker = new HttpTracker("http://t.example.com/a", {
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
    });
    await tracker.announce();
    await tracker.announce({ event: "completed" });

    assertEquals(urls[0]!.includes("trackerid="), false);
    assertEquals(urls[1]!.includes("trackerid=tid-xyz"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce rejects failure reason and http errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(encode({ "failure reason": "nope" }) as unknown as BodyInit, {
          status: 200,
        }),
      )) as typeof fetch;

    const tracker = new HttpTracker("http://t.example.com/a", {
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
    });
    await assertRejects(() => tracker.announce(), TrackerError, "nope");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 403 }))) as typeof fetch;
    await assertRejects(() => tracker.announce(), TrackerError, "Tracker HTTP error: 403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce rejects oversized Content-Length", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("", {
        status: 200,
        headers: { "content-length": String(10 * 1024 * 1024) },
      }),
    )) as typeof fetch;

  try {
    const tracker = new HttpTracker("http://t.example.com/a", {
      infoHash: new Uint8Array(20),
      peerId: new Uint8Array(20),
    });
    await assertRejects(() => tracker.announce(), TrackerError, "too large");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("tracker: HttpTracker.announce validates options before fetching", async () => {
  const tracker = new HttpTracker("http://t.example.com/a", {
    infoHash: new Uint8Array(19), // inválido
    peerId: new Uint8Array(20),
  });
  await assertRejects(
    () => tracker.announce(),
    TrackerError,
    "infoHash and peerId must contain 20 bytes",
  );
});

Deno.test("tracker: DEFAULT_TIMEOUT_MS and MAX_NUM_WANT constants", () => {
  assertEquals(DEFAULT_TIMEOUT_MS, 15_000);
  assertEquals(MAX_NUM_WANT, 2_000);
});

// ── scrapeTracker (BEP 48) ────────────────────────────────────────────────

function makeInfoHash(seed: number): Uint8Array {
  const arr = new Uint8Array(20);
  for (let i = 0; i < 20; i++) arr[i] = (seed * 17 + i * 7) & 0xff;
  return arr;
}

Deno.test("scrapeTracker: parses successful scrape response", async () => {
  const ih1 = makeInfoHash(1);
  const ih2 = makeInfoHash(2);
  const ih3 = makeInfoHash(3);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        encode({
          files: {
            [percentEncodeBytes(ih1)]: { complete: 10, incomplete: 5, downloaded: 123 },
            [percentEncodeBytes(ih2)]: { complete: 1, incomplete: 0, downloaded: 42 },
            [percentEncodeBytes(ih3)]: { complete: 0, incomplete: 2, downloaded: 0 },
          },
        }) as unknown as BodyInit,
        { status: 200 },
      ),
    )) as typeof fetch;

  try {
    const result = await scrapeTracker("http://tracker.example.com/announce", [ih1, ih2, ih3]);
    assertEquals(result.files[percentEncodeBytes(ih1)]!.complete, 10);
    assertEquals(result.files[percentEncodeBytes(ih1)]!.incomplete, 5);
    assertEquals(result.files[percentEncodeBytes(ih1)]!.downloaded, 123);
    assertEquals(result.files[percentEncodeBytes(ih2)]!.complete, 1);
    assertEquals(result.files[percentEncodeBytes(ih2)]!.incomplete, 0);
    assertEquals(result.files[percentEncodeBytes(ih3)]!.complete, 0);
    assertEquals(result.files[percentEncodeBytes(ih3)]!.incomplete, 2);
    assertEquals(result.files[percentEncodeBytes(ih3)]!.downloaded, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: includes optional name field", async () => {
  const ih = makeInfoHash(10);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        encode({
          files: {
            [percentEncodeBytes(ih)]: { complete: 5, incomplete: 2, downloaded: 100, name: "my-video.mp4" },
          },
        }) as unknown as BodyInit,
        { status: 200 },
      ),
    )) as typeof fetch;

  try {
    const result = await scrapeTracker("http://tracker.example.com/announce", [ih]);
    assertEquals(result.files[percentEncodeBytes(ih)]!.name, "my-video.mp4");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: throws on HTTP error status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("", { status: 503 }))) as typeof fetch;

  try {
    await assertRejects(
      () => scrapeTracker("http://tracker.example.com/announce", [makeInfoHash(1)]),
      TrackerError,
      "503",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: throws on non-dictionary response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(encode([1, 2, 3]) as unknown as BodyInit, { status: 200 }),
    )) as typeof fetch;

  try {
    await assertRejects(
      () => scrapeTracker("http://tracker.example.com/announce", [makeInfoHash(1)]),
      TrackerError,
      "must be a dictionary",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: replaces /announce with /scrape in URL", async () => {
  let capturedUrl: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL) => {
    capturedUrl = input instanceof URL ? input.href : String(input);
    return Promise.resolve(
      new Response(encode({ files: {} }) as unknown as BodyInit, { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await scrapeTracker("http://tracker.example.com/announce?passkey=abc", [makeInfoHash(1)]);
    assertEquals(capturedUrl !== null, true);
    assertEquals(capturedUrl!.includes("/scrape"), true);
    assertEquals(capturedUrl!.includes("/announce"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("scrapeTracker: encodes info_hash params as percent-encoded bytes", async () => {
  let capturedUrl: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: URL | RequestInfo | URL) => {
    capturedUrl = input instanceof URL ? input.href : String(input);
    return Promise.resolve(
      new Response(encode({ files: {} }) as unknown as BodyInit, { status: 200 }),
    );
  }) as typeof fetch;

  try {
    const ih = new Uint8Array([0x00, 0x7f, 0x80, 0xff, ...new Array(16).fill(0)]);
    await scrapeTracker("http://tracker.example.com/announce", [ih]);
    assertEquals(capturedUrl!.includes("%00%7F%80%FF"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});