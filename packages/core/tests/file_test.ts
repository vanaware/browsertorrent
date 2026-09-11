// /loco/monorepo/webtorrent/tests/file_test.ts

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { File } from "../src/core/file.ts";
import { Piece } from "../src/core/piece.ts";
import { Bitfield } from "../src/core/bitfield.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fake store that returns predictable bytes for every piece. */
class FakeChunkStore {
  chunkLength: number;
  private data: Map<number, Uint8Array> = new Map();

  constructor(chunkLength = 1024, totalSize = 2048) {
    this.chunkLength = chunkLength;
    const buf = new Uint8Array(totalSize);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = i % 256;
    }
    this.data.set(0, buf);
  }

  async get(index: number): Promise<Uint8Array> {
    const stored = this.data.get(index);
    if (stored) return stored;
    const start = index * this.chunkLength;
    const size = Math.min(this.chunkLength, 2048 - start);
    if (start >= 2048 || size <= 0) return new Uint8Array(0);
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      buf[i] = (start + i) % 256;
    }
    return buf;
  }

  async put(index: number, buf: Uint8Array): Promise<void> {
    this.data.set(index, buf);
  }

  async close(): Promise<void> {}
  async destroy(): Promise<void> {
    this.data.clear();
  }
}

// ── Constructor & properties ────────────────────────────────────────────────

Deno.test("file: constructor initializes correctly", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16 });

  assertEquals(file.length, 100);
  assertEquals(file.name, "file");
  assertEquals(file.path, "file");
  assertEquals(file.scope, "/");
  assertEquals(file.destroyed, false);
});

Deno.test("file: constructor accepts all optional fields", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "video.mp4",
    path: "folder/video.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 3,
    scope: "/app/",
    blockSize: 8192,
  });

  assertEquals(file.name, "video.mp4");
  assertEquals(file.path, "folder/video.mp4");
  assertEquals(file.infoHash, "a".repeat(40));
  assertEquals(file.fileIndex, 3);
  assertEquals(file.scope, "/app/");
});

Deno.test("file: defaults for optional fields", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 0, offset: 0, pieceLength: 16 });

  assertEquals(file.name, "file");
  assertEquals(file.path, "file");
  assertEquals(file.scope, "/");
  assertEquals(file.infoHash, undefined);
  assertEquals(file.fileIndex, undefined);
});

// ── Piece range ─────────────────────────────────────────────────────────────

Deno.test("file: pieceRange returns correct first/last indices", () => {
  const store = new FakeChunkStore(1024, 2048);
  // offset=0, length=1500, pieceLength=1024
  // first = floor(0/1024) = 0
  // last  = floor((0+1499)/1024) = floor(1499/1024) = 1
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });
  const range = file.pieceRange;
  assertEquals(range.first, 0);
  assertEquals(range.last, 1);
});

Deno.test("file: pieceRange for middle file", () => {
  // offset=1024, length=1024, pieceLength=1024
  // first = floor(1024/1024) = 1
  // last  = floor((1024+1023)/1024) = floor(2047/1024) = 1
  const store = new FakeChunkStore(1024, 4096);
  const file = new File({ store, length: 1024, offset: 1024, pieceLength: 1024 });
  assertEquals(file.pieceRange.first, 1);
  assertEquals(file.pieceRange.last, 1);
});

// ── includes ─────────────────────────────────────────────────────────────────

Deno.test("file: includes() returns true for pieces inside file", () => {
  const store = new FakeChunkStore(1024, 2048);
  // offset=0, length=1500, pieces 0 and 1 are inside
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  assertEquals(file.includes(new Piece(0, 1024, 0)), true);
  assertEquals(file.includes(new Piece(1, 1024, 1024)), true);
  assertEquals(file.includes(new Piece(2, 1024, 2048)), false);
  assertEquals(file.includes(new Piece(3, 1024, 3072)), false);
});

Deno.test("file: includes() with Piece class instance", () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 800, offset: 0, pieceLength: 512 });
  // pieces 0 and 1 are inside (0-512 and 512-1024, but file is 0-800)

  assertEquals(file.includes(new Piece(0, 512, 0)), true);
  assertEquals(file.includes(new Piece(1, 512, 512)), true);
  assertEquals(file.includes(new Piece(2, 512, 1024)), false);
});

// ── createReadStream (core implementation) ────────────────────────────────────

Deno.test("file: createReadStream returns a ReadableStream", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream();
  assertEquals(typeof stream.getReader, "function");
  assertEquals(typeof stream[Symbol.asyncIterator], "function");
});

Deno.test("file: createReadStream emits 'stream' event", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let eventFired = false;
  file.addEventListener("stream", () => { eventFired = true; });

  file.createReadStream();
  assertEquals(eventFired, true);
});

