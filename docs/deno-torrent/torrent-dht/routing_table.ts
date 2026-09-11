import { BitArray } from '@deno-torrent/toolkit'
import Bucket from '~/src/bucket.ts'
import Id from '~/src/id.ts'
import LocalNode from '~/src/local_node.ts'
import Node from '~/src/node.ts'
import logger from '~/src/util/log.ts'

/**
 * Kademlia 路由表
 *
 * 维护 160 个 K-桶（K-Bucket），每个桶覆盖 ID 空间的一个子范围。
 * 每个 DHT 实例持有独立的路由表，避免不同节点之间共享状态。
 */
export default class RoutingTable {
  /** 每个 K-桶的最大节点容量 */
  static BUCKET_CAPACITY = 8
  #localNode: LocalNode
  #buckets: Bucket[] = []

  /** Create an isolated routing table for one local DHT node. */
  constructor(localNode: LocalNode) {
    this.#localNode = localNode
    this.initBuckets()
  }

  /** 本地节点 */
  get localNode(): LocalNode {
    return this.#localNode
  }

  /** 所有 K-桶 */
  get buckets(): Bucket[] {
    return this.#buckets
  }

  /** 路由表中所有节点的总数 */
  get nodeCount(): number {
    let count = 0
    for (const bucket of this.#buckets) {
      count += bucket.size
    }
    return count
  }

