import { type BencodeDict, type BencodeValue, decode as bdecode, encode as bencode } from '@deno-torrent/bencode'
import { concat } from '@std/bytes'
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import Peer from '~/src/peer.ts'
import logger from '~/src/util/log.ts'

// IPv4 UDP payloads cannot exceed 65,507 bytes. KRPC messages only need a few
// container levels, so keep the bencode decoder well below its general-purpose
// defaults when handling untrusted datagrams.
const MAX_KRPC_MESSAGE_BYTES = 65_507
const MAX_KRPC_MESSAGE_DEPTH = 16
const MAX_TRANSACTION_ID_BYTES = 64
const MAX_TOKEN_BYTES = 64
const textEncoder = new TextEncoder()

type UnknownDictionary = Record<string, unknown>

function isDictionary(value: unknown): value is UnknownDictionary {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toProtocolBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (typeof value === 'string') return textEncoder.encode(value)
  return undefined
}

function normalizeMessage(value: unknown): Message | undefined {
  if (!isDictionary(value)) return undefined

  const { t, y } = value
  const transactionId = toProtocolBytes(t)
  if (!transactionId || transactionId.length === 0 || transactionId.length > MAX_TRANSACTION_ID_BYTES) {
    return undefined
  }
  const normalizedTransactionId: TransactionId = t instanceof Uint8Array ? t.slice() : t as string

  if (y === MessageType.QUERY) {
    if (typeof value.q !== 'string' || !isDictionary(value.a)) return undefined

    const id = toProtocolBytes(value.a.id)
    if (!id) return undefined

    const target = value.a.target === undefined ? undefined : toProtocolBytes(value.a.target)
    const infoHash = value.a.info_hash === undefined ? undefined : toProtocolBytes(value.a.info_hash)
    if (value.a.target !== undefined && !target) return undefined
    if (value.a.info_hash !== undefined && !infoHash) return undefined
    if (value.a.implied_port !== undefined && typeof value.a.implied_port !== 'number') return undefined
    if (value.a.port !== undefined && typeof value.a.port !== 'number') return undefined
    const token = value.a.token === undefined ? undefined : toProtocolBytes(value.a.token)
    if (token !== undefined && (token.length === 0 || token.length > MAX_TOKEN_BYTES)) return undefined
    if (value.a.token !== undefined && !token) return undefined

    return {
      t: normalizedTransactionId,
      y,
      q: value.q as QueryType,
      a: {
        id,
        target,
        info_hash: infoHash,
        implied_port: value.a.implied_port,
        port: value.a.port,
        token: token?.slice(),
      },
    }
  }

  if (y === MessageType.RESPONSE) {
    if (!isDictionary(value.r)) return undefined

    const id = toProtocolBytes(value.r.id)
    if (!id) return undefined

    const nodes = value.r.nodes === undefined ? undefined : toProtocolBytes(value.r.nodes)
    if (value.r.nodes !== undefined && !nodes) return undefined

    let values: Uint8Array[] | undefined
    if (value.r.values !== undefined) {
      if (!Array.isArray(value.r.values)) return undefined
      values = []
      for (const entry of value.r.values) {
        const bytes = toProtocolBytes(entry)
        if (!bytes) return undefined
        values.push(bytes)
      }
    }

    const token = value.r.token === undefined ? undefined : toProtocolBytes(value.r.token)
    if (token !== undefined && (token.length === 0 || token.length > MAX_TOKEN_BYTES)) return undefined
    if (value.r.token !== undefined && !token) return undefined

    return {
      t: normalizedTransactionId,
      y,
      r: {
        id,
        nodes,
        values,
        token: token?.slice(),
      },
    }
  }

  if (y === MessageType.ERROR) {
    if (
      !Array.isArray(value.e) || value.e.length !== 2 || !Number.isSafeInteger(value.e[0]) ||
      typeof value.e[1] !== 'string'
    ) {
      return undefined
    }

    return { t: normalizedTransactionId, y, e: [value.e[0] as number, value.e[1]] }
  }

  return undefined
}

function toBencodeValue(value: unknown): BencodeValue {
  if (typeof value === 'string' || value instanceof Uint8Array) return value

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('bencode numbers must be safe integers')
    return value
  }

  if (Array.isArray(value)) return value.map(toBencodeValue)

  if (value instanceof Map) {
    const dictionary: BencodeDict = new Map()
    for (const [key, entry] of value) {
      if (typeof key !== 'string' && !(key instanceof Uint8Array)) {
        throw new TypeError('bencode dictionary keys must be strings or Uint8Array values')
      }
      dictionary.set(key, toBencodeValue(entry))
    }
    return dictionary
  }

  if (typeof value === 'object' && value !== null) {
    const dictionary: BencodeDict = new Map()
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) dictionary.set(key, toBencodeValue(entry))
    }
    return dictionary
  }

  throw new TypeError(`unsupported bencode value: ${String(value)}`)
}