Deno.test("file: createReadStream reads full file", async () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1500, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  assertEquals(chunks.length > 0, true);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assertEquals(total, 1500);
});

Deno.test("file: createReadStream respects start offset", async () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 1024 });

  const stream = file.createReadStream({ start: 500 });
  const reader = stream.getReader();
  const { value, done } = await reader.read();

  assertEquals(done, false);
  assertEquals(value!.length > 0, true);
  // First byte should be the byte at global offset 500
  assertEquals(value![0], 244); // 500 % 256
});

Deno.test("file: createReadStream respects end offset", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 2000, offset: 0, pieceLength: 512 });

  const stream = file.createReadStream({ start: 0, end: 300 });
  const reader = stream.getReader();
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value!.length;
  }

  assertEquals(total, 300);
});

Deno.test("file: createReadStream rejects invalid range", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 500, offset: 0, pieceLength: 1024 });

  assertThrows(() => file.createReadStream({ start: -1 }), RangeError);
  assertThrows(() => file.createReadStream({ start: 0, end: 1000 }), RangeError);
  assertThrows(() => file.createReadStream({ start: 300, end: 100 }), RangeError);
});

Deno.test("file: createReadStream rejects after destroy", () => {
  const store = new FakeChunkStore(1024, 2048);
  const file = new File({ store, length: 500, offset: 0, pieceLength: 1024 });
  file.destroy();

  assertThrows(() => file.createReadStream(), Error, "destroyed");
});

Deno.test("file: createReadStream emits 'done' event on completion", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let doneEmitted = false;
  file.addEventListener("done", () => { doneEmitted = true; });

  const stream = file.createReadStream();
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }

  assertEquals(doneEmitted, true);
});

// ── stream() ─────────────────────────────────────────────────────────────────

Deno.test("file: stream() is an alias for createReadStream", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  const s1 = file.createReadStream();
  const s2 = file.stream();

  const r1 = s1.getReader();
  const r2 = s2.getReader();

  const { value: v1 } = await r1.read();
  const { value: v2 } = await r2.read();

  assertEquals(v1!.length, v2!.length);
});

// ── Symbol.asyncIterator ─────────────────────────────────────────────────────

Deno.test("file: Symbol.asyncIterator yields chunks", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 800, offset: 0, pieceLength: 512 });

  const chunks: Uint8Array[] = [];
  for await (const chunk of file) {
    chunks.push(chunk);
  }

  assertEquals(chunks.length > 0, true);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assertEquals(total, 800);
});

Deno.test("file: Symbol.asyncIterator emits 'iterator' event", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  let eventFired = false;
  file.addEventListener("iterator", () => { eventFired = true; });

  for await (const _ of file) { /* consume */ }

  assertEquals(eventFired, true);
});

// ── arrayBuffer ───────────────────────────────────────────────────────────────

Deno.test("file: arrayBuffer returns full file as ArrayBuffer", async () => {
  const store = new FakeChunkStore(512, 4096);
  const file = new File({ store, length: 1200, offset: 0, pieceLength: 512 });

  const buf = await file.arrayBuffer();
  assertEquals(buf.byteLength, 1200);

  const view = new Uint8Array(buf);
  assertEquals(view[0], 0);
  assertEquals(view[1], 1);
});

Deno.test("file: arrayBuffer for middle file reads correct bytes", async () => {
  const store = new FakeChunkStore(512, 4096);
  // File at offset 512, length 500 (inside piece 1)
  const file = new File({ store, length: 500, offset: 512, pieceLength: 512 });

  const buf = await file.arrayBuffer();
  assertEquals(buf.byteLength, 500);

  const view = new Uint8Array(buf);
  // Global offset 512 → value = 512 % 256 = 0
  assertEquals(view[0], 0);
  // Global offset 513 → value = 513 % 256 = 1
  assertEquals(view[1], 1);
});

// ── blob ─────────────────────────────────────────────────────────────────────

Deno.test("file: blob returns a Blob with correct MIME type", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 300, offset: 0, pieceLength: 512, name: "video.mp4" });

  const blob = await file.blob();
  assertEquals(blob.size, 300);
  assertEquals(blob.type, "video/mp4");
});

// ── getBlobURL ───────────────────────────────────────────────────────────────

Deno.test("file: getBlobURL returns an object URL", async () => {
  const store = new FakeChunkStore(512, 2048);
  const file = new File({ store, length: 200, offset: 0, pieceLength: 512 });

  const url = await file.getBlobURL();
  assertEquals(url.startsWith("blob:"), true);
  URL.revokeObjectURL(url);
});

// ── streamURL ────────────────────────────────────────────────────────────────

Deno.test("file: streamURL throws when infoHash is missing", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16 });

  assertThrows(
    () => file.streamURL(),
    Error,
    "infoHash and fileIndex are required",
  );
});

