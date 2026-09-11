import { assertEquals, assertThrows } from '@std/assert';
import { DEFAULT_MAX_BUFFER_CAPACITY, SimpleBuffer } from '../../mod.ts';

Deno.test('SimpleBuffer - write and readBytes', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3, 4]));
  assertEquals(buf.length, 4);
  assertEquals(buf.readBytes(2), new Uint8Array([1, 2]));
  assertEquals(buf.length, 2);
  assertEquals(buf.readBytes(2), new Uint8Array([3, 4]));
  assertEquals(buf.length, 0);
});

Deno.test('SimpleBuffer - readByte', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([10, 20, 30]));
  assertEquals(buf.readByte(), 10);
  assertEquals(buf.readByte(), 20);
  assertEquals(buf.readByte(), 30);
  assertEquals(buf.hasNext(), false);
});

Deno.test('SimpleBuffer - readBytes(0) returns empty', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1]));
  assertEquals(buf.readBytes(0), new Uint8Array(0));
  assertEquals(buf.length, 1); // not consumed
});

Deno.test('SimpleBuffer - throws on read from empty buffer', () => {
  const buf = new SimpleBuffer();
  assertThrows(() => buf.readByte(), RangeError);
  assertThrows(() => buf.readBytes(1), RangeError);
});

Deno.test('SimpleBuffer - throws when reading more than available', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2]));
  assertThrows(() => buf.readBytes(3), RangeError);
});

Deno.test('SimpleBuffer - throws on negative len', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1]));
  assertThrows(() => buf.readBytes(-1), RangeError);
});

Deno.test('SimpleBuffer - rejects non-integer lengths', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2]));
  assertThrows(() => buf.readBytes(1.5), RangeError);
  assertThrows(() => buf.readBytes(Number.NaN), RangeError);
  assertThrows(() => buf.readBytes(Number.POSITIVE_INFINITY), RangeError);
});

Deno.test('SimpleBuffer - enforces configured capacity without losing data', () => {
  assertThrows(() => new SimpleBuffer({ maxCapacity: 0 }), RangeError);
  assertEquals(DEFAULT_MAX_BUFFER_CAPACITY, 16 * 1024 * 1024);

  const buf = new SimpleBuffer({ maxCapacity: 4 });
  buf.write(new Uint8Array([1, 2, 3, 4]));
  assertThrows(() => buf.write(new Uint8Array([5])), RangeError);
  assertEquals(buf.readBytes(4), new Uint8Array([1, 2, 3, 4]));
});

Deno.test('SimpleBuffer - hasNext', () => {
  const buf = new SimpleBuffer();
  assertEquals(buf.hasNext(), false);
  buf.write(new Uint8Array([42]));
  assertEquals(buf.hasNext(), true);
  buf.readByte();
  assertEquals(buf.hasNext(), false);
});

Deno.test('SimpleBuffer - reset', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2, 3]));
  buf.reset();
  assertEquals(buf.length, 0);
  assertEquals(buf.hasNext(), false);
  // can write again after reset
  buf.write(new Uint8Array([99]));
  assertEquals(buf.readByte(), 99);
});

Deno.test('SimpleBuffer - grows automatically', () => {
  const buf = new SimpleBuffer();
  // Write well beyond the initial 64-byte capacity
  const large = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) large[i] = i & 0xff;
  buf.write(large);
  assertEquals(buf.length, 1024);
  assertEquals(buf.readBytes(1024), large);
});

Deno.test('SimpleBuffer - multiple writes then reads', () => {
  const buf = new SimpleBuffer();
  buf.write(new Uint8Array([1, 2]));
  buf.write(new Uint8Array([3, 4]));
  buf.write(new Uint8Array([5]));
  assertEquals(buf.length, 5);
  assertEquals(buf.readBytes(5), new Uint8Array([1, 2, 3, 4, 5]));
});

Deno.test('SimpleBuffer - interleaved writes and reads compact internally', () => {
  const buf = new SimpleBuffer();
  // Fill enough to cause compaction on the next grow
  for (let i = 0; i < 10; i++) {
    buf.write(new Uint8Array(10).fill(i));
    buf.readBytes(10);
  }
  assertEquals(buf.length, 0);
});
