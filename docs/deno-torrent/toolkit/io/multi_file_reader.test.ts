import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import { DEFAULT_ITERATOR_CHUNK_SIZE, DEFAULT_MAX_CHUNK_SIZE, MultiFileReader } from '../../mod.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a temp file with the given bytes and returns its path. */
async function tmpFile(bytes: Uint8Array): Promise<string> {
  const f = await Deno.makeTempFile();
  await Deno.writeFile(f, bytes);
  return f;
}

/** Collects all bytes from a MultiFileReader.read() loop. */
async function readAll(reader: MultiFileReader): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const p = new Uint8Array(16);
  let n: number | null;
  while ((n = await reader.read(p)) !== null) {
    chunks.push(p.slice(0, n));
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

// ── Constructor ───────────────────────────────────────────────────────────────

Deno.test('MultiFileReader - throws on empty file list', () => {
  let threw = false;
  try {
    new MultiFileReader([]);
  } catch (e) {
    threw = e instanceof RangeError;
  }
  assertEquals(threw, true);
});

Deno.test('MultiFileReader - validates maxChunkSize', () => {
  assertThrows(() => new MultiFileReader(['file'], { maxChunkSize: 0 }), RangeError);
  assertThrows(() => new MultiFileReader(['file'], { maxChunkSize: 1.5 }), RangeError);
  assertEquals(DEFAULT_MAX_CHUNK_SIZE, 16 * 1024 * 1024);
});

Deno.test('MultiFileReader - aborts reads and closes the active file', async () => {
  const path = await tmpFile(new Uint8Array([1, 2]));
  const controller = new AbortController();
  const reader = new MultiFileReader([path], { signal: controller.signal });
  try {
    assertEquals(await reader.read(new Uint8Array(1)), 1);
    controller.abort();
    await assertRejects(() => reader.readChunk(1), DOMException, 'aborted');
  } finally {
    reader.close();
    await Deno.remove(path);
  }
});

// ── read() ────────────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.read - single file', async () => {
  const path = await tmpFile(new Uint8Array([1, 2, 3, 4, 5]));
  try {
    const reader = new MultiFileReader([path]);
    const data = await readAll(reader);
    assertEquals(data, new Uint8Array([1, 2, 3, 4, 5]));
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.read - multiple files concatenated', async () => {
  const f1 = await tmpFile(new Uint8Array([1, 2, 3]));
  const f2 = await tmpFile(new Uint8Array([4, 5]));
  const f3 = await tmpFile(new Uint8Array([6]));
  try {
    const reader = new MultiFileReader([f1, f2, f3]);
    const data = await readAll(reader);
    assertEquals(data, new Uint8Array([1, 2, 3, 4, 5, 6]));
  } finally {
    await Deno.remove(f1);
    await Deno.remove(f2);
    await Deno.remove(f3);
  }
});

Deno.test('MultiFileReader.read - returns null at EOS twice', async () => {
  const path = await tmpFile(new Uint8Array([42]));
  try {
    const reader = new MultiFileReader([path]);
    await readAll(reader);
    const p = new Uint8Array(1);
    assertEquals(await reader.read(p), null);
    assertEquals(await reader.read(p), null);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.read - zero-length p returns 0', async () => {
  const path = await tmpFile(new Uint8Array([1]));
  try {
    const reader = new MultiFileReader([path]);
    assertEquals(await reader.read(new Uint8Array(0)), 0);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.read - skips empty files', async () => {
  const files = await Promise.all([
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array([1, 2])),
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array([3])),
  ]);
  try {
    assertEquals(await readAll(new MultiFileReader(files)), new Uint8Array([1, 2, 3]));
  } finally {
    await Promise.all(files.map((file) => Deno.remove(file)));
  }
});

// ── readChunk() ───────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.readChunk - exact chunk spanning files', async () => {
  const f1 = await tmpFile(new Uint8Array([1, 2, 3])); // 3 bytes
  const f2 = await tmpFile(new Uint8Array([4, 5])); // 2 bytes
  try {
    const reader = new MultiFileReader([f1, f2]);
    assertEquals(await reader.readChunk(3), new Uint8Array([1, 2, 3]));
    assertEquals(await reader.readChunk(2), new Uint8Array([4, 5]));
    assertEquals(await reader.readChunk(1), null);
  } finally {
    await Deno.remove(f1);
    await Deno.remove(f2);
  }
});

