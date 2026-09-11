// /loco/monorepo/webtorrent/tests/torrent_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { Torrent } from "../src/core/torrent.ts";
import { MemoryChunkStore } from "../src/storage/memory-chunk-store.ts";
import { sha1 } from "../src/crypto/hasher.ts";
import { ParsedTorrent } from "../src/utils/parse-torrent.ts";
import { encode } from "../src/utils/bencode.ts";

// Helper para criar um ParsedTorrent fake com peças reais (simulando um .torrent completo)
async function createFakeParsedTorrent(): Promise<ParsedTorrent> {
  const pieceLength = 1024;
  const piece1 = new Uint8Array(pieceLength).fill(1);
  const piece2 = new Uint8Array(pieceLength).fill(2);
  
  const hash1Hex = await sha1(piece1);
  const hash2Hex = await sha1(piece2);
  
  const hashToBytes = (hex: string) => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };

  return {
    infoHash: "0".repeat(40),
    infoHashBuffer: new Uint8Array(20),
    name: "Fake Torrent",
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [{ path: "fake.bin", name: "fake.bin", length: 2048, offset: 0 }],
    length: 2048,
    pieceLength,
    pieces: [hashToBytes(hash1Hex), hashToBytes(hash2Hex)],
    info: {
      name: "fake.bin",
      length: 2048,
      "piece length": pieceLength,
      pieces: new Uint8Array(40).fill(0), // Dummy pieces for info dict
    },
    magnetURI: "",
  };
}

// Helper para criar um ParsedTorrent vazio (simulando um Magnet URI recém-adicionado)
function createFakeMagnetParsedTorrent(): ParsedTorrent {
  return {
    infoHash: "1".repeat(40),
    infoHashBuffer: new Uint8Array(20).fill(1),
    name: "Unknown",
    announce: ["udp://tracker.example.com:6969"],
    urlList: [],
    peerAddresses: [],
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: "magnet:?xt=urn:btih:1111111111111111111111111111111111111111",
  };
}

Deno.test("torrent: initializes and emits 'ready'", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => {
    torrent.on("ready", () => resolve());
  });

  assertEquals(torrent.ready, true);
  assertEquals(torrent.progress, 0);
  assertEquals(torrent.numPieces, 2);
});

Deno.test("torrent: receives valid piece, updates bitfield and emits events", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const validPiece = new Uint8Array(parsed.pieceLength).fill(1);
  
  let downloadedBytes = 0;
  let verifiedIndex = -1;
  
  torrent.on("download", (e: any) => { downloadedBytes += e.detail.bytes; });
  torrent.on("verified", (e: any) => { verifiedIndex = e.detail.index; });

  const success = await torrent.receivePiece(0, validPiece);

  assertEquals(success, true);
  assertEquals(downloadedBytes, parsed.pieceLength);
  assertEquals(verifiedIndex, 0);
  assertEquals(torrent.progress, 0.5);
});

Deno.test("torrent: rejects piece with invalid hash", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99);
  
  const success = await torrent.receivePiece(0, invalidPiece);

  assertEquals(success, false);
  assertEquals(torrent.progress, 0);
});

Deno.test("torrent: emits 'done' when all pieces are received", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  const piece2 = new Uint8Array(parsed.pieceLength).fill(2);

  let doneEmitted = false;
  torrent.on("done", () => { doneEmitted = true; });

  await torrent.receivePiece(0, piece1);
  assertEquals(doneEmitted, false);
  
  await torrent.receivePiece(1, piece2);
  assertEquals(doneEmitted, true);
  assertEquals(torrent.progress, 1);
});

Deno.test("torrent: skips verification of existing pieces if skipVerify is true", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  
  const invalidPiece = new Uint8Array(parsed.pieceLength).fill(99);
  await store.put(0, invalidPiece);

  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.progress, 0);
});

// ============================================================================
// TESTES DE INTEGRAÇÃO: FLUXO DE METADATA DINÂMICO (MAGNET URI)
// ============================================================================

