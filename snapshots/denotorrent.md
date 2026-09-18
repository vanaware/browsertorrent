> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém um projeto em typescript deno com uma boa implementação de um cliente Torrent.
> O projeto é o **BrowserTorrent ** estruturado em bbrowsertorrents. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent - Modo: DENOTORRENT

Gerado automaticamente em: 9/12/2026, 8:09:19 PM

---

## Arquivo: `docs/deno-torrent/bencode/decode.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/bencode/encode.ts`

```ts
/** Bencode 2.0 encoder. */

import {
  type BencodeDict,
  BencodeEncodeError,
  type BencodeKey,
  type BencodeList,
  type BencodeValue,
} from "./types.ts";

const _te = new TextEncoder();

/**
 * Encode a Bencode value into its canonical byte representation.
 *
 * Dictionaries must be `Map` instances so binary keys can be represented
 * without conversion. Entries are sorted by their encoded key bytes.
 *
 * @throws {BencodeEncodeError} If the value is unsupported, unsafe, cyclic, or ambiguous.
 */
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
  if (typeof value === "string") {
    _encodeString(value, out);
    return;
  }
  if (value instanceof Uint8Array) {
    _encodeBytes(value, out);
    return;
  }
  if (Array.isArray(value) || value instanceof Map) {
    if (ancestors.has(value)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) _encodeList(value, out, ancestors);
      else _encodeDict(value, out, ancestors);
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  throw new BencodeEncodeError(`unsupported value type: ${typeof value}`);
}

function _encodeInteger(value: number, out: _ByteWriter): void {
  if (!Number.isSafeInteger(value)) {
    throw new BencodeEncodeError(
      `only safe integers are supported, got: ${value}`,
    );
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
  value: BencodeDict,
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
    if (i > 0 && _compareBytes(entries[i - 1].bytes, entries[i].bytes) === 0) {
      throw new BencodeEncodeError(
        "duplicate dictionary key after byte encoding",
      );
    }
    _encodeBytes(entries[i].bytes, out);
    _encodeValue(entries[i].item, out, ancestors);
  }
  out.write(_te.encode("e"));
}

function _keyBytes(key: BencodeKey): Uint8Array {
  if (typeof key === "string") return _te.encode(key);
  if (key instanceof Uint8Array) return key;
  throw new BencodeEncodeError(
    "dictionary keys must be string or Uint8Array",
  );
}

function _compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
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

```

---

## Arquivo: `docs/deno-torrent/bencode/mod.ts`

````ts
/**
 * bencode 2.0 — a protocol-faithful Bencode encoder/decoder for Deno.
 *
 * @example
 * ```ts
 * import { encode, decode } from 'jsr:@deno-torrent/bencode'
 *
 * const value = new Map([
 *   ['announce', 'https://tracker.example.com'],
 *   ['info', new Map([['name', 'test'], ['length', 1024]])]
 * ])
 * const bytes = encode(value)
 * const decoded = decode(bytes)
 * ```
 *
 * @module
 */

export type {
  BencodeByteString,
  BencodeDict,
  BencodeInteger,
  BencodeKey,
  BencodeList,
  BencodeValue,
} from "./src/types.ts";
export { BencodeDecodeError, BencodeEncodeError } from "./src/types.ts";
export { encode } from "./src/encode.ts";
export { decode, type DecodeOptions } from "./src/decode.ts";

````

---

## Arquivo: `docs/deno-torrent/bencode/types.ts`

````ts
/** Bencode type definitions and custom error classes. */

/** A safe JavaScript integer representable by the 2.0 numeric API. */
export type BencodeInteger = number;

/** A UTF-8 string or an explicitly binary byte string. */
export type BencodeByteString = string | Uint8Array;

/** A dictionary key with an exact on-wire representation. */
export type BencodeKey = BencodeByteString;

/** An ordered sequence of bencode values. */
export type BencodeList = BencodeValue[];

/**
 * A Bencode dictionary.
 *
 * `Map` is intentional: it preserves binary keys without converting them to a
 * lossy string representation. Encoding sorts entries by their wire bytes.
 */
export type BencodeDict = Map<BencodeKey, BencodeValue>;

/** All values accepted by the 2.0 encoder and returned by the decoder. */
export type BencodeValue =
  | BencodeInteger
  | BencodeByteString
  | BencodeList
  | BencodeDict;

/**
 * Thrown when encoding fails due to an invalid or unsupported value.
 * @example
 * ```ts
 * encode(1.5)   // throws BencodeEncodeError: only integers are supported
 * encode(null)  // throws BencodeEncodeError: unsupported value type
 * ```
 */
export class BencodeEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeEncodeError";
  }
}

/**
 * Thrown when decoding fails due to malformed or truncated bencode input.
 * @example
 * ```ts
 * decode(new TextEncoder().encode('i123'))  // throws BencodeDecodeError: unterminated integer
 * ```
 */
export class BencodeDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeDecodeError";
  }
}

````

---

## Arquivo: `docs/deno-torrent/magnet/magnet.ts`

````ts
/**
 * @module
 * 磁力链接解析与构建库。
 * Magnet link parsing and building library.
 *
 * 支持 btih / sha1 命名空间，哈希格式兼容 SHA-1 Hex（40 字符）与 Base32（32 字符）。
 * Supports btih/sha1 namespaces with SHA-1 Hex (40 chars) and Base32 (32 chars) hash formats.
 *
 * @example
 * ```ts
 * import { parse, build, isValid } from "@deno-torrent/magnet";
 *
 * const info = parse("magnet:?xt=urn:btih:7f3c78907acced299d059b2af1b67c2550dbd429&dn=example");
 * console.log(info?.hashHex); // "7f3c78907acced299d059b2af1b67c2550dbd429"
 * console.log(info?.name);    // "example"
 *
 * const url = build("7f3c78907acced299d059b2af1b67c2550dbd429", {
 *   name: "example",
 *   trackers: ["http://tracker.example.com/announce"],
 * });
 * console.log(url);
 * // magnet:?xt=urn:btih:7f3c78907acced299d059b2af1b67c2550dbd429&dn=example&tr=http%3A%2F%2F...
 * ```
 */

import { decodeBase32 } from "@std/encoding/base32";
import { decodeHex, encodeHex } from "@std/encoding/hex";

// ---------------------------------------------------------------------------
// 公共类型 / Public types
// ---------------------------------------------------------------------------

/**
 * 磁力链接解析结果。
 * Result of parsing a magnet link.
 */
export interface MagnetInfo {
  /** Swarm identity selected for discovery; hybrid links prefer v1. */
  protocol: "v1" | "v2";

  /**
   * 原始哈希字节数组（v1 为 20 字节，v2 为 32 字节）。
   * Raw digest bytes (20-byte v1 SHA-1 or 32-byte v2 SHA-256).
   */
  hash: Uint8Array;

  /** Twenty-byte peer-wire/tracker identity (v2 is truncated). */
  handshakeHash: Uint8Array;

  /** Full v1 identity when the link contains `urn:btih`. */
  infoHashV1?: Uint8Array;

  /** Full v2 identity when the link contains `urn:btmh:1220...`. */
  infoHashV2?: Uint8Array;

  /**
   * 原始哈希字符串（保留输入格式：40 位 Hex 或 32 位 Base32）。
   * Original hash string (as-input: 40-char Hex or 32-char Base32).
   */
  hashString: string;

  /**
   * 哈希的十六进制统一表示（小写，20 字节 → 40 字符）。
   * Normalized lowercase hex representation of the hash.
   */
  hashHex: string;

  /**
   * 显示名称（`dn` 参数的第一个值），未提供时为 `undefined`。
   * Display name from the `dn` parameter, or `undefined` if absent.
   */
  name: string | undefined;

  /**
   * Tracker URL 列表（`tr` 参数的所有值，已 URL 解码）。
   * List of tracker URLs from all `tr` parameters (URL-decoded).
   */
  trackers: string[];

  /**
   * 所有查询参数的原始映射（已 URL 解码，支持多值）。
   * All query parameters (URL-decoded, multi-value supported).
   */
  params: Map<string, string[]>;
}

/**
 * 磁力链接构建选项。
 * Options for building a magnet link.
 */
export interface MagnetBuildOptions {
  /**
   * 文件显示名称，对应 `dn` 参数。
   * Display name, serialized as the `dn` parameter.
   */
  name?: string;

  /**
   * Tracker URL 列表，对应多个 `tr` 参数。
   * Tracker URLs, serialized as repeated `tr` parameters.
   */
  trackers?: string[];
}

/**
 * 磁力链接解析的资源限制。
 * Resource limits for parsing a magnet link.
 */
export interface MagnetParseOptions {
  /** Maximum URI length in UTF-16 code units. Defaults to 1 MiB. */
  maxLength?: number;

  /** Maximum number of non-empty query parameters. Defaults to 1024. */
  maxQueryParameters?: number;

  /** Maximum length of one query parameter segment. Defaults to 64 KiB. */
  maxQueryParameterLength?: number;
}

// ---------------------------------------------------------------------------
// 内部常量 / Internal constants
// ---------------------------------------------------------------------------

const MAGNET_PREFIX = "magnet:?";
const MAX_MAGNET_LENGTH = 1024 * 1024;
const MAX_QUERY_PARAMETERS = 1024;
const MAX_QUERY_PARAMETER_LENGTH = 64 * 1024;
const SUPPORTED_NIDS = new Set(["btih", "sha1", "btmh"]);

interface ParseLimits {
  maxLength: number;
  maxQueryParameters: number;
  maxQueryParameterLength: number;
}

// ---------------------------------------------------------------------------
// 公共 API / Public API
// ---------------------------------------------------------------------------

/**
 * 判断磁力链接字符串是否合法。
 * Returns `true` if the magnet link string is valid.
 *
 * @param magnet 待检测的磁力链接字符串。 / The magnet link string to validate.
 * @returns 合法返回 `true`，否则返回 `false`。 / `true` if valid, `false` otherwise.
 *
 * @example
 * ```ts
 * isValid("magnet:?xt=urn:btih:7f3c78907acced299d059b2af1b67c2550dbd429"); // true
 * isValid("https://example.com"); // false
 * ```
 */
export function isValid(magnet: string): boolean {
  try {
    return parse(magnet) !== undefined;
  } catch {
    return false;
  }
}

/**
 * 解析磁力链接字符串，返回结构化信息。
 * Parses a magnet link string and returns structured information.
 *
 * 支持格式：
 * - `magnet:?xt=urn:btih:<HEX>`   — BitTorrent Info Hash，40 字符十六进制
 * - `magnet:?xt=urn:btih:<BASE32>` — BitTorrent Info Hash，32 字符 Base32
 * - `magnet:?xt=urn:sha1:<HEX>`   — SHA-1，40 字符十六进制
 * - `magnet:?xt=urn:sha1:<BASE32>` — SHA-1，32 字符 Base32
 *
 * Tracker URL 等参数值会自动进行 URL 解码；同名参数（如多个 `tr`）会合并为数组。
 *
 * @param magnet 磁力链接字符串。 / The magnet link string.
 * @returns 解析成功返回 {@link MagnetInfo}，格式不合法返回 `undefined`。
 *          Returns {@link MagnetInfo} on success, or `undefined` if invalid.
 *
 * @example
 * ```ts
 * const info = parse(
 *   "magnet:?xt=urn:btih:7f3c78907acced299d059b2af1b67c2550dbd429&dn=Test&tr=http%3A%2F%2Ft.example.com%2Fannounce"
 * );
 * info?.hashHex;        // "7f3c78907acced299d059b2af1b67c2550dbd429"
 * info?.name;           // "Test"
 * info?.trackers[0];    // "http://t.example.com/announce"
 * ```
 */
export function parse(
  magnet: string,
  options: MagnetParseOptions = {},
): MagnetInfo | undefined {
  const limits = normalizeParseOptions(options);

  if (
    typeof magnet !== "string" ||
    magnet.length > limits.maxLength ||
    magnet.slice(0, MAGNET_PREFIX.length).toLowerCase() !== MAGNET_PREFIX
  ) {
    return undefined;
  }

  const queryString = magnet.slice(MAGNET_PREFIX.length);
  const params = parseQueryString(queryString, limits);
  if (!params) return undefined;

  const xtValues = params.get("xt");
  if (!xtValues || xtValues.length === 0) return undefined;

  const identities: MagnetInfo[] = [];
  for (const xt of xtValues) {
    const result = parseXt(xt, params);
    if (result) identities.push(result);
  }
  const v1 = identities.find((identity) => identity.protocol === "v1");
  const v2 = identities.find((identity) => identity.protocol === "v2");
  const selected = v1 ?? v2;
  if (!selected) return undefined;
  return {
    ...selected,
    infoHashV1: v1?.hash.slice(),
    infoHashV2: v2?.hash.slice(),
  };
}

/** Build a BEP-52 magnet exact topic from a full 32-byte SHA-256 digest. */
export function buildV2(
  hashHex: string,
  options: MagnetBuildOptions = {},
): string {
  if (!/^[0-9a-f]{64}$/iu.test(hashHex)) {
    throw new TypeError("Invalid v2 hash: expected 64 hexadecimal characters");
  }
  let url = `${MAGNET_PREFIX}xt=urn:btmh:1220${hashHex.toLowerCase()}`;
  if (options.name !== undefined) {
    url += `&dn=${encodeURIComponent(options.name)}`;
  }
  for (const tracker of options.trackers ?? []) {
    url += `&tr=${encodeURIComponent(tracker)}`;
  }
  return url;
}

/**
 * 根据哈希字符串构建磁力链接 URL。
 * Builds a magnet link URL from a hash string.
 *
 * @param hashString SHA-1 哈希字符串：40 位十六进制或 32 位 Base32。
 *                   SHA-1 hash string: 40-char hex or 32-char Base32.
 * @param options    可选参数。 / Optional parameters.
 * @param options.name     文件显示名称（`dn`）。 / Display name (`dn`).
 * @param options.trackers Tracker URL 列表（`tr`）。 / Tracker URLs (`tr`).
 * @returns 构建好的磁力链接字符串。 / The constructed magnet link string.
 * @throws {TypeError} 当 `hashString` 格式不合法时。 / When `hashString` is invalid.
 *
 * @example
 * ```ts
 * build("7f3c78907acced299d059b2af1b67c2550dbd429", {
 *   name: "example",
 *   trackers: ["http://tracker.example.com/announce"],
 * });
 * ```
 */
export function build(
  hashString: string,
  options: MagnetBuildOptions = {},
): string {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Invalid build options: expected an object");
  }

  if (options.name !== undefined && typeof options.name !== "string") {
    throw new TypeError("Invalid build option: name must be a string");
  }

  if (
    options.trackers !== undefined &&
    (!Array.isArray(options.trackers) ||
      options.trackers.some(
        (tracker) => typeof tracker !== "string" || tracker.trim().length === 0,
      ))
  ) {
    throw new TypeError(
      "Invalid build option: trackers must be a non-empty array of strings",
    );
  }

  if (!isSha1Hex(hashString) && !isSha1Base32(hashString)) {
    throw new TypeError(
      `Invalid hash string: expected 40-char hex or 32-char Base32, got "${hashString}"`,
    );
  }

  const normalizedHash = isSha1Hex(hashString)
    ? hashString.toLowerCase()
    : hashString.toUpperCase();

  let url = `${MAGNET_PREFIX}xt=urn:btih:${normalizedHash}`;

  if (options.name !== undefined) {
    url += `&dn=${encodeURIComponent(options.name)}`;
  }

  for (const tracker of options.trackers ?? []) {
    url += `&tr=${encodeURIComponent(tracker)}`;
  }

  return url;
}

/**
 * 判断字符串是否为合法的 SHA-1 十六进制哈希（40 个十六进制字符）。
 * Returns `true` if the string is a valid SHA-1 hex hash (40 hex characters).
 *
 * @param hash 待检测字符串。 / The string to check.
 *
 * @example
 * ```ts
 * isSha1Hex("7f3c78907acced299d059b2af1b67c2550dbd429"); // true
 * isSha1Hex("P46HRED2ZTWSTHIFTMVPDNT4EVINXVBJ");          // false (Base32)
 * ```
 */
export function isSha1Hex(hash: string): boolean {
  return hash.length === 40 && isHex(hash);
}

/**
 * 判断字符串是否为合法的 SHA-1 Base32 编码哈希（32 个 Base32 字符，无填充）。
 * Returns `true` if the string is a valid SHA-1 Base32 hash (32 Base32 characters, no padding).
 *
 * @param hash 待检测字符串。 / The string to check.
 *
 * @example
 * ```ts
 * isSha1Base32("P46HRED2ZTWSTHIFTMVPDNT4EVINXVBJ"); // true
 * isSha1Base32("7f3c78907acced299d059b2af1b67c2550dbd429"); // false (Hex)
 * ```
 */
export function isSha1Base32(hash: string): boolean {
  return hash.length === 32 && isBase32(hash);
}

/**
 * 判断字符串是否为合法的十六进制字符串（仅含 `0-9`、`a-f`、`A-F`）。
 * Returns `true` if the string contains only valid hexadecimal characters.
 *
 * @param value 待检测字符串。 / The string to check.
 *
 * @example
 * ```ts
 * isHex("deadBEEF"); // true
 * isHex("xyz");      // false
 * isHex("");         // false
 * ```
 */
export function isHex(value: string): boolean {
  if (value.length === 0) return false;
  return /^[0-9a-fA-F]+$/.test(value);
}

/**
 * 判断字符串是否为合法的 RFC 4648 Base32 字符串（含 `A-Z`、`2-7`，可带合法的 `=` 填充，大小写不敏感）。
 * Returns `true` for valid RFC 4648 Base32 (case-insensitive, optional valid `=` padding).
 *
 * @param value 待检测字符串。 / The string to check.
 *
 * @example
 * ```ts
 * isBase32("NBSWY3DPEB3W64TMMQ======"); // true
 * isBase32("hello world");              // false
 * isBase32("");                         // false
 * ```
 */
export function isBase32(value: string): boolean {
  if (value.length === 0) return false;

  const match = /^([A-Z2-7]+)(=*)$/i.exec(value);
  if (!match) return false;

  const dataLength = match[1].length;
  const paddingLength = match[2].length;
  const remainder = dataLength % 8;

  if (paddingLength === 0) {
    return [0, 2, 4, 5, 7].includes(remainder);
  }

  if (value.length % 8 !== 0) return false;

  const expectedPadding: Record<number, number> = {
    0: 0,
    2: 6,
    4: 4,
    5: 3,
    7: 1,
  };

  return expectedPadding[remainder] === paddingLength;
}

/**
 * 判断字符串是否为规范的 Base64 字符串（长度为 4 的倍数，末尾最多 2 个 `=` 填充）。
 * Returns `true` if the string is a valid Base64 string
 * (canonical encoding, length multiple of 4, at most 2 trailing `=`).
 *
 * @param value 待检测字符串。 / The string to check.
 *
 * @example
 * ```ts
 * isBase64("aGVsbG8gd29ybGQ="); // true
 * isBase64("not base64!!");     // false
 * isBase64("");                  // false
 * ```
 */
export function isBase64(value: string): boolean {
  if (value.length === 0) return false;
  if (value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;

  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 内部辅助函数 / Internal helpers
// ---------------------------------------------------------------------------

/**
 * 解析单个 xt 参数值（如 `urn:btih:HASH`），结合完整 params 返回 MagnetInfo。
 * Parses a single xt value (e.g., `urn:btih:HASH`) with the full params map.
 */
function parseXt(
  xt: string,
  params: Map<string, string[]>,
): MagnetInfo | undefined {
  if (xt.slice(0, 4).toLowerCase() !== "urn:") return undefined;

  const urnBody = xt.slice(4); // 去掉 "urn:" / strip "urn:"
  const colonIdx = urnBody.indexOf(":");
  if (colonIdx === -1) return undefined;

  const nid = urnBody.slice(0, colonIdx).toLowerCase();
  const hashString = urnBody.slice(colonIdx + 1);

  if (!SUPPORTED_NIDS.has(nid)) return undefined;

  let hash: Uint8Array | undefined;
  let protocol: "v1" | "v2" = "v1";

  try {
    if (nid === "btmh" && /^1220[0-9a-f]{64}$/iu.test(hashString)) {
      hash = decodeHex(hashString.slice(4).toLowerCase());
      protocol = "v2";
    } else if (nid !== "btmh" && isSha1Hex(hashString)) {
      hash = decodeHex(hashString.toLowerCase());
    } else if (nid !== "btmh" && isSha1Base32(hashString)) {
      // decodeBase32 要求大写输入 / decodeBase32 requires uppercase input
      hash = decodeBase32(hashString.toUpperCase());
    }
  } catch {
    // Invalid encoded input is treated as an invalid magnet link.
    return undefined;
  }

  if (!hash) return undefined;

  const hashHex = encodeHex(hash);
  const dnValues = params.get("dn");
  const trValues = params.get("tr");
  const paramsCopy = new Map<string, string[]>();
  for (const [key, values] of params) {
    paramsCopy.set(key, [...values]);
  }

  return {
    protocol,
    hash: hash.slice(),
    handshakeHash: protocol === "v2" ? hash.slice(0, 20) : hash.slice(),
    infoHashV1: protocol === "v1" ? hash.slice() : undefined,
    infoHashV2: protocol === "v2" ? hash.slice() : undefined,
    hashString,
    hashHex,
    name: dnValues?.[0],
    trackers: [...(trValues ?? [])],
    params: paramsCopy,
  };
}

/**
 * 将查询字符串解析为多值 Map（键值均做 URL 解码）。
 * Parses a query string into a multi-value Map (both keys and values are URL-decoded).
 */
function parseQueryString(
  query: string,
  limits: ParseLimits,
): Map<string, string[]> | undefined {
  const params = new Map<string, string[]>();
  let parameterCount = 0;

  if (!query) return params;

  for (const segment of query.split("&")) {
    if (!segment) continue;

    parameterCount++;
    if (
      parameterCount > limits.maxQueryParameters ||
      segment.length > limits.maxQueryParameterLength
    ) {
      return undefined;
    }

    const eqIdx = segment.indexOf("=");

    let key: string;
    let value: string;

    if (eqIdx === -1) {
      // 无值参数 / Value-less parameter
      key = safeDecodeURIComponent(segment);
      value = "";
    } else {
      key = safeDecodeURIComponent(segment.slice(0, eqIdx));
      value = safeDecodeURIComponent(segment.slice(eqIdx + 1));
    }

    const existing = params.get(key);
    if (existing) {
      existing.push(value);
    } else {
      params.set(key, [value]);
    }
  }

  return params;
}

function normalizeParseOptions(options: MagnetParseOptions): ParseLimits {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Invalid parse options: expected an object");
  }

  const maxLength = validateLimit(
    options.maxLength,
    MAX_MAGNET_LENGTH,
    "maxLength",
  );
  const maxQueryParameters = validateLimit(
    options.maxQueryParameters,
    MAX_QUERY_PARAMETERS,
    "maxQueryParameters",
  );
  const maxQueryParameterLength = validateLimit(
    options.maxQueryParameterLength,
    MAX_QUERY_PARAMETER_LENGTH,
    "maxQueryParameterLength",
  );

  return { maxLength, maxQueryParameters, maxQueryParameterLength };
}

function validateLimit(
  value: number | undefined,
  defaultValue: number,
  name: string,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `Invalid parse option: ${name} must be a positive integer`,
    );
  }
  return value;
}

/**
 * 安全 URL 解码：解码失败时返回原始字符串。
 * Safe URL decode: returns the original string if decoding fails.
 */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

````

---

## Arquivo: `docs/deno-torrent/magnet/mod.ts`

```ts
/**
 * @module
 * @deno-torrent/magnet 公共入口。
 * Public entry point for @deno-torrent/magnet.
 */

export type {
  MagnetBuildOptions,
  MagnetInfo,
  MagnetParseOptions,
} from "./src/magnet.ts";

export {
  build,
  buildV2,
  isBase32,
  isBase64,
  isHex,
  isSha1Base32,
  isSha1Hex,
  isValid,
  parse,
} from "./src/magnet.ts";

```

---

## Arquivo: `docs/deno-torrent/metainfo/generator.ts`

````ts
/**
 * Core torrent generation logic.
 *
 * Exposes a single async function {@link generateTorrent} that reads files,
 * computes SHA-1 piece hashes, and writes a complete `.torrent` file in
 * Bencode format.
 *
 * @module
 */

import { basename, relative, resolve, SEPARATOR } from '@std/path';
import { encode } from '@deno-torrent/bencode';
import type { BencodeValue } from '@deno-torrent/bencode';
import { IoUtil } from '@deno-torrent/toolkit';
import { PieceSizeEnum } from './types.ts';
import type { GeneratorOption } from './types.ts';
import { compareStrings, isSafePathComponent } from './path.ts';
import { buildPieceFiles, calcPieceSize, getDefaultCreatedBy, obtainFiles, sha1sum } from './utils.ts';

/**
 * Generates a BitTorrent `.torrent` file and writes it to `options.writer`.
 *
 * Supports both *single-file* (when `entry` points to a regular file) and
 * *multi-file* (when `entry` points to a directory) torrents.
 *
 * File ordering is stable: paths with fewer directory components appear first;
 * within the same depth files are sorted lexicographically.
 *
 * @param options - Generation parameters; see {@link GeneratorOption}.
 *
 * @example Single-file torrent
 * ```ts
 * import { generateTorrent } from 'jsr:@deno-torrent/metainfo@1'
 *
 * const out = await Deno.open("video.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/media/video.mkv",
 *   writer: out,
 *   trackers: [new URL("udp://tracker.openbittracker.com:6969/announce")],
 * })
 * out.close()
 * ```
 *
 * @example Multi-file torrent with all options
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from 'jsr:@deno-torrent/metainfo@1'
 *
 * const out = await Deno.open("album.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/media/my-album",
 *   writer: out,
 *   pieceSizeEnum: PieceSizeEnum.SIZE_512MB,
 *   ignoreHiddenFile: true,
 *   isPrivate: true,
 *   trackers: [
 *     new URL("udp://tracker1.example.com:6969"),
 *     new URL("udp://tracker2.example.com:6969"),
 *   ],
 *   webSeeds: [new URL("https://mirror.example.com/my-album/")],
 *   source: "https://example.com/releases/my-album",
 *   comment: "My favourite album",
 *   createdBy: "my-app@1.0.0",
 * })
 * out.close()
 * ```
 *
 * @throws {Deno.errors.NotFound} If `entry` does not exist on the filesystem.
 * @throws {Error} If the entry contains no files or the destination writer fails.
 */
export async function generateTorrent({
  writer,
  entry,
  pieceSizeEnum = PieceSizeEnum.SIZE_AUTO,
  ignoreHiddenFile = false,
  alignPiece = false,
  isPrivate = false,
  trackers = [],
  webSeeds = [],
  source,
  comment,
  createdBy,
  createdAt = Math.floor(Date.now() / 1000),
}: GeneratorOption): Promise<void> {
  if (writer === null || typeof writer !== 'object' || typeof writer.write !== 'function') {
    throw new TypeError('writer must implement write(Uint8Array)');
  }
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new TypeError('entry must be a non-empty path string');
  }
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new RangeError('createdAt must be a non-negative safe integer');
  }
  if (![ignoreHiddenFile, alignPiece, isPrivate].every((value) => typeof value === 'boolean')) {
    throw new TypeError('ignoreHiddenFile, alignPiece, and isPrivate must be booleans');
  }
  if (!Array.isArray(trackers) || !trackers.every((tracker) => tracker instanceof URL)) {
    throw new TypeError('trackers must be an array of URL objects');
  }
  if (!Array.isArray(webSeeds) || !webSeeds.every((webSeed) => webSeed instanceof URL)) {
    throw new TypeError('webSeeds must be an array of URL objects');
  }
  for (const [name, value] of Object.entries({ source, comment, createdBy })) {
    if (value !== undefined && typeof value !== 'string') {
      throw new TypeError(`${name} must be a string when provided`);
    }
  }

  entry = resolve(entry);
  const torrentName = basename(entry);
  if (!isSafePathComponent(torrentName)) {
    throw new TypeError(`entry does not resolve to a safe torrent name: ${torrentName || '<empty>'}`);
  }

  const entryStat = await Deno.stat(entry);

  // Stable ordering makes repeated generation reproducible.
  let files = await obtainFiles(entry, ignoreHiddenFile);
  files = files.sort((a, b) => {
    const depthDiff = a.split(SEPARATOR).length - b.split(SEPARATOR).length;
    return depthDiff !== 0 ? depthDiff : compareStrings(a, b);
  });

  if (files.length === 0) {
    throw new Error(`No files found under entry: ${entry}`);
  }
  for (const file of files) {
    const components = relative(entryStat.isFile ? resolve(entry, '..') : entry, file).split(SEPARATOR);
    if (!components.every(isSafePathComponent)) {
      throw new Error(`Source path cannot be represented safely in torrent metainfo: ${file}`);
    }
  }

  const singleFileMode = entryStat.isFile;
  const initialSizes = await Promise.all(files.map(async (file) => (await Deno.stat(file)).size));
  const totalSize = initialSizes.reduce((total, size) => {
    const next = total + size;
    if (!Number.isSafeInteger(next)) throw new RangeError('Total file size exceeds the safe integer range');
    return next;
  }, 0);
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum);

  const info = new Map<string, BencodeValue>([
    ['name', torrentName],
    ['piece length', pieceSize],
  ]);
  const torrent = new Map<string, BencodeValue>([
    ['created by', createdBy ?? getDefaultCreatedBy()],
    ['creation date', createdAt],
    ['info', info],
  ]);

  // ── Trackers ─────────────────────────────────────────────────────────────
  if (trackers.length > 0) {
    // URL ordering is canonical even when callers pass a different order.
    trackers = [...trackers].sort((a, b) => compareStrings(a.href, b.href));
    torrent.set('announce', trackers[0].href);
    if (trackers.length > 1) {
      // announce-list: each tracker in its own tier (BEP-12)
      torrent.set('announce-list', trackers.map((t) => [t.href]));
    }
  }

  // ── Web seeds (BEP-19) ────────────────────────────────────────────────────
  if (webSeeds && webSeeds.length > 0) {
    webSeeds = [...webSeeds].sort((a, b) => compareStrings(a.href, b.href));
    torrent.set('url-list', webSeeds.length === 1 ? webSeeds[0].href : webSeeds.map((w) => w.href));
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  if (isPrivate) info.set('private', 1);
  if (comment) torrent.set('comment', comment);
  if (source) torrent.set('source', source);

  // ── Piece hashes & file metadata ──────────────────────────────────────────
  if (singleFileMode) {
    info.set('length', initialSizes[0]);
    info.set('pieces', await sha1sum(files, pieceSize));
  } else {
    const pieceFiles = alignPiece
      ? await buildPieceFiles(files, pieceSize, initialSizes)
      : files.map((file, index) => ({ file, length: initialSizes[index], padding: false }));
    const torrentFiles = pieceFiles.map((pieceFile, index) => ({
      attr: pieceFile.padding ? 'p' : undefined,
      length: pieceFile.length,
      path: pieceFile.padding
        ? ['.pad', `${pieceFile.length}-${index}`]
        : relative(entry, pieceFile.file!).split(SEPARATOR),
    }));
    info.set(
      'files',
      torrentFiles.map(({ attr, length, path }) => {
        const file = new Map<string, BencodeValue>([
          ['length', length],
          ['path', path],
        ]);
        if (attr !== undefined) file.set('attr', attr);
        return file;
      }),
    );
    info.set('pieces', await sha1sum(files, pieceSize, alignPiece, pieceFiles));
  }

  const finalSizes = await Promise.all(files.map(async (file) => (await Deno.stat(file)).size));
  if (finalSizes.some((size, index) => size !== initialSizes[index])) {
    throw new Error('Source files changed size while the torrent was being generated');
  }

  // Complete partial writes so filesystem and streaming destinations are safe.
  await IoUtil.writeAll(writer, encode(torrent));
}

````

---

## Arquivo: `docs/deno-torrent/metainfo/identity.ts`

```ts
import { type BencodeKey, type BencodeValue, decode, encode } from '@deno-torrent/bencode';
import { IoUtil } from '@deno-torrent/toolkit';
import { parseTorrent, TorrentParseError } from './parser.ts';
import { DEFAULT_MAX_METAINFO_SIZE } from './types.ts';
import type { ParseTorrentOptions, Reader, Torrent, TorrentPieceLayer } from './types.ts';

/** A parsed torrent together with its exact BEP-3 swarm identity. */
export interface TorrentIdentity {
  /** Validated, decoded metainfo. */
  torrent: Torrent;
  /** Exact bencoded bytes of the root `info` dictionary. */
  infoBytes: Uint8Array<ArrayBuffer>;
  /** SHA-1 digest of {@link infoBytes}. */
  infoHash: Uint8Array<ArrayBuffer>;
  /** Lower-case hexadecimal form of {@link infoHash}. */
  infoHashHex: string;
  /** Metadata format after structural and hybrid-layout validation. */
  version: 'v1' | 'v2' | 'hybrid';
  /** Full BEP-3 SHA-1 identity when v1 metadata is present. */
  infoHashV1?: Uint8Array<ArrayBuffer>;
  /** Full BEP-52 SHA-256 identity when v2 metadata is present. */
  infoHashV2?: Uint8Array<ArrayBuffer>;
}

/** Optional outer metainfo fields used when wrapping BEP-9 metadata. */
export interface WrapInfoOptions {
  /** Optional primary tracker URL. */
  announce?: string;
  /** Optional BEP-12 tracker tiers. */
  announceList?: string[][];
  /** Validated BEP-52 piece layers fetched separately from BEP-9 info metadata. */
  pieceLayers?: readonly TorrentPieceLayer[];
}

/**
 * Parse metainfo and retain the exact bytes used to calculate its v1 info hash.
 *
 * Re-encoding a decoded object is deliberately avoided: a torrent's identity
 * is the SHA-1 digest of the bytes originally present in its `info` value.
 */
export async function parseTorrentWithIdentity(
  source: Reader | Uint8Array,
  options: ParseTorrentOptions = {},
): Promise<TorrentIdentity> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TorrentParseError('Invalid "maxBytes" option — expected a positive safe integer');
  }

  let bytes: Uint8Array<ArrayBuffer>;
  if (source instanceof Uint8Array) {
    if (source.length > maxBytes) {
      throw new TorrentParseError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    bytes = Uint8Array.from(source);
  } else {
    try {
      bytes = Uint8Array.from(await IoUtil.readAll(source, { maxBytes }));
    } catch (error) {
      throw new TorrentParseError('Failed to read torrent data', { cause: error });
    }
  }

  const torrent = await parseTorrent(bytes, options);
  const infoBytes = extractInfoBytes(bytes);
  const hasV2 = torrent.info['meta version'] === 2;
  const hasV1 = !hasV2 || torrent.info.pieces !== undefined;
  const infoHashV1 = hasV1 ? await calculateInfoHash(infoBytes) : undefined;
  const infoHashV2 = hasV2 ? await calculateInfoHashV2(infoBytes) : undefined;
  const infoHash = infoHashV1 ?? infoHashV2!.slice(0, 20);
  const version = hasV2 ? (hasV1 ? 'hybrid' : 'v2') : 'v1';
  return { torrent, infoBytes, infoHash, infoHashHex: toHex(infoHash), version, infoHashV1, infoHashV2 };
}

/** Extract the exact bencoded `info` dictionary from complete metainfo bytes. */
export function extractInfoBytes(metainfo: Uint8Array): Uint8Array<ArrayBuffer> {
  // Validate the complete bencode stream first. This rejects duplicate keys,
  // malformed integers and trailing bytes before the byte locator is used.
  try {
    decode(metainfo, { maxBytes: metainfo.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded torrent data', { cause: error });
  }

  const cursor = { offset: 0 };
  expect(metainfo, cursor, 0x64, 'Torrent root must be a bencode dictionary');
  let result: Uint8Array<ArrayBuffer> | undefined;
  while (peek(metainfo, cursor) !== 0x65) {
    const key = readByteString(metainfo, cursor);
    const valueStart = cursor.offset;
    skipValue(metainfo, cursor, 1);
    if (equalsAscii(key, 'info')) {
      if (metainfo[valueStart] !== 0x64) {
        throw new TorrentParseError('Torrent info value must be a dictionary');
      }
      result = metainfo.slice(valueStart, cursor.offset);
    }
  }
  cursor.offset++;
  if (result === undefined) throw new TorrentParseError('Missing or invalid "info" dictionary');
  return result;
}

/** Calculate the BEP-3 v1 info hash for exact bencoded `info` bytes. */
export async function calculateInfoHash(infoBytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded info dictionary', { cause: error });
  }
  if (!(decoded instanceof Map)) {
    throw new TorrentParseError('Info bytes must contain one bencode dictionary');
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-1', Uint8Array.from(infoBytes)));
}

/** Calculate the full BEP-52 SHA-256 info hash for exact bencoded `info` bytes. */
export async function calculateInfoHashV2(infoBytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded info dictionary', { cause: error });
  }
  if (!(decoded instanceof Map)) throw new TorrentParseError('Info bytes must contain one bencode dictionary');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(infoBytes)));
}

/**
 * Wrap an exact BEP-9 `info` dictionary in complete torrent metainfo.
 * The supplied bytes are inserted verbatim, so their info hash cannot change.
 */
export function wrapInfoBytes(infoBytes: Uint8Array, options: WrapInfoOptions = {}): Uint8Array<ArrayBuffer> {
  let decoded: unknown;
  try {
    decoded = decode(infoBytes, { maxBytes: infoBytes.length });
  } catch (error) {
    throw new TorrentParseError('Invalid bencoded info dictionary', { cause: error });
  }
  if (!(decoded instanceof Map)) throw new TorrentParseError('Info bytes must contain one bencode dictionary');

  const fields: Array<{ key: string; value: Uint8Array }> = [{ key: 'info', value: infoBytes }];
  if (options.announce !== undefined) {
    fields.push({ key: 'announce', value: Uint8Array.from(encode(options.announce)) });
  }
  if (options.announceList !== undefined) {
    fields.push({ key: 'announce-list', value: Uint8Array.from(encode(options.announceList)) });
  }
  if (options.pieceLayers !== undefined) {
    const layers = new Map<BencodeKey, BencodeValue>();
    for (const layer of options.pieceLayers) layers.set(layer.piecesRoot, layer.hashes);
    fields.push({ key: 'piece layers', value: Uint8Array.from(encode(layers)) });
  }
  fields.sort((left, right) => left.key === right.key ? 0 : left.key < right.key ? -1 : 1);
  const chunks = fields.flatMap((field) => [Uint8Array.from(encode(field.key)), field.value]);
  const length = 2 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  output[0] = 0x64;
  let offset = 1;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  output[offset] = 0x65;
  return output;
}

/** Convert binary data to lower-case hexadecimal text. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function skipValue(bytes: Uint8Array, cursor: { offset: number }, depth: number): void {
  if (depth > 256) throw new TorrentParseError('Torrent nesting is too deep');
  const marker = peek(bytes, cursor);
  if (marker >= 0x30 && marker <= 0x39) {
    readByteString(bytes, cursor);
    return;
  }
  if (marker === 0x69) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) cursor.offset++;
    cursor.offset++;
    return;
  }
  if (marker === 0x6c) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) skipValue(bytes, cursor, depth + 1);
    cursor.offset++;
    return;
  }
  if (marker === 0x64) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 0x65) {
      readByteString(bytes, cursor);
      skipValue(bytes, cursor, depth + 1);
    }
    cursor.offset++;
    return;
  }
  throw new TorrentParseError(`Invalid bencode marker at byte ${cursor.offset}`);
}

function readByteString(bytes: Uint8Array, cursor: { offset: number }): Uint8Array {
  const start = cursor.offset;
  while (peek(bytes, cursor) !== 0x3a) cursor.offset++;
  const length = Number(new TextDecoder().decode(bytes.subarray(start, cursor.offset)));
  cursor.offset++;
  if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > bytes.length) {
    throw new TorrentParseError(`Invalid byte string length at byte ${start}`);
  }
  const value = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return value;
}

function peek(bytes: Uint8Array, cursor: { offset: number }): number {
  const byte = bytes[cursor.offset];
  if (byte === undefined) throw new TorrentParseError('Unexpected end of torrent data');
  return byte;
}

function expect(bytes: Uint8Array, cursor: { offset: number }, expected: number, message: string): void {
  if (peek(bytes, cursor) !== expected) throw new TorrentParseError(message);
  cursor.offset++;
}

function equalsAscii(bytes: Uint8Array, value: string): boolean {
  return bytes.length === value.length && bytes.every((byte, index) => byte === value.charCodeAt(index));
}

```

---

## Arquivo: `docs/deno-torrent/metainfo/mod.ts`

```ts
/**
 * Parse and generate BitTorrent `.torrent` metainfo files.
 *
 * This package combines the public APIs of `@deno-torrent/torrent-parser`
 * and `@deno-torrent/torrent-generator` behind one shared type model.
 * @module
 */
export { generateTorrent } from './src/generator.ts';
export {
  calculateInfoHash,
  calculateInfoHashV2,
  extractInfoBytes,
  parseTorrentWithIdentity,
  toHex,
  wrapInfoBytes,
} from './src/identity.ts';
export type { TorrentIdentity, WrapInfoOptions } from './src/identity.ts';
export { parseTorrent, TorrentParseError } from './src/parser.ts';
export { flattenV2Files, validateV2PieceLayers } from './src/v2.ts';
export type { TorrentV2FileEntry } from './src/v2.ts';
export { DEFAULT_MAX_METAINFO_SIZE, PieceSizeEnum } from './src/types.ts';
export type {
  GeneratorOption,
  ParseTorrentOptions,
  Reader,
  Torrent,
  Torrent as GeneratorTorrent,
  TorrentFile,
  TorrentFileTree,
  TorrentInfo,
  TorrentInfoCommon,
  TorrentPieceLayer,
  TorrentV1Info,
  TorrentV2File,
  TorrentV2Info,
  Writer,
} from './src/types.ts';

```

---

## Arquivo: `docs/deno-torrent/metainfo/parser.ts`

````ts
/**
 * @module
 *
 * Lightweight `.torrent` file parser for Deno.
 *
 * @example
 * ```ts
 * import { parseTorrent } from 'jsr:@deno-torrent/metainfo@1'
 *
 * const fd = await Deno.open('example.torrent', { read: true })
 * try {
 *   const torrent = await parseTorrent(fd)
 *   console.log(torrent.info.name)
 * } finally {
 *   fd.close()
 * }
 * ```
 */

import { BencodeDecodeError, decode } from '@deno-torrent/bencode';
import { IoUtil } from '@deno-torrent/toolkit';
import { isSafePathComponent } from './path.ts';
import { DEFAULT_MAX_METAINFO_SIZE } from './types.ts';
import type { ParseTorrentOptions, Reader, Torrent } from './types.ts';
import type { TorrentPieceLayer, TorrentV2Info } from './types.ts';
import { flattenV2Files, validateHybridLayout, validateV2PieceLayers } from './v2.ts';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Convert bencode 2.x Map dictionaries to the plain objects exposed by this package. */
function normalizeDecodedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== 'string') {
        throw new TorrentParseError('Torrent dictionary keys must be strings');
      }
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value: normalizeDecodedValue(entry),
        writable: true,
      });
    }
    return object;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDecodedValue);
  }

  return value;
}

/** Return whether a decoded value is a plain bencode dictionary. */
function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/** Return whether a value is an integer representable without precision loss. */
function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Return whether a value is a non-negative safe integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

/** Validate an optional string-valued field. */
function validateOptionalString(dict: Record<string, unknown>, field: string): void {
  if (dict[field] !== undefined && typeof dict[field] !== 'string') {
    throw new TorrentParseError(`Invalid "${field}" field — expected a UTF-8 string`);
  }
}

/** Validate the optional tracker tier list. */
function validateAnnounceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((tier) =>
      Array.isArray(tier) && tier.length > 0 &&
      tier.every((tracker) => typeof tracker === 'string' && tracker.length > 0)
    )
  );
}

/** Validate a multi-file torrent file entry. */
function validateTorrentFile(value: unknown, index: number): asserts value is Record<string, unknown> {
  if (!isDictionary(value)) {
    throw new TorrentParseError(`Invalid "info.files[${index}]" entry — expected a dictionary`);
  }
  if (!isNonNegativeInteger(value['length'])) {
    throw new TorrentParseError(`Invalid "info.files[${index}].length" field — expected a non-negative integer`);
  }
  if (value['attr'] !== undefined && typeof value['attr'] !== 'string') {
    throw new TorrentParseError(`Invalid "info.files[${index}].attr" field — expected a string`);
  }
  if (
    !Array.isArray(value['path']) || value['path'].length === 0 ||
    !value['path'].every(isSafePathComponent)
  ) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].path" field — expected safe, non-empty path components`,
    );
  }
}

/** Reject ambiguous paths while allowing identical BEP-47 padding entries. */
function validateFilePaths(files: Record<string, unknown>[]): void {
  const entries = new Map<string, { length: number; padding: boolean }>();
  const directoryPrefixes = new Set<string>();

  for (const file of files) {
    const path = file['path'] as string[];
    const key = path.join('\0');
    const padding = typeof file['attr'] === 'string' && file['attr'].includes('p');
    const previous = entries.get(key);
    if (previous !== undefined && !(padding && previous.padding && previous.length === file['length'])) {
      throw new TorrentParseError(`Duplicate or conflicting file path: ${path.join('/')}`);
    }
    if (directoryPrefixes.has(key)) {
      throw new TorrentParseError(`File path conflicts with a directory path: ${path.join('/')}`);
    }
    for (let index = 1; index < path.length; index++) {
      const prefix = path.slice(0, index).join('\0');
      if (entries.has(prefix)) {
        throw new TorrentParseError(`File path is nested below another file: ${path.join('/')}`);
      }
      directoryPrefixes.add(prefix);
    }
    entries.set(key, { length: file['length'] as number, padding });
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when input cannot be parsed as a valid `.torrent` file.
 *
 * @example
 * ```ts
 * import { parseTorrent, TorrentParseError } from 'jsr:@deno-torrent/metainfo@1'
 *
 * try {
 *   await parseTorrent(badBytes)
 * } catch (err) {
 *   if (err instanceof TorrentParseError) {
 *     console.error('Parse failed:', err.message)
 *   }
 * }
 * ```
 */
export class TorrentParseError extends Error {
  /** Create a parser error and optionally retain the underlying failure. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TorrentParseError';
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses a `.torrent` file from a `Uint8Array` or any `Reader` (e.g. `Deno.FsFile`).
 *
 * Reader input is consumed sequentially to EOF and does not need to support
 * seeking. Encoded input is limited to 16 MiB by default; trusted callers may
 * provide a different positive `maxBytes` value.
 *
 * @param source - Raw torrent bytes **or** any object implementing the `Reader` interface.
 * @param options - Optional resource limits for the input.
 * @returns The fully typed {@link Torrent} object.
 * @throws {TorrentParseError} If decoding fails, the resource limit is exceeded,
 *   required BEP-3 fields are missing, or piece/file metadata is inconsistent.
 *
 * @example Parse from an open file handle
 * ```ts
 * const fd = await Deno.open('./example.torrent', { read: true })
 * try {
 *   const torrent = await parseTorrent(fd)
 *   console.log(torrent.info.name)
 * } finally {
 *   fd.close()
 * }
 * ```
 *
 * @example Parse from a byte array
 * ```ts
 * const bytes = await Deno.readFile('./example.torrent')
 * const torrent = await parseTorrent(bytes)
 * ```
 */
export async function parseTorrent(source: Reader | Uint8Array, options: ParseTorrentOptions = {}): Promise<Torrent> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (maxBytes <= 0 || !Number.isSafeInteger(maxBytes)) {
    throw new TorrentParseError('Invalid "maxBytes" option — expected a positive safe integer');
  }

  // ── 1. Read bytes ──────────────────────────────────────────────────────────
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) {
    if (source.length > maxBytes) {
      throw new TorrentParseError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    bytes = source;
  } else {
    try {
      bytes = await IoUtil.readAll(source, { maxBytes });
    } catch (error) {
      throw new TorrentParseError('Failed to read torrent data', { cause: error });
    }
  }

  // ── 2. Decode bencode ──────────────────────────────────────────────────────
  let decoded: unknown;
  let pieceLayers: TorrentPieceLayer[] | undefined;
  try {
    const raw = decode(bytes);
    if (raw instanceof Map && raw.has('piece layers')) {
      pieceLayers = normalizePieceLayers(raw.get('piece layers'));
      raw.delete('piece layers');
    }
    decoded = normalizeDecodedValue(raw);
  } catch (error) {
    const message = error instanceof BencodeDecodeError ? error.message : 'Invalid bencode data';
    throw new TorrentParseError(message, { cause: error });
  }

  // ── 3. Validate structure ──────────────────────────────────────────────────
  if (!isDictionary(decoded)) {
    throw new TorrentParseError(
      'Torrent root must be a bencode dictionary, got: ' + (Array.isArray(decoded) ? 'list' : typeof decoded),
    );
  }

  const dictionary = decoded;
  if (pieceLayers !== undefined) dictionary['piece layers'] = pieceLayers;
  validateOptionalString(dictionary, 'announce');
  if (dictionary['announce'] === '') {
    throw new TorrentParseError('Invalid "announce" field — expected a non-empty URL string');
  }
  validateOptionalString(dictionary, 'comment');
  validateOptionalString(dictionary, 'created by');
  validateOptionalString(dictionary, 'source');
  if (dictionary['announce-list'] !== undefined && !validateAnnounceList(dictionary['announce-list'])) {
    throw new TorrentParseError('Invalid "announce-list" field — expected a string array of string arrays');
  }
  if (
    dictionary['url-list'] !== undefined &&
    !(typeof dictionary['url-list'] === 'string' ||
      (Array.isArray(dictionary['url-list']) && dictionary['url-list'].length > 0 &&
        dictionary['url-list'].every((url) => typeof url === 'string' && url.length > 0)))
  ) {
    throw new TorrentParseError('Invalid "url-list" field — expected a non-empty string or non-empty string array');
  }
  if (dictionary['url-list'] === '') {
    throw new TorrentParseError('Invalid "url-list" field — expected a non-empty URL string');
  }
  if (dictionary['creation date'] !== undefined && !isNonNegativeInteger(dictionary['creation date'])) {
    throw new TorrentParseError('Invalid "creation date" field — expected a non-negative integer');
  }

  const info = dictionary['info'];

  if (!isDictionary(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }

  const infoDict = info;

  if (infoDict['meta version'] !== undefined && infoDict['meta version'] !== 2) {
    throw new TorrentParseError(`Unsupported "info.meta version": ${String(infoDict['meta version'])}`);
  }

  if (!isSafePathComponent(infoDict['name'])) {
    throw new TorrentParseError('Missing or invalid "info.name" field — expected a safe file or directory name');
  }

  if (!isSafeInteger(infoDict['piece length']) || infoDict['piece length'] <= 0) {
    throw new TorrentParseError('Missing or invalid "info.piece length" field — expected a positive integer');
  }

  if (infoDict['private'] !== undefined && infoDict['private'] !== 0 && infoDict['private'] !== 1) {
    throw new TorrentParseError('Invalid "info.private" field — expected 0 or 1');
  }

  if (infoDict['meta version'] === 2) {
    const hasV1Fields = infoDict['pieces'] !== undefined || infoDict['length'] !== undefined ||
      infoDict['files'] !== undefined;
    if (hasV1Fields) validateV1Fields(infoDict);
    const files = pieceLayers === undefined && options.allowMissingPieceLayers === true
      ? flattenV2Files(infoDict as unknown as TorrentV2Info)
      : await validateV2PieceLayers(infoDict as unknown as TorrentV2Info, pieceLayers ?? []);
    validateHybridLayout(infoDict as unknown as Torrent['info'], files);
  } else {
    if (pieceLayers !== undefined) throw new TorrentParseError('BEP-3 torrent must not contain "piece layers"');
    validateV1Fields(infoDict);
  }

  return decoded as Torrent;
}

function validateV1Fields(infoDict: Record<string, unknown>): void {
  if (typeof infoDict['pieces'] === 'string') infoDict['pieces'] = new TextEncoder().encode(infoDict['pieces']);
  if (!(infoDict['pieces'] instanceof Uint8Array) || infoDict['pieces'].length % 20 !== 0) {
    throw new TorrentParseError('Invalid "info.pieces" field — expected a Uint8Array whose length is a multiple of 20');
  }
  if (infoDict['length'] !== undefined && !isNonNegativeInteger(infoDict['length'])) {
    throw new TorrentParseError('Invalid "info.length" field — expected a non-negative integer');
  }
  if (infoDict['files'] !== undefined) {
    if (!Array.isArray(infoDict['files']) || infoDict['files'].length === 0) {
      throw new TorrentParseError('Invalid "info.files" field — expected at least one file');
    }
    if (infoDict['length'] !== undefined) {
      throw new TorrentParseError('Torrent info must not contain both "length" and "files"');
    }
    infoDict['files'].forEach(validateTorrentFile);
    validateFilePaths(infoDict['files']);
  }
  if (infoDict['length'] === undefined && infoDict['files'] === undefined) {
    throw new TorrentParseError('Torrent info must contain either "length" or "files"');
  }
  const totalLength = infoDict['length'] ??
    (infoDict['files'] as Record<string, unknown>[]).reduce((total, file) => total + (file['length'] as number), 0);
  if (!Number.isSafeInteger(totalLength)) {
    throw new TorrentParseError('Torrent content length exceeds the safe integer range');
  }
  const expectedPiecesLength = Math.ceil((totalLength as number) / (infoDict['piece length'] as number)) * 20;
  if (infoDict['pieces'].length !== expectedPiecesLength) {
    throw new TorrentParseError(
      `Invalid "info.pieces" field — expected ${expectedPiecesLength} bytes for ${totalLength} content bytes`,
    );
  }
}

function normalizePieceLayers(value: unknown): TorrentPieceLayer[] {
  if (!(value instanceof Map)) throw new TorrentParseError('Invalid "piece layers" field — expected a dictionary');
  const layers: TorrentPieceLayer[] = [];
  for (const [root, hashes] of value) {
    const piecesRoot = binaryBytes(root);
    const hashBytes = binaryBytes(hashes);
    layers.push({ piecesRoot, hashes: hashBytes });
  }
  return layers;
}

function binaryBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  throw new TorrentParseError('BEP-52 hash fields must be byte strings');
}

````

---

## Arquivo: `docs/deno-torrent/metainfo/path.ts`

```ts
/** Internal path and ordering helpers shared by parsing and generation. @module */

/** Compare strings deterministically without depending on the host locale. */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Return whether a torrent path component is safe to interpret on common
 * filesystems. Separators, NUL, and traversal components are never valid file
 * or directory names in metainfo produced by this package.
 */
export function isSafePathComponent(component: unknown): component is string {
  return typeof component === 'string' &&
    component.length > 0 &&
    component !== '.' &&
    component !== '..' &&
    !component.includes('/') &&
    !component.includes('\\') &&
    !component.includes('\0');
}

```

---

## Arquivo: `docs/deno-torrent/metainfo/types.ts`

````ts
/**
 * Shared public contracts for torrent parsing and generation.
 * @module
 */

/** Minimal asynchronous byte source implemented by `Deno.FsFile`. */
export interface Reader {
  /** Fill `buffer`, returning the byte count or `null` at end-of-stream. */
  read(buffer: Uint8Array): Promise<number | null>;
}

/** Default maximum encoded torrent size accepted by {@link parseTorrent}. */
export const DEFAULT_MAX_METAINFO_SIZE = 16 * 1024 * 1024;

/** Resource limits accepted by {@link parseTorrent}. */
export interface ParseTorrentOptions {
  /** Maximum encoded metainfo size in bytes. Defaults to 16 MiB. */
  maxBytes?: number;
  /** Allow BEP-9 v2 info metadata before its outer piece layers are fetched. */
  allowMissingPieceLayers?: boolean;
}

/**
 * A minimal write interface compatible with {@link Deno.FsFile} and any
 * destination that accepts raw byte chunks.
 *
 * Use `Deno.openSync` / `Deno.open` to obtain a compatible writer backed by
 * a real file, or create an in-memory buffer for testing.
 */
export interface Writer {
  /** Write up to `p.length` bytes and return the number accepted. */
  write(p: Uint8Array): Promise<number>;
}

/**
 * Piece-size presets for torrent generation.
 *
 * The values represent the actual byte size of each piece.
 * `SIZE_AUTO` instructs the generator to select an appropriate size
 * automatically based on the total size of the input files.
 *
 * Presets range from 16 MiB to 16 GiB. Piece hashing is incremental, so the
 * selected logical piece length does not determine memory-buffer size.
 *
 * @example
 * ```ts
 * import { PieceSizeEnum } from 'jsr:@deno-torrent/metainfo@1'
 * console.log(PieceSizeEnum.SIZE_AUTO)   // 0
 * console.log(PieceSizeEnum.SIZE_16MB)   // 16777216
 * ```
 */
export enum PieceSizeEnum {
  /** Automatically select the best piece size based on total file size. */
  SIZE_AUTO = 0,
  SIZE_16MB = 16 * 1024 * 1024,
  SIZE_32MB = 32 * 1024 * 1024,
  SIZE_64MB = 64 * 1024 * 1024,
  SIZE_128MB = 128 * 1024 * 1024,
  SIZE_256MB = 256 * 1024 * 1024,
  SIZE_512MB = 512 * 1024 * 1024,
  SIZE_1GB = 1024 * 1024 * 1024,
  SIZE_2GB = 2 * 1024 * 1024 * 1024,
  SIZE_4GB = 4 * 1024 * 1024 * 1024,
  SIZE_8GB = 8 * 1024 * 1024 * 1024,
  SIZE_16GB = 16 * 1024 * 1024 * 1024,
}

/**
 * Options for {@link generateTorrent}.
 *
 * @example
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from 'jsr:@deno-torrent/metainfo@1'
 *
 * const file = await Deno.open("output.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/path/to/content",
 *   writer: file,
 *   trackers: [new URL("udp://tracker.example.com:6969")],
 * })
 * file.close()
 * ```
 */
export type GeneratorOption = {
  /**
   * Destination writer that receives the raw bencoded torrent bytes.
   * Compatible with any {@link Deno.FsFile} or in-memory buffer.
   */
  writer: Writer;

  /**
   * Absolute path to the file or directory to include in the torrent.
   * For a single file this produces a *single-file* torrent; for a directory
   * a *multi-file* torrent is produced.
   */
  entry: string;

  /**
   * Piece size preset.  Defaults to {@link PieceSizeEnum.SIZE_AUTO}, which
   * selects the smallest preset larger than the total content size (capped at
   * {@link PieceSizeEnum.SIZE_512MB}).
   */
  pieceSizeEnum?: PieceSizeEnum;

  /**
   * When `true`, files and directories whose names begin with `.` are
   * excluded from the torrent.  Defaults to `false`.
   */
  ignoreHiddenFile?: boolean;

  /**
   * When `true`, inserts BEP-47 padding files between non-empty files so each
   * real file starts on a piece boundary. Padding files are logical torrent
   * entries filled with zero bytes and are not created on disk. Defaults to
   * `false` to preserve the standard continuous multi-file layout.
   */
  alignPiece?: boolean;

  /**
   * When `true`, sets the `info.private` flag to `1` in the torrent, which
   * prevents DHT and PEX from being used by compatible clients.
   * Defaults to `false`.
   */
  isPrivate?: boolean;

  /**
   * One or more tracker announce URLs.
   * The first (after sorting) becomes the `announce` field; when more than
   * one tracker is given, an `announce-list` field is also written.
   */
  trackers: readonly URL[];

  /**
   * Optional list of HTTP/FTP web-seed URLs (BEP-19 / GetRight style).
   * A single URL is stored as a string; multiple URLs as a string array.
   */
  webSeeds?: readonly URL[];

  /**
   * Optional free-form source string (e.g. the URL of the page where the
   * torrent was first announced).
   */
  source?: string;

  /** Optional human-readable comment embedded in the torrent metadata. */
  comment?: string;

  /**
   * Name of the program that created the torrent.
   * Defaults to `deno-torrent-metainfo@<version>`.
   */
  createdBy?: string;

  /**
   * Unix timestamp (seconds) for the `creation date` field.
   * Defaults to the current time at the moment `generateTorrent` is called.
   */
  createdAt?: number;
};

/** A file entry inside the `info.files` list of a multi-file torrent. */
export interface TorrentFile {
  /** File size in bytes. */
  length: number;
  /** Path components relative to the torrent's top-level directory. */
  path: string[];
  /** BEP-47 file attributes; padding entries contain `p`. */
  attr?: string;
}

/** One file terminal in a BEP-52 file tree. */
export interface TorrentV2File {
  /** File size in bytes. */
  length: number;
  /** SHA-256 Merkle root for non-empty file content. */
  'pieces root'?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
}

/** Recursive BEP-52 file tree. File properties are stored under the empty key. */
export interface TorrentFileTree {
  /** A safe path component, or the empty terminal key containing file properties. */
  [component: string]: TorrentFileTree | TorrentV2File;
}

/** One BEP-52 piece layer, keyed by its file's Merkle root. */
export interface TorrentPieceLayer {
  /** The 32-byte Merkle root identifying the file. */
  piecesRoot: Uint8Array;
  /** Concatenated 32-byte SHA-256 hashes at the torrent piece layer. */
  hashes: Uint8Array;
}

/** Fields shared by BEP-3 and BEP-52 info dictionaries. */
export type TorrentInfoCommon = {
  /** Suggested file name or top-level directory name. */
  name: string;
  /** Nominal piece size in bytes. */
  'piece length': number;
  /** Private flag; `1` tells clients not to use DHT or peer exchange. */
  private?: 0 | 1;
};

/** Complete single-file or multi-file BEP-3 `info` dictionary. */
export type TorrentV1Info =
  & TorrentInfoCommon
  & {
    /** Concatenated 20-byte SHA-1 hashes, one per piece. */
    pieces: Uint8Array;
    'meta version'?: never;
    'file tree'?: never;
  }
  & (
    | { length: number; files?: never }
    | { files: TorrentFile[]; length?: never }
  );

/** BEP-52 info dictionary. Optional v1 fields make this a hybrid torrent. */
export type TorrentV2Info = TorrentInfoCommon & {
  'meta version': 2;
  'file tree': TorrentFileTree;
  pieces?: Uint8Array;
  length?: number;
  files?: TorrentFile[];
};

/** A validated BEP-3, BEP-52, or hybrid info dictionary. */
export type TorrentInfo = TorrentV1Info | TorrentV2Info;

/**
 * Public representation of a parsed or generated `.torrent` dictionary.
 *
 * Keys follow the official BitTorrent specification naming conventions
 * (including spaces and hyphens).
 */
export type Torrent = {
  /** Name and version of the creating program, when recorded. */
  'created by'?: string;
  /** Unix timestamp (seconds since epoch), when recorded. */
  'creation date'?: number;
  /** Primary tracker announce URL (first tracker, sorted). */
  announce?: string;
  /**
   * Full tracker list in the multi-tracker extension format (BEP-12).
   * Each inner array is a tier; currently each tier contains exactly one URL.
   */
  'announce-list'?: string[][];
  /**
   * Web-seed URL(s) (BEP-19).
   * A single URL is stored as a plain string; multiple URLs as an array.
   */
  'url-list'?: string | string[];
  /** Core metadata dictionary hashed to produce the info-hash. */
  info: TorrentInfo;
  /** BEP-52 hashes at the logical piece layer. */
  'piece layers'?: TorrentPieceLayer[];
  /** Optional human-readable comment. */
  comment?: string;
  /** Optional source identifier. */
  source?: string;
};

````

---

## Arquivo: `docs/deno-torrent/metainfo/utils.ts`

````ts
/**
 * File discovery, piece layout, hashing, and version helpers used by generation.
 * @module
 */

import { walk } from '@std/fs/walk';
import { basename, relative, SEPARATOR } from '@std/path';
import { BytesUtil, HashUtil, MultiFileReader } from '@deno-torrent/toolkit';
import { PieceSizeEnum } from './types.ts';

import denoConfig from '../deno.json' with { type: 'json' };

const PACKAGE_VERSION: string = denoConfig.version;
const HASH_CHUNK_SIZE = 1024 * 1024;
const ZERO_CHUNK = new Uint8Array(HASH_CHUNK_SIZE);

/** Incrementally hashes one logical piece at a time with bounded memory. */
class PieceHasher {
  readonly #pieceSize: number;
  readonly #digests: Uint8Array[] = [];
  readonly #hasher = HashUtil.createSha1();
  #pieceOffset = 0;

  constructor(pieceSize: number) {
    this.#pieceSize = pieceSize;
  }

  update(data: Uint8Array): void {
    let offset = 0;
    while (offset < data.length) {
      const length = Math.min(this.#pieceSize - this.#pieceOffset, data.length - offset);
      this.#hasher.update(data.subarray(offset, offset + length));
      this.#pieceOffset += length;
      offset += length;
      if (this.#pieceOffset === this.#pieceSize) this.#finishPiece();
    }
  }

  updateZeros(length: number): void {
    let remaining = length;
    while (remaining > 0) {
      const count = Math.min(remaining, ZERO_CHUNK.length);
      this.update(ZERO_CHUNK.subarray(0, count));
      remaining -= count;
    }
  }

  digest(): Uint8Array {
    if (this.#pieceOffset > 0) this.#finishPiece();
    return BytesUtil.concat(...this.#digests);
  }

  #finishPiece(): void {
    this.#digests.push(this.#hasher.digest());
    this.#hasher.reset();
    this.#pieceOffset = 0;
  }
}

/**
 * Returns all files under `entry`.
 *
 * - If `entry` is a regular file the single-element array `[entry]` is returned.
 * - If `entry` is a directory it is walked recursively; directories themselves
 *   are excluded from the result.
 *
 * @param entry - Absolute path to a file or directory.
 * @param ignoreHiddenFile - When `true`, entries whose base name starts with
 *   `.` are omitted.
 * @returns Ordered list of absolute file paths found under `entry`.
 * @throws {Deno.errors.NotFound} If `entry` does not exist.
 */
export async function obtainFiles(
  entry: string,
  ignoreHiddenFile: boolean,
): Promise<string[]> {
  const stat = await Deno.stat(entry);
  if (stat.isFile) return ignoreHiddenFile && isHiddenFile(entry) ? [] : [entry];

  const files: string[] = [];
  for await (const item of walk(entry, { includeFiles: true, includeDirs: false })) {
    if (
      ignoreHiddenFile &&
      relative(entry, item.path).split(SEPARATOR).some((component) => component.startsWith('.'))
    ) continue;
    files.push(item.path);
  }
  return files;
}

/**
 * Computes the concatenated SHA-1 digests (pieces) for a set of files.
 *
 * Files are read sequentially as a single byte stream using
 * {@link MultiFileReader}.  The stream is divided into chunks of `pieceSize`
 * bytes; the last chunk may be smaller.  Each chunk's SHA-1 digest (20 bytes)
 * is appended to the result.
 *
 * @param files - Ordered list of file paths to hash.
 * @param pieceSize - Number of bytes per piece (must be ≥ 1).
 * @param alignPiece - When `true`, inserts zero-filled BEP-47 padding between files.
 * @returns `Uint8Array` whose length is a multiple of 20 (20 bytes per piece).
 * @throws {RangeError} If `pieceSize` is less than 1.
 */
export async function sha1sum(
  files: string[],
  pieceSize: number,
  alignPiece = false,
  alignedFiles?: readonly PieceFile[],
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(pieceSize) || pieceSize < 1) {
    throw new RangeError('pieceSize must be a positive safe integer');
  }

  if (alignPiece) return await sha1sumAligned(alignedFiles ?? await buildPieceFiles(files, pieceSize), pieceSize);

  const pieceHasher = new PieceHasher(pieceSize);
  const reader = new MultiFileReader(files);
  try {
    for await (const chunk of reader.chunks(HASH_CHUNK_SIZE)) {
      pieceHasher.update(chunk);
    }
  } finally {
    reader.close();
  }

  return pieceHasher.digest();
}

export type PieceFile = {
  file: string | null;
  length: number;
  padding: boolean;
};

/** Builds the logical file stream used by BEP-47 piece-aligned torrents. */
export async function buildPieceFiles(
  files: string[],
  pieceSize: number,
  knownSizes?: readonly number[],
): Promise<PieceFile[]> {
  if (!Number.isSafeInteger(pieceSize) || pieceSize < 1) {
    throw new RangeError('pieceSize must be a positive safe integer');
  }
  if (knownSizes !== undefined && knownSizes.length !== files.length) {
    throw new RangeError('knownSizes must contain one size for every file');
  }
  const sizes = knownSizes ?? await Promise.all(files.map(async (file) => (await Deno.stat(file)).size));
  if (sizes.some((size) => !Number.isSafeInteger(size) || size < 0)) {
    throw new RangeError('File sizes must be non-negative safe integers');
  }
  const pieceFiles: PieceFile[] = [];
  let pieceOffset = 0;

  for (let index = 0; index < files.length; index++) {
    const length = sizes[index];
    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset;
      pieceFiles.push({ file: null, length: paddingLength, padding: true });
      pieceOffset = 0;
    }

    pieceFiles.push({ file: files[index], length, padding: false });
    pieceOffset = (pieceOffset + length) % pieceSize;
  }

  return pieceFiles;
}

async function sha1sumAligned(pieceFiles: readonly PieceFile[], pieceSize: number): Promise<Uint8Array> {
  const pieceHasher = new PieceHasher(pieceSize);

  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      pieceHasher.updateZeros(pieceFile.length);
      continue;
    }

    const reader = new MultiFileReader([pieceFile.file!]);
    try {
      for await (const chunk of reader.chunks(HASH_CHUNK_SIZE)) {
        pieceHasher.update(chunk);
      }
    } finally {
      reader.close();
    }
  }

  return pieceHasher.digest();
}

/**
 * Selects an appropriate piece size for the given total file size.
 *
 * When `pieceSizeEnum` is {@link PieceSizeEnum.SIZE_AUTO} the function
 * returns the smallest preset that is larger than `fileSize`, capped at
 * {@link PieceSizeEnum.SIZE_512MB}.  For any other preset the supplied value
 * is returned unchanged.
 *
 * @param fileSize - Total content size in bytes.
 * @param pieceSizeEnum - Desired preset, or `SIZE_AUTO` for heuristic selection.
 * @returns Piece size in bytes (≥ 1).
 */
export function calcPieceSize(fileSize: number, pieceSizeEnum: PieceSizeEnum): number {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new RangeError('fileSize must be a non-negative safe integer');
  }

  const allowedValues = Object.values(PieceSizeEnum).filter((value): value is number => typeof value === 'number');
  if (!Number.isSafeInteger(pieceSizeEnum) || !allowedValues.includes(pieceSizeEnum)) {
    throw new RangeError(`pieceSizeEnum is not a supported preset: ${pieceSizeEnum}`);
  }

  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum;
  }

  // Numeric enums also expose their member names, so keep only byte values.
  const presets = allowedValues
    .filter((value) => value !== 0)
    .sort((a, b) => a - b);

  // Pick the smallest preset that exceeds the total file size.
  const selected = presets.find((preset) => fileSize < preset) ?? presets[presets.length - 1];

  // Cap at SIZE_512MB to avoid unreasonably large pieces
  return Math.min(selected, PieceSizeEnum.SIZE_512MB as number);
}

/**
 * Returns the default `created by` string embedded in new torrents.
 *
 * Format: `deno-torrent-metainfo@<version>`.
 *
 * @returns Creator identifier string.
 */
export function getDefaultCreatedBy(): string {
  return `deno-torrent-metainfo@${PACKAGE_VERSION}`;
}

/**
 * Returns `true` when the base name of `filePath` starts with `.`.
 *
 * @param filePath - Any file path (absolute or relative).
 * @returns Whether the file is considered hidden.
 *
 * @example
 * ```ts
 * isHiddenFile(".DS_Store")   // true
 * isHiddenFile("readme.txt")  // false
 * ```
 */
export function isHiddenFile(filePath: string): boolean {
  return basename(filePath).startsWith('.');
}

````

---

## Arquivo: `docs/deno-torrent/metainfo/v2.ts`

```ts
import { isSafePathComponent } from './path.ts';
import { TorrentParseError } from './parser.ts';
import type {
  TorrentFile,
  TorrentFileTree,
  TorrentInfo,
  TorrentPieceLayer,
  TorrentV2File,
  TorrentV2Info,
} from './types.ts';

const BLOCK_LENGTH = 16 * 1024;
const MAX_FILE_TREE_DEPTH = 256;
const MAX_FILE_COUNT = 1_000_000;

/** One flattened file in the BEP-52 piece address space. */
export interface TorrentV2FileEntry {
  /** Safe path components from the file-tree root. */
  path: string[];
  /** File size in bytes. */
  length: number;
  /** File Merkle root, absent only for empty files. */
  piecesRoot?: Uint8Array;
  /** Optional BEP-52 file attributes. */
  attr?: string;
  /** First piece index in the v2 piece address space. */
  pieceStart: number;
  /** Number of logical torrent pieces occupied by this file. */
  pieceCount: number;
}

/** Flatten and validate a BEP-52 file tree in its canonical traversal order. */
export function flattenV2Files(info: TorrentV2Info): TorrentV2FileEntry[] {
  if (
    !Number.isSafeInteger(info['piece length']) || info['piece length'] < BLOCK_LENGTH ||
    !isPowerOfTwo(info['piece length'])
  ) {
    throw new TorrentParseError('Invalid "info.piece length" field for v2 — expected a power of two of at least 16384');
  }
  if (!isDictionary(info['file tree'])) throw new TorrentParseError('Missing or invalid "info.file tree" dictionary');

  const files: TorrentV2FileEntry[] = [];
  const stack: Array<{ node: TorrentFileTree; path: string[]; depth: number }> = [
    { node: info['file tree'], path: [], depth: 0 },
  ];
  let pieceStart = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > MAX_FILE_TREE_DEPTH) throw new TorrentParseError('Torrent v2 file tree is too deep');
    const entries = Object.entries(current.node);
    if (entries.length === 0) throw new TorrentParseError('Torrent v2 file tree contains an empty directory');
    const terminal = Object.prototype.hasOwnProperty.call(current.node, '');
    if (terminal) {
      if (current.path.length === 0) throw new TorrentParseError('Torrent v2 file tree root must not be a file');
      if (entries.length !== 1) throw new TorrentParseError('Torrent v2 file entry must not contain child paths');
      const properties = current.node[''];
      validateFileProperties(properties, current.path);
      const file = properties as TorrentV2File;
      const pieceCount = file.length === 0 ? 0 : Math.ceil(file.length / info['piece length']);
      files.push({
        path: current.path,
        length: file.length,
        piecesRoot: file['pieces root'],
        attr: file.attr,
        pieceStart,
        pieceCount,
      });
      pieceStart += pieceCount;
      if (files.length > MAX_FILE_COUNT) throw new TorrentParseError('Torrent v2 contains too many files');
      continue;
    }

    for (let index = entries.length - 1; index >= 0; index--) {
      const [component, child] = entries[index];
      if (!isSafePathComponent(component)) {
        throw new TorrentParseError(`Invalid v2 file tree path component: ${JSON.stringify(component)}`);
      }
      if (!isDictionary(child)) {
        throw new TorrentParseError(`Invalid v2 file tree node: ${[...current.path, component].join('/')}`);
      }
      stack.push({ node: child as TorrentFileTree, path: [...current.path, component], depth: current.depth + 1 });
    }
  }
  if (files.length === 0) throw new TorrentParseError('Torrent v2 file tree must contain at least one file');
  return files;
}

/** Validate all BEP-52 piece layers against the file-tree Merkle roots. */
export async function validateV2PieceLayers(
  info: TorrentV2Info,
  layers: readonly TorrentPieceLayer[],
): Promise<TorrentV2FileEntry[]> {
  const files = flattenV2Files(info);
  const byRoot = new Map<string, TorrentPieceLayer>();
  for (const layer of layers) {
    if (layer.piecesRoot.length !== 32) throw new TorrentParseError('Invalid "piece layers" key — expected 32 bytes');
    if (layer.hashes.length === 0 || layer.hashes.length % 32 !== 0) {
      throw new TorrentParseError('Invalid "piece layers" value — expected one or more 32-byte hashes');
    }
    const key = toHex(layer.piecesRoot);
    if (byRoot.has(key)) throw new TorrentParseError('Duplicate BEP-52 piece layer root');
    byRoot.set(key, layer);
  }

  const used = new Set<string>();
  for (const file of files) {
    if (file.length === 0) {
      if (file.piecesRoot !== undefined) {
        throw new TorrentParseError(`Empty v2 file must not have a pieces root: ${file.path.join('/')}`);
      }
      continue;
    }
    if (file.piecesRoot?.length !== 32) {
      throw new TorrentParseError(`Non-empty v2 file has no valid pieces root: ${file.path.join('/')}`);
    }
    if (file.length <= info['piece length']) continue;
    const key = toHex(file.piecesRoot);
    const layer = byRoot.get(key);
    if (!layer) throw new TorrentParseError(`Missing piece layer for v2 file: ${file.path.join('/')}`);
    if (layer.hashes.length !== file.pieceCount * 32) {
      throw new TorrentParseError(`Invalid piece layer hash count for v2 file: ${file.path.join('/')}`);
    }
    const calculated = await merkleRootFromPieceLayer(layer.hashes, info['piece length']);
    if (!equals(calculated, file.piecesRoot)) {
      throw new TorrentParseError(`Piece layer does not match pieces root for v2 file: ${file.path.join('/')}`);
    }
    used.add(key);
  }
  if (used.size !== byRoot.size) {
    throw new TorrentParseError('Piece layers contain an entry not required by the v2 file tree');
  }
  return files;
}

/** Ensure the v1 and v2 halves of a hybrid torrent describe identical files and alignment. */
export function validateHybridLayout(info: TorrentInfo, v2Files: readonly TorrentV2FileEntry[]): void {
  if (info['meta version'] !== 2 || info.pieces === undefined) return;
  const v1Files: TorrentFile[] = info.files ?? [{ length: info.length!, path: [info.name] }];
  const realV1 = v1Files.filter((file) => !file.attr?.includes('p'));
  if (realV1.length !== v2Files.length) throw new TorrentParseError('Hybrid torrent v1/v2 file counts do not match');

  let v1Offset = 0;
  let realIndex = 0;
  for (const file of v1Files) {
    if (file.attr?.includes('p')) {
      v1Offset += file.length;
      continue;
    }
    const v2 = v2Files[realIndex++];
    if (v1Offset % info['piece length'] !== 0 && realIndex > 1) {
      throw new TorrentParseError(`Hybrid torrent file is not piece-aligned: ${file.path.join('/')}`);
    }
    if (file.length !== v2.length || !samePath(file.path, v2.path)) {
      throw new TorrentParseError(`Hybrid torrent v1/v2 file layout differs at: ${file.path.join('/')}`);
    }
    v1Offset += file.length;
  }
}

async function merkleRootFromPieceLayer(hashes: Uint8Array, pieceLength: number): Promise<Uint8Array> {
  const nodes = splitHashes(hashes);
  const target = nextPowerOfTwo(nodes.length);
  let zero: Uint8Array<ArrayBufferLike> = new Uint8Array(32);
  for (let size = BLOCK_LENGTH; size < pieceLength; size *= 2) zero = await hashPair(zero, zero);
  while (nodes.length < target) nodes.push(zero);
  while (nodes.length > 1) {
    const next: Uint8Array[] = [];
    for (let index = 0; index < nodes.length; index += 2) next.push(await hashPair(nodes[index], nodes[index + 1]));
    nodes.splice(0, nodes.length, ...next);
  }
  return nodes[0];
}

async function hashPair(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const bytes = new Uint8Array(64);
  bytes.set(left);
  bytes.set(right, 32);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function splitHashes(bytes: Uint8Array): Uint8Array[] {
  const hashes: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32) hashes.push(bytes.slice(offset, offset + 32));
  return hashes;
}

function validateFileProperties(value: unknown, path: readonly string[]): void {
  if (!isDictionary(value)) throw new TorrentParseError(`Invalid v2 file properties: ${path.join('/')}`);
  if (!Number.isSafeInteger(value.length) || (value.length as number) < 0) {
    throw new TorrentParseError(`Invalid v2 file length: ${path.join('/')}`);
  }
  if (value.attr !== undefined && typeof value.attr !== 'string') {
    throw new TorrentParseError(`Invalid v2 file attributes: ${path.join('/')}`);
  }
  if (typeof value['pieces root'] === 'string') value['pieces root'] = new TextEncoder().encode(value['pieces root']);
  if (value['pieces root'] !== undefined && !(value['pieces root'] instanceof Uint8Array)) {
    throw new TorrentParseError(`Invalid v2 pieces root: ${path.join('/')}`);
  }
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (Math.log2(value) % 1 === 0);
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function equals(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

```

---

## Arquivo: `docs/deno-torrent/peerid/constant.ts`

```ts
// 大写字母 A-Z
const UPPER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// 小写字母 a-z
const LOWER_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// 数字 0-9
const DIGITALS = "0123456789".split("");

// 其他可显示 ASCII 字符（除字母和数字以外的可打印字符）
const OTHER_CHARS = "!\"#$%&'()*+,-./:;<=>?@[]^_`{|}~".split("");

// 所有字母（大写 + 小写）
const LETTERS = [...UPPER_LETTERS, ...LOWER_LETTERS];

/**
 * Shadow 风格版本字符编码表（索引即数值，共 64 个字符）。
 *
 * 编码规则（来自 BitTorrent 规范）：
 * `'0'-'9'=0-9`，`'A'-'Z'=10-35`，`'a'-'z'=36-61`，`'.'=62`，`'-'=63`
 *
 * @see https://wiki.theory.org/BitTorrentSpecification
 */
const SHADOW_STYLE_VERSION_CHARS = [
  ...DIGITALS,
  ...UPPER_LETTERS,
  ...LOWER_LETTERS,
  ".",
  "-",
];

/**
 * 随机字符串生成池：所有可显示 ASCII 字符（不含空格，33-126）。
 * 用于填充 PeerId 的随机部分。
 */
const VISIBLE_CHARS = [...LETTERS, ...DIGITALS, ...OTHER_CHARS];

export {
  DIGITALS,
  LETTERS,
  LOWER_LETTERS,
  OTHER_CHARS,
  SHADOW_STYLE_VERSION_CHARS,
  UPPER_LETTERS,
  VISIBLE_CHARS,
};

```

---

## Arquivo: `docs/deno-torrent/peerid/enum.ts`

```ts
// Azureus风格使用以下编码：'-'，两个字符表示客户端ID，四个ASCII数字表示版本号，'-'，后跟随机数字。
// 例如：'-AZ2060-' 2060是Azureus的版本号
/**
 * Known client identifiers using the Azureus-style PeerId format.
 */
export enum AZStyleClient {
  "7T" = "aTorrent for Android",
  "AB" = "AnyEvent::BitTorrent",
  "AG" = "Ares",
  "A~" = "Ares",
  "AR" = "Arctic",
  "AV" = "Avicora",
  "AT" = "Artemis",
  "AX" = "BitPump",
  "AZ" = "Azureus",
  "BB" = "BitBuddy",
  "BC" = "BitComet",
  "BE" = "Baretorrent",
  "BF" = "Bitflu",
  "BG" = "BTG (uses Rasterbar libtorrent)",
  "BL" = "BitCometLite (uses 6 digit version number)",
  "BP" = "BitTorrent Pro (Azureus + spyware)",
  "BR" = "BitRocket",
  "BS" = "BTSlave",
  "BT" = "mainline BitTorrent (versions >= 7.9)",
  "Bt" = "Bt",
  "BW" = "BitWombat",
  "BX" = "~Bittorrent X",
  "CD" = "Enhanced CTorrent",
  "CT" = "CTorrent",
  "DE" = "DelugeTorrent",
  "DP" = "Propagate Data Client",
  "EB" = "EBit",
  "ES" = "electric sheep",
  "FC" = "FileCroc",
  "FD" = "Free Download Manager (versions >= 5.1.12)",
  "FT" = "FoxTorrent",
  "FX" = "Freebox BitTorrent",
  "GS" = "GSTorrent",
  "HK" = "Hekate",
  "HL" = "Halite",
  "HM" = "hMule (uses Rasterbar libtorrent)",
  "HN" = "Hydranode",
  "IL" = "iLivid",
  "JS" = "Justseed.it client",
  "JT" = "JavaTorrent",
  "KG" = "KGet",
  "KT" = "KTorrent",
  "LC" = "LeechCraft",
  "LH" = "LH-ABC",
  "LP" = "Lphant",
  "LT" = "libtorrent",
  "lt" = "libTorrent",
  "LW" = "LimeWire",
  "MK" = "Meerkat",
  "MO" = "MonoTorrent",
  "MP" = "MooPolice",
  "MR" = "Miro",
  "MT" = "MoonlightTorrent",
  "NB" = "Net::BitTorrent",
  "NX" = "Net Transport",
  "OS" = "OneSwarm",
  "OT" = "OmegaTorrent",
  "PB" = "Protocol::BitTorrent",
  "PD" = "Pando",
  "PI" = "PicoTorrent",
  "PT" = "PHPTracker",
  "qB" = "qBittorrent",
  "QD" = "QQDownload",
  "QT" = "Qt 4 Torrent example",
  "RT" = "Retriever",
  "RZ" = "RezTorrent",
  "S~" = "Shareaza alpha/beta",
  "SB" = "~Swiftbit",
  "SD" = "Thunder (aka XùnLéi)",
  "SM" = "SoMud",
  "SP" = "BitSpirit",
  "SS" = "SwarmScope",
  "ST" = "SymTorrent",
  "st" = "sharktorrent",
  "SZ" = "Shareaza",
  "TB" = "Torch",
  "TE" = "terasaur Seed Bank",
  "TL" = "Tribler (versions >= 6.1.0)",
  "TN" = "TorrentDotNET",
  "TR" = "Transmission",
  "TS" = "Torrentstorm",
  "TT" = "TuoTu",
  "UL" = "uLeecher!",
  "UM" = "µTorrent for Mac",
  "UT" = "µTorrent",
  "VG" = "Vagaa",
  "WD" = "WebTorrent Desktop",
  "WT" = "BitLet",
  "WW" = "WebTorrent",
  "WY" = "FireTorrent",
  "XF" = "Xfplay",
  "XL" = "Xunlei",
  "XS" = "XSwifter",
  "XT" = "XanTorrent",
  "XX" = "Xtorrent",
  "ZT" = "ZipTorrent",
}

// Shadow的样式使用以下编码：
// 一个ASCII字母数字用于客户端标识，最多五个字符用于版本号（如果少于五个，则用“-”填充），后跟三个字符（通常为“---”，但并非总是如此），后跟随机字符。
// 版本字符串中的每个字符表示从0到63的数字。 '0'=0，...，'9'=9，'A'=10，...，'Z'=35，'a'=36，...，'z'=61，'.'=62，'-'=63。
// Shadow对编码风格的完整解释（包括关于版本字符串后三个字符如何使用的现有约定的信息）可以在这里找到:http://forums.degreez.net/viewtopic.php?t=7070
// 例如：'S58B-----' 表示Shadow的5.8.11
/**
 * Known client identifiers using the Shadow-style PeerId format.
 */
export enum ShadowStyleClient {
  "A" = "ABC",
  "O" = "Osprey Permaseed",
  "Q" = "BTQueue",
  "R" = "Tribler(versions < 6.1.0)",
  "S" = "Shadow's Client",
  "T" = "BitTornado",
  "U" = "UPnP NAT Bit Torrent",
}

```

---

## Arquivo: `docs/deno-torrent/peerid/mod.ts`

````ts
/**
 * @module
 *
 * @deno-torrent/peerid — BitTorrent PeerId 编解码库。
 *
 * 支持 Azureus 风格（`-XX####-...`）和 Shadow 风格（`X###---...`）两种格式的编解码。
 *
 * @example 解码
 * ```ts
 * import { decode } from "@deno-torrent/peerid";
 *
 * decode("-AZ2060-Mb?3kG/qpRd^");
 * // => { code: "AZ", name: "Azureus", version: "2.0.60" }
 * ```
 *
 * @example 编码
 * ```ts
 * import { encodeAzStyle, encodeShadowStyle } from "@deno-torrent/peerid";
 *
 * new TextDecoder().decode(encodeAzStyle("AZ", "2.0.60"));
 * // => "-AZ2060-xxxxxxxxxx"
 *
 * new TextDecoder().decode(encodeShadowStyle("S", "5.8.11"));
 * // => "S58B-----xxxxxxxxxx"
 * ```
 */
export {
  decode,
  encode,
  encodeAzStyle,
  encodeShadowStyle,
} from "./src/peerid.ts";
export type { Client } from "./src/type.ts";
export { AZStyleClient, ShadowStyleClient } from "./src/enum.ts";

````

---

## Arquivo: `docs/deno-torrent/peerid/peerid.ts`

````ts
import type { Client } from "./type.ts";
import {
  getAzStyleClient,
  getShadowStyleClient,
  isAzStyle,
  isSemanticVersion,
  isShadowStyle,
  isUrlEncoded,
  randomStr,
  semanticVerToAzStyle,
  semanticVerToShadowStyle,
} from "./util.ts";

/**
 * 将输入源规范化为 20 字节的字符串。
 *
 * 支持以下输入类型：
 * - `Uint8Array`：直接通过 TextDecoder 解码
 * - `string`：若包含 URL 编码（`%nn` 格式）则先解码
 *
 * @param source 输入的 PeerId，可以是 Uint8Array 或 string
 * @returns 规范化后的 20 字节字符串
 * @throws 当 source 类型不支持或长度不足 20 字节时抛出错误
 */
function normalizeSource(source: Uint8Array | string): string {
  let result: string;

  if (source instanceof Uint8Array) {
    result = new TextDecoder().decode(source);
  } else if (typeof source === "string") {
    result = isUrlEncoded(source) ? decodeURIComponent(source) : source;
  } else {
    throw new TypeError("source 类型必须是 Uint8Array 或 string");
  }

  // https://wiki.theory.org/BitTorrentSpecification
  // peer_id: 20 字节字符串，作为客户端的唯一标识符
  if (result.length < 20) {
    throw new RangeError("source 长度必须不少于 20 字节");
  }

  return result.slice(0, 20);
}

function encodePeerId(peerId: string): Uint8Array {
  const encoded = new TextEncoder().encode(peerId);
  if (encoded.byteLength !== 20) {
    throw new RangeError("encoded PeerId must be exactly 20 bytes");
  }
  return encoded;
}

/**
 * 解码 BitTorrent PeerId，识别客户端类型、名称及版本号。
 *
 * 支持 Azureus 风格（`-XX####-...`）和 Shadow 风格（`X###---...`）两种格式。
 * 若无法识别则返回 `undefined`。
 *
 * @example
 * ```ts
 * import { decode } from "@deno-torrent/peerid";
 *
 * // 解码 Azureus 风格
 * decode("-AZ2060-Mb?3kG/qpRd^");
 * // => { code: "AZ", name: "Azureus", version: "2.0.60" }
 *
 * // 解码 Shadow 风格
 * decode("S58B-----IWl4Z*v.Jul");
 * // => { code: "S", name: "Shadow's Client", version: "5.8.11" }
 * ```
 *
 * @param source PeerId，可以是 Uint8Array 或 string（支持 URL 编码）
 * @returns 识别到的客户端信息，无法识别时返回 undefined
 */
export function decode(source: Uint8Array | string): Client | undefined {
  const peerid = normalizeSource(source);

  if (isAzStyle(peerid)) {
    return getAzStyleClient(peerid);
  }

  if (isShadowStyle(peerid)) {
    return getShadowStyleClient(peerid);
  }

  // TODO: 支持更多风格的 PeerId 解析
  return undefined;
}

/**
 * 编码 PeerId（统一入口）。
 *
 * @example
 * ```ts
 * import { encode } from "@deno-torrent/peerid";
 *
 * const peerid = encode({ code: "AZ", version: "2.0.60", style: "az" });
 * new TextDecoder().decode(peerid); // "-AZ2060-xxxxxxxxxx"
 * ```
 *
 * @param params 编码参数
 * @param params.code  客户端代号（Azureus 风格 2 位，Shadow 风格 1 位）
 * @param params.version 语义化版本号，格式 `major.minor.patch`
 * @param params.style 编码风格，`"az"` 或 `"shadow"`，默认 `"az"`
 * @returns 编码后的 20 字节 PeerId
 */
export function encode(
  { code, version, style = "az" }: {
    code: string;
    version: string;
    style?: "az" | "shadow";
  },
): Uint8Array {
  if (!isSemanticVersion(version)) {
    throw new Error(
      "version 格式必须是 x.x.x，例如 2.1.11；Azureus 风格 major/minor 范围 0-9，patch 范围 0-99",
    );
  }

  if (style === "az") {
    return encodeAzStyle(code, version);
  }

  if (style === "shadow") {
    return encodeShadowStyle(code, version);
  }

  throw new Error('style 必须是 "az" 或 "shadow"');
}

/**
 * 编码 Azureus 风格的 PeerId。
 *
 * 格式：`-{code}{version}-{random}`
 * - `code`：2 位可显示 ASCII 字符，标识客户端（如 `"AZ"`）
 * - `version`：语义化版本号 `major.minor.patch`，其中 major/minor 范围 0-9，patch 范围 0-99
 * - 随机填充至 20 字节
 *
 * @example
 * ```ts
 * import { encodeAzStyle } from "@deno-torrent/peerid";
 *
 * const buf = encodeAzStyle("AZ", "2.0.60");
 * new TextDecoder().decode(buf); // "-AZ2060-xxxxxxxxxx"
 * ```
 *
 * @param code 客户端代号，必须是 2 位字符（如 `"AZ"`、`"UT"`）
 * @param version 语义化版本号（如 `"2.0.60"`）
 * @returns 编码后的 20 字节 PeerId
 */
export function encodeAzStyle(code: string, version: string): Uint8Array {
  if (
    code.length !== 2 ||
    ![...code].every((char) => {
      const charCode = char.charCodeAt(0);
      return charCode >= 32 && charCode <= 126;
    })
  ) {
    throw new RangeError("Azureus 风格的 code 必须是 2 位可显示 ASCII 字符");
  }

  const verStr = semanticVerToAzStyle(version);
  const prefix = `-${code}${verStr}-`;
  const peerid = prefix + randomStr(20 - prefix.length);

  return encodePeerId(peerid);
}

/**
 * 编码 Shadow 风格的 PeerId。
 *
 * 格式：`{code}{version}---{random}`
 * - `code`：1 位 ASCII 字母，标识客户端（如 `"S"`）
 * - `version`：3 个 Shadow 版本字符（每个字符代表 0-63 的数字，见下方编码表），不足 5 位补 `"-"`
 * - 后跟 `"---"` 固定字符（按惯例），再填充随机字符至 20 字节
 *
 * Shadow 版本字符编码：`'0'-'9'=0-9`，`'A'-'Z'=10-35`，`'a'-'z'=36-61`，`'.'=62`，`'-'=63`
 *
 * @example
 * ```ts
 * import { encodeShadowStyle } from "@deno-torrent/peerid";
 *
 * const buf = encodeShadowStyle("S", "5.8.11");
 * new TextDecoder().decode(buf); // "S58B-----xxxxxxxxxx"
 * ```
 *
 * @param code 客户端代号，必须是 1 位 ASCII 字母（如 `"S"`、`"T"`）
 * @param version 语义化版本号（如 `"5.8.11"`），major/minor/patch 范围均为 0-63
 * @returns 编码后的 20 字节 PeerId
 */
export function encodeShadowStyle(code: string, version: string): Uint8Array {
  if (code.length !== 1 || !/^[A-Za-z]$/.test(code)) {
    throw new RangeError("Shadow 风格的 code 必须是 1 位 ASCII 字母");
  }

  // 版本号不足 5 位时用 '-' 补齐（BitTorrent 规范）
  const shadowVer = semanticVerToShadowStyle(version).padEnd(5, "-");

  // 后跟三个固定字符 "---"（按惯例）
  const prefix = `${code}${shadowVer}---`;
  const peerid = prefix + randomStr(20 - prefix.length);

  return encodePeerId(peerid);
}

````

---

## Arquivo: `docs/deno-torrent/peerid/type.ts`

```ts
/**
 * 表示一个 BitTorrent 客户端的基本信息。
 */
export type Client = {
  /** 客户端代号（Azureus 风格 2 位，Shadow 风格 1 位） */
  code: string;
  /** 客户端名称（若在已知列表中可识别，否则为 undefined） */
  name?: string;
  /** 语义化版本号，格式 `major.minor.patch`（若可解析，否则为 undefined） */
  version?: string;
};

```

---

## Arquivo: `docs/deno-torrent/peerid/util.ts`

```ts
import { SHADOW_STYLE_VERSION_CHARS, VISIBLE_CHARS } from "./constant.ts";
import { AZStyleClient, ShadowStyleClient } from "./enum.ts";
import type { Client } from "./type.ts";

/**
 * 判断字符串是否是 URL 百分号编码格式（`%nn` 格式）。
 *
 * @example
 * isUrlEncoded("%2B")    // true
 * isUrlEncoded("%BD%4A") // true
 * isUrlEncoded("hello")  // false
 *
 * @param source 待检测字符串
 * @returns 若全部由合法 URL 编码序列组成则返回 true
 */
export function isUrlEncoded(source: string): boolean {
  return /^(%[0-9a-f]{2})+$/i.test(source);
}

/**
 * 判断是否是 Azureus 风格的 PeerId。
 *
 * 格式：`-XX####-`（X 为可显示字符，# 为数字），共 20 字节。
 *
 * @example
 * isAzStyle("-AZ2060-4f2f1f2f1f2f") // true
 * isAzStyle("S58B-----fffffffffff")  // false
 *
 * @param peerId 20 字节的 PeerId 字符串
 * @returns 是否符合 Azureus 格式
 * @throws 当 peerId 长度不等于 20 时抛出错误
 */
export function isAzStyle(peerId: string): boolean {
  if (peerId.length !== 20) {
    throw new RangeError("peerId length must be 20");
  }

  const clientInfo = peerId.substring(0, 8);

  // 首尾必须是 '-'
  if (clientInfo[0] !== "-" || clientInfo[7] !== "-") {
    return false;
  }

  // 第 2-3 位（客户端代号）必须是可显示字符
  const client = clientInfo.substring(1, 3);
  if (client.split("").some((c) => !isVisible(c.charCodeAt(0)))) {
    return false;
  }

  // 第 4-7 位（版本号）必须全是数字
  const version = clientInfo.substring(3, 7);
  if (version.split("").some((c) => !isDigit(c.charCodeAt(0)))) {
    return false;
  }

  return true;
}

/**
 * 从 Azureus 风格的 PeerId 中提取客户端信息。
 *
 * @param peerId 20 字节的 Azureus 风格 PeerId
 * @returns 包含 code、name、version 的客户端对象
 */
export function getAzStyleClient(peerId: string): Client {
  return {
    code: peerId.substring(1, 3),
    name: findAzstyleClientName(peerId.substring(1, 3)),
    version: azStyleVerToSemantic(peerId.substring(3, 7)),
  };
}

/**
 * 从 Shadow 风格的 PeerId 中提取客户端信息。
 *
 * @param peerId 20 字节的 Shadow 风格 PeerId
 * @returns 包含 code、name、version 的客户端对象
 */
export function getShadowStyleClient(peerId: string): Client {
  return {
    code: peerId[0],
    name: findShadowStyleClientName(peerId[0]),
    version: shadowStyleVerToSemantic(peerId.substring(1, 4)),
  };
}

/**
 * 判断是否是 Shadow 风格的 PeerId。
 *
 * 格式：`X###---...`（X 为 ASCII 字母，# 为 Shadow 版本字符），共 20 字节。
 *
 * @example
 * isShadowStyle("S58B-----fffffffffff") // true
 * isShadowStyle("-AZ2060-4f2f1f2f1f2f") // false
 *
 * @param peerId 20 字节的 PeerId 字符串
 * @returns 是否符合 Shadow 格式
 * @throws 当 peerId 长度不等于 20 时抛出错误
 */
export function isShadowStyle(peerId: string): boolean {
  if (peerId.length !== 20) {
    throw new RangeError("peerId length must be 20");
  }

  // 第一个字符必须是 ASCII 字母
  if (!isLetter(peerId.charCodeAt(0))) {
    return false;
  }

  // 第 2-4 字节必须符合 Shadow 版本格式
  return isShadowStyleVersion(peerId.substring(1, 4));
}

/**
 * 判断字符编码是否对应大写字母（A-Z）。
 *
 * @param charCode 字符的 Unicode 编码
 */
export function isUpperCaseLetter(charCode: number): boolean {
  const char = String.fromCharCode(charCode);
  return char >= "A" && char <= "Z";
}

/**
 * 判断字符编码是否对应小写字母（a-z）。
 *
 * @param charCode 字符的 Unicode 编码
 */
export function isLowerCaseLetter(charCode: number): boolean {
  const char = String.fromCharCode(charCode);
  return char >= "a" && char <= "z";
}

/**
 * 判断字符编码是否对应字母（A-Z 或 a-z）。
 *
 * @param charCode 字符的 Unicode 编码
 */
export function isLetter(charCode: number): boolean {
  return isUpperCaseLetter(charCode) || isLowerCaseLetter(charCode);
}

/**
 * 判断字符编码是否对应 ASCII 数字（0-9）。
 *
 * @param charCode 字符的 Unicode 编码
 */
export function isDigit(charCode: number): boolean {
  const char = String.fromCharCode(charCode);
  return char >= "0" && char <= "9";
}

/**
 * 判断字符编码是否属于可显示 ASCII 字符（范围 32-126）。
 *
 * @param charCode 字符的 Unicode 编码
 */
export function isVisible(charCode: number): boolean {
  return charCode >= 32 && charCode <= 126;
}

/**
 * 根据代号查找 Azureus 风格的客户端名称。
 *
 * @param code 2 位客户端代号（如 `"AZ"`、`"UT"`）
 * @returns 客户端名称，若未在已知列表中则返回 undefined
 */
export function findAzstyleClientName(code: string): string | undefined {
  const keys = Object.keys(AZStyleClient);
  const index = keys.indexOf(code);
  if (index === -1) return undefined;
  return Object.values(AZStyleClient)[index];
}

/**
 * 根据代号查找 Shadow 风格的客户端名称。
 *
 * @param code 1 位客户端代号（如 `"S"`、`"T"`）
 * @returns 客户端名称，若未在已知列表中则返回 undefined
 */
export function findShadowStyleClientName(code: string): string | undefined {
  const keys = Object.keys(ShadowStyleClient);
  const index = keys.indexOf(code);
  if (index === -1) return undefined;
  return Object.values(ShadowStyleClient)[index];
}

/**
 * 判断是否是简单语义化版本号（`major.minor.patch`，不支持预发布后缀）。
 *
 * 每段范围为 0-99（最多 2 位数字）。
 *
 * @example
 * isSemanticVersion("2.0.60")   // true
 * isSemanticVersion("1.0.0-rc") // false
 *
 * @param version 版本字符串
 */
export function isSemanticVersion(version: string): boolean {
  return /^\d{1,2}\.\d{1,2}\.\d{1,2}$/.test(version);
}

/**
 * 判断是否是 Azureus 风格的版本字符串（4 位纯数字）。
 *
 * @example
 * isAzStyleVersion("2060") // true
 * isAzStyleVersion("206")  // false
 *
 * @param version 待检测版本字符串
 */
export function isAzStyleVersion(version: string): boolean {
  return version.length === 4 &&
    version.split("").every((c) => isDigit(c.charCodeAt(0)));
}

/**
 * 判断是否是 Shadow 风格的版本字符串（3 位，每位在编码表中）。
 *
 * @example
 * isShadowStyleVersion("58B") // true
 * isShadowStyleVersion("5B")  // false（长度不为 3）
 *
 * @param version 待检测版本字符串
 */
export function isShadowStyleVersion(version: string): boolean {
  return version.length === 3 &&
    version.split("").every((c) => SHADOW_STYLE_VERSION_CHARS.includes(c));
}

/**
 * 生成指定长度的随机可显示 ASCII 字符串（用于填充 PeerId 随机部分）。
 *
 * @param length 字符串长度，范围 1-99
 * @returns 随机字符串
 * @throws 当 length 小于等于 0 或大于 99 时抛出错误
 */
export function randomStr(length: number): string {
  if (length <= 0) throw new RangeError("length 必须大于 0");
  if (length > 99) throw new RangeError("length 必须不超过 99");

  let result = "";
  const charCount = VISIBLE_CHARS.length;

  for (let i = 0; i < length; i++) {
    result += VISIBLE_CHARS[Math.floor(Math.random() * charCount)];
  }

  return result;
}

/**
 * 将语义化版本号转换为 Azureus 风格的 4 位数字版本字符串。
 *
 * 转换规则：`major.minor.patch` → `{major}{minor}{patch(2位)}`
 * - major：0-9
 * - minor：0-9
 * - patch：0-99（不足 2 位补前导零）
 *
 * @example
 * semanticVerToAzStyle("2.0.60") // "2060"
 * semanticVerToAzStyle("2.0.6")  // "2006"
 *
 * @param ver 语义化版本号（如 `"2.0.60"`）
 * @returns 4 位 Azureus 版本字符串
 * @throws 当版本格式不合法或数值超出范围时抛出错误
 */
export function semanticVerToAzStyle(ver: string): string {
  if (!isSemanticVersion(ver)) throw new Error("无效的语义化版本号");

  const [majorStr, minorStr, patchStr] = ver.split(".");
  const major = parseInt(majorStr);
  const minor = parseInt(minorStr);
  const patch = parseInt(patchStr);

  if (major > 9 || major < 0) {
    throw new RangeError("Azureus 风格 major 版本范围为 0-9");
  }
  if (minor > 9 || minor < 0) {
    throw new RangeError("Azureus 风格 minor 版本范围为 0-9");
  }
  if (patch > 99 || patch < 0) {
    throw new RangeError("Azureus 风格 patch 版本范围为 0-99");
  }

  return `${major}${minor}${patch.toString().padStart(2, "0")}`;
}

/**
 * 将 Azureus 风格的 4 位数字版本字符串转换为语义化版本号。
 *
 * @example
 * azStyleVerToSemantic("2060") // "2.0.60"
 * azStyleVerToSemantic("0001") // "0.0.1"
 *
 * @param ver 4 位 Azureus 版本字符串（如 `"2060"`）
 * @returns 语义化版本号（如 `"2.0.60"`）
 * @throws 当版本字符串格式不合法时抛出错误
 */
export function azStyleVerToSemantic(ver: string): string {
  if (!isAzStyleVersion(ver)) throw new Error("无效的 Azureus 风格版本号");

  const major = parseInt(ver.substring(0, 1));
  const minor = parseInt(ver.substring(1, 2));
  const patch = parseInt(ver.substring(2, 4));

  return [major, minor, patch].join(".");
}

/**
 * 将语义化版本号转换为 Shadow 风格的版本字符串。
 *
 * 每个版本段映射为 `SHADOW_STYLE_VERSION_CHARS` 中对应索引的字符：
 * - `0-9` → `'0'-'9'`
 * - `10-35` → `'A'-'Z'`
 * - `36-61` → `'a'-'z'`
 * - `62` → `'.'`
 * - `63` → `'-'`
 *
 * @example
 * semanticVerToShadowStyle("5.8.11") // "58B"
 * semanticVerToShadowStyle("1.2.62") // "12."
 *
 * @param ver 语义化版本号（如 `"5.8.11"`），每段范围 0-63
 * @returns Shadow 风格 3 字符版本字符串
 * @throws 当版本格式不合法或数值超出 0-63 范围时抛出错误
 */
export function semanticVerToShadowStyle(ver: string): string {
  if (!isSemanticVersion(ver)) throw new Error("无效的语义化版本号");

  return ver
    .split(".")
    .map((part) => {
      const num = parseInt(part);
      if (num < 0 || num > 63) {
        throw new RangeError(`Shadow 风格版本每段范围为 0-63，当前值：${num}`);
      }
      return SHADOW_STYLE_VERSION_CHARS[num];
    })
    .join("");
}

/**
 * 将 Shadow 风格的版本字符串转换为语义化版本号。
 *
 * @example
 * shadowStyleVerToSemantic("58B") // "5.8.11"
 * shadowStyleVerToSemantic("12.") // "1.2.62"
 *
 * @param ver 3 字符 Shadow 版本字符串（如 `"58B"`）
 * @returns 语义化版本号（如 `"5.8.11"`）
 * @throws 当版本字符串格式不合法时抛出错误
 */
export function shadowStyleVerToSemantic(ver: string): string {
  if (!isShadowStyleVersion(ver)) throw new Error("无效的 Shadow 风格版本号");

  return ver
    .split("")
    .map((c) => SHADOW_STYLE_VERSION_CHARS.indexOf(c))
    .join(".");
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/bitfield.ts`

```ts
import { BitArray } from "@deno-torrent/toolkit";
import { PeerWireProtocolError } from "@src/errors.ts";

/** Mutable, MSB-first BitTorrent piece bitfield. */
export class Bitfield {
  readonly pieceCount: number;
  #bits: BitArray;

  constructor(pieceCount: number, bytes?: Uint8Array) {
    if (!Number.isSafeInteger(pieceCount) || pieceCount < 0) {
      throw new RangeError("pieceCount must be a non-negative safe integer");
    }

    const byteLength = Math.ceil(pieceCount / 8);
    if (bytes && bytes.length !== byteLength) {
      throw new PeerWireProtocolError(
        `bitfield for ${pieceCount} pieces must contain ${byteLength} bytes`,
      );
    }

    this.pieceCount = pieceCount;
    this.#bits = BitArray.fromUint8Array(bytes ?? new Uint8Array(byteLength));
    this.#validateSpareBits();
  }

  static fromBytes(pieceCount: number, bytes: Uint8Array): Bitfield {
    return new Bitfield(pieceCount, bytes);
  }

  get byteLength(): number {
    return this.#bits.length / 8;
  }

  get completedCount(): number {
    let count = 0;
    for (let index = 0; index < this.pieceCount; index++) {
      if (this.has(index)) count++;
    }
    return count;
  }

  has(index: number): boolean {
    this.#assertIndex(index);
    return this.#bits.getBit(index, "msb0");
  }

  set(index: number, available = true): void {
    this.#assertIndex(index);
    this.#bits.setBit(index, available, "msb0");
  }

  clear(): void {
    this.#bits = BitArray.fromUint8Array(new Uint8Array(this.byteLength));
  }

  toBytes(): Uint8Array {
    return this.#bits.bytes;
  }

  *availablePieces(): IterableIterator<number> {
    for (let index = 0; index < this.pieceCount; index++) {
      if (this.has(index)) yield index;
    }
  }

  #assertIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.pieceCount) {
      throw new RangeError(`piece index ${index} is out of range`);
    }
  }

  #validateSpareBits(): void {
    const remainder = this.pieceCount & 7;
    if (remainder === 0 || this.byteLength === 0) return;
    const bytes = this.#bits.bytes;
    const spareMask = (1 << (8 - remainder)) - 1;
    if ((bytes[bytes.length - 1] & spareMask) !== 0) {
      throw new PeerWireProtocolError("bitfield contains non-zero spare bits");
    }
  }
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/constants.ts`

```ts
/** The protocol identifier used by the BitTorrent peer wire handshake. */
export const BITTORRENT_PROTOCOL = "BitTorrent protocol";

/** The fixed byte length of a standard BitTorrent peer wire handshake. */
export const HANDSHAKE_LENGTH = 68;

/** Length of an info hash and a peer ID, in bytes. */
export const PEER_ID_LENGTH = 20;

/** Default upper bound for a peer wire message payload. */
export const DEFAULT_MAX_MESSAGE_LENGTH = 2 * 1024 * 1024;

/** Maximum block payload accepted by current interoperable clients. */
export const DEFAULT_MAX_BLOCK_LENGTH = 16 * 1024;

/** Default number of queued requests accepted in either direction. */
export const DEFAULT_MAX_PENDING_REQUESTS = 250;

/** Default maximum number of bytes waiting in the serialized write queue. */
export const DEFAULT_MAX_QUEUED_WRITE_BYTES = 4 * 1024 * 1024;

/** Peer wire message IDs from BEP 3 and commonly implemented extensions. */
export enum PeerMessageId {
  Choke = 0,
  Unchoke = 1,
  Interested = 2,
  NotInterested = 3,
  Have = 4,
  Bitfield = 5,
  Request = 6,
  Piece = 7,
  Cancel = 8,
  Port = 9,
  SuggestPiece = 13,
  HaveAll = 14,
  HaveNone = 15,
  RejectRequest = 16,
  AllowedFast = 17,
  Extended = 20,
  HashRequest = 21,
  Hashes = 22,
  HashReject = 23,
}

/** Named bits in the eight reserved handshake bytes. */
export enum HandshakeExtension {
  /** BEP 6 fast extension. */
  Fast = "fast",
  /** BEP 10 extension protocol. */
  ExtensionProtocol = "extensionProtocol",
  /** BEP 5 DHT port message. */
  Dht = "dht",
  /** BEP 52 BitTorrent v2/hybrid wire protocol. */
  V2 = "v2",
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/errors.ts`

```ts
/** Base error for invalid or failed peer wire operations. */
export class PeerWireError extends Error {
  override name = "PeerWireError";
}

/** Raised when bytes do not represent a valid handshake or message. */
export class PeerWireProtocolError extends PeerWireError {
  override name = "PeerWireProtocolError";
}

/** Raised when a transport closes before the requested bytes are read. */
export class PeerWireEofError extends PeerWireError {
  override name = "PeerWireEofError";
}

/** Raised when a peer operation exceeds its configured deadline. */
export class PeerWireTimeoutError extends PeerWireError {
  override name = "PeerWireTimeoutError";
}

/** Raised when a peer explicitly rejects a block or hash request. */
export class PeerWireRequestRejectedError extends PeerWireError {
  override name = "PeerWireRequestRejectedError";
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/extension.ts`

```ts
import { type BencodeValue, decode, encode } from "@deno-torrent/bencode";
import { PeerWireError, PeerWireProtocolError } from "@src/errors.ts";
import type { ExtendedMessage } from "@src/message.ts";

/** Parsed BEP 10 extended handshake fields. */
export interface ExtendedHandshake {
  /** Extension names mapped to the IDs selected by the remote peer. */
  readonly extensions: ReadonlyMap<string, number>;
  /** Remote client identification (`v`). */
  readonly client?: string;
  /** Remote TCP/uTP listen port (`p`). */
  readonly port?: number;
  /** Remote request queue preference (`reqq`). */
  readonly requestQueue?: number;
  /** Raw info-dictionary length advertised for BEP 9. */
  readonly metadataSize?: number;
  /** This endpoint's compact address as observed by the remote peer. */
  readonly yourIp?: Uint8Array;
  /** Remote endpoint's explicitly advertised compact IPv4 address. */
  readonly ipv4?: Uint8Array;
  /** Remote endpoint's explicitly advertised compact IPv6 address. */
  readonly ipv6?: Uint8Array;
  /** Complete decoded dictionary, including non-standard extension fields. */
  readonly raw: ReadonlyMap<string | Uint8Array, BencodeValue>;
}

/** Operations exposed to one registered BEP 10 extension. */
export interface PeerWireExtensionContext {
  /** Connection-local host, including the peer's directional ID mapping. */
  readonly host: ExtensionHost;
  /** Send a payload under this extension's peer-selected outgoing ID. */
  send(payload: Uint8Array): Promise<void>;
}

/** A named BEP 10 extension hosted by {@link ExtensionHost}. */
export interface PeerWireExtension {
  /** BEP 10 mapping name, for example `ut_metadata`. */
  readonly name: string;
  /** Capture connection-local operations when the extension is registered. */
  onRegister?(context: PeerWireExtensionContext): void;
  /** Contribute fields to each local extended handshake. */
  handshakeFields?(): ReadonlyMap<string, BencodeValue>;
  /** Observe the peer's initial or repeated extended handshake. */
  onExtendedHandshake?(handshake: ExtendedHandshake): void | Promise<void>;
  /** Handle one payload addressed to this extension. */
  onMessage?(payload: Uint8Array): void | Promise<void>;
  /** Release pending work when the owning wire closes. */
  close?(reason?: unknown): void;
}

/** Construction options for one connection-local BEP 10 host. */
export interface ExtensionHostOptions {
  /** Low-level sender used for extended message ID and payload pairs. */
  send: (extensionId: number, payload: Uint8Array) => Promise<void>;
  /** Maximum accepted extension payload, defaulting to 256 KiB. */
  maxPayloadLength?: number;
  /** Optional standard extended-handshake client name (`v`). */
  client?: string;
  /** Optional standard extended-handshake listen port (`p`). */
  port?: number;
  /** Optional standard extended-handshake request queue size (`reqq`). */
  requestQueue?: number;
}

/** Negotiates, maps, and dispatches BEP 10 extension messages for one peer. */
export class ExtensionHost {
  /** Maximum extension payload accepted in either direction. */
  readonly maxPayloadLength: number;
  /** IDs selected locally, which the peer uses when sending to us. */
  readonly localExtensions: Map<string, number> = new Map();
  /** IDs selected by the peer, which we use when sending to it. */
  readonly peerExtensions: Map<string, number> = new Map();

  /** Most recent valid extended handshake received from the peer. */
  peerHandshake?: ExtendedHandshake;

  #send: (extensionId: number, payload: Uint8Array) => Promise<void>;
  // localExtensions contains IDs the peer must use when sending to us;
  // peerExtensions contains IDs we must use when sending to the peer. BEP 10
  // deliberately makes these mappings connection-local and directional.
  #extensions = new Map<string, PeerWireExtension>();
  #handshakeFields = new Map<string, BencodeValue>();
  #nextId = 1;
  #handshakeWaiters: Array<(value: ExtendedHandshake) => void> = [];

  /** Create a connection-local extension registry around a low-level sender. */
  constructor(options: ExtensionHostOptions) {
    this.#send = options.send;
    this.maxPayloadLength = options.maxPayloadLength ?? 256 * 1024;
    if (
      !Number.isSafeInteger(this.maxPayloadLength) || this.maxPayloadLength < 1
    ) {
      throw new RangeError("maxPayloadLength must be a positive safe integer");
    }
    if (options.client !== undefined) {
      this.setHandshakeField("v", options.client);
    }
    if (options.port !== undefined) this.setHandshakeField("p", options.port);
    if (options.requestQueue !== undefined) {
      this.setHandshakeField("reqq", options.requestQueue);
    }
  }

  /** Register an extension and allocate its local incoming message ID. */
  use<T extends PeerWireExtension>(extension: T): T {
    if (!extension.name || extension.name.length < 3) {
      throw new TypeError(
        "extension name must contain at least three characters",
      );
    }
    if (this.#extensions.has(extension.name)) {
      throw new PeerWireError(
        `extension ${extension.name} is already registered`,
      );
    }
    if (this.#nextId > 255) throw new PeerWireError("no extension IDs remain");
    this.#extensions.set(extension.name, extension);
    this.localExtensions.set(extension.name, this.#nextId++);
    extension.onRegister?.({
      host: this,
      send: (payload) => this.send(extension.name, payload),
    });
    return extension;
  }

  /** Retrieve a registered extension by its BEP 10 name. */
  get<T extends PeerWireExtension = PeerWireExtension>(
    name: string,
  ): T | undefined {
    return this.#extensions.get(name) as T | undefined;
  }

  /** Add, replace, or remove a non-`m` extended-handshake field. */
  setHandshakeField(name: string, value: BencodeValue | undefined): void {
    if (name === "m") {
      throw new TypeError("the m field is managed by ExtensionHost");
    }
    if (value === undefined) this.#handshakeFields.delete(name);
    else this.#handshakeFields.set(name, value);
  }

  /** Send the local extended handshake. This may be called again after updates. */
  async sendHandshake(): Promise<void> {
    const extensions = new Map<string, BencodeValue>();
    for (const [name, id] of this.localExtensions) extensions.set(name, id);
    const fields = new Map<string, BencodeValue>(this.#handshakeFields);
    fields.set("m", extensions);
    for (const extension of this.#extensions.values()) {
      for (const [name, value] of extension.handshakeFields?.() ?? []) {
        if (name === "m") {
          throw new PeerWireError(
            `${extension.name} may not replace the m field`,
          );
        }
        fields.set(name, value);
      }
    }
    await this.#send(0, encode(fields));
  }

  /** Send a payload using the ID selected by the remote peer. */
  async send(name: string, payload: Uint8Array): Promise<void> {
    if (payload.length > this.maxPayloadLength) {
      throw new RangeError(
        `extension payload exceeds configured limit ${this.maxPayloadLength}`,
      );
    }
    const id = this.peerExtensions.get(name);
    if (id === undefined) {
      throw new PeerWireError(
        `remote peer did not advertise extension ${name}`,
      );
    }
    await this.#send(id, payload);
  }

  /** Resolve after the first valid remote extended handshake. */
  waitForPeerHandshake(): Promise<ExtendedHandshake> {
    if (this.peerHandshake) return Promise.resolve(this.peerHandshake);
    return new Promise((resolve) => this.#handshakeWaiters.push(resolve));
  }

  /** Parse and dispatch one raw BEP 10 message. */
  async handle(message: ExtendedMessage): Promise<string | undefined> {
    if (message.payload.length > this.maxPayloadLength) {
      throw new PeerWireProtocolError(
        `extension payload exceeds configured limit ${this.maxPayloadLength}`,
      );
    }
    if (message.extensionId === 0) {
      // Repeated handshakes are additive. A zero mapping explicitly disables
      // one previously advertised extension without resetting other entries.
      const handshake = decodeExtendedHandshake(message.payload);
      for (const [name, id] of handshake.extensions) {
        if (id === 0) this.peerExtensions.delete(name);
        else this.peerExtensions.set(name, id);
      }
      this.peerHandshake = handshake;
      for (const waiter of this.#handshakeWaiters.splice(0)) waiter(handshake);
      for (const extension of this.#extensions.values()) {
        await extension.onExtendedHandshake?.(handshake);
      }
      return undefined;
    }

    const name = findNameById(this.localExtensions, message.extensionId);
    if (name === undefined) return undefined;
    await this.#extensions.get(name)?.onMessage?.(message.payload);
    return name;
  }

  /** Notify registered extensions that their owning peer connection ended. */
  close(reason?: unknown): void {
    for (const extension of this.#extensions.values()) {
      extension.close?.(reason);
    }
    this.#handshakeWaiters.length = 0;
  }
}

/** Decode and validate a bounded BEP 10 extended handshake dictionary. */
export function decodeExtendedHandshake(
  payload: Uint8Array,
): ExtendedHandshake {
  let value: BencodeValue;
  try {
    value = decode(payload, { maxBytes: 256 * 1024, maxDepth: 32 });
  } catch (cause) {
    throw new PeerWireProtocolError("invalid extended handshake", { cause });
  }
  if (!(value instanceof Map)) {
    throw new PeerWireProtocolError("extended handshake must be a dictionary");
  }
  const mapping = value.get("m");
  if (mapping !== undefined && !(mapping instanceof Map)) {
    throw new PeerWireProtocolError(
      "extended handshake m field must be a dictionary",
    );
  }
  const extensions = new Map<string, number>();
  for (const [name, id] of mapping ?? []) {
    if (
      typeof name !== "string" || typeof id !== "number" || id < 0 || id > 255
    ) {
      throw new PeerWireProtocolError(
        "extended handshake contains an invalid mapping",
      );
    }
    extensions.set(name, id);
  }
  return {
    extensions,
    client: optionalString(value, "v"),
    port: optionalInteger(value, "p", 0xffff),
    requestQueue: optionalInteger(value, "reqq", 0xffffffff),
    metadataSize: optionalInteger(value, "metadata_size", 0xffffffff),
    yourIp: optionalBytes(value, "yourip"),
    ipv4: optionalBytes(value, "ipv4"),
    ipv6: optionalBytes(value, "ipv6"),
    raw: value,
  };
}

function optionalString(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
) {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new PeerWireProtocolError(
      `extended handshake ${key} must be a string`,
    );
  }
  return value;
}

function optionalInteger(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
  maximum: number,
) {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== "number" || value < 0 || value > maximum) {
    throw new PeerWireProtocolError(`extended handshake ${key} is invalid`);
  }
  return value;
}

function optionalBytes(
  map: Map<string | Uint8Array, BencodeValue>,
  key: string,
) {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new PeerWireProtocolError(`extended handshake ${key} must be bytes`);
}

function findNameById(mapping: ReadonlyMap<string, number>, id: number) {
  for (const [name, candidate] of mapping) if (candidate === id) return name;
  return undefined;
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/handshake.ts`

```ts
import {
  BITTORRENT_PROTOCOL,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
  PEER_ID_LENGTH,
} from "@src/constants.ts";
import { PeerWireProtocolError } from "@src/errors.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const protocolBytes = textEncoder.encode(BITTORRENT_PROTOCOL);

export interface PeerHandshake {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  reserved: Uint8Array;
  extensions: ReadonlySet<HandshakeExtension>;
}

export interface EncodeHandshakeOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array | string;
  reserved?: Uint8Array;
  extensions?: Iterable<HandshakeExtension>;
}

export function encodeHandshake(options: EncodeHandshakeOptions): Uint8Array {
  assertTwentyBytes("infoHash", options.infoHash);
  const peerId = typeof options.peerId === "string"
    ? textEncoder.encode(options.peerId)
    : options.peerId;
  assertTwentyBytes("peerId", peerId);

  const reserved = options.reserved
    ? new Uint8Array(options.reserved)
    : new Uint8Array(8);
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  for (const extension of options.extensions ?? []) {
    setExtension(reserved, extension, true);
  }

  const bytes = new Uint8Array(HANDSHAKE_LENGTH);
  bytes[0] = protocolBytes.length;
  bytes.set(protocolBytes, 1);
  bytes.set(reserved, 20);
  bytes.set(options.infoHash, 28);
  bytes.set(peerId, 48);
  return bytes;
}

export function decodeHandshake(bytes: Uint8Array): PeerHandshake {
  if (bytes.length !== HANDSHAKE_LENGTH) {
    throw new PeerWireProtocolError(
      `peer handshake must contain ${HANDSHAKE_LENGTH} bytes`,
    );
  }
  const protocolLength = bytes[0];
  const protocol = textDecoder.decode(bytes.subarray(1, 1 + protocolLength));
  if (
    protocolLength !== protocolBytes.length ||
    protocol !== BITTORRENT_PROTOCOL
  ) {
    throw new PeerWireProtocolError(`unsupported peer protocol: ${protocol}`);
  }

  const reserved = bytes.slice(20, 28);
  const extensions = new Set<HandshakeExtension>();
  for (const extension of Object.values(HandshakeExtension)) {
    if (hasExtension(reserved, extension)) extensions.add(extension);
  }

  return {
    infoHash: bytes.slice(28, 48),
    peerId: bytes.slice(48, 68),
    reserved,
    extensions,
  };
}

export function hasExtension(
  reserved: Uint8Array,
  extension: HandshakeExtension,
): boolean {
  if (reserved.length !== 8) return false;
  const [byte, mask] = extensionLocation(extension);
  return (reserved[byte] & mask) !== 0;
}

export function setExtension(
  reserved: Uint8Array,
  extension: HandshakeExtension,
  enabled: boolean,
): void {
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  const [byte, mask] = extensionLocation(extension);
  if (enabled) reserved[byte] |= mask;
  else reserved[byte] &= ~mask;
}

function extensionLocation(extension: HandshakeExtension): [number, number] {
  switch (extension) {
    case HandshakeExtension.Fast:
      return [7, 0x04];
    case HandshakeExtension.ExtensionProtocol:
      return [5, 0x10];
    case HandshakeExtension.Dht:
      return [7, 0x01];
    case HandshakeExtension.V2:
      return [7, 0x10];
  }
}

function assertTwentyBytes(name: string, bytes: Uint8Array): void {
  if (bytes.length !== PEER_ID_LENGTH) {
    throw new RangeError(`${name} must contain ${PEER_ID_LENGTH} bytes`);
  }
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/message.ts`

```ts
import { NetUtil } from "@deno-torrent/toolkit";
import { PeerMessageId } from "@src/constants.ts";
import { PeerWireProtocolError } from "@src/errors.ts";

export interface KeepAliveMessage {
  type: "keepAlive";
}

export interface ChokeMessage {
  type: "choke";
}

export interface UnchokeMessage {
  type: "unchoke";
}

export interface InterestedMessage {
  type: "interested";
}

export interface NotInterestedMessage {
  type: "notInterested";
}

export interface HaveMessage {
  type: "have";
  pieceIndex: number;
}

export interface BitfieldMessage {
  type: "bitfield";
  bitfield: Uint8Array;
}

export interface BlockRequest {
  pieceIndex: number;
  begin: number;
  length: number;
}

export interface RequestMessage extends BlockRequest {
  type: "request";
}

export interface PieceMessage {
  type: "piece";
  pieceIndex: number;
  begin: number;
  block: Uint8Array;
}

export interface CancelMessage extends BlockRequest {
  type: "cancel";
}

export interface PortMessage {
  type: "port";
  port: number;
}

export interface SuggestPieceMessage {
  type: "suggestPiece";
  pieceIndex: number;
}

export interface HaveAllMessage {
  type: "haveAll";
}

export interface HaveNoneMessage {
  type: "haveNone";
}

export interface RejectRequestMessage extends BlockRequest {
  type: "rejectRequest";
}

export interface AllowedFastMessage {
  type: "allowedFast";
  pieceIndex: number;
}

export interface ExtendedMessage {
  type: "extended";
  extensionId: number;
  payload: Uint8Array;
}

/** Common BEP 52 Merkle hash request fields. */
export interface HashRequestFields {
  piecesRoot: Uint8Array;
  baseLayer: number;
  index: number;
  length: number;
  proofLayers: number;
}

export interface HashRequestMessage extends HashRequestFields {
  type: "hashRequest";
}

export interface HashesMessage extends HashRequestFields {
  type: "hashes";
  hashes: Uint8Array;
}

export interface HashRejectMessage extends HashRequestFields {
  type: "hashReject";
}

/** A forward-compatible message whose ID is not known by this library. */
export interface UnknownMessage {
  type: "unknown";
  id: number;
  payload: Uint8Array;
}

export type PeerMessage =
  | KeepAliveMessage
  | ChokeMessage
  | UnchokeMessage
  | InterestedMessage
  | NotInterestedMessage
  | HaveMessage
  | BitfieldMessage
  | RequestMessage
  | PieceMessage
  | CancelMessage
  | PortMessage
  | SuggestPieceMessage
  | HaveAllMessage
  | HaveNoneMessage
  | RejectRequestMessage
  | AllowedFastMessage
  | ExtendedMessage
  | HashRequestMessage
  | HashesMessage
  | HashRejectMessage
  | UnknownMessage;

/** Encode a peer message, including its four-byte big-endian length prefix. */
export function encodeMessage(message: PeerMessage): Uint8Array {
  if (message.type === "keepAlive") return new Uint8Array(4);

  const payload = encodeMessagePayload(message);
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length);
  frame.set(payload, 4);
  return frame;
}

/** Decode one complete length-prefixed peer wire frame. */
export function decodeMessage(frame: Uint8Array): PeerMessage {
  if (frame.length < 4) {
    throw new PeerWireProtocolError(
      "peer message is missing its length prefix",
    );
  }
  const length = new DataView(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength,
  ).getUint32(0);
  if (length !== frame.length - 4) {
    throw new PeerWireProtocolError(
      `peer message length prefix is ${length}, received ${frame.length - 4}`,
    );
  }
  if (length === 0) return { type: "keepAlive" };
  return decodeMessagePayload(frame.subarray(4));
}

/** Decode the bytes after a non-zero peer message length prefix. */
export function decodeMessagePayload(payload: Uint8Array): PeerMessage {
  if (payload.length === 0) {
    throw new PeerWireProtocolError("non-keepalive message has no message ID");
  }
  const id = payload[0];
  const body = payload.subarray(1);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);

  switch (id) {
    case PeerMessageId.Choke:
      assertLength("choke", body, 0);
      return { type: "choke" };
    case PeerMessageId.Unchoke:
      assertLength("unchoke", body, 0);
      return { type: "unchoke" };
    case PeerMessageId.Interested:
      assertLength("interested", body, 0);
      return { type: "interested" };
    case PeerMessageId.NotInterested:
      assertLength("not interested", body, 0);
      return { type: "notInterested" };
    case PeerMessageId.Have:
      assertLength("have", body, 4);
      return { type: "have", pieceIndex: view.getUint32(0) };
    case PeerMessageId.Bitfield:
      return { type: "bitfield", bitfield: new Uint8Array(body) };
    case PeerMessageId.Request:
      return { type: "request", ...decodeBlockRequest("request", body) };
    case PeerMessageId.Piece:
      if (body.length < 8) {
        throw new PeerWireProtocolError("piece message must contain a header");
      }
      return {
        type: "piece",
        pieceIndex: view.getUint32(0),
        begin: view.getUint32(4),
        block: body.slice(8),
      };
    case PeerMessageId.Cancel:
      return { type: "cancel", ...decodeBlockRequest("cancel", body) };
    case PeerMessageId.Port:
      assertLength("port", body, 2);
      return { type: "port", port: view.getUint16(0) };
    case PeerMessageId.SuggestPiece:
      assertLength("suggest piece", body, 4);
      return { type: "suggestPiece", pieceIndex: view.getUint32(0) };
    case PeerMessageId.HaveAll:
      assertLength("have all", body, 0);
      return { type: "haveAll" };
    case PeerMessageId.HaveNone:
      assertLength("have none", body, 0);
      return { type: "haveNone" };
    case PeerMessageId.RejectRequest:
      return {
        type: "rejectRequest",
        ...decodeBlockRequest("reject request", body),
      };
    case PeerMessageId.AllowedFast:
      assertLength("allowed fast", body, 4);
      return { type: "allowedFast", pieceIndex: view.getUint32(0) };
    case PeerMessageId.Extended:
      if (body.length < 1) {
        throw new PeerWireProtocolError(
          "extended message must contain an extension ID",
        );
      }
      return {
        type: "extended",
        extensionId: body[0],
        payload: body.slice(1),
      };
    case PeerMessageId.HashRequest:
      return {
        type: "hashRequest",
        ...decodeHashRequest("hash request", body),
      };
    case PeerMessageId.Hashes: {
      if (body.length < 80 || (body.length - 48) % 32 !== 0) {
        throw new PeerWireProtocolError(
          "hashes message must contain a 48-byte header and complete SHA-256 hashes",
        );
      }
      return {
        type: "hashes",
        ...decodeHashRequest("hashes", body.subarray(0, 48)),
        hashes: body.slice(48),
      };
    }
    case PeerMessageId.HashReject:
      return { type: "hashReject", ...decodeHashRequest("hash reject", body) };
    default:
      return { type: "unknown", id, payload: new Uint8Array(body) };
  }
}

function encodeMessagePayload(message: Exclude<PeerMessage, KeepAliveMessage>) {
  let id: number;
  let body: Uint8Array;
  switch (message.type) {
    case "choke":
      [id, body] = [PeerMessageId.Choke, new Uint8Array()];
      break;
    case "unchoke":
      [id, body] = [PeerMessageId.Unchoke, new Uint8Array()];
      break;
    case "interested":
      [id, body] = [PeerMessageId.Interested, new Uint8Array()];
      break;
    case "notInterested":
      [id, body] = [PeerMessageId.NotInterested, new Uint8Array()];
      break;
    case "have":
      id = PeerMessageId.Have;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "bitfield":
      id = PeerMessageId.Bitfield;
      body = new Uint8Array(message.bitfield);
      break;
    case "request":
      id = PeerMessageId.Request;
      body = encodeBlockRequest(message);
      break;
    case "piece": {
      id = PeerMessageId.Piece;
      body = new Uint8Array(8 + message.block.length);
      const view = new DataView(body.buffer);
      view.setUint32(0, asUint32(message.pieceIndex, "pieceIndex"));
      view.setUint32(4, asUint32(message.begin, "begin"));
      body.set(message.block, 8);
      break;
    }
    case "cancel":
      id = PeerMessageId.Cancel;
      body = encodeBlockRequest(message);
      break;
    case "port":
      id = PeerMessageId.Port;
      body = new Uint8Array(2);
      if (!NetUtil.isNetPort(message.port)) {
        throw new RangeError("port must be an unsigned 16-bit integer");
      }
      new DataView(body.buffer).setUint16(0, message.port);
      break;
    case "suggestPiece":
      id = PeerMessageId.SuggestPiece;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "haveAll":
      [id, body] = [PeerMessageId.HaveAll, new Uint8Array()];
      break;
    case "haveNone":
      [id, body] = [PeerMessageId.HaveNone, new Uint8Array()];
      break;
    case "rejectRequest":
      id = PeerMessageId.RejectRequest;
      body = encodeBlockRequest(message);
      break;
    case "allowedFast":
      id = PeerMessageId.AllowedFast;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "extended":
      id = PeerMessageId.Extended;
      if (
        !Number.isInteger(message.extensionId) || message.extensionId < 0 ||
        message.extensionId > 0xff
      ) {
        throw new RangeError("extensionId must be an unsigned 8-bit integer");
      }
      body = new Uint8Array(1 + message.payload.length);
      body[0] = message.extensionId;
      body.set(message.payload, 1);
      break;
    case "hashRequest":
      id = PeerMessageId.HashRequest;
      body = encodeHashRequest(message);
      break;
    case "hashes": {
      id = PeerMessageId.Hashes;
      if (message.hashes.length < 32 || message.hashes.length % 32 !== 0) {
        throw new RangeError(
          "hashes must contain complete 32-byte SHA-256 hashes",
        );
      }
      body = new Uint8Array(48 + message.hashes.length);
      body.set(encodeHashRequest(message));
      body.set(message.hashes, 48);
      break;
    }
    case "hashReject":
      id = PeerMessageId.HashReject;
      body = encodeHashRequest(message);
      break;
    case "unknown":
      if (
        !Number.isInteger(message.id) || message.id < 0 || message.id > 0xff
      ) {
        throw new RangeError("message id must be an unsigned 8-bit integer");
      }
      id = message.id;
      body = new Uint8Array(message.payload);
      break;
  }
  const payload = new Uint8Array(1 + body.length);
  payload[0] = id;
  payload.set(body, 1);
  return payload;
}

function encodeHashRequest(request: HashRequestFields): Uint8Array {
  // All three BEP 52 hash messages share this fixed 48-byte correlation key.
  validateHashRequest(request, RangeError);
  const body = new Uint8Array(48);
  body.set(request.piecesRoot);
  const view = new DataView(body.buffer);
  view.setUint32(32, request.baseLayer);
  view.setUint32(36, request.index);
  view.setUint32(40, request.length);
  view.setUint32(44, request.proofLayers);
  return body;
}

function decodeHashRequest(name: string, body: Uint8Array): HashRequestFields {
  assertLength(name, body, 48);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const request: HashRequestFields = {
    piecesRoot: body.slice(0, 32),
    baseLayer: view.getUint32(32),
    index: view.getUint32(36),
    length: view.getUint32(40),
    proofLayers: view.getUint32(44),
  };
  validateHashRequest(request, PeerWireProtocolError);
  return request;
}

function validateHashRequest(
  request: HashRequestFields,
  ErrorType: typeof RangeError | typeof PeerWireProtocolError,
): void {
  if (request.piecesRoot.length !== 32) {
    throw new ErrorType("piecesRoot must contain 32 bytes");
  }
  for (
    const [name, value] of [
      ["baseLayer", request.baseLayer],
      ["index", request.index],
      ["length", request.length],
      ["proofLayers", request.proofLayers],
    ] as const
  ) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new ErrorType(`${name} must be an unsigned 32-bit integer`);
    }
  }
  if (
    request.length < 2 || request.length > 512 ||
    (request.length & (request.length - 1)) !== 0
  ) {
    throw new ErrorType(
      "hash request length must be a power of two from 2 to 512",
    );
  }
  if (request.index % request.length !== 0) {
    throw new ErrorType("hash request index must be a multiple of length");
  }
}

function encodeBlockRequest(request: BlockRequest): Uint8Array {
  const body = new Uint8Array(12);
  const view = new DataView(body.buffer);
  view.setUint32(0, asUint32(request.pieceIndex, "pieceIndex"));
  view.setUint32(4, asUint32(request.begin, "begin"));
  view.setUint32(8, asUint32(request.length, "length"));
  if (request.length === 0) {
    throw new RangeError("length must be greater than zero");
  }
  return body;
}

function decodeBlockRequest(name: string, body: Uint8Array): BlockRequest {
  assertLength(name, body, 12);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const length = view.getUint32(8);
  if (length === 0) {
    throw new PeerWireProtocolError(`${name} length must be greater than zero`);
  }
  return {
    pieceIndex: view.getUint32(0),
    begin: view.getUint32(4),
    length,
  };
}

function uint32Body(value: number, name: string): Uint8Array {
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, asUint32(value, name));
  return body;
}

function asUint32(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
  return value;
}

function assertLength(name: string, body: Uint8Array, expected: number): void {
  if (body.length !== expected) {
    throw new PeerWireProtocolError(
      `${name} message body must contain ${expected} bytes`,
    );
  }
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/mod.ts`

```ts
export * from "@src/bitfield.ts";
export * from "@src/constants.ts";
export * from "@src/errors.ts";
export * from "@src/extension.ts";
export * from "@src/handshake.ts";
export * from "@src/message.ts";
export * from "@src/peer_wire.ts";
export * from "@src/ut_metadata.ts";
export * from "@src/ut_pex.ts";

```

---

## Arquivo: `docs/deno-torrent/peerwire/peer_wire.ts`

```ts
import {
  type ByteReader,
  BytesUtil,
  type ByteWriter,
  InvalidByteCountError,
  IoUtil,
  UnexpectedEofError,
} from "@deno-torrent/toolkit";
import {
  DEFAULT_MAX_BLOCK_LENGTH,
  DEFAULT_MAX_MESSAGE_LENGTH,
  DEFAULT_MAX_PENDING_REQUESTS,
  DEFAULT_MAX_QUEUED_WRITE_BYTES,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
} from "@src/constants.ts";
import {
  PeerWireEofError,
  PeerWireError,
  PeerWireProtocolError,
  PeerWireRequestRejectedError,
  PeerWireTimeoutError,
} from "@src/errors.ts";
import {
  decodeHandshake,
  encodeHandshake,
  type PeerHandshake,
} from "@src/handshake.ts";
import {
  decodeMessagePayload,
  encodeMessage,
  type HashRequestFields,
  type PeerMessage,
} from "@src/message.ts";
import { Bitfield } from "@src/bitfield.ts";
import { ExtensionHost, type PeerWireExtension } from "@src/extension.ts";

/** The minimal stream contract needed by {@link PeerWire}. */
export interface PeerWireTransport extends ByteReader, ByteWriter {
  close(): void | Promise<void>;
}

export enum PeerWireState {
  Handshaking,
  Connected,
  Closed,
}

export interface PeerWireOptions {
  /** Owned byte stream. Closing the wire closes this transport. */
  transport: PeerWireTransport;
  /** Twenty-byte v1 hash or truncated v2 hash sent in this endpoint's handshake. */
  infoHash: Uint8Array;
  /** Additional twenty-byte hashes accepted from a hybrid/v2 peer. */
  acceptedInfoHashes?: Iterable<Uint8Array>;
  /** Local twenty-byte peer ID, or a UTF-8 string that encodes to twenty bytes. */
  peerId: Uint8Array | string;
  /** Tracker-provided identity used to reject an unexpected remote peer. */
  expectedPeerId?: Uint8Array | string;
  /** Reserved-bit capabilities advertised in the standard handshake. */
  extensions?: Iterable<HandshakeExtension>;
  /** Torrent geometry used for bitfield and block validation. */
  pieceCount?: number;
  /** Normal piece size; the final piece is derived from `totalLength`. */
  pieceLength?: number;
  /** Payload size used to derive the final piece boundary. */
  totalLength?: number;
  /** Exact length of every logical piece, for BEP-52 file-aligned torrents. */
  pieceLengths?: readonly number[];
  /** Largest length-prefixed peer message accepted or sent. */
  maxMessageLength?: number;
  /** Largest piece block accepted or requested, defaulting to 16 KiB. */
  maxBlockLength?: number;
  /** Maximum outstanding requests tracked in either direction. */
  maxPendingRequests?: number;
  /** Maximum encoded bytes waiting behind the active transport write. */
  maxQueuedWriteBytes?: number;
  /** Maximum payload passed through the BEP 10 extension host. */
  maxExtensionPayloadLength?: number;
  /** Default deadline for correlated block and hash requests. */
  requestTimeoutMs?: number;
  /** Handshake deadline; zero disables it. */
  handshakeTimeoutMs?: number;
  /** Deadline for each peer frame read; zero disables it. */
  readTimeoutMs?: number;
  /** Deadline for each serialized transport write; zero disables it. */
  writeTimeoutMs?: number;
  /** Close the connection after this much inactivity; zero disables it. */
  idleTimeoutMs?: number;
  /** Send keepalives after this much inactivity; zero disables them. */
  keepAliveIntervalMs?: number;
  /** Optional BEP 10 handshake identity and listening port. */
  clientName?: string;
  listenPort?: number;
}

export interface PeerWireRequestOptions {
  /** Override the connection's default timeout for this operation. */
  timeoutMs?: number;
  /** Cancel this operation. Read cancellation closes the owned byte stream. */
  signal?: AbortSignal;
}

interface PendingBlockRequest {
  request: Readonly<BlockCoordinates>;
  resolve?: (block: Uint8Array) => void;
  reject?: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

interface PendingHashRequest {
  request: Readonly<HashRequestFields>;
  resolve: (hashes: Uint8Array) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

/** Coordinates shared by request, cancel, piece, and reject messages. */
export interface BlockCoordinates {
  pieceIndex: number;
  begin: number;
  length: number;
}

/** A transport-independent BitTorrent peer-wire session. */
export class PeerWire implements AsyncIterable<PeerMessage> {
  readonly transport: PeerWireTransport;
  readonly infoHash: Uint8Array;
  readonly acceptedInfoHashes: readonly Uint8Array[];
  readonly peerId: Uint8Array;
  readonly expectedPeerId?: Uint8Array;
  readonly extensions: ReadonlySet<HandshakeExtension>;
  readonly pieceCount?: number;
  readonly pieceLength?: number;
  readonly totalLength?: number;
  readonly pieceLengths?: readonly number[];
  readonly maxMessageLength: number;
  readonly maxBlockLength: number;
  readonly maxPendingRequests: number;
  readonly maxQueuedWriteBytes: number;
  readonly requestTimeoutMs: number;
  readonly handshakeTimeoutMs: number;
  readonly readTimeoutMs: number;
  readonly writeTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly extensionHost: ExtensionHost;

  /** Current lifecycle state. Protocol and transport failures end in Closed. */
  state = PeerWireState.Handshaking;
  /** First failure that closed the connection; absent after a clean close. */
  terminalError?: unknown;
  remoteHandshake?: PeerHandshake;
  remoteBitfield?: Bitfield;

  // BEP 3 defines these four flags independently for both directions.
  localChoking = true;
  localInterested = false;
  remoteChoking = true;
  remoteInterested = false;

  uploadedBytes = 0;
  downloadedBytes = 0;
  lastActivityAt: number = Date.now();

  /** Pieces we permit the remote peer to request while it is choked. */
  readonly localAllowedFast: Set<number> = new Set();
  /** Pieces the remote peer permits us to request while we are choked. */
  readonly remoteAllowedFast: Set<number> = new Set();

  // A request sent by us is pendingRequests; a request received from the peer
  // is peerRequests. Keeping the directions explicit prevents reject/piece
  // responses from accidentally resolving the wrong side of the connection.
  #pendingRequests = new Map<string, PendingBlockRequest>();
  #peerRequests = new Map<string, BlockCoordinates>();
  #pendingHashRequests = new Map<string, PendingHashRequest>();
  #peerHashRequests = new Map<string, HashRequestFields>();
  // ByteWriter permits partial writes and callers may send concurrently. This
  // promise chain preserves call order while #queuedWriteBytes bounds memory.
  #writeTail: Promise<void> = Promise.resolve();
  #queuedWriteBytes = 0;
  #reading = false;
  #handshakeSent = false;
  #handshakeReceived = false;
  #extensionHandshakeSent = false;
  // BEP 3/BEP 6 permit a bitfield (or have-all/none) only in the initial
  // availability slot. Extended handshakes do not consume this slot because
  // real clients may advertise BEP 10 before their availability message.
  #localAvailabilityOpen = true;
  #remoteAvailabilityOpen = true;
  #localAvailabilityDeclared = false;
  #remoteAvailabilityDeclared = false;
  #keepAliveTimer?: ReturnType<typeof setTimeout>;
  #idleTimer?: ReturnType<typeof setTimeout>;
  #keepAliveIntervalMs = 0;

  constructor(options: PeerWireOptions) {
    assertLength20("infoHash", options.infoHash);
    this.acceptedInfoHashes = [...options.acceptedInfoHashes ?? []].map(
      (hash) => {
        assertLength20("accepted info hash", hash);
        return new Uint8Array(hash);
      },
    );
    assertOptionalSafeInteger("pieceCount", options.pieceCount, 0);
    assertOptionalSafeInteger("pieceLength", options.pieceLength, 1);
    assertOptionalSafeInteger("totalLength", options.totalLength, 0);
    if (options.pieceLengths !== undefined) {
      if (options.pieceLength === undefined) {
        throw new RangeError(
          "pieceLength is required when pieceLengths is configured",
        );
      }
      if (
        options.pieceCount !== undefined &&
        options.pieceCount !== options.pieceLengths.length
      ) {
        throw new RangeError("pieceCount does not match pieceLengths");
      }
      for (const length of options.pieceLengths) {
        if (
          !Number.isSafeInteger(length) || length < 1 ||
          length > options.pieceLength
        ) {
          throw new RangeError(
            "pieceLengths entries must be from 1 to pieceLength",
          );
        }
      }
    }
    if (
      options.totalLength !== undefined && options.pieceLength === undefined
    ) {
      throw new RangeError(
        "pieceLength is required when totalLength is configured",
      );
    }
    if (
      options.pieceCount !== undefined && options.pieceLength !== undefined &&
      options.totalLength !== undefined && options.pieceLengths === undefined &&
      Math.ceil(options.totalLength / options.pieceLength) !==
        options.pieceCount
    ) {
      throw new RangeError(
        "pieceCount does not match pieceLength and totalLength",
      );
    }

    const peerId = typeof options.peerId === "string"
      ? new TextEncoder().encode(options.peerId)
      : options.peerId;
    assertLength20("peerId", peerId);
    const expectedPeerId = typeof options.expectedPeerId === "string"
      ? new TextEncoder().encode(options.expectedPeerId)
      : options.expectedPeerId;
    if (expectedPeerId) assertLength20("expectedPeerId", expectedPeerId);

    this.transport = options.transport;
    this.infoHash = new Uint8Array(options.infoHash);
    this.peerId = new Uint8Array(peerId);
    this.expectedPeerId = expectedPeerId
      ? new Uint8Array(expectedPeerId)
      : undefined;
    this.extensions = new Set(options.extensions);
    this.pieceCount = options.pieceCount ?? options.pieceLengths?.length;
    this.pieceLength = options.pieceLength;
    this.totalLength = options.totalLength;
    this.pieceLengths = options.pieceLengths === undefined
      ? undefined
      : [...options.pieceLengths];
    this.maxMessageLength = positiveOption(
      "maxMessageLength",
      options.maxMessageLength,
      DEFAULT_MAX_MESSAGE_LENGTH,
    );
    this.maxBlockLength = positiveOption(
      "maxBlockLength",
      options.maxBlockLength,
      DEFAULT_MAX_BLOCK_LENGTH,
    );
    this.maxPendingRequests = positiveOption(
      "maxPendingRequests",
      options.maxPendingRequests,
      DEFAULT_MAX_PENDING_REQUESTS,
    );
    this.maxQueuedWriteBytes = positiveOption(
      "maxQueuedWriteBytes",
      options.maxQueuedWriteBytes,
      DEFAULT_MAX_QUEUED_WRITE_BYTES,
    );
    this.requestTimeoutMs = positiveOption(
      "requestTimeoutMs",
      options.requestTimeoutMs,
      30_000,
    );
    this.handshakeTimeoutMs = nonNegativeOption(
      "handshakeTimeoutMs",
      options.handshakeTimeoutMs,
      30_000,
    );
    this.readTimeoutMs = nonNegativeOption(
      "readTimeoutMs",
      options.readTimeoutMs,
      0,
    );
    this.writeTimeoutMs = nonNegativeOption(
      "writeTimeoutMs",
      options.writeTimeoutMs,
      0,
    );
    this.idleTimeoutMs = nonNegativeOption(
      "idleTimeoutMs",
      options.idleTimeoutMs,
      0,
    );
    this.#keepAliveIntervalMs = nonNegativeOption(
      "keepAliveIntervalMs",
      options.keepAliveIntervalMs,
      0,
    );
    this.extensionHost = new ExtensionHost({
      send: (id, payload) => this.extended(id, payload),
      maxPayloadLength: options.maxExtensionPayloadLength,
      client: options.clientName,
      port: options.listenPort,
      requestQueue: this.maxPendingRequests,
    });
  }

  // ---- Observable request/session state ---------------------------------

  /** Block requests sent locally that still await a piece or rejection. */
  get pendingRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#pendingRequests.values()].map((entry) => entry.request);
  }

  /** Requests received from the peer that have not been served or rejected. */
  get peerRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#peerRequests.values()];
  }

  /** BEP 52 requests sent locally that still await hashes or rejection. */
  get pendingHashRequests(): readonly Readonly<HashRequestFields>[] {
    return [...this.#pendingHashRequests.values()].map((entry) =>
      entry.request
    );
  }

  /** BEP 52 requests received from the peer and awaiting a local response. */
  get peerHashRequests(): readonly Readonly<HashRequestFields>[] {
    return [...this.#peerHashRequests.values()];
  }

  /** Encoded bytes admitted to the serialized write queue but not completed. */
  get queuedWriteBytes(): number {
    return this.#queuedWriteBytes;
  }

  /** Register a named BEP 10 extension before the standard handshake. */
  use<T extends PeerWireExtension>(extension: T): T {
    if (this.state !== PeerWireState.Handshaking) {
      throw new PeerWireError(
        "extensions must be registered before handshaking",
      );
    }
    if (!this.extensions.has(HandshakeExtension.ExtensionProtocol)) {
      throw new PeerWireError(
        "BEP 10 must be enabled before registering extensions",
      );
    }
    return this.extensionHost.use(extension);
  }

  // ---- Handshake and BEP 10 negotiation ---------------------------------

  /** Exchange standard handshakes and automatically advertise BEP 10 extensions. */
  async handshake(
    options: PeerWireRequestOptions = {},
  ): Promise<PeerHandshake> {
    this.#assertOpen();
    const operation = Promise.all([
      this.sendHandshake(),
      this.receiveHandshake(),
    ]);
    const [, remote] = await withDeadline(
      operation,
      options.timeoutMs ?? this.handshakeTimeoutMs,
      options.signal,
      "peer handshake",
      (error) => this.#terminate(error),
    );
    await this.sendExtendedHandshake();
    return remote;
  }

  /** Send this endpoint's standard 68-byte peer-wire handshake exactly once. */
  async sendHandshake(): Promise<void> {
    this.#assertOpen();
    if (this.#handshakeSent) {
      throw new PeerWireError("local handshake has already been sent");
    }
    this.#handshakeSent = true;
    try {
      await this.#write(encodeHandshake({
        infoHash: this.infoHash,
        peerId: this.peerId,
        extensions: this.extensions,
      }));
      this.#updateConnectedState();
    } catch (error) {
      this.#handshakeSent = false;
      throw error;
    }
  }

  /** Receive and validate the remote standard handshake exactly once. */
  async receiveHandshake(): Promise<PeerHandshake> {
    this.#assertOpen();
    if (this.#handshakeReceived) {
      throw new PeerWireError("remote handshake has already been received");
    }
    const bytes = await this.#read(
      HANDSHAKE_LENGTH,
      false,
      this.handshakeTimeoutMs,
    );
    const handshake = decodeHandshake(bytes!);
    if (
      !BytesUtil.equals(handshake.infoHash, this.infoHash) &&
      !this.acceptedInfoHashes.some((hash) =>
        BytesUtil.equals(hash, handshake.infoHash)
      )
    ) {
      throw await this.#protocolFailure(
        "remote handshake has a different info hash",
      );
    }
    if (
      this.expectedPeerId &&
      !BytesUtil.equals(handshake.peerId, this.expectedPeerId)
    ) {
      throw await this.#protocolFailure(
        "remote handshake has an unexpected peer ID",
      );
    }
    this.#handshakeReceived = true;
    this.remoteHandshake = handshake;
    this.#updateConnectedState();
    return handshake;
  }

  /** Advertise registered extensions; pass force to send an additive update. */
  async sendExtendedHandshake(force = false): Promise<void> {
    if (this.#extensionHandshakeSent && !force) return;
    if (!this.#hasNegotiated(HandshakeExtension.ExtensionProtocol)) return;
    await this.extensionHost.sendHandshake();
    this.#extensionHandshakeSent = true;
  }

  /** Validate, serialize, and atomically apply one outgoing peer message. */
  async send(message: PeerMessage): Promise<void> {
    await this.#send(message, true);
  }

  // ---- Framed message I/O ------------------------------------------------

  async #send(message: PeerMessage, trackRequests: boolean): Promise<void> {
    // Validation happens before encoding and queue admission. State is committed
    // only after the complete frame is written, so a rejected send is retryable.
    this.#assertConnected();
    this.#assertExtensionNegotiated(message);
    this.#validateOutgoing(message);
    let trackedBlockKey: string | undefined;
    let trackedHashKey: string | undefined;
    if (trackRequests && message.type === "request") {
      trackedBlockKey = this.#trackBlockRequest(message);
    }
    if (trackRequests && message.type === "hashRequest") {
      trackedHashKey = hashKey(message);
      if (this.#pendingHashRequests.has(trackedHashKey)) {
        throw new PeerWireError("hash request is already pending");
      }
      if (this.#pendingHashRequests.size >= this.maxPendingRequests) {
        throw new PeerWireError("too many pending hash requests");
      }
      const entry: PendingHashRequest = {
        request: copyHashRequest(message),
        resolve: () => undefined,
        reject: () => undefined,
      };
      if (this.requestTimeoutMs > 0) {
        entry.timer = setTimeout(
          () => this.#removeHashRequest(trackedHashKey!),
          this.requestTimeoutMs,
        );
      }
      this.#pendingHashRequests.set(trackedHashKey, entry);
    }
    let frame: Uint8Array;
    try {
      frame = encodeMessage(message);
    } catch (error) {
      if (trackedBlockKey) this.#removeBlockRequest(trackedBlockKey, error);
      if (trackedHashKey) this.#removeHashRequest(trackedHashKey, error);
      throw error;
    }
    if (frame.length - 4 > this.maxMessageLength) {
      if (trackedBlockKey) this.#removeBlockRequest(trackedBlockKey);
      throw new RangeError(
        `message length exceeds configured limit ${this.maxMessageLength}`,
      );
    }
    try {
      await this.#write(frame);
    } catch (error) {
      if (trackedBlockKey) this.#removeBlockRequest(trackedBlockKey, error);
      if (trackedHashKey) this.#removeHashRequest(trackedHashKey, error);
      throw error;
    }
    this.uploadedBytes += frame.length;
    this.#commitAvailabilityOrder(message, true);
    this.#applyLocalState(message);
    await this.#afterLocalMessage(message);
  }

  /** Read, validate, update state, and dispatch one message. */
  async readMessage(
    options: PeerWireRequestOptions = {},
  ): Promise<PeerMessage | null> {
    this.#assertConnected();
    try {
      const prefix = await this.#read(
        4,
        true,
        options.timeoutMs ?? this.readTimeoutMs,
        options.signal,
      );
      if (prefix === null) {
        await this.#terminate();
        return null;
      }
      const length = new DataView(prefix.buffer).getUint32(0);
      if (length > this.maxMessageLength) {
        throw new PeerWireProtocolError(
          `peer message length ${length} exceeds limit ${this.maxMessageLength}`,
        );
      }
      const message = length === 0
        ? { type: "keepAlive" } as const
        : decodeMessagePayload(
          (await this.#read(
            length,
            false,
            options.timeoutMs ?? this.readTimeoutMs,
            options.signal,
          ))!,
        );
      this.#assertExtensionNegotiated(message);
      // Wire validation precedes state mutation and extension callbacks. A
      // malformed peer therefore cannot leave a partially-updated session.
      this.#validateIncoming(message);
      this.#commitAvailabilityOrder(message, false);
      this.downloadedBytes += 4 + length;
      await this.#applyRemoteState(message);
      if (message.type === "extended") await this.extensionHost.handle(message);
      return message;
    } catch (error) {
      if (error instanceof PeerWireProtocolError) await this.#terminate(error);
      throw error;
    }
  }

  /** Close the owned transport and reject all pending operations. */
  async close(): Promise<void> {
    await this.#terminate();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<PeerMessage> {
    for (;;) {
      const message = await this.readMessage();
      if (message === null) return;
      yield message;
    }
  }

  /** Configure inactivity-based keepalives; `true` selects two minutes. */
  setKeepAlive(interval: number | boolean = true): void {
    if (interval === false) this.#keepAliveIntervalMs = 0;
    else if (interval === true) this.#keepAliveIntervalMs = 120_000;
    else {
      this.#keepAliveIntervalMs = nonNegativeOption(
        "keepAlive interval",
        interval,
        0,
      );
    }
    this.#resetKeepAlive();
  }

  // ---- Message convenience API ------------------------------------------

  choke(): Promise<void> {
    return this.send({ type: "choke" });
  }

  unchoke(): Promise<void> {
    return this.send({ type: "unchoke" });
  }

  interested(): Promise<void> {
    return this.send({ type: "interested" });
  }

  notInterested(): Promise<void> {
    return this.send({ type: "notInterested" });
  }

  have(pieceIndex: number): Promise<void> {
    return this.send({ type: "have", pieceIndex });
  }

  bitfield(bitfield: Bitfield | Uint8Array): Promise<void> {
    const bytes = bitfield instanceof Bitfield ? bitfield.toBytes() : bitfield;
    return this.send({ type: "bitfield", bitfield: bytes });
  }

  request(pieceIndex: number, begin: number, length: number): Promise<void> {
    return this.send({ type: "request", pieceIndex, begin, length });
  }

  /** Send a block request and resolve it when the read loop receives its response. */
  async requestBlock(
    pieceIndex: number,
    begin: number,
    length: number,
    options: PeerWireRequestOptions = {},
  ): Promise<Uint8Array> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    const request = { pieceIndex, begin, length };
    this.#validateBlock(request, false);
    const key = blockKey(request);
    if (this.#pendingRequests.has(key)) {
      throw new PeerWireError("block request is already pending");
    }
    if (this.#pendingRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending block requests");
    }
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      this.#pendingRequests.set(
        key,
        this.#pendingEntry(request, resolve, reject, options),
      );
    });
    try {
      await this.#send({ type: "request", ...request }, false);
    } catch (error) {
      this.#removeBlockRequest(key, error);
    }
    return await promise;
  }

  piece(pieceIndex: number, begin: number, block: Uint8Array): Promise<void> {
    return this.send({ type: "piece", pieceIndex, begin, block });
  }

  cancel(pieceIndex: number, begin: number, length: number): Promise<void> {
    return this.send({ type: "cancel", pieceIndex, begin, length });
  }

  port(port: number): Promise<void> {
    return this.send({ type: "port", port });
  }

  suggest(pieceIndex: number): Promise<void> {
    return this.send({ type: "suggestPiece", pieceIndex });
  }

  haveAll(): Promise<void> {
    return this.send({ type: "haveAll" });
  }

  haveNone(): Promise<void> {
    return this.send({ type: "haveNone" });
  }

  reject(pieceIndex: number, begin: number, length: number): Promise<void> {
    return this.send({ type: "rejectRequest", pieceIndex, begin, length });
  }

  allowedFast(pieceIndex: number): Promise<void> {
    return this.send({ type: "allowedFast", pieceIndex });
  }

  extended(extensionId: number, payload: Uint8Array): Promise<void> {
    return this.send({ type: "extended", extensionId, payload });
  }

  hashRequest(request: HashRequestFields): Promise<void> {
    return this.send({ type: "hashRequest", ...request });
  }

  /** Request a BEP 52 hash block and resolve it from the active read loop. */
  async requestHashes(
    request: HashRequestFields,
    options: PeerWireRequestOptions = {},
  ): Promise<Uint8Array> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    const key = hashKey(request);
    if (this.#pendingHashRequests.has(key)) {
      throw new PeerWireError("hash request is already pending");
    }
    if (this.#pendingHashRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending hash requests");
    }
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      const entry: PendingHashRequest = {
        request: copyHashRequest(request),
        resolve,
        reject,
      };
      this.#configurePending(entry, key, options, true);
      this.#pendingHashRequests.set(key, entry);
    });
    try {
      await this.#send({ type: "hashRequest", ...request }, false);
    } catch (error) {
      this.#removeHashRequest(key, error);
    }
    return await promise;
  }

  hashes(request: HashRequestFields, hashes: Uint8Array): Promise<void> {
    return this.send({ type: "hashes", ...request, hashes });
  }

  hashReject(request: HashRequestFields): Promise<void> {
    return this.send({ type: "hashReject", ...request });
  }

  // ---- Transport serialization ------------------------------------------

  #write(bytes: Uint8Array): Promise<void> {
    this.#assertOpen();
    if (this.#queuedWriteBytes + bytes.length > this.maxQueuedWriteBytes) {
      throw new PeerWireError(
        `write queue exceeds configured limit ${this.maxQueuedWriteBytes}`,
      );
    }
    this.#queuedWriteBytes += bytes.length;
    const operation = this.#writeTail.then(async () => {
      try {
        await withDeadline(
          IoUtil.writeAll(this.transport, bytes),
          this.writeTimeoutMs,
          undefined,
          "peer write",
          (error) => this.#terminate(error),
        );
        this.#touchActivity();
      } catch (error) {
        if (error instanceof InvalidByteCountError) {
          const wrapped = error.count <= 0
            ? new PeerWireEofError("transport stopped while writing", {
              cause: error,
            })
            : new PeerWireError("transport reported an invalid write length", {
              cause: error,
            });
          await this.#terminate(wrapped);
          throw wrapped;
        }
        await this.#terminate(error);
        throw error;
      } finally {
        this.#queuedWriteBytes -= bytes.length;
      }
    });
    this.#writeTail = operation.catch(() => undefined);
    return operation;
  }

  async #read(
    length: number,
    allowCleanEof: boolean,
    timeoutMs = 0,
    signal?: AbortSignal,
  ): Promise<Uint8Array | null> {
    if (this.#reading) {
      throw new PeerWireError("concurrent reads are not supported");
    }
    this.#reading = true;
    try {
      const bytes = new Uint8Array(length);
      try {
        const complete = await withDeadline(
          IoUtil.readExactly(this.transport, bytes, { allowCleanEof }),
          timeoutMs,
          signal,
          "peer read",
          (error) => this.#terminate(error),
        );
        if (complete) this.#touchActivity();
        return complete ? bytes : null;
      } catch (error) {
        if (error instanceof UnexpectedEofError) {
          const wrapped = new PeerWireEofError(
            `transport ended after ${error.bytesRead} of ${error.expectedBytes} bytes`,
            { cause: error },
          );
          await this.#terminate(wrapped);
          throw wrapped;
        }
        if (error instanceof InvalidByteCountError) {
          const wrapped = new PeerWireError(
            "transport reported an invalid read length",
            {
              cause: error,
            },
          );
          await this.#terminate(wrapped);
          throw wrapped;
        }
        throw error;
      }
    } finally {
      this.#reading = false;
    }
  }

  #updateConnectedState(): void {
    if (this.#handshakeSent && this.#handshakeReceived) {
      this.state = PeerWireState.Connected;
      this.#resetKeepAlive();
      this.#resetIdleTimeout();
    }
  }

  // ---- Protocol state transitions ---------------------------------------

  #applyLocalState(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.localChoking = true;
        break;
      case "unchoke":
        this.localChoking = false;
        break;
      case "interested":
        this.localInterested = true;
        break;
      case "notInterested":
        this.localInterested = false;
        break;
      case "allowedFast":
        this.localAllowedFast.add(message.pieceIndex);
        break;
      case "piece":
      case "rejectRequest":
        this.#peerRequests.delete(blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.type === "piece"
            ? message.block.length
            : message.length,
        }));
        break;
      case "hashes":
      case "hashReject":
        this.#peerHashRequests.delete(hashKey(message));
        break;
    }
  }

  async #afterLocalMessage(message: PeerMessage): Promise<void> {
    // Under BEP 6/BEP 52, choke and cancel no longer silently discard requests:
    // every request must eventually receive piece or reject.
    if (message.type === "cancel" && !this.#rejectSemanticsNegotiated()) {
      this.#removeBlockRequest(
        blockKey(message),
        new PeerWireError("block request cancelled"),
      );
    }
    if (message.type !== "choke" || !this.#rejectSemanticsNegotiated()) return;
    const requests = [...this.#peerRequests.values()];
    for (const request of requests) {
      if (
        !this.#fastNegotiated() ||
        !this.localAllowedFast.has(request.pieceIndex)
      ) {
        await this.reject(request.pieceIndex, request.begin, request.length);
      }
    }
  }

  async #applyRemoteState(message: PeerMessage): Promise<void> {
    // This is the single receive-side state transition point. Extension
    // payload dispatch happens afterwards in readMessage().
    switch (message.type) {
      case "choke":
        this.remoteChoking = true;
        if (!this.#rejectSemanticsNegotiated()) {
          for (const key of [...this.#pendingRequests.keys()]) {
            this.#removeBlockRequest(
              key,
              new PeerWireError("peer choked the request"),
            );
          }
        }
        break;
      case "unchoke":
        this.remoteChoking = false;
        break;
      case "interested":
        this.remoteInterested = true;
        break;
      case "notInterested":
        this.remoteInterested = false;
        break;
      case "bitfield":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield = Bitfield.fromBytes(
            this.pieceCount,
            message.bitfield,
          );
        }
        break;
      case "have":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield ??= new Bitfield(this.pieceCount);
          this.remoteBitfield.set(message.pieceIndex);
        }
        break;
      case "haveAll":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield = new Bitfield(this.pieceCount);
          for (let index = 0; index < this.pieceCount; index++) {
            this.remoteBitfield.set(index);
          }
        }
        break;
      case "haveNone":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield = new Bitfield(this.pieceCount);
        }
        break;
      case "allowedFast":
        this.remoteAllowedFast.add(message.pieceIndex);
        break;
      case "request": {
        const key = blockKey(message);
        if (
          this.localChoking && this.#rejectSemanticsNegotiated() &&
          (!this.#fastNegotiated() ||
            !this.localAllowedFast.has(message.pieceIndex))
        ) {
          await this.reject(message.pieceIndex, message.begin, message.length);
        } else {
          this.#peerRequests.set(key, copyBlock(message));
        }
        break;
      }
      case "cancel":
        if (!this.#rejectSemanticsNegotiated()) {
          this.#peerRequests.delete(blockKey(message));
        }
        break;
      case "piece": {
        const key = blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.block.length,
        });
        const pending = this.#pendingRequests.get(key);
        if (!pending && this.#rejectSemanticsNegotiated()) {
          throw new PeerWireProtocolError("peer sent an unsolicited piece");
        }
        if (pending) {
          this.#pendingRequests.delete(key);
          clearPending(pending);
          pending.resolve?.(new Uint8Array(message.block));
        }
        break;
      }
      case "rejectRequest": {
        const key = blockKey(message);
        if (!this.#pendingRequests.has(key)) {
          throw new PeerWireProtocolError(
            "peer rejected a request that was never sent",
          );
        }
        this.#removeBlockRequest(
          key,
          new PeerWireRequestRejectedError("peer rejected block request"),
        );
        break;
      }
      case "hashRequest":
        this.#peerHashRequests.set(hashKey(message), copyHashRequest(message));
        break;
      case "hashes": {
        const key = hashKey(message);
        const pending = this.#pendingHashRequests.get(key);
        if (!pending) {
          throw new PeerWireProtocolError("unsolicited hashes message");
        }
        this.#pendingHashRequests.delete(key);
        clearPending(pending);
        pending.resolve(new Uint8Array(message.hashes));
        break;
      }
      case "hashReject": {
        const key = hashKey(message);
        if (!this.#pendingHashRequests.has(key)) {
          throw new PeerWireProtocolError("unsolicited hash reject message");
        }
        this.#removeHashRequest(
          key,
          new PeerWireRequestRejectedError("peer rejected hash request"),
        );
        break;
      }
    }
  }

  #validateOutgoing(message: PeerMessage): void {
    this.#validateAvailabilityOrder(message, true);
    this.#validateMessageBounds(message, false);
    if (
      this.#rejectSemanticsNegotiated() &&
      (message.type === "piece" || message.type === "rejectRequest")
    ) {
      const key = blockKey({
        pieceIndex: message.pieceIndex,
        begin: message.begin,
        length: message.type === "piece"
          ? message.block.length
          : message.length,
      });
      if (!this.#peerRequests.has(key)) {
        throw new PeerWireProtocolError(
          "cannot answer a block request that was not received",
        );
      }
    }
    if (message.type === "hashes" || message.type === "hashReject") {
      if (!this.#peerHashRequests.has(hashKey(message))) {
        throw new PeerWireProtocolError(
          "cannot answer a hash request that was not received",
        );
      }
    }
  }

  // ---- Ordering, bounds, and capability validation ----------------------

  #validateIncoming(message: PeerMessage): void {
    this.#validateAvailabilityOrder(message, false);
    this.#validateMessageBounds(message, true);
    if (
      message.type === "request" &&
      this.#peerRequests.size >= this.maxPendingRequests
    ) {
      throw new PeerWireProtocolError(
        "peer exceeded outstanding request limit",
      );
    }
    if (
      message.type === "hashRequest" &&
      this.#peerHashRequests.size >= this.maxPendingRequests
    ) {
      throw new PeerWireProtocolError(
        "peer exceeded outstanding hash request limit",
      );
    }
  }

  #validateAvailabilityOrder(message: PeerMessage, local: boolean): void {
    if (message.type === "keepAlive" || message.type === "extended") return;
    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" ||
      message.type === "haveNone";
    const open = local
      ? this.#localAvailabilityOpen
      : this.#remoteAvailabilityOpen;
    const declared = local
      ? this.#localAvailabilityDeclared
      : this.#remoteAvailabilityDeclared;
    if (declaration) {
      if (!open || declared) {
        throw new PeerWireProtocolError(
          "availability declaration must appear once after handshake",
        );
      }
    } else if (this.#fastNegotiated() && open && !declared) {
      throw new PeerWireProtocolError(
        "Fast peers must send bitfield, have all, or have none before other messages",
      );
    }
  }

  #commitAvailabilityOrder(message: PeerMessage, local: boolean): void {
    // Called only after outgoing bytes were written or incoming bytes passed
    // every validation check. This separation keeps failed operations atomic.
    if (message.type === "keepAlive" || message.type === "extended") return;
    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" || message.type === "haveNone";
    if (local) {
      this.#localAvailabilityDeclared ||= declaration;
      this.#localAvailabilityOpen = false;
    } else {
      this.#remoteAvailabilityDeclared ||= declaration;
      this.#remoteAvailabilityOpen = false;
    }
  }

  #validateMessageBounds(message: PeerMessage, incoming: boolean): void {
    switch (message.type) {
      case "bitfield":
        if (this.pieceCount !== undefined) {
          try {
            Bitfield.fromBytes(this.pieceCount, message.bitfield);
          } catch (error) {
            if (incoming) throw error;
            throw new RangeError("outgoing bitfield is invalid", {
              cause: error,
            });
          }
        }
        break;
      case "have":
      case "suggestPiece":
      case "allowedFast":
        this.#validatePieceIndex(message.pieceIndex, incoming);
        break;
      case "request":
      case "cancel":
      case "rejectRequest":
        this.#validateBlock(message, incoming);
        break;
      case "piece":
        this.#validateBlock({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.block.length,
        }, incoming);
        break;
    }
  }

  #validatePieceIndex(pieceIndex: number, incoming: boolean): void {
    if (
      !Number.isInteger(pieceIndex) || pieceIndex < 0 ||
      pieceIndex > 0xffffffff ||
      (this.pieceCount !== undefined && pieceIndex >= this.pieceCount)
    ) {
      const ErrorType = incoming ? PeerWireProtocolError : RangeError;
      throw new ErrorType(`piece index ${pieceIndex} is out of range`);
    }
  }

  #validateBlock(request: BlockCoordinates, incoming: boolean): void {
    const ErrorType = incoming ? PeerWireProtocolError : RangeError;
    this.#validatePieceIndex(request.pieceIndex, incoming);
    if (request.length < 1 || request.length > this.maxBlockLength) {
      throw new ErrorType(
        `block length must be from 1 to ${this.maxBlockLength}`,
      );
    }
    if (
      !Number.isInteger(request.begin) || request.begin < 0 ||
      request.begin > 0xffffffff
    ) {
      throw new ErrorType("block begin must be a non-negative integer");
    }
    if (this.pieceLength !== undefined) {
      let actualLength = this.pieceLengths?.[request.pieceIndex] ??
        this.pieceLength;
      if (
        this.pieceLengths === undefined &&
        this.totalLength !== undefined && this.pieceCount !== undefined &&
        request.pieceIndex === this.pieceCount - 1
      ) {
        actualLength = this.totalLength - request.pieceIndex * this.pieceLength;
      }
      if (request.begin + request.length > actualLength) {
        throw new ErrorType("block exceeds piece boundary");
      }
    }
  }

  #assertExtensionNegotiated(message: PeerMessage): void {
    let required: HandshakeExtension | undefined;
    switch (message.type) {
      case "suggestPiece":
      case "haveAll":
      case "haveNone":
      case "rejectRequest":
      case "allowedFast":
        required = HandshakeExtension.Fast;
        break;
      case "extended":
        required = HandshakeExtension.ExtensionProtocol;
        break;
      case "port":
        required = HandshakeExtension.Dht;
        break;
      case "hashRequest":
      case "hashes":
      case "hashReject":
        required = HandshakeExtension.V2;
        break;
      default:
        return;
    }
    if (!this.#hasNegotiated(required)) {
      throw new PeerWireProtocolError(
        `${required} message was used without negotiation`,
      );
    }
  }

  #hasNegotiated(extension: HandshakeExtension): boolean {
    return this.extensions.has(extension) &&
      this.remoteHandshake?.extensions.has(extension) === true;
  }

  #fastNegotiated(): boolean {
    return this.#hasNegotiated(HandshakeExtension.Fast);
  }

  #rejectSemanticsNegotiated(): boolean {
    // BEP 52 adopts BEP 6's request/reject correlation without adopting the
    // allowed-fast set itself.
    return this.#fastNegotiated() ||
      this.#hasNegotiated(HandshakeExtension.V2);
  }

  #trackBlockRequest(request: BlockCoordinates): string {
    this.#validateBlock(request, false);
    const key = blockKey(request);
    if (this.#pendingRequests.has(key)) {
      throw new PeerWireError("block request is already pending");
    }
    if (this.#pendingRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending block requests");
    }
    const entry: PendingBlockRequest = { request: copyBlock(request) };
    if (this.requestTimeoutMs > 0) {
      entry.timer = setTimeout(
        () => this.#removeBlockRequest(key),
        this.requestTimeoutMs,
      );
    }
    this.#pendingRequests.set(key, entry);
    return key;
  }

  // ---- Pending request lifecycle ----------------------------------------

  #pendingEntry(
    request: BlockCoordinates,
    resolve: (block: Uint8Array) => void,
    reject: (reason: unknown) => void,
    options: PeerWireRequestOptions,
  ): PendingBlockRequest {
    if (this.#pendingRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending block requests");
    }
    const entry: PendingBlockRequest = {
      request: copyBlock(request),
      resolve,
      reject,
    };
    this.#configurePending(entry, blockKey(request), options, false);
    return entry;
  }

  #configurePending(
    entry: PendingBlockRequest | PendingHashRequest,
    key: string,
    options: PeerWireRequestOptions,
    hash: boolean,
  ): void {
    // Timers and abort listeners are stored on the entry so every completion
    // path (piece, reject, cancel, close, timeout) performs identical cleanup.
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    if (timeoutMs > 0) {
      entry.timer = setTimeout(() => {
        const error = new PeerWireTimeoutError("peer request timed out");
        if (hash) this.#removeHashRequest(key, error);
        else this.#removeBlockRequest(key, error);
      }, timeoutMs);
    }
    if (options.signal) {
      entry.signal = options.signal;
      entry.abort = () => {
        const reason = options.signal!.reason ??
          new DOMException("Aborted", "AbortError");
        if (hash) this.#removeHashRequest(key, reason);
        else this.#removeBlockRequest(key, reason);
      };
      options.signal.addEventListener("abort", entry.abort, { once: true });
      if (options.signal.aborted) entry.abort();
    }
  }

  #removeBlockRequest(key: string, reason?: unknown): void {
    const entry = this.#pendingRequests.get(key);
    if (!entry) return;
    this.#pendingRequests.delete(key);
    clearPending(entry);
    if (reason !== undefined) entry.reject?.(reason);
  }

  #removeHashRequest(key: string, reason?: unknown): void {
    const entry = this.#pendingHashRequests.get(key);
    if (!entry) return;
    this.#pendingHashRequests.delete(key);
    clearPending(entry);
    if (reason !== undefined) entry.reject(reason);
  }

  #touchActivity(): void {
    this.lastActivityAt = Date.now();
    this.#resetKeepAlive();
    this.#resetIdleTimeout();
  }

  // ---- Timers and terminal cleanup --------------------------------------

  #resetKeepAlive(): void {
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    this.#keepAliveTimer = undefined;
    if (
      this.#keepAliveIntervalMs > 0 && this.state === PeerWireState.Connected
    ) {
      this.#keepAliveTimer = setTimeout(() => {
        // A one-shot timer is restarted by #touchActivity. Keepalives are thus
        // sent after inactivity instead of adding traffic to an active peer.
        this.#keepAliveTimer = undefined;
        if (this.state === PeerWireState.Connected) {
          void this.send({ type: "keepAlive" }).catch((error) =>
            this.#terminate(error)
          );
        }
      }, this.#keepAliveIntervalMs);
    }
  }

  #resetIdleTimeout(): void {
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.idleTimeoutMs > 0 && this.state === PeerWireState.Connected) {
      this.#idleTimer = setTimeout(() => {
        void this.#terminate(
          new PeerWireTimeoutError("peer connection became idle"),
        );
      }, this.idleTimeoutMs);
    }
  }

  async #protocolFailure(message: string): Promise<PeerWireProtocolError> {
    const error = new PeerWireProtocolError(message);
    await this.#terminate(error);
    return error;
  }

  async #terminate(reason?: unknown): Promise<void> {
    // Closing the transport first-class is important: it unblocks a pending
    // read/write instead of waiting forever for the serialized write tail.
    if (this.state === PeerWireState.Closed) return;
    this.state = PeerWireState.Closed;
    this.terminalError ??= reason;
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.extensionHost.close(reason);
    const closeReason = reason ?? new PeerWireEofError("peer wire closed");
    for (const key of [...this.#pendingRequests.keys()]) {
      this.#removeBlockRequest(key, closeReason);
    }
    for (const key of [...this.#pendingHashRequests.keys()]) {
      this.#removeHashRequest(key, closeReason);
    }
    this.#peerRequests.clear();
    this.#peerHashRequests.clear();
    await this.transport.close();
  }

  #assertOpen(): void {
    if (this.state === PeerWireState.Closed) {
      throw new PeerWireError("peer wire is closed");
    }
  }

  #assertConnected(): void {
    this.#assertOpen();
    if (this.state !== PeerWireState.Connected) {
      throw new PeerWireError("peer wire handshake is not complete");
    }
  }
}

function blockKey(request: BlockCoordinates): string {
  return `${request.pieceIndex}:${request.begin}:${request.length}`;
}

function copyBlock(request: BlockCoordinates): BlockCoordinates {
  return {
    pieceIndex: request.pieceIndex,
    begin: request.begin,
    length: request.length,
  };
}

function hashKey(request: HashRequestFields): string {
  return `${
    hex(request.piecesRoot)
  }:${request.baseLayer}:${request.index}:${request.length}:${request.proofLayers}`;
}

function copyHashRequest(request: HashRequestFields): HashRequestFields {
  return {
    piecesRoot: new Uint8Array(request.piecesRoot),
    baseLayer: request.baseLayer,
    index: request.index,
    length: request.length,
    proofLayers: request.proofLayers,
  };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function clearPending(entry: PendingBlockRequest | PendingHashRequest): void {
  if (entry.timer !== undefined) clearTimeout(entry.timer);
  if (entry.signal && entry.abort) {
    entry.signal.removeEventListener("abort", entry.abort);
  }
}

function assertLength20(name: string, bytes: Uint8Array): void {
  if (bytes.length !== 20) {
    throw new RangeError(`${name} must contain 20 bytes`);
  }
}

function assertOptionalSafeInteger(
  name: string,
  value: number | undefined,
  minimum: number,
) {
  if (
    value !== undefined && (!Number.isSafeInteger(value) || value < minimum)
  ) {
    throw new RangeError(
      `${name} must be a safe integer greater than or equal to ${minimum}`,
    );
  }
}

function positiveOption(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function nonNegativeOption(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return resolved;
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: string,
  onFailure?: (error: unknown) => void | Promise<void>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (timeoutMs <= 0 && !signal) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const fail = (error: unknown) =>
      finish(() => {
        void onFailure?.(error);
        reject(error);
      });
    const timer = timeoutMs > 0
      ? setTimeout(
        () => fail(new PeerWireTimeoutError(`${operation} timed out`)),
        timeoutMs,
      )
      : undefined;
    const abort = () =>
      fail(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => fail(error),
    );
  });
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/ut_metadata.ts`

```ts
import { type BencodeValue, decode, encode } from "@deno-torrent/bencode";
import { BytesUtil, HashUtil } from "@deno-torrent/toolkit";
import type {
  ExtendedHandshake,
  PeerWireExtension,
  PeerWireExtensionContext,
} from "@src/extension.ts";
import {
  PeerWireError,
  PeerWireProtocolError,
  PeerWireRequestRejectedError,
  PeerWireTimeoutError,
} from "@src/errors.ts";

/** Registered BEP 10 name for metadata exchange. */
export const UT_METADATA_NAME = "ut_metadata";
/** BEP 9's fixed metadata block size. */
export const UT_METADATA_BLOCK_LENGTH = 16 * 1024;

/** Limits and optional serving data for {@link UtMetadataExtension}. */
export interface UtMetadataOptions {
  /** Expected v1 SHA-1 or v2 SHA-256 info hash for downloaded metadata. */
  infoHash: Uint8Array;
  /** Raw bencoded info dictionary to serve to requesting peers. */
  metadata?: Uint8Array;
  /** Maximum metadata accepted or served, defaulting to 4 MiB. */
  maxMetadataSize?: number;
  /** Default handshake and per-block deadline. */
  requestTimeoutMs?: number;
  /** Maximum number of metadata blocks requested concurrently. */
  maxOutstandingRequests?: number;
}

/** Per-download cancellation and deadline overrides. */
export interface UtMetadataFetchOptions {
  /** Cancel the pending handshake and block requests. */
  signal?: AbortSignal;
  /** Override the configured deadline for this download. */
  timeoutMs?: number;
}

interface PendingPiece {
  resolve: (block: Uint8Array) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

type UtMetadataMessage =
  | { type: "request"; piece: number }
  | { type: "data"; piece: number; totalSize: number; data: Uint8Array }
  | { type: "reject"; piece: number };

/** Built-in BEP 9 metadata exchange extension. */
export class UtMetadataExtension implements PeerWireExtension {
  /** BEP 10 registration name. */
  readonly name: typeof UT_METADATA_NAME = UT_METADATA_NAME;
  /** Expected SHA-1 (v1) or SHA-256 (v2) digest of the info dictionary. */
  readonly infoHash: Uint8Array;
  /** Maximum metadata size accepted in either direction. */
  readonly maxMetadataSize: number;
  /** Default handshake and per-block deadline. */
  readonly requestTimeoutMs: number;
  /** Maximum number of pipelined block requests. */
  readonly maxOutstandingRequests: number;

  /** Raw metadata served locally, or the most recently verified download. */
  metadata?: Uint8Array;
  /** Size most recently advertised by the peer. */
  peerMetadataSize?: number;

  #context?: PeerWireExtensionContext;
  #pending = new Map<number, PendingPiece>();

  /** Create a bounded BEP 9 downloader and optional metadata server. */
  constructor(options: UtMetadataOptions) {
    if (options.infoHash.length !== 20 && options.infoHash.length !== 32) {
      throw new RangeError("ut_metadata infoHash must contain 20 or 32 bytes");
    }
    this.infoHash = new Uint8Array(options.infoHash);
    this.maxMetadataSize = options.maxMetadataSize ?? 4 * 1024 * 1024;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.maxOutstandingRequests = options.maxOutstandingRequests ?? 4;
    if (
      !Number.isSafeInteger(this.maxMetadataSize) || this.maxMetadataSize < 1
    ) {
      throw new RangeError("maxMetadataSize must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1
    ) {
      throw new RangeError("requestTimeoutMs must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(this.maxOutstandingRequests) ||
      this.maxOutstandingRequests < 1
    ) {
      throw new RangeError(
        "maxOutstandingRequests must be a positive safe integer",
      );
    }
    if (options.metadata) this.setMetadata(options.metadata);
  }

  /** @internal Implements {@link PeerWireExtension}. */
  onRegister(context: PeerWireExtensionContext): void {
    this.#context = context;
  }

  /** Advertise `metadata_size` only when local metadata is available. */
  handshakeFields(): ReadonlyMap<string, BencodeValue> {
    return this.metadata
      ? new Map<string, BencodeValue>([["metadata_size", this.metadata.length]])
      : new Map();
  }

  /** Capture and bound the peer's advertised metadata size. */
  onExtendedHandshake(handshake: ExtendedHandshake): void {
    const size = handshake.metadataSize;
    if (size !== undefined && (size < 1 || size > this.maxMetadataSize)) {
      throw new PeerWireProtocolError(
        `peer metadata size ${size} exceeds limit ${this.maxMetadataSize}`,
      );
    }
    this.peerMetadataSize = size;
  }

  /** Serve requests or correlate incoming BEP 9 data and rejection messages. */
  async onMessage(payload: Uint8Array): Promise<void> {
    const message = decodeUtMetadataMessage(payload);
    if (message.type === "request") {
      await this.#serve(message.piece);
      return;
    }
    const pending = this.#pending.get(message.piece);
    if (!pending) return;
    this.#pending.delete(message.piece);
    clearPending(pending);
    if (message.type === "reject") {
      pending.reject(
        new PeerWireRequestRejectedError(
          `peer rejected metadata piece ${message.piece}`,
        ),
      );
      return;
    }
    if (
      this.peerMetadataSize !== undefined &&
      message.totalSize !== this.peerMetadataSize
    ) {
      pending.reject(new PeerWireProtocolError("peer changed metadata size"));
      return;
    }
    if (message.totalSize < 1 || message.totalSize > this.maxMetadataSize) {
      pending.reject(
        new PeerWireProtocolError("peer metadata size is invalid"),
      );
      return;
    }
    this.peerMetadataSize ??= message.totalSize;
    const expected = Math.min(
      UT_METADATA_BLOCK_LENGTH,
      message.totalSize - message.piece * UT_METADATA_BLOCK_LENGTH,
    );
    if (expected < 1 || message.data.length !== expected) {
      pending.reject(
        new PeerWireProtocolError("metadata block length is invalid"),
      );
      return;
    }
    pending.resolve(message.data);
  }

  /** Replace the raw info dictionary advertised and served to the peer. */
  setMetadata(metadata: Uint8Array): void {
    if (metadata.length < 1 || metadata.length > this.maxMetadataSize) {
      throw new RangeError(
        `metadata must contain 1 to ${this.maxMetadataSize} bytes`,
      );
    }
    this.metadata = new Uint8Array(metadata);
  }

  /** Download, assemble, and verify the remote info dictionary bytes. */
  async fetch(options: UtMetadataFetchOptions = {}): Promise<Uint8Array> {
    const context = this.#requireContext();
    if (this.metadata) return new Uint8Array(this.metadata);
    const handshake = await withDeadline(
      context.host.waitForPeerHandshake(),
      options.timeoutMs ?? this.requestTimeoutMs,
      options.signal,
      "waiting for ut_metadata handshake",
    );
    if (!context.host.peerExtensions.has(this.name)) {
      throw new PeerWireError("remote peer did not advertise ut_metadata");
    }
    const size = handshake.metadataSize;
    if (size === undefined) {
      throw new PeerWireError("remote peer did not advertise metadata_size");
    }
    if (size < 1 || size > this.maxMetadataSize) {
      throw new PeerWireProtocolError(`peer metadata size ${size} is invalid`);
    }
    // BEP 9 fixes metadata blocks at 16 KiB. A small worker pool pipelines
    // requests without allowing metadata size to dictate unbounded concurrency.
    const blocks = new Array<Uint8Array>(
      Math.ceil(size / UT_METADATA_BLOCK_LENGTH),
    );
    let nextPiece = 0;
    const worker = async () => {
      for (;;) {
        const piece = nextPiece++;
        if (piece >= blocks.length) return;
        blocks[piece] = await this.#requestPiece(piece, options);
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(this.maxOutstandingRequests, blocks.length) },
          worker,
        ),
      );
    } catch (error) {
      this.#rejectPending(error);
      throw error;
    }
    const metadata = new Uint8Array(size);
    let offset = 0;
    for (const block of blocks) {
      metadata.set(block, offset);
      offset += block.length;
    }
    const digest = this.infoHash.length === 32
      ? await HashUtil.sha256(metadata)
      : await HashUtil.sha1(metadata);
    if (!BytesUtil.equals(digest, this.infoHash)) {
      throw new PeerWireProtocolError(
        "received metadata does not match info hash",
      );
    }
    this.metadata = metadata;
    return new Uint8Array(metadata);
  }

  /** Reject every pending metadata block when the owning wire closes. */
  close(reason: unknown = new PeerWireError("peer wire closed")): void {
    this.#rejectPending(reason);
  }

  #rejectPending(reason: unknown): void {
    for (const pending of this.#pending.values()) {
      clearPending(pending);
      pending.reject(reason);
    }
    this.#pending.clear();
  }

  async #requestPiece(
    piece: number,
    options: UtMetadataFetchOptions,
  ): Promise<Uint8Array> {
    const context = this.#requireContext();
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    if (this.#pending.has(piece)) {
      throw new PeerWireError(`metadata piece ${piece} is already pending`);
    }
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      const pending: PendingPiece = { resolve, reject };
      const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
      pending.timer = setTimeout(() => {
        this.#pending.delete(piece);
        reject(new PeerWireTimeoutError(`metadata piece ${piece} timed out`));
      }, timeoutMs);
      if (options.signal) {
        pending.signal = options.signal;
        pending.abort = () => {
          this.#pending.delete(piece);
          clearPending(pending);
          reject(
            options.signal!.reason ?? new DOMException("Aborted", "AbortError"),
          );
        };
        options.signal.addEventListener("abort", pending.abort, { once: true });
      }
      this.#pending.set(piece, pending);
    });
    try {
      await context.send(encodeMetadataHeader(0, piece));
    } catch (error) {
      const pending = this.#pending.get(piece);
      if (pending) {
        this.#pending.delete(piece);
        clearPending(pending);
        pending.reject(error);
      }
    }
    return await promise;
  }

  async #serve(piece: number): Promise<void> {
    const context = this.#requireContext();
    const metadata = this.metadata;
    if (!metadata) {
      await context.send(encodeMetadataHeader(2, piece));
      return;
    }
    const start = piece * UT_METADATA_BLOCK_LENGTH;
    if (!Number.isSafeInteger(piece) || piece < 0 || start >= metadata.length) {
      await context.send(encodeMetadataHeader(2, piece));
      return;
    }
    const header = encodeMetadataHeader(1, piece, metadata.length);
    const block = metadata.subarray(start, start + UT_METADATA_BLOCK_LENGTH);
    const payload = new Uint8Array(header.length + block.length);
    payload.set(header);
    payload.set(block, header.length);
    await context.send(payload);
  }

  #requireContext(): PeerWireExtensionContext {
    if (!this.#context) {
      throw new PeerWireError("ut_metadata is not registered");
    }
    return this.#context;
  }
}

function encodeMetadataHeader(type: number, piece: number, totalSize?: number) {
  const dictionary = new Map<string, BencodeValue>([
    ["msg_type", type],
    ["piece", piece],
  ]);
  if (totalSize !== undefined) dictionary.set("total_size", totalSize);
  return encode(dictionary);
}

function decodeUtMetadataMessage(payload: Uint8Array): UtMetadataMessage {
  // A data message appends raw metadata bytes after its bencoded dictionary,
  // so the strict bencode decoder must receive only the dictionary prefix.
  const headerLength = bencodePrefixLength(payload);
  let value: BencodeValue;
  try {
    value = decode(payload.subarray(0, headerLength), {
      maxBytes: 64 * 1024,
      maxDepth: 16,
    });
  } catch (cause) {
    throw new PeerWireProtocolError("invalid ut_metadata header", { cause });
  }
  if (!(value instanceof Map)) {
    throw new PeerWireProtocolError("ut_metadata header must be a dictionary");
  }
  const type = requiredInteger(value, "msg_type");
  const piece = requiredInteger(value, "piece");
  if (type === 0) return { type: "request", piece };
  if (type === 2) return { type: "reject", piece };
  if (type !== 1) {
    throw new PeerWireProtocolError("unknown ut_metadata message type");
  }
  return {
    type: "data",
    piece,
    totalSize: requiredInteger(value, "total_size"),
    data: payload.slice(headerLength),
  };
}

function requiredInteger(
  dictionary: Map<string | Uint8Array, BencodeValue>,
  key: string,
) {
  const value = dictionary.get(key);
  if (typeof value !== "number" || value < 0) {
    throw new PeerWireProtocolError(`ut_metadata ${key} must be non-negative`);
  }
  return value;
}

/** Locate the end of the first bencoded value without consuming appended data. */
function bencodePrefixLength(bytes: Uint8Array): number {
  const scan = (start: number, depth: number): number => {
    if (depth > 32 || start >= bytes.length) {
      throw new PeerWireProtocolError("truncated ut_metadata header");
    }
    const marker = bytes[start];
    if (marker === 0x69) {
      const end = bytes.indexOf(0x65, start + 1);
      if (end < 0) throw new PeerWireProtocolError("truncated bencode integer");
      return end + 1;
    }
    if (marker === 0x6c || marker === 0x64) {
      let offset = start + 1;
      while (offset < bytes.length && bytes[offset] !== 0x65) {
        offset = scan(offset, depth + 1);
      }
      if (offset >= bytes.length) {
        throw new PeerWireProtocolError("truncated bencode container");
      }
      return offset + 1;
    }
    if (marker >= 0x30 && marker <= 0x39) {
      let colon = start;
      while (colon < bytes.length && bytes[colon] !== 0x3a) colon++;
      if (colon >= bytes.length) {
        throw new PeerWireProtocolError("truncated bencode string");
      }
      const length = Number(
        new TextDecoder().decode(bytes.subarray(start, colon)),
      );
      const end = colon + 1 + length;
      if (!Number.isSafeInteger(length) || length < 0 || end > bytes.length) {
        throw new PeerWireProtocolError("invalid bencode string length");
      }
      return end;
    }
    throw new PeerWireProtocolError("invalid bencode marker");
  };
  return scan(0, 0);
}

function clearPending(pending: PendingPiece): void {
  if (pending.timer !== undefined) clearTimeout(pending.timer);
  if (pending.signal && pending.abort) {
    pending.signal.removeEventListener("abort", pending.abort);
  }
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: string,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PeerWireTimeoutError(`${operation} timed out`)),
      timeoutMs,
    );
    const abort = () =>
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    });
  });
}

```

---

## Arquivo: `docs/deno-torrent/peerwire/ut_pex.ts`

```ts
import { type BencodeValue, decode, encode } from "@deno-torrent/bencode";
import type {
  PeerWireExtension,
  PeerWireExtensionContext,
} from "@src/extension.ts";
import { PeerWireError, PeerWireProtocolError } from "@src/errors.ts";

/** Registered BEP 10 name for peer exchange. */
export const UT_PEX_NAME = "ut_pex";

/** Flags accompanying compact peers in a BEP 11 update. */
export enum PexPeerFlag {
  PrefersEncryption = 0x01,
  Seed = 0x02,
  Utp = 0x04,
  Holepunch = 0x08,
  Outgoing = 0x10,
}

/** One compact peer candidate carried by BEP 11. */
export interface PexPeer {
  /** Four-byte IPv4 or sixteen-byte IPv6 address. */
  address: Uint8Array;
  /** Unsigned network port. */
  port: number;
  /** Bitwise combination of {@link PexPeerFlag} values. */
  flags?: number;
}

/** Candidate changes reported by one peer; no dialing policy is implied. */
export interface PexUpdate {
  /** New candidates reported by the peer. */
  added: PexPeer[];
  /** Candidates the peer no longer recommends. */
  dropped: PexPeer[];
}

/** Resource and callback options for {@link UtPexExtension}. */
export interface UtPexOptions {
  /** BEP 11 requires at least sixty seconds in production. */
  minSendIntervalMs?: number;
  /** Combined added and dropped peer limit, defaulting to 100. */
  maxPeersPerMessage?: number;
  /** Optional initial listener for validated incoming updates. */
  onUpdate?: (update: PexUpdate) => void;
}

/** Built-in BEP 11 peer exchange codec and transport extension. */
export class UtPexExtension implements PeerWireExtension {
  /** BEP 10 registration name. */
  readonly name: typeof UT_PEX_NAME = UT_PEX_NAME;
  /** Minimum duration enforced between outgoing updates. */
  readonly minSendIntervalMs: number;
  /** Combined candidate limit for each incoming or outgoing update. */
  readonly maxPeersPerMessage: number;

  #context?: PeerWireExtensionContext;
  #lastSentAt = -Infinity;
  #listeners = new Set<(update: PexUpdate) => void>();

  /** Create a bounded PEX codec and notification endpoint. */
  constructor(options: UtPexOptions = {}) {
    this.minSendIntervalMs = options.minSendIntervalMs ?? 60_000;
    this.maxPeersPerMessage = options.maxPeersPerMessage ?? 100;
    if (
      !Number.isSafeInteger(this.minSendIntervalMs) ||
      this.minSendIntervalMs < 0
    ) {
      throw new RangeError(
        "minSendIntervalMs must be a non-negative safe integer",
      );
    }
    if (
      !Number.isSafeInteger(this.maxPeersPerMessage) ||
      this.maxPeersPerMessage < 1
    ) {
      throw new RangeError(
        "maxPeersPerMessage must be a positive safe integer",
      );
    }
    if (options.onUpdate) this.#listeners.add(options.onUpdate);
  }

  /** @internal Implements {@link PeerWireExtension}. */
  onRegister(context: PeerWireExtensionContext): void {
    this.#context = context;
  }

  /** Decode, validate, and notify listeners of one peer update. */
  onMessage(payload: Uint8Array): void {
    const update = decodePexUpdate(payload, this.maxPeersPerMessage);
    for (const listener of this.#listeners) listener(update);
  }

  /** Subscribe to validated updates and return an unsubscribe function. */
  onUpdate(listener: (update: PexUpdate) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Send a bounded update without dialing or modifying any swarm state. */
  async send(update: PexUpdate): Promise<void> {
    // BEP 11 limits production senders to one update per minute. Tests and
    // specialized callers may choose a different interval explicitly.
    if (!this.#context) throw new PeerWireError("ut_pex is not registered");
    const now = Date.now();
    if (now - this.#lastSentAt < this.minSendIntervalMs) {
      throw new PeerWireError("ut_pex updates may not be sent this frequently");
    }
    if (update.added.length + update.dropped.length > this.maxPeersPerMessage) {
      throw new RangeError(
        `ut_pex update exceeds ${this.maxPeersPerMessage} peers`,
      );
    }
    const payload = encodePexUpdate(update);
    await this.#context.send(payload);
    this.#lastSentAt = now;
  }
}

/** Encode IPv4 and IPv6 candidates into BEP 11 compact fields. */
export function encodePexUpdate(update: PexUpdate): Uint8Array {
  const added4 = update.added.filter((peer) => peer.address.length === 4);
  const added6 = update.added.filter((peer) => peer.address.length === 16);
  const dropped4 = update.dropped.filter((peer) => peer.address.length === 4);
  const dropped6 = update.dropped.filter((peer) => peer.address.length === 16);
  if (
    added4.length + added6.length !== update.added.length ||
    dropped4.length + dropped6.length !== update.dropped.length
  ) {
    throw new RangeError("PEX addresses must contain four or sixteen bytes");
  }
  const dictionary = new Map<string, BencodeValue>();
  if (added4.length) {
    dictionary.set("added", compactPeers(added4, 4));
    dictionary.set(
      "added.f",
      Uint8Array.from(added4, (peer) => peer.flags ?? 0),
    );
  }
  if (added6.length) {
    dictionary.set("added6", compactPeers(added6, 16));
    dictionary.set(
      "added6.f",
      Uint8Array.from(added6, (peer) => peer.flags ?? 0),
    );
  }
  if (dropped4.length) dictionary.set("dropped", compactPeers(dropped4, 4));
  if (dropped6.length) dictionary.set("dropped6", compactPeers(dropped6, 16));
  return encode(dictionary);
}

/** Decode and bound a BEP 11 update from an untrusted peer. */
export function decodePexUpdate(
  payload: Uint8Array,
  maxPeers = 100,
): PexUpdate {
  let value: BencodeValue;
  try {
    value = decode(payload, { maxBytes: 256 * 1024, maxDepth: 16 });
  } catch (cause) {
    throw new PeerWireProtocolError("invalid ut_pex payload", { cause });
  }
  if (!(value instanceof Map)) {
    throw new PeerWireProtocolError("ut_pex payload must be a dictionary");
  }
  const added = [
    ...decodePeers(value, "added", "added.f", 4),
    ...decodePeers(value, "added6", "added6.f", 16),
  ];
  const dropped = [
    ...decodePeers(value, "dropped", undefined, 4),
    ...decodePeers(value, "dropped6", undefined, 16),
  ];
  if (added.length + dropped.length > maxPeers) {
    throw new PeerWireProtocolError(`ut_pex update exceeds ${maxPeers} peers`);
  }
  return { added, dropped };
}

function compactPeers(peers: PexPeer[], addressLength: number): Uint8Array {
  const result = new Uint8Array(peers.length * (addressLength + 2));
  let offset = 0;
  for (const peer of peers) {
    if (peer.address.length !== addressLength) {
      throw new RangeError("PEX peer address family changed while encoding");
    }
    if (!Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535) {
      throw new RangeError("PEX peer port must be in the range 1..65535");
    }
    if (
      peer.flags !== undefined &&
      (!Number.isInteger(peer.flags) || peer.flags < 0 || peer.flags > 255)
    ) {
      throw new RangeError("PEX peer flags must be an unsigned byte");
    }
    result.set(peer.address, offset);
    new DataView(result.buffer).setUint16(offset + addressLength, peer.port);
    offset += addressLength + 2;
  }
  return result;
}

function decodePeers(
  dictionary: Map<string | Uint8Array, BencodeValue>,
  peersKey: string,
  flagsKey: string | undefined,
  addressLength: number,
): PexPeer[] {
  const compact = optionalBytes(dictionary, peersKey);
  if (!compact) return [];
  const width = addressLength + 2;
  if (compact.length % width !== 0) {
    throw new PeerWireProtocolError(
      `${peersKey} has a truncated compact endpoint`,
    );
  }
  const count = compact.length / width;
  const flags = flagsKey ? optionalBytes(dictionary, flagsKey) : undefined;
  if (flags && flags.length !== count) {
    throw new PeerWireProtocolError(
      `${flagsKey} length does not match peer count`,
    );
  }
  const peers: PexPeer[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * width;
    const port = new DataView(
      compact.buffer,
      compact.byteOffset + offset + addressLength,
      2,
    ).getUint16(0);
    if (port === 0) {
      throw new PeerWireProtocolError("PEX peer port may not be zero");
    }
    peers.push({
      address: compact.slice(offset, offset + addressLength),
      port,
      flags: flags?.[index] ?? 0,
    });
  }
  return peers;
}

function optionalBytes(
  dictionary: Map<string | Uint8Array, BencodeValue>,
  key: string,
): Uint8Array | undefined {
  const value = dictionary.get(key);
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new PeerWireProtocolError(`ut_pex ${key} must be a byte string`);
}

```

---

## Arquivo: `docs/deno-torrent/toolkit/bytes/bit_array.test.ts`

```ts
import { assertEquals, assertThrows } from '@std/assert';

import { BitArray, BytesUtil } from '../../mod.ts';

Deno.test('test bit array', () => {
  const bitArray = BitArray.fromInt(0b10101010);
  assertEquals(bitArray.length, 8);
  assertEquals(bitArray.bytes, new Uint8Array([0b10101010]));
  assertEquals(bitArray.toString(), '10101010');
});

Deno.test('test bit array get and set', () => {
  const bitArray = BitArray.fromInt(0b10101010);

  // defualt direction is lowest,from right to left
  assertEquals(bitArray.get(0), false);
  assertEquals(bitArray.get(1), true);
  assertEquals(bitArray.get(2), false);
  assertEquals(bitArray.get(3), true);
  assertEquals(bitArray.get(4), false);
  assertEquals(bitArray.get(5), true);
  assertEquals(bitArray.get(6), false);
  assertEquals(bitArray.get(7), true);
  assertThrows(() => bitArray.get(8)); // out of range

  // test highest, from left to right
  assertEquals(bitArray.get(0, 'highest'), true);
  assertEquals(bitArray.get(1, 'highest'), false);
  assertEquals(bitArray.get(2, 'highest'), true);
  assertEquals(bitArray.get(3, 'highest'), false);
  assertEquals(bitArray.get(4, 'highest'), true);
  assertEquals(bitArray.get(5, 'highest'), false);
  assertEquals(bitArray.get(6, 'highest'), true);
  assertEquals(bitArray.get(7, 'highest'), false);
  assertThrows(() => bitArray.get(8, 'highest')); // out of range
});

Deno.test('BitArray getBit and setBit use per-byte MSB0 ordering', () => {
  const bits = BitArray.fromUint8Array(new Uint8Array(2));
  bits.setBit(0, true, 'msb0');
  bits.setBit(7, true, 'msb0');
  bits.setBit(9, true, 'msb0');

  assertEquals(bits.bytes, new Uint8Array([0x81, 0x40]));
  assertEquals(bits.getBit(0, 'msb0'), true);
  assertEquals(bits.getBit(7, 'msb0'), true);
  assertEquals(bits.getBit(9, 'msb0'), true);
  assertEquals(bits.getBit(8, 'msb0'), false);
});

Deno.test('BitArray getBit and setBit default to per-byte LSB0 ordering', () => {
  const bits = BitArray.fromUint8Array(new Uint8Array(2));
  bits.setBit(0, true);
  bits.setBit(7, true);
  bits.setBit(9, true);

  assertEquals(bits.bytes, new Uint8Array([0x81, 0x02]));
  assertEquals(bits.getBit(9), true);
  bits.setBit(9, false);
  assertEquals(bits.getBit(9), false);
});

Deno.test('BitArray MSB0 keeps Uint8Array byte order', () => {
  const bits = BitArray.fromUint8Array(new Uint8Array([0x80, 0x40]));
  assertEquals(bits.getBit(0, 'msb0'), true);
  assertEquals(bits.getBit(9, 'msb0'), true);
  assertEquals(bits.getBit(14, 'msb0'), false);
});

Deno.test('BitArray getBit and setBit reject invalid indices', () => {
  const bits = BitArray.fromUint8Array(new Uint8Array(1));
  for (const index of [-1, 8, 1.5, Number.NaN]) {
    assertThrows(() => bits.getBit(index, 'msb0'), RangeError);
    assertThrows(() => bits.setBit(index, true, 'lsb0'), RangeError);
  }
});

Deno.test('test bit array xor', () => {
  const bitArray1 = BitArray.fromInt(0b10101010);
  const bitArray2 = BitArray.fromInt(0b01010101);
  const bitArray3 = bitArray1.xor(bitArray2);
  const bitArray4 = bitArray2.xor(bitArray1);
  assertEquals(bitArray3.bytes, new Uint8Array([0b11111111]));
  assertEquals(bitArray4.bytes, new Uint8Array([0b11111111]));
});

Deno.test('BitArray.xor throws when lengths differ', () => {
  const oneByte = BitArray.fromUint8Array(new Uint8Array([0b10101010]));
  const twoBytes = BitArray.fromUint8Array(new Uint8Array([0b01010101, 0b11110000]));

  assertThrows(() => oneByte.xor(twoBytes), RangeError);
  assertThrows(() => twoBytes.xor(oneByte), RangeError);
});

Deno.test('test bit array compare', () => {
  const bitArray1 = BitArray.fromInt(0b10101010);
  const bitArray2 = BitArray.fromInt(0b01010101);
  const bitArray3 = BitArray.fromInt(0b10101010);
  assertEquals(bitArray1.greaterThan(bitArray2), true);
  assertEquals(bitArray2.greaterThan(bitArray1), false);

  assertEquals(bitArray1.lessThan(bitArray2), false);
  assertEquals(bitArray2.lessThan(bitArray1), true);

  assertEquals(bitArray1.equals(bitArray2), false);
  assertEquals(bitArray2.equals(bitArray1), false);
  assertEquals(bitArray1.equals(bitArray3), true);
  assertEquals(bitArray2.equals(bitArray3), false);
  assertEquals(
    BitArray.fromUint8Array(new Uint8Array([1])).equals(
      BitArray.fromUint8Array(new Uint8Array([0, 1])),
    ),
    false,
  );
});

Deno.test('test bit array create', () => {
  const bitArray1 = BitArray.fromInt(0b10101010);
  const bitArray2 = BitArray.fromUint8Array(new Uint8Array([0b10101010]));
  const bitArray3 = BitArray.fromBinaryString('10101010');
  assertEquals(bitArray1.equals(bitArray2), true);
  assertEquals(bitArray1.equals(bitArray3), true);
  assertEquals(bitArray2.equals(bitArray3), true);
  assertThrows(() => BitArray.fromBinaryString('101010102'), TypeError);
  assertThrows(() => BitArray.fromBinaryString(''), TypeError);
});

Deno.test('BitArray validates numeric lengths and indices', () => {
  assertThrows(() => BitArray.fromInt(-1), RangeError);
  assertThrows(() => BitArray.fromInt(1.5), RangeError);
  assertThrows(() => BitArray.fromInt(1, -1), RangeError);
  assertThrows(() => BitArray.fromBigInt(-1n), RangeError);
  assertThrows(() => BitArray.fromBigInt(1n, 1.5), RangeError);

  const bits = BitArray.fromInt(1);
  assertThrows(() => bits.get(1.5), RangeError);
  assertThrows(() => bits.set(Number.NaN, true), RangeError);
  assertThrows(
    () => bits.diff(BitArray.fromUint8Array(new Uint8Array([0, 1]))),
    RangeError,
  );
});

Deno.test('BitArray copies constructor input and byte output', () => {
  const source = new Uint8Array([0b10101010]);
  const bitArray = BitArray.fromUint8Array(source);
  source[0] = 0;
  assertEquals(bitArray.toString(), '10101010');

  const bytes = bitArray.bytes;
  bytes[0] = 0;
  assertEquals(bitArray.toString(), '10101010');
});

Deno.test('test bit array create from bigint', () => {
  const bitArray1 = BitArray.fromInt(0b10101010);
  const bitArray2 = BitArray.fromBigInt(0b10101010n);
  assertEquals(bitArray1.equals(bitArray2), true);

  const bitArray3 = BitArray.fromBinaryString(
    '1010101010101010101010101010101010101010101010101010101010101010',
  );
  const bitArray4 = BitArray.fromBigInt(
    0b1010101010101010101010101010101010101010101010101010101010101010n,
  );
  assertEquals(bitArray3.equals(bitArray4), true);
});

Deno.test('test chunkUnit8Array', () => {
  assertThrows(() => BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), -1));
  assertThrows(() => BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 0));

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 1), [
    Uint8Array.from([1]),
    Uint8Array.from([2]),
    Uint8Array.from([3]),
    Uint8Array.from([4]),
    Uint8Array.from([5]),
    Uint8Array.from([6]),
    Uint8Array.from([7]),
    Uint8Array.from([8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 2), [
    Uint8Array.from([1, 2]),
    Uint8Array.from([3, 4]),
    Uint8Array.from([5, 6]),
    Uint8Array.from([7, 8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 3), [
    Uint8Array.from([1, 2, 3]),
    Uint8Array.from([4, 5, 6]),
    Uint8Array.from([7, 8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 4), [
    Uint8Array.from([1, 2, 3, 4]),
    Uint8Array.from([5, 6, 7, 8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 5), [
    Uint8Array.from([1, 2, 3, 4, 5]),
    Uint8Array.from([6, 7, 8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 6), [
    Uint8Array.from([1, 2, 3, 4, 5, 6]),
    Uint8Array.from([7, 8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 7), [
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7]),
    Uint8Array.from([8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 8), [
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
  ]);

  assertEquals(BytesUtil.chunkBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 9), [
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
  ]);
});

```

---

## Arquivo: `docs/deno-torrent/toolkit/bytes/bit_array.ts`

```ts
import { BytesUtil } from './bytes_util.ts';

/** Bit numbering within each byte, while bytes remain in array order. */
export type BitOrder = 'lsb0' | 'msb0';

/**
 * A bit array is an array data structure that compactly stores bits. It can be used to implement a simple set data structure.
 */
export class BitArray {
  #data: Uint8Array;

  private constructor(data: Uint8Array) {
    this.#data = data;
  }

  toBigInt(): bigint {
    return BigInt(`0b${this.toString()}`);
  }

  /**
   * create a bit array from a binary string, e.g. 0101 0101
   * @param data the binary string, e.g. 0101 0101
   */
  static fromBinaryString(data: string): BitArray {
    // check the data is a binary string
    if (!BitArray.isBinaryString(data)) {
      throw new TypeError('data must be a non-empty binary string');
    }

    const bytesLength = Math.ceil(data.length / 8);

    // int range is small, so we can use BigInt to convert binary string to number
    const number = BigInt(`0b${data}`);
    const bytes = new Uint8Array(bytesLength);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number((number >> BigInt(8 * (bytes.length - 1 - i))) & BigInt(0xff));
    }

    return new BitArray(bytes);
  }

  /**
   * Creates a bit array from a byte array.
   *
   * The input is copied, so later mutations to `data` do not affect the
   * returned bit array.
   *
   * @param data - Bytes to copy into the bit array.
   */
  static fromUint8Array(data: Uint8Array): BitArray {
    return new BitArray(data.slice());
  }

  /**
   * create a bit array from a number
   * @param data
   * @param length the bit length of the number, if the bit length of the number is less than length, fill the number with 0 from the highest bit
   * @returns
   */
  static fromInt(data: number, length = 0): BitArray {
    if (!Number.isSafeInteger(data) || data < 0) {
      throw new RangeError('data must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError('length must be a non-negative safe integer');
    }

    const binaryString = data.toString(2);
    const safeLength = Math.max(binaryString.length, length);
    return this.fromBinaryString(data.toString(2).padStart(safeLength, '0'));
  }

  /**
   * @param data
   * @param length the bit length of the number, if the bit length of the number is less than length, fill the number with 0 from the highest bit
   * @returns
   */
  static fromBigInt(data: bigint, length = 0): BitArray {
    if (data < 0n) {
      throw new RangeError('data must be non-negative');
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError('length must be a non-negative safe integer');
    }

    const binaryString = data.toString(2);
    const safeLength = Math.max(binaryString.length, length);
    return this.fromBinaryString(data.toString(2).padStart(safeLength, '0'));
  }

  static isBinaryString(data: string): boolean {
    if (data.length === 0) return false;

    // if data has any character other than 0 and 1, it is not a binary string
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== '0' && data[i] !== '1') {
        return false;
      }
    }
    return true;
  }

  /**
   * get the length of the bit array
   */
  get length(): number {
    return this.#data.length * 8;
  }

  /**
   * Gets a copy of the bytes in this bit array.
   *
   * Mutating the returned array does not modify this bit array.
   */
  get bytes(): Uint8Array {
    return this.#data.slice();
  }

  /**
   * Gets a bit using explicit per-byte bit numbering.
   *
   * Bytes are always traversed in `Uint8Array` order. With `lsb0`, index 0
   * selects `0x01` in the first byte; with `msb0`, it selects `0x80`.
   *
   * @param index - Zero-based bit index.
   * @param order - Bit numbering within each byte. Defaults to `lsb0`.
   * @throws {RangeError} If `index` is not a valid bit index.
   */
  getBit(index: number, order: BitOrder = 'lsb0'): boolean {
    this.assertBitIndex(index);
    const byteIndex = Math.floor(index / 8);
    const mask = order === 'msb0' ? 0x80 >> (index % 8) : 1 << (index % 8);
    return (this.#data[byteIndex] & mask) !== 0;
  }

  /**
   * Sets a bit using explicit per-byte bit numbering.
   *
   * Bytes are always traversed in `Uint8Array` order. With `lsb0`, index 0
   * selects `0x01` in the first byte; with `msb0`, it selects `0x80`.
   *
   * @param index - Zero-based bit index.
   * @param value - Whether the selected bit should be set.
   * @param order - Bit numbering within each byte. Defaults to `lsb0`.
   * @throws {RangeError} If `index` is not a valid bit index.
   */
  setBit(index: number, value: boolean, order: BitOrder = 'lsb0'): void {
    this.assertBitIndex(index);
    const byteIndex = Math.floor(index / 8);
    const mask = order === 'msb0' ? 0x80 >> (index % 8) : 1 << (index % 8);
    if (value) {
      this.#data[byteIndex] |= mask;
    } else {
      this.#data[byteIndex] &= ~mask;
    }
  }

  private assertBitIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }
  }

  /**
   * compare this bit array with the other bit array
   * @param other
   * @returns
   */
  greaterThan(other: BitArray): boolean {
    return this.toBigInt() > other.toBigInt();
  }

  greaterThanOrEqual(other: BitArray): boolean {
    return this.greaterThan(other) || this.equals(other);
  }

  /**
   * compare this bit array with the other bit array
   * @param other
   * @returns
   */
  lessThan(other: BitArray): boolean {
    return this.toBigInt() < other.toBigInt();
  }

  lessThanOrEqual(other: BitArray): boolean {
    return this.lessThan(other) || this.equals(other);
  }

  /**
   * compare this bit array with the other bit array
   * @param other
   * @returns
   */
  equals(other: BitArray): boolean {
    if (this.length !== other.length) return false;
    return this.#data.every((byte, index) => byte === other.#data[index]);
  }

  /**
   * calculate the xor of this bit array and the other bit array
   * @param other the other bit array
   * @returns a new bit array
   * @throws {RangeError} If the bit arrays have different lengths.
   */
  xor(other: BitArray): BitArray {
    if (this.length !== other.length) {
      throw new RangeError('Bit arrays must have the same length for xor');
    }

    const data = new Uint8Array(this.#data.length);
    for (let i = 0; i < this.#data.length; i++) {
      data[i] = this.#data[i] ^ other.#data[i];
    }
    return new BitArray(data);
  }

  /**
   * set the bit at the index
   * @param index the index of the bit
   * @param value the value of the bit
   * @param zeroIndex the index of the zero bit, lowest or highest, default is lowest ,if the bit array is 1010 1010, the lowest zero bit is 0, the highest zero bit is 7
   */
  set(index: number, value: boolean, zeroIndex: 'lowest' | 'highest' = 'lowest'): void {
    // out of range check
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }

    if (zeroIndex === 'lowest') {
      this.setBitFromLowest(index, value);
    } else if (zeroIndex === 'highest') {
      this.setBitFromHighest(index, value);
    }
  }

  private setBitFromHighest(index: number, value: boolean): void {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'highest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'highest');

    // set the bit
    if (value) {
      this.#data[byteIndex] = byte | (1 << bitIndex);
    } else {
      this.#data[byteIndex] = byte & ~(1 << bitIndex);
    }
  }

  private setBitFromLowest(index: number, value: boolean): void {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'lowest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'lowest');

    // set the bit
    if (value) {
      this.#data[byteIndex] = byte | (1 << bitIndex);
    } else {
      this.#data[byteIndex] = byte & ~(1 << bitIndex);
    }
  }

  /**
   * get the bit at the index
   * @param index  the index of the bit
   * @param zeroIndex the index of the zero bit, lowest or highest, default is lowest ,if the bit array is 1010 1010, the lowest zero bit is 0, the highest zero bit is 7
   */
  get(index: number, zeroIndex: 'lowest' | 'highest' = 'lowest'): boolean {
    // out of range check
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`index must be a valid bit index, got ${index}`);
    }

    if (zeroIndex === 'lowest') {
      return this.getBitFromLowest(index);
    } else {
      return this.getBitFromHighest(index);
    }
  }

  /**
   * get the bit from the highest bit
   * @param index the index of the bit
   * @returns the bit
   */
  private getBitFromHighest(index: number): boolean {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'highest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'highest');

    // get the bit
    return (byte & (1 << bitIndex)) !== 0;
  }

  /**
   * get the bit from the lowest bit
   * @param index the index of the bit
   * @returns the bit
   */
  private getBitFromLowest(index: number): boolean {
    // calculate the byte index which contains the bit
    const byteIndex = this.getByteIndex(index, 'lowest');
    const byte = this.#data[byteIndex];

    // calculate the bit index in the byte
    const bitIndex = this.getBitOffsetInByte(index, 'lowest');

    // get the bit
    return (byte & (1 << bitIndex)) !== 0;
  }

  /**
   * get the byte index which contains the bit
   * @param bitIndex bit index
   * @param zeroIndex the index of the zero bit, lowest or highest, default is lowest ,if the bit array is 1010 1010, the lowest zero bit is 0, the highest zero bit is 7
   * @returns the byte index
   */
  private getByteIndex(bitIndex: number, zeroIndex: 'lowest' | 'highest'): number {
    if (zeroIndex === 'lowest') {
      return Math.floor(bitIndex / 8);
    } else {
      return this.#data.length - 1 - Math.floor(bitIndex / 8);
    }
  }

  /**
   * get the bit offset in the byte
   * @param byteIndex the byte index
   * @param zeroIndex
   * @returns the bit offset in the byte
   */
  private getBitOffsetInByte(byteIndex: number, zeroIndex: 'lowest' | 'highest'): number {
    if (zeroIndex === 'lowest') {
      return byteIndex % 8;
    } else {
      return 7 - (byteIndex % 8);
    }
  }

  /**
   * print the bit array as a binary string, e.g. 0101 0101
   * @returns
   */
  toString(): string {
    return this.#data.reduce((prev, curr) => prev + curr.toString(2).padStart(8, '0'), '');
  }

  toIntString(): string {
    return this.toBigInt().toString();
  }

  toHexString(): string {
    return BytesUtil.bytes2HexStr(this.#data);
  }

  /**
   * return a index array include the index of the different bits
   * @param other
   */
  diff(other: BitArray): number[] {
    // if the length of the bit array is not equal, throw an error
    if (this.length !== other.length) {
      throw new RangeError('bit arrays must have the same length for diff');
    }
    const diffIndex: number[] = [];
    for (let i = 0; i < this.length; i++) {
      if (this.get(i) !== other.get(i)) {
        diffIndex.push(i);
      }
    }
    return diffIndex;
  }
}

```

---

## Arquivo: `docs/deno-torrent/toolkit/bytes/bytes_util.test.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/toolkit/bytes/bytes_util.ts`

```ts
import { decodeHex, encodeHex } from '@std/encoding/hex';

/**
 * array1 xor array2, if array1.length !== array2.length, min(array1.length, array2.length) will be used
 * @param array1 Uint8Array
 * @param array2 Uint8Array
 * @returns Uint8Array
 */
function xorBytes(array1: Uint8Array, array2: Uint8Array) {
  const length = Math.min(array1.length, array2.length);
  const result = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = array1[i] ^ array2[i];
  }

  return result;
}

/** Concatenates byte arrays into a newly allocated array. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((total, array) => total + array.length, 0);
  if (!Number.isSafeInteger(totalLength)) {
    throw new RangeError('combined byte length exceeds Number.MAX_SAFE_INTEGER');
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

/** Returns `true` when two byte arrays have identical contents. */
function equals(array1: Uint8Array, array2: Uint8Array): boolean {
  return array1.length === array2.length && array1.every((byte, index) => byte === array2[index]);
}

/** Compares byte arrays in lexicographic order. */
function compare(array1: Uint8Array, array2: Uint8Array): -1 | 0 | 1 {
  const sharedLength = Math.min(array1.length, array2.length);
  for (let index = 0; index < sharedLength; index++) {
    if (array1[index] < array2[index]) return -1;
    if (array1[index] > array2[index]) return 1;
  }
  if (array1.length < array2.length) return -1;
  if (array1.length > array2.length) return 1;
  return 0;
}

/**
 * xor two numbers or two Uint8Arrays
 * @param a
 * @param b
 * @returns
 */
function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an integer in the range [0, 255]`);
  }
}

function xor(a: number, b: number): Uint8Array;
function xor(a: Uint8Array, b: Uint8Array): Uint8Array;
function xor(a: number | Uint8Array, b: number | Uint8Array): Uint8Array {
  if (typeof a === 'number' && typeof b === 'number') {
    assertByte(a, 'a');
    assertByte(b, 'b');
    return Uint8Array.from([a ^ b]);
  } else if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return xorBytes(a, b);
  }
  throw new Error('a and b must be the same type');
}

/**
 * convert Uint8Array to binary string
 * @param value Uint8Array
 * @returns string
 */
function bytes2BinStr(value: Uint8Array): string {
  const parts = new Array<string>(value.length);
  for (let index = 0; index < value.length; index++) {
    parts[index] = value[index].toString(2).padStart(8, '0');
  }
  return parts.join('');
}

/**
 * convert binary string to Uint8Array
 * @param value such as '00000001'
 * @returns
 */
function binStr2Bytes(value: string): Uint8Array {
  if (!/^[01]*$/.test(value)) {
    throw new TypeError('value must contain only binary digits');
  }
  if (value.length % 8 !== 0) {
    throw new RangeError('value length must be a multiple of 8');
  }

  const length = value.length / 8;
  const result = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = parseInt(value.slice(i * 8, (i + 1) * 8), 2);
  }

  return result;
}

/**
 * convert Uint8Array to number
 * @param value
 * @returns
 */
function bytes2Int(value: Uint8Array): number {
  if (value.length > 6) {
    throw new RangeError('value exceeds Number.MAX_SAFE_INTEGER');
  }

  let result = 0;
  for (const byte of value) {
    result = result * 0x100 + byte;
  }
  return result;
}

/**
 * Converts an unsigned big-endian byte sequence to a bigint.
 * An empty sequence represents zero.
 */
function bytes2BigInt(value: Uint8Array): bigint {
  let result = 0n;
  for (const byte of value) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Converts a non-negative bigint to an unsigned big-endian byte sequence.
 * When `length` is provided, the result is left-padded to that exact length.
 *
 * @throws {RangeError} If `value` is negative, `length` is invalid, or the value does not fit.
 */
function bigInt2Bytes(value: bigint, length?: number): Uint8Array {
  if (value < 0n) {
    throw new RangeError('value must be a non-negative bigint');
  }
  if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) {
    throw new RangeError('length must be a non-negative safe integer');
  }

  let byteLength = value === 0n ? 1 : 0;
  for (let remaining = value; remaining > 0n; remaining >>= 8n) {
    byteLength++;
  }

  if (length !== undefined) {
    if (value !== 0n && byteLength > length) {
      throw new RangeError('value does not fit in the requested byte length');
    }
    byteLength = length;
  }

  const result = new Uint8Array(byteLength);
  for (let index = byteLength - 1, remaining = value; index >= 0; index--, remaining >>= 8n) {
    result[index] = Number(remaining & 0xffn);
  }
  return result;
}

/**
 * convert number to Uint8Array
 * @param value
 * @returns
 */
function int2Bytes(value: number): Uint8Array {
  assertByte(value, 'value');
  return Uint8Array.from([value]);
}

/**
 * convert Uint8Array to hex string
 * @deprecated Use `encodeHex` from `@std/encoding/hex` directly.
 * @param value
 * @returns
 */
function bytes2HexStr(value: Uint8Array): string {
  return encodeHex(value);
}

/**
 * convert hex string to Uint8Array
 * @deprecated use std/encoding/hex.ts decodeHex instead
 * @param value
 * @returns
 */
function hexStr2Bytes(value: string): Uint8Array {
  return decodeHex(value);
}

/**
 * convert Uint8Array to Unit8Array []
 * e.g. chunkLenth is 4, Uint8Array [1,2,3,4,5,6,7,8] => [Uint8Array [1,2,3,4], Uint8Array [5,6,7,8]]
 *
 * @param data  Uint8Array
 */
function chunkBytes(data: Uint8Array, chunkLength: number): Uint8Array[] {
  if (!Number.isSafeInteger(chunkLength) || chunkLength <= 0) {
    throw new RangeError('chunkLength must be a positive safe integer');
  }

  // if data.length <= chunkLength, return [data]
  if (data.length <= chunkLength) {
    return [data];
  }

  const result: Uint8Array[] = [];
  const chunkCount = Math.ceil(data.length / chunkLength);
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkLength;
    const end = (i + 1) * chunkLength;
    const chunk = data.slice(start, end);
    result.push(chunk);
  }

  return result;
}

/** Byte-array conversion, comparison, and chunking utilities. */
const BytesUtil = {
  concat,
  equals,
  compare,
  xor,
  bytes2BinStr,
  binStr2Bytes,
  bytes2Int,
  bytes2BigInt,
  int2Bytes,
  bigInt2Bytes,
  bytes2HexStr,
  hexStr2Bytes,
  chunkBytes,
};

export { BytesUtil };

```

---

## Arquivo: `docs/deno-torrent/toolkit/encoding/encode_util.test.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/toolkit/encoding/encode_util.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/toolkit/hash/hash_util.test.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/toolkit/hash/hash_util.ts`

````ts
/**
 * HashUtil — cryptographic hash helpers. One-shot SHA algorithms are backed
 * by the Web Crypto API (`globalThis.crypto.subtle`); incremental SHA-1 is a
 * bounded-memory TypeScript implementation. No external dependencies.
 *
 * All functions accept either a `Uint8Array` of raw bytes or a plain `string`
 * (UTF-8 encoded) and return a `Uint8Array` digest.
 *
 * @example
 * ```ts
 * import { HashUtil } from './hash_util.ts';
 *
 * const digest = await HashUtil.sha1('hello');
 * console.log(HashUtil.toHex(digest)); // aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
 * ```
 * @module
 */

/** Accepted input types for all hash functions. */
type HashInput = Uint8Array | string;

/** Stateful SHA-1 hasher for processing an input a bounded chunk at a time. */
export interface IncrementalHasher {
  /** Adds bytes to the current message. Calling this after {@link digest} is supported. */
  update(data: Uint8Array): this;
  /** Returns the digest of all bytes supplied so far without changing the hasher state. */
  digest(): Uint8Array;
  /** Discards all supplied bytes and restores the initial SHA-1 state. */
  reset(): void;
  /** Number of message bytes supplied through {@link update}. */
  readonly bytesHashed: bigint;
}

const SHA1_INITIAL_STATE = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

/**
 * Incremental SHA-1 implementation. It keeps only SHA-1 state plus at most
 * 63 pending bytes, so memory use is independent of total input size.
 */
class Sha1Hasher implements IncrementalHasher {
  #state = new Uint32Array(SHA1_INITIAL_STATE);
  #pending = new Uint8Array(64);
  #words = new Uint32Array(80);
  #pendingLength = 0;
  #bytesHashed = 0n;

  get bytesHashed(): bigint {
    return this.#bytesHashed;
  }

  update(data: Uint8Array): this {
    this.#bytesHashed += BigInt(data.byteLength);
    let offset = 0;

    if (this.#pendingLength > 0) {
      const copied = Math.min(64 - this.#pendingLength, data.length);
      this.#pending.set(data.subarray(0, copied), this.#pendingLength);
      this.#pendingLength += copied;
      offset = copied;
      if (this.#pendingLength === 64) {
        this.#processBlock(this.#pending);
        this.#pendingLength = 0;
      }
    }

    while (offset + 64 <= data.length) {
      this.#processBlock(data.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < data.length) {
      this.#pending.set(data.subarray(offset));
      this.#pendingLength = data.length - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    const state = new Uint32Array(this.#state);
    const finalBlock = new Uint8Array(128);
    finalBlock.set(this.#pending.subarray(0, this.#pendingLength));
    finalBlock[this.#pendingLength] = 0x80;
    const blockLength = this.#pendingLength < 56 ? 64 : 128;
    // SHA-1 appends the low 64 bits of the bit length in big-endian order.
    let bitLength = (this.#bytesHashed * 8n) & ((1n << 64n) - 1n);
    for (let i = 0; i < 8; i++) {
      finalBlock[blockLength - 1 - i] = Number(bitLength & 0xffn);
      bitLength >>= 8n;
    }
    this.#processBlock(finalBlock.subarray(0, 64), state);
    if (blockLength === 128) this.#processBlock(finalBlock.subarray(64), state);

    const result = new Uint8Array(20);
    const view = new DataView(result.buffer);
    for (let i = 0; i < state.length; i++) view.setUint32(i * 4, state[i], false);
    return result;
  }

  reset(): void {
    this.#state.set(SHA1_INITIAL_STATE);
    this.#pendingLength = 0;
    this.#bytesHashed = 0n;
  }

  #processBlock(block: Uint8Array, state = this.#state): void {
    const words = this.#words;
    const view = new DataView(block.buffer, block.byteOffset, 64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(i * 4, false);
    for (let i = 16; i < 80; i++) {
      const value = words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16];
      words[i] = (value << 1) | (value >>> 31);
    }
    let [a, b, c, d, e] = state;
    for (let i = 0; i < 80; i++) {
      const f = i < 20
        ? (b & c) | (~b & d)
        : i < 40
        ? b ^ c ^ d
        : i < 60
        ? (b & c) | (b & d) | (c & d)
        : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
  }
}

/**
 * Creates an incremental SHA-1 hasher.
 *
 * `digest()` is non-destructive: repeated calls return the same value, and
 * subsequent `update()` calls continue the current message. Use `reset()` to
 * begin a new message.
 *
 * @example
 * ```ts
 * const hasher = HashUtil.createSha1();
 * for await (const chunk of reader.chunks(64 * 1024)) hasher.update(chunk);
 * const pieceHash = hasher.digest();
 * ```
 */
function createSha1(): IncrementalHasher {
  return new Sha1Hasher();
}

/** Converts a string or Uint8Array into a plain `ArrayBuffer` (UTF-8 for strings). */
function toBuffer(input: HashInput): ArrayBuffer {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  // Copy into a fresh ArrayBuffer to satisfy SubtleCrypto's strict BufferSource typing.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

/**
 * Computes the SHA-1 digest of `data`.
 *
 * > **Note:** SHA-1 is considered cryptographically weak. Prefer SHA-256 for
 * > security-sensitive use cases. SHA-1 remains common in non-security
 * > contexts such as BitTorrent info-hashes.
 *
 * @param data - Raw bytes or a UTF-8 string.
 * @returns 20-byte SHA-1 digest.
 */
async function sha1(data: HashInput): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest('SHA-1', toBuffer(data));
  return new Uint8Array(buffer);
}

/**
 * Computes the SHA-256 digest of `data`.
 *
 * @param data - Raw bytes or a UTF-8 string.
 * @returns 32-byte SHA-256 digest.
 */
async function sha256(data: HashInput): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest('SHA-256', toBuffer(data));
  return new Uint8Array(buffer);
}

/**
 * Computes the SHA-512 digest of `data`.
 *
 * @param data - Raw bytes or a UTF-8 string.
 * @returns 64-byte SHA-512 digest.
 */
async function sha512(data: HashInput): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest('SHA-512', toBuffer(data));
  return new Uint8Array(buffer);
}

/**
 * Computes the MD5 digest of `data`.
 *
 * > **Note:** MD5 is cryptographically broken. Only use it for checksums and
 * > legacy compatibility, never for security.
 *
 * Implemented in pure TypeScript because the Web Crypto API does not expose
 * MD5. The implementation follows RFC 1321.
 *
 * @param data - Raw bytes or a UTF-8 string.
 * @returns 16-byte MD5 digest.
 */
function md5(data: HashInput): Uint8Array {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  // Per-round shift amounts (RFC 1321 §3.4)
  const S = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
  ];
  // Precomputed table K[i] = floor(abs(sin(i+1)) * 2^32) (RFC 1321 §3.4)
  const K = [
    0xd76aa478,
    0xe8c7b756,
    0x242070db,
    0xc1bdceee,
    0xf57c0faf,
    0x4787c62a,
    0xa8304613,
    0xfd469501,
    0x698098d8,
    0x8b44f7af,
    0xffff5bb1,
    0x895cd7be,
    0x6b901122,
    0xfd987193,
    0xa679438e,
    0x49b40821,
    0xf61e2562,
    0xc040b340,
    0x265e5a51,
    0xe9b6c7aa,
    0xd62f105d,
    0x02441453,
    0xd8a1e681,
    0xe7d3fbc8,
    0x21e1cde6,
    0xc33707d6,
    0xf4d50d87,
    0x455a14ed,
    0xa9e3e905,
    0xfcefa3f8,
    0x676f02d9,
    0x8d2a4c8a,
    0xfffa3942,
    0x8771f681,
    0x6d9d6122,
    0xfde5380c,
    0xa4beea44,
    0x4bdecfa9,
    0xf6bb4b60,
    0xbebfbc70,
    0x289b7ec6,
    0xeaa127fa,
    0xd4ef3085,
    0x04881d05,
    0xd9d4d039,
    0xe6db99e5,
    0x1fa27cf8,
    0xc4ac5665,
    0xf4292244,
    0x432aff97,
    0xab9423a7,
    0xfc93a039,
    0x655b59c3,
    0x8f0ccc92,
    0xffeff47d,
    0x85845dd1,
    0x6fa87e4f,
    0xfe2ce6e0,
    0xa3014314,
    0x4e0811a1,
    0xf7537e82,
    0xbd3af235,
    0x2ad7d2bb,
    0xeb86d391,
  ];

  // Pre-processing: adding padding bits (RFC 1321 §3.1-3.2)
  const msgLen = bytes.length;
  const bitLen = msgLen * 8;
  // Pad to 448 bits mod 512, then append 64-bit little-endian length.
  const padLen = ((55 - msgLen) % 64 + 64) % 64 + 1;
  const padded = new Uint8Array(msgLen + padLen + 8);
  padded.set(bytes);
  padded[msgLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(msgLen + padLen, bitLen >>> 0, true);
  view.setUint32(msgLen + padLen + 4, Math.floor(bitLen / 2 ** 32), true);

  // Initial hash state (RFC 1321 §3.3)
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Process each 512-bit (64-byte) chunk
  for (let i = 0; i < padded.length; i += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      F = (F + A + K[j] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) | 0;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  // Output (RFC 1321 §3.5) — little-endian
  const result = new Uint8Array(16);
  const out = new DataView(result.buffer);
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return result;
}

/**
 * Encodes a digest `Uint8Array` to a lowercase hex string.
 *
 * @param digest - Raw digest bytes.
 * @returns Lowercase hexadecimal string.
 */
function toHex(digest: Uint8Array): string {
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Utility object grouping all hash helpers.
 */
/** Hashing and digest-formatting utilities. */
const HashUtil = {
  sha1,
  createSha1,
  sha256,
  sha512,
  md5,
  toHex,
};

export { HashUtil };

````

---

## Arquivo: `docs/deno-torrent/toolkit/io/io_util.test.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/toolkit/io/io_util.ts`

````ts
/**
 * Bounded helpers for readers and writers that may complete operations
 * partially. They deliberately require an explicit read limit.
 *
 * @module
 */

/** A source compatible with Deno's byte-reader contract. */
export interface ByteReader {
  read(p: Uint8Array): Promise<number | null>;
}

/** A sink compatible with Deno's byte-writer contract. */
export interface ByteWriter {
  write(p: Uint8Array): Promise<number>;
}

/** An invalid byte count reported by a reader or writer. */
export class InvalidByteCountError extends RangeError {
  /** Whether the invalid count was returned by a read or write operation. */
  readonly operation: 'read' | 'write';

  /** The invalid byte count returned by the operation. */
  readonly count: number;

  /** The largest byte count that would have been valid. */
  readonly maximum: number;

  constructor(operation: 'read' | 'write', count: number, maximum: number) {
    super(
      `${operation} returned invalid byte count ${count}; expected an integer from 1 to ${maximum}`,
    );
    this.name = 'InvalidByteCountError';
    this.operation = operation;
    this.count = count;
    this.maximum = maximum;
  }
}

/** EOF encountered before an exact-size read could be completed. */
export class UnexpectedEofError extends Error {
  /** Number of bytes successfully read before EOF. */
  readonly bytesRead: number;

  /** Total number of bytes requested by the caller. */
  readonly expectedBytes: number;

  constructor(bytesRead: number, expectedBytes: number) {
    super(`unexpected EOF after ${bytesRead} of ${expectedBytes} bytes`);
    this.name = 'UnexpectedEofError';
    this.bytesRead = bytesRead;
    this.expectedBytes = expectedBytes;
  }
}

/** Options controlling {@link IoUtil.readAll}. */
export interface ReadAllOptions {
  /** Explicit upper bound for returned data. */
  maxBytes: number;
  /** Reusable read buffer size. Defaults to 64 KiB. */
  chunkSize?: number;
}

/** Options controlling {@link IoUtil.readExactly}. */
export interface ReadExactlyOptions {
  /**
   * Return `false` when EOF occurs before any bytes are read.
   * Defaults to `false`, which causes {@link UnexpectedEofError} instead.
   */
  allowCleanEof?: boolean;
}

function assertCount(
  count: number,
  maximum: number,
  operation: 'read' | 'write',
): void {
  if (!Number.isSafeInteger(count) || count <= 0 || count > maximum) {
    throw new InvalidByteCountError(operation, count, maximum);
  }
}

/** Byte-stream utility functions. */
const IoUtil: {
  readAll(reader: ByteReader, options: ReadAllOptions): Promise<Uint8Array>;
  readExactly(
    reader: ByteReader,
    target: Uint8Array,
    options?: ReadExactlyOptions,
  ): Promise<boolean>;
  writeAll(writer: ByteWriter, data: Uint8Array): Promise<void>;
} = {
  /**
   * Reads a stream into one array, failing as soon as `maxBytes` would be exceeded.
   * The explicit cap prevents accidental unbounded memory allocation.
   *
   * @example
   * ```ts
   * const bytes = await IoUtil.readAll(reader, { maxBytes: 1024 * 1024 });
   * ```
   */
  async readAll(reader: ByteReader, options: ReadAllOptions): Promise<Uint8Array> {
    const { maxBytes } = options;
    const chunkSize = options.chunkSize ?? 64 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError('maxBytes must be a positive safe integer');
    }
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('chunkSize must be a positive safe integer');
    }
    const buffer = new Uint8Array(Math.min(chunkSize, maxBytes));
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const count = await reader.read(buffer);
      if (count === null) break;
      assertCount(count, buffer.length, 'read');
      if (count > maxBytes - total) throw new RangeError(`input exceeds maxBytes (${maxBytes})`);
      chunks.push(buffer.slice(0, count));
      total += count;
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  },

  /**
   * Reads exactly `target.length` bytes into the caller-provided array.
   * Valid partial reads are retried until the target is full.
   *
   * No target buffer is allocated internally. For an empty target this method
   * returns `true` without calling the reader.
   *
   * @returns `true` when the target is full, or `false` only when
   * `allowCleanEof` is enabled and the first read encounters EOF.
   * @throws {UnexpectedEofError} If EOF occurs before the target is full.
   * @throws {InvalidByteCountError} If the reader reports an invalid byte count.
   *
   * @example
   * ```ts
   * const header = new Uint8Array(4);
   * if (await IoUtil.readExactly(reader, header, { allowCleanEof: true })) {
   *   // Process the complete header.
   * }
   * ```
   */
  async readExactly(
    reader: ByteReader,
    target: Uint8Array,
    options: ReadExactlyOptions = {},
  ): Promise<boolean> {
    if (target.length === 0) return true;

    let offset = 0;
    while (offset < target.length) {
      const remaining = target.length - offset;
      const count = await reader.read(target.subarray(offset));
      if (count === null) {
        if (offset === 0 && options.allowCleanEof === true) return false;
        throw new UnexpectedEofError(offset, target.length);
      }
      assertCount(count, remaining, 'read');
      offset += count;
    }
    return true;
  },

  /**
   * Writes every byte, retrying after valid partial writes.
   *
   * @throws {InvalidByteCountError} If the writer reports no progress or an invalid count.
   *
   * @example
   * ```ts
   * await IoUtil.writeAll(file, new TextEncoder().encode('complete record'));
   * ```
   */
  async writeAll(writer: ByteWriter, data: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < data.length) {
      const remaining = data.length - offset;
      const count = await writer.write(data.subarray(offset));
      assertCount(count, remaining, 'write');
      offset += count;
    }
  },
};

export { IoUtil };

````

---

## Arquivo: `docs/deno-torrent/toolkit/io/multi_file_reader.test.ts`

```ts
import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import { DEFAULT_ITERATOR_CHUNK_SIZE, DEFAULT_MAX_CHUNK_SIZE, MultiFileReader } from '../../mod.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a temp file with the given bytes and returns its path. */
async function tmpFile(bytes: Uint8Array): Promise<string> {
  const f = await Deno.makeTempFile();
  await Deno.writeFile(f, bytes);
  return f;
}

/** Collects all bytes from a MultiFileReader.read() loop. */
async function readAll(reader: MultiFileReader): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const p = new Uint8Array(16);
  let n: number | null;
  while ((n = await reader.read(p)) !== null) {
    chunks.push(p.slice(0, n));
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

// ── Constructor ───────────────────────────────────────────────────────────────

Deno.test('MultiFileReader - throws on empty file list', () => {
  let threw = false;
  try {
    new MultiFileReader([]);
  } catch (e) {
    threw = e instanceof RangeError;
  }
  assertEquals(threw, true);
});

Deno.test('MultiFileReader - validates maxChunkSize', () => {
  assertThrows(() => new MultiFileReader(['file'], { maxChunkSize: 0 }), RangeError);
  assertThrows(() => new MultiFileReader(['file'], { maxChunkSize: 1.5 }), RangeError);
  assertEquals(DEFAULT_MAX_CHUNK_SIZE, 16 * 1024 * 1024);
});

Deno.test('MultiFileReader - aborts reads and closes the active file', async () => {
  const path = await tmpFile(new Uint8Array([1, 2]));
  const controller = new AbortController();
  const reader = new MultiFileReader([path], { signal: controller.signal });
  try {
    assertEquals(await reader.read(new Uint8Array(1)), 1);
    controller.abort();
    await assertRejects(() => reader.readChunk(1), DOMException, 'aborted');
  } finally {
    reader.close();
    await Deno.remove(path);
  }
});

// ── read() ────────────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.read - single file', async () => {
  const path = await tmpFile(new Uint8Array([1, 2, 3, 4, 5]));
  try {
    const reader = new MultiFileReader([path]);
    const data = await readAll(reader);
    assertEquals(data, new Uint8Array([1, 2, 3, 4, 5]));
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.read - multiple files concatenated', async () => {
  const f1 = await tmpFile(new Uint8Array([1, 2, 3]));
  const f2 = await tmpFile(new Uint8Array([4, 5]));
  const f3 = await tmpFile(new Uint8Array([6]));
  try {
    const reader = new MultiFileReader([f1, f2, f3]);
    const data = await readAll(reader);
    assertEquals(data, new Uint8Array([1, 2, 3, 4, 5, 6]));
  } finally {
    await Deno.remove(f1);
    await Deno.remove(f2);
    await Deno.remove(f3);
  }
});

Deno.test('MultiFileReader.read - returns null at EOS twice', async () => {
  const path = await tmpFile(new Uint8Array([42]));
  try {
    const reader = new MultiFileReader([path]);
    await readAll(reader);
    const p = new Uint8Array(1);
    assertEquals(await reader.read(p), null);
    assertEquals(await reader.read(p), null);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.read - zero-length p returns 0', async () => {
  const path = await tmpFile(new Uint8Array([1]));
  try {
    const reader = new MultiFileReader([path]);
    assertEquals(await reader.read(new Uint8Array(0)), 0);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.read - skips empty files', async () => {
  const files = await Promise.all([
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array([1, 2])),
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array([3])),
  ]);
  try {
    assertEquals(await readAll(new MultiFileReader(files)), new Uint8Array([1, 2, 3]));
  } finally {
    await Promise.all(files.map((file) => Deno.remove(file)));
  }
});

// ── readChunk() ───────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.readChunk - exact chunk spanning files', async () => {
  const f1 = await tmpFile(new Uint8Array([1, 2, 3])); // 3 bytes
  const f2 = await tmpFile(new Uint8Array([4, 5])); // 2 bytes
  try {
    const reader = new MultiFileReader([f1, f2]);
    assertEquals(await reader.readChunk(3), new Uint8Array([1, 2, 3]));
    assertEquals(await reader.readChunk(2), new Uint8Array([4, 5]));
    assertEquals(await reader.readChunk(1), null);
  } finally {
    await Deno.remove(f1);
    await Deno.remove(f2);
  }
});

Deno.test('MultiFileReader.readChunk - chunk larger than remaining data', async () => {
  const path = await tmpFile(new Uint8Array([10, 20, 30]));
  try {
    const reader = new MultiFileReader([path]);
    // Ask for 10 but only 3 available — returns partial
    const chunk = await reader.readChunk(10);
    assertEquals(chunk, new Uint8Array([10, 20, 30]));
    assertEquals(await reader.readChunk(1), null);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - returns null on exhausted stream', async () => {
  const path = await tmpFile(new Uint8Array([1]));
  try {
    const reader = new MultiFileReader([path]);
    await reader.readChunk(1);
    assertEquals(await reader.readChunk(1), null);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - throws on non-positive length', async () => {
  const path = await tmpFile(new Uint8Array([1]));
  try {
    const reader = new MultiFileReader([path]);
    await assertRejects(() => reader.readChunk(0), RangeError);
    await assertRejects(() => reader.readChunk(-1), RangeError);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - enforces configured maximum', async () => {
  const path = await tmpFile(new Uint8Array([1, 2, 3]));
  try {
    const reader = new MultiFileReader([path], { maxChunkSize: 2 });
    await assertRejects(() => reader.readChunk(3), RangeError);
    assertEquals(await reader.readChunk(2), new Uint8Array([1, 2]));
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader.readChunk - honors a configured maximum above 16 MiB', async () => {
  const path = await tmpFile(new Uint8Array([1, 2, 3]));
  try {
    const reader = new MultiFileReader([path], { maxChunkSize: 17 * 1024 * 1024 });
    assertEquals(await reader.readChunk(17 * 1024 * 1024), new Uint8Array([1, 2, 3]));
  } finally {
    await Deno.remove(path);
  }
});

Deno.test('MultiFileReader - supports async iteration', async () => {
  const f1 = await tmpFile(new Uint8Array([1, 2, 3]));
  const f2 = await tmpFile(new Uint8Array([4, 5]));
  try {
    const reader = new MultiFileReader([f1, f2], { maxChunkSize: 2 });
    const chunks: Uint8Array[] = [];
    for await (const chunk of reader) chunks.push(chunk);
    assertEquals(chunks, [new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5])]);
    assertEquals(DEFAULT_ITERATOR_CHUNK_SIZE, 64 * 1024);
  } finally {
    await Deno.remove(f1);
    await Deno.remove(f2);
  }
});

Deno.test('MultiFileReader.chunks - crosses empty files and closes on early break', async () => {
  const files = await Promise.all([
    tmpFile(new Uint8Array([1])),
    tmpFile(new Uint8Array()),
    tmpFile(new Uint8Array([2, 3])),
  ]);
  const reader = new MultiFileReader(files, { maxChunkSize: 2 });
  try {
    for await (const chunk of reader.chunks(2)) {
      assertEquals(chunk, new Uint8Array([1, 2]));
      break;
    }
    reader.reset();
    const chunks: Uint8Array[] = [];
    for await (const chunk of reader.chunks(1)) chunks.push(chunk);
    assertEquals(chunks, [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
  } finally {
    reader.close();
    await Promise.all(files.map((file) => Deno.remove(file)));
  }
});

// ── reset() ───────────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.reset - re-reads from beginning', async () => {
  const path = await tmpFile(new Uint8Array([7, 8, 9]));
  const reader = new MultiFileReader([path]);
  try {
    assertEquals(await reader.readChunk(3), new Uint8Array([7, 8, 9]));
    assertEquals(await reader.readChunk(1), null);
    reader.reset();
    assertEquals(await reader.readChunk(3), new Uint8Array([7, 8, 9]));
  } finally {
    reader.close();
    await Deno.remove(path);
  }
});

// ── close() ───────────────────────────────────────────────────────────────────

Deno.test('MultiFileReader.close - can call multiple times safely', async () => {
  const path = await tmpFile(new Uint8Array([1, 2]));
  try {
    const reader = new MultiFileReader([path]);
    const p = new Uint8Array(1);
    await reader.read(p); // opens the file
    reader.close();
    reader.close(); // second close must not throw
  } finally {
    await Deno.remove(path);
  }
});

```

---

## Arquivo: `docs/deno-torrent/toolkit/io/multi_file_reader.ts`

````ts
/**
 * MultiFileReader — reads multiple files as a single contiguous byte stream.
 *
 * @example
 * ```ts
 * const reader = new MultiFileReader(['a.bin', 'b.bin', 'c.bin']);
 * let chunk: Uint8Array | null;
 * while ((chunk = await reader.readChunk(512)) !== null) {
 *   // process chunk…
 * }
 * reader.close();
 * ```
 * @module
 */

import { SimpleBuffer } from './simple_buffer.ts';

/** Default upper bound for a single {@link MultiFileReader.readChunk} call. */
export const DEFAULT_MAX_CHUNK_SIZE = 16 * 1024 * 1024;

/** Default chunk size yielded by {@link MultiFileReader}'s async iterator. */
export const DEFAULT_ITERATOR_CHUNK_SIZE = 64 * 1024;

/** Configuration for {@link MultiFileReader}. */
export interface MultiFileReaderOptions {
  /** Maximum number of bytes accepted by one {@link MultiFileReader.readChunk} call. */
  maxChunkSize?: number;
  /** Cancels pending and future reads when aborted. */
  signal?: AbortSignal;
}

/**
 * Presents an ordered list of files as a single readable byte stream.
 *
 * File handles are opened lazily and closed as soon as their EOF is reached,
 * so only one handle is open at a time.
 *
 * ### Read primitives
 * | Method | Description |
 * |---|---|
 * | {@link MultiFileReader.read} | Low-level; fills a caller-supplied buffer, may cross to the next file transparently. |
 * | {@link MultiFileReader.readChunk} | High-level; returns exactly `length` bytes, crossing file boundaries as needed. |
 */
export class MultiFileReader implements AsyncIterable<Uint8Array>, Disposable {
  readonly #files: string[];
  #fileIndex = 0;
  #currentFile: Deno.FsFile | null = null;
  #eof = false;
  readonly #maxChunkSize: number;
  readonly #signal: AbortSignal | undefined;
  /** Accumulator used by readChunk across multiple read() calls. */
  readonly #accumulator: SimpleBuffer;

  /**
   * @param files - Ordered list of file paths to read through.
   * @throws {RangeError} If `files` is empty.
   */
  constructor(files: string[], options: MultiFileReaderOptions = {}) {
    if (files.length === 0) throw new RangeError('files must not be empty');
    const maxChunkSize = options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
    if (!Number.isSafeInteger(maxChunkSize) || maxChunkSize <= 0) {
      throw new RangeError('maxChunkSize must be a positive safe integer');
    }
    this.#files = [...files];
    this.#maxChunkSize = maxChunkSize;
    this.#signal = options.signal;
    this.#accumulator = new SimpleBuffer({ maxCapacity: maxChunkSize });
  }

  /** Closes the active file and throws if the configured signal was aborted. */
  #throwIfAborted(): void {
    if (this.#signal?.aborted) {
      this.close();
      throw new DOMException('MultiFileReader operation was aborted', 'AbortError');
    }
  }

  // ---------------------------------------------------------------------------
  // Low-level read
  // ---------------------------------------------------------------------------

  /**
   * Reads bytes into `p`, advancing through files transparently at each EOF.
   *
   * Follows the `Deno.Reader` contract: returns the number of bytes placed
   * into `p`, or `null` when every file has been fully consumed.
   *
   * @param p - Destination buffer.
   * @returns Number of bytes written into `p`, or `null` at end-of-stream.
   */
  async read(p: Uint8Array): Promise<number | null> {
    this.#throwIfAborted();
    if (p.length === 0) return 0;

    while (!this.#eof) {
      // Open current file lazily.
      if (this.#currentFile === null) {
        this.#currentFile = await Deno.open(this.#files[this.#fileIndex], { read: true });
        this.#throwIfAborted();
      }

      const n = await this.#currentFile.read(p);
      this.#throwIfAborted();

      if (n === null) {
        // Current file exhausted — close it and advance to the next.
        this.#currentFile.close();
        this.#currentFile = null;
        this.#fileIndex++;

        if (this.#fileIndex >= this.#files.length) {
          this.#eof = true;
          return null;
        }

        continue;
      }

      return n;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // High-level chunk read
  // ---------------------------------------------------------------------------

  /**
   * Collects exactly `length` bytes, spanning file boundaries as needed.
   *
   * If the remaining bytes across all files sum to less than `length`, the
   * partial data already accumulated is returned. Returns `null` only when the
   * entire stream was already exhausted before this call.
   *
   * @param length - Desired chunk size in bytes (must be a positive integer).
   * @returns A `Uint8Array` of at most `length` bytes, or `null` at EOS.
   * @throws {RangeError} If `length` is invalid or exceeds `maxChunkSize`.
   */
  async readChunk(length: number): Promise<Uint8Array | null> {
    this.#throwIfAborted();
    if (!Number.isSafeInteger(length) || length <= 0) {
      throw new RangeError(`length must be a positive safe integer, got ${length}`);
    }
    if (length > this.#maxChunkSize) {
      throw new RangeError(`length must not exceed maxChunkSize (${this.#maxChunkSize})`);
    }

    if (this.#eof && !this.#accumulator.hasNext()) return null;

    const tmp = new Uint8Array(length);

    while (this.#accumulator.length < length) {
      // Limit each read to the outstanding bytes. A file boundary may otherwise
      // cause read() to return a full temporary buffer after a partial chunk was
      // already accumulated, exceeding the bounded accumulator capacity.
      const remaining = length - this.#accumulator.length;
      const n = await this.read(tmp.subarray(0, remaining));

      if (n === null) {
        // Stream ended — return whatever accumulated bytes remain.
        return this.#accumulator.hasNext()
          ? this.#accumulator.readBytes(this.#accumulator.length)
          : null;
      }

      this.#accumulator.write(tmp.subarray(0, n));
    }

    return this.#accumulator.readBytes(length);
  }

  /**
   * Yields chunks from the current reader position until end-of-stream.
   * Breaking early closes the currently open file handle.
   * This is the bounded-memory API for logical pieces larger than
   * {@link DEFAULT_MAX_CHUNK_SIZE}; hash each yielded chunk incrementally
   * instead of calling `readChunk()` with a whole piece length.
   *
   * @param chunkSize - Maximum bytes in each yielded chunk.
   * @throws {RangeError} If `chunkSize` is invalid or exceeds `maxChunkSize`.
   *
   * @example
   * ```ts
   * const hasher = HashUtil.createSha1();
   * for await (const chunk of reader.chunks(64 * 1024)) hasher.update(chunk);
   * const pieceHash = hasher.digest();
   * ```
   */
  async *chunks(
    chunkSize: number = Math.min(DEFAULT_ITERATOR_CHUNK_SIZE, this.#maxChunkSize),
  ): AsyncGenerator<Uint8Array> {
    try {
      let chunk: Uint8Array | null;
      while ((chunk = await this.readChunk(chunkSize)) !== null) {
        yield chunk;
      }
    } finally {
      this.close();
    }
  }

  /** Iterates over chunks of up to {@link DEFAULT_ITERATOR_CHUNK_SIZE} bytes. */
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return this.chunks();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Closes any currently open file handle.
   *
   * Should be called when you stop reading before the stream is naturally
   * exhausted, to avoid leaking OS file descriptors.
   */
  close(): void {
    if (this.#currentFile !== null) {
      try {
        this.#currentFile.close();
      } catch {
        // Already closed — ignore.
      }
      this.#currentFile = null;
    }
  }

  /** Equivalent to {@link close}; enables `using reader = ...` where supported. */
  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Resets the reader back to the beginning of the first file.
   *
   * The currently open file handle (if any) is closed and the internal
   * accumulator is cleared.
   */
  reset(): void {
    this.close();
    this.#fileIndex = 0;
    this.#eof = false;
    this.#accumulator.reset();
  }
}

````

---

## Arquivo: `docs/deno-torrent/toolkit/io/simple_buffer.test.ts`

```ts
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

```

---

## Arquivo: `docs/deno-torrent/toolkit/io/simple_buffer.ts`

````ts
/**
 * SimpleBuffer — a lightweight, synchronous, growable byte buffer backed by
 * native `Uint8Array`. No external dependencies.
 *
 * @example
 * ```ts
 * const buf = new SimpleBuffer();
 * buf.write(new Uint8Array([1, 2, 3, 4]));
 * console.log(buf.readByte());   // 1
 * console.log(buf.readBytes(2)); // Uint8Array [2, 3]
 * ```
 * @module
 */

/** Default upper bound for unread bytes held by a {@link SimpleBuffer}. */
export const DEFAULT_MAX_BUFFER_CAPACITY = 16 * 1024 * 1024;

/** Configuration for {@link SimpleBuffer}. */
export interface SimpleBufferOptions {
  /** Maximum number of unread bytes that may be buffered. */
  maxCapacity?: number;
}

/**
 * A lightweight, synchronous, growable byte buffer.
 *
 * Bytes are appended with {@link SimpleBuffer.write} and consumed from the
 * front with {@link SimpleBuffer.readByte} / {@link SimpleBuffer.readBytes}.
 */
export class SimpleBuffer {
  /** Internal storage; live data lives in `[#readPos, #writePos)`. */
  #buf: Uint8Array = new Uint8Array(64);
  #readPos = 0;
  #writePos = 0;
  readonly #maxCapacity: number;

  /**
   * @param options - Buffer capacity configuration.
   * @throws {RangeError} If `maxCapacity` is not a positive safe integer.
   */
  constructor(options: SimpleBufferOptions = {}) {
    const maxCapacity = options.maxCapacity ?? DEFAULT_MAX_BUFFER_CAPACITY;
    if (!Number.isSafeInteger(maxCapacity) || maxCapacity <= 0) {
      throw new RangeError('maxCapacity must be a positive safe integer');
    }
    this.#maxCapacity = maxCapacity;
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Appends `data` to the end of the buffer.
   *
   * @param data - Bytes to append.
   */
  write(data: Uint8Array): void {
    this.#grow(data.length);
    this.#buf.set(data, this.#writePos);
    this.#writePos += data.length;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Reads and consumes exactly `len` bytes from the front of the buffer.
   *
   * @param len - Number of bytes to consume.
   * @returns A new `Uint8Array` containing the bytes.
   * @throws {RangeError} When `len` is negative or greater than {@link length}.
   */
  readBytes(len: number): Uint8Array {
    if (!Number.isSafeInteger(len) || len < 0) {
      throw new RangeError(`len must be a non-negative safe integer, got ${len}`);
    }
    if (len === 0) return new Uint8Array(0);
    if (len > this.length) {
      throw new RangeError(
        `Cannot read ${len} bytes — buffer only has ${this.length}`,
      );
    }
    const result = this.#buf.slice(this.#readPos, this.#readPos + len);
    this.#readPos += len;
    return result;
  }

  /**
   * Reads and consumes a single byte from the front of the buffer.
   *
   * @returns Byte value in the range [0, 255].
   * @throws {RangeError} When the buffer is empty.
   */
  readByte(): number {
    if (this.length === 0) throw new RangeError('Cannot read from an empty buffer');
    return this.readBytes(1)[0];
  }

  // ---------------------------------------------------------------------------
  // Inspection
  // ---------------------------------------------------------------------------

  /**
   * Number of unread bytes currently held in the buffer.
   */
  get length(): number {
    return this.#writePos - this.#readPos;
  }

  /**
   * `true` when at least one unread byte is available.
   */
  hasNext(): boolean {
    return this.length > 0;
  }

  /**
   * Resets the buffer to an empty state, discarding all data.
   */
  reset(): void {
    this.#readPos = 0;
    this.#writePos = 0;
    this.#buf = new Uint8Array(64);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Ensures space for `extra` more bytes, compacting or expanding as needed. */
  #grow(extra: number): void {
    if (this.length + extra > this.#maxCapacity) {
      throw new RangeError(`buffer capacity must not exceed maxCapacity (${this.#maxCapacity})`);
    }

    const free = this.#buf.length - this.#writePos;
    if (free >= extra) return;

    // Compact first — shift live bytes to the front.
    if (this.#readPos > 0) {
      this.#buf.copyWithin(0, this.#readPos, this.#writePos);
      this.#writePos -= this.#readPos;
      this.#readPos = 0;
      if (this.#buf.length - this.#writePos >= extra) return;
    }

    // Still not enough — allocate a larger buffer.
    const needed = this.#writePos + extra;
    let newSize = Math.max(this.#buf.length * 2, 64);
    while (newSize < needed) newSize *= 2;

    const next = new Uint8Array(newSize);
    next.set(this.#buf.subarray(0, this.#writePos));
    this.#buf = next;
  }
}

````

---

## Arquivo: `docs/deno-torrent/toolkit/mod.ts`

```ts
export * from './src/bytes/bit_array.ts';
export * from './src/bytes/bytes_util.ts';
export * from './src/encoding/encode_util.ts';
export * from './src/hash/hash_util.ts';
export * from './src/io/multi_file_reader.ts';
export * from './src/io/io_util.ts';
export * from './src/io/simple_buffer.ts';
export * from './src/net/net_util.ts';

```

---

## Arquivo: `docs/deno-torrent/toolkit/net/net_util.test.ts`

```ts
import { assertEquals, assertThrows } from '@std/assert';
import { NetUtil } from '../../mod.ts';

Deno.test('isNetPort', () => {
  assertEquals(NetUtil.isNetPort(0), true);
  assertEquals(NetUtil.isNetPort(65535), true);
  assertEquals(NetUtil.isNetPort(65536), false);
  assertEquals(NetUtil.isNetPort(-1), false);
});

Deno.test('isWellKnownPort', () => {
  assertEquals(NetUtil.isWellKnownPort(0), true);
  assertEquals(NetUtil.isWellKnownPort(1023), true);
  assertEquals(NetUtil.isWellKnownPort(1024), false);
  assertEquals(NetUtil.isWellKnownPort(65535), false);
  assertEquals(NetUtil.isWellKnownPort(-1), false);
});

Deno.test('isRegisteredPort', () => {
  assertEquals(NetUtil.isRegisteredPort(0), false);
  assertEquals(NetUtil.isRegisteredPort(1023), false);
  assertEquals(NetUtil.isRegisteredPort(1024), true);
  assertEquals(NetUtil.isRegisteredPort(49151), true);
  assertEquals(NetUtil.isRegisteredPort(49152), false);
  assertEquals(NetUtil.isRegisteredPort(65535), false);
  assertEquals(NetUtil.isRegisteredPort(-1), false);
});

Deno.test('isDynamicPort', () => {
  assertEquals(NetUtil.isDynamicPort(0), false);
  assertEquals(NetUtil.isDynamicPort(1023), false);
  assertEquals(NetUtil.isDynamicPort(1024), false);
  assertEquals(NetUtil.isDynamicPort(49151), false);
  assertEquals(NetUtil.isDynamicPort(49152), true);
  assertEquals(NetUtil.isDynamicPort(65535), true);
  assertEquals(NetUtil.isDynamicPort(-1), false);
});

Deno.test('isIPv4Str', () => {
  assertEquals(NetUtil.isIPv4Str('0.0.0.0'), true);
  assertEquals(NetUtil.isIPv4Str('255.255.255.255'), true);
  assertEquals(NetUtil.isIPv4Str('192.168.1.1'), true);
  assertEquals(NetUtil.isIPv4Str(''), false);
  assertEquals(NetUtil.isIPv4Str('192.168.1.256'), false);
  assertEquals(NetUtil.isIPv4Str('192.168.1'), false);
  assertEquals(NetUtil.isIPv4Str('256.256.256.256'), false);
  assertEquals(NetUtil.isIPv4Str('0'), false);
  assertEquals(NetUtil.isIPv4Str('0.0'), false);
  assertEquals(NetUtil.isIPv4Str('0.0.0'), false);
  assertEquals(NetUtil.isIPv4Str('0.0.0.0.0'), false);
  assertEquals(NetUtil.isIPv4Str('192'), false);
  assertEquals(NetUtil.isIPv4Str('192.168'), false);
  assertEquals(NetUtil.isIPv4Str('192.168.001.001'), false);
});

Deno.test('isIPv4Bytes', () => {
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([0, 0, 0, 0])), true);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([255, 255, 255, 255])), true);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1, 1])), true);
  // [192, 168, 1, 256] 256 will overflow to 0
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1, 256])), true);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([])), false);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1])), false);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1, 1, 1])), false);
});

Deno.test('isDomain', () => {
  assertEquals(NetUtil.isDomain('google.com'), true);
  assertEquals(NetUtil.isDomain('www.google.com'), true);
  assertEquals(NetUtil.isDomain('test.test.google.com'), true);
  assertEquals(NetUtil.isDomain(''), false);
  assertEquals(NetUtil.isDomain(), false);
  assertEquals(NetUtil.isDomain('google'), false);
  assertEquals(NetUtil.isDomain('google.'), false);
  assertEquals(NetUtil.isDomain('-google.com'), false);
  assertEquals(NetUtil.isDomain('google-.com'), false);
  assertEquals(NetUtil.isDomain(`${'a'.repeat(64)}.com`), false);
  assertEquals(NetUtil.isDomain(`${'a'.repeat(63)}.com`), true);
  assertEquals(NetUtil.isDomain(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.com`), true);
  assertEquals(
    NetUtil.isDomain(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}.com`),
    false,
  );
});

Deno.test('bytes2IPv4Str', () => {
  assertEquals(NetUtil.bytes2IPv4Str(new Uint8Array([0, 0, 0, 0])), '0.0.0.0');
  assertEquals(NetUtil.bytes2IPv4Str(new Uint8Array([255, 255, 255, 255])), '255.255.255.255');
  assertEquals(NetUtil.bytes2IPv4Str(new Uint8Array([192, 168, 1, 1])), '192.168.1.1');
  assertEquals(NetUtil.bytes2IPv4Str(undefined), undefined);
});

Deno.test('str2IPv4Bytes', () => {
  assertEquals(NetUtil.ipv4Str2Bytes('0.0.0.0'), new Uint8Array([0, 0, 0, 0]));
  assertEquals(NetUtil.ipv4Str2Bytes('255.255.255.255'), new Uint8Array([255, 255, 255, 255]));
  assertEquals(NetUtil.ipv4Str2Bytes(undefined), undefined);
  assertEquals(NetUtil.ipv4Str2Bytes(''), undefined);
  assertEquals(NetUtil.ipv4Str2Bytes('192.168.1.256'), undefined);
  assertEquals(NetUtil.ipv4Str2Bytes('192.168.1'), undefined);
});

Deno.test('compact IPv4 endpoint conversions', () => {
  const compact = NetUtil.ipv4EndpointToCompact('127.0.0.1', 6881);
  assertEquals(compact, new Uint8Array([127, 0, 0, 1, 0x1a, 0xe1]));
  assertEquals(NetUtil.compactIPv4ToEndpoint(compact), { host: '127.0.0.1', port: 6881 });
  assertEquals(NetUtil.compactIPv4ToEndpoint(new Uint8Array([192, 168, 1, 2, 0, 0])), {
    host: '192.168.1.2',
    port: 0,
  });
  assertThrows(() => NetUtil.ipv4EndpointToCompact('not-an-ip', 6881), TypeError);
  assertThrows(() => NetUtil.ipv4EndpointToCompact('127.0.0.1', 65536), RangeError);
  assertThrows(() => NetUtil.compactIPv4ToEndpoint(new Uint8Array(5)), RangeError);
  assertThrows(() => NetUtil.compactIPv4ToEndpoint(new Uint8Array(7)), RangeError);
});

Deno.test('getMacAddr', () => {
  const result = NetUtil.getMacAddr();
  if (result === undefined) return;
  // each entry must be a valid lowercase colon-separated MAC
  const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
  for (const mac of result) {
    assertEquals(macRegex.test(mac), true);
  }
  // no zero MAC
  assertEquals(result.includes('00:00:00:00:00:00'), false);
  // no duplicates
  assertEquals(result.length, new Set(result).size);
  // sorted
  assertEquals(result, [...result].sort());
});

```

---

## Arquivo: `docs/deno-torrent/toolkit/net/net_util.ts`

```ts
/**
 * check if the port is valid
 * @param port the port to be checked
 * @returns true if the port is valid, otherwise return false
 */
function isNetPort(port: number): boolean {
  if (!Number.isInteger(port)) return false;
  return port >= 0 && port <= 65535;
}

/**
 * check if the port is well known port
 * @see https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Well-known_ports
 * @param port the port to be checked
 * @returns true if the port is well known port, otherwise return false
 */
function isWellKnownPort(port: number): boolean {
  return isNetPort(port) && port <= 1023;
}

/**
 * check if the port is registered port
 * @see https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Registered_ports
 * @param port the port to be checked
 * @returns true if the port is registered port, otherwise return false
 */
function isRegisteredPort(port: number): boolean {
  return isNetPort(port) && port >= 1024 && port <= 49151;
}

/**
 * check if the port is dynamic port
 * @see https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Dynamic,_private_or_ephemeral_ports
 * @param port the port to be checked
 * @returns true if the port is dynamic port, otherwise return false
 */
function isDynamicPort(port: number): boolean {
  return isNetPort(port) && port >= 49152 && port <= 65535;
}

/**
 * check if the ip is IPv4 string
 * @param ip the ip to be checked, e.g. 192.168.1.1
 * @returns true if the ip is IPv4 string, otherwise return false
 */
function isIPv4Str(ip?: string): boolean {
  if (!ip) return false;
  return /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/.test(ip);
}

/**
 * check if the bytes is IPv4 Uint8Array
 * @param bytes the bytes to be checked
 * @returns true if the bytes is IPv4 Uint8Array, otherwise return false
 */
function isIPv4Bytes(bytes?: Uint8Array): boolean {
  if (!bytes) return false;
  return bytes.length === 4;
}

/**
 * check if the domain is valid
 * @param domain
 * @returns
 */
function isDomain(domain?: string): boolean {
  if (!domain || domain.length > 253) return false;

  const labels = domain.split('.');
  if (labels.length < 2 || !/^[A-Za-z]{2,63}$/.test(labels.at(-1)!)) return false;

  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
  );
}

/**
 * convert the ip address to Uint8Array,use 4 bytes to represent the ip address
 * @param value
 * @returns
 */
function bytes2IPv4Str(value?: Uint8Array): string | undefined {
  if (!value || !isIPv4Bytes(value)) return undefined;
  return Array.from(value).join('.');
}

/**
 * convert the ip address to Uint8Array,use 4 bytes to represent the ip address,this is only for IPv4
 * @param value
 * @returns
 */
function ipv4Str2Bytes(value?: string): Uint8Array | undefined {
  if (!value || !isIPv4Str(value)) return undefined;
  return Uint8Array.from(value.split('.').map((v) => parseInt(v)));
}

/** An IPv4 address and TCP/UDP port. */
export interface IPv4Endpoint {
  /** Dotted-decimal IPv4 address. */
  host: string;
  /** Network port in the range [0, 65535]. */
  port: number;
}

/**
 * Encodes an IPv4 endpoint in the six-byte compact-peer format used by BEP 23.
 *
 * @throws {TypeError} If `host` is not a valid IPv4 address.
 * @throws {RangeError} If `port` is not a valid network port.
 */
function ipv4EndpointToCompact(host: string, port: number): Uint8Array {
  const hostBytes = ipv4Str2Bytes(host);
  if (hostBytes === undefined) throw new TypeError('host must be a valid IPv4 address');
  if (!isNetPort(port)) throw new RangeError('port must be an integer in the range [0, 65535]');

  const result = new Uint8Array(6);
  result.set(hostBytes);
  result[4] = port >>> 8;
  result[5] = port & 0xff;
  return result;
}

/**
 * Decodes a six-byte BEP 23 compact IPv4 peer into an endpoint.
 *
 * @throws {RangeError} If `bytes` does not contain exactly six bytes.
 */
function compactIPv4ToEndpoint(bytes: Uint8Array): IPv4Endpoint {
  if (bytes.length !== 6) {
    throw new RangeError('compact IPv4 endpoint must contain exactly 6 bytes');
  }

  return {
    host: bytes2IPv4Str(bytes.subarray(0, 4))!,
    port: (bytes[4] << 8) | bytes[5],
  };
}

/**
 * get the mac address using Deno.networkInterfaces()
 * @returns sorted, deduplicated list of MAC addresses, or undefined if none found
 */
function getMacAddr(): string[] | undefined {
  const macAddrs = Deno.networkInterfaces()
    .map((iface) => iface.mac.toLowerCase().replace(/-/g, ':'))
    .filter((mac) => mac !== '00:00:00:00:00:00')
    .filter((mac, index, array) => array.indexOf(mac) === index)
    .sort();

  return macAddrs.length > 0 ? macAddrs : undefined;
}

/** Network address, port, and interface utilities. */
const NetUtil = {
  isNetPort,
  isWellKnownPort,
  isRegisteredPort,
  isDynamicPort,
  isIPv4Str,
  isIPv4Bytes,
  isDomain,
  bytes2IPv4Str,
  ipv4Str2Bytes,
  ipv4EndpointToCompact,
  compactIPv4ToEndpoint,
  getMacAddr,
};

export { NetUtil };

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/black_list_manager.ts`

```ts
/** In-memory set of blocked IP addresses. */
export default class BlackListManager {
  #banIpList: Set<string> = new Set()

  /**
   * Return whether an IP address is blocked.
   *
   * @deprecated Use {@linkcode isBanned}.
   */
  isBaned(ip: string): boolean {
    return this.isBanned(ip)
  }

  /** Return whether an IP address is blocked. */
  isBanned(ip: string): boolean {
    return this.#banIpList.has(ip)
  }

  /** Add an IP address to the block list. */
  ban(ip: string): void {
    this.#banIpList.add(ip)
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/bucket.ts`

```ts
import { BitArray } from '@deno-torrent/toolkit'
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import logger from '~/src/util/log.ts'

/**
 * K-桶（K-Bucket）实现
 *
 * 按 XOR 距离范围 [start, end] 存储 DHT 节点，容量上限由构造时的 `capacity` 决定。
 * 新节点插入到队头（最近活跃）；满桶替换必须由调用方先完成节点存活探测。
 */
export default class Bucket {
  #nodes: Node[] = []
  #capacity: number
  #updatedAt = Date.now()
  #start: BitArray // 桶的 ID 下界（包含）
  #end: BitArray // 桶的 ID 上界（包含）

  /**
   * 创建一个 K-桶
   *
   * @param capacity 桶的最大节点数，默认 8
   * @param start    桶覆盖 ID 范围的下界（160 位）
   * @param end      桶覆盖 ID 范围的上界（160 位）
   */
  constructor(capacity: number = 8, start: BitArray, end: BitArray) {
    if (capacity <= 0) {
      throw new RangeError('bucket capacity must be greater than 0')
    }

    if (start.greaterThan(end)) {
      throw new RangeError(`start must be less than end, start is ${start.toString()}, end is ${end.toString()}`)
    }

    if (start.length !== end.length || start.length !== 160) {
      throw new RangeError(
        `start and end bit length must be same and equal to 160, start length is ${start.length}, end length is ${end.length}`,
      )
    }

    this.#capacity = capacity
    this.#start = start
    this.#end = end
  }

  /** 桶覆盖范围的下界 */
  get start(): BitArray {
    return this.#start
  }

  /** 桶覆盖范围的上界 */
  get end(): BitArray {
    return this.#end
  }

  /** 当前桶中节点数量 */
  get size(): number {
    return this.#nodes.length
  }

  /** 桶最近一次更新的时间戳（毫秒） */
  get updatedAt(): number {
    return this.#updatedAt
  }

  /**
   * 最久未活跃的节点（队尾节点），桶为空时返回 `undefined`
   */
  get oldest(): Node | undefined {
    return this.#nodes.length === 0 ? undefined : this.#nodes[this.#nodes.length - 1]
  }

  /**
   * 最近活跃的节点（队头节点），桶为空时返回 `undefined`
   */
  get latest(): Node | undefined {
    return this.#nodes.length === 0 ? undefined : this.#nodes[0]
  }

  /**
   * 判断给定 ID 是否落在该桶的覆盖范围内
   *
   * @param id 待判断的节点 ID
   * @returns 若 `start <= id.bits <= end` 则返回 `true`
   */
  withinRange(id: Id): boolean {
    return id.bits.greaterThanOrEqual(this.#start) && id.bits.lessThanOrEqual(this.#end)
  }

  /**
   * 向桶中添加节点
   *
   * - 若节点已存在，则更新其活跃时间，返回 `false`（表示未新增）
   * - 若桶已满，拒绝直接插入，由调用方按 BEP 5 探测最旧节点
   * - 新节点插入到队头（最近活跃位置）
   *
   * @param node 要添加的节点
   * @returns 节点被新增时返回 `true`，已存在则返回 `false`
   */
  add(node: Node): boolean {
    this.#updatedAt = Date.now()

    // 使用值相等判断（Id.equals）而非引用比较
    const existing = this.#nodes.find((n) => n.id.equals(node.id))

    if (existing) {
      existing.update(node.port, node.addr)
      logger.debug(`node ${node.id.toString()} is already in the bucket, updating last active time`)
      return false
    }

    if (this.isFull()) return false

    node.updateActivedAt()
    this.#nodes.unshift(node)

    return true
  }

  /** Replace a specific stale node after a liveness probe has failed. */
  replace(staleNode: Node, replacement: Node): boolean {
    if (!this.#nodes.some((node) => node.id.equals(staleNode.id))) return false
    if (this.#nodes.some((node) => node.id.equals(replacement.id))) return false
    this.remove(staleNode)
    return this.add(replacement)
  }

  /** 判断桶是否已达容量上限 */
  isFull(): boolean {
    return this.#nodes.length >= this.#capacity
  }

  /** 判断桶是否为空 */
  isEmpty(): boolean {
    return this.#nodes.length === 0
  }

  /**
   * 从桶中移除指定节点
   *
   * @param node 要移除的节点
   * @returns 节点存在并成功移除返回 `true`，否则返回 `false`
   */
  remove(node: Node): boolean {
    this.#updatedAt = Date.now()

    for (let i = 0; i < this.#nodes.length; i++) {
      // 使用值相等判断（Id.equals）而非引用比较
      if (this.#nodes[i].id.equals(node.id)) {
        this.#nodes.splice(i, 1)
        return true
      }
    }

    return false
  }

  /**
   * 获取桶中最近活跃的前 N 个节点
   *
   * @param count 获取数量，最大不超过桶当前节点数，默认 8
   * @returns 节点列表（按活跃时间从新到旧排序）
   */
  obtainNodes(count = 8): Node[] {
    const maxCount = Math.min(count, this.#nodes.length)
    return this.#nodes.slice(0, maxCount)
  }

  /** 桶中所有节点（只读引用） */
  get nodes(): Node[] {
    return this.#nodes
  }

  /**
   * 按 XOR 距离排序，返回距目标 ID 最近的前 N 个节点
   *
   * @param targetNodeId 目标节点 ID
   * @param count        返回数量
   * @returns 距离最近的节点列表
   */
  closestNodes(targetNodeId: Id, count: number): Node[] {
    const maxCount = Math.min(count, this.#nodes.length)

    return [...this.#nodes]
      .sort((a, b) => (a.id.bits.xor(targetNodeId.bits).lessThan(b.id.bits.xor(targetNodeId.bits)) ? -1 : 1))
      .slice(0, maxCount)
  }

  /** Return a human-readable summary of bucket occupancy and nodes. */
  toString(): string {
    return `Bucket-filled(${this.size})-remained(${this.#capacity - this.size}):[${
      this.#nodes.map((n) => n.toString()).join(', ')
    }]`
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/dht.ts`

```ts
import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { type DatagramTransport, KRPC } from '~/src/krpc/krpc.ts'
import TransactionManager, { Request } from '~/src/krpc/transaction_manager.ts'
import TokenManager from '~/src/krpc/token_manager.ts'
import LocalNode from '~/src/local_node.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { NetUtil } from '@deno-torrent/toolkit'

/** Bootstrap endpoint used to join the public DHT. */
export type BootstrapNode = { addr: string; port: number }

/** Configuration for one isolated DHT node. */
export type DHTOptions = {
  /** UDP port to bind and advertise. */
  port: number
  /** Local IPv4 interface to bind. Defaults to all interfaces. */
  bindAddress?: string
  /** Optional IPv4 address advertised in compact node records. */
  publicAddress?: string
  /** Stable node ID. Omit to generate a random ID without reading host network interfaces. */
  nodeId?: Id
  /** Bootstrap endpoints. Defaults to the public router list. */
  bootstrapNodes?: BootstrapNode[]
  /** Start bootstrap requests during construction. Defaults to true. */
  autoBootstrap?: boolean
  /** Caller-owned UDP transport, used when DHT shares a socket with another protocol. */
  transport?: DatagramTransport
}

/** Controls one bounded iterative BEP-5 peer lookup. */
export type GetPeersOptions = {
  signal?: AbortSignal
  /** Overall lookup deadline. Defaults to 15 seconds. */
  timeoutMs?: number
  /** Deadline for one KRPC exchange. Defaults to 3 seconds. */
  queryTimeoutMs?: number
  /** Simultaneous KRPC queries. Defaults to BEP-5's recommended alpha of 3. */
  concurrency?: number
  /** Maximum nodes contacted in one lookup. Defaults to 64. */
  maxQueries?: number
  /** Stop after this many unique peers. Defaults to 200. */
  maxPeers?: number
  /** Called once for each newly discovered endpoint. */
  onPeer?: (peer: Peer) => void | Promise<void>
}

/** Completed result of a high-level DHT peer lookup. */
export type GetPeersResult = {
  peers: Peer[]
  queriedNodes: number
  respondingNodes: number
  timedOut: boolean
  exhausted: boolean
  durationMs: number
}

/** Controls announcing the local BitTorrent listening port to the DHT. */
export type AnnouncePeerOptions = {
  /** BitTorrent TCP/uTP listening port; defaults to the DHT node port. */
  port?: number
  /** Ask the remote node to use the UDP source port observed through NAT. */
  impliedPort?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  queryTimeoutMs?: number
  maxNodes?: number
}

/** Result of announcing to the nodes that issued fresh tokens. */
export type AnnouncePeerResult = {
  attempted: number
  announced: number
  failures: string[]
}

type StoredAnnounceToken = { node: Node; token: Uint8Array; receivedAt: number }

/**
 * the host node of the dht network
 */
export default class DHT {
  static #DEFAULT_BOOTSTRAP_NODES = [
    {
      addr: 'router.bittorrent.com',
      port: 6881,
    },
    {
      addr: 'dht.transmissionbt.com',
      port: 6881,
    },
    {
      addr: 'router.utorrent.com',
      port: 6881,
    },
    {
      addr: 'dht.aelitis.com',
      port: 6881,
    },
  ]
  #bootstrapNodes: BootstrapNode[] // the bootstrap nodes
  #krpc: KRPC // the krpc protocol
  readonly #routingTable: RoutingTable
  readonly #infoHashManager: InfoHashManager
  readonly #announceTokens = new Map<string, Map<string, StoredAnnounceToken>>()
  #bootstrapInFlight?: Promise<void>
  #closed = false

  private constructor(options: DHTOptions, localNode: LocalNode, bootstrapNodes: BootstrapNode[]) {
    const { port, bindAddress = '0.0.0.0', autoBootstrap = true } = options
    // check the port
    if (!NetUtil.isNetPort(port)) {
      throw new Error('invalid port, should be in range [0, 65535], but got ' + port)
    }

    // check the bootstrap nodes
    if (!bootstrapNodes || bootstrapNodes.length == 0) {
      throw new Error('you should provide at least one bootstrap node, or use the default bootstrap nodes')
    }

    logger.info('initialize isolated DHT state')
    this.#routingTable = new RoutingTable(localNode)
    this.#infoHashManager = new InfoHashManager()
    const transactionManager = new TransactionManager<Request>()
    const tokenManager = new TokenManager()

    // initilize the bootstrap nodes
    logger.info('initilize the bootstrap nodes')
    this.#bootstrapNodes = bootstrapNodes

    // initilize the krpc protocol
    logger.info('initilize the krpc protocol')
    this.#krpc = KRPC.create(
      port,
      this.#routingTable,
      this.#infoHashManager,
      transactionManager,
      tokenManager,
      bindAddress,
      options.transport,
    )

    if (autoBootstrap) {
      void this.pingBootstrapNodes().catch((error) => logger.error(`bootstrap failed: ${error}`))
    }
  }

  /** Routing state owned exclusively by this DHT instance. */
  get routingTable(): RoutingTable {
    return this.#routingTable
  }

  /** Peer associations discovered by this DHT instance. */
  get infoHashManager(): InfoHashManager {
    return this.#infoHashManager
  }

  /**
   * create a dht network and listen on the port
   * @param port the port to listen on
   * @param bootstrapNodes the bootstrap nodes
   * @returns
   */
  static async listen(options: DHTOptions): Promise<DHT> {
    if (!options || typeof options !== 'object') throw new TypeError('DHT options are required')
    const { port, bindAddress = '0.0.0.0', publicAddress, nodeId } = options
    const bootstrapNodes = options.bootstrapNodes ?? DHT.#DEFAULT_BOOTSTRAP_NODES
    if (!NetUtil.isNetPort(port)) {
      throw new RangeError(`port must be in range [0, 65535], but got ${port}`)
    }
    if (!NetUtil.isIPv4Str(bindAddress)) throw new TypeError(`bindAddress must be an IPv4 address: ${bindAddress}`)
    if (publicAddress !== undefined && !NetUtil.isIPv4Str(publicAddress)) {
      throw new TypeError(`publicAddress must be an IPv4 address: ${publicAddress}`)
    }
    if (!bootstrapNodes || bootstrapNodes.length === 0) {
      throw new TypeError('at least one bootstrap node is required')
    }

    const localNode = await LocalNode.createLocalNode(port, { publicAddress, bindAddress, nodeId })

    return new DHT(options, localNode, [...bootstrapNodes])
  }

  /**
   * Contact every configured bootstrap endpoint.
   *
   * A DNS or UDP failure from one endpoint is logged and does not prevent the
   * remaining endpoints from being attempted.
   */
  pingBootstrapNodes(): Promise<void> {
    if (this.#bootstrapInFlight) return this.#bootstrapInFlight
    const operation = this.#contactBootstrapNodes()
    const tracked = operation.finally(() => {
      if (this.#bootstrapInFlight === tracked) this.#bootstrapInFlight = undefined
    })
    this.#bootstrapInFlight = tracked
    return tracked
  }

  async #contactBootstrapNodes(): Promise<void> {
    logger.info(`start pingBootstrapNodes`)
    for (const bootstrapNode of this.#bootstrapNodes) {
      logger.info(`ping the bootstrap node ${bootstrapNode.addr}:${bootstrapNode.port}`)
      try {
        await this.#krpc.sendPingBootrapNodesRequest(bootstrapNode)
        await this.#krpc.sendFindNodeRequest(bootstrapNode.port, bootstrapNode.addr, Id.random())
      } catch (error) {
        logger.warn(`bootstrap node ${bootstrapNode.addr}:${bootstrapNode.port} failed: ${error}`)
      }
    }
  }

  /** Ask every known routing-table node for nodes near a random target. */
  async sendFindNodeRequest(): Promise<void> {
    logger.info(`start sendFindNodeRequest`)
    // get node from bucket
    for (const bucket of this.#routingTable.buckets) {
      if (bucket.isEmpty()) {
        continue
      }
      for (const node of bucket.nodes) {
        await this.#krpc.sendFindNodeRequest(node.port, node.addr, Id.random())
      }
    }
  }

  /**
   * Ask the closest known nodes for peers associated with an info hash.
   *
   * @param infoHash A 20-byte BitTorrent info hash.
   */
  async sendGetPeersRequest(infoHash: Uint8Array): Promise<void> {
    logger.info(`start sendGetPeersRequest`)
    if (this.#routingTable.nodeCount === 0) {
      logger.info(`no nodes in the routing table, skip sendGetPeersRequest`)
      return
    }
    const closestNodes = this.#routingTable.findClosestNodes(Id.fromUnit8Array(infoHash))

    if (closestNodes.length === 0) {
      logger.info(`[no closest nodes found], sendGetPeersRequest to a random node`)
      // 随机获取一个node
      const node = this.#routingTable.getRandomNode()
      if (node) {
        await this.#krpc.sendGetPeersRequest(node, infoHash)
        return
      }
    } else {
      logger.info(`[closest nodes found], sendGetPeersRequest to ${closestNodes.length} nodes`)
      for (const node of closestNodes) {
        await this.#krpc.sendGetPeersRequest(node, infoHash)
      }
    }
  }

  /**
   * Iteratively query the closest known nodes until the candidate set is
   * exhausted, a resource bound is reached, or the operation is cancelled.
   */
  async getPeers(infoHash: Uint8Array, options: GetPeersOptions = {}): Promise<GetPeersResult> {
    this.#assertOpen()
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    options.signal?.throwIfAborted()
    const timeoutMs = positiveNumber(options.timeoutMs ?? 15_000, 'timeoutMs')
    const queryTimeoutMs = positiveNumber(options.queryTimeoutMs ?? 3_000, 'queryTimeoutMs')
    const concurrency = positiveInteger(options.concurrency ?? 3, 'concurrency')
    const maxQueries = positiveInteger(options.maxQueries ?? 64, 'maxQueries')
    const maxPeers = positiveInteger(options.maxPeers ?? 200, 'maxPeers')
    const startedAt = Date.now()
    const deadline = startedAt + timeoutMs
    const target = Id.fromUnit8Array(infoHash)
    const hashKey = bytesToHex(infoHash)
    const candidates = new Map<string, Node>()
    const queried = new Set<string>()
    const peers = new Map<string, Peer>()
    let respondingNodes = 0

    const addCandidates = (nodes: readonly Node[]) => {
      for (const node of nodes) {
        if (node.id.equals(this.#routingTable.localNode.id)) continue
        candidates.set(node.id.toString(), node)
        this.#routingTable.add(node)
      }
    }

    if (this.#routingTable.nodeCount === 0) {
      await this.pingBootstrapNodes()
      const bootstrapDeadline = Math.min(deadline, Date.now() + Math.min(queryTimeoutMs, 2_000))
      while (this.#routingTable.nodeCount === 0 && Date.now() < bootstrapDeadline) {
        await delay(Math.min(25, bootstrapDeadline - Date.now()), options.signal)
      }
    }
    addCandidates(this.#routingTable.findClosestNodes(target, maxQueries))

    while (queried.size < maxQueries && peers.size < maxPeers && Date.now() < deadline) {
      options.signal?.throwIfAborted()
      addCandidates(this.#routingTable.findClosestNodes(target, maxQueries))
      const batch = [...candidates.values()]
        .filter((node) => !queried.has(node.id.toString()))
        .sort((left, right) => compareDistance(left, right, target))
        .slice(0, Math.min(concurrency, maxQueries - queried.size))
      if (batch.length === 0) break
      for (const node of batch) queried.add(node.id.toString())

      const remaining = deadline - Date.now()
      const results = await Promise.allSettled(
        batch.map((node) =>
          this.#krpc.queryGetPeers(node, infoHash, {
            signal: options.signal,
            timeoutMs: Math.max(1, Math.min(queryTimeoutMs, remaining)),
          })
        ),
      )
      options.signal?.throwIfAborted()

      for (const result of results) {
        if (result.status === 'rejected') continue
        respondingNodes++
        const response = result.value
        if (response.token) this.#storeAnnounceToken(hashKey, response.node, response.token)
        addCandidates(response.nodes)
        for (const peer of response.peers) {
          const key = `${peer.addr}\0${peer.port}`
          if (peers.has(key)) continue
          peers.set(key, peer)
          await options.onPeer?.(peer)
          if (peers.size >= maxPeers) break
        }
      }
    }

    const timedOut = Date.now() >= deadline
    const hasUnqueriedCandidate = [...candidates.values()].some((node) => !queried.has(node.id.toString()))
    return {
      peers: [...peers.values()],
      queriedNodes: queried.size,
      respondingNodes,
      timedOut,
      exhausted: !timedOut && !hasUnqueriedCandidate,
      durationMs: Date.now() - startedAt,
    }
  }

  /**
   * Announce a BitTorrent listening port using fresh per-node tokens collected
   * by {@link getPeers}. A lookup is performed automatically when necessary.
   */
  async announcePeer(infoHash: Uint8Array, options: AnnouncePeerOptions = {}): Promise<AnnouncePeerResult> {
    this.#assertOpen()
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    options.signal?.throwIfAborted()
    const port = options.port ?? this.#routingTable.localNode.port
    if (!NetUtil.isNetPort(port) || port === 0) throw new RangeError('port must be in range [1, 65535]')
    const timeoutMs = positiveNumber(options.timeoutMs ?? 15_000, 'timeoutMs')
    const queryTimeoutMs = positiveNumber(options.queryTimeoutMs ?? 3_000, 'queryTimeoutMs')
    const maxNodes = positiveInteger(options.maxNodes ?? 8, 'maxNodes')
    const hashKey = bytesToHex(infoHash)
    let tokens = this.#freshTokens(hashKey)
    if (tokens.length === 0) {
      await this.getPeers(infoHash, {
        signal: options.signal,
        timeoutMs,
        queryTimeoutMs,
        maxQueries: Math.max(maxNodes, 8),
      })
      tokens = this.#freshTokens(hashKey)
    }
    tokens = tokens.slice(0, maxNodes)

    const results = await Promise.allSettled(
      tokens.map(({ node, token }) =>
        this.#krpc.queryAnnouncePeer(node, infoHash, token, port, {
          signal: options.signal,
          timeoutMs: queryTimeoutMs,
          impliedPort: options.impliedPort,
        })
      ),
    )
    options.signal?.throwIfAborted()
    const failures: string[] = []
    let announced = 0
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        announced++
      } else {
        const node = tokens[index]!.node
        failures.push(`${node.addr}:${node.port}: ${errorMessage(result.reason)}`)
      }
    })
    return { attempted: tokens.length, announced, failures }
  }

  #storeAnnounceToken(infoHash: string, node: Node, token: Uint8Array): void {
    let tokens = this.#announceTokens.get(infoHash)
    if (!tokens) {
      tokens = new Map()
      this.#announceTokens.set(infoHash, tokens)
    }
    tokens.set(node.id.toString(), { node, token: token.slice(), receivedAt: Date.now() })
  }

  #freshTokens(infoHash: string): StoredAnnounceToken[] {
    const tokens = this.#announceTokens.get(infoHash)
    if (!tokens) return []
    const oldest = Date.now() - 5 * 60 * 1000
    for (const [nodeId, entry] of tokens) {
      if (entry.receivedAt < oldest) tokens.delete(nodeId)
    }
    if (tokens.size === 0) this.#announceTokens.delete(infoHash)
    return [...tokens.values()]
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('DHT node is closed')
  }

  /**
   * Close the DHT node and release its UDP socket.
   *
   * Calling this method more than once is safe. The instance must not be used
   * to send requests after it has been closed.
   */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#announceTokens.clear()
    this.#krpc.close()
  }
}

function positiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be greater than zero`)
  return value
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function compareDistance(left: Node, right: Node, target: Id): number {
  const leftDistance = left.id.bits.xor(target.bits)
  const rightDistance = right.id.bits.xor(target.bits)
  if (leftDistance.equals(rightDistance)) return 0
  return leftDistance.lessThan(rightDistance) ? -1 : 1
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds)
    function done() {
      signal?.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', aborted, { once: true })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/error_handler.ts`

```ts
import { MessageHandler } from '~/src/krpc/krpc.ts'
import TransactionManager, { Request } from '~/src/krpc/transaction_manager.ts'
import { Message, MessageType } from '~/src/message_factory.ts'
import logger from '~/src/util/log.ts'
import Sender from '~/src/krpc/sender.ts'

export default class ErrorResponseHandler implements MessageHandler {
  constructor(private readonly transactionManager: TransactionManager<Request>) {}

  getHandleMessageType(): MessageType {
    return MessageType.ERROR
  }

  handle(response: Message, address: string, port: number, _client: Sender): Promise<void> {
    const { e: error, t: tid } = response

    // Public DHT replies can outlive our bounded transaction window. A late
    // error cannot affect local state and is not evidence of a remote fault.
    if (typeof tid !== 'string' || !this.transactionManager.isValid(tid)) {
      logger.debug(`[${tid}] received error for unknown or expired transaction from ${address}:${port}`)
      return Promise.resolve()
    }

    const request = this.transactionManager.getData(tid)
    if (!request || request.addr !== address || request.port !== port) {
      logger.warn(`[${tid}] error source ${address}:${port} does not match the original request target`)
      return Promise.resolve()
    }

    // finish transaction only after verifying the source endpoint
    this.transactionManager.finish(tid)
    request.onResult?.(false)

    if (error) {
      const [errorCode, errorMessage] = error
      logger.error(`[${tid}] received error from ${address}:${port}: ${errorCode} ${errorMessage}`)
    } else {
      logger.error(`[${tid}] received error from ${address}:${port}: unknown error`)
    }

    return Promise.resolve()
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/hash.ts`

```ts
import { crypto } from '@std/crypto'
import { encodeHex } from '@std/encoding/hex'

/**
 * 计算数据的 SHA-1 哈希值
 *
 * @param data 待哈希的字节数据
 * @returns 20 字节的 SHA-1 哈希值
 */
export function sha1(data: Uint8Array): Uint8Array {
  const hash = crypto.subtle.digestSync(
    'SHA-1',
    data.buffer instanceof ArrayBuffer ? data.buffer : new Uint8Array(data).buffer,
  )
  return new Uint8Array(hash)
}

/**
 * 生成随机 SHA-1 哈希值
 *
 * @returns 20 字节的随机 SHA-1 哈希值
 */
export function randomSha1(): Uint8Array {
  return sha1(crypto.getRandomValues(new Uint8Array(20)))
}

/**
 * 计算数据的 SHA-1 哈希值，以十六进制字符串返回
 *
 * @param data 待哈希的字节数据
 * @returns 40 字符的十六进制字符串，例如 `'a9993e364706816aba3e25717850c26c9cd0d89d'`
 */
export function sha1String(data: Uint8Array): string {
  return encodeHex(sha1(data))
}

/**
 * 生成随机 SHA-1 哈希值，以十六进制字符串返回
 *
 * @returns 40 字符的随机十六进制字符串
 */
export function randomSha1String(): string {
  return sha1String(crypto.getRandomValues(new Uint8Array(20)))
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/id.ts`

```ts
import { BitArray, BytesUtil, NetUtil } from '@deno-torrent/toolkit'
import { randomSha1, sha1 } from '~/src/util/hash.ts'

/**
 * node's id or infohash, 20 bytes sha1 hash
 */
export default class Id {
  /** Length of a DHT node ID or info hash in bytes. */
  static readonly BYTES_LENGTH = 20
  /** Length of a DHT node ID or info hash in bits. */
  static readonly BIT_LENGTH = Id.BYTES_LENGTH * 8
  #value: BitArray // the value of the id

  /**
   * @param value the value of the id, default is a random sha1 hash
   */
  private constructor(value: BitArray) {
    if (value.bytes.length !== Id.BYTES_LENGTH) {
      throw new RangeError(`id length must be ${Id.BYTES_LENGTH}, but got ${value.length}`)
    }
    this.#value = value
  }

  /** Return whether a byte array has the required 20-byte ID length. */
  static isValidId(id?: Uint8Array): boolean {
    return !!(id && id.length === Id.BYTES_LENGTH)
  }

  /**
   * Create an ID from 20 bytes. The input is copied.
   *
   * @throws {RangeError} If `bytes` is not 20 bytes long.
   */
  static fromUnit8Array(bytes: Uint8Array): Id {
    return new Id(BitArray.fromUint8Array(bytes))
  }

  /** Create a cryptographically random 20-byte ID. */
  static random(): Id {
    return Id.fromUnit8Array(randomSha1())
  }

  /**
   * get the value of the id
   */
  get bits(): BitArray {
    return this.#value
  }

  /**
   * compare this id with the other id
   * @param other
   * @returns
   */
  equals(other: Id): boolean {
    return this.#value.equals(other.#value)
  }

  /**
   * hex string
   */
  toString(): string {
    return BytesUtil.bytes2HexStr(this.#value.bytes)
  }

  /**
   * Return the ID as an unsigned decimal integer string.
   *
   * @deprecated Use {@linkcode toIntString}.
   */
  toIntSting(): string {
    return this.toIntString()
  }

  /** Return the ID as an unsigned decimal integer string. */
  toIntString(): string {
    return this.#value.toBigInt().toString()
  }

  /** Return the ID as a 160-character binary string. */
  toBinaryString(): string {
    return this.#value.toString()
  }

  /**
   * create a id by the mac address
   * @returns
   */
  static createIdByMacAddr(): Id {
    const macAddrs = NetUtil.getMacAddr()
    if (!macAddrs || macAddrs.length === 0) {
      throw new Error('cannot get the mac address')
    }
    return Id.fromUnit8Array(sha1(new TextEncoder().encode(macAddrs[0])))
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/info_hash_manager.ts`

```ts
import Peer from '~/src/peer.ts'
import logger from '~/src/util/log.ts'

type StoredPeer = {
  peer: Peer
  lastSeenAt: number
}

/** In-memory association between info hashes, peers, and announce tokens. */
export default class InfoHashManager {
  /** Maximum number of peers retained for one info hash. */
  static readonly MAX_PEERS_PER_INFO_HASH = 100
  /** Maximum number of info hashes retained process-wide. */
  static readonly MAX_INFO_HASHES = 10_000
  /** Duration for which an unrefreshed peer endpoint remains available. */
  static readonly PEER_TTL_MS = 30 * 60 * 1000

  #infoHashes: Map<string, Map<string, StoredPeer>> = new Map()
  #tokenMap: Map<string, Uint8Array> = new Map()
  #lastFullPruneAt = 0
  /** Create an isolated peer and token store. */
  constructor() {}

  /**
   * get all peers of the infoHash
   * @param infoHash hex string
   * @returns
   */
  find(infoHash: string): Peer[] | undefined {
    const peers = this.#pruneInfoHash(infoHash, Date.now())
    if (!peers) return undefined

    return Array.from(peers.values(), ({ peer }) => peer)
  }

  /** Return the announce token stored for an info hash. */
  findToken(infoHash: string): Uint8Array | undefined {
    this.#pruneInfoHash(infoHash, Date.now())
    const token = this.#tokenMap.get(infoHash)
    return token?.slice()
  }

  /** Add multiple peers, retaining an announce token when the responder supplied one. */
  addList(infoHash: string, peers: Peer[], token?: Uint8Array): void {
    for (const peer of peers) {
      this.#addPeer(infoHash, peer, token)
    }
  }

  /**
   * add a peer to the infoHash
   * @param infoHash hex string
   * @param peer Peer
   */
  add(infoHash: string, peer: Peer, token: Uint8Array): void {
    this.#addPeer(infoHash, peer, token)
  }

  /** Store a peer whose announce token has already been validated by KRPC. */
  addValidatedPeer(infoHash: string, peer: Peer): void {
    this.#addPeer(infoHash, peer)
  }

  #addPeer(infoHash: string, peer: Peer, token?: Uint8Array): void {
    const now = Date.now()
    let peers = this.#pruneInfoHash(infoHash, now)

    if (!peers && this.#infoHashes.size >= InfoHashManager.MAX_INFO_HASHES) {
      if (now - this.#lastFullPruneAt >= 60_000) this.prune(now)
      peers = this.#infoHashes.get(infoHash)
    }

    if (!peers && this.#infoHashes.size >= InfoHashManager.MAX_INFO_HASHES) {
      logger.error(
        `the number of infoHashes exceeds the limit ${InfoHashManager.MAX_INFO_HASHES}, ignore ${infoHash}:${peer.addr}:${peer.port}`,
      )
      return
    }

    const prevToken = this.#tokenMap.get(infoHash)

    const peerKey = `${peer.addr}\0${peer.port}`
    if (peers?.has(peerKey)) {
      peers.set(peerKey, { peer, lastSeenAt: now })
      return
    }

    // check the number of peers
    if (peers && peers.size >= InfoHashManager.MAX_PEERS_PER_INFO_HASH) {
      logger.error(
        `the number of peers of ${infoHash} exceeds the limit ${InfoHashManager.MAX_PEERS_PER_INFO_HASH}, ignore ${peer.addr}:${peer.port}`,
      )
      return
    }

    // create a new set if the infoHash does not exist
    if (!peers) {
      peers = new Map()
      this.#infoHashes.set(infoHash, peers)
    }

    // set token
    if (!prevToken && token !== undefined) {
      this.#tokenMap.set(infoHash, token.slice())
    }

    peers.set(peerKey, { peer, lastSeenAt: now })
  }

  /**
   * delete all peers of the infoHash
   * @param infoHash hex string
   */
  remove(infoHash: string): void {
    if (!this.#infoHashes.has(infoHash)) {
      logger.warn(`the infoHash ${infoHash} does not exist, delete failed`)
      return
    }
    this.#infoHashes.delete(infoHash)
    this.#tokenMap.delete(infoHash)
  }

  /**
   * Remove peer endpoints that have not been refreshed within the retention window.
   *
   * @param now Current epoch time in milliseconds; exposed for deterministic maintenance and tests.
   * @returns Number of peer endpoints removed.
   */
  prune(now: number = Date.now()): number {
    let removed = 0
    for (const [infoHash, peers] of this.#infoHashes) {
      const previousSize = peers.size
      this.#pruneInfoHash(infoHash, now)
      removed += previousSize - (this.#infoHashes.get(infoHash)?.size ?? 0)
    }
    this.#lastFullPruneAt = now
    return removed
  }

  #pruneInfoHash(infoHash: string, now: number): Map<string, StoredPeer> | undefined {
    const peers = this.#infoHashes.get(infoHash)
    if (!peers) return undefined

    for (const [peerKey, stored] of peers) {
      if (now - stored.lastSeenAt >= InfoHashManager.PEER_TTL_MS) peers.delete(peerKey)
    }

    if (peers.size === 0) {
      this.#infoHashes.delete(infoHash)
      this.#tokenMap.delete(infoHash)
      return undefined
    }

    return peers
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/krpc.ts`

```ts
import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import ErrorResponseHandler from '~/src/krpc/handler/error_handler.ts'
import RequestHandler from '~/src/krpc/handler/request_handler.ts'
import ResponseHandler from '~/src/krpc/handler/response_handler.ts'
import Sender from '~/src/krpc/sender.ts'
import TransactionManager from '~/src/krpc/transaction_manager.ts'
import type { GetPeersQueryResult, Request } from '~/src/krpc/transaction_manager.ts'
import TokenManager from '~/src/krpc/token_manager.ts'
import MessageFactory, { Message, MessageType, QueryType } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { NetUtil } from '@deno-torrent/toolkit'

const NODE_PROBE_TIMEOUT_MS = 2_000

export interface DatagramTransport extends AsyncIterable<[Uint8Array, Deno.Addr]> {
  send(data: Uint8Array, address: Deno.Addr): Promise<number>
  close(): void
}

export interface MessageHandler {
  /**
   * get the message type, then the dispatcher will call the handle() method
   */
  getHandleMessageType(): MessageType

  handle(message: Message, address: string, port: number, client: Sender): Promise<void>
}

/**
 * KRPC protocol implementation for DHT
 */
export class KRPC implements Sender {
  #port: number
  #udp: DatagramTransport
  #closed = false
  #messageHandlers: Map<MessageType, MessageHandler>

  private constructor(
    port: number,
    private readonly routingTable: RoutingTable,
    private readonly transactionManager: TransactionManager<Request>,
    infoHashManager: InfoHashManager,
    tokenManager: TokenManager,
    bindAddress: string,
    udp?: DatagramTransport,
    private readonly probeTimeoutMs = NODE_PROBE_TIMEOUT_MS,
  ) {
    this.#port = port
    this.#messageHandlers = new Map<MessageType, MessageHandler>([
      [
        MessageType.RESPONSE,
        new ResponseHandler(
          routingTable,
          infoHashManager,
          transactionManager,
          (node) => this.considerNode(node),
        ),
      ],
      [MessageType.QUERY, new RequestHandler(routingTable, infoHashManager, tokenManager)],
      [MessageType.ERROR, new ErrorResponseHandler(transactionManager)],
    ])

    // initilize the a udp listener and sender
    this.#udp = udp ??
      Deno.listenDatagram({
        port: this.#port,
        transport: 'udp',
        hostname: bindAddress,
      })

    // async handle response
    void this.handlePacket()
  }
  /**
   * create a KRPC instance
   * @param port
   * @returns
   */
  static create(
    port: number,
    routingTable: RoutingTable,
    infoHashManager: InfoHashManager,
    transactionManager: TransactionManager<Request>,
    tokenManager: TokenManager,
    bindAddress = '0.0.0.0',
    udp?: DatagramTransport,
    probeTimeoutMs?: number,
  ) {
    if (!NetUtil.isNetPort(port)) throw new Error('invalid port, should be in range [0, 65535], but got ' + port)
    if (probeTimeoutMs !== undefined && (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0)) {
      throw new RangeError('probeTimeoutMs must be greater than zero')
    }
    if (!NetUtil.isIPv4Str(bindAddress)) throw new TypeError(`bindAddress must be an IPv4 address: ${bindAddress}`)
    return new KRPC(
      port,
      routingTable,
      transactionManager,
      infoHashManager,
      tokenManager,
      bindAddress,
      udp,
      probeTimeoutMs,
    )
  }

  /**
   * dispatch message to the corresponding handler
   * @param message the message to dispatch
   * @param address the address of the node
   * @param port the port of the node
   */
  async dispatchMessage(message: Message, address: string, port: number) {
    const handler = this.#messageHandlers.get(message.y)
    if (!handler) {
      logger.error(`no handler for message type: ${message.y}`)
      return
    }
    await handler.handle(message, address, port, this)
  }

  /**
   * handle udp packet
   */
  async handlePacket() {
    try {
      for await (const packet of this.#udp) {
        // unpack the packet
        const [data, addr] = packet as [Uint8Array, Deno.NetAddr]
        const address = addr.hostname
        const port = addr.port
        const message = await MessageFactory.decode(data)

        if (!message) {
          logger.error(`[<======UDP-handlePacket] decode data failed: ${data}, from ${address}:${port}`)
          continue
        }

        const tid = message.t

        try {
          logger.debug(`handle message ${tid} from ${address}:${port}`)
          await this.dispatchMessage(message, address, port)
        } catch (e) {
          logger.error(`[<======UDP-handlePacket] dispatch message failed: ${e}`)
        }
      }
    } catch (error) {
      if (!this.#closed) logger.error(`[<======UDP-handlePacket] receive loop failed: ${error}`)
    }
  }

  /** Close the UDP socket. Calling this method more than once is safe. */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#udp.close()
  }

  /**
   * // TODO handle timeout request
   * send a message to a node
   * @param port port of the node
   * @param addr address of the node
   * @param messageFc the message to send
   */
  async sendMessage(port: number, addr: string, messageFc: MessageFactory) {
    const bencodeMessage = await messageFc.bencode()

    try {
      await this.#udp.send(bencodeMessage, {
        transport: 'udp',
        hostname: addr,
        port: port,
      })
      // logger.info(`[======>SEND] send message to ${addr}:${port} success: (${JSON.stringify(message)}`)
    } catch (e) {
      logger.error(`[======>SEND] send message to ${addr}:${port} failed`, e)
      throw new Error(`failed to send KRPC message to ${addr}:${port}`, { cause: e })
    }
  }

  async #sendTracked(tid: string, port: number, address: string, message: MessageFactory): Promise<void> {
    try {
      await this.sendMessage(port, address, message)
    } catch (error) {
      if (this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
      throw error
    }
  }

  /** Apply BEP 5 ping-before-replace semantics to a discovered node. */
  async considerNode(node: Node): Promise<boolean> {
    if (this.routingTable.findNode(node.id)) {
      this.routingTable.add(node)
      return true
    }

    const candidate = this.routingTable.replacementCandidate(node)
    if (!candidate) return this.routingTable.add(node)
    if (await this.#probeNode(candidate)) return false
    return this.routingTable.replace(candidate, node)
  }

  #probeNode(node: Node): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (reachable: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(reachable)
      }

      const tid = this.transactionManager.create({
        type: QueryType.PING,
        addr: node.addr,
        port: node.port,
        onResult: settle,
      })
      const timer = setTimeout(() => {
        if (this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
        settle(false)
      }, this.probeTimeoutMs)

      const message = MessageFactory.requestPing(tid, this.routingTable.localNode.id)
      void this.#sendTracked(tid, node.port, node.addr, message).catch(() => settle(false))
    })
  }

  /**
   * send a ping query to the node
   *
   * request:
   * ping Query = {"t":"aa", "y":"q", "q":"ping", "a":{"id":"<hex string>"}}
   * the id is local node id
   *
   * response:
   * Response = {"t":"aa", "y":"r", "r": {"id":"<hex string>"}}
   * the id is the node which response the ping query
   *
   * @param targetNode which node to ask
   * @param nodeId the node id of the local node
   */
  async sendPingRequest(targetNode: Node) {
    const address = await this.resolveAddress(targetNode.addr)
    const tid = this.transactionManager.create({
      type: QueryType.PING,
      addr: address,
      port: targetNode.port,
    })

    const messageFC = MessageFactory.requestPing(tid, this.routingTable.localNode.id)

    // send the message
    await this.#sendTracked(tid, targetNode.port, address, messageFC)
  }

  /**
   * send a find_node query to the node
   *
   * find_node Query = {"t":"aa", "y":"q", "q":"find_node", "a": {"id":"<hex string>", "target":"<hex string>"}}
   * "id" containing the node ID of the querying node, and "target" containing the ID of the node sought by the queryer.
   *
   * Response = {"t":"aa", "y":"r", "r": {"id":"<hex string>", "nodes": "<hex string>"}}
   *
   * @param port
   * @param addr
   */
  async sendFindNodeRequest(port: number, addr: string, targetId: Id) {
    const address = await this.resolveAddress(addr)
    const tid = this.transactionManager.create({
      type: QueryType.FIND_NODE,
      addr: address,
      port: port,
    })

    const messageFC = MessageFactory.requestFindNode(tid, this.routingTable.localNode.id, targetId)
    await this.#sendTracked(tid, port, address, messageFC)
  }

  /**
   * send a get_peers query to target node to get peers of the file
   *
   * @param targetNode which node to get peers from, the node must be in the routing table
   * @param infoHash the info hash of the file
   */
  async sendGetPeersRequest(targetNode: Node, infoHash: Uint8Array) {
    const address = await this.resolveAddress(targetNode.addr)
    const tid = this.transactionManager.create({
      type: QueryType.GET_PEERS,
      infoHash: infoHash,
      addr: address,
      port: targetNode.port,
    })
    const messageFC = MessageFactory.requestGetPeers(tid, this.routingTable.localNode.id, infoHash)
    await this.#sendTracked(tid, targetNode.port, address, messageFC)
  }

  /** Perform one bounded get_peers exchange and return its parsed response. */
  async queryGetPeers(
    targetNode: Node,
    infoHash: Uint8Array,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<GetPeersQueryResult> {
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    const timeoutMs = options.timeoutMs ?? 3_000
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be greater than zero')
    options.signal?.throwIfAborted()
    const address = await this.resolveAddress(targetNode.addr)

    return new Promise<GetPeersQueryResult>((resolve, reject) => {
      let settled = false
      let tid = ''
      const finish = (result?: GetPeersQueryResult, error?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (tid && this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
        if (error !== undefined) reject(error)
        else resolve(result!)
      }
      const onAbort = () => finish(undefined, options.signal?.reason ?? abortError())
      tid = this.transactionManager.create({
        type: QueryType.GET_PEERS,
        infoHash: Uint8Array.from(infoHash),
        addr: address,
        port: targetNode.port,
        onResult: (reachable) => {
          if (!reachable) {
            finish(undefined, new Error(`DHT node ${targetNode.addr}:${targetNode.port} rejected get_peers`))
          }
        },
        onGetPeersResult: (result) => finish(result),
      })
      const timer = setTimeout(
        () => finish(undefined, new DOMException('DHT get_peers query timed out', 'TimeoutError')),
        timeoutMs,
      )
      options.signal?.addEventListener('abort', onAbort, { once: true })
      const message = MessageFactory.requestGetPeers(tid, this.routingTable.localNode.id, infoHash)
      void this.#sendTracked(tid, targetNode.port, address, message).catch((error) => finish(undefined, error))
    })
  }

  /**
   * send a announce_peer query to target node to announce the peer, means tell the node that I have the file
   *
   * get_peers Query = {"t":"aa", "y":"q", "q":"get_peers", "a": {"id":"<hex string>", "info_hash":"<hex string>"}}
   * Response with closest nodes = {"t":"aa", "y":"r", "r": {"id":"<hex string>", "token":"<token>", "nodes": "<hex string>"}}
   *
   * @param targetNode which node to announce to, the node must be in the routing table
   * @param infoHash the info hash of the file
   * @param token the token of the node
   */
  async sendAnnouncePeerRequest(targetNode: Node, infoHash: Uint8Array, token: Uint8Array, peerPort = this.#port) {
    const address = await this.resolveAddress(targetNode.addr)
    const tid = this.transactionManager.create({
      type: QueryType.ANNOUNCE_PEER,
      infoHash: infoHash,
      addr: address,
      port: targetNode.port,
    })
    const messageFC = MessageFactory.requestAnnouncePeer(
      tid,
      this.routingTable.localNode.id,
      infoHash,
      peerPort,
      token,
    )
    await this.#sendTracked(tid, targetNode.port, address, messageFC)
  }

  /** Perform one bounded announce_peer exchange and wait for acknowledgement. */
  async queryAnnouncePeer(
    targetNode: Node,
    infoHash: Uint8Array,
    token: Uint8Array,
    peerPort: number,
    options: { signal?: AbortSignal; timeoutMs?: number; impliedPort?: boolean } = {},
  ): Promise<void> {
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    if (!NetUtil.isNetPort(peerPort) || peerPort === 0) throw new RangeError('peerPort must be in range [1, 65535]')
    if (token.length === 0) throw new RangeError('token must not be empty')
    const timeoutMs = options.timeoutMs ?? 3_000
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be greater than zero')
    options.signal?.throwIfAborted()
    const address = await this.resolveAddress(targetNode.addr)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      let tid = ''
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (tid && this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
        if (error !== undefined) reject(error)
        else resolve()
      }
      const onAbort = () => finish(options.signal?.reason ?? abortError())
      tid = this.transactionManager.create({
        type: QueryType.ANNOUNCE_PEER,
        infoHash: Uint8Array.from(infoHash),
        addr: address,
        port: targetNode.port,
        onResult: (reachable) =>
          reachable
            ? finish()
            : finish(new Error(`DHT node ${targetNode.addr}:${targetNode.port} rejected announce_peer`)),
      })
      const timer = setTimeout(
        () => finish(new DOMException('DHT announce_peer query timed out', 'TimeoutError')),
        timeoutMs,
      )
      options.signal?.addEventListener('abort', onAbort, { once: true })
      const message = MessageFactory.requestAnnouncePeer(
        tid,
        this.routingTable.localNode.id,
        infoHash,
        peerPort,
        token,
        options.impliedPort,
      )
      void this.#sendTracked(tid, targetNode.port, address, message).catch(finish)
    })
  }

  /**
   * same as ping, but send to a specific port and addr, because for bootstrap node, we don't know the node id
   * @param bootstrapNode {addr: string, port: number}
   */
  async sendPingBootrapNodesRequest({ addr, port }: { addr: string; port: number }) {
    const address = await this.resolveAddress(addr)
    const tid = this.transactionManager.create({
      type: QueryType.PING,
      addr: address,
      port: port,
    })
    const messageFC = MessageFactory.requestPing(tid, this.routingTable.localNode.id)
    await this.#sendTracked(tid, port, address, messageFC)
  }

  private async resolveAddress(address: string): Promise<string> {
    if (NetUtil.isIPv4Str(address)) return address

    const addresses = await Deno.resolveDns(address, 'A')
    const resolved = addresses[0]
    if (!resolved) throw new Error(`could not resolve IPv4 address for ${address}`)
    return resolved
  }
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError')
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/local_node.ts`

```ts
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'

/**
 * LocalNode must be a Node, and it contains the node's routing table and file info hashs
 */
export default class LocalNode extends Node {
  /** Create a local DHT node. */
  constructor(id: Id, port: number, addr: string) {
    super(id, port, addr)
  }

  /** Local nodes remain active for the lifetime of the instance. */
  override isActive(): boolean {
    // for local node, it is always active
    return true
  }

  /**
   * create a local node
   * @param port the port of the node
   * @returns the local node
   */
  static createLocalNode(
    port: number,
    options: { publicAddress?: string; bindAddress?: string; nodeId?: Id } = {},
  ): Promise<LocalNode> {
    const id = options.nodeId ?? Id.random()
    // A BEP-5 query carries the node ID, not the caller's advertised address.
    // Requiring an unrelated HTTPS IP-discovery service prevents DHT startup
    // in otherwise healthy UDP-only environments. The local address is only
    // used when this node is projected into compact node records, so retain an
    // explicit public address when supplied and otherwise use the bind address.
    const addr = options.publicAddress ?? options.bindAddress ?? '0.0.0.0'
    return Promise.resolve(new LocalNode(id, port, addr))
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/log.ts`

```ts
/**
 * 轻量级日志记录器
 *
 * 封装 console 方法，提供统一的日志格式，无外部依赖。
 * 支持 DEBUG / INFO / WARN / ERROR 四个级别。
 */

/** 日志级别枚举（数值越大优先级越高） */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const

/** 日志级别类型 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

/**
 * 轻量级日志记录器类
 */
class Logger {
  readonly #name: string
  #level: LogLevel

  /**
   * Create a logger.
   *
   * @param name  日志来源名称，将显示在每条日志前缀中
   * @param level 最低输出级别，默认为 INFO
   */
  constructor(name: string, level: LogLevel = 'INFO') {
    this.#name = name
    this.#level = level
  }

  /** 动态设置最低日志级别 */
  setLevel(level: LogLevel): void {
    this.#level = level
  }

  /** 判断给定级别是否应输出 */
  #shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.#level]
  }

  /** 格式化日志前缀 */
  #prefix(level: LogLevel): string {
    return `${new Date().toISOString()} [${level.padEnd(5)}] [${this.#name}]`
  }

  /**
   * 输出 DEBUG 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  debug(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('DEBUG')) {
      console.debug(this.#prefix('DEBUG'), msg, ...args)
    }
  }

  /**
   * 输出 INFO 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  info(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('INFO')) {
      console.info(this.#prefix('INFO'), msg, ...args)
    }
  }

  /**
   * 输出 WARN 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  warn(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('WARN')) {
      console.warn(this.#prefix('WARN'), msg, ...args)
    }
  }

  /**
   * 输出 ERROR 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  error(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('ERROR')) {
      console.error(this.#prefix('ERROR'), msg, ...args)
    }
  }
}

/** 全局默认日志记录器实例 */
const logger = new Logger('torrent-dht')

export { Logger }
export default logger

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/message_factory.ts`

```ts
import { type BencodeDict, type BencodeValue, decode as bdecode, encode as bencode } from '@deno-torrent/bencode'
import { concat } from '@std/bytes'
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import logger from '~/src/util/log.ts'

// IPv4 UDP payloads cannot exceed 65,507 bytes. KRPC messages only need a few
// container levels, so keep the bencode decoder well below its general-purpose
// defaults when handling untrusted datagrams.
const MAX_KRPC_MESSAGE_BYTES = 65_507
const MAX_KRPC_MESSAGE_DEPTH = 16
const MAX_TRANSACTION_ID_BYTES = 64
const MAX_TOKEN_BYTES = 64
const textEncoder = new TextEncoder()

type UnknownDictionary = Record<string, unknown>

function isDictionary(value: unknown): value is UnknownDictionary {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toProtocolBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') return textEncoder.encode(value)
  return undefined
}

function normalizeMessage(value: unknown): Message | undefined {
  if (!isDictionary(value)) return undefined

  const { t, y } = value
  const transactionId = toProtocolBytes(t)
  if (!transactionId || transactionId.length === 0 || transactionId.length > MAX_TRANSACTION_ID_BYTES) {
    return undefined
  }
  const normalizedTransactionId: TransactionId = t instanceof Uint8Array ? t.slice() : t as string

  if (y === MessageType.QUERY) {
    if (typeof value.q !== 'string' || !isDictionary(value.a)) return undefined

    const id = toProtocolBytes(value.a.id)
    if (!id) return undefined

    const target = value.a.target === undefined ? undefined : toProtocolBytes(value.a.target)
    const infoHash = value.a.info_hash === undefined ? undefined : toProtocolBytes(value.a.info_hash)
    if (value.a.target !== undefined && !target) return undefined
    if (value.a.info_hash !== undefined && !infoHash) return undefined
    if (value.a.implied_port !== undefined && typeof value.a.implied_port !== 'number') return undefined
    if (value.a.port !== undefined && typeof value.a.port !== 'number') return undefined
    const token = value.a.token === undefined ? undefined : toProtocolBytes(value.a.token)
    if (token !== undefined && (token.length === 0 || token.length > MAX_TOKEN_BYTES)) return undefined
    if (value.a.token !== undefined && !token) return undefined

    return {
      t: normalizedTransactionId,
      y,
      q: value.q as QueryType,
      a: {
        id,
        target,
        info_hash: infoHash,
        implied_port: value.a.implied_port,
        port: value.a.port,
        token: token?.slice(),
      },
    }
  }

  if (y === MessageType.RESPONSE) {
    if (!isDictionary(value.r)) return undefined

    const id = toProtocolBytes(value.r.id)
    if (!id) return undefined

    const nodes = value.r.nodes === undefined ? undefined : toProtocolBytes(value.r.nodes)
    if (value.r.nodes !== undefined && !nodes) return undefined

    let values: Uint8Array[] | undefined
    if (value.r.values !== undefined) {
      if (!Array.isArray(value.r.values)) return undefined
      values = []
      for (const entry of value.r.values) {
        const bytes = toProtocolBytes(entry)
        if (!bytes) return undefined
        values.push(bytes)
      }
    }

    const token = value.r.token === undefined ? undefined : toProtocolBytes(value.r.token)
    if (token !== undefined && (token.length === 0 || token.length > MAX_TOKEN_BYTES)) return undefined
    if (value.r.token !== undefined && !token) return undefined

    return {
      t: normalizedTransactionId,
      y,
      r: {
        id,
        nodes,
        values,
        token: token?.slice(),
      },
    }
  }

  if (y === MessageType.ERROR) {
    if (
      !Array.isArray(value.e) || value.e.length !== 2 || !Number.isSafeInteger(value.e[0]) ||
      typeof value.e[1] !== 'string'
    ) {
      return undefined
    }

    return { t: normalizedTransactionId, y, e: [value.e[0] as number, value.e[1]] }
  }

  return undefined
}

function toBencodeValue(value: unknown): BencodeValue {
  if (typeof value === 'string' || value instanceof Uint8Array) return value

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('bencode numbers must be safe integers')
    return value
  }

  if (Array.isArray(value)) return value.map(toBencodeValue)

  if (value instanceof Map) {
    const dictionary: BencodeDict = new Map()
    for (const [key, entry] of value) {
      if (typeof key !== 'string' && !(key instanceof Uint8Array)) {
        throw new TypeError('bencode dictionary keys must be strings or Uint8Array values')
      }
      dictionary.set(key, toBencodeValue(entry))
    }
    return dictionary
  }

  if (typeof value === 'object' && value !== null) {
    const dictionary: BencodeDict = new Map()
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) dictionary.set(key, toBencodeValue(entry))
    }
    return dictionary
  }

  throw new TypeError(`unsupported bencode value: ${String(value)}`)
}

function fromBencodeValue(value: BencodeValue): unknown {
  if (value instanceof Map) {
    const dictionary: Record<string, unknown> = Object.create(null)
    for (const [key, entry] of value) {
      if (typeof key !== 'string') throw new TypeError('KRPC dictionary keys must be UTF-8 strings')
      dictionary[key] = fromBencodeValue(entry)
    }
    return dictionary
  }

  if (Array.isArray(value)) return value.map(fromBencodeValue)
  return value
}

/** KRPC 消息结构 */
export type Message = {
  /** Opaque transaction ID. Public DHT nodes may use arbitrary binary bytes. */
  t: TransactionId
  /** 消息类型：query / response / error */
  y: MessageType
  /** 查询类型，仅 query 消息携带 */
  q?: QueryType
  /** 查询参数，仅 query 消息携带 */
  a?: {
    /** 发起查询节点的 ID */
    id: Uint8Array
    /** find_node 目标节点 ID */
    target?: Uint8Array
    /** get_peers / announce_peer 的 info hash */
    info_hash?: Uint8Array
    /** announce_peer：1 表示使用发送方端口，0 使用 `port` 字段 */
    implied_port?: number
    /** announce_peer：下载端口 */
    port?: number
    /** announce_peer：令牌 */
    token?: Uint8Array
  }
  /** 响应数据，仅 response 消息携带 */
  r?: {
    /** 响应节点的 ID */
    id: Uint8Array
    /** find_node / get_peers 响应：紧凑节点列表 */
    nodes?: Uint8Array
    /** get_peers 响应：紧凑 Peer 地址列表 */
    values?: Uint8Array[]
    /** get_peers 响应：令牌 */
    token?: Uint8Array
  }
  /** 错误信息，仅 error 消息携带：[错误码, 错误描述] */
  e?: [number, string]
  /** DHT 协议版本标识（可选），格式为 2 字节客户端标识 + 2 字节版本 */
  v?: string
}

/** KRPC transaction IDs are opaque byte strings, not necessarily UTF-8 text. */
export type TransactionId = string | Uint8Array

/**
 * KRPC 消息类型
 *
 * @see http://bittorrent.org/beps/bep_0005.html
 */
export enum MessageType {
  /** 查询消息 */
  QUERY = 'q',
  /** 响应消息 */
  RESPONSE = 'r',
  /** 错误消息 */
  ERROR = 'e',
}

/**
 * KRPC 查询类型
 */
export enum QueryType {
  /** 心跳检测 */
  PING = 'ping',
  /** 查找最近节点 */
  FIND_NODE = 'find_node',
  /** 获取持有某 info hash 的 Peer 列表 */
  GET_PEERS = 'get_peers',
  /** 宣告自己持有某 info hash */
  ANNOUNCE_PEER = 'announce_peer',
}

/**
 * KRPC 错误码
 *
 * @see http://bittorrent.org/beps/bep_0005.html#errors
 */
export enum ErrorType {
  /** 通用错误 */
  GENERIC = 201,
  /** 服务端错误 */
  SERVER = 202,
  /** 协议错误（如格式错误、非法参数、无效 token）*/
  PROTOCOL = 203,
  /** 未知方法 */
  METHOD_UNKNOWN = 204,
}

/**
 * KRPC 消息构造器
 *
 * 提供静态工厂方法生成各类 KRPC 请求 / 响应 / 错误消息，
 * 并支持 Bencode 序列化与反序列化。
 */
export default class MessageFactory {
  #message: Message

  private constructor(message: Message) {
    this.#message = message
  }

  /**
   * 将 Bencode 字节解码为消息对象
   *
   * @param data 待解码的 Bencode 字节
   * @returns 解码成功返回消息对象，格式错误返回 `undefined`
   */
  static decode(data: Uint8Array): Promise<Message | undefined> {
    return Promise.resolve().then(() => MessageFactory.decodeSync(data))
  }

  /** Decode and validate one KRPC message synchronously. */
  private static decodeSync(data: Uint8Array): Message | undefined {
    try {
      const decoded = fromBencodeValue(
        bdecode(data, {
          maxBytes: MAX_KRPC_MESSAGE_BYTES,
          maxDepth: MAX_KRPC_MESSAGE_DEPTH,
          // Mainline DHT implementations may emit otherwise valid dictionaries
          // whose keys are not canonical byte-order. Duplicate keys and all
          // other decoder validation remain enforced by bencode.
          allowUnsortedKeys: true,
        }),
      )

      return normalizeMessage(decoded)
    } catch (e) {
      logger.error(`[Bencode] decode message error: ${e}`)
      return undefined
    }
  }

  /**
   * 将当前消息编码为 Bencode 字节
   *
   * @returns Bencode 编码的字节数组
   */
  bencode(): Promise<Uint8Array> {
    return Promise.resolve().then(() => bencode(toBencodeValue(this.#message)))
  }

  /**
   * 返回原始消息对象
   */
  message(): Message {
    return this.#message
  }

  /**
   * 构造 ping 查询消息
   *
   * @param tid    事务 ID
   * @param nodeId 本地节点 ID
   */
  static requestPing(tid: TransactionId, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.PING,
      a: { id: nodeId.bits.bytes },
    })
  }

  /**
   * 构造 find_node 查询消息
   *
   * @param tid      事务 ID
   * @param nodeId   本地节点 ID
   * @param targetId 目标节点 ID
   */
  static requestFindNode(tid: TransactionId, nodeId: Id, targetId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.FIND_NODE,
      a: {
        id: nodeId.bits.bytes,
        target: targetId.bits.bytes,
      },
    })
  }

  /**
   * 构造 get_peers 查询消息
   *
   * @param tid      事务 ID
   * @param nodeId   本地节点 ID
   * @param infoHash 目标 info hash（20 字节）
   */
  static requestGetPeers(tid: TransactionId, nodeId: Id, infoHash: Uint8Array): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.GET_PEERS,
      a: {
        id: nodeId.bits.bytes,
        info_hash: infoHash,
      },
    })
  }

  /**
   * 构造 announce_peer 查询消息
   *
   * @param tid      事务 ID
   * @param nodeId   本地节点 ID
   * @param infoHash 目标 info hash（20 字节）
   * @param port     本地下载端口
   */
  static requestAnnouncePeer(
    tid: TransactionId,
    nodeId: Id,
    infoHash: Uint8Array,
    port: number,
    token: Uint8Array,
    impliedPort = false,
  ): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.ANNOUNCE_PEER,
      a: {
        id: nodeId.bits.bytes,
        implied_port: impliedPort ? 1 : 0,
        info_hash: infoHash,
        port,
        token: token.slice(),
      },
    })
  }

  /**
   * 构造 ping 响应消息
   *
   * @param tid 事务 ID
   */
  static responsePing(tid: TransactionId, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: { id: nodeId.bits.bytes },
    })
  }

  /**
   * 构造 find_node 响应消息
   *
   * @param tid   事务 ID
   * @param nodes 最近节点列表（将被序列化为紧凑格式）
   */
  static responseFindNode(tid: TransactionId, nodeId: Id, nodes: Node[]): MessageFactory {
    const compactNodeList = nodes.map((node) => node.toCompact())

    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: {
        id: nodeId.bits.bytes,
        // @std/bytes v1.x：concat 接受 Uint8Array[] 数组而非展开参数
        nodes: concat(compactNodeList),
      },
    })
  }

  /**
   * 构造 get_peers 响应消息
   *
   * 当存在 Peer 时返回 `values`；否则返回 `nodes`（最近节点）。
   * `peers` 和 `nodes` 至少须提供其一；空 `nodes` 表示当前没有更近节点。
   *
   * @param tid   事务 ID
   * @param peers Peer 列表（可选）
   * @param nodes 最近节点列表（可选）
   * @param token 令牌（可选）
   */
  static responseGetPeers(
    tid: TransactionId,
    nodeId: Id,
    peers?: Peer[],
    nodes?: Node[],
    token?: Uint8Array,
  ): MessageFactory {
    const hasPeers = peers && peers.length > 0
    const hasNodes = nodes !== undefined

    if (!hasPeers && !hasNodes) {
      throw new Error('must provide peers or nodes')
    }

    if (hasNodes) {
      const compactNodeList = nodes!.map((node) => node.toCompact())

      return new MessageFactory({
        t: tid,
        y: MessageType.RESPONSE,
        r: {
          id: nodeId.bits.bytes,
          token: token?.slice(),
          nodes: concat(compactNodeList),
        },
      })
    } else {
      return new MessageFactory({
        t: tid,
        y: MessageType.RESPONSE,
        r: {
          id: nodeId.bits.bytes,
          token: token?.slice(),
          values: peers!.map((peer) => peer.toCompact()),
        },
      })
    }
  }

  /**
   * 构造 announce_peer 响应消息
   *
   * @param tid 事务 ID
   */
  static responseAnnouncePeer(tid: TransactionId, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: { id: nodeId.bits.bytes },
    })
  }

  /**
   * 构造错误消息
   *
   * @param tid          事务 ID
   * @param errorCode    错误码
   * @param errorMessage 错误描述（可选）
   */
  static responseError(tid: TransactionId, errorCode: ErrorType, errorMessage?: string): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.ERROR,
      e: [errorCode.valueOf(), errorMessage ?? ''],
    })
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/mod.ts`

````ts
/**
 * @module
 *
 * torrent-dht —— 原生 Deno 实现的 BitTorrent DHT 协议库（BEP-5）
 *
 * @example
 * ```ts
 * import { DHT } from "@deno-torrent/torrent-dht"
 *
 * const dht = await DHT.listen(6881)
 * await dht.pingBootstrapNodes()
 * dht.close()
 * ```
 */

// 主入口
export { default as DHT } from '~/src/dht.ts'
export type {
  AnnouncePeerOptions,
  AnnouncePeerResult,
  BootstrapNode,
  DHTOptions,
  GetPeersOptions,
  GetPeersResult,
} from '~/src/dht.ts'

// 核心数据模型
export { default as Id } from '~/src/id.ts'
export { default as Peer } from '~/src/peer.ts'
export { default as Node } from '~/src/node.ts'
export { default as LocalNode } from '~/src/local_node.ts'
export { default as Bucket } from '~/src/bucket.ts'
export { default as RoutingTable } from '~/src/routing_table.ts'

// 管理器
export { default as InfoHashManager } from '~/src/info_hash_manager.ts'
export { default as BlackListManager } from '~/src/black_list_manager.ts'

// KRPC 消息类型定义
export type { Message } from '~/src/message_factory.ts'
export type { DatagramTransport } from '~/src/krpc/krpc.ts'
export { ErrorType, MessageType, QueryType } from '~/src/message_factory.ts'
export { default as MessageFactory } from '~/src/message_factory.ts'

// 工具函数
export { randomSha1, randomSha1String, sha1, sha1String } from '~/src/util/hash.ts'
export { Logger } from '~/src/util/log.ts'
export type { LogLevel } from '~/src/util/log.ts'

````

---

## Arquivo: `docs/deno-torrent/torrent-dht/net.ts`

```ts
import { BytesUtil, NetUtil } from '@deno-torrent/toolkit'
import Id from '~/src/id.ts'

const REQ_URL_IPV4 = 'https://api.ipify.org?format=json'
const REQ_URL_IPV6 = 'https://api64.ipify.org?format=json'

// the length of the compact address, 4-byte IPv4 address and 2-byte port number
export const COMPAT_ADDR_V4_LEN = 6

// the length of the compact address, 20-byte node id and 4-byte IPv4 address and 2-byte port number
export const COMPAT_NODE_LEN = 26

enum RequestType {
  IPv4 = REQ_URL_IPV4,
  IPv6 = REQ_URL_IPV6,
}

const DEFAULT_IP_DISCOVERY_TIMEOUT_MS = 10_000

type GetIPOptions = {
  timeoutMs?: number
  fetcher?: typeof fetch
}

/**
 * extract the compact address
 * @param bytes the compact address
 * @returns the address and port
 */
export function extractCompactAddr(bytes: Uint8Array) {
  // 4-byte IP address and 2-byte port number
  if (bytes.length !== COMPAT_ADDR_V4_LEN) {
    throw new RangeError(`bytes length must be ${COMPAT_ADDR_V4_LEN}, but got ${bytes.length}`)
  }

  const ipBytes = bytes.slice(0, 4)
  const portBytes = bytes.slice(4, 6)

  return {
    addr: NetUtil.bytes2IPv4Str(ipBytes)!,
    port: BytesUtil.bytes2Int(portBytes),
  }
}

/**
 * package the address and port to compact address
 * @param addr
 * @param port
 * @returns bytes
 */
export function packageCompactAddr(addr: string, port: number) {
  const ipBytes = NetUtil.ipv4Str2Bytes(addr)!
  const portBytes = new Uint8Array(2)
  new DataView(portBytes.buffer).setUint16(0, port, false)
  return Uint8Array.from([...ipBytes, ...portBytes])
}

export function extractCompactNode(bytes: Uint8Array) {
  // Compact IP-address/port info,20-byte Node ID followed by 4-byte IP address and 2-byte port number
  if (bytes.length !== COMPAT_NODE_LEN) {
    throw new RangeError(`bytes length must be 26, but got ${bytes.length}`)
  }

  const idBytes = bytes.slice(0, 20)
  const ipBytes = bytes.slice(20, 24)
  const portBytes = bytes.slice(24, 26)

  const id = Id.fromUnit8Array(idBytes)
  const port = BytesUtil.bytes2Int(portBytes)!
  const addr = NetUtil.bytes2IPv4Str(ipBytes)!

  return {
    id,
    port,
    addr,
  }
}

export function packageCompactNode(id: Id, addr: string, port: number) {
  const idBytes = id.bits.bytes
  const ipBytes = NetUtil.ipv4Str2Bytes(addr)!
  const portBytes = new Uint8Array(2)
  new DataView(portBytes.buffer).setUint16(0, port, false)
  return Uint8Array.from([...idBytes, ...ipBytes, ...portBytes])
}

/**
 * request the ip address from ipify
 * @param ipv4 is IPv4
 * @returns
 */
async function requestIPIFY(type: RequestType, options: GetIPOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_IP_DISCOVERY_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('IP discovery timeout must be greater than zero')
  }

  try {
    const response = await (options.fetcher ?? fetch)(type.valueOf(), {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`ipify returned HTTP ${response.status}`)

    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null || !('ip' in body) || typeof body.ip !== 'string') {
      throw new TypeError('ipify response does not contain an IP address')
    }
    if (type === RequestType.IPv4 && !NetUtil.isIPv4Str(body.ip)) {
      throw new TypeError('ipify response does not contain a valid IPv4 address')
    }

    return body.ip
  } catch (cause) {
    throw new Error(`public IP discovery failed after at most ${timeoutMs}ms`, { cause })
  }
}

/**
 * request the public ip address
 * @param type the request type (IPv4 or IPv6)
 * @returns the public ip address
 */
export async function getIP(type: RequestType = RequestType.IPv4, options: GetIPOptions = {}): Promise<string> {
  return await requestIPIFY(type, options)
}

export function isAddr(value: string) {
  return !!(NetUtil.isIPv4Str(value) || NetUtil.isDomain(value))
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/node.ts`

```ts
import Id from '~/src/id.ts'
import Peer from '~/src/peer.ts'
import { extractCompactNode, packageCompactNode } from '~/src/util/net.ts'

/**
 * Node must be a Peer, and it contains the node's id, routing table and file info hashs
 */
export default class Node extends Peer {
  /** Duration in milliseconds for which the node is considered active. */
  readonly ACTIVE_RANGE = 5 * 60 * 1000
  #id: Id // 20 bytes sha1 hash
  #activedAt!: number // the last active time of the node

  /** Create a DHT node with an ID and network endpoint. */
  constructor(id: Id, port: number, addr: string) {
    super(port, addr)
    this.#id = id
    this.#activedAt = Date.now()
  }

  /** Mark the node as active at the current time. */
  updateActivedAt(): void {
    this.#activedAt = Date.now()
  }

  /** Timestamp of the most recent activity, in milliseconds since Unix epoch. */
  get activedAt(): number {
    return this.#activedAt
  }

  /** Return whether the node was active within `ACTIVE_RANGE`. */
  isActive(): boolean {
    return Date.now() - this.#activedAt < this.ACTIVE_RANGE
  }

  /** The node's 20-byte DHT identifier. */
  get id(): Id {
    return this.#id
  }

  /** Update the endpoint and refresh the activity timestamp. */
  override update(port: number, addr: string): void {
    super.update(port, addr)
    this.updateActivedAt()
  }

  /** Return a human-readable node representation. */
  override toString(): string {
    return `{id: ${this.#id.toString()}, port: ${this.port}, addr: ${this.addr}}`
  }

  /** Encode this node as the BEP-5 26-byte compact node representation. */
  override toCompact(): Uint8Array {
    return packageCompactNode(this.#id, this.addr, this.port)
  }

  /** Decode a node from the BEP-5 26-byte compact representation. */
  static override fromCompact(bytes: Uint8Array): Node {
    const { id, port, addr } = extractCompactNode(bytes)

    return new Node(id, port, addr)
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/peer.ts`

```ts
import { NetUtil } from '@deno-torrent/toolkit'
import { extractCompactAddr, isAddr, packageCompactAddr } from '~/src/util/net.ts'

/**
 * Peer represents a peer in the network, it contains the peer's ip address and port
 */
export default class Peer {
  #addrType!: 'ipv4' | 'domain' // the type of the address
  #addr!: string // the address of the peer,maybe domain or ipv4 or ipv6
  #port!: number // port number

  /**
   * create a new peer
   * @param port the port number, must be in the range of 0 to 65535
   * @param addr the address of the peer, maybe domain or ipv4 or ipv6
   */
  constructor(port: number, addr: string) {
    this.addr = addr
    this.port = port
  }

  /**
   * create a new peer from compact peer info,4 bytes for ipv4, 2 bytes for port
   * @param compactPeerInfo
   */
  static fromCompact(compactPeerInfo: Uint8Array): Peer {
    const { port, addr } = extractCompactAddr(compactPeerInfo)
    return new Peer(port, addr)
  }

  /** Determine the supported address representation. */
  private parseAddrType(addr: string): 'ipv4' | 'domain' {
    let type: 'ipv4' | 'domain'
    if (NetUtil.isIPv4Str(addr)) {
      type = 'ipv4'
    } else if (NetUtil.isDomain(addr)) {
      type = 'domain'
    } else {
      throw new TypeError('invalid address: ' + addr)
    }

    return type
  }

  /** Set the IPv4 address or domain name. */
  set addr(addr: string) {
    if (!isAddr(addr)) throw new TypeError('invalid address: ' + addr)
    this.#addr = addr
    this.#addrType = this.parseAddrType(addr)
  }

  get addr(): string {
    return this.#addr
  }

  /** Return whether the address is an IPv4 address or domain name. */
  get addrType(): 'ipv4' | 'domain' {
    return this.#addrType
  }

  /** Set the peer port. */
  set port(port: number) {
    if (!NetUtil.isNetPort(port)) throw new RangeError(`port must be in the range of 0 to 65535, but got ${port}`)
    this.#port = port
  }

  get port(): number {
    return this.#port
  }

  /** Update the peer endpoint after validating both values. */
  update(port: number, addr: string): void {
    this.port = port
    this.addr = addr
  }

  /** Return a human-readable endpoint representation. */
  toString(): string {
    return `{port: ${this.port}, addr: ${this.addr}}`
  }

  /** Encode this IPv4 peer as the BEP-5 six-byte compact representation. */
  toCompact(): Uint8Array {
    return packageCompactAddr(this.#addr, this.port)
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/request_handler.ts`

```ts
import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { MessageHandler } from '~/src/krpc/krpc.ts'
import Sender from '~/src/krpc/sender.ts'
import TokenManager from '~/src/krpc/token_manager.ts'
import MessageFactory, { ErrorType, Message, MessageType, QueryType, TransactionId } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { BytesUtil, NetUtil } from '@deno-torrent/toolkit'

export default class RequestHandler implements MessageHandler {
  constructor(
    private readonly routingTable: RoutingTable,
    private readonly infoHashManager: InfoHashManager,
    private readonly tokenManager: TokenManager,
  ) {}

  getHandleMessageType(): MessageType {
    return MessageType.QUERY
  }

  async handle(reqMsg: Message, addr: string, port: number, sender: Sender): Promise<void> {
    const { t: tid, a: data, q: type } = reqMsg

    const reqNodeId = data?.id as Uint8Array

    if (!Id.isValidId(reqNodeId)) {
      logger.warn(`invalid node id: ${reqNodeId}, which from ${addr}:${port}]`)

      await sender.sendMessage(port, addr, MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid node id'))
      return
    }

    const reqNode = new Node(Id.fromUnit8Array(reqNodeId), port, addr)

    switch (type) {
      case QueryType.PING:
        await this.handlePingQueryRequest(reqMsg, reqNode, tid, sender)
        break
      case QueryType.FIND_NODE:
        await this.handleFindNodeQueryRequest(reqMsg, reqNode, tid, sender)
        break
      case QueryType.GET_PEERS:
        await this.handleGetPeersQueryRequest(reqMsg, reqNode, tid, sender)
        break
      case QueryType.ANNOUNCE_PEER:
        await this.handleAnnouncePeerQueryRequest(reqMsg, reqNode, tid, sender)
        break
      default:
        // Public nodes commonly probe optional BEPs such as BEP 51 sample_infohashes.
        // An unsupported extension is a routine capability mismatch, not a local failure.
        logger.debug(`unsupported query type: ${type}`)
        await sender.sendMessage(
          port,
          addr,
          MessageFactory.responseError(tid, ErrorType.METHOD_UNKNOWN, 'unknown method'),
        )
    }
  }

  // handle the ping query request from other node
  async handlePingQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-PING-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    // return local node id
    const response = MessageFactory.responsePing(tid, this.routingTable.localNode.id)

    await sender.sendMessage(reqNode.port, reqNode.addr, response)
  }

  async handleFindNodeQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-FIND_NODE-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    // find closest nodes from k-buckets by request target node id
    const targetIdBytes = reqMsg.a?.target

    if (!targetIdBytes) {
      logger.error(`[${tid}]: invalid target id: ${targetIdBytes}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, `invalid target id: ${targetIdBytes}`),
      )
      return
    }

    if (!Id.isValidId(targetIdBytes)) {
      logger.error(`[${tid}]: invalid target id: ${targetIdBytes}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, `invalid target id: ${targetIdBytes}`),
      )
      return
    }

    const targetId = Id.fromUnit8Array(targetIdBytes)

    const closestNodes = this.routingTable.findClosestNodes(targetId, 8)

    if (!closestNodes || closestNodes.length === 0) {
      // An empty routing table is a valid transient state during bootstrap. Return
      // a well-formed empty result instead of reporting a query failure.
      logger.debug(`[${tid}]: no closest nodes for target id: ${targetId}`)
    } else {
      logger.debug(`[${tid}]: find ${closestNodes.length} closest nodes for target id: ${targetId}`)
    }

    // response to request node
    await sender.sendMessage(
      reqNode.port,
      reqNode.addr,
      MessageFactory.responseFindNode(tid, this.routingTable.localNode.id, closestNodes ?? []),
    )
  }

  async handleGetPeersQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-GET_PEERS-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    const infoHash = reqMsg.a?.info_hash as Uint8Array
    if (!Id.isValidId(infoHash)) {
      logger.error(`[${tid}]: invalid info hash: ${infoHash}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid info hash'),
      )
      return
    }

    const infoHashHex = BytesUtil.bytes2HexStr(infoHash)
    const peers = this.infoHashManager.find(infoHashHex)
    const token = this.tokenManager.issue(reqNode.addr)

    let response: MessageFactory
    if (peers && peers.length > 0) {
      logger.debug(`[${tid}]: find ${peers.length} peers for info hash: ${infoHashHex}}`)
      // return peers
      response = MessageFactory.responseGetPeers(tid, this.routingTable.localNode.id, peers, undefined, token)
    } else {
      const closestNodes = this.routingTable.findClosestNodes(Id.fromUnit8Array(infoHash), 8)

      if (closestNodes && closestNodes.length > 0) {
        logger.debug(`[${tid}]: find ${closestNodes.length} nodes for info hash: ${infoHashHex}}`)
        // return closest nodes
        response = MessageFactory.responseGetPeers(tid, this.routingTable.localNode.id, undefined, closestNodes, token)
      } else {
        // Keep the issued token even when this bootstrapping node has no closer
        // contacts yet. Empty nodes is a normal negative result, not a KRPC error.
        logger.debug(`[${tid}]: no peers or closer nodes for info hash: ${infoHashHex}`)
        response = MessageFactory.responseGetPeers(tid, this.routingTable.localNode.id, undefined, [], token)
      }
    }

    // response to the request node
    await sender.sendMessage(reqNode.port, reqNode.addr, response)
  }

  async handleAnnouncePeerQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-ANNOUNCE_PEER-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    const infoHash = reqMsg.a?.info_hash as Uint8Array
    const port = reqMsg.a?.port as number // reqNode download port for bittorrent
    const token = reqMsg.a?.token // opaque token from a prior get_peers response

    if (!Id.isValidId(infoHash)) {
      logger.error(`[${tid}]: invalid info hash: ${infoHash}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid info hash'),
      )
      return
    }

    const impliedPort = reqMsg.a?.implied_port ?? 0
    if (impliedPort !== 0 && impliedPort !== 1) {
      logger.error(`[${tid}]: invalid implied_port: ${impliedPort}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid implied_port'),
      )
      return
    }

    if (impliedPort === 0 && (!NetUtil.isNetPort(port) || port === 0)) {
      logger.error(`[${tid}]: invalid port: ${port}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid port'),
      )
      return
    }

    if (!token || token.length === 0) {
      logger.error(`[${tid}]: invalid token: ${token}`)

      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid token'),
      )

      return
    }

    // 0 or 1, 1 means use the sender port, ignore the port in the request. 0 means use the port in the request as the download port
    // if the node is behind a NAT, the sender port is the public port, the download port is the private port, at this time, the implied_port should be 1
    // BEP 5 tokens authorize the requester's IP, not a globally shared info hash.
    if (!this.tokenManager.validate(token, reqNode.addr)) {
      logger.error(`[${tid}]: invalid token: ${token}`)

      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid token'),
      )
      return
    }

    const infoHashHex = BytesUtil.bytes2HexStr(infoHash)

    const downloadPort = impliedPort === 1 ? reqNode.port : port

    // store the peer
    this.infoHashManager.addValidatedPeer(infoHashHex, new Peer(downloadPort, reqNode.addr))

    // response to the request node
    await sender.sendMessage(
      reqNode.port,
      reqNode.addr,
      MessageFactory.responseAnnouncePeer(tid, this.routingTable.localNode.id),
    )
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/response_handler.ts`

```ts
import { BytesUtil } from '@deno-torrent/toolkit'
import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { MessageHandler } from '~/src/krpc/krpc.ts'
import Sender from '~/src/krpc/sender.ts'
import TransactionManager, { Request } from '~/src/krpc/transaction_manager.ts'
import { Message, MessageType, QueryType } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { COMPAT_ADDR_V4_LEN, COMPAT_NODE_LEN } from '~/src/util/net.ts'

export default class ResponseHandler implements MessageHandler {
  constructor(
    private readonly routingTable: RoutingTable,
    private readonly infoHashManager: InfoHashManager,
    private readonly transactionManager: TransactionManager<Request>,
    private readonly addNode: (node: Node) => Promise<boolean> = (node) => Promise.resolve(routingTable.add(node)),
  ) {}

  // tell the dispatcher this handler only handles response messages
  getHandleMessageType(): MessageType {
    return MessageType.RESPONSE
  }

  async handle(response: Message, addr: string, port: number, sender: Sender): Promise<void> {
    const { t: tid, r: data, q: type } = response

    // Binary/expired transaction IDs commonly arrive after the bounded request
    // timed out. They are safely ignored and are not a remote protocol fault.
    if (typeof tid !== 'string') {
      logger.debug(`received a response with an unknown binary transaction id from ${addr}:${port}`)
      return
    }

    // check tid is valid
    if (!this.transactionManager.isValid(tid)) {
      logger.debug(`[${tid}] received an expired or unknown tid, drop the message from ${addr}:${port}`)
      return
    }

    // get the request message from transaction; if not found, drop — the message was not requested by this node
    const request = this.transactionManager.getData(tid)
    if (!request) {
      logger.warn(
        `[${tid}] received an unsolicited response, drop the message from ${addr}:${port}`,
      )
      return
    }

    if (request.addr !== addr || request.port !== port) {
      logger.warn(
        `[${tid}] response source ${addr}:${port} does not match request target ${request.addr}:${request.port}`,
      )
      return
    }

    // check response node id
    const responseNodeId = data?.id
    if (!(responseNodeId instanceof Uint8Array) || !Id.isValidId(responseNodeId)) {
      logger.warn(`[${tid}] response has no valid node id, drop the message from ${addr}:${port}`)
      return
    }

    // finish the transaction only after the response source and base shape are verified
    this.transactionManager.finish(tid)
    request.onResult?.(true)

    const respNode = new Node(Id.fromUnit8Array(responseNodeId), port, addr)

    // dispatch by the original query type
    switch (request.type) {
      case QueryType.PING: {
        await this.handlePingResponse(respNode, tid)
        break
      }
      case QueryType.FIND_NODE: {
        await this.handleFindNodeResponse(response, respNode, tid)
        break
      }
      case QueryType.GET_PEERS: {
        await this.handleGetPeersResponse(request, response, respNode, tid, sender)
        break
      }
      case QueryType.ANNOUNCE_PEER: {
        await this.handleAnnouncePeerResponse(respNode, tid)
        break
      }
      default:
        logger.error(`unknown query type: ${type}`)
    }
  }

  private async handlePingResponse(respNode: Node, tid: string) {
    logger.debug(`[<======RESPONSE-PING-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // add the node into the routing table
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private async handleFindNodeResponse(response: Message, respNode: Node, tid: string) {
    logger.debug(`[<======RESPONSE-FIND_NODE-${tid}] received from ${respNode.addr}:${respNode.port}`)

    const nodesBytes = response.r?.nodes

    // must have nodes
    if (!nodesBytes) {
      logger.error(`[${tid}] invalid nodes bytes: ${nodesBytes}`)
      return
    }

    // check nodes bytes length
    if (nodesBytes.length % COMPAT_NODE_LEN != 0) {
      logger.error(
        `[${tid}] invalid nodes bytes: ${nodesBytes}, because the length is not a multiple of ${COMPAT_NODE_LEN}`,
      )
      return
    }

    // chunk the nodes bytes to node bytes list
    const nodesBytesList: Uint8Array[] = BytesUtil.chunkBytes(nodesBytes, COMPAT_NODE_LEN)

    for (const nodeBytes of nodesBytesList) {
      const node = Node.fromCompact(nodeBytes)
      if (!await this.addNode(node) && !this.routingTable.findNode(node.id)) {
        logger.error(`[${tid}] insert node ${node} to routing table failed`)
      }
    }

    // update the response node
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private async handleGetPeersResponse(
    request: Request,
    response: Message,
    respNode: Node,
    tid: string,
    sender: Sender,
  ) {
    logger.debug(`[<======RESPONSE-GET_PEERS-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // get infoHash from request message
    const infoHash = request.infoHash

    // check info hash length
    if (!infoHash) {
      logger.error(`[${tid}] cached info hash is not exist`)
      return
    }

    // token is provided by the responder in r.token
    const token = response.r?.token

    // there are two types of response: nodes or values
    // nodes means the response node doesn't have peers for this info hash, so it returns closer nodes
    const nodesBytes = response.r?.nodes
    // values means the response node has peers; values is a list of compact peer addresses
    const peersBytesList = response.r?.values

    // check peerBytes
    if (peersBytesList && peersBytesList.some((bytes) => bytes.length !== COMPAT_ADDR_V4_LEN)) {
      logger.error(`[${tid}] invalid peer bytes: ${peersBytesList}`)
      return
    }

    const peers: Peer[] = []
    const nodes: Node[] = []

    if (peersBytesList) {
      for (const bytes of peersBytesList) {
        try {
          const peer = Peer.fromCompact(bytes)
          peers.push(peer)
        } catch {
          logger.error(`[${tid}] invalid peer bytes: ${bytes}`)
        }
      }

      logger.debug(
        `[${tid}] received ${peersBytesList.length} peers for info hash: ${
          BytesUtil.bytes2HexStr(
            infoHash,
          )
        },peers is ${peers}`,
      )

      // store the peers associated with the token and info hash
      if (peers.length > 0) this.infoHashManager.addList(BytesUtil.bytes2HexStr(infoHash), peers, token)
    } else if (nodesBytes) {
      if (nodesBytes.length % COMPAT_NODE_LEN !== 0) {
        logger.error(`[${tid}] invalid compact nodes length: ${nodesBytes.length}`)
        return
      }
      logger.debug(
        `[${tid}] received ${nodesBytes.length / COMPAT_NODE_LEN} nodes for info hash: ${
          BytesUtil.bytes2HexStr(
            infoHash,
          )
        }`,
      )

      const nodesBytesList: Uint8Array[] = BytesUtil.chunkBytes(nodesBytes, COMPAT_NODE_LEN)

      for (const nodeBytes of nodesBytesList) {
        const node = Node.fromCompact(nodeBytes)
        nodes.push(node)
        if (!request.onGetPeersResult) {
          // Preserve the original fire-and-follow behavior for the low-level API.
          await sender.sendGetPeersRequest(node, infoHash)
        }
      }
    } else {
      logger.error(`[${tid}] invalid response: ${JSON.stringify(response)}`)
      return
    }

    // update the response node
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }

    request.onGetPeersResult?.({
      node: respNode,
      peers,
      nodes,
      ...(token ? { token: token.slice() } : {}),
    })
  }

  private async handleAnnouncePeerResponse(respNode: Node, tid: string) {
    logger.debug(`[<======RESPONSE-ANNOUNCE_PEER-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // update the response node
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/routing_table.ts`

```ts
import { BitArray } from '@deno-torrent/toolkit'
import Bucket from '~/src/bucket.ts'
import Id from '~/src/id.ts'
import LocalNode from '~/src/local_node.ts'
import Node from '~/src/node.ts'
import logger from '~/src/util/log.ts'

/**
 * Kademlia 路由表
 *
 * 维护 160 个 K-桶（K-Bucket），每个桶覆盖 ID 空间的一个子范围。
 * 每个 DHT 实例持有独立的路由表，避免不同节点之间共享状态。
 */
export default class RoutingTable {
  /** 每个 K-桶的最大节点容量 */
  static BUCKET_CAPACITY = 8
  #localNode: LocalNode
  #buckets: Bucket[] = []

  /** Create an isolated routing table for one local DHT node. */
  constructor(localNode: LocalNode) {
    this.#localNode = localNode
    this.initBuckets()
  }

  /** 本地节点 */
  get localNode(): LocalNode {
    return this.#localNode
  }

  /** 所有 K-桶 */
  get buckets(): Bucket[] {
    return this.#buckets
  }

  /** 路由表中所有节点的总数 */
  get nodeCount(): number {
    let count = 0
    for (const bucket of this.#buckets) {
      count += bucket.size
    }
    return count
  }

  /**
   * 初始化 K-桶列表
   *
   * 采用二叉树递归划分 ID 空间，生成与本地节点 ID 对应的 160 个桶。
   * 局部节点所在的半空间被进一步细分，远端半空间保留一个桶。
   */
  initBuckets(): void {
    this.#buckets.push(
      ...this.generateBuckets(BitArray.fromBinaryString('0'.repeat(160)), BitArray.fromBinaryString('1'.repeat(160))),
    )
    logger.info(`init ${this.#buckets.length} buckets`)
  }

  /**
   * 递归生成 K-桶列表
   *
   * 将 [start, end] 区间对半分：
   * - 若本地节点落在左半，则右半形成一个桶，左半继续递归
   * - 若本地节点落在右半，则左半形成一个桶，右半继续递归
   *
   * @param start 区间下界
   * @param end   区间上界
   * @returns 生成的 K-桶列表
   */
  generateBuckets(start: BitArray, end: BitArray): Bucket[] {
    const leftStart = start
    const leftEnd = BitArray.fromBigInt((start.toBigInt() + end.toBigInt() - 1n) / 2n, 160)
    const rightStart = BitArray.fromBigInt(leftEnd.toBigInt() + 1n, 160)
    const rightEnd = end

    // 区间收缩至只剩本地节点，停止递归
    if (start.equals(end) && start.equals(this.#localNode.id.bits)) {
      return []
    }

    const leftBucket = new Bucket(RoutingTable.BUCKET_CAPACITY, leftStart, leftEnd)
    const rightBucket = new Bucket(RoutingTable.BUCKET_CAPACITY, rightStart, rightEnd)

    if (leftBucket.withinRange(this.#localNode.id)) {
      return [rightBucket, ...this.generateBuckets(leftStart, leftEnd)]
    } else if (rightBucket.withinRange(this.#localNode.id)) {
      return [leftBucket, ...this.generateBuckets(rightStart, rightEnd)]
    } else {
      throw new Error('local node is not in the range of the buckets')
    }
  }

  /**
   * 将节点加入路由表
   *
   * @param node 要加入的节点
   * @returns 加入成功返回 `true`，否则返回 `false`（桶满且无法替换，或 ID 不在任何桶范围内）
   */
  add(node: Node): boolean {
    for (const bucket of this.#buckets) {
      if (bucket.withinRange(node.id)) {
        return bucket.add(node)
      }
    }
    return false
  }

  /** Return the least-recently-seen node that must be probed before inserting a new node. */
  replacementCandidate(node: Node): Node | undefined {
    for (const bucket of this.#buckets) {
      if (!bucket.withinRange(node.id)) continue
      if (bucket.nodes.some((current) => current.id.equals(node.id))) return undefined
      return bucket.isFull() ? bucket.oldest : undefined
    }
    return undefined
  }

  /** Replace a previously selected stale node if it is still present in the same bucket. */
  replace(staleNode: Node, replacement: Node): boolean {
    for (const bucket of this.#buckets) {
      if (bucket.withinRange(replacement.id)) return bucket.replace(staleNode, replacement)
    }
    return false
  }

  /**
   * 批量将节点加入路由表
   *
   * @param nodes 节点列表
   */
  addNodes(nodes: Node[]): void {
    for (const node of nodes) {
      this.add(node)
    }
  }

  /**
   * 从路由表移除节点
   *
   * @param node 要移除的节点
   */
  remove(node: Node): void {
    for (const bucket of this.#buckets) {
      if (bucket.withinRange(node.id)) {
        bucket.remove(node)
        break
      }
    }
  }

  /**
   * 按节点 ID 移除节点
   *
   * @param nodeId 要移除的节点 ID
   */
  removeByNodeId(nodeId: Id): void {
    for (const node of this.getAllNodes()) {
      if (node.id.equals(nodeId)) {
        this.remove(node)
        break
      }
    }
  }

  /**
   * 按 IP 地址移除所有匹配节点
   *
   * @param ip IP 地址字符串
   */
  removeByIp(ip: string): void {
    for (const node of this.getAllNodes()) {
      if (node.addr === ip) {
        this.remove(node)
      }
    }
  }

  /**
   * 批量移除节点
   *
   * @param nodes 要移除的节点列表
   */
  removeNodes(nodes: Node[]): void {
    for (const node of nodes) {
      this.remove(node)
    }
  }

  /**
   * 移除距指定节点最近的所有节点
   *
   * @param targetNode 目标节点
   */
  removeClosestNode(targetNode: Node): void {
    const closestNodes = this.findClosestNodes(targetNode.id)
    if (closestNodes.length > 0) {
      this.removeNodes(closestNodes)
    }
  }

  /**
   * 随机返回路由表中的一个节点（取第一个非空桶的队头节点）
   *
   * @returns 节点，若路由表为空则返回 `undefined`
   */
  getRandomNode(): Node | undefined {
    for (const bucket of this.#buckets) {
      if (!bucket.isEmpty()) return bucket.latest
    }
    return undefined
  }

  /**
   * 获取路由表中所有节点
   *
   * @returns 节点列表
   */
  getAllNodes(): Node[] {
    const nodes: Node[] = []
    for (const bucket of this.#buckets) {
      if (!bucket.isEmpty()) {
        nodes.push(...bucket.nodes)
      }
    }
    return nodes
  }

  /**
   * 按 XOR 距离找到距目标 ID 最近的前 N 个节点
   *
   * @param targetNodeId 目标节点 ID
   * @param count        返回数量，默认 8
   * @returns 按距离从近到远排序的节点列表
   */
  findClosestNodes(targetNodeId: Id, count = 8): Node[] {
    logger.debug(`[findClosestNodes] total node count is ${this.nodeCount}`)

    const nodes = this.getAllNodes().sort((a, b) =>
      a.id.bits.xor(targetNodeId.bits).lessThan(b.id.bits.xor(targetNodeId.bits)) ? -1 : 1
    )

    return nodes.slice(0, Math.min(this.nodeCount, count))
  }

  /**
   * 更新路由表中已存在节点的连接信息
   *
   * @param newNode 包含最新连接信息的节点对象
   */
  updateNode(newNode: Node): void {
    const old = this.findNode(newNode.id)
    if (old) {
      old.update(newNode.port, newNode.addr)
    }
  }

  /**
   * 在路由表中查找指定 ID 的节点
   *
   * @param nodeId 节点 ID
   * @returns 找到则返回节点对象，否则返回 `undefined`
   */
  findNode(nodeId: Id): Node | undefined {
    for (const bucket of this.#buckets) {
      if (bucket.isEmpty()) continue
      for (const node of bucket.nodes) {
        if (node.id.equals(nodeId)) {
          return node
        }
      }
    }
    return undefined
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/sender.ts`

```ts
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import MessageFactory from '~/src/message_factory.ts'

export default interface Sender {
  sendMessage(port: number, addr: string, message: MessageFactory): Promise<void>
  sendPingRequest(targetNode: Node): Promise<void>
  sendFindNodeRequest(port: number, addr: string, targetId: Id): Promise<void>
  sendGetPeersRequest(targetNode: Node, infoHash: Uint8Array): Promise<void>
  sendAnnouncePeerRequest(targetNode: Node, infoHash: Uint8Array, token: Uint8Array, peerPort?: number): Promise<void>
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/token_manager.ts`

```ts
import { sha1 } from '~/src/util/hash.ts'

const DEFAULT_ROTATION_INTERVAL_MS = 5 * 60 * 1000
const SECRET_LENGTH = 32
const textEncoder = new TextEncoder()

type TokenManagerOptions = {
  rotationIntervalMs?: number
  now?: () => number
  secretFactory?: () => Uint8Array
}

/** Issues short-lived BEP 5 announce tokens bound to the requester's IP address. */
export default class TokenManager {
  #currentSecret: Uint8Array
  #previousSecret?: Uint8Array
  #rotatedAt: number
  readonly #rotationIntervalMs: number
  readonly #now: () => number
  readonly #secretFactory: () => Uint8Array

  constructor(options: TokenManagerOptions = {}) {
    this.#rotationIntervalMs = options.rotationIntervalMs ?? DEFAULT_ROTATION_INTERVAL_MS
    if (!Number.isFinite(this.#rotationIntervalMs) || this.#rotationIntervalMs <= 0) {
      throw new RangeError('rotationIntervalMs must be greater than zero')
    }

    this.#now = options.now ?? Date.now
    this.#secretFactory = options.secretFactory ?? (() => crypto.getRandomValues(new Uint8Array(SECRET_LENGTH)))
    this.#currentSecret = this.#newSecret()
    this.#rotatedAt = this.#now()
  }

  /** Issue a token that can only be used by the supplied IP address. */
  issue(address: string): Uint8Array {
    this.#rotateIfNeeded()
    return this.#tokenFor(address, this.#currentSecret)
  }

  /** Validate a token against the current or immediately previous secret. */
  validate(token: Uint8Array, address: string): boolean {
    this.#rotateIfNeeded()
    if (constantTimeEqual(token, this.#tokenFor(address, this.#currentSecret))) return true
    return this.#previousSecret !== undefined &&
      constantTimeEqual(token, this.#tokenFor(address, this.#previousSecret))
  }

  #newSecret(): Uint8Array {
    const secret = this.#secretFactory()
    if (secret.length < 16) throw new RangeError('token secrets must contain at least 16 bytes')
    return new Uint8Array(secret)
  }

  #rotateIfNeeded(): void {
    const now = this.#now()
    const elapsed = now - this.#rotatedAt
    if (elapsed < this.#rotationIntervalMs) return

    this.#previousSecret = elapsed < this.#rotationIntervalMs * 2 ? this.#currentSecret : undefined
    this.#currentSecret = this.#newSecret()
    this.#rotatedAt = now
  }

  #tokenFor(address: string, secret: Uint8Array): Uint8Array {
    const addressBytes = textEncoder.encode(address)
    const input = new Uint8Array(secret.length + addressBytes.length)
    input.set(secret)
    input.set(addressBytes, secret.length)
    return sha1(input)
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }

  return difference === 0
}

```

---

## Arquivo: `docs/deno-torrent/torrent-dht/transaction_manager.ts`

```ts
import { QueryType } from '~/src/message_factory.ts'
import logger from '~/src/util/log.ts'
import type Node from '~/src/node.ts'
import type Peer from '~/src/peer.ts'

/** Parsed result of one BEP-5 get_peers exchange. */
export type GetPeersQueryResult = {
  node: Node
  peers: Peer[]
  nodes: Node[]
  /** Optional because some useful public nodes omit the BEP-5 announce token. */
  token?: Uint8Array
}

export type Request = {
  type: QueryType
  addr: string
  port: number
  infoHash?: Uint8Array // only for get_peers query and announce_peer query
  /** Internal completion hook used by bounded liveness probes. */
  onResult?: (reachable: boolean) => void
  /** Internal completion hook used by the high-level iterative lookup API. */
  onGetPeersResult?: (result: GetPeersQueryResult) => void
}

/**
 * TransactionManager
 * @description handle krpc transaction
 */
export default class TransactionManager<T> {
  #EXPIRED_TIME = 1000 * 60 // UDP 请求超过 1 分钟后视为失效
  #CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  #ID_COUNT_MAX = this.#CHARS.length * this.#CHARS.length // 最大并发事务数 62×62 = 3844（修复：原用 ^ 位异或）
  #ID_COUNT_HALF = Math.floor(this.#ID_COUNT_MAX / 2) // 超过一半时触发过期清理
  #tidPool!: Set<string> // tid pool
  #expiredTime: number // expired time of a tid
  #transactions = new Map<
    string, // tid
    {
      expiredAt: number // expired time of the tid
      data?: T // attached data
    }
  >()

  /**
   * create a transaction manager
   * @param expiredTime the expired time of a transaction
   */
  constructor(expiredTime?: number) {
    this.#expiredTime = expiredTime || this.#EXPIRED_TIME
    this.initIdPool()
  }

  /** Number of currently active transactions. */
  get size(): number {
    return this.#transactions.size
  }

  /**
   * create a new transaction
   * @returns tid of the transaction
   */
  create(data?: T) {
    const tid = this.borrowTid()
    const expiredAt = Date.now() + this.#expiredTime
    this.#transactions.set(tid, {
      expiredAt,
      data,
    })
    return tid
  }

  /**
   * get data from a transaction
   * @param tid
   * @returns
   */
  getData(tid: string): T | undefined {
    if (!this.isValid(tid)) {
      logger.warn(`tid ${tid} is not valid, can not get data`)
      return
    }

    return this.#transactions.get(tid)?.data
  }

  /**
   * finish a transaction
   * @param tid
   */
  finish(tid: string) {
    if (!this.isValid(tid)) {
      logger.warn(`tid ${tid} is not valid, can not finish`)
      return
    }

    // delete transaction, and return tid to pool
    this.putbackTid(tid)
  }

  private initIdPool() {
    const collection = new Set<string>()
    for (let i = 0; i < this.#CHARS.length; i++) {
      for (let j = 0; j < this.#CHARS.length; j++) {
        const tid = this.#CHARS[i] + this.#CHARS[j]
        collection.add(tid)
      }
    }

    // shuffle the tid in pool
    const array = [...collection]
    for (let i = 0; i < array.length; i++) {
      const j = Math.floor(Math.random() * array.length)
      const temp = array[i]
      array[i] = array[j]
      array[j] = temp
    }

    this.#tidPool = new Set<string>(array)
  }

  private borrowTid(): string {
    // if borrowed tid count is more than half of max tid count, clear expired tid
    // note: only expired tid will be returned to pool
    if (this.#transactions.size > this.#ID_COUNT_HALF) {
      this.clearExpiredTid()
    }

    const result = this.#tidPool.values().next()
    if (result.done) {
      // Never reuse a live transaction ID: a delayed response could otherwise
      // be matched to an unrelated newer request.
      this.clearExpiredTid()
      const retry = this.#tidPool.values().next()
      if (retry.done) throw new RangeError(`maximum concurrent transaction count reached: ${this.#ID_COUNT_MAX}`)
      this.#tidPool.delete(retry.value)
      return retry.value
    }
    const tid = result.value
    this.#tidPool.delete(tid)
    return tid
  }

  /**
   * put back a borrowed tid to pool
   * note that only borrowed tid can be put backed to pool
   * @param tid
   * @returns
   */
  private putbackTid(tid: string) {
    if (!this.#transactions.has(tid)) {
      logger.warn(`tid ${tid} is not borrowed, can not return`)
      return
    }
    this.#transactions.delete(tid)
    this.#tidPool.add(tid)
  }

  /**
   * clear expired tid in borrowed
   */
  private clearExpiredTid() {
    const expiredTids = [...this.#transactions.entries()].filter(([tid, _]) => this.isExpiredTid(tid))
    for (const [tid, _] of expiredTids) {
      this.putbackTid(tid)
    }
  }

  /**
   * check if a tid is expired
   * @param tid
   * @returns
   */
  private isExpiredTid(tid: string): boolean {
    // if is not a borrowed tid, return false
    if (!this.#transactions.has(tid)) return false
    return this.#transactions.get(tid)?.expiredAt! < Date.now()
  }

  /**
   * check if a transaction is valid
   * @param tid
   * @returns true if the tid is valid
   */
  isValid(tid: string): boolean {
    if (!this.#transactions.has(tid)) return false
    if (!this.isExpiredTid(tid)) return true

    this.putbackTid(tid)
    return false
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-generator/generator.ts`

````ts
/**
 * Core torrent generation logic.
 *
 * Exposes a single async function {@link generateTorrent} that reads files,
 * computes SHA-1 piece hashes, and writes a complete `.torrent` file in
 * Bencode format.
 *
 * @module
 */

import { basename, relative, SEPARATOR } from "@std/path"
import { encode } from "@deno-torrent/bencode"
import type { BencodeValue } from "@deno-torrent/bencode"
import { PieceSizeEnum } from "./types.ts"
import type { GeneratorOption } from "./types.ts"
import { buildPieceFiles, calcPieceSize, fileSizeSum, getDefaultCreatedBy, obtainFiles, sha1sum } from "./util.ts"

/**
 * Generates a BitTorrent `.torrent` file and writes it to `options.writer`.
 *
 * Supports both *single-file* (when `entry` points to a regular file) and
 * *multi-file* (when `entry` points to a directory) torrents.
 *
 * File ordering is stable: paths with fewer directory components appear first;
 * within the same depth files are sorted lexicographically.
 *
 * @param options - Generation parameters; see {@link GeneratorOption}.
 *
 * @example Single-file torrent
 * ```ts
 * import { generateTorrent } from "@deno-torrent/torrent-generator"
 *
 * const out = await Deno.open("video.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/media/video.mkv",
 *   writer: out,
 *   trackers: [new URL("udp://tracker.openbittracker.com:6969/announce")],
 * })
 * out.close()
 * ```
 *
 * @example Multi-file torrent with all options
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "@deno-torrent/torrent-generator"
 *
 * const out = await Deno.open("album.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/media/my-album",
 *   writer: out,
 *   pieceSizeEnum: PieceSizeEnum.SIZE_512MB,
 *   ignoreHiddenFile: true,
 *   isPrivate: true,
 *   trackers: [
 *     new URL("udp://tracker1.example.com:6969"),
 *     new URL("udp://tracker2.example.com:6969"),
 *   ],
 *   webSeeds: [new URL("https://mirror.example.com/my-album/")],
 *   source: "https://example.com/releases/my-album",
 *   comment: "My favourite album",
 *   createdBy: "my-app@1.0.0",
 * })
 * out.close()
 * ```
 *
 * @throws {Deno.errors.NotFound} If `entry` does not exist on the filesystem.
 * @throws {Error} If `trackers` is empty (no announce URL can be set).
 */
export async function generateTorrent({
  writer,
  entry,
  pieceSizeEnum = PieceSizeEnum.SIZE_AUTO,
  ignoreHiddenFile = false,
  alignPiece = false,
  isPrivate = false,
  trackers = [],
  webSeeds = [],
  source,
  comment,
  createdBy,
  createdAt = Math.floor(Date.now() / 1000),
}: GeneratorOption): Promise<void> {
  const entryStat = await Deno.stat(entry)

  // Collect and sort files by path depth (shallowest first), then lexically
  let files = await obtainFiles(entry, ignoreHiddenFile)
  files = files.sort((a, b) => {
    const depthDiff = a.split(SEPARATOR).length - b.split(SEPARATOR).length
    return depthDiff !== 0 ? depthDiff : a.localeCompare(b)
  })

  if (files.length === 0) {
    throw new Error(`No files found under entry: ${entry}`)
  }

  const singleFileMode = entryStat.isFile
  const totalSize = await fileSizeSum(files)
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum)

  const info = new Map<string, BencodeValue>([
    ["name", basename(entry)],
    ["piece length", pieceSize],
  ])
  const torrent = new Map<string, BencodeValue>([
    ["created by", createdBy ?? (await getDefaultCreatedBy())],
    ["creation date", createdAt],
    ["info", info],
  ])

  // ── Trackers ─────────────────────────────────────────────────────────────
  if (trackers.length > 0) {
    // Sort for deterministic output
    trackers = [...trackers].sort((a, b) => a.href.localeCompare(b.href))
    torrent.set("announce", trackers[0].href)
    if (trackers.length > 1) {
      // announce-list: each tracker in its own tier (BEP-12)
      torrent.set("announce-list", trackers.map((t) => [t.href]))
    }
  }

  // ── Web seeds (BEP-19) ────────────────────────────────────────────────────
  if (webSeeds && webSeeds.length > 0) {
    webSeeds = [...webSeeds].sort((a, b) => a.href.localeCompare(b.href))
    torrent.set("url-list", webSeeds.length === 1 ? webSeeds[0].href : webSeeds.map((w) => w.href))
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  if (isPrivate) info.set("private", 1)
  if (comment) torrent.set("comment", comment)
  if (source) torrent.set("source", source)

  // ── Piece hashes & file metadata ──────────────────────────────────────────
  if (singleFileMode) {
    const { size } = await Deno.stat(files[0])
    info.set("length", size)
    info.set("pieces", await sha1sum(files, pieceSize))
  } else {
    const pieceFiles = alignPiece
      ? await buildPieceFiles(files, pieceSize)
      : files.map((file) => ({ file, length: 0, padding: false }))
    const torrentFiles = await Promise.all(pieceFiles.map(async (pieceFile, index) => ({
      length: pieceFile.padding ? pieceFile.length : (await Deno.stat(pieceFile.file!)).size,
      path: pieceFile.padding
        ? [".pad", `${pieceFile.length}-${index}`]
        : relative(entry, pieceFile.file!).split(SEPARATOR),
    })))
    info.set(
      "files",
      torrentFiles.map(({ length, path }) =>
        new Map<string, BencodeValue>([
          ["length", length],
          ["path", path],
        ])
      ),
    )
    info.set("pieces", await sha1sum(files, pieceSize, alignPiece))
  }

  // ── Encode and write ──────────────────────────────────────────────────────
  await writer.write(encode(torrent))
}

````

---

## Arquivo: `docs/deno-torrent/torrent-generator/log.ts`

```ts
/**
 * Optional debug-logging utilities.
 *
 * Debug output is **disabled by default** and has zero performance impact
 * unless explicitly enabled via {@link enableDebug}.
 *
 * @module
 */

let DEBUG_ENABLED = false

/** Enable debug log output to stdout. */
export function enableDebug(): void {
  DEBUG_ENABLED = true
}

/** Disable debug log output (default state). */
export function disableDebug(): void {
  DEBUG_ENABLED = false
}

/**
 * Emit a timestamped debug message to stdout.
 *
 * Does nothing when debug mode is disabled.
 *
 * @param message - Primary message string.
 * @param params - Additional values forwarded to `console.log`.
 */
export function logd(message?: unknown, ...params: unknown[]): void {
  if (!DEBUG_ENABLED) return

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  // Cyan timestamp
  console.log(`[\x1b[36m${ts}\x1b[0m] ${message}`, ...params)
}

```

---

## Arquivo: `docs/deno-torrent/torrent-generator/mod.ts`

````ts
/**
 * @module
 * @description
 * **torrent-generator** — a lightweight Deno library for generating
 * BitTorrent `.torrent` files from files and directories.
 *
 * ## Quick start
 *
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "@deno-torrent/torrent-generator"
 *
 * const out = await Deno.open("output.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "./my-folder",
 *   writer: out,
 *   trackers: [new URL("udp://tracker.example.com:6969/announce")],
 * })
 * out.close()
 * ```
 */

export { generateTorrent } from "./src/generator.ts"
export { PieceSizeEnum } from "./src/types.ts"
export type { GeneratorOption, Torrent, Writer } from "./src/types.ts"
export { disableDebug, enableDebug } from "./src/log.ts"

````

---

## Arquivo: `docs/deno-torrent/torrent-generator/reader.ts`

````ts
/**
 * A sequential multi-file reader that treats multiple files as a single
 * continuous byte stream, reading fixed-size chunks across file boundaries.
 *
 * @module
 */

/**
 * Reads across multiple files sequentially as if they were one contiguous stream.
 * Implements {@link Disposable} for use with `using` declarations (Deno ≥ 1.38).
 *
 * @example
 * ```ts
 * const reader = new MultiFileReader(["/a/file1.bin", "/a/file2.bin"]);
 * try {
 *   let chunk: Uint8Array | null;
 *   while ((chunk = await reader.readChunk(512 * 1024)) !== null) {
 *     // process chunk ...
 *   }
 * } finally {
 *   reader.close();
 * }
 * ```
 */
export class MultiFileReader implements Disposable {
  readonly #files: string[]
  #fileIndex = 0
  #currentFile: Deno.FsFile | null = null

  /**
   * Creates a new MultiFileReader.
   * @param files - Ordered list of absolute file paths to read sequentially.
   */
  constructor(files: string[]) {
    this.#files = [...files]
  }

  /**
   * Reads up to `size` bytes from the combined stream.
   *
   * Transparently crosses file boundaries.  Returns `null` when all files
   * have been exhausted.
   *
   * @param size - Maximum number of bytes to read (must be > 0).
   * @returns A `Uint8Array` with 1–`size` bytes, or `null` at end-of-stream.
   * @throws {RangeError} If `size` is not a positive integer.
   */
  async readChunk(size: number): Promise<Uint8Array | null> {
    if (size <= 0 || !Number.isInteger(size)) {
      throw new RangeError(`size must be a positive integer, got ${size}`)
    }

    const parts: Uint8Array[] = []
    let remaining = size

    while (remaining > 0) {
      // Open the next file if we have no current handle
      if (this.#currentFile === null) {
        if (this.#fileIndex >= this.#files.length) break
        this.#currentFile = await Deno.open(this.#files[this.#fileIndex++])
      }

      const buf = new Uint8Array(remaining)
      const n = await this.#currentFile.read(buf)

      if (n === null) {
        // Current file exhausted – close and move to the next
        this.#currentFile.close()
        this.#currentFile = null
        continue
      }

      parts.push(buf.subarray(0, n))
      remaining -= n
    }

    if (parts.length === 0) return null

    // Fast path: single chunk, no copy needed
    if (parts.length === 1) return parts[0]

    const result = new Uint8Array(size - remaining)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }
    return result
  }

  /** Closes the currently open file handle, if any. */
  close(): void {
    if (this.#currentFile !== null) {
      this.#currentFile.close()
      this.#currentFile = null
    }
  }

  /** Alias for {@link close} – called automatically by `using` declarations. */
  [Symbol.dispose](): void {
    this.close()
  }
}

````

---

## Arquivo: `docs/deno-torrent/torrent-generator/types.ts`

````ts
/**
 * Type definitions and enumerations for the torrent generator.
 * @module
 */

/**
 * A minimal write interface compatible with {@link Deno.FsFile} and any
 * object that can accept raw bytes.
 *
 * Use `Deno.openSync` / `Deno.open` to obtain a compatible writer backed by
 * a real file, or create an in-memory buffer for testing.
 */
export interface Writer {
  /** Write all bytes in `p` and return the number of bytes written. */
  write(p: Uint8Array): Promise<number>
}

/**
 * Piece-size presets for torrent generation.
 *
 * The values represent the actual byte size of each piece.
 * `SIZE_AUTO` instructs the generator to select an appropriate size
 * automatically based on the total size of the input files.
 *
 * Standard BitTorrent clients use piece sizes ranging from 16 MB to 16 GB
 * for large content; `SIZE_AUTO` follows the same heuristic.
 *
 * @example
 * ```ts
 * import { PieceSizeEnum } from "@deno-torrent/torrent-generator"
 * console.log(PieceSizeEnum.SIZE_AUTO)   // 0
 * console.log(PieceSizeEnum.SIZE_16MB)   // 16777216
 * ```
 */
export enum PieceSizeEnum {
  /** Automatically select the best piece size based on total file size. */
  SIZE_AUTO = 0,
  SIZE_16MB = 16 * 1024 * 1024,
  SIZE_32MB = 32 * 1024 * 1024,
  SIZE_64MB = 64 * 1024 * 1024,
  SIZE_128MB = 128 * 1024 * 1024,
  SIZE_256MB = 256 * 1024 * 1024,
  SIZE_512MB = 512 * 1024 * 1024,
  SIZE_1GB = 1024 * 1024 * 1024,
  SIZE_2GB = 2 * 1024 * 1024 * 1024,
  SIZE_4GB = 4 * 1024 * 1024 * 1024,
  SIZE_8GB = 8 * 1024 * 1024 * 1024,
  SIZE_16GB = 16 * 1024 * 1024 * 1024,
}

/**
 * Options for {@link generateTorrent}.
 *
 * @example
 * ```ts
 * import { generateTorrent, PieceSizeEnum } from "@deno-torrent/torrent-generator"
 *
 * const file = await Deno.open("output.torrent", { write: true, create: true, truncate: true })
 * await generateTorrent({
 *   entry: "/path/to/content",
 *   writer: file,
 *   trackers: [new URL("udp://tracker.example.com:6969")],
 * })
 * file.close()
 * ```
 */
export type GeneratorOption = {
  /**
   * Destination writer that receives the raw bencoded torrent bytes.
   * Compatible with any {@link Deno.FsFile} or in-memory buffer.
   */
  writer: Writer

  /**
   * Absolute path to the file or directory to include in the torrent.
   * For a single file this produces a *single-file* torrent; for a directory
   * a *multi-file* torrent is produced.
   */
  entry: string

  /**
   * Piece size preset.  Defaults to {@link PieceSizeEnum.SIZE_AUTO}, which
   * selects the smallest preset larger than the total content size (capped at
   * {@link PieceSizeEnum.SIZE_512MB}).
   */
  pieceSizeEnum?: PieceSizeEnum

  /**
   * When `true`, files and directories whose names begin with `.` are
   * excluded from the torrent.  Defaults to `false`.
   */
  ignoreHiddenFile?: boolean

  /**
   * When `true`, inserts BEP-47 padding files between non-empty files so each
   * real file starts on a piece boundary. Padding files are logical torrent
   * entries filled with zero bytes and are not created on disk. Defaults to
   * `false` to preserve the standard continuous multi-file layout.
   */
  alignPiece?: boolean

  /**
   * When `true`, sets the `info.private` flag to `1` in the torrent, which
   * prevents DHT and PEX from being used by compatible clients.
   * Defaults to `false`.
   */
  isPrivate?: boolean

  /**
   * One or more tracker announce URLs.
   * The first (after sorting) becomes the `announce` field; when more than
   * one tracker is given, an `announce-list` field is also written.
   */
  trackers: readonly URL[]

  /**
   * Optional list of HTTP/FTP web-seed URLs (BEP-19 / GetRight style).
   * A single URL is stored as a string; multiple URLs as a string array.
   */
  webSeeds?: readonly URL[]

  /**
   * Optional free-form source string (e.g. the URL of the page where the
   * torrent was first announced).
   */
  source?: string

  /** Optional human-readable comment embedded in the torrent metadata. */
  comment?: string

  /**
   * Name of the program that created the torrent.
   * Defaults to `deno-torrent-generator@<version>`.
   */
  createdBy?: string

  /**
   * Unix timestamp (seconds) for the `creation date` field.
   * Defaults to the current time at the moment `generateTorrent` is called.
   */
  createdAt?: number
}

/**
 * Internal representation of a `.torrent` file's bencoded dictionary.
 *
 * Keys follow the official BitTorrent specification naming conventions
 * (including spaces and hyphens).
 */
export type Torrent = {
  /** Name and version of the program that created the torrent. */
  "created by": string
  /** Unix timestamp (seconds since epoch) of torrent creation. */
  "creation date": number
  /** Primary tracker announce URL (first tracker, sorted). */
  announce?: string
  /**
   * Full tracker list in the multi-tracker extension format (BEP-12).
   * Each inner array is a tier; currently each tier contains exactly one URL.
   */
  "announce-list"?: string[][]
  /**
   * Web-seed URL(s) (BEP-19).
   * A single URL is stored as a plain string; multiple URLs as an array.
   */
  "url-list"?: string | string[]
  /** Core metadata dictionary hashed to produce the info-hash. */
  info: {
    /** Display name – base name of `entry` (file name or directory name). */
    name: string
    /** Size in bytes of each piece (except possibly the last). */
    "piece length": number
    /**
     * Concatenation of SHA-1 digests (20 bytes each) for every piece.
     * Stored as raw bytes in the bencode output.
     */
    pieces?: Uint8Array
    /** *Single-file mode only* – total byte length of the file. */
    length?: number
    /**
     * *Multi-file mode only* – ordered list of files included in the torrent.
     * Each entry contains a path component array and the file's byte length.
     */
    files?: { path: string[]; length: number }[]
    /** Set to `1` to mark the torrent as private (disables DHT/PEX). */
    private?: number
  }
  /** Optional human-readable comment. */
  comment?: string
  /** Optional source identifier. */
  source?: string
}

````

---

## Arquivo: `docs/deno-torrent/torrent-generator/util.ts`

````ts
/**
 * Internal utility functions for torrent generation.
 * @module
 */

import { walk } from "@std/fs/walk"
import { basename } from "@std/path"
import { crypto } from "@std/crypto/crypto"
import { logd } from "./log.ts"
import { MultiFileReader } from "./reader.ts"
import { PieceSizeEnum } from "./types.ts"

/**
 * Returns all files under `entry`.
 *
 * - If `entry` is a regular file the single-element array `[entry]` is returned.
 * - If `entry` is a directory it is walked recursively; directories themselves
 *   are excluded from the result.
 *
 * @param entry - Absolute path to a file or directory.
 * @param ignoreHiddenFile - When `true`, entries whose base name starts with
 *   `.` are omitted.
 * @returns Ordered list of absolute file paths found under `entry`.
 * @throws {Deno.errors.NotFound} If `entry` does not exist.
 */
export async function obtainFiles(
  entry: string,
  ignoreHiddenFile: boolean,
): Promise<string[]> {
  const stat = await Deno.stat(entry)
  if (stat.isFile) return [entry]

  const files: string[] = []
  for await (const item of walk(entry, { includeFiles: true, includeDirs: false })) {
    if (ignoreHiddenFile && isHiddenFile(item.path)) continue
    files.push(item.path)
  }
  return files
}

/**
 * Computes the concatenated SHA-1 digests (pieces) for a set of files.
 *
 * Files are read sequentially as a single byte stream using
 * {@link MultiFileReader}.  The stream is divided into chunks of `pieceSize`
 * bytes; the last chunk may be smaller.  Each chunk's SHA-1 digest (20 bytes)
 * is appended to the result.
 *
 * @param files - Ordered list of file paths to hash.
 * @param pieceSize - Number of bytes per piece (must be ≥ 1).
 * @param alignPiece - When `true`, inserts zero-filled BEP-47 padding between files.
 * @returns `Uint8Array` whose length is a multiple of 20 (20 bytes per piece).
 * @throws {RangeError} If `pieceSize` is less than 1.
 */
export async function sha1sum(
  files: string[],
  pieceSize: number,
  alignPiece = false,
): Promise<Uint8Array> {
  if (pieceSize < 1) throw new RangeError("pieceSize must be ≥ 1")

  if (alignPiece) return await sha1sumAligned(files, pieceSize)

  const totalSize = await fileSizeSum(files)
  const pieceCount = Math.ceil(totalSize / pieceSize)
  logd(`pieceSize=${pieceSize}, pieceCount=${pieceCount}, files=${files.length}`)

  const digestParts: Uint8Array[] = []
  const reader = new MultiFileReader(files)
  try {
    let chunk: Uint8Array | null
    while ((chunk = await reader.readChunk(pieceSize)) !== null) {
      const digest = await crypto.subtle.digest("SHA-1", chunk as unknown as Uint8Array<ArrayBuffer>)
      digestParts.push(new Uint8Array(digest))
    }
  } finally {
    reader.close()
  }

  // Concatenate all 20-byte digests
  const result = new Uint8Array(digestParts.length * 20)
  let offset = 0
  for (const d of digestParts) {
    result.set(d, offset)
    offset += 20
  }

  // Sanity check
  if (digestParts.length !== pieceCount) {
    logd(`Warning: expected ${pieceCount} pieces, got ${digestParts.length}`)
  }

  return result
}

type PieceFile = {
  file: string | null
  length: number
  padding: boolean
}

/** Builds the logical file stream used by BEP-47 piece-aligned torrents. */
export async function buildPieceFiles(files: string[], pieceSize: number): Promise<PieceFile[]> {
  const sizes = await Promise.all(files.map(async (file) => (await Deno.stat(file)).size))
  const pieceFiles: PieceFile[] = []
  let pieceOffset = 0

  for (let index = 0; index < files.length; index++) {
    const length = sizes[index]
    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset
      pieceFiles.push({ file: null, length: paddingLength, padding: true })
      pieceOffset = 0
    }

    pieceFiles.push({ file: files[index], length, padding: false })
    pieceOffset = (pieceOffset + length) % pieceSize
  }

  return pieceFiles
}

async function sha1sumAligned(files: string[], pieceSize: number): Promise<Uint8Array> {
  const pieceFiles = await buildPieceFiles(files, pieceSize)
  const digests: Uint8Array[] = []
  const piece = new Uint8Array(pieceSize)
  let pieceOffset = 0

  const digestPiece = async (length: number): Promise<void> => {
    const digest = await crypto.subtle.digest("SHA-1", piece.subarray(0, length) as Uint8Array<ArrayBuffer>)
    digests.push(new Uint8Array(digest))
  }

  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      piece.fill(0, pieceOffset, pieceOffset + pieceFile.length)
      pieceOffset += pieceFile.length
      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize)
        pieceOffset = 0
      }
      continue
    }

    const reader = new MultiFileReader([pieceFile.file!])
    try {
      let chunk: Uint8Array | null
      while ((chunk = await reader.readChunk(pieceSize - pieceOffset)) !== null) {
        piece.set(chunk, pieceOffset)
        pieceOffset += chunk.length
        if (pieceOffset === pieceSize) {
          await digestPiece(pieceSize)
          pieceOffset = 0
        }
      }
    } finally {
      reader.close()
    }
  }

  if (pieceOffset > 0) await digestPiece(pieceOffset)

  const result = new Uint8Array(digests.length * 20)
  digests.forEach((digest, index) => result.set(digest, index * 20))
  return result
}

/**
 * Sums the byte sizes of all given files.
 *
 * @param files - Absolute file paths whose sizes are summed.
 * @returns Total size in bytes.
 */
export async function fileSizeSum(files: string[]): Promise<number> {
  let total = 0
  for (const file of files) {
    const { size } = await Deno.stat(file)
    total += size
  }
  return total
}

/**
 * Selects an appropriate piece size for the given total file size.
 *
 * When `pieceSizeEnum` is {@link PieceSizeEnum.SIZE_AUTO} the function
 * returns the smallest preset that is larger than `fileSize`, capped at
 * {@link PieceSizeEnum.SIZE_512MB}.  For any other preset the supplied value
 * is returned unchanged.
 *
 * @param fileSize - Total content size in bytes.
 * @param pieceSizeEnum - Desired preset, or `SIZE_AUTO` for heuristic selection.
 * @returns Piece size in bytes (≥ 1).
 */
export function calcPieceSize(fileSize: number, pieceSizeEnum: PieceSizeEnum): number {
  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum as number
  }

  // All numeric preset values in ascending order, excluding SIZE_AUTO (0)
  const presets = (Object.values(PieceSizeEnum) as number[])
    .filter((v) => v !== 0 && typeof v === "number")
    .sort((a, b) => a - b)

  // Pick the smallest preset that exceeds the total file size
  const selected = presets.find((p) => fileSize < p) ?? presets[presets.length - 1]

  // Cap at SIZE_512MB to avoid unreasonably large pieces
  return Math.min(selected, PieceSizeEnum.SIZE_512MB as number)
}

/**
 * Returns the latest git tag from the repository in `major.minor.patch` form.
 *
 * Falls back to `"0.0.0"` if git is not available or the repository has no
 * tags.
 *
 * @returns Version string, e.g. `"1.2.3"`.
 */
export async function getLatestTag(): Promise<string> {
  const DEFAULT = "0.0.0"
  try {
    const cmd = new Deno.Command("git", {
      args: ["describe", "--tags", "--abbrev=0"],
      stdout: "piped",
      stderr: "null",
    })
    const { code, stdout } = await cmd.output()
    if (code !== 0) return DEFAULT
    const tag = new TextDecoder().decode(stdout).trim()
    return /^\d+\.\d+\.\d+/.test(tag) ? tag : DEFAULT
  } catch {
    return DEFAULT
  }
}

/**
 * Returns the default `created by` string embedded in new torrents.
 *
 * Format: `deno-torrent-generator@<version>`.
 *
 * @returns Creator identifier string.
 */
export async function getDefaultCreatedBy(): Promise<string> {
  return `deno-torrent-generator@${await getLatestTag()}`
}

/**
 * @deprecated Renamed to {@link getDefaultCreatedBy} (fixed typo in name).
 * Will be removed in a future version.
 */
export const getDefaultCraetedBy = getDefaultCreatedBy

/**
 * Returns `true` when the base name of `filePath` starts with `.`.
 *
 * @param filePath - Any file path (absolute or relative).
 * @returns Whether the file is considered hidden.
 *
 * @example
 * ```ts
 * isHiddenFile(".DS_Store")   // true
 * isHiddenFile("readme.txt")  // false
 * ```
 */
export function isHiddenFile(filePath: string): boolean {
  return basename(filePath).startsWith(".")
}

````

---

## Arquivo: `docs/deno-torrent/torrent-parser/mod.ts`

```ts
export * from './src/parser.ts';

```

---

## Arquivo: `docs/deno-torrent/torrent-parser/parser.ts`

````ts
/**
 * @module
 *
 * Lightweight `.torrent` file parser for Deno.
 *
 * @example
 * ```ts
 * import { parseTorrent } from './mod.ts'
 *
 * const fd = await Deno.open('example.torrent', { read: true })
 * try {
 *   const torrent = await parseTorrent(fd)
 *   console.log(torrent.info.name)
 * } finally {
 *   fd.close()
 * }
 * ```
 */

import { BencodeDecodeError, decode } from 'bencode';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Minimal readable interface — satisfied by `Deno.FsFile` and other Deno readers. */
interface Reader {
  read(p: Uint8Array): Promise<number | null>;
}

/** Options controlling resource usage while parsing a torrent. */
export type ParseTorrentOptions = {
  /** Maximum number of input bytes to read. Defaults to no limit. */
  maxBytes?: number;
};

/** Read all bytes from a `Reader` until EOF, enforcing an optional size limit. */
async function readAll(reader: Reader, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(32 * 1024);
  let total = 0;
  while (true) {
    const n = await reader.read(buf);
    if (n === null) break;
    if (n <= 0 || n > buf.length) {
      throw new Error(`Reader returned an invalid byte count: ${n}`);
    }
    total += n;
    if (total > maxBytes) {
      throw new RangeError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    chunks.push(buf.slice(0, n));
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Convert bencode 2.x Map dictionaries to the plain objects exposed by this package. */
function normalizeDecodedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== 'string') {
        throw new TorrentParseError('Torrent dictionary keys must be strings');
      }
      object[key] = normalizeDecodedValue(entry);
    }
    return object;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDecodedValue);
  }

  return value;
}

/** Return whether a decoded value is a plain bencode dictionary. */
function isDictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/** Return whether a value is an integer representable without precision loss. */
function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Return whether a value is a non-negative safe integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

/** Validate an optional string-valued field. */
function validateOptionalString(dict: Record<string, unknown>, field: string): void {
  if (dict[field] !== undefined && typeof dict[field] !== 'string') {
    throw new TorrentParseError(`Invalid "${field}" field — expected a UTF-8 string`);
  }
}

/** Validate the optional tracker tier list. */
function validateAnnounceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((tier) => Array.isArray(tier) && tier.every((tracker) => typeof tracker === 'string'))
  );
}

/** Validate a multi-file torrent file entry. */
function validateTorrentFile(value: unknown, index: number): asserts value is Record<string, unknown> {
  if (!isDictionary(value)) {
    throw new TorrentParseError(`Invalid "info.files[${index}]" entry — expected a dictionary`);
  }
  if (!isNonNegativeInteger(value['length'])) {
    throw new TorrentParseError(`Invalid "info.files[${index}].length" field — expected a non-negative integer`);
  }
  if (
    !Array.isArray(value['path']) || value['path'].length === 0 ||
    !value['path'].every((part) => typeof part === 'string')
  ) {
    throw new TorrentParseError(`Invalid "info.files[${index}].path" field — expected a non-empty string array`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single file entry in a multi-file torrent.
 */
export type TorrentFile = {
  /** File size in bytes. */
  length: number;
  /**
   * Path components relative to the torrent root directory.
   *
   * @example `["subdir", "file.txt"]` represents `<name>/subdir/file.txt`
   */
  path: string[];
};

/**
 * The `info` dictionary of a torrent file, containing core metadata.
 *
 * Either `length` (single-file) or `files` (multi-file) will be present, but not both.
 */
export type TorrentInfo = {
  /** Suggested name for the file or top-level directory. */
  name: string;
  /** Number of bytes in each piece. Always a power of two. */
  'piece length': number;
  /**
   * Concatenated SHA-1 hashes, one per piece (20 bytes each).
   * Decoded as `Uint8Array` because the raw bytes are not valid UTF-8.
   */
  pieces?: Uint8Array;
  /** Total file size in bytes — present in single-file torrents only. */
  length?: number;
  /** List of files — present in multi-file torrents only. */
  files?: TorrentFile[];
  /** Whether the torrent is private (`1` = private, clients must not use DHT). */
  private?: number;
};

/**
 * Represents a fully parsed `.torrent` file.
 *
 * @see {@link https://www.bittorrent.org/beps/bep_0003.html BEP-3: The BitTorrent Protocol Specification}
 */
export type Torrent = {
  /** Primary tracker announce URL. */
  announce?: string;
  /**
   * Tiered tracker list (BEP-12).
   * Each inner array is a tier; clients try trackers within a tier in random order.
   */
  'announce-list'?: string[][];
  /** Human-readable comment embedded by the torrent creator. */
  comment?: string;
  /** Name of the software used to create the torrent. */
  'created by': string;
  /** Creation time as a Unix epoch timestamp (seconds since 1970-01-01T00:00:00Z). */
  'creation date': number;
  /** Web seed URL(s) (BEP-19). May be a single URL string or an array. */
  'url-list'?: string | string[];
  /** Identifies the source of the torrent (used by private trackers). */
  source?: string;
  /** Core torrent metadata. */
  info: TorrentInfo;
};

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when input cannot be parsed as a valid `.torrent` file.
 *
 * @example
 * ```ts
 * import { parseTorrent, TorrentParseError } from './mod.ts'
 *
 * try {
 *   await parseTorrent(badBytes)
 * } catch (err) {
 *   if (err instanceof TorrentParseError) {
 *     console.error('Parse failed:', err.message)
 *   }
 * }
 * ```
 */
export class TorrentParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TorrentParseError';
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses a `.torrent` file from a `Uint8Array` or any `Reader` (e.g. `Deno.FsFile`).
 *
 * Reading from a `Reader` is done in a single `readAll` call, so the source does
 * not need to support seeking.
 *
 * @param source - Raw torrent bytes **or** any object implementing the `Reader` interface.
 * @param options - Optional resource limits for the input.
 * @returns The fully typed {@link Torrent} object.
 * @throws {TorrentParseError} If the bytes are not valid bencode, or if required
 *   fields (`info`, `info.name`, `info.piece length`) are missing or have wrong types.
 *
 * @example Parse from an open file handle
 * ```ts
 * const fd = await Deno.open('./example.torrent', { read: true })
 * try {
 *   const torrent = await parseTorrent(fd)
 *   console.log(torrent.info.name)
 * } finally {
 *   fd.close()
 * }
 * ```
 *
 * @example Parse from a byte array
 * ```ts
 * const bytes = await Deno.readFile('./example.torrent')
 * const torrent = await parseTorrent(bytes)
 * ```
 */
export async function parseTorrent(source: Reader | Uint8Array, options: ParseTorrentOptions = {}): Promise<Torrent> {
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  if (maxBytes !== Number.POSITIVE_INFINITY && (maxBytes < 0 || !Number.isSafeInteger(maxBytes))) {
    throw new TorrentParseError('Invalid "maxBytes" option — expected a non-negative safe integer');
  }

  // ── 1. Read bytes ──────────────────────────────────────────────────────────
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) {
    if (source.length > maxBytes) {
      throw new TorrentParseError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
    }
    bytes = source;
  } else {
    try {
      bytes = await readAll(source, maxBytes);
    } catch (err) {
      throw new TorrentParseError('Failed to read torrent data', { cause: err });
    }
  }

  // ── 2. Decode bencode ──────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = normalizeDecodedValue(decode(bytes));
  } catch (err) {
    const msg = err instanceof BencodeDecodeError ? err.message : 'Invalid bencode data';
    throw new TorrentParseError(msg, { cause: err });
  }

  // ── 3. Validate structure ──────────────────────────────────────────────────
  if (!isDictionary(raw)) {
    throw new TorrentParseError(
      'Torrent root must be a bencode dictionary, got: ' + (Array.isArray(raw) ? 'list' : typeof raw),
    );
  }

  const dict = raw;
  validateOptionalString(dict, 'announce');
  validateOptionalString(dict, 'comment');
  validateOptionalString(dict, 'created by');
  validateOptionalString(dict, 'source');
  if (dict['announce-list'] !== undefined && !validateAnnounceList(dict['announce-list'])) {
    throw new TorrentParseError('Invalid "announce-list" field — expected a string array of string arrays');
  }
  if (
    dict['url-list'] !== undefined &&
    !(typeof dict['url-list'] === 'string' ||
      (Array.isArray(dict['url-list']) && dict['url-list'].every((url) => typeof url === 'string')))
  ) {
    throw new TorrentParseError('Invalid "url-list" field — expected a string or string array');
  }
  if (dict['creation date'] !== undefined && !isSafeInteger(dict['creation date'])) {
    throw new TorrentParseError('Invalid "creation date" field — expected an integer');
  }

  const info = dict['info'];

  if (!isDictionary(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }

  const infoDict = info;

  if (typeof infoDict['name'] !== 'string') {
    throw new TorrentParseError('Missing or invalid "info.name" field — expected a UTF-8 string');
  }

  if (!isSafeInteger(infoDict['piece length']) || infoDict['piece length'] <= 0) {
    throw new TorrentParseError('Missing or invalid "info.piece length" field — expected a positive integer');
  }

  if (
    infoDict['pieces'] !== undefined &&
    (!(infoDict['pieces'] instanceof Uint8Array) || infoDict['pieces'].length % 20 !== 0)
  ) {
    throw new TorrentParseError('Invalid "info.pieces" field — expected a Uint8Array whose length is a multiple of 20');
  }

  if (infoDict['length'] !== undefined && !isNonNegativeInteger(infoDict['length'])) {
    throw new TorrentParseError('Invalid "info.length" field — expected a non-negative integer');
  }

  if (infoDict['files'] !== undefined) {
    if (!Array.isArray(infoDict['files'])) {
      throw new TorrentParseError('Invalid "info.files" field — expected an array');
    }
    if (infoDict['length'] !== undefined) {
      throw new TorrentParseError('Torrent info must not contain both "length" and "files"');
    }
    infoDict['files'].forEach(validateTorrentFile);
  }

  if (infoDict['private'] !== undefined && !isSafeInteger(infoDict['private'])) {
    throw new TorrentParseError('Invalid "info.private" field — expected an integer');
  }

  return raw as unknown as Torrent;
}

````

---

## Arquivo: `docs/deno-torrent/torrent-tracker/client.ts`

```ts
import { HttpTrackerClient } from "./http.ts";
import type {
  AnnounceClient,
  TrackerAnnounceAnyRequest,
  TrackerAnnounceRequest,
  TrackerAnnounceResponse,
} from "./types.ts";
import { TrackerError } from "./types.ts";
import { UdpTrackerClient } from "./udp.ts";
import {
  DEFAULT_TIMEOUT_MS,
  isAbortError,
  validateAnnounceRequest,
  validateTimeout,
} from "./request.ts";

/** Protocol-selecting tracker client with ordered failover. */
export class TrackerClient implements AnnounceClient {
  /** Creates a client with an application-specific HTTP User-Agent. */
  static withUserAgent(userAgent: string): TrackerClient {
    return new TrackerClient(new HttpTrackerClient({ userAgent }));
  }

  /** Creates a client from optional HTTP and UDP transport implementations. */
  constructor(
    readonly http: AnnounceClient = new HttpTrackerClient(),
    readonly udp: AnnounceClient = new UdpTrackerClient(),
  ) {}

  /** Announces through the transport selected by the tracker URL. */
  announce(request: TrackerAnnounceRequest): Promise<TrackerAnnounceResponse> {
    validateAnnounceRequest(request);
    const protocol = new URL(request.tracker).protocol;
    if (protocol === "http:" || protocol === "https:") {
      return this.http.announce(request);
    }
    if (protocol === "udp:") return this.udp.announce(request);
    return Promise.reject(
      new TrackerError(`unsupported tracker protocol: ${protocol}`),
    );
  }

  /**
   * Tries trackers in order while sharing one overall deadline.
   *
   * Caller cancellation and `AbortError` failures terminate immediately;
   * ordinary tracker failures continue to the next candidate.
   */
  async announceAny(
    trackers: readonly string[],
    request: TrackerAnnounceAnyRequest,
  ): Promise<TrackerAnnounceResponse> {
    if (trackers.length === 0 || trackers.length > 256) {
      throw new TrackerError("trackers must contain between 1 and 256 URLs");
    }
    const {
      overallTimeoutMs: requestedOverallTimeout,
      ...announceRequest
    } = request;
    const overallTimeoutMs = validateTimeout(
      requestedOverallTimeout ?? request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "overallTimeoutMs",
    );
    const deadlineSignal = AbortSignal.timeout(overallTimeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, deadlineSignal])
      : deadlineSignal;
    const deadline = performance.now() + overallTimeoutMs;
    const failures: string[] = [];
    for (const tracker of trackers) {
      const remainingMs = Math.max(1, Math.ceil(deadline - performance.now()));
      try {
        return await abortable(
          this.announce({
            ...announceRequest,
            tracker,
            signal,
            timeoutMs: Math.min(
              announceRequest.timeoutMs ?? DEFAULT_TIMEOUT_MS,
              remainingMs,
            ),
          }),
          signal,
        );
      } catch (error) {
        if (request.signal?.aborted) throw request.signal.reason;
        if (deadlineSignal.aborted) {
          throw new TrackerError("tracker announce deadline exceeded", {
            cause: deadlineSignal.reason,
          });
        }
        if (isAbortError(error)) throw error;
        failures.push(
          `${safeTrackerLabel(tracker)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    throw new TrackerError(`all trackers failed (${failures.join("; ")})`);
  }
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

function safeTrackerLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid tracker";
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-tracker/compact.ts`

```ts
import { type PeerEndpoint, TrackerError } from "./types.ts";

/** Parses BEP 23 compact IPv4 peers, rejecting malformed byte lengths. */
export function parseCompactIpv4Peers(bytes: Uint8Array): PeerEndpoint[] {
  if (bytes.length % 6 !== 0) {
    throw new TrackerError("compact IPv4 peer list has invalid length");
  }
  const peers: PeerEndpoint[] = [];
  for (let offset = 0; offset < bytes.length; offset += 6) {
    const port = (bytes[offset + 4]! << 8) | bytes[offset + 5]!;
    if (!port) continue;
    peers.push({
      hostname: `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${
        bytes[offset + 3]
      }`,
      port,
      family: "ipv4",
    });
  }
  return deduplicatePeers(peers);
}

/** Parses compact IPv6 peers, rejecting malformed byte lengths. */
export function parseCompactIpv6Peers(bytes: Uint8Array): PeerEndpoint[] {
  if (bytes.length % 18 !== 0) {
    throw new TrackerError("compact IPv6 peer list has invalid length");
  }
  const peers: PeerEndpoint[] = [];
  for (let offset = 0; offset < bytes.length; offset += 18) {
    const port = (bytes[offset + 16]! << 8) | bytes[offset + 17]!;
    if (!port) continue;
    const groups: string[] = [];
    for (let index = 0; index < 16; index += 2) {
      groups.push(
        ((bytes[offset + index]! << 8) | bytes[offset + index + 1]!).toString(
          16,
        ),
      );
    }
    peers.push({ hostname: groups.join(":"), port, family: "ipv6" });
  }
  return deduplicatePeers(peers);
}

/** Deduplicates and validates a bounded list of peer endpoints. */
export function deduplicatePeers(
  peers: readonly PeerEndpoint[],
  maximum = 2_000,
): PeerEndpoint[] {
  const output: PeerEndpoint[] = [];
  const seen = new Set<string>();
  for (const peer of peers) {
    if (output.length >= maximum) break;
    if (!validPort(peer.port) || !peer.hostname) continue;
    const key = `${peer.family}:${peer.hostname.toLowerCase()}:${peer.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...peer,
      peerId: peer.peerId ? new Uint8Array(peer.peerId) : undefined,
    });
  }
  return output;
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

```

---

## Arquivo: `docs/deno-torrent/torrent-tracker/http.ts`

```ts
import {
  type BencodeKey,
  type BencodeValue,
  decode,
} from "@deno-torrent/bencode";
import {
  deduplicatePeers,
  parseCompactIpv4Peers,
  parseCompactIpv6Peers,
} from "./compact.ts";
import {
  type AnnounceClient,
  type PeerEndpoint,
  type TrackerAnnounceRequest,
  type TrackerAnnounceResponse,
  TrackerError,
} from "./types.ts";
import {
  DEFAULT_TIMEOUT_MS,
  integerInRange,
  isAbortError,
  validateAnnounceRequest,
} from "./request.ts";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Options for the HTTP(S) tracker transport. */
export interface HttpTrackerClientOptions {
  /** Fetch implementation, primarily for custom runtimes and tests. */
  fetch?: typeof fetch;
  /** User-Agent sent to trackers. */
  userAgent?: string;
  /** Optional application policy evaluated before every request/redirect. */
  validateUrl?: (url: URL, signal: AbortSignal) => void | Promise<void>;
  /** Maximum redirects followed within the request deadline. */
  maxRedirects?: number;
}

/** HTTP(S) BitTorrent tracker client. */
export class HttpTrackerClient implements AnnounceClient {
  readonly #fetch: typeof fetch;
  readonly #userAgent: string;
  readonly #validateUrl?: (
    url: URL,
    signal: AbortSignal,
  ) => void | Promise<void>;
  readonly #maxRedirects: number;

  /** Creates an HTTP tracker client with optional policy hooks. */
  constructor(options: HttpTrackerClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#userAgent = options.userAgent ??
      "@deno-torrent/torrent-tracker/0.1.0";
    this.#validateUrl = options.validateUrl;
    this.#maxRedirects = integerInRange(
      options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      "maxRedirects",
      0,
      20,
    );
  }

  /** Announces to an HTTP(S) tracker. */
  async announce(
    request: TrackerAnnounceRequest,
  ): Promise<TrackerAnnounceResponse> {
    validateAnnounceRequest(request);
    const url = buildAnnounceUrl(request);
    const timeout = AbortSignal.timeout(
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    let response: Response;
    try {
      response = await this.#fetchFollowingRedirects(url, signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      if (timeout.aborted) {
        throw new TrackerError("HTTP tracker request timed out", {
          cause: error,
        });
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("HTTP tracker request failed", { cause: error });
    }
    if (!response.ok) {
      await cancelBody(response);
      throw new TrackerError(`HTTP tracker returned ${response.status}`);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES, signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      if (timeout.aborted) {
        throw new TrackerError("HTTP tracker request timed out", {
          cause: error,
        });
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("HTTP tracker response could not be read", {
        cause: error,
      });
    }
    return parseHttpTrackerResponse(bytes, request.tracker);
  }

  async #fetchFollowingRedirects(
    initialUrl: URL,
    signal: AbortSignal,
  ): Promise<Response> {
    let url = initialUrl;
    for (let redirectCount = 0;; redirectCount++) {
      validateHttpUrl(url);
      if (this.#validateUrl) {
        try {
          await runUrlPolicy(this.#validateUrl, new URL(url), signal);
        } catch (error) {
          throw new TrackerError("HTTP tracker URL was rejected", {
            cause: error,
          });
        }
      }
      const response = await this.#fetch(url, {
        headers: { "user-agent": this.#userAgent },
        redirect: "manual",
        signal,
      });
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      if (redirectCount >= this.#maxRedirects) {
        await cancelBody(response);
        throw new TrackerError("HTTP tracker redirected too many times");
      }
      const location = response.headers.get("location");
      if (!location) {
        await cancelBody(response);
        throw new TrackerError("HTTP tracker redirect has no location");
      }
      let next: URL;
      try {
        next = new URL(location, url);
      } catch (error) {
        await cancelBody(response);
        throw new TrackerError("HTTP tracker redirect location is invalid", {
          cause: error,
        });
      }
      await cancelBody(response);
      url = next;
    }
  }
}

/** Builds an announce URL while preserving binary identity parameters. */
export function buildAnnounceUrl(request: TrackerAnnounceRequest): URL {
  validateAnnounceRequest(request);
  const url = new URL(request.tracker);
  validateHttpUrl(url);
  const parameters = [
    `info_hash=${percentEncodeBytes(request.infoHash)}`,
    `peer_id=${percentEncodeBytes(request.peerId)}`,
    `port=${request.port}`,
    `uploaded=${request.uploaded ?? 0}`,
    `downloaded=${request.downloaded ?? 0}`,
    `left=${request.left}`,
    "compact=1",
    `numwant=${request.numWant ?? 50}`,
  ];
  if (request.event) parameters.push(`event=${request.event}`);
  if (request.key !== undefined) {
    parameters.push(`key=${request.key}`);
  }
  if (request.trackerId) {
    parameters.push(`trackerid=${encodeURIComponent(request.trackerId)}`);
  }
  url.search += `${url.search ? "&" : ""}${parameters.join("&")}`;
  return url;
}

/** Parses a bencoded HTTP tracker response. */
export function parseHttpTrackerResponse(
  bytes: Uint8Array,
  tracker = "http://tracker.invalid/announce",
): TrackerAnnounceResponse {
  let value: BencodeValue;
  try {
    value = decode(bytes, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: 32,
      allowUnsortedKeys: true,
    });
  } catch (error) {
    throw new TrackerError("tracker returned invalid bencode", {
      cause: error,
    });
  }
  if (!(value instanceof Map)) {
    throw new TrackerError("tracker response must be a dictionary");
  }
  const failure = mapString(value, "failure reason");
  if (failure) throw new TrackerError(failure);
  const interval = mapNonNegativeInteger(value, "interval");
  if (!interval || interval < 1) {
    throw new TrackerError("tracker response has no valid interval");
  }
  const peers: PeerEndpoint[] = [];
  const ipv4 = mapGet(value, "peers");
  if (ipv4 instanceof Uint8Array) peers.push(...parseCompactIpv4Peers(ipv4));
  else if (Array.isArray(ipv4)) peers.push(...parseDictionaryPeers(ipv4));
  else if (typeof ipv4 === "string") {
    peers.push(...parseCompactIpv4Peers(new TextEncoder().encode(ipv4)));
  }
  const ipv6 = mapGet(value, "peers6");
  if (ipv6 instanceof Uint8Array) peers.push(...parseCompactIpv6Peers(ipv6));
  else if (typeof ipv6 === "string") {
    peers.push(...parseCompactIpv6Peers(new TextEncoder().encode(ipv6)));
  }
  return {
    tracker,
    interval,
    minInterval: mapNonNegativeInteger(value, "min interval"),
    trackerId: mapString(value, "tracker id"),
    warning: mapString(value, "warning message"),
    complete: mapNonNegativeInteger(value, "complete"),
    incomplete: mapNonNegativeInteger(value, "incomplete"),
    peers: deduplicatePeers(peers),
  };
}

function parseDictionaryPeers(values: BencodeValue[]): PeerEndpoint[] {
  const peers: PeerEndpoint[] = [];
  for (const value of values.slice(0, 2_000)) {
    if (!(value instanceof Map)) continue;
    const hostname = mapString(value, "ip");
    const port = mapNonNegativeInteger(value, "port");
    if (!hostname || !port || port > 65_535) continue;
    const peerId = mapGet(value, "peer id");
    peers.push({
      hostname,
      port,
      family: hostname.includes(":") ? "ipv6" : "ipv4",
      peerId: peerId instanceof Uint8Array && peerId.length === 20
        ? peerId
        : undefined,
    });
  }
  return peers;
}

function mapGet(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): BencodeValue | undefined {
  for (const [candidate, value] of map) {
    if (
      candidate === key ||
      candidate instanceof Uint8Array && equalsAscii(candidate, key)
    ) return value;
  }
  return undefined;
}

function mapString(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): string | undefined {
  const value = mapGet(map, key);
  return typeof value === "string" ? value : undefined;
}

function mapInteger(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): number | undefined {
  const value = mapGet(map, key);
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function mapNonNegativeInteger(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): number | undefined {
  const value = mapInteger(map, key);
  return value !== undefined && value >= 0 ? value : undefined;
}

function equalsAscii(bytes: Uint8Array, text: string): boolean {
  return bytes.length === text.length &&
    bytes.every((byte, index) => byte === text.charCodeAt(index));
}

function percentEncodeBytes(bytes: Uint8Array): string {
  return [...bytes].map((byte) =>
    `%${byte.toString(16).padStart(2, "0").toUpperCase()}`
  ).join("");
}

function validateHttpUrl(url: URL): void {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname
  ) {
    throw new TrackerError(
      `unsupported HTTP tracker URL: ${url.protocol}`,
    );
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) {
    await cancelBody(response, signal.reason);
    throw signal.reason;
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      await cancelBody(response, "invalid Content-Length");
      throw new TrackerError("tracker response has invalid Content-Length");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      await cancelBody(response, "tracker response is too large");
      throw new TrackerError("tracker response is too large");
    }
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await readChunk(reader, signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new TrackerError("tracker response is too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    await cancelReader(reader, error);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    await cancelReader(reader, signal.reason);
    throw signal.reason;
  }
  return await new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener("abort", abort);
      const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        void cancelReader(reader, signal.reason).then(() => {
          reject(signal.reason);
        });
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      reader.read().then(
        (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        },
        (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      );
    },
  );
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason?: unknown,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // The primary tracker or cancellation error remains authoritative.
  }
}

async function cancelBody(response: Response, reason?: unknown): Promise<void> {
  try {
    await response.body?.cancel(reason);
  } catch {
    // The response is already unusable; cancellation is best-effort.
  }
}

async function runUrlPolicy(
  policy: NonNullable<HttpTrackerClientOptions["validateUrl"]>,
  url: URL,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw signal.reason;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  const operation = Promise.resolve().then(() => {
    if (signal.aborted) throw signal.reason;
    return policy(url, signal);
  });
  try {
    await Promise.race([operation, aborted]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-tracker/mod.ts`

```ts
export * from "./src/client.ts";
export * from "./src/compact.ts";
export * from "./src/http.ts";
export * from "./src/types.ts";
export * from "./src/udp.ts";

```

---

## Arquivo: `docs/deno-torrent/torrent-tracker/request.ts`

```ts
import type { TrackerAnnounceRequest } from "./types.ts";
import { TrackerError } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 300_000;
export const MAX_NUM_WANT = 2_000;
export const MAX_TRACKER_URL_LENGTH = 8_192;
export const MAX_TRACKER_ID_LENGTH = 1_024;

const EVENTS = new Set(["started", "completed", "stopped"]);

export function validateAnnounceRequest(
  request: TrackerAnnounceRequest,
): void {
  if (
    !(request.infoHash instanceof Uint8Array) ||
    !(request.peerId instanceof Uint8Array) ||
    request.infoHash.length !== 20 || request.peerId.length !== 20
  ) {
    throw new TrackerError("infoHash and peerId must contain 20 bytes");
  }
  if (
    typeof request.tracker !== "string" || !request.tracker ||
    request.tracker.length > MAX_TRACKER_URL_LENGTH
  ) {
    throw new TrackerError("tracker URL is invalid");
  }
  try {
    new URL(request.tracker);
  } catch (error) {
    throw new TrackerError("tracker URL is invalid", { cause: error });
  }
  integerInRange(request.port, "port", 1, 65_535);
  integerInRange(request.uploaded ?? 0, "uploaded", 0);
  integerInRange(request.downloaded ?? 0, "downloaded", 0);
  integerInRange(request.left, "left", 0);
  if (request.numWant !== undefined) {
    integerInRange(request.numWant, "numWant", 0, MAX_NUM_WANT);
  }
  if (request.key !== undefined) {
    integerInRange(request.key, "key", 0, 0xffff_ffff);
  }
  if (
    request.event !== undefined &&
    (typeof request.event !== "string" || !EVENTS.has(request.event))
  ) {
    throw new TrackerError("event is invalid");
  }
  if (
    request.trackerId !== undefined &&
    (typeof request.trackerId !== "string" ||
      request.trackerId.length > MAX_TRACKER_ID_LENGTH)
  ) {
    throw new TrackerError("trackerId is invalid");
  }
  if (request.timeoutMs !== undefined) validateTimeout(request.timeoutMs);
}

export function validateTimeout(value: number, name = "timeoutMs"): number {
  return integerInRange(value, name, 1, MAX_TIMEOUT_MS);
}

export function integerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) || value < minimum || value > maximum
  ) {
    throw new TrackerError(`${name} is invalid`);
  }
  return value;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

```

---

## Arquivo: `docs/deno-torrent/torrent-tracker/types.ts`

```ts
/** A peer endpoint returned by a tracker. */
export interface PeerEndpoint {
  /** IPv4/IPv6 literal or DNS hostname. */
  hostname: string;
  /** TCP/uTP listening port. */
  port: number;
  /** Address family advertised by the tracker. */
  family: "ipv4" | "ipv6";
  /** Optional 20-byte peer ID from a non-compact response. */
  peerId?: Uint8Array;
}

/** Lifecycle event sent to a tracker. */
export type TrackerEvent = "started" | "completed" | "stopped";

/** Parameters for one tracker announce. */
export interface TrackerAnnounceRequest {
  /** HTTP(S) or UDP tracker URL. */
  tracker: string;
  /** Torrent v1 info hash (20 bytes). */
  infoHash: Uint8Array;
  /** Local BitTorrent peer ID (20 bytes). */
  peerId: Uint8Array;
  /** Local peer listening port. */
  port: number;
  /** Bytes uploaded for this torrent. */
  uploaded?: number;
  /** Bytes downloaded for this torrent. */
  downloaded?: number;
  /** Bytes remaining for this torrent. */
  left: number;
  /** Optional lifecycle event. */
  event?: TrackerEvent;
  /** Maximum requested peers, from 0 through 2,000. */
  numWant?: number;
  /** Optional unsigned 32-bit client key. */
  key?: number;
  /** Tracker ID returned by an earlier announce. */
  trackerId?: string;
  /** Cancels the announce without attempting another tracker. */
  signal?: AbortSignal;
  /** Per-announce timeout in milliseconds. */
  timeoutMs?: number;
}

/** Parameters shared by each candidate passed to `announceAny`. */
export interface TrackerAnnounceAnyRequest
  extends Omit<TrackerAnnounceRequest, "tracker"> {
  /** Total deadline across all candidates, in milliseconds. */
  overallTimeoutMs?: number;
}

/** Normalized tracker announce result. */
export interface TrackerAnnounceResponse {
  /** Original tracker URL used for the announce. */
  tracker: string;
  /** Requested delay before the next announce, in seconds. */
  interval: number;
  /** Optional lower bound for the next announce, in seconds. */
  minInterval?: number;
  /** Tracker-provided identifier for subsequent announces. */
  trackerId?: string;
  /** Non-fatal tracker warning. */
  warning?: string;
  /** Number of complete peers reported by the tracker. */
  complete?: number;
  /** Number of incomplete peers reported by the tracker. */
  incomplete?: number;
  /** Deduplicated, validated peer endpoints. */
  peers: PeerEndpoint[];
}

/** Minimal interface implemented by tracker transports. */
export interface AnnounceClient {
  /** Announces one torrent and returns normalized tracker data. */
  announce(request: TrackerAnnounceRequest): Promise<TrackerAnnounceResponse>;
}

/** Error raised for invalid requests or tracker protocol failures. */
export class TrackerError extends Error {
  /** Creates a tracker error with an optional underlying cause. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TrackerError";
  }
}

```

---

## Arquivo: `docs/deno-torrent/torrent-tracker/udp.ts`

```ts
import { parseCompactIpv4Peers } from "./compact.ts";
import {
  type AnnounceClient,
  type TrackerAnnounceRequest,
  type TrackerAnnounceResponse,
  TrackerError,
} from "./types.ts";
import {
  DEFAULT_TIMEOUT_MS,
  isAbortError,
  validateAnnounceRequest,
} from "./request.ts";

const CONNECT_MAGIC = 0x41727101980n;

/** UDP BitTorrent tracker client implementing BEP 15. */
export class UdpTrackerClient implements AnnounceClient {
  /** Announces to a UDP tracker within one DNS/connect/retry budget. */
  async announce(
    request: TrackerAnnounceRequest,
  ): Promise<TrackerAnnounceResponse> {
    validateAnnounceRequest(request);
    const url = new URL(request.tracker);
    if (url.protocol !== "udp:" || !url.hostname) {
      throw new TrackerError(
        `unsupported UDP tracker URL: ${url.protocol}`,
      );
    }
    const port = Number(url.port || 80);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new TrackerError("UDP tracker port is invalid");
    }
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    let hostnames: string[];
    try {
      hostnames = await resolveIpv4Hostnames(url.hostname, signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      if (timeout.aborted) {
        throw new TrackerError("UDP tracker request timed out", {
          cause: timeout.reason,
        });
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("UDP tracker DNS lookup failed", {
        cause: error,
      });
    }
    let lastError: unknown;
    const attempts = Math.max(2, Math.min(hostnames.length, 4));
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0 || signal.aborted) throw signal.reason;
        const attemptDeadline = Date.now() +
          Math.max(1, Math.ceil(remaining / (attempts - attempt)));
        return await announceAttempt(
          request,
          {
            transport: "udp",
            hostname: hostnames[attempt % hostnames.length]!,
            port,
          },
          attemptDeadline,
          signal,
        );
      } catch (error) {
        if (request.signal?.aborted) throw request.signal.reason;
        if (isAbortError(error)) throw error;
        lastError = error;
      }
    }
    if (timeout.aborted) {
      throw new TrackerError("UDP tracker request timed out", {
        cause: timeout.reason,
      });
    }
    throw new TrackerError("UDP tracker announce failed", { cause: lastError });
  }
}

async function announceAttempt(
  request: TrackerAnnounceRequest,
  address: Deno.NetAddr,
  deadline: number,
  signal: AbortSignal,
): Promise<TrackerAnnounceResponse> {
  const socket = Deno.listenDatagram({
    transport: "udp",
    hostname: "0.0.0.0",
    port: 0,
  });
  try {
    const connectTransaction = randomUint32();
    const connect = new Uint8Array(16);
    const connectView = new DataView(connect.buffer);
    connectView.setBigUint64(0, CONNECT_MAGIC);
    connectView.setUint32(8, 0);
    connectView.setUint32(12, connectTransaction);
    await socket.send(connect, address);
    const connectResponse = await receive(
      socket,
      address,
      remainingMs(deadline),
      signal,
    );
    const connectionId = parseConnectResponse(
      connectResponse,
      connectTransaction,
    );

    const transaction = randomUint32();
    const packet = new Uint8Array(98);
    const view = new DataView(packet.buffer);
    view.setBigUint64(0, connectionId);
    view.setUint32(8, 1);
    view.setUint32(12, transaction);
    packet.set(request.infoHash, 16);
    packet.set(request.peerId, 36);
    view.setBigUint64(56, BigInt(request.downloaded ?? 0));
    view.setBigUint64(64, BigInt(request.left));
    view.setBigUint64(72, BigInt(request.uploaded ?? 0));
    view.setUint32(80, eventCode(request.event));
    view.setUint32(84, 0);
    view.setUint32(88, request.key ?? randomUint32());
    view.setInt32(92, request.numWant ?? -1);
    view.setUint16(96, request.port);
    await socket.send(packet, address);
    return parseAnnounceResponse(
      await receive(socket, address, remainingMs(deadline), signal),
      transaction,
      request.tracker,
    );
  } finally {
    socket.close();
  }
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

function parseConnectResponse(bytes: Uint8Array, transaction: number): bigint {
  if (bytes.length < 8) {
    throw new TrackerError("UDP connect response is truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const action = view.getUint32(0);
  if (view.getUint32(4) !== transaction) {
    throw new TrackerError("UDP connect transaction mismatch");
  }
  if (action === 3) throw new TrackerError(decodeError(bytes));
  if (action !== 0 || bytes.length < 16) {
    throw new TrackerError("UDP connect response is invalid");
  }
  return view.getBigUint64(8);
}

/** Parses and validates a UDP announce response packet. */
export function parseAnnounceResponse(
  bytes: Uint8Array,
  transaction: number,
  tracker = "udp://tracker.invalid:80",
): TrackerAnnounceResponse {
  if (bytes.length < 8) {
    throw new TrackerError("UDP announce response is truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const action = view.getUint32(0);
  if (view.getUint32(4) !== transaction) {
    throw new TrackerError("UDP announce transaction mismatch");
  }
  if (action === 3) throw new TrackerError(decodeError(bytes));
  if (action !== 1 || bytes.length < 20 || (bytes.length - 20) % 6 !== 0) {
    throw new TrackerError("UDP announce response is invalid");
  }
  const interval = view.getUint32(8);
  if (interval < 1) {
    throw new TrackerError("UDP announce response has no valid interval");
  }
  return {
    tracker,
    interval,
    incomplete: view.getUint32(12),
    complete: view.getUint32(16),
    peers: parseCompactIpv4Peers(bytes.subarray(20)),
  };
}

async function receive(
  socket: Deno.DatagramConn,
  expectedAddress: Deno.NetAddr,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw signal.reason;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (signal.aborted) throw signal.reason;
    const [bytes, address] = await receiveOnce(
      socket,
      remainingMs(deadline),
      signal,
    );
    if (sameUdpAddress(address, expectedAddress)) return bytes;
  }
}

/** @internal Receives one datagram while honoring an already-aborted signal. */
export async function receiveOnce(
  socket: Deno.DatagramConn,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<[Uint8Array, Deno.Addr]> {
  if (signal.aborted) throw signal.reason;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  return await new Promise<[Uint8Array, Deno.Addr]>((resolve, reject) => {
    const abort = () => reject(combined.reason);
    combined.addEventListener("abort", abort, { once: true });
    if (combined.aborted) {
      combined.removeEventListener("abort", abort);
      reject(combined.reason);
      return;
    }
    socket.receive().then(
      (packet) => {
        combined.removeEventListener("abort", abort);
        resolve(packet);
      },
      (error) => {
        combined.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function sameUdpAddress(actual: Deno.Addr, expected: Deno.NetAddr): boolean {
  return actual.transport === "udp" && actual.hostname === expected.hostname &&
    actual.port === expected.port;
}

async function resolveIpv4Hostnames(
  hostname: string,
  signal: AbortSignal,
): Promise<string[]> {
  if (isIpv4Address(hostname)) return [hostname];
  if (hostname.includes(":") || hostname.startsWith("[") || !hostname) {
    throw new TrackerError("UDP trackers currently require an IPv4 address");
  }
  const addresses = await Deno.resolveDns(hostname, "A", { signal });
  const unique = [...new Set(addresses.filter(isIpv4Address))];
  if (unique.length === 0) {
    throw new TrackerError("UDP tracker hostname has no IPv4 address");
  }
  return unique;
}

function isIpv4Address(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function decodeError(bytes: Uint8Array): string {
  return new TextDecoder().decode(
    bytes.subarray(8, Math.min(bytes.length, 8 + 1024)),
  ) ||
    "UDP tracker returned an error";
}

function eventCode(event: TrackerAnnounceRequest["event"]): number {
  return event === "completed"
    ? 1
    : event === "started"
    ? 2
    : event === "stopped"
    ? 3
    : 0;
}

function randomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

```

---

## Arquivo: `docs/deno-torrent/utp/blocking_buffer.ts`

```ts
import { assert } from "std/assert/assert.ts";
import { Buffer } from "std/io/buffer.ts";
// 用于处理缓冲区操作，实现了写入和读取的同步处理
export class BlockingBuffer {
  private totalBytesWritten: number; // 写入的总字节数
  private totalBytesRead: number; // 读取的总字节数
  private buffer: Buffer;
  // 函数数组，存储着读操作的解析函数（当写入数据时将调用这些函数）
  private readResolvers: {
    resolve: (value: number | null) => void;
    reject: (reason?: unknown) => void;
    buf: Uint8Array;
  }[];
  // 缓冲区是否关闭的标志
  private closed: boolean = false;
  // 标记不再有新数据写入（收到远端 FIN 后），但现有数据仍可读取
  private closedForWriting: boolean = false;
  // Writers are serialized so concurrent capacity checks cannot overcommit.
  private writeTail: Promise<void> = Promise.resolve();
  // Readers wake writers that are waiting for enough byte capacity.
  private capacityResolvers: Set<() => void> = new Set();
  // 接收缓冲区最大字节数（用于向发送方广播剩余接收窗口）
  readonly maxBytes: number;

  constructor(maxBytes: number = 256 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError(
        "BlockingBuffer maxBytes must be a positive integer",
      );
    }
    // 构造函数中初始化 buffer 和 readResolvers
    this.buffer = new Buffer();
    this.readResolvers = [];
    this.totalBytesWritten = 0;
    this.totalBytesRead = 0;
    this.maxBytes = maxBytes;
  }

  get totalWritten(): number {
    return this.totalBytesWritten;
  }

  get totalRead(): number {
    return this.totalBytesRead;
  }

  // 获取缓冲区的剩余空间（相对于固定上限 maxBytes，用于广播接收窗口）
  get freeSpace(): number {
    return Math.max(0, this.maxBytes - this.buffer.length);
  }

  // 缓冲区中的数据长度
  get length(): number {
    return this.buffer.length;
  }

  // write 方法为异步，用于向缓冲区写入数据，返回写入的字节数
  async write(data: Uint8Array): Promise<number> {
    if (data.length > this.maxBytes) {
      throw new RangeError(
        `write size ${data.length} exceeds buffer capacity ${this.maxBytes}`,
      );
    }

    const previousWrite = this.writeTail;
    let releaseWrite!: () => void;
    this.writeTail = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    await previousWrite;
    try {
      while (data.length > this.freeSpace) {
        this.assertWritable();
        await new Promise<void>((resolve) =>
          this.capacityResolvers.add(resolve)
        );
      }
      this.assertWritable();

      const n = await this.buffer.write(data);
      this.totalBytesWritten += n;

      while (this.readResolvers.length > 0 && this.length > 0) {
        const { resolve, buf } = this.readResolvers.shift()!;
        const readBytes = await this.buffer.read(buf);
        if (readBytes !== null) {
          this.totalBytesRead += readBytes;
          this.notifyCapacityAvailable();
        }
        resolve(readBytes);
      }

      assert(this.length <= this.maxBytes);
      return n;
    } finally {
      releaseWrite();
    }
  }

  // 异步读方法，从内部 Buffer 中读取数据
  async read(buf: Uint8Array): Promise<number | null> {
    // 如果缓冲区已关闭，立即返回 null
    if (this.closed) {
      assert(this.readResolvers.length === 0);
      assert(this.length === 0);
      return null;
    }
    // 如果缓冲区中有数据，直接读取并返回读取的字节
    if (this.length > 0) {
      const n = await this.buffer.read(buf);
      if (n !== null) {
        this.totalBytesRead += n;
        this.notifyCapacityAvailable();
      }
      // console.log(`总共读取 ${this.totalBytesRead} 字节`)
      return n;
    } else {
      // 缓冲区为空：如果已收到 FIN（不再有新数据），返回 null（EOF）
      if (this.closedForWriting) {
        this.closed = true;
        return null;
      }
      // 如果缓冲区为空，则返回一个新的 Promise
      return new Promise<number | null>((resolve, reject) => {
        // 将解析和拒绝函数添加到 readResolvers 数组中
        this.readResolvers.push({ resolve, reject, buf });
      });
    }
  }

  // 软关闭：标记不再有新数据写入（收到远端 FIN）。
  // 现有缓冲数据仍可读取；缓冲区耗尽后 read() 自动返回 null。
  drain(): void {
    if (this.closed || this.closedForWriting) return;
    this.closedForWriting = true;
    this.notifyCapacityAvailable();
    // 若缓冲区已空，立即唤醒所有挂起的 read（返回 null）并标记完全关闭
    if (this.length === 0) {
      this.closed = true;
      for (const { resolve } of this.readResolvers) {
        resolve(null);
      }
      this.readResolvers = [];
    }
  }

  // 关闭缓冲区：清空数据并唤醒所有挂起的 read（返回 null）
  close(): void {
    this.closed = true;
    this.buffer = new Buffer();
    this.notifyCapacityAvailable();
    for (const { resolve } of this.readResolvers) {
      resolve(null);
    }
    this.readResolvers = [];
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  canSafelyClose(): boolean {
    return this.isEmpty() && this.readResolvers.length === 0 && !this.closed;
  }

  trySafeClose(): boolean {
    if (this.closed) return false;
    if (this.canSafelyClose()) {
      this.close();
      return true;
    }
    return false;
  }

  private assertWritable(): void {
    if (this.closed || this.closedForWriting) {
      throw new Error("BlockingBuffer is closed for writing");
    }
  }

  private notifyCapacityAvailable(): void {
    const resolvers = [...this.capacityResolvers];
    this.capacityResolvers.clear();
    for (const resolve of resolvers) resolve();
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/blocking_map.ts`

```ts
export class BlockingMap<K, V> implements IterableIterator<[K, V]> {
  #map: Map<K, V>;
  #capacity: number;
  #waitingSetters: Array<[
    K,
    V,
    (value: void) => void,
    (reason?: unknown) => void,
  ]> = [];

  constructor(capacity: number) {
    this.#map = new Map();
    this.#capacity = capacity;
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.#map[Symbol.iterator]();
  }

  next(...args: [] | [undefined]): IteratorResult<[K, V], unknown> {
    return this.#map[Symbol.iterator]().next(...args);
  }

  // 如果已满，则等待
  async set(key: K, value: V): Promise<void> {
    if (this.#map.size < this.#capacity) {
      this.#map.set(key, value);
      this.resolveNextSetter();
    } else {
      // 等待直到有空间可用
      await new Promise<void>((resolve, reject) => {
        this.#waitingSetters.push([key, value, resolve, reject]);
      });
    }
  }

  get size(): number {
    return this.#map.size;
  }

  get capacity(): number {
    return this.#capacity;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  delete(key: K): boolean {
    const result = this.#map.delete(key);
    if (result) {
      this.resolveNextSetter();
    }
    return result;
  }

  values(): IterableIterator<V> {
    return this.#map.values();
  }

  keys(): IterableIterator<K> {
    return this.#map.keys();
  }

  clear(): void {
    this.#map.clear();
    this.resolveNextSetter();
  }

  abort(reason: unknown): void {
    this.#map.clear();
    const waitingSetters = this.#waitingSetters.splice(0);
    for (const [, , , reject] of waitingSetters) reject(reason);
  }

  // 更新最大尺寸并解决等待中的setter（如果有空间的话）
  updateCapacity(capacity: number): void {
    this.#capacity = capacity;
    this.resolveNextSetter();
  }

  private resolveNextSetter(): void {
    while (this.#waitingSetters.length > 0 && this.#map.size < this.#capacity) {
      const [key, value, resolve] = this.#waitingSetters.shift()!;
      this.#map.set(key, value);
      resolve();
    }
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/blocking_queue.ts`

```ts
/**
 * 阻塞队列
 * Blocking Queue
 */
export class BlockingQueue<T> {
  private queue: Array<T>;
  private maxSize: number;
  private resolveWaiting: ((value: Promise<void> | void) => void) | null = null;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.queue = new Array<T>();
  }

  // 添加元素到队列，如果队列满了，则等待
  // add an element to the queue, if the queue is full, wait
  async enqueue(item: T): Promise<void> {
    // 如果队列已满，则等待
    // if the queue is full, wait
    while (this.isFull()) {
      await new Promise<void>((resolve) => {
        this.resolveWaiting = resolve;
      });
    }

    this.queue.push(item);

    // 如果有消费者在等待，则通知其可以继续消费
    // if there is a consumer waiting, notify it that it can continue to consume
    if (this.resolveWaiting) {
      this.resolveWaiting();
      this.resolveWaiting = null;
    }
  }

  // 从队列中移除并返回一个元素，如果队列为空，则等待
  // remove and return an element from the queue, if the queue is empty, wait
  async dequeue(): Promise<T> {
    // 如果队列为空，则等待
    // if the queue is empty, wait
    while (this.isEmpty()) {
      await new Promise<void>((resolve) => {
        this.resolveWaiting = resolve;
      });
    }

    const item = this.queue.shift()!;

    // 如果有生产者在等待，则通知其可以继续生产
    // if there is a producer waiting, notify it that it can continue to produce
    if (this.resolveWaiting) {
      this.resolveWaiting();
      this.resolveWaiting = null;
    }

    return item;
  }

  get size(): number {
    return this.queue.length;
  }

  get availableCapacity(): number {
    return this.maxSize - this.queue.length;
  }

  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue = [];
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/circular_queue.ts`

```ts
export class CircularQueue<T> {
  #capacity: number;
  #items: Map<number, T>;
  #oldestKey?: number; // Keeps track of the smallest seqNumber in the queue

  constructor(capacity: number) {
    this.#capacity = capacity;
    this.#items = new Map();
    this.#oldestKey = undefined;
  }

  get size(): number {
    return this.#items.size;
  }

  get capacity(): number {
    return this.#capacity;
  }

  keys(): Array<number> {
    // return the keys in ascending order, from smallest to largest
    return [...this.#items.keys()].sort((a, b) => a - b);
  }

  // get the maximum key
  maxKey(): number | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    return Math.max(...this.#items.keys());
  }

  // get the minimum key
  minKey(): number | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    return Math.min(...this.#items.keys());
  }

  has(key: number): boolean {
    return this.#items.has(key);
  }

  enqueue(key: number, item: T): void {
    // if the key is already in the queue, update the item
    if (this.#items.has(key)) {
      this.#items.set(key, item);
      return;
    }

    // If we've reached capacity, remove the oldest item
    if (this.isAtCapacity()) {
      if (this.#oldestKey !== undefined) {
        this.#items.delete(this.#oldestKey);
      }
    }

    this.#items.set(key, item);
    this.updateOldestKey();
  }

  dequeueByKey(key: number): T | undefined {
    const item = this.#items.get(key);
    if (item) {
      this.#items.delete(key);
      // if the dequeued item is the oldest item, update the oldestKey
      if (key === this.#oldestKey) {
        this.updateOldestKey();
      }
    }
    return item;
  }

  /**
   * find the oldest key
   * @returns
   */
  private updateOldestKey(): void {
    if (this.isEmpty()) {
      this.#oldestKey = undefined;
      return;
    }

    const keys = [...this.#items.keys()];
    this.#oldestKey = Math.min(...keys);
  }

  /**
   * Check if the queue is at capacity
   * @returns
   */
  isAtCapacity(): boolean {
    return this.#items.size >= this.capacity;
  }

  isEmpty(): boolean {
    return this.#items.size === 0;
  }

  clear(): void {
    this.#items.clear();
    this.#oldestKey = undefined;
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/logger.ts`

```ts
/** A lightweight logger owned by one endpoint context. */
export class Logger {
  #debugEnabled: boolean;

  constructor(readonly tag = "", debugEnabled = false) {
    this.#debugEnabled = debugEnabled;
  }

  get debugEnabled(): boolean {
    return this.#debugEnabled;
  }

  /**
   * 启用日志
   */
  enable(): void {
    this.#debugEnabled = true;
  }

  /**
   * 禁用日志
   */
  disable(): void {
    this.#debugEnabled = false;
  }

  /**
   * 获取带颜色的TAG标识
   */
  private getTagPrefix(): string {
    if (!this.tag) return "";
    // 使用不同的颜色来区分不同的TAG
    const tagColor = "\x1b[35m"; // 紫色
    return `[${tagColor}${this.tag}\x1b[0m]`;
  }

  /**
   * 格式化时间
   */
  private formatTime(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    return `${year}-${month}-${day} ${hour}:${
      minute.toString().padStart(2, "0")
    }:${
      second
        .toString()
        .padStart(2, "0")
    }`;
  }

  /**
   * 调试日志
   */
  debug(message?: unknown, ...optionalParams: unknown[]): void {
    if (!this.#debugEnabled) return;

    const time = this.formatTime();
    const formattedTime = `\x1b[36m${time}\x1b[0m`;
    const formattedMessage =
      `[${formattedTime}] ${this.getTagPrefix()} ${message}`;

    console.log(formattedMessage, ...optionalParams);
  }

  /**
   * 错误日志
   */
  error(message?: unknown, ...optionalParams: unknown[]): void {
    const time = this.formatTime();
    const formattedTime = `\x1b[31m${time}\x1b[0m`;
    const formattedMessage =
      `[${formattedTime}] ${this.getTagPrefix()} ${message}`;

    console.error(formattedMessage, ...optionalParams);
  }

  /**
   * 信息日志
   */
  info(message?: unknown, ...optionalParams: unknown[]): void {
    const time = this.formatTime();
    const formattedTime = `\x1b[32m${time}\x1b[0m`;
    const formattedMessage =
      `[${formattedTime}] ${this.getTagPrefix()} ${message}`;

    console.info(formattedMessage, ...optionalParams);
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/mod.ts`

```ts
export * from "@src/utp_socket.ts";
export * from "@src/utp_conn.ts";
export { UtpDeliveryError } from "@src/utp_send_window.ts";

```

---

## Arquivo: `docs/deno-torrent/utp/timer_manager.ts`

```ts
export class TimerManager {
  private static timers: Map<string, ReturnType<typeof setInterval>> =
    new Map();

  /**
   * 创建或更新一个定时检测任务
   * @param key 用于标识定时任务的字符串key
   * @param callback 定时执行的回调函数
   * @param interval 定时器间隔时间（毫秒）
   */
  static setTimer(key: string, callback: () => void, interval: number): void {
    // 如果已存在同名定时器，先清除
    if (this.timers.has(key)) {
      this.clearTimer(key);
    }
    // 创建新的定时器
    const timer = setInterval(callback, interval);
    // 保存定时器引用
    this.timers.set(key, timer);
  }

  /**
   * 判断指定的定时检测任务是否存在
   * @param key
   * @returns
   */
  static exists(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * 清除指定的定时检测任务
   * @param key 用于标识定时任务的字符串key
   */
  static clearTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(key);
    }
  }

  /**
   * 清除所有定时检测任务
   */
  static clearAllTimers(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/util.ts`

```ts
/** Return a uniformly distributed unsigned 16-bit integer. */
export function randomUint16(): number {
  return Math.floor(Math.random() * 0x10000);
}

export function currentMicroseconds(): number {
  return Date.now() * 1000;
}

export function isValidHostname(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === "localhost") return true;
  return isIPv4(hostname) || isIPv6(hostname) || isDomain(hostname);
}

export function isIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
  });
}

export function isIPv6(hostname: string): boolean {
  // 移除方括号（如果存在）
  hostname = hostname.replace(/^\[|\]$/g, "");

  // 检查是否包含双冒号
  const hasDoubleColon = hostname.includes("::");
  if (hasDoubleColon) {
    // 确保只有一个双冒号
    if ((hostname.match(/::/g) || []).length > 1) return false;

    // 替换双冒号为一个特殊标记
    const parts = hostname.split("::");
    if (parts.length > 2) return false;

    const before = parts[0] ? parts[0].split(":") : [];
    const after = parts[1] ? parts[1].split(":") : [];

    // 计算需要补充的零段数
    const missing = 8 - (before.length + after.length);
    if (missing < 0) return false;

    // 验证每个部分
    return [...before, ...after].every((part) =>
      /^[0-9a-fA-F]{1,4}$/.test(part)
    );
  } else {
    // 没有压缩的情况
    const parts = hostname.split(":");
    if (parts.length !== 8) return false;
    return parts.every((part) => /^[0-9a-fA-F]{1,4}$/.test(part));
  }
}

export function isDomain(hostname: string): boolean {
  if (!hostname || hostname.length > 255) return false;

  // 检查每个标签的长度和格式
  const labels = hostname.split(".");
  if (labels.length < 2) return false;

  // 检查是否有连续的点和以点开头或结尾的域名
  if (
    hostname.startsWith(".") || hostname.endsWith(".") ||
    hostname.includes("..")
  ) return false;

  return labels.every((label) => {
    if (!label || label.length > 63) return false;
    // 标签必须以字母数字开头和结尾，中间可以包含连字符
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label);
  });
}

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}

/**
 * 16-bit 序列号回绕安全算术工具
 * 协议序列号为 uint16（0-65535），所有比较必须使用此工具以正确处理回绕。
 * 判断方法：若 (b - a) & 0xFFFF < 0x8000，则认为 a 在 b 之前（a < b）。
 */
export const Seq = {
  /** (a + n) mod 65536，n 可为负数 */
  add(a: number, n: number): number {
    return (a + n) & 0xFFFF;
  },
  /** (a - b) mod 65536，即 a 相对 b 的正向距离 */
  diff(a: number, b: number): number {
    return (a - b) & 0xFFFF;
  },
  /** a < b（回绕安全） */
  lt(a: number, b: number): boolean {
    return a !== b && ((b - a) & 0xFFFF) < 0x8000;
  },
  /** a <= b（回绕安全） */
  le(a: number, b: number): boolean {
    return a === b || Seq.lt(a, b);
  },
  /** a > b（回绕安全） */
  gt(a: number, b: number): boolean {
    return Seq.lt(b, a);
  },
  /** a >= b（回绕安全） */
  ge(a: number, b: number): boolean {
    return a === b || Seq.gt(a, b);
  },
};

```

---

## Arquivo: `docs/deno-torrent/utp/utp_addr.ts`

```ts
import { hashCode, isIPv6, isValidHostname } from "./util.ts";

export class UtpAddr {
  port: number;
  hostname: string;

  constructor(port: number, hostname: string) {
    // check port and hostname is valid
    if (port < 0 || port > 65535) {
      throw new Error(`invalid port: ${port}`);
    }

    const normalizedHostname =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    if (!isValidHostname(normalizedHostname)) {
      throw new Error(`invalid hostname: ${hostname}`);
    }

    this.port = port;
    this.hostname = normalizedHostname;
  }

  static fromNetAddr(addr: Deno.NetAddr): UtpAddr {
    return new UtpAddr(addr.port, addr.hostname);
  }

  static fromDenoAddr(addr: Deno.Addr): UtpAddr {
    if ("port" in addr && "hostname" in addr) {
      return new UtpAddr(addr.port, addr.hostname);
    }
    throw new Error("invalid addr");
  }

  toString(): string {
    const hostname = isIPv6(this.hostname)
      ? `[${this.hostname}]`
      : this.hostname;
    return `${hostname}:${this.port}`;
  }

  equals(addr: UtpAddr): boolean {
    return this.port === addr.port && this.hostname === addr.hostname;
  }

  hashCode(): number {
    return this.port * 31 + hashCode(this.hostname);
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_congestion_control.ts`

```ts
import type { Logger } from "@src/logger.ts";
import { UtpContext } from "@src/utp_context.ts";

/**
 * UTP拥塞控制类, 用于模拟LEDBAT拥塞控制算法
 */
export class UtpCongestionControl {
  #windowSize: number; // 拥塞窗口大小
  #baseDelay: number; // 基础延迟，最低RTT
  #queueDelay: number; // 队列延迟
  #targetDelay: number; // 目标延迟
  #lastMaxDelay: number; // 上次的最大延迟，用于计算延迟增加
  #gain: number; // LEDBAT增益
  logger: Logger;

  constructor(
    windowSize: number = 1,
    targetDelay: number = 100,
    context: UtpContext = new UtpContext(),
  ) {
    this.#windowSize = windowSize; // 初始拥塞窗口大小 单位为包的数量
    this.#baseDelay = Number.MAX_SAFE_INTEGER; // 初始化基础延迟
    this.#queueDelay = 0; // 初始化队列延迟
    this.#targetDelay = targetDelay; // 设置目标延迟
    this.#lastMaxDelay = 0; // 初始化上次的最大延迟
    this.#gain = 1; // 初始化LEDBAT增益
    this.logger = context.getLogger("CONGESTION_CONTROL");
  }

  // 更新基于外部测量的RTT
  // @param measuredRtt: 测量的当前RTT
  updateRtt(measuredRtt: number): void {
    // 更新基础延迟
    this.#baseDelay = Math.min(this.#baseDelay, measuredRtt);

    // 计算队列延迟
    this.#queueDelay = measuredRtt - this.#baseDelay;

    // 更新拥塞窗口大小
    this.updateWindowSize();
  }

  // 更新拥塞窗口大小
  private updateWindowSize(): void {
    // 计算延迟增加
    const offTarget = (this.#targetDelay - this.#queueDelay) /
      this.#targetDelay;
    const windowIncrease = this.#gain * offTarget;

    if (this.#queueDelay <= this.#targetDelay) {
      // 如果队列延迟未超过目标，则线性增加窗口大小
      this.#windowSize += windowIncrease;
    } else if (this.#queueDelay > this.#lastMaxDelay) {
      // 如果队列延迟超过了上次的最大延迟，则减少窗口大小
      this.#windowSize *= 1 - windowIncrease;
    }

    // 确保窗口大小至少为1
    this.#windowSize = Math.max(this.#windowSize, 1);

    // 向上取整,优化运算速度
    this.#windowSize = Math.ceil(this.#windowSize);

    // 更新上次的最大延迟
    this.#lastMaxDelay = this.#queueDelay;

    this.logState();
  }

  // 丢包事件的处理
  onPacketLoss(): void {
    // 发生丢包时减小窗口大小
    this.#windowSize *= 0.5; // 窗口大小减半
    // 保证窗口大小不小于1
    this.#windowSize = Math.max(this.#windowSize, 1);

    this.logState();
  }

  get windowSize(): number {
    return this.#windowSize;
  }

  private logState(): void {
    this.logger.debug(
      `baseDelay: ${this.#baseDelay}, queueDelay: ${this.#queueDelay}, windowSize: ${this.#windowSize}`,
    );
  }

  reset(): void {
    this.#windowSize = 1;
    this.#baseDelay = Number.MAX_SAFE_INTEGER;
    this.#queueDelay = 0;
    this.#lastMaxDelay = 0;
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_conn.ts`

```ts
import { BlockingBuffer } from "@src/blocking_buffer.ts";
import { CircularQueue } from "@src/circular_queue.ts";
import type { Logger } from "@src/logger.ts";
import { UtpStatistics } from "@src/utp_statistics.ts";
import { currentMicroseconds, Seq } from "@src/util.ts";
import type { UtpAddr } from "@src/utp_addr.ts";
import { UtpSelectiveAckExtension } from "@src/utp_ext_sack.ts";
import { UtpPacket, UtpPacketType } from "@src/utp_packet.ts";
import { UtpDeliveryError, UtpSendWindow } from "@src/utp_send_window.ts";
import { Utp } from "@src/utp_socket.ts";
import { assert } from "std/assert/assert.ts";
import type { Closer, Reader, Writer } from "std/io/mod.ts";

export enum UtpConnState {
  SynSent,
  SynReceived,
  Connected,
  Reset,
  /** Local write side is closed; the read side remains open. */
  FinSent,
  /** Remote write side is closed; local writes remain allowed. */
  FinReceived,
  /** Both write sides are closed while final acknowledgements drain. */
  Closing,
  Closed,
}

export type UtpPacketWithAddr = {
  packet: UtpPacket;
  remoteAddr: UtpAddr;
};

export class UtpConn implements Reader, Writer, Closer {
  static readonly CONNECT_TIMEOUT_MS = 5_000;
  static readonly CLOSE_TIMEOUT_MS = 10_000;
  static readonly #keepAliveIntervalMs = 29_000;
  static readonly #initiatorReceiveQueueSize = 8192;
  static readonly #responderReceiveQueueSize = 4096;
  static readonly #defaultWriteChunkBytes = 64 * 1024;
  #localReceiveId: number;
  #localSendId: number;
  #localSequenceNumber: number;
  #localAcknowledgementNumber: number;
  #localState: UtpConnState;
  #remoteFinPacket?: UtpPacket; // received ST_FIN packet, indicate remote data send finished
  #localFinPacket?: UtpPacket; // sent ST_FIN packet, indicate local data send finished
  #localSynPacket?: UtpPacket; // sent ST_SYN packet, indicate local connection request
  utp: Utp;
  isInitiator: boolean; // is the syn packet sender or not
  remoteAddr: UtpAddr; // remote peer address
  offsetTime: number; // offset time
  lastPacketTimestampMicroseconds!: number; // last receive time
  lastLiveTime: number; // last live time
  peerTimeIsInvalid: boolean; // peer time is invalid
  listeners: ((state: UtpConnState) => void)[];
  recvPacketQueue: CircularQueue<UtpPacket>; // 数据包循环队列,用于接收非连续seq的数据包,并对其排序
  recvBuffer: BlockingBuffer; // 接收缓冲区
  sendWindow: UtpSendWindow;
  statistics: UtpStatistics;
  closeStartTime?: number; // start time of the close process
  logger: Logger;

  /**
   * create a new connection, and wait for connecting
   * @param utp
   * @param initState
   * @param remoteAddr
   * @param sendId
   * @param recvId
   * @param seqNr
   * @param ackNr
   * @returns a new connection that is waiting for connecting
   */
  static connectTo(
    utp: Utp,
    initState: UtpConnState.SynReceived | UtpConnState.SynSent,
    remoteAddr: UtpAddr,
    sendId: number,
    recvId: number,
    seqNr: number,
    ackNr: number,
  ): Promise<UtpConn> {
    return new UtpConn(utp, initState, remoteAddr, sendId, recvId, seqNr, ackNr)
      .waitForConnecting();
  }

  /**
   * create a new connection
   * @param utp
   * @param initState
   * @param remoteAddr
   */
  private constructor(
    utp: Utp,
    initState: UtpConnState.SynReceived | UtpConnState.SynSent,
    remoteAddr: UtpAddr,
    sendId: number,
    recvId: number,
    seqNr: number,
    ackNr: number,
  ) {
    this.utp = utp;
    this.#localState = initState;
    this.#localSendId = sendId;
    this.#localReceiveId = recvId;
    this.#localSequenceNumber = seqNr;
    this.#localAcknowledgementNumber = ackNr;
    this.remoteAddr = remoteAddr;
    this.isInitiator = initState === UtpConnState.SynSent;
    this.offsetTime = 0;
    this.lastLiveTime = performance.now();
    this.peerTimeIsInvalid = false;
    this.listeners = [];

    // 初始化logger，使用连接ID作为标识
    this.logger = utp.context.getLogger(`CONN_${this.connectionKey}`);

    // 根据连接类型动态调整接收队列大小
    const queueSize = this.isInitiator
      ? UtpConn.#initiatorReceiveQueueSize
      : UtpConn.#responderReceiveQueueSize;
    this.recvPacketQueue = new CircularQueue(queueSize);

    this.recvBuffer = new BlockingBuffer();
    this.sendWindow = new UtpSendWindow(this);
    this.statistics = new UtpStatistics();

    utp.addConnection(this);
  }

  get receiveConnectionId(): number {
    return this.#localReceiveId;
  }

  get sendConnectionId(): number {
    return this.#localSendId;
  }

  set sequenceNumber(seqNumber: number) {
    this.#localSequenceNumber = seqNumber & 0xFFFF;
  }

  get sequenceNumber(): number {
    return this.#localSequenceNumber;
  }

  set acknowledgementNumber(ackNumber: number) {
    this.#localAcknowledgementNumber = ackNumber & 0xFFFF;
  }

  /**
   * 接收到的最大确认号
   */
  get acknowledgementNumber(): number {
    return this.#localAcknowledgementNumber;
  }

  set state(state: UtpConnState) {
    if (this.#localState === state) return;
    const oldState = this.#localState;
    const newState = state;
    this.#localState = state;
    this.notifyStateChange(oldState, newState);
  }

  get state(): UtpConnState {
    return this.#localState;
  }

  get tag(): string {
    return `[CONNECTION|${this.connectionKey}|state(${
      UtpConnState[this.state]
    })]`;
  }

  get maxWriteSpeed(): number {
    return this.statistics.maxSentSpeed;
  }

  get minWriteSpeed(): number {
    return this.statistics.minSentSpeed;
  }

  get averageWriteSpeed(): number {
    return this.statistics.averageSentSpeed;
  }

  get maxReadSpeed(): number {
    return this.statistics.maxRecvSpeed;
  }

  get minReadSpeed(): number {
    return this.statistics.minRecvSpeed;
  }

  get averageReadSpeed(): number {
    return this.statistics.averageRecvSpeed;
  }

  /** Stable lookup key for this peer and its paired uTP connection IDs. */
  get connectionKey(): string {
    return UtpConn.createConnectionKey(
      this.remoteAddr,
      this.#localSendId,
      this.#localReceiveId,
    );
  }

  static createConnectionKey(
    remoteAddr: UtpAddr,
    localSendId: number,
    localRecvId: number,
  ): string {
    return `addr(${remoteAddr.toString()})|send_id(${
      localSendId & 0xFFFF
    })|recv_id(${localRecvId & 0xFFFF})`;
  }

  notifyStateChange(oldState: UtpConnState, newState: UtpConnState): void {
    this.logger.debug(
      `[STATE CHANGE]: ${UtpConnState[oldState]} ===> ${
        UtpConnState[newState]
      }`,
    );
    this.listeners.forEach((listener) => {
      listener(this.state);
    });
  }

  addListener(listener: (state: UtpConnState) => void): void {
    this.listeners.push(listener);
  }

  removeListener(listener: (state: UtpConnState) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * handle incoming packet at syn sent state
   * @param packet
   * @param remoteAddr
   * @returns true if the packet is handled, otherwise false
   */
  private handleAtSynSent(packetWithAddr: UtpPacketWithAddr): Promise<boolean> {
    const packet = packetWithAddr.packet;
    if (packet.type !== UtpPacketType.ST_STATE) {
      this.logger.debug(`SynSentState: ignore packet type: ${packet.type}`);
      return Promise.resolve(false);
    }

    // 此时ackNr还没有初始化
    // uTP中ST_STATE（SYN-ACK）不消耗序列号，对端第一个ST_DATA与SYN-ACK使用
    // 相同的seqNr，因此localAckNr需设为seqNr-1，使duplicate检测正常工作
    this.acknowledgementNumber = Seq.add(packet.seqNr, -1);
    this.state = UtpConnState.Connected;
    return Promise.resolve(true);
  }

  /**
   * handle incoming packet at syn received state
   * @param packet
   * @param remoteAddr
   * @returns true if the packet is handled, otherwise false
   */
  private async handleAtSynReceived(
    packetWithAddr: UtpPacketWithAddr,
  ): Promise<boolean> {
    const packet = packetWithAddr.packet;
    if (packet.type !== UtpPacketType.ST_DATA) {
      this.logger.debug(`SynReceivedState: ignore packet type: ${packet.type}`);
      return false;
    }

    // check ack: 客户端应 ACK 我们的 SYN-ACK（SYN-ACK不消耗seqNr，ackNr = seqNr - 1）
    if (packet.ackNr !== Seq.add(this.sequenceNumber, -1)) {
      this.logger.debug(
        `SynReceivedState: ignore packet ackNumber: ${packet.ackNr},because it's not equal to conn.seqNumber-1 ${
          Seq.add(this.sequenceNumber, -1)
        }`,
      );
      return false;
    }

    // 此时ackNr还没有初始化,直接赋值
    this.acknowledgementNumber = packet.seqNr;
    this.state = UtpConnState.Connected;

    // 直接将数据放入payload blocking queue,
    if (packet.data) {
      await this.recvBuffer.write(packet.data);
      // 更新统计数据
      this.statistics.updateRecvData(packet.data.length);
    }

    const selectAckExtension = UtpSelectiveAckExtension.createFromConn(this);
    const ackPacket = UtpPacket.createAckPacket(this, selectAckExtension);

    // 发送ACK
    await this.sendUtpPacket(ackPacket);

    this.logger.debug(`SynReceivedState: connection is connected`);
    return true;
  }

  /**
   * handle incoming packet at connected state
   * @param packet
   * @param remoteAddr
   * @returns true if the packet is handled, otherwise false
   */
  private async handleAtConnected(
    packetWithAddr: UtpPacketWithAddr,
  ): Promise<boolean> {
    const packet = packetWithAddr.packet;

    // 检查连接是否已关闭
    if (this.isClosed()) {
      this.logger.debug(`ConnectedState: 连接已关闭，忽略数据包`);
      return false;
    }

    // 连接建立后,只处理ST_DATA和ST_FIN包
    if (
      packet.type !== UtpPacketType.ST_FIN &&
      packet.type !== UtpPacketType.ST_DATA
    ) {
      this.logger.debug(`ConnectedState: 忽略非数据包类型: ${packet.type}`);
      return false;
    }

    // 丢弃重复的数据包
    if (packet.seqNr === this.acknowledgementNumber) {
      this.logger.debug(
        `ConnectedState: 丢弃重复的数据包 seqNr=${packet.seqNr}`,
      );
      return false;
    }

    if (
      this.#remoteFinPacket && Seq.gt(packet.seqNr, this.#remoteFinPacket.seqNr)
    ) {
      this.logger.debug(
        `ConnectedState: 丢弃超出FIN包序号的数据包 seqNr=${packet.seqNr}, FIN_seqNr=${this.#remoteFinPacket.seqNr}`,
      );
      return false;
    }

    // FIN participates in sequence ordering. Record its boundary immediately,
    // but do not close until every preceding DATA packet has been assembled.
    if (packet.type === UtpPacketType.ST_FIN) {
      this.logger.debug(`ConnectedState: 收到FIN包 seqNr=${packet.seqNr}`);
      this.#remoteFinPacket = packet;
    }

    // 检查接收队列是否已满
    if (this.recvPacketQueue.size >= this.recvPacketQueue.capacity) {
      this.logger.debug(
        `ConnectedState: 接收队列已满, 当前大小=${this.recvPacketQueue.size}, 容量=${this.recvPacketQueue.capacity}`,
      );
      // 如果队列已满，尝试处理已有的数据包
      await this.processReceivedPackets();
    }

    // 将收到的所有ST_DATA和ST_FIN包放入接收窗口
    try {
      this.recvPacketQueue.enqueue(packet.seqNr, packet);
      this.logger.debug(
        `ConnectedState: 成功将数据包加入队列 seqNr=${packet.seqNr}, 当前队列大小=${this.recvPacketQueue.size}`,
      );
    } catch (error) {
      this.logger.debug(
        `ConnectedState: 将数据包加入队列失败 seqNr=${packet.seqNr}: ${error}`,
      );
      return false;
    }

    // 处理接收到的数据包
    await this.processReceivedPackets();

    // A FIN may arrive ahead of missing DATA packets. Only expose EOF and
    // start closing once the receive sequence is continuous through the FIN.
    if (
      this.#remoteFinPacket &&
      this.acknowledgementNumber === this.#remoteFinPacket.seqNr
    ) {
      this.updateClosingState();
      this.recvBuffer.drain();
    }

    // 再次检查连接是否已关闭，避免在连接关闭后发送ACK
    if (this.isClosed()) {
      this.logger.debug(`ConnectedState: 连接已关闭，不发送ACK`);
      return true;
    }

    try {
      const selectAckExtension = UtpSelectiveAckExtension.createFromConn(this);
      const ackPacket = UtpPacket.createAckPacket(this, selectAckExtension);

      // 无论接收到的ackNr是否连续,都需要发送ACK,因为对端可能会重发数据包
      await this.sendUtpPacket(ackPacket);
      this.logger.debug(
        `ConnectedState: 发送ACK包 ackNr=${this.acknowledgementNumber}`,
      );
    } catch (error) {
      this.logger.debug(`ConnectedState: 发送ACK包失败: ${error}`);
    }

    if (
      this.#remoteFinPacket &&
      this.acknowledgementNumber === this.#remoteFinPacket.seqNr
    ) {
      await this.trySafeRelease();
    }

    return true;
  }

  private async processReceivedPackets(): Promise<void> {
    // Consume by the next expected sequence instead of numerically sorting the
    // queue. Numeric ordering is incorrect across the uint16 wrap boundary.
    for (;;) {
      const seq = Seq.add(this.acknowledgementNumber, 1);
      const packet = this.recvPacketQueue.dequeueByKey(seq);
      if (!packet) break;

      this.acknowledgementNumber = seq;
      this.logger.debug(`ProcessReceivedPackets: 更新ackNr=${seq}`);

      if (packet.data && packet.type === UtpPacketType.ST_DATA) {
        try {
          await this.recvBuffer.write(packet.data);
          this.statistics.updateRecvData(packet.data.length);
          this.logger.debug(
            `ProcessReceivedPackets: 成功写入数据到接收缓冲区 seq=${seq}, 数据大小=${packet.data.length}`,
          );
        } catch (error) {
          this.logger.debug(
            `ProcessReceivedPackets: 写入数据到接收缓冲区失败 seq=${seq}: ${error}`,
          );
        }
      }
    }
  }

  /**
   * handle incoming packet,but ST_SYN and ST_RESET packet will not be handled here
   * @param incomingPacket
   * @param addr
   * @returns
   */
  async handleIncomingPacket(
    packetWithAddr: UtpPacketWithAddr,
  ): Promise<boolean> {
    this.logger.debug(
      `=======> ${UtpConnState[this.state]}: handleIncomingPacket`,
    );
    this.logger.debug(packetWithAddr.packet.toString());

    // Every non-reset uTP packet carries a cumulative ack_nr. Real peers may
    // piggyback acknowledgements on DATA/FIN instead of sending a standalone
    // STATE packet, so all of those headers must advance the send window.
    if (packetWithAddr.packet.type !== UtpPacketType.ST_RESET) {
      await this.sendWindow.handleAck(packetWithAddr.packet);
    }

    let handled = false;
    switch (this.state) {
      case UtpConnState.SynSent:
        handled = await this.handleAtSynSent(packetWithAddr);
        break;
      case UtpConnState.SynReceived:
        handled = await this.handleAtSynReceived(packetWithAddr);
        break;
      case UtpConnState.Connected:
      case UtpConnState.FinSent:
      case UtpConnState.FinReceived:
        handled = await this.handleAtConnected(packetWithAddr);
        break;
      case UtpConnState.Closing:
        handled = packetWithAddr.packet.type === UtpPacketType.ST_STATE;
        await this.trySafeRelease();
        break;
      case UtpConnState.Closed:
      case UtpConnState.Reset:
        // 已关闭或重置的连接不处理任何包
        break;
      default:
        this.logger.debug(`未知状态: ${UtpConnState[this.state]}`);
        break;
    }

    if (handled) {
      this.lastPacketTimestampMicroseconds = currentMicroseconds();
    }

    return handled;
  }

  /**
   * 等待连接建立，这里需要处理两种情况，一种是本地是SYN包的发送方，一种是本地是SYN包的接收方
   */
  private async waitForConnecting(): Promise<UtpConn> {
    this.logger.debug(`${this.tag} is waiting for connecting`);

    // 如果已经连接，直接解决 Promise
    if (this.state === UtpConnState.Connected) {
      this.logger.debug(`${this.tag} is already connected`);
      return this;
    }

    let packet: UtpPacket;
    // 发起连接尝试
    if (this.isInitiator) {
      packet = UtpPacket.createSynPacket(this);
      this.#localSynPacket = packet;
      // SYN 消耗一个序列号，与服务端的 SYN-ACK 保持一致
      // BEP 29：发送方下一个 DATA 的 seqNr 必须比 SYN 大 1
      this.sequenceNumber++;
    } else {
      packet = UtpPacket.createAckPacket(this);
      // uTP中ST_STATE（SYN-ACK）不消耗序列号——与Transmission等主流实现保持一致：
      // 服务端第一个ST_DATA与SYN-ACK共用同一seqNr。
      // STATE does not consume a sequence number, so the first DATA reuses it.
    }

    await this.sendUtpPacket(packet);

    // 返回一个新的 Promise，它会在状态变为 CONNECTED 时解决
    return new Promise((resolve, reject) => {
      // 设置连接超时
      const timeoutId = setTimeout(() => {
        this.removeListener(onStateChange);
        reject(
          new Error(
            `Connection timeout after ${UtpConn.CONNECT_TIMEOUT_MS}ms`,
          ),
        );
      }, UtpConn.CONNECT_TIMEOUT_MS);

      // 状态变化监听器
      const onStateChange = (state: UtpConnState): void => {
        if (state === UtpConnState.Connected) {
          this.removeListener(onStateChange);
          clearTimeout(timeoutId);
          resolve(this);
        } else if (state === UtpConnState.Reset) {
          this.removeListener(onStateChange);
          clearTimeout(timeoutId);
          reject(new Error("Connection reset by remote"));
        } else if (state === UtpConnState.Closed) {
          this.removeListener(onStateChange);
          clearTimeout(timeoutId);
          reject(new Error("Connection is closed"));
        }
      };

      try {
        // 添加状态变化监听器
        this.addListener(onStateChange);
      } catch (e) {
        // 移除状态变化监听器和超时定时器
        this.removeListener(onStateChange);
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  async read(buffer: Uint8Array): Promise<number | null> {
    return await this.recvBuffer.read(buffer);
  }

  /**
   * 获取最大允许发送的数据包大小,也就是此大小的数据包不会被分片
   * get the maximum allowed size of the data packet sent, that is, the data packet of this size will not be fragmented
   */
  get maxPacketSize(): number {
    return Utp.DEFAULT_MTU;
  }

  /**
   * write data to the connection
   * @param bytes data to write
   */
  async write(dataToSend: Uint8Array): Promise<number> {
    this.sendWindow.assertHealthy();
    if (this.isClosed()) {
      throw new Error(`Cannot send packet on closed connection ${this.tag}`);
    }
    if (!this.canWrite()) {
      throw new Error(`Cannot write after local FIN on connection ${this.tag}`);
    }
    this.logger.debug(`Write: 开始发送数据, 总大小=${dataToSend.length}`);

    const chunkSize = Math.min(
      UtpConn.#defaultWriteChunkBytes,
      Utp.DEFAULT_MTU - UtpPacket.HEADER_SIZE,
    );
    let offset = 0;

    while (offset < dataToSend.length) {
      // 创建分片
      const chunk = dataToSend.subarray(offset, offset + chunkSize);
      this.logger.debug(
        `Write: 创建数据分片, 大小=${chunk.length}, 偏移量=${offset}`,
      );

      // 创建数据包以获取实际的扩展大小
      const dataPacket = UtpPacket.createDataPacket(this, chunk);

      // 发送数据包
      const n = await this.sendUtpPacket(dataPacket);
      this.logger.debug(
        `Write: 发送数据包, 大小=${n}, seqNr=${dataPacket.seqNr}`,
      );

      assert(
        n === dataPacket.byteLength,
        `发送的数据包长度不等于要发送的数据包长度,发送的数据包长度${n},要发送的数据包长度${dataPacket.byteLength}`,
      );

      // 更新发送统计
      this.statistics.updateSentData(chunk.length);

      // 更新偏移量
      offset += chunk.length;
    }

    assert(
      dataToSend.length === offset,
      `发送的数据长度不等于要发送的数据长度,发送的数据长度${offset},要发送的数据长度${dataToSend.length}`,
    );

    this.logger.debug(`Write: 数据发送完成, 总大小=${offset}`);
    return dataToSend.length;
  }

  /** Wait until all DATA packets queued by write() have been acknowledged. */
  async flush(): Promise<void> {
    await this.sendWindow.flush();
  }

  get receiveWindowBytes(): number {
    return this.recvBuffer.freeSpace;
  }

  /**
   * check if the connection is timeout
   */
  async timeoutCheck(): Promise<void> {
    switch (this.state) {
      case UtpConnState.SynSent: {
        const isConnectTimeout = this.#localSynPacket &&
          currentMicroseconds() -
                this.#localSynPacket.timestampMicroseconds >
            UtpConn.CONNECT_TIMEOUT_MS * 1000;
        if (isConnectTimeout) {
          this.logger.debug(
            `Connection ${this.tag} connect timeout, force close`,
          );
          this.forceClose();
        }
        break;
      }
      case UtpConnState.SynReceived:
      case UtpConnState.Connected:
      case UtpConnState.FinReceived:
        {
          // 检查是否需要发送keep alive包
          const now = performance.now();
          if (now - this.lastLiveTime > UtpConn.#keepAliveIntervalMs) {
            this.logger.debug(
              `Connection ${this.tag} sending keep alive packet`,
            );
            await this.sendUtpPacket(
              UtpPacket.createAckPacket(
                this,
                UtpSelectiveAckExtension.createFromConn(this),
              ),
            );
            this.lastLiveTime = now;
          }

          // 检查连接是否超时
          await this.sendWindow.timeoutCheck();
        }
        break;
      case UtpConnState.FinSent:
      case UtpConnState.Closing: {
        await this.sendWindow.timeoutCheck();
        await this.trySafeRelease();
        break;
      }
      default:
        break;
    }
  }

  /**
   * 安全关闭连接的善后工作
   * 1.查看是否还有待ACK的数据包,可能存在丢包,需要重发
   * 2.发送ST_FIN包,通知对方数据发送完毕
   * 3.等待对方发送ST_FIN包,通知数据接收完毕
   * 4.关闭连接
   * @returns
   */
  private trySafeRelease(): void {
    if (!this.#localFinPacket && !this.#remoteFinPacket) return;

    this.logger.debug(`try safe release connection ${this.tag}`);

    // 检查是否超时
    const closeStartTime = this.closeStartTime || performance.now();
    if (performance.now() - closeStartTime > UtpConn.CLOSE_TIMEOUT_MS) {
      this.logger.debug(`Connection ${this.tag} close timeout, force close`);
      this.forceClose();
      return;
    }

    // Both directions have reached EOF and every tracked DATA/FIN packet has
    // been acknowledged. The connection can now be removed safely.
    if (
      this.#localFinPacket && this.#remoteFinPacket &&
      this.sendWindow.isEmpty()
    ) {
      this.logger.debug(
        `Remote FIN packet received and send window is empty, closing connection`,
      );
      this.forceClose();
      return;
    }

    this.updateClosingState();
  }

  /** Close only the local write side and keep receiving until remote FIN. */
  async closeWrite(): Promise<void> {
    if (this.isClosed() || this.state === UtpConnState.Reset) return;
    if (this.#localFinPacket) {
      await this.flush();
      return;
    }
    if (!this.canWrite()) {
      throw new Error(
        `Connection is not writable in ${UtpConnState[this.state]}`,
      );
    }

    await this.flush();
    this.closeStartTime ??= performance.now();
    this.#localFinPacket = UtpPacket.createFinPacket(this);
    this.updateClosingState();
    await this.sendUtpPacket(this.#localFinPacket);
    await this.flush();
    await this.trySafeRelease();
  }

  /**
   * close the connection
   */
  async close(): Promise<void> {
    if (this.isClosed()) {
      this.logger.debug(`Connection ${this.tag} is already closed`);
      return;
    }

    if (this.state === UtpConnState.Reset) {
      this.logger.debug(`Connection ${this.tag} is already reset`);
      return;
    }

    if (
      this.state === UtpConnState.SynSent ||
      this.state === UtpConnState.SynReceived
    ) {
      this.forceClose();
      return;
    }

    try {
      await this.closeWrite();
    } catch (error) {
      this.forceClose();
      throw error;
    }
  }

  reset(): void {
    this.logger.debug(`Reset connection ${this.tag}`);
    this.utp.removeConnection(this);
    this.statistics.release();
    this.state = UtpConnState.Reset;
    this.recvPacketQueue.clear();
    this.#remoteFinPacket = undefined;
    this.sendWindow.reset(
      new UtpDeliveryError(
        "Connection reset before pending data was delivered",
      ),
    );
    this.sendUtpPacket(UtpPacket.createResetPacket(this));
  }

  /**
   * send utp packet to remote address
   * @param outgoingPacket
   * @returns
   */
  async sendUtpPacket(outgoingPacket: UtpPacket): Promise<number> {
    this.lastLiveTime = performance.now();
    this.logger.debug(
      "=======> Send utp packet to remote address",
      this.remoteAddr,
    );
    this.logger.debug(outgoingPacket.toString());

    // 检查连接状态，如果已关闭则抛出异常
    if (this.isClosed()) {
      throw new Error(`Cannot send packet on closed connection ${this.tag}`);
    }

    // sendWindow只有在连接建立后才会启用
    // 优先将数据包放入发送窗口后,再发送数据包
    // 只将ST_DATA和ST_FIN包放入发送窗口,其他包不放入发送窗口
    if (
      [UtpPacketType.ST_DATA, UtpPacketType.ST_FIN].includes(
        outgoingPacket.type,
      )
    ) {
      await this.sendWindow.waitForAck({
        packet: outgoingPacket,
        remoteAddr: this.remoteAddr,
      });
    }

    // 发送数据包
    return await this.utp.sendUtpPacket(outgoingPacket, this.remoteAddr);
  }

  isConnected(): boolean {
    return [UtpConnState.Connected, UtpConnState.FinReceived].includes(
      this.state,
    );
  }

  isClosed(): boolean {
    return this.state === UtpConnState.Closed;
  }

  private canWrite(): boolean {
    return [UtpConnState.Connected, UtpConnState.FinReceived].includes(
      this.state,
    );
  }

  private updateClosingState(): void {
    if (this.isClosed() || this.state === UtpConnState.Reset) return;
    if (this.#localFinPacket && this.#remoteFinPacket) {
      this.state = UtpConnState.Closing;
    } else if (this.#localFinPacket) {
      this.state = UtpConnState.FinSent;
    } else if (this.#remoteFinPacket) {
      this.state = UtpConnState.FinReceived;
    }
  }

  private forceClose(): void {
    this.logger.debug(`Force closing connection ${this.tag}`);
    if (!this.sendWindow.isEmpty()) {
      this.sendWindow.abort(
        new UtpDeliveryError(
          "Connection closed before pending data was delivered",
        ),
      );
    }
    // drain() 而非 close()：保留缓冲区内尚未读取的数据，让应用层可以继续读取；
    // 缓冲区耗尽后 read() 自动返回 null（EOF）。
    this.recvBuffer.drain();
    this.utp.removeConnection(this);
    this.statistics.release();
    this.state = UtpConnState.Closed;
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_context.ts`

```ts
// src/utp_context.ts
import { Logger } from "./logger.ts";

/** Owns loggers and debug state for one uTP endpoint. */
export class UtpContext {
  #debugEnabled = false;
  readonly #loggers = new Map<string, Logger>();

  constructor(readonly endpointTag = "") {}

  getLogger(moduleType: string): Logger {
    const key = `${this.endpointTag}:${moduleType}`;
    let logger = this.#loggers.get(key);
    if (!logger) {
      logger = new Logger(key, this.#debugEnabled);
      this.#loggers.set(key, logger);
    }
    return logger;
  }

  get debugEnabled(): boolean {
    return this.#debugEnabled;
  }

  setDebug(enabled: boolean): void {
    this.#debugEnabled = enabled;
    for (const logger of this.#loggers.values()) {
      if (enabled) {
        logger.enable();
      } else {
        logger.disable();
      }
    }
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_ext_bits.ts`

```ts
import { type Extension, ExtensionType } from "./utp_packet.ts";

/**
 * BEP 29 Extension Bits（类型 2）
 *
 * 8 字节（64 位）能力协商位，随连接握手包发送，用于双方协商扩展能力。
 * 目前所有位均为 0，表示无额外能力；解析时保留对端的位以备未来使用。
 *
 * 位掩码布局（暂未分配，全部保留）：
 *   byte 0 bit 0 … byte 7 bit 7 均为保留位
 */
export class UtpExtensionBits implements Extension {
  readonly type = ExtensionType.ExtensionBits;
  /** 8 字节能力位，0 表示不支持该能力 */
  readonly bits: Uint8Array;

  static readonly BITS_LENGTH = 8; // 固定 8 字节

  private constructor(bits: Uint8Array) {
    this.bits = bits;
  }

  /** 创建全零的 Extension Bits（本端不声明任何能力） */
  static create(): UtpExtensionBits {
    return new UtpExtensionBits(new Uint8Array(UtpExtensionBits.BITS_LENGTH));
  }

  /** 从网络字节流解析 Extension Bits */
  static createFromBytes(payload: Uint8Array): UtpExtensionBits {
    if (payload.length !== UtpExtensionBits.BITS_LENGTH) {
      throw new Error(
        `Extension Bits payload must be ${UtpExtensionBits.BITS_LENGTH} bytes, got ${payload.length}`,
      );
    }
    return new UtpExtensionBits(new Uint8Array(payload));
  }

  toBytes(): Uint8Array {
    return this.bits;
  }

  toString(): string {
    const hex = Array.from(this.bits)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `ExtensionBits{0x${hex}}`;
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_ext_sack.ts`

```ts
import type { UtpConn } from "./utp_conn.ts";
import { type Extension, ExtensionType } from "./utp_packet.ts";
import { Seq } from "@src/util.ts";

/**
 * 仅在接收流中至少有一个序列号被跳过时才发送选择性 ACK。
 * 因此，掩码中的第一个比特表示 ack_nr + 2。在发送此数据包时，假定 ack_nr + 1 已被删除或丢失。
 * 设置的比特(1)表示已接收的数据包，清除的比特(0)表示尚未接收的数据包。
 *
 * bitmask layout
 * first byte [ack+2...ack+2+7] is reverse order,second byte [ack+2+8...ack+2+15] is reverse order, and so on
 *
 * 0               8               16
 * +---------------+---------------+---------------+---------------+
 * | 9 8 ...   3 2 | 17   ...   10 | 25   ...   18 | 33   ...   26 |
 * +---------------+---------------+---------------+---------------+
 */
export class UtpSelectiveAckExtension implements Extension {
  base: number; // ack_nr
  type: ExtensionType;
  // 位掩码,用于表示哪些包已收到,哪些没收到,第一位表示ack_nr+2,第二位表示ack_nr+2+1,第三位表示ack_nr+2+2,以此类推,1表示已接收,0表示未接收
  // bitmask的长度至少是32的倍数
  bitmask: Uint8Array;

  private constructor(base: number, bitmask: Uint8Array) {
    this.base = base;
    this.type = ExtensionType.SelectiveAcknowledgement;
    this.bitmask = bitmask;
  }

  /**
   * 从字节数组创建SACK扩展
   * @param bitmask
   * @returns
   */
  static createFromBytes(
    localAckNr: number,
    bitmask: Uint8Array,
  ): UtpSelectiveAckExtension {
    // bitmask单位是bit时,的长度至少是32的倍数,转换成字节，必须是4的倍数
    if (bitmask.length % (32 / 8) !== 0) {
      throw new Error(
        `bitmask length must be a multiple of 32, but got ${bitmask.length}`,
      );
    }
    return new UtpSelectiveAckExtension(localAckNr, bitmask);
  }

  static createFromConn(conn: UtpConn): UtpSelectiveAckExtension | undefined {
    const ackNr = conn.acknowledgementNumber;
    const receivedSequenceNumbers = conn.recvPacketQueue.keys();

    return UtpSelectiveAckExtension.create(ackNr, receivedSequenceNumbers);
  }

  /**
   * 创建SACK扩展
   * @param recvRemoteSeqNrs 已收到的数据包序列号,最小值必须大于等于ackNr+2
   * @returns SACK扩展
   */
  static create(
    localAckNr: number,
    recvRemoteSeqNrs: number[],
  ): UtpSelectiveAckExtension | undefined {
    //     console.log(`
    // Creating SACK extension:
    // - Local ackNr: ${localAckNr}
    // - Received seqNrs: ${recvRemoteSeqNrs.join(', ')}`)

    // 移除条件限制，始终创建SACK
    if (recvRemoteSeqNrs.length === 0) {
      return undefined;
    }

    const firstSeq = Seq.add(localAckNr, 2);
    // 按相对 firstSeq 的正向距离排序，正确处理回绕
    const seqNrs = recvRemoteSeqNrs.sort((a, b) =>
      Seq.diff(a, firstSeq) - Seq.diff(b, firstSeq)
    );
    const MIN_BITMASK_LENGTH = 4; // 最小字节长度,32位,4字节

    // 动态计算bitmask长度
    let bitmaskLength = MIN_BITMASK_LENGTH;
    if (seqNrs.length > 0) {
      const lastSeq = seqNrs[seqNrs.length - 1];
      const totalLength = Seq.diff(lastSeq, firstSeq) + 1;
      const bytesLength = Math.ceil(totalLength / 8);
      bitmaskLength = Math.max(
        MIN_BITMASK_LENGTH,
        Math.ceil(bytesLength / MIN_BITMASK_LENGTH) * MIN_BITMASK_LENGTH,
      );
    }

    // 初始化bitmask
    const bitmask = new Uint8Array(bitmaskLength);

    // 从firstSeq开始设置bitmask
    for (const seqNr of seqNrs) {
      if (Seq.ge(seqNr, firstSeq)) {
        const bitIndex = Seq.diff(seqNr, firstSeq);
        if (bitIndex < bitmaskLength * 8) {
          const byteIndex = Math.floor(bitIndex / 8);
          const bitPosition = bitIndex % 8;
          // 根据文档，位掩码布局是按照反序排列的
          // 对于第一个字节：[ack+2...ack+2+7]
          bitmask[byteIndex] |= 1 << bitPosition;
        }
      }
    }

    //     console.log(`
    // SACK extension created:
    // - Base: ${localAckNr}
    // - Bitmask length: ${bitmaskLength}
    // - First seq: ${firstSeq}
    // - Bitmask: ${bitmaskToBinaryString(bitmask)}`)

    return new UtpSelectiveAckExtension(localAckNr, bitmask);
  }

  // 位掩码转换成字节数组
  toBytes(): Uint8Array {
    return this.bitmask;
  }

  // 根据位掩码获取丢包的序列号
  getMissingSequenceNumbers(): number[] {
    const lostSeqNumbers: number[] = [];
    let seqNr = Seq.add(this.base, 2);

    lostSeqNumbers.push(Seq.add(this.base, 1));

    for (let byteIndex = 0; byteIndex < this.bitmask.length; byteIndex++) {
      for (let bitOffset = 0; bitOffset <= 7; bitOffset++) {
        if ((this.bitmask[byteIndex] & (1 << bitOffset)) === 0) {
          lostSeqNumbers.push(seqNr);
        }
        seqNr = Seq.add(seqNr, 1);
      }
    }

    return lostSeqNumbers;
  }

  // 根据位掩码获取已收到的序列号
  getReceivedSequenceNumbers(): number[] {
    const receivedSeqNumbers: number[] = [];
    let seqNr = Seq.add(this.base, 2);

    for (let byteIndex = 0; byteIndex < this.bitmask.length; byteIndex++) {
      for (let bitOffset = 0; bitOffset <= 7; bitOffset++) {
        if ((this.bitmask[byteIndex] & (1 << bitOffset)) !== 0) {
          receivedSeqNumbers.push(seqNr);
        }
        seqNr = Seq.add(seqNr, 1);
      }
    }

    return receivedSeqNumbers;
  }

  toString(): string {
    return `UtpSelectiveAckExtension{base: ${this.base}, bitmask: ${
      bitmaskToBinaryString(this.bitmask)
    }}`;
  }
}

function bitmaskToBinaryString(bitmask: Uint8Array): string {
  return Array.from(bitmask)
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join(" ");
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_listener.ts`

```ts
import type { Logger } from "@src/logger.ts";
import type { UtpConn } from "@src/utp_conn.ts";
import { UtpContext } from "@src/utp_context.ts";

/** Queues established inbound connections and pending accept calls in FIFO order. */
export class UtpListener implements AsyncIterable<UtpConn> {
  #connections: UtpConn[] = [];
  #pendingConnections: UtpConn[] = [];
  #closed = false;
  #waitingAccepts: Array<{
    resolve: (value: UtpConn) => void;
    reject: (reason: Error) => void;
  }> = [];
  logger: Logger;

  constructor(context: UtpContext = new UtpContext()) {
    this.logger = context.getLogger("UTP_LISTENER");
  }

  addConnection(conn: UtpConn): void {
    if (this.#closed) {
      this.logger.debug("Listener is closed, rejecting connection");
      conn.close();
      return;
    }

    this.#connections.push(conn);

    const waiter = this.#waitingAccepts.shift();
    if (waiter) {
      waiter.resolve(conn);
    } else {
      this.#pendingConnections.push(conn);
    }
  }

  accept(): Promise<UtpConn> {
    if (this.#closed) {
      return Promise.reject(new Error("Listener is closed"));
    }

    if (this.#pendingConnections.length > 0) {
      return Promise.resolve(this.#pendingConnections.shift()!);
    }

    return new Promise<UtpConn>((resolve, reject) => {
      this.#waitingAccepts.push({ resolve, reject });
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const conn of this.#connections) void conn.close();
    this.#connections = [];
    this.#pendingConnections = [];

    for (const waiter of this.#waitingAccepts) {
      waiter.reject(new Error("Listener is closed"));
    }
    this.#waitingAccepts = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<UtpConn> {
    return {
      next: async () => {
        try {
          return { value: await this.accept(), done: false };
        } catch (_error) {
          return { value: undefined, done: true };
        }
      },
    };
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_packet.ts`

```ts
import { currentMicroseconds } from "@src/util.ts";
import type { UtpConn } from "@src/utp_conn.ts";
import { UtpSelectiveAckExtension } from "@src/utp_ext_sack.ts";
import { UtpExtensionBits } from "@src/utp_ext_bits.ts";
import { UtpContext } from "@src/utp_context.ts";
import type { Logger } from "@src/logger.ts";

export enum UtpPacketType {
  ST_DATA = 0,
  ST_FIN = 1,
  ST_STATE = 2,
  ST_RESET = 3,
  ST_SYN = 4,
}

export enum ExtensionType {
  SelectiveAcknowledgement = 1,
  ExtensionBits = 2,
}

export interface Extension {
  type: ExtensionType;
  toBytes(): Uint8Array;
}

/** A BEP 29 uTP packet and its extension chain. */
export class UtpPacket {
  static readonly HEADER_SIZE = 20;
  static readonly EXTENSION_HEADER_SIZE = 2;
  static readonly MIN_PACKET_SIZE = UtpPacket.HEADER_SIZE;
  static readonly MAX_PACKET_SIZE = 1 << 16;

  // type 4 bits
  type: UtpPacketType = UtpPacketType.ST_SYN;
  // version 4 bits
  version: number = 1;
  // Zero means no extension header; DATA payload may still follow directly.
  extension: number = 0;
  // connection id 16 bits(2 bytes)
  connId!: number;
  // timestamp 32 bits(4 bytes), milliseconds since the connection was established
  timestampMicroseconds: number = -1;
  // timestamp difference 32 bits(4 bytes), milliseconds since the last packet was sent
  timestampDifferenceMicroseconds: number = 0;
  // window size 32 bits(4 bytes), the number of bytes that can be sent
  windowSize: number = 0;
  // sequence number 16 bits(2 bytes), the sequence number of the packet
  seqNr: number = 0;
  // acknowledgment number 16 bits(2 bytes), the sequence number of the last packet received
  ackNr: number = 0;
  // extensions
  extensions: Extension[] = [];
  // payload
  data?: Uint8Array;
  logger: Logger;
  constructor(context: UtpContext = new UtpContext()) {
    this.logger = context.getLogger("UTP_PACKET");
  }

  get sackExtension(): UtpSelectiveAckExtension | undefined {
    return this.extensions.find(
      (ext) => ext.type === ExtensionType.SelectiveAcknowledgement,
    ) as UtpSelectiveAckExtension;
  }

  get extensionBitsExtension(): UtpExtensionBits | undefined {
    return this.extensions.find(
      (ext) => ext.type === ExtensionType.ExtensionBits,
    ) as UtpExtensionBits;
  }

  get extensionPayloadLength(): number {
    return (
      UtpPacket.EXTENSION_HEADER_SIZE * this.extensions.length +
      this.extensions.reduce((acc, ext) => acc + ext.toBytes().length, 0)
    );
  }

  static fromBytes(
    buffer: Uint8Array,
    context: UtpContext = new UtpContext(),
  ): UtpPacket {
    if (buffer.length < UtpPacket.MIN_PACKET_SIZE) {
      throw new TypeError(
        `uTP packet must contain at least ${UtpPacket.MIN_PACKET_SIZE} bytes`,
      );
    }

    // Copy the datagram so parsed payload slices cannot alias caller memory.
    const bytes = new Uint8Array(buffer);
    const dataView = new DataView(bytes.buffer);
    const packet = new UtpPacket(context);
    packet.type = dataView.getUint8(0) >> 4;
    packet.version = dataView.getUint8(0) & 0b1111;
    packet.extension = dataView.getUint8(1);
    packet.connId = dataView.getUint16(2);
    packet.timestampMicroseconds = dataView.getUint32(4);
    packet.timestampDifferenceMicroseconds = dataView.getUint32(8);
    packet.windowSize = dataView.getUint32(12);
    packet.seqNr = dataView.getUint16(16);
    packet.ackNr = dataView.getUint16(18);

    let extensionType = packet.extension;
    let offset = this.HEADER_SIZE;

    // Each extension header points to the following extension, not itself.
    while (extensionType > 0) {
      if (offset + this.EXTENSION_HEADER_SIZE > bytes.length) {
        throw new TypeError("Truncated uTP extension header");
      }

      const nextExtensionType = dataView.getUint8(offset);
      const extensionLength = dataView.getUint8(offset + 1);
      const extensionEnd = offset + this.EXTENSION_HEADER_SIZE +
        extensionLength;
      if (extensionEnd > bytes.length) {
        throw new TypeError("Truncated uTP extension payload");
      }

      const payload = bytes.slice(
        offset + this.EXTENSION_HEADER_SIZE,
        extensionEnd,
      );

      if (extensionType === ExtensionType.SelectiveAcknowledgement) {
        const extension = UtpSelectiveAckExtension.createFromBytes(
          packet.ackNr,
          payload,
        );
        packet.extensions.push(extension);
      } else if (extensionType === ExtensionType.ExtensionBits) {
        const extension = UtpExtensionBits.createFromBytes(payload);
        packet.extensions.push(extension);
      } else {
        packet.logger.debug("unsupported extension type:", extensionType);
      }

      offset = extensionEnd;
      extensionType = nextExtensionType;
    }

    if (offset < bytes.length) {
      packet.data = bytes.slice(offset);
    }

    return packet;
  }

  toBytes(): Uint8Array {
    const buffer = new Uint8Array(this.byteLength);
    const dataView = new DataView(buffer.buffer);
    dataView.setUint8(0, (this.type << 4) | this.version);
    dataView.setUint8(1, this.extension);
    dataView.setUint16(2, this.connId);
    dataView.setUint32(4, this.timestampMicroseconds);
    dataView.setUint32(8, this.timestampDifferenceMicroseconds);
    dataView.setUint32(12, this.windowSize);
    dataView.setUint16(16, this.seqNr);
    dataView.setUint16(18, this.ackNr);

    let offset = UtpPacket.HEADER_SIZE;

    if (this.extensions.length > 0) {
      const EXT_HEADER_SIZE = 2;
      for (let i = 0; i < this.extensions.length; i++) {
        const ext = this.extensions[i];
        const nextExtType = i + 1 < this.extensions.length
          ? this.extensions[i + 1].type
          : 0;
        const payload = ext.toBytes();
        const payloadLength = payload.length;
        dataView.setUint8(offset, nextExtType); // next extension type,8 bits,1 byte
        dataView.setUint8(offset + 1, payloadLength); // extension length,8 bits,1 byte
        buffer.set(payload, offset + EXT_HEADER_SIZE);
        offset += EXT_HEADER_SIZE + payloadLength;
      }
    }

    if (this.data) {
      buffer.set(this.data, offset);
    }

    return buffer;
  }

  /**
   * include header and payload(extensions and data)
   *
   * @returns
   */
  get byteLength(): number {
    // 0               8               16
    // +---------------+---------------+
    // | extension     | len           |
    // +---------------+---------------+
    const EXTENSION_HEADER_SIZE = 2;

    const extHeaderLength = EXTENSION_HEADER_SIZE * this.extensions.length;

    const extPayloadLength = this.extensions.reduce(
      (acc, ext) => acc + ext.toBytes().length,
      0,
    );

    const extLength = extHeaderLength + extPayloadLength;

    const utpPacketPayloadLength = extLength + (this.data?.length ?? 0);

    return UtpPacket.HEADER_SIZE + utpPacketPayloadLength;
  }

  static createSynPacket(conn: UtpConn): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_SYN;
    packet.connId = conn.receiveConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = 0;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.windowSize = 0;
    packet.extension = ExtensionType.ExtensionBits;
    packet.extensions.push(UtpExtensionBits.create());
    return packet;
  }

  /**
   * create a ack packet
   * @param conn UtpConn
   * @param sack SelectiveAckExtension, optional
   * @returns
   */
  static createAckPacket(
    conn: UtpConn,
    sack?: UtpSelectiveAckExtension,
  ): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_STATE;
    packet.extension = sack ? ExtensionType.SelectiveAcknowledgement : 0;
    packet.connId = conn.sendConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = conn.acknowledgementNumber;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.windowSize = conn.receiveWindowBytes;

    if (sack) {
      packet.extensions.push(sack);
    }
    return packet;
  }

  /**
   * @param conn
   * @param data
   * @returns
   */
  static createDataPacket(conn: UtpConn, data: Uint8Array): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_DATA;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.seqNr = conn.sequenceNumber;
    packet.connId = conn.sendConnectionId;
    packet.ackNr = conn.acknowledgementNumber;
    packet.windowSize = conn.receiveWindowBytes;
    // Writes may reuse their source buffer before this packet is acknowledged.
    packet.data = new Uint8Array(data);
    conn.sequenceNumber++;
    return packet;
  }

  static createFinPacket(conn: UtpConn): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_FIN;
    packet.connId = conn.sendConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = conn.acknowledgementNumber;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.windowSize = conn.receiveWindowBytes;
    conn.sequenceNumber++;
    return packet;
  }

  static createResetPacket(conn: UtpConn): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_RESET;
    packet.connId = conn.sendConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = conn.acknowledgementNumber;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.windowSize = 0;
    packet.extension = 0;
    return packet;
  }

  static isPacket(
    buffer: Uint8Array,
    context: UtpContext = new UtpContext(),
  ): boolean {
    const packet = new UtpPacket(context);
    if (buffer.length < UtpPacket.MIN_PACKET_SIZE) {
      packet.logger.debug("not a μTP packet, the length is less than 20 bytes");
      return false;
    }

    if (buffer.length > UtpPacket.MAX_PACKET_SIZE) {
      packet.logger.debug("not a μTP packet, the length is greater than 64KB");
      return false;
    }

    let decodedPacket: UtpPacket;
    try {
      decodedPacket = UtpPacket.fromBytes(buffer, context);
    } catch (error) {
      packet.logger.debug(`not a μTP packet: ${error}`);
      return false;
    }

    if (decodedPacket.version !== 1) {
      packet.logger.debug("not a μTP packet, the version is not 1");
      return false;
    }

    if (decodedPacket.type < 0 || decodedPacket.type > 4) {
      packet.logger.debug("not a μTP packet, the type is invalid");
      return false;
    }

    if (decodedPacket.extension < 0 || decodedPacket.extension > 255) {
      packet.logger.debug("not a μTP packet, the extension is invalid");
      return false;
    }

    if (decodedPacket.connId < 0 || decodedPacket.connId > 65535) {
      packet.logger.debug("not a μTP packet, the connectionId is invalid");
      return false;
    }

    if (decodedPacket.timestampMicroseconds < 0) {
      packet.logger.debug("not a μTP packet, the timestamp is invalid");
      return false;
    }

    if (decodedPacket.timestampDifferenceMicroseconds < 0) {
      packet.logger.debug(
        "not a μTP packet, the timestampDifference is invalid",
      );
      return false;
    }

    if (decodedPacket.windowSize < 0) {
      packet.logger.debug("not a μTP packet, the windowSize is invalid");
      return false;
    }

    if (decodedPacket.seqNr < 0 || decodedPacket.seqNr > 65535) {
      packet.logger.debug("not a μTP packet, the seqNumber is invalid");
      return false;
    }

    if (decodedPacket.ackNr < 0 || decodedPacket.ackNr > 65535) {
      packet.logger.debug("not a μTP packet, the ackNumber is invalid");
      return false;
    }

    return true;
  }

  /**
   * toString
   * @description This method is used to convert the packet to a string
   */
  toString(): string {
    return `{
  type: ${this.type}(${UtpPacketType[this.type]}),
  version: ${this.version},
  extension: ${this.extension},
  connectionId: ${this.connId},
  timestamp: ${this.timestampMicroseconds},
  timestampDifference: ${this.timestampDifferenceMicroseconds},
  windowSize: ${this.windowSize},
  seqNumber: ${this.seqNr},
  ackNumber: ${this.ackNr},
  data: ${this.data?.length},
}`;
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_rtt_tracker.ts`

```ts
import type { UtpPacketWithExtraInfo } from "@src/utp_send_window.ts";
import type { Logger } from "@src/logger.ts";
import { UtpContext } from "@src/utp_context.ts";

/**
 * 网络延迟监控器
 * 用于估计网络质量，计算重传超时时间
 */
export class UtpRttTracker {
  readonly #minimumRtoMs = 1000;
  readonly #maximumRttMs = 6000;
  #rtt: number; // round trip time 往返时间
  #baseDelay: number; // 连接建立后观测到的最小RTT，作为延迟的基准
  #rttVar: number; // round trip time variance 往返时间方差
  #rto: number; // retransmission timeout 重传超时时间
  logger: Logger;

  constructor(context: UtpContext = new UtpContext()) {
    this.#rtt = 0;
    this.#rttVar = 0;
    this.#baseDelay = 0;
    this.#rto = this.#minimumRtoMs;
    this.logger = context.getLogger("RTT_TRACKER");
  }

  // 获取RTT和RTT_VAR的方法
  get rtt(): number {
    return this.#rtt;
  }

  get rttVar(): number {
    return this.#rttVar;
  }

  /**
   * 更新网络质量信息
   * @param packetWithExtraInfo
   */
  update(packetWithExtraInfo: UtpPacketWithExtraInfo): void {
    try {
      const now = Date.now();
      // 估计往返时间 estimated round trip time
      // Date.now() 分辨率为 1ms，loopback 实际 RTT < 1ms 时会得到 0，至少取 1ms
      const ertt = Math.max(now - packetWithExtraInfo.sentTime, 1);
      if (this.#rtt === 0) {
        // 第一个往返时间样本
        this.#rtt = ertt;
        this.#rttVar = ertt / 2;
        // 合理性检查。RTT不应超过6秒
        this.sanityCheckRtt();
      } else {
        // 计算新的往返时间
        const delta = this.#rtt - ertt;
        this.#rttVar += (Math.abs(delta) - this.#rttVar) / 4;
        this.#rtt = (this.#rtt * 7) / 8 + ertt / 8;
        // 合理性检查。RTT不应超过6秒
        this.sanityCheckRtt();
      }

      // 更新最小RTT
      if (this.#baseDelay === 0 || this.#rtt < this.#baseDelay) {
        this.#baseDelay = this.#rtt;
      }

      // 重传超时时间 = RTT + 4 * RTT_VAR
      // 为了避免过小的超时时间，设置最小超时时间为1s
      this.#rto = Math.max(
        this.#rtt + this.#rttVar * 4,
        this.#minimumRtoMs,
      );

      this.logger.debug(
        "rtt:",
        this.#rtt,
        "rttVar:",
        this.#rttVar,
        "rto:",
        this.#rto,
      );
    } catch (error) {
      this.logger.debug("update rtt error:", error);
    }
  }

  /**
   * 合理性检查。RTT不应超过6秒
   */
  private sanityCheckRtt(): void {
    if (this.#rtt >= this.#maximumRttMs) {
      throw new Error("RTT sanity check failed");
    }
  }

  get rto(): number {
    return this.#rto;
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_send_window.ts`

```ts
import { BlockingMap } from "@src/blocking_map.ts";
import type { UtpAddr } from "@src/utp_addr.ts";
import { UtpCongestionControl } from "@src/utp_congestion_control.ts";
import type { UtpConn, UtpPacketWithAddr } from "@src/utp_conn.ts";
import type { UtpPacket } from "@src/utp_packet.ts";
import { UtpRttTracker } from "@src/utp_rtt_tracker.ts";
import type { Logger } from "@src/logger.ts";
import { Seq } from "@src/util.ts";

export type UtpPacketWithExtraInfo = {
  packet: UtpPacket;
  resendTimes: number;
  sentTime: number;
  remoteAddr: UtpAddr;
};

export class UtpDeliveryError extends Error {
  readonly seqNr?: number;
  readonly retransmissions?: number;

  constructor(
    message: string,
    options: { seqNr?: number; retransmissions?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "UtpDeliveryError";
    this.seqNr = options.seqNr;
    this.retransmissions = options.retransmissions;
  }
}

/**
 * Send window
 */
export class UtpSendWindow {
  readonly #retransmissionLimit = 3;
  readonly #maxWindowPackets = 64;
  readonly #minWindowPackets = 4;

  #packetMap: BlockingMap<number, UtpPacketWithExtraInfo>;
  #maxWindow: number;
  #minWindow: number;
  #conn: UtpConn;
  #latestCumulativeAck?: number;
  #congestionControl: UtpCongestionControl;
  #rttTracker: UtpRttTracker;
  #remoteWindowBytes?: number;
  #deliveryError?: UtpDeliveryError;
  #flushWaiters: Array<{
    resolve: () => void;
    reject: (reason: UtpDeliveryError) => void;
  }> = [];
  logger: Logger;

  constructor(conn: UtpConn) {
    this.#packetMap = new BlockingMap<number, UtpPacketWithExtraInfo>(
      this.#minWindowPackets,
    );
    this.#congestionControl = new UtpCongestionControl(
      this.#minWindowPackets,
      100,
      conn.utp.context,
    );
    this.#maxWindow = this.#maxWindowPackets;
    this.#minWindow = this.#minWindowPackets;
    this.#rttTracker = new UtpRttTracker(conn.utp.context);
    this.#conn = conn;
    this.logger = conn.utp.context.getLogger(
      `SEND_WINDOW_${conn.connectionKey}`,
    );
  }

  /** Compare in uint16 sequence space so ACK processing survives wraparound. */
  private isPacketAcked(seqNr: number): boolean {
    return (
      this.#latestCumulativeAck !== undefined &&
      Seq.ge(this.#latestCumulativeAck, seqNr)
    );
  }

  /**
   * 重传超时的数据包
   */
  async resend(): Promise<void> {
    const now = Date.now();
    const seqNrs = this.#pendingSequenceNumbers();
    for (const seqNr of seqNrs) {
      const packetWithExtraInfo = this.#packetMap.get(seqNr);
      if (packetWithExtraInfo) {
        const rto = this.#rttTracker.rto;
        if (now - packetWithExtraInfo.sentTime > rto) {
          if (packetWithExtraInfo.resendTimes >= this.#retransmissionLimit) {
            // 重传次数超过限制，视为丢包
            this.#congestionControl.onPacketLoss();
            this.#applyWindowSize();
            this.#packetMap.delete(seqNr);
            const error = new UtpDeliveryError(
              `Packet ${packetWithExtraInfo.packet.seqNr} was not acknowledged after ${packetWithExtraInfo.resendTimes} retransmissions`,
              {
                seqNr: packetWithExtraInfo.packet.seqNr,
                retransmissions: packetWithExtraInfo.resendTimes,
              },
            );
            this.#fail(error);
            this.logger.debug(error.message);
            continue;
          }
          // 重传数据包
          packetWithExtraInfo.resendTimes++;
          packetWithExtraInfo.sentTime = now;
          await this.#conn.utp.sendUtpPacket(
            packetWithExtraInfo.packet,
            packetWithExtraInfo.remoteAddr,
          );
        }
      }
    }
  }

  /**
   * 将拥塞控制计算出的窗口大小与对端接收窗口共同约束发送容量
   */
  #applyWindowSize(): void {
    const ccWindow = Math.max(
      this.#minWindow,
      Math.min(this.#maxWindow, this.#congestionControl.windowSize),
    );
    let size = ccWindow;
    // 同时尊重对端广播的接收窗口（避免溢出对端接收缓冲区）
    if (this.#remoteWindowBytes !== undefined) {
      const mtu = this.#conn.maxPacketSize;
      const remoteWindowPackets = Math.max(
        1,
        Math.floor(this.#remoteWindowBytes / mtu),
      );
      size = Math.min(ccWindow, remoteWindowPackets);
    }
    this.#packetMap.updateCapacity(size);
    this.logger.debug(
      `SendWindow: window capacity updated to ${size} (cc=${ccWindow}, remoteBytes=${
        this.#remoteWindowBytes ?? "unknown"
      })`,
    );
  }

  /**
   * 检查超时的数据包
   */
  async timeoutCheck(): Promise<void> {
    await this.resend();
  }

  /**
   * 将数据包登记到发送窗口并等待窗口有空间（若窗口已满则阻塞）
   * 实际发送由调用方（conn.sendUtpPacket）负责，避免重复发送
   * @param packetWithAddr
   */
  async waitForAck(packetWithAddr: UtpPacketWithAddr): Promise<void> {
    this.assertHealthy();
    const packet = packetWithAddr.packet;
    const seqNr = packet.seqNr;
    this.logger.debug(`SendWindow.waitForAck seqNr=${packet.seqNr}`);

    // 将数据包放入发送窗口，若窗口已满则在此阻塞，等待 ACK 腾出空间
    await this.#packetMap.set(seqNr, {
      packet,
      resendTimes: 0,
      sentTime: Date.now(),
      remoteAddr: packetWithAddr.remoteAddr,
    });

    if (this.#deliveryError) {
      this.#packetMap.delete(seqNr);
      throw this.#deliveryError;
    }
  }

  /** Wait until every currently queued DATA/FIN packet is acknowledged. */
  flush(): Promise<void> {
    if (this.#deliveryError) return Promise.reject(this.#deliveryError);
    if (this.isEmpty()) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.#flushWaiters.push({ resolve, reject });
    });
  }

  assertHealthy(): void {
    if (this.#deliveryError) throw this.#deliveryError;
  }

  abort(error: UtpDeliveryError): void {
    this.#fail(error);
  }

  /**
   * 处理ACK包
   * @param ackPacket
   */
  handleAck(ackPacket: UtpPacket): void {
    // 更新对端广播的接收窗口大小
    this.#remoteWindowBytes = ackPacket.windowSize;

    // 更新对方收到的最大的包的序列号
    if (
      this.#latestCumulativeAck === undefined ||
      Seq.gt(ackPacket.ackNr, this.#latestCumulativeAck)
    ) {
      this.#latestCumulativeAck = ackPacket.ackNr;
    }

    // 处理SACK扩展
    if (ackPacket.sackExtension) {
      const sack = ackPacket.sackExtension;
      const ackedSeqNrs = sack.getReceivedSequenceNumbers();
      for (const seqNr of ackedSeqNrs) {
        const info = this.#packetMap.get(seqNr);
        if (info) {
          if (info.resendTimes === 0) this.#rttTracker.update(info);
          this.#packetMap.delete(seqNr);
        }
      }
    }

    // 处理累积ACK
    const seqNrs = this.#pendingSequenceNumbers();
    for (const seqNr of seqNrs) {
      if (this.isPacketAcked(seqNr)) {
        const info = this.#packetMap.get(seqNr);
        if (info && info.resendTimes === 0) this.#rttTracker.update(info);
        this.#packetMap.delete(seqNr);
      }
    }

    // 根据最新RTT调整拥塞窗口（RTT tracker 保证 rtt >= 1，此处无需守卫）
    this.#congestionControl.updateRtt(this.#rttTracker.rtt);
    this.#applyWindowSize();
    this.#resolveFlushIfIdle();

    this.logger.debug(
      "SendWindow.handleAck",
      "window capacity:",
      this.#packetMap.capacity,
      "waiting ack count:",
      this.#packetMap.size,
    );
  }

  /**
   * 检查发送窗口是否为空
   * @returns
   */
  isEmpty(): boolean {
    return this.#packetMap.size === 0;
  }

  #pendingSequenceNumbers(): number[] {
    return Array.from(this.#packetMap.keys());
  }

  /**
   * 重置发送窗口
   */
  reset(error?: UtpDeliveryError): void {
    if (error) {
      this.#fail(error);
    } else {
      this.#packetMap.clear();
    }
    this.#latestCumulativeAck = undefined;
    this.#remoteWindowBytes = undefined;
    this.#congestionControl.reset();
    this.#packetMap.updateCapacity(this.#minWindow);
  }

  #fail(error: UtpDeliveryError): void {
    if (this.#deliveryError) return;
    this.#deliveryError = error;
    this.#packetMap.abort(error);
    const waiters = this.#flushWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  #resolveFlushIfIdle(): void {
    if (!this.isEmpty() || this.#deliveryError) return;
    const waiters = this.#flushWaiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_socket.ts`

```ts
import { TimerManager } from "@src/timer_manager.ts";
import { isIPv4, isIPv6, randomUint16, Seq } from "@src/util.ts";
import { UtpAddr } from "@src/utp_addr.ts";
import { UtpConn, UtpConnState } from "@src/utp_conn.ts";
import { UtpListener } from "@src/utp_listener.ts";
import { UtpPacket, UtpPacketType } from "@src/utp_packet.ts";
import { assert } from "std/assert/assert.ts";
import type { Logger } from "@src/logger.ts";
import { UtpContext } from "@src/utp_context.ts";

export enum UtpState {
  Active,
  Closing,
  Closed,
}

export type UtpAddressFamily = "IPv4" | "IPv6";

export interface UtpConnectOptions {
  port: number;
  hostname: string;
  /** Select a DNS address family. Dual-stack names prefer IPv4 by default. */
  family?: UtpAddressFamily;
}

export interface UtpDatagramTransport {
  readonly addr: Deno.Addr;
  receive(buffer?: Uint8Array): Promise<[Uint8Array, Deno.Addr]>;
  send(data: Uint8Array, address: Deno.Addr): Promise<number>;
  close(): void;
}

export interface UtpOptions {
  /** Caller-owned datagram channel, used when uTP shares one UDP port. */
  transport?: UtpDatagramTransport;
}

export class Utp {
  static readonly DEFAULT_MTU = 1400;
  #udpSocket!: UtpDatagramTransport;
  #udpFamily?: "IPv4" | "IPv6";
  readonly #timeoutTimerName = `UTP_TIMEOUT_CHECK_TIMER_${crypto.randomUUID()}`;
  readonly #timeoutCheckIntervalMs = 300;
  listener: UtpListener;
  listening: boolean;
  #connTable: Map<string, UtpConn>;
  #state: UtpState;
  #totalBytesWritten: number;
  #totalBytesRead: number;
  #totalUdpPacketSent: number;
  #totalUdpPacketReceived: number;
  #utpPacketReceived: number;
  #mockPacketLossRate: number;
  #mockPacketLossEnabled: boolean;
  #tag: string;
  logger: Logger;
  readonly context: UtpContext;

  constructor(tag: string = "", options: UtpOptions = {}) {
    this.#tag = tag;
    this.context = new UtpContext(this.#tag);
    this.logger = this.context.getLogger("UTP_SOCKET");

    this.listening = false;
    this.listener = new UtpListener(this.context);
    this.#state = UtpState.Active;
    this.#connTable = new Map();
    this.#totalBytesWritten = 0;
    this.#totalBytesRead = 0;
    this.#totalUdpPacketSent = 0;
    this.#totalUdpPacketReceived = 0;
    this.#utpPacketReceived = 0;
    this.#mockPacketLossRate = 0.01;
    this.#mockPacketLossEnabled = false;
    if (options.transport) {
      this.#udpSocket = options.transport;
      const localAddr = UtpAddr.fromDenoAddr(options.transport.addr);
      this.#udpFamily = isIPv6(localAddr.hostname) ? "IPv6" : "IPv4";
      this.logger.info(
        `μTP socket is using shared UDP transport on ${localAddr.toString()}`,
      );
      void this.startListen();
      this.startTimeoutCheck();
    }
  }

  // 启用日志
  enableLogging(): void {
    this.context.setDebug(true);
  }

  // 禁用日志
  disableLogging(): void {
    this.context.setDebug(false);
  }

  get localAddr(): UtpAddr | undefined {
    return this.#udpSocket?.addr
      ? UtpAddr.fromDenoAddr(this.#udpSocket.addr as Deno.Addr)
      : undefined;
  }

  /**
   * @param addr local address to listen on
   */
  private createUdpSocketIfNone(addr: UtpAddr): void {
    if (this.#udpSocket) {
      return;
    }

    this.#udpSocket = Deno.listenDatagram({
      port: addr.port,
      hostname: addr.hostname,
      transport: "udp",
    });

    const localAddr = UtpAddr.fromDenoAddr(this.#udpSocket.addr as Deno.Addr);
    this.#udpFamily = isIPv6(localAddr.hostname) ? "IPv6" : "IPv4";

    this.logger.info(`μTP socket is listening on ${localAddr.toString()}`);

    this.startListen();
    this.startTimeoutCheck();
  }

  /**
   * create a new connection to the peer, and execute the SYN command
   * @param remoteAddr
   * @returns
   */
  async connect(
    { port, hostname, family }: UtpConnectOptions,
  ): Promise<UtpConn> {
    const remoteAddr = await this.resolveRemoteAddr(
      port,
      hostname,
      family ?? this.#udpFamily,
    );
    const remoteFamily = isIPv6(remoteAddr.hostname) ? "IPv6" : "IPv4";
    if (this.#udpSocket && this.#udpFamily !== remoteFamily) {
      throw new Error(
        `uTP socket is bound to ${this.#udpFamily} and cannot connect to ${remoteFamily}`,
      );
    }
    const bindHostname = remoteFamily === "IPv6" ? "::" : "0.0.0.0";
    this.createUdpSocketIfNone(new UtpAddr(0, bindHostname));
    this.logger.info(
      `Attempting to connect to ${remoteAddr.hostname}:${remoteAddr.port}`,
    );

    // BEP 29 assigns adjacent receive/send IDs with uint16 wraparound.
    const localRecvId = randomUint16();
    const localSendId = Seq.add(localRecvId, 1);
    const seqNr = 1;
    const ackNr = 0;

    return await UtpConn.connectTo(
      this,
      UtpConnState.SynSent,
      remoteAddr,
      localSendId,
      localRecvId,
      seqNr,
      ackNr,
    );
  }

  private async resolveRemoteAddr(
    port: number,
    hostname: string,
    family?: UtpAddressFamily,
  ): Promise<UtpAddr> {
    const input = new UtpAddr(port, hostname);
    if (isIPv4(input.hostname) || isIPv6(input.hostname)) {
      const literalFamily = isIPv6(input.hostname) ? "IPv6" : "IPv4";
      if (family && family !== literalFamily) {
        throw new Error(
          `Address ${input.hostname} is ${literalFamily}, not requested ${family}`,
        );
      }
      return input;
    }

    // `resolveDns()` intentionally bypasses the OS hosts file on some Deno
    // platforms. Preserve the universally expected localhost behavior.
    if (input.hostname === "localhost") {
      return new UtpAddr(port, family === "IPv6" ? "::1" : "127.0.0.1");
    }

    const [ipv4, ipv6] = await Promise.all([
      Deno.resolveDns(input.hostname, "A").catch(() => []),
      Deno.resolveDns(input.hostname, "AAAA").catch(() => []),
    ]);
    const resolved = family === "IPv6"
      ? ipv6[0]
      : family === "IPv4"
      ? ipv4[0]
      : ipv4[0] ?? ipv6[0];
    if (!resolved) {
      throw new Error(
        `No ${family ?? "IPv4 or IPv6"} address found for ${input.hostname}`,
      );
    }
    return new UtpAddr(port, resolved);
  }

  /**
   * create a μTP server
   * @param options listen options,if not provided, a random port will be used, and listen on all interfaces
   */
  listen(
    { port, hostname = "0.0.0.0" }: { port: number; hostname?: string },
  ): UtpListener {
    this.createUdpSocketIfNone(new UtpAddr(port, hostname));
    return this.listener;
  }

  /**
   * close the UTP listener and all connections
   */
  close(): Promise<void> {
    if (this.#state === UtpState.Closed) {
      this.logger.debug("The UTP socket is already closed");
      return Promise.resolve();
    }

    if (this.#state === UtpState.Closing) {
      this.logger.debug(
        "The UTP socket is in CLOSE_WAIT state, waiting for the connections to close",
      );
      return Promise.resolve();
    }

    this.#state = UtpState.Closing;

    this.logger.info(
      `Closing UTP listener on ${this.localAddr?.hostname}:${this.localAddr?.port}`,
    );
    this.listener.close();

    const tryCloseSocket = () => {
      if (this.connectionCount === 0) {
        this.stopTimeoutCheck();
        // close() is valid even when listen()/connect() was never called.
        this.#udpSocket?.close();
        this.#state = UtpState.Closed;
        this.logger.info("UTP socket closed");
        return true;
      } else {
        const conns = Array.from(this.#connTable.values());
        const canCloseConns = conns.filter(
          (conn) =>
            conn.state !== UtpConnState.FinSent &&
            conn.state !== UtpConnState.Closing &&
            conn.state !== UtpConnState.Closed,
        );

        for (const conn of canCloseConns) {
          this.logger.debug(`Closing connection: ${conn.connectionKey}`);
          conn.close();
        }
        return false;
      }
    };

    // Connections may still be draining FIN acknowledgements asynchronously.
    if (tryCloseSocket()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (tryCloseSocket()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  logConnectionIds(): void {
    const keys = Array.from(this.#connTable.keys());
    this.logger.debug(
      `Connection table keys: ${keys.length > 0 ? keys.join(", ") : "None"}`,
    );
  }

  addConnection(conn: UtpConn): void {
    this.logger.info(`Adding connection: ${conn.connectionKey}`);
    this.#connTable.set(conn.connectionKey, conn);
  }

  removeConnection(conn: UtpConn): void {
    this.logger.info(`Removing connection: ${conn.connectionKey}`);
    this.#connTable.delete(conn.connectionKey);
  }

  getConnection(connectionKey: string): UtpConn | undefined {
    return this.#connTable.get(connectionKey);
  }

  hasConnection(connectionKey: string): boolean {
    return this.#connTable.has(connectionKey);
  }

  get connectionCount(): number {
    return this.#connTable.size;
  }

  async timeoutCheck(): Promise<void> {
    // iterate all connections
    for (const conn of this.#connTable.values()) {
      if (
        ![UtpConnState.Closed, UtpConnState.Reset].includes(
          conn.state,
        )
      ) {
        await conn.timeoutCheck();
      }
    }
  }

  startTimeoutCheck(): void {
    this.logger.debug(`Starting timeout check timer`);
    TimerManager.setTimer(
      this.#timeoutTimerName,
      this.timeoutCheck.bind(this),
      this.#timeoutCheckIntervalMs,
    );
  }

  stopTimeoutCheck(): void {
    this.logger.debug(`Stopping timeout check timer`);
    TimerManager.clearTimer(this.#timeoutTimerName);
  }

  async startListen(): Promise<void> {
    this.logger.info(`Starting to listen for incoming UTP packets`);
    while (!this.isClosed()) {
      try {
        // DENO BUG:超过1024字节的UDP数据包会被截断,手动调整缓冲区大小为默认MTU的2倍
        const [udpBytes, remoteAddr] = await this.#udpSocket.receive(
          new Uint8Array(Utp.DEFAULT_MTU * 2),
        );

        // mock packet loss,if enabled,drop the packet
        if (
          this.#mockPacketLossEnabled &&
          Math.random() < this.#mockPacketLossRate
        ) {
          continue;
        }

        this.#totalUdpPacketReceived++;
        this.#totalBytesRead += udpBytes.length;
        await this.dispatch(udpBytes, remoteAddr);
      } catch (err) {
        // On Windows an ICMP "port unreachable" response is surfaced on the
        // unconnected UDP receive loop as ConnectionReset. It only concerns
        // the attempted peer; keep the socket alive and let that connection's
        // normal timeout path report the failure.
        if (err instanceof Deno.errors.ConnectionReset) {
          this.logger.debug(
            `UDP receive reported a remote reset: ${err.message}`,
          );
          continue;
        }

        if (this.isClosed()) {
          this.logger.debug("UDP socket is closed");
        } else {
          throw err;
        }
      }
    }
  }

  isClosed(): boolean {
    return this.#state === UtpState.Closed;
  }

  isClosing(): boolean {
    return this.#state === UtpState.Closing;
  }

  isActive(): boolean {
    return this.#state === UtpState.Active;
  }

  /**
   * send utp packet to remote address
   * @param outgoingPacket
   * @returns
   */
  async sendUtpPacket(
    outgoingPacket: UtpPacket,
    remoteAddr: UtpAddr,
  ): Promise<number> {
    if (this.isClosed()) {
      this.logger.debug("The UTP socket is closed, cannot send packet");
      return 0;
    }

    this.logger.debug(
      `=======> UDP: 发送UDP数据包到${remoteAddr.toString()},seq is ${outgoingPacket.seqNr},ack is ${outgoingPacket.ackNr}`,
    );
    const bytes = outgoingPacket.toBytes();
    this.#totalBytesWritten += bytes.length;
    this.#totalUdpPacketSent++;

    const n = await this.#udpSocket.send(bytes, {
      port: remoteAddr.port,
      hostname: remoteAddr.hostname,
      transport: "udp",
    });

    assert(
      n === bytes.length,
      "UDP:发送的数据包长度与实际发送的数据包长度不一致",
    );

    return n;
  }

  /**
   * dispatch the incoming packet to the corresponding handler
   * @param udpBytes
   * @param remoteUdpAddr
   */
  async dispatch(
    udpBytes: Uint8Array,
    remoteUdpAddr: Deno.Addr,
  ): Promise<void> {
    const remoteAddr = UtpAddr.fromDenoAddr(remoteUdpAddr);
    if (!UtpPacket.isPacket(udpBytes, this.context)) {
      // Deno may return null-prototype address objects that cannot be safely
      // coerced by template literals, even when debug output is disabled.
      this.logger.debug(`invalid uTP packet from ${remoteAddr.toString()}`);
      return;
    }

    const packet = UtpPacket.fromBytes(udpBytes, this.context);

    this.logger.debug(
      `<======= Receiving packet from ${remoteAddr.toString()} to the target connection`,
    );
    this.logger.debug(packet.toString());

    this.#utpPacketReceived++;

    if (packet.type === UtpPacketType.ST_SYN) {
      this.logger.debug("received a SYN packet from", remoteAddr);

      // create a new connection
      // only when type is SYN, the connId means sendId
      const remoteRecvId = packet.connId;
      const remoteSendId = Seq.add(packet.connId, 1);

      const localSendId = remoteRecvId;
      const localRecvId = remoteSendId;

      const targetConnectionKey = UtpConn.createConnectionKey(
        remoteAddr,
        localSendId,
        localRecvId,
      );

      const existingConn = this.getConnection(targetConnectionKey);
      if (existingConn) {
        this.logger.debug(
          `connection already exists for the packet from ${remoteAddr}`,
        );
        if (existingConn.state === UtpConnState.SynReceived) {
          await existingConn.sendUtpPacket(
            UtpPacket.createAckPacket(existingConn),
          );
          this.logger.debug(
            `resent ST_STATE for duplicate SYN from ${remoteAddr}`,
          );
        }
        return;
      }

      const seqNr = randomUint16();
      const ackNr = packet.seqNr;
      const conn = UtpConn.connectTo(
        this,
        UtpConnState.SynReceived,
        remoteAddr,
        localSendId,
        localRecvId,
        seqNr,
        ackNr,
      );
      // notify the listener to accept a new connection; swallow rejection (e.g. 5s SYN_RECV timeout)
      conn.then((conn) => this.listener.addConnection(conn)).catch((err) =>
        this.logger.debug(`SYN_RECV connection failed: ${err}`)
      );
    } else {
      // Non-SYN headers carry the sender's send ID. Try both adjacent local
      // send IDs because packet direction is not encoded on the wire.
      const localRecvId = packet.connId;
      const localSendIds = [Seq.add(localRecvId, 1), Seq.add(localRecvId, -1)];
      const targetConns = localSendIds
        .map((sendId) =>
          UtpConn.createConnectionKey(remoteAddr, sendId, localRecvId)
        )
        .map((connectionKey) => this.getConnection(connectionKey))
        .filter((conn) => conn !== undefined) as UtpConn[];

      // if no connection found, ignore the packet
      if (targetConns.length === 0) {
        this.logger.debug(
          `No connection found for the packet from ${remoteAddr}`,
        );
        return;
      }

      // handle the packet
      for (const conn of targetConns) {
        if (packet.type === UtpPacketType.ST_RESET) {
          conn.reset();
        } else {
          const handled = await conn.handleIncomingPacket({
            packet,
            remoteAddr,
          });

          if (handled) {
            break;
          }
        }
      }
    }
  }
}

```

---

## Arquivo: `docs/deno-torrent/utp/utp_statistics.ts`

```ts
export class UtpStatistics {
  readonly #measurementIntervalMs = 1000;
  #sentData: number = 0;
  #recvData: number = 0;
  #sentDataInLastSecond: number = 0;
  #recvDataInLastSecond: number = 0;
  #totalSentSpeedAccumulator: number = 0;
  #totalRecvSpeedAccumulator: number = 0;
  #sentSpeedMeasurements: number = 0;
  #recvSpeedMeasurements: number = 0;
  #maxSentSpeed: number = 0;
  #minSentSpeed: number = Number.POSITIVE_INFINITY;
  #maxRecvSpeed: number = 0;
  #minRecvSpeed: number = Number.POSITIVE_INFINITY;
  #intervalId: ReturnType<typeof setInterval> | null = null;
  #started: boolean = false;

  // Sent data getters
  get totalSentData(): number {
    return this.#sentData;
  }

  get averageSentSpeed(): number {
    return this.#sentSpeedMeasurements > 0
      ? this.#totalSentSpeedAccumulator / this.#sentSpeedMeasurements
      : 0;
  }

  get maxSentSpeed(): number {
    return this.#maxSentSpeed;
  }

  get minSentSpeed(): number {
    return this.#minSentSpeed === Number.POSITIVE_INFINITY
      ? 0
      : this.#minSentSpeed;
  }

  get lastSentSpeed(): number {
    return this.#sentDataInLastSecond;
  }

  // Received data getters
  get totalRecvData(): number {
    return this.#recvData;
  }

  get averageRecvSpeed(): number {
    return this.#recvSpeedMeasurements > 0
      ? this.#totalRecvSpeedAccumulator / this.#recvSpeedMeasurements
      : 0;
  }

  get maxRecvSpeed(): number {
    return this.#maxRecvSpeed;
  }

  get minRecvSpeed(): number {
    return this.#minRecvSpeed === Number.POSITIVE_INFINITY
      ? 0
      : this.#minRecvSpeed;
  }

  get lastRecvSpeed(): number {
    return this.#recvDataInLastSecond;
  }

  // Update methods
  updateSentData(amount: number): void {
    if (!this.#started) {
      this.startSpeedMeasurement();
    }
    this.#sentData += amount;
    this.#sentDataInLastSecond += amount;
  }

  updateRecvData(amount: number): void {
    if (!this.#started) {
      this.startSpeedMeasurement();
    }
    this.#recvData += amount;
    this.#recvDataInLastSecond += amount;
  }

  // Speed measurement
  startSpeedMeasurement(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;

    // Clear any existing interval
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
    }

    // Set up a new interval
    this.#intervalId = setInterval(() => {
      // Calculate speed for the last second
      const sentSpeedThisSecond = this.#sentDataInLastSecond;
      const recvSpeedThisSecond = this.#recvDataInLastSecond;

      if (sentSpeedThisSecond > 0) {
        // Update max and min sent speeds
        this.#maxSentSpeed = Math.max(this.#maxSentSpeed, sentSpeedThisSecond);
        this.#minSentSpeed = this.#minSentSpeed === Number.POSITIVE_INFINITY
          ? sentSpeedThisSecond
          : Math.min(this.#minSentSpeed, sentSpeedThisSecond);
        // Update average sent speed
        this.#totalSentSpeedAccumulator += sentSpeedThisSecond;
        this.#sentSpeedMeasurements++;
      }

      if (recvSpeedThisSecond > 0) {
        // Update max and min received speeds
        this.#maxRecvSpeed = Math.max(this.#maxRecvSpeed, recvSpeedThisSecond);
        this.#minRecvSpeed = this.#minRecvSpeed === Number.POSITIVE_INFINITY
          ? recvSpeedThisSecond
          : Math.min(this.#minRecvSpeed, recvSpeedThisSecond);
        // Update average received speed
        this.#totalRecvSpeedAccumulator += recvSpeedThisSecond;
        this.#recvSpeedMeasurements++;
      }

      // Reset the counts for the next second
      this.#sentDataInLastSecond = 0;
      this.#recvDataInLastSecond = 0;
    }, this.#measurementIntervalMs);
  }

  // Clear all statistics
  clear(): void {
    this.release();
    this.#sentData = 0;
    this.#recvData = 0;
    this.#sentDataInLastSecond = 0;
    this.#recvDataInLastSecond = 0;
    this.#totalSentSpeedAccumulator = 0;
    this.#totalRecvSpeedAccumulator = 0;
    this.#sentSpeedMeasurements = 0;
    this.#recvSpeedMeasurements = 0;
    this.#maxSentSpeed = 0;
    this.#maxRecvSpeed = 0;
    this.#minSentSpeed = Number.POSITIVE_INFINITY;
    this.#minRecvSpeed = Number.POSITIVE_INFINITY;
  }

  release(): void {
    // Clear the existing interval
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
      this.#started = false;
    }
  }
}

```

---