function fromBencodeValue(value: BencodeValue): unknown {
  if (value instanceof Map) {
    const dictionary: Record<string, unknown> = Object.create(null)
    for (const [key, entry] of value) {
      if (typeof key !== 'string') throw new TypeError('KRPC dictionary keys must be UTF-8 strings')
      dictionary[key] = fromBencodeValue(entry)
    }
    return dictionary
  }

  if (Array.isArray(value)) return value.map(fromBencodeValue)
  return value
}

/** KRPC 消息结构 */
export type Message = {
  /** Opaque transaction ID. Public DHT nodes may use arbitrary binary bytes. */
  t: TransactionId
  /** 消息类型：query / response / error */
  y: MessageType
  /** 查询类型，仅 query 消息携带 */
  q?: QueryType
  /** 查询参数，仅 query 消息携带 */
  a?: {
    /** 发起查询节点的 ID */
    id: Uint8Array
    /** find_node 目标节点 ID */
    target?: Uint8Array
    /** get_peers / announce_peer 的 info hash */
    info_hash?: Uint8Array
    /** announce_peer：1 表示使用发送方端口，0 使用 `port` 字段 */
    implied_port?: number
    /** announce_peer：下载端口 */
    port?: number
    /** announce_peer：令牌 */
    token?: Uint8Array
  }
  /** 响应数据，仅 response 消息携带 */
  r?: {
    /** 响应节点的 ID */
    id: Uint8Array
    /** find_node / get_peers 响应：紧凑节点列表 */
    nodes?: Uint8Array
    /** get_peers 响应：紧凑 Peer 地址列表 */
    values?: Uint8Array[]
    /** get_peers 响应：令牌 */
    token?: Uint8Array
  }
  /** 错误信息，仅 error 消息携带：[错误码, 错误描述] */
  e?: [number, string]
  /** DHT 协议版本标识（可选），格式为 2 字节客户端标识 + 2 字节版本 */
  v?: string
}

/** KRPC transaction IDs are opaque byte strings, not necessarily UTF-8 text. */
export type TransactionId = string | Uint8Array

/**
 * KRPC 消息类型
 *
 * @see http://bittorrent.org/beps/bep_0005.html
 */
export enum MessageType {
  /** 查询消息 */
  QUERY = 'q',
  /** 响应消息 */
  RESPONSE = 'r',
  /** 错误消息 */
  ERROR = 'e',
}

/**
 * KRPC 查询类型
 */
export enum QueryType {
  /** 心跳检测 */
  PING = 'ping',
  /** 查找最近节点 */
  FIND_NODE = 'find_node',
  /** 获取持有某 info hash 的 Peer 列表 */
  GET_PEERS = 'get_peers',
  /** 宣告自己持有某 info hash */
  ANNOUNCE_PEER = 'announce_peer',
}

/**
 * KRPC 错误码
 *
 * @see http://bittorrent.org/beps/bep_0005.html#errors
 */
export enum ErrorType {
  /** 通用错误 */
  GENERIC = 201,
  /** 服务端错误 */
  SERVER = 202,
  /** 协议错误（如格式错误、非法参数、无效 token）*/
  PROTOCOL = 203,
  /** 未知方法 */
  METHOD_UNKNOWN = 204,
}

/**
 * KRPC 消息构造器
 *
 * 提供静态工厂方法生成各类 KRPC 请求 / 响应 / 错误消息，
 * 并支持 Bencode 序列化与反序列化。
 */
export default class MessageFactory {
  #message: Message

  private constructor(message: Message) {
    this.#message = message
  }

  /**
   * 将 Bencode 字节解码为消息对象
   *
   * @param data 待解码的 Bencode 字节
   * @returns 解码成功返回消息对象，格式错误返回 `undefined`
   */
  static decode(data: Uint8Array): Promise<Message | undefined> {
    return Promise.resolve().then(() => MessageFactory.decodeSync(data))
  }

  /** Decode and validate one KRPC message synchronously. */
  private static decodeSync(data: Uint8Array): Message | undefined {
    try {
      const decoded = fromBencodeValue(
        bdecode(data, {
          maxBytes: MAX_KRPC_MESSAGE_BYTES,
          maxDepth: MAX_KRPC_MESSAGE_DEPTH,
          // Mainline DHT implementations may emit otherwise valid dictionaries
          // whose keys are not canonical byte-order. Duplicate keys and all
          // other decoder validation remain enforced by bencode.
          allowUnsortedKeys: true,
        }),
      )

      return normalizeMessage(decoded)
    } catch (e) {
      logger.error(`[Bencode] decode message error: ${e}`)
      return undefined
    }
  }

