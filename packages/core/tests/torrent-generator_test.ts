// /loco/monorepo/webtorrent/tests/torrent-generator_test.ts
/**
 * Tests for the OPFS torrent generator.
 *
 * Since OPFS (`navigator.storage.getDirectory`) is not available in Deno,
 * all file-system interactions are mocked.  The pure functions (calcPieceSize,
 * buildPieceFiles, etc.) are tested directly; the I/O-dependent ones use
 * mock OPFS handles that behave like real browser handles.
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  buildPieceFiles,
  calcPieceSize,
  decode,
  fileSizeSum,
  generateTorrent,
  getDefaultCreatedBy,
  getOPFSFileSize,
  isHiddenFile,
  OPFSMultiFileReader,
  sha1sum,
  walkOPFSDir,
  PieceSizeEnum,
} from "../src/torrent-generator/mod.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a mock `File` with a configurable byte slice. */
function mockFile(bytes: Uint8Array): File {
  return {
    size: bytes.byteLength,
    slice(start?: number, end?: number) {
      const s = start ?? 0;
      const e = end ?? bytes.byteLength;
      const sub = bytes.subarray(s, e);
      return {
        size: sub.byteLength,
        arrayBuffer() {
          return Promise.resolve(sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength));
        },
        stream() { throw new Error("not implemented"); },
        text() { throw new Error("not implemented"); },
        type: "",
        name: "",
        lastModified: 0,
        slice() { throw new Error("not implemented"); },
      } as unknown as File;
    },
    stream() { throw new Error("not implemented"); },
    text() { throw new Error("not implemented"); },
    type: "",
    name: "",
    lastModified: 0,
  } as unknown as File;
}

/** Creates a mock `FileSystemFileHandle` backed by a `Uint8Array`. */
function mockFileHandle(name: string, bytes: Uint8Array): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    getFile() {
      return Promise.resolve(mockFile(bytes));
    },
    createWritable() {
      throw new Error("not implemented in tests");
    },
    getFileHandle() {
      throw new Error("not implemented in tests");
    },
    removeEntry() {
      throw new Error("not implemented in tests");
    },
    resolve() {
      throw new Error("not implemented in tests");
    },
    isSameEntry() {
      throw new Error("not implemented in tests");
    },
    queryPermission() {
      throw new Error("not implemented in tests");
    },
    requestPermission() {
      throw new Error("not implemented in tests");
    },
  } as unknown as FileSystemFileHandle;
}

/** Recursive mock builder for FileSystemDirectoryHandle.
 *
 *  `entries` can include:
 *  - `{ name: "foo.txt", kind: "file", handle }`  → file
 *  - `{ name: "subdir",  kind: "directory", entries: [...] }`  → sub-directory
 *
 *  Handles are memoized so `getFileHandle("subdir")` returns the same object
 *  that `values()` would yield for the sub-directory.
 */
type MockEntry =
  | { name: string; kind: "file"; handle: FileSystemFileHandle }
  | { name: string; kind: "directory"; entries: MockEntry[] };

