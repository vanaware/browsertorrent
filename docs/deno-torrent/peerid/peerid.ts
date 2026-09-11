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
