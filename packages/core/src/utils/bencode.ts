// /loco/monorepo/webtorrent/src/utils/bencode.ts
/**
 * Bencode codec with resource limits, typed errors, and optional Map support.
 *
 * Adaptado de deno-torrent/bencode/ mantendo compatibilidade com a API
 * existente (BencodeDict = Record, decode sem options, encode aceitando Record).
 *
 * Mudanças em relação ao deno-torrent:
 * - BencodeDict continua Record<string, BencodeValue> (backward compat)
 * - BencodeMap = Map<string | Uint8Array, BencodeValue> (opt-in via useMap)
 * - bigint permanece suportado em decode/encode (deno-torrent só aceita number)
 * - DecodeOptions aceita maxBytes/maxDepth/useMap/allowUnsortedKeys
 */

// ============================================================================
// TIPOS
// ============================================================================

/** Dictionary key: string (UTF-8) or raw bytes (for binary keys). */
export type BencodeKey = string | Uint8Array;

/** Ordered sequence of bencode values. */
export type BencodeList = BencodeValue[];

/**
 * Bencode dictionary as a plain object (backward compatible).
 * Keys are always strings; binary keys are lossily decoded to UTF-8.
 */
export interface BencodeDict {
  [key: string]: BencodeValue;
}

/**
 * Bencode dictionary as a Map (preserves binary keys without lossy conversion).
 * Use via `decode(data, { useMap: true })` when binary key fidelity matters
 * (e.g. metainfo identity preservation per BEP 3).
 */
export type BencodeMap = Map<BencodeKey, BencodeValue>;

/** All values accepted by the encoder and returned by the decoder. */
export type BencodeValue =
  | number
  | bigint
  | string
  | Uint8Array
  | BencodeList
  | BencodeDict
  | BencodeMap;

/** Resource limits applied while decoding untrusted input. */
export interface DecodeOptions {
  /** Maximum accepted input size in bytes. Defaults to 64 MiB (67108864). */
  maxBytes?: number;
  /** Maximum nested list/dictionary depth. Defaults to 1000. */
  maxDepth?: number;
  /**
   * When true, dictionaries are decoded as `Map<string | Uint8Array, BencodeValue>`
   * instead of `Record<string, BencodeValue>`. This preserves binary keys that
   * cannot be losslessly converted to UTF-8 strings.
   */
  useMap?: boolean;
  /**
   * Accept dictionary keys that are not sorted by their raw bytes.
   * Defaults to false. Enable only for compatibility with known protocol
   * implementations that produce non-canonical dictionaries.
   */
  allowUnsortedKeys?: boolean;
}

// ============================================================================
// ERROS
// ============================================================================

/**
 * Thrown when decoding fails due to malformed, truncated, or non-canonical input.
 */
export class BencodeDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeDecodeError";
  }
}

/**
 * Thrown when encoding fails due to an invalid, unsupported, or cyclic value.
 */
export class BencodeEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeEncodeError";
  }
}

// ============================================================================
// DECODE
// ============================================================================

const _td = new TextDecoder("utf-8");
const _te = new TextEncoder();
const _defaultMaxBytes = 64 * 1024 * 1024;
const _defaultMaxDepth = 1000;

export function decode(data: Uint8Array, options: DecodeOptions = {}): BencodeValue {
  const maxBytes = options.maxBytes ?? _defaultMaxBytes;
  const maxDepth = options.maxDepth ?? _defaultMaxDepth;

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new BencodeDecodeError("maxBytes must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new BencodeDecodeError("maxDepth must be a non-negative safe integer");
  }
  if (data.length > maxBytes) {
    throw new BencodeDecodeError(`input exceeds maximum size of ${maxBytes} bytes`);
  }

  const useMap = options.useMap === true;
  const allowUnsortedKeys = options.allowUnsortedKeys === true;

  const [value, nextOffset] = _decodeOne(data, maxDepth, useMap, allowUnsortedKeys);
  if (nextOffset !== data.length) {
    throw new BencodeDecodeError(`unexpected trailing data at offset ${nextOffset}`);
  }
  return value;
}

// --- Internal decode types ---

type _Frame = _ListFrame | _DictFrame;

interface _ListFrame {
  kind: "list";
  value: BencodeValue[];
}

interface _DictFrame {
  kind: "dict";
  value: BencodeDict | BencodeMap;
  seenKeys: Set<string>;
  previousKeyBytes?: Uint8Array;
  pendingKey?: BencodeKey;
  useMap: boolean;
}