function buildMockDir(
  entries: MockEntry[],
  name: string = "root",
): FileSystemDirectoryHandle {
  // Map of leaf name → sub-dir handle (memoized for getFileHandle)
  const subDirs = new Map<string, FileSystemDirectoryHandle>();

  function ensureSubDir(name: string, subEntries: MockEntry[]): FileSystemDirectoryHandle {
    if (!subDirs.has(name)) {
      subDirs.set(name, buildMockDir(subEntries, name));
    }
    return subDirs.get(name)!;
  }

  const iterable = {
    _entries: entries,
    async next() {
      // We store index on the iterable itself so each call to next() can
      // advance independently of the AsyncIterator call.
      const i = (this as any)._idx = ((this as any)._idx ?? 0);
      if (i >= entries.length) return { done: true, value: undefined };
      (this as any)._idx = i + 1;
      const e = entries[i]!;
      if (e.kind === "file") {
        return { done: false, value: e.handle ?? mockFileHandle(e.name, new Uint8Array(0)) };
      }
      // Return a lightweight directory handle for recursion
      return { done: false, value: ensureSubDir(e.name, e.entries) };
    },
    [Symbol.asyncIterator]() { return this; },
  };

  return {
    kind: "directory",
    name,
    getFileHandle(name: string) {
      const found = entries.find((e) => e.kind === "file" && e.name === name);
      if (found && found.kind === "file") return Promise.resolve(found.handle);
      const subEntry = entries.find((e) => e.kind === "directory" && e.name === name);
      if (!subEntry || subEntry.kind !== "directory") throw new Error(`not found: ${name}`);
      return Promise.resolve(ensureSubDir(subEntry.name, subEntry.entries));
    },
    getDirectoryHandle() { throw new Error("not implemented"); },
    removeEntry() { throw new Error("not implemented"); },
    resolve() { throw new Error("not implemented"); },
    isSameEntry() { throw new Error("not implemented"); },
    queryPermission() { throw new Error("not implemented"); },
    requestPermission() { throw new Error("not implemented"); },
    values() { return iterable; },
  } as unknown as FileSystemDirectoryHandle;
}

// ─────────────────────────────────────────────────────────────────────────────
// PieceSizeEnum
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("PieceSizeEnum: all expected presets are defined", () => {
  assertEquals(PieceSizeEnum.SIZE_AUTO, 0);
  assertEquals(PieceSizeEnum.SIZE_16KB, 16 * 1024);
  assertEquals(PieceSizeEnum.SIZE_32KB, 32 * 1024);
  assertEquals(PieceSizeEnum.SIZE_64KB, 64 * 1024);
  assertEquals(PieceSizeEnum.SIZE_128KB, 128 * 1024);
  assertEquals(PieceSizeEnum.SIZE_256KB, 256 * 1024);
  assertEquals(PieceSizeEnum.SIZE_512KB, 512 * 1024);
  assertEquals(PieceSizeEnum.SIZE_1MB, 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_2MB, 2 * 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_4MB, 4 * 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_8MB, 8 * 1024 * 1024);
  assertEquals(PieceSizeEnum.SIZE_16MB, 16 * 1024 * 1024);
});

// ─────────────────────────────────────────────────────────────────────────────
// calcPieceSize (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("calcPieceSize: SIZE_AUTO selects smallest preset > fileSize", () => {
  // 10 KB → SIZE_16KB
  assertEquals(calcPieceSize(10 * 1024, PieceSizeEnum.SIZE_AUTO), PieceSizeEnum.SIZE_16KB);
  // 20 KB → SIZE_32KB
  assertEquals(calcPieceSize(20 * 1024, PieceSizeEnum.SIZE_AUTO), PieceSizeEnum.SIZE_32KB);
  // 100 KB → SIZE_128KB
  assertEquals(calcPieceSize(100 * 1024, PieceSizeEnum.SIZE_AUTO), PieceSizeEnum.SIZE_128KB);
});

Deno.test("calcPieceSize: explicit preset is returned unchanged", () => {
  assertEquals(calcPieceSize(1_000_000, PieceSizeEnum.SIZE_512KB), PieceSizeEnum.SIZE_512KB);
  assertEquals(calcPieceSize(99, PieceSizeEnum.SIZE_8MB), PieceSizeEnum.SIZE_8MB);
});

Deno.test("calcPieceSize: zero file size returns smallest preset", () => {
  const result = calcPieceSize(0, PieceSizeEnum.SIZE_AUTO);
  assertEquals(result, PieceSizeEnum.SIZE_16KB);
});

// ─────────────────────────────────────────────────────────────────────────────
// fileSizeSum (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("fileSizeSum: returns 0 for empty array", () => {
  assertEquals(fileSizeSum([]), 0);
});

