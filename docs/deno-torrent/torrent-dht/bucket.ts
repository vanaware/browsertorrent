import { BitArray } from '@deno-torrent/toolkit'
import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import logger from '~/src/util/log.ts'

/**
 * K-桶（K-Bucket）实现
 *
 * 按 XOR 距离范围 [start, end] 存储 DHT 节点，容量上限由构造时的 `capacity` 决定。
 * 新节点插入到队头（最近活跃）；满桶替换必须由调用方先完成节点存活探测。
 */
export default class Bucket {
  #nodes: Node[] = []
  #capacity: number
  #updatedAt = Date.now()
  #start: BitArray // 桶的 ID 下界（包含）
  #end: BitArray // 桶的 ID 上界（包含）

  /**
   * 创建一个 K-桶
   *
   * @param capacity 桶的最大节点数，默认 8
   * @param start    桶覆盖 ID 范围的下界（160 位）
   * @param end      桶覆盖 ID 范围的上界（160 位）
   */
  constructor(capacity: number = 8, start: BitArray, end: BitArray) {
    if (capacity <= 0) {
      throw new RangeError('bucket capacity must be greater than 0')
    }

    if (start.greaterThan(end)) {
      throw new RangeError(`start must be less than end, start is ${start.toString()}, end is ${end.toString()}`)
    }

    if (start.length !== end.length || start.length !== 160) {
      throw new RangeError(
        `start and end bit length must be same and equal to 160, start length is ${start.length}, end length is ${end.length}`,
      )
    }

    this.#capacity = capacity
    this.#start = start
    this.#end = end
  }

  /** 桶覆盖范围的下界 */
  get start(): BitArray {
    return this.#start
  }

  /** 桶覆盖范围的上界 */
  get end(): BitArray {
    return this.#end
  }

  /** 当前桶中节点数量 */
  get size(): number {
    return this.#nodes.length
  }

  /** 桶最近一次更新的时间戳（毫秒） */
  get updatedAt(): number {
    return this.#updatedAt
  }

  /**
   * 最久未活跃的节点（队尾节点），桶为空时返回 `undefined`
   */
  get oldest(): Node | undefined {
    return this.#nodes.length === 0 ? undefined : this.#nodes[this.#nodes.length - 1]
  }

  /**
   * 最近活跃的节点（队头节点），桶为空时返回 `undefined`
   */
  get latest(): Node | undefined {
    return this.#nodes.length === 0 ? undefined : this.#nodes[0]
  }

  /**
   * 判断给定 ID 是否落在该桶的覆盖范围内
   *
   * @param id 待判断的节点 ID
   * @returns 若 `start <= id.bits <= end` 则返回 `true`
   */
  withinRange(id: Id): boolean {
    return id.bits.greaterThanOrEqual(this.#start) && id.bits.lessThanOrEqual(this.#end)
  }

  /**
   * 向桶中添加节点
   *
   * - 若节点已存在，则更新其活跃时间，返回 `false`（表示未新增）
   * - 若桶已满，拒绝直接插入，由调用方按 BEP 5 探测最旧节点
   * - 新节点插入到队头（最近活跃位置）
   *
   * @param node 要添加的节点
   * @returns 节点被新增时返回 `true`，已存在则返回 `false`
   */
  add(node: Node): boolean {
    this.#updatedAt = Date.now()

    // 使用值相等判断（Id.equals）而非引用比较
    const existing = this.#nodes.find((n) => n.id.equals(node.id))

    if (existing) {
      existing.update(node.port, node.addr)
      logger.debug(`node ${node.id.toString()} is already in the bucket, updating last active time`)
      return false
    }

    if (this.isFull()) return false

    node.updateActivedAt()
    this.#nodes.unshift(node)

    return true
  }

  /** Replace a specific stale node after a liveness probe has failed. */
  replace(staleNode: Node, replacement: Node): boolean {
    if (!this.#nodes.some((node) => node.id.equals(staleNode.id))) return false
    if (this.#nodes.some((node) => node.id.equals(replacement.id))) return false
    this.remove(staleNode)
    return this.add(replacement)
  }

  /** 判断桶是否已达容量上限 */
  isFull(): boolean {
    return this.#nodes.length >= this.#capacity
  }

  /** 判断桶是否为空 */
  isEmpty(): boolean {
    return this.#nodes.length === 0
  }

  /**
   * 从桶中移除指定节点
   *
   * @param node 要移除的节点
   * @returns 节点存在并成功移除返回 `true`，否则返回 `false`
   */
  remove(node: Node): boolean {
    this.#updatedAt = Date.now()

    for (let i = 0; i < this.#nodes.length; i++) {
      // 使用值相等判断（Id.equals）而非引用比较
      if (this.#nodes[i].id.equals(node.id)) {
        this.#nodes.splice(i, 1)
        return true
      }
    }

    return false
  }

  /**
   * 获取桶中最近活跃的前 N 个节点
   *
   * @param count 获取数量，最大不超过桶当前节点数，默认 8
   * @returns 节点列表（按活跃时间从新到旧排序）
   */
  obtainNodes(count = 8): Node[] {
    const maxCount = Math.min(count, this.#nodes.length)
    return this.#nodes.slice(0, maxCount)
  }

  /** 桶中所有节点（只读引用） */
  get nodes(): Node[] {
    return this.#nodes
  }

  /**
   * 按 XOR 距离排序，返回距目标 ID 最近的前 N 个节点
   *
   * @param targetNodeId 目标节点 ID
   * @param count        返回数量
   * @returns 距离最近的节点列表
   */
  closestNodes(targetNodeId: Id, count: number): Node[] {
    const maxCount = Math.min(count, this.#nodes.length)

    return [...this.#nodes]
      .sort((a, b) => (a.id.bits.xor(targetNodeId.bits).lessThan(b.id.bits.xor(targetNodeId.bits)) ? -1 : 1))
      .slice(0, maxCount)
  }

  /** Return a human-readable summary of bucket occupancy and nodes. */
  toString(): string {
    return `Bucket-filled(${this.size})-remained(${this.#capacity - this.size}):[${
      this.#nodes.map((n) => n.toString()).join(', ')
    }]`
  }
}
