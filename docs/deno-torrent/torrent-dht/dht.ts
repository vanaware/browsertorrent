import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { type DatagramTransport, KRPC } from '~/src/krpc/krpc.ts'
import TransactionManager, { Request } from '~/src/krpc/transaction_manager.ts'
import TokenManager from '~/src/krpc/token_manager.ts'
import LocalNode from '~/src/local_node.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { NetUtil } from '@deno-torrent/toolkit'

/** Bootstrap endpoint used to join the public DHT. */
export type BootstrapNode = { addr: string; port: number }

/** Configuration for one isolated DHT node. */
export type DHTOptions = {
  /** UDP port to bind and advertise. */
  port: number
  /** Local IPv4 interface to bind. Defaults to all interfaces. */
  bindAddress?: string
  /** Optional IPv4 address advertised in compact node records. */
  publicAddress?: string
  /** Stable node ID. Omit to generate a random ID without reading host network interfaces. */
  nodeId?: Id
  /** Bootstrap endpoints. Defaults to the public router list. */
  bootstrapNodes?: BootstrapNode[]
  /** Start bootstrap requests during construction. Defaults to true. */
  autoBootstrap?: boolean
  /** Caller-owned UDP transport, used when DHT shares a socket with another protocol. */
  transport?: DatagramTransport
}

/** Controls one bounded iterative BEP-5 peer lookup. */
export type GetPeersOptions = {
  signal?: AbortSignal
  /** Overall lookup deadline. Defaults to 15 seconds. */
  timeoutMs?: number
  /** Deadline for one KRPC exchange. Defaults to 3 seconds. */
  queryTimeoutMs?: number
  /** Simultaneous KRPC queries. Defaults to BEP-5's recommended alpha of 3. */
  concurrency?: number
  /** Maximum nodes contacted in one lookup. Defaults to 64. */
  maxQueries?: number
  /** Stop after this many unique peers. Defaults to 200. */
  maxPeers?: number
  /** Called once for each newly discovered endpoint. */
  onPeer?: (peer: Peer) => void | Promise<void>
}

/** Completed result of a high-level DHT peer lookup. */
export type GetPeersResult = {
  peers: Peer[]
  queriedNodes: number
  respondingNodes: number
  timedOut: boolean
  exhausted: boolean
  durationMs: number
}

/** Controls announcing the local BitTorrent listening port to the DHT. */
export type AnnouncePeerOptions = {
  /** BitTorrent TCP/uTP listening port; defaults to the DHT node port. */
  port?: number
  /** Ask the remote node to use the UDP source port observed through NAT. */
  impliedPort?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  queryTimeoutMs?: number
  maxNodes?: number
}

/** Result of announcing to the nodes that issued fresh tokens. */
export type AnnouncePeerResult = {
  attempted: number
  announced: number
  failures: string[]
}

type StoredAnnounceToken = { node: Node; token: Uint8Array; receivedAt: number }

/**
 * the host node of the dht network
 */