Deno.test("torrent: integration - setMetadata dynamically updates torrent state from Magnet URI", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.name, "Unknown");
  assertEquals(torrent.length, 0);
  assertEquals(torrent.numPieces, 0);
  assertEquals(torrent.files.length, 0);

  // 🔥 CORREÇÃO: Usar byte 1 (caractere de controle) para garantir que o decode retorne Uint8Array
  const mockPieceHashes = new Uint8Array(40);
  mockPieceHashes.fill(1);
  
  const infoDict = {
    name: "loco-update-v2.zip",
    length: 2048,
    "piece length": 1024,
    pieces: mockPieceHashes,
  };
  const infoBuffer = encode(infoDict);

  let metadataEventEmitted = false;
  torrent.on("metadata", (e: any) => {
    metadataEventEmitted = true;
    assertEquals(e.detail.name, "loco-update-v2.zip");
    assertEquals(e.detail.length, 2048);
    assertEquals(e.detail.files.length, 1);
    assertEquals(e.detail.files[0].name, "loco-update-v2.zip");
  });

  const success = await torrent.setMetadata(infoBuffer);

  assertEquals(success, true);
  assertEquals(metadataEventEmitted, true);
  assertEquals(torrent.name, "loco-update-v2.zip");
  assertEquals(torrent.length, 2048);
  assertEquals(torrent.pieceLength, 1024);
  assertEquals(torrent.numPieces, 2);
  assertEquals(torrent.files.length, 1);
  assertEquals(torrent.files[0]!.path, "loco-update-v2.zip");
  assertEquals(torrent.progress, 0);
});

Deno.test("torrent: integration - setMetadata is idempotent (ignores subsequent calls)", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const infoDict = {
    name: "test.txt",
    length: 100,
    "piece length": 100,
    pieces: new Uint8Array(20).fill(1), // 🔥 CORREÇÃO
  };
  const infoBuffer = encode(infoDict);

  const firstCall = await torrent.setMetadata(infoBuffer);
  assertEquals(firstCall, true);
  assertEquals(torrent.name, "test.txt");

  const secondCall = await torrent.setMetadata(infoBuffer);
  assertEquals(secondCall, false);
  assertEquals(torrent.name, "test.txt");
});

Deno.test("torrent: integration - setMetadata handles multi-file torrents correctly", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const infoDict = {
    name: "my-folder",
    "piece length": 1024,
    pieces: new Uint8Array(40).fill(1), // 🔥 CORREÇÃO
    files: [
      { length: 500, path: ["my-folder", "doc1.txt"] },
      { length: 1500, path: ["my-folder", "subfolder", "doc2.txt"] },
    ],
  };
  const infoBuffer = encode(infoDict);

  await torrent.setMetadata(infoBuffer);

  assertEquals(torrent.name, "my-folder");
  assertEquals(torrent.length, 2000);
  assertEquals(torrent.numPieces, 2);
  assertEquals(torrent.files.length, 2);
  
  assertEquals(torrent.files[0]!.name, "doc1.txt");
  assertEquals(torrent.files[0]!.path, "my-folder/doc1.txt");
  assertEquals(torrent.files[0]!.offset, 0);
  assertEquals(torrent.files[0]!.length, 500);

  assertEquals(torrent.files[1]!.name, "doc2.txt");
  assertEquals(torrent.files[1]!.path, "my-folder/subfolder/doc2.txt");
  assertEquals(torrent.files[1]!.offset, 500);
  assertEquals(torrent.files[1]!.length, 1500);
});

// ============================================================================
// PHASE 6: received / done
// ============================================================================

Deno.test("torrent: received is an alias of downloaded", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.received, 0);
  assertEquals(torrent.received, torrent.downloaded);
});

Deno.test("torrent: done is false when progress < 1", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.done, false);
});

Deno.test("torrent: done is true when all pieces received", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  const piece2 = new Uint8Array(parsed.pieceLength).fill(2);

  assertEquals(torrent.done, false);

  await torrent.receivePiece(0, piece1);
  assertEquals(torrent.done, false);

  await torrent.receivePiece(1, piece2);
  assertEquals(torrent.done, true);
});

// ============================================================================
// PHASE 6: created / createdBy / comment / torrentFile / torrentFileBlob / announce / maxWebConns
// ============================================================================

Deno.test("torrent: created returns Date from creation date", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    info: {
      name: "fake.bin",
      length: 2048,
      "piece length": 1024,
      pieces: new Uint8Array(40).fill(0),
      "creation date": 1700000000, // 2023-11-14T22:13:20Z
    },
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.created instanceof Date, true);
  assertEquals(torrent.created!.getTime(), 1700000000 * 1000);
});

Deno.test("torrent: created returns undefined when no creation date", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.created, undefined);
});

Deno.test("torrent: createdBy returns the creator string", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    createdBy: "loco-torrent-generator/1.0.0",
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.createdBy, "loco-torrent-generator/1.0.0");
});

Deno.test("torrent: createdBy returns undefined when not set", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.createdBy, undefined);
});

Deno.test("torrent: comment returns the comment string", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    comment: "This is a test torrent",
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.comment, "This is a test torrent");
});

