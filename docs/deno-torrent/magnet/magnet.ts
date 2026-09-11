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