Deno.test('MultiFileReader.readChunk - chunk larger than remaining data', async () => {
  const path = await tmpFile(new Uint8Array([10, 20, 30]));
  try {
    const reader = new MultiFileReader([path]);
    // Ask for 10 but only 3 available — returns partial
    const chunk = await reader.readChunk(10);
    assertEquals(chunk, new Uint8Array([10, 20, 30]));
    assertEquals(await reader.readChunk(1), null);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - returns null on exhausted stream', async () => {
  const path = await tmpFile(new Uint8Array([1]));
  try {
    const reader = new MultiFileReader([path]);
    await reader.readChunk(1);
    assertEquals(await reader.readChunk(1), null);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - throws on non-positive length', async () => {
  const path = await tmpFile(new Uint8Array([1]));
  try {
    const reader = new MultiFileReader([path]);
    await assertRejects(() => reader.readChunk(0), RangeError);
    await assertRejects(() => reader.readChunk(-1), RangeError);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - enforces configured maximum', async () => {
  const path = await tmpFile(new Uint8Array([1, 2, 3]));
  try {
    const reader = new MultiFileReader([path], { maxChunkSize: 2 });
    await assertRejects(() => reader.readChunk(3), RangeError);
    assertEquals(await reader.readChunk(2), new Uint8Array([1, 2]));
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - honors a configured maximum above 16 MiB', async () => {
  const path = await tmpFile(new Uint8Array([1, 2, 3]));
  try {
    const reader = new MultiFileReader([path], { maxChunkSize: 17 * 1024 * 1024 });
    assertEquals(await reader.readChunk(17 * 1024 * 1024), new Uint8Array([1, 2, 3]));
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader - supports async iteration', async () => {
  const f1 = await tmpFile(new Uint8Array([1, 2, 3]));
  const f2 = await tmpFile(new Uint8Array([4, 5]));
  try {
    const reader = new MultiFileReader([f1, f2], { maxChunkSize: 2 });
    const chunks: Uint8Array[] = [];
    for await (const chunk of reader) chunks.push(chunk);
    assertEquals(chunks, [new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5])]);
    assertEquals(DEFAULT_ITERATOR_CHUNK_SIZE, 64 * 1024);
  } finally {
    await Deno.remove(f1);
    await Deno.remove(f2);
  }
});

Deno.test('MultiFileReader.chunks - crosses empty files and closes on early break', async () => {
  const files = await Promise.all([
    tmpFile(new Uint8Array([1])),
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array([2, 3])),
  ]);
  const reader = new MultiFileReader(files, { maxChunkSize: 2 });
  try {
    for await (const chunk of reader.chunks(2)) {
      assertEquals(chunk, new Uint8Array([1, 2]));
      break;
    }
    reader.reset();
    const chunks: Uint8Array[] = [];
    for await (const chunk of reader.chunks(1)) chunks.push(chunk);
    assertEquals(chunks, [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
  } finally {
    reader.close();
    await Promise.all(files.map((file) => Deno.remove(file)));
  }
});

// ── reset() ───────────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.reset - re-reads from beginning', async () => {
  const path = await tmpFile(new Uint8Array([7, 8, 9]));
  const reader = new MultiFileReader([path]);
  try {
    assertEquals(await reader.readChunk(3), new Uint8Array([7, 8, 9]));
    assertEquals(await reader.readChunk(1), null);
    reader.reset();
    assertEquals(await reader.readChunk(3), new Uint8Array([7, 8, 9]));
  } finally {
    reader.close();
    await Deno.remove(path);
  }
});

// ── close() ───────────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.close - can call multiple times safely', async () => {
  const path = await tmpFile(new Uint8Array([1, 2]));
  try {
    const reader = new MultiFileReader([path]);
    const p = new Uint8Array(1);
    await reader.read(p); // opens the file
    reader.close();
    reader.close(); // second close must not throw
  } finally {
    await Deno.remove(path);
  }
});