  /**
   * 初始化 K-桶列表
   *
   * 采用二叉树递归划分 ID 空间，生成与本地节点 ID 对应的 160 个桶。
   * 局部节点所在的半空间被进一步细分，远端半空间保留一个桶。
   */
  initBuckets(): void {
    this.#buckets.push(
      ...this.generateBuckets(BitArray.fromBinaryString('0'.repeat(160)), BitArray.fromBinaryString('1'.repeat(160))),
    )
    logger.info(`init ${this.#buckets.length} buckets`)
  }

  /**
   * 递归生成 K-桶列表
   *
   * 将 [start, end] 区间对半分：
   * - 若本地节点落在左半，则右半形成一个桶，左半继续递归
   * - 若本地节点落在右半，则左半形成一个桶，右半继续递归
   *
   * @param start 区间下界
   * @param end   区间上界
   * @returns 生成的 K-桶列表
   */
  generateBuckets(start: BitArray, end: BitArray): Bucket[] {
    const leftStart = start
    const leftEnd = BitArray.fromBigInt((start.toBigInt() + end.toBigInt() - 1n) / 2n, 160)
    const rightStart = BitArray.fromBigInt(leftEnd.toBigInt() + 1n, 160)
    const rightEnd = end

    // 区间收缩至只剩本地节点，停止递归
    if (start.equals(end) && start.equals(this.#localNode.id.bits)) {
      return []
    }

    const leftBucket = new Bucket(RoutingTable.BUCKET_CAPACITY, leftStart, leftEnd)
    const rightBucket = new Bucket(RoutingTable.BUCKET_CAPACITY, rightStart, rightEnd)

    if (leftBucket.withinRange(this.#localNode.id)) {
      return [rightBucket, ...this.generateBuckets(leftStart, leftEnd)]
    } else if (rightBucket.withinRange(this.#localNode.id)) {
      return [leftBucket, ...this.generateBuckets(rightStart, rightEnd)]
    } else {
      throw new Error('local node is not in the range of the buckets')
    }
  }

  /**
   * 将节点加入路由表
   *
   * @param node 要加入的节点
   * @returns 加入成功返回 `true`，否则返回 `false`（桶满且无法替换，或 ID 不在任何桶范围内）
   */
  add(node: Node): boolean {
    for (const bucket of this.#buckets) {
      if (bucket.withinRange(node.id)) {
        return bucket.add(node)
      }
    }
    return false
  }

  /** Return the least-recently-seen node that must be probed before inserting a new node. */
  replacementCandidate(node: Node): Node | undefined {
    for (const bucket of this.#buckets) {
      if (!bucket.withinRange(node.id)) continue
      if (bucket.nodes.some((current) => current.id.equals(node.id))) return undefined
      return bucket.isFull() ? bucket.oldest : undefined
    }
    return undefined
  }

  /** Replace a previously selected stale node if it is still present in the same bucket. */
  replace(staleNode: Node, replacement: Node): boolean {
    for (const bucket of this.#buckets) {
      if (bucket.withinRange(replacement.id)) return bucket.replace(staleNode, replacement)
    }
    return false
  }

  /**
   * 批量将节点加入路由表
   *
   * @param nodes 节点列表
   */
  addNodes(nodes: Node[]): void {
    for (const node of nodes) {
      this.add(node)
    }
  }

  /**
   * 从路由表移除节点
   *
   * @param node 要移除的节点
   */
  remove(node: Node): void {
    for (const bucket of this.#buckets) {
      if (bucket.withinRange(node.id)) {
        bucket.remove(node)
        break
      }
    }
  }

  /**
   * 按节点 ID 移除节点
   *
   * @param nodeId 要移除的节点 ID
   */
  removeByNodeId(nodeId: Id): void {
    for (const node of this.getAllNodes()) {
      if (node.id.equals(nodeId)) {
        this.remove(node)
        break
      }
    }
  }

  /**
   * 按 IP 地址移除所有匹配节点
   *
   * @param ip IP 地址字符串
   */
  removeByIp(ip: string): void {
    for (const node of this.getAllNodes()) {
      if (node.addr === ip) {
        this.remove(node)
      }
    }
  }

  /**
   * 批量移除节点
   *
   * @param nodes 要移除的节点列表
   */
  removeNodes(nodes: Node[]): void {
    for (const node of nodes) {
      this.remove(node)
    }
  }

  /**
   * 移除距指定节点最近的所有节点
   *
   * @param targetNode 目标节点
   */
  removeClosestNode(targetNode: Node): void {
    const closestNodes = this.findClosestNodes(targetNode.id)
    if (closestNodes.length > 0) {
      this.removeNodes(closestNodes)
    }
  }

  /**
   * 随机返回路由表中的一个节点（取第一个非空桶的队头节点）
   *
   * @returns 节点，若路由表为空则返回 `undefined`
   */
  getRandomNode(): Node | undefined {
    for (const bucket of this.#buckets) {
      if (!bucket.isEmpty()) return bucket.latest
    }
    return undefined
  }

  /**
   * 获取路由表中所有节点
   *
   * @returns 节点列表
   */
  getAllNodes(): Node[] {
    const nodes: Node[] = []
    for (const bucket of this.#buckets) {
      if (!bucket.isEmpty()) {
        nodes.push(...bucket.nodes)
      }
    }
    return nodes
  }

  /**
   * 按 XOR 距离找到距目标 ID 最近的前 N 个节点
   *
   * @param targetNodeId 目标节点 ID
   * @param count        返回数量，默认 8
   * @returns 按距离从近到远排序的节点列表
   */
  findClosestNodes(targetNodeId: Id, count = 8): Node[] {
    logger.debug(`[findClosestNodes] total node count is ${this.nodeCount}`)

    const nodes = this.getAllNodes().sort((a, b) =>
      a.id.bits.xor(targetNodeId.bits).lessThan(b.id.bits.xor(targetNodeId.bits)) ? -1 : 1
    )

    return nodes.slice(0, Math.min(this.nodeCount, count))
  }

  /**
   * 更新路由表中已存在节点的连接信息
   *
   * @param newNode 包含最新连接信息的节点对象
   */
  updateNode(newNode: Node): void {
    const old = this.findNode(newNode.id)
    if (old) {
      old.update(newNode.port, newNode.addr)
    }
  }

  /**
   * 在路由表中查找指定 ID 的节点
   *
   * @param nodeId 节点 ID
   * @returns 找到则返回节点对象，否则返回 `undefined`
   */
  findNode(nodeId: Id): Node | undefined {
    for (const bucket of this.#buckets) {
      if (bucket.isEmpty()) continue
      for (const node of bucket.nodes) {
        if (node.id.equals(nodeId)) {
          return node
        }
      }
    }
    return undefined
  }
}
