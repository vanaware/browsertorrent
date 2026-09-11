// /loco/monorepo/webtorrent/src/utils/magnet.ts
/**
 * Magnet link parsing and building with BitTorrent v1/v2 support.
 *
 * Supports `urn:btih:`, `urn:sha1:` (v1), and `urn:btmh:1220...` (v2 / BEP 52).
 * Hash formats: SHA-1 hex (40 chars), Base32 (32 chars), SHA-256 hex (64 chars).
 *
 * Adaptado de deno-torrent/magnet/magnet.ts.
 * Replaces `@std/encoding/base32` and `@std/encoding/hex` with local
 * utilities from `encoding.ts`. Uses custom query-string parser with
 * resource limits instead of URLSearchParams.
 */

import {
  decodeBase32,
  decodeHex,
  encodeHex,
  isBase32,
  isHex,
} from "./encoding.ts";

// ── Types ───────────────────────────────────────────────────────────────

/** Parsed magnet link with v1/v2 identity fields. */
export interface ParsedMagnet {
  /** Protocol version: "v1" for SHA-1, "v2" for SHA-256. */
  protocol: "v1" | "v2";

  /**
   * Info hash as lowercase hex string.
   * Always 40 chars (the 20-byte handshake hash) for wire/tracker compat.
   */
  infoHash: string;

  /**
   * 20-byte handshake hash.
   * For v1: the full SHA-1 digest. For v2: the first 20 bytes of SHA-256.
   */
  infoHashBuffer: Uint8Array;

  /** 20-byte handshake hash (alias for infoHashBuffer, explicit naming). */
  handshakeHash: Uint8Array;

  /** Full 20-byte v1 SHA-1 hash, if the link contains `urn:btih`. */
  infoHashV1?: Uint8Array;

  /** Full 32-byte v2 SHA-256 hash, if the link contains `urn:btmh`. */
  infoHashV2?: Uint8Array;

  /** 40-char lowercase hex of the v1 hash. */
  infoHashV1Hex?: string;

  /** 64-char lowercase hex of the v2 hash. */
  infoHashV2Hex?: string;

  /** Display name from the `dn` parameter. */
  name?: string;

  /** Tracker URLs from `tr` parameters. */
  announce: string[];

  /** Web seed URLs from `ws` parameters. */
  webSeeds: string[];

  /** Peer addresses from `x.pe` parameters. */
  peerAddresses: string[];

  /** Torrent file URL from `xs` parameter. */
  torrentFileUrl?: string;

  /** Original magnet URI. */
  magnetURI: string;

  /** All query parameters as multi-value map (URL-decoded). */
  params: Map<string, string[]>;
}

/** Options for building a magnet link. */
export interface MagnetBuildOptions {
  /** Display name, serialized as the `dn` parameter. */
  name?: string;
  /** Tracker URLs, serialized as repeated `tr` parameters. */
  trackers?: string[];
  /** Web seed URLs, serialized as repeated `ws` parameters. */
  webSeeds?: string[];
  /** Peer addresses, serialized as repeated `x.pe` parameters. */
  peerAddresses?: string[];
  /** Torrent file URL, serialized as the `xs` parameter. */
  torrentFileUrl?: string;
}