function _decodeOne(
  data: Uint8Array,
  maxDepth: number,
  useMap: boolean,
  allowUnsortedKeys: boolean,
): [BencodeValue, number] {
  const stack: _Frame[] = [];
  let offset = 0;
  let current: BencodeValue | undefined;

  while (true) {
    if (current !== undefined) {
      if (stack.length === 0) return [current, offset];

      const frame = stack[stack.length - 1]!;
      if (frame.kind === "list") {
        frame.value.push(current);
      } else if (frame.pendingKey !== undefined) {
        if (frame.useMap) {
          (frame.value as BencodeMap).set(frame.pendingKey, current);
        } else {
          const keyStr = typeof frame.pendingKey === "string"
            ? frame.pendingKey
            : _td.decode(frame.pendingKey);
          (frame.value as BencodeDict)[keyStr] = current;
        }
        frame.pendingKey = undefined;
      } else {
        throw new BencodeDecodeError("dictionary value has no key");
      }
      current = undefined;
      continue;
    }

    if (offset >= data.length) {
      throw new BencodeDecodeError(`unexpected end of data at offset ${offset}`);
    }

    const frame = stack[stack.length - 1];

    // Check for end-of-container tokens
    if (frame?.kind === "list" && data[offset] === 0x65) {
      offset++;
      stack.pop();
      current = frame.value as BencodeList;
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
        // Decode key
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
          throw new BencodeDecodeError("dictionary keys are not sorted by raw bytes");
        }
        frame.seenKeys.add(fingerprint);
        frame.previousKeyBytes = keyBytes;
        frame.pendingKey = key;
        offset = afterKey;
        continue;
      }
    }

    const token = data[offset]!;

    if (token === 0x69) {
      // 'i' — integer
      [current, offset] = _decodeInteger(data, offset + 1);
      continue;
    }
    if (token >= 0x30 && token <= 0x39) {
      // digit — byte string
      [current, offset] = _decodeByteString(data, offset);
      continue;
    }
    if (token === 0x6c || token === 0x64) {
      // 'l' or 'd' — list or dict
      if (stack.length >= maxDepth) {
        throw new BencodeDecodeError(`maximum nesting depth of ${maxDepth} exceeded`);
      }
      offset++;
      if (token === 0x6c) {
        stack.push({ kind: "list", value: [] });
      } else {
        const value = useMap ? new Map() as BencodeMap : {} as BencodeDict;
        stack.push({ kind: "dict", value, seenKeys: new Set(), useMap });
      }
      continue;
    }
    throw new BencodeDecodeError(
      `unexpected token 0x${token.toString(16).padStart(2, "0")} at offset ${offset}`
    );
  }
}

function _decodeInteger(data: Uint8Array, offset: number): [number | bigint, number] {
  const end = data.indexOf(0x65, offset); // 'e'
  if (end === -1) {
    throw new BencodeDecodeError('unterminated integer: missing "e"');
  }
  const raw = _td.decode(data.subarray(offset, end));
  if (!/^-?(?:0|[1-9]\d*)$/.test(raw) || raw === "-0") {
    throw new BencodeDecodeError(`invalid integer: "${raw}"`);
  }
  const num = Number(raw);
  if (Number.isSafeInteger(num)) {
    return [num, end + 1];
  }
  // Fallback to bigint for values outside safe integer range
  return [BigInt(raw), end + 1];
}

function _decodeByteString(
  data: Uint8Array,
  offset: number,
): [string | Uint8Array, number] {
  const colon = data.indexOf(0x3a, offset); // ':'
  if (colon === -1) {
    throw new BencodeDecodeError('malformed byte string: missing ":"');
  }
  const rawLength = data.subarray(offset, colon);
  if (rawLength.length === 0 || rawLength.some((byte) => byte < 0x30 || byte > 0x39)) {
    throw new BencodeDecodeError(`invalid byte string length at offset ${offset}`);
  }
  if (rawLength.length > 1 && rawLength[0] === 0x30) {
    throw new BencodeDecodeError(`byte string length has leading zero at offset ${offset}`);
  }

  const lenStr = _td.decode(rawLength);
  const length = Number(lenStr);
  if (!Number.isSafeInteger(length)) {
    throw new BencodeDecodeError(`byte string length is outside safe range at offset ${offset}`);
  }

  const start = colon + 1;
  const end = start + length;
  if (end > data.length) {
    throw new BencodeDecodeError(
      `truncated byte string: need ${length} bytes but only ${data.length - start} available`
    );
  }
  const bytes = data.subarray(start, end);
  // Heurística BitTorrent: decodifica como string UTF-8 somente se
  // (1) o conteúdo é UTF-8 válido (sem replacement chars) E
  // (2) não contém caracteres de controle (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F),
  //     que são comuns em dados binários como hashes SHA-1 ("pieces").
  // Isso preserva campos como "pieces" como Uint8Array.
  try {
    const str = _td.decode(bytes);
    if (!str.includes("\uFFFD") && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)) {
      return [str, end];
    }
  } catch {
    // UTF-8 inválido — manter como Uint8Array
  }
  return [bytes.slice(), end];
}

