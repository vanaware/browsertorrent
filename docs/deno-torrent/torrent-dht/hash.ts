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
