import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { MessageHandler } from '~/src/krpc/krpc.ts'
import Sender from '~/src/krpc/sender.ts'
import TokenManager from '~/src/krpc/token_manager.ts'
import MessageFactory, { ErrorType, Message, MessageType, QueryType, TransactionId } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { BytesUtil, NetUtil } from '@deno-torrent/toolkit'

export default class RequestHandler implements MessageHandler {
  constructor(
    private readonly routingTable: RoutingTable,
    private readonly infoHashManager: InfoHashManager,
    private readonly tokenManager: TokenManager,
  ) {}

  getHandleMessageType(): MessageType {
    return MessageType.QUERY
  }

  async handle(reqMsg: Message, addr: string, port: number, sender: Sender): Promise<void> {
    const { t: tid, a: data, q: type } = reqMsg

    const reqNodeId = data?.id as Uint8Array

    if (!Id.isValidId(reqNodeId)) {
      logger.warn(`invalid node id: ${reqNodeId}, which from ${addr}:${port}]`)

      await sender.sendMessage(port, addr, MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid node id'))
      return
    }

    const reqNode = new Node(Id.fromUnit8Array(reqNodeId), port, addr)

    switch (type) {
      case QueryType.PING:
        await this.handlePingQueryRequest(reqMsg, reqNode, tid, sender)
        break
      case QueryType.FIND_NODE:
        await this.handleFindNodeQueryRequest(reqMsg, reqNode, tid, sender)
        break
      case QueryType.GET_PEERS:
        await this.handleGetPeersQueryRequest(reqMsg, reqNode, tid, sender)
        break
      case QueryType.ANNOUNCE_PEER:
        await this.handleAnnouncePeerQueryRequest(reqMsg, reqNode, tid, sender)
        break
      default:
        // Public nodes commonly probe optional BEPs such as BEP 51 sample_infohashes.
        // An unsupported extension is a routine capability mismatch, not a local failure.
        logger.debug(`unsupported query type: ${type}`)
        await sender.sendMessage(
          port,
          addr,
          MessageFactory.responseError(tid, ErrorType.METHOD_UNKNOWN, 'unknown method'),
        )
    }
  }

  // handle the ping query request from other node
  async handlePingQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-PING-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    // return local node id
    const response = MessageFactory.responsePing(tid, this.routingTable.localNode.id)

    await sender.sendMessage(reqNode.port, reqNode.addr, response)
  }

  async handleFindNodeQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-FIND_NODE-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    // find closest nodes from k-buckets by request target node id
    const targetIdBytes = reqMsg.a?.target

