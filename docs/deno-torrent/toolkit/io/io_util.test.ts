import { assertEquals, assertRejects } from '@std/assert';
import { InvalidByteCountError, IoUtil, UnexpectedEofError } from '../../mod.ts';

Deno.test('IoUtil.readAll - reads partial chunks with an explicit cap', async () => {
  const input = new Uint8Array([1, 2, 3, 4, 5]);
  let offset = 0;
  const reader = {
    read(buffer: Uint8Array): Promise<number | null> {
      if (offset === input.length) return Promise.resolve(null);
      const count = Math.min(2, input.length - offset, buffer.length);
      buffer.set(input.subarray(offset, offset + count));
      offset += count;
      return Promise.resolve(count);
    },
  };
  assertEquals(await IoUtil.readAll(reader, { maxBytes: 5, chunkSize: 3 }), input);
});

Deno.test('IoUtil.readAll - validates limits and reader counts', async () => {
  const badReader = (count: number) => ({ read: (_: Uint8Array) => Promise.resolve(count) });
  await assertRejects(
    () => IoUtil.readAll(badReader(0), { maxBytes: 1 }),
    InvalidByteCountError,
  );
  await assertRejects(
    () => IoUtil.readAll(badReader(-1), { maxBytes: 1 }),
    InvalidByteCountError,
  );
  await assertRejects(
    () => IoUtil.readAll(badReader(2), { maxBytes: 1 }),
    InvalidByteCountError,
  );
  await assertRejects(() => IoUtil.readAll(badReader(1), { maxBytes: 0 }), RangeError);
});

Deno.test('IoUtil.readAll - fails immediately once maxBytes is exceeded', async () => {
  let calls = 0;
  const reader = {
    read: (buffer: Uint8Array) => {
      buffer[0] = 1;
      calls++;
      return Promise.resolve(1);
    },
  };
  await assertRejects(() => IoUtil.readAll(reader, { maxBytes: 2, chunkSize: 1 }), RangeError);
  assertEquals(calls, 3);
});

Deno.test('IoUtil.readExactly - combines partial reads', async () => {
  const input = new Uint8Array([1, 2, 3, 4, 5]);
  const target = new Uint8Array(input.length);
  let offset = 0;
  let calls = 0;
  const reader = {
    read(buffer: Uint8Array): Promise<number | null> {
      calls++;
      const count = Math.min(2, input.length - offset, buffer.length);
      buffer.set(input.subarray(offset, offset + count));
      offset += count;
      return Promise.resolve(count);
    },
  };

  assertEquals(await IoUtil.readExactly(reader, target), true);
  assertEquals(target, input);
  assertEquals(calls, 3);
});

Deno.test('IoUtil.readExactly - distinguishes clean and unexpected EOF', async () => {
  const eofReader = { read: (_: Uint8Array) => Promise.resolve(null) };
  assertEquals(
    await IoUtil.readExactly(eofReader, new Uint8Array(1), { allowCleanEof: true }),
    false,
  );

  const initialEof = await assertRejects(
    () => IoUtil.readExactly(eofReader, new Uint8Array(2)),
    UnexpectedEofError,
  );
  assertEquals(initialEof.name, 'UnexpectedEofError');
  assertEquals(initialEof.bytesRead, 0);
  assertEquals(initialEof.expectedBytes, 2);

  let calls = 0;
  const partialReader = {
    read(buffer: Uint8Array): Promise<number | null> {
      calls++;
      if (calls === 1) {
        buffer.set([1, 2]);
        return Promise.resolve(2);
      }
      return Promise.resolve(null);
    },
  };
  const partialEof = await assertRejects(
    () =>
      IoUtil.readExactly(partialReader, new Uint8Array(4), {
        allowCleanEof: true,
      }),
    UnexpectedEofError,
  );
  assertEquals(partialEof.bytesRead, 2);
  assertEquals(partialEof.expectedBytes, 4);
});

Deno.test('IoUtil.readExactly - rejects invalid read counts with details', async () => {
  for (const count of [0, -1, 1.5, 4]) {
    const error = await assertRejects(
      () =>
        IoUtil.readExactly(
          { read: (_: Uint8Array) => Promise.resolve(count) },
          new Uint8Array(3),
        ),
      InvalidByteCountError,
    );
    assertEquals(error.name, 'InvalidByteCountError');
    assertEquals(error.operation, 'read');
    assertEquals(error.count, count);
    assertEquals(error.maximum, 3);
  }
});

Deno.test('IoUtil.readExactly - empty target does not call reader', async () => {
  let calls = 0;
  const reader = {
    read: (_: Uint8Array) => {
      calls++;
      return Promise.resolve(null);
    },
  };
  assertEquals(await IoUtil.readExactly(reader, new Uint8Array()), true);
  assertEquals(calls, 0);
});

Deno.test('IoUtil.writeAll - completes partial writes', async () => {
  const output: number[] = [];
  const writer = {
    write: (data: Uint8Array) => {
      const count = Math.min(2, data.length);
      output.push(...data.subarray(0, count));
      return Promise.resolve(count);
    },
  };
  await IoUtil.writeAll(writer, new Uint8Array([1, 2, 3, 4, 5]));
  assertEquals(output, [1, 2, 3, 4, 5]);
});

Deno.test('IoUtil.writeAll - rejects invalid write counts with details', async () => {
  for (const count of [0, -1, 4, 1.5]) {
    const error = await assertRejects(
      () => IoUtil.writeAll({ write: () => Promise.resolve(count) }, new Uint8Array([1, 2, 3])),
      InvalidByteCountError,
    );
    assertEquals(error.name, 'InvalidByteCountError');
    assertEquals(error.operation, 'write');
    assertEquals(error.count, count);
    assertEquals(error.maximum, 3);
  }
});

Deno.test('IoUtil propagates reader and writer errors unchanged', async () => {
  const readError = new Error('read failed');
  const actualReadError = await assertRejects(() =>
    IoUtil.readExactly(
      { read: (_: Uint8Array) => Promise.reject(readError) },
      new Uint8Array(1),
    )
  );
  assertEquals(actualReadError, readError);

  const writeError = new Error('write failed');
  const actualWriteError = await assertRejects(() =>
    IoUtil.writeAll(
      { write: (_: Uint8Array) => Promise.reject(writeError) },
      new Uint8Array(1),
    )
  );
  assertEquals(actualWriteError, writeError);
});