export default class DHT {
  static #DEFAULT_BOOTSTRAP_NODES = [
    {
      addr: 'router.bittorrent.com',
      port: 6881,
    },
    {
      addr: 'dht.transmissionbt.com',
      port: 6881,
    },
    {
      addr: 'router.utorrent.com',
      port: 6881,
    },
    {
      addr: 'dht.aelitis.com',
      port: 6881,
    },
  ]
  #bootstrapNodes: BootstrapNode[] // the bootstrap nodes
  #krpc: KRPC // the krpc protocol
  readonly #routingTable: RoutingTable
  readonly #infoHashManager: InfoHashManager
  readonly #announceTokens = new Map<string, Map<string, StoredAnnounceToken>>()
  #bootstrapInFlight?: Promise<void>
  #closed = false

  private constructor(options: DHTOptions, localNode: LocalNode, bootstrapNodes: BootstrapNode[]) {
    const { port, bindAddress = '0.0.0.0', autoBootstrap = true } = options
    // check the port
    if (!NetUtil.isNetPort(port)) {
      throw new Error('invalid port, should be in range [0, 65535], but got ' + port)
    }

    // check the bootstrap nodes
    if (!bootstrapNodes || bootstrapNodes.length == 0) {
      throw new Error('you should provide at least one bootstrap node, or use the default bootstrap nodes')
    }

    logger.info('initialize isolated DHT state')
    this.#routingTable = new RoutingTable(localNode)
    this.#infoHashManager = new InfoHashManager()
    const transactionManager = new TransactionManager<Request>()
    const tokenManager = new TokenManager()

    // initilize the bootstrap nodes
    logger.info('initilize the bootstrap nodes')
    this.#bootstrapNodes = bootstrapNodes

    // initilize the krpc protocol
    logger.info('initilize the krpc protocol')
    this.#krpc = KRPC.create(
      port,
      this.#routingTable,
      this.#infoHashManager,
      transactionManager,
      tokenManager,
      bindAddress,
      options.transport,
    )

    if (autoBootstrap) {
      void this.pingBootstrapNodes().catch((error) => logger.error(`bootstrap failed: ${error}`))
    }
  }

  /** Routing state owned exclusively by this DHT instance. */
  get routingTable(): RoutingTable {
    return this.#routingTable
  }

  /** Peer associations discovered by this DHT instance. */
  get infoHashManager(): InfoHashManager {
    return this.#infoHashManager
  }

  /**
   * create a dht network and listen on the port
   * @param port the port to listen on
   * @param bootstrapNodes the bootstrap nodes
   * @returns
   */
  static async listen(options: DHTOptions): Promise<DHT> {
    if (!options || typeof options !== 'object') throw new TypeError('DHT options are required')
    const { port, bindAddress = '0.0.0.0', publicAddress, nodeId } = options
    const bootstrapNodes = options.bootstrapNodes ?? DHT.#DEFAULT_BOOTSTRAP_NODES
    if (!NetUtil.isNetPort(port)) {
      throw new RangeError(`port must be in range [0, 65535], but got ${port}`)
    }
    if (!NetUtil.isIPv4Str(bindAddress)) throw new TypeError(`bindAddress must be an IPv4 address: ${bindAddress}`)
    if (publicAddress !== undefined && !NetUtil.isIPv4Str(publicAddress)) {
      throw new TypeError(`publicAddress must be an IPv4 address: ${publicAddress}`)
    }
    if (!bootstrapNodes || bootstrapNodes.length === 0) {
      throw new TypeError('at least one bootstrap node is required')
    }

    const localNode = await LocalNode.createLocalNode(port, { publicAddress, bindAddress, nodeId })

    return new DHT(options, localNode, [...bootstrapNodes])
  }

  /**
   * Contact every configured bootstrap endpoint.
   *
   * A DNS or UDP failure from one endpoint is logged and does not prevent the
   * remaining endpoints from being attempted.
   */
  pingBootstrapNodes(): Promise<void> {
    if (this.#bootstrapInFlight) return this.#bootstrapInFlight
    const operation = this.#contactBootstrapNodes()
    const tracked = operation.finally(() => {
      if (this.#bootstrapInFlight === tracked) this.#bootstrapInFlight = undefined
    })
    this.#bootstrapInFlight = tracked
    return tracked
  }

  async #contactBootstrapNodes(): Promise<void> {
    logger.info(`start pingBootstrapNodes`)
    for (const bootstrapNode of this.#bootstrapNodes) {
      logger.info(`ping the bootstrap node ${bootstrapNode.addr}:${bootstrapNode.port}`)
      try {
        await this.#krpc.sendPingBootrapNodesRequest(bootstrapNode)
        await this.#krpc.sendFindNodeRequest(bootstrapNode.port, bootstrapNode.addr, Id.random())
      } catch (error) {
        logger.warn(`bootstrap node ${bootstrapNode.addr}:${bootstrapNode.port} failed: ${error}`)
      }
    }
  }

  /** Ask every known routing-table node for nodes near a random target. */
  async sendFindNodeRequest(): Promise<void> {
    logger.info(`start sendFindNodeRequest`)
    // get node from bucket
    for (const bucket of this.#routingTable.buckets) {
      if (bucket.isEmpty()) {
        continue
      }
      for (const node of bucket.nodes) {
        await this.#krpc.sendFindNodeRequest(node.port, node.addr, Id.random())
      }
    }
  }

  /**
   * Ask the closest known nodes for peers associated with an info hash.
   *
   * @param infoHash A 20-byte BitTorrent info hash.
   */
  async sendGetPeersRequest(infoHash: Uint8Array): Promise<void> {
    logger.info(`start sendGetPeersRequest`)
    if (this.#routingTable.nodeCount === 0) {
      logger.info(`no nodes in the routing table, skip sendGetPeersRequest`)
      return
    }
    const closestNodes = this.#routingTable.findClosestNodes(Id.fromUnit8Array(infoHash))

    if (closestNodes.length === 0) {
      logger.info(`[no closest nodes found], sendGetPeersRequest to a random node`)
      // 随机获取一个node
      const node = this.#routingTable.getRandomNode()
      if (node) {
        await this.#krpc.sendGetPeersRequest(node, infoHash)
        return
      }
    } else {
      logger.info(`[closest nodes found], sendGetPeersRequest to ${closestNodes.length} nodes`)
      for (const node of closestNodes) {
        await this.#krpc.sendGetPeersRequest(node, infoHash)
      }
    }
  }

  /**
   * Iteratively query the closest known nodes until the candidate set is
   * exhausted, a resource bound is reached, or the operation is cancelled.
   */
  async getPeers(infoHash: Uint8Array, options: GetPeersOptions = {}): Promise<GetPeersResult> {
    this.#assertOpen()
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    options.signal?.throwIfAborted()
    const timeoutMs = positiveNumber(options.timeoutMs ?? 15_000, 'timeoutMs')
    const queryTimeoutMs = positiveNumber(options.queryTimeoutMs ?? 3_000, 'queryTimeoutMs')
    const concurrency = positiveInteger(options.concurrency ?? 3, 'concurrency')
    const maxQueries = positiveInteger(options.maxQueries ?? 64, 'maxQueries')
    const maxPeers = positiveInteger(options.maxPeers ?? 200, 'maxPeers')
    const startedAt = Date.now()
    const deadline = startedAt + timeoutMs
    const target = Id.fromUnit8Array(infoHash)
    const hashKey = bytesToHex(infoHash)
    const candidates = new Map<string, Node>()
    const queried = new Set<string>()
    const peers = new Map<string, Peer>()
    let respondingNodes = 0

    const addCandidates = (nodes: readonly Node[]) => {
      for (const node of nodes) {
        if (node.id.equals(this.#routingTable.localNode.id)) continue
        candidates.set(node.id.toString(), node)
        this.#routingTable.add(node)
      }
    }

    if (this.#routingTable.nodeCount === 0) {
      await this.pingBootstrapNodes()
      const bootstrapDeadline = Math.min(deadline, Date.now() + Math.min(queryTimeoutMs, 2_000))
      while (this.#routingTable.nodeCount === 0 && Date.now() < bootstrapDeadline) {
        await delay(Math.min(25, bootstrapDeadline - Date.now()), options.signal)
      }
    }
    addCandidates(this.#routingTable.findClosestNodes(target, maxQueries))

    while (queried.size < maxQueries && peers.size < maxPeers && Date.now() < deadline) {
      options.signal?.throwIfAborted()
      addCandidates(this.#routingTable.findClosestNodes(target, maxQueries))
      const batch = [...candidates.values()]
        .filter((node) => !queried.has(node.id.toString()))
        .sort((left, right) => compareDistance(left, right, target))
        .slice(0, Math.min(concurrency, maxQueries - queried.size))
      if (batch.length === 0) break
      for (const node of batch) queried.add(node.id.toString())

      const remaining = deadline - Date.now()
      const results = await Promise.allSettled(
        batch.map((node) =>
          this.#krpc.queryGetPeers(node, infoHash, {
            signal: options.signal,
            timeoutMs: Math.max(1, Math.min(queryTimeoutMs, remaining)),
          })
        ),
      )
      options.signal?.throwIfAborted()

      for (const result of results) {
        if (result.status === 'rejected') continue
        respondingNodes++
        const response = result.value
        if (response.token) this.#storeAnnounceToken(hashKey, response.node, response.token)
        addCandidates(response.nodes)
        for (const peer of response.peers) {
          const key = `${peer.addr}\0${peer.port}`
          if (peers.has(key)) continue
          peers.set(key, peer)
          await options.onPeer?.(peer)
          if (peers.size >= maxPeers) break
        }
      }
    }

    const timedOut = Date.now() >= deadline
    const hasUnqueriedCandidate = [...candidates.values()].some((node) => !queried.has(node.id.toString()))
    return {
      peers: [...peers.values()],
      queriedNodes: queried.size,
      respondingNodes,
      timedOut,
      exhausted: !timedOut && !hasUnqueriedCandidate,
      durationMs: Date.now() - startedAt,
    }
  }

  /**
   * Announce a BitTorrent listening port using fresh per-node tokens collected
   * by {@link getPeers}. A lookup is performed automatically when necessary.
   */
  async announcePeer(infoHash: Uint8Array, options: AnnouncePeerOptions = {}): Promise<AnnouncePeerResult> {
    this.#assertOpen()
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    options.signal?.throwIfAborted()
    const port = options.port ?? this.#routingTable.localNode.port
    if (!NetUtil.isNetPort(port) || port === 0) throw new RangeError('port must be in range [1, 65535]')
    const timeoutMs = positiveNumber(options.timeoutMs ?? 15_000, 'timeoutMs')
    const queryTimeoutMs = positiveNumber(options.queryTimeoutMs ?? 3_000, 'queryTimeoutMs')
    const maxNodes = positiveInteger(options.maxNodes ?? 8, 'maxNodes')
    const hashKey = bytesToHex(infoHash)
    let tokens = this.#freshTokens(hashKey)
    if (tokens.length === 0) {
      await this.getPeers(infoHash, {
        signal: options.signal,
        timeoutMs,
        queryTimeoutMs,
        maxQueries: Math.max(maxNodes, 8),
      })
      tokens = this.#freshTokens(hashKey)
    }
    tokens = tokens.slice(0, maxNodes)

    const results = await Promise.allSettled(
      tokens.map(({ node, token }) =>
        this.#krpc.queryAnnouncePeer(node, infoHash, token, port, {
          signal: options.signal,
          timeoutMs: queryTimeoutMs,
          impliedPort: options.impliedPort,
        })
      ),
    )
    options.signal?.throwIfAborted()
    const failures: string[] = []
    let announced = 0
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        announced++
      } else {
        const node = tokens[index]!.node
        failures.push(`${node.addr}:${node.port}: ${errorMessage(result.reason)}`)
      }
    })
    return { attempted: tokens.length, announced, failures }
  }

  #storeAnnounceToken(infoHash: string, node: Node, token: Uint8Array): void {
    let tokens = this.#announceTokens.get(infoHash)
    if (!tokens) {
      tokens = new Map()
      this.#announceTokens.set(infoHash, tokens)
    }
    tokens.set(node.id.toString(), { node, token: token.slice(), receivedAt: Date.now() })
  }

  #freshTokens(infoHash: string): StoredAnnounceToken[] {
    const tokens = this.#announceTokens.get(infoHash)
    if (!tokens) return []
    const oldest = Date.now() - 5 * 60 * 1000
    for (const [nodeId, entry] of tokens) {
      if (entry.receivedAt < oldest) tokens.delete(nodeId)
    }
    if (tokens.size === 0) this.#announceTokens.delete(infoHash)
    return [...tokens.values()]
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('DHT node is closed')
  }

  /**
   * Close the DHT node and release its UDP socket.
   *
   * Calling this method more than once is safe. The instance must not be used
   * to send requests after it has been closed.
   */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#announceTokens.clear()
    this.#krpc.close()
  }
}

function positiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be greater than zero`)
  return value
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`)
  return value
}

function compareDistance(left: Node, right: Node, target: Id): number {
  const leftDistance = left.id.bits.xor(target.bits)
  const rightDistance = right.id.bits.xor(target.bits)
  if (leftDistance.equals(rightDistance)) return 0
  return leftDistance.lessThan(rightDistance) ? -1 : 1
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds)
    function done() {
      signal?.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', aborted, { once: true })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
