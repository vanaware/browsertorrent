import { assertEquals, assertThrows } from '@std/assert';
import { BytesUtil } from '../../mod.ts';

Deno.test('test Unit8Array xor', () => {
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3])),
    Uint8Array.from([0, 0, 0]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 4])),
    Uint8Array.from([0, 0, 7]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3, 4])),
    Uint8Array.from([0, 0, 0]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([1, 2, 3])),
    Uint8Array.from([0, 0, 0]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3, 4])),
    Uint8Array.from([0, 0, 0]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([1, 2, 3])),
    Uint8Array.from([0, 0, 0]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([1, 2, 3, 4])),
    Uint8Array.from([0, 0, 0, 0]),
  );
  assertEquals(
    BytesUtil.xor(Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([1, 2, 3, 5])),
    Uint8Array.from([0, 0, 0, 1]),
  );
});

Deno.test('test distance', () => {
  assertEquals(Uint8Array.from([1, 1, 1, 1]) > Uint8Array.from([1, 1, 1, 2]), false);
  assertEquals(Uint8Array.from([1, 1, 1, 1]) > Uint8Array.from([1, 1, 1]), true);
});

Deno.test('BytesUtil rejects lossy byte and binary-string conversions', () => {
  assertThrows(() => BytesUtil.xor(256, 1), RangeError);
  assertThrows(() => BytesUtil.int2Bytes(-1), RangeError);
  assertThrows(() => BytesUtil.int2Bytes(1.5), RangeError);
  assertThrows(() => BytesUtil.binStr2Bytes('101'), RangeError);
  assertThrows(() => BytesUtil.binStr2Bytes('0000000x'), TypeError);
  assertThrows(() => BytesUtil.bytes2Int(new Uint8Array(7)), RangeError);
  assertThrows(() => BytesUtil.chunkBytes(new Uint8Array(1), 1.5), RangeError);
});

Deno.test('BytesUtil preserves exact byte conversions', () => {
  assertEquals(BytesUtil.binStr2Bytes('0000000011111111'), new Uint8Array([0, 255]));
  assertEquals(
    BytesUtil.bytes2Int(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff])),
    0xffffffffffff,
  );
  assertEquals(BytesUtil.bytes2Int(new Uint8Array()), 0);
});

Deno.test('BytesUtil converts larger binary strings without changing bytes', () => {
  const source = Uint8Array.from({ length: 4096 }, (_, index) => index % 256);
  const binary = BytesUtil.bytes2BinStr(source);
  assertEquals(binary.length, source.length * 8);
  assertEquals(BytesUtil.binStr2Bytes(binary), source);
});

Deno.test('BytesUtil converts unsigned big-endian bigint values', () => {
  const maxUint64 = 0xffffffffffffffffn;
  assertEquals(BytesUtil.bytes2BigInt(new Uint8Array()), 0n);
  assertEquals(
    BytesUtil.bytes2BigInt(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])),
    maxUint64,
  );
  assertEquals(BytesUtil.bigInt2Bytes(0n), new Uint8Array([0]));
  assertEquals(
    BytesUtil.bigInt2Bytes(maxUint64),
    new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
  );
  assertEquals(BytesUtil.bigInt2Bytes(1n, 4), new Uint8Array([0, 0, 0, 1]));
  assertEquals(BytesUtil.bigInt2Bytes(0n, 0), new Uint8Array());
  assertThrows(() => BytesUtil.bigInt2Bytes(-1n), RangeError);
  assertThrows(() => BytesUtil.bigInt2Bytes(1n, -1), RangeError);
  assertThrows(() => BytesUtil.bigInt2Bytes(256n, 1), RangeError);
});

Deno.test('BytesUtil concatenates byte arrays without aliasing inputs', () => {
  const first = new Uint8Array([1, 2]);
  const result = BytesUtil.concat(first, new Uint8Array(), new Uint8Array([3]));
  assertEquals(result, new Uint8Array([1, 2, 3]));
  first[0] = 9;
  assertEquals(result, new Uint8Array([1, 2, 3]));
  assertEquals(BytesUtil.concat(), new Uint8Array());
});

Deno.test('BytesUtil compares byte arrays lexicographically', () => {
  assertEquals(BytesUtil.equals(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assertEquals(BytesUtil.equals(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assertEquals(BytesUtil.equals(new Uint8Array([1]), new Uint8Array([1, 0])), false);
  assertEquals(BytesUtil.compare(new Uint8Array([1, 2]), new Uint8Array([1, 3])), -1);
  assertEquals(BytesUtil.compare(new Uint8Array([1, 3]), new Uint8Array([1, 2])), 1);
  assertEquals(BytesUtil.compare(new Uint8Array([1]), new Uint8Array([1, 0])), -1);
  assertEquals(BytesUtil.compare(new Uint8Array([1, 2]), new Uint8Array([1, 2])), 0);
});
