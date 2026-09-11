import {
  assertEquals,
  assertRejects,
} from "@std/assert";
import {
  ByteReader,
  ByteWriter,
  InvalidByteCountError,
  UnexpectedEofError,
  readExactly,
  writeAll,
} from "../src/utils/byte-io.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a reader that serves `source` bytes, optionally splitting them. */
function sliceReader(source: Uint8Array, chunkSize = source.length): ByteReader {
  let offset = 0;
  return {
    async read(p: Uint8Array): Promise<number | null> {
      if (offset >= source.length) return null;
      const n = Math.min(p.length, chunkSize, source.length - offset);
      p.set(source.subarray(offset, offset + n));
      offset += n;
      return n;
    },
  };
}

/** Creates a writer that collects bytes, optionally writing in chunks. */
function collectingWriter(chunkSize = Infinity): ByteWriter & { bytes: Uint8Array } {
  const chunks: Uint8Array[] = [];
  let total = 0;
  return {
    async write(p: Uint8Array): Promise<number> {
      const n = Math.min(p.length, chunkSize);
      chunks.push(p.slice(0, n));
      total += n;
      return n;
    },
    get bytes(): Uint8Array {
      const result = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        result.set(c, off);
        off += c.length;
      }
      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// readExactly
// ---------------------------------------------------------------------------

Deno.test("readExactly — reads exact number of bytes", async () => {
  const source = new Uint8Array([1, 2, 3, 4, 5]);
  const reader = sliceReader(source);
  const target = new Uint8Array(5);
  const result = await readExactly(reader, target);
  assertEquals(result, true);
  assertEquals(target, source);
});

Deno.test("readExactly — empty target returns true immediately", async () => {
  const reader = sliceReader(new Uint8Array([1, 2, 3]));
  const result = await readExactly(reader, new Uint8Array(0));
  assertEquals(result, true);
});

Deno.test("readExactly — retries partial reads", async () => {
  // Serve one byte at a time
  const source = new Uint8Array([10, 20, 30]);
  const reader = sliceReader(source, 1);
  const target = new Uint8Array(3);
  const result = await readExactly(reader, target);
  assertEquals(result, true);
  assertEquals(target, source);
});

Deno.test("readExactly — throws UnexpectedEofError on short read", async () => {
  // Reader yields 2 bytes total then EOF
  let remaining = 2;
  const reader: ByteReader = {
    async read(p: Uint8Array): Promise<number | null> {
      if (remaining <= 0) return null;
      const n = Math.min(p.length, remaining);
      for (let i = 0; i < n; i++) p[i]! = 0xaa;
      remaining -= n;
      return n;
    },
  };
  const target = new Uint8Array(5);
  const err = await assertRejects(
    () => readExactly(reader, target),
    UnexpectedEofError,
  );
  assertEquals(err.bytesRead, 2);
  assertEquals(err.expectedBytes, 5);
});

Deno.test("readExactly — allowCleanEof returns false on immediate EOF", async () => {
  const reader: ByteReader = {
    async read(_p: Uint8Array): Promise<number | null> {
      return null;
    },
  };
  const target = new Uint8Array(4);
  const result = await readExactly(reader, target, { allowCleanEof: true });
  assertEquals(result, false);
});

Deno.test("readExactly — allowCleanEof still throws on partial EOF", async () => {
  let callCount = 0;
  const reader: ByteReader = {
    async read(p: Uint8Array): Promise<number | null> {
      callCount++;
      if (callCount === 1) {
        p[0]! = 0xff;
        return 1;
      }
      return null;
    },
  };
  const target = new Uint8Array(3);
  await assertRejects(
    () => readExactly(reader, target, { allowCleanEof: true }),
    UnexpectedEofError,
  );
});

Deno.test("readExactly — throws InvalidByteCountError on zero read", async () => {
  const reader: ByteReader = {
    async read(_p: Uint8Array): Promise<number | null> {
      return 0;
    },
  };
  const target = new Uint8Array(4);
  await assertRejects(
    () => readExactly(reader, target),
    InvalidByteCountError,
  );
});

// ---------------------------------------------------------------------------
// writeAll
// ---------------------------------------------------------------------------

Deno.test("writeAll — writes all bytes at once", async () => {
  const writer = collectingWriter();
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  await writeAll(writer, data);
  assertEquals(writer.bytes, data);
});

Deno.test("writeAll — retries partial writes", async () => {
  const writer = collectingWriter(2);
  const data = new Uint8Array([10, 20, 30, 40, 50]);
  await writeAll(writer, data);
  assertEquals(writer.bytes, data);
});

Deno.test("writeAll — empty data is a no-op", async () => {
  const writer = collectingWriter();
  await writeAll(writer, new Uint8Array(0));
  assertEquals(writer.bytes, new Uint8Array(0));
});

Deno.test("writeAll — throws InvalidByteCountError on zero write", async () => {
  const writer: ByteWriter = {
    async write(_p: Uint8Array): Promise<number> {
      return 0;
    },
  };
  const err = await assertRejects(
    () => writeAll(writer, new Uint8Array([1, 2, 3])),
    InvalidByteCountError,
  );
  assertEquals(err.operation, "write");
  assertEquals(err.count, 0);
});

// ---------------------------------------------------------------------------
// InvalidByteCountError
// ---------------------------------------------------------------------------

Deno.test("InvalidByteCountError — carries operation, count, maximum", () => {
  const err = new InvalidByteCountError("read", -1, 1024);
  assertEquals(err.name, "InvalidByteCountError");
  assertEquals(err instanceof RangeError, true);
  assertEquals(err.operation, "read");
  assertEquals(err.count, -1);
  assertEquals(err.maximum, 1024);
  assertEquals(
    err.message,
    "read returned invalid byte count -1; expected an integer from 1 to 1024",
  );
});