// ============================================================================
// ENCODE
// ============================================================================

export function encode(value: BencodeValue): Uint8Array {
  const writer = new _ByteWriter();
  _encodeValue(value, writer, new WeakSet<object>());
  return writer.finish();
}

function _encodeValue(
  value: BencodeValue,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  if (typeof value === "number") {
    _encodeInteger(value, out);
    return;
  }
  if (typeof value === "bigint") {
    out.write(_te.encode(`i${value}e`));
    return;
  }
  if (typeof value === "string") {
    _encodeString(value, out);
    return;
  }
  if (value instanceof Uint8Array) {
    _encodeBytes(value, out);
    return;
  }
  if (Array.isArray(value) || value instanceof Map) {
    if (ancestors.has(value as object)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value as object);
    try {
      if (Array.isArray(value)) _encodeList(value, out, ancestors);
      else _encodeDict(value as BencodeMap, out, ancestors);
    } finally {
      ancestors.delete(value as object);
    }
    return;
  }
  // Plain object (BencodeDict / Record)
  if (typeof value === "object" && value !== null) {
    if (ancestors.has(value)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value);
    try {
      _encodeDictFromRecord(value as BencodeDict, out, ancestors);
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  throw new BencodeEncodeError(`unsupported value type: ${typeof value}`);
}

function _encodeInteger(value: number, out: _ByteWriter): void {
  if (!Number.isSafeInteger(value)) {
    throw new BencodeEncodeError(`only safe integers are supported, got: ${value}`);
  }
  out.write(_te.encode(`i${value}e`));
}

function _encodeString(value: string, out: _ByteWriter): void {
  _encodeBytes(_te.encode(value), out);
}

function _encodeBytes(value: Uint8Array, out: _ByteWriter): void {
  out.write(_te.encode(`${value.length}:`));
  out.write(value);
}

function _encodeList(
  value: BencodeList,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  out.write(_te.encode("l"));
  for (const item of value) _encodeValue(item, out, ancestors);
  out.write(_te.encode("e"));
}

function _encodeDict(
  value: BencodeMap,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  const entries = [...value.entries()].map(([key, item]) => ({
    bytes: _keyBytes(key),
    item,
  }));
  entries.sort((a, b) => _compareBytes(a.bytes, b.bytes));

  out.write(_te.encode("d"));
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && _compareBytes(entries[i - 1]!.bytes, entries[i]!.bytes) === 0) {
      throw new BencodeEncodeError("duplicate dictionary key after byte encoding");
    }
    _encodeBytes(entries[i]!.bytes, out);
    _encodeValue(entries[i]!.item, out, ancestors);
  }
  out.write(_te.encode("e"));
}

function _encodeDictFromRecord(
  value: BencodeDict,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  // Sort keys by byte-raw order (correct per bencode spec), not string order.
  const entries = Object.keys(value).map((key) => ({
    key,
    bytes: _te.encode(key),
    item: value[key],
  }));
  entries.sort((a, b) => _compareBytes(a.bytes, b.bytes));

  out.write(_te.encode("d"));
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && _compareBytes(entries[i - 1]!.bytes, entries[i]!.bytes) === 0) {
      throw new BencodeEncodeError("duplicate dictionary key after byte encoding");
    }
    _encodeBytes(entries[i]!.bytes, out);
    _encodeValue(entries[i]!.item!, out, ancestors);
  }
  out.write(_te.encode("e"));
}

function _keyBytes(key: BencodeKey): Uint8Array {
  if (typeof key === "string") return _te.encode(key);
  if (key instanceof Uint8Array) return key;
  throw new BencodeEncodeError("dictionary keys must be string or Uint8Array");
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function _toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function _compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai !== bi) return ai - bi;
  }
  return a.length - b.length;
}

class _ByteWriter {
  #buffer = new Uint8Array(1024);
  #length = 0;

  write(chunk: Uint8Array): void {
    const required = this.#length + chunk.length;
    if (required > this.#buffer.length) {
      let capacity = this.#buffer.length;
      while (capacity < required) capacity *= 2;
      const next = new Uint8Array(capacity);
      next.set(this.#buffer);
      this.#buffer = next;
    }
    this.#buffer.set(chunk, this.#length);
    this.#length = required;
  }

  finish(): Uint8Array {
    return this.#buffer.slice(0, this.#length);
  }
}
