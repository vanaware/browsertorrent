import { decodeBase32, encodeBase32 } from '@std/encoding/base32';
import { decodeBase64, encodeBase64 } from '@std/encoding/base64';
import { decodeHex, encodeHex } from '@std/encoding/hex';

/**
 * check is base64 string
 * @param value
 */
function isBase64Str(value: string): boolean {
  if (value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;

  const paddingLength = value.length - value.replace(/=+$/, '').length;
  const dataLength = value.length - paddingLength;
  const remainder = dataLength % 4;
  const expectedPadding = remainder === 2 ? 2 : remainder === 3 ? 1 : 0;
  return (remainder === 0 || remainder === 2 || remainder === 3) &&
    (paddingLength === 0 || paddingLength === expectedPadding);
}

/**
 * check is hex string
 * @param value
 */
function isHexStr(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  return /^[0-9a-fA-F]+$/.test(value);
}

/**
 * check is base32 string
 * @param value
 */
function isBase32Str(value: string): boolean {
  if (value.length === 0 || !/^[A-Z2-7]+={0,6}$/i.test(value)) return false;

  const paddingLength = value.length - value.replace(/=+$/, '').length;
  const dataLength = value.length - paddingLength;
  const remainder = dataLength % 8;
  const expectedPadding = new Map([
    [0, 0],
    [2, 6],
    [4, 4],
    [5, 3],
    [7, 1],
  ]).get(remainder);

  return expectedPadding !== undefined &&
    (paddingLength === 0 || paddingLength === expectedPadding);
}

/**
 * check is sha1 hex string
 * e.g. magnet:?xt=urn:btih:7f3c78907acced299d059b2af1b67c2550dbd429
 * @param hash
 * @returns
 */
function isSha1HexStr(hash: string): boolean {
  return hash.length === 40 && isHexStr(hash);
}

/**
 * check is sha1 base32 string
 *
 * e.g. magnet:?xt=urn:sha1:YNCKHTQCWBTRNJIV4WNAE52SJUQCZO5C
 * @param hash
 * @returns
 */
function isSha1Base32Str(hash: string): boolean {
  return hash.length === 32 && isBase32Str(hash);
}

/** Encoding and validation utilities for Base32, Base64, hexadecimal, and SHA-1 identifiers. */
const EncodeUtil = {
  isBase32Str,
  isBase64Str,
  isHexStr,
  isSha1Base32Str,
  isSha1HexStr,
  encodeBase32,
  decodeBase32,
  encodeBase64,
  decodeBase64,
  encodeHex,
  decodeHex,
};

export { EncodeUtil };
