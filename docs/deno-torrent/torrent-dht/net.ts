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
