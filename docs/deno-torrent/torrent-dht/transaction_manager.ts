import { QueryType } from '~/src/message_factory.ts'
import logger from '~/src/util/log.ts'
import type Node from '~/src/node.ts'
import type Peer from '~/src/peer.ts'

/** Parsed result of one BEP-5 get_peers exchange. */
export type GetPeersQueryResult = {
  node: Node
  peers: Peer[]
  nodes: Node[]
  /** Optional because some useful public nodes omit the BEP-5 announce token. */
  token?: Uint8Array
}

export type Request = {
  type: QueryType
  addr: string
  port: number
  infoHash?: Uint8Array // only for get_peers query and announce_peer query
  /** Internal completion hook used by bounded liveness probes. */
  onResult?: (reachable: boolean) => void
  /** Internal completion hook used by the high-level iterative lookup API. */
  onGetPeersResult?: (result: GetPeersQueryResult) => void
}

/**
 * TransactionManager
 * @description handle krpc transaction
 */
export default class TransactionManager<T> {
  #EXPIRED_TIME = 1000 * 60 // UDP 请求超过 1 分钟后视为失效
  #CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  #ID_COUNT_MAX = this.#CHARS.length * this.#CHARS.length // 最大并发事务数 62×62 = 3844（修复：原用 ^ 位异或）
  #ID_COUNT_HALF = Math.floor(this.#ID_COUNT_MAX / 2) // 超过一半时触发过期清理
  #tidPool!: Set<string> // tid pool
  #expiredTime: number // expired time of a tid
  #transactions = new Map<
    string, // tid
    {
      expiredAt: number // expired time of the tid
      data?: T // attached data
    }
  >()

  /**
   * create a transaction manager
   * @param expiredTime the expired time of a transaction
   */
  constructor(expiredTime?: number) {
    this.#expiredTime = expiredTime || this.#EXPIRED_TIME
    this.initIdPool()
  }

  /** Number of currently active transactions. */
  get size(): number {
    return this.#transactions.size
  }

  /**
   * create a new transaction
   * @returns tid of the transaction
   */
  create(data?: T) {
    const tid = this.borrowTid()
    const expiredAt = Date.now() + this.#expiredTime
    this.#transactions.set(tid, {
      expiredAt,
      data,
    })
    return tid
  }

  /**
   * get data from a transaction
   * @param tid
   * @returns
   */
  getData(tid: string): T | undefined {
    if (!this.isValid(tid)) {
      logger.warn(`tid ${tid} is not valid, can not get data`)
      return
    }

    return this.#transactions.get(tid)?.data
  }

  /**
   * finish a transaction
   * @param tid
   */
  finish(tid: string) {
    if (!this.isValid(tid)) {
      logger.warn(`tid ${tid} is not valid, can not finish`)
      return
    }

    // delete transaction, and return tid to pool
    this.putbackTid(tid)
  }

  private initIdPool() {
    const collection = new Set<string>()
    for (let i = 0; i < this.#CHARS.length; i++) {
      for (let j = 0; j < this.#CHARS.length; j++) {
        const tid = this.#CHARS[i] + this.#CHARS[j]
        collection.add(tid)
      }
    }

    // shuffle the tid in pool
    const array = [...collection]
    for (let i = 0; i < array.length; i++) {
      const j = Math.floor(Math.random() * array.length)
      const temp = array[i]
      array[i] = array[j]
      array[j] = temp
    }

    this.#tidPool = new Set<string>(array)
  }

  private borrowTid(): string {
    // if borrowed tid count is more than half of max tid count, clear expired tid
    // note: only expired tid will be returned to pool
    if (this.#transactions.size > this.#ID_COUNT_HALF) {
      this.clearExpiredTid()
    }

    const result = this.#tidPool.values().next()
    if (result.done) {
      // Never reuse a live transaction ID: a delayed response could otherwise
      // be matched to an unrelated newer request.
      this.clearExpiredTid()
      const retry = this.#tidPool.values().next()
      if (retry.done) throw new RangeError(`maximum concurrent transaction count reached: ${this.#ID_COUNT_MAX}`)
      this.#tidPool.delete(retry.value)
      return retry.value
    }
    const tid = result.value
    this.#tidPool.delete(tid)
    return tid
  }

  /**
   * put back a borrowed tid to pool
   * note that only borrowed tid can be put backed to pool
   * @param tid
   * @returns
   */
  private putbackTid(tid: string) {
    if (!this.#transactions.has(tid)) {
      logger.warn(`tid ${tid} is not borrowed, can not return`)
      return
    }
    this.#transactions.delete(tid)
    this.#tidPool.add(tid)
  }

  /**
   * clear expired tid in borrowed
   */
  private clearExpiredTid() {
    const expiredTids = [...this.#transactions.entries()].filter(([tid, _]) => this.isExpiredTid(tid))
    for (const [tid, _] of expiredTids) {
      this.putbackTid(tid)
    }
  }

  /**
   * check if a tid is expired
   * @param tid
   * @returns
   */
  private isExpiredTid(tid: string): boolean {
    // if is not a borrowed tid, return false
    if (!this.#transactions.has(tid)) return false
    return this.#transactions.get(tid)?.expiredAt! < Date.now()
  }

  /**
   * check if a transaction is valid
   * @param tid
   * @returns true if the tid is valid
   */
  isValid(tid: string): boolean {
    if (!this.#transactions.has(tid)) return false
    if (!this.isExpiredTid(tid)) return true

    this.putbackTid(tid)
    return false
  }
}
