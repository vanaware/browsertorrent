import { assertEquals, assertThrows } from '@std/assert';
import {
  DEFAULT_MAX_BUFFER_CAPACITY,
  SimpleBuffer,
} from '../src/utils/simple-buffer.ts';

// ---------------------------------------------------------------------------
// write + read
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — write then readBytes', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([10, 20, 30]));
  assertEquals(buf.length, 3);
  const out = buf.readBytes(3);
  assertEquals(out, new Uint8Array([10, 20, 30]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — readByte', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([42, 99]));
  assertEquals(buf.readByte(), 42);
  assertEquals(buf.readByte(), 99);
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — readBytes(0) returns empty', () => {
  const buf = new SimpleBuffer();
  assertEquals(buf.readBytes(0), new Uint8Array(0));
});

Deno.test('SimpleBuffer — readByte on empty buffer throws', () => {
  const buf = new SimpleBuffer();
  assertThrows(() => buf.readByte(), RangeError);
});

Deno.test('SimpleBuffer — readBytes beyond length throws', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1]));
  assertThrows(() => buf.readBytes(5), RangeError);
});

Deno.test('SimpleBuffer — readBytes with negative len throws', () => {
  const buf = new SimpleBuffer();
  assertThrows(() => buf.readBytes(-1), RangeError);
});

// ---------------------------------------------------------------------------
// cursor positioning (interleaved read/write)
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — interleaved write and read', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3, 4, 5]));
  assertEquals(buf.readBytes(2), new Uint8Array([1, 2]));
  assertEquals(buf.length, 3);

  buf.write(new Uint8Array([6, 7]));
  assertEquals(buf.length, 5);
  assertEquals(buf.readBytes(3), new Uint8Array([3, 4, 5]));
  assertEquals(buf.readBytes(2), new Uint8Array([6, 7]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — hasNext reflects state', () => {
  const buf = new SimpleBuffer();
  assertEquals(buf.hasNext(), false);
  buf.write(new Uint8Array([1]));
  assertEquals(buf.hasNext(), true);
  buf.readByte();
  assertEquals(buf.hasNext(), false);
});

// ---------------------------------------------------------------------------
// grow
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — grow beyond initial backing capacity', () => {
  const buf = new SimpleBuffer();
  // Initial backing is 64 bytes; write 128 bytes to force reallocation.
  const data = new Uint8Array(128);
  for (let i = 0; i < 128; i++) data[i] = i;
  buf.write(data);
  assertEquals(buf.length, 128);
  const out = buf.readBytes(128);
  for (let i = 0; i < 128; i++) {
    assertEquals(out[i], i);
  }
});

Deno.test('SimpleBuffer — grow respects maxCapacity', () => {
  const buf = new SimpleBuffer({ maxCapacity: 8 });
  buf.write(new Uint8Array([1, 2, 3, 4]));
  assertThrows(() => buf.write(new Uint8Array(5)), RangeError);
});

Deno.test('SimpleBuffer — public grow() ensures space', () => {
  const buf = new SimpleBuffer();
  buf.grow(200);
  // Writing 200 bytes should succeed without reallocation overhead.
  const data = new Uint8Array(200);
  buf.write(data);
  assertEquals(buf.length, 200);
});

Deno.test('SimpleBuffer — constructor rejects invalid maxCapacity', () => {
  assertThrows(() => new SimpleBuffer({ maxCapacity: 0 }), RangeError);
  assertThrows(() => new SimpleBuffer({ maxCapacity: -1 }), RangeError);
  assertThrows(() => new SimpleBuffer({ maxCapacity: 1.5 }), RangeError);
});

Deno.test('SimpleBuffer — default maxCapacity', () => {
  assertEquals(DEFAULT_MAX_BUFFER_CAPACITY, 16 * 1024 * 1024);
});

// ---------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — compact reclaims read space', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  // Consume first 6 bytes — readPos advances to 6.
  buf.readBytes(6);
  assertEquals(buf.length, 2);

  // compact() should shift remaining bytes to front.
  buf.compact();
  // After compact, reading the remaining 2 bytes should still work.
  assertEquals(buf.readBytes(2), new Uint8Array([7, 8]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer — compact is a no-op when readPos is 0', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3]));
  buf.compact(); // Should not change anything.
  assertEquals(buf.length, 3);
  assertEquals(buf.readBytes(3), new Uint8Array([1, 2, 3]));
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

Deno.test('SimpleBuffer — reset clears all data', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3]));
  buf.reset();
  assertEquals(buf.length, 0);
  assertEquals(buf.hasNext(), false);
});
