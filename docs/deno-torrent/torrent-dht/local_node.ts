import Id from '~/src/id.ts'
import Node from '~/src/node.ts'

/**
 * LocalNode must be a Node, and it contains the node's routing table and file info hashs
 */
export default class LocalNode extends Node {
  /** Create a local DHT node. */
  constructor(id: Id, port: number, addr: string) {
    super(id, port, addr)
  }

  /** Local nodes remain active for the lifetime of the instance. */
  override isActive(): boolean {
    // for local node, it is always active
    return true
  }

  /**
   * create a local node
   * @param port the port of the node
   * @returns the local node
   */
  static createLocalNode(
    port: number,
    options: { publicAddress?: string; bindAddress?: string; nodeId?: Id } = {},
  ): Promise<LocalNode> {
    const id = options.nodeId ?? Id.random()
    // A BEP-5 query carries the node ID, not the caller's advertised address.
    // Requiring an unrelated HTTPS IP-discovery service prevents DHT startup
    // in otherwise healthy UDP-only environments. The local address is only
    // used when this node is projected into compact node records, so retain an
    // explicit public address when supplied and otherwise use the bind address.
    const addr = options.publicAddress ?? options.bindAddress ?? '0.0.0.0'
    return Promise.resolve(new LocalNode(id, port, addr))
  }
}
