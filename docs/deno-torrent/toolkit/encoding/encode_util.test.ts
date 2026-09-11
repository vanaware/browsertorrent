import { assertEquals } from '@std/assert';
import { EncodeUtil } from './encode_util.ts';

Deno.test('test EncodeUtil.isBase64Str', () => {
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybGQz'), true);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybGQ='), true);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybA=='), true);
  assertEquals(EncodeUtil.isBase64Str('AAA'), true);

  assertEquals(EncodeUtil.isBase64Str('29ybGQ='), false);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybGQ'), true);
  assertEquals(EncodeUtil.isBase64Str('SGVsbG8gd29ybGQ'), true);
  assertEquals(EncodeUtil.isBase64Str('hello world'), false);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybGQ=='), false);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybGQ===='), false);
  assertEquals(EncodeUtil.isBase64Str('SGVsbG8gd29ybGQ===='), false);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybA'), true);
  assertEquals(EncodeUtil.isBase64Str('aGVsbG8gd29ybGQ'), true);
  assertEquals(EncodeUtil.isBase64Str('1234567890'), true);
  assertEquals(EncodeUtil.isBase64Str('AA='), false);
  assertEquals(EncodeUtil.isBase64Str('A==='), false);
  assertEquals(EncodeUtil.isBase64Str(''), false);
});

Deno.test('test EncodeUtil.isHexStr', () => {
  assertEquals(EncodeUtil.isHexStr('0123456789abcdefABCDEF'), true);
  assertEquals(EncodeUtil.isHexStr('ff'), true);

  assertEquals(EncodeUtil.isHexStr('0123456789abcdefABCDEz'), false);
  assertEquals(EncodeUtil.isHexStr('0123456789abcdefABCDE/'), false);
  assertEquals(EncodeUtil.isHexStr(''), false);
});

Deno.test('test EncodeUtil.isBase32Str', () => {
  assertEquals(EncodeUtil.isBase32Str('NBSWY3DPEB3W64TMMQ======'), true);
  assertEquals(EncodeUtil.isBase32Str('NBSWY3DP'), true);
  assertEquals(EncodeUtil.isBase32Str('NBSWY3DPGEYTCMI='), true);
  assertEquals(EncodeUtil.isBase32Str('NBSWY3DPGEYTCMIs'), true);

  assertEquals(EncodeUtil.isBase32Str('NBSWY3DPGEYTCMI=s'), false);
  assertEquals(EncodeUtil.isBase32Str('NBSWY3DPGEYTCM/'), false);
  assertEquals(EncodeUtil.isBase32Str('A'), false);
  assertEquals(EncodeUtil.isBase32Str('ABC='), false);
  assertEquals(EncodeUtil.isBase32Str('MY====='), false);
  assertEquals(EncodeUtil.isBase32Str(''), false);
});

Deno.test('test EncodeUtil.isSha1HexStr', () => {
  assertEquals(EncodeUtil.isSha1HexStr('9A8B7C6D5E4F3A2B1C0D9E8F7A6B5C4D3E2F1A0B'), true);
  assertEquals(EncodeUtil.isSha1HexStr('5F4E3D2C1B0A9998B7C6D5E4F3A2B1C0D9E8F7AC'), true);
  assertEquals(EncodeUtil.isSha1HexStr('0B1C2D3E4F5A69788190A2B3C4D5E6F708192A3D'), true);
  assertEquals(EncodeUtil.isSha1HexStr('A3B4C5D6E7F8A9B8C7D6E5F4A3B2C1D0E9F8A7BC'), true);
  assertEquals(EncodeUtil.isSha1HexStr('2B1C0D9E8FA7B6C5D4E3F2A1B0C9D8E7F6A5B4CE'), true);
  assertEquals(EncodeUtil.isSha1HexStr('D5E6F708192A3B4C5D6E7F8A9B8C7D6E5F4A3B2F'), true);

  assertEquals(EncodeUtil.isSha1HexStr('012345asd67d89as4cda12defA1sBCx2Dsk5a2EF'), false);
  assertEquals(EncodeUtil.isSha1HexStr('ff'), false);
  assertEquals(EncodeUtil.isSha1HexStr('0123456789abcdefABCDEz'), false);
  assertEquals(EncodeUtil.isSha1HexStr('0123456789abcdefABCDE/'), false);
  assertEquals(EncodeUtil.isSha1HexStr(''), false);
});
