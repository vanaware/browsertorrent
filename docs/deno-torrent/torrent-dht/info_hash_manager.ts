import Peer from '~/src/peer.ts'
import logger from '~/src/util/log.ts'

type StoredPeer = {
  peer: Peer
  lastSeenAt: number
}

/** In-memory association between info hashes, peers, and announce tokens. */
export default class InfoHashManager {
  /** Maximum number of peers retained for one info hash. */
  static readonly MAX_PEERS_PER_INFO_HASH = 100
  /** Maximum number of info hashes retained process-wide. */
  static readonly MAX_INFO_HASHES = 10_000
  /** Duration for which an unrefreshed peer endpoint remains available. */
  static readonly PEER_TTL_MS = 30 * 60 * 1000

  #infoHashes: Map<string, Map<string, StoredPeer>> = new Map()
  #tokenMap: Map<string, Uint8Array> = new Map()
  #lastFullPruneAt = 0
  /** Create an isolated peer and token store. */
  constructor() {}

  /**
   * get all peers of the infoHash
   * @param infoHash hex string
   * @returns
   */
  find(infoHash: string): Peer[] | undefined {
    const peers = this.#pruneInfoHash(infoHash, Date.now())
    if (!peers) return undefined

    return Array.from(peers.values(), ({ peer }) => peer)
  }

  /** Return the announce token stored for an info hash. */
  findToken(infoHash: string): Uint8Array | undefined {
    this.#pruneInfoHash(infoHash, Date.now())
    const token = this.#tokenMap.get(infoHash)
    return token?.slice()
  }

  /** Add multiple peers, retaining an announce token when the responder supplied one. */
  addList(infoHash: string, peers: Peer[], token?: Uint8Array): void {
    for (const peer of peers) {
      this.#addPeer(infoHash, peer, token)
    }
  }

  /**
   * add a peer to the infoHash
   * @param infoHash hex string
   * @param peer Peer
   */
  add(infoHash: string, peer: Peer, token: Uint8Array): void {
    this.#addPeer(infoHash, peer, token)
  }

  /** Store a peer whose announce token has already been validated by KRPC. */
  addValidatedPeer(infoHash: string, peer: Peer): void {
    this.#addPeer(infoHash, peer)
  }

  #addPeer(infoHash: string, peer: Peer, token?: Uint8Array): void {
    const now = Date.now()
    let peers = this.#pruneInfoHash(infoHash, now)

    if (!peers && this.#infoHashes.size >= InfoHashManager.MAX_INFO_HASHES) {
      if (now - this.#lastFullPruneAt >= 60_000) this.prune(now)
      peers = this.#infoHashes.get(infoHash)
    }

    if (!peers && this.#infoHashes.size >= InfoHashManager.MAX_INFO_HASHES) {
      logger.error(
        `the number of infoHashes exceeds the limit ${InfoHashManager.MAX_INFO_HASHES}, ignore ${infoHash}:${peer.addr}:${peer.port}`,
      )
      return
    }

    const prevToken = this.#tokenMap.get(infoHash)

    const peerKey = `${peer.addr}\0${peer.port}`
    if (peers?.has(peerKey)) {
      peers.set(peerKey, { peer, lastSeenAt: now })
      return
    }

    // check the number of peers
    if (peers && peers.size >= InfoHashManager.MAX_PEERS_PER_INFO_HASH) {
      logger.error(
        `the number of peers of ${infoHash} exceeds the limit ${InfoHashManager.MAX_PEERS_PER_INFO_HASH}, ignore ${peer.addr}:${peer.port}`,
      )
      return
    }

    // create a new set if the infoHash does not exist
    if (!peers) {
      peers = new Map()
      this.#infoHashes.set(infoHash, peers)
    }

    // set token
    if (!prevToken && token !== undefined) {
      this.#tokenMap.set(infoHash, token.slice())
    }

    peers.set(peerKey, { peer, lastSeenAt: now })
  }

  /**
   * delete all peers of the infoHash
   * @param infoHash hex string
   */
  remove(infoHash: string): void {
    if (!this.#infoHashes.has(infoHash)) {
      logger.warn(`the infoHash ${infoHash} does not exist, delete failed`)
      return
    }
    this.#infoHashes.delete(infoHash)
    this.#tokenMap.delete(infoHash)
  }

  /**
   * Remove peer endpoints that have not been refreshed within the retention window.
   *
   * @param now Current epoch time in milliseconds; exposed for deterministic maintenance and tests.
   * @returns Number of peer endpoints removed.
   */
  prune(now: number = Date.now()): number {
    let removed = 0
    for (const [infoHash, peers] of this.#infoHashes) {
      const previousSize = peers.size
      this.#pruneInfoHash(infoHash, now)
      removed += previousSize - (this.#infoHashes.get(infoHash)?.size ?? 0)
    }
    this.#lastFullPruneAt = now
    return removed
  }

  #pruneInfoHash(infoHash: string, now: number): Map<string, StoredPeer> | undefined {
    const peers = this.#infoHashes.get(infoHash)
    if (!peers) return undefined

    for (const [peerKey, stored] of peers) {
      if (now - stored.lastSeenAt >= InfoHashManager.PEER_TTL_MS) peers.delete(peerKey)
    }

    if (peers.size === 0) {
      this.#infoHashes.delete(infoHash)
      this.#tokenMap.delete(infoHash)
      return undefined
    }

    return peers
  }
}