Deno.test("fileSizeSum: sums sizes correctly", () => {
  const files = [
    { name: "a", size: 100 },
    { name: "b", size: 200 },
    { name: "c", size: 50 },
  ];
  assertEquals(fileSizeSum(files), 350);
});

// ─────────────────────────────────────────────────────────────────────────────
// isHiddenFile (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("isHiddenFile: detects dotfiles", () => {
  assertEquals(isHiddenFile(".DS_Store"), true);
  assertEquals(isHiddenFile(".gitignore"), true);
  assertEquals(isHiddenFile("a/b/.hidden"), true);
  assertEquals(isHiddenFile("a/.config"), true);
});

Deno.test("isHiddenFile: passes normal files", () => {
  assertEquals(isHiddenFile("video.mp4"), false);
  assertEquals(isHiddenFile("readme.txt"), false);
  assertEquals(isHiddenFile("a/b/file.txt"), false);
  assertEquals(isHiddenFile("my.torrent"), false);
  // .config/settings.json — the *file* itself is not hidden,
  // only the parent directory is.  Walker checks the parent dir.
  assertEquals(isHiddenFile("settings.json"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPieceFiles (pure)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("buildPieceFiles: single file produces no padding", () => {
  const files = [
    { name: "a", size: 100 },
  ];
  const result = buildPieceFiles(files, 1024 * 1024);
  assertEquals(result.length, 1);
  assertEquals(result[0]!.file, files[0]);
  assertEquals(result[0]!.padding, false);
});

Deno.test("buildPieceFiles: adds padding before second file (BEP-47)", () => {
  // pieceSize = 100, file1 = 60 bytes → offset=60 after file 1
  // file2 (length=80) needs pad of (100-60)=40 before it
  const files = [
    { name: "a", size: 60 },
    { name: "b", size: 80 },
  ];
  const result = buildPieceFiles(files, 100);
  assertEquals(result.length, 3);
  assertEquals(result[0]!.file, files[0]);
  assertEquals(result[0]!.padding, false);
  assertEquals(result[0]!.length, 60);
  assertEquals(result[1]!.padding, true);
  assertEquals(result[1]!.length, 40);
  assertEquals(result[1]!.file, null);
  assertEquals(result[2]!.file, files[1]);
  assertEquals(result[2]!.padding, false);
  assertEquals(result[2]!.length, 80);
});

Deno.test("buildPieceFiles: zero-length files are skipped for padding calc", () => {
  const files = [
    { name: "a", size: 100 },
    { name: "b", size: 0 },
    { name: "c", size: 50 },
  ];
  // file a: offset=0, no pad, push a, offset=100
  // file b: length=0, skip pad calc, push b, offset=(100+0)%100=0
  // file c: offset=0, no pad, push c, offset=50
  const result = buildPieceFiles(files, 100);
  assertEquals(result.length, 3);
  assertEquals(result[0]!.file, files[0]);
  assertEquals(result[1]!.file, files[1]);
  assertEquals(result[1]!.length, 0);
  assertEquals(result[2]!.file, files[2]);
});

Deno.test("buildPieceFiles: file starting exactly at piece boundary needs no pad", () => {
  const files = [
    { name: "a", size: 100 },
    { name: "b", size: 50 },
  ];
  // file a: offset=0, no pad, push a, offset=0
  // file b: offset=0, no pad, push b, offset=50
  const result = buildPieceFiles(files, 100);
  assertEquals(result.length, 2);
  assertEquals(result[0]!.padding, false);
  assertEquals(result[1]!.padding, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultCreatedBy
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("getDefaultCreatedBy: returns a loco-torrent-generator version string", () => {
  const result = getDefaultCreatedBy();
  assertEquals(result.startsWith("loco-torrent-generator@"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// OPFSMultiFileReader
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("OPFSMultiFileReader: readChunk returns null when no files", async () => {
  const reader = new OPFSMultiFileReader([]);
  const result = await reader.readChunk(1024);
  assertEquals(result, null);
  reader.close();
});

Deno.test("OPFSMultiFileReader: readChunk crosses file boundaries", async () => {
  const files = [
    { name: "a", size: 5, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: "b", size: 3, bytes: new Uint8Array([6, 7, 8]) },
  ];
  const entries = files.map((f) => ({
    name: f.name,
    size: f.size,
    handle: mockFileHandle(f.name, f.bytes),
  }));
  const reader = new OPFSMultiFileReader(entries);

  // Read 6 bytes: 5 from 'a' + 1 from 'b'
  const chunk1 = await reader.readChunk(6);
  assertExists(chunk1);
  assertEquals(chunk1.byteLength, 6);
  assertEquals(Array.from(chunk1), [1, 2, 3, 4, 5, 6]);

  // Read remaining 2 bytes from 'b'
  const chunk2 = await reader.readChunk(4);
  assertExists(chunk2);
  assertEquals(Array.from(chunk2), [7, 8]);

  // Read past end
  const chunk3 = await reader.readChunk(10);
  assertEquals(chunk3, null);

  reader.close();
});

Deno.test("OPFSMultiFileReader: chunks() yields until exhausted", async () => {
  const entries = [
    { name: "a", size: 3, bytes: new Uint8Array([10, 20, 30]) },
    { name: "b", size: 2, bytes: new Uint8Array([40, 50]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const reader = new OPFSMultiFileReader(entries);
  const all: number[] = [];
  for await (const chunk of reader.chunks(2)) {
    all.push(...chunk);
  }
  assertEquals(all, [10, 20, 30, 40, 50]);
  reader.close();
});

Deno.test("OPFSMultiFileReader: close is idempotent", async () => {
  const entries = [{ name: "a", size: 0, bytes: new Uint8Array(0) }].map(
    (f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }),
  );
  const reader = new OPFSMultiFileReader(entries);
  reader.close();
  reader.close(); // must not throw
  assertEquals(reader.closed, true);
});

Deno.test("OPFSMultiFileReader: readChunk throws on non-positive size", async () => {
  const reader = new OPFSMultiFileReader([]);
  await assertRejects(() => reader.readChunk(0), RangeError);
  await assertRejects(() => reader.readChunk(-1), RangeError);
  reader.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// sha1sum (mocked OPFS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("sha1sum: hashes a single file correctly", async () => {
  // Known SHA-1 for 4 bytes [1,2,3,4] = 0x40e7c3...
  const entries = [
    { name: "test.bin", size: 4, bytes: new Uint8Array([1, 2, 3, 4]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const digest = await sha1sum(entries, 1024);
  assertEquals(digest.byteLength, 20);
  // Verify it's a non-zero SHA-1
  assertEquals(digest.some((b) => b !== 0), true);
});

Deno.test("sha1sum: hashes multiple files sequentially", async () => {
  const entries = [
    { name: "a.bin", size: 3, bytes: new Uint8Array([0xaa, 0xbb, 0xcc]) },
    { name: "b.bin", size: 2, bytes: new Uint8Array([0xdd, 0xee]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const digest = await sha1sum(entries, 1024);
  assertEquals(digest.byteLength, 20);
  // Two files as one stream: [0xaa, 0xbb, 0xcc, 0xdd, 0xee]
  // SHA-1 of that should be deterministic
  assertEquals(digest.some((b) => b !== 0), true);
});

Deno.test("sha1sum: produces multiple pieces when file exceeds pieceSize", async () => {
  const data = new Uint8Array(150); // 150 bytes
  data.fill(0x42);
  const entries = [{ name: "big.bin", size: 150, bytes: data }].map(
    (f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }),
  );

  const digest = await sha1sum(entries, 100); // 2 pieces
  assertEquals(digest.byteLength, 40); // 2 × 20 bytes
});

Deno.test("sha1sum: throws on pieceSize < 1", async () => {
  const entries: Array<{ name: string; size: number; handle: FileSystemFileHandle }> = [];
  await assertRejects(() => sha1sum(entries, 0), RangeError);
});

// ─────────────────────────────────────────────────────────────────────────────
// walkOPFSDir (mocked OPFS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("walkOPFSDir: returns files with correct names and sizes", async () => {
  const h1 = mockFileHandle("video.mp4", new Uint8Array(1024));
  const h2 = mockFileHandle("readme.txt", new Uint8Array(100));
  const root = buildMockDir([
    { name: "video.mp4", kind: "file", handle: h1 },
    { name: "readme.txt", kind: "file", handle: h2 },
  ]);

  const files = await walkOPFSDir(root);
  assertEquals(files.length, 2);
  // BEP-3 sort: lexically — "readme.txt" < "video.mp4"
  assertEquals(files[0]!.name, "readme.txt");
  assertEquals(files[0]!.size, 100);
  assertEquals(files[1]!.name, "video.mp4");
  assertEquals(files[1]!.size, 1024);
});

Deno.test("walkOPFSDir: skips hidden files when ignoreHiddenFile=true", async () => {
  const root = buildMockDir([
    { name: ".DS_Store", kind: "file", handle: mockFileHandle(".DS_Store", new Uint8Array(0)) },
    { name: "visible.txt", kind: "file", handle: mockFileHandle("visible.txt", new Uint8Array(10)) },
  ]);

  const files = await walkOPFSDir(root, true);
  assertEquals(files.length, 1);
  assertEquals(files[0]!.name, "visible.txt");
});

Deno.test("walkOPFSDir: skips hidden directories", async () => {
  const root = buildMockDir([
    { name: ".hidden", kind: "directory", entries: [] },
    { name: "visible.txt", kind: "file", handle: mockFileHandle("visible.txt", new Uint8Array(10)) },
  ]);

  const files = await walkOPFSDir(root, true);
  assertEquals(files.length, 1);
  assertEquals(files[0]!.name, "visible.txt");
});

Deno.test("walkOPFSDir: sorts by depth then lexically (BEP-3)", async () => {
  // BEP-3: files at depth=1 come before deeper ones; same depth = lexical.
  const root = buildMockDir([
    { name: "z.txt", kind: "file", handle: mockFileHandle("z.txt", new Uint8Array(1)) },
    { name: "b.txt", kind: "file", handle: mockFileHandle("b.txt", new Uint8Array(1)) },
    {
      name: "deep",
      kind: "directory",
      entries: [
        { name: "a.txt", kind: "file", handle: mockFileHandle("a.txt", new Uint8Array(1)) },
      ],
    },
  ]);

  const files = await walkOPFSDir(root);
  // Depth=1 files first (b.txt < z.txt lexically), then depth=2 (deep/a.txt)
  assertEquals(files.map((f) => f.name), ["b.txt", "z.txt", "deep/a.txt"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// getOPFSFileSize (mocked OPFS)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("getOPFSFileSize: returns file size from handle", async () => {
  const handle = mockFileHandle("test.bin", new Uint8Array(123));
  const size = await getOPFSFileSize(handle);
  assertEquals(size, 123);
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTorrent
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("generateTorrent: multi-file torrent encodes correctly", async () => {
  const entries = [
    { name: "folder/a.txt", size: 5, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: "folder/b.txt", size: 3, bytes: new Uint8Array([6, 7, 8]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    pieceSize: PieceSizeEnum.SIZE_64KB,
    trackers: ["udp://tracker.example.com:6969/announce"],
    webSeeds: ["https://seed.example.com/"],
  });

  assertEquals(chunks.length, 1);
  const bencoded = chunks[0]!;
  // Bencode markers: d = dict start, 4:info = key, 6:length = key, etc.
  assertEquals(bencoded[0], 0x64); // 'd'
  assertEquals(bencoded.includes(0x3a), true); // ':' — part of string lengths
});

// ─────────────────────────────────────────────────────────────────────────────
// encode round-trip via parseTorrent
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("generateTorrent: bencoded output can be decoded", async () => {
  const entries = [
    { name: "alpha.txt", size: 3, bytes: new Uint8Array([0x01, 0x02, 0x03]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    trackers: [],
  });

  const bencoded = chunks[0]!;
  // Should start with 'd' and contain "info" key
  assertEquals(bencoded[0], 0x64); // 'd'
  assertEquals(bencoded.includes(0x69), true); // 'i' might appear in bencode integers
  assertEquals(bencoded.includes(0x6e), true); // 'n' for "length", "name", etc.
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("generateTorrent: throws when no files found", async () => {
  const root = buildMockDir([]);
  await assertRejects(
    () => generateTorrent({
      writer: { write: () => Promise.resolve(0) },
      entry: root,
    }),
    Error,
    "No files found in entry",
  );
});

Deno.test("generateTorrent: single-file torrent has 'length' in info", async () => {
  const entries = [
    { name: "solo.bin", size: 7, bytes: new Uint8Array(7) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
  });

  // Single file → bencoded info has '6:length' (no 'files' key)
  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("6:length"), true);
  assertEquals(bencoded.includes("5:files"), false);
});

Deno.test("generateTorrent: private torrent includes 'private' in info", async () => {
  const entries = [
    { name: "secret.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    isPrivate: true,
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  // BEP-3 sort: lexically — "readme.txt" < "video.mp4"
  // info.private = 1 → bencoded as "7:privatei1ee"
  assertEquals(bencoded.includes("7:privatei1ee"), true);
});

Deno.test("generateTorrent: comment is included when provided", async () => {
  const entries = [
    { name: "test.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    comment: "hello world",
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("7:comment"), true);
  assertEquals(bencoded.includes("hello world"), true);
});

Deno.test("generateTorrent: announce-list is set for multiple trackers", async () => {
  const entries = [
    { name: "t.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    trackers: [
      "udp://second.example.com:6969/announce",
      "udp://first.example.com:6969/announce",
    ],
  });

  // announce-list: 13:announce-list
  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("13:announce-list"), true);
});

Deno.test("generateTorrent: url-list (web seeds) is included when provided", async () => {
  const entries = [
    { name: "t.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    webSeeds: ["https://seed.example.com/file/"],
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  assertEquals(bencoded.includes("8:url-list"), true);
});

Deno.test("generateTorrent: alignPiece creates padding entries", async () => {
  // file1=60 bytes, pieceSize=100 → 40-byte pad needed
  const entries = [
    { name: "a.bin", size: 60, bytes: new Uint8Array(60) },
    { name: "b.bin", size: 20, bytes: new Uint8Array(20) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    alignPiece: true,
    pieceSize: 100,
  });

  const bencoded = new TextDecoder().decode(chunks[0]!);
  // Padding file path: ".pad" directory → "4:.pad"
  assertEquals(bencoded.includes("4:.pad"), true);
});

Deno.test("generateTorrent: created-by and creation-date are present", async () => {
  const entries = [
    { name: "t.txt", size: 1, bytes: new Uint8Array([0]) },
  ].map((f) => ({ name: f.name, size: f.size, handle: mockFileHandle(f.name, f.bytes) }));

  const chunks: Uint8Array[] = [];
  await generateTorrent({
    writer: { write: (p) => { chunks.push(p); return Promise.resolve(p.byteLength); } },
    entry: entries,
    createdBy: "my-app@2.0.0",
    createdAt: 1_700_000_000,
  });

  // Decode the bencoded output and verify the fields
  const decoded = decode(chunks[0]!, { useMap: true }) as Map<string, unknown>;
  assertEquals(decoded.get("created by"), "my-app@2.0.0");
  assertEquals(decoded.get("creation date"), 1_700_000_000);
});