Deno.test("torrent: comment returns undefined when not set", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.comment, undefined);
});

Deno.test("torrent: announce returns the tracker list", async () => {
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    announce: ["udp://tracker.example.com:6969/announce", "http://tracker2.example:8080/announce"],
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.announce.length, 2);
  assertEquals(torrent.announce[0], "udp://tracker.example.com:6969/announce");
  assertEquals(torrent.announce[1], "http://tracker2.example:8080/announce");
});

Deno.test("torrent: announce returns empty array when no trackers", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(Array.isArray(torrent.announce), true);
});

Deno.test("torrent: torrentFile returns undefined when not set (magnet-only)", async () => {
  const magnetParsed = createFakeMagnetParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: 16384, length: 0 });
  const torrent = new Torrent(magnetParsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.torrentFile, undefined);
  assertEquals(torrent.torrentFileBlob, undefined);
});

Deno.test("torrent: torrentFile returns Uint8Array when set", async () => {
  const torrentBytes = new Uint8Array([0x64, 0x38, 0x3a, 0x69, 0x6e, 0x66, 0x6f, 0x65, 0x64, 0x34, 0x3a, 0x6c, 0x65, 0x6e, 0x67, 0x69, 0x32, 0x30, 0x34, 0x38, 0x65, 0x31, 0x3a, 0x6e, 0x61, 0x6d, 0x65, 0x38, 0x3a, 0x66, 0x61, 0x6b, 0x65, 0x2e, 0x62, 0x69, 0x6e, 0x65, 0x65, 0x65]); // bencoded
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    torrentFileBytes: torrentBytes,
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.torrentFile instanceof Uint8Array, true);
  assertEquals(torrent.torrentFile!.length, torrentBytes.length);
});

Deno.test("torrent: torrentFileBlob returns Blob matching torrentFile", async () => {
  const torrentBytes = new Uint8Array([0x64, 0x38, 0x3a, 0x69, 0x6e, 0x66, 0x6f, 0x65, 0x64, 0x34, 0x3a, 0x6c, 0x65, 0x6e, 0x67, 0x69, 0x32, 0x30, 0x34, 0x38, 0x65, 0x31, 0x3a, 0x6e, 0x61, 0x6d, 0x65, 0x38, 0x3a, 0x66, 0x61, 0x6b, 0x65, 0x2e, 0x62, 0x69, 0x6e, 0x65, 0x65, 0x65]);
  const parsed: ParsedTorrent = {
    ...await createFakeParsedTorrent(),
    torrentFileBytes: torrentBytes,
  };
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  assertEquals(torrent.torrentFileBlob instanceof Blob, true);
  assertEquals(torrent.torrentFileBlob!.size, torrentBytes.length);
});

// ============================================================================
// PHASE 6: rescanFiles()
// ============================================================================

Deno.test("torrent: rescanFiles() returns a Promise and resolves without error", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  // rescanFiles without pre-existing pieces — should resolve cleanly
  const result = torrent.rescanFiles();
  assertEquals(result instanceof Promise, true);
  await result; // must not throw
});

Deno.test("torrent: rescanFiles() accepts optional callback", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  let callbackCalled = false;
  torrent.rescanFiles((err) => {
    assertEquals(err, null);
    callbackCalled = true;
  });
  // Give callback time to fire
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(callbackCalled, true);
});

Deno.test("torrent: rescanFiles() returns a Promise and resolves without error", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const result = torrent.rescanFiles();
  assertEquals(result instanceof Promise, true);
  await result; // must not throw
});

Deno.test("torrent: rescanFiles() accepts optional callback", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  let callbackCalled = false;
  torrent.rescanFiles((err) => {
    assertEquals(err, null);
    callbackCalled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(callbackCalled, true);
});

Deno.test("torrent: rescanFiles() does not double-count pieces", async () => {
  const parsed = await createFakeParsedTorrent();
  const store = new MemoryChunkStore({ chunkLength: parsed.pieceLength, length: parsed.length });
  const torrent = new Torrent(parsed, { store, skipVerify: true });

  await new Promise<void>((resolve) => torrent.on("ready", () => resolve()));

  const piece1 = new Uint8Array(parsed.pieceLength).fill(1);
  await torrent.receivePiece(0, piece1);
  assertEquals(torrent.pieces.get(0), true);
  assertEquals(torrent.progress, 0.5);

  // rescanFiles should not reset already-verified pieces (idempotent)
  await torrent.rescanFiles();
  assertEquals(torrent.pieces.get(0), true);
  assertEquals(torrent.progress, 0.5);
});