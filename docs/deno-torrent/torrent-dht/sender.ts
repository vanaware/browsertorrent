import Id from '~/src/id.ts'
import Node from '~/src/node.ts'
import MessageFactory from '~/src/message_factory.ts'

export default interface Sender {
  sendMessage(port: number, addr: string, message: MessageFactory): Promise<void>
  sendPingRequest(targetNode: Node): Promise<void>
  sendFindNodeRequest(port: number, addr: string, targetId: Id): Promise<void>
  sendGetPeersRequest(targetNode: Node, infoHash: Uint8Array): Promise<void>
  sendAnnouncePeerRequest(targetNode: Node, infoHash: Uint8Array, token: Uint8Array, peerPort?: number): Promise<void>
}
