import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import ErrorResponseHandler from '~/src/krpc/handler/error_handler.ts'
import RequestHandler from '~/src/krpc/handler/request_handler.ts'
import ResponseHandler from '~/src/krpc/handler/response_handler.ts'
import Sender from '~/src/krpc/sender.ts'
import TransactionManager from '~/src/krpc/transaction_manager.ts'
import type { GetPeersQueryResult, Request } from '~/src/krpc/transaction_manager.ts'
import TokenManager from '~/src/krpc/token_manager.ts'
import MessageFactory, { Message, MessageType, QueryType } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { NetUtil } from '@deno-torrent/toolkit'

const NODE_PROBE_TIMEOUT_MS = 2_000

export interface DatagramTransport extends AsyncIterable<[Uint8Array, Deno.Addr]> {
  send(data: Uint8Array, address: Deno.Addr): Promise<number>
  close(): void
}

export interface MessageHandler {
  /**
   * get the message type, then the dispatcher will call the handle() method
   */
  getHandleMessageType(): MessageType

  handle(message: Message, address: string, port: number, client: Sender): Promise<void>
}

/**
 * KRPC protocol implementation for DHT
 */
export class KRPC implements Sender {
  #port: number
  #udp: DatagramTransport
  #closed = false
  #messageHandlers: Map<MessageType, MessageHandler>