  /**
   * 将当前消息编码为 Bencode 字节
   *
   * @returns Bencode 编码的字节数组
   */
  bencode(): Promise<Uint8Array> {
    return Promise.resolve().then(() => bencode(toBencodeValue(this.#message)))
  }

  /**
   * 返回原始消息对象
   */
  message(): Message {
    return this.#message
  }

  /**
   * 构造 ping 查询消息
   *
   * @param tid    事务 ID
   * @param nodeId 本地节点 ID
   */
  static requestPing(tid: TransactionId, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.PING,
      a: { id: nodeId.bits.bytes },
    })
  }

  /**
   * 构造 find_node 查询消息
   *
   * @param tid      事务 ID
   * @param nodeId   本地节点 ID
   * @param targetId 目标节点 ID
   */
  static requestFindNode(tid: TransactionId, nodeId: Id, targetId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.FIND_NODE,
      a: {
        id: nodeId.bits.bytes,
        target: targetId.bits.bytes,
      },
    })
  }

  /**
   * 构造 get_peers 查询消息
   *
   * @param tid      事务 ID
   * @param nodeId   本地节点 ID
   * @param infoHash 目标 info hash（20 字节）
   */
  static requestGetPeers(tid: TransactionId, nodeId: Id, infoHash: Uint8Array): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.GET_PEERS,
      a: {
        id: nodeId.bits.bytes,
        info_hash: infoHash,
      },
    })
  }

  /**
   * 构造 announce_peer 查询消息
   *
   * @param tid      事务 ID
   * @param nodeId   本地节点 ID
   * @param infoHash 目标 info hash（20 字节）
   * @param port     本地下载端口
   */
  static requestAnnouncePeer(
    tid: TransactionId,
    nodeId: Id,
    infoHash: Uint8Array,
    port: number,
    token: Uint8Array,
    impliedPort = false,
  ): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.QUERY,
      q: QueryType.ANNOUNCE_PEER,
      a: {
        id: nodeId.bits.bytes,
        implied_port: impliedPort ? 1 : 0,
        info_hash: infoHash,
        port,
        token: token.slice(),
      },
    })
  }

  /**
   * 构造 ping 响应消息
   *
   * @param tid 事务 ID
   */
  static responsePing(tid: TransactionId, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: { id: nodeId.bits.bytes },
    })
  }

  /**
   * 构造 find_node 响应消息
   *
   * @param tid   事务 ID
   * @param nodes 最近节点列表（将被序列化为紧凑格式）
   */
  static responseFindNode(tid: TransactionId, nodeId: Id, nodes: Node[]): MessageFactory {
    const compactNodeList = nodes.map((node) => node.toCompact())

    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: {
        id: nodeId.bits.bytes,
        // @std/bytes v1.x：concat 接受 Uint8Array[] 数组而非展开参数
        nodes: concat(compactNodeList),
      },
    })
  }

  /**
   * 构造 get_peers 响应消息
   *
   * 当存在 Peer 时返回 `values`；否则返回 `nodes`（最近节点）。
   * `peers` 和 `nodes` 至少须提供其一；空 `nodes` 表示当前没有更近节点。
   *
   * @param tid   事务 ID
   * @param peers Peer 列表（可选）
   * @param nodes 最近节点列表（可选）
   * @param token 令牌（可选）
   */
  static responseGetPeers(
    tid: TransactionId,
    nodeId: Id,
    peers?: Peer[],
    nodes?: Node[],
    token?: Uint8Array,
  ): MessageFactory {
    const hasPeers = peers && peers.length > 0
    const hasNodes = nodes !== undefined

    if (!hasPeers && !hasNodes) {
      throw new Error('must provide peers or nodes')
    }

    if (hasNodes) {
      const compactNodeList = nodes!.map((node) => node.toCompact())

      return new MessageFactory({
        t: tid,
        y: MessageType.RESPONSE,
        r: {
          id: nodeId.bits.bytes,
          token: token?.slice(),
          nodes: concat(compactNodeList),
        },
      })
    } else {
      return new MessageFactory({
        t: tid,
        y: MessageType.RESPONSE,
        r: {
          id: nodeId.bits.bytes,
          token: token?.slice(),
          values: peers!.map((peer) => peer.toCompact()),
        },
      })
    }
  }

  /**
   * 构造 announce_peer 响应消息
   *
   * @param tid 事务 ID
   */
  static responseAnnouncePeer(tid: TransactionId, nodeId: Id): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.RESPONSE,
      r: { id: nodeId.bits.bytes },
    })
  }

  /**
   * 构造错误消息
   *
   * @param tid          事务 ID
   * @param errorCode    错误码
   * @param errorMessage 错误描述（可选）
   */
  static responseError(tid: TransactionId, errorCode: ErrorType, errorMessage?: string): MessageFactory {
    return new MessageFactory({
      t: tid,
      y: MessageType.ERROR,
      e: [errorCode.valueOf(), errorMessage ?? ''],
    })
  }
}