Deno.test("file: streamURL throws when fileIndex is missing", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 50, pieceLength: 16, infoHash: "a".repeat(40) });

  assertThrows(
    () => file.streamURL(),
    Error,
    "infoHash and fileIndex are required",
  );
});

Deno.test("file: streamURL returns valid SW URL with all fields", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 50,
    pieceLength: 16,
    name: "movie.mp4",
    infoHash: "a".repeat(40),
    fileIndex: 2,
    scope: "/loco/",
  });

  const url = file.streamURL();
  assertEquals(url.includes("a".repeat(40)), true);
  assertEquals(url.includes("/2/"), true);
  assertEquals(url.includes("movie.mp4"), true);
  assertEquals(url.startsWith("/loco/webtorrent/"), true);
});

Deno.test("file: streamURL uses default scope", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 0,
    pieceLength: 16,
    infoHash: "b".repeat(40),
    fileIndex: 0,
  });

  const url = file.streamURL();
  // Default scope is "/" so URL begins with "/webtorrent/"
  assertEquals(url.startsWith("/webtorrent/"), true);
});

// ── streamTo ─────────────────────────────────────────────────────────────────

Deno.test("file: streamTo sets element src to streamURL", () => {
  const store = new FakeChunkStore();
  const file = new File({
    store,
    length: 100,
    offset: 0,
    pieceLength: 16,
    name: "video.mp4",
    infoHash: "c".repeat(40),
    fileIndex: 5,
  });

  let capturedSrc = "";
  let loadCalled = false;
  const element = {
    get src() { return capturedSrc; },
    set src(v: string) { capturedSrc = v; },
    load: () => { loadCalled = true; },
  } as unknown as HTMLMediaElement;

  file.streamTo(element);
  assertEquals(capturedSrc.includes("c".repeat(40)), true);
  assertEquals(loadCalled, true);
});

// ── destroy ─────────────────────────────────────────────────────────────────

Deno.test("file: destroy marks file as destroyed", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });

  assertEquals(file.destroyed, false);
  file.destroy();
  assertEquals(file.destroyed, true);
});

Deno.test("file: createReadStream throws after destroy", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  file.destroy();

  assertThrows(() => file.createReadStream(), Error, "destroyed");
});

// ── select / deselect ───────────────────────────────────────────────────────

Deno.test("file: select() and deselect() are no-ops (API parity)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });

  // These must not throw — piece selection lives on Torrent, not File
  file.select();
  file.select(0, 5);
  file.deselect();
  file.deselect(0, 5);
});

// ============================================================================
// PHASE 6: MIME type detection (type getter)
// ============================================================================

Deno.test("file: type returns correct MIME type for known extensions", () => {
  const store = new FakeChunkStore();

  const cases: [string, string][] = [
    ["video.mp4", "video/mp4"],
    ["movie.mkv", "video/x-matroska"],
    ["clip.webm", "video/webm"],
    ["clip.avi", "video/x-msvideo"],
    ["clip.mov", "video/quicktime"],
    ["audio.mp3", "audio/mpeg"],
    ["sound.flac", "audio/flac"],
    ["track.wav", "audio/wav"],
    ["music.ogg", "audio/ogg"],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["image.png", "image/png"],
    ["graphic.gif", "image/gif"],
    ["pic.webp", "image/webp"],
    ["icon.svg", "image/svg+xml"],
    ["doc.pdf", "application/pdf"],
    ["archive.zip", "application/zip"],
    ["data.rar", "application/vnd.rar"],
    ["files.7z", "application/x-7z-compressed"],
    ["backup.tar", "application/x-tar"],
    ["backup.gz", "application/gzip"],
    ["readme.txt", "text/plain"],
    ["index.html", "text/html"],
    ["style.css", "text/css"],
    ["main.js", "application/javascript"],
    ["config.json", "application/json"],
    ["data.xml", "application/xml"],
    ["changelog.md", "text/markdown"],
    ["disk.iso", "application/x-iso9660-image"],
  ];

  for (const [name, expected] of cases) {
    const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name });
    assertEquals(file.type, expected, `name=${name}`);
  }
});

Deno.test("file: type returns octet-stream for unknown extensions", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name: "file.xyz123" });
  assertEquals(file.type, "application/octet-stream");
});

Deno.test("file: type is case-insensitive for extension", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name: "video.MP4" });
  assertEquals(file.type, "video/mp4");
});

Deno.test("file: type handles filename with no extension", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16, name: "noextension" });
  assertEquals(file.type, "application/octet-stream");
});

// ============================================================================
// PHASE 6: downloaded / progress (per-file, via bitfield)
// ============================================================================

Deno.test("file: downloaded returns 0 when no torrent attached", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  assertEquals(file.downloaded, 0);
});

Deno.test("file: progress returns 0 when no torrent attached", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 100, offset: 0, pieceLength: 16 });
  assertEquals(file.progress, 0);
});