    if (!targetIdBytes) {
      logger.error(`[${tid}]: invalid target id: ${targetIdBytes}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, `invalid target id: ${targetIdBytes}`),
      )
      return
    }

    if (!Id.isValidId(targetIdBytes)) {
      logger.error(`[${tid}]: invalid target id: ${targetIdBytes}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, `invalid target id: ${targetIdBytes}`),
      )
      return
    }

    const targetId = Id.fromUnit8Array(targetIdBytes)

    const closestNodes = this.routingTable.findClosestNodes(targetId, 8)

    if (!closestNodes || closestNodes.length === 0) {
      // An empty routing table is a valid transient state during bootstrap. Return
      // a well-formed empty result instead of reporting a query failure.
      logger.debug(`[${tid}]: no closest nodes for target id: ${targetId}`)
    } else {
      logger.debug(`[${tid}]: find ${closestNodes.length} closest nodes for target id: ${targetId}`)
    }

    // response to request node
    await sender.sendMessage(
      reqNode.port,
      reqNode.addr,
      MessageFactory.responseFindNode(tid, this.routingTable.localNode.id, closestNodes ?? []),
    )
  }

  async handleGetPeersQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-GET_PEERS-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    const infoHash = reqMsg.a?.info_hash as Uint8Array
    if (!Id.isValidId(infoHash)) {
      logger.error(`[${tid}]: invalid info hash: ${infoHash}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid info hash'),
      )
      return
    }

    const infoHashHex = BytesUtil.bytes2HexStr(infoHash)
    const peers = this.infoHashManager.find(infoHashHex)
    const token = this.tokenManager.issue(reqNode.addr)

    let response: MessageFactory
    if (peers && peers.length > 0) {
      logger.debug(`[${tid}]: find ${peers.length} peers for info hash: ${infoHashHex}}`)
      // return peers
      response = MessageFactory.responseGetPeers(tid, this.routingTable.localNode.id, peers, undefined, token)
    } else {
      const closestNodes = this.routingTable.findClosestNodes(Id.fromUnit8Array(infoHash), 8)

      if (closestNodes && closestNodes.length > 0) {
        logger.debug(`[${tid}]: find ${closestNodes.length} nodes for info hash: ${infoHashHex}}`)
        // return closest nodes
        response = MessageFactory.responseGetPeers(tid, this.routingTable.localNode.id, undefined, closestNodes, token)
      } else {
        // Keep the issued token even when this bootstrapping node has no closer
        // contacts yet. Empty nodes is a normal negative result, not a KRPC error.
        logger.debug(`[${tid}]: no peers or closer nodes for info hash: ${infoHashHex}`)
        response = MessageFactory.responseGetPeers(tid, this.routingTable.localNode.id, undefined, [], token)
      }
    }

    // response to the request node
    await sender.sendMessage(reqNode.port, reqNode.addr, response)
  }

  async handleAnnouncePeerQueryRequest(reqMsg: Message, reqNode: Node, tid: TransactionId, sender: Sender) {
    logger.debug(`[<======QUERY-ANNOUNCE_PEER-${reqMsg.q}] received from ${reqNode.addr}:${reqNode.port}`)

    const infoHash = reqMsg.a?.info_hash as Uint8Array
    const port = reqMsg.a?.port as number // reqNode download port for bittorrent
    const token = reqMsg.a?.token // opaque token from a prior get_peers response

    if (!Id.isValidId(infoHash)) {
      logger.error(`[${tid}]: invalid info hash: ${infoHash}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid info hash'),
      )
      return
    }

    const impliedPort = reqMsg.a?.implied_port ?? 0
    if (impliedPort !== 0 && impliedPort !== 1) {
      logger.error(`[${tid}]: invalid implied_port: ${impliedPort}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid implied_port'),
      )
      return
    }

    if (impliedPort === 0 && (!NetUtil.isNetPort(port) || port === 0)) {
      logger.error(`[${tid}]: invalid port: ${port}`)
      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid port'),
      )
      return
    }

    if (!token || token.length === 0) {
      logger.error(`[${tid}]: invalid token: ${token}`)

      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid token'),
      )

      return
    }

    // 0 or 1, 1 means use the sender port, ignore the port in the request. 0 means use the port in the request as the download port
    // if the node is behind a NAT, the sender port is the public port, the download port is the private port, at this time, the implied_port should be 1
    // BEP 5 tokens authorize the requester's IP, not a globally shared info hash.
    if (!this.tokenManager.validate(token, reqNode.addr)) {
      logger.error(`[${tid}]: invalid token: ${token}`)

      await sender.sendMessage(
        reqNode.port,
        reqNode.addr,
        MessageFactory.responseError(tid, ErrorType.PROTOCOL, 'invalid token'),
      )
      return
    }

    const infoHashHex = BytesUtil.bytes2HexStr(infoHash)

    const downloadPort = impliedPort === 1 ? reqNode.port : port

    // store the peer
    this.infoHashManager.addValidatedPeer(infoHashHex, new Peer(downloadPort, reqNode.addr))

    // response to the request node
    await sender.sendMessage(
      reqNode.port,
      reqNode.addr,
      MessageFactory.responseAnnouncePeer(tid, this.routingTable.localNode.id),
    )
  }
}