/** Resource limits for parsing a magnet link. */
export interface MagnetParseOptions {
  /** Maximum URI length in UTF-16 code units. Defaults to 1 MiB. */
  maxLength?: number;
  /** Maximum number of non-empty query parameters. Defaults to 1024. */
  maxQueryParameters?: number;
  /** Maximum length of one query parameter segment. Defaults to 64 KiB. */
  maxQueryParameterLength?: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const MAGNET_PREFIX = "magnet:?";
const MAX_MAGNET_LENGTH = 1024 * 1024;
const MAX_QUERY_PARAMETERS = 1024;
const MAX_QUERY_PARAMETER_LENGTH = 64 * 1024;
const SUPPORTED_NIDS = new Set(["btih", "sha1", "btmh"]);

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns `true` if the magnet link string is valid.
 *
 * Unlike `parseMagnet` (which throws), this returns a boolean for validation.
 */
export function isValidMagnet(magnet: string): boolean {
  try {
    const result = parseMagnet(magnet);
    return result !== undefined;
  } catch {
    return false;
  }
}

/**
 * Parse a magnet link string into structured identity and parameters.
 *
 * Supports:
 * - `magnet:?xt=urn:btih:<HEX>`   — v1, 40-char hex
 * - `magnet:?xt=urn:btih:<BASE32>` — v1, 32-char Base32
 * - `magnet:?xt=urn:sha1:<HEX>`   — v1, 40-char hex
 * - `magnet:?xt=urn:sha1:<BASE32>` — v1, 32-char Base32
 * - `magnet:?xt=urn:btmh:1220<HEX>` — v2, 64-char hex (BEP 52)
 *
 * For hybrid links (both `urn:btih` and `urn:btmh`), v1 is preferred as
 * the primary identity (matching deno-torrent behavior).
 *
 * @throws {Error} If the magnet URI is invalid.
 */
export function parseMagnet(
  magnet: string,
  options: MagnetParseOptions = {},
): ParsedMagnet {
  const limits = normalizeParseOptions(options);

  if (
    typeof magnet !== "string" ||
    magnet.length > limits.maxLength ||
    magnet.slice(0, MAGNET_PREFIX.length).toLowerCase() !== MAGNET_PREFIX
  ) {
    throw new Error("Invalid magnet URI: must start with 'magnet:?'");
  }

  const queryString = magnet.slice(MAGNET_PREFIX.length);
  const params = parseQueryString(queryString, limits);

  const xtValues = params.get("xt");
  if (!xtValues || xtValues.length === 0) {
    throw new Error("Invalid magnet URI: missing or invalid 'xt' parameter");
  }

  let v1: XtResult | undefined;
  let v2: XtResult | undefined;

  for (const xt of xtValues) {
    const result = parseXt(xt, params, magnet);
    if (!result) continue;
    if (result.protocol === "v1" && !v1) v1 = result;
    if (result.protocol === "v2" && !v2) v2 = result;
  }

  const selected = v1 ?? v2;
  if (!selected) {
    throw new Error("Invalid magnet URI: no valid xt hash found");
  }

  return {
    protocol: selected.protocol,
    infoHash: selected.infoHash,
    infoHashBuffer: new Uint8Array(selected.handshakeHash),
    handshakeHash: new Uint8Array(selected.handshakeHash),
    infoHashV1: v1 ? new Uint8Array(v1.fullHash) : undefined,
    infoHashV2: v2 ? new Uint8Array(v2.fullHash) : undefined,
    infoHashV1Hex: v1 ? encodeHex(v1.fullHash) : undefined,
    infoHashV2Hex: v2 ? encodeHex(v2.fullHash) : undefined,
    name: selected.name,
    announce: selected.announce,
    webSeeds: selected.webSeeds,
    peerAddresses: selected.peerAddresses,
    torrentFileUrl: selected.torrentFileUrl,
    magnetURI: selected.magnetURI,
    params: selected.params,
  };
}

/**
 * Build a v1 magnet link from a SHA-1 hash string (40-char hex or 32-char Base32).
 *
 * @throws {TypeError} If the hash string is not a valid SHA-1 format.
 */
export function encodeMagnet(
  parsed: Omit<ParsedMagnet, "infoHashBuffer" | "magnetURI" | "params" | "handshakeHash" | "infoHashV1" | "infoHashV2" | "infoHashV1Hex" | "infoHashV2Hex" | "protocol">,
): string {
  const hashString = parsed.infoHash;
  if (!isSha1Hex(hashString) && !isSha1Base32(hashString)) {
    throw new TypeError(
      `Invalid hash string: expected 40-char hex or 32-char Base32, got "${hashString}"`,
    );
  }
  const normalizedHash = isSha1Hex(hashString)
    ? hashString.toLowerCase()
    : hashString.toUpperCase();

  const parts: string[] = [`xt=urn:btih:${normalizedHash}`];
  if (parsed.name) parts.push(`dn=${encodeURIComponent(parsed.name)}`);
  for (const tracker of parsed.announce) {
    parts.push(`tr=${encodeURIComponent(tracker)}`);
  }
  for (const webSeed of parsed.webSeeds) {
    parts.push(`ws=${encodeURIComponent(webSeed)}`);
  }
  for (const peer of parsed.peerAddresses) {
    parts.push(`x.pe=${encodeURIComponent(peer)}`);
  }
  if (parsed.torrentFileUrl) {
    parts.push(`xs=${encodeURIComponent(parsed.torrentFileUrl)}`);
  }

  return `${MAGNET_PREFIX}${parts.join("&")}`;
}

/**
 * Build a v2 (BEP 52) magnet link from a full 32-byte SHA-256 digest.
 *
 * @param hashHex 64-char lowercase hexadecimal SHA-256 digest.
 * @throws {TypeError} If the hash is not a valid 64-char hex string.
 */
export function buildMagnetV2(
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
  for (const webSeed of options.webSeeds ?? []) {
    url += `&ws=${encodeURIComponent(webSeed)}`;
  }
  for (const peer of options.peerAddresses ?? []) {
    url += `&x.pe=${encodeURIComponent(peer)}`;
  }
  if (options.torrentFileUrl !== undefined) {
    url += `&xs=${encodeURIComponent(options.torrentFileUrl)}`;
  }
  return url;
}

/** Returns `true` if the string is a valid SHA-1 hex hash (40 hex characters). */
export function isSha1Hex(hash: string): boolean {
  return hash.length === 40 && isHex(hash);
}

/** Returns `true` if the string is a valid SHA-1 Base32 hash (32 Base32 chars, no padding). */
export function isSha1Base32(hash: string): boolean {
  return hash.length === 32 && isBase32(hash);
}

// ── Internal helpers ────────────────────────────────────────────────────

/** Intermediate result from parsing one xt value (before merging v1/v2). */
interface XtResult {
  protocol: "v1" | "v2";
  fullHash: Uint8Array;
  handshakeHash: Uint8Array;
  infoHash: string;
  name: string | undefined;
  announce: string[];
  webSeeds: string[];
  peerAddresses: string[];
  torrentFileUrl: string | undefined;
  magnetURI: string;
  params: Map<string, string[]>;
}

/** Parse a single xt value (e.g. `urn:btih:HASH`) into an XtResult. */
function parseXt(
  xt: string,
  params: Map<string, string[]>,
  magnetURI: string,
): XtResult | undefined {
  if (xt.slice(0, 4).toLowerCase() !== "urn:") return undefined;

  const urnBody = xt.slice(4);
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
      hash = decodeBase32(hashString.toUpperCase());
    }
  } catch {
    return undefined;
  }

  if (!hash) return undefined;

  const handshakeHash =
    protocol === "v2" ? hash.slice(0, 20) : hash.slice();
  const infoHash = encodeHex(handshakeHash);

  const dnValues = params.get("dn");
  const trValues = params.get("tr");
  const wsValues = params.get("ws");
  const peValues = params.get("x.pe");
  const xsValues = params.get("xs");

  const paramsCopy = new Map<string, string[]>();
  for (const [key, values] of params) {
    paramsCopy.set(key, [...values]);
  }

  return {
    protocol,
    fullHash: new Uint8Array(hash),
    handshakeHash: new Uint8Array(handshakeHash),
    infoHash,
    name: dnValues?.[0],
    announce: [...(trValues ?? [])],
    webSeeds: [...(wsValues ?? [])],
    peerAddresses: [...(peValues ?? [])],
    torrentFileUrl: xsValues?.[0],
    magnetURI,
    params: paramsCopy,
  };
}

