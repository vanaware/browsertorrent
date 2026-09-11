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
