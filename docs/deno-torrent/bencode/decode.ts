/** Bencode 2.0 decoder. */

import {
  BencodeDecodeError,
  type BencodeDict,
  type BencodeKey,
  type BencodeList,
  type BencodeValue,
} from "./types.ts";

const _tdFatal = new TextDecoder("utf-8", { fatal: true });
const _tdLossy = new TextDecoder("utf-8");
const _te = new TextEncoder();
const _defaultMaxDecodeBytes = 64 * 1024 * 1024;
const _defaultMaxDepth = 1000;

/** Resource limits applied while decoding untrusted input. */
export interface DecodeOptions {
  /** Maximum accepted input size. Defaults to 64 MiB. */
  maxBytes?: number;
  /** Maximum nested list/dictionary depth. Defaults to 1000. */
  maxDepth?: number;
  /**
   * Accept dictionary keys that are not sorted by their raw bytes.
   *
   * Defaults to `false`. Enable only for compatibility with known protocol
   * implementations that produce non-canonical dictionaries. Duplicate keys
   * and all other malformed input are still rejected.
   */
  allowUnsortedKeys?: boolean;
}

/**
 * Decode one complete Bencode value. By default, the input must be canonical;
 * `allowUnsortedKeys` may be enabled for compatibility with implementations
 * that emit non-canonical dictionary ordering.
 *
 * Valid UTF-8 byte strings become strings. Invalid UTF-8 strings and binary
 * dictionary keys remain `Uint8Array` values.
 *
 * @throws {BencodeDecodeError} If the input is malformed, non-canonical, or exceeds a limit.
 */
export function decode(
  data: Uint8Array,
  options: DecodeOptions = {},
): BencodeValue {
  const maxBytes = options.maxBytes ?? _defaultMaxDecodeBytes;
  const maxDepth = options.maxDepth ?? _defaultMaxDepth;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new BencodeDecodeError(
      "maxBytes must be a non-negative safe integer",
    );
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new BencodeDecodeError(
      "maxDepth must be a non-negative safe integer",
    );
  }
  if (data.length > maxBytes) {
    throw new BencodeDecodeError(
      `input exceeds maximum size of ${maxBytes} bytes`,
    );
  }

  const [value, nextOffset] = _decodeOne(
    data,
    maxDepth,
    options.allowUnsortedKeys === true,
  );
  if (nextOffset !== data.length) {
    throw new BencodeDecodeError(
      `unexpected trailing data at offset ${nextOffset}`,
    );
  }
  return value;
}

type _Frame = _ListFrame | _DictFrame;

interface _ListFrame {
  kind: "list";
  value: BencodeList;
}

interface _DictFrame {
  kind: "dict";
  value: BencodeDict;
  seenKeys: Set<string>;
  previousKeyBytes?: Uint8Array;
  pendingKey?: BencodeKey;
}

function _decodeOne(
  data: Uint8Array,
  maxDepth: number,
  allowUnsortedKeys: boolean,
): [BencodeValue, number] {
  const stack: _Frame[] = [];
  let offset = 0;
  let current: BencodeValue | undefined;

  while (true) {
    if (current !== undefined) {
      if (stack.length === 0) return [current, offset];

      const frame = stack[stack.length - 1];
      if (frame.kind === "list") {
        frame.value.push(current);
      } else if (frame.pendingKey !== undefined) {
        frame.value.set(frame.pendingKey, current);
        frame.pendingKey = undefined;
      } else {
        throw new BencodeDecodeError("dictionary value has no key");
      }
      current = undefined;
      continue;
    }

    if (offset >= data.length) {
      throw new BencodeDecodeError(
        `unexpected end of data at offset ${offset}`,
      );
    }

    const frame = stack[stack.length - 1];
    if (frame?.kind === "list" && data[offset] === 0x65) {
      offset++;
      stack.pop();
      current = frame.value;
      continue;
    }
    if (frame?.kind === "dict") {
      if (frame.pendingKey === undefined) {
        if (data[offset] === 0x65) {
          offset++;
          stack.pop();
          current = frame.value;
          continue;
        }

        const [key, afterKey] = _decodeByteString(data, offset);
        const keyBytes = typeof key === "string" ? _te.encode(key) : key;
        const fingerprint = _toHex(keyBytes);
        if (frame.seenKeys.has(fingerprint)) {
          throw new BencodeDecodeError("duplicate dictionary key");
        }
        if (
          !allowUnsortedKeys &&
          frame.previousKeyBytes &&
          _compareBytes(frame.previousKeyBytes, keyBytes) > 0
        ) {
          throw new BencodeDecodeError(
            "dictionary keys are not sorted by raw bytes",
          );
        }
        frame.seenKeys.add(fingerprint);
        frame.previousKeyBytes = keyBytes;
        frame.pendingKey = key;
        offset = afterKey;
        continue;
      }
    }

    const token = data[offset];
    if (token === 0x69) {
      [current, offset] = _decodeInteger(data, offset + 1);
      continue;
    }
    if (token >= 0x30 && token <= 0x39) {
      [current, offset] = _decodeByteString(data, offset);
      continue;
    }
    if (token === 0x6c || token === 0x64) {
      if (stack.length > maxDepth) {
        throw new BencodeDecodeError(
          `maximum nesting depth of ${maxDepth} exceeded`,
        );
      }
      offset++;
      if (token === 0x6c) {
        stack.push({ kind: "list", value: [] });
      } else {
        stack.push({ kind: "dict", value: new Map(), seenKeys: new Set() });
      }
      continue;
    }
    throw new BencodeDecodeError(
      `unexpected token 0x${
        token.toString(16).padStart(2, "0")
      } at offset ${offset}`,
    );
  }
}

function _decodeInteger(data: Uint8Array, offset: number): [number, number] {
  const end = data.indexOf(0x65, offset);
  if (end === -1) {
    throw new BencodeDecodeError('unterminated integer: missing "e"');
  }
  const raw = _tdLossy.decode(data.subarray(offset, end));
  if (!/^-?(?:0|[1-9]\d*)$/.test(raw) || raw === "-0") {
    throw new BencodeDecodeError(`invalid integer: "${raw}"`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new BencodeDecodeError(`integer outside safe range: "${raw}"`);
  }
  return [value, end + 1];
}

function _decodeByteString(
  data: Uint8Array,
  offset: number,
): [string | Uint8Array, number] {
  const colon = data.indexOf(0x3a, offset);
  if (colon === -1) {
    throw new BencodeDecodeError('malformed byte string: missing ":"');
  }
  const rawLength = data.subarray(offset, colon);
  if (
    rawLength.length === 0 ||
    rawLength.some((byte) => byte < 0x30 || byte > 0x39)
  ) {
    throw new BencodeDecodeError(
      `invalid byte string length at offset ${offset}`,
    );
  }
  if (rawLength.length > 1 && rawLength[0] === 0x30) {
    throw new BencodeDecodeError(
      `byte string length has leading zero at offset ${offset}`,
    );
  }
  const length = Number(_tdLossy.decode(rawLength));
  if (!Number.isSafeInteger(length)) {
    throw new BencodeDecodeError(
      `byte string length is outside safe range at offset ${offset}`,
    );
  }

  const start = colon + 1;
  const end = start + length;
  if (end > data.length) {
    throw new BencodeDecodeError(
      `truncated byte string: need ${length} bytes but only ${
        data.length - start
      } available`,
    );
  }
  const bytes = data.subarray(start, end);
  try {
    return [_tdFatal.decode(bytes), end];
  } catch {
    return [bytes.slice(), end];
  }
}

function _toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function _compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}