Deno.test("file: progress returns 0 for zero-length file", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 0, offset: 0, pieceLength: 16 });
  assertEquals(file.progress, 0);
});

// ============================================================================
// PHASE 6: download / upload events forwarded from torrent
// ============================================================================

Deno.test("file: emits download event when torrent receives matching piece", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });

  // Simulate a mock torrent that forwards the download event
  const mockBitfield = {
    _data: new Uint8Array(1),
    get(i: number) { return this._data[i] === 1; },
  };
  const mockTorrent = {
    pieces: mockBitfield,
    emit: () => {},
  } as any;

  // Attach torrent reference via private property
  (file as any)._torrent = mockTorrent;

  let downloadBytes = 0;
  file.addEventListener("download", (e: any) => {
    downloadBytes += e.detail.bytes;
  });

  // Simulate the torrent forwarding a download event for piece 0 (owned by this file)
  file.emit("download", new CustomEvent("download", { detail: { bytes: 512 } }));

  assertEquals(downloadBytes, 512);
});

Deno.test("file: emits upload event when torrent forwards upload for matching piece", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });

  const mockTorrent = {} as any;
  (file as any)._torrent = mockTorrent;

  let uploadBytes = 0;
  file.addEventListener("upload", (e: any) => {
    uploadBytes += e.detail.bytes;
  });

  file.emit("upload", new CustomEvent("upload", { detail: { bytes: 256 } }));

  assertEquals(uploadBytes, 256);
});

// ── File.includes(number) — upstream parity ─────────────────────────────────

Deno.test("file: includes accepts a piece index number (upstream parity)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  // pieceRange: first=0, last=1
  assertEquals(file.includes(0), true);
  assertEquals(file.includes(1), true);
  assertEquals(file.includes(2), false);
  assertEquals(file.includes(-1), false);
});

Deno.test("file: includes accepts a Piece object (legacy)", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const piece = { index: 0 } as any;
  assertEquals(file.includes(piece), true);
});

Deno.test("file: includes handles file with single piece", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  // pieceRange: first=0, last=0
  assertEquals(file.includes(0), true);
  assertEquals(file.includes(1), false);
});

// ── File.select / deselect delegation ─────────────────────────────────────

Deno.test("file: select delegates to owning torrent", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  let calledWith: [number, number] | null = null;
  const mockTorrent = {
    pieces: new Bitfield(2),
    select(start: number, end: number) {
      calledWith = [start, end];
    },
  } as any;
  (file as any)._torrent = mockTorrent;

  file.select();
  assertEquals(calledWith, [0, 1]);

  file.select(0, 0);
  assertEquals(calledWith, [0, 0]);
});

Deno.test("file: deselect delegates to owning torrent", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  let calledWith: [number, number] | null = null;
  const mockTorrent = {
    pieces: new Bitfield(2),
    deselect(start: number, end: number) {
      calledWith = [start, end];
    },
  } as any;
  (file as any)._torrent = mockTorrent;

  file.deselect();
  assertEquals(calledWith, [0, 1]);

  file.deselect(1, 1);
  assertEquals(calledWith, [1, 1]);
});

Deno.test("file: select/deselect no-op when no torrent attached", () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  // Should not throw
  file.select();
  file.deselect();
  file.select(0, 0);
  file.deselect(1, 1);
});

// ── File.arrayBuffer / blob range support ──────────────────────────────────

Deno.test("file: arrayBuffer reads entire file by default", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  const ab = await file.arrayBuffer();
  assertEquals(ab.byteLength, 512);
});

Deno.test("file: arrayBuffer reads byte range via {start,end}", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const ab = await file.arrayBuffer({ start: 100, end: 200 });
  assertEquals(ab.byteLength, 100);
  const view = new Uint8Array(ab);
  // FakeChunkStore fills with i % 256, so byte at position 0 of the range is byte 100
  assertEquals(view[0], 100 % 256);
});

Deno.test("file: arrayBuffer reads range from middle to end", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const ab = await file.arrayBuffer({ start: 512 });
  assertEquals(ab.byteLength, 512);
});

Deno.test("file: blob returns Blob with correct size and type", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  const blob = await file.blob();
  assertEquals(blob.size, 512);
  assertEquals(blob.type, "application/octet-stream");
});

Deno.test("file: blob reads byte range via {start,end}", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 1024, offset: 0, pieceLength: 512 });
  const blob = await file.blob({ start: 0, end: 128 });
  assertEquals(blob.size, 128);
});

Deno.test("file: arrayBuffer throws RangeError for invalid range", async () => {
  const store = new FakeChunkStore();
  const file = new File({ store, length: 512, offset: 0, pieceLength: 512 });
  await assertRejects(
    () => file.arrayBuffer({ start: 600, end: 700 }),
    RangeError,
  );
});
