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
