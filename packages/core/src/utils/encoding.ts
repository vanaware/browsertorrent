/**
 * Encoding and validation utilities for Base32, Base64, hexadecimal, and SHA-1 identifiers.
 * Adapted from deno-torrent/toolkit/encoding/encode_util.ts.
 * Pure TypeScript — no external @std/encoding dependencies.
 */

// ---------------------------------------------------------------------------
// Base64 (browser btoa/atob)
// ---------------------------------------------------------------------------

/** Encode a Uint8Array to a Base64 string (no line breaks). */
export function encodeBase64(data: Uint8Array): string {
  // btoa expects a binary string; build one from the byte values.
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}

/** Decode a Base64 string into a Uint8Array. */
export function decodeBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Base32 (RFC 4648)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode a Uint8Array to a Base32 string (RFC 4648, with padding). */
export function encodeBase32(data: Uint8Array): string {
  if (data.length === 0) return "";

  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!;
  }

  // Pad to a multiple of 8 characters
  const padLen = (8 - (output.length % 8)) % 8;
  for (let i = 0; i < padLen; i++) {
    output += "=";
  }

  return output;
}

/** Decode a Base32 string (RFC 4648, with or without padding) into a Uint8Array. */
export function decodeBase32(str: string): Uint8Array {
  const cleaned = str.replace(/=+$/, "").toUpperCase();
  if (cleaned.length === 0) return new Uint8Array(0);

  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    lookup.set(BASE32_ALPHABET[i]!, i);
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    const val = lookup.get(ch);
    if (val === undefined) {
      throw new TypeError(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

const HEX_TABLE = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/** Encode a Uint8Array to a lowercase hexadecimal string. */
export function encodeHex(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i++) {
    out += HEX_TABLE[data[i]!]!;
  }
  return out;
}

/** Decode a hexadecimal string into a Uint8Array. */
export function decodeHex(str: string): Uint8Array {
  if (str.length % 2 !== 0) {
    throw new TypeError("Invalid hex string: length must be even");
  }
  const bytes = new Uint8Array(str.length / 2);
  for (let i = 0; i < str.length; i += 2) {
    const hi = parseInt(str[i]!, 16);
    const lo = parseInt(str[i + 1]!, 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) {
      throw new TypeError(`Invalid hex character at position ${i}`);
    }
    bytes[i >> 1] = (hi << 4) | lo;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** Check whether a string is a valid Base32 encoding (RFC 4648, with or without padding). */
export function isBase32(str: string): boolean {
  if (str.length === 0 || !/^[A-Za-z2-7]+={0,6}$/.test(str)) return false;

  const paddingLength = str.length - str.replace(/=+$/, "").length;
  const dataLength = str.length - paddingLength;
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

/** Check whether a string is a valid hexadecimal encoding. */
export function isHex(str: string): boolean {
  if (str.length === 0) return false;
  return /^[0-9a-fA-F]+$/.test(str);
}

/**
 * Check whether a Uint8Array is a SHA-1 hash (exactly 20 bytes).
 */
export function isSha1(data: Uint8Array): boolean {
  return data.length === 20;
}
