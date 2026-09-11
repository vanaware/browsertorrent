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
