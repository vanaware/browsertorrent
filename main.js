/* BrowserTorrent v0.0.102-mu72e0l8 */

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn2, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn2 && (res = (0, fn2[__getOwnPropNames(fn2)[0]])(fn2 = 0)), res;
  } catch (e3) {
    throw err = [e3], e3;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/core/src/utils/event-target.ts
var TypedEventTarget;
var init_event_target = __esm({
  "packages/core/src/utils/event-target.ts"() {
    TypedEventTarget = class extends EventTarget {
      static {
        __name(this, "TypedEventTarget");
      }
      /**
       * Registra um listener para um evento específico.
       */
      on(type, listener, options) {
        this.addEventListener(type, listener, options);
        return this;
      }
      /**
       * Registra um listener que será removido após a primeira execução.
       */
      once(type, listener) {
        this.addEventListener(type, listener, {
          once: true
        });
        return this;
      }
      /**
       * Remove um listener.
       */
      off(type, listener, options) {
        this.removeEventListener(type, listener, options);
        return this;
      }
      /**
       * Emite um evento.
       * 🔥 CORREÇÃO: Usamos `(detail as unknown) instanceof Event` para contornar
       * a restrição do TypeScript com tipos genéricos union (TS2358).
       */
      emit(type, detail) {
        const event = detail && detail instanceof Event ? detail : new CustomEvent(type, {
          detail,
          cancelable: true
        });
        return this.dispatchEvent(event);
      }
      /**
       * Remove todos os listeners de um tipo específico (ou de todos os tipos).
       * Nota: EventTarget nativo não expõe os listeners, então esta implementação
       * é um no-op seguro, confiando no Garbage Collector quando o alvo é destruído.
       */
      removeAllListeners(type) {
        return this;
      }
    };
  }
});

// packages/core/src/utils/encoding.ts
function decodeBase32(str) {
  const cleaned = str.replace(/=+$/, "").toUpperCase();
  if (cleaned.length === 0) return new Uint8Array(0);
  const lookup = /* @__PURE__ */ new Map();
  for (let i3 = 0; i3 < BASE32_ALPHABET.length; i3++) {
    lookup.set(BASE32_ALPHABET[i3], i3);
  }
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i3 = 0; i3 < cleaned.length; i3++) {
    const ch = cleaned[i3];
    const val = lookup.get(ch);
    if (val === void 0) {
      throw new TypeError(`Invalid base32 character: ${ch}`);
    }
    value = value << 5 | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}
function encodeHex(data) {
  let out = "";
  for (let i3 = 0; i3 < data.length; i3++) {
    out += HEX_TABLE[data[i3]];
  }
  return out;
}
function decodeHex(str) {
  if (str.length % 2 !== 0) {
    throw new TypeError("Invalid hex string: length must be even");
  }
  const bytes = new Uint8Array(str.length / 2);
  for (let i3 = 0; i3 < str.length; i3 += 2) {
    const hi = parseInt(str[i3], 16);
    const lo = parseInt(str[i3 + 1], 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) {
      throw new TypeError(`Invalid hex character at position ${i3}`);
    }
    bytes[i3 >> 1] = hi << 4 | lo;
  }
  return bytes;
}
function isBase32(str) {
  if (str.length === 0 || !/^[A-Za-z2-7]+={0,6}$/.test(str)) return false;
  const paddingLength = str.length - str.replace(/=+$/, "").length;
  const dataLength = str.length - paddingLength;
  const remainder = dataLength % 8;
  const expectedPadding = (/* @__PURE__ */ new Map([
    [
      0,
      0
    ],
    [
      2,
      6
    ],
    [
      4,
      4
    ],
    [
      5,
      3
    ],
    [
      7,
      1
    ]
  ])).get(remainder);
  return expectedPadding !== void 0 && (paddingLength === 0 || paddingLength === expectedPadding);
}
function isHex(str) {
  if (str.length === 0) return false;
  return /^[0-9a-fA-F]+$/.test(str);
}
var BASE32_ALPHABET, HEX_TABLE;
var init_encoding = __esm({
  "packages/core/src/utils/encoding.ts"() {
    BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    __name(decodeBase32, "decodeBase32");
    HEX_TABLE = Array.from({
      length: 256
    }, (_2, i3) => i3.toString(16).padStart(2, "0"));
    __name(encodeHex, "encodeHex");
    __name(decodeHex, "decodeHex");
    __name(isBase32, "isBase32");
    __name(isHex, "isHex");
  }
});

// packages/core/src/utils/magnet.ts
function parseMagnet(magnet, options = {}) {
  const limits = normalizeParseOptions(options);
  if (typeof magnet !== "string" || magnet.length > limits.maxLength || magnet.slice(0, MAGNET_PREFIX.length).toLowerCase() !== MAGNET_PREFIX) {
    throw new Error("Invalid magnet URI: must start with 'magnet:?'");
  }
  const queryString = magnet.slice(MAGNET_PREFIX.length);
  const params = parseQueryString(queryString, limits);
  const xtValues = params.get("xt");
  if (!xtValues || xtValues.length === 0) {
    throw new Error("Invalid magnet URI: missing or invalid 'xt' parameter");
  }
  let v1;
  let v22;
  for (const xt2 of xtValues) {
    const result = parseXt(xt2, params, magnet);
    if (!result) continue;
    if (result.protocol === "v1" && !v1) v1 = result;
    if (result.protocol === "v2" && !v22) v22 = result;
  }
  const selected = v1 ?? v22;
  if (!selected) {
    throw new Error("Invalid magnet URI: no valid xt hash found");
  }
  return {
    protocol: selected.protocol,
    infoHash: selected.infoHash,
    infoHashBuffer: new Uint8Array(selected.handshakeHash),
    handshakeHash: new Uint8Array(selected.handshakeHash),
    infoHashV1: v1 ? new Uint8Array(v1.fullHash) : void 0,
    infoHashV2: v22 ? new Uint8Array(v22.fullHash) : void 0,
    infoHashV1Hex: v1 ? encodeHex(v1.fullHash) : void 0,
    infoHashV2Hex: v22 ? encodeHex(v22.fullHash) : void 0,
    name: selected.name,
    announce: selected.announce,
    webSeeds: selected.webSeeds,
    peerAddresses: selected.peerAddresses,
    torrentFileUrl: selected.torrentFileUrl,
    magnetURI: selected.magnetURI,
    params: selected.params
  };
}
function isSha1Hex(hash) {
  return hash.length === 40 && isHex(hash);
}
function isSha1Base32(hash) {
  return hash.length === 32 && isBase32(hash);
}
function parseXt(xt2, params, magnetURI) {
  if (xt2.slice(0, 4).toLowerCase() !== "urn:") return void 0;
  const urnBody = xt2.slice(4);
  const colonIdx = urnBody.indexOf(":");
  if (colonIdx === -1) return void 0;
  const nid = urnBody.slice(0, colonIdx).toLowerCase();
  const hashString = urnBody.slice(colonIdx + 1);
  if (!SUPPORTED_NIDS.has(nid)) return void 0;
  let hash;
  let protocol = "v1";
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
    return void 0;
  }
  if (!hash) return void 0;
  const handshakeHash = protocol === "v2" ? hash.slice(0, 20) : hash.slice();
  const infoHash = encodeHex(handshakeHash);
  const dnValues = params.get("dn");
  const trValues = params.get("tr");
  const wsValues = params.get("ws");
  const peValues = params.get("x.pe");
  const xsValues = params.get("xs");
  const paramsCopy = /* @__PURE__ */ new Map();
  for (const [key, values] of params) {
    paramsCopy.set(key, [
      ...values
    ]);
  }
  return {
    protocol,
    fullHash: new Uint8Array(hash),
    handshakeHash: new Uint8Array(handshakeHash),
    infoHash,
    name: dnValues?.[0],
    announce: [
      ...trValues ?? []
    ],
    webSeeds: [
      ...wsValues ?? []
    ],
    peerAddresses: [
      ...peValues ?? []
    ],
    torrentFileUrl: xsValues?.[0],
    magnetURI,
    params: paramsCopy
  };
}
function parseQueryString(query, limits) {
  const params = /* @__PURE__ */ new Map();
  if (!query) return params;
  let parameterCount = 0;
  for (const segment of query.split("&")) {
    if (!segment) continue;
    parameterCount++;
    if (parameterCount > limits.maxQueryParameters || segment.length > limits.maxQueryParameterLength) {
      throw new Error("Magnet URI exceeds resource limits");
    }
    const eqIdx = segment.indexOf("=");
    const key = eqIdx === -1 ? safeDecodeURIComponent(segment) : safeDecodeURIComponent(segment.slice(0, eqIdx));
    const value = eqIdx === -1 ? "" : safeDecodeURIComponent(segment.slice(eqIdx + 1));
    const existing = params.get(key);
    if (existing) {
      existing.push(value);
    } else {
      params.set(key, [
        value
      ]);
    }
  }
  return params;
}
function normalizeParseOptions(options) {
  return {
    maxLength: validateLimit(options.maxLength, MAX_MAGNET_LENGTH, "maxLength"),
    maxQueryParameters: validateLimit(options.maxQueryParameters, MAX_QUERY_PARAMETERS, "maxQueryParameters"),
    maxQueryParameterLength: validateLimit(options.maxQueryParameterLength, MAX_QUERY_PARAMETER_LENGTH, "maxQueryParameterLength")
  };
}
function validateLimit(value, defaultValue, name) {
  if (value === void 0) return defaultValue;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Invalid parse option: ${name} must be a positive integer`);
  }
  return value;
}
function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
var MAGNET_PREFIX, MAX_MAGNET_LENGTH, MAX_QUERY_PARAMETERS, MAX_QUERY_PARAMETER_LENGTH, SUPPORTED_NIDS;
var init_magnet = __esm({
  "packages/core/src/utils/magnet.ts"() {
    init_encoding();
    MAGNET_PREFIX = "magnet:?";
    MAX_MAGNET_LENGTH = 1024 * 1024;
    MAX_QUERY_PARAMETERS = 1024;
    MAX_QUERY_PARAMETER_LENGTH = 64 * 1024;
    SUPPORTED_NIDS = /* @__PURE__ */ new Set([
      "btih",
      "sha1",
      "btmh"
    ]);
    __name(parseMagnet, "parseMagnet");
    __name(isSha1Hex, "isSha1Hex");
    __name(isSha1Base32, "isSha1Base32");
    __name(parseXt, "parseXt");
    __name(parseQueryString, "parseQueryString");
    __name(normalizeParseOptions, "normalizeParseOptions");
    __name(validateLimit, "validateLimit");
    __name(safeDecodeURIComponent, "safeDecodeURIComponent");
  }
});

// packages/core/src/utils/bencode.ts
function decode(data, options = {}) {
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
function decodePrefix(data, options = {}) {
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
  return [
    value,
    data.subarray(nextOffset)
  ];
}
function _decodeOne(data, maxDepth, useMap, allowUnsortedKeys) {
  const stack = [];
  let offset = 0;
  let current;
  while (true) {
    if (current !== void 0) {
      if (stack.length === 0) return [
        current,
        offset
      ];
      const frame2 = stack[stack.length - 1];
      if (frame2.kind === "list") {
        frame2.value.push(current);
      } else if (frame2.pendingKey !== void 0) {
        if (frame2.useMap) {
          frame2.value.set(frame2.pendingKey, current);
        } else {
          const keyStr = typeof frame2.pendingKey === "string" ? frame2.pendingKey : _td.decode(frame2.pendingKey);
          frame2.value[keyStr] = current;
        }
        frame2.pendingKey = void 0;
      } else {
        throw new BencodeDecodeError("dictionary value has no key");
      }
      current = void 0;
      continue;
    }
    if (offset >= data.length) {
      throw new BencodeDecodeError(`unexpected end of data at offset ${offset}`);
    }
    const frame = stack[stack.length - 1];
    if (frame?.kind === "list" && data[offset] === 101) {
      offset++;
      stack.pop();
      current = frame.value;
      continue;
    }
    if (frame?.kind === "dict") {
      if (frame.pendingKey === void 0) {
        if (data[offset] === 101) {
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
        if (!allowUnsortedKeys && frame.previousKeyBytes && _compareBytes(frame.previousKeyBytes, keyBytes) > 0) {
          throw new BencodeDecodeError("dictionary keys are not sorted by raw bytes");
        }
        frame.seenKeys.add(fingerprint);
        frame.previousKeyBytes = keyBytes;
        frame.pendingKey = key;
        offset = afterKey;
        continue;
      }
    }
    const token = data[offset];
    if (token === 105) {
      [current, offset] = _decodeInteger(data, offset + 1);
      continue;
    }
    if (token >= 48 && token <= 57) {
      [current, offset] = _decodeByteString(data, offset);
      continue;
    }
    if (token === 108 || token === 100) {
      if (stack.length >= maxDepth) {
        throw new BencodeDecodeError(`maximum nesting depth of ${maxDepth} exceeded`);
      }
      offset++;
      if (token === 108) {
        stack.push({
          kind: "list",
          value: []
        });
      } else {
        const value = useMap ? /* @__PURE__ */ new Map() : {};
        stack.push({
          kind: "dict",
          value,
          seenKeys: /* @__PURE__ */ new Set(),
          useMap
        });
      }
      continue;
    }
    throw new BencodeDecodeError(`unexpected token 0x${token.toString(16).padStart(2, "0")} at offset ${offset}`);
  }
}
function _decodeInteger(data, offset) {
  const end = data.indexOf(101, offset);
  if (end === -1) {
    throw new BencodeDecodeError('unterminated integer: missing "e"');
  }
  const raw = _td.decode(data.subarray(offset, end));
  if (!/^-?(?:0|[1-9]\d*)$/.test(raw) || raw === "-0") {
    throw new BencodeDecodeError(`invalid integer: "${raw}"`);
  }
  const num = Number(raw);
  if (Number.isSafeInteger(num)) {
    return [
      num,
      end + 1
    ];
  }
  return [
    BigInt(raw),
    end + 1
  ];
}
function _decodeByteString(data, offset) {
  const colon = data.indexOf(58, offset);
  if (colon === -1) {
    throw new BencodeDecodeError('malformed byte string: missing ":"');
  }
  const rawLength = data.subarray(offset, colon);
  if (rawLength.length === 0 || rawLength.some((byte) => byte < 48 || byte > 57)) {
    throw new BencodeDecodeError(`invalid byte string length at offset ${offset}`);
  }
  if (rawLength.length > 1 && rawLength[0] === 48) {
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
    throw new BencodeDecodeError(`truncated byte string: need ${length} bytes but only ${data.length - start} available`);
  }
  const bytes = data.subarray(start, end);
  try {
    const str = _td.decode(bytes);
    if (
      // deno-lint-ignore no-control-regex
      !str.includes("\uFFFD") && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str)
    ) {
      return [
        str,
        end
      ];
    }
  } catch {
  }
  return [
    bytes.slice(),
    end
  ];
}
function encode(value) {
  const writer = new _ByteWriter();
  _encodeValue(value, writer, /* @__PURE__ */ new WeakSet());
  return writer.finish();
}
function _encodeValue(value, out, ancestors) {
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
  if (typeof value === "object" && value !== null) {
    if (ancestors.has(value)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value);
    try {
      _encodeDictFromRecord(value, out, ancestors);
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  throw new BencodeEncodeError(`unsupported value type: ${typeof value}`);
}
function _encodeInteger(value, out) {
  if (!Number.isSafeInteger(value)) {
    throw new BencodeEncodeError(`only safe integers are supported, got: ${value}`);
  }
  out.write(_te.encode(`i${value}e`));
}
function _encodeString(value, out) {
  _encodeBytes(_te.encode(value), out);
}
function _encodeBytes(value, out) {
  out.write(_te.encode(`${value.length}:`));
  out.write(value);
}
function _encodeList(value, out, ancestors) {
  out.write(_te.encode("l"));
  for (const item of value) _encodeValue(item, out, ancestors);
  out.write(_te.encode("e"));
}
function _encodeDict(value, out, ancestors) {
  const entries = [
    ...value.entries()
  ].map(([key, item]) => ({
    bytes: _keyBytes(key),
    item
  }));
  entries.sort((a3, b3) => _compareBytes(a3.bytes, b3.bytes));
  out.write(_te.encode("d"));
  for (let i3 = 0; i3 < entries.length; i3++) {
    if (i3 > 0 && _compareBytes(entries[i3 - 1].bytes, entries[i3].bytes) === 0) {
      throw new BencodeEncodeError("duplicate dictionary key after byte encoding");
    }
    _encodeBytes(entries[i3].bytes, out);
    _encodeValue(entries[i3].item, out, ancestors);
  }
  out.write(_te.encode("e"));
}
function _encodeDictFromRecord(value, out, ancestors) {
  const entries = Object.keys(value).map((key) => ({
    key,
    bytes: _te.encode(key),
    item: value[key]
  }));
  entries.sort((a3, b3) => _compareBytes(a3.bytes, b3.bytes));
  out.write(_te.encode("d"));
  for (let i3 = 0; i3 < entries.length; i3++) {
    if (i3 > 0 && _compareBytes(entries[i3 - 1].bytes, entries[i3].bytes) === 0) {
      throw new BencodeEncodeError("duplicate dictionary key after byte encoding");
    }
    _encodeBytes(entries[i3].bytes, out);
    _encodeValue(entries[i3].item, out, ancestors);
  }
  out.write(_te.encode("e"));
}
function _keyBytes(key) {
  if (typeof key === "string") return _te.encode(key);
  if (key instanceof Uint8Array) return key;
  throw new BencodeEncodeError("dictionary keys must be string or Uint8Array");
}
function _toHex(bytes) {
  return Array.from(bytes, (b3) => b3.toString(16).padStart(2, "0")).join("");
}
function _compareBytes(a3, b3) {
  const length = Math.min(a3.length, b3.length);
  for (let i3 = 0; i3 < length; i3++) {
    const ai = a3[i3];
    const bi = b3[i3];
    if (ai !== bi) return ai - bi;
  }
  return a3.length - b3.length;
}
var BencodeDecodeError, BencodeEncodeError, _td, _te, _defaultMaxBytes, _defaultMaxDepth, _ByteWriter;
var init_bencode = __esm({
  "packages/core/src/utils/bencode.ts"() {
    BencodeDecodeError = class extends Error {
      static {
        __name(this, "BencodeDecodeError");
      }
      constructor(message) {
        super(message);
        this.name = "BencodeDecodeError";
      }
    };
    BencodeEncodeError = class extends Error {
      static {
        __name(this, "BencodeEncodeError");
      }
      constructor(message) {
        super(message);
        this.name = "BencodeEncodeError";
      }
    };
    _td = new TextDecoder("utf-8");
    _te = new TextEncoder();
    _defaultMaxBytes = 64 * 1024 * 1024;
    _defaultMaxDepth = 1e3;
    __name(decode, "decode");
    __name(decodePrefix, "decodePrefix");
    __name(_decodeOne, "_decodeOne");
    __name(_decodeInteger, "_decodeInteger");
    __name(_decodeByteString, "_decodeByteString");
    __name(encode, "encode");
    __name(_encodeValue, "_encodeValue");
    __name(_encodeInteger, "_encodeInteger");
    __name(_encodeString, "_encodeString");
    __name(_encodeBytes, "_encodeBytes");
    __name(_encodeList, "_encodeList");
    __name(_encodeDict, "_encodeDict");
    __name(_encodeDictFromRecord, "_encodeDictFromRecord");
    __name(_keyBytes, "_keyBytes");
    __name(_toHex, "_toHex");
    __name(_compareBytes, "_compareBytes");
    _ByteWriter = class {
      static {
        __name(this, "_ByteWriter");
      }
      #buffer = new Uint8Array(1024);
      #length = 0;
      write(chunk) {
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
      finish() {
        return this.#buffer.slice(0, this.#length);
      }
    };
  }
});

// packages/core/src/utils/errors.ts
var BitfieldError, TrackerError, TorrentError, TorrentParseError, PeerWireError, ProtocolError, TimeoutError;
var init_errors = __esm({
  "packages/core/src/utils/errors.ts"() {
    BitfieldError = class extends Error {
      static {
        __name(this, "BitfieldError");
      }
      code;
      constructor(message, code = "BITFIELD_ERROR") {
        super(message), this.code = code;
        this.name = "BitfieldError";
      }
    };
    TrackerError = class extends Error {
      static {
        __name(this, "TrackerError");
      }
      code;
      constructor(message, code = "TRACKER_ERROR", options) {
        super(message, options), this.code = code;
        this.name = "TrackerError";
      }
    };
    TorrentError = class extends Error {
      static {
        __name(this, "TorrentError");
      }
      code;
      constructor(message, code = "TORRENT_ERROR") {
        super(message), this.code = code;
        this.name = "TorrentError";
      }
    };
    TorrentParseError = class extends TorrentError {
      static {
        __name(this, "TorrentParseError");
      }
      constructor(message, options) {
        super(message, "TORRENT_PARSE_ERROR");
        if (options) {
          this.cause = options.cause;
        }
        this.name = "TorrentParseError";
      }
    };
    PeerWireError = class extends Error {
      static {
        __name(this, "PeerWireError");
      }
      code;
      constructor(message, code = "PEERWIRE_ERROR", options) {
        super(message, options), this.code = code;
        this.name = "PeerWireError";
      }
    };
    ProtocolError = class extends PeerWireError {
      static {
        __name(this, "ProtocolError");
      }
      constructor(message, code = "PROTOCOL_ERROR", options) {
        super(message, code, options);
        this.name = "ProtocolError";
      }
    };
    TimeoutError = class extends PeerWireError {
      static {
        __name(this, "TimeoutError");
      }
      constructor(message, code = "TIMEOUT_ERROR", options) {
        super(message, code, options);
        this.name = "TimeoutError";
      }
    };
  }
});

// packages/core/src/utils/torrent-types.ts
function isSafePathComponent(component) {
  return typeof component === "string" && component.length > 0 && component !== "." && component !== ".." && !component.includes("/") && !component.includes("\\") && !component.includes("\0");
}
function validateTorrentFilePaths(files) {
  const entries = /* @__PURE__ */ new Map();
  const directoryPrefixes = /* @__PURE__ */ new Set();
  for (const file of files) {
    const path = file["path"];
    const key = path.join("\0");
    const padding = typeof file["attr"] === "string" && file["attr"].includes("p");
    const previous = entries.get(key);
    if (previous !== void 0 && !(padding && previous.padding && previous.length === file["length"])) {
      throw new TorrentParseError(`Duplicate or conflicting file path: ${path.join("/")}`);
    }
    if (directoryPrefixes.has(key)) {
      throw new TorrentParseError(`File path conflicts with a directory path: ${path.join("/")}`);
    }
    for (let index = 1; index < path.length; index++) {
      const prefix = path.slice(0, index).join("\0");
      if (entries.has(prefix)) {
        throw new TorrentParseError(`File path is nested below another file: ${path.join("/")}`);
      }
      directoryPrefixes.add(prefix);
    }
    entries.set(key, {
      length: file["length"],
      padding
    });
  }
}
var DEFAULT_MAX_METAINFO_SIZE;
var init_torrent_types = __esm({
  "packages/core/src/utils/torrent-types.ts"() {
    init_errors();
    DEFAULT_MAX_METAINFO_SIZE = 16 * 1024 * 1024;
    __name(isSafePathComponent, "isSafePathComponent");
    __name(validateTorrentFilePaths, "validateTorrentFilePaths");
  }
});

// packages/core/src/utils/metainfo-v2.ts
function flattenV2Files(info) {
  const pieceLength = info["piece length"];
  if (!Number.isSafeInteger(pieceLength) || pieceLength < BLOCK_LENGTH || !isPowerOfTwo(pieceLength)) {
    throw new TorrentParseError('Invalid "info.piece length" field for v2 \u2014 expected a power of two of at least 16384');
  }
  const fileTree = info["file tree"];
  if (!isDictionary(fileTree)) {
    throw new TorrentParseError('Missing or invalid "info.file tree" dictionary');
  }
  const files = [];
  const stack = [
    {
      node: fileTree,
      path: [],
      depth: 0
    }
  ];
  let pieceStart = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.depth > MAX_FILE_TREE_DEPTH) {
      throw new TorrentParseError("Torrent v2 file tree is too deep");
    }
    const entries = Object.entries(current.node);
    if (entries.length === 0) {
      throw new TorrentParseError("Torrent v2 file tree contains an empty directory");
    }
    const terminal = Object.prototype.hasOwnProperty.call(current.node, "");
    if (terminal) {
      if (current.path.length === 0) {
        throw new TorrentParseError("Torrent v2 file tree root must not be a file");
      }
      if (entries.length !== 1) {
        throw new TorrentParseError("Torrent v2 file entry must not contain child paths");
      }
      const properties = current.node[""];
      validateFileProperties(properties, current.path);
      const file = properties;
      const pieceCount = file.length === 0 ? 0 : Math.ceil(file.length / pieceLength);
      files.push({
        path: current.path,
        length: file.length,
        piecesRoot: file["pieces root"],
        attr: file.attr,
        pieceStart,
        pieceCount
      });
      pieceStart += pieceCount;
      if (files.length > MAX_FILE_COUNT) {
        throw new TorrentParseError("Torrent v2 contains too many files");
      }
      continue;
    }
    for (let index = entries.length - 1; index >= 0; index--) {
      const [component, child] = entries[index];
      if (!isSafePathComponent(component)) {
        throw new TorrentParseError(`Invalid v2 file tree path component: ${JSON.stringify(component)}`);
      }
      if (!isDictionary(child)) {
        throw new TorrentParseError(`Invalid v2 file tree node: ${[
          ...current.path,
          component
        ].join("/")}`);
      }
      stack.push({
        node: child,
        path: [
          ...current.path,
          component
        ],
        depth: current.depth + 1
      });
    }
  }
  if (files.length === 0) {
    throw new TorrentParseError("Torrent v2 file tree must contain at least one file");
  }
  return files;
}
async function validateV2PieceLayers(info, layers) {
  const files = flattenV2Files(info);
  const byRoot = /* @__PURE__ */ new Map();
  for (const layer of layers) {
    if (layer.piecesRoot.length !== 32) {
      throw new TorrentParseError('Invalid "piece layers" key \u2014 expected 32 bytes');
    }
    if (layer.hashes.length === 0 || layer.hashes.length % 32 !== 0) {
      throw new TorrentParseError('Invalid "piece layers" value \u2014 expected one or more 32-byte hashes');
    }
    const key = toHex(layer.piecesRoot);
    if (byRoot.has(key)) {
      throw new TorrentParseError("Duplicate BEP-52 piece layer root");
    }
    byRoot.set(key, layer);
  }
  const used = /* @__PURE__ */ new Set();
  for (const file of files) {
    if (file.length === 0) {
      if (file.piecesRoot !== void 0) {
        throw new TorrentParseError(`Empty v2 file must not have a pieces root: ${file.path.join("/")}`);
      }
      continue;
    }
    if (file.piecesRoot?.length !== 32) {
      throw new TorrentParseError(`Non-empty v2 file has no valid pieces root: ${file.path.join("/")}`);
    }
    if (file.length <= info["piece length"]) continue;
    const key = toHex(file.piecesRoot);
    const layer = byRoot.get(key);
    if (!layer) {
      throw new TorrentParseError(`Missing piece layer for v2 file: ${file.path.join("/")}`);
    }
    if (layer.hashes.length !== file.pieceCount * 32) {
      throw new TorrentParseError(`Invalid piece layer hash count for v2 file: ${file.path.join("/")}`);
    }
    const calculated = await merkleRootFromPieceLayer(layer.hashes, info["piece length"]);
    if (!equals(calculated, file.piecesRoot)) {
      throw new TorrentParseError(`Piece layer does not match pieces root for v2 file: ${file.path.join("/")}`);
    }
    used.add(key);
  }
  if (used.size !== byRoot.size) {
    throw new TorrentParseError("Piece layers contain an entry not required by the v2 file tree");
  }
  return files;
}
function validateHybridLayout(info, v2Files) {
  const infoAny = info;
  if (infoAny["meta version"] !== 2 || infoAny["pieces"] === void 0) return;
  const v1Files = info.files ?? [
    {
      length: info.length,
      path: [
        info.name
      ]
    }
  ];
  const realV1 = v1Files.filter((file) => !file.attr?.includes("p"));
  if (realV1.length !== v2Files.length) {
    throw new TorrentParseError("Hybrid torrent v1/v2 file counts do not match");
  }
  let v1Offset = 0;
  let realIndex = 0;
  for (const file of v1Files) {
    if (file.attr?.includes("p")) {
      v1Offset += file.length;
      continue;
    }
    const v22 = v2Files[realIndex];
    if (v1Offset % info["piece length"] !== 0 && realIndex > 0) {
      throw new TorrentParseError(`Hybrid torrent file is not piece-aligned: ${file.path.join("/")}`);
    }
    if (file.length !== v22.length || !samePath(file.path, v22.path)) {
      throw new TorrentParseError(`Hybrid torrent v1/v2 file layout differs at: ${file.path.join("/")}`);
    }
    v1Offset += file.length;
    realIndex++;
  }
}
async function merkleRootFromPieceLayer(hashes, pieceLength) {
  const nodes = splitHashes(hashes);
  const target = nextPowerOfTwo(nodes.length);
  let zero = new Uint8Array(32);
  for (let size = BLOCK_LENGTH; size < pieceLength; size *= 2) {
    zero = await hashPair(zero, zero);
  }
  while (nodes.length < target) nodes.push(zero);
  while (nodes.length > 1) {
    const next = [];
    for (let index = 0; index < nodes.length; index += 2) {
      next.push(await hashPair(nodes[index], nodes[index + 1]));
    }
    nodes.length = 0;
    nodes.push(...next);
  }
  return nodes[0];
}
async function hashPair(left, right) {
  const bytes = new Uint8Array(64);
  bytes.set(left);
  bytes.set(right, 32);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}
function splitHashes(bytes) {
  const hashes = [];
  for (let offset = 0; offset < bytes.length; offset += 32) {
    hashes.push(bytes.slice(offset, offset + 32));
  }
  return hashes;
}
function validateFileProperties(value, path) {
  if (!isDictionary(value)) {
    throw new TorrentParseError(`Invalid v2 file properties: ${path.join("/")}`);
  }
  const dict = value;
  if (!Number.isSafeInteger(dict["length"]) || dict["length"] < 0) {
    throw new TorrentParseError(`Invalid v2 file length: ${path.join("/")}`);
  }
  if (dict["attr"] !== void 0 && typeof dict["attr"] !== "string") {
    throw new TorrentParseError(`Invalid v2 file attributes: ${path.join("/")}`);
  }
  if (dict["pieces root"] !== void 0) {
    if (typeof dict["pieces root"] === "string") {
      dict["pieces root"] = new TextEncoder().encode(dict["pieces root"]);
    }
    if (!(dict["pieces root"] instanceof Uint8Array)) {
      throw new TorrentParseError(`Invalid v2 pieces root: ${path.join("/")}`);
    }
  }
}
function isDictionary(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array);
}
function isPowerOfTwo(value) {
  return value > 0 && Math.log2(value) % 1 === 0;
}
function nextPowerOfTwo(value) {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}
function equals(left, right) {
  if (left.length !== right.length) return false;
  for (let i3 = 0; i3 < left.length; i3++) {
    if (left[i3] !== right[i3]) return false;
  }
  return true;
}
function samePath(left, right) {
  if (left.length !== right.length) return false;
  for (let i3 = 0; i3 < left.length; i3++) {
    if (left[i3] !== right[i3]) return false;
  }
  return true;
}
function toHex(bytes) {
  let hex = "";
  for (let i3 = 0; i3 < bytes.length; i3++) {
    hex += bytes[i3].toString(16).padStart(2, "0");
  }
  return hex;
}
var BLOCK_LENGTH, MAX_FILE_TREE_DEPTH, MAX_FILE_COUNT;
var init_metainfo_v2 = __esm({
  "packages/core/src/utils/metainfo-v2.ts"() {
    init_errors();
    init_torrent_types();
    BLOCK_LENGTH = 16 * 1024;
    MAX_FILE_TREE_DEPTH = 256;
    MAX_FILE_COUNT = 1e6;
    __name(flattenV2Files, "flattenV2Files");
    __name(validateV2PieceLayers, "validateV2PieceLayers");
    __name(validateHybridLayout, "validateHybridLayout");
    __name(merkleRootFromPieceLayer, "merkleRootFromPieceLayer");
    __name(hashPair, "hashPair");
    __name(splitHashes, "splitHashes");
    __name(validateFileProperties, "validateFileProperties");
    __name(isDictionary, "isDictionary");
    __name(isPowerOfTwo, "isPowerOfTwo");
    __name(nextPowerOfTwo, "nextPowerOfTwo");
    __name(equals, "equals");
    __name(samePath, "samePath");
    __name(toHex, "toHex");
  }
});

// packages/core/src/utils/metainfo-parser.ts
function normalizeDecodedValue(value) {
  if (value instanceof Map) {
    const object = {};
    for (const [key, entry] of value) {
      if (typeof key !== "string") {
        throw new TorrentParseError("Torrent dictionary keys must be strings");
      }
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value: normalizeDecodedValue(entry),
        writable: true
      });
    }
    return object;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDecodedValue);
  }
  return value;
}
function isDictionary2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array);
}
function isSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function isNonNegativeInteger(value) {
  return isSafeInteger(value) && value >= 0;
}
function validateOptionalString(dict, field) {
  if (dict[field] !== void 0 && typeof dict[field] !== "string") {
    throw new TorrentParseError(`Invalid "${field}" field \u2014 expected a UTF-8 string`);
  }
}
function validateAnnounceList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((tier) => Array.isArray(tier) && tier.length > 0 && tier.every((tracker) => typeof tracker === "string" && tracker.length > 0));
}
function validateTorrentFile(value, index) {
  if (!isDictionary2(value)) {
    throw new TorrentParseError(`Invalid "info.files[${index}]" entry \u2014 expected a dictionary`);
  }
  if (!isNonNegativeInteger(value["length"])) {
    throw new TorrentParseError(`Invalid "info.files[${index}].length" field \u2014 expected a non-negative integer`);
  }
  if (value["attr"] !== void 0 && typeof value["attr"] !== "string") {
    throw new TorrentParseError(`Invalid "info.files[${index}].attr" field \u2014 expected a string`);
  }
  if (!Array.isArray(value["path"]) || value["path"].length === 0 || !value["path"].every(isSafePathComponent)) {
    throw new TorrentParseError(`Invalid "info.files[${index}].path" field \u2014 expected safe, non-empty path components`);
  }
}
async function parseMetainfo(bytes, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_METAINFO_SIZE;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TorrentParseError('Invalid "maxBytes" option \u2014 expected a positive safe integer');
  }
  if (bytes.length > maxBytes) {
    throw new TorrentParseError(`Torrent data exceeds the configured limit of ${maxBytes} bytes`);
  }
  let decoded;
  let pieceLayers;
  try {
    const raw = decode(bytes, {
      maxBytes,
      useMap: true
    });
    if (raw instanceof Map && raw.has("piece layers")) {
      pieceLayers = normalizePieceLayers(raw.get("piece layers"));
      raw.delete("piece layers");
    }
    decoded = normalizeDecodedValue(raw);
  } catch (error) {
    const message = error instanceof BencodeDecodeError ? error.message : "Invalid bencode data";
    throw new TorrentParseError(message, {
      cause: error
    });
  }
  if (!isDictionary2(decoded)) {
    throw new TorrentParseError("Torrent root must be a bencode dictionary, got: " + (Array.isArray(decoded) ? "list" : typeof decoded));
  }
  const dictionary = decoded;
  if (pieceLayers !== void 0) dictionary["piece layers"] = pieceLayers;
  validateOptionalString(dictionary, "announce");
  if (dictionary["announce"] === "") {
    throw new TorrentParseError('Invalid "announce" field \u2014 expected a non-empty URL string');
  }
  validateOptionalString(dictionary, "comment");
  validateOptionalString(dictionary, "created by");
  validateOptionalString(dictionary, "source");
  if (dictionary["announce-list"] !== void 0 && !validateAnnounceList(dictionary["announce-list"])) {
    throw new TorrentParseError('Invalid "announce-list" field \u2014 expected a string array of string arrays');
  }
  if (dictionary["url-list"] !== void 0 && !(typeof dictionary["url-list"] === "string" || Array.isArray(dictionary["url-list"]) && dictionary["url-list"].length > 0 && dictionary["url-list"].every((url) => typeof url === "string" && url.length > 0))) {
    throw new TorrentParseError('Invalid "url-list" field \u2014 expected a non-empty string or non-empty string array');
  }
  if (dictionary["url-list"] === "") {
    throw new TorrentParseError('Invalid "url-list" field \u2014 expected a non-empty URL string');
  }
  if (dictionary["creation date"] !== void 0 && !isNonNegativeInteger(dictionary["creation date"])) {
    throw new TorrentParseError('Invalid "creation date" field \u2014 expected a non-negative integer');
  }
  const info = dictionary["info"];
  if (!isDictionary2(info)) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }
  const infoDict = info;
  if (infoDict["meta version"] !== void 0 && infoDict["meta version"] !== 2) {
    throw new TorrentParseError(`Unsupported "info.meta version": ${String(infoDict["meta version"])}`);
  }
  if (!isSafePathComponent(infoDict["name"])) {
    throw new TorrentParseError('Missing or invalid "info.name" field \u2014 expected a safe file or directory name');
  }
  if (!isSafeInteger(infoDict["piece length"]) || infoDict["piece length"] <= 0) {
    throw new TorrentParseError('Missing or invalid "info.piece length" field \u2014 expected a positive integer');
  }
  if (infoDict["private"] !== void 0 && infoDict["private"] !== 0 && infoDict["private"] !== 1) {
    throw new TorrentParseError('Invalid "info.private" field \u2014 expected 0 or 1');
  }
  if (infoDict["meta version"] === 2) {
    const hasV1Fields = infoDict["pieces"] !== void 0 || infoDict["length"] !== void 0 || infoDict["files"] !== void 0;
    if (hasV1Fields) validateV1Fields(infoDict);
    const files = pieceLayers === void 0 && options.allowMissingPieceLayers === true ? flattenV2Files(infoDict) : await validateV2PieceLayers(infoDict, pieceLayers ?? []);
    validateHybridLayout(infoDict, files);
  } else {
    if (pieceLayers !== void 0) {
      throw new TorrentParseError('BEP-3 torrent must not contain "piece layers"');
    }
    validateV1Fields(infoDict);
  }
  return decoded;
}
function validateV1Fields(infoDict) {
  if (typeof infoDict["pieces"] === "string") {
    infoDict["pieces"] = new TextEncoder().encode(infoDict["pieces"]);
  }
  if (!(infoDict["pieces"] instanceof Uint8Array) || infoDict["pieces"].length % 20 !== 0) {
    throw new TorrentParseError('Invalid "info.pieces" field \u2014 expected a Uint8Array whose length is a multiple of 20');
  }
  if (infoDict["length"] !== void 0 && !isNonNegativeInteger(infoDict["length"])) {
    throw new TorrentParseError('Invalid "info.length" field \u2014 expected a non-negative integer');
  }
  if (infoDict["files"] !== void 0) {
    if (!Array.isArray(infoDict["files"]) || infoDict["files"].length === 0) {
      throw new TorrentParseError('Invalid "info.files" field \u2014 expected at least one file');
    }
    if (infoDict["length"] !== void 0) {
      throw new TorrentParseError('Torrent info must not contain both "length" and "files"');
    }
    infoDict["files"].forEach(validateTorrentFile);
    validateTorrentFilePaths(infoDict["files"]);
  }
  if (infoDict["length"] === void 0 && infoDict["files"] === void 0) {
    throw new TorrentParseError('Torrent info must contain either "length" or "files"');
  }
  const totalLength = infoDict["length"] ?? infoDict["files"].reduce((total, file) => total + file["length"], 0);
  if (!Number.isSafeInteger(totalLength)) {
    throw new TorrentParseError("Torrent content length exceeds the safe integer range");
  }
  const expectedPiecesLength = Math.ceil(totalLength / infoDict["piece length"]) * 20;
  if (infoDict["pieces"].length !== expectedPiecesLength) {
    throw new TorrentParseError(`Invalid "info.pieces" field \u2014 expected ${expectedPiecesLength} bytes for ${totalLength} content bytes`);
  }
}
function normalizePieceLayers(value) {
  if (!(value instanceof Map)) {
    throw new TorrentParseError('Invalid "piece layers" field \u2014 expected a dictionary');
  }
  const layers = [];
  for (const [root, hashes] of value) {
    layers.push({
      piecesRoot: binaryBytes(root),
      hashes: binaryBytes(hashes)
    });
  }
  return layers;
}
function binaryBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TorrentParseError("BEP-52 hash fields must be byte strings");
}
var init_metainfo_parser = __esm({
  "packages/core/src/utils/metainfo-parser.ts"() {
    init_bencode();
    init_errors();
    init_torrent_types();
    init_metainfo_v2();
    __name(normalizeDecodedValue, "normalizeDecodedValue");
    __name(isDictionary2, "isDictionary");
    __name(isSafeInteger, "isSafeInteger");
    __name(isNonNegativeInteger, "isNonNegativeInteger");
    __name(validateOptionalString, "validateOptionalString");
    __name(validateAnnounceList, "validateAnnounceList");
    __name(validateTorrentFile, "validateTorrentFile");
    __name(parseMetainfo, "parseMetainfo");
    __name(validateV1Fields, "validateV1Fields");
    __name(normalizePieceLayers, "normalizePieceLayers");
    __name(binaryBytes, "binaryBytes");
  }
});

// packages/core/src/utils/metainfo-identity.ts
function extractInfoBytes(metainfo) {
  try {
    decode(metainfo, {
      maxBytes: metainfo.length
    });
  } catch (error) {
    throw new TorrentParseError("Invalid bencoded torrent data", {
      cause: error
    });
  }
  const cursor = {
    offset: 0
  };
  expect(metainfo, cursor, 100, "Torrent root must be a bencode dictionary");
  let result;
  while (peek(metainfo, cursor) !== 101) {
    const key = readByteString(metainfo, cursor);
    const valueStart = cursor.offset;
    skipValue(metainfo, cursor, 1);
    if (equalsAscii(key, "info")) {
      if (metainfo[valueStart] !== 100) {
        throw new TorrentParseError("Torrent info value must be a dictionary");
      }
      result = metainfo.slice(valueStart, cursor.offset);
    }
  }
  cursor.offset++;
  if (result === void 0) {
    throw new TorrentParseError('Missing or invalid "info" dictionary');
  }
  return new Uint8Array(result);
}
async function calculateInfoHash(infoBytes) {
  validateInfoBytes(infoBytes);
  const buffer = new ArrayBuffer(infoBytes.byteLength);
  new Uint8Array(buffer).set(infoBytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-1", buffer));
}
async function calculateInfoHashV2(infoBytes) {
  validateInfoBytes(infoBytes);
  const buffer = new ArrayBuffer(infoBytes.byteLength);
  new Uint8Array(buffer).set(infoBytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}
async function parseTorrentWithIdentity(bytes, options = {}) {
  const torrent = await parseMetainfo(bytes, options);
  const infoBytes = extractInfoBytes(bytes);
  const info = torrent.info;
  const hasV2 = info["meta version"] === 2;
  const hasV1 = !hasV2 || info["pieces"] !== void 0;
  const infoHashV1 = hasV1 ? await calculateInfoHash(infoBytes) : void 0;
  const infoHashV2 = hasV2 ? await calculateInfoHashV2(infoBytes) : void 0;
  const infoHash = infoHashV1 ?? infoHashV2.slice(0, 20);
  const version = hasV2 ? hasV1 ? "hybrid" : "v2" : "v1";
  return {
    torrent,
    infoBytes,
    infoHashV1,
    infoHashV2,
    infoHash,
    infoHashHex: toHex2(infoHash),
    version
  };
}
function toHex2(bytes) {
  let hex = "";
  for (let i3 = 0; i3 < bytes.length; i3++) {
    hex += bytes[i3].toString(16).padStart(2, "0");
  }
  return hex;
}
function validateInfoBytes(infoBytes) {
  let decoded;
  try {
    decoded = decode(infoBytes, {
      maxBytes: infoBytes.length,
      useMap: true
    });
  } catch (error) {
    throw new TorrentParseError("Invalid bencoded info dictionary", {
      cause: error
    });
  }
  if (!(decoded instanceof Map)) {
    throw new TorrentParseError("Info bytes must contain one bencode dictionary");
  }
}
function skipValue(bytes, cursor, depth) {
  if (depth > 256) {
    throw new TorrentParseError("Torrent nesting is too deep");
  }
  const marker = peek(bytes, cursor);
  if (marker >= 48 && marker <= 57) {
    readByteString(bytes, cursor);
    return;
  }
  if (marker === 105) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 101) cursor.offset++;
    cursor.offset++;
    return;
  }
  if (marker === 108) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 101) skipValue(bytes, cursor, depth + 1);
    cursor.offset++;
    return;
  }
  if (marker === 100) {
    cursor.offset++;
    while (peek(bytes, cursor) !== 101) {
      readByteString(bytes, cursor);
      skipValue(bytes, cursor, depth + 1);
    }
    cursor.offset++;
    return;
  }
  throw new TorrentParseError(`Invalid bencode marker at byte ${cursor.offset}`);
}
function readByteString(bytes, cursor) {
  const start = cursor.offset;
  while (peek(bytes, cursor) !== 58) cursor.offset++;
  const length = Number(new TextDecoder().decode(bytes.subarray(start, cursor.offset)));
  cursor.offset++;
  if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > bytes.length) {
    throw new TorrentParseError(`Invalid byte string length at byte ${start}`);
  }
  const value = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return value;
}
function peek(bytes, cursor) {
  const byte = bytes[cursor.offset];
  if (byte === void 0) {
    throw new TorrentParseError("Unexpected end of torrent data");
  }
  return byte;
}
function expect(bytes, cursor, expected, message) {
  if (peek(bytes, cursor) !== expected) {
    throw new TorrentParseError(message);
  }
  cursor.offset++;
}
function equalsAscii(bytes, value) {
  if (bytes.length !== value.length) return false;
  for (let i3 = 0; i3 < value.length; i3++) {
    if (bytes[i3] !== value.charCodeAt(i3)) return false;
  }
  return true;
}
var init_metainfo_identity = __esm({
  "packages/core/src/utils/metainfo-identity.ts"() {
    init_bencode();
    init_errors();
    init_metainfo_parser();
    __name(extractInfoBytes, "extractInfoBytes");
    __name(calculateInfoHash, "calculateInfoHash");
    __name(calculateInfoHashV2, "calculateInfoHashV2");
    __name(parseTorrentWithIdentity, "parseTorrentWithIdentity");
    __name(toHex2, "toHex");
    __name(validateInfoBytes, "validateInfoBytes");
    __name(skipValue, "skipValue");
    __name(readByteString, "readByteString");
    __name(peek, "peek");
    __name(expect, "expect");
    __name(equalsAscii, "equalsAscii");
  }
});

// packages/core/src/utils/parse-torrent.ts
async function parseTorrent(torrentId, options = {}) {
  if (typeof torrentId === "object" && !(torrentId instanceof Uint8Array) && "infoHash" in torrentId && "files" in torrentId) {
    return torrentId;
  }
  if (typeof torrentId === "string") {
    let magnetUri = torrentId;
    if (/^[a-f0-9]{40}$/i.test(torrentId) || /^[a-z2-7]{32}$/i.test(torrentId)) {
      magnetUri = `magnet:?xt=urn:btih:${torrentId}`;
    }
    if (!magnetUri.startsWith("magnet:?")) {
      throw new Error("Invalid torrent identifier");
    }
    return magnetToParsed(parseMagnet(magnetUri));
  }
  if (torrentId instanceof Uint8Array) {
    return await bufferToParsed(torrentId, options);
  }
  throw new Error("Invalid torrent identifier type");
}
function magnetToParsed(magnet) {
  const version = magnet.infoHashV1Hex !== void 0 && magnet.infoHashV2Hex !== void 0 ? "hybrid" : magnet.protocol;
  return {
    infoHash: magnet.infoHash,
    infoHashBuffer: magnet.handshakeHash,
    name: magnet.name || "Unknown",
    announce: magnet.announce,
    urlList: magnet.webSeeds,
    peerAddresses: magnet.peerAddresses,
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: magnet.magnetURI,
    infoHashV2: magnet.infoHashV2Hex,
    version
  };
}
async function bufferToParsed(buffer, options) {
  const identity = await parseTorrentWithIdentity(buffer, {
    maxBytes: options.maxBytes,
    allowMissingPieceLayers: options.allowMissingPieceLayers
  });
  const torrent = identity.torrent;
  const infoRecord = torrent.info;
  const pieceLength = infoRecord["piece length"];
  const pieces = [];
  if (identity.infoHashV1 !== void 0) {
    const piecesRaw = infoRecord["pieces"];
    for (let i3 = 0; i3 < piecesRaw.length; i3 += 20) {
      pieces.push(piecesRaw.subarray(i3, i3 + 20));
    }
  }
  const files = [];
  let totalLength = 0;
  if (identity.version === "v2") {
    const v2Files = flattenV2Files(torrent.info);
    for (const file of v2Files) {
      const path = file.path.join("/");
      const name = file.path[file.path.length - 1];
      files.push({
        path,
        name,
        length: file.length,
        offset: totalLength
      });
      totalLength += file.length;
    }
  } else if (infoRecord["files"]) {
    const filesList = infoRecord["files"];
    for (const fileDict of filesList) {
      const length = fileDict["length"];
      const pathParts = fileDict["path"];
      const path = pathParts.join("/");
      const name = pathParts[pathParts.length - 1];
      files.push({
        path,
        name,
        length,
        offset: totalLength
      });
      totalLength += length;
    }
  } else {
    const length = infoRecord["length"];
    const name = infoRecord["name"];
    files.push({
      path: name,
      name,
      length,
      offset: 0
    });
    totalLength = length;
  }
  const announce = [];
  if (torrent.announce) {
    announce.push(torrent.announce);
  }
  if (torrent["announce-list"]) {
    for (const tier of torrent["announce-list"]) {
      for (const url of tier) {
        if (!announce.includes(url)) announce.push(url);
      }
    }
  }
  const urlList = [];
  const rawUrlList = torrent["url-list"];
  if (rawUrlList !== void 0) {
    const candidates = Array.isArray(rawUrlList) ? rawUrlList : [
      rawUrlList
    ];
    for (const url of candidates) {
      const urlStr = typeof url === "string" ? url : new TextDecoder().decode(url);
      if (!urlList.includes(urlStr)) urlList.push(urlStr);
    }
  }
  const infoHashHex = identity.infoHashHex;
  const infoHashBuffer = new Uint8Array(identity.infoHash);
  return {
    infoHash: infoHashHex,
    infoHashBuffer,
    name: infoRecord["name"],
    announce,
    urlList,
    peerAddresses: [],
    files,
    length: totalLength,
    pieceLength,
    pieces,
    info: infoRecord,
    magnetURI: "",
    comment: torrent.comment,
    createdBy: torrent["created by"],
    infoHashV2: identity.infoHashV2 ? toHex3(identity.infoHashV2) : void 0,
    infoBytes: identity.infoBytes,
    torrentFileBytes: new Uint8Array(buffer),
    version: identity.version
  };
}
function toHex3(bytes) {
  let hex = "";
  for (let i3 = 0; i3 < bytes.length; i3++) {
    hex += bytes[i3].toString(16).padStart(2, "0");
  }
  return hex;
}
var init_parse_torrent = __esm({
  "packages/core/src/utils/parse-torrent.ts"() {
    init_magnet();
    init_metainfo_identity();
    init_metainfo_v2();
    __name(parseTorrent, "parseTorrent");
    __name(magnetToParsed, "magnetToParsed");
    __name(bufferToParsed, "bufferToParsed");
    __name(toHex3, "toHex");
  }
});

// packages/core/src/core/bitfield.ts
var Bitfield;
var init_bitfield = __esm({
  "packages/core/src/core/bitfield.ts"() {
    init_errors();
    Bitfield = class _Bitfield {
      static {
        __name(this, "Bitfield");
      }
      buffer;
      _length;
      grow;
      constructor(length, opts) {
        if (typeof length === "object") {
          this._length = length.length;
          this.grow = length.grow ?? false;
        } else {
          this._length = length;
          this.grow = opts?.grow ?? false;
        }
        const byteLength = Math.ceil(this._length / 8);
        this.buffer = new Uint8Array(byteLength);
      }
      static fromBytes(buffer, length, opts) {
        const requiredBytes = Math.ceil(length / 8);
        if (buffer.length !== requiredBytes) {
          throw new BitfieldError(`Invalid buffer length. Expected ${requiredBytes}, got ${buffer.length}`, "INVALID_BUFFER_LENGTH");
        }
        const spareBits = (8 - length % 8) % 8;
        if (spareBits > 0) {
          const lastByte = buffer[buffer.length - 1];
          const mask = (1 << spareBits) - 1;
          if (lastByte & mask) {
            throw new BitfieldError("Spare bits must be zero", "SPARE_BITS_NON_ZERO");
          }
        }
        const bitfield = new _Bitfield(length, opts);
        bitfield.buffer = new Uint8Array(buffer);
        return bitfield;
      }
      get length() {
        return this._length;
      }
      get(index) {
        if (index < 0) return false;
        if (index >= this._length) {
          if (this.grow === false) return false;
          return false;
        }
        const byteIndex = Math.floor(index / 8);
        const bitIndex = index % 8;
        return (this.buffer[byteIndex] & 128 >> bitIndex) !== 0;
      }
      set(index) {
        if (index < 0) {
          throw new BitfieldError("Cannot set negative index", "NEGATIVE_INDEX");
        }
        if (index >= this._length) {
          if (this.grow === false) {
            throw new BitfieldError(`Index ${index} is out of range (length: ${this._length})`, "INDEX_OUT_OF_RANGE");
          }
          const newLength = typeof this.grow === "number" ? Math.max(this._length + this.grow, index + 1) : index + 1;
          this._resize(newLength);
        }
        const byteIndex = Math.floor(index / 8);
        const bitIndex = index % 8;
        this.buffer[byteIndex] |= 128 >> bitIndex;
      }
      unset(index) {
        if (index < 0 || index >= this._length) return;
        const byteIndex = Math.floor(index / 8);
        const bitIndex = index % 8;
        this.buffer[byteIndex] &= ~(128 >> bitIndex);
      }
      count() {
        let count = 0;
        for (let i3 = 0; i3 < this._length; i3++) {
          if (this.get(i3)) count++;
        }
        return count;
      }
      toBuffer() {
        return new Uint8Array(this.buffer);
      }
      _resize(newLength) {
        const newByteLength = Math.ceil(newLength / 8);
        const newBuffer = new Uint8Array(newByteLength);
        newBuffer.set(this.buffer);
        this.buffer = newBuffer;
        this._length = newLength;
      }
    };
  }
});

// packages/core/src/crypto/hasher.ts
function toBuffer(data) {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  return ab;
}
function toHex4(digest) {
  return Array.from(digest).map((b3) => b3.toString(16).padStart(2, "0")).join("");
}
async function sha1(data) {
  const buffer = await crypto.subtle.digest("SHA-1", toBuffer(data));
  return toHex4(new Uint8Array(buffer));
}
var init_hasher = __esm({
  "packages/core/src/crypto/hasher.ts"() {
    __name(toBuffer, "toBuffer");
    __name(toHex4, "toHex");
    __name(sha1, "sha1");
  }
});

// packages/core/src/utils/buffer.ts
function concat(arrays, totalLength) {
  if (totalLength === void 0) {
    totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
function equals2(a3, b3) {
  if (a3.length !== b3.length) return false;
  for (let i3 = 0; i3 < a3.length; i3++) {
    if (a3[i3] !== b3[i3]) return false;
  }
  return true;
}
function readUInt32BE(buf, offset = 0) {
  return (buf[offset] << 24 | buf[offset + 1] << 16 | buf[offset + 2] << 8 | buf[offset + 3]) >>> 0;
}
var init_buffer = __esm({
  "packages/core/src/utils/buffer.ts"() {
    __name(concat, "concat");
    __name(equals2, "equals");
    __name(readUInt32BE, "readUInt32BE");
  }
});

// packages/core/src/core/constants.ts
var BITTORRENT_PROTOCOL, HANDSHAKE_LENGTH, PEER_ID_LENGTH, DEFAULT_MAX_MESSAGE_LENGTH, DEFAULT_MAX_BLOCK_LENGTH, DEFAULT_MAX_PENDING_REQUESTS, DEFAULT_MAX_QUEUED_WRITE_BYTES, PeerMessageId, HandshakeExtension;
var init_constants = __esm({
  "packages/core/src/core/constants.ts"() {
    BITTORRENT_PROTOCOL = "BitTorrent protocol";
    HANDSHAKE_LENGTH = 68;
    PEER_ID_LENGTH = 20;
    DEFAULT_MAX_MESSAGE_LENGTH = 2 * 1024 * 1024;
    DEFAULT_MAX_BLOCK_LENGTH = 16 * 1024;
    DEFAULT_MAX_PENDING_REQUESTS = 250;
    DEFAULT_MAX_QUEUED_WRITE_BYTES = 4 * 1024 * 1024;
    PeerMessageId = /* @__PURE__ */ (function(PeerMessageId2) {
      PeerMessageId2[PeerMessageId2["Choke"] = 0] = "Choke";
      PeerMessageId2[PeerMessageId2["Unchoke"] = 1] = "Unchoke";
      PeerMessageId2[PeerMessageId2["Interested"] = 2] = "Interested";
      PeerMessageId2[PeerMessageId2["NotInterested"] = 3] = "NotInterested";
      PeerMessageId2[PeerMessageId2["Have"] = 4] = "Have";
      PeerMessageId2[PeerMessageId2["Bitfield"] = 5] = "Bitfield";
      PeerMessageId2[PeerMessageId2["Request"] = 6] = "Request";
      PeerMessageId2[PeerMessageId2["Piece"] = 7] = "Piece";
      PeerMessageId2[PeerMessageId2["Cancel"] = 8] = "Cancel";
      PeerMessageId2[PeerMessageId2["Port"] = 9] = "Port";
      PeerMessageId2[PeerMessageId2["SuggestPiece"] = 13] = "SuggestPiece";
      PeerMessageId2[PeerMessageId2["HaveAll"] = 14] = "HaveAll";
      PeerMessageId2[PeerMessageId2["HaveNone"] = 15] = "HaveNone";
      PeerMessageId2[PeerMessageId2["RejectRequest"] = 16] = "RejectRequest";
      PeerMessageId2[PeerMessageId2["AllowedFast"] = 17] = "AllowedFast";
      PeerMessageId2[PeerMessageId2["Extended"] = 20] = "Extended";
      PeerMessageId2[PeerMessageId2["HashRequest"] = 21] = "HashRequest";
      PeerMessageId2[PeerMessageId2["Hashes"] = 22] = "Hashes";
      PeerMessageId2[PeerMessageId2["HashReject"] = 23] = "HashReject";
      return PeerMessageId2;
    })({});
    HandshakeExtension = /* @__PURE__ */ (function(HandshakeExtension2) {
      HandshakeExtension2["Fast"] = "fast";
      HandshakeExtension2["ExtensionProtocol"] = "extensionProtocol";
      HandshakeExtension2["Dht"] = "dht";
      HandshakeExtension2["V2"] = "v2";
      return HandshakeExtension2;
    })({});
  }
});

// packages/core/src/core/handshake.ts
function encodeHandshake(options) {
  assertTwentyBytes("infoHash", options.infoHash);
  const peerId = typeof options.peerId === "string" ? textEncoder.encode(options.peerId) : options.peerId;
  assertTwentyBytes("peerId", peerId);
  const reserved = options.reserved ? new Uint8Array(options.reserved) : new Uint8Array(8);
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
function decodeHandshake(bytes) {
  if (bytes.length !== HANDSHAKE_LENGTH) {
    throw new ProtocolError(`peer handshake must contain ${HANDSHAKE_LENGTH} bytes`);
  }
  const protocolLength = bytes[0];
  const protocol = textDecoder.decode(bytes.subarray(1, 1 + protocolLength));
  if (protocolLength !== protocolBytes.length || protocol !== BITTORRENT_PROTOCOL) {
    throw new ProtocolError(`unsupported peer protocol: ${protocol}`);
  }
  const reserved = bytes.slice(20, 28);
  const extensions = /* @__PURE__ */ new Set();
  for (const extension of Object.values(HandshakeExtension)) {
    if (hasExtension(reserved, extension)) extensions.add(extension);
  }
  return {
    infoHash: bytes.slice(28, 48),
    peerId: bytes.slice(48, 68),
    reserved,
    extensions
  };
}
function hasExtension(reserved, extension) {
  if (reserved.length !== 8) return false;
  const [byte, mask] = extensionLocation(extension);
  return (reserved[byte] & mask) !== 0;
}
function setExtension(reserved, extension, enabled) {
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  const [byte, mask] = extensionLocation(extension);
  if (enabled) reserved[byte] |= mask;
  else reserved[byte] &= ~mask;
}
function extensionLocation(extension) {
  switch (extension) {
    case HandshakeExtension.Fast:
      return [
        7,
        4
      ];
    case HandshakeExtension.ExtensionProtocol:
      return [
        5,
        16
      ];
    case HandshakeExtension.Dht:
      return [
        7,
        1
      ];
    case HandshakeExtension.V2:
      return [
        7,
        16
      ];
  }
}
function assertTwentyBytes(name, bytes) {
  if (bytes.length !== PEER_ID_LENGTH) {
    throw new RangeError(`${name} must contain ${PEER_ID_LENGTH} bytes`);
  }
}
var textEncoder, textDecoder, protocolBytes;
var init_handshake = __esm({
  "packages/core/src/core/handshake.ts"() {
    init_constants();
    init_errors();
    textEncoder = new TextEncoder();
    textDecoder = new TextDecoder();
    protocolBytes = textEncoder.encode(BITTORRENT_PROTOCOL);
    __name(encodeHandshake, "encodeHandshake");
    __name(decodeHandshake, "decodeHandshake");
    __name(hasExtension, "hasExtension");
    __name(setExtension, "setExtension");
    __name(extensionLocation, "extensionLocation");
    __name(assertTwentyBytes, "assertTwentyBytes");
  }
});

// packages/core/src/utils/net.ts
function isNetPort(port) {
  if (!Number.isInteger(port)) return false;
  return port >= 1 && port <= 65535;
}
function bytesToIPv4String(bytes) {
  return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
}
function parseCompactIpv4Peers(data) {
  if (data.length % 6 !== 0) {
    throw new RangeError(`compact IPv4 peer data length must be a multiple of 6, got ${data.length}`);
  }
  const peers = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    const ip = bytesToIPv4String(data.subarray(offset, offset + 4));
    const port = data[offset + 4] << 8 | data[offset + 5];
    peers.push({
      ip,
      port
    });
  }
  return peers;
}
function parseCompactIpv6Peers(data) {
  if (data.length % 18 !== 0) {
    throw new RangeError(`compact IPv6 peer data length must be a multiple of 18, got ${data.length}`);
  }
  const peers = [];
  for (let offset = 0; offset < data.length; offset += 18) {
    const ipBytes = data.subarray(offset, offset + 16);
    const ip = bytesToIPv6String(ipBytes);
    const port = data[offset + 16] << 8 | data[offset + 17];
    peers.push({
      ip,
      port
    });
  }
  return peers;
}
function bytesToIPv6String(bytes) {
  const groups = [];
  for (let i3 = 0; i3 < 16; i3 += 2) {
    const value = bytes[i3] << 8 | bytes[i3 + 1];
    groups.push(value.toString(16));
  }
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i3 = 0; i3 < groups.length; i3++) {
    if (groups[i3] === "0") {
      if (curStart === -1) curStart = i3;
      curLen++;
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen >= 2) {
    const left = groups.slice(0, bestStart).join(":");
    const right = groups.slice(bestStart + bestLen).join(":");
    if (left === "" && right === "") return "::";
    if (left === "") return `::${right}`;
    if (right === "") return `${left}::`;
    return `${left}::${right}`;
  }
  return groups.join(":");
}
function deduplicatePeers(peers) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const peer of peers) {
    const key = `${peer.ip}:${peer.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(peer);
    }
  }
  return result;
}
var init_net = __esm({
  "packages/core/src/utils/net.ts"() {
    __name(isNetPort, "isNetPort");
    __name(bytesToIPv4String, "bytesToIPv4String");
    __name(parseCompactIpv4Peers, "parseCompactIpv4Peers");
    __name(parseCompactIpv6Peers, "parseCompactIpv6Peers");
    __name(bytesToIPv6String, "bytesToIPv6String");
    __name(deduplicatePeers, "deduplicatePeers");
  }
});

// packages/core/src/core/message.ts
function encodeMessage(message) {
  if (message.type === "keepAlive") return new Uint8Array(4);
  const payload = encodeMessagePayload(message);
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length);
  frame.set(payload, 4);
  return frame;
}
function encodeMessagePayload(message) {
  let id;
  let body;
  switch (message.type) {
    case "choke":
      [id, body] = [
        PeerMessageId.Choke,
        new Uint8Array()
      ];
      break;
    case "unchoke":
      [id, body] = [
        PeerMessageId.Unchoke,
        new Uint8Array()
      ];
      break;
    case "interested":
      [id, body] = [
        PeerMessageId.Interested,
        new Uint8Array()
      ];
      break;
    case "notInterested":
      [id, body] = [
        PeerMessageId.NotInterested,
        new Uint8Array()
      ];
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
      if (!isNetPort(message.port)) {
        throw new RangeError("port must be an unsigned 16-bit integer");
      }
      body = new Uint8Array(2);
      new DataView(body.buffer).setUint16(0, message.port);
      break;
    case "suggestPiece":
      id = PeerMessageId.SuggestPiece;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "haveAll":
      [id, body] = [
        PeerMessageId.HaveAll,
        new Uint8Array()
      ];
      break;
    case "haveNone":
      [id, body] = [
        PeerMessageId.HaveNone,
        new Uint8Array()
      ];
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
      if (!Number.isInteger(message.extensionId) || message.extensionId < 0 || message.extensionId > 255) {
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
        throw new RangeError("hashes must contain complete 32-byte SHA-256 hashes");
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
      if (!Number.isInteger(message.id) || message.id < 0 || message.id > 255) {
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
function decodeMessagePayload(payload) {
  if (payload.length === 0) {
    throw new ProtocolError("non-keepalive message has no message ID");
  }
  const id = payload[0];
  const body = payload.subarray(1);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  switch (id) {
    case PeerMessageId.Choke:
      assertLength("choke", body, 0);
      return {
        type: "choke"
      };
    case PeerMessageId.Unchoke:
      assertLength("unchoke", body, 0);
      return {
        type: "unchoke"
      };
    case PeerMessageId.Interested:
      assertLength("interested", body, 0);
      return {
        type: "interested"
      };
    case PeerMessageId.NotInterested:
      assertLength("not interested", body, 0);
      return {
        type: "notInterested"
      };
    case PeerMessageId.Have:
      assertLength("have", body, 4);
      return {
        type: "have",
        pieceIndex: view.getUint32(0)
      };
    case PeerMessageId.Bitfield:
      return {
        type: "bitfield",
        bitfield: new Uint8Array(body)
      };
    case PeerMessageId.Request:
      return {
        type: "request",
        ...decodeBlockRequest("request", body)
      };
    case PeerMessageId.Piece:
      if (body.length < 8) {
        throw new ProtocolError("piece message must contain a header");
      }
      return {
        type: "piece",
        pieceIndex: view.getUint32(0),
        begin: view.getUint32(4),
        block: body.slice(8)
      };
    case PeerMessageId.Cancel:
      return {
        type: "cancel",
        ...decodeBlockRequest("cancel", body)
      };
    case PeerMessageId.Port:
      assertLength("port", body, 2);
      return {
        type: "port",
        port: view.getUint16(0)
      };
    case PeerMessageId.SuggestPiece:
      assertLength("suggest piece", body, 4);
      return {
        type: "suggestPiece",
        pieceIndex: view.getUint32(0)
      };
    case PeerMessageId.HaveAll:
      assertLength("have all", body, 0);
      return {
        type: "haveAll"
      };
    case PeerMessageId.HaveNone:
      assertLength("have none", body, 0);
      return {
        type: "haveNone"
      };
    case PeerMessageId.RejectRequest:
      return {
        type: "rejectRequest",
        ...decodeBlockRequest("reject request", body)
      };
    case PeerMessageId.AllowedFast:
      assertLength("allowed fast", body, 4);
      return {
        type: "allowedFast",
        pieceIndex: view.getUint32(0)
      };
    case PeerMessageId.Extended:
      if (body.length < 1) {
        throw new ProtocolError("extended message must contain an extension ID");
      }
      return {
        type: "extended",
        extensionId: body[0],
        payload: body.slice(1)
      };
    case PeerMessageId.HashRequest:
      return {
        type: "hashRequest",
        ...decodeHashRequest("hash request", body)
      };
    case PeerMessageId.Hashes: {
      if (body.length < 80 || (body.length - 48) % 32 !== 0) {
        throw new ProtocolError("hashes message must contain a 48-byte header and complete SHA-256 hashes");
      }
      return {
        type: "hashes",
        ...decodeHashRequest("hashes", body.subarray(0, 48)),
        hashes: body.slice(48)
      };
    }
    case PeerMessageId.HashReject:
      return {
        type: "hashReject",
        ...decodeHashRequest("hash reject", body)
      };
    default:
      return {
        type: "unknown",
        id,
        payload: new Uint8Array(body)
      };
  }
}
function encodeBlockRequest(request) {
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
function decodeBlockRequest(name, body) {
  assertLength(name, body, 12);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const length = view.getUint32(8);
  if (length === 0) {
    throw new ProtocolError(`${name} length must be greater than zero`);
  }
  return {
    pieceIndex: view.getUint32(0),
    begin: view.getUint32(4),
    length
  };
}
function encodeHashRequest(request) {
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
function decodeHashRequest(name, body) {
  assertLength(name, body, 48);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const request = {
    piecesRoot: body.slice(0, 32),
    baseLayer: view.getUint32(32),
    index: view.getUint32(36),
    length: view.getUint32(40),
    proofLayers: view.getUint32(44)
  };
  validateHashRequest(request, ProtocolError);
  return request;
}
function validateHashRequest(request, ErrorType) {
  if (request.piecesRoot.length !== 32) {
    throw new ErrorType("piecesRoot must contain 32 bytes");
  }
  for (const [name, value] of [
    [
      "baseLayer",
      request.baseLayer
    ],
    [
      "index",
      request.index
    ],
    [
      "length",
      request.length
    ],
    [
      "proofLayers",
      request.proofLayers
    ]
  ]) {
    if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
      throw new ErrorType(`${name} must be an unsigned 32-bit integer`);
    }
  }
  if (request.length < 2 || request.length > 512 || (request.length & request.length - 1) !== 0) {
    throw new ErrorType("hash request length must be a power of two from 2 to 512");
  }
  if (request.index % request.length !== 0) {
    throw new ErrorType("hash request index must be a multiple of length");
  }
}
function uint32Body(value, name) {
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, asUint32(value, name));
  return body;
}
function asUint32(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
  return value;
}
function assertLength(name, body, expected) {
  if (body.length !== expected) {
    throw new ProtocolError(`${name} message body must contain ${expected} bytes`);
  }
}
var init_message = __esm({
  "packages/core/src/core/message.ts"() {
    init_constants();
    init_errors();
    init_net();
    __name(encodeMessage, "encodeMessage");
    __name(encodeMessagePayload, "encodeMessagePayload");
    __name(decodeMessagePayload, "decodeMessagePayload");
    __name(encodeBlockRequest, "encodeBlockRequest");
    __name(decodeBlockRequest, "decodeBlockRequest");
    __name(encodeHashRequest, "encodeHashRequest");
    __name(decodeHashRequest, "decodeHashRequest");
    __name(validateHashRequest, "validateHashRequest");
    __name(uint32Body, "uint32Body");
    __name(asUint32, "asUint32");
    __name(assertLength, "assertLength");
  }
});

// packages/core/src/core/extension-host.ts
function decodeExtendedHandshake(payload) {
  let value;
  try {
    value = decode(payload, {
      maxBytes: 256 * 1024,
      maxDepth: 32,
      useMap: true
    });
  } catch (cause) {
    throw new ProtocolError("invalid extended handshake", "PROTOCOL_ERROR", {
      cause
    });
  }
  if (!(value instanceof Map)) {
    throw new ProtocolError("extended handshake must be a dictionary");
  }
  const mapping = value.get("m");
  if (mapping !== void 0 && !(mapping instanceof Map)) {
    throw new ProtocolError("extended handshake m field must be a dictionary");
  }
  const extensions = /* @__PURE__ */ new Map();
  for (const [name, id] of mapping ?? []) {
    if (typeof name !== "string" || typeof id !== "number" || id < 0 || id > 255) {
      throw new ProtocolError("extended handshake contains an invalid mapping");
    }
    extensions.set(name, id);
  }
  return {
    extensions,
    client: optionalString(value, "v"),
    port: optionalInteger(value, "p", 65535),
    requestQueue: optionalInteger(value, "reqq", 4294967295),
    metadataSize: optionalInteger(value, "metadata_size", 4294967295),
    yourIp: optionalBytes(value, "yourip"),
    ipv4: optionalBytes(value, "ipv4"),
    ipv6: optionalBytes(value, "ipv6"),
    raw: value
  };
}
function optionalString(map, key) {
  const value = map.get(key);
  if (value === void 0) return void 0;
  if (typeof value !== "string") {
    throw new ProtocolError(`extended handshake ${key} must be a string`);
  }
  return value;
}
function optionalInteger(map, key, maximum) {
  const value = map.get(key);
  if (value === void 0) return void 0;
  if (typeof value !== "number" || value < 0 || value > maximum) {
    throw new ProtocolError(`extended handshake ${key} is invalid`);
  }
  return value;
}
function optionalBytes(map, key) {
  const value = map.get(key);
  if (value === void 0) return void 0;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new ProtocolError(`extended handshake ${key} must be bytes`);
}
function findNameById(mapping, id) {
  for (const [name, candidate] of mapping) {
    if (candidate === id) return name;
  }
  return void 0;
}
var ExtensionHost;
var init_extension_host = __esm({
  "packages/core/src/core/extension-host.ts"() {
    init_bencode();
    init_errors();
    ExtensionHost = class {
      static {
        __name(this, "ExtensionHost");
      }
      /** Maximum extension payload accepted in either direction. */
      maxPayloadLength;
      /** IDs selected locally, which the peer uses when sending to us. */
      localExtensions = /* @__PURE__ */ new Map();
      /** IDs selected by the peer, which we use when sending to it. */
      peerExtensions = /* @__PURE__ */ new Map();
      /**
       * Extension name → value Record for `wire.extensions` parity.
       * A value of `true` means the peer supports this extension.
       */
      get remoteExtensions() {
        const out = {};
        for (const name of this.peerExtensions.keys()) {
          out[name] = true;
        }
        return out;
      }
      /**
       * Reverse map: ID → extension name for `wire.extendedMapping` parity.
       */
      get remoteIdToName() {
        const out = {};
        for (const [name, id] of this.peerExtensions) {
          out[id] = name;
        }
        return out;
      }
      /** Most recent valid extended handshake received from the peer. */
      peerHandshake;
      #send;
      #extensions = /* @__PURE__ */ new Map();
      #handshakeFields = /* @__PURE__ */ new Map();
      #nextId = 1;
      #handshakeWaiters = [];
      /** Create a connection-local extension registry around a low-level sender. */
      constructor(options) {
        this.#send = options.send;
        this.maxPayloadLength = options.maxPayloadLength ?? 256 * 1024;
        if (!Number.isSafeInteger(this.maxPayloadLength) || this.maxPayloadLength < 1) {
          throw new RangeError("maxPayloadLength must be a positive safe integer");
        }
        if (options.client !== void 0) {
          this.setHandshakeField("v", options.client);
        }
        if (options.port !== void 0) {
          this.setHandshakeField("p", options.port);
        }
        if (options.requestQueue !== void 0) {
          this.setHandshakeField("reqq", options.requestQueue);
        }
      }
      // ── Registration ────────────────────────────────────────────────────
      /** Register an extension and allocate its local incoming message ID. */
      use(extension) {
        if (!extension.name || extension.name.length < 3) {
          throw new TypeError("extension name must contain at least three characters");
        }
        if (this.#extensions.has(extension.name)) {
          throw new PeerWireError(`extension ${extension.name} is already registered`);
        }
        if (this.#nextId > 255) {
          throw new PeerWireError("no extension IDs remain");
        }
        this.#extensions.set(extension.name, extension);
        this.localExtensions.set(extension.name, this.#nextId++);
        extension.onRegister?.({
          host: this,
          send: /* @__PURE__ */ __name((payload) => this.send(extension.name, payload), "send")
        });
        return extension;
      }
      /** Retrieve a registered extension by its BEP 10 name. */
      get(name) {
        return this.#extensions.get(name);
      }
      // ── Handshake fields ────────────────────────────────────────────────
      /** Add, replace, or remove a non-`m` extended-handshake field. */
      setHandshakeField(name, value) {
        if (name === "m") {
          throw new TypeError("the m field is managed by ExtensionHost");
        }
        if (value === void 0) this.#handshakeFields.delete(name);
        else this.#handshakeFields.set(name, value);
      }
      /** Send the local extended handshake. May be called again after updates. */
      async sendHandshake() {
        const extensions = /* @__PURE__ */ new Map();
        for (const [name, id] of this.localExtensions) {
          extensions.set(name, id);
        }
        const fields = new Map(this.#handshakeFields);
        fields.set("m", extensions);
        for (const extension of this.#extensions.values()) {
          for (const [name, value] of extension.handshakeFields?.() ?? []) {
            if (name === "m") {
              throw new PeerWireError(`${extension.name} may not replace the m field`);
            }
            fields.set(name, value);
          }
        }
        console.log("[ExtensionHost] sendHandshake fields:", JSON.stringify(Object.fromEntries([
          ...fields.entries()
        ].map(([k6, v4]) => [
          k6,
          v4 instanceof Uint8Array ? `Uint8Array(${v4.length})` : v4
        ]))));
        await this.#send(0, encode(fields));
      }
      // ── Send / receive ──────────────────────────────────────────────────
      /** Send a payload using the ID selected by the remote peer. */
      async send(name, payload) {
        if (payload.length > this.maxPayloadLength) {
          throw new RangeError(`extension payload exceeds configured limit ${this.maxPayloadLength}`);
        }
        const id = this.peerExtensions.get(name);
        if (id === void 0) {
          throw new PeerWireError(`remote peer did not advertise extension ${name}`);
        }
        await this.#send(id, payload);
      }
      /** Resolve after the first valid remote extended handshake. */
      waitForPeerHandshake() {
        if (this.peerHandshake) return Promise.resolve(this.peerHandshake);
        return new Promise((resolve) => this.#handshakeWaiters.push(resolve));
      }
      /** Parse and dispatch one raw BEP 10 message. */
      async handle(message) {
        if (message.payload.length > this.maxPayloadLength) {
          throw new ProtocolError(`extension payload exceeds configured limit ${this.maxPayloadLength}`);
        }
        if (message.extensionId === 0) {
          const handshake = decodeExtendedHandshake(message.payload);
          for (const [name2, id] of handshake.extensions) {
            if (id === 0) this.peerExtensions.delete(name2);
            else this.peerExtensions.set(name2, id);
          }
          this.peerHandshake = handshake;
          for (const waiter of this.#handshakeWaiters.splice(0)) {
            waiter(handshake);
          }
          for (const extension of this.#extensions.values()) {
            await extension.onExtendedHandshake?.(handshake);
          }
          return void 0;
        }
        const name = findNameById(this.localExtensions, message.extensionId);
        if (name === void 0) return void 0;
        await this.#extensions.get(name)?.onMessage?.(message.payload);
        return name;
      }
      // ── Lifecycle ───────────────────────────────────────────────────────
      /** Notify registered extensions that their owning peer connection ended. */
      close(reason) {
        for (const extension of this.#extensions.values()) {
          extension.close?.(reason);
        }
        this.#handshakeWaiters.length = 0;
      }
    };
    __name(decodeExtendedHandshake, "decodeExtendedHandshake");
    __name(optionalString, "optionalString");
    __name(optionalInteger, "optionalInteger");
    __name(optionalBytes, "optionalBytes");
    __name(findNameById, "findNameById");
  }
});

// packages/core/src/core/wire.ts
function blockKey(request) {
  return `${request.pieceIndex}:${request.begin}:${request.length}`;
}
function positiveOption(name, value, fallback) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}
function nonNegativeOption(name, value, fallback) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return resolved;
}
var WireState, Wire;
var init_wire = __esm({
  "packages/core/src/core/wire.ts"() {
    init_event_target();
    init_buffer();
    init_bencode();
    init_errors();
    init_handshake();
    init_message();
    init_constants();
    init_extension_host();
    WireState = /* @__PURE__ */ (function(WireState2) {
      WireState2["Handshaking"] = "handshaking";
      WireState2["Connected"] = "connected";
      WireState2["Closed"] = "closed";
      return WireState2;
    })({});
    Wire = class extends TypedEventTarget {
      static {
        __name(this, "Wire");
      }
      // ── Public observable state (BEP 3 four flags) ─────────────────────
      amChoking = true;
      amInterested = false;
      peerChoking = true;
      peerInterested = false;
      peerId = null;
      peerIdBuffer = null;
      // ── Lifecycle state ────────────────────────────────────────────────
      state = WireState.Handshaking;
      remoteHandshake;
      // ── Stats ──────────────────────────────────────────────────────────
      uploadedBytes = 0;
      downloadedBytes = 0;
      lastActivityAt = Date.now();
      // ── Speed tracking (bytes/s) ─────────────────────────────────────────
      _downloadSpeed = 0;
      _uploadSpeed = 0;
      _lastSpeedSample = Date.now();
      _lastDownloaded = 0;
      _lastUploaded = 0;
      _speedInterval;
      /** Upload speed in bytes/s (rolling 1-second average). */
      get uploadSpeed() {
        return this._uploadSpeed;
      }
      /** Download speed in bytes/s (rolling 1-second average). */
      get downloadSpeed() {
        return this._downloadSpeed;
      }
      // ── Peer address ────────────────────────────────────────────────────
      /** Set by Peer when the DataChannel opens. */
      remoteAddress = "";
      remotePort = 0;
      // ── BEP 3 / upstream parity ───────────────────────────────────────
      /**
       * Connection type. Always `'webrtc'` in this browser-first implementation.
       *
       * Mirrors `webtorrent.min.js` `wire.type`.
       */
      get type() {
        return "webrtc";
      }
      /**
       * Extension capabilities advertised by the remote peer.
       *
       * Mirrors `webtorrent.min.js` `wire.extensions` — a Record of extension
       * name to any value. Populated from the BEP-10 extended handshake `m` dict.
       */
      get extensions() {
        return this.extensionHost.remoteExtensions;
      }
      /**
       * ID-to-name mapping from the remote peer's BEP-10 extended handshake.
       * Mirrors `webtorrent.min.js` `wire.extendedMapping`.
       */
      get extendedMapping() {
        return this.extensionHost.remoteIdToName;
      }
      // ── BEP 6 Fast sets ────────────────────────────────────────────────
      localAllowedFast = /* @__PURE__ */ new Set();
      remoteAllowedFast = /* @__PURE__ */ new Set();
      // ── Read-only config ───────────────────────────────────────────────
      expectedInfoHash;
      expectedPeerId;
      localExtensions;
      pieceCount;
      pieceLength;
      totalLength;
      maxMessageLength;
      maxBlockLength;
      maxPendingRequests;
      maxQueuedWriteBytes;
      handshakeTimeoutMs;
      idleTimeoutMs;
      // ── ExtensionHost ──────────────────────────────────────────────────
      extensionHost;
      // ── Private ────────────────────────────────────────────────────────
      transport;
      buffer = new Uint8Array(0);
      handshakeSent = false;
      handshakeReceived = false;
      extensionHandshakeSent = false;
      // Availability order: bitfield/haveAll/haveNone must be first
      localAvailabilityOpen = true;
      remoteAvailabilityOpen = true;
      localAvailabilityDeclared = false;
      remoteAvailabilityDeclared = false;
      // Pending requests tracking
      #pendingRequests = /* @__PURE__ */ new Map();
      #peerRequests = /* @__PURE__ */ new Map();
      // Write backpressure
      #writeTail = Promise.resolve();
      #queuedWriteBytes = 0;
      // Timers
      #keepAliveTimer;
      #idleTimer;
      #handshakeTimer;
      #keepAliveIntervalMs;
      constructor(transport, opts = {}) {
        super();
        this.transport = transport;
        this.expectedInfoHash = opts.expectedInfoHash ?? null;
        this.expectedPeerId = opts.expectedPeerId ? new Uint8Array(opts.expectedPeerId) : null;
        this.localExtensions = new Set(opts.extensions ?? []);
        this.pieceCount = opts.pieceCount;
        this.pieceLength = opts.pieceLength;
        this.totalLength = opts.totalLength;
        this.maxMessageLength = positiveOption("maxMessageLength", opts.maxMessageLength, DEFAULT_MAX_MESSAGE_LENGTH);
        this.maxBlockLength = positiveOption("maxBlockLength", opts.maxBlockLength, DEFAULT_MAX_BLOCK_LENGTH);
        this.maxPendingRequests = positiveOption("maxPendingRequests", opts.maxPendingRequests, DEFAULT_MAX_PENDING_REQUESTS);
        this.maxQueuedWriteBytes = positiveOption("maxQueuedWriteBytes", opts.maxQueuedWriteBytes, DEFAULT_MAX_QUEUED_WRITE_BYTES);
        this.handshakeTimeoutMs = nonNegativeOption("handshakeTimeoutMs", opts.handshakeTimeoutMs, 3e4);
        this.idleTimeoutMs = nonNegativeOption("idleTimeoutMs", opts.idleTimeoutMs, 0);
        this.#keepAliveIntervalMs = nonNegativeOption("keepAliveIntervalMs", opts.keepAliveIntervalMs, 0);
        this.extensionHost = new ExtensionHost({
          send: /* @__PURE__ */ __name((id, payload) => this._sendExtendedMessage(id, payload), "send"),
          client: opts.clientName,
          port: opts.listenPort,
          requestQueue: this.maxPendingRequests
        });
        this.transport.onMessage((data) => this._onData(data));
        if (this.handshakeTimeoutMs > 0) {
          this.#handshakeTimer = setTimeout(() => {
            if (this.state === WireState.Handshaking) {
              this._terminate(new TimeoutError("handshake timed out"));
            }
          }, this.handshakeTimeoutMs);
        }
      }
      // ====================================================================
      // Handshake
      // ====================================================================
      sendHandshake(infoHash, peerId, extensions) {
        if (infoHash.length !== 20 || peerId.length !== 20) {
          throw new RangeError("infoHash and peerId must be exactly 20 bytes");
        }
        const bytes = encodeHandshake({
          infoHash,
          peerId,
          extensions: this.localExtensions,
          reserved: extensions
        });
        this.transport.send(bytes);
        this.handshakeSent = true;
        this._tryTransitionToConnected();
      }
      /** Send the BEP 10 extended handshake (after standard handshake completes). */
      async sendExtendedHandshake() {
        if (this.extensionHandshakeSent) return;
        if (!this._hasNegotiated(HandshakeExtension.ExtensionProtocol)) return;
        await this.extensionHost.sendHandshake();
        this.extensionHandshakeSent = true;
      }
      /** Register a BEP 10 extension before the standard handshake. */
      use(extension) {
        if (this.state !== WireState.Handshaking) {
          throw new PeerWireError("extensions must be registered before handshaking");
        }
        if (!this.localExtensions.has(HandshakeExtension.ExtensionProtocol)) {
          throw new PeerWireError("BEP 10 must be enabled before registering extensions");
        }
        return this.extensionHost.use(extension);
      }
      // ====================================================================
      // BEP 3 messages
      // ====================================================================
      sendChoke() {
        this._sendMessage({
          type: "choke"
        });
      }
      sendUnchoke() {
        this._sendMessage({
          type: "unchoke"
        });
      }
      sendInterested() {
        this._sendMessage({
          type: "interested"
        });
      }
      sendNotInterested() {
        this._sendMessage({
          type: "notInterested"
        });
      }
      sendHave(index) {
        this._sendMessage({
          type: "have",
          pieceIndex: index
        });
      }
      sendBitfield(bitfield) {
        this._sendMessage({
          type: "bitfield",
          bitfield
        });
      }
      sendRequest(index, offset, length) {
        if (this.peerChoking) {
          this._debug(`sendRequest bloqueado: peer est\xE1 nos choking (piece ${index})`);
          return;
        }
        this._sendMessage({
          type: "request",
          pieceIndex: index,
          begin: offset,
          length
        });
      }
      sendPiece(index, offset, block) {
        this._sendMessage({
          type: "piece",
          pieceIndex: index,
          begin: offset,
          block
        });
      }
      sendCancel(index, offset, length) {
        this._sendMessage({
          type: "cancel",
          pieceIndex: index,
          begin: offset,
          length
        });
      }
      // ====================================================================
      // BEP 5, 6, 10 messages
      // ====================================================================
      sendPort(port) {
        this._sendMessage({
          type: "port",
          port
        });
      }
      sendSuggestPiece(index) {
        this._sendMessage({
          type: "suggestPiece",
          pieceIndex: index
        });
      }
      sendHaveAll() {
        this._sendMessage({
          type: "haveAll"
        });
      }
      sendHaveNone() {
        this._sendMessage({
          type: "haveNone"
        });
      }
      sendRejectRequest(index, offset, length) {
        this._sendMessage({
          type: "rejectRequest",
          pieceIndex: index,
          begin: offset,
          length
        });
      }
      sendAllowedFast(index) {
        this._sendMessage({
          type: "allowedFast",
          pieceIndex: index
        });
      }
      sendExtended(extId, payload) {
        this._sendMessage({
          type: "extended",
          extensionId: extId,
          payload
        });
      }
      // ====================================================================
      // BEP 52 v2 messages
      // ====================================================================
      /** Send a hash request for a range of SHA-256 hashes from the piece layers. */
      sendHashRequest(piecesRoot, baseLayer, index, length, proofLayers) {
        this._sendMessage({
          type: "hashRequest",
          piecesRoot,
          baseLayer,
          index,
          length,
          proofLayers
        });
      }
      /** Send a batch of SHA-256 hashes in response to a hash request. */
      sendHashes(piecesRoot, baseLayer, index, length, proofLayers, hashes) {
        this._sendMessage({
          type: "hashes",
          piecesRoot,
          baseLayer,
          index,
          length,
          proofLayers,
          hashes
        });
      }
      /** Reject a hash request. */
      sendHashReject(piecesRoot, baseLayer, index, length, proofLayers) {
        this._sendMessage({
          type: "hashReject",
          piecesRoot,
          baseLayer,
          index,
          length,
          proofLayers
        });
      }
      // ====================================================================
      // Keepalive
      // ====================================================================
      /** Configure inactivity-based keepalives; `true` selects two minutes. */
      setKeepAlive(interval = true) {
        if (interval === false) this.#keepAliveIntervalMs = 0;
        else if (interval === true) this.#keepAliveIntervalMs = 12e4;
        else {
          this.#keepAliveIntervalMs = nonNegativeOption("keepAlive interval", interval, 0);
        }
        this.#resetKeepAlive();
      }
      // ====================================================================
      // Pending request tracking
      // ====================================================================
      /** Block requests sent locally that still await a piece or rejection. */
      get pendingRequests() {
        return [
          ...this.#pendingRequests.values()
        ];
      }
      /** Requests received from the peer that have not been served or rejected. */
      get peerRequests() {
        return [
          ...this.#peerRequests.values()
        ];
      }
      // ====================================================================
      // Lifecycle
      // ====================================================================
      destroy() {
        this._terminate();
      }
      get isDestroyed() {
        return this.state === WireState.Closed;
      }
      // ====================================================================
      // Data reception (buffer-based stream parser)
      // ====================================================================
      _onData(chunk) {
        if (this.state === WireState.Closed) return;
        this.buffer = concat([
          this.buffer,
          chunk
        ]);
        try {
          this._processBuffer();
        } catch (err) {
          this.emit("error", new CustomEvent("error", {
            detail: {
              error: err instanceof Error ? err : new Error(String(err))
            }
          }));
          this._terminate(err);
        }
      }
      _processBuffer() {
        if (!this.handshakeReceived) {
          if (this.buffer.length < HANDSHAKE_LENGTH) return;
          const handshake = decodeHandshake(this.buffer.subarray(0, HANDSHAKE_LENGTH));
          if (this.expectedInfoHash && !equals2(handshake.infoHash, this.expectedInfoHash)) {
            throw new ProtocolError("InfoHash mismatch in handshake: peer announced a different torrent");
          }
          if (this.expectedPeerId && !equals2(handshake.peerId, this.expectedPeerId)) {
            throw new ProtocolError("Unexpected peer ID in handshake");
          }
          this.buffer = this.buffer.subarray(HANDSHAKE_LENGTH);
          this.handshakeReceived = true;
          this.remoteHandshake = handshake;
          this.peerIdBuffer = handshake.peerId;
          this.peerId = Array.from(handshake.peerId).map((b3) => b3.toString(16).padStart(2, "0")).join("");
          this._tryTransitionToConnected();
          this.emit("handshake", new CustomEvent("handshake", {
            detail: {
              peerId: handshake.peerId,
              extensions: handshake.reserved,
              infoHash: handshake.infoHash
            }
          }));
        }
        while (this.buffer.length >= 4) {
          const length = readUInt32BE(this.buffer, 0);
          if (length === 0) {
            this.buffer = this.buffer.subarray(4);
            this.emit("keepAlive");
            this._touchActivity();
            continue;
          }
          if (length > this.maxMessageLength) {
            throw new ProtocolError(`peer message length ${length} exceeds limit ${this.maxMessageLength}`);
          }
          if (this.buffer.length < 4 + length) return;
          const payload = this.buffer.subarray(4, 4 + length);
          const message = decodeMessagePayload(new Uint8Array(payload));
          this._assertExtensionNegotiated(message);
          this._validateAvailabilityOrder(message, false);
          this._validateIncoming(message);
          this._commitAvailabilityOrder(message, false);
          this._applyRemoteState(message);
          this.downloadedBytes += 4 + length;
          this._dispatchMessage(message);
          this.buffer = this.buffer.subarray(4 + length);
          this._touchActivity();
        }
      }
      // ====================================================================
      // Message sending (with validation and backpressure)
      // ====================================================================
      _sendMessage(message) {
        if (this.state === WireState.Closed) {
          throw new PeerWireError("wire is closed");
        }
        if (this.state !== WireState.Connected && message.type !== "keepAlive") {
          throw new PeerWireError("wire handshake is not complete");
        }
        this._assertExtensionNegotiated(message);
        this._validateAvailabilityOrder(message, true);
        this._validateOutgoing(message);
        let frame;
        try {
          frame = encodeMessage(message);
        } catch (err) {
          if (err instanceof Error) {
            this.emit("error", new CustomEvent("error", {
              detail: {
                error: err
              }
            }));
          }
          throw err;
        }
        if (frame.length - 4 > this.maxMessageLength) {
          throw new RangeError(`message length exceeds configured limit ${this.maxMessageLength}`);
        }
        this._writeFrame(frame);
        this._commitAvailabilityOrder(message, true);
        this._applyLocalState(message);
        this.uploadedBytes += frame.length;
        this._touchActivity();
      }
      _sendExtendedMessage(id, payload) {
        this._sendMessage({
          type: "extended",
          extensionId: id,
          payload
        });
        return Promise.resolve();
      }
      _writeFrame(frame) {
        if (this.#queuedWriteBytes + frame.length > this.maxQueuedWriteBytes) {
          throw new PeerWireError(`write queue exceeds configured limit ${this.maxQueuedWriteBytes}`);
        }
        this.#queuedWriteBytes += frame.length;
        try {
          this.transport.send(frame);
        } finally {
          this.#queuedWriteBytes -= frame.length;
        }
      }
      // ====================================================================
      // Event dispatch
      // ====================================================================
      _dispatchMessage(message) {
        switch (message.type) {
          case "choke":
            this.emit("choke");
            break;
          case "unchoke":
            this.emit("unchoke");
            break;
          case "interested":
            this.emit("interested");
            break;
          case "notInterested":
            this.emit("not-interested");
            break;
          case "have":
            this.emit("have", new CustomEvent("have", {
              detail: {
                index: message.pieceIndex
              }
            }));
            break;
          case "bitfield":
            this.emit("bitfield", new CustomEvent("bitfield", {
              detail: {
                bitfield: message.bitfield
              }
            }));
            break;
          case "request":
            this.emit("request", new CustomEvent("request", {
              detail: {
                index: message.pieceIndex,
                offset: message.begin,
                length: message.length
              }
            }));
            break;
          case "piece":
            this.emit("piece", new CustomEvent("piece", {
              detail: {
                index: message.pieceIndex,
                offset: message.begin,
                block: message.block
              }
            }));
            break;
          case "cancel":
            this.emit("cancel", new CustomEvent("cancel", {
              detail: {
                index: message.pieceIndex,
                offset: message.begin,
                length: message.length
              }
            }));
            break;
          case "port":
            this.emit("port", new CustomEvent("port", {
              detail: {
                port: message.port
              }
            }));
            break;
          case "suggestPiece":
            this.emit("suggestPiece", new CustomEvent("suggestPiece", {
              detail: {
                index: message.pieceIndex
              }
            }));
            break;
          case "haveAll":
            this.emit("haveAll");
            break;
          case "haveNone":
            this.emit("haveNone");
            break;
          case "rejectRequest":
            this.emit("rejectRequest", new CustomEvent("rejectRequest", {
              detail: {
                index: message.pieceIndex,
                offset: message.begin,
                length: message.length
              }
            }));
            break;
          case "allowedFast":
            this.emit("allowedFast", new CustomEvent("allowedFast", {
              detail: {
                index: message.pieceIndex
              }
            }));
            break;
          case "extended": {
            if (message.extensionId === 0) {
              try {
                const handshake = decode(message.payload, {
                  maxBytes: 256 * 1024,
                  maxDepth: 32
                });
                this.emit("extended", new CustomEvent("extended", {
                  detail: {
                    id: 0,
                    payload: handshake
                  }
                }));
              } catch {
                this._debug("Failed to parse extended handshake");
              }
            } else {
              this.emit("extended", new CustomEvent("extended", {
                detail: {
                  id: message.extensionId,
                  payload: message.payload
                }
              }));
            }
            void this.extensionHost.handle(message).catch(() => {
            });
            break;
          }
          case "keepAlive":
            this.emit("keepAlive");
            break;
          case "unknown":
            this.emit("unknown", new CustomEvent("unknown", {
              detail: {
                id: message.id,
                payload: message.payload
              }
            }));
            break;
          case "hashRequest":
            this.emit("hashRequest", new CustomEvent("hashRequest", {
              detail: {
                piecesRoot: message.piecesRoot,
                baseLayer: message.baseLayer,
                index: message.index,
                length: message.length,
                proofLayers: message.proofLayers
              }
            }));
            break;
          case "hashes":
            this.emit("hashes", new CustomEvent("hashes", {
              detail: {
                piecesRoot: message.piecesRoot,
                baseLayer: message.baseLayer,
                index: message.index,
                length: message.length,
                proofLayers: message.proofLayers,
                hashes: message.hashes
              }
            }));
            break;
          case "hashReject":
            this.emit("hashReject", new CustomEvent("hashReject", {
              detail: {
                piecesRoot: message.piecesRoot,
                baseLayer: message.baseLayer,
                index: message.index,
                length: message.length,
                proofLayers: message.proofLayers
              }
            }));
            break;
        }
      }
      // ====================================================================
      // State transitions
      // ====================================================================
      _applyLocalState(message) {
        switch (message.type) {
          case "choke":
            this.amChoking = true;
            break;
          case "unchoke":
            this.amChoking = false;
            break;
          case "interested":
            this.amInterested = true;
            break;
          case "notInterested":
            this.amInterested = false;
            break;
          case "allowedFast":
            this.localAllowedFast.add(message.pieceIndex);
            break;
          case "piece":
          case "rejectRequest":
            this.#peerRequests.delete(blockKey({
              pieceIndex: message.pieceIndex,
              begin: message.begin,
              length: message.type === "piece" ? message.block.length : message.length
            }));
            break;
          case "request":
            this.#pendingRequests.set(blockKey(message), {
              pieceIndex: message.pieceIndex,
              begin: message.begin,
              length: message.length
            });
            break;
          case "cancel": {
            const key = blockKey(message);
            this.#peerRequests.delete(key);
            break;
          }
        }
      }
      _applyRemoteState(message) {
        switch (message.type) {
          case "choke":
            this.peerChoking = true;
            if (!this._rejectSemanticsNegotiated()) {
              this.#pendingRequests.clear();
            }
            break;
          case "unchoke":
            this.peerChoking = false;
            break;
          case "interested":
            this.peerInterested = true;
            break;
          case "notInterested":
            this.peerInterested = false;
            break;
          case "allowedFast":
            this.remoteAllowedFast.add(message.pieceIndex);
            break;
          case "request":
            this.#peerRequests.set(blockKey(message), {
              pieceIndex: message.pieceIndex,
              begin: message.begin,
              length: message.length
            });
            break;
          case "cancel":
            this.#peerRequests.delete(blockKey(message));
            break;
          case "piece":
          case "rejectRequest":
            this.#pendingRequests.delete(blockKey({
              pieceIndex: message.pieceIndex,
              begin: message.begin,
              length: message.type === "piece" ? message.block.length : message.length
            }));
            break;
        }
      }
      // ====================================================================
      // Validation
      // ====================================================================
      _validateOutgoing(message) {
        this._validateMessageBounds(message, false);
      }
      _validateIncoming(message) {
        this._validateMessageBounds(message, true);
        if (message.type === "request" && this.#peerRequests.size >= this.maxPendingRequests) {
          throw new ProtocolError("peer exceeded outstanding request limit");
        }
      }
      _validateMessageBounds(message, incoming) {
        const ErrorType = incoming ? ProtocolError : RangeError;
        switch (message.type) {
          case "have":
          case "suggestPiece":
          case "allowedFast":
            this._validatePieceIndex(message.pieceIndex, incoming);
            break;
          case "request":
          case "cancel":
          case "rejectRequest":
            this._validateBlock(message, incoming);
            break;
          case "piece":
            this._validateBlock({
              pieceIndex: message.pieceIndex,
              begin: message.begin,
              length: message.block.length
            }, incoming);
            break;
          case "bitfield":
            break;
        }
      }
      _validatePieceIndex(pieceIndex, incoming) {
        if (!Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex > 4294967295 || this.pieceCount !== void 0 && pieceIndex >= this.pieceCount) {
          const ErrorType = incoming ? ProtocolError : RangeError;
          throw new ErrorType(`piece index ${pieceIndex} is out of range`);
        }
      }
      _validateBlock(request, incoming) {
        const ErrorType = incoming ? ProtocolError : RangeError;
        this._validatePieceIndex(request.pieceIndex, incoming);
        if (request.length < 1 || request.length > this.maxBlockLength) {
          throw new ErrorType(`block length must be from 1 to ${this.maxBlockLength}`);
        }
        if (!Number.isInteger(request.begin) || request.begin < 0 || request.begin > 4294967295) {
          throw new ErrorType("block begin must be a non-negative integer");
        }
        if (this.pieceLength !== void 0) {
          let actualLength = this.pieceLength;
          if (this.totalLength !== void 0 && this.pieceCount !== void 0 && request.pieceIndex === this.pieceCount - 1) {
            actualLength = this.totalLength - request.pieceIndex * this.pieceLength;
          }
          if (request.begin + request.length > actualLength) {
            throw new ErrorType("block exceeds piece boundary");
          }
        }
      }
      // ── Availability order ─────────────────────────────────────────────
      _validateAvailabilityOrder(message, local) {
        if (message.type === "keepAlive" || message.type === "extended") return;
        if (message.type === "choke" || message.type === "unchoke" || message.type === "interested" || message.type === "notInterested") {
          return;
        }
        const declaration = message.type === "bitfield" || message.type === "haveAll" || message.type === "haveNone";
        const open = local ? this.localAvailabilityOpen : this.remoteAvailabilityOpen;
        const declared = local ? this.localAvailabilityDeclared : this.remoteAvailabilityDeclared;
        if (this._fastNegotiated() && declaration) {
          if (!open || declared) {
            throw new ProtocolError("availability declaration must appear once after handshake");
          }
        } else if (this._fastNegotiated() && open && !declared) {
          throw new ProtocolError("Fast peers must send bitfield, have all, or have none before other messages");
        }
      }
      _commitAvailabilityOrder(message, local) {
        if (message.type === "keepAlive" || message.type === "extended") return;
        if (message.type === "choke" || message.type === "unchoke" || message.type === "interested" || message.type === "notInterested") {
          return;
        }
        const declaration = message.type === "bitfield" || message.type === "haveAll" || message.type === "haveNone";
        if (local) {
          this.localAvailabilityDeclared ||= declaration;
          this.localAvailabilityOpen = false;
        } else {
          this.remoteAvailabilityDeclared ||= declaration;
          this.remoteAvailabilityOpen = false;
        }
      }
      // ── Extension negotiation ──────────────────────────────────────────
      _assertExtensionNegotiated(message) {
        let required;
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
        if (!this._hasNegotiated(required)) {
          throw new ProtocolError(`${required} message was used without negotiation`);
        }
      }
      _hasNegotiated(extension) {
        return this.localExtensions.has(extension) && this.remoteHandshake?.extensions.has(extension) === true;
      }
      _fastNegotiated() {
        return this._hasNegotiated(HandshakeExtension.Fast);
      }
      _rejectSemanticsNegotiated() {
        return this._fastNegotiated() || this._hasNegotiated(HandshakeExtension.V2);
      }
      // ====================================================================
      // Lifecycle helpers
      // ====================================================================
      _tryTransitionToConnected() {
        if (this.handshakeSent && this.handshakeReceived) {
          this.state = WireState.Connected;
          if (this.#handshakeTimer !== void 0) {
            clearTimeout(this.#handshakeTimer);
            this.#handshakeTimer = void 0;
          }
          this.#resetKeepAlive();
          this.#resetIdleTimeout();
          this._startSpeedTracking();
          if (this._hasNegotiated(HandshakeExtension.ExtensionProtocol)) {
            this.sendExtendedHandshake().catch((err) => {
              this.emit("warning", new CustomEvent("warning", {
                detail: {
                  error: err instanceof Error ? err : new Error(String(err))
                }
              }));
            });
          }
        }
      }
      _startSpeedTracking() {
        this._lastSpeedSample = Date.now();
        this._lastDownloaded = this.downloadedBytes;
        this._lastUploaded = this.uploadedBytes;
        this._speedInterval = setInterval(() => {
          if (this.isDestroyed) return;
          const now = Date.now();
          const dt = (now - this._lastSpeedSample) / 1e3;
          if (dt <= 0) return;
          const dl = this.downloadedBytes - this._lastDownloaded;
          const ul = this.uploadedBytes - this._lastUploaded;
          this._downloadSpeed = Math.round(dl / dt);
          this._uploadSpeed = Math.round(ul / dt);
          this._lastSpeedSample = now;
          this._lastDownloaded = this.downloadedBytes;
          this._lastUploaded = this.uploadedBytes;
        }, 1e3);
      }
      _touchActivity() {
        this.lastActivityAt = Date.now();
        this.#resetKeepAlive();
        this.#resetIdleTimeout();
      }
      _terminate(reason) {
        if (this.state === WireState.Closed) return;
        this.state = WireState.Closed;
        if (this.#handshakeTimer !== void 0) clearTimeout(this.#handshakeTimer);
        if (this.#keepAliveTimer !== void 0) clearTimeout(this.#keepAliveTimer);
        if (this.#idleTimer !== void 0) clearTimeout(this.#idleTimer);
        if (this._speedInterval !== void 0) {
          clearInterval(this._speedInterval);
          this._speedInterval = void 0;
        }
        this.extensionHost.close(reason);
        this.#pendingRequests.clear();
        this.#peerRequests.clear();
        this.emit("close", new CustomEvent("close", {
          detail: {
            reason
          }
        }));
        try {
          this.transport.close();
        } catch {
        }
      }
      // ====================================================================
      // Timer management
      // ====================================================================
      #resetKeepAlive() {
        if (this.#keepAliveTimer !== void 0) clearTimeout(this.#keepAliveTimer);
        this.#keepAliveTimer = void 0;
        if (this.#keepAliveIntervalMs > 0 && this.state === WireState.Connected) {
          this.#keepAliveTimer = setTimeout(() => {
            this.#keepAliveTimer = void 0;
            if (this.state === WireState.Connected) {
              try {
                this._sendMessage({
                  type: "keepAlive"
                });
              } catch {
              }
            }
          }, this.#keepAliveIntervalMs);
        }
      }
      #resetIdleTimeout() {
        if (this.#idleTimer !== void 0) clearTimeout(this.#idleTimer);
        this.#idleTimer = void 0;
        if (this.idleTimeoutMs > 0 && this.state === WireState.Connected) {
          this.#idleTimer = setTimeout(() => {
            this._terminate(new TimeoutError("peer connection became idle"));
          }, this.idleTimeoutMs);
        }
      }
      _debug(msg) {
        console.debug(`[Wire] ${msg}`);
      }
    };
    __name(blockKey, "blockKey");
    __name(positiveOption, "positiveOption");
    __name(nonNegativeOption, "nonNegativeOption");
  }
});

// packages/core/src/core/piece.ts
var Piece;
var init_piece = __esm({
  "packages/core/src/core/piece.ts"() {
    Piece = class {
      static {
        __name(this, "Piece");
      }
      /** The zero-based piece index in the torrent. */
      index;
      /** The byte length of this piece (may differ for the last piece). */
      length;
      /** The byte offset of this piece inside the concatenated torrent stream. */
      offset;
      /** Whether the piece hash has been verified (optional, set by consumer). */
      hash;
      constructor(index, length, offset) {
        this.index = index;
        this.length = length;
        this.offset = offset;
      }
      /**
       * Returns `true` if this piece is partially or fully downloaded.
       * The `downloaded` flag is computed by the consumer (the `Bitfield`
       * tracks the actual state).
       */
      get downloaded() {
        return this.hash !== void 0;
      }
      /**
       * Returns `true` if the piece is missing (not yet downloaded).
       */
      get missing() {
        return !this.hash;
      }
      /**
       * Returns a human-readable description of this piece.
       */
      toString() {
        return `Piece(index=${this.index}, length=${this.length}, offset=${this.offset}, ${this.missing ? "missing" : "downloaded"})`;
      }
    };
  }
});

// packages/core/src/core/torrent.ts
var Torrent;
var init_torrent = __esm({
  "packages/core/src/core/torrent.ts"() {
    init_event_target();
    init_bitfield();
    init_hasher();
    init_bencode();
    init_wire();
    init_piece();
    Torrent = class extends TypedEventTarget {
      static {
        __name(this, "Torrent");
      }
      infoHash;
      name;
      pieceLength;
      length;
      /** Returns enriched {@link File} instances (with `streamTo`, `createReadStream`, etc.) when the client has registered them, or the raw metadata file descriptors otherwise. */
      get files() {
        return this._registeredFiles.length > 0 ? this._registeredFiles : this._rawFiles;
      }
      /** Raw file descriptors from parsed metadata — used as fallback until the client registers enriched File instances. */
      _rawFiles = [];
      parsedTorrent;
      _store;
      bitfield;
      expectedPieces;
      /** Array de Piece objects exposto via `torrent.pieces` (paridade com WebTorrent). */
      _pieces = [];
      _downloaded = 0;
      _uploaded = 0;
      _destroyed = false;
      _ready = false;
      _metadataReceived = false;
      _paused = false;
      /** Swarm ao qual delegamos operações de rede */
      _swarm;
      /** Bitfield de peças selecionadas */
      _selected;
      /** Bitfield de peças críticas */
      _critical;
      /** Velocidade de download atual em bytes/s */
      _downloadSpeed = 0;
      /** Velocidade de upload atual em bytes/s */
      _uploadSpeed = 0;
      /** Timestamp do último sample de velocidade */
      _lastSpeedSample = 0;
      /** Lista de Web Seeds (URLs HTTP) */
      _webSeeds = [];
      /** Timeout de inatividade */
      _idleTimer = null;
      _IDLE_TIMEOUT_MS = 3e4;
      /** Intervals de velocidade por wire */
      _speedIntervals = /* @__PURE__ */ new Set();
      /** File objects registrados pelo cliente (para forward de eventos). */
      _registeredFiles = [];
      constructor(parsedTorrent, opts) {
        super();
        this.parsedTorrent = parsedTorrent;
        this._store = opts.store;
        this._swarm = opts.swarm;
        this.infoHash = parsedTorrent.infoHash;
        this.name = parsedTorrent.name || "Unknown";
        this.pieceLength = parsedTorrent.pieceLength;
        this.length = parsedTorrent.length;
        this._rawFiles = parsedTorrent.files;
        const numPieces = parsedTorrent.pieces.length;
        this.bitfield = new Bitfield(numPieces);
        this.expectedPieces = parsedTorrent.pieces;
        this._selected = new Bitfield(numPieces);
        this._critical = new Bitfield(numPieces);
        this._webSeeds = [
          ...parsedTorrent.urlList || []
        ];
        this._pieces = parsedTorrent.pieces.map((hash, index) => {
          const pieceLen = index === numPieces - 1 ? this.lastPieceLength : this.pieceLength;
          return new Piece(index, pieceLen, index * this.pieceLength);
        });
        queueMicrotask(() => {
          this._init(opts.skipVerify || false).catch((err) => {
            this._onError(err instanceof Error ? err : new Error(String(err)));
          });
        });
        this.emit("infoHash", new CustomEvent("infoHash", {
          detail: {
            infoHash: this.infoHash
          }
        }));
      }
      // ==========================================================================
      // GETTERS COMPUTADOS
      // ==========================================================================
      get ready() {
        return this._ready;
      }
      get destroyed() {
        return this._destroyed;
      }
      get downloaded() {
        return this._downloaded;
      }
      get uploaded() {
        return this._uploaded;
      }
      /** Backend chunk store backing this torrent's pieces. */
      get store() {
        return this._store;
      }
      get paused() {
        return this._paused;
      }
      get progress() {
        if (this.length === 0) return 0;
        return this._downloaded / this.length;
      }
      get numPieces() {
        return this.expectedPieces.length;
      }
      get lastPieceLength() {
        return this.length % this.pieceLength || this.pieceLength;
      }
      /** URI magnet completo. */
      get magnetURI() {
        if (this.parsedTorrent.magnetURI) return this.parsedTorrent.magnetURI;
        let uri = `magnet:?xt=urn:btih:${this.infoHash}`;
        if (this.name && this.name !== "Unknown") {
          uri += `&dn=${encodeURIComponent(this.name)}`;
        }
        const trackers = this.parsedTorrent.announce || [];
        for (const tr2 of trackers) {
          uri += `&tr=${encodeURIComponent(tr2)}`;
        }
        return uri;
      }
      /** Número de peers conectados (via swarm). */
      get numPeers() {
        return this._swarm?.peers?.size ?? 0;
      }
      /** Velocidade de download em bytes/s. */
      get downloadSpeed() {
        return this._downloadSpeed;
      }
      /** Velocidade de upload em bytes/s. */
      get uploadSpeed() {
        return this._uploadSpeed;
      }
      /** Ratio upload/download. Infinity se nada foi baixado. */
      get ratio() {
        if (this._downloaded === 0) return Infinity;
        return this._uploaded / this._downloaded;
      }
      /** Tempo restante estimado em segundos. null se não pode estimar. */
      get timeRemaining() {
        if (this._downloadSpeed <= 0 || this.progress >= 1) return null;
        const remaining = this.length - this._downloaded;
        return Math.ceil(remaining / this._downloadSpeed);
      }
      /** Array de peças - paridade com WebTorrent. */
      get pieces() {
        return this._pieces;
      }
      /** Bitfield de peças selecionadas. */
      get selected() {
        return this._selected;
      }
      /** Bitfield de peças críticas. */
      get criticalPieces() {
        return this._critical;
      }
      /** Lista de Web Seeds. */
      get webSeeds() {
        return [
          ...this._webSeeds
        ];
      }
      // ── webtorrent.min.js parity ─────────────────────────────────────────
      /** Alias de `downloaded`. */
      get received() {
        return this._downloaded;
      }
      /** `true` quando `progress === 1`. */
      get done() {
        return this.progress >= 1;
      }
      /** Data de criação do torrent (de `creation date`). */
      get created() {
        const ts = this.parsedTorrent.info["creation date"];
        return typeof ts === "number" ? new Date(ts * 1e3) : void 0;
      }
      /** Campo `created by` do torrent. */
      get createdBy() {
        return this.parsedTorrent.createdBy;
      }
      /** Campo `comment` do torrent. */
      get comment() {
        return this.parsedTorrent.comment;
      }
      /**
       * Bencode bytes do arquivo `.torrent` completo.
       * `undefined` se o torrent foi adicionado via magnet (sem arquivo `.torrent`).
       */
      get torrentFile() {
        return this.parsedTorrent.torrentFileBytes;
      }
      /**
       * Blob do arquivo `.torrent`. Útil para download pelo usuário.
       * `undefined` se o torrent foi adicionado via magnet.
       */
      get torrentFileBlob() {
        const bytes = this.torrentFile;
        return bytes ? new Blob([
          new Uint8Array(bytes)
        ]) : void 0;
      }
      /** Lista de trackers do torrent. */
      get announce() {
        return this.parsedTorrent.announce;
      }
      /** Máximo de conexões Web Seed simultâneas. */
      get maxWebConns() {
        return this._swarm?.maxConns ?? 10;
      }
      // ==========================================================================
      // SELEÇÃO DE PEÇAS
      // ==========================================================================
      /**
       * Marca interesse em peças [startPiece, endPiece] e envia `interested` nos wires.
       * Se endPiece for omitido, seleciona até o fim.
       */
      select(startPiece, endPiece, _priority = 0, _notify = false) {
        const end = endPiece ?? this.numPieces - 1;
        for (let i3 = startPiece; i3 <= end; i3++) {
          this._selected.set(i3);
        }
        this._swarm?._sendInterested();
      }
      /**
       * Remove interesse em peças [startPiece, endPiece] e envia `not-interested` se
       * nenhuma peça estiver mais selecionada.
       */
      deselect(startPiece, endPiece) {
        const end = endPiece ?? this.numPieces - 1;
        for (let i3 = startPiece; i3 <= end; i3++) {
          this._selected.unset(i3);
        }
        if (this._selected.count() === 0) {
          this._swarm?._sendNotInterested();
        }
      }
      /**
       * Marca peças como críticas (raras) e envia `suggestPiece` nos wires.
       * Peças críticas são solicitadas antes das demais.
       */
      setCritical(startPiece, endPiece) {
        const end = endPiece ?? startPiece;
        for (let i3 = startPiece; i3 <= end; i3++) {
          this._critical.set(i3);
        }
        for (let i3 = startPiece; i3 <= end; i3++) {
          this._swarm?._sendSuggestPiece(i3);
        }
      }
      // ==========================================================================
      // RESCAN FILES
      // ==========================================================================
      /**
       * Re-verifica todas as peças existentes no store.
       * Útil quando o store foi manipulado externamente.
       *
       * @param cb - Callback chamado com `(err, res)` quando a varredura termina.
       *             Se omitido, retorna uma Promise.
       */
      rescanFiles(cb) {
        const task = this._verifyExistingPieces().then(() => {
          cb?.(null);
        }).catch((err) => {
          cb?.(err instanceof Error ? err : new Error(String(err)));
        });
        if (!cb) return task;
      }
      // ==========================================================================
      // PAUSE / RESUME
      // ==========================================================================
      pause() {
        this._paused = true;
        this._swarm?.pause();
      }
      resume() {
        this._paused = false;
        this._swarm?.resume();
      }
      // ==========================================================================
      // PEERS E WEB SEEDS
      // ==========================================================================
      addPeer(addr) {
        return this._swarm?.addPeer(addr) ?? false;
      }
      removePeer(addr) {
        this._swarm?.removePeer(addr);
      }
      addWebSeed(url) {
        if (!this._webSeeds.includes(url)) {
          this._webSeeds.push(url);
        }
      }
      removeWebSeed(url) {
        const idx = this._webSeeds.indexOf(url);
        if (idx !== -1) this._webSeeds.splice(idx, 1);
      }
      // ==========================================================================
      // REGISTRO DE WIRES (chamado pelo Swarm)
      // ==========================================================================
      _registerWire(wire, addr) {
        this.emit("wire", new CustomEvent("wire", {
          detail: {
            wire,
            addr
          }
        }));
        let lastDownloaded = 0;
        let lastUploaded = 0;
        const interval = setInterval(() => {
          if (wire.isDestroyed) {
            clearInterval(interval);
            this._speedIntervals.delete(interval);
            return;
          }
          const now = Date.now();
          const dt = (now - this._lastSpeedSample) / 1e3;
          if (dt > 0) {
            const dl = (wire.downloadedBytes - lastDownloaded) / dt;
            const ul = (wire.uploadedBytes - lastUploaded) / dt;
            this._downloadSpeed = Math.round(this._downloadSpeed * 0.8 + dl * 0.2);
            this._uploadSpeed = Math.round(this._uploadSpeed * 0.8 + ul * 0.2);
          }
          lastDownloaded = wire.downloadedBytes;
          lastUploaded = wire.uploadedBytes;
          this._lastSpeedSample = now;
        }, 1e3);
        this._speedIntervals.add(interval);
        this._resetIdleTimer();
        let initialStateSent = false;
        const sendInitialState = /* @__PURE__ */ __name(() => {
          console.log(`[Torrent] sendInitialState: ready=${this.ready}, numPieces=${this.numPieces}`);
          if (!initialStateSent) {
            initialStateSent = true;
            if (this.numPieces > 0) {
              try {
                console.log("[Torrent] Sending initial bitfield to peer...");
                wire.sendBitfield(this.bitfield.toBuffer());
              } catch (err) {
                console.warn("[Torrent] Erro ao enviar bitfield inicial:", err);
              }
            } else {
              try {
                console.log("[Torrent] No metadata yet, sending empty bitfield/availability...");
                wire.sendBitfield(new Uint8Array(0));
              } catch (err) {
                console.warn("[Torrent] Erro ao enviar availability inicial sem metadata:", err);
              }
            }
          }
          try {
            console.log("[Torrent] Sending UNCHOKE to peer");
            wire.sendUnchoke();
          } catch (err) {
            console.warn("[Torrent] Erro ao enviar unchoke inicial:", err);
          }
          updateInterest();
        }, "sendInitialState");
        const attachInitialState = /* @__PURE__ */ __name(() => {
          if (wire.state === WireState.Connected) {
            sendInitialState();
          } else {
            wire.once("handshake", sendInitialState);
          }
        }, "attachInitialState");
        wire.on("request", async (e3) => {
          const { index, offset, length } = e3.detail;
          const piece = await this.getPiece(index);
          console.log(`[Torrent] received wire 'request' index=${index}, offset=${offset}, length=${length}, pieceFound=${!!piece}`);
          if (piece && offset + length <= piece.length) {
            const block = piece.subarray(offset, offset + length);
            wire.sendPiece(index, offset, block);
            this._uploaded += block.length;
            this.emit("upload", new CustomEvent("upload", {
              detail: {
                bytes: block.length
              }
            }));
            this._forwardToFiles("upload", index, block.length);
          }
        });
        const remotePieces = /* @__PURE__ */ new Set();
        let isHaveAll = false;
        let savedBitfield = null;
        const BLOCK_SIZE = 16384;
        let activePiece = null;
        const requestBlocks = /* @__PURE__ */ __name(() => {
          if (wire.isDestroyed || wire.peerChoking || this.done) {
            console.log(`[Torrent] requestBlocks exit early: isDestroyed=${wire.isDestroyed}, peerChoking=${wire.peerChoking}, done=${this.done}`);
            return;
          }
          if (activePiece) {
            console.log(`[Torrent] requestBlocks exit: already have activePiece ${activePiece.index}`);
            return;
          }
          let targetPieceIndex = -1;
          for (let i3 = 0; i3 < this.numPieces; i3++) {
            if (!this.bitfield.get(i3) && remotePieces.has(i3)) {
              targetPieceIndex = i3;
              break;
            }
          }
          if (targetPieceIndex === -1) return;
          const pLen = targetPieceIndex === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
          activePiece = {
            index: targetPieceIndex,
            length: pLen,
            buffer: new Uint8Array(pLen),
            receivedBytes: 0,
            pendingOffsets: /* @__PURE__ */ new Set()
          };
          console.log(`[Torrent] Requesting piece ${targetPieceIndex}, length ${pLen} from wire`);
          for (let offset = 0; offset < pLen; offset += BLOCK_SIZE) {
            const len = Math.min(BLOCK_SIZE, pLen - offset);
            activePiece.pendingOffsets.add(offset);
            wire.sendRequest(targetPieceIndex, offset, len);
          }
        }, "requestBlocks");
        const updateInterest = /* @__PURE__ */ __name(() => {
          if (this.done) return;
          let hasInterestingPiece = false;
          for (let i3 = 0; i3 < this.numPieces; i3++) {
            if (!this.bitfield.get(i3) && remotePieces.has(i3)) {
              hasInterestingPiece = true;
              break;
            }
          }
          console.log(`[Torrent] updateInterest: interesting=${hasInterestingPiece}, amInterested=${wire.amInterested}, peerChoking=${wire.peerChoking}`);
          if (hasInterestingPiece && !wire.amInterested) {
            wire.amInterested = true;
            wire.sendInterested();
          }
          if (!wire.peerChoking) {
            requestBlocks();
          }
        }, "updateInterest");
        wire.on("bitfield", (e3) => {
          const bf = e3.detail.bitfield;
          savedBitfield = bf;
          console.log(`[Torrent] wire.on('bitfield') received: length=${bf.length}`);
          for (let i3 = 0; i3 < bf.length * 8; i3++) {
            const byteIdx = Math.floor(i3 / 8);
            const bitIdx = 7 - i3 % 8;
            if (byteIdx < bf.length && bf[byteIdx] & 1 << bitIdx) {
              remotePieces.add(i3);
            }
          }
          updateInterest();
        });
        const syncRemotePieces = /* @__PURE__ */ __name(() => {
          console.log(`[Torrent] syncRemotePieces: isHaveAll=${isHaveAll}, hasBitfield=${!!savedBitfield}, numPieces=${this.numPieces}`);
          if (isHaveAll) {
            for (let i3 = 0; i3 < this.numPieces; i3++) remotePieces.add(i3);
          } else if (savedBitfield) {
            for (let i3 = 0; i3 < savedBitfield.length * 8; i3++) {
              const byteIdx = Math.floor(i3 / 8);
              const bitIdx = 7 - i3 % 8;
              if (byteIdx < savedBitfield.length && savedBitfield[byteIdx] & 1 << bitIdx) {
                remotePieces.add(i3);
              }
            }
          }
          console.log(`[Torrent] syncRemotePieces completed: remotePieces.size=${remotePieces.size}`);
          updateInterest();
        }, "syncRemotePieces");
        this.on("metadata", syncRemotePieces);
        this.on("ready", syncRemotePieces);
        if (this._metadataReceived || this.ready) {
          console.log("[Torrent] Metadata already available, syncing remote pieces for new wire immediately");
          syncRemotePieces();
        }
        wire.on("have", (e3) => {
          const index = e3.detail.index;
          console.log(`[Torrent] wire.on('have') received index=${index}`);
          remotePieces.add(index);
          updateInterest();
        });
        wire.on("haveAll", () => {
          console.log("[Torrent] wire.on('haveAll') received");
          isHaveAll = true;
          for (let i3 = 0; i3 < this.numPieces; i3++) remotePieces.add(i3);
          updateInterest();
        });
        wire.on("unchoke", () => {
          updateInterest();
        });
        wire.on("interested", () => {
          try {
            wire.sendUnchoke();
          } catch (err) {
            console.warn("[Torrent] Error sending unchoke on interested:", err);
          }
        });
        wire.on("piece", async (e3) => {
          const { index, offset, block } = e3.detail;
          if (!activePiece || activePiece.index !== index) return;
          activePiece.buffer.set(block, offset);
          if (activePiece.pendingOffsets.has(offset)) {
            activePiece.pendingOffsets.delete(offset);
            activePiece.receivedBytes += block.length;
          }
          if (activePiece.receivedBytes >= activePiece.length) {
            const completedPiece = activePiece;
            activePiece = null;
            const success = await this.receivePiece(completedPiece.index, completedPiece.buffer);
            if (success) {
              wire.sendHave(completedPiece.index);
              this._swarm?.broadcastHave?.(completedPiece.index);
            }
            requestBlocks();
          }
        });
        attachInitialState();
      }
      // ==========================================================================
      // INJEÇÃO TARDIA DE METADADOS (Magnet URIs)
      // ==========================================================================
      async setMetadata(infoBuffer) {
        console.log(`[Torrent] setMetadata start, infoBuffer length: ${infoBuffer?.length}`);
        if (this._metadataReceived) return false;
        try {
          console.log("[Torrent] setMetadata: decoding infoBuffer...");
          const info = decode(infoBuffer);
          console.log("[Torrent] setMetadata: bencode decoded successfully.");
          const pieceLength = info["piece length"];
          const piecesRaw = info["pieces"];
          if (typeof pieceLength !== "number" || !(piecesRaw instanceof Uint8Array)) {
            throw new Error("Invalid metadata: missing piece length or pieces");
          }
          const newExpectedPieces = [];
          for (let i3 = 0; i3 < piecesRaw.length; i3 += 20) {
            newExpectedPieces.push(piecesRaw.subarray(i3, i3 + 20));
          }
          const newFiles = [];
          let totalLength = 0;
          const textDecoder2 = new TextDecoder();
          if (info["files"]) {
            const filesList = info["files"];
            for (const fileDict of filesList) {
              const length = fileDict["length"];
              const pathList = fileDict["path"];
              const pathParts = pathList.map((p4) => typeof p4 === "string" ? p4 : textDecoder2.decode(p4));
              const path = pathParts.join("/");
              const name = pathParts[pathParts.length - 1];
              newFiles.push({
                path,
                name,
                length,
                offset: totalLength
              });
              totalLength += length;
            }
          } else {
            const length = info["length"];
            const nameRaw2 = info["name"];
            const name = typeof nameRaw2 === "string" ? nameRaw2 : textDecoder2.decode(nameRaw2);
            newFiles.push({
              path: name,
              name,
              length,
              offset: 0
            });
            totalLength = length;
          }
          this.pieceLength = pieceLength;
          this.length = totalLength;
          this._rawFiles = newFiles;
          this.expectedPieces = newExpectedPieces;
          console.log(`[Torrent] setMetadata: pieceLength=${pieceLength}, totalLength=${totalLength}, numPieces=${newExpectedPieces.length}`);
          if (this._store && typeof this._store.updateLength === "function") {
            console.log("[Torrent] setMetadata: updating store length...");
            this._store.updateLength(pieceLength, totalLength);
          }
          const nameRaw = info["name"];
          this.name = typeof nameRaw === "string" ? nameRaw : textDecoder2.decode(nameRaw);
          const newNum = newExpectedPieces.length;
          this.bitfield = new Bitfield(newNum);
          this._selected = new Bitfield(newNum);
          this._critical = new Bitfield(newNum);
          this._pieces = newExpectedPieces.map((hash, index) => {
            const pieceLen = index === newNum - 1 ? this.length % this.pieceLength || this.pieceLength : this.pieceLength;
            return new Piece(index, pieceLen, index * this.pieceLength);
          });
          this._metadataReceived = true;
          console.log("[Torrent] setMetadata: emitting metadata event...");
          this.emit("metadata", new CustomEvent("metadata", {
            detail: {
              files: this.files,
              length: this.length,
              name: this.name
            }
          }));
          console.log("[Torrent] setMetadata: verifying existing pieces...");
          await this._verifyExistingPieces();
          console.log("[Torrent] setMetadata: existing pieces verified.");
          this._ready = true;
          console.log("[Torrent] setMetadata: emitting ready event...");
          this.emit("ready");
          console.log("[Torrent] setMetadata: completed successfully!");
          return true;
        } catch (err) {
          console.error("[Torrent] setMetadata error:", err);
          this._onError(err instanceof Error ? err : new Error(String(err)));
          return false;
        }
      }
      // ==========================================================================
      // CICLO DE VIDA
      // ==========================================================================
      async _init(skipVerify) {
        try {
          if (!skipVerify && this.numPieces > 0) {
            await this._verifyExistingPieces();
          }
          this._ready = true;
          this._lastSpeedSample = Date.now();
          this.emit("ready");
        } catch (err) {
          this._onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
      async _verifyExistingPieces() {
        this._downloaded = 0;
        this.bitfield = new Bitfield(this.numPieces);
        for (let i3 = 0; i3 < this._pieces.length; i3++) {
          const piece = this._pieces[i3];
          if (piece) piece.hash = void 0;
        }
        for (let i3 = 0; i3 < this.numPieces; i3++) {
          try {
            const opts = i3 === this.numPieces - 1 ? {
              length: this.lastPieceLength
            } : void 0;
            const buf = await this._store.get(i3, opts);
            await this._verifyPiece(i3, buf);
            this.bitfield.set(i3);
            const pieceLen = i3 === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
            this._downloaded += pieceLen;
            if (i3 < this._pieces.length) {
              const piece = this._pieces[i3];
              if (piece) {
                piece.hash = this.expectedPieces[i3];
              }
            }
            this._swarm?.broadcastHave(i3);
          } catch (err) {
            if (err && typeof err === "object" && "notFound" in err && !err.notFound) {
              console.warn(`[Torrent] Erro ao verificar pe\xE7a ${i3}:`, err);
            }
          }
        }
        if (this.progress >= 1) {
          this.emit("done");
        }
      }
      // ==========================================================================
      // RECEBIMENTO DE DADOS
      // ==========================================================================
      async receivePiece(index, buf) {
        if (this._destroyed) return false;
        if (this.bitfield.get(index)) return true;
        if (!this._metadataReceived && this.numPieces === 0) return false;
        try {
          await this._verifyPiece(index, buf);
          await this._store.put(index, buf);
          this.bitfield.set(index);
          const pieceLen = index === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
          this._downloaded += pieceLen;
          if (index < this._pieces.length) {
            const piece = this._pieces[index];
            if (piece) {
              piece.hash = this.expectedPieces[index];
            }
          }
          this._resetIdleTimer();
          this.emit("verified", new CustomEvent("verified", {
            detail: {
              index
            }
          }));
          this.emit("download", new CustomEvent("download", {
            detail: {
              bytes: pieceLen
            }
          }));
          this._forwardToFiles("download", index, pieceLen);
          if (this.progress >= 1) {
            this.emit("done");
          }
          return true;
        } catch (err) {
          console.error("[Torrent] Error in receivePiece:", err);
          return false;
        }
      }
      /**
       * Registra `File` instances para receberem os eventos `download`/`upload`.
       * Chamado pelo {@link WebTorrent} após criar os `File`s.
       */
      _registerFiles(files) {
        this._registeredFiles = files;
      }
      /**
       * Emite um evento de download/upload nos Files cujo `pieceRange` contém `index`.
       */
      _forwardToFiles(type, index, bytes) {
        for (const f3 of this._registeredFiles) {
          const file = f3;
          if (index >= file.pieceRange.first && index <= file.pieceRange.last) {
            file.emit(type, new CustomEvent(type, {
              detail: {
                bytes
              }
            }));
          }
        }
      }
      async getPiece(index) {
        if (!this.bitfield.get(index)) return null;
        try {
          const opts = index === this.numPieces - 1 ? {
            length: this.lastPieceLength
          } : void 0;
          return await this._store.get(index, opts);
        } catch {
          return null;
        }
      }
      async destroy(destroyStore = false) {
        if (this._destroyed) return;
        this._destroyed = true;
        for (const interval of this._speedIntervals) clearInterval(interval);
        this._speedIntervals.clear();
        if (this._idleTimer !== null) {
          clearTimeout(this._idleTimer);
          this._idleTimer = null;
        }
        try {
          if (destroyStore) {
            await this.store.destroy();
          } else {
            await this.store.close();
          }
        } catch (err) {
          console.warn("[Torrent] Erro ao fechar store:", err);
        }
      }
      // ==========================================================================
      // PRIVADOS
      // ==========================================================================
      async _verifyPiece(index, buf) {
        const expected = this.expectedPieces[index];
        if (!expected) throw new Error(`\xCDndice de pe\xE7a ${index} fora do limite.`);
        const actual = await sha1(buf);
        const expectedHex = Array.from(expected).map((b3) => b3.toString(16).padStart(2, "0")).join("");
        if (actual !== expectedHex) {
          throw new Error(`Hash mismatch na pe\xE7a ${index}.`);
        }
      }
      _resetIdleTimer() {
        if (this._idleTimer !== null) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
          this.emit("idle");
        }, this._IDLE_TIMEOUT_MS);
      }
      _onError(err) {
        this.emit("error", new CustomEvent("error", {
          detail: {
            error: err
          }
        }));
      }
    };
  }
});

// packages/core/src/network/peer.ts
var Peer;
var init_peer = __esm({
  "packages/core/src/network/peer.ts"() {
    init_event_target();
    init_wire();
    init_constants();
    Peer = class extends TypedEventTarget {
      static {
        __name(this, "Peer");
      }
      /** PeerId remoto em formato hex (preenchido após o handshake) */
      id = "unknown";
      type = "webrtc";
      wire = null;
      pc = null;
      channel = null;
      opts;
      destroyed = false;
      addr = "";
      connected = false;
      handshakeCompleted = false;
      connectTimeoutId = null;
      handshakeTimeoutId = null;
      _signalEmitted = false;
      _iceGatherTimeoutId = null;
      _gatheredCandidates = [];
      constructor(opts) {
        super();
        this.opts = opts;
        this.id = "unknown";
        this.addr = opts.addr ?? "";
        const RTCPeerConnectionCtor = opts.wrtc || globalThis.RTCPeerConnection;
        if (!RTCPeerConnectionCtor) {
          throw new Error("WebRTC not supported. Provide 'wrtc' option or run in a supported browser.");
        }
        this.pc = new RTCPeerConnectionCtor(opts.config || {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302"
            }
          ]
        });
        this._setupPeerConnection();
        this._startConnectTimeout();
        if (opts.initiator) {
          this._initiateConnection();
        }
      }
      // ==========================================================================
      // GETTERS
      // ==========================================================================
      /** Retorna true se o peer está conectado e com handshake do BitTorrent completo */
      get isReady() {
        return this.connected && this.handshakeCompleted;
      }
      // ==========================================================================
      // API PÚBLICA
      // ==========================================================================
      /**
       * Processa dados de sinalização recebidos do Tracker ou Service Worker.
       * Pode ser uma offer, answer ou ICE candidate.
       */
      async signal(data) {
        if (this.destroyed) return;
        try {
          if ("type" in data && (data.type === "offer" || data.type === "answer")) {
            console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] signal() received ${data.type}`);
            await this.pc.setRemoteDescription(data);
            if (data.type === "offer" && !this.opts.initiator) {
              const answer = await this.pc.createAnswer();
              await this.pc.setLocalDescription(answer);
              this._iceGatherTimeoutId = setTimeout(() => {
                this._emitLocalSignal();
              }, 5e3);
            }
          } else if ("candidate" in data && data.candidate) {
            await this.pc.addIceCandidate(data);
          }
        } catch (err) {
          this._onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
      /**
       * Destrói a conexão, liberando todos os recursos WebRTC e de protocolo.
       * Pode ser chamado múltiplas vezes sem erro (idempotente).
       */
      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this._clearTimeouts();
        if (this.wire) {
          this.wire.destroy();
          this.wire = null;
        }
        if (this.channel) {
          try {
            this.channel.close();
          } catch {
          }
          this.channel = null;
        }
        if (this.pc) {
          try {
            this.pc.close();
          } catch {
          }
          this.pc = null;
        }
        this.connected = false;
        this.handshakeCompleted = false;
        this.emit("close");
      }
      // ==========================================================================
      // LÓGICA INTERNA (WebRTC)
      // ==========================================================================
      _emitLocalSignal() {
        if (this._signalEmitted || this.destroyed || !this.pc) return;
        if (this.pc.localDescription) {
          this._signalEmitted = true;
          if (this._iceGatherTimeoutId !== null) {
            clearTimeout(this._iceGatherTimeoutId);
            this._iceGatherTimeoutId = null;
          }
          console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] Emitting local signal, type: ${this.pc.localDescription.type}, sdp has candidate:`, this.pc.localDescription.sdp.includes("a=candidate"));
          this.emit("signal", new CustomEvent("signal", {
            detail: {
              data: this.pc.localDescription
            }
          }));
        }
      }
      _setupPeerConnection() {
        this.pc.onicegatheringstatechange = () => {
          if (this.pc && this.pc.iceGatheringState === "complete") {
            this._emitLocalSignal();
          }
        };
        this.pc.onicecandidate = (event) => {
          if (event.candidate && event.candidate.candidate) {
            this._gatheredCandidates.push(event.candidate.candidate);
            console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] gathered candidate:`, event.candidate.candidate);
          } else if (!event.candidate) {
            console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] end of candidates (null)`);
            this._emitLocalSignal();
          }
        };
        this.pc.oniceconnectionstatechange = () => {
          console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] iceConnectionState:`, this.pc?.iceConnectionState);
        };
        this.pc.onconnectionstatechange = () => {
          const state = this.pc.connectionState;
          console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] connectionState:`, state);
          if (state === "failed" || state === "closed") {
            this._onError(new Error(`WebRTC connection ${state}`));
          }
        };
        if (!this.opts.initiator) {
          this.pc.ondatachannel = (event) => {
            console.log(`[Peer receiver] Received remote datachannel:`, event.channel.label);
            this._setupData(event.channel);
          };
        }
      }
      async _initiateConnection() {
        const channelName = this.opts.channelName || "webtorrent";
        const channel = this.pc.createDataChannel(channelName, {
          ordered: true,
          negotiated: false
        });
        this._setupData(channel);
        try {
          const offer = await this.pc.createOffer();
          await this.pc.setLocalDescription(offer);
          this._iceGatherTimeoutId = setTimeout(() => {
            this._emitLocalSignal();
          }, 5e3);
        } catch (err) {
          this._onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
      _setupData(channel) {
        this.channel = channel;
        this.channel.binaryType = "arraybuffer";
        this.channel.onopen = () => {
          console.log(`[Peer ${this.opts.initiator ? "initiator" : "receiver"}] DataChannel OPEN!`);
          this._clearConnectTimeout();
          this.connected = true;
          this.emit("connect");
          this._setupWire();
        };
        this.channel.onclose = () => {
          if (!this.destroyed) {
            this.destroy();
          }
        };
        this.channel.onerror = () => {
          this._onError(new Error("DataChannel error"));
        };
      }
      // ==========================================================================
      // LÓGICA INTERNA (Wire Protocol / BitTorrent)
      // ==========================================================================
      _setupWire() {
        if (!this.channel) return;
        const transport = {
          send: /* @__PURE__ */ __name((data) => {
            if (this.channel && this.channel.readyState === "open") {
              const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
              this.channel.send(arrayBuffer);
            }
          }, "send"),
          onMessage: /* @__PURE__ */ __name((handler) => {
            if (this.channel) {
              this.channel.onmessage = (event) => {
                const buf = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new Uint8Array(event.data);
                handler(buf);
              };
            }
          }, "onMessage"),
          close: /* @__PURE__ */ __name(() => {
            if (this.channel) {
              this.channel.close();
            }
          }, "close")
        };
        this.wire = new Wire(transport, {
          extensions: [
            HandshakeExtension.ExtensionProtocol,
            HandshakeExtension.Fast
          ]
        });
        if (this.opts.addr) {
          const parts = this.opts.addr.split(":");
          this.wire.remoteAddress = parts[0] ?? "";
          this.wire.remotePort = parseInt(parts[1] ?? "0", 10) || 0;
        }
        if (this.opts.onWire) {
          this.opts.onWire(this.wire);
        }
        this.wire.on("handshake", (e3) => {
          this.id = Array.from(e3.detail.peerId).map((b3) => b3.toString(16).padStart(2, "0")).join("");
          this._clearHandshakeTimeout();
          this.handshakeCompleted = true;
          this.emit("handshake", new CustomEvent("handshake", {
            detail: e3.detail
          }));
        });
        this.wire.on("error", (e3) => {
          this._onError(e3.detail.error);
        });
        this._startHandshakeTimeout();
        this.wire.sendHandshake(this.opts.infoHash, this.opts.peerId);
      }
      // ==========================================================================
      // TIMEOUTS E ERROS
      // ==========================================================================
      _startConnectTimeout() {
        this.connectTimeoutId = setTimeout(() => {
          if (!this.connected && !this.destroyed) {
            this._onError(new Error("WebRTC connection timeout"));
          }
        }, 25e3);
      }
      _clearConnectTimeout() {
        if (this.connectTimeoutId !== null) {
          clearTimeout(this.connectTimeoutId);
          this.connectTimeoutId = null;
        }
      }
      _startHandshakeTimeout() {
        this.handshakeTimeoutId = setTimeout(() => {
          if (!this.handshakeCompleted && !this.destroyed) {
            this._onError(new Error("BitTorrent handshake timeout"));
          }
        }, 25e3);
      }
      _clearHandshakeTimeout() {
        if (this.handshakeTimeoutId !== null) {
          clearTimeout(this.handshakeTimeoutId);
          this.handshakeTimeoutId = null;
        }
      }
      _clearTimeouts() {
        if (this._iceGatherTimeoutId !== null) {
          clearTimeout(this._iceGatherTimeoutId);
          this._iceGatherTimeoutId = null;
        }
        this._clearConnectTimeout();
        this._clearHandshakeTimeout();
      }
      _onError(err) {
        if (this.destroyed) return;
        this.emit("error", new CustomEvent("error", {
          detail: {
            error: err
          }
        }));
        this.destroy();
      }
    };
  }
});

// packages/core/src/utils/encode-util.ts
function uint8ArrayToBinaryString(buffer) {
  let result = "";
  for (let i3 = 0; i3 < buffer.length; i3++) {
    result += String.fromCharCode(buffer[i3]);
  }
  return result;
}
var init_encode_util = __esm({
  "packages/core/src/utils/encode-util.ts"() {
    __name(uint8ArrayToBinaryString, "uint8ArrayToBinaryString");
  }
});

// packages/core/src/network/tracker.ts
function percentEncodeBytes(bytes) {
  let result = "";
  for (let i3 = 0; i3 < bytes.length; i3++) {
    result += `%${bytes[i3].toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return result;
}
function integerInRange(value, name, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TrackerError(`${name} is invalid`);
  }
  return value;
}
function validateTrackerOptions(baseUrl, opts, event) {
  if (!(opts.infoHash instanceof Uint8Array) || !(opts.peerId instanceof Uint8Array) || opts.infoHash.length !== 20 || opts.peerId.length !== 20) {
    throw new TrackerError("infoHash and peerId must contain 20 bytes");
  }
  if (typeof baseUrl !== "string" || !baseUrl || baseUrl.length > MAX_TRACKER_URL_LENGTH) {
    throw new TrackerError("tracker URL is invalid");
  }
  try {
    new URL(baseUrl);
  } catch (error) {
    throw new TrackerError("tracker URL is invalid", "TRACKER_ERROR", {
      cause: error
    });
  }
  if (opts.port !== void 0) integerInRange(opts.port, "port", 1, 65535);
  if (opts.uploaded !== void 0) {
    integerInRange(opts.uploaded, "uploaded", 0);
  }
  if (opts.downloaded !== void 0) {
    integerInRange(opts.downloaded, "downloaded", 0);
  }
  if (opts.left !== void 0) integerInRange(opts.left, "left", 0);
  if (opts.numwant !== void 0) {
    integerInRange(opts.numwant, "numwant", 0, MAX_NUM_WANT);
  }
  if (opts.key !== void 0) integerInRange(opts.key, "key", 0, 4294967295);
  if (opts.timeoutMs !== void 0) {
    integerInRange(opts.timeoutMs, "timeoutMs", 1, MAX_TIMEOUT_MS);
  }
  if (event?.event !== void 0 && !TRACKER_EVENTS.has(event.event)) {
    throw new TrackerError("event is invalid");
  }
}
function buildAnnounceUrl(baseUrl, opts, event, trackerId) {
  validateTrackerOptions(baseUrl, opts, event);
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:" || !url.hostname) {
    throw new TrackerError(`unsupported HTTP tracker URL: ${url.protocol}`);
  }
  const parameters = [
    `info_hash=${percentEncodeBytes(opts.infoHash)}`,
    `peer_id=${percentEncodeBytes(opts.peerId)}`,
    `port=${opts.port ?? 6881}`,
    `uploaded=${opts.uploaded ?? 0}`,
    `downloaded=${opts.downloaded ?? 0}`,
    `left=${opts.left ?? 0}`,
    "compact=1",
    `numwant=${opts.numwant ?? 50}`
  ];
  if (event?.event) parameters.push(`event=${event.event}`);
  if (opts.key !== void 0) parameters.push(`key=${opts.key}`);
  if (trackerId) {
    parameters.push(`trackerid=${encodeURIComponent(trackerId)}`);
  }
  url.search += `${url.search ? "&" : ""}${parameters.join("&")}`;
  return url;
}
function dictString(dict, key) {
  const value = dict[key];
  return typeof value === "string" ? value : void 0;
}
function dictNonNegativeInteger(dict, key) {
  const value = dict[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return void 0;
}
function parseDictionaryPeers(values) {
  const peers = [];
  const textDecoder2 = new TextDecoder();
  for (const value of values.slice(0, MAX_DICTIONARY_PEERS)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const dict = value;
    const ipRaw = dict["ip"];
    const hostname = typeof ipRaw === "string" ? ipRaw : ipRaw instanceof Uint8Array ? textDecoder2.decode(ipRaw) : void 0;
    const portRaw = dict["port"];
    const port = typeof portRaw === "number" ? portRaw : typeof portRaw === "bigint" ? Number(portRaw) : void 0;
    if (!hostname || port === void 0 || !Number.isSafeInteger(port)) {
      continue;
    }
    if (port < 1 || port > 65535) continue;
    peers.push({
      ip: hostname,
      port
    });
  }
  return peers;
}
function toBytes(value) {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}
function parseHttpTrackerResponse(bytes) {
  let dict;
  try {
    const value = decode(bytes, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: 32,
      allowUnsortedKeys: true
    });
    if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Uint8Array || value instanceof Map) {
      throw new TrackerError("tracker response must be a dictionary");
    }
    dict = value;
  } catch (error) {
    if (error instanceof TrackerError) throw error;
    throw new TrackerError("tracker returned invalid bencode", "TRACKER_ERROR", {
      cause: error
    });
  }
  const failure = dictString(dict, "failure reason");
  if (failure) {
    throw new TrackerError(`tracker announce failed: ${failure}`);
  }
  const interval = dictNonNegativeInteger(dict, "interval");
  if (interval === void 0 || interval < 1) {
    throw new TrackerError("tracker response has no valid interval");
  }
  const peers = [];
  const ipv4 = dict["peers"];
  if (ipv4 instanceof Uint8Array || typeof ipv4 === "string") {
    try {
      peers.push(...parseCompactIpv4Peers(toBytes(ipv4)));
    } catch (error) {
      throw new TrackerError("invalid compact IPv4 peer list", "TRACKER_ERROR", {
        cause: error
      });
    }
  } else if (Array.isArray(ipv4)) {
    peers.push(...parseDictionaryPeers(ipv4));
  }
  const ipv6 = dict["peers6"];
  if (ipv6 instanceof Uint8Array || typeof ipv6 === "string") {
    try {
      peers.push(...parseCompactIpv6Peers(toBytes(ipv6)));
    } catch (error) {
      throw new TrackerError("invalid compact IPv6 peer list", "TRACKER_ERROR", {
        cause: error
      });
    }
  }
  const connectable = peers.filter((peer) => peer.port >= 1 && peer.port <= 65535);
  return {
    interval,
    minInterval: dictNonNegativeInteger(dict, "min interval"),
    trackerId: dictString(dict, "tracker id"),
    warning: dictString(dict, "warning message"),
    complete: dictNonNegativeInteger(dict, "complete") ?? 0,
    incomplete: dictNonNegativeInteger(dict, "incomplete") ?? 0,
    peers: deduplicatePeers(connectable)
  };
}
async function readBoundedBody(response, maximumBytes) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new TrackerError("tracker response has invalid Content-Length");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      throw new TrackerError("tracker response is too large");
    }
  }
  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new TrackerError("tracker response is too large");
      }
      chunks.push(value);
    }
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
function createTracker(announceUrl, opts) {
  if (announceUrl.startsWith("http://") || announceUrl.startsWith("https://")) {
    return new HttpTracker(announceUrl, opts);
  }
  if (announceUrl.startsWith("ws://") || announceUrl.startsWith("wss://")) {
    return new WsTracker(announceUrl, opts);
  }
  throw new TrackerError(`Unsupported tracker protocol: ${announceUrl}`);
}
var DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MAX_NUM_WANT, MAX_TRACKER_URL_LENGTH, MAX_RESPONSE_BYTES, MAX_DICTIONARY_PEERS, TRACKER_EVENTS, HttpTracker, WsTracker;
var init_tracker = __esm({
  "packages/core/src/network/tracker.ts"() {
    init_bencode();
    init_errors();
    init_net();
    init_encode_util();
    init_event_target();
    DEFAULT_TIMEOUT_MS = 15e3;
    MAX_TIMEOUT_MS = 3e5;
    MAX_NUM_WANT = 2e3;
    MAX_TRACKER_URL_LENGTH = 8192;
    MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    MAX_DICTIONARY_PEERS = 2e3;
    __name(percentEncodeBytes, "percentEncodeBytes");
    __name(integerInRange, "integerInRange");
    TRACKER_EVENTS = /* @__PURE__ */ new Set([
      "started",
      "completed",
      "stopped"
    ]);
    __name(validateTrackerOptions, "validateTrackerOptions");
    __name(buildAnnounceUrl, "buildAnnounceUrl");
    __name(dictString, "dictString");
    __name(dictNonNegativeInteger, "dictNonNegativeInteger");
    __name(parseDictionaryPeers, "parseDictionaryPeers");
    __name(toBytes, "toBytes");
    __name(parseHttpTrackerResponse, "parseHttpTrackerResponse");
    __name(readBoundedBody, "readBoundedBody");
    HttpTracker = class extends TypedEventTarget {
      static {
        __name(this, "HttpTracker");
      }
      baseUrl;
      opts;
      abortController = null;
      timeoutId = null;
      trackerId;
      constructor(baseUrl, opts) {
        super();
        this.baseUrl = baseUrl;
        this.opts = opts;
      }
      async announce(event) {
        validateTrackerOptions(this.baseUrl, this.opts, event);
        const url = buildAnnounceUrl(this.baseUrl, this.opts, event, this.trackerId);
        this.abortController = new AbortController();
        const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        let timedOut = false;
        this.timeoutId = setTimeout(() => {
          timedOut = true;
          this.abortController?.abort();
        }, timeoutMs);
        try {
          const response = await fetch(url, {
            signal: this.abortController.signal,
            headers: {
              "User-Agent": "BrowserTorrent-WebTorrent/0.1.0"
            }
          });
          if (!response.ok) {
            throw new TrackerError(`Tracker HTTP error: ${response.status}`);
          }
          const bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES);
          const parsed = parseHttpTrackerResponse(bytes);
          if (parsed.trackerId) this.trackerId = parsed.trackerId;
          return {
            interval: parsed.interval,
            minInterval: parsed.minInterval,
            complete: parsed.complete,
            incomplete: parsed.incomplete,
            peers: parsed.peers,
            trackerId: parsed.trackerId,
            warning: parsed.warning
          };
        } catch (err) {
          if (timedOut) {
            throw new TrackerError("HTTP tracker request timed out", "TRACKER_ERROR", {
              cause: err
            });
          }
          if (err instanceof Error && err.name === "AbortError") {
            throw new TrackerError("Tracker announce aborted", "TRACKER_ERROR", {
              cause: err
            });
          }
          if (err instanceof TrackerError) throw err;
          throw new TrackerError(err instanceof Error ? err.message : "HTTP tracker request failed", "TRACKER_ERROR", {
            cause: err
          });
        } finally {
          if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
          }
          this.abortController = null;
        }
      }
      destroy() {
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
      }
    };
    WsTracker = class extends TypedEventTarget {
      static {
        __name(this, "WsTracker");
      }
      url;
      opts;
      ws = null;
      pendingAnnounces = [];
      hasConnected = false;
      destroyed = false;
      reconnectTimer = null;
      trackerId;
      constructor(url, opts) {
        super();
        this.url = url;
        this.opts = opts;
      }
      announce(event) {
        return new Promise((resolve, reject) => {
          if (this.destroyed) {
            return reject(new TrackerError("Tracker destroyed"));
          }
          this.pendingAnnounces.push({
            event,
            resolve,
            reject
          });
          if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this._connect();
          } else if (this.ws.readyState === WebSocket.OPEN) {
            this._flushAnnounces();
          }
        });
      }
      _connect() {
        if (this.destroyed) return;
        try {
          this.ws = new WebSocket(this.url);
          this.ws.onopen = () => {
            this.hasConnected = true;
            this._flushAnnounces();
          };
          this.ws.onmessage = (event) => {
            if (this.destroyed) return;
            try {
              const data = JSON.parse(event.data);
              if (data.action === "announce") {
                if (data.interval !== void 0 || data.peers !== void 0) {
                  const peers = [];
                  if (Array.isArray(data.peers)) {
                    for (const p4 of data.peers) {
                      if (p4.ip || p4.ipv4 || p4.ipv6) {
                        peers.push({
                          ip: p4.ip || p4.ipv4 || p4.ipv6,
                          port: p4.port
                        });
                      }
                    }
                  }
                  const response = {
                    interval: data.interval || 1800,
                    complete: data.complete || 0,
                    incomplete: data.incomplete || 0,
                    peers: deduplicatePeers(peers),
                    trackerId: this.trackerId
                  };
                  this.emit("update", new CustomEvent("update", {
                    detail: response
                  }));
                  const pending = [
                    ...this.pendingAnnounces
                  ];
                  this.pendingAnnounces = [];
                  for (const p4 of pending) {
                    p4.resolve(response);
                  }
                }
                if (data.peer_id) {
                  this.emit("peer", new CustomEvent("peer", {
                    detail: {
                      peerId: data.peer_id,
                      offer: data.offer,
                      answer: data.answer,
                      offerId: data.offer_id
                    }
                  }));
                }
              } else if (data.action === "offer" || data.action === "answer") {
                const peerId = data.from_peer_id || data.peer_id;
                if (peerId) {
                  this.emit("peer", new CustomEvent("peer", {
                    detail: {
                      peerId,
                      offer: data.offer,
                      answer: data.answer,
                      offerId: data.offer_id
                    }
                  }));
                }
              } else if (data["failure reason"]) {
                const err = new TrackerError(String(data["failure reason"]));
                this.emit("error", new CustomEvent("error", {
                  detail: err
                }));
                this._rejectPending(err);
              } else if (data.action === "error") {
                const err = new TrackerError(String(data["failure reason"] || "Unknown error"));
                this.emit("error", new CustomEvent("error", {
                  detail: err
                }));
                this._rejectPending(err);
              }
            } catch (err) {
              console.warn("WsTracker parse error:", err);
            }
          };
          this.ws.onerror = () => {
          };
          this.ws.onclose = () => {
            this.ws = null;
            if (!this.destroyed && this.hasConnected) {
              this.reconnectTimer = setTimeout(() => this._connect(), 5e3);
            } else {
              this._rejectPending(new TrackerError("WebSocket connection closed"));
            }
          };
        } catch (err) {
          this._rejectPending(err instanceof Error ? err : new TrackerError(String(err)));
        }
      }
      _flushAnnounces() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        for (const pending of this.pendingAnnounces) {
          const e3 = pending.event || {};
          const msg = {
            action: "announce",
            info_hash: uint8ArrayToBinaryString(this.opts.infoHash),
            peer_id: uint8ArrayToBinaryString(this.opts.peerId),
            numwant: e3.numwant || this.opts.numwant || 50,
            uploaded: this.opts.uploaded || 0,
            downloaded: this.opts.downloaded || 0,
            left: this.opts.left || 0
          };
          if (e3.event) msg.event = e3.event;
          if (e3.offers) msg.offers = e3.offers;
          if (e3.answer) msg.answer = e3.answer;
          if (e3.to_peer_id) msg.to_peer_id = e3.to_peer_id;
          if (e3.offer_id) msg.offer_id = e3.offer_id;
          if (this.trackerId) msg.trackerid = this.trackerId;
          this.ws.send(JSON.stringify(msg));
        }
        this.pendingAnnounces = this.pendingAnnounces.filter((p4) => {
          if (p4.event?.to_peer_id) {
            p4.resolve({
              interval: 1800,
              complete: 0,
              incomplete: 0,
              peers: []
            });
            return false;
          }
          return true;
        });
      }
      _rejectPending(err) {
        const pending = [
          ...this.pendingAnnounces
        ];
        this.pendingAnnounces = [];
        for (const p4 of pending) {
          p4.reject(err);
        }
      }
      destroy() {
        this.destroyed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        this._rejectPending(new TrackerError("Tracker destroyed"));
      }
    };
    __name(createTracker, "createTracker");
  }
});

// packages/core/src/core/extension.ts
var Extension;
var init_extension = __esm({
  "packages/core/src/core/extension.ts"() {
    init_event_target();
    Extension = class extends TypedEventTarget {
      static {
        __name(this, "Extension");
      }
      wire;
      constructor(wire) {
        super();
        this.wire = wire;
      }
    };
  }
});

// packages/core/src/extensions/ut-metadata.ts
var MAX_METADATA_SIZE, PIECE_LENGTH, DEFAULT_TIMEOUT_MS2, UtMetadata;
var init_ut_metadata = __esm({
  "packages/core/src/extensions/ut-metadata.ts"() {
    init_extension();
    init_bencode();
    init_bitfield();
    MAX_METADATA_SIZE = 1e7;
    PIECE_LENGTH = 16384;
    DEFAULT_TIMEOUT_MS2 = 15e3;
    UtMetadata = class extends Extension {
      static {
        __name(this, "UtMetadata");
      }
      name = "ut_metadata";
      _fetching = false;
      _metadataComplete = false;
      _metadataSize = null;
      _numPieces = 0;
      _remainingRejects = 0;
      _bitfield;
      metadata = null;
      _requestedPieces = /* @__PURE__ */ new Map();
      _timeoutMs;
      _extensionId = null;
      constructor(wire, opts) {
        super(wire);
        this._bitfield = new Bitfield({
          length: 0,
          grow: 1e3
        });
        this._timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
        if (opts?.metadata) {
          this.setMetadata(opts.metadata);
        }
      }
      onRegister(context) {
        this._extensionId = context.host.localExtensions.get(this.name) ?? null;
      }
      handshakeFields() {
        const fields = /* @__PURE__ */ new Map();
        if (this._metadataSize !== null) {
          fields.set("metadata_size", this._metadataSize);
        }
        return fields;
      }
      onHandshake(_infoHash, _peerId, _extensions) {
      }
      onExtendedHandshake(handshake) {
        console.log(`[UtMetadata] onExtendedHandshake: m=${JSON.stringify(handshake.m)}, extensionsSize=${handshake.extensions instanceof Map ? handshake.extensions.size : "not Map"}, metadataSize=${handshake.metadataSize}`);
        let utMetadataId;
        let metadataSize;
        if (handshake.extensions instanceof Map) {
          utMetadataId = handshake.extensions.get("ut_metadata");
          metadataSize = handshake.metadataSize ?? (handshake.raw instanceof Map ? handshake.raw.get("metadata_size") : void 0);
        } else if (handshake.m) {
          if (handshake.m instanceof Map) {
            utMetadataId = handshake.m.get("ut_metadata");
          } else if (typeof handshake.m === "object") {
            utMetadataId = handshake.m.ut_metadata;
          }
          metadataSize = handshake.metadata_size ?? handshake.metadataSize;
        }
        console.log(`[UtMetadata] onExtendedHandshake resolved: utMetadataId=${utMetadataId}, metadataSize=${metadataSize}`);
        if (typeof utMetadataId === "number") {
          this._extensionId = utMetadataId;
          if (typeof metadataSize !== "number" || metadataSize > MAX_METADATA_SIZE || metadataSize <= 0) {
            this.emit("warning", new CustomEvent("warning", {
              detail: {
                error: new Error("Peer gave invalid metadata size")
              }
            }));
          } else {
            const size = metadataSize;
            this._metadataSize = size;
            this._numPieces = Math.ceil(size / PIECE_LENGTH);
            this._remainingRejects = 2 * this._numPieces;
            this._bitfield = new Bitfield({
              length: this._numPieces,
              grow: 1e3
            });
            this._fetching = true;
            this._requestPieces();
          }
        } else {
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error: new Error("Peer does not support ut_metadata")
            }
          }));
        }
      }
      onMessage(buf) {
        let dict;
        let trailer;
        try {
          const [decoded, remaining] = decodePrefix(buf, {
            allowUnsortedKeys: true
          });
          dict = decoded;
          trailer = remaining;
        } catch (err) {
          console.warn("[UtMetadata] decodePrefix failed on incoming buffer (length " + buf.length + "):", err);
          return;
        }
        switch (dict.msg_type) {
          case 0:
            this._onRequest(dict.piece);
            break;
          case 1:
            this._onData(dict.piece, trailer, dict.total_size);
            break;
          case 2:
            this._onReject(dict.piece);
            break;
        }
      }
      fetch() {
        if (!this._metadataComplete) {
          this._fetching = true;
          if (this._metadataSize) {
            this._requestPieces();
          }
        }
      }
      cancel() {
        this._fetching = false;
        for (const request of this._requestedPieces.values()) {
          clearTimeout(request.timer);
        }
        this._requestedPieces.clear();
      }
      setMetadata(newMetadata) {
        if (this._metadataComplete) return true;
        let validMetadata = newMetadata;
        try {
          const info = decode(newMetadata);
          if (info.info) {
            validMetadata = encode(info.info);
          }
        } catch (err) {
        }
        this.cancel();
        this.metadata = validMetadata;
        this._metadataComplete = true;
        this._metadataSize = this._metadataSize ?? this.metadata.length;
        if (this.wire.extensionHost.peerExtensions.has("ut_metadata")) {
          this.wire.extensionHost.setHandshakeField("metadata_size", this._metadataSize);
        }
        this.emit("metadata", new CustomEvent("metadata", {
          detail: {
            metadata: this.metadata
          }
        }));
        return true;
      }
      _send(dict, trailer) {
        console.log(`[UtMetadata] _send: dict=${JSON.stringify(dict)}, trailerLength=${trailer ? trailer.length : 0}, extensionId=${this._extensionId}`);
        let buf = encode(dict);
        if (trailer) {
          const combined = new Uint8Array(buf.length + trailer.length);
          combined.set(buf, 0);
          combined.set(trailer, buf.length);
          buf = combined;
        }
        if (this._extensionId !== null) {
          this.wire.sendExtended(this._extensionId, buf);
        } else {
          console.warn(`[UtMetadata] _send NOT sending because _extensionId is null!`);
        }
      }
      _request(piece) {
        const existingRequest = this._requestedPieces.get(piece);
        if (existingRequest) {
          clearTimeout(existingRequest.timer);
        }
        this._send({
          msg_type: 0,
          piece
        });
        const timer = setTimeout(() => {
          this._handleTimeout(piece);
        }, this._timeoutMs);
        const attempts = existingRequest ? existingRequest.attempts + 1 : 1;
        this._requestedPieces.set(piece, {
          piece,
          attempts,
          timer
        });
      }
      _data(piece, buf, totalSize) {
        const request = this._requestedPieces.get(piece);
        if (request) {
          clearTimeout(request.timer);
          this._requestedPieces.delete(piece);
        }
        const msg = {
          msg_type: 1,
          piece
        };
        if (typeof totalSize === "number") {
          msg.total_size = totalSize;
        }
        this._send(msg, buf);
      }
      _reject(piece) {
        this._send({
          msg_type: 2,
          piece
        });
      }
      _onRequest(piece) {
        console.log(`[UtMetadata] _onRequest piece: ${piece}, metadataComplete: ${this._metadataComplete}, size: ${this._metadataSize}`);
        if (!this._metadataComplete || !this._metadataSize) {
          return this._reject(piece);
        }
        const start = piece * PIECE_LENGTH;
        let end = start + PIECE_LENGTH;
        if (end > this._metadataSize) {
          end = this._metadataSize;
        }
        const buf = this.metadata.slice(start, end);
        this._data(piece, buf, this._metadataSize);
      }
      _onData(piece, buf, totalSize) {
        console.log(`[UtMetadata] _onData piece: ${piece}, buf.length: ${buf.length}, totalSize: ${totalSize}, fetching: ${this._fetching}, metaSize: ${this._metadataSize}`);
        if (buf.length > PIECE_LENGTH || !this._fetching || !this._metadataSize) {
          return;
        }
        if (this._bitfield.get(piece)) {
          return;
        }
        if (!this.metadata) {
          this.metadata = new Uint8Array(this._metadataSize);
        }
        this.metadata.set(buf, piece * PIECE_LENGTH);
        this._bitfield.set(piece);
        const request = this._requestedPieces.get(piece);
        if (request) {
          clearTimeout(request.timer);
          this._requestedPieces.delete(piece);
        }
        this._checkDone();
      }
      _onReject(piece) {
        const request = this._requestedPieces.get(piece);
        if (request) {
          clearTimeout(request.timer);
          this._requestedPieces.delete(piece);
        }
        if (this._remainingRejects > 0 && this._fetching) {
          this._request(piece);
          this._remainingRejects -= 1;
        } else {
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error: new Error('Peer sent "reject" too much')
            }
          }));
        }
      }
      _handleTimeout(piece) {
        this._requestedPieces.delete(piece);
        if (!this._fetching) return;
        const maxAttempts = 3;
        const currentRequest = this._requestedPieces.get(piece);
        const attempts = currentRequest ? currentRequest.attempts + 1 : 1;
        if (attempts < maxAttempts) {
          this._request(piece);
        } else {
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error: new Error(`Timeout while requesting metadata piece ${piece}`)
            }
          }));
          this._checkDone();
        }
      }
      _requestPieces() {
        if (this._fetching && this._metadataSize) {
          this.metadata = new Uint8Array(this._metadataSize);
          for (let piece = 0; piece < this._numPieces; piece++) {
            this._request(piece);
          }
        }
      }
      _checkDone() {
        let done = true;
        for (let piece = 0; piece < this._numPieces; piece++) {
          if (!this._bitfield.get(piece)) {
            done = false;
            break;
          }
        }
        if (done && this.metadata) {
          const success = this._verifyMetadataIntegrity();
          if (success) {
            this.setMetadata(this.metadata);
          } else {
            this._failedMetadata();
          }
        }
      }
      _verifyMetadataIntegrity() {
        if (!this.metadata) return false;
        console.log(`[UtMetadata] _verifyMetadataIntegrity metadata.length: ${this.metadata.length}, first 20 bytes:`, Array.from(this.metadata.slice(0, 20)));
        try {
          decode(this.metadata);
          return true;
        } catch (err) {
          console.warn("Metadata integrity check failed:", err);
          return false;
        }
      }
      _failedMetadata() {
        if (!this._metadataSize) return;
        this._bitfield = new Bitfield({
          length: this._numPieces,
          grow: 1e3
        });
        this._remainingRejects -= this._numPieces;
        if (this._remainingRejects > 0) {
          this._requestPieces();
        } else {
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error: new Error("Peer sent invalid metadata")
            }
          }));
        }
      }
    };
  }
});

// packages/core/src/network/swarm.ts
var MAX_QUEUED_PEERS, Swarm;
var init_swarm = __esm({
  "packages/core/src/network/swarm.ts"() {
    init_event_target();
    init_peer();
    init_tracker();
    init_ut_metadata();
    MAX_QUEUED_PEERS = 200;
    Swarm = class extends TypedEventTarget {
      static {
        __name(this, "Swarm");
      }
      infoHash;
      peerId;
      peers = /* @__PURE__ */ new Map();
      queue = [];
      trackers = [];
      maxConns;
      wrtc;
      rtcConfig;
      metadata;
      pendingOffers = /* @__PURE__ */ new Map();
      torrent = null;
      destroyed = false;
      paused = false;
      _downloadLimit = 0;
      _uploadLimit = 0;
      constructor(opts) {
        super();
        this.infoHash = opts.infoHash;
        this.peerId = opts.peerId;
        this.maxConns = opts.maxConns || 55;
        this.wrtc = opts.wrtc;
        this.rtcConfig = opts.rtcConfig;
        this.metadata = opts.metadata;
        for (const announceUrl of opts.announce) {
          try {
            const trackerOpts = {
              infoHash: opts.infoHash,
              peerId: opts.peerId,
              port: opts.port || 6881
            };
            const tracker = createTracker(announceUrl, trackerOpts);
            tracker.on("peer", (e3) => {
              const { peerId, offer, answer, offerId } = e3.detail;
              this._onTrackerPeer(tracker, peerId, offer, answer, offerId);
            });
            tracker.on("warning", (e3) => {
              this.emit("warning", new CustomEvent("warning", {
                detail: {
                  error: new Error(e3.detail)
                }
              }));
            });
            tracker.on("error", (e3) => {
              this.emit("warning", new CustomEvent("warning", {
                detail: {
                  error: e3.detail
                }
              }));
            });
            this.trackers.push(tracker);
          } catch (err) {
            this.emit("warning", new CustomEvent("warning", {
              detail: {
                error: err instanceof Error ? err : new Error(String(err))
              }
            }));
          }
        }
      }
      async start() {
        if (this.destroyed) return;
        for (const tracker of this.trackers) {
          try {
            let offers = [];
            if (tracker.constructor.name === "WsTracker" || tracker.url?.startsWith?.("ws")) {
              offers = await this._generateOffers(Math.min(this.maxConns - this.peers.size, 5));
            }
            const response = await tracker.announce({
              event: "started",
              offers
            });
            this._onTrackerResponse(response, tracker);
          } catch (err) {
            this.emit("warning", new CustomEvent("warning", {
              detail: {
                error: err instanceof Error ? err : new Error(String(err))
              }
            }));
          }
        }
      }
      _createPeer(initiator, addr) {
        let utMetadata = null;
        const peer = new Peer({
          initiator,
          infoHash: this.infoHash,
          peerId: this.peerId,
          wrtc: this.wrtc,
          addr,
          config: this.rtcConfig,
          onWire: /* @__PURE__ */ __name((wire) => {
            utMetadata = new UtMetadata(wire, {
              metadata: this.metadata
            });
            try {
              wire.use(utMetadata);
            } catch (err) {
              console.warn("[Swarm] Error registering ut_metadata on wire:", err);
            }
            if (this.metadata) {
              utMetadata.setMetadata(this.metadata);
            }
            utMetadata.on("metadata", (metadataEvent) => {
              const metadata = metadataEvent.detail?.metadata || metadataEvent;
              if (!this.metadata) {
                this.metadata = metadata;
              }
              this.emit("metadata", new CustomEvent("metadata", {
                detail: {
                  metadata,
                  peer
                }
              }));
            });
            utMetadata.on("warning", (warningEvent) => {
              const error = warningEvent.detail?.error || warningEvent;
              this.emit("warning", new CustomEvent("warning", {
                detail: {
                  error
                }
              }));
              this.torrent?.emit?.("warning", new CustomEvent("warning", {
                detail: {
                  error
                }
              }));
            });
          }, "onWire")
        });
        peer.on("handshake", () => {
          if (!this.metadata && utMetadata) {
            utMetadata.fetch();
          }
        });
        return peer;
      }
      async _generateOffers(count) {
        const offers = [];
        const promises = Array.from({
          length: count
        }).map(async () => {
          const offerId = Array.from(crypto.getRandomValues(new Uint8Array(20))).map((b3) => b3.toString(16).padStart(2, "0")).join("");
          const peer = this._createPeer(true, `webrtc:${offerId}`);
          this.pendingOffers.set(offerId, peer);
          return new Promise((resolve) => {
            let resolved = false;
            const timeoutId = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve();
              }
            }, 5e3);
            peer.on("signal", (e3) => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timeoutId);
              offers.push({
                offer: e3.detail.data,
                offer_id: offerId
              });
              resolve();
            });
            peer.on("error", () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                resolve();
              }
            });
          });
        });
        await Promise.all(promises);
        return offers;
      }
      _onTrackerPeer(tracker, peerId, offer, answer, offerId) {
        if (this.destroyed || this.paused) return;
        if (answer && offerId) {
          const peer = this.pendingOffers.get(offerId);
          if (peer) {
            peer.id = peerId;
            this.peers.set(`webrtc:${peerId}`, peer);
            this.pendingOffers.delete(offerId);
            this._hookPeerEvents(peer, `webrtc:${peerId}`);
            peer.signal(answer);
            this.emit("peer", new CustomEvent("peer", {
              detail: {
                peer,
                source: "tracker"
              }
            }));
          }
          return;
        }
        if (offer && offerId) {
          if (this.peers.has(`webrtc:${peerId}`)) return;
          const peer = this._createPeer(false, `webrtc:${peerId}`);
          peer.id = peerId;
          this.peers.set(`webrtc:${peerId}`, peer);
          this._hookPeerEvents(peer, `webrtc:${peerId}`);
          peer.on("signal", (e3) => {
            const answerSdp = e3.detail.data;
            tracker.announce({
              to_peer_id: peerId,
              offer_id: offerId,
              answer: answerSdp
            }).catch(console.warn);
          });
          peer.signal(offer);
          this.emit("peer", new CustomEvent("peer", {
            detail: {
              peer,
              source: "tracker"
            }
          }));
        }
      }
      addPeer(addr) {
        if (this.destroyed || this.paused) return false;
        if (this.peers.has(addr)) return false;
        if (this.peers.size >= this.maxConns) {
          if (this.queue.length < MAX_QUEUED_PEERS) {
            this.queue.push({
              addr,
              retries: 0
            });
          }
          return false;
        }
        this._connectPeer(addr);
        return true;
      }
      removePeer(addr) {
        const peer = this.peers.get(addr);
        if (peer) {
          peer.destroy();
          this.peers.delete(addr);
          this._drain();
        }
      }
      pause() {
        this.paused = true;
      }
      resume() {
        this.paused = false;
        this._drain();
      }
      get downloadLimit() {
        return this._downloadLimit;
      }
      get uploadLimit() {
        return this._uploadLimit;
      }
      throttleDownload(rate) {
        this._downloadLimit = Math.max(0, rate);
        for (const peer of this.peers.values()) {
          if (peer.wire && !peer.wire.isDestroyed) {
            peer.wire.throttleDownload?.(this._downloadLimit);
          }
        }
      }
      throttleUpload(rate) {
        this._uploadLimit = Math.max(0, rate);
        for (const peer of this.peers.values()) {
          if (peer.wire && !peer.wire.isDestroyed) {
            peer.wire.throttleUpload?.(this._uploadLimit);
          }
        }
      }
      _sendInterested() {
        for (const [, peer] of this.peers) {
          if (peer.wire && !peer.wire.isDestroyed) peer.wire.sendInterested();
        }
      }
      _sendNotInterested() {
        for (const [, peer] of this.peers) {
          if (peer.wire && !peer.wire.isDestroyed) peer.wire.sendNotInterested();
        }
      }
      _sendSuggestPiece(index) {
        for (const [, peer] of this.peers) {
          if (peer.wire && !peer.wire.isDestroyed) {
            peer.wire.sendSuggestPiece(index);
          }
        }
      }
      broadcastHave(index) {
        for (const [, peer] of this.peers) {
          if (peer.wire && !peer.wire.isDestroyed) {
            peer.wire.sendHave(index);
          }
        }
      }
      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const queued of this.queue) {
          if (queued.timeoutId) clearTimeout(queued.timeoutId);
        }
        this.queue = [];
        for (const [, peer] of this.peers) {
          peer.destroy();
        }
        this.peers.clear();
        for (const [, peer] of this.pendingOffers) {
          peer.destroy();
        }
        this.pendingOffers.clear();
        for (const tracker of this.trackers) {
          tracker.destroy();
        }
        this.trackers = [];
        this.torrent = null;
      }
      _onTrackerResponse(response, _tracker) {
        this.emit("trackerAnnounce");
        if (response.peers.length === 0) {
          this.emit("noPeers", new CustomEvent("noPeers", {
            detail: {
              source: "tracker"
            }
          }));
          this.torrent?.emit?.("noPeers", new CustomEvent("noPeers", {
            detail: {
              source: "tracker"
            }
          }));
          return;
        }
        for (const peerInfo of response.peers) {
          if (peerInfo.ip && peerInfo.port) {
            const addr = `${peerInfo.ip}:${peerInfo.port}`;
            this.addPeer(addr);
          }
        }
      }
      _connectPeer(addr) {
        if (this.destroyed || this.paused) return;
        if (this.peers.has(addr)) return;
        const peer = this._createPeer(true, addr);
        this.peers.set(addr, peer);
        this._hookPeerEvents(peer, addr);
      }
      _hookPeerEvents(peer, addr) {
        peer.on("connect", () => {
        });
        peer.on("handshake", () => {
          if (peer.wire) {
            const wire = peer.wire;
            this.emit("wire", new CustomEvent("wire", {
              detail: {
                wire,
                addr
              }
            }));
            this.torrent?._registerWire?.(wire, addr);
          }
        });
        peer.on("close", () => {
          this.peers.delete(addr);
          this._drain();
        });
        peer.on("error", (e3) => {
          this.peers.delete(addr);
          const error = e3.detail?.error || e3;
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error
            }
          }));
          this._drain();
        });
      }
      _drain() {
        if (this.destroyed || this.paused) return;
        while (this.peers.size < this.maxConns && this.queue.length > 0) {
          const queued = this.queue.shift();
          if (queued) {
            this._connectPeer(queued.addr);
          }
        }
      }
    };
  }
});

// packages/core/src/crypto/random.ts
function randomBytes(size) {
  const buffer = new Uint8Array(size);
  crypto.getRandomValues(buffer);
  return buffer;
}
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
  let result = "";
  const bytes = randomBytes(length);
  for (let i3 = 0; i3 < length; i3++) {
    const byte = bytes[i3];
    result += chars[byte % chars.length];
  }
  return result;
}
var init_random = __esm({
  "packages/core/src/crypto/random.ts"() {
    __name(randomBytes, "randomBytes");
    __name(generateRandomString, "generateRandomString");
  }
});

// packages/core/src/utils/peerid.ts
function isAzStyle(peerid) {
  return peerid.length >= 8 && peerid[0] === "-" && peerid[7] === "-" && /^[A-Za-z0-9]{2}$/.test(peerid.slice(1, 3)) && /^\d{4}$/.test(peerid.slice(3, 7));
}
function isShadowStyle(peerid) {
  return peerid.length >= 9 && /^[A-Za-z]$/.test(peerid[0]) && // 🔥 Ajuste TS: non-null assertion
  peerid.slice(6, 9) === "---";
}
function parseAzVersion(versionStr) {
  if (versionStr.length !== 4) return versionStr;
  const majorChar = versionStr[0];
  const minorChar = versionStr[1];
  if (!/\d/.test(majorChar) || !/\d/.test(minorChar)) {
    throw new Error("Invalid Azureus version format: major/minor must be digits");
  }
  const major = majorChar;
  const minor = minorChar;
  const patchNum = parseInt(versionStr.slice(2), 10);
  if (patchNum < 0 || patchNum > 99) {
    throw new Error("Invalid Azureus version format: patch must be between 0-99");
  }
  return `${major}.${minor}.${patchNum}`;
}
function parseShadowVersion(versionStr) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-";
  const parts = [];
  for (const char of versionStr) {
    if (char === "-") break;
    const idx = chars.indexOf(char);
    if (idx !== -1) parts.push(idx);
  }
  return parts.length > 0 ? parts.join(".") : "0";
}
function decodePeerId(peerId) {
  const peeridStr = typeof peerId === "string" ? peerId : new TextDecoder("utf-8", {
    fatal: false
  }).decode(peerId);
  if (peeridStr.length < 20) return null;
  const id = peeridStr.slice(0, 20);
  if (isAzStyle(id)) {
    const code = id.slice(1, 3);
    const versionRaw = id.slice(3, 7);
    const name = AZUREUS_CLIENTS[code] || `Unknown (${code})`;
    const version = parseAzVersion(versionRaw);
    return {
      code,
      name,
      version,
      style: "azureus"
    };
  }
  if (isShadowStyle(id)) {
    const code = id[0];
    const versionRaw = id.slice(1, 6);
    const name = SHADOW_CLIENTS[code] || `Unknown (${code})`;
    const version = parseShadowVersion(versionRaw);
    return {
      code,
      name,
      version,
      style: "shadow"
    };
  }
  return null;
}
function generateBrowserTorrentPeerId() {
  const prefix = BT_PEER_ID_PREFIX;
  const randomPart = generateRandomString(20 - prefix.length);
  const peerIdStr = prefix + randomPart;
  return new TextEncoder().encode(peerIdStr);
}
var BT_PEER_ID_PREFIX, AZUREUS_CLIENTS, SHADOW_CLIENTS;
var init_peerid = __esm({
  "packages/core/src/utils/peerid.ts"() {
    init_random();
    BT_PEER_ID_PREFIX = "-BT0100-";
    AZUREUS_CLIENTS = {
      "AG": "Ares",
      "A~": "Ares",
      "AR": "Arctic",
      "AT": "Artemis",
      "AV": "Avicora",
      "AX": "BitPump",
      "AZ": "Azureus/Vuze",
      "BB": "BitBuddy",
      "BC": "BitComet",
      "BE": "Baretorrent",
      "BF": "Bitflu",
      "BG": "BTG (libtorrent)",
      "BL": "BitCometLite",
      "BP": "BitTorrent Pro",
      "BR": "BitRocket",
      "BS": "BTSlave",
      "BT": "mainline BitTorrent",
      "BW": "BitWombat",
      "BX": "~Bittorrent X",
      "CD": "Enhanced CTorrent",
      "CT": "CTorrent",
      "DE": "Deluge",
      "DP": "Propagate Data Client",
      "EB": "EBit",
      "ES": "electric sheep",
      "FC": "FileCroc",
      "FD": "Free Download Manager",
      "FT": "FoxTorrent",
      "FX": "Freebox BitTorrent",
      "GS": "GSTorrent",
      "HK": "Hekate",
      "HL": "Halite",
      "HM": "hMule (libtorrent)",
      "HN": "Hydranode",
      "IL": "iLivid",
      "JS": "Justseed.it",
      "JT": "JavaTorrent",
      "KG": "KGet",
      "KT": "KTorrent",
      "LC": "LeechCraft",
      "LH": "LH-ABC",
      "LO": "BrowserTorrent",
      "LP": "Lphant",
      "LT": "libtorrent (Rasterbar)",
      "lt": "libTorrent (Rakshasa)",
      "LW": "LimeWire",
      "MK": "Meerkat",
      "MO": "MonoTorrent",
      "MP": "MooPolice",
      "MR": "Miro",
      "MT": "MoonlightTorrent",
      "NB": "Net::BitTorrent",
      "NX": "Net Transport",
      "OS": "OneSwarm",
      "OT": "OmegaTorrent",
      "PB": "Protocol::BitTorrent",
      "PD": "Pando",
      "PI": "PicoTorrent",
      "PT": "PHPTracker",
      "qB": "qBittorrent",
      "QD": "QQDownload",
      "QT": "Qt 4 Torrent",
      "RT": "Retriever",
      "RZ": "RezTorrent",
      "S~": "Shareaza (alpha/beta)",
      "SB": "~Swiftbit",
      "SD": "Thunder (X\xF9nL\xE9i)",
      "SM": "SoMud",
      "SP": "BitSpirit",
      "SS": "SwarmScope",
      "ST": "SymTorrent",
      "st": "sharktorrent",
      "SZ": "Shareaza",
      "TB": "Torch",
      "TE": "terasaur Seed Bank",
      "TL": "Tribler",
      "TN": "TorrentDotNET",
      "TR": "Transmission",
      "TS": "Torrentstorm",
      "TT": "TuoTu",
      "UL": "uLeecher!",
      "UM": "\xB5Torrent for Mac",
      "UT": "\xB5Torrent",
      "VG": "Vagaa",
      "WD": "WebTorrent Desktop",
      "WT": "BitLet",
      "WW": "WebTorrent",
      "WY": "FireTorrent",
      "XF": "Xfplay",
      "XL": "Xunlei",
      "XS": "XSwifter",
      "XT": "XanTorrent",
      "XX": "Xtorrent",
      "ZT": "ZipTorrent"
    };
    SHADOW_CLIENTS = {
      "A": "ABC",
      "O": "Osprey Permaseed",
      "Q": "BTQueue",
      "R": "Tribler",
      "S": "Shadow's Client",
      "T": "BitTornado",
      "U": "UPnP NAT Bit Torrent"
    };
    __name(isAzStyle, "isAzStyle");
    __name(isShadowStyle, "isShadowStyle");
    __name(parseAzVersion, "parseAzVersion");
    __name(parseShadowVersion, "parseShadowVersion");
    __name(decodePeerId, "decodePeerId");
    __name(generateBrowserTorrentPeerId, "generateBrowserTorrentPeerId");
  }
});

// packages/core/src/storage/memory-chunk-store.ts
var MemoryChunkStore;
var init_memory_chunk_store = __esm({
  "packages/core/src/storage/memory-chunk-store.ts"() {
    MemoryChunkStore = class {
      static {
        __name(this, "MemoryChunkStore");
      }
      chunkLength;
      length;
      lastChunkLength;
      lastChunkIndex;
      chunks = /* @__PURE__ */ new Map();
      closed = false;
      constructor(opts) {
        this.chunkLength = opts.chunkLength;
        this.length = opts.length || Infinity;
        if (this.length !== Infinity && this.length > 0) {
          this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
          this.lastChunkIndex = Math.floor((this.length - 1) / this.chunkLength);
        } else {
          this.lastChunkLength = this.chunkLength;
          this.lastChunkIndex = Infinity;
        }
      }
      updateLength(chunkLength, length) {
        this.chunkLength = chunkLength;
        this.length = length || Infinity;
        if (this.length !== Infinity && this.length > 0) {
          this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
          this.lastChunkIndex = Math.floor((this.length - 1) / this.chunkLength);
        } else {
          this.lastChunkLength = this.chunkLength;
          this.lastChunkIndex = Infinity;
        }
      }
      // ── Implementation (SEM a palavra-chave 'async') ──
      get(index, optsOrCb, cb) {
        const opts = typeof optsOrCb === "object" ? optsOrCb : void 0;
        const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
        if (callback) {
          this._getAsync(index, opts).then((buf) => callback(null, buf)).catch((err) => callback(err));
          return;
        }
        return this._getAsync(index, opts);
      }
      async _getAsync(index, opts) {
        if (this.closed) throw new Error("Storage is closed");
        const buf = this.chunks.get(index);
        if (!buf) {
          const err = new Error(`Chunk ${index} not found`);
          err.notFound = true;
          throw err;
        }
        if (opts) {
          const offset = opts.offset || 0;
          const length = opts.length || buf.length - offset;
          return buf.subarray(offset, offset + length);
        }
        return buf;
      }
      put(index, buf, cb) {
        const promise = this._putAsync(index, buf);
        if (cb) {
          promise.then(() => cb(null)).catch((err) => cb(err));
        }
        return promise;
      }
      async _putAsync(index, buf) {
        if (this.closed) throw new Error("Storage is closed");
        const isLastChunk = index === this.lastChunkIndex;
        const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
        if (buf.length !== expectedLength) {
          throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
        }
        this.chunks.set(index, buf);
      }
      close(cb) {
        const promise = this._closeAsync();
        if (cb) {
          promise.then(() => cb(null)).catch((err) => cb(err));
        }
        return promise;
      }
      async _closeAsync() {
        if (this.closed) throw new Error("Storage is already closed");
        this.closed = true;
        this.chunks.clear();
      }
      destroy(cb) {
        const promise = this._destroyAsync();
        if (cb) {
          promise.then(() => cb(null)).catch((err) => cb(err));
        }
        return promise;
      }
      async _destroyAsync() {
        this.closed = true;
        this.chunks.clear();
      }
    };
  }
});

// packages/core/src/storage/opfs-chunk-store.ts
var OPFSChunkStore;
var init_opfs_chunk_store = __esm({
  "packages/core/src/storage/opfs-chunk-store.ts"() {
    init_memory_chunk_store();
    OPFSChunkStore = class {
      static {
        __name(this, "OPFSChunkStore");
      }
      chunkLength;
      length;
      lastChunkLength;
      lastChunkIndex;
      rootDir;
      closed = false;
      fallbackStore = null;
      constructor(opts) {
        this.chunkLength = opts.chunkLength;
        this.length = opts.length || Infinity;
        if (this.length !== Infinity && this.length > 0) {
          this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
          this.lastChunkIndex = Math.floor((this.length - 1) / this.chunkLength);
        } else {
          this.lastChunkLength = this.chunkLength;
          this.lastChunkIndex = Infinity;
        }
        this.rootDir = opts.rootDir || null;
        if (!this.rootDir) {
          console.warn("[OPFSChunkStore] OPFS not available, falling back to memory store");
          this.fallbackStore = new MemoryChunkStore({
            chunkLength: this.chunkLength,
            length: this.length
          });
        }
      }
      updateLength(chunkLength, length) {
        this.chunkLength = chunkLength;
        this.length = length || Infinity;
        if (this.length !== Infinity && this.length > 0) {
          this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
          this.lastChunkIndex = Math.floor((this.length - 1) / this.chunkLength);
        } else {
          this.lastChunkLength = this.chunkLength;
          this.lastChunkIndex = Infinity;
        }
        if (this.fallbackStore) {
          this.fallbackStore.updateLength(chunkLength, length);
        }
      }
      // ── Implementation (SEM a palavra-chave 'async') ──
      get(index, optsOrCb, cb) {
        if (this.fallbackStore) {
          if (typeof optsOrCb === "function") {
            return this.fallbackStore.get(index, optsOrCb);
          }
          if (cb) {
            return this.fallbackStore.get(index, optsOrCb ?? {}, cb);
          }
          return this.fallbackStore.get(index, optsOrCb ?? {});
        }
        const opts = typeof optsOrCb === "object" ? optsOrCb : void 0;
        const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
        if (callback) {
          this._getAsync(index, opts).then((buf) => callback(null, buf)).catch((err) => callback(err));
          return;
        }
        return this._getAsync(index, opts);
      }
      async _getAsync(index, opts) {
        if (this.closed) throw new Error("Storage is closed");
        if (!this.rootDir) throw new Error("OPFS root directory not available");
        const fileName = `${index}.chunk`;
        try {
          const fileHandle = await this.rootDir.getFileHandle(fileName, {
            create: false
          });
          const file = await fileHandle.getFile();
          const arrayBuffer = await file.arrayBuffer();
          let buf = new Uint8Array(arrayBuffer);
          const isLastChunk = index === this.lastChunkIndex;
          const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
          if (buf.length !== expectedLength) {
            throw new Error(`Chunk ${index} has invalid length: expected ${expectedLength}, got ${buf.length}`);
          }
          if (opts) {
            const offset = opts.offset || 0;
            const length = opts.length || buf.length - offset;
            buf = buf.subarray(offset, offset + length);
          }
          return buf;
        } catch (err) {
          if (err && typeof err === "object" && "name" in err && err.name === "NotFoundError") {
            const error = new Error(`Chunk ${index} not found`);
            error.notFound = true;
            throw error;
          }
          throw err;
        }
      }
      put(index, buf, cb) {
        const promise = this._putAsync(index, buf);
        if (cb) {
          promise.then(() => cb(null)).catch((err) => cb(err));
        }
        return promise;
      }
      async _putAsync(index, buf) {
        if (this.closed) throw new Error("Storage is closed");
        if (!this.rootDir) throw new Error("OPFS root directory not available");
        const isLastChunk = index === this.lastChunkIndex;
        const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
        if (buf.length !== expectedLength) {
          throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
        }
        const fileName = `${index}.chunk`;
        try {
          const fileHandle = await this.rootDir.getFileHandle(fileName, {
            create: true
          });
          const writable = await fileHandle.createWritable();
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          await writable.write(arrayBuffer);
          await writable.close();
        } catch (err) {
          throw new Error(`Failed to write chunk ${index}: ${err}`);
        }
      }
      close(cb) {
        const promise = this._closeAsync();
        if (cb) {
          promise.then(() => cb(null)).catch((err) => cb(err));
        }
        return promise;
      }
      _closeAsync() {
        if (this.closed) throw new Error("Storage is already closed");
        this.closed = true;
        this.rootDir = null;
        return Promise.resolve();
      }
      destroy(cb) {
        const promise = this._destroyAsync();
        if (cb) {
          promise.then(() => cb(null)).catch((err) => cb(err));
        }
        return promise;
      }
      async _destroyAsync() {
        if (!this.rootDir) {
          this.closed = true;
          return;
        }
        try {
          for await (const entry of this.rootDir.values()) {
            if (entry.kind === "file") {
              await this.rootDir.removeEntry(entry.name);
            }
          }
        } catch (err) {
          console.warn("[OPFSChunkStore] Error during destroy:", err);
        }
        this.closed = true;
        this.rootDir = null;
      }
    };
  }
});

// packages/core/src/server/stream-manager.ts
function buildStreamURL(scope, infoHash, fileIndex, name) {
  const safeName = encodeURIComponent(name);
  return `${scope}webtorrent/${infoHash}/${fileIndex}/${safeName}`;
}
function parseStreamURL(url, scope) {
  const prefix = `${scope}webtorrent/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const parts = rest.split("/");
  if (parts.length < 3) return null;
  const infoHash = parts[0];
  const fileIndex = Number.parseInt(parts[1], 10);
  const name = decodeURIComponent(parts.slice(2).join("/"));
  if (!/^[0-9a-fA-F]{40}$/.test(infoHash)) return null;
  if (!Number.isSafeInteger(fileIndex) || fileIndex < 0) return null;
  return {
    infoHash: infoHash.toLowerCase(),
    fileIndex,
    name
  };
}
var StreamManager, streamManager;
var init_stream_manager = __esm({
  "packages/core/src/server/stream-manager.ts"() {
    StreamManager = class {
      static {
        __name(this, "StreamManager");
      }
      entries = /* @__PURE__ */ new Map();
      /**
       * Registers (or replaces) the file entry for a `(infoHash, fileIndex)`.
       *
       * The same `File` object is also bound back to the entry through
       * `infoHash`/`fileIndex` so {@link File.streamURL} can produce a URL
       * that resolves back to the same record.
       *
       * @param infoHash - 40-char hex info hash identifying the torrent.
       * @param fileIndex - Zero-based file index inside the torrent.
       * @param file - The {@link File} instance to serve.
       */
      register(infoHash, fileIndex, file) {
        const key = this._key(infoHash, fileIndex);
        this.entries.set(key, {
          infoHash,
          fileIndex,
          file
        });
      }
      /**
       * Removes a single file entry.  Safe to call when the entry does not
       * exist.
       */
      unregister(infoHash, fileIndex) {
        this.entries.delete(this._key(infoHash, fileIndex));
      }
      /**
       * Removes every file entry that belongs to the given torrent.  Used
       * when a torrent is removed from the client so the SW cannot keep
       * streaming after the underlying data is gone.
       */
      unregisterTorrent(infoHash) {
        const prefix = `${infoHash}:`;
        for (const key of this.entries.keys()) {
          if (key.startsWith(prefix)) this.entries.delete(key);
        }
      }
      /**
       * Returns the file entry for a `(infoHash, fileIndex)` or `undefined`
       * if no such file is registered.
       */
      get(infoHash, fileIndex) {
        return this.entries.get(this._key(infoHash, fileIndex));
      }
      /**
       * Lists every currently registered file entry.  Used by tests and
       * diagnostics — not by the hot path of the streaming protocol.
       */
      list() {
        return Array.from(this.entries.values());
      }
      /**
       * Returns the total number of registered file entries.  Useful for
       * shutdown checks and for tests asserting cleanup behaviour.
       */
      size() {
        return this.entries.size;
      }
      /**
       * Removes every entry.  Called by the test suite and (in the future)
       * by a full client destruction path that wants to wipe state without
       * touching each torrent individually.
       */
      clear() {
        this.entries.clear();
      }
      _key(infoHash, fileIndex) {
        return `${infoHash}:${fileIndex}`;
      }
    };
    streamManager = new StreamManager();
    __name(buildStreamURL, "buildStreamURL");
    __name(parseStreamURL, "parseStreamURL");
  }
});

// packages/core/src/server/server.ts
function createServiceWorkerTransport(controller, scope) {
  const PORT_TIMEOUT_MS = 5e3;
  const pending = /* @__PURE__ */ new Map();
  const onMessage = /* @__PURE__ */ __name((event) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "webtorrent-response" && typeof event.data.sourceId === "string") {
      const resolver = pending.get(event.data.sourceId);
      if (resolver) {
        pending.delete(event.data.sourceId);
        resolver(event.data);
      }
    }
  }, "onMessage");
  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", onMessage);
  }
  return {
    postMessage(message) {
      controller.postMessage(message);
    },
    requestStream(message, port) {
      const sourceId = crypto.randomUUID();
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (pending.delete(sourceId)) {
            resolve({
              body: null,
              status: 503,
              statusText: "Service Unavailable"
            });
          }
        }, PORT_TIMEOUT_MS);
        pending.set(sourceId, (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
        controller.postMessage({
          ...message,
          sourceId,
          type: "webtorrent"
        }, [
          port
        ]);
      });
    },
    close() {
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      pending.clear();
    }
  };
}
function buildFileStream(entry, port, _transport, opts = {}) {
  const file = entry.file;
  let fileOffset = opts.rangeStart ?? 0;
  const endOffset = opts.rangeEnd ?? file.length;
  let closed = false;
  let pendingResolve = null;
  const onMessage = /* @__PURE__ */ __name((event) => {
    const data = event.data;
    if (data === false || data == null) {
      closed = true;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r();
      }
      return;
    }
    if (data === true && pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
  }, "onMessage");
  port.addEventListener("message", onMessage);
  port.start?.();
  return new ReadableStream({
    async pull(controller) {
      try {
        if (closed) {
          controller.close();
          port.removeEventListener("message", onMessage);
          return;
        }
        if (fileOffset >= endOffset) {
          controller.close();
          port.postMessage(null);
          port.removeEventListener("message", onMessage);
          return;
        }
        await new Promise((resolve) => {
          pendingResolve = resolve;
          if (closed) {
            pendingResolve = null;
            resolve();
          }
        });
        if (closed) {
          controller.close();
          port.removeEventListener("message", onMessage);
          return;
        }
        const chunk = await readNextChunk(file, fileOffset);
        if (chunk.byteLength === 0) {
          controller.close();
          port.postMessage(null);
          port.removeEventListener("message", onMessage);
          return;
        }
        fileOffset += chunk.byteLength;
        controller.enqueue(chunk);
        port.postMessage(chunk);
      } catch (err) {
        controller.error(err);
        port.removeEventListener("message", onMessage);
      }
    },
    cancel() {
      closed = true;
      port.postMessage(false);
      port.removeEventListener("message", onMessage);
    }
  });
}
function parseRangeHeader(header, fileLength) {
  if (!header) return null;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const endStr = match[2];
  if (!Number.isFinite(start) || start < 0 || start >= fileLength) {
    return null;
  }
  const end = endStr !== "" ? Math.min(Number(endStr), fileLength - 1) : fileLength - 1;
  if (!Number.isFinite(end) || end < start || end >= fileLength) {
    return null;
  }
  return {
    start,
    end
  };
}
async function readNextChunk(file, offset, length = STREAM_BLOCK_SIZE) {
  const it = file[Symbol.asyncIterator]();
  let skipped = 0;
  const remainingToRead = Math.min(length, file.length - offset);
  if (offset === 0) {
    const { value: value2, done: done2 } = await it.next();
    if (done2 || !value2) return new Uint8Array(0);
    return value2.subarray(0, Math.min(value2.length, remainingToRead));
  }
  while (skipped < offset) {
    const result = await it.next();
    if (result.done || !result.value) return new Uint8Array(0);
    const value2 = result.value;
    skipped += value2.length;
    if (skipped > offset) {
      const overflow = skipped - offset;
      const takeFromThis = value2.length - overflow;
      if (takeFromThis >= remainingToRead) {
        return value2.subarray(value2.length - remainingToRead, value2.length);
      }
      const first = value2.subarray(value2.length - takeFromThis, value2.length);
      const out = new Uint8Array(remainingToRead);
      out.set(first, 0);
      let written = first.length;
      while (written < remainingToRead) {
        const r = await it.next();
        if (r.done || !r.value) break;
        const take = Math.min(r.value.length, remainingToRead - written);
        out.set(r.value.subarray(0, take), written);
        written += take;
      }
      return out.subarray(0, written);
    }
  }
  const { value, done } = await it.next();
  if (done || !value) return new Uint8Array(0);
  return value.subarray(0, Math.min(value.length, remainingToRead));
}
function guessContentType(name) {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) {
    return "application/octet-stream";
  }
  const ext = name.slice(idx + 1).toLowerCase();
  switch (ext) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "ogg":
    case "ogv":
      return "video/ogg";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "m4a":
    case "aac":
      return "audio/aac";
    case "oga":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain; charset=utf-8";
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "srt":
      return "application/x-subrip";
    case "vtt":
      return "text/vtt";
    default:
      return "application/octet-stream";
  }
}
function createServer(opts = {}) {
  let transport;
  let scope;
  if (opts.transport) {
    transport = opts.transport;
    scope = opts.scope || "/";
  } else if (opts.controller) {
    scope = opts.scope || opts.controller.scope || "/";
    transport = createServiceWorkerTransport(opts.controller, scope);
  } else {
    scope = opts.scope || "/";
    transport = new InProcessTransport();
  }
  return new WebTorrentServer({
    transport,
    scope
  });
}
function registerTorrentFiles(torrent, files) {
  const infoHash = torrent.infoHash;
  const registered = [];
  for (let i3 = 0; i3 < files.length; i3++) {
    const file = files[i3];
    console.log("[server] registerTorrentFiles:", infoHash, "fileIndex:", i3, "name:", file.name);
    streamManager.register(infoHash, i3, file);
    registered.push({
      infoHash,
      fileIndex: i3,
      file
    });
  }
  return registered;
}
function unregisterTorrentFiles(infoHash) {
  streamManager.unregisterTorrent(infoHash);
}
var InProcessTransport, WebTorrentServer, STREAM_BLOCK_SIZE;
var init_server = __esm({
  "packages/core/src/server/server.ts"() {
    init_stream_manager();
    __name(createServiceWorkerTransport, "createServiceWorkerTransport");
    InProcessTransport = class {
      static {
        __name(this, "InProcessTransport");
      }
      sent = [];
      responseResolver;
      /** @internal — exposed for tests. */
      activePort;
      postMessage(message) {
        this.sent.push(message);
      }
      requestStream(_message, port) {
        this.activePort = port;
        return new Promise((resolve) => {
          this.responseResolver = resolve;
        });
      }
      /** Test helper: deliver the metadata reply for the current request. */
      deliverResponse(data) {
        this.responseResolver?.(data);
      }
      /** Test helper: send a pull signal (`true` for more, `false` to end). */
      sendPull(signal) {
        this.activePort?.postMessage(signal);
      }
      close() {
        this.activePort?.close();
        this.activePort = void 0;
        this.responseResolver = void 0;
      }
    };
    WebTorrentServer = class {
      static {
        __name(this, "WebTorrentServer");
      }
      scope;
      isReady = false;
      isDestroyed = false;
      transport;
      pendingAcks = /* @__PURE__ */ new Set();
      constructor(opts) {
        this.transport = opts.transport;
        this.scope = opts.scope;
      }
      /**
       * Sends the `WEBTORRENT_ACK` message to the Service Worker.  In
       * production this is called automatically by the SW the first time a
       * `/webtorrent/*` request arrives; the public `createServer` wrapper
       * may also call it eagerly during `init` to warm the path.
       *
       * @returns A promise that resolves to `true` once the SW has flipped
       *   its internal `isWebTorrentReady` flag.  The current SW code does
       *   not post a separate ack back, so this resolves immediately —
       *   the method exists so future revisions can opt into a stricter
       *   round-trip without changing the public API.
       */
      sendReadyAck() {
        if (this.isDestroyed) return Promise.resolve(false);
        const ack = {
          type: "WEBTORRENT_ACK"
        };
        this.transport.postMessage(ack);
        this.isReady = true;
        return Promise.resolve(true);
      }
      /**
       * Streams a file in response to a request originated by the SW.
       *
       * The flow is:
       *
       * 1. Translate the request URL into a `(infoHash, fileIndex)` pair
       *    using {@link parseStreamURL}.
       * 2. Look the entry up in the {@link streamManager}.
       * 3. Hand the entry to {@link buildFileStream} which returns a
       *    `ReadableStream<Uint8Array>` driven by the `MessagePort` pull
       *    signals.
       *
       * @returns A `Response` suitable for `event.respondWith()`.  When the
       *   URL is unknown the method returns a `404`; when the SW is not
       *   ready it returns a `503`.
       */
      handleRequest(message, port) {
        if (this.isDestroyed) {
          return Promise.resolve(new Response("Server destroyed", {
            status: 503
          }));
        }
        const parsed = parseStreamURL(message.url, message.scope || this.scope);
        if (!parsed) {
          return Promise.resolve(new Response("Not Found", {
            status: 404
          }));
        }
        const entry = streamManager.get(parsed.infoHash, parsed.fileIndex);
        if (!entry) {
          return Promise.resolve(new Response("File not registered", {
            status: 404
          }));
        }
        const range = parseRangeHeader(message.headers["range"], entry.file.length);
        let status = 200;
        let statusText = "OK";
        const headers = {
          "Content-Type": guessContentType(entry.file.name),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store"
        };
        if (range) {
          status = 206;
          statusText = "Partial Content";
          headers["Content-Range"] = `bytes ${range.start}-${range.end}/${entry.file.length}`;
          headers["Content-Length"] = String(range.end - range.start + 1);
        } else {
          headers["Content-Length"] = String(entry.file.length);
        }
        const stream = buildFileStream(entry, port, this.transport, {
          rangeStart: range?.start,
          rangeEnd: range ? range.end + 1 : void 0
        });
        return Promise.resolve(new Response(stream, {
          status,
          statusText,
          headers
        }));
      }
      /**
       * Tears down the server.  Closes the transport so any future pull
       * signals stop firing.  Safe to call more than once.
       */
      destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.isReady = false;
        this.transport.close();
        for (const resolve of this.pendingAcks) resolve(false);
        this.pendingAcks.clear();
      }
    };
    __name(buildFileStream, "buildFileStream");
    __name(parseRangeHeader, "parseRangeHeader");
    STREAM_BLOCK_SIZE = 16 * 1024;
    __name(readNextChunk, "readNextChunk");
    __name(guessContentType, "guessContentType");
    __name(createServer, "createServer");
    __name(registerTorrentFiles, "registerTorrentFiles");
    __name(unregisterTorrentFiles, "unregisterTorrentFiles");
  }
});

// packages/core/src/core/file.ts
var _computedKey, MIME_MAP, File;
var init_file = __esm({
  "packages/core/src/core/file.ts"() {
    init_event_target();
    init_stream_manager();
    MIME_MAP = {
      mp4: "video/mp4",
      mkv: "video/x-matroska",
      webm: "video/webm",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      mp3: "audio/mpeg",
      flac: "audio/flac",
      wav: "audio/wav",
      ogg: "audio/ogg",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      zip: "application/zip",
      rar: "application/vnd.rar",
      "7z": "application/x-7z-compressed",
      tar: "application/x-tar",
      gz: "application/gzip",
      txt: "text/plain",
      html: "text/html",
      htm: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      xml: "application/xml",
      md: "text/markdown",
      iso: "application/x-iso9660-image"
    };
    _computedKey = Symbol.asyncIterator;
    File = class extends TypedEventTarget {
      static {
        __name(this, "File");
      }
      _store;
      _length;
      _offset;
      _pieceLength;
      _name;
      _path;
      _infoHash;
      _fileIndex;
      _scope;
      _blockSize;
      _destroyed = false;
      _torrent;
      constructor(options) {
        super();
        this._store = options.store;
        this._length = options.length;
        this._offset = options.offset;
        this._pieceLength = options.pieceLength;
        this._name = options.name ?? "file";
        this._path = options.path ?? this._name;
        this._infoHash = options.infoHash;
        this._fileIndex = options.fileIndex;
        this._scope = options.scope ?? "/";
        this._blockSize = options.blockSize ?? 64 * 1024;
        this._torrent = options.torrent;
      }
      get length() {
        return this._length;
      }
      get name() {
        return this._name;
      }
      get path() {
        return this._path;
      }
      get pieceLength() {
        return this._pieceLength;
      }
      get offset() {
        return this._offset;
      }
      get infoHash() {
        return this._infoHash;
      }
      get fileIndex() {
        return this._fileIndex;
      }
      get scope() {
        return this._scope;
      }
      get destroyed() {
        return this._destroyed;
      }
      /**
       * MIME type inferred from the file name extension.
       *
       * Mirrors the upstream `webtorrent.min.js` `file.type`.
       */
      get type() {
        const ext = this._name.toLowerCase().split(".").pop() ?? "";
        return MIME_MAP[ext] ?? "application/octet-stream";
      }
      /**
       * Número de bytes baixados deste arquivo específico.
       * Calculado a partir do array de Piece objects do torrent.
       */
      get downloaded() {
        const torrent = this._torrent;
        if (!torrent) return 0;
        const { first, last } = this.pieceRange;
        const pieces = torrent.pieces;
        if (!pieces || !Array.isArray(pieces)) return 0;
        const pieceLength = this._pieceLength;
        let downloaded = 0;
        for (let i3 = first; i3 <= last; i3++) {
          if (pieces[i3]?.hash) {
            downloaded += i3 === last ? Math.min(pieceLength, this._offset + this._length - i3 * pieceLength) : pieceLength;
          }
        }
        return Math.min(downloaded, this._length);
      }
      /**
       * Progress de download deste arquivo específico (0..1).
       */
      get progress() {
        if (this._length === 0) return 0;
        return this.downloaded / this._length;
      }
      /**
       * Compute the range of piece indices that this file overlaps.
       *
       * Useful for piece selection algorithms that need to know which pieces
       * "belong" to a given file.
       */
      get pieceRange() {
        const first = Math.floor(this._offset / this._pieceLength);
        const last = Math.floor((this._offset + this._length - 1) / this._pieceLength);
        return {
          first,
          last
        };
      }
      /**
       * Returns true if the given piece index is part of this file.
       *
       * Supports both upstream signatures:
       * - `includes(pieceIndex: number)` — piece index
       * - `includes(piece: Piece)` — Piece object (legacy)
       */
      includes(pieceOrIndex) {
        const { first, last } = this.pieceRange;
        const index = typeof pieceOrIndex === "number" ? pieceOrIndex : pieceOrIndex.index;
        return index >= first && index <= last;
      }
      /**
       * Mark pieces [startPiece, endPiece] (inclusive) as selected for download.
       * Delegates to the owning torrent's `select`.
       *
       * If the file is not attached to a torrent, this is a no-op.
       */
      select(startPiece, endPiece) {
        if (!this._torrent || !this._torrent.pieces) return;
        const { first, last } = this.pieceRange;
        const start = startPiece ?? first;
        const end = endPiece ?? last;
        this._torrent.select(start, end);
      }
      /**
       * Mark pieces [startPiece, endPiece] as deselected.
       * Delegates to the owning torrent's `deselect`.
       *
       * If the file is not attached to a torrent, this is a no-op.
       */
      deselect(startPiece, endPiece) {
        if (!this._torrent || !this._torrent.pieces) return;
        const { first, last } = this.pieceRange;
        const start = startPiece ?? first;
        const end = endPiece ?? last;
        this._torrent.deselect(start, end);
      }
      // ==========================================================================
      // STREAMING
      // ==========================================================================
      /**
       * Create a W3C `ReadableStream<Uint8Array>` that reads this file's bytes
       * from the underlying {@link ChunkStore}, in order, in blocks of
       * {@link blockSize} bytes (default 64 KiB).
       *
       * Emits the `stream` event with the resulting stream as detail.
       *
       * Reading is **lazy**: each `pull` requests the next block from the
       * store.  This is the path that `<video src="…">` uses via the Service
       * Worker bridge.
       */
      createReadStream(opts = {}) {
        if (this._destroyed) {
          throw new Error("File has been destroyed");
        }
        const fileStart = opts.start ?? 0;
        const fileEnd = opts.end ?? this._length;
        const absStart = this._offset + fileStart;
        const absEnd = this._offset + fileEnd;
        if (fileStart < 0 || fileEnd > this._length || fileStart > fileEnd) {
          throw new RangeError(`Invalid range start=${fileStart}, end=${fileEnd}, length=${this._length}`);
        }
        let cursor = absStart;
        let cancelled = false;
        let doneEmitted = false;
        const stream = new ReadableStream({
          pull: /* @__PURE__ */ __name(async (controller) => {
            if (cancelled) {
              controller.close();
              return;
            }
            if (cursor >= absEnd) {
              if (!doneEmitted) {
                doneEmitted = true;
                this.emit("done", new CustomEvent("done"));
              }
              controller.close();
              return;
            }
            try {
              const block = await this._readBlock(cursor, Math.min(this._blockSize, absEnd - cursor));
              if (cancelled) return;
              if (block.length === 0) {
                controller.close();
                return;
              }
              controller.enqueue(block);
              cursor += block.length;
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              this.emit("error", new CustomEvent("error", {
                detail: {
                  error
                }
              }));
              controller.error(error);
            }
          }, "pull"),
          cancel: /* @__PURE__ */ __name(() => {
            cancelled = true;
          }, "cancel")
        });
        this.emit("stream", new CustomEvent("stream", {
          detail: stream
        }));
        return stream;
      }
      /**
       * Alias for {@link createReadStream}.  Returns a `ReadableStream<Uint8Array>`.
       */
      stream(opts = {}) {
        return this.createReadStream(opts);
      }
      /**
       * Async iterator yielding this file's bytes as `Uint8Array` chunks.
       *
       * Used by `for await (const chunk of file)` loops and is the basis of
       * `arrayBuffer` and `blob`.
       */
      [_computedKey]() {
        const stream = this.createReadStream();
        const iterator = stream[Symbol.asyncIterator]();
        this.emit("iterator", new CustomEvent("iterator", {
          detail: iterator
        }));
        return iterator;
      }
      /**
       * Read the entire file (or a byte range) into a single `ArrayBuffer`.
       *
       * Materializes the file in memory; suitable for small files only.
       * For large files prefer {@link createReadStream} or
       * {@link streamTo}.
       *
       * Supports `{ start, end }` to read a byte range — mirrors upstream
       * `file.arrayBuffer({ start, end })`.
       */
      async arrayBuffer(opts = {}) {
        const stream = this.createReadStream(opts);
        const chunks = [];
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        const total = chunks.reduce((s4, c3) => s4 + c3.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c3 of chunks) {
          out.set(c3, offset);
          offset += c3.length;
        }
        return out.buffer;
      }
      /**
       * Read the entire file (or a byte range) into a `Blob`.
       *
       * Supports `{ start, end }` to read a byte range — mirrors upstream
       * `file.blob({ start, end })`.
       */
      async blob(opts = {}) {
        const stream = this.createReadStream(opts);
        const chunks = [];
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        const total = chunks.reduce((s4, c3) => s4 + c3.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c3 of chunks) {
          out.set(c3, offset);
          offset += c3.length;
        }
        return new Blob([
          out.buffer
        ], {
          type: this.type
        });
      }
      /**
       * Read the entire file into a `Blob` and return a temporary object URL
       * that can be assigned to `<video src>` etc.
       *
       * The caller is responsible for revoking the URL via
       * `URL.revokeObjectURL` when no longer needed.
       */
      async getBlobURL() {
        const blob = await this.blob();
        return URL.createObjectURL(blob);
      }
      /**
       * Wire this file's stream into a `<video>` / `<audio>` element via the
       * Service Worker bridge.
       *
       * Requires that the client has called `client.createServer({ controller })`
       * so the SW has a transport to the main thread.
       */
      streamTo(element) {
        const url = this.streamURL();
        element.src = url;
        element.load();
      }
      /**
       * Return the virtual URL the Service Worker uses to stream this file.
       *
       * Format: `<scope>webtorrent/<infoHash>/<fileIndex>/<encodedName>`.
       *
       * @throws Error if `infoHash` or `fileIndex` are not set, which means
       *   the file was constructed directly (not via `WebTorrent.add`).
       */
      streamURL() {
        if (!this._infoHash || this._fileIndex === void 0) {
          throw new Error("infoHash and fileIndex are required to generate streamURL. Create files via WebTorrent client (client.createServer + add).");
        }
        return buildStreamURL(this._scope, this._infoHash, this._fileIndex, this.name);
      }
      /**
       * Mark the file as destroyed; subsequent reads throw.
       */
      destroy() {
        this._destroyed = true;
      }
      // ==========================================================================
      // Internals
      // ==========================================================================
      /**
       * Read up to `length` bytes starting at the file's `absOffset` (the
       * absolute byte offset inside the torrent).
       *
       * Because the file's bytes may straddle piece boundaries, this method
       * pulls whole pieces from the {@link ChunkStore} and slices out the
       * exact byte range requested.
       */
      async _readBlock(absOffset, length) {
        const fileStart = this._offset;
        const fileEnd = this._offset + this._length;
        if (absOffset < fileStart || absOffset >= fileEnd) {
          return new Uint8Array(0);
        }
        const end = Math.min(absOffset + length, fileEnd);
        const out = new Uint8Array(end - absOffset);
        let written = 0;
        let cursor = absOffset;
        while (cursor < end) {
          const pieceIndex = Math.floor(cursor / this._pieceLength);
          const pieceStart = pieceIndex * this._pieceLength;
          const offsetInPiece = cursor - pieceStart;
          const pieceLen = Math.min(this._pieceLength, fileEnd - pieceStart);
          const wantInPiece = Math.min(pieceLen - offsetInPiece, end - cursor);
          const buf = await this._store.get(pieceIndex);
          if (!buf || buf.length === 0) break;
          out.set(buf.subarray(offsetInPiece, offsetInPiece + wantInPiece), written);
          written += wantInPiece;
          cursor += wantInPiece;
        }
        return out.subarray(0, written);
      }
    };
  }
});

// packages/core/src/torrent-generator/types.ts
var PieceSizeEnum;
var init_types = __esm({
  "packages/core/src/torrent-generator/types.ts"() {
    PieceSizeEnum = /* @__PURE__ */ (function(PieceSizeEnum2) {
      PieceSizeEnum2[PieceSizeEnum2["SIZE_AUTO"] = 0] = "SIZE_AUTO";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_16KB"] = 16384] = "SIZE_16KB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_32KB"] = 32768] = "SIZE_32KB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_64KB"] = 65536] = "SIZE_64KB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_128KB"] = 131072] = "SIZE_128KB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_256KB"] = 262144] = "SIZE_256KB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_512KB"] = 524288] = "SIZE_512KB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_1MB"] = 1048576] = "SIZE_1MB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_2MB"] = 2097152] = "SIZE_2MB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_4MB"] = 4194304] = "SIZE_4MB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_8MB"] = 8388608] = "SIZE_8MB";
      PieceSizeEnum2[PieceSizeEnum2["SIZE_16MB"] = 16777216] = "SIZE_16MB";
      return PieceSizeEnum2;
    })({});
  }
});

// packages/core/src/torrent-generator/opfs-walker.ts
async function getOPFSFileSize(handle) {
  const file = await handle.getFile();
  return file.size;
}
async function walkOPFSDir(root, ignoreHiddenFile = false) {
  const files = [];
  async function visit(dir, prefix) {
    const queue = [];
    for await (const entry of dir.values()) {
      queue.push(entry);
    }
    for (const entry of queue) {
      if (entry.kind === "file") {
        if (ignoreHiddenFile && entry.name.startsWith(".")) continue;
        const fileHandle = entry;
        const size = await getOPFSFileSize(fileHandle);
        files.push({
          name: [
            ...prefix,
            entry.name
          ].join("/"),
          size,
          handle: fileHandle
        });
      } else if (entry.kind === "directory") {
        if (ignoreHiddenFile && entry.name.startsWith(".")) continue;
        await visit(entry, [
          ...prefix,
          entry.name
        ]);
      }
    }
  }
  __name(visit, "visit");
  await visit(root, []);
  files.sort((a3, b3) => {
    const depthA = a3.name.split("/").length;
    const depthB = b3.name.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a3.name.localeCompare(b3.name);
  });
  return files;
}
var init_opfs_walker = __esm({
  "packages/core/src/torrent-generator/opfs-walker.ts"() {
    __name(getOPFSFileSize, "getOPFSFileSize");
    __name(walkOPFSDir, "walkOPFSDir");
  }
});

// packages/core/src/torrent-generator/opfs-reader.ts
var OPFSMultiFileReader;
var init_opfs_reader = __esm({
  "packages/core/src/torrent-generator/opfs-reader.ts"() {
    OPFSMultiFileReader = class {
      static {
        __name(this, "OPFSMultiFileReader");
      }
      #entries;
      #fileIndex = 0;
      #fileOffset = 0;
      #currentFile = null;
      #currentSize = 0;
      #closed = false;
      /**
       * @param entries - Ordered list of OPFS file entries to read sequentially.
       *   Each entry must have either a `handle` set, or a `size` matching a
       *   pre-fetched `File` (see {@link withFile}).
       */
      constructor(entries) {
        this.#entries = [
          ...entries
        ];
      }
      /**
       * Attaches a pre-fetched `File` for the entry at `index`.  Useful when
       * the caller already obtained the `File` from the file handle and wants
       * to avoid re-fetching.
       *
       * @param index - Index into the entries list.
       * @param file - The `File` object for that entry.
       */
      withFile(index, file) {
        if (index < 0 || index >= this.#entries.length) {
          throw new RangeError(`index out of range: ${index}`);
        }
        if (index === this.#fileIndex) {
          this.#currentFile = file;
          this.#currentSize = file.size;
        }
      }
      /**
       * Reads up to `size` bytes from the combined stream.
       *
       * @param size - Maximum number of bytes to read (must be > 0).
       * @returns `Uint8Array` with 1–`size` bytes, or `null` at end-of-stream.
       * @throws {RangeError} If `size` is not a positive integer.
       */
      async readChunk(size) {
        if (size <= 0 || !Number.isInteger(size)) {
          throw new RangeError(`size must be a positive integer, got ${size}`);
        }
        if (this.#closed) throw new Error("reader is closed");
        const parts = [];
        let remaining = size;
        while (remaining > 0) {
          if (this.#currentFile === null) {
            if (this.#fileIndex >= this.#entries.length) break;
            const entry = this.#entries[this.#fileIndex++];
            if (!entry.handle) {
              throw new Error(`entry ${entry.name} has no OPFS handle attached`);
            }
            this.#currentFile = await entry.handle.getFile();
            this.#currentSize = this.#currentFile.size;
            this.#fileOffset = 0;
          }
          const available = this.#currentSize - this.#fileOffset;
          if (available === 0) {
            this.#currentFile = null;
            continue;
          }
          const want = Math.min(remaining, available);
          const blob = this.#currentFile.slice(this.#fileOffset, this.#fileOffset + want);
          const buf = new Uint8Array(await blob.arrayBuffer());
          this.#fileOffset += buf.length;
          if (buf.length === 0) {
            this.#currentFile = null;
            continue;
          }
          parts.push(buf);
          remaining -= buf.length;
        }
        if (parts.length === 0) return null;
        const first = parts[0];
        if (parts.length === 1) return first;
        const result = new Uint8Array(size - remaining);
        let offset = 0;
        for (const part of parts) {
          result.set(part, offset);
          offset += part.length;
        }
        return result;
      }
      /**
       * Async-iterable interface — yields chunks of at most `size` bytes.
       *
       * @param size - Maximum chunk size in bytes (default 64 KiB).
       */
      async *chunks(size = 64 * 1024) {
        while (true) {
          const chunk = await this.readChunk(size);
          if (chunk === null) return;
          yield chunk;
        }
      }
      /** Releases any held handles.  Idempotent. */
      close() {
        this.#currentFile = null;
        this.#closed = true;
      }
      /** Whether {@link close} has been called. */
      get closed() {
        return this.#closed;
      }
    };
  }
});

// packages/core/src/torrent-generator/util.ts
function fileSizeSum(files) {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}
function calcPieceSize(fileSize, pieceSizeEnum) {
  if (pieceSizeEnum !== PieceSizeEnum.SIZE_AUTO) {
    return pieceSizeEnum;
  }
  const presets = Object.values(PieceSizeEnum).filter((v4) => v4 !== 0 && typeof v4 === "number").sort((a3, b3) => a3 - b3);
  const selected = presets.find((p4) => fileSize < p4) ?? presets[presets.length - 1] ?? 0;
  return Math.min(selected, PieceSizeEnum.SIZE_512KB);
}
function isHiddenFile(name) {
  const base = name.split("/").pop() ?? name;
  return base.startsWith(".");
}
function buildPieceFiles(files, pieceSize) {
  const pieceFiles = [];
  let pieceOffset = 0;
  for (let i3 = 0; i3 < files.length; i3++) {
    const entry = files[i3];
    const length = entry.size;
    if (length > 0 && pieceOffset > 0) {
      const paddingLength = pieceSize - pieceOffset;
      pieceFiles.push({
        file: null,
        length: paddingLength,
        padding: true
      });
      pieceOffset = 0;
    }
    pieceFiles.push({
      file: entry,
      length,
      padding: false
    });
    pieceOffset = (pieceOffset + length) % pieceSize;
  }
  return pieceFiles;
}
async function sha1sum(files, pieceSize, alignPiece = false) {
  if (pieceSize < 1) throw new RangeError("pieceSize must be \u2265 1");
  if (alignPiece) return sha1sumAligned(files, pieceSize);
  const totalSize = fileSizeSum(files);
  const pieceCount = Math.ceil(totalSize / pieceSize);
  const digestParts = [];
  const reader = new OPFSMultiFileReader(files);
  try {
    let chunk;
    while ((chunk = await reader.readChunk(pieceSize)) !== null) {
      const digest = await crypto.subtle.digest("SHA-1", chunk);
      digestParts.push(new Uint8Array(digest));
    }
  } finally {
    reader.close();
  }
  const result = new Uint8Array(digestParts.length * 20);
  let offset = 0;
  for (const d5 of digestParts) {
    result.set(d5, offset);
    offset += 20;
  }
  if (digestParts.length !== pieceCount) {
    console.warn(`[sha1sum] expected ${pieceCount} pieces, got ${digestParts.length}`);
  }
  return result;
}
async function sha1sumAligned(files, pieceSize) {
  const pieceFiles = buildPieceFiles(files, pieceSize);
  const digests = [];
  const piece = new Uint8Array(pieceSize);
  let pieceOffset = 0;
  const digestPiece = /* @__PURE__ */ __name(async (len) => {
    const digest = await crypto.subtle.digest("SHA-1", piece.subarray(0, len));
    digests.push(new Uint8Array(digest));
  }, "digestPiece");
  const reader = new OPFSMultiFileReader(pieceFiles.map((pf) => pf.file).filter(Boolean));
  for (const pieceFile of pieceFiles) {
    if (pieceFile.padding) {
      piece.fill(0, pieceOffset, pieceOffset + pieceFile.length);
      pieceOffset += pieceFile.length;
      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize);
        pieceOffset = 0;
      }
      continue;
    }
    const fileEntry = pieceFile.file;
    const file = await fileEntry.handle.getFile();
    let fileOffset = 0;
    while (fileOffset < file.size) {
      const want = Math.min(pieceSize - pieceOffset, file.size - fileOffset);
      const blob = file.slice(fileOffset, fileOffset + want);
      const buf = new Uint8Array(await blob.arrayBuffer());
      fileOffset += buf.length;
      piece.set(buf, pieceOffset);
      pieceOffset += buf.length;
      if (pieceOffset === pieceSize) {
        await digestPiece(pieceSize);
        pieceOffset = 0;
      }
    }
  }
  if (pieceOffset > 0) await digestPiece(pieceOffset);
  const result = new Uint8Array(digests.length * 20);
  digests.forEach((d5, i3) => result.set(d5, i3 * 20));
  return result;
}
function getDefaultCreatedBy() {
  return "browsertorrent-torrent-generator@1.0.0";
}
var init_util = __esm({
  "packages/core/src/torrent-generator/util.ts"() {
    init_types();
    init_opfs_reader();
    __name(fileSizeSum, "fileSizeSum");
    __name(calcPieceSize, "calcPieceSize");
    __name(isHiddenFile, "isHiddenFile");
    __name(buildPieceFiles, "buildPieceFiles");
    __name(sha1sum, "sha1sum");
    __name(sha1sumAligned, "sha1sumAligned");
    __name(getDefaultCreatedBy, "getDefaultCreatedBy");
  }
});

// packages/core/src/torrent-generator/generator.ts
async function generateTorrent(options) {
  const { writer, entry, pieceSize: pieceSizeEnum = PieceSizeEnum.SIZE_AUTO, ignoreHiddenFile = false, alignPiece = false, isPrivate = false, trackers = [], webSeeds = [], source, comment, createdBy, createdAt = Math.floor(Date.now() / 1e3) } = options;
  let files;
  let rootName;
  if (Array.isArray(entry)) {
    files = entry;
    rootName = inferRootName(entry);
  } else {
    rootName = entry.name;
    files = await walkOPFSDir(entry, ignoreHiddenFile);
  }
  if (files.length === 0) {
    throw new Error(`No files found in entry`);
  }
  const totalSize = fileSizeSum(files);
  const pieceSize = calcPieceSize(totalSize, pieceSizeEnum);
  const info = /* @__PURE__ */ new Map([
    [
      "name",
      rootName
    ],
    [
      "piece length",
      pieceSize
    ]
  ]);
  const torrent = /* @__PURE__ */ new Map([
    [
      "created by",
      createdBy ?? getDefaultCreatedBy()
    ],
    [
      "creation date",
      createdAt
    ],
    [
      "info",
      info
    ]
  ]);
  if (trackers.length > 0) {
    const sorted = [
      ...trackers
    ].sort((a3, b3) => a3.localeCompare(b3));
    torrent.set("announce", sorted[0]);
    if (sorted.length > 1) {
      torrent.set("announce-list", sorted.map((t) => [
        t
      ]));
    }
  }
  if (webSeeds.length > 0) {
    const sorted = [
      ...webSeeds
    ].sort((a3, b3) => a3.localeCompare(b3));
    torrent.set("url-list", sorted.length === 1 ? sorted[0] : sorted);
  }
  if (isPrivate) info.set("private", 1);
  if (comment) torrent.set("comment", comment);
  if (source) torrent.set("source", source);
  if (files.length === 1 && !files[0].name.includes("/")) {
    info.set("length", files[0].size);
    info.set("pieces", await sha1sum(files, pieceSize));
  } else {
    const pieceFiles = alignPiece ? buildPieceFiles(files, pieceSize) : files.map((file) => ({
      file,
      length: file.size,
      padding: false
    }));
    const torrentFiles = pieceFiles.map((pieceFile, index) => {
      if (pieceFile.padding) {
        return /* @__PURE__ */ new Map([
          [
            "length",
            pieceFile.length
          ],
          [
            "path",
            [
              ".pad",
              `${pieceFile.length}-${index}`
            ]
          ]
        ]);
      }
      return /* @__PURE__ */ new Map([
        [
          "length",
          pieceFile.file.size
        ],
        [
          "path",
          pieceFile.file.name.split("/")
        ]
      ]);
    });
    info.set("files", torrentFiles);
    info.set("pieces", await sha1sum(files, pieceSize, alignPiece));
  }
  await writer.write(encode(torrent));
}
function inferRootName(entries) {
  if (entries.length === 0) return "torrent";
  const first = entries[0];
  const firstParts = first.name.split("/");
  if (firstParts.length <= 1) return firstParts[0] ?? first.name;
  let commonPrefixLength = 1;
  for (let d5 = 1; d5 < firstParts.length; d5++) {
    const prefix = firstParts.slice(0, d5 + 1).join("/");
    if (entries.every((e3) => e3.name.startsWith(prefix + "/"))) {
      commonPrefixLength = d5 + 1;
    } else {
      break;
    }
  }
  return firstParts.slice(0, commonPrefixLength).join("/");
}
var init_generator = __esm({
  "packages/core/src/torrent-generator/generator.ts"() {
    init_bencode();
    init_types();
    init_opfs_walker();
    init_util();
    __name(generateTorrent, "generateTorrent");
    __name(inferRootName, "inferRootName");
  }
});

// packages/core/src/torrent-generator/mod.ts
var mod_exports = {};
__export(mod_exports, {
  OPFSMultiFileReader: () => OPFSMultiFileReader,
  PieceSizeEnum: () => PieceSizeEnum,
  buildPieceFiles: () => buildPieceFiles,
  calcPieceSize: () => calcPieceSize,
  decode: () => decode,
  encode: () => encode,
  fileSizeSum: () => fileSizeSum,
  generateTorrent: () => generateTorrent,
  getDefaultCreatedBy: () => getDefaultCreatedBy,
  getOPFSFileSize: () => getOPFSFileSize,
  isHiddenFile: () => isHiddenFile,
  sha1sum: () => sha1sum,
  walkOPFSDir: () => walkOPFSDir
});
var init_mod = __esm({
  "packages/core/src/torrent-generator/mod.ts"() {
    init_bencode();
    init_generator();
    init_opfs_walker();
    init_opfs_reader();
    init_util();
    init_types();
  }
});

// packages/core/src/extensions/ut-pex.ts
function encodePexUpdate(update) {
  const added4 = update.added.filter((peer) => peer.address.length === 4);
  const added6 = update.added.filter((peer) => peer.address.length === 16);
  const dropped4 = update.dropped.filter((peer) => peer.address.length === 4);
  const dropped6 = update.dropped.filter((peer) => peer.address.length === 16);
  if (added4.length + added6.length !== update.added.length || dropped4.length + dropped6.length !== update.dropped.length) {
    throw new RangeError("PEX addresses must contain four or sixteen bytes");
  }
  const dictionary = {};
  if (added4.length) {
    dictionary["added"] = compactPeers(added4, 4);
    dictionary["added.f"] = Uint8Array.from(added4, (peer) => peer.flags ?? 0);
  }
  if (added6.length) {
    dictionary["added6"] = compactPeers(added6, 16);
    dictionary["added6.f"] = Uint8Array.from(added6, (peer) => peer.flags ?? 0);
  }
  if (dropped4.length) {
    dictionary["dropped"] = compactPeers(dropped4, 4);
  }
  if (dropped6.length) {
    dictionary["dropped6"] = compactPeers(dropped6, 16);
  }
  return encode(dictionary);
}
function decodePexUpdate(payload, maxPeers = 100) {
  let value;
  try {
    value = decode(payload);
  } catch (cause) {
    throw new Error(`Invalid ut_pex payload: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ut_pex payload must be a dictionary");
  }
  const dict = value;
  const added = [
    ...decodePeers(dict, "added", "added.f", 4),
    ...decodePeers(dict, "added6", "added6.f", 16)
  ];
  const dropped = [
    ...decodePeers(dict, "dropped", void 0, 4),
    ...decodePeers(dict, "dropped6", void 0, 16)
  ];
  if (added.length + dropped.length > maxPeers) {
    throw new Error(`ut_pex update exceeds ${maxPeers} peers`);
  }
  return {
    added,
    dropped
  };
}
function compactPeers(peers, addressLength) {
  const result = new Uint8Array(peers.length * (addressLength + 2));
  let offset = 0;
  for (const peer of peers) {
    if (peer.address.length !== addressLength) {
      throw new RangeError("PEX peer address family changed while encoding");
    }
    if (!Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535) {
      throw new RangeError("PEX peer port must be in the range 1..65535");
    }
    if (peer.flags !== void 0 && (!Number.isInteger(peer.flags) || peer.flags < 0 || peer.flags > 255)) {
      throw new RangeError("PEX peer flags must be an unsigned byte");
    }
    result.set(peer.address, offset);
    new DataView(result.buffer).setUint16(offset + addressLength, peer.port);
    offset += addressLength + 2;
  }
  return result;
}
function decodePeers(dictionary, peersKey, flagsKey, addressLength) {
  const compact = optionalBytes2(dictionary, peersKey);
  if (!compact) return [];
  const width = addressLength + 2;
  if (compact.length % width !== 0) {
    throw new Error(`${peersKey} has a truncated compact endpoint`);
  }
  const count = compact.length / width;
  const flags = flagsKey ? optionalBytes2(dictionary, flagsKey) : void 0;
  if (flags && flags.length !== count) {
    throw new Error(`${flagsKey} length does not match peer count`);
  }
  const peers = [];
  for (let index = 0; index < count; index++) {
    const offset = index * width;
    const port = new DataView(compact.buffer, compact.byteOffset + offset + addressLength, 2).getUint16(0);
    if (port === 0) {
      throw new Error("PEX peer port may not be zero");
    }
    peers.push({
      address: compact.slice(offset, offset + addressLength),
      port,
      flags: flags?.[index] ?? 0
    });
  }
  return peers;
}
function optionalBytes2(dictionary, key) {
  const value = dictionary[key];
  if (value === void 0) return void 0;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new Error(`ut_pex ${key} must be a byte string`);
}
var UT_PEX_NAME, PexPeerFlag, UtPexExtension;
var init_ut_pex = __esm({
  "packages/core/src/extensions/ut-pex.ts"() {
    init_extension();
    init_bencode();
    UT_PEX_NAME = "ut_pex";
    PexPeerFlag = /* @__PURE__ */ (function(PexPeerFlag2) {
      PexPeerFlag2[PexPeerFlag2["PrefersEncryption"] = 1] = "PrefersEncryption";
      PexPeerFlag2[PexPeerFlag2["Seed"] = 2] = "Seed";
      PexPeerFlag2[PexPeerFlag2["Utp"] = 4] = "Utp";
      PexPeerFlag2[PexPeerFlag2["Holepunch"] = 8] = "Holepunch";
      PexPeerFlag2[PexPeerFlag2["Outgoing"] = 16] = "Outgoing";
      return PexPeerFlag2;
    })({});
    UtPexExtension = class extends Extension {
      static {
        __name(this, "UtPexExtension");
      }
      /** BEP 10 registration name. */
      name = UT_PEX_NAME;
      /** Minimum duration enforced between outgoing updates. */
      minSendIntervalMs;
      /** Combined candidate limit for each incoming or outgoing update. */
      maxPeersPerMessage;
      _lastSentAt = -Infinity;
      _listeners = /* @__PURE__ */ new Set();
      _extensionId = null;
      /** Create a bounded PEX codec and notification endpoint. */
      constructor(wire, options = {}) {
        super(wire);
        this.minSendIntervalMs = options.minSendIntervalMs ?? 6e4;
        this.maxPeersPerMessage = options.maxPeersPerMessage ?? 100;
        if (!Number.isSafeInteger(this.minSendIntervalMs) || this.minSendIntervalMs < 0) {
          throw new RangeError("minSendIntervalMs must be a non-negative safe integer");
        }
        if (!Number.isSafeInteger(this.maxPeersPerMessage) || this.maxPeersPerMessage < 1) {
          throw new RangeError("maxPeersPerMessage must be a positive safe integer");
        }
        if (options.onUpdate) this._listeners.add(options.onUpdate);
      }
      /**
       * Called when the extended handshake is received.
       * Registers this extension if the peer supports ut_pex.
       */
      onExtendedHandshake(handshake) {
        const handshakeMap = handshake.m;
        if (handshakeMap && typeof handshakeMap[UT_PEX_NAME] === "number") {
          this._extensionId = handshakeMap[UT_PEX_NAME];
          this.emit("info", new CustomEvent("info", {
            detail: {
              message: `ut_pex registered with extension ID: ${this._extensionId}`
            }
          }));
        } else {
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error: new Error("Peer does not support ut_pex")
            }
          }));
        }
      }
      /**
       * Decode, validate, and notify listeners of one peer update.
       */
      onMessage(payload) {
        try {
          const update = decodePexUpdate(payload, this.maxPeersPerMessage);
          for (const listener of this._listeners) {
            listener(update);
          }
        } catch (err) {
          this.emit("warning", new CustomEvent("warning", {
            detail: {
              error: err instanceof Error ? err : new Error(String(err))
            }
          }));
        }
      }
      /**
       * Subscribe to validated updates and return an unsubscribe function.
       */
      onUpdate(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
      }
      /**
       * Send a bounded update without dialing or modifying any swarm state.
       * BEP 11 limits production senders to one update per minute.
       */
      send(update) {
        if (this._extensionId === null) {
          throw new Error("ut_pex is not registered (no extension ID from extended handshake)");
        }
        const now = Date.now();
        if (now - this._lastSentAt < this.minSendIntervalMs) {
          throw new Error(`ut_pex updates may not be sent this frequently (wait ${this.minSendIntervalMs - (now - this._lastSentAt)}ms)`);
        }
        if (update.added.length + update.dropped.length > this.maxPeersPerMessage) {
          throw new RangeError(`ut_pex update exceeds ${this.maxPeersPerMessage} peers`);
        }
        const payload = encodePexUpdate(update);
        this.wire.sendExtended(this._extensionId, payload);
        this._lastSentAt = now;
        return Promise.resolve();
      }
      onRegister(context) {
        const id = context.host.localExtensions.get(this.name);
        if (id !== void 0) {
          this._extensionId = id;
        }
      }
    };
    __name(encodePexUpdate, "encodePexUpdate");
    __name(decodePexUpdate, "decodePexUpdate");
    __name(compactPeers, "compactPeers");
    __name(decodePeers, "decodePeers");
    __name(optionalBytes2, "optionalBytes");
  }
});

// packages/core/src/mod.ts
var mod_exports2 = {};
__export(mod_exports2, {
  BT_PEER_ID_PREFIX: () => BT_PEER_ID_PREFIX,
  CORE_VERSION: () => CORE_VERSION,
  Client: () => Client,
  File: () => File,
  OPFSMultiFileReader: () => OPFSMultiFileReader,
  Peer: () => Peer,
  PexPeerFlag: () => PexPeerFlag,
  Piece: () => Piece,
  PieceSizeEnum: () => PieceSizeEnum,
  Swarm: () => Swarm,
  Torrent: () => Torrent,
  UtMetadata: () => UtMetadata,
  UtPexExtension: () => UtPexExtension,
  WebTorrentServer: () => WebTorrentServer,
  Wire: () => Wire,
  buildPieceFiles: () => buildPieceFiles,
  buildStreamURL: () => buildStreamURL,
  calcPieceSize: () => calcPieceSize,
  createServer: () => createServer,
  decodePeerId: () => decodePeerId,
  decodePexUpdate: () => decodePexUpdate,
  encodePexUpdate: () => encodePexUpdate,
  fileSizeSum: () => fileSizeSum,
  generateBrowserTorrentPeerId: () => generateBrowserTorrentPeerId,
  generateTorrent: () => generateTorrent,
  getDefaultCreatedBy: () => getDefaultCreatedBy,
  getOPFSFileSize: () => getOPFSFileSize,
  isHiddenFile: () => isHiddenFile,
  parseStreamURL: () => parseStreamURL,
  parseTorrent: () => parseTorrent,
  sha1sum: () => sha1sum,
  streamManager: () => streamManager,
  walkOPFSDir: () => walkOPFSDir
});
var CORE_VERSION, _WEBRTC_SUPPORT, Client;
var init_mod2 = __esm({
  "packages/core/src/mod.ts"() {
    init_event_target();
    init_parse_torrent();
    init_torrent();
    init_swarm();
    init_peerid();
    init_opfs_chunk_store();
    init_memory_chunk_store();
    init_bencode();
    init_server();
    init_file();
    init_mod();
    init_torrent();
    init_swarm();
    init_peer();
    init_wire();
    init_file();
    init_piece();
    init_parse_torrent();
    init_peerid();
    init_ut_metadata();
    init_ut_pex();
    init_server();
    init_stream_manager();
    init_mod();
    CORE_VERSION = "0.0.0-placeholder";
    _WEBRTC_SUPPORT = (() => {
      if (typeof globalThis === "undefined") return false;
      return typeof globalThis.RTCPeerConnection !== "undefined" || typeof globalThis.webkitRTCPeerConnection !== "undefined";
    })();
    Client = class extends TypedEventTarget {
      static {
        __name(this, "Client");
      }
      /** `true` if the runtime supports WebRTC (RTCPeerConnection). */
      static WEBRTC_SUPPORT = _WEBRTC_SUPPORT;
      peerId;
      peerIdBuffer;
      torrents = /* @__PURE__ */ new Map();
      torrentList = [];
      server = null;
      swarms = /* @__PURE__ */ new Map();
      opts;
      destroyed = false;
      ready = false;
      /** Global download throttle in bytes/s (0 = unlimited). */
      _downloadLimit = 0;
      /** Global upload throttle in bytes/s (0 = unlimited). */
      _uploadLimit = 0;
      constructor(opts = {}) {
        super();
        this.opts = opts;
        this._downloadLimit = Math.max(0, opts.downloadLimit ?? 0);
        this._uploadLimit = Math.max(0, opts.uploadLimit ?? 0);
        let peerIdBuffer;
        if (opts.peerId) {
          if (typeof opts.peerId === "string") {
            peerIdBuffer = new Uint8Array(20);
            for (let i3 = 0; i3 < 20; i3++) {
              peerIdBuffer[i3] = parseInt(opts.peerId.substring(i3 * 2, i3 * 2 + 2), 16);
            }
          } else {
            peerIdBuffer = opts.peerId;
          }
        } else {
          peerIdBuffer = generateBrowserTorrentPeerId();
        }
        this.peerIdBuffer = peerIdBuffer;
        this.peerId = Array.from(peerIdBuffer).map((b3) => b3.toString(16).padStart(2, "0")).join("");
        queueMicrotask(() => {
          this.ready = true;
          this.emit("ready");
        });
      }
      // ── Aggregate getters ──────────────────────────────────────────────
      get isReady() {
        return this.ready && !this.destroyed;
      }
      get isDestroyed() {
        return this.destroyed;
      }
      get torrentCount() {
        return this.torrents.size;
      }
      /** Aggregate download speed across all torrents (bytes/s). */
      get downloadSpeed() {
        let total = 0;
        for (const t of this.torrents.values()) {
          total += t.downloadSpeed;
        }
        return total;
      }
      /** Aggregate upload speed across all torrents (bytes/s). */
      get uploadSpeed() {
        let total = 0;
        for (const t of this.torrents.values()) {
          total += t.uploadSpeed;
        }
        return total;
      }
      /** Aggregate progress (0..1) weighted by torrent length. */
      get progress() {
        let totalLen = 0;
        let totalDownloaded = 0;
        for (const t of this.torrents.values()) {
          totalLen += t.length;
          totalDownloaded += t.downloaded;
        }
        if (totalLen === 0) return 0;
        return totalDownloaded / totalLen;
      }
      /** Aggregate ratio: total uploaded / total downloaded. */
      get ratio() {
        let totalDown = 0;
        let totalUp = 0;
        for (const t of this.torrents.values()) {
          totalDown += t.downloaded;
          totalUp += t.uploaded;
        }
        if (totalDown === 0) return totalUp > 0 ? Infinity : 0;
        return totalUp / totalDown;
      }
      /** Currently configured download limit (bytes/s). */
      get downloadLimit() {
        return this._downloadLimit;
      }
      /** Currently configured upload limit (bytes/s). */
      get uploadLimit() {
        return this._uploadLimit;
      }
      // ── Throttle ───────────────────────────────────────────────────────
      /**
       * Set the global download rate limit.
       * @param rate bytes/s; `0` removes the limit.
       */
      throttleDownload(rate) {
        this._downloadLimit = Math.max(0, rate);
        for (const swarm of this.swarms.values()) {
          swarm.throttleDownload(this._downloadLimit);
        }
      }
      /**
       * Set the global upload rate limit.
       * @param rate bytes/s; `0` removes the limit.
       */
      throttleUpload(rate) {
        this._uploadLimit = Math.max(0, rate);
        for (const swarm of this.swarms.values()) {
          swarm.throttleUpload(this._uploadLimit);
        }
      }
      /**
       * Get a torrent by `infoHash` (hex), magnet URI, or `.torrent` file buffer.
       * Returns `null` if not found.
       */
      async get(torrentId) {
        if (this.destroyed) return null;
        try {
          const parsed = await parseTorrent(torrentId);
          return this.torrents.get(parsed.infoHash) ?? null;
        } catch {
          return null;
        }
      }
      // ── Service Worker integration ─────────────────────────────────────
      createServer(opts = {}) {
        if (this.server) return this.server;
        const scope = opts.scope || this.opts.serviceWorkerScope || "/";
        this.server = createServer({
          controller: opts.controller,
          scope
        });
        for (const torrent of this.torrents.values()) {
          const files = this._makeFileObjects(torrent, scope);
          console.log("[mod] createServer init: registering", files.length, "files for", torrent.infoHash);
          registerTorrentFiles(torrent, files);
          torrent._registerFiles?.(files);
        }
        this.on("torrent", (e3) => {
          const torrent = e3.detail.torrent;
          const files = this._makeFileObjects(torrent, scope);
          console.log("[mod] torrent event: registering", files.length, "files for", torrent.infoHash);
          registerTorrentFiles(torrent, files);
          torrent._registerFiles?.(files);
        });
        return this.server;
      }
      _makeFileObjects(torrent, scope) {
        return torrent.files.map((pf, idx) => new File({
          store: torrent.store,
          length: pf.length,
          offset: pf.offset,
          pieceLength: torrent.pieceLength,
          name: pf.name,
          infoHash: torrent.infoHash,
          fileIndex: idx,
          scope,
          torrent
        }));
      }
      async initServiceWorker() {
        if (typeof navigator === "undefined" || !navigator.serviceWorker) {
          return null;
        }
        if (!this.opts.serviceWorkerUrl) {
          return null;
        }
        const reg = await navigator.serviceWorker.register(this.opts.serviceWorkerUrl, {
          scope: this.opts.serviceWorkerScope || "/"
        });
        await navigator.serviceWorker.ready;
        this.createServer({
          controller: reg.active ?? void 0
        });
        return reg.active;
      }
      // ── add / remove / destroy ─────────────────────────────────────────
      async add(torrentId, opts = {}) {
        if (this.destroyed) throw new Error("Client is destroyed");
        const parsed = await parseTorrent(torrentId);
        if (this.torrents.has(parsed.infoHash)) {
          return this.torrents.get(parsed.infoHash);
        }
        const store = await this._createChunkStore(parsed);
        const announceList = [];
        if (parsed.announce) {
          announceList.push(...parsed.announce);
        }
        if (opts.announce) {
          announceList.push(...opts.announce);
        }
        const swarm = new Swarm({
          infoHash: parsed.infoHashBuffer,
          peerId: this.peerIdBuffer,
          announce: announceList,
          maxConns: this.opts.maxConns,
          port: this.opts.port,
          rtcConfig: this.opts.rtcConfig,
          metadata: parsed.infoBytes ?? (parsed.pieces.length > 0 ? encode(parsed.info) : void 0)
        });
        const torrent = new Torrent(parsed, {
          store,
          skipVerify: opts.skipVerify,
          swarm
        });
        swarm.torrent = torrent;
        swarm.on("metadata", async (e3) => {
          const metadataBuffer = e3.detail?.metadata || e3.metadata || e3;
          console.log("[Client] swarm metadata event fired, size:", metadataBuffer?.length);
          if (metadataBuffer instanceof Uint8Array) {
            await torrent.setMetadata(metadataBuffer);
          }
        });
        swarm.on("error", (e3) => {
          this.emit("error", new CustomEvent("error", {
            detail: {
              error: e3.detail.error
            }
          }));
        });
        swarm.on("noPeers", (e3) => {
          torrent.emit("noPeers", new CustomEvent("noPeers", {
            detail: e3.detail
          }));
        });
        if (this._downloadLimit > 0) swarm.throttleDownload(this._downloadLimit);
        if (this._uploadLimit > 0) swarm.throttleUpload(this._uploadLimit);
        swarm.start();
        this.torrents.set(parsed.infoHash, torrent);
        this.swarms.set(parsed.infoHash, swarm);
        this.torrentList.push(torrent);
        this.emit("add", new CustomEvent("add", {
          detail: {
            torrent
          }
        }));
        if (this.server) {
          const files = this._makeFileObjects(torrent, this.server.scope);
          registerTorrentFiles(torrent, files);
          torrent._registerFiles?.(files);
        } else {
          const files = this._makeFileObjects(torrent, "/");
          torrent._registerFiles?.(files);
        }
        this.emit("torrent", new CustomEvent("torrent", {
          detail: {
            torrent
          }
        }));
        if (opts.onReady) {
          torrent.on("ready", () => opts.onReady(torrent));
        }
        if (opts.onDone) {
          torrent.on("done", () => opts.onDone(torrent));
        }
        return torrent;
      }
      /**
       * Seed a file or directory as a new torrent.
       *
       * Internally:
       * 1. Builds an OPFS-backed generator entry.
       * 2. Calls `generateTorrent()` to produce a `.torrent` buffer.
       * 3. Calls {@link WebTorrent.add} on that buffer.
       *
       * @returns the {@link Torrent} once it's been added and announced.
       */
      async seed(input, opts = {}, cb) {
        if (this.destroyed) throw new Error("Client is destroyed");
        const { entry, name, length } = await this._prepareSeedInput(input, opts.name);
        const chunks = [];
        let totalLen = 0;
        const writer = {
          write: /* @__PURE__ */ __name((p4) => {
            chunks.push(p4);
            totalLen += p4.length;
            return Promise.resolve(p4.length);
          }, "write")
        };
        await generateTorrent({
          entry,
          writer,
          pieceSize: opts.pieceSize ?? PieceSizeEnum.SIZE_AUTO,
          trackers: opts.trackers ?? opts.announce ?? [],
          webSeeds: opts.webSeeds ?? [],
          comment: opts.comment,
          createdBy: opts.createdBy,
          isPrivate: opts.private,
          alignPiece: opts.alignPiece,
          ignoreHiddenFile: opts.ignoreHiddenFile
        });
        const torrentBytes = new Uint8Array(totalLen);
        let off = 0;
        for (const c3 of chunks) {
          torrentBytes.set(c3, off);
          off += c3.length;
        }
        const torrent = await this.add(torrentBytes, {
          skipVerify: opts.skipVerify ?? true,
          onReady: opts.onReady,
          onDone: opts.onDone
        });
        if (name && (!torrent.name || torrent.name === "Unknown")) {
          torrent.name = name;
        }
        if (length && torrent.length === 0) {
          torrent.length = length;
        }
        const store = torrent.store;
        console.log("[seed] store available:", !!store, "put?", typeof store.put, "entry?", !!entry, "pieceLength:", torrent.pieceLength);
        if (store && typeof store.put === "function" && entry) {
          console.log("[seed] Populating chunk store with", Array.isArray(entry) ? entry.length + " files" : "directory");
          await this._populateChunkStoreFromOPFSEntry(entry, store, torrent.pieceLength);
          await torrent.rescanFiles();
          console.log("[seed] Chunk store populated and verified successfully");
        } else {
          console.log("[seed] Skipping chunk store population: store=" + !!store, "put=" + typeof store.put, "entry=" + !!entry);
        }
        if (cb) cb(torrent);
        return torrent;
      }
      /**
       * Populates an OPFSChunkStore by reading from OPFS file entries.
       * This is needed because the seed writes files as a single OPFS file,
       * but OPFSChunkStore expects pieces as separate N.chunk files.
       */
      async _populateChunkStoreFromOPFSEntry(entry, store, pieceLength) {
        let files;
        if (Array.isArray(entry)) {
          files = entry;
        } else {
          const { walkOPFSDir: walkOPFSDir2 } = await Promise.resolve().then(() => (init_mod(), mod_exports));
          files = await walkOPFSDir2(entry, false);
        }
        console.log("[_populateChunkStore] Starting with", files.length, "files, pieceLength:", pieceLength);
        const PIECE_SIZE = pieceLength || 16384;
        let pieceIndex = 0;
        let pieceBuffer = new Uint8Array(PIECE_SIZE);
        let pieceOffset = 0;
        let totalWritten = 0;
        for (const fileEntry of files) {
          if (!fileEntry.handle) {
            console.warn("[_populateChunkStore] Skipping file without handle:", fileEntry.name);
            continue;
          }
          const file = await fileEntry.handle.getFile();
          console.log("[_populateChunkStore] Reading file:", fileEntry.name, "size:", file.size);
          let fileOffset = 0;
          while (fileOffset < file.size) {
            const want = Math.min(PIECE_SIZE - pieceOffset, file.size - fileOffset);
            const blob = file.slice(fileOffset, fileOffset + want);
            const buf = new Uint8Array(await blob.arrayBuffer());
            pieceBuffer.set(buf, pieceOffset);
            pieceOffset += buf.byteLength;
            fileOffset += buf.byteLength;
            if (pieceOffset === PIECE_SIZE) {
              await store.put(pieceIndex, pieceBuffer);
              totalWritten += pieceBuffer.length;
              pieceIndex++;
              pieceBuffer = new Uint8Array(PIECE_SIZE);
              pieceOffset = 0;
            }
          }
        }
        if (pieceOffset > 0) {
          const partial = pieceBuffer.slice(0, pieceOffset);
          await store.put(pieceIndex, partial);
          totalWritten += partial.length;
          console.log("[_populateChunkStore] Wrote final piece", pieceIndex, "size:", pieceOffset);
        }
        console.log("[_populateChunkStore] Done. Total pieces:", pieceIndex + (pieceOffset > 0 ? 1 : 0), "bytes written:", totalWritten);
      }
      /**
       * Normaliza o `SeedInput` para uma entrada que o generator aceita.
       *
       * - FileSystemDirectoryHandle → passa direto.
       * - Array de handles/files      → escreve no OPFS num diretório temporário.
       * - File/Blob/Uint8Array único → escreve no OPFS num diretório temporário.
       * - Plain object                → mesma estratégia.
       */
      async _prepareSeedInput(input, displayName) {
        if (input === null || input === void 0 || input !== null && typeof input !== "object" && typeof input !== "string") {
          throw new TypeError("Unsupported seed input");
        }
        if (input instanceof FileSystemDirectoryHandle) {
          return {
            entry: input,
            name: displayName
          };
        }
        if (Array.isArray(input)) {
          const rootDir2 = await this._createTempOPFSDir();
          const entries = [];
          for (const item of input) {
            const { name: iname2, size: size2, data: data2 } = await this._materializeInput(item);
            const fileHandle2 = await rootDir2.getFileHandle(iname2, {
              create: true
            });
            const writable2 = await fileHandle2.createWritable();
            await writable2.write(new Uint8Array(data2));
            await writable2.close();
            entries.push({
              name: iname2,
              size: size2,
              handle: fileHandle2
            });
          }
          return {
            entry: rootDir2,
            name: displayName
          };
        }
        const { name: iname, size, data } = await this._materializeInput(input);
        const rootDir = await this._createTempOPFSDir();
        const fileHandle = await rootDir.getFileHandle(iname, {
          create: true
        });
        const writable = await fileHandle.createWritable();
        await writable.write(new Uint8Array(data));
        await writable.close();
        return {
          entry: [
            {
              name: iname,
              size,
              handle: fileHandle
            }
          ],
          name: displayName ?? iname,
          length: size
        };
      }
      /** Converte um input em `{ name, size, data: Uint8Array }`. */
      async _materializeInput(item) {
        let data;
        let name;
        if (item instanceof FileSystemFileHandle) {
          const file = await item.getFile();
          data = new Uint8Array(await file.arrayBuffer());
          name = item.name;
        } else if (item instanceof File || typeof Blob !== "undefined" && item instanceof Blob) {
          data = new Uint8Array(await item.arrayBuffer());
          name = item.name ?? "file";
        } else if (item instanceof Uint8Array) {
          data = item.buffer instanceof ArrayBuffer && !(typeof SharedArrayBuffer !== "undefined" && item.buffer instanceof SharedArrayBuffer) ? item : new Uint8Array(item);
          name = "file";
        } else if (item && typeof item === "object" && "data" in item && "name" in item) {
          name = String(item.name);
          data = item.data instanceof Uint8Array ? item.data.buffer instanceof ArrayBuffer && !(typeof SharedArrayBuffer !== "undefined" && item.data.buffer instanceof SharedArrayBuffer) ? item.data : new Uint8Array(item.data) : new Uint8Array(item.data);
        } else {
          throw new TypeError("Unsupported seed input");
        }
        const size = data.length;
        return {
          name,
          size,
          data
        };
      }
      /** Cria (ou reusa) um diretório temporário dentro do OPFS para seeding. */
      async _createTempOPFSDir() {
        if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
          throw new Error("OPFS not available: cannot seed from this environment");
        }
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle("browsertorrent-seed", {
          create: true
        });
      }
      async remove(infoHash, destroyStore = false) {
        const torrent = this.torrents.get(infoHash);
        const swarm = this.swarms.get(infoHash);
        if (!torrent) return;
        if (swarm) {
          swarm.destroy();
          this.swarms.delete(infoHash);
        }
        await torrent.destroy(destroyStore);
        this.torrents.delete(infoHash);
        const index = this.torrentList.indexOf(torrent);
        if (index !== -1) {
          this.torrentList.splice(index, 1);
        }
        this.emit("remove", new CustomEvent("remove", {
          detail: {
            torrent,
            infoHash
          }
        }));
        if (this.server) {
          unregisterTorrentFiles(infoHash);
        }
      }
      async destroy(callback) {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const [, swarm] of this.swarms) {
          swarm.destroy();
        }
        this.swarms.clear();
        for (const [, torrent] of this.torrents) {
          await torrent.destroy(false);
        }
        this.torrents.clear();
        this.torrentList.length = 0;
        if (this.server) {
          this.server.destroy();
          this.server = null;
        }
        if (callback) callback();
      }
      async _createChunkStore(parsed) {
        const useOPFS = this.opts.useOPFS !== false;
        if (useOPFS && globalThis.navigator?.storage?.getDirectory) {
          try {
            const rootDir = await globalThis.navigator.storage.getDirectory();
            const torrentDir = await rootDir.getDirectoryHandle(`webtorrent-${parsed.infoHash}`, {
              create: true
            });
            return new OPFSChunkStore({
              chunkLength: parsed.pieceLength || 16384,
              length: parsed.length || 0,
              rootDir: torrentDir
            });
          } catch (err) {
            console.warn("[WebTorrent] OPFS not available, falling back to memory store:", err);
          }
        }
        return new MemoryChunkStore({
          chunkLength: parsed.pieceLength || 16384,
          length: parsed.length || 0
        });
      }
    };
  }
});

// https:https://esm.sh/preact@10.29.7/denonext/preact.mjs
var D;
var h;
var ee;
var fe;
var x;
var X;
var _e;
var te;
var B;
var L;
var M;
var ne;
var q;
var O;
var V;
var re;
var H = {};
var I = [];
var ae = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
var W = Array.isArray;
function w(_2, e3) {
  for (var t in e3) _2[t] = e3[t];
  return _2;
}
__name(w, "w");
function G(_2) {
  _2 && _2.parentNode && _2.parentNode.removeChild(_2);
}
__name(G, "G");
function he(_2, e3, t) {
  var o3, l3, n, i3 = {};
  for (n in e3) n == "key" ? o3 = e3[n] : n == "ref" ? l3 = e3[n] : i3[n] = e3[n];
  if (arguments.length > 2 && (i3.children = arguments.length > 3 ? D.call(arguments, 2) : t), typeof _2 == "function" && _2.defaultProps != null) for (n in _2.defaultProps) i3[n] === void 0 && (i3[n] = _2.defaultProps[n]);
  return E(_2, i3, o3, l3, null);
}
__name(he, "he");
function E(_2, e3, t, o3, l3) {
  var n = { type: _2, props: e3, key: t, ref: o3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: l3 ?? ++ee, __i: -1, __u: 0 };
  return l3 == null && h.vnode != null && h.vnode(n), n;
}
__name(E, "E");
function $(_2) {
  return _2.children;
}
__name($, "$");
function N(_2, e3) {
  this.props = _2, this.context = e3;
}
__name(N, "N");
function S(_2, e3) {
  if (e3 == null) return _2.__ ? S(_2.__, _2.__i + 1) : null;
  for (var t; e3 < _2.__k.length; e3++) if ((t = _2.__k[e3]) != null && t.__e != null) return t.__e;
  return typeof _2.type == "function" ? S(_2) : null;
}
__name(S, "S");
function de(_2) {
  if (_2.__P && _2.__d) {
    var e3 = _2.__v, t = e3.__e, o3 = [], l3 = [], n = w({}, e3);
    n.__v = e3.__v + 1, h.vnode && h.vnode(n), J(_2.__P, n, e3, _2.__n, _2.__P.namespaceURI, 32 & e3.__u ? [t] : null, o3, t ?? S(e3), !!(32 & e3.__u), l3), n.__v = e3.__v, n.__.__k[n.__i] = n, ue(o3, n, l3), e3.__e = e3.__ = null, n.__e != t && oe(n);
  }
}
__name(de, "de");
function oe(_2) {
  if ((_2 = _2.__) != null && _2.__c != null) return _2.__e = _2.__c.base = null, _2.__k.some(function(e3) {
    if (e3 != null && e3.__e != null) return _2.__e = _2.__c.base = e3.__e;
  }), oe(_2);
}
__name(oe, "oe");
function z(_2) {
  (!_2.__d && (_2.__d = true) && x.push(_2) && !R.__r++ || X != h.debounceRendering) && ((X = h.debounceRendering) || _e)(R);
}
__name(z, "z");
function R() {
  try {
    for (var _2, e3 = 1; x.length; ) x.length > e3 && x.sort(te), _2 = x.shift(), e3 = x.length, de(_2);
  } finally {
    x.length = R.__r = 0;
  }
}
__name(R, "R");
function le(_2, e3, t, o3, l3, n, i3, u4, a3, s4, p4) {
  var y4, r, c3, d5, k6, m3, v4, f3 = o3 && o3.__k || I, g3 = e3.length;
  for (a3 = ve(t, e3, f3, a3, g3), y4 = 0; y4 < g3; y4++) (c3 = t.__k[y4]) != null && (r = c3.__i != -1 && f3[c3.__i] || H, c3.__i = y4, m3 = J(_2, c3, r, l3, n, i3, u4, a3, s4, p4), d5 = c3.__e, c3.ref && r.ref != c3.ref && (r.ref && K(r.ref, null, c3), p4.push(c3.ref, c3.__c || d5, c3)), k6 == null && d5 != null && (k6 = d5), (v4 = !!(4 & c3.__u)) || r.__k === c3.__k ? (a3 = ie(c3, a3, _2, v4), v4 && r.__e && (r.__e = null)) : typeof c3.type == "function" && m3 !== void 0 ? a3 = m3 : d5 && (a3 = d5.nextSibling), c3.__u &= -7);
  return t.__e = k6, a3;
}
__name(le, "le");
function ve(_2, e3, t, o3, l3) {
  var n, i3, u4, a3, s4, p4 = t.length, y4 = p4, r = 0;
  for (_2.__k = new Array(l3), n = 0; n < l3; n++) (i3 = e3[n]) != null && typeof i3 != "boolean" && typeof i3 != "function" ? (typeof i3 == "string" || typeof i3 == "number" || typeof i3 == "bigint" || i3.constructor == String ? i3 = _2.__k[n] = E(null, i3, null, null, null) : W(i3) ? i3 = _2.__k[n] = E($, { children: i3 }, null, null, null) : i3.constructor === void 0 && i3.__b > 0 ? i3 = _2.__k[n] = E(i3.type, i3.props, i3.key, i3.ref ? i3.ref : null, i3.__v) : _2.__k[n] = i3, a3 = n + r, i3.__ = _2, i3.__b = _2.__b + 1, u4 = null, (s4 = i3.__i = me(i3, t, a3, y4)) != -1 && (y4--, (u4 = t[s4]) && (u4.__u |= 2)), u4 == null || u4.__v == null ? (s4 == -1 && (l3 > p4 ? r-- : l3 < p4 && r++), typeof i3.type != "function" && (i3.__u |= 4)) : s4 != a3 && (s4 == a3 - 1 ? r-- : s4 == a3 + 1 ? r++ : (s4 > a3 ? r-- : r++, i3.__u |= 4))) : _2.__k[n] = null;
  if (y4) for (n = 0; n < p4; n++) (u4 = t[n]) != null && (2 & u4.__u) == 0 && (u4.__e == o3 && (o3 = S(u4)), pe(u4, u4));
  return o3;
}
__name(ve, "ve");
function ie(_2, e3, t, o3) {
  var l3, n;
  if (typeof _2.type == "function") {
    for (l3 = _2.__k, n = 0; l3 && n < l3.length; n++) l3[n] && (l3[n].__ = _2, e3 = ie(l3[n], e3, t, o3));
    return e3;
  }
  _2.__e != e3 && (o3 && (e3 && _2.type && !e3.parentNode && (e3 = S(_2)), t.insertBefore(_2.__e, e3 || null)), e3 = _2.__e);
  do
    e3 = e3 && e3.nextSibling;
  while (e3 != null && e3.nodeType == 8);
  return e3;
}
__name(ie, "ie");
function me(_2, e3, t, o3) {
  var l3, n, i3, u4 = _2.key, a3 = _2.type, s4 = e3[t], p4 = s4 != null && (2 & s4.__u) == 0;
  if (s4 === null && u4 == null || p4 && u4 == s4.key && a3 == s4.type) return t;
  if (o3 > (p4 ? 1 : 0)) {
    for (l3 = t - 1, n = t + 1; l3 >= 0 || n < e3.length; ) if ((s4 = e3[i3 = l3 >= 0 ? l3-- : n++]) != null && (2 & s4.__u) == 0 && u4 == s4.key && a3 == s4.type) return i3;
  }
  return -1;
}
__name(me, "me");
function Y(_2, e3, t) {
  e3[0] == "-" ? _2.setProperty(e3, t ?? "") : _2[e3] = t == null ? "" : typeof t != "number" || ae.test(e3) ? t : t + "px";
}
__name(Y, "Y");
function F(_2, e3, t, o3, l3) {
  var n, i3;
  e: if (e3 == "style") if (typeof t == "string") _2.style.cssText = t;
  else {
    if (typeof o3 == "string" && (_2.style.cssText = o3 = ""), o3) for (e3 in o3) t && e3 in t || Y(_2.style, e3, "");
    if (t) for (e3 in t) o3 && t[e3] == o3[e3] || Y(_2.style, e3, t[e3]);
  }
  else if (e3[0] == "o" && e3[1] == "n") n = e3 != (e3 = e3.replace(ne, "$1")), i3 = e3.toLowerCase(), e3 = i3 in _2 || e3 == "onFocusOut" || e3 == "onFocusIn" ? i3.slice(2) : e3.slice(2), _2.l || (_2.l = {}), _2.l[e3 + n] = t, t ? o3 ? t[M] = o3[M] : (t[M] = q, _2.addEventListener(e3, n ? V : O, n)) : _2.removeEventListener(e3, n ? V : O, n);
  else {
    if (l3 == "http://www.w3.org/2000/svg") e3 = e3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
    else if (e3 != "width" && e3 != "height" && e3 != "href" && e3 != "list" && e3 != "form" && e3 != "tabIndex" && e3 != "download" && e3 != "rowSpan" && e3 != "colSpan" && e3 != "role" && e3 != "popover" && e3 in _2) try {
      _2[e3] = t ?? "";
      break e;
    } catch {
    }
    typeof t == "function" || (t == null || t === false && e3[4] != "-" ? _2.removeAttribute(e3) : _2.setAttribute(e3, e3 == "popover" && t == 1 ? "" : t));
  }
}
__name(F, "F");
function Z(_2) {
  return function(e3) {
    if (this.l) {
      var t = this.l[e3.type + _2];
      if (e3[L] == null) e3[L] = q++;
      else if (e3[L] < t[M]) return;
      return t(h.event ? h.event(e3) : e3);
    }
  };
}
__name(Z, "Z");
function J(_2, e3, t, o3, l3, n, i3, u4, a3, s4) {
  var p4, y4, r, c3, d5, k6, m3, v4, f3, g3, U2, C3, T2, Q2, A3, j3, b3 = e3.type;
  if (e3.constructor !== void 0) return null;
  128 & t.__u && (a3 = !!(32 & t.__u), n = [u4 = e3.__e = t.__e]), (p4 = h.__b) && p4(e3);
  e: if (typeof b3 == "function") {
    y4 = i3.length;
    try {
      if (f3 = e3.props, g3 = b3.prototype && b3.prototype.render, U2 = (p4 = b3.contextType) && o3[p4.__c], C3 = p4 ? U2 ? U2.props.value : p4.__ : o3, t.__c ? v4 = (r = e3.__c = t.__c).__ = r.__E : (g3 ? e3.__c = r = new b3(f3, C3) : (e3.__c = r = new N(f3, C3), r.constructor = b3, r.render = ke), U2 && U2.sub(r), r.state || (r.state = {}), r.__n = o3, c3 = r.__d = true, r.__h = [], r._sb = []), g3 && r.__s == null && (r.__s = r.state), g3 && b3.getDerivedStateFromProps != null && (r.__s == r.state && (r.__s = w({}, r.__s)), w(r.__s, b3.getDerivedStateFromProps(f3, r.__s))), d5 = r.props, k6 = r.state, r.__v = e3, c3) g3 && b3.getDerivedStateFromProps == null && r.componentWillMount != null && r.componentWillMount(), g3 && r.componentDidMount != null && r.__h.push(r.componentDidMount);
      else {
        if (g3 && b3.getDerivedStateFromProps == null && f3 !== d5 && r.componentWillReceiveProps != null && r.componentWillReceiveProps(f3, C3), e3.__v == t.__v || !r.__e && r.shouldComponentUpdate != null && r.shouldComponentUpdate(f3, r.__s, C3) === false) {
          e3.__v != t.__v && (r.props = f3, r.state = r.__s, r.__d = false), e3.__e = t.__e, e3.__k = t.__k, e3.__k.some(function(P) {
            P && (P.__ = e3);
          }), I.push.apply(r.__h, r._sb), r._sb = [], r.__h.length && i3.push(r);
          break e;
        }
        r.componentWillUpdate != null && r.componentWillUpdate(f3, r.__s, C3), g3 && r.componentDidUpdate != null && r.__h.push(function() {
          r.componentDidUpdate(d5, k6, m3);
        });
      }
      if (r.context = C3, r.props = f3, r.__P = _2, r.__e = false, T2 = h.__r, Q2 = 0, g3) r.state = r.__s, r.__d = false, T2 && T2(e3), p4 = r.render(r.props, r.state, r.context), I.push.apply(r.__h, r._sb), r._sb = [];
      else do
        r.__d = false, T2 && T2(e3), p4 = r.render(r.props, r.state, r.context), r.state = r.__s;
      while (r.__d && ++Q2 < 25);
      r.state = r.__s, r.getChildContext != null && (o3 = w(w({}, o3), r.getChildContext())), g3 && !c3 && r.getSnapshotBeforeUpdate != null && (m3 = r.getSnapshotBeforeUpdate(d5, k6)), A3 = p4 != null && p4.type === $ && p4.key == null ? ce(p4.props.children) : p4, u4 = le(_2, W(A3) ? A3 : [A3], e3, t, o3, l3, n, i3, u4, a3, s4), r.base = e3.__e, e3.__u &= -161, r.__h.length && i3.push(r), v4 && (r.__E = r.__ = null);
    } catch (P) {
      if (i3.length = y4, e3.__v = null, a3 || n != null) {
        if (P.then) {
          for (e3.__u |= a3 ? 160 : 128; u4 && u4.nodeType == 8 && u4.nextSibling; ) u4 = u4.nextSibling;
          n != null && (n[n.indexOf(u4)] = null), e3.__e = u4;
        } else if (n != null) for (j3 = n.length; j3--; ) G(n[j3]);
      } else e3.__e = t.__e;
      e3.__k == null && (e3.__k = t.__k || []), P.then || se(e3), h.__e(P, e3, t);
    }
  } else n == null && e3.__v == t.__v ? (e3.__k = t.__k, e3.__e = t.__e) : u4 = e3.__e = ge(t.__e, e3, t, o3, l3, n, i3, a3, s4);
  return (p4 = h.diffed) && p4(e3), 128 & e3.__u ? void 0 : u4;
}
__name(J, "J");
function se(_2) {
  _2 && (_2.__c && (_2.__c.__e = true), _2.__k && _2.__k.some(se));
}
__name(se, "se");
function ue(_2, e3, t) {
  for (var o3 = 0; o3 < t.length; o3++) K(t[o3], t[++o3], t[++o3]);
  h.__c && h.__c(e3, _2), _2.some(function(l3) {
    try {
      _2 = l3.__h, l3.__h = [], _2.some(function(n) {
        n.call(l3);
      });
    } catch (n) {
      h.__e(n, l3.__v);
    }
  });
}
__name(ue, "ue");
function ce(_2) {
  return typeof _2 != "object" || _2 == null || _2.__b > 0 ? _2 : W(_2) ? _2.map(ce) : _2.constructor !== void 0 ? null : w({}, _2);
}
__name(ce, "ce");
function ge(_2, e3, t, o3, l3, n, i3, u4, a3) {
  var s4, p4, y4, r, c3, d5, k6, m3 = t.props || H, v4 = e3.props, f3 = e3.type;
  if (f3 == "svg" ? l3 = "http://www.w3.org/2000/svg" : f3 == "math" ? l3 = "http://www.w3.org/1998/Math/MathML" : l3 || (l3 = "http://www.w3.org/1999/xhtml"), n != null) {
    for (s4 = 0; s4 < n.length; s4++) if ((c3 = n[s4]) && "setAttribute" in c3 == !!f3 && (f3 ? c3.localName == f3 : c3.nodeType == 3)) {
      _2 = c3, n[s4] = null;
      break;
    }
  }
  if (_2 == null) {
    if (f3 == null) return document.createTextNode(v4);
    _2 = document.createElementNS(l3, f3, v4.is && v4), u4 && (h.__m && h.__m(e3, n), u4 = false), n = null;
  }
  if (f3 == null) m3 === v4 || u4 && _2.data == v4 || (_2.data = v4);
  else {
    if (n = f3 == "textarea" && v4.defaultValue != null ? null : n && D.call(_2.childNodes), !u4 && n != null) for (m3 = {}, s4 = 0; s4 < _2.attributes.length; s4++) m3[(c3 = _2.attributes[s4]).name] = c3.value;
    for (s4 in m3) c3 = m3[s4], s4 == "dangerouslySetInnerHTML" ? y4 = c3 : s4 == "children" || s4 in v4 || s4 == "value" && "defaultValue" in v4 || s4 == "checked" && "defaultChecked" in v4 || F(_2, s4, null, c3, l3);
    for (s4 in v4) c3 = v4[s4], s4 == "children" ? r = c3 : s4 == "dangerouslySetInnerHTML" ? p4 = c3 : s4 == "value" ? d5 = c3 : s4 == "checked" ? k6 = c3 : u4 && typeof c3 != "function" || m3[s4] === c3 || F(_2, s4, c3, m3[s4], l3);
    if (p4) u4 || y4 && (p4.__html == y4.__html || p4.__html == _2.innerHTML) || (_2.innerHTML = p4.__html), e3.__k = [];
    else if (y4 && (_2.innerHTML = ""), le(e3.type == "template" ? _2.content : _2, W(r) ? r : [r], e3, t, o3, f3 == "foreignObject" ? "http://www.w3.org/1999/xhtml" : l3, n, i3, n ? n[0] : t.__k && S(t, 0), u4, a3), n != null) for (s4 = n.length; s4--; ) G(n[s4]);
    u4 && f3 != "textarea" || (s4 = "value", f3 == "progress" && d5 == null ? _2.removeAttribute("value") : d5 != null && (d5 !== _2[s4] || f3 == "progress" && !d5 || f3 == "option" && d5 != m3[s4]) && F(_2, s4, d5, m3[s4], l3), s4 = "checked", k6 != null && k6 != _2[s4] && F(_2, s4, k6, m3[s4], l3));
  }
  return _2;
}
__name(ge, "ge");
function K(_2, e3, t) {
  try {
    if (typeof _2 == "function") {
      var o3 = typeof _2.__u == "function";
      o3 && _2.__u(), o3 && e3 == null || (_2.__u = _2(e3));
    } else _2.current = e3;
  } catch (l3) {
    h.__e(l3, t);
  }
}
__name(K, "K");
function pe(_2, e3, t) {
  var o3, l3;
  if (h.unmount && h.unmount(_2), (o3 = _2.ref) && (o3.current && o3.current != _2.__e || K(o3, null, e3)), (o3 = _2.__c) != null) {
    if (o3.componentWillUnmount) try {
      o3.componentWillUnmount();
    } catch (n) {
      h.__e(n, e3);
    }
    o3.base = o3.__P = o3.__n = null;
  }
  if (o3 = _2.__k) for (l3 = 0; l3 < o3.length; l3++) o3[l3] && pe(o3[l3], e3, t || typeof _2.type != "function");
  t || G(_2.__e), _2.__c = _2.__ = _2.__e = void 0;
}
__name(pe, "pe");
function ke(_2, e3, t) {
  return this.constructor(_2, t);
}
__name(ke, "ke");
function be(_2, e3, t) {
  var o3, l3, n, i3;
  e3 == document && (e3 = document.documentElement), h.__ && h.__(_2, e3), l3 = (o3 = typeof t == "function") ? null : t && t.__k || e3.__k, n = [], i3 = [], J(e3, _2 = (!o3 && t || e3).__k = he($, null, [_2]), l3 || H, H, e3.namespaceURI, !o3 && t ? [t] : l3 ? null : e3.firstChild ? D.call(e3.childNodes) : null, n, !o3 && t ? t : l3 ? l3.__e : e3.firstChild, o3, i3), ue(n, _2, i3), _2.props.children = null;
}
__name(be, "be");
function Pe(_2) {
  function e3(t) {
    var o3, l3;
    return this.getChildContext || (o3 = /* @__PURE__ */ new Set(), (l3 = {})[e3.__c] = this, this.getChildContext = function() {
      return l3;
    }, this.componentWillUnmount = function() {
      o3 = null;
    }, this.shouldComponentUpdate = function(n) {
      this.props.value != n.value && o3.forEach(function(i3) {
        i3.__e = true, z(i3);
      });
    }, this.sub = function(n) {
      o3.add(n);
      var i3 = n.componentWillUnmount;
      n.componentWillUnmount = function() {
        o3 && o3.delete(n), i3 && i3.call(n);
      };
    }), t.children;
  }
  __name(e3, "e");
  return e3.__c = "__cC" + re++, e3.__ = _2, e3.Provider = e3.__l = (e3.Consumer = function(t, o3) {
    return t.children(o3);
  }).contextType = e3, e3;
}
__name(Pe, "Pe");
D = I.slice, h = { __e: /* @__PURE__ */ __name(function(_2, e3, t, o3) {
  for (var l3, n, i3; e3 = e3.__; ) if ((l3 = e3.__c) && !l3.__) try {
    if ((n = l3.constructor) && n.getDerivedStateFromError != null && (l3.setState(n.getDerivedStateFromError(_2)), i3 = l3.__d), l3.componentDidCatch != null && (l3.componentDidCatch(_2, o3 || {}), i3 = l3.__d), i3) return l3.__E = l3;
  } catch (u4) {
    _2 = u4;
  }
  throw _2;
}, "__e") }, ee = 0, fe = /* @__PURE__ */ __name(function(_2) {
  return _2 != null && _2.constructor === void 0;
}, "fe"), N.prototype.setState = function(_2, e3) {
  var t;
  t = this.__s != null && this.__s != this.state ? this.__s : this.__s = w({}, this.state), typeof _2 == "function" && (_2 = _2(w({}, t), this.props)), _2 && w(t, _2), _2 != null && this.__v && (e3 && this._sb.push(e3), z(this));
}, N.prototype.forceUpdate = function(_2) {
  this.__v && (this.__e = true, _2 && this.__h.push(_2), z(this));
}, N.prototype.render = $, x = [], _e = typeof Promise == "function" ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, te = /* @__PURE__ */ __name(function(_2, e3) {
  return _2.__v.__b - e3.__v.__b;
}, "te"), R.__r = 0, B = Math.random().toString(8), L = "__d" + B, M = "__a" + B, ne = /(PointerCapture)$|Capture$/i, q = 0, O = Z(false), V = Z(true), re = 0;

// https:https://esm.sh/preact@10.29.7/denonext/jsx-runtime.mjs
var x2 = 0;
function d(t, e3, r, f3, n, s4) {
  e3 || (e3 = {});
  var i3, o3, a3 = e3;
  if ("ref" in a3) for (o3 in a3 = {}, e3) o3 == "ref" ? i3 = e3[o3] : a3[o3] = e3[o3];
  var l3 = { type: t, props: a3, key: r, ref: i3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --x2, __i: -1, __u: 0, __source: n, __self: s4 };
  if (typeof t == "function" && (i3 = t.defaultProps)) for (o3 in i3) a3[o3] === void 0 && (a3[o3] = i3[o3]);
  return h.vnode && h.vnode(l3), l3;
}
__name(d, "d");

// https:https://esm.sh/@preact/signals-core@1.14.4/denonext/signals-core.mjs
var j = /* @__PURE__ */ Symbol.for("preact-signals");
function S2() {
  if (c > 1) {
    c--;
    return;
  }
  let i3, t = false;
  for ((function() {
    let o3 = p;
    for (p = void 0; o3 !== void 0; ) {
      let n = o3.S;
      if (n.v === o3.v) for (let r = n.t; r !== void 0; r = r.x) r.i === o3.i && (r.i = n.i);
      o3 = o3.o;
    }
  })(); l !== void 0; ) {
    let o3 = l;
    for (l = void 0, a++; o3 !== void 0; ) {
      let n = o3.u;
      if (o3.u = void 0, o3.f &= -3, !(8 & o3.f) && m(o3)) try {
        o3.c();
      } catch (r) {
        t || (i3 = r, t = true);
      }
      o3 = n;
    }
  }
  if (a = 0, c--, t) throw i3;
}
__name(S2, "S");
var s;
var f;
var l;
function v(i3) {
  let t = s, o3 = f;
  s = void 0, f = void 0;
  try {
    return i3();
  } finally {
    s = t, f = o3;
  }
}
__name(v, "v");
var p;
var c = 0;
var a = 0;
var w2 = 0;
var y = 0;
function x3(i3) {
  if (s === void 0) return;
  let t = i3.n;
  if (t === void 0 || t.t !== s) return t = { i: 0, S: i3, p: s.s, n: void 0, t: s, e: void 0, x: void 0, r: t }, s.s !== void 0 && (s.s.n = t), s.s = t, i3.n = t, 32 & s.f && i3.S(t), t;
  if (t.i === -1) return t.i = 0, t.n !== void 0 && (t.n.p = t.p, t.p !== void 0 && (t.p.n = t.n), t.p = s.s, t.n = void 0, s.s.n = t, s.s = t), t;
}
__name(x3, "x");
function e(i3, t) {
  this.v = i3, this.i = 0, this.n = void 0, this.t = void 0, this.l = 0, this.W = t?.watched, this.Z = t?.unwatched, this.name = t?.name;
}
__name(e, "e");
e.prototype.brand = j;
e.prototype.h = function() {
  return true;
};
e.prototype.S = function(i3) {
  let t = this.t;
  t !== i3 && i3.e === void 0 && (i3.x = t, this.t = i3, t !== void 0 ? t.e = i3 : v(() => {
    var o3;
    (o3 = this.W) == null || o3.call(this);
  }));
};
e.prototype.U = function(i3) {
  if (this.t !== void 0) {
    let t = i3.e, o3 = i3.x;
    t !== void 0 && (t.x = o3, i3.e = void 0), o3 !== void 0 && (o3.e = t, i3.x = void 0), i3 === this.t && (this.t = o3, o3 === void 0 && v(() => {
      var n;
      (n = this.Z) == null || n.call(this);
    }));
  }
};
e.prototype.subscribe = function(i3) {
  return Z2(() => {
    let t = this.value;
    v(() => i3(t));
  }, { name: "sub" });
};
e.prototype.valueOf = function() {
  return this.value;
};
e.prototype.toString = function() {
  return this.value + "";
};
e.prototype.toJSON = function() {
  return this.value;
};
e.prototype.peek = function() {
  return v(() => this.value);
};
Object.defineProperty(e.prototype, "value", { get() {
  let i3 = x3(this);
  return i3 !== void 0 && (i3.i = this.i), this.v;
}, set(i3) {
  if (i3 !== this.v) {
    if (a > 100) throw new Error("Cycle detected");
    (function(t) {
      c !== 0 && a === 0 && t.l !== w2 && (t.l = w2, p = { S: t, v: t.v, i: t.i, o: p });
    })(this), this.v = i3, this.i++, y++, c++;
    try {
      for (let t = this.t; t !== void 0; t = t.x) t.t.N();
    } finally {
      S2();
    }
  }
} });
function J2(i3, t) {
  return new e(i3, t);
}
__name(J2, "J");
function m(i3) {
  for (let t = i3.s; t !== void 0; t = t.n) if (t.S.i !== t.i || !t.S.h() || t.S.i !== t.i) return true;
  return false;
}
__name(m, "m");
function g(i3) {
  for (let t = i3.s; t !== void 0; t = t.n) {
    let o3 = t.S.n;
    if (o3 !== void 0 && (t.r = o3), t.S.n = t, t.i = -1, t.n === void 0) {
      i3.s = t;
      break;
    }
  }
}
__name(g, "g");
function E2(i3) {
  let t, o3 = i3.s;
  for (; o3 !== void 0; ) {
    let n = o3.p;
    o3.i === -1 ? (o3.S.U(o3), n !== void 0 && (n.n = o3.n), o3.n !== void 0 && (o3.n.p = n)) : t = o3, o3.S.n = o3.r, o3.r !== void 0 && (o3.r = void 0), o3 = n;
  }
  i3.s = t;
}
__name(E2, "E");
function u(i3, t) {
  e.call(this, void 0, t), this.x = i3, this.s = void 0, this.g = y - 1, this.f = 4;
}
__name(u, "u");
u.prototype = new e();
u.prototype.h = function() {
  if (this.f &= -3, 1 & this.f) return false;
  if ((36 & this.f) == 32 || (this.f &= -5, this.g === y)) return true;
  if (this.g = y, this.f |= 1, this.i > 0 && !m(this)) return this.f &= -2, true;
  let i3 = s;
  try {
    g(this), s = this;
    let t = this.x();
    (16 & this.f || this.v !== t || this.i === 0) && (this.v = t, this.f &= -17, this.i++);
  } catch (t) {
    this.v = t, this.f |= 16, this.i++;
  }
  return s = i3, E2(this), this.f &= -2, true;
};
u.prototype.S = function(i3) {
  if (this.t === void 0) {
    this.f |= 36;
    for (let t = this.s; t !== void 0; t = t.n) t.S.S(t);
  }
  e.prototype.S.call(this, i3);
};
u.prototype.U = function(i3) {
  if (this.t !== void 0 && (e.prototype.U.call(this, i3), this.t === void 0)) {
    this.f &= -33;
    for (let t = this.s; t !== void 0; t = t.n) t.S.U(t);
  }
};
u.prototype.N = function() {
  if (!(2 & this.f)) {
    this.f |= 6;
    for (let i3 = this.t; i3 !== void 0; i3 = i3.x) i3.t.N();
  }
};
Object.defineProperty(u.prototype, "value", { get() {
  if (1 & this.f) throw new Error("Cycle detected");
  let i3 = x3(this);
  if (this.h(), i3 !== void 0 && (i3.i = this.i), 16 & this.f) throw this.v;
  return this.v;
} });
function M2(i3, t) {
  return new u(i3, t);
}
__name(M2, "M");
function O2(i3) {
  let t = i3.m;
  if (i3.m = void 0, typeof t == "function") {
    c++;
    let o3 = s;
    s = void 0;
    try {
      t();
    } catch (n) {
      throw i3.f &= -2, i3.f |= 8, b(i3), n;
    } finally {
      s = o3, S2();
    }
  }
}
__name(O2, "O");
function b(i3) {
  for (let t = i3.s; t !== void 0; t = t.n) t.S.U(t);
  i3.x = void 0, i3.s = void 0, O2(i3);
}
__name(b, "b");
function W2(i3) {
  if (s !== this) throw new Error("Out-of-order effect");
  E2(this), s = i3, this.f &= -2, 8 & this.f && b(this), S2();
}
__name(W2, "W");
function d2(i3, t) {
  this.x = i3, this.m = void 0, this.s = void 0, this.u = void 0, this.f = 32, this.name = t?.name, f && f.push(this);
}
__name(d2, "d");
d2.prototype.c = function() {
  let i3 = this.S();
  try {
    if (8 & this.f || this.x === void 0) return;
    let t = this.x();
    typeof t == "function" && (this.m = t);
  } finally {
    i3();
  }
};
d2.prototype.S = function() {
  if (1 & this.f) throw new Error("Cycle detected");
  this.f |= 1, this.f &= -9, O2(this), g(this), c++;
  let i3 = s;
  return s = this, W2.bind(this, i3);
};
d2.prototype.N = function() {
  2 & this.f || (this.f |= 2, this.u = l, l = this);
};
d2.prototype.d = function() {
  this.f |= 8, 1 & this.f || b(this);
};
d2.prototype.dispose = function() {
  this.d();
};
function Z2(i3, t) {
  let o3 = new d2(i3, t);
  try {
    o3.c();
  } catch (r) {
    throw o3.d(), r;
  }
  let n = o3.d.bind(o3);
  return n[Symbol.dispose] = n, n;
}
__name(Z2, "Z");

// https:https://esm.sh/preact@10.29.7/denonext/hooks.mjs
var i;
var e2;
var H2;
var C;
var v2 = 0;
var U = [];
var o = h;
var A = o.__b;
var D2 = o.__r;
var F2 = o.diffed;
var k = o.__c;
var q2 = o.unmount;
var x4 = o.__;
function s2(t, _2) {
  o.__h && o.__h(e2, t, v2 || _2), v2 = 0;
  var u4 = e2.__H || (e2.__H = { __: [], __h: [] });
  return t >= u4.__.length && u4.__.push({}), u4.__[t];
}
__name(s2, "s");
function z2(t, _2) {
  var u4 = s2(i++, 3);
  !o.__s && N2(u4.__H, _2) && (u4.__ = t, u4.u = _2, e2.__H.__h.push(u4));
}
__name(z2, "z");
function L2(t) {
  return v2 = 5, E3(function() {
    return { current: t };
  }, []);
}
__name(L2, "L");
function E3(t, _2) {
  var u4 = s2(i++, 7);
  return N2(u4.__H, _2) && (u4.__ = t(), u4.__H = _2, u4.__h = t), u4.__;
}
__name(E3, "E");
function W3() {
  for (var t; t = U.shift(); ) {
    var _2 = t.__H;
    if (t.__P && _2) try {
      _2.__h.some(p2), _2.__h.some(y2), _2.__h = [];
    } catch (u4) {
      _2.__h = [], o.__e(u4, t.__v);
    }
  }
}
__name(W3, "W");
o.__b = function(t) {
  e2 = null, A && A(t);
}, o.__ = function(t, _2) {
  t && _2.__k && _2.__k.__m && (t.__m = _2.__k.__m), x4 && x4(t, _2);
}, o.__r = function(t) {
  D2 && D2(t), i = 0;
  var _2 = (e2 = t.__c).__H;
  _2 && (H2 === e2 ? (_2.__h = [], e2.__h = [], _2.__.some(function(u4) {
    u4.__N && (u4.__ = u4.__N), u4.u = u4.__N = void 0;
  })) : (_2.__h.some(p2), _2.__h.some(y2), _2.__h = [], i = 0)), H2 = e2;
}, o.diffed = function(t) {
  F2 && F2(t);
  var _2 = t.__c;
  _2 && _2.__H && (_2.__H.__h.length && (U.push(_2) !== 1 && C === o.requestAnimationFrame || ((C = o.requestAnimationFrame) || j2)(W3)), _2.__H.__.some(function(u4) {
    u4.u && (u4.__H = u4.u, u4.u = void 0);
  })), H2 = e2 = null;
}, o.__c = function(t, _2) {
  _2.some(function(u4) {
    try {
      u4.__h.some(p2), u4.__h = u4.__h.filter(function(n) {
        return !n.__ || y2(n);
      });
    } catch (n) {
      _2.some(function(r) {
        r.__h && (r.__h = []);
      }), _2 = [], o.__e(n, u4.__v);
    }
  }), k && k(t, _2);
}, o.unmount = function(t) {
  q2 && q2(t);
  var _2, u4 = t.__c;
  u4 && u4.__H && (u4.__H.__.some(function(n) {
    try {
      p2(n);
    } catch (r) {
      _2 = r;
    }
  }), u4.__H = void 0, _2 && o.__e(_2, u4.__v));
};
var T = typeof requestAnimationFrame == "function";
function j2(t) {
  var _2, u4 = /* @__PURE__ */ __name(function() {
    clearTimeout(n), T && cancelAnimationFrame(_2), setTimeout(t);
  }, "u"), n = setTimeout(u4, 35);
  T && (_2 = requestAnimationFrame(u4));
}
__name(j2, "j");
function p2(t) {
  var _2 = e2, u4 = t.__c;
  typeof u4 == "function" && (t.__c = void 0, u4()), e2 = _2;
}
__name(p2, "p");
function y2(t) {
  var _2 = e2;
  t.__c = t.__(), e2 = _2;
}
__name(y2, "y");
function N2(t, _2) {
  return !t || t.length !== _2.length || _2.some(function(u4, n) {
    return u4 !== t[n];
  });
}
__name(N2, "N");

// https:https://esm.sh/@preact/signals@1.3.1/X-ZHByZWFjdEAxMC4yOS43/denonext/signals.mjs
function u2(i3, t) {
  h[i3] = t.bind(null, h[i3] || (() => {
  }));
}
__name(u2, "u");
var l2;
var a2;
function _(i3) {
  a2 && a2(), a2 = i3 && i3.S();
}
__name(_, "_");
function g2({ data: i3 }) {
  let t = k3(i3);
  t.value = i3;
  let n = E3(() => {
    let e3 = this.__v;
    for (; e3 = e3.__; ) if (e3.__c) {
      e3.__c.__$f |= 4;
      break;
    }
    return this.__$u.c = () => {
      var r;
      let o3 = this.__$u.S(), f3 = n.value;
      o3(), fe(f3) || ((r = this.base) == null ? void 0 : r.nodeType) !== 3 ? (this.__$f |= 1, this.setState({})) : this.base.data = f3;
    }, M2(() => {
      let r = t.value.value;
      return r === 0 ? 0 : r === true ? "" : r || "";
    });
  }, []);
  return n.value;
}
__name(g2, "g");
g2.displayName = "_st";
Object.defineProperties(e.prototype, { constructor: { configurable: true, value: void 0 }, type: { configurable: true, value: g2 }, props: { configurable: true, get() {
  return { data: this };
} }, __b: { configurable: true, value: 1 } });
u2("__b", (i3, t) => {
  if (typeof t.type == "string") {
    let n, e3 = t.props;
    for (let r in e3) {
      if (r === "children") continue;
      let o3 = e3[r];
      o3 instanceof e && (n || (t.__np = n = {}), n[r] = o3, e3[r] = o3.peek());
    }
  }
  i3(t);
});
u2("__r", (i3, t) => {
  _();
  let n, e3 = t.__c;
  e3 && (e3.__$f &= -2, n = e3.__$u, n === void 0 && (e3.__$u = n = (function(r) {
    let o3;
    return Z2(function() {
      o3 = this;
    }), o3.c = () => {
      e3.__$f |= 1, e3.setState({});
    }, o3;
  })())), l2 = e3, _(n), i3(t);
});
u2("__e", (i3, t, n, e3) => {
  _(), l2 = void 0, i3(t, n, e3);
});
u2("diffed", (i3, t) => {
  _(), l2 = void 0;
  let n;
  if (typeof t.type == "string" && (n = t.__e)) {
    let e3 = t.__np, r = t.props;
    if (e3) {
      let o3 = n.U;
      if (o3) for (let f3 in o3) {
        let s4 = o3[f3];
        s4 !== void 0 && !(f3 in e3) && (s4.d(), o3[f3] = void 0);
      }
      else o3 = {}, n.U = o3;
      for (let f3 in e3) {
        let s4 = o3[f3], d5 = e3[f3];
        s4 === void 0 ? (s4 = E4(n, f3, d5, r), o3[f3] = s4) : s4.o(d5, r);
      }
    }
  }
  i3(t);
});
function E4(i3, t, n, e3) {
  let r = t in i3 && i3.ownerSVGElement === void 0, o3 = J2(n);
  return { o: /* @__PURE__ */ __name((f3, s4) => {
    o3.value = f3, e3 = s4;
  }, "o"), d: Z2(() => {
    let f3 = o3.value.value;
    e3[t] !== f3 && (e3[t] = f3, r ? i3[t] = f3 : f3 ? i3.setAttribute(t, f3) : i3.removeAttribute(t));
  }) };
}
__name(E4, "E");
u2("unmount", (i3, t) => {
  if (typeof t.type == "string") {
    let n = t.__e;
    if (n) {
      let e3 = n.U;
      if (e3) {
        n.U = void 0;
        for (let r in e3) {
          let o3 = e3[r];
          o3 && o3.d();
        }
      }
    }
  } else {
    let n = t.__c;
    if (n) {
      let e3 = n.__$u;
      e3 && (n.__$u = void 0, e3.d());
    }
  }
  i3(t);
});
u2("__h", (i3, t, n, e3) => {
  (e3 < 3 || e3 === 9) && (t.__$f |= 2), i3(t, n, e3);
});
N.prototype.shouldComponentUpdate = function(i3, t) {
  let n = this.__$u;
  if (!(n && n.s !== void 0 || 4 & this.__$f) || 3 & this.__$f) return true;
  for (let e3 in t) return true;
  for (let e3 in i3) if (e3 !== "__source" && i3[e3] !== this.props[e3]) return true;
  for (let e3 in this.props) if (!(e3 in i3)) return true;
  return false;
};
function k3(i3) {
  return E3(() => J2(i3), []);
}
__name(k3, "k");

// packages/worker-db/src/utils/id.ts
function gerarId() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("").substring(0, 12);
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
__name(gerarId, "gerarId");
function gerarIdComPrefixo(prefix) {
  return `${prefix}${gerarId()}`;
}
__name(gerarIdComPrefixo, "gerarIdComPrefixo");
function formatDbItem(key, val, prefix = "") {
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    return val;
  }
  const keyStr = String(key);
  const _id = prefix && keyStr.startsWith(prefix) ? keyStr.slice(prefix.length) : keyStr;
  return {
    _id,
    ...val
  };
}
__name(formatDbItem, "formatDbItem");
function prepareForSave(key, val, prefix = "") {
  let rawId = val && typeof val === "object" ? val._id : void 0;
  if (rawId === "auto") {
    rawId = gerarId();
  }
  const processKey = key === "auto" ? gerarId() : key;
  let finalKey = processKey || "";
  if (rawId) {
    if (prefix && rawId.startsWith(prefix)) {
      finalKey = rawId;
    } else {
      finalKey = prefix ? `${prefix}${rawId}` : rawId;
    }
  } else if (processKey) {
    if (prefix && processKey.startsWith(prefix)) {
      finalKey = processKey;
    } else {
      finalKey = prefix ? `${prefix}${processKey}` : processKey;
    }
  }
  if (!finalKey) {
    throw new Error("Uma chave (key) ou um atributo '_id' no objeto deve ser fornecido.");
  }
  if (val && typeof val === "object" && !Array.isArray(val) && "_id" in val) {
    const { _id: _2, ...cleanVal } = val;
    return {
      key: finalKey,
      cleanVal
    };
  }
  return {
    key: finalKey,
    cleanVal: val
  };
}
__name(prepareForSave, "prepareForSave");

// packages/worker-db/src/ls.ts
function getAllPrefixedEntries(prefix = "") {
  const entries = [];
  for (let i3 = 0; i3 < localStorage.length; i3++) {
    const key = localStorage.key(i3);
    if (key && (!prefix || key.startsWith(prefix))) {
      const rawVal = localStorage.getItem(key);
      if (rawVal !== null) {
        try {
          entries.push([
            key,
            JSON.parse(rawVal)
          ]);
        } catch {
        }
      }
    }
  }
  return entries;
}
__name(getAllPrefixedEntries, "getAllPrefixedEntries");
function getFormattedItems(prefix = "") {
  const rawEntries = getAllPrefixedEntries(prefix);
  return rawEntries.map(([k6, v4]) => formatDbItem(k6, v4, prefix));
}
__name(getFormattedItems, "getFormattedItems");
function resolveKey(key, prefix = "") {
  return prefix && !key.startsWith(prefix) ? `${prefix}${key}` : key;
}
__name(resolveKey, "resolveKey");
function createScopedLs(prefix = "") {
  return {
    get: /* @__PURE__ */ __name((key) => {
      const fullKey = resolveKey(key, prefix);
      const raw = localStorage.getItem(fullKey);
      if (raw === null) return void 0;
      try {
        return formatDbItem(fullKey, JSON.parse(raw), prefix);
      } catch {
        return void 0;
      }
    }, "get"),
    set: /* @__PURE__ */ __name((keyOrVal, val) => {
      let key;
      let targetVal;
      if (typeof keyOrVal === "string") {
        key = keyOrVal;
        targetVal = val;
      } else {
        key = void 0;
        targetVal = keyOrVal;
      }
      const { key: finalKey, cleanVal } = prepareForSave(key, targetVal, prefix);
      localStorage.setItem(finalKey, JSON.stringify(cleanVal));
      return finalKey;
    }, "set"),
    patch: /* @__PURE__ */ __name((key, patchOrFn, context) => {
      const current = createScopedLs(prefix).get(key) || {};
      let updated;
      if (typeof patchOrFn === "function") {
        updated = patchOrFn(current, context);
      } else {
        updated = Object.assign({}, current, patchOrFn);
      }
      const { key: finalKey, cleanVal } = prepareForSave(key, updated, prefix);
      localStorage.setItem(finalKey, JSON.stringify(cleanVal));
      return formatDbItem(finalKey, cleanVal, prefix);
    }, "patch"),
    delete: /* @__PURE__ */ __name((key) => {
      localStorage.removeItem(resolveKey(key, prefix));
    }, "delete"),
    getMany: /* @__PURE__ */ __name((keys) => {
      const api = createScopedLs(prefix);
      return keys.map((k6) => api.get(k6));
    }, "getMany"),
    setMany: /* @__PURE__ */ __name((entries) => {
      const api = createScopedLs(prefix);
      entries.forEach(([k6, v4]) => api.set(k6, v4));
    }, "setMany"),
    deleteMany: /* @__PURE__ */ __name((keys) => {
      const api = createScopedLs(prefix);
      keys.forEach((k6) => api.delete(k6));
    }, "deleteMany"),
    keys: /* @__PURE__ */ __name(() => {
      const keysList = [];
      for (let i3 = 0; i3 < localStorage.length; i3++) {
        const k6 = localStorage.key(i3);
        if (k6 && (!prefix || k6.startsWith(prefix))) {
          keysList.push(k6);
        }
      }
      return keysList;
    }, "keys"),
    values: /* @__PURE__ */ __name(() => {
      return getFormattedItems(prefix);
    }, "values"),
    entries: /* @__PURE__ */ __name(() => {
      return getAllPrefixedEntries(prefix);
    }, "entries"),
    clear: /* @__PURE__ */ __name(() => {
      if (!prefix) {
        localStorage.clear();
        return;
      }
      const keysToRemove = createScopedLs(prefix).keys();
      keysToRemove.forEach((k6) => localStorage.removeItem(k6));
    }, "clear"),
    query: /* @__PURE__ */ __name((fn2, context) => {
      const items = getFormattedItems(prefix);
      return fn2(items, context);
    }, "query"),
    getSome: /* @__PURE__ */ __name((fn2, context) => {
      const items = getFormattedItems(prefix);
      const selected = fn2(items, context);
      if (!Array.isArray(selected)) {
        throw new Error("A fun\xE7\xE3o em getSome deve retornar um Array.");
      }
      return selected;
    }, "getSome"),
    delSome: /* @__PURE__ */ __name((fn2, context) => {
      const items = getFormattedItems(prefix);
      const selected = fn2(items, context);
      if (!Array.isArray(selected)) {
        throw new Error("A fun\xE7\xE3o em delSome deve retornar um Array.");
      }
      selected.forEach((item) => {
        if (!item || item._id === void 0) {
          throw new Error("Os itens retornados em delSome precisam conter a propriedade '_id'.");
        }
        const rawKey = prefix && !item._id.startsWith(prefix) ? `${prefix}${item._id}` : item._id;
        localStorage.removeItem(rawKey);
      });
    }, "delSome"),
    setSome: /* @__PURE__ */ __name((selectFn, updateFn, context) => {
      const items = getFormattedItems(prefix);
      const selected = selectFn(items, context);
      if (!Array.isArray(selected)) {
        throw new Error("A fun\xE7\xE3o de sele\xE7\xE3o em setSome deve retornar um Array.");
      }
      selected.forEach((item) => {
        if (!item || item._id === void 0) {
          throw new Error("Os itens selecionados em setSome precisam conter a propriedade '_id'.");
        }
        const updatedItem = updateFn(item, context);
        const { key: finalKey, cleanVal } = prepareForSave(void 0, updatedItem, prefix);
        localStorage.setItem(finalKey, JSON.stringify(cleanVal));
      });
    }, "setSome"),
    // --- MÉTODOS DE EXPORTAÇÃO / IMPORTAÇÃO ---
    exportLS: /* @__PURE__ */ __name(() => {
      const allEntries = getAllPrefixedEntries(prefix);
      return Object.fromEntries(allEntries);
    }, "exportLS"),
    importLS: /* @__PURE__ */ __name((data, clearFirst = false) => {
      const api = createScopedLs(prefix);
      if (clearFirst) api.clear();
      Object.entries(data).forEach(([k6, v4]) => api.set(k6, v4));
    }, "importLS"),
    backupToOpfs: /* @__PURE__ */ __name(async (recordKey, fileName = "backup.json") => {
      const data = Object.fromEntries(getAllPrefixedEntries(prefix));
      const blob = new Blob([
        JSON.stringify(data)
      ], {
        type: "application/json"
      });
      const drive = opfs("LS_SYS", "ls_store", prefix, "backup");
      await drive.addFile(recordKey, blob, fileName);
      return `${recordKey}/${fileName}`;
    }, "backupToOpfs"),
    restoreFromOpfs: /* @__PURE__ */ __name(async (recordKey, fileName, clearFirst = false) => {
      const drive = opfs("LS_SYS", "ls_store", prefix, "backup");
      const fileBlob = await drive.getFile(recordKey, fileName);
      const data = JSON.parse(await fileBlob.text());
      const api = createScopedLs(prefix);
      if (clearFirst) api.clear();
      Object.entries(data).forEach(([k6, v4]) => api.set(k6, v4));
    }, "restoreFromOpfs"),
    gerarId,
    gerarIdComPrefixo: /* @__PURE__ */ __name(() => prefix ? gerarIdComPrefixo(prefix) : gerarId(), "gerarIdComPrefixo")
  };
}
__name(createScopedLs, "createScopedLs");
var ls = Object.assign((prefix = "") => createScopedLs(prefix), createScopedLs());

// https:https://esm.sh/idb-keyval@6.2.1/denonext/idb-keyval.mjs
function u3(n) {
  return new Promise((e3, t) => {
    n.oncomplete = n.onsuccess = () => e3(n.result), n.onabort = n.onerror = () => t(n.error);
  });
}
__name(u3, "u");
function f2(n, e3) {
  let t = indexedDB.open(n);
  t.onupgradeneeded = () => t.result.createObjectStore(e3);
  let r = u3(t);
  return (a3, c3) => r.then((l3) => c3(l3.transaction(e3, a3).objectStore(e3)));
}
__name(f2, "f");
var o2;
function i2() {
  return o2 || (o2 = f2("keyval-store", "keyval")), o2;
}
__name(i2, "i");
function d3(n, e3 = i2()) {
  return e3("readonly", (t) => u3(t.get(n)));
}
__name(d3, "d");
function y3(n, e3, t = i2()) {
  return t("readwrite", (r) => (r.put(e3, n), u3(r.transaction)));
}
__name(y3, "y");
function h2(n, e3 = i2()) {
  return e3("readwrite", (t) => (n.forEach((r) => t.put(r[1], r[0])), u3(t.transaction)));
}
__name(h2, "h");
function p3(n, e3 = i2()) {
  return e3("readonly", (t) => Promise.all(n.map((r) => u3(t.get(r)))));
}
__name(p3, "p");
function m2(n, e3 = i2()) {
  return e3("readwrite", (t) => (t.delete(n), u3(t.transaction)));
}
__name(m2, "m");
function w3(n, e3 = i2()) {
  return e3("readwrite", (t) => (n.forEach((r) => t.delete(r)), u3(t.transaction)));
}
__name(w3, "w");
function A2(n = i2()) {
  return n("readwrite", (e3) => (e3.clear(), u3(e3.transaction)));
}
__name(A2, "A");
function s3(n, e3) {
  return n.openCursor().onsuccess = function() {
    this.result && (e3(this.result), this.result.continue());
  }, u3(n.transaction);
}
__name(s3, "s");
function v3(n = i2()) {
  return n("readonly", (e3) => {
    if (e3.getAllKeys) return u3(e3.getAllKeys());
    let t = [];
    return s3(e3, (r) => t.push(r.key)).then(() => t);
  });
}
__name(v3, "v");
function k4(n = i2()) {
  return n("readonly", (e3) => {
    if (e3.getAll && e3.getAllKeys) return Promise.all([u3(e3.getAllKeys()), u3(e3.getAll())]).then(([r, a3]) => r.map((c3, l3) => [c3, a3[l3]]));
    let t = [];
    return n("readonly", (r) => s3(r, (a3) => t.push([a3.key, a3.value])).then(() => t));
  });
}
__name(k4, "k");

// https:https://esm.sh/fflate@0.8.2/es2022/fflate.mjs
var cn = {};
var Qn = /* @__PURE__ */ __name((function(n, r, t, e3, i3) {
  var a3 = new Worker(cn[r] || (cn[r] = URL.createObjectURL(new Blob([n + ';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'], { type: "text/javascript" }))));
  return a3.onmessage = function(o3) {
    var s4 = o3.data, l3 = s4.$e$;
    if (l3) {
      var f3 = new Error(l3[0]);
      f3.code = l3[1], f3.stack = l3[2], i3(f3, null);
    } else i3(null, s4);
  }, a3.postMessage(t, e3), a3;
}), "Qn");
var S3 = Uint8Array;
var W4 = Uint16Array;
var Zr = Int32Array;
var mr = new S3([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
var xr = new S3([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
var Cr = new S3([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var An = /* @__PURE__ */ __name(function(n, r) {
  for (var t = new W4(31), e3 = 0; e3 < 31; ++e3) t[e3] = r += 1 << n[e3 - 1];
  for (var i3 = new Zr(t[30]), e3 = 1; e3 < 30; ++e3) for (var a3 = t[e3]; a3 < t[e3 + 1]; ++a3) i3[a3] = a3 - t[e3] << 5 | e3;
  return { b: t, r: i3 };
}, "An");
var Mn = An(mr, 2);
var tn = Mn.b;
var Nr = Mn.r;
tn[28] = 258, Nr[258] = 28;
var Sn = An(xr, 0);
var Un = Sn.b;
var Qr = Sn.r;
var Ir = new W4(32768);
for (I2 = 0; I2 < 32768; ++I2) tr = (I2 & 43690) >> 1 | (I2 & 21845) << 1, tr = (tr & 52428) >> 2 | (tr & 13107) << 2, tr = (tr & 61680) >> 4 | (tr & 3855) << 4, Ir[I2] = ((tr & 65280) >> 8 | (tr & 255) << 8) >> 1;
var tr;
var I2;
var V2 = /* @__PURE__ */ __name((function(n, r, t) {
  for (var e3 = n.length, i3 = 0, a3 = new W4(r); i3 < e3; ++i3) n[i3] && ++a3[n[i3] - 1];
  var o3 = new W4(r);
  for (i3 = 1; i3 < r; ++i3) o3[i3] = o3[i3 - 1] + a3[i3 - 1] << 1;
  var s4;
  if (t) {
    s4 = new W4(1 << r);
    var l3 = 15 - r;
    for (i3 = 0; i3 < e3; ++i3) if (n[i3]) for (var f3 = i3 << 4 | n[i3], h3 = r - n[i3], u4 = o3[n[i3] - 1]++ << h3, v4 = u4 | (1 << h3) - 1; u4 <= v4; ++u4) s4[Ir[u4] >> l3] = f3;
  } else for (s4 = new W4(e3), i3 = 0; i3 < e3; ++i3) n[i3] && (s4[i3] = Ir[o3[n[i3] - 1]++] >> 15 - n[i3]);
  return s4;
}), "V");
var er = new S3(288);
for (I2 = 0; I2 < 144; ++I2) er[I2] = 8;
var I2;
for (I2 = 144; I2 < 256; ++I2) er[I2] = 9;
var I2;
for (I2 = 256; I2 < 280; ++I2) er[I2] = 7;
var I2;
for (I2 = 280; I2 < 288; ++I2) er[I2] = 8;
var I2;
var yr = new S3(32);
for (I2 = 0; I2 < 32; ++I2) yr[I2] = 5;
var I2;
var Fn = V2(er, 9, 0);
var Dn = V2(er, 9, 1);
var Tn = V2(yr, 5, 0);
var Cn = V2(yr, 5, 1);
var Pr = /* @__PURE__ */ __name(function(n) {
  for (var r = n[0], t = 1; t < n.length; ++t) n[t] > r && (r = n[t]);
  return r;
}, "Pr");
var Q = /* @__PURE__ */ __name(function(n, r, t) {
  var e3 = r / 8 | 0;
  return (n[e3] | n[e3 + 1] << 8) >> (r & 7) & t;
}, "Q");
var $r = /* @__PURE__ */ __name(function(n, r) {
  var t = r / 8 | 0;
  return (n[t] | n[t + 1] << 8 | n[t + 2] << 16) >> (r & 7);
}, "$r");
var zr = /* @__PURE__ */ __name(function(n) {
  return (n + 7) / 8 | 0;
}, "zr");
var X2 = /* @__PURE__ */ __name(function(n, r, t) {
  return (r == null || r < 0) && (r = 0), (t == null || t > n.length) && (t = n.length), new S3(n.subarray(r, t));
}, "X");
var In = ["unexpected EOF", "invalid block type", "invalid length/literal", "invalid distance", "stream finished", "no stream handler", , "no callback", "invalid UTF-8 data", "extra field too long", "date not in range 1980-2099", "filename too long", "stream finishing", "invalid zip data"];
var c2 = /* @__PURE__ */ __name(function(n, r, t) {
  var e3 = new Error(r || In[n]);
  if (e3.code = n, Error.captureStackTrace && Error.captureStackTrace(e3, c2), !t) throw e3;
  return e3;
}, "c");
var Br = /* @__PURE__ */ __name(function(n, r, t, e3) {
  var i3 = n.length, a3 = e3 ? e3.length : 0;
  if (!i3 || r.f && !r.l) return t || new S3(0);
  var o3 = !t, s4 = o3 || r.i != 2, l3 = r.i;
  o3 && (t = new S3(i3 * 3));
  var f3 = /* @__PURE__ */ __name(function(Dr) {
    var Tr = t.length;
    if (Dr > Tr) {
      var cr = new S3(Math.max(Tr * 2, Dr));
      cr.set(t), t = cr;
    }
  }, "f"), h3 = r.f || 0, u4 = r.p || 0, v4 = r.b || 0, M3 = r.l, m3 = r.d, z3 = r.m, p4 = r.n, x5 = i3 * 8;
  do {
    if (!M3) {
      h3 = Q(n, u4, 1);
      var U2 = Q(n, u4 + 1, 3);
      if (u4 += 3, U2) if (U2 == 1) M3 = Dn, m3 = Cn, z3 = 9, p4 = 5;
      else if (U2 == 2) {
        var B2 = Q(n, u4, 31) + 257, D3 = Q(n, u4 + 10, 15) + 4, w4 = B2 + Q(n, u4 + 5, 31) + 1;
        u4 += 14;
        for (var g3 = new S3(w4), F3 = new S3(19), T2 = 0; T2 < D3; ++T2) F3[Cr[T2]] = Q(n, u4 + T2 * 3, 7);
        u4 += D3 * 3;
        for (var O3 = Pr(F3), H3 = (1 << O3) - 1, G2 = V2(F3, O3, 1), T2 = 0; T2 < w4; ) {
          var L3 = G2[Q(n, u4, H3)];
          u4 += L3 & 15;
          var A3 = L3 >> 4;
          if (A3 < 16) g3[T2++] = A3;
          else {
            var q3 = 0, E5 = 0;
            for (A3 == 16 ? (E5 = 3 + Q(n, u4, 3), u4 += 2, q3 = g3[T2 - 1]) : A3 == 17 ? (E5 = 3 + Q(n, u4, 7), u4 += 3) : A3 == 18 && (E5 = 11 + Q(n, u4, 127), u4 += 7); E5--; ) g3[T2++] = q3;
          }
        }
        var R2 = g3.subarray(0, B2), N3 = g3.subarray(B2);
        z3 = Pr(R2), p4 = Pr(N3), M3 = V2(R2, z3, 1), m3 = V2(N3, p4, 1);
      } else c2(1);
      else {
        var A3 = zr(u4) + 4, y4 = n[A3 - 4] | n[A3 - 3] << 8, Z3 = A3 + y4;
        if (Z3 > i3) {
          l3 && c2(0);
          break;
        }
        s4 && f3(v4 + y4), t.set(n.subarray(A3, Z3), v4), r.b = v4 += y4, r.p = u4 = Z3 * 8, r.f = h3;
        continue;
      }
      if (u4 > x5) {
        l3 && c2(0);
        break;
      }
    }
    s4 && f3(v4 + 131072);
    for (var sr = (1 << z3) - 1, Y2 = (1 << p4) - 1, nr = u4; ; nr = u4) {
      var q3 = M3[$r(n, u4) & sr], j3 = q3 >> 4;
      if (u4 += q3 & 15, u4 > x5) {
        l3 && c2(0);
        break;
      }
      if (q3 || c2(2), j3 < 256) t[v4++] = j3;
      else if (j3 == 256) {
        nr = u4, M3 = null;
        break;
      } else {
        var J3 = j3 - 254;
        if (j3 > 264) {
          var T2 = j3 - 257, P = mr[T2];
          J3 = Q(n, u4, (1 << P) - 1) + tn[T2], u4 += P;
        }
        var _2 = m3[$r(n, u4) & Y2], lr = _2 >> 4;
        _2 || c2(3), u4 += _2 & 15;
        var N3 = Un[lr];
        if (lr > 3) {
          var P = xr[lr];
          N3 += $r(n, u4) & (1 << P) - 1, u4 += P;
        }
        if (u4 > x5) {
          l3 && c2(0);
          break;
        }
        s4 && f3(v4 + 131072);
        var vr = v4 + J3;
        if (v4 < N3) {
          var Or = a3 - N3, qr = Math.min(N3, vr);
          for (Or + v4 < 0 && c2(3); v4 < qr; ++v4) t[v4] = e3[Or + v4];
        }
        for (; v4 < vr; ++v4) t[v4] = t[v4 - N3];
      }
    }
    r.l = M3, r.p = nr, r.b = v4, r.f = h3, M3 && (h3 = 1, r.m = z3, r.d = m3, r.n = p4);
  } while (!h3);
  return v4 != t.length && o3 ? X2(t, 0, v4) : t.subarray(0, v4);
}, "Br");
var rr = /* @__PURE__ */ __name(function(n, r, t) {
  t <<= r & 7;
  var e3 = r / 8 | 0;
  n[e3] |= t, n[e3 + 1] |= t >> 8;
}, "rr");
var pr = /* @__PURE__ */ __name(function(n, r, t) {
  t <<= r & 7;
  var e3 = r / 8 | 0;
  n[e3] |= t, n[e3 + 1] |= t >> 8, n[e3 + 2] |= t >> 16;
}, "pr");
var Hr = /* @__PURE__ */ __name(function(n, r) {
  for (var t = [], e3 = 0; e3 < n.length; ++e3) n[e3] && t.push({ s: e3, f: n[e3] });
  var i3 = t.length, a3 = t.slice();
  if (!i3) return { t: ir, l: 0 };
  if (i3 == 1) {
    var o3 = new S3(t[0].s + 1);
    return o3[t[0].s] = 1, { t: o3, l: 1 };
  }
  t.sort(function(Z3, B2) {
    return Z3.f - B2.f;
  }), t.push({ s: -1, f: 25001 });
  var s4 = t[0], l3 = t[1], f3 = 0, h3 = 1, u4 = 2;
  for (t[0] = { s: -1, f: s4.f + l3.f, l: s4, r: l3 }; h3 != i3 - 1; ) s4 = t[t[f3].f < t[u4].f ? f3++ : u4++], l3 = t[f3 != h3 && t[f3].f < t[u4].f ? f3++ : u4++], t[h3++] = { s: -1, f: s4.f + l3.f, l: s4, r: l3 };
  for (var v4 = a3[0].s, e3 = 1; e3 < i3; ++e3) a3[e3].s > v4 && (v4 = a3[e3].s);
  var M3 = new W4(v4 + 1), m3 = Rr(t[h3 - 1], M3, 0);
  if (m3 > r) {
    var e3 = 0, z3 = 0, p4 = m3 - r, x5 = 1 << p4;
    for (a3.sort(function(B2, D3) {
      return M3[D3.s] - M3[B2.s] || B2.f - D3.f;
    }); e3 < i3; ++e3) {
      var U2 = a3[e3].s;
      if (M3[U2] > r) z3 += x5 - (1 << m3 - M3[U2]), M3[U2] = r;
      else break;
    }
    for (z3 >>= p4; z3 > 0; ) {
      var A3 = a3[e3].s;
      M3[A3] < r ? z3 -= 1 << r - M3[A3]++ - 1 : ++e3;
    }
    for (; e3 >= 0 && z3; --e3) {
      var y4 = a3[e3].s;
      M3[y4] == r && (--M3[y4], ++z3);
    }
    m3 = r;
  }
  return { t: new S3(M3), l: m3 };
}, "Hr");
var Rr = /* @__PURE__ */ __name(function(n, r, t) {
  return n.s == -1 ? Math.max(Rr(n.l, r, t + 1), Rr(n.r, r, t + 1)) : r[n.s] = t;
}, "Rr");
var Vr = /* @__PURE__ */ __name(function(n) {
  for (var r = n.length; r && !n[--r]; ) ;
  for (var t = new W4(++r), e3 = 0, i3 = n[0], a3 = 1, o3 = function(l3) {
    t[e3++] = l3;
  }, s4 = 1; s4 <= r; ++s4) if (n[s4] == i3 && s4 != r) ++a3;
  else {
    if (!i3 && a3 > 2) {
      for (; a3 > 138; a3 -= 138) o3(32754);
      a3 > 2 && (o3(a3 > 10 ? a3 - 11 << 5 | 28690 : a3 - 3 << 5 | 12305), a3 = 0);
    } else if (a3 > 3) {
      for (o3(i3), --a3; a3 > 6; a3 -= 6) o3(8304);
      a3 > 2 && (o3(a3 - 3 << 5 | 8208), a3 = 0);
    }
    for (; a3--; ) o3(i3);
    a3 = 1, i3 = n[s4];
  }
  return { c: t.subarray(0, e3), n: r };
}, "Vr");
var gr = /* @__PURE__ */ __name(function(n, r) {
  for (var t = 0, e3 = 0; e3 < r.length; ++e3) t += n[e3] * r[e3];
  return t;
}, "gr");
var en = /* @__PURE__ */ __name(function(n, r, t) {
  var e3 = t.length, i3 = zr(r + 2);
  n[i3] = e3 & 255, n[i3 + 1] = e3 >> 8, n[i3 + 2] = n[i3] ^ 255, n[i3 + 3] = n[i3 + 1] ^ 255;
  for (var a3 = 0; a3 < e3; ++a3) n[i3 + a3 + 4] = t[a3];
  return (i3 + 4 + e3) * 8;
}, "en");
var Xr = /* @__PURE__ */ __name(function(n, r, t, e3, i3, a3, o3, s4, l3, f3, h3) {
  rr(r, h3++, t), ++i3[256];
  for (var u4 = Hr(i3, 15), v4 = u4.t, M3 = u4.l, m3 = Hr(a3, 15), z3 = m3.t, p4 = m3.l, x5 = Vr(v4), U2 = x5.c, A3 = x5.n, y4 = Vr(z3), Z3 = y4.c, B2 = y4.n, D3 = new W4(19), w4 = 0; w4 < U2.length; ++w4) ++D3[U2[w4] & 31];
  for (var w4 = 0; w4 < Z3.length; ++w4) ++D3[Z3[w4] & 31];
  for (var g3 = Hr(D3, 7), F3 = g3.t, T2 = g3.l, O3 = 19; O3 > 4 && !F3[Cr[O3 - 1]]; --O3) ;
  var H3 = f3 + 5 << 3, G2 = gr(i3, er) + gr(a3, yr) + o3, L3 = gr(i3, v4) + gr(a3, z3) + o3 + 14 + 3 * O3 + gr(D3, F3) + 2 * D3[16] + 3 * D3[17] + 7 * D3[18];
  if (l3 >= 0 && H3 <= G2 && H3 <= L3) return en(r, h3, n.subarray(l3, l3 + f3));
  var q3, E5, R2, N3;
  if (rr(r, h3, 1 + (L3 < G2)), h3 += 2, L3 < G2) {
    q3 = V2(v4, M3, 0), E5 = v4, R2 = V2(z3, p4, 0), N3 = z3;
    var sr = V2(F3, T2, 0);
    rr(r, h3, A3 - 257), rr(r, h3 + 5, B2 - 1), rr(r, h3 + 10, O3 - 4), h3 += 14;
    for (var w4 = 0; w4 < O3; ++w4) rr(r, h3 + 3 * w4, F3[Cr[w4]]);
    h3 += 3 * O3;
    for (var Y2 = [U2, Z3], nr = 0; nr < 2; ++nr) for (var j3 = Y2[nr], w4 = 0; w4 < j3.length; ++w4) {
      var J3 = j3[w4] & 31;
      rr(r, h3, sr[J3]), h3 += F3[J3], J3 > 15 && (rr(r, h3, j3[w4] >> 5 & 127), h3 += j3[w4] >> 12);
    }
  } else q3 = Fn, E5 = er, R2 = Tn, N3 = yr;
  for (var w4 = 0; w4 < s4; ++w4) {
    var P = e3[w4];
    if (P > 255) {
      var J3 = P >> 18 & 31;
      pr(r, h3, q3[J3 + 257]), h3 += E5[J3 + 257], J3 > 7 && (rr(r, h3, P >> 23 & 31), h3 += mr[J3]);
      var _2 = P & 31;
      pr(r, h3, R2[_2]), h3 += N3[_2], _2 > 3 && (pr(r, h3, P >> 5 & 8191), h3 += xr[_2]);
    } else pr(r, h3, q3[P]), h3 += E5[P];
  }
  return pr(r, h3, q3[256]), h3 + E5[256];
}, "Xr");
var Zn = new Zr([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var ir = new S3(0);
var Bn = /* @__PURE__ */ __name(function(n, r, t, e3, i3, a3) {
  var o3 = a3.z || n.length, s4 = new S3(e3 + o3 + 5 * (1 + Math.ceil(o3 / 7e3)) + i3), l3 = s4.subarray(e3, s4.length - i3), f3 = a3.l, h3 = (a3.r || 0) & 7;
  if (r) {
    h3 && (l3[0] = a3.r >> 3);
    for (var u4 = Zn[r - 1], v4 = u4 >> 13, M3 = u4 & 8191, m3 = (1 << t) - 1, z3 = a3.p || new W4(32768), p4 = a3.h || new W4(m3 + 1), x5 = Math.ceil(t / 3), U2 = 2 * x5, A3 = function(Jr) {
      return (n[Jr] ^ n[Jr + 1] << x5 ^ n[Jr + 2] << U2) & m3;
    }, y4 = new Zr(25e3), Z3 = new W4(288), B2 = new W4(32), D3 = 0, w4 = 0, g3 = a3.i || 0, F3 = 0, T2 = a3.w || 0, O3 = 0; g3 + 2 < o3; ++g3) {
      var H3 = A3(g3), G2 = g3 & 32767, L3 = p4[H3];
      if (z3[G2] = L3, p4[H3] = G2, T2 <= g3) {
        var q3 = o3 - g3;
        if ((D3 > 7e3 || F3 > 24576) && (q3 > 423 || !f3)) {
          h3 = Xr(n, l3, 0, y4, Z3, B2, w4, F3, O3, g3 - O3, h3), F3 = D3 = w4 = 0, O3 = g3;
          for (var E5 = 0; E5 < 286; ++E5) Z3[E5] = 0;
          for (var E5 = 0; E5 < 30; ++E5) B2[E5] = 0;
        }
        var R2 = 2, N3 = 0, sr = M3, Y2 = G2 - L3 & 32767;
        if (q3 > 2 && H3 == A3(g3 - Y2)) for (var nr = Math.min(v4, q3) - 1, j3 = Math.min(32767, g3), J3 = Math.min(258, q3); Y2 <= j3 && --sr && G2 != L3; ) {
          if (n[g3 + R2] == n[g3 + R2 - Y2]) {
            for (var P = 0; P < J3 && n[g3 + P] == n[g3 + P - Y2]; ++P) ;
            if (P > R2) {
              if (R2 = P, N3 = Y2, P > nr) break;
              for (var _2 = Math.min(Y2, P - 2), lr = 0, E5 = 0; E5 < _2; ++E5) {
                var vr = g3 - Y2 + E5 & 32767, Or = z3[vr], qr = vr - Or & 32767;
                qr > lr && (lr = qr, L3 = vr);
              }
            }
          }
          G2 = L3, L3 = z3[G2], Y2 += G2 - L3 & 32767;
        }
        if (N3) {
          y4[F3++] = 268435456 | Nr[R2] << 18 | Qr[N3];
          var Dr = Nr[R2] & 31, Tr = Qr[N3] & 31;
          w4 += mr[Dr] + xr[Tr], ++Z3[257 + Dr], ++B2[Tr], T2 = g3 + R2, ++D3;
        } else y4[F3++] = n[g3], ++Z3[n[g3]];
      }
    }
    for (g3 = Math.max(g3, T2); g3 < o3; ++g3) y4[F3++] = n[g3], ++Z3[n[g3]];
    h3 = Xr(n, l3, f3, y4, Z3, B2, w4, F3, O3, g3 - O3, h3), f3 || (a3.r = h3 & 7 | l3[h3 / 8 | 0] << 3, h3 -= 7, a3.h = p4, a3.p = z3, a3.i = g3, a3.w = T2);
  } else {
    for (var g3 = a3.w || 0; g3 < o3 + f3; g3 += 65535) {
      var cr = g3 + 65535;
      cr >= o3 && (l3[h3 / 8 | 0] = f3, cr = o3), h3 = en(l3, h3 + 1, n.subarray(g3, cr));
    }
    a3.i = o3;
  }
  return X2(s4, 0, e3 + zr(h3) + i3);
}, "Bn");
var En = (function() {
  for (var n = new Int32Array(256), r = 0; r < 256; ++r) {
    for (var t = r, e3 = 9; --e3; ) t = (t & 1 && -306674912) ^ t >>> 1;
    n[r] = t;
  }
  return n;
})();
var Ar = /* @__PURE__ */ __name(function() {
  var n = -1;
  return { p: /* @__PURE__ */ __name(function(r) {
    for (var t = n, e3 = 0; e3 < r.length; ++e3) t = En[t & 255 ^ r[e3]] ^ t >>> 8;
    n = t;
  }, "p"), d: /* @__PURE__ */ __name(function() {
    return ~n;
  }, "d") };
}, "Ar");
var Yr = /* @__PURE__ */ __name(function() {
  var n = 1, r = 0;
  return { p: /* @__PURE__ */ __name(function(t) {
    for (var e3 = n, i3 = r, a3 = t.length | 0, o3 = 0; o3 != a3; ) {
      for (var s4 = Math.min(o3 + 2655, a3); o3 < s4; ++o3) i3 += e3 += t[o3];
      e3 = (e3 & 65535) + 15 * (e3 >> 16), i3 = (i3 & 65535) + 15 * (i3 >> 16);
    }
    n = e3, r = i3;
  }, "p"), d: /* @__PURE__ */ __name(function() {
    return n %= 65521, r %= 65521, (n & 255) << 24 | (n & 65280) << 8 | (r & 255) << 8 | r >> 8;
  }, "d") };
}, "Yr");
var hr = /* @__PURE__ */ __name(function(n, r, t, e3, i3) {
  if (!i3 && (i3 = { l: 1 }, r.dictionary)) {
    var a3 = r.dictionary.subarray(-32768), o3 = new S3(a3.length + n.length);
    o3.set(a3), o3.set(n, a3.length), n = o3, i3.w = a3.length;
  }
  return Bn(n, r.level == null ? 6 : r.level, r.mem == null ? i3.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(n.length))) * 1.5) : 20 : 12 + r.mem, t, e3, i3);
}, "hr");
var Er = /* @__PURE__ */ __name(function(n, r) {
  var t = {};
  for (var e3 in n) t[e3] = n[e3];
  for (var e3 in r) t[e3] = r[e3];
  return t;
}, "Er");
var pn = /* @__PURE__ */ __name(function(n, r, t) {
  for (var e3 = n(), i3 = n.toString(), a3 = i3.slice(i3.indexOf("[") + 1, i3.lastIndexOf("]")).replace(/\s+/g, "").split(","), o3 = 0; o3 < e3.length; ++o3) {
    var s4 = e3[o3], l3 = a3[o3];
    if (typeof s4 == "function") {
      r += ";" + l3 + "=";
      var f3 = s4.toString();
      if (s4.prototype) if (f3.indexOf("[native code]") != -1) {
        var h3 = f3.indexOf(" ", 8) + 1;
        r += f3.slice(h3, f3.indexOf("(", h3));
      } else {
        r += f3;
        for (var u4 in s4.prototype) r += ";" + l3 + ".prototype." + u4 + "=" + s4.prototype[u4].toString();
      }
      else r += f3;
    } else t[l3] = s4;
  }
  return r;
}, "pn");
var Lr = [];
var Vn = /* @__PURE__ */ __name(function(n) {
  var r = [];
  for (var t in n) n[t].buffer && r.push((n[t] = new n[t].constructor(n[t])).buffer);
  return r;
}, "Vn");
var Gn = /* @__PURE__ */ __name(function(n, r, t, e3) {
  if (!Lr[t]) {
    for (var i3 = "", a3 = {}, o3 = n.length - 1, s4 = 0; s4 < o3; ++s4) i3 = pn(n[s4], i3, a3);
    Lr[t] = { c: pn(n[o3], i3, a3), e: a3 };
  }
  var l3 = Er({}, Lr[t].e);
  return Qn(Lr[t].c + ";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=" + r.toString() + "}", t, l3, Vn(l3), e3);
}, "Gn");
var Mr = /* @__PURE__ */ __name(function() {
  return [S3, W4, Zr, mr, xr, Cr, tn, Un, Dn, Cn, Ir, In, V2, Pr, Q, $r, zr, X2, c2, Br, Gr, or, an];
}, "Mr");
var Sr = /* @__PURE__ */ __name(function() {
  return [S3, W4, Zr, mr, xr, Cr, Nr, Qr, Fn, er, Tn, yr, Ir, Zn, ir, V2, rr, pr, Hr, Rr, Vr, gr, en, Xr, zr, X2, Bn, hr, jr, or];
}, "Sr");
var qn = /* @__PURE__ */ __name(function() {
  return [sn, $n];
}, "qn");
var Pn = /* @__PURE__ */ __name(function() {
  return [un];
}, "Pn");
var or = /* @__PURE__ */ __name(function(n) {
  return postMessage(n, [n.buffer]);
}, "or");
var an = /* @__PURE__ */ __name(function(n) {
  return n && { out: n.size && new S3(n.size), dictionary: n.dictionary };
}, "an");
var d4 = /* @__PURE__ */ __name(function(n) {
  return n.ondata = function(r, t) {
    return postMessage([r, t], [r.buffer]);
  }, function(r) {
    r.data.length ? (n.push(r.data[0], r.data[1]), postMessage([r.data[0].length])) : n.flush();
  };
}, "d");
var Fr = /* @__PURE__ */ __name(function(n, r, t, e3, i3, a3, o3) {
  var s4, l3 = Gn(n, e3, i3, function(f3, h3) {
    f3 ? (l3.terminate(), r.ondata.call(r, f3)) : Array.isArray(h3) ? h3.length == 1 ? (r.queuedSize -= h3[0], r.ondrain && r.ondrain(h3[0])) : (h3[1] && l3.terminate(), r.ondata.call(r, f3, h3[0], h3[1])) : o3(h3);
  });
  l3.postMessage(t), r.queuedSize = 0, r.push = function(f3, h3) {
    r.ondata || c2(5), s4 && r.ondata(c2(4, 0, 1), null, !!h3), r.queuedSize += f3.length, l3.postMessage([f3, s4 = h3], [f3.buffer]);
  }, r.terminate = function() {
    l3.terminate();
  }, a3 && (r.flush = function() {
    l3.postMessage([]);
  });
}, "Fr");
var k5 = /* @__PURE__ */ __name(function(n, r) {
  return n[r] | n[r + 1] << 8;
}, "k");
var $2 = /* @__PURE__ */ __name(function(n, r) {
  return (n[r] | n[r + 1] << 8 | n[r + 2] << 16 | n[r + 3] << 24) >>> 0;
}, "$");
var Kr = /* @__PURE__ */ __name(function(n, r) {
  return $2(n, r) + $2(n, r + 4) * 4294967296;
}, "Kr");
var C2 = /* @__PURE__ */ __name(function(n, r, t) {
  for (; t; ++r) n[r] = t, t >>>= 8;
}, "C");
var on = /* @__PURE__ */ __name(function(n, r) {
  var t = r.filename;
  if (n[0] = 31, n[1] = 139, n[2] = 8, n[8] = r.level < 2 ? 4 : r.level == 9 ? 2 : 0, n[9] = 3, r.mtime != 0 && C2(n, 4, Math.floor(new Date(r.mtime || Date.now()) / 1e3)), t) {
    n[3] = 8;
    for (var e3 = 0; e3 <= t.length; ++e3) n[e3 + 10] = t.charCodeAt(e3);
  }
}, "on");
var sn = /* @__PURE__ */ __name(function(n) {
  (n[0] != 31 || n[1] != 139 || n[2] != 8) && c2(6, "invalid gzip data");
  var r = n[3], t = 10;
  r & 4 && (t += (n[10] | n[11] << 8) + 2);
  for (var e3 = (r >> 3 & 1) + (r >> 4 & 1); e3 > 0; e3 -= !n[t++]) ;
  return t + (r & 2);
}, "sn");
var $n = /* @__PURE__ */ __name(function(n) {
  var r = n.length;
  return (n[r - 4] | n[r - 3] << 8 | n[r - 2] << 16 | n[r - 1] << 24) >>> 0;
}, "$n");
var fn = /* @__PURE__ */ __name(function(n) {
  return 10 + (n.filename ? n.filename.length + 1 : 0);
}, "fn");
var hn = /* @__PURE__ */ __name(function(n, r) {
  var t = r.level, e3 = t == 0 ? 0 : t < 6 ? 1 : t == 9 ? 3 : 2;
  if (n[0] = 120, n[1] = e3 << 6 | (r.dictionary && 32), n[1] |= 31 - (n[0] << 8 | n[1]) % 31, r.dictionary) {
    var i3 = Yr();
    i3.p(r.dictionary), C2(n, 2, i3.d());
  }
}, "hn");
var un = /* @__PURE__ */ __name(function(n, r) {
  return ((n[0] & 15) != 8 || n[0] >> 4 > 7 || (n[0] << 8 | n[1]) % 31) && c2(6, "invalid zlib data"), (n[1] >> 5 & 1) == +!r && c2(6, "invalid zlib data: " + (n[1] & 32 ? "need" : "unexpected") + " dictionary"), (n[1] >> 3 & 4) + 2;
}, "un");
function ur(n, r) {
  return typeof n == "function" && (r = n, n = {}), this.ondata = r, n;
}
__name(ur, "ur");
var b2 = (function() {
  function n(r, t) {
    if (typeof r == "function" && (t = r, r = {}), this.ondata = t, this.o = r || {}, this.s = { l: 0, i: 32768, w: 32768, z: 32768 }, this.b = new S3(98304), this.o.dictionary) {
      var e3 = this.o.dictionary.subarray(-32768);
      this.b.set(e3, 32768 - e3.length), this.s.i = 32768 - e3.length;
    }
  }
  __name(n, "n");
  return n.prototype.p = function(r, t) {
    this.ondata(hr(r, this.o, 0, 0, this.s), t);
  }, n.prototype.push = function(r, t) {
    this.ondata || c2(5), this.s.l && c2(4);
    var e3 = r.length + this.s.z;
    if (e3 > this.b.length) {
      if (e3 > 2 * this.b.length - 32768) {
        var i3 = new S3(e3 & -32768);
        i3.set(this.b.subarray(0, this.s.z)), this.b = i3;
      }
      var a3 = this.b.length - this.s.z;
      this.b.set(r.subarray(0, a3), this.s.z), this.s.z = this.b.length, this.p(this.b, false), this.b.set(this.b.subarray(-32768)), this.b.set(r.subarray(a3), 32768), this.s.z = r.length - a3 + 32768, this.s.i = 32766, this.s.w = 32768;
    } else this.b.set(r, this.s.z), this.s.z += r.length;
    this.s.l = t & 1, (this.s.z > this.s.w + 8191 || t) && (this.p(this.b, t || false), this.s.w = this.s.i, this.s.i -= 2);
  }, n.prototype.flush = function() {
    this.ondata || c2(5), this.s.l && c2(4), this.p(this.b, false), this.s.w = this.s.i, this.s.i -= 2;
  }, n;
})();
var Xn = /* @__PURE__ */ (function() {
  function n(r, t) {
    Fr([Sr, function() {
      return [d4, b2];
    }], this, ur.call(this, r, t), function(e3) {
      var i3 = new b2(e3.data);
      onmessage = d4(i3);
    }, 6, 1);
  }
  __name(n, "n");
  return n;
})();
function jr(n, r) {
  return hr(n, r || {}, 0, 0);
}
__name(jr, "jr");
var K2 = (function() {
  function n(r, t) {
    typeof r == "function" && (t = r, r = {}), this.ondata = t;
    var e3 = r && r.dictionary && r.dictionary.subarray(-32768);
    this.s = { i: 0, b: e3 ? e3.length : 0 }, this.o = new S3(32768), this.p = new S3(0), e3 && this.o.set(e3);
  }
  __name(n, "n");
  return n.prototype.e = function(r) {
    if (this.ondata || c2(5), this.d && c2(4), !this.p.length) this.p = r;
    else if (r.length) {
      var t = new S3(this.p.length + r.length);
      t.set(this.p), t.set(r, this.p.length), this.p = t;
    }
  }, n.prototype.c = function(r) {
    this.s.i = +(this.d = r || false);
    var t = this.s.b, e3 = Br(this.p, this.s, this.o);
    this.ondata(X2(e3, t, this.s.b), this.d), this.o = X2(e3, this.s.b - 32768), this.s.b = this.o.length, this.p = X2(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  }, n.prototype.push = function(r, t) {
    this.e(r), this.c(t);
  }, n;
})();
var Hn = /* @__PURE__ */ (function() {
  function n(r, t) {
    Fr([Mr, function() {
      return [d4, K2];
    }], this, ur.call(this, r, t), function(e3) {
      var i3 = new K2(e3.data);
      onmessage = d4(i3);
    }, 7, 0);
  }
  __name(n, "n");
  return n;
})();
function Gr(n, r) {
  return Br(n, { i: 2 }, r && r.out, r && r.dictionary);
}
__name(Gr, "Gr");
var gn = (function() {
  function n(r, t) {
    this.c = Ar(), this.l = 0, this.v = 1, b2.call(this, r, t);
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    this.c.p(r), this.l += r.length, b2.prototype.push.call(this, r, t);
  }, n.prototype.p = function(r, t) {
    var e3 = hr(r, this.o, this.v && fn(this.o), t && 8, this.s);
    this.v && (on(e3, this.o), this.v = 0), t && (C2(e3, e3.length - 8, this.c.d()), C2(e3, e3.length - 4, this.l)), this.ondata(e3, t);
  }, n.prototype.flush = function() {
    b2.prototype.flush.call(this);
  }, n;
})();
var dr = (function() {
  function n(r, t) {
    this.v = 1, this.r = 0, K2.call(this, r, t);
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    if (K2.prototype.e.call(this, r), this.r += r.length, this.v) {
      var e3 = this.p.subarray(this.v - 1), i3 = e3.length > 3 ? sn(e3) : 4;
      if (i3 > e3.length) {
        if (!t) return;
      } else this.v > 1 && this.onmember && this.onmember(this.r - e3.length);
      this.p = e3.subarray(i3), this.v = 0;
    }
    K2.prototype.c.call(this, t), this.s.f && !this.s.l && !t && (this.v = zr(this.s.p) + 9, this.s = { i: 0 }, this.o = new S3(0), this.push(new S3(0), t));
  }, n;
})();
var bn = /* @__PURE__ */ (function() {
  function n(r, t) {
    var e3 = this;
    Fr([Mr, qn, function() {
      return [d4, K2, dr];
    }], this, ur.call(this, r, t), function(i3) {
      var a3 = new dr(i3.data);
      a3.onmember = function(o3) {
        return postMessage(o3);
      }, onmessage = d4(a3);
    }, 9, 0, function(i3) {
      return e3.onmember && e3.onmember(i3);
    });
  }
  __name(n, "n");
  return n;
})();
var wn = (function() {
  function n(r, t) {
    this.c = Yr(), this.v = 1, b2.call(this, r, t);
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    this.c.p(r), b2.prototype.push.call(this, r, t);
  }, n.prototype.p = function(r, t) {
    var e3 = hr(r, this.o, this.v && (this.o.dictionary ? 6 : 2), t && 4, this.s);
    this.v && (hn(e3, this.o), this.v = 0), t && C2(e3, e3.length - 4, this.c.d()), this.ondata(e3, t);
  }, n.prototype.flush = function() {
    b2.prototype.flush.call(this);
  }, n;
})();
var _r = (function() {
  function n(r, t) {
    K2.call(this, r, t), this.v = r && r.dictionary ? 2 : 1;
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    if (K2.prototype.e.call(this, r), this.v) {
      if (this.p.length < 6 && !t) return;
      this.p = this.p.subarray(un(this.p, this.v - 1)), this.v = 0;
    }
    t && (this.p.length < 4 && c2(6, "invalid zlib data"), this.p = this.p.subarray(0, -4)), K2.prototype.c.call(this, t);
  }, n;
})();
var rt = /* @__PURE__ */ (function() {
  function n(r, t) {
    Fr([Mr, Pn, function() {
      return [d4, K2, _r];
    }], this, ur.call(this, r, t), function(e3) {
      var i3 = new _r(e3.data);
      onmessage = d4(i3);
    }, 11, 0);
  }
  __name(n, "n");
  return n;
})();
var xn = (function() {
  function n(r, t) {
    this.o = ur.call(this, r, t) || {}, this.G = dr, this.I = K2, this.Z = _r;
  }
  __name(n, "n");
  return n.prototype.i = function() {
    var r = this;
    this.s.ondata = function(t, e3) {
      r.ondata(t, e3);
    };
  }, n.prototype.push = function(r, t) {
    if (this.ondata || c2(5), this.s) this.s.push(r, t);
    else {
      if (this.p && this.p.length) {
        var e3 = new S3(this.p.length + r.length);
        e3.set(this.p), e3.set(r, this.p.length);
      } else this.p = r;
      this.p.length > 2 && (this.s = this.p[0] == 31 && this.p[1] == 139 && this.p[2] == 8 ? new this.G(this.o) : (this.p[0] & 15) != 8 || this.p[0] >> 4 > 7 || (this.p[0] << 8 | this.p[1]) % 31 ? new this.I(this.o) : new this.Z(this.o), this.i(), this.s.push(this.p, t), this.p = null);
    }
  }, n;
})();
var ft = (function() {
  function n(r, t) {
    xn.call(this, r, t), this.queuedSize = 0, this.G = bn, this.I = Hn, this.Z = rt;
  }
  __name(n, "n");
  return n.prototype.i = function() {
    var r = this;
    this.s.ondata = function(t, e3, i3) {
      r.ondata(t, e3, i3);
    }, this.s.ondrain = function(t) {
      r.queuedSize -= t, r.ondrain && r.ondrain(t);
    };
  }, n.prototype.push = function(r, t) {
    this.queuedSize += r.length, xn.prototype.push.call(this, r, t);
  }, n;
})();
var ln = /* @__PURE__ */ __name(function(n, r, t, e3) {
  for (var i3 in n) {
    var a3 = n[i3], o3 = r + i3, s4 = e3;
    Array.isArray(a3) && (s4 = Er(e3, a3[1]), a3 = a3[0]), a3 instanceof S3 ? t[o3] = [a3, s4] : (t[o3 += "/"] = [new S3(0), s4], ln(a3, o3, t, e3));
  }
}, "ln");
var zn = typeof TextEncoder < "u" && new TextEncoder();
var nn = typeof TextDecoder < "u" && new TextDecoder();
var Rn = 0;
try {
  nn.decode(ir, { stream: true }), Rn = 1;
} catch {
}
var kn = /* @__PURE__ */ __name(function(n) {
  for (var r = "", t = 0; ; ) {
    var e3 = n[t++], i3 = (e3 > 127) + (e3 > 223) + (e3 > 239);
    if (t + i3 > n.length) return { s: r, r: X2(n, t - 1) };
    i3 ? i3 == 3 ? (e3 = ((e3 & 15) << 18 | (n[t++] & 63) << 12 | (n[t++] & 63) << 6 | n[t++] & 63) - 65536, r += String.fromCharCode(55296 | e3 >> 10, 56320 | e3 & 1023)) : i3 & 1 ? r += String.fromCharCode((e3 & 31) << 6 | n[t++] & 63) : r += String.fromCharCode((e3 & 15) << 12 | (n[t++] & 63) << 6 | n[t++] & 63) : r += String.fromCharCode(e3);
  }
}, "kn");
var lt = (function() {
  function n(r) {
    this.ondata = r, Rn ? this.t = new TextDecoder() : this.p = ir;
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    if (this.ondata || c2(5), t = !!t, this.t) {
      this.ondata(this.t.decode(r, { stream: true }), t), t && (this.t.decode().length && c2(8), this.t = null);
      return;
    }
    this.p || c2(4);
    var e3 = new S3(this.p.length + r.length);
    e3.set(this.p), e3.set(r, this.p.length);
    var i3 = kn(e3), a3 = i3.s, o3 = i3.r;
    t ? (o3.length && c2(8), this.p = null) : this.p = o3, this.ondata(a3, t);
  }, n;
})();
var vt = (function() {
  function n(r) {
    this.ondata = r;
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    this.ondata || c2(5), this.d && c2(4), this.ondata(fr(r), this.d = t || false);
  }, n;
})();
function fr(n, r) {
  if (r) {
    for (var t = new S3(n.length), e3 = 0; e3 < n.length; ++e3) t[e3] = n.charCodeAt(e3);
    return t;
  }
  if (zn) return zn.encode(n);
  for (var i3 = n.length, a3 = new S3(n.length + (n.length >> 1)), o3 = 0, s4 = function(h3) {
    a3[o3++] = h3;
  }, e3 = 0; e3 < i3; ++e3) {
    if (o3 + 5 > a3.length) {
      var l3 = new S3(o3 + 8 + (i3 - e3 << 1));
      l3.set(a3), a3 = l3;
    }
    var f3 = n.charCodeAt(e3);
    f3 < 128 || r ? s4(f3) : f3 < 2048 ? (s4(192 | f3 >> 6), s4(128 | f3 & 63)) : f3 > 55295 && f3 < 57344 ? (f3 = 65536 + (f3 & 1047552) | n.charCodeAt(++e3) & 1023, s4(240 | f3 >> 18), s4(128 | f3 >> 12 & 63), s4(128 | f3 >> 6 & 63), s4(128 | f3 & 63)) : (s4(224 | f3 >> 12), s4(128 | f3 >> 6 & 63), s4(128 | f3 & 63));
  }
  return X2(a3, 0, o3);
}
__name(fr, "fr");
function Wn(n, r) {
  if (r) {
    for (var t = "", e3 = 0; e3 < n.length; e3 += 16384) t += String.fromCharCode.apply(null, n.subarray(e3, e3 + 16384));
    return t;
  } else {
    if (nn) return nn.decode(n);
    var i3 = kn(n), a3 = i3.s, t = i3.r;
    return t.length && c2(8), a3;
  }
}
__name(Wn, "Wn");
var Yn = /* @__PURE__ */ __name(function(n) {
  return n == 1 ? 3 : n < 6 ? 2 : n == 9 ? 1 : 0;
}, "Yn");
var jn = /* @__PURE__ */ __name(function(n, r) {
  return r + 30 + k5(n, r + 26) + k5(n, r + 28);
}, "jn");
var Jn = /* @__PURE__ */ __name(function(n, r, t) {
  var e3 = k5(n, r + 28), i3 = Wn(n.subarray(r + 46, r + 46 + e3), !(k5(n, r + 8) & 2048)), a3 = r + 46 + e3, o3 = $2(n, r + 20), s4 = t && o3 == 4294967295 ? Kn(n, a3) : [o3, $2(n, r + 24), $2(n, r + 42)], l3 = s4[0], f3 = s4[1], h3 = s4[2];
  return [k5(n, r + 10), l3, f3, i3, a3 + k5(n, r + 30) + k5(n, r + 32), h3];
}, "Jn");
var Kn = /* @__PURE__ */ __name(function(n, r) {
  for (; k5(n, r) != 1; r += 4 + k5(n, r + 2)) ;
  return [Kr(n, r + 12), Kr(n, r + 4), Kr(n, r + 20)];
}, "Kn");
var ar = /* @__PURE__ */ __name(function(n) {
  var r = 0;
  if (n) for (var t in n) {
    var e3 = n[t].length;
    e3 > 65535 && c2(9), r += e3 + 4;
  }
  return r;
}, "ar");
var wr = /* @__PURE__ */ __name(function(n, r, t, e3, i3, a3, o3, s4) {
  var l3 = e3.length, f3 = t.extra, h3 = s4 && s4.length, u4 = ar(f3);
  C2(n, r, o3 != null ? 33639248 : 67324752), r += 4, o3 != null && (n[r++] = 20, n[r++] = t.os), n[r] = 20, r += 2, n[r++] = t.flag << 1 | (a3 < 0 && 8), n[r++] = i3 && 8, n[r++] = t.compression & 255, n[r++] = t.compression >> 8;
  var v4 = new Date(t.mtime == null ? Date.now() : t.mtime), M3 = v4.getFullYear() - 1980;
  if ((M3 < 0 || M3 > 119) && c2(10), C2(n, r, M3 << 25 | v4.getMonth() + 1 << 21 | v4.getDate() << 16 | v4.getHours() << 11 | v4.getMinutes() << 5 | v4.getSeconds() >> 1), r += 4, a3 != -1 && (C2(n, r, t.crc), C2(n, r + 4, a3 < 0 ? -a3 - 2 : a3), C2(n, r + 8, t.size)), C2(n, r + 12, l3), C2(n, r + 14, u4), r += 16, o3 != null && (C2(n, r, h3), C2(n, r + 6, t.attrs), C2(n, r + 10, o3), r += 14), n.set(e3, r), r += l3, u4) for (var m3 in f3) {
    var z3 = f3[m3], p4 = z3.length;
    C2(n, r, +m3), C2(n, r + 2, p4), n.set(z3, r + 4), r += 4 + p4;
  }
  return h3 && (n.set(s4, r), r += h3), r;
}, "wr");
var vn = /* @__PURE__ */ __name(function(n, r, t, e3, i3) {
  C2(n, r, 101010256), C2(n, r + 8, t), C2(n, r + 10, t), C2(n, r + 12, e3), C2(n, r + 16, i3);
}, "vn");
var kr = (function() {
  function n(r) {
    this.filename = r, this.c = Ar(), this.size = 0, this.compression = 0;
  }
  __name(n, "n");
  return n.prototype.process = function(r, t) {
    this.ondata(null, r, t);
  }, n.prototype.push = function(r, t) {
    this.ondata || c2(5), this.c.p(r), this.size += r.length, t && (this.crc = this.c.d()), this.process(r, t || false);
  }, n;
})();
var ct = (function() {
  function n(r, t) {
    var e3 = this;
    t || (t = {}), kr.call(this, r), this.d = new b2(t, function(i3, a3) {
      e3.ondata(null, i3, a3);
    }), this.compression = 8, this.flag = Yn(t.level);
  }
  __name(n, "n");
  return n.prototype.process = function(r, t) {
    try {
      this.d.push(r, t);
    } catch (e3) {
      this.ondata(e3, null, t);
    }
  }, n.prototype.push = function(r, t) {
    kr.prototype.push.call(this, r, t);
  }, n;
})();
var pt = (function() {
  function n(r, t) {
    var e3 = this;
    t || (t = {}), kr.call(this, r), this.d = new Xn(t, function(i3, a3, o3) {
      e3.ondata(i3, a3, o3);
    }), this.compression = 8, this.flag = Yn(t.level), this.terminate = this.d.terminate;
  }
  __name(n, "n");
  return n.prototype.process = function(r, t) {
    this.d.push(r, t);
  }, n.prototype.push = function(r, t) {
    kr.prototype.push.call(this, r, t);
  }, n;
})();
var gt = (function() {
  function n(r) {
    this.ondata = r, this.u = [], this.d = 1;
  }
  __name(n, "n");
  return n.prototype.add = function(r) {
    var t = this;
    if (this.ondata || c2(5), this.d & 2) this.ondata(c2(4 + (this.d & 1) * 8, 0, 1), null, false);
    else {
      var e3 = fr(r.filename), i3 = e3.length, a3 = r.comment, o3 = a3 && fr(a3), s4 = i3 != r.filename.length || o3 && a3.length != o3.length, l3 = i3 + ar(r.extra) + 30;
      i3 > 65535 && this.ondata(c2(11, 0, 1), null, false);
      var f3 = new S3(l3);
      wr(f3, 0, r, e3, s4, -1);
      var h3 = [f3], u4 = /* @__PURE__ */ __name(function() {
        for (var p4 = 0, x5 = h3; p4 < x5.length; p4++) {
          var U2 = x5[p4];
          t.ondata(null, U2, false);
        }
        h3 = [];
      }, "u"), v4 = this.d;
      this.d = 0;
      var M3 = this.u.length, m3 = Er(r, { f: e3, u: s4, o: o3, t: /* @__PURE__ */ __name(function() {
        r.terminate && r.terminate();
      }, "t"), r: /* @__PURE__ */ __name(function() {
        if (u4(), v4) {
          var p4 = t.u[M3 + 1];
          p4 ? p4.r() : t.d = 1;
        }
        v4 = 1;
      }, "r") }), z3 = 0;
      r.ondata = function(p4, x5, U2) {
        if (p4) t.ondata(p4, x5, U2), t.terminate();
        else if (z3 += x5.length, h3.push(x5), U2) {
          var A3 = new S3(16);
          C2(A3, 0, 134695760), C2(A3, 4, r.crc), C2(A3, 8, z3), C2(A3, 12, r.size), h3.push(A3), m3.c = z3, m3.b = l3 + z3 + 16, m3.crc = r.crc, m3.size = r.size, v4 && m3.r(), v4 = 1;
        } else v4 && u4();
      }, this.u.push(m3);
    }
  }, n.prototype.end = function() {
    var r = this;
    if (this.d & 2) {
      this.ondata(c2(4 + (this.d & 1) * 8, 0, 1), null, true);
      return;
    }
    this.d ? this.e() : this.u.push({ r: /* @__PURE__ */ __name(function() {
      r.d & 1 && (r.u.splice(-1, 1), r.e());
    }, "r"), t: /* @__PURE__ */ __name(function() {
    }, "t") }), this.d = 3;
  }, n.prototype.e = function() {
    for (var r = 0, t = 0, e3 = 0, i3 = 0, a3 = this.u; i3 < a3.length; i3++) {
      var o3 = a3[i3];
      e3 += 46 + o3.f.length + ar(o3.extra) + (o3.o ? o3.o.length : 0);
    }
    for (var s4 = new S3(e3 + 22), l3 = 0, f3 = this.u; l3 < f3.length; l3++) {
      var o3 = f3[l3];
      wr(s4, r, o3, o3.f, o3.u, -o3.c - 2, t, o3.o), r += 46 + o3.f.length + ar(o3.extra) + (o3.o ? o3.o.length : 0), t += o3.b;
    }
    vn(s4, r, this.u.length, e3, t), this.ondata(null, s4, true), this.d = 2;
  }, n.prototype.terminate = function() {
    for (var r = 0, t = this.u; r < t.length; r++) {
      var e3 = t[r];
      e3.t();
    }
    this.d = 2;
  }, n;
})();
function wt(n, r) {
  r || (r = {});
  var t = {}, e3 = [];
  ln(n, "", t, r);
  var i3 = 0, a3 = 0;
  for (var o3 in t) {
    var s4 = t[o3], l3 = s4[0], f3 = s4[1], h3 = f3.level == 0 ? 0 : 8, u4 = fr(o3), v4 = u4.length, M3 = f3.comment, m3 = M3 && fr(M3), z3 = m3 && m3.length, p4 = ar(f3.extra);
    v4 > 65535 && c2(11);
    var x5 = h3 ? jr(l3, f3) : l3, U2 = x5.length, A3 = Ar();
    A3.p(l3), e3.push(Er(f3, { size: l3.length, crc: A3.d(), c: x5, f: u4, m: m3, u: v4 != o3.length || m3 && M3.length != z3, o: i3, compression: h3 })), i3 += 30 + v4 + p4 + U2, a3 += 76 + 2 * (v4 + p4) + (z3 || 0) + U2;
  }
  for (var y4 = new S3(a3 + 22), Z3 = i3, B2 = a3 - i3, D3 = 0; D3 < e3.length; ++D3) {
    var u4 = e3[D3];
    wr(y4, u4.o, u4, u4.f, u4.u, u4.c.length);
    var w4 = 30 + u4.f.length + ar(u4.extra);
    y4.set(u4.c, u4.o + w4), wr(y4, i3, u4, u4.f, u4.u, u4.c.length, u4.o, u4.m), i3 += 16 + w4 + (u4.m ? u4.m.length : 0);
  }
  return vn(y4, i3, e3.length, B2, Z3), y4;
}
__name(wt, "wt");
var tt = (function() {
  function n() {
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    this.ondata(null, r, t);
  }, n.compression = 0, n;
})();
var mt = (function() {
  function n() {
    var r = this;
    this.i = new K2(function(t, e3) {
      r.ondata(null, t, e3);
    });
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    try {
      this.i.push(r, t);
    } catch (e3) {
      this.ondata(e3, null, t);
    }
  }, n.compression = 8, n;
})();
var xt = (function() {
  function n(r, t) {
    var e3 = this;
    t < 32e4 ? this.i = new K2(function(i3, a3) {
      e3.ondata(null, i3, a3);
    }) : (this.i = new Hn(function(i3, a3, o3) {
      e3.ondata(i3, a3, o3);
    }), this.terminate = this.i.terminate);
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    this.i.terminate && (r = X2(r, 0)), this.i.push(r, t);
  }, n.compression = 8, n;
})();
var zt = (function() {
  function n(r) {
    this.onfile = r, this.k = [], this.o = { 0: tt }, this.p = ir;
  }
  __name(n, "n");
  return n.prototype.push = function(r, t) {
    var e3 = this;
    if (this.onfile || c2(5), this.p || c2(4), this.c > 0) {
      var i3 = Math.min(this.c, r.length), a3 = r.subarray(0, i3);
      if (this.c -= i3, this.d ? this.d.push(a3, !this.c) : this.k[0].push(a3), r = r.subarray(i3), r.length) return this.push(r, t);
    } else {
      var o3 = 0, s4 = 0, l3 = void 0, f3 = void 0;
      this.p.length ? r.length ? (f3 = new S3(this.p.length + r.length), f3.set(this.p), f3.set(r, this.p.length)) : f3 = this.p : f3 = r;
      for (var h3 = f3.length, u4 = this.c, v4 = u4 && this.d, M3 = function() {
        var x5, U2 = $2(f3, s4);
        if (U2 == 67324752) {
          o3 = 1, l3 = s4, m3.d = null, m3.c = 0;
          var A3 = k5(f3, s4 + 6), y4 = k5(f3, s4 + 8), Z3 = A3 & 2048, B2 = A3 & 8, D3 = k5(f3, s4 + 26), w4 = k5(f3, s4 + 28);
          if (h3 > s4 + 30 + D3 + w4) {
            var g3 = [];
            m3.k.unshift(g3), o3 = 2;
            var F3 = $2(f3, s4 + 18), T2 = $2(f3, s4 + 22), O3 = Wn(f3.subarray(s4 + 30, s4 += 30 + D3), !Z3);
            F3 == 4294967295 ? (x5 = B2 ? [-2] : Kn(f3, s4), F3 = x5[0], T2 = x5[1]) : B2 && (F3 = -1), s4 += w4, m3.c = F3;
            var H3, G2 = { name: O3, compression: y4, start: /* @__PURE__ */ __name(function() {
              if (G2.ondata || c2(5), !F3) G2.ondata(null, ir, true);
              else {
                var L3 = e3.o[y4];
                L3 || G2.ondata(c2(14, "unknown compression type " + y4, 1), null, false), H3 = F3 < 0 ? new L3(O3) : new L3(O3, F3, T2), H3.ondata = function(N3, sr, Y2) {
                  G2.ondata(N3, sr, Y2);
                };
                for (var q3 = 0, E5 = g3; q3 < E5.length; q3++) {
                  var R2 = E5[q3];
                  H3.push(R2, false);
                }
                e3.k[0] == g3 && e3.c ? e3.d = H3 : H3.push(ir, true);
              }
            }, "start"), terminate: /* @__PURE__ */ __name(function() {
              H3 && H3.terminate && H3.terminate();
            }, "terminate") };
            F3 >= 0 && (G2.size = F3, G2.originalSize = T2), m3.onfile(G2);
          }
          return "break";
        } else if (u4) {
          if (U2 == 134695760) return l3 = s4 += 12 + (u4 == -2 && 8), o3 = 3, m3.c = 0, "break";
          if (U2 == 33639248) return l3 = s4 -= 4, o3 = 3, m3.c = 0, "break";
        }
      }, m3 = this; s4 < h3 - 4; ++s4) {
        var z3 = M3();
        if (z3 === "break") break;
      }
      if (this.p = ir, u4 < 0) {
        var p4 = o3 ? f3.subarray(0, l3 - 12 - (u4 == -2 && 8) - ($2(f3, l3 - 16) == 134695760 && 4)) : f3.subarray(0, s4);
        v4 ? v4.push(p4, !!o3) : this.k[+(o3 == 2)].push(p4);
      }
      if (o3 & 2) return this.push(f3.subarray(s4), t);
      this.p = f3.subarray(s4);
    }
    t && (this.c && c2(13), this.p = null);
  }, n.prototype.register = function(r) {
    this.o[r.compression] = r;
  }, n;
})();
function Mt(n, r) {
  for (var t = {}, e3 = n.length - 22; $2(n, e3) != 101010256; --e3) (!e3 || n.length - e3 > 65558) && c2(13);
  var i3 = k5(n, e3 + 8);
  if (!i3) return {};
  var a3 = $2(n, e3 + 16), o3 = a3 == 4294967295 || i3 == 65535;
  if (o3) {
    var s4 = $2(n, e3 - 12);
    o3 = $2(n, s4) == 101075792, o3 && (i3 = $2(n, s4 + 32), a3 = $2(n, s4 + 48));
  }
  for (var l3 = r && r.filter, f3 = 0; f3 < i3; ++f3) {
    var h3 = Jn(n, a3, o3), u4 = h3[0], v4 = h3[1], M3 = h3[2], m3 = h3[3], z3 = h3[4], p4 = h3[5], x5 = jn(n, p4);
    a3 = z3, (!l3 || l3({ name: m3, size: v4, originalSize: M3, compression: u4 })) && (u4 ? u4 == 8 ? t[m3] = Gr(n.subarray(x5, x5 + v4), { out: new S3(M3) }) : c2(14, "unknown compression type " + u4) : t[m3] = X2(n, x5, x5 + v4));
  }
  return t;
}
__name(Mt, "Mt");

// packages/worker-db/src/db.ts
var storeCache = /* @__PURE__ */ new Map();
function getCustomStore(dbName, storeName = "keyval") {
  if (!dbName) return void 0;
  const cacheKey = `${dbName}:${storeName}`;
  if (!storeCache.has(cacheKey)) {
    storeCache.set(cacheKey, f2(dbName, storeName));
  }
  return storeCache.get(cacheKey);
}
__name(getCustomStore, "getCustomStore");
function formatDbEntries(rawEntries, prefix) {
  let items = rawEntries;
  if (prefix) {
    items = items.filter(([k6]) => typeof k6 === "string" && k6.startsWith(prefix));
  }
  return items.map(([k6, v4]) => formatDbItem(k6, v4, prefix));
}
__name(formatDbEntries, "formatDbEntries");
async function getRecordDir(basePath = "", rawKey, create = false) {
  const root = await navigator.storage.getDirectory();
  const fullPath = basePath ? `${basePath}/${rawKey}` : rawKey;
  const parts = fullPath.split("/").filter(Boolean);
  let curr = root;
  for (const p4 of parts) curr = await curr.getDirectoryHandle(p4, {
    create
  });
  return curr;
}
__name(getRecordDir, "getRecordDir");
var globalSwDbAPI = {
  get: /* @__PURE__ */ __name(async (key, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const val = await d3(rawKey, store);
    return val !== void 0 ? formatDbItem(rawKey, val, opts?.prefix) : void 0;
  }, "get"),
  set: /* @__PURE__ */ __name(async (keyOrVal, val, opts) => {
    let keyToSave;
    let valToSave;
    let options = opts || {};
    if (typeof keyOrVal !== "string") {
      keyToSave = void 0;
      valToSave = keyOrVal;
      if (val) options = val;
    } else {
      keyToSave = keyOrVal;
      valToSave = val;
    }
    const store = getCustomStore(options.dbName, options.storeName);
    const { key, cleanVal } = prepareForSave(keyToSave, valToSave, options.prefix);
    await y3(key, cleanVal, store);
    return key;
  }, "set"),
  update: /* @__PURE__ */ __name(async (key, updater, opts) => {
    const currentVal = await globalSwDbAPI.get(key, opts);
    const newVal = updater(currentVal);
    await globalSwDbAPI.set(key, newVal, opts);
  }, "update"),
  patch: /* @__PURE__ */ __name(async (key, patchOrFn, context, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const current = await d3(rawKey, store) || {};
    let updated;
    if (typeof patchOrFn === "function") {
      updated = patchOrFn(formatDbItem(rawKey, current, opts?.prefix), context);
    } else {
      updated = Object.assign({}, current, patchOrFn);
    }
    const { key: finalKey, cleanVal } = prepareForSave(rawKey, updated, opts?.prefix);
    await y3(finalKey, cleanVal, store);
    return formatDbItem(finalKey, cleanVal, opts?.prefix);
  }, "patch"),
  delete: /* @__PURE__ */ __name(async (key, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    await m2(rawKey, store);
  }, "delete"),
  getMany: /* @__PURE__ */ __name(async (keysList, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const fullKeys = keysList.map((k6) => opts?.prefix && !k6.startsWith(opts.prefix) ? `${opts.prefix}${k6}` : k6);
    const rawValues = await p3(fullKeys, store);
    return rawValues.map((val, idx) => val !== void 0 ? formatDbItem(fullKeys[idx], val, opts?.prefix) : void 0);
  }, "getMany"),
  setMany: /* @__PURE__ */ __name(async (entriesList, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const entriesToSet = entriesList.map(([k6, v4]) => {
      const { key, cleanVal } = prepareForSave(k6, v4, opts?.prefix);
      return [
        key,
        cleanVal
      ];
    });
    await h2(entriesToSet, store);
  }, "setMany"),
  deleteMany: /* @__PURE__ */ __name(async (keysList, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const fullKeys = keysList.map((k6) => opts?.prefix && !k6.startsWith(opts.prefix) ? `${opts.prefix}${k6}` : k6);
    await w3(fullKeys, store);
  }, "deleteMany"),
  keys: /* @__PURE__ */ __name(async (opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allKeys = await v3(store);
    return opts?.prefix ? allKeys.filter((k6) => typeof k6 === "string" && k6.startsWith(opts.prefix)) : allKeys;
  }, "keys"),
  values: /* @__PURE__ */ __name(async (opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await k4(store);
    return formatDbEntries(allEntries, opts?.prefix);
  }, "values"),
  entries: /* @__PURE__ */ __name(async (opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await k4(store);
    return opts?.prefix ? allEntries.filter(([k6]) => typeof k6 === "string" && k6.startsWith(opts.prefix)) : allEntries;
  }, "entries"),
  clear: /* @__PURE__ */ __name(async (opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    if (opts?.prefix) {
      const allKeys = await v3(store);
      const keysToDelete = allKeys.filter((k6) => typeof k6 === "string" && k6.startsWith(opts.prefix));
      await w3(keysToDelete, store);
    } else {
      await A2(store);
    }
  }, "clear"),
  query: /* @__PURE__ */ __name(async (fn2, context, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await k4(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    return fn2(formattedItems, context);
  }, "query"),
  getSome: /* @__PURE__ */ __name(async (fn2, context, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await k4(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    const selectedItems = fn2(formattedItems, context);
    if (!Array.isArray(selectedItems)) {
      throw new Error("A fun\xE7\xE3o injetada em GET_SOME deve retornar um Array.");
    }
    return selectedItems;
  }, "getSome"),
  delSome: /* @__PURE__ */ __name(async (fn2, context, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await k4(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    const selectedItems = fn2(formattedItems, context);
    if (!Array.isArray(selectedItems)) {
      throw new Error("A fun\xE7\xE3o injetada em DEL_SOME deve retornar um Array.");
    }
    const keysToDelete = selectedItems.map((item) => {
      if (!item || item._id === void 0) {
        throw new Error("Os itens retornados em DEL_SOME precisam conter a propriedade '_id'.");
      }
      return opts?.prefix && !item._id.startsWith(opts.prefix) ? `${opts.prefix}${item._id}` : item._id;
    });
    await w3(keysToDelete, store);
  }, "delSome"),
  setSome: /* @__PURE__ */ __name(async (selectFn, updateFn, context, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const rawEntries = await k4(store);
    const formattedItems = formatDbEntries(rawEntries, opts?.prefix);
    const selectedItems = selectFn(formattedItems, context);
    if (!Array.isArray(selectedItems)) {
      throw new Error("A fun\xE7\xE3o de sele\xE7\xE3o em SET_SOME deve retornar um Array.");
    }
    const entriesToSet = selectedItems.map((item) => {
      if (!item || item._id === void 0) {
        throw new Error("Os itens selecionados no SET_SOME precisam conter a propriedade '_id'.");
      }
      const updatedItem = updateFn(item, context);
      const { key, cleanVal } = prepareForSave(void 0, updatedItem, opts?.prefix);
      return [
        key,
        cleanVal
      ];
    });
    await h2(entriesToSet, store);
  }, "setSome"),
  exportDB: /* @__PURE__ */ __name(async (opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await k4(store);
    const filtered = opts?.prefix ? allEntries.filter(([k6]) => typeof k6 === "string" && k6.startsWith(opts.prefix)) : allEntries;
    return Object.fromEntries(filtered);
  }, "exportDB"),
  importDB: /* @__PURE__ */ __name(async (data, clearFirst = false, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    if (clearFirst) await globalSwDbAPI.clear(opts);
    const entriesToImport = Object.entries(data).map(([k6, v4]) => {
      const { key, cleanVal } = prepareForSave(k6, v4, opts?.prefix);
      return [
        key,
        cleanVal
      ];
    });
    await h2(entriesToImport, store);
  }, "importDB"),
  backupToOpfs: /* @__PURE__ */ __name(async (key, fileName, opts) => {
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    const allEntries = await k4(store);
    const filtered = opts?.prefix ? allEntries.filter(([k6]) => typeof k6 === "string" && k6.startsWith(opts.prefix)) : allEntries;
    const data = Object.fromEntries(filtered);
    const finalName = fileName || "backup.json";
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir("backup", rawKey, true);
    const fileHandle = await dir.getFileHandle(finalName, {
      create: true
    });
    const w4 = await fileHandle.createWritable();
    await w4.write(new Blob([
      JSON.stringify(data)
    ], {
      type: "application/json"
    }));
    await w4.close();
    return `${rawKey}/${finalName}`;
  }, "backupToOpfs"),
  restoreFromOpfs: /* @__PURE__ */ __name(async (key, fileName, clearFirst = false, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir("backup", rawKey, false);
    const finalName = fileName.includes("/") ? fileName.split("/").pop() : fileName;
    const fileHandle = await dir.getFileHandle(finalName);
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text());
    const store = getCustomStore(opts?.dbName, opts?.storeName);
    if (clearFirst) await globalSwDbAPI.clear(opts);
    const entriesToImport = Object.entries(data).map(([k6, v4]) => {
      const { key: key2, cleanVal } = prepareForSave(k6, v4, opts?.prefix);
      return [
        key2,
        cleanVal
      ];
    });
    await h2(entriesToImport, store);
  }, "restoreFromOpfs")
};
var globalSwOpfsAPI = {
  ...globalSwDbAPI,
  listFiles: /* @__PURE__ */ __name(async (key, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, true);
    const filesList = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file") {
        const file = await handle.getFile();
        filesList.push({
          name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        });
      }
    }
    return filesList;
  }, "listFiles"),
  getFile: /* @__PURE__ */ __name(async (key, fileName, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  }, "getFile"),
  addFile: /* @__PURE__ */ __name(async (key, file, fileName, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, true);
    const fh = await dir.getFileHandle(fileName, {
      create: true
    });
    const w4 = await fh.createWritable();
    await w4.write(new Blob([
      await file.arrayBuffer()
    ]));
    await w4.close();
  }, "addFile"),
  delFile: /* @__PURE__ */ __name(async (key, fileName, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    await dir.removeEntry(fileName);
  }, "delFile"),
  renFile: /* @__PURE__ */ __name(async (key, oldName, newName, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const oldFile = await dir.getFileHandle(oldName);
    const fileData = await oldFile.getFile();
    const newFile = await dir.getFileHandle(newName, {
      create: true
    });
    const w4 = await newFile.createWritable();
    await w4.write(new Blob([
      await fileData.arrayBuffer()
    ]));
    await w4.close();
    await dir.removeEntry(oldName);
  }, "renFile"),
  mvFile: /* @__PURE__ */ __name(async (key, fileName, newKey, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const fileHandle = await dir.getFileHandle(fileName);
    const fileData = await fileHandle.getFile();
    const rawNewKey = opts?.prefix && !newKey.startsWith(opts.prefix) ? `${opts.prefix}${newKey}` : newKey;
    const targetDir = await getRecordDir(opts?.basePath, rawNewKey, true);
    const newFile = await targetDir.getFileHandle(fileName, {
      create: true
    });
    const w4 = await newFile.createWritable();
    await w4.write(new Blob([
      await fileData.arrayBuffer()
    ]));
    await w4.close();
    await dir.removeEntry(fileName);
  }, "mvFile"),
  zip: /* @__PURE__ */ __name(async (key, zipName, filesToZip, deleteOriginals = false, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const filesRecord = {};
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file" && (!filesToZip || filesToZip.includes(name))) {
        const f3 = await handle.getFile();
        filesRecord[name] = new Uint8Array(await f3.arrayBuffer());
      }
    }
    const zippedData = wt(filesRecord);
    const zipFileHandle = await dir.getFileHandle(zipName, {
      create: true
    });
    const w4 = await zipFileHandle.createWritable();
    await w4.write(new Blob([
      zippedData
    ]));
    await w4.close();
    if (deleteOriginals) {
      for (const name of Object.keys(filesRecord)) {
        await dir.removeEntry(name);
      }
    }
  }, "zip"),
  unzip: /* @__PURE__ */ __name(async (key, zipName, deleteZip = false, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const zipFileHandle = await dir.getFileHandle(zipName);
    const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer());
    const unzipped = Mt(zipBuffer);
    for (const [name, data] of Object.entries(unzipped)) {
      if (!name.includes("/")) {
        const fh = await dir.getFileHandle(name, {
          create: true
        });
        const w4 = await fh.createWritable();
        await w4.write(new Blob([
          data
        ]));
        await w4.close();
      }
    }
    if (deleteZip) await dir.removeEntry(zipName);
  }, "unzip"),
  addZip: /* @__PURE__ */ __name(async (key, zipName, file, fileName, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const zipFileHandle = await dir.getFileHandle(zipName);
    const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer());
    const currentZipData = Mt(zipBuffer);
    currentZipData[fileName] = new Uint8Array(await file.arrayBuffer());
    const newZippedData = wt(currentZipData);
    const w4 = await zipFileHandle.createWritable();
    await w4.write(new Blob([
      newZippedData
    ]));
    await w4.close();
  }, "addZip"),
  delZip: /* @__PURE__ */ __name(async (key, zipName, fileName, opts) => {
    const rawKey = opts?.prefix && !key.startsWith(opts.prefix) ? `${opts.prefix}${key}` : key;
    const dir = await getRecordDir(opts?.basePath, rawKey, false);
    const zipFileHandle = await dir.getFileHandle(zipName);
    const zipBuffer = new Uint8Array(await (await zipFileHandle.getFile()).arrayBuffer());
    const currentZipData = Mt(zipBuffer);
    delete currentZipData[fileName];
    const newZippedData = wt(currentZipData);
    const w4 = await zipFileHandle.createWritable();
    await w4.write(new Blob([
      newZippedData
    ]));
    await w4.close();
  }, "delZip")
};
function createScopedDb(dbName, storeName = "keyval", prefix = "") {
  const opts = {
    dbName,
    storeName,
    prefix
  };
  return {
    get: /* @__PURE__ */ __name((key) => globalSwDbAPI.get(key, opts), "get"),
    set: /* @__PURE__ */ __name((keyOrVal, val) => globalSwDbAPI.set(keyOrVal, val, opts), "set"),
    update: /* @__PURE__ */ __name((key, updater) => globalSwDbAPI.update(key, updater, opts), "update"),
    patch: /* @__PURE__ */ __name((key, patchOrFn, context) => globalSwDbAPI.patch(key, patchOrFn, context, opts), "patch"),
    delete: /* @__PURE__ */ __name((key) => globalSwDbAPI.delete(key, opts), "delete"),
    getMany: /* @__PURE__ */ __name((keys) => globalSwDbAPI.getMany(keys, opts), "getMany"),
    setMany: /* @__PURE__ */ __name((entries) => globalSwDbAPI.setMany(entries, opts), "setMany"),
    deleteMany: /* @__PURE__ */ __name((keys) => globalSwDbAPI.deleteMany(keys, opts), "deleteMany"),
    keys: /* @__PURE__ */ __name(() => globalSwDbAPI.keys(opts), "keys"),
    values: /* @__PURE__ */ __name(() => globalSwDbAPI.values(opts), "values"),
    entries: /* @__PURE__ */ __name(() => globalSwDbAPI.entries(opts), "entries"),
    clear: /* @__PURE__ */ __name(() => globalSwDbAPI.clear(opts), "clear"),
    query: /* @__PURE__ */ __name((fn2, context) => globalSwDbAPI.query(fn2, context, opts), "query"),
    getSome: /* @__PURE__ */ __name((fn2, context) => globalSwDbAPI.getSome(fn2, context, opts), "getSome"),
    delSome: /* @__PURE__ */ __name((fn2, context) => globalSwDbAPI.delSome(fn2, context, opts), "delSome"),
    setSome: /* @__PURE__ */ __name((selectFn, updateFn, context) => globalSwDbAPI.setSome(selectFn, updateFn, context, opts), "setSome"),
    exportDB: /* @__PURE__ */ __name(() => globalSwDbAPI.exportDB(opts), "exportDB"),
    importDB: /* @__PURE__ */ __name((data, clearFirst = false) => globalSwDbAPI.importDB(data, clearFirst, opts), "importDB"),
    backupToOpfs: /* @__PURE__ */ __name((key, fileName) => globalSwDbAPI.backupToOpfs(key, fileName, opts), "backupToOpfs"),
    restoreFromOpfs: /* @__PURE__ */ __name((key, fileName, clearFirst = false) => globalSwDbAPI.restoreFromOpfs(key, fileName, clearFirst, opts), "restoreFromOpfs"),
    gerarId,
    gerarIdComPrefixo: /* @__PURE__ */ __name(() => prefix ? gerarIdComPrefixo(prefix) : gerarId(), "gerarIdComPrefixo")
  };
}
__name(createScopedDb, "createScopedDb");
function createScopedOpfs(dbName, storeName = "keyval", prefix = "", basePath = "") {
  const opts = {
    dbName,
    storeName,
    prefix,
    basePath
  };
  return {
    ...createScopedDb(dbName, storeName, prefix),
    listFiles: /* @__PURE__ */ __name((key) => globalSwOpfsAPI.listFiles(key, opts), "listFiles"),
    getFile: /* @__PURE__ */ __name((key, fileName) => globalSwOpfsAPI.getFile(key, fileName, opts), "getFile"),
    addFile: /* @__PURE__ */ __name((key, file, fileName) => globalSwOpfsAPI.addFile(key, file, fileName, opts), "addFile"),
    delFile: /* @__PURE__ */ __name((key, fileName) => globalSwOpfsAPI.delFile(key, fileName, opts), "delFile"),
    renFile: /* @__PURE__ */ __name((key, oldName, newName) => globalSwOpfsAPI.renFile(key, oldName, newName, opts), "renFile"),
    mvFile: /* @__PURE__ */ __name((key, fileName, newKey) => globalSwOpfsAPI.mvFile(key, fileName, newKey, opts), "mvFile"),
    zip: /* @__PURE__ */ __name((key, zipName, filesToZip, deleteOriginals = false) => globalSwOpfsAPI.zip(key, zipName, filesToZip, deleteOriginals, opts), "zip"),
    unzip: /* @__PURE__ */ __name((key, zipName, deleteZip = false) => globalSwOpfsAPI.unzip(key, zipName, deleteZip, opts), "unzip"),
    addZip: /* @__PURE__ */ __name((key, zipName, file, fileName) => globalSwOpfsAPI.addZip(key, zipName, file, fileName, opts), "addZip"),
    delZip: /* @__PURE__ */ __name((key, zipName, fileName) => globalSwOpfsAPI.delZip(key, zipName, fileName, opts), "delZip")
  };
}
__name(createScopedOpfs, "createScopedOpfs");
var db = Object.assign((dbName, storeName, prefix) => createScopedDb(dbName, storeName, prefix), globalSwDbAPI);
var opfs2 = Object.assign((dbName, storeName, prefix, basePath = "") => createScopedOpfs(dbName, storeName, prefix, basePath), globalSwOpfsAPI);

// packages/worker-db/src/rpc.ts
var workerInstance = null;
var currentWorkerPath = "./worker-db.js";
var pendingRequests = /* @__PURE__ */ new Map();
function getWorker(workerPath) {
  if (workerPath) {
    currentWorkerPath = workerPath;
  }
  if (!workerInstance) {
    const workerUrl = typeof currentWorkerPath === "string" ? new URL(currentWorkerPath, import.meta.url) : currentWorkerPath;
    workerInstance = new Worker(workerUrl, {
      type: "module"
    });
    workerInstance.onmessage = (e3) => {
      const { requestId, success, result, error } = e3.data;
      const promise = pendingRequests.get(requestId);
      if (promise) {
        if (success) promise.resolve(result);
        else promise.reject(new Error(error));
        pendingRequests.delete(requestId);
      }
    };
    workerInstance.onerror = (event) => {
      console.error("\u26A0\uFE0F Falha cr\xEDtica no Web Worker:", event.message);
      pendingRequests.forEach(({ reject }) => reject(new Error("Worker crashed")));
      pendingRequests.clear();
      restartWorker();
    };
  }
  return workerInstance;
}
__name(getWorker, "getWorker");
function restartWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pendingRequests.forEach(({ reject }) => reject(new Error("Worker foi reiniciado")));
  pendingRequests.clear();
  getWorker();
}
__name(restartWorker, "restartWorker");
function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}
__name(terminateWorker, "terminateWorker");
function exec(command, args = {}) {
  return new Promise((resolve, reject) => {
    const requestId = gerarId();
    pendingRequests.set(requestId, {
      resolve,
      reject
    });
    try {
      getWorker().postMessage({
        requestId,
        command,
        args
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      reject(err);
    }
  });
}
__name(exec, "exec");
var globalDbAPI = {
  get: /* @__PURE__ */ __name((key, opts) => exec("GET", {
    key,
    ...opts
  }), "get"),
  set: /* @__PURE__ */ __name((keyOrVal, val, opts) => {
    if (typeof keyOrVal !== "string") {
      const options = opts || val || {};
      return exec("SET", {
        key: void 0,
        val: keyOrVal,
        ...options
      });
    }
    return exec("SET", {
      key: keyOrVal,
      val,
      ...opts
    });
  }, "set"),
  update: /* @__PURE__ */ __name(async (key, updater, opts) => {
    const currentVal = await exec("GET", {
      key,
      ...opts
    });
    const newVal = updater(currentVal);
    await exec("SET", {
      key,
      val: newVal,
      ...opts
    });
  }, "update"),
  patch: /* @__PURE__ */ __name((key, patchOrFn, context, opts) => {
    const isFn = typeof patchOrFn === "function";
    return exec("PATCH", {
      key,
      patch: isFn ? void 0 : patchOrFn,
      fnStr: isFn ? patchOrFn.toString() : void 0,
      context,
      ...opts
    });
  }, "patch"),
  delete: /* @__PURE__ */ __name((key, opts) => exec("DELETE", {
    key,
    ...opts
  }), "delete"),
  getMany: /* @__PURE__ */ __name((keys, opts) => exec("GET_MANY", {
    keys,
    ...opts
  }), "getMany"),
  setMany: /* @__PURE__ */ __name((entries, opts) => exec("SET_MANY", {
    entries,
    ...opts
  }), "setMany"),
  deleteMany: /* @__PURE__ */ __name((keys, opts) => exec("DEL_MANY", {
    keys,
    ...opts
  }), "deleteMany"),
  keys: /* @__PURE__ */ __name((opts) => exec("KEYS", {
    ...opts
  }), "keys"),
  values: /* @__PURE__ */ __name((opts) => exec("VALUES", {
    ...opts
  }), "values"),
  entries: /* @__PURE__ */ __name((opts) => exec("ENTRIES", {
    ...opts
  }), "entries"),
  clear: /* @__PURE__ */ __name((opts) => exec("CLEAR", {
    ...opts
  }), "clear"),
  query: /* @__PURE__ */ __name((fn2, context, opts) => exec("QUERY", {
    fnStr: fn2.toString(),
    context,
    ...opts
  }), "query"),
  getSome: /* @__PURE__ */ __name((fn2, context, opts) => exec("GET_SOME", {
    fnStr: fn2.toString(),
    context,
    ...opts
  }), "getSome"),
  delSome: /* @__PURE__ */ __name((fn2, context, opts) => exec("DEL_SOME", {
    fnStr: fn2.toString(),
    context,
    ...opts
  }), "delSome"),
  setSome: /* @__PURE__ */ __name((selectFn, updateFn, context, opts) => exec("SET_SOME", {
    selectFnStr: selectFn.toString(),
    updateFnStr: updateFn.toString(),
    context,
    ...opts
  }), "setSome"),
  exportDB: /* @__PURE__ */ __name((opts) => exec("EXPORT", {
    ...opts
  }), "exportDB"),
  importDB: /* @__PURE__ */ __name((data, clearFirst = false, opts) => exec("IMPORT", {
    data,
    clearFirst,
    ...opts
  }), "importDB"),
  backupToOpfs: /* @__PURE__ */ __name((key, fileName, opts) => exec("BACKUP_OPFS", {
    key,
    fileName,
    ...opts
  }), "backupToOpfs"),
  restoreFromOpfs: /* @__PURE__ */ __name((key, fileName, clearFirst = false, opts) => exec("RESTORE_OPFS", {
    key,
    fileName,
    clearFirst,
    ...opts
  }), "restoreFromOpfs"),
  init: /* @__PURE__ */ __name((workerPath) => {
    getWorker(workerPath);
  }, "init"),
  restart: /* @__PURE__ */ __name(() => restartWorker(), "restart"),
  terminate: /* @__PURE__ */ __name(() => terminateWorker(), "terminate")
};
function createScopedDb2(dbName, storeName = "keyval", prefix = "") {
  const opts = {
    dbName,
    storeName,
    prefix
  };
  return {
    get: /* @__PURE__ */ __name((key) => globalDbAPI.get(key, opts), "get"),
    set: /* @__PURE__ */ __name((keyOrVal, val) => globalDbAPI.set(keyOrVal, val, opts), "set"),
    update: /* @__PURE__ */ __name((key, updater) => globalDbAPI.update(key, updater, opts), "update"),
    patch: /* @__PURE__ */ __name((key, patchOrFn, context) => globalDbAPI.patch(key, patchOrFn, context, opts), "patch"),
    delete: /* @__PURE__ */ __name((key) => globalDbAPI.delete(key, opts), "delete"),
    getMany: /* @__PURE__ */ __name((keys) => globalDbAPI.getMany(keys, opts), "getMany"),
    setMany: /* @__PURE__ */ __name((entries) => globalDbAPI.setMany(entries, opts), "setMany"),
    deleteMany: /* @__PURE__ */ __name((keys) => globalDbAPI.deleteMany(keys, opts), "deleteMany"),
    keys: /* @__PURE__ */ __name(() => globalDbAPI.keys(opts), "keys"),
    values: /* @__PURE__ */ __name(() => globalDbAPI.values(opts), "values"),
    entries: /* @__PURE__ */ __name(() => globalDbAPI.entries(opts), "entries"),
    clear: /* @__PURE__ */ __name(() => globalDbAPI.clear(opts), "clear"),
    query: /* @__PURE__ */ __name((fn2, context) => globalDbAPI.query(fn2, context, opts), "query"),
    getSome: /* @__PURE__ */ __name((fn2, context) => globalDbAPI.getSome(fn2, context, opts), "getSome"),
    delSome: /* @__PURE__ */ __name((fn2, context) => globalDbAPI.delSome(fn2, context, opts), "delSome"),
    setSome: /* @__PURE__ */ __name((selectFn, updateFn, context) => globalDbAPI.setSome(selectFn, updateFn, context, opts), "setSome"),
    exportDB: /* @__PURE__ */ __name(() => globalDbAPI.exportDB(opts), "exportDB"),
    importDB: /* @__PURE__ */ __name((data, clearFirst = false) => globalDbAPI.importDB(data, clearFirst, opts), "importDB"),
    backupToOpfs: /* @__PURE__ */ __name((key, fileName) => globalDbAPI.backupToOpfs(key, fileName, opts), "backupToOpfs"),
    restoreFromOpfs: /* @__PURE__ */ __name((key, fileName, clearFirst = false) => globalDbAPI.restoreFromOpfs(key, fileName, clearFirst, opts), "restoreFromOpfs"),
    gerarId,
    gerarIdComPrefixo: /* @__PURE__ */ __name(() => prefix ? gerarIdComPrefixo(prefix) : gerarId(), "gerarIdComPrefixo")
  };
}
__name(createScopedDb2, "createScopedDb");
var globalOpfsAPI = {
  ...globalDbAPI,
  listFiles: /* @__PURE__ */ __name((key, opts) => exec("OPFS_LIST", {
    key,
    ...opts
  }), "listFiles"),
  getFile: /* @__PURE__ */ __name((key, fileName, opts) => exec("OPFS_GET", {
    key,
    fileName,
    ...opts
  }), "getFile"),
  addFile: /* @__PURE__ */ __name((key, file, fileName, opts) => exec("OPFS_ADD", {
    key,
    file,
    fileName,
    ...opts
  }), "addFile"),
  delFile: /* @__PURE__ */ __name((key, fileName, opts) => exec("OPFS_DEL", {
    key,
    fileName,
    ...opts
  }), "delFile"),
  renFile: /* @__PURE__ */ __name((key, oldName, newName, opts) => exec("OPFS_REN", {
    key,
    oldName,
    newName,
    ...opts
  }), "renFile"),
  mvFile: /* @__PURE__ */ __name((key, fileName, newKey, opts) => exec("OPFS_MV", {
    key,
    fileName,
    newKey,
    ...opts
  }), "mvFile"),
  zip: /* @__PURE__ */ __name((key, zipName, filesToZip, deleteOriginals = false, opts) => exec("OPFS_ZIP", {
    key,
    zipName,
    filesToZip,
    deleteOriginals,
    ...opts
  }), "zip"),
  unzip: /* @__PURE__ */ __name((key, zipName, deleteZip = false, opts) => exec("OPFS_UNZIP", {
    key,
    zipName,
    deleteZip,
    ...opts
  }), "unzip"),
  addZip: /* @__PURE__ */ __name((key, zipName, file, fileName, opts) => exec("OPFS_ADDZIP", {
    key,
    zipName,
    file,
    fileName,
    ...opts
  }), "addZip"),
  delZip: /* @__PURE__ */ __name((key, zipName, fileName, opts) => exec("OPFS_DELZIP", {
    key,
    zipName,
    fileName,
    ...opts
  }), "delZip")
};
function createScopedOpfs2(dbName, storeName = "keyval", prefix = "", basePath = "") {
  const opts = {
    dbName,
    storeName,
    prefix,
    basePath
  };
  return {
    ...createScopedDb2(dbName, storeName, prefix),
    listFiles: /* @__PURE__ */ __name((key) => globalOpfsAPI.listFiles(key, opts), "listFiles"),
    getFile: /* @__PURE__ */ __name((key, fileName) => globalOpfsAPI.getFile(key, fileName, opts), "getFile"),
    addFile: /* @__PURE__ */ __name((key, file, fileName) => globalOpfsAPI.addFile(key, file, fileName, opts), "addFile"),
    delFile: /* @__PURE__ */ __name((key, fileName) => globalOpfsAPI.delFile(key, fileName, opts), "delFile"),
    renFile: /* @__PURE__ */ __name((key, oldName, newName) => globalOpfsAPI.renFile(key, oldName, newName, opts), "renFile"),
    mvFile: /* @__PURE__ */ __name((key, fileName, newKey) => globalOpfsAPI.mvFile(key, fileName, newKey, opts), "mvFile"),
    zip: /* @__PURE__ */ __name((key, zipName, filesToZip, deleteOriginals = false) => globalOpfsAPI.zip(key, zipName, filesToZip, deleteOriginals, opts), "zip"),
    unzip: /* @__PURE__ */ __name((key, zipName, deleteZip = false) => globalOpfsAPI.unzip(key, zipName, deleteZip, opts), "unzip"),
    addZip: /* @__PURE__ */ __name((key, zipName, file, fileName) => globalOpfsAPI.addZip(key, zipName, file, fileName, opts), "addZip"),
    delZip: /* @__PURE__ */ __name((key, zipName, fileName) => globalOpfsAPI.delZip(key, zipName, fileName, opts), "delZip")
  };
}
__name(createScopedOpfs2, "createScopedOpfs");
var db2 = Object.assign((dbName, storeName, prefix) => createScopedDb2(dbName, storeName, prefix), globalDbAPI);
var opfs = Object.assign((dbName, storeName, prefix, basePath = "") => createScopedOpfs2(dbName, storeName, prefix, basePath), globalOpfsAPI);

// packages/example/src/torrent-context.tsx
init_mod2();
function nodeStreamToWebStream(nodeStream) {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        const buf = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
        controller.enqueue(buf);
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      if (typeof nodeStream.destroy === "function") {
        nodeStream.destroy();
      }
    }
  });
}
__name(nodeStreamToWebStream, "nodeStreamToWebStream");
var LOCAL_TRACKER = "ws://127.0.0.1:3000/tracker";
var PUBLIC_TRACKERS = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443"
];
function getTrackers() {
  if (useLocalTrackerSignal.value) {
    return [
      LOCAL_TRACKER,
      ...PUBLIC_TRACKERS
    ];
  }
  return PUBLIC_TRACKERS;
}
__name(getTrackers, "getTrackers");
var engineSignal = J2("browsertorrent");
var useLocalTrackerSignal = J2(true);
function getScope() {
  if (typeof globalThis.window === "undefined") return "/";
  const path = globalThis.window.location.pathname;
  return path.endsWith("/") ? "./" : "./" + path.split("/").pop() + "/";
}
__name(getScope, "getScope");
var clientSignal = J2(null);
var serverSignal = J2(null);
var torrentsSignal = J2([]);
var torrentSignal = J2(null);
var peersSignal = J2([]);
var downSpeedSignal = J2(0);
var upSpeedSignal = J2(0);
var tickSignal = J2(0);
var errorSignal = J2(null);
var modeSignal = J2("idle");
var debugSignal = J2([]);
function dbg(...args) {
  const msg = args.map((a3) => typeof a3 === "object" ? JSON.stringify(a3) : String(a3)).join(" ");
  const ts = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
  console.log(`[DEBUG ${ts}]`, msg);
  debugSignal.value = [
    ...debugSignal.value.slice(-99),
    `[${ts}] ${msg}`
  ];
}
__name(dbg, "dbg");
var torrentsDb = db2("browsertorrent", "torrents");
async function initClient() {
  const existing = clientSignal.value;
  if (existing) {
    dbg("initClient: reusing existing client");
    return existing;
  }
  let wt2;
  if (engineSignal.value === "browsertorrent") {
    const { Client: WT } = await Promise.resolve().then(() => (init_mod2(), mod_exports2));
    const opfsAvailable = navigator.storage?.getDirectory != null;
    dbg("initClient: creating BrowserTorrent client, OPFS available:", opfsAvailable);
    wt2 = new WT({
      peerId: void 0,
      maxConns: 55,
      useOPFS: opfsAvailable,
      rtcConfig: {
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478"
            ]
          }
        ]
      }
    });
  } else {
    dbg("initClient: creating original WebTorrent client...");
    const WT = window.WebTorrent;
    if (!WT) {
      throw new Error("original WebTorrent library not loaded from CDN!");
    }
    wt2 = new WT({
      maxConns: 55,
      tracker: {
        rtcConfig: {
          iceServers: [
            {
              urls: [
                "stun:stun.l.google.com:19302",
                "stun:global.stun.twilio.com:3478"
              ]
            }
          ]
        }
      }
    });
  }
  wt2.on("error", (e3) => {
    const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
    dbg("CLIENT ERROR:", msg);
    errorSignal.value = msg;
  });
  wt2.on("torrent", (e3) => {
    const t = e3?.detail ?? e3;
    dbg("wt.torrent event:", t.infoHash);
    if (!torrentsSignal.value.find((x5) => x5.infoHash === t.infoHash)) {
      torrentsSignal.value = [
        ...torrentsSignal.value,
        t
      ];
    }
  });
  clientSignal.value = wt2;
  dbg("initClient: client created and stored");
  setInterval(() => {
    tickSignal.value += 1;
  }, 1e3);
  try {
    const saved = await torrentsDb.values();
    dbg(`initClient: found ${saved.length} torrents in DB`);
    for (const item of saved) {
      dbg(`initClient: resuming torrent ${item.magnetURI}`);
      if (engineSignal.value === "browsertorrent") {
        wt2.add(item.magnetURI).catch((err) => {
          dbg(`initClient: error resuming torrent:`, err);
        });
      } else {
        wt2.add(item.magnetURI);
      }
    }
  } catch (err) {
    dbg("initClient: error loading torrents from DB", err);
  }
  return wt2;
}
__name(initClient, "initClient");
async function seedFile(file) {
  errorSignal.value = null;
  modeSignal.value = "idle";
  dbg("seedFile: starting, file:", file.name, "size:", file.size);
  const wt2 = await initClient();
  dbg("seedFile: client ready, server:", serverSignal.value ? "exists" : "NULL");
  let server = serverSignal.value;
  if (engineSignal.value === "browsertorrent") {
    if (!server) {
      dbg("seedFile: creating server...");
      server = wt2.createServer({
        scope: "/"
      });
      dbg("seedFile: server created, calling sendReadyAck...");
      await server.sendReadyAck();
      dbg("seedFile: server ready, storing in serverSignal");
      serverSignal.value = server;
    } else {
      dbg("seedFile: reusing existing server");
    }
  }
  try {
    const trackers = getTrackers();
    dbg("seedFile: calling wt.seed() with trackers:", trackers);
    const torrent = await wt2.seed(file, {
      name: file.name,
      announce: trackers
    });
    dbg("seedFile: wt.seed() returned");
    dbg("  torrent.infoHash:", torrent.infoHash, "(length:", torrent.infoHash?.length ?? "undefined", ")");
    dbg("  torrent.name:", torrent.name);
    dbg("  torrent.magnetURI:", torrent.magnetURI);
    dbg("  torrent.files.length:", torrent.files?.length);
    dbg("  torrent.announce:", torrent.announce);
    torrentSignal.value = torrent;
    modeSignal.value = "seeding";
    dbg("seedFile: torrentSignal.value set, mode = seeding");
    torrentsDb.set(torrent.infoHash, {
      name: torrent.name,
      magnetURI: torrent.magnetURI,
      addedAt: Date.now()
    }).catch(console.warn);
    torrent.on("infoHash", () => {
      dbg("EVENT: infoHash ready:", torrent.infoHash);
    });
    torrent.on("metadata", () => {
      dbg("EVENT: metadata ready, infoHash:", torrent.infoHash);
      dbg("  torrent.name:", torrent.name);
      dbg("  torrent.files:", torrent.files?.map((f3) => f3.name));
    });
    const onReady = /* @__PURE__ */ __name(() => {
      dbg("EVENT: torrent ready!");
      dbg("  infoHash:", torrent.infoHash);
      dbg("  name:", torrent.name);
      dbg("  files:", torrent.files?.length);
      dbg("  server:", serverSignal.value ? "available" : "NULL");
      if (engineSignal.value === "webtorrent") {
        torrent.files.forEach((file2, idx) => {
          const compatibleFile = {
            name: file2.name,
            length: file2.length,
            createReadStream(opts) {
              const nodeStream = file2.createReadStream(opts);
              return nodeStreamToWebStream(nodeStream);
            }
          };
          streamManager.register(torrent.infoHash, idx, compatibleFile);
        });
        dbg("Original WebTorrent files registered in streamManager manually.");
      }
    }, "onReady");
    torrent.on("ready", onReady);
    if (torrent.ready) {
      onReady();
    }
    torrent.on("error", (e3) => {
      const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
      dbg("EVENT: torrent error:", msg);
    });
    torrent.on("wire", (e3) => {
      const wire = e3?.detail?.wire ?? e3;
      const addr = e3?.detail?.addr ?? wire?.remoteAddress ?? "unknown";
      dbg("EVENT: wire/peer CONNECTED from:", addr);
      const wires = torrent.wires || [];
      dbg("  total peers:", wires.length);
      peersSignal.value = wires;
      wire.on("close", () => {
        dbg("EVENT: wire/peer disconnected from:", addr);
        peersSignal.value = torrent.wires || [];
      });
      wire.on("handshake", () => {
        dbg("EVENT: wire handshake complete with:", addr);
      });
    });
    torrent.on("warning", (e3) => {
      const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
      dbg("EVENT: warning:", msg);
    });
    const swarmInterval = setInterval(() => {
      const swarm = torrent.swarm;
      if (swarm) {
        const peers = swarm.peers ? [
          ...swarm.peers.keys()
        ] : torrent.wires || [];
        dbg("SWARM STATUS: peers:", peers.length, "infoHash:", torrent.infoHash);
        if (peers.length > 0) {
          dbg("  peer addrs:", peers.map((p4) => p4.remoteAddress || p4));
        }
      }
    }, 5e3);
    dbg("seedFile: all event listeners attached");
    dbg("SEEDER READY \u2014 infoHash:", torrent.infoHash);
    dbg("  Trackers configured:", torrent.announce?.length ?? 0);
    dbg("  Swarm listening \u2014 waiting for peers to connect...");
    wt2.on("trackerAnnounce", (...args) => {
      const tracker = args[1];
      dbg("EVENT: client trackerAnnounce to:", tracker);
    });
    wt2.on("trackerWarning", (...args) => {
      const tracker = args[1];
      dbg("EVENT: client trackerWarning from:", tracker);
    });
    wt2.on("trackerError", (...args) => {
      const e3 = args[0];
      const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
      dbg("EVENT: client trackerError:", msg);
    });
  } catch (e3) {
    const msg = e3 instanceof Error ? e3.message : String(e3);
    dbg("seedFile: ERROR:", msg);
    errorSignal.value = msg;
    throw e3;
  }
}
__name(seedFile, "seedFile");
async function addTorrent(torrentId) {
  errorSignal.value = null;
  modeSignal.value = "idle";
  dbg("addTorrent: starting, torrentId:", torrentId);
  const wt2 = await initClient();
  dbg("addTorrent: client ready, server:", serverSignal.value ? "exists" : "NULL");
  let server = serverSignal.value;
  if (engineSignal.value === "browsertorrent") {
    if (!server) {
      dbg("addTorrent: creating server...");
      server = wt2.createServer({
        scope: "/"
      });
      dbg("addTorrent: server created, calling sendReadyAck...");
      await server.sendReadyAck();
      dbg("addTorrent: server ready, storing in serverSignal");
      serverSignal.value = server;
    } else {
      dbg("addTorrent: reusing existing server");
    }
  }
  try {
    const trackers = getTrackers();
    dbg("addTorrent: calling wt.add('" + torrentId + "') with trackers:", trackers);
    const torrent = await wt2.add(torrentId, {
      announce: trackers
    });
    dbg("addTorrent: wt.add() returned");
    dbg("  torrent.infoHash:", torrent.infoHash, "(length:", torrent.infoHash?.length ?? "undefined", ")");
    dbg("  torrent.name:", torrent.name);
    dbg("  torrent.magnetURI:", torrent.magnetURI);
    dbg("  torrent.files.length:", torrent.files?.length);
    torrentSignal.value = torrent;
    modeSignal.value = "leeching";
    dbg("addTorrent: torrentSignal.value set, mode = leeching");
    torrentsDb.set(torrent.infoHash, {
      name: torrent.name,
      magnetURI: torrent.magnetURI,
      addedAt: Date.now()
    }).catch(console.warn);
    torrent.on("infoHash", () => {
      dbg("EVENT: infoHash ready:", torrent.infoHash);
    });
    torrent.on("metadata", () => {
      dbg("EVENT: metadata ready, infoHash:", torrent.infoHash);
      dbg("  torrent.name:", torrent.name);
      dbg("  torrent.files:", torrent.files?.map((f3) => f3.name));
    });
    const onReady = /* @__PURE__ */ __name(() => {
      dbg("EVENT: torrent ready!");
      dbg("  infoHash:", torrent.infoHash);
      dbg("  name:", torrent.name);
      dbg("  files:", torrent.files?.length);
      dbg("  server:", serverSignal.value ? "available" : "NULL");
      if (engineSignal.value === "webtorrent") {
        torrent.files.forEach((file, idx) => {
          const compatibleFile = {
            name: file.name,
            length: file.length,
            createReadStream(opts) {
              const nodeStream = file.createReadStream(opts);
              return nodeStreamToWebStream(nodeStream);
            }
          };
          streamManager.register(torrent.infoHash, idx, compatibleFile);
        });
        dbg("Original WebTorrent files registered in streamManager manually.");
      }
    }, "onReady");
    torrent.on("ready", onReady);
    if (torrent.ready) {
      onReady();
    }
    torrent.on("error", (e3) => {
      const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
      dbg("EVENT: torrent error:", msg);
    });
    torrent.on("wire", (e3) => {
      const wire = e3?.detail?.wire ?? e3;
      const addr = e3?.detail?.addr ?? wire?.remoteAddress ?? "unknown";
      dbg("EVENT: wire/peer connected from:", addr);
      const wires = torrent.wires || [];
      dbg("  total peers:", wires.length);
      peersSignal.value = wires;
      wire.on("close", () => {
        dbg("EVENT: wire/peer disconnected from:", addr);
        peersSignal.value = torrent.wires || [];
      });
    });
    torrent.on("warning", (e3) => {
      const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
      dbg("EVENT: warning:", msg);
    });
    torrent.on("download", (e3) => {
      const bytesNum = typeof e3 === "number" ? e3 : e3?.detail?.bytes ?? 0;
      dbg("EVENT: download:", bytesNum, "bytes, progress:", Math.round(torrent.progress * 100) + "%");
    });
    torrent.on("done", () => {
      dbg("EVENT: torrent download complete!");
    });
    dbg("addTorrent: all event listeners attached");
    dbg("LEECHER READY \u2014 infoHash:", torrent.infoHash);
    dbg("  Downloading from peers \u2014 progress:", Math.round(torrent.progress * 100) + "%");
    const swarmInterval = setInterval(() => {
      const swarm = torrent.swarm;
      if (swarm) {
        const peers = swarm.peers ? [
          ...swarm.peers.keys()
        ] : torrent.wires || [];
        dbg("SWARM STATUS: peers:", peers.length, "infoHash:", torrent.infoHash);
        dbg("  downloaded:", torrent.downloaded, "of", torrent.length);
        if (peers.length > 0) {
          dbg("  peer addrs:", peers.map((p4) => p4.remoteAddress || p4));
        }
      }
    }, 5e3);
    wt2.on("trackerAnnounce", (...args) => {
      const tracker = args[1];
      dbg("EVENT: client trackerAnnounce to:", tracker);
    });
    wt2.on("trackerWarning", (...args) => {
      const tracker = args[1];
      dbg("EVENT: client trackerWarning from:", tracker);
    });
    wt2.on("trackerError", (...args) => {
      const e3 = args[0];
      const msg = e3?.detail?.message ?? e3?.message ?? String(e3);
      dbg("EVENT: client trackerError:", msg);
    });
  } catch (e3) {
    const msg = e3 instanceof Error ? e3.message : String(e3);
    dbg("addTorrent: ERROR:", msg);
    errorSignal.value = msg;
    throw e3;
  }
}
__name(addTorrent, "addTorrent");
async function removeTorrent(infoHash) {
  dbg("removeTorrent: starting, infoHash:", infoHash);
  const wt2 = clientSignal.value;
  if (wt2) {
    const torrent = await wt2.get(infoHash);
    if (torrent) {
      dbg("removeTorrent: destroying torrent object");
      torrent.destroy();
    }
  }
  torrentsSignal.value = torrentsSignal.value.filter((t) => t.infoHash !== infoHash);
  if (torrentSignal.value?.infoHash === infoHash) {
    torrentSignal.value = null;
    modeSignal.value = "idle";
  }
  await torrentsDb.delete(infoHash);
  if (engineSignal.value === "webtorrent") {
    streamManager.unregisterTorrent(infoHash);
  }
  dbg("removeTorrent: done");
}
__name(removeTorrent, "removeTorrent");
function cleanup() {
  dbg("cleanup: starting...");
  const server = serverSignal.value;
  if (server) {
    dbg("cleanup: destroying server");
    server.destroy();
    serverSignal.value = null;
  }
  const client = clientSignal.value;
  if (client) {
    dbg("cleanup: destroying client");
    client.destroy();
    clientSignal.value = null;
  }
  torrentSignal.value = null;
  peersSignal.value = [];
  modeSignal.value = "idle";
  downSpeedSignal.value = 0;
  upSpeedSignal.value = 0;
  errorSignal.value = null;
  streamManager.clear();
  dbg("cleanup: done");
}
__name(cleanup, "cleanup");
var TorrentContext = Pe({});
function TorrentProvider({ children }) {
  return /* @__PURE__ */ d(TorrentContext.Provider, {
    value: {},
    children
  });
}
__name(TorrentProvider, "TorrentProvider");

// packages/example/src/components/seeder-panel.tsx
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
__name(formatSize, "formatSize");
function buildMagnetURI(torrent) {
  const ih = torrent.infoHash;
  const name = encodeURIComponent(torrent.name ?? "download");
  const trackers = torrent.announce?.length ? torrent.announce : getTrackers();
  const trs = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${ih}&dn=${name}${trs}`;
}
__name(buildMagnetURI, "buildMagnetURI");
function SeederPanel({ disabled }) {
  const selectedFile = k3(null);
  const loading = k3(false);
  const magnetCopied = k3(false);
  const handleSeed = /* @__PURE__ */ __name(async () => {
    const file = selectedFile.value;
    if (!file) return;
    loading.value = true;
    try {
      await seedFile(file);
      selectedFile.value = null;
    } catch {
    } finally {
      loading.value = false;
    }
  }, "handleSeed");
  const handleCopyMagnet = /* @__PURE__ */ __name(() => {
    const t = torrentSignal.value;
    if (!t) return;
    const magnet = buildMagnetURI(t);
    navigator.clipboard.writeText(magnet);
    magnetCopied.value = true;
    setTimeout(() => {
      magnetCopied.value = false;
    }, 2e3);
  }, "handleCopyMagnet");
  const getMagnetURI = /* @__PURE__ */ __name(() => {
    const t = torrentSignal.value;
    if (!t) return "";
    return buildMagnetURI(t);
  }, "getMagnetURI");
  const torrent = torrentSignal.value;
  const isSeeding = modeSignal.value === "seeding";
  return /* @__PURE__ */ d("div", {
    class: "field",
    children: [
      !isSeeding && /* @__PURE__ */ d("button", {
        type: "button",
        class: selectedFile.value ? "tertiary" : "",
        disabled,
        onClick: /* @__PURE__ */ __name(() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "video/*,audio/*";
          input.onchange = () => {
            if (input.files?.[0]) {
              selectedFile.value = input.files[0];
            }
          };
          input.click();
        }, "onClick"),
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols",
            children: selectedFile.value ? "file_present" : "add"
          }),
          selectedFile.value ? selectedFile.value.name : "Selecionar m\xEDdia"
        ]
      }),
      selectedFile.value && !isSeeding && /* @__PURE__ */ d("div", {
        class: "secondary-text small-text",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "file_present"
          }),
          formatSize(selectedFile.value.size)
        ]
      }),
      isSeeding && /* @__PURE__ */ d("div", {
        class: "green-text small-text",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "check_circle"
          }),
          torrent?.name
        ]
      }),
      !isSeeding && /* @__PURE__ */ d("button", {
        type: "button",
        class: loading.value ? "loading" : "",
        disabled: disabled || !selectedFile.value || loading.value,
        onClick: handleSeed,
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols",
            children: "upload"
          }),
          "Seed"
        ]
      }),
      isSeeding && torrent && /* @__PURE__ */ d("div", {
        class: "field label suffix border",
        children: [
          /* @__PURE__ */ d("input", {
            type: "text",
            value: getMagnetURI(),
            id: "magnet-output",
            readonly: true,
            onClick: /* @__PURE__ */ __name((e3) => {
              e3.target.select();
              handleCopyMagnet();
            }, "onClick")
          }),
          /* @__PURE__ */ d("label", {
            children: "Magnet URI"
          }),
          /* @__PURE__ */ d("button", {
            type: "button",
            class: "transparent front",
            onClick: handleCopyMagnet,
            title: "Copiar magnet",
            children: /* @__PURE__ */ d("i", {
              class: "material-symbols small",
              children: magnetCopied.value ? "check" : "content_copy"
            })
          })
        ]
      }),
      isSeeding && torrent && /* @__PURE__ */ d("div", {
        class: "field label border",
        children: [
          /* @__PURE__ */ d("input", {
            type: "text",
            value: torrent.infoHash,
            readonly: true
          }),
          /* @__PURE__ */ d("label", {
            children: "InfoHash"
          })
        ]
      })
    ]
  });
}
__name(SeederPanel, "SeederPanel");

// packages/example/src/components/leecher-panel.tsx
function LeecherPanel({ disabled }) {
  const magnetInput = k3("");
  const loading = k3(false);
  const helpingShare = k3(false);
  const handleDownload = /* @__PURE__ */ __name(async () => {
    const id = magnetInput.value.trim();
    if (!id) return;
    loading.value = true;
    try {
      await addTorrent(id);
      magnetInput.value = "";
    } catch {
    } finally {
      loading.value = false;
    }
  }, "handleDownload");
  const handleKeyDown = /* @__PURE__ */ __name((e3) => {
    if (e3.key === "Enter") handleDownload();
  }, "handleKeyDown");
  const torrent = torrentSignal.value;
  const isLeeching = modeSignal.value === "leeching";
  const isSeeding = modeSignal.value === "seeding";
  const hasActiveTorrent = isLeeching || isSeeding;
  return /* @__PURE__ */ d("div", {
    class: "field",
    children: [
      !hasActiveTorrent && /* @__PURE__ */ d("div", {
        class: "field label border",
        children: [
          /* @__PURE__ */ d("input", {
            type: "text",
            id: "magnet-input",
            placeholder: "magnet:?xt=urn:btih:...",
            disabled,
            value: magnetInput.value,
            onInput: /* @__PURE__ */ __name((e3) => {
              magnetInput.value = e3.target.value;
            }, "onInput"),
            onKeyDown: handleKeyDown
          }),
          /* @__PURE__ */ d("label", {
            for: "magnet-input",
            children: "Magnet / InfoHash"
          }),
          /* @__PURE__ */ d("button", {
            type: "button",
            class: "transparent front",
            onClick: /* @__PURE__ */ __name(async () => {
              const text = await navigator.clipboard.readText();
              if (text) magnetInput.value = text;
            }, "onClick"),
            children: /* @__PURE__ */ d("i", {
              class: "material-symbols",
              children: "content_paste"
            })
          })
        ]
      }),
      isLeeching && torrent && /* @__PURE__ */ d("div", {
        class: "blue-text small-text",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "download"
          }),
          torrent.name ?? "Baixando..."
        ]
      }),
      !hasActiveTorrent && /* @__PURE__ */ d("button", {
        type: "button",
        class: loading.value ? "loading" : "",
        disabled: disabled || !magnetInput.value || loading.value,
        onClick: handleDownload,
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols",
            children: "download"
          }),
          "Download"
        ]
      }),
      isLeeching && torrent && /* @__PURE__ */ d("div", {
        class: "field label border",
        children: [
          /* @__PURE__ */ d("input", {
            type: "text",
            value: torrent.infoHash,
            readonly: true
          }),
          /* @__PURE__ */ d("label", {
            children: "InfoHash"
          })
        ]
      }),
      hasActiveTorrent && /* @__PURE__ */ d("label", {
        class: "switch",
        children: [
          /* @__PURE__ */ d("input", {
            type: "checkbox",
            checked: helpingShare.value,
            onChange: /* @__PURE__ */ __name(() => {
              helpingShare.value = !helpingShare.value;
            }, "onChange")
          }),
          /* @__PURE__ */ d("span", {
            children: "Ajudar compartilhando"
          })
        ]
      }),
      hasActiveTorrent && /* @__PURE__ */ d("div", {
        class: "chip",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "group"
          }),
          peersSignal.value.length,
          " peers"
        ]
      })
    ]
  });
}
__name(LeecherPanel, "LeecherPanel");

// packages/example/src/components/player-panel.tsx
init_mod2();
function dbg2(...args) {
  const msg = args.map((a3) => typeof a3 === "object" ? JSON.stringify(a3) : String(a3)).join(" ");
  const ts = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
  console.log(`[PLAYER ${ts}]`, msg);
  debugSignal.value = [
    ...debugSignal.value.slice(-99),
    `[${ts}] PLAYER: ${msg}`
  ];
}
__name(dbg2, "dbg");
function formatSpeed(bps) {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}
__name(formatSpeed, "formatSpeed");
function formatSize2(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
__name(formatSize2, "formatSize");
function PlayerPanel() {
  const videoRef = L2(null);
  const isPlaying = k3(false);
  const torrent = torrentSignal.value;
  const mode = modeSignal.value;
  const peers = peersSignal.value;
  const isActive = mode !== "idle";
  const setupIntervalRef = L2(null);
  z2(() => {
    dbg2("effect: torrent:", torrent?.infoHash, "files:", torrent?.files?.length, "video:", !!videoRef.current);
    if (setupIntervalRef.current) {
      clearInterval(setupIntervalRef.current);
      setupIntervalRef.current = null;
    }
    if (!torrent || torrent.files.length === 0) {
      dbg2("effect: no torrent or no files, waiting...");
      setupIntervalRef.current = setInterval(() => {
        const t = torrentSignal.value;
        if (t && t.files.length > 0 && videoRef.current) {
          dbg2("poll: torrent ready with files, calling streamTo");
          const file = t.files[0];
          try {
            file.streamTo(videoRef.current);
            dbg2("poll: streamTo done, src =", videoRef.current.src);
          } catch (err) {
            dbg2("poll: streamTo error:", String(err));
          }
          if (setupIntervalRef.current) {
            clearInterval(setupIntervalRef.current);
            setupIntervalRef.current = null;
          }
        }
      }, 200);
      return;
    }
    if (videoRef.current) {
      const file = torrent.files[0];
      dbg2("effect: immediate streamTo, file:", file.name);
      try {
        file.streamTo(videoRef.current);
        dbg2("effect: streamTo done");
      } catch (err) {
        dbg2("effect: streamTo error:", String(err));
      }
    } else {
      dbg2("effect: video ref not ready, polling...");
      setupIntervalRef.current = setInterval(() => {
        const t = torrentSignal.value;
        if (t && t.files.length > 0 && videoRef.current) {
          dbg2("poll: video ready, calling streamTo");
          const file = t.files[0];
          try {
            file.streamTo(videoRef.current);
            dbg2("poll: streamTo done, src =", videoRef.current.src);
          } catch (err) {
            dbg2("poll: streamTo error:", String(err));
          }
          if (setupIntervalRef.current) {
            clearInterval(setupIntervalRef.current);
            setupIntervalRef.current = null;
          }
        }
      }, 200);
    }
    const speedInterval = setInterval(() => {
      const t = torrentSignal.value;
      if (t) {
        downSpeedSignal.value = t.downloadSpeed;
        upSpeedSignal.value = t.uploadSpeed;
      }
    }, 500);
    return () => {
      clearInterval(speedInterval);
      if (setupIntervalRef.current) {
        clearInterval(setupIntervalRef.current);
        setupIntervalRef.current = null;
      }
    };
  }, [
    torrent?.infoHash,
    torrent?.files?.length,
    mode
  ]);
  const handleCanPlay = /* @__PURE__ */ __name(() => {
    isPlaying.value = true;
  }, "handleCanPlay");
  const handleEnded = /* @__PURE__ */ __name(() => {
    isPlaying.value = false;
  }, "handleEnded");
  const isVideo = (() => {
    const name = torrent?.files[0]?.name ?? "";
    return /\.(mp4|webm|mkv|avi|mov)$/i.test(name);
  })();
  const displayUrl = (() => {
    if (!torrent || !isActive) return null;
    const file = torrent.files[0];
    if (!file) return null;
    return buildStreamURL(getScope(), torrent.infoHash, 0, file.name);
  })();
  return /* @__PURE__ */ d("div", {
    class: "field",
    children: [
      isActive && isVideo && /* @__PURE__ */ d("video", {
        ref: videoRef,
        controls: true,
        autoplay: true,
        class: "responsive round",
        onCanPlay: handleCanPlay,
        onEnded: handleEnded
      }),
      isActive && !isVideo && /* @__PURE__ */ d("div", {
        class: "chip",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "audio_file"
          }),
          "\xC1udio detectado \u2014 use player externo com:"
        ]
      }),
      isActive && displayUrl && /* @__PURE__ */ d("div", {
        class: "field label suffix border",
        children: [
          /* @__PURE__ */ d("input", {
            type: "text",
            value: displayUrl,
            readonly: true,
            onClick: /* @__PURE__ */ __name((e3) => {
              e3.target.select();
              navigator.clipboard.writeText(displayUrl);
            }, "onClick")
          }),
          /* @__PURE__ */ d("label", {
            children: "Stream URL"
          }),
          /* @__PURE__ */ d("button", {
            type: "button",
            class: "transparent front",
            onClick: /* @__PURE__ */ __name(() => navigator.clipboard.writeText(displayUrl), "onClick"),
            title: "Copiar URL",
            children: /* @__PURE__ */ d("i", {
              class: "material-symbols small",
              children: "content_copy"
            })
          })
        ]
      }),
      isActive && torrent && /* @__PURE__ */ d("div", {
        class: "field",
        children: [
          /* @__PURE__ */ d("progress", {
            value: torrent.progress,
            class: "max"
          }),
          /* @__PURE__ */ d("label", {
            children: [
              Math.round(torrent.progress * 100),
              "%"
            ]
          })
        ]
      }),
      isActive && /* @__PURE__ */ d("div", {
        class: "row no-space",
        children: [
          /* @__PURE__ */ d("div", {
            class: "field label border",
            children: [
              /* @__PURE__ */ d("input", {
                type: "text",
                value: formatSpeed(downSpeedSignal.value),
                readonly: true
              }),
              /* @__PURE__ */ d("label", {
                class: "green-text",
                children: [
                  /* @__PURE__ */ d("i", {
                    class: "material-symbols small",
                    children: "download"
                  }),
                  "Download"
                ]
              })
            ]
          }),
          /* @__PURE__ */ d("div", {
            class: "field label border",
            children: [
              /* @__PURE__ */ d("input", {
                type: "text",
                value: formatSpeed(upSpeedSignal.value),
                readonly: true
              }),
              /* @__PURE__ */ d("label", {
                class: "red-text",
                children: [
                  /* @__PURE__ */ d("i", {
                    class: "material-symbols small",
                    children: "upload"
                  }),
                  "Upload"
                ]
              })
            ]
          })
        ]
      }),
      isActive && peers.length > 0 && /* @__PURE__ */ d("div", {
        class: "chip",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "group"
          }),
          peers.length,
          " peer",
          peers.length !== 1 ? "s" : ""
        ]
      }),
      isActive && torrent && torrent.files[0] && /* @__PURE__ */ d("div", {
        class: "chip",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "file_present"
          }),
          torrent.files[0].name,
          " (",
          formatSize2(torrent.files[0].length),
          ")"
        ]
      }),
      !isActive && /* @__PURE__ */ d("div", {
        class: "secondary-text small-text",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols small",
            children: "info"
          }),
          "Ative o WebTorrent e adicione um torrent para iniciar"
        ]
      })
    ]
  });
}
__name(PlayerPanel, "PlayerPanel");

// packages/example/src/components/debug-panel.tsx
function DebugPanel() {
  const expanded = k3(false);
  const logs = debugSignal.value;
  return /* @__PURE__ */ d("article", {
    class: "border round debug-panel",
    children: [
      /* @__PURE__ */ d("nav", {
        class: "middle",
        onClick: /* @__PURE__ */ __name(() => {
          expanded.value = !expanded.value;
        }, "onClick"),
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols",
            children: "terminal"
          }),
          /* @__PURE__ */ d("h5", {
            children: "Debug Log"
          }),
          /* @__PURE__ */ d("span", {
            class: "chip",
            children: [
              logs.length,
              " msgs"
            ]
          }),
          /* @__PURE__ */ d("button", {
            type: "button",
            class: "transparent",
            onClick: /* @__PURE__ */ __name((e3) => {
              e3.stopPropagation();
              debugSignal.value = [];
            }, "onClick"),
            title: "Limpar logs",
            children: /* @__PURE__ */ d("i", {
              class: "material-symbols small",
              children: "delete"
            })
          }),
          /* @__PURE__ */ d("button", {
            type: "button",
            class: "transparent",
            children: /* @__PURE__ */ d("i", {
              class: "material-symbols small",
              children: expanded.value ? "expand_less" : "expand_more"
            })
          })
        ]
      }),
      expanded.value && /* @__PURE__ */ d("div", {
        class: "debug-log",
        children: logs.length === 0 ? /* @__PURE__ */ d("div", {
          class: "secondary-text small-text",
          children: "Nenhuma mensagem de debug"
        }) : logs.map((log, i3) => /* @__PURE__ */ d("div", {
          class: "debug-line",
          children: /* @__PURE__ */ d("code", {
            children: log
          })
        }, i3))
      })
    ]
  });
}
__name(DebugPanel, "DebugPanel");

// packages/example/src/components/torrent-list.tsx
function buildMagnetURI2(t) {
  const ih = t.infoHash;
  const name = encodeURIComponent(t.name ?? "download");
  const trackers = t.announce?.length ? t.announce : getTrackers();
  const trs = trackers.map((track) => `&tr=${encodeURIComponent(track)}`).join("");
  return `magnet:?xt=urn:btih:${ih}&dn=${name}${trs}`;
}
__name(buildMagnetURI2, "buildMagnetURI");
function formatSize3(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
__name(formatSize3, "formatSize");
function TorrentList() {
  const torrents = torrentsSignal.value;
  const _tick = tickSignal.value;
  if (torrents.length === 0) {
    return /* @__PURE__ */ d("div", {
      class: "center-align padding",
      children: [
        /* @__PURE__ */ d("i", {
          class: "material-symbols large opacity",
          children: "folder_open"
        }),
        /* @__PURE__ */ d("p", {
          class: "opacity",
          children: "Nenhum torrent na lista."
        })
      ]
    });
  }
  return /* @__PURE__ */ d("div", {
    class: "list",
    children: torrents.map((t) => {
      const isActive = torrentSignal.value?.infoHash === t.infoHash;
      const progress = Math.round(t.progress * 100);
      return /* @__PURE__ */ d("div", {
        class: `row padding border round ${isActive ? "primary-container" : ""}`,
        children: [
          /* @__PURE__ */ d("div", {
            class: "max",
            children: [
              /* @__PURE__ */ d("h6", {
                class: "no-margin",
                children: t.name || "Desconhecido"
              }),
              /* @__PURE__ */ d("div", {
                class: "secondary-text small-text",
                children: [
                  formatSize3(t.length || 0),
                  " \u2022 ",
                  t.infoHash.substring(0, 8),
                  "..."
                ]
              }),
              /* @__PURE__ */ d("div", {
                class: "field no-margin",
                children: [
                  /* @__PURE__ */ d("progress", {
                    value: progress,
                    max: "100"
                  }),
                  /* @__PURE__ */ d("div", {
                    class: "secondary-text small-text right-align",
                    children: [
                      progress,
                      "%"
                    ]
                  })
                ]
              })
            ]
          }),
          /* @__PURE__ */ d("nav", {
            children: [
              /* @__PURE__ */ d("button", {
                type: "button",
                class: "circle transparent",
                onClick: /* @__PURE__ */ __name(() => {
                  const magnet = buildMagnetURI2(t);
                  navigator.clipboard.writeText(magnet);
                }, "onClick"),
                title: "Copiar Magnet",
                children: /* @__PURE__ */ d("i", {
                  class: "material-symbols",
                  children: "link"
                })
              }),
              !isActive && /* @__PURE__ */ d("button", {
                type: "button",
                class: "circle transparent",
                onClick: /* @__PURE__ */ __name(() => {
                  torrentSignal.value = t;
                  modeSignal.value = t.progress === 1 ? "seeding" : "leeching";
                }, "onClick"),
                children: /* @__PURE__ */ d("i", {
                  class: "material-symbols",
                  children: "play_arrow"
                })
              }),
              /* @__PURE__ */ d("button", {
                type: "button",
                class: "circle transparent",
                onClick: /* @__PURE__ */ __name(() => removeTorrent(t.infoHash), "onClick"),
                children: /* @__PURE__ */ d("i", {
                  class: "material-symbols",
                  children: "delete"
                })
              })
            ]
          })
        ]
      }, t.infoHash);
    })
  });
}
__name(TorrentList, "TorrentList");

// packages/example/src/components/swarm-visualizer.tsx
function SwarmVisualizer() {
  const peers = peersSignal.value;
  const torrent = torrentSignal.value;
  if (!torrent) return null;
  return /* @__PURE__ */ d("article", {
    class: "border round top-margin",
    children: [
      /* @__PURE__ */ d("nav", {
        class: "middle",
        children: [
          /* @__PURE__ */ d("i", {
            class: "material-symbols",
            children: "hub"
          }),
          /* @__PURE__ */ d("h5", {
            class: "max",
            children: "Swarm Details"
          }),
          /* @__PURE__ */ d("div", {
            class: "chip border",
            children: [
              peers.length,
              " active peers"
            ]
          })
        ]
      }),
      /* @__PURE__ */ d("div", {
        class: "padding",
        children: [
          peers.length === 0 ? /* @__PURE__ */ d("p", {
            class: "secondary-text italic center-align",
            children: "Aguardando conex\xF5es P2P..."
          }) : /* @__PURE__ */ d("div", {
            class: "list",
            children: peers.map((wire, idx) => /* @__PURE__ */ d("div", {
              class: "row padding border round",
              children: [
                /* @__PURE__ */ d("i", {
                  class: "material-symbols green-text",
                  children: "router"
                }),
                /* @__PURE__ */ d("div", {
                  class: "max",
                  children: [
                    /* @__PURE__ */ d("h6", {
                      class: "no-margin",
                      children: [
                        "Peer ",
                        idx + 1
                      ]
                    }),
                    /* @__PURE__ */ d("div", {
                      class: "secondary-text small-text",
                      children: [
                        wire.remoteAddress || "WebRTC Peer",
                        " \u2022 Type: ",
                        wire.type || "unknown",
                        " \u2022 Client: ",
                        wire.peerId ? wire.peerId.substring(0, 8) : "N/A"
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ d("div", {
                  class: "row no-space",
                  children: [
                    /* @__PURE__ */ d("i", {
                      class: "material-symbols small green-text",
                      children: "download"
                    }),
                    /* @__PURE__ */ d("i", {
                      class: "material-symbols small red-text",
                      children: "upload"
                    })
                  ]
                })
              ]
            }, idx))
          }),
          /* @__PURE__ */ d("div", {
            class: "divider top-margin bottom-margin"
          }),
          /* @__PURE__ */ d("div", {
            class: "row",
            children: [
              /* @__PURE__ */ d("div", {
                class: "chip transparent",
                children: [
                  /* @__PURE__ */ d("i", {
                    class: "material-symbols small",
                    children: "speed"
                  }),
                  "Down: ",
                  Math.round(torrent.downloadSpeed / 1024),
                  " KB/s"
                ]
              }),
              /* @__PURE__ */ d("div", {
                class: "chip transparent",
                children: [
                  /* @__PURE__ */ d("i", {
                    class: "material-symbols small",
                    children: "speed"
                  }),
                  "Up: ",
                  Math.round(torrent.uploadSpeed / 1024),
                  " KB/s"
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}
__name(SwarmVisualizer, "SwarmVisualizer");

// packages/example/src/app.tsx
function dbg3(...args) {
  const msg = args.map((a3) => typeof a3 === "object" ? JSON.stringify(a3) : String(a3)).join(" ");
  const ts = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
  console.log(`[APP ${ts}]`, msg);
  debugSignal.value = [
    ...debugSignal.value.slice(-99),
    `[${ts}] APP: ${msg}`
  ];
}
__name(dbg3, "dbg");
function App() {
  const wtEnabled = k3(false);
  const mode = modeSignal.value;
  const error = errorSignal.value;
  const handleEngineChange = /* @__PURE__ */ __name(async (newEngine) => {
    if (engineSignal.value === newEngine) return;
    dbg3(`Switching engine to: ${newEngine}`);
    const wasEnabled = wtEnabled.value;
    if (wasEnabled) {
      dbg3("Engine switch: cleaning up active client...");
      cleanup();
    }
    engineSignal.value = newEngine;
    if (wasEnabled) {
      dbg3("Engine switch: re-initializing client with new engine...");
      await initClient();
      dbg3("Engine switch: new client ready");
    }
  }, "handleEngineChange");
  const handleToggle = /* @__PURE__ */ __name(async () => {
    if (wtEnabled.value) {
      dbg3("WebTorrent OFF \u2014 calling cleanup");
      cleanup();
      wtEnabled.value = false;
    } else {
      dbg3("WebTorrent ON \u2014 initializing client...");
      wtEnabled.value = true;
      await initClient();
      dbg3("WebTorrent ready");
    }
  }, "handleToggle");
  return /* @__PURE__ */ d($, {
    children: [
      /* @__PURE__ */ d("nav", {
        class: "top primary",
        children: [
          /* @__PURE__ */ d("button", {
            type: "button",
            class: "circle transparent",
            children: /* @__PURE__ */ d("i", {
              class: "material-symbols white-text",
              children: "hub"
            })
          }),
          /* @__PURE__ */ d("label", {
            class: "max",
            children: /* @__PURE__ */ d("h5", {
              class: "white-text",
              children: "BrowserTorrent"
            })
          }),
          /* @__PURE__ */ d("div", {
            class: "row no-wrap white-text right-margin",
            style: "gap: 16px;",
            children: [
              /* @__PURE__ */ d("div", {
                class: "chip border white-text",
                children: [
                  /* @__PURE__ */ d("i", {
                    class: "material-symbols small white-text",
                    children: "settings"
                  }),
                  engineSignal.value === "browsertorrent" ? "BrowserTorrent" : "Original WebTorrent"
                ]
              }),
              /* @__PURE__ */ d("label", {
                class: "radio",
                children: [
                  /* @__PURE__ */ d("input", {
                    type: "radio",
                    name: "engine",
                    checked: engineSignal.value === "browsertorrent",
                    onChange: /* @__PURE__ */ __name(() => handleEngineChange("browsertorrent"), "onChange")
                  }),
                  /* @__PURE__ */ d("span", {
                    class: "white-text",
                    children: "BT"
                  })
                ]
              }),
              /* @__PURE__ */ d("label", {
                class: "radio",
                children: [
                  /* @__PURE__ */ d("input", {
                    type: "radio",
                    name: "engine",
                    checked: engineSignal.value === "webtorrent",
                    onChange: /* @__PURE__ */ __name(() => handleEngineChange("webtorrent"), "onChange")
                  }),
                  /* @__PURE__ */ d("span", {
                    class: "white-text",
                    children: "WT"
                  })
                ]
              })
            ]
          }),
          /* @__PURE__ */ d("label", {
            class: "chip transparent white-text",
            title: "Local Tracker (Fast Discovery)",
            children: [
              /* @__PURE__ */ d("i", {
                class: "material-symbols small white-text",
                children: "lan"
              }),
              /* @__PURE__ */ d("div", {
                class: "switch small",
                children: [
                  /* @__PURE__ */ d("input", {
                    type: "checkbox",
                    checked: useLocalTrackerSignal.value,
                    onChange: /* @__PURE__ */ __name(() => {
                      useLocalTrackerSignal.value = !useLocalTrackerSignal.value;
                      dbg3(`Local tracker ${useLocalTrackerSignal.value ? "enabled" : "disabled"}`);
                    }, "onChange")
                  }),
                  /* @__PURE__ */ d("span", {})
                ]
              })
            ]
          }),
          /* @__PURE__ */ d("label", {
            class: "chip transparent white-text",
            children: [
              /* @__PURE__ */ d("i", {
                class: "material-symbols small white-text",
                children: "group"
              }),
              peersSignal.value.length
            ]
          }),
          /* @__PURE__ */ d("label", {
            class: "switch",
            children: [
              /* @__PURE__ */ d("input", {
                type: "checkbox",
                checked: wtEnabled.value,
                onChange: handleToggle
              }),
              /* @__PURE__ */ d("span", {
                class: "white-text",
                children: /* @__PURE__ */ d("i", {
                  class: "material-symbols small",
                  children: "power_settings_new"
                })
              })
            ]
          })
        ]
      }),
      error && /* @__PURE__ */ d("article", {
        class: "error-container border left-margin right-margin top-margin",
        children: [
          /* @__PURE__ */ d("i", {
            class: "red-text",
            children: "error"
          }),
          /* @__PURE__ */ d("span", {
            class: "red-text",
            children: error
          })
        ]
      }),
      /* @__PURE__ */ d("main", {
        class: "responsive",
        children: /* @__PURE__ */ d("div", {
          class: "grid",
          children: [
            /* @__PURE__ */ d("div", {
              class: "s12 m4",
              children: [
                /* @__PURE__ */ d("article", {
                  class: "border round",
                  children: [
                    /* @__PURE__ */ d("nav", {
                      class: "middle",
                      children: [
                        /* @__PURE__ */ d("i", {
                          class: "material-symbols",
                          children: "add"
                        }),
                        /* @__PURE__ */ d("h5", {
                          children: "Novo Torrent"
                        })
                      ]
                    }),
                    /* @__PURE__ */ d("div", {
                      class: "tabs",
                      children: [
                        /* @__PURE__ */ d("a", {
                          class: "active",
                          children: [
                            /* @__PURE__ */ d("i", {
                              class: "material-symbols",
                              children: "upload"
                            }),
                            /* @__PURE__ */ d("span", {
                              children: "Seed"
                            })
                          ]
                        }),
                        /* @__PURE__ */ d("a", {
                          children: [
                            /* @__PURE__ */ d("i", {
                              class: "material-symbols",
                              children: "download"
                            }),
                            /* @__PURE__ */ d("span", {
                              children: "Leech"
                            })
                          ]
                        })
                      ]
                    }),
                    /* @__PURE__ */ d("div", {
                      class: "padding",
                      children: [
                        /* @__PURE__ */ d(SeederPanel, {
                          disabled: !wtEnabled.value
                        }),
                        /* @__PURE__ */ d("hr", {
                          class: "divider"
                        }),
                        /* @__PURE__ */ d(LeecherPanel, {
                          disabled: !wtEnabled.value
                        })
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ d("article", {
                  class: "border round top-margin",
                  children: [
                    /* @__PURE__ */ d("nav", {
                      class: "middle",
                      children: [
                        /* @__PURE__ */ d("i", {
                          class: "material-symbols",
                          children: "play_circle"
                        }),
                        /* @__PURE__ */ d("h5", {
                          children: "Player"
                        })
                      ]
                    }),
                    /* @__PURE__ */ d(PlayerPanel, {})
                  ]
                })
              ]
            }),
            /* @__PURE__ */ d("div", {
              class: "s12 m8",
              children: [
                /* @__PURE__ */ d("article", {
                  class: "border round",
                  children: [
                    /* @__PURE__ */ d("nav", {
                      class: "middle",
                      children: [
                        /* @__PURE__ */ d("i", {
                          class: "material-symbols",
                          children: "list"
                        }),
                        /* @__PURE__ */ d("h5", {
                          class: "max",
                          children: "Torrents"
                        })
                      ]
                    }),
                    /* @__PURE__ */ d(TorrentList, {})
                  ]
                }),
                /* @__PURE__ */ d(SwarmVisualizer, {}),
                /* @__PURE__ */ d(DebugPanel, {})
              ]
            })
          ]
        })
      })
    ]
  });
}
__name(App, "App");

// packages/example/src/main.tsx
init_mod2();
init_torrent();
init_swarm();
init_peer();
init_tracker();
init_mod2();
window.BrowserTorrentTest = {
  Client,
  Torrent,
  Swarm,
  Peer,
  WsTracker
};
function waitForActivation(worker) {
  return new Promise((resolve) => {
    if (worker.state === "activated") {
      resolve();
      return;
    }
    const onChange = /* @__PURE__ */ __name(() => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onChange);
        resolve();
      }
    }, "onChange");
    worker.addEventListener("statechange", onChange);
  });
}
__name(waitForActivation, "waitForActivation");
async function establishSWConnection() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sw = reg.active;
  if (!sw) return;
  const { port1, port2 } = new MessageChannel();
  sw.postMessage({
    type: "PORT"
  }, [
    port1
  ]);
  port2.onmessage = (e3) => {
    const msg = e3.data;
    if (msg?.type !== "webtorrent-request") return;
    const { url, method, headers, scope, destination } = msg;
    const chunkPort = e3.ports[0];
    const requestPort = e3.ports[1];
    console.log("[main] SW request:", method, url);
    try {
      const parsed = parseStreamURL(url, scope || getScope());
      if (!parsed) {
        chunkPort.postMessage({
          status: 404,
          body: "Not Found"
        });
        chunkPort.postMessage(null);
        chunkPort.close();
        return;
      }
      const entry = streamManager.get(parsed.infoHash, parsed.fileIndex);
      if (!entry) {
        console.log("[main] streamManager MISS \u2014 looking for:", parsed.infoHash, "idx:", parsed.fileIndex, "\n  Registered entries:", streamManager.list().map((e4) => `${e4.infoHash}:${e4.fileIndex} (${e4.file.name})`));
        chunkPort.postMessage({
          status: 404,
          body: "File not registered"
        });
        chunkPort.postMessage(null);
        chunkPort.close();
        return;
      }
      const file = entry.file;
      const range = parseRange(headers["range"], file.length);
      const status = range ? 206 : 200;
      const statusText = range ? "Partial Content" : "OK";
      const contentType = guessContentType2(file.name);
      const respHeaders = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store"
      };
      if (range) {
        respHeaders["Content-Range"] = `bytes ${range.start}-${range.end}/${file.length}`;
        respHeaders["Content-Length"] = String(range.end - range.start + 1);
      } else {
        respHeaders["Content-Length"] = String(file.length);
      }
      const rangeStart = range?.start ?? 0;
      const rangeEnd = range?.end ?? file.length - 1;
      let currentOffset = rangeStart;
      let fileStream = null;
      let fileIterator = null;
      const ensureStream = /* @__PURE__ */ __name(() => {
        if (!fileStream) {
          console.log("[main] ensureStream: creating ReadableStream, start:", rangeStart, "end:", rangeEnd);
          fileStream = file.createReadStream({
            start: rangeStart,
            end: rangeEnd
          });
          fileIterator = fileStream.getReader();
          console.log("[main] ensureStream: stream created, file.length:", file.length);
        }
      }, "ensureStream");
      let closed = false;
      const cleanup2 = /* @__PURE__ */ __name(() => {
        closed = true;
        fileIterator = null;
        fileStream = null;
        chunkPort.close();
      }, "cleanup");
      chunkPort.onmessage = async (ev) => {
        console.log("[main] chunkPort.onmessage FIRED, data:", ev.data, "closed:", closed);
        if (closed) return;
        const data = ev.data;
        if (data === null || data === false) {
          cleanup2();
          return;
        }
        if (data === true) {
          console.log("[main] SW wants chunk, currentOffset:", currentOffset, "rangeEnd:", rangeEnd);
          if (currentOffset > rangeEnd) {
            console.log("[main] all bytes sent, sending null");
            chunkPort.postMessage(null);
            cleanup2();
            return;
          }
          ensureStream();
          console.log("[main] reading chunk from fileIterator...");
          const { value, done } = await fileIterator.read();
          console.log("[main] fileIterator.read() returned, done:", done, "value:", value?.byteLength ?? "null");
          if (closed) return;
          if (done || !value || value.byteLength === 0) {
            console.log("[main] stream done, sending null, read bytes:", currentOffset - rangeStart, "/", rangeEnd - rangeStart + 1);
            chunkPort.postMessage(null);
            cleanup2();
            return;
          }
          currentOffset += value.byteLength;
          console.log("[main] \u2192 chunk to SW:", value.byteLength, "bytes, offset:", currentOffset, "/", rangeEnd + 1);
          chunkPort.postMessage(value);
        }
      };
      chunkPort.start?.();
      console.log("[main] chunkPort started");
      requestPort.postMessage({
        status,
        statusText,
        headers: respHeaders,
        body: "STREAM"
      });
      console.log("[main] Response metadata sent, body=STREAM, range:", rangeStart, "-", rangeEnd);
    } catch (err) {
      console.error("[main] Error:", err);
      chunkPort.postMessage({
        status: 500,
        body: String(err)
      });
      chunkPort.postMessage(null);
      chunkPort.close();
    }
  };
}
__name(establishSWConnection, "establishSWConnection");
function parseRange(header, fileLength) {
  if (!header) return null;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const endStr = match[2];
  const end = endStr ? Number(endStr) : fileLength - 1;
  if (!Number.isFinite(start) || start < 0 || start >= fileLength) return null;
  if (!Number.isFinite(end) || end < start || end >= fileLength) return null;
  return {
    start,
    end
  };
}
__name(parseRange, "parseRange");
function guessContentType2(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  const types = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp"
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}
__name(guessContentType2, "guessContentType");
async function bootstrap() {
  if (!navigator.storage?.getDirectory) {
    console.warn("[main] OPFS n\xE3o dispon\xEDvel");
  }
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", {
        scope: "./"
      });
      console.log("[main] SW Registered:", reg.scope);
      const activeWorker = reg.active ?? reg.installing ?? reg.waiting;
      if (activeWorker) {
        if (activeWorker.state === "activated") {
          await establishSWConnection();
          console.log("[main] SW MessageChannel established");
        } else {
          await waitForActivation(activeWorker);
          await establishSWConnection();
          console.log("[main] SW MessageChannel established (after activation)");
        }
      } else {
        const reg2 = await navigator.serviceWorker.ready;
        const w4 = reg2.active;
        if (w4) {
          await establishSWConnection();
          console.log("[main] SW MessageChannel established (via ready)");
        }
      }
    } catch (e3) {
      console.error("[main] SW Registration failed:", e3);
    }
  }
  be(/* @__PURE__ */ d(TorrentProvider, {
    children: /* @__PURE__ */ d(App, {})
  }), document.getElementById("app"));
}
__name(bootstrap, "bootstrap");
bootstrap().catch(console.error);
//# sourceMappingURL=main.js.map