  private constructor(
    port: number,
    private readonly routingTable: RoutingTable,
    private readonly transactionManager: TransactionManager<Request>,
    infoHashManager: InfoHashManager,
    tokenManager: TokenManager,
    bindAddress: string,
    udp?: DatagramTransport,
    private readonly probeTimeoutMs = NODE_PROBE_TIMEOUT_MS,
  ) {
    this.#port = port
    this.#messageHandlers = new Map<MessageType, MessageHandler>([
      [
        MessageType.RESPONSE,
        new ResponseHandler(
          routingTable,
          infoHashManager,
          transactionManager,
          (node) => this.considerNode(node),
        ),
      ],
      [MessageType.QUERY, new RequestHandler(routingTable, infoHashManager, tokenManager)],
      [MessageType.ERROR, new ErrorResponseHandler(transactionManager)],
    ])

    // initilize the a udp listener and sender
    this.#udp = udp ??
      Deno.listenDatagram({
        port: this.#port,
        transport: 'udp',
        hostname: bindAddress,
      })

    // async handle response
    void this.handlePacket()
  }
  /**
   * create a KRPC instance
   * @param port
   * @returns
   */
  static create(
    port: number,
    routingTable: RoutingTable,
    infoHashManager: InfoHashManager,
    transactionManager: TransactionManager<Request>,
    tokenManager: TokenManager,
    bindAddress = '0.0.0.0',
    udp?: DatagramTransport,
    probeTimeoutMs?: number,
  ) {
    if (!NetUtil.isNetPort(port)) throw new Error('invalid port, should be in range [0, 65535], but got ' + port)
    if (probeTimeoutMs !== undefined && (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0)) {
      throw new RangeError('probeTimeoutMs must be greater than zero')
    }
    if (!NetUtil.isIPv4Str(bindAddress)) throw new TypeError(`bindAddress must be an IPv4 address: ${bindAddress}`)
    return new KRPC(
      port,
      routingTable,
      transactionManager,
      infoHashManager,
      tokenManager,
      bindAddress,
      udp,
      probeTimeoutMs,
    )
  }

  /**
   * dispatch message to the corresponding handler
   * @param message the message to dispatch
   * @param address the address of the node
   * @param port the port of the node
   */
  async dispatchMessage(message: Message, address: string, port: number) {
    const handler = this.#messageHandlers.get(message.y)
    if (!handler) {
      logger.error(`no handler for message type: ${message.y}`)
      return
    }
    await handler.handle(message, address, port, this)
  }

  /**
   * handle udp packet
   */
  async handlePacket() {
    try {
      for await (const packet of this.#udp) {
        // unpack the packet
        const [data, addr] = packet as [Uint8Array, Deno.NetAddr]
        const address = addr.hostname
        const port = addr.port
        const message = await MessageFactory.decode(data)

        if (!message) {
          logger.error(`[<======UDP-handlePacket] decode data failed: ${data}, from ${address}:${port}`)
          continue
        }

        const tid = message.t

        try {
          logger.debug(`handle message ${tid} from ${address}:${port}`)
          await this.dispatchMessage(message, address, port)
        } catch (e) {
          logger.error(`[<======UDP-handlePacket] dispatch message failed: ${e}`)
        }
      }
    } catch (error) {
      if (!this.#closed) logger.error(`[<======UDP-handlePacket] receive loop failed: ${error}`)
    }
  }

  /** Close the UDP socket. Calling this method more than once is safe. */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#udp.close()
  }

  /**
   * // TODO handle timeout request
   * send a message to a node
   * @param port port of the node
   * @param addr address of the node
   * @param messageFc the message to send
   */
  async sendMessage(port: number, addr: string, messageFc: MessageFactory) {
    const bencodeMessage = await messageFc.bencode()

    try {
      await this.#udp.send(bencodeMessage, {
        transport: 'udp',
        hostname: addr,
        port: port,
      })
      // logger.info(`[======>SEND] send message to ${addr}:${port} success: (${JSON.stringify(message)}`)
    } catch (e) {
      logger.error(`[======>SEND] send message to ${addr}:${port} failed`, e)
      throw new Error(`failed to send KRPC message to ${addr}:${port}`, { cause: e })
    }
  }

  async #sendTracked(tid: string, port: number, address: string, message: MessageFactory): Promise<void> {
    try {
      await this.sendMessage(port, address, message)
    } catch (error) {
      if (this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
      throw error
    }
  }

  /** Apply BEP 5 ping-before-replace semantics to a discovered node. */
  async considerNode(node: Node): Promise<boolean> {
    if (this.routingTable.findNode(node.id)) {
      this.routingTable.add(node)
      return true
    }

    const candidate = this.routingTable.replacementCandidate(node)
    if (!candidate) return this.routingTable.add(node)
    if (await this.#probeNode(candidate)) return false
    return this.routingTable.replace(candidate, node)
  }

  #probeNode(node: Node): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (reachable: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(reachable)
      }

      const tid = this.transactionManager.create({
        type: QueryType.PING,
        addr: node.addr,
        port: node.port,
        onResult: settle,
      })
      const timer = setTimeout(() => {
        if (this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
        settle(false)
      }, this.probeTimeoutMs)

      const message = MessageFactory.requestPing(tid, this.routingTable.localNode.id)
      void this.#sendTracked(tid, node.port, node.addr, message).catch(() => settle(false))
    })
  }

  /**
   * send a ping query to the node
   *
   * request:
   * ping Query = {"t":"aa", "y":"q", "q":"ping", "a":{"id":"<hex string>"}}
   * the id is local node id
   *
   * response:
   * Response = {"t":"aa", "y":"r", "r": {"id":"<hex string>"}}
   * the id is the node which response the ping query
   *
   * @param targetNode which node to ask
   * @param nodeId the node id of the local node
   */
  async sendPingRequest(targetNode: Node) {
    const address = await this.resolveAddress(targetNode.addr)
    const tid = this.transactionManager.create({
      type: QueryType.PING,
      addr: address,
      port: targetNode.port,
    })

    const messageFC = MessageFactory.requestPing(tid, this.routingTable.localNode.id)

    // send the message
    await this.#sendTracked(tid, targetNode.port, address, messageFC)
  }

  /**
   * send a find_node query to the node
   *
   * find_node Query = {"t":"aa", "y":"q", "q":"find_node", "a": {"id":"<hex string>", "target":"<hex string>"}}
   * "id" containing the node ID of the querying node, and "target" containing the ID of the node sought by the queryer.
   *
   * Response = {"t":"aa", "y":"r", "r": {"id":"<hex string>", "nodes": "<hex string>"}}
   *
   * @param port
   * @param addr
   */
  async sendFindNodeRequest(port: number, addr: string, targetId: Id) {
    const address = await this.resolveAddress(addr)
    const tid = this.transactionManager.create({
      type: QueryType.FIND_NODE,
      addr: address,
      port: port,
    })

    const messageFC = MessageFactory.requestFindNode(tid, this.routingTable.localNode.id, targetId)
    await this.#sendTracked(tid, port, address, messageFC)
  }

  /**
   * send a get_peers query to target node to get peers of the file
   *
   * @param targetNode which node to get peers from, the node must be in the routing table
   * @param infoHash the info hash of the file
   */
  async sendGetPeersRequest(targetNode: Node, infoHash: Uint8Array) {
    const address = await this.resolveAddress(targetNode.addr)
    const tid = this.transactionManager.create({
      type: QueryType.GET_PEERS,
      infoHash: infoHash,
      addr: address,
      port: targetNode.port,
    })
    const messageFC = MessageFactory.requestGetPeers(tid, this.routingTable.localNode.id, infoHash)
    await this.#sendTracked(tid, targetNode.port, address, messageFC)
  }

  /** Perform one bounded get_peers exchange and return its parsed response. */
  async queryGetPeers(
    targetNode: Node,
    infoHash: Uint8Array,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<GetPeersQueryResult> {
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    const timeoutMs = options.timeoutMs ?? 3_000
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be greater than zero')
    options.signal?.throwIfAborted()
    const address = await this.resolveAddress(targetNode.addr)

    return new Promise<GetPeersQueryResult>((resolve, reject) => {
      let settled = false
      let tid = ''
      const finish = (result?: GetPeersQueryResult, error?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (tid && this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
        if (error !== undefined) reject(error)
        else resolve(result!)
      }
      const onAbort = () => finish(undefined, options.signal?.reason ?? abortError())
      tid = this.transactionManager.create({
        type: QueryType.GET_PEERS,
        infoHash: Uint8Array.from(infoHash),
        addr: address,
        port: targetNode.port,
        onResult: (reachable) => {
          if (!reachable) {
            finish(undefined, new Error(`DHT node ${targetNode.addr}:${targetNode.port} rejected get_peers`))
          }
        },
        onGetPeersResult: (result) => finish(result),
      })
      const timer = setTimeout(
        () => finish(undefined, new DOMException('DHT get_peers query timed out', 'TimeoutError')),
        timeoutMs,
      )
      options.signal?.addEventListener('abort', onAbort, { once: true })
      const message = MessageFactory.requestGetPeers(tid, this.routingTable.localNode.id, infoHash)
      void this.#sendTracked(tid, targetNode.port, address, message).catch((error) => finish(undefined, error))
    })
  }

  /**
   * send a announce_peer query to target node to announce the peer, means tell the node that I have the file
   *
   * get_peers Query = {"t":"aa", "y":"q", "q":"get_peers", "a": {"id":"<hex string>", "info_hash":"<hex string>"}}
   * Response with closest nodes = {"t":"aa", "y":"r", "r": {"id":"<hex string>", "token":"<token>", "nodes": "<hex string>"}}
   *
   * @param targetNode which node to announce to, the node must be in the routing table
   * @param infoHash the info hash of the file
   * @param token the token of the node
   */
  async sendAnnouncePeerRequest(targetNode: Node, infoHash: Uint8Array, token: Uint8Array, peerPort = this.#port) {
    const address = await this.resolveAddress(targetNode.addr)
    const tid = this.transactionManager.create({
      type: QueryType.ANNOUNCE_PEER,
      infoHash: infoHash,
      addr: address,
      port: targetNode.port,
    })
    const messageFC = MessageFactory.requestAnnouncePeer(
      tid,
      this.routingTable.localNode.id,
      infoHash,
      peerPort,
      token,
    )
    await this.#sendTracked(tid, targetNode.port, address, messageFC)
  }

  /** Perform one bounded announce_peer exchange and wait for acknowledgement. */
  async queryAnnouncePeer(
    targetNode: Node,
    infoHash: Uint8Array,
    token: Uint8Array,
    peerPort: number,
    options: { signal?: AbortSignal; timeoutMs?: number; impliedPort?: boolean } = {},
  ): Promise<void> {
    if (!Id.isValidId(infoHash)) throw new RangeError('infoHash must contain exactly 20 bytes')
    if (!NetUtil.isNetPort(peerPort) || peerPort === 0) throw new RangeError('peerPort must be in range [1, 65535]')
    if (token.length === 0) throw new RangeError('token must not be empty')
    const timeoutMs = options.timeoutMs ?? 3_000
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be greater than zero')
    options.signal?.throwIfAborted()
    const address = await this.resolveAddress(targetNode.addr)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      let tid = ''
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (tid && this.transactionManager.isValid(tid)) this.transactionManager.finish(tid)
        if (error !== undefined) reject(error)
        else resolve()
      }
      const onAbort = () => finish(options.signal?.reason ?? abortError())
      tid = this.transactionManager.create({
        type: QueryType.ANNOUNCE_PEER,
        infoHash: Uint8Array.from(infoHash),
        addr: address,
        port: targetNode.port,
        onResult: (reachable) =>
          reachable
            ? finish()
            : finish(new Error(`DHT node ${targetNode.addr}:${targetNode.port} rejected announce_peer`)),
      })
      const timer = setTimeout(
        () => finish(new DOMException('DHT announce_peer query timed out', 'TimeoutError')),
        timeoutMs,
      )
      options.signal?.addEventListener('abort', onAbort, { once: true })
      const message = MessageFactory.requestAnnouncePeer(
        tid,
        this.routingTable.localNode.id,
        infoHash,
        peerPort,
        token,
        options.impliedPort,
      )
      void this.#sendTracked(tid, targetNode.port, address, message).catch(finish)
    })
  }

  /**
   * same as ping, but send to a specific port and addr, because for bootstrap node, we don't know the node id
   * @param bootstrapNode {addr: string, port: number}
   */
  async sendPingBootrapNodesRequest({ addr, port }: { addr: string; port: number }) {
    const address = await this.resolveAddress(addr)
    const tid = this.transactionManager.create({
      type: QueryType.PING,
      addr: address,
      port: port,
    })
    const messageFC = MessageFactory.requestPing(tid, this.routingTable.localNode.id)
    await this.#sendTracked(tid, port, address, messageFC)
  }

  private async resolveAddress(address: string): Promise<string> {
    if (NetUtil.isIPv4Str(address)) return address

    const addresses = await Deno.resolveDns(address, 'A')
    const resolved = addresses[0]
    if (!resolved) throw new Error(`could not resolve IPv4 address for ${address}`)
    return resolved
  }
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError')
}
