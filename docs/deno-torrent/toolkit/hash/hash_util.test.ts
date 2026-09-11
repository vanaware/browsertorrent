import { assertEquals } from '@std/assert';
import { HashUtil } from '../../mod.ts';

// Known digests computed via independent reference implementations
const HELLO = 'hello';
const HELLO_SHA1 = 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d';
const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const HELLO_SHA512 =
  '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043';
const HELLO_MD5 = '5d41402abc4b2a76b9719d911017c592';

// --- SHA-1 ---

Deno.test('HashUtil.sha1 - string input', async () => {
  const digest = await HashUtil.sha1(HELLO);
  assertEquals(HashUtil.toHex(digest), HELLO_SHA1);
  assertEquals(digest.length, 20);
});

Deno.test('HashUtil.sha1 - Uint8Array input', async () => {
  const bytes = new TextEncoder().encode(HELLO);
  const digest = await HashUtil.sha1(bytes);
  assertEquals(HashUtil.toHex(digest), HELLO_SHA1);
});

Deno.test('HashUtil.sha1 - empty input', async () => {
  // SHA1('') = da39a3ee5e6b4b0d3255bfef95601890afd80709
  const digest = await HashUtil.sha1('');
  assertEquals(HashUtil.toHex(digest), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
});

Deno.test('HashUtil.createSha1 - NIST vectors and chunk boundaries', () => {
  const vectors = [
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    ],
  ];
  const encoder = new TextEncoder();
  for (const [input, expected] of vectors) {
    const bytes = encoder.encode(input);
    for (const boundary of [1, 2, 7, 63, 64, 65]) {
      const hasher = HashUtil.createSha1();
      for (let offset = 0; offset < bytes.length; offset += boundary) {
        hasher.update(bytes.subarray(offset, offset + boundary));
      }
      assertEquals(HashUtil.toHex(hasher.digest()), expected, `boundary ${boundary}`);
    }
  }
});

Deno.test('HashUtil.createSha1 - digest is repeatable and update remains valid', () => {
  const hasher = HashUtil.createSha1().update(new TextEncoder().encode('hello'));
  assertEquals(HashUtil.toHex(hasher.digest()), HELLO_SHA1);
  assertEquals(HashUtil.toHex(hasher.digest()), HELLO_SHA1);
  hasher.update(new TextEncoder().encode(' world'));
  assertEquals(HashUtil.toHex(hasher.digest()), '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
  assertEquals(hasher.bytesHashed, 11n);
  hasher.reset();
  assertEquals(hasher.bytesHashed, 0n);
  assertEquals(HashUtil.toHex(hasher.digest()), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
});

Deno.test('HashUtil.createSha1 - NIST one million a vector without whole input allocation', () => {
  const hasher = HashUtil.createSha1();
  const chunk = new Uint8Array(1000).fill(0x61);
  for (let i = 0; i < 1000; i++) hasher.update(chunk);
  assertEquals(HashUtil.toHex(hasher.digest()), '34aa973cd4c4daa4f61eeb2bdbad27316534016f');
  assertEquals(hasher.bytesHashed, 1_000_000n);
});

Deno.test('HashUtil.createSha1 - bytesHashed uses bigint above 32-bit counts', () => {
  const hasher = HashUtil.createSha1();
  // Simulate a large typed-array view without allocating its backing storage.
  // Real large pieces are supplied as repeated fixed-size chunks.
  class LargeView extends Uint8Array {
    override get byteLength(): number {
      return 2 ** 32;
    }
  }
  hasher.update(new LargeView(0));
  assertEquals(hasher.bytesHashed, 4_294_967_296n);
});

// --- SHA-256 ---

Deno.test('HashUtil.sha256 - string input', async () => {
  const digest = await HashUtil.sha256(HELLO);
  assertEquals(HashUtil.toHex(digest), HELLO_SHA256);
  assertEquals(digest.length, 32);
});

Deno.test('HashUtil.sha256 - Uint8Array input', async () => {
  const bytes = new TextEncoder().encode(HELLO);
  const digest = await HashUtil.sha256(bytes);
  assertEquals(HashUtil.toHex(digest), HELLO_SHA256);
});

Deno.test('HashUtil.sha256 - empty input', async () => {
  // SHA256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  const digest = await HashUtil.sha256('');
  assertEquals(
    HashUtil.toHex(digest),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

// --- SHA-512 ---

Deno.test('HashUtil.sha512 - string input', async () => {
  const digest = await HashUtil.sha512(HELLO);
  assertEquals(HashUtil.toHex(digest), HELLO_SHA512);
  assertEquals(digest.length, 64);
});

Deno.test('HashUtil.sha512 - empty input', async () => {
  // SHA512('') = cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e
  const digest = await HashUtil.sha512('');
  assertEquals(
    HashUtil.toHex(digest),
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
  );
});

// --- MD5 ---

Deno.test('HashUtil.md5 - string input', () => {
  assertEquals(HashUtil.toHex(HashUtil.md5(HELLO)), HELLO_MD5);
  assertEquals(HashUtil.md5(HELLO).length, 16);
});

Deno.test('HashUtil.md5 - Uint8Array input', () => {
  const bytes = new TextEncoder().encode(HELLO);
  assertEquals(HashUtil.toHex(HashUtil.md5(bytes)), HELLO_MD5);
});

Deno.test('HashUtil.md5 - empty input', () => {
  // MD5('') = d41d8cd98f00b204e9800998ecf8427e
  assertEquals(HashUtil.toHex(HashUtil.md5('')), 'd41d8cd98f00b204e9800998ecf8427e');
});

Deno.test('HashUtil.md5 - known vectors', () => {
  // "abc"  = 900150983cd24fb0d6963f7d28e17f72
  assertEquals(HashUtil.toHex(HashUtil.md5('abc')), '900150983cd24fb0d6963f7d28e17f72');
  // "The quick brown fox jumps over the lazy dog"
  assertEquals(
    HashUtil.toHex(HashUtil.md5('The quick brown fox jumps over the lazy dog')),
    '9e107d9d372bb6826bd81d3542a419d6',
  );
});

Deno.test('HashUtil.md5 - RFC 1321 padding boundaries', () => {
  const vectors = new Map<number, string>([
    [55, 'ef1772b6dff9a122358552954ad0df65'],
    [56, '3b0c8ac703f828b04c6c197006d17218'],
    [63, 'b06521f39153d618550606be297466d5'],
    [64, '014842d480b571495a4a0363793f7367'],
    [65, 'c743a45e0d2e6a95cb859adae0248435'],
    [127, '020406e1d05cdc2aa287641f7ae2cc39'],
    [128, 'e510683b3f5ffe4093d021808bc6ff70'],
  ]);

  for (const [length, expected] of vectors) {
    assertEquals(HashUtil.toHex(HashUtil.md5('a'.repeat(length))), expected, `length ${length}`);
  }
});

// --- toHex ---

Deno.test('HashUtil.toHex - all bytes', () => {
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  const hex = HashUtil.toHex(all);
  assertEquals(hex.length, 512);
  assertEquals(hex.startsWith('00010203'), true);
  assertEquals(hex.endsWith('fcfdfeff'), true);
});