/**
 * Parse a query string into a multi-value Map.
 * Both keys and values are URL-decoded; `safeDecodeURIComponent` is used
 * so malformed percent-encoding doesn't throw.
 */
function parseQueryString(
  query: string,
  limits: { maxQueryParameters: number; maxQueryParameterLength: number },
): Map<string, string[]> {
  const params = new Map<string, string[]>();
  if (!query) return params;

  let parameterCount = 0;

  for (const segment of query.split("&")) {
    if (!segment) continue;

    parameterCount++;
    if (
      parameterCount > limits.maxQueryParameters ||
      segment.length > limits.maxQueryParameterLength
    ) {
      throw new Error("Magnet URI exceeds resource limits");
    }

    const eqIdx = segment.indexOf("=");
    const key =
      eqIdx === -1
        ? safeDecodeURIComponent(segment)
        : safeDecodeURIComponent(segment.slice(0, eqIdx));
    const value =
      eqIdx === -1
        ? ""
        : safeDecodeURIComponent(segment.slice(eqIdx + 1));

    const existing = params.get(key);
    if (existing) {
      existing.push(value);
    } else {
      params.set(key, [value]);
    }
  }

  return params;
}

function normalizeParseOptions(
  options: MagnetParseOptions,
): {
  maxLength: number;
  maxQueryParameters: number;
  maxQueryParameterLength: number;
} {
  return {
    maxLength: validateLimit(
      options.maxLength,
      MAX_MAGNET_LENGTH,
      "maxLength",
    ),
    maxQueryParameters: validateLimit(
      options.maxQueryParameters,
      MAX_QUERY_PARAMETERS,
      "maxQueryParameters",
    ),
    maxQueryParameterLength: validateLimit(
      options.maxQueryParameterLength,
      MAX_QUERY_PARAMETER_LENGTH,
      "maxQueryParameterLength",
    ),
  };
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

/** Safe URL decode: returns the original string if decoding fails. */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
