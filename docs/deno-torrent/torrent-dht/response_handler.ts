import { BytesUtil } from '@deno-torrent/toolkit'
import Id from '~/src/id.ts'
import InfoHashManager from '~/src/info_hash_manager.ts'
import { MessageHandler } from '~/src/krpc/krpc.ts'
import Sender from '~/src/krpc/sender.ts'
import TransactionManager, { Request } from '~/src/krpc/transaction_manager.ts'
import { Message, MessageType, QueryType } from '~/src/message_factory.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import RoutingTable from '~/src/routing_table.ts'
import logger from '~/src/util/log.ts'
import { COMPAT_ADDR_V4_LEN, COMPAT_NODE_LEN } from '~/src/util/net.ts'

export default class ResponseHandler implements MessageHandler {
  constructor(
    private readonly routingTable: RoutingTable,
    private readonly infoHashManager: InfoHashManager,
    private readonly transactionManager: TransactionManager<Request>,
    private readonly addNode: (node: Node) => Promise<boolean> = (node) => Promise.resolve(routingTable.add(node)),
  ) {}

  // tell the dispatcher this handler only handles response messages
  getHandleMessageType(): MessageType {
    return MessageType.RESPONSE
  }

  async handle(response: Message, addr: string, port: number, sender: Sender): Promise<void> {
    const { t: tid, r: data, q: type } = response

    // Binary/expired transaction IDs commonly arrive after the bounded request
    // timed out. They are safely ignored and are not a remote protocol fault.
    if (typeof tid !== 'string') {
      logger.debug(`received a response with an unknown binary transaction id from ${addr}:${port}`)
      return
    }

    // check tid is valid
    if (!this.transactionManager.isValid(tid)) {
      logger.debug(`[${tid}] received an expired or unknown tid, drop the message from ${addr}:${port}`)
      return
    }

    // get the request message from transaction; if not found, drop — the message was not requested by this node
    const request = this.transactionManager.getData(tid)
    if (!request) {
      logger.warn(
        `[${tid}] received an unsolicited response, drop the message from ${addr}:${port}`,
      )
      return
    }

    if (request.addr !== addr || request.port !== port) {
      logger.warn(
        `[${tid}] response source ${addr}:${port} does not match request target ${request.addr}:${request.port}`,
      )
      return
    }

    // check response node id
    const responseNodeId = data?.id
    if (!(responseNodeId instanceof Uint8Array) || !Id.isValidId(responseNodeId)) {
      logger.warn(`[${tid}] response has no valid node id, drop the message from ${addr}:${port}`)
      return
    }

    // finish the transaction only after the response source and base shape are verified
    this.transactionManager.finish(tid)
    request.onResult?.(true)

    const respNode = new Node(Id.fromUnit8Array(responseNodeId), port, addr)

    // dispatch by the original query type
    switch (request.type) {
      case QueryType.PING: {
        await this.handlePingResponse(respNode, tid)
        break
      }
      case QueryType.FIND_NODE: {
        await this.handleFindNodeResponse(response, respNode, tid)
        break
      }
      case QueryType.GET_PEERS: {
        await this.handleGetPeersResponse(request, response, respNode, tid, sender)
        break
      }
      case QueryType.ANNOUNCE_PEER: {
        await this.handleAnnouncePeerResponse(respNode, tid)
        break
      }
      default:
        logger.error(`unknown query type: ${type}`)
    }
  }

