import Id from '~/src/id.ts'
import Peer from '~/src/peer.ts'
import { extractCompactNode, packageCompactNode } from '~/src/util/net.ts'

/**
 * Node must be a Peer, and it contains the node's id, routing table and file info hashs
 */
export default class Node extends Peer {
  /** Duration in milliseconds for which the node is considered active. */
  readonly ACTIVE_RANGE = 5 * 60 * 1000
  #id: Id // 20 bytes sha1 hash
  #activedAt!: number // the last active time of the node

  /** Create a DHT node with an ID and network endpoint. */
  constructor(id: Id, port: number, addr: string) {
    super(port, addr)
    this.#id = id
    this.#activedAt = Date.now()
  }

  /** Mark the node as active at the current time. */
  updateActivedAt(): void {
    this.#activedAt = Date.now()
  }

  /** Timestamp of the most recent activity, in milliseconds since Unix epoch. */
  get activedAt(): number {
    return this.#activedAt
  }

  /** Return whether the node was active within `ACTIVE_RANGE`. */
  isActive(): boolean {
    return Date.now() - this.#activedAt < this.ACTIVE_RANGE
  }

  /** The node's 20-byte DHT identifier. */
  get id(): Id {
    return this.#id
  }

  /** Update the endpoint and refresh the activity timestamp. */
  override update(port: number, addr: string): void {
    super.update(port, addr)
    this.updateActivedAt()
  }

  /** Return a human-readable node representation. */
  override toString(): string {
    return `{id: ${this.#id.toString()}, port: ${this.port}, addr: ${this.addr}}`
  }

  /** Encode this node as the BEP-5 26-byte compact node representation. */
  override toCompact(): Uint8Array {
    return packageCompactNode(this.#id, this.addr, this.port)
  }

  /** Decode a node from the BEP-5 26-byte compact representation. */
  static override fromCompact(bytes: Uint8Array): Node {
    const { id, port, addr } = extractCompactNode(bytes)

    return new Node(id, port, addr)
  }
}
