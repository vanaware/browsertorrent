// /loco/monorepo/webtorrent/src/utils/metainfo-parser.ts
/**
 * Rigorous `.torrent` metainfo parser (BEP 3, 12, 19, 47, 52).
 *
 * Adaptado de deno-torrent/metainfo/parser.ts.
 * Browser-first: accepts `Uint8Array` only (no Deno `Reader` / `IoUtil`).
 * Decodes with `useMap` so binary `piece layers` keys survive, then normalizes
 * dictionaries to plain `Record`s while validating every field and resource limit.
 */

import { BencodeDecodeError, decode } from "./bencode.ts";
import { TorrentParseError } from "./errors.ts";
import {
  DEFAULT_MAX_METAINFO_SIZE,
  isSafePathComponent,
  validateTorrentFilePaths,
} from "./torrent-types.ts";
import type {
  ParseTorrentOptions,
  Torrent,
  TorrentInfo,
  TorrentPieceLayer,
  TorrentV2Info,
} from "./torrent-types.ts";
import {
  flattenV2Files,
  validateHybridLayout,
  validateV2PieceLayers,
} from "./metainfo-v2.ts";

// ── Internal helpers ──────────────────────────────────────────────────────

/** Convert bencode `Map` dictionaries to the plain objects exposed here. */
function normalizeDecodedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      if (typeof key !== "string") {
        throw new TorrentParseError("Torrent dictionary keys must be strings");
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
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array);
}

/** Return whether a value is an integer representable without precision loss. */
function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Return whether a value is a non-negative safe integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

/** Validate an optional string-valued field. */
function validateOptionalString(
  dict: Record<string, unknown>,
  field: string,
): void {
  if (dict[field] !== undefined && typeof dict[field] !== "string") {
    throw new TorrentParseError(
      `Invalid "${field}" field — expected a UTF-8 string`,
    );
  }
}

/** Validate the optional BEP-12 tracker tier list. */
function validateAnnounceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((tier) =>
      Array.isArray(tier) && tier.length > 0 &&
      tier.every((tracker) => typeof tracker === "string" && tracker.length > 0)
    )
  );
}

/** Validate a multi-file torrent file entry. */
function validateTorrentFile(
  value: unknown,
  index: number,
): asserts value is Record<string, unknown> {
  if (!isDictionary(value)) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}]" entry — expected a dictionary`,
    );
  }
  if (!isNonNegativeInteger(value["length"])) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].length" field — expected a non-negative integer`,
    );
  }
  if (value["attr"] !== undefined && typeof value["attr"] !== "string") {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].attr" field — expected a string`,
    );
  }
  if (
    !Array.isArray(value["path"]) || value["path"].length === 0 ||
    !value["path"].every(isSafePathComponent)
  ) {
    throw new TorrentParseError(
      `Invalid "info.files[${index}].path" field — expected safe, non-empty path components`,
    );
  }
}

// ── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse and rigorously validate a `.torrent` file from raw bytes.
 *
 * Encoded input is limited to 16 MiB by default; trusted callers may provide
 * a different positive `maxBytes` value.
 *
 * @param bytes Raw bencoded torrent bytes.
 * @param options Optional resource limits.
 * @returns The fully typed {@link Torrent} object.
 * @throws {TorrentParseError} If decoding fails, the resource limit is exceeded,
 *   required fields are missing, or piece/file metadata is inconsistent.
 */