  private async handlePingResponse(respNode: Node, tid: string) {
    logger.debug(`[<======RESPONSE-PING-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // add the node into the routing table
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private async handleFindNodeResponse(response: Message, respNode: Node, tid: string) {
    logger.debug(`[<======RESPONSE-FIND_NODE-${tid}] received from ${respNode.addr}:${respNode.port}`)

    const nodesBytes = response.r?.nodes

    // must have nodes
    if (!nodesBytes) {
      logger.error(`[${tid}] invalid nodes bytes: ${nodesBytes}`)
      return
    }

    // check nodes bytes length
    if (nodesBytes.length % COMPAT_NODE_LEN != 0) {
      logger.error(
        `[${tid}] invalid nodes bytes: ${nodesBytes}, because the length is not a multiple of ${COMPAT_NODE_LEN}`,
      )
      return
    }

    // chunk the nodes bytes to node bytes list
    const nodesBytesList: Uint8Array[] = BytesUtil.chunkBytes(nodesBytes, COMPAT_NODE_LEN)

    for (const nodeBytes of nodesBytesList) {
      const node = Node.fromCompact(nodeBytes)
      if (!await this.addNode(node) && !this.routingTable.findNode(node.id)) {
        logger.error(`[${tid}] insert node ${node} to routing table failed`)
      }
    }

    // update the response node
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }

  private async handleGetPeersResponse(
    request: Request,
    response: Message,
    respNode: Node,
    tid: string,
    sender: Sender,
  ) {
    logger.debug(`[<======RESPONSE-GET_PEERS-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // get infoHash from request message
    const infoHash = request.infoHash

    // check info hash length
    if (!infoHash) {
      logger.error(`[${tid}] cached info hash is not exist`)
      return
    }

    // token is provided by the responder in r.token
    const token = response.r?.token

    // there are two types of response: nodes or values
    // nodes means the response node doesn't have peers for this info hash, so it returns closer nodes
    const nodesBytes = response.r?.nodes
    // values means the response node has peers; values is a list of compact peer addresses
    const peersBytesList = response.r?.values

    // check peerBytes
    if (peersBytesList && peersBytesList.some((bytes) => bytes.length !== COMPAT_ADDR_V4_LEN)) {
      logger.error(`[${tid}] invalid peer bytes: ${peersBytesList}`)
      return
    }

    const peers: Peer[] = []
    const nodes: Node[] = []

    if (peersBytesList) {
      for (const bytes of peersBytesList) {
        try {
          const peer = Peer.fromCompact(bytes)
          peers.push(peer)
        } catch {
          logger.error(`[${tid}] invalid peer bytes: ${bytes}`)
        }
      }

      logger.debug(
        `[${tid}] received ${peersBytesList.length} peers for info hash: ${
          BytesUtil.bytes2HexStr(
            infoHash,
          )
        },peers is ${peers}`,
      )

      // store the peers associated with the token and info hash
      if (peers.length > 0) this.infoHashManager.addList(BytesUtil.bytes2HexStr(infoHash), peers, token)
    } else if (nodesBytes) {
      if (nodesBytes.length % COMPAT_NODE_LEN !== 0) {
        logger.error(`[${tid}] invalid compact nodes length: ${nodesBytes.length}`)
        return
      }
      logger.debug(
        `[${tid}] received ${nodesBytes.length / COMPAT_NODE_LEN} nodes for info hash: ${
          BytesUtil.bytes2HexStr(
            infoHash,
          )
        }`,
      )

      const nodesBytesList: Uint8Array[] = BytesUtil.chunkBytes(nodesBytes, COMPAT_NODE_LEN)

      for (const nodeBytes of nodesBytesList) {
        const node = Node.fromCompact(nodeBytes)
        nodes.push(node)
        if (!request.onGetPeersResult) {
          // Preserve the original fire-and-follow behavior for the low-level API.
          await sender.sendGetPeersRequest(node, infoHash)
        }
      }
    } else {
      logger.error(`[${tid}] invalid response: ${JSON.stringify(response)}`)
      return
    }

    // update the response node
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }

    request.onGetPeersResult?.({
      node: respNode,
      peers,
      nodes,
      ...(token ? { token: token.slice() } : {}),
    })
  }

  private async handleAnnouncePeerResponse(respNode: Node, tid: string) {
    logger.debug(`[<======RESPONSE-ANNOUNCE_PEER-${tid}] received from ${respNode.addr}:${respNode.port}`)

    // update the response node
    if (!await this.addNode(respNode) && !this.routingTable.findNode(respNode.id)) {
      logger.error(`[${tid}] add node ${respNode} to routing table failed`)
    }
  }
}
