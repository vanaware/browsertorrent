/**
 * @module
 *
 * torrent-dht —— 原生 Deno 实现的 BitTorrent DHT 协议库（BEP-5）
 *
 * @example
 * ```ts
 * import { DHT } from "@deno-torrent/torrent-dht"
 *
 * const dht = await DHT.listen(6881)
 * await dht.pingBootstrapNodes()
 * dht.close()
 * ```
 */

// 主入口
export { default as DHT } from '~/src/dht.ts'
export type {
  AnnouncePeerOptions,
  AnnouncePeerResult,
  BootstrapNode,
  DHTOptions,
  GetPeersOptions,
  GetPeersResult,
} from '~/src/dht.ts'

// 核心数据模型
export { default as Id } from '~/src/id.ts'
export { default as Peer } from '~/src/peer.ts'
export { default as Node } from '~/src/node.ts'
export { default as LocalNode } from '~/src/local_node.ts'
export { default as Bucket } from '~/src/bucket.ts'
export { default as RoutingTable } from '~/src/routing_table.ts'

// 管理器
export { default as InfoHashManager } from '~/src/info_hash_manager.ts'
export { default as BlackListManager } from '~/src/black_list_manager.ts'

// KRPC 消息类型定义
export type { Message } from '~/src/message_factory.ts'
export type { DatagramTransport } from '~/src/krpc/krpc.ts'
export { ErrorType, MessageType, QueryType } from '~/src/message_factory.ts'
export { default as MessageFactory } from '~/src/message_factory.ts'

// 工具函数
export { randomSha1, randomSha1String, sha1, sha1String } from '~/src/util/hash.ts'
export { Logger } from '~/src/util/log.ts'
export type { LogLevel } from '~/src/util/log.ts'