export async function parseMetainfo(
  bytes: Uint8Array,
  options: ParseTorrentOptions = {},
): Promise<Torrent> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TorrentParseError(
      'Invalid "maxBytes" option — expected a positive safe integer',
    );
  }

  if (bytes.length > maxBytes) {
    throw new TorrentParseError(
      `Torrent data exceeds the configured limit of ${maxBytes} bytes`,
    );
  }

  // ── 1. Decode bencode (Map mode preserves binary "piece layers" keys). ──
  let decoded: unknown;
  let pieceLayers: TorrentPieceLayer[] | undefined;
  try {
    const raw = decode(bytes, { maxBytes, useMap: true });
    if (raw instanceof Map && raw.has("piece layers")) {
      pieceLayers = normalizePieceLayers(raw.get("piece layers"));
      raw.delete("piece layers");
    }
    decoded = normalizeDecodedValue(raw);
  } catch (error) {
    const message = error instanceof BencodeDecodeError
      ? error.message
      : "Invalid bencode data";
    throw new TorrentParseError(message, { cause: error });
  }

  // ── 2. Validate outer structure. ────────────────────────────────────────
  if (!isDictionary(decoded)) {
    throw new TorrentParseError(
      "Torrent root must be a bencode dictionary, got: " +
        (Array.isArray(decoded) ? "list" : typeof decoded),
    );
  }

  const dictionary = decoded;
  if (pieceLayers !== undefined) dictionary["piece layers"] = pieceLayers;

  validateOptionalString(dictionary, "announce");
  if (dictionary["announce"] === "") {
    throw new TorrentParseError(
      'Invalid "announce" field — expected a non-empty URL string',
    );
  }
  validateOptionalString(dictionary, "comment");
  validateOptionalString(dictionary, "created by");
  validateOptionalString(dictionary, "source");
  if (
    dictionary["announce-list"] !== undefined &&
    !validateAnnounceList(dictionary["announce-list"])
  ) {
    throw new TorrentParseError(
      'Invalid "announce-list" field — expected a string array of string arrays',
    );
  }
  if (
    dictionary["url-list"] !== undefined &&
    !(
      typeof dictionary["url-list"] === "string" ||
      (Array.isArray(dictionary["url-list"]) &&
        dictionary["url-list"].length > 0 &&
        dictionary["url-list"].every((url) =>
          typeof url === "string" && url.length > 0
        ))
    )
  ) {
    throw new TorrentParseError(
      'Invalid "url-list" field — expected a non-empty string or non-empty string array',
    );
  }
  if (dictionary["url-list"] === "") {
    throw new TorrentParseError(
      'Invalid "url-list" field — expected a non-empty URL string',
    );
  }
  if (
    dictionary["creation date"] !== undefined &&
    !isNonNegativeInteger(dictionary["creation date"])
  ) {
    throw new TorrentParseError(
      'Invalid "creation date" field — expected a non-negative integer',
    );
  }

  const info = dictionary["info"];
  if (!isDictionary(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }

  // ── 3. Validate info dictionary. ────────────────────────────────────────
  const infoDict = info;

  if (
    infoDict["meta version"] !== undefined &&
    infoDict["meta version"] !== 2
  ) {
    throw new TorrentParseError(
      `Unsupported "info.meta version": ${String(infoDict["meta version"])}`,
    );
  }

  if (!isSafePathComponent(infoDict["name"])) {
    throw new TorrentParseError(
      'Missing or invalid "info.name" field — expected a safe file or directory name',
    );
  }

  if (!isSafeInteger(infoDict["piece length"]) || infoDict["piece length"] <= 0) {
    throw new TorrentParseError(
      'Missing or invalid "info.piece length" field — expected a positive integer',
    );
  }

  if (
    infoDict["private"] !== undefined &&
    infoDict["private"] !== 0 &&
    infoDict["private"] !== 1
  ) {
    throw new TorrentParseError('Invalid "info.private" field — expected 0 or 1');
  }

  if (infoDict["meta version"] === 2) {
    const hasV1Fields = infoDict["pieces"] !== undefined ||
      infoDict["length"] !== undefined || infoDict["files"] !== undefined;
    if (hasV1Fields) validateV1Fields(infoDict);
    const files = pieceLayers === undefined &&
        options.allowMissingPieceLayers === true
      ? flattenV2Files(infoDict as unknown as TorrentV2Info)
      : await validateV2PieceLayers(
        infoDict as unknown as TorrentV2Info,
        pieceLayers ?? [],
      );
    validateHybridLayout(infoDict as unknown as TorrentInfo, files);
  } else {
    if (pieceLayers !== undefined) {
      throw new TorrentParseError('BEP-3 torrent must not contain "piece layers"');
    }
    validateV1Fields(infoDict);
  }

  return decoded as unknown as Torrent;
}

/** Validate the BEP-3 `info` fields (`pieces`, `length`, `files`). */
function validateV1Fields(infoDict: Record<string, unknown>): void {
  if (typeof infoDict["pieces"] === "string") {
    infoDict["pieces"] = new TextEncoder().encode(infoDict["pieces"]);
  }
  if (
    !(infoDict["pieces"] instanceof Uint8Array) ||
    infoDict["pieces"].length % 20 !== 0
  ) {
    throw new TorrentParseError(
      'Invalid "info.pieces" field — expected a Uint8Array whose length is a multiple of 20',
    );
  }
  if (
    infoDict["length"] !== undefined &&
    !isNonNegativeInteger(infoDict["length"])
  ) {
    throw new TorrentParseError(
      'Invalid "info.length" field — expected a non-negative integer',
    );
  }
  if (infoDict["files"] !== undefined) {
    if (!Array.isArray(infoDict["files"]) || infoDict["files"].length === 0) {
      throw new TorrentParseError(
        'Invalid "info.files" field — expected at least one file',
      );
    }
    if (infoDict["length"] !== undefined) {
      throw new TorrentParseError(
        'Torrent info must not contain both "length" and "files"',
      );
    }
    infoDict["files"].forEach(validateTorrentFile);
    validateTorrentFilePaths(infoDict["files"]);
  }
  if (infoDict["length"] === undefined && infoDict["files"] === undefined) {
    throw new TorrentParseError(
      'Torrent info must contain either "length" or "files"',
    );
  }
  const totalLength = infoDict["length"] ??
    (infoDict["files"] as Record<string, unknown>[]).reduce(
      (total, file) => total + (file["length"] as number),
      0,
    );
  if (!Number.isSafeInteger(totalLength)) {
    throw new TorrentParseError(
      "Torrent content length exceeds the safe integer range",
    );
  }
  const expectedPiecesLength = Math.ceil(
    (totalLength as number) / (infoDict["piece length"] as number),
  ) * 20;
  if (infoDict["pieces"].length !== expectedPiecesLength) {
    throw new TorrentParseError(
      `Invalid "info.pieces" field — expected ${expectedPiecesLength} bytes for ${totalLength} content bytes`,
    );
  }
}

/** Normalize the BEP-52 root-level `piece layers` dictionary. */
function normalizePieceLayers(value: unknown): TorrentPieceLayer[] {
  if (!(value instanceof Map)) {
    throw new TorrentParseError(
      'Invalid "piece layers" field — expected a dictionary',
    );
  }
  const layers: TorrentPieceLayer[] = [];
  for (const [root, hashes] of value) {
    layers.push({
      piecesRoot: binaryBytes(root),
      hashes: binaryBytes(hashes),
    });
  }
  return layers;
}

/** Coerce a bencode byte-string value (UTF-8 string or bytes) to bytes. */
function binaryBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TorrentParseError("BEP-52 hash fields must be byte strings");
}