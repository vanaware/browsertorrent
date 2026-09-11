import { MessageHandler } from '~/src/krpc/krpc.ts'
import TransactionManager, { Request } from '~/src/krpc/transaction_manager.ts'
import { Message, MessageType } from '~/src/message_factory.ts'
import logger from '~/src/util/log.ts'
import Sender from '~/src/krpc/sender.ts'

export default class ErrorResponseHandler implements MessageHandler {
  constructor(private readonly transactionManager: TransactionManager<Request>) {}

  getHandleMessageType(): MessageType {
    return MessageType.ERROR
  }

  handle(response: Message, address: string, port: number, _client: Sender): Promise<void> {
    const { e: error, t: tid } = response

    // Public DHT replies can outlive our bounded transaction window. A late
    // error cannot affect local state and is not evidence of a remote fault.
    if (typeof tid !== 'string' || !this.transactionManager.isValid(tid)) {
      logger.debug(`[${tid}] received error for unknown or expired transaction from ${address}:${port}`)
      return Promise.resolve()
    }

    const request = this.transactionManager.getData(tid)
    if (!request || request.addr !== address || request.port !== port) {
      logger.warn(`[${tid}] error source ${address}:${port} does not match the original request target`)
      return Promise.resolve()
    }

    // finish transaction only after verifying the source endpoint
    this.transactionManager.finish(tid)
    request.onResult?.(false)

    if (error) {
      const [errorCode, errorMessage] = error
      logger.error(`[${tid}] received error from ${address}:${port}: ${errorCode} ${errorMessage}`)
    } else {
      logger.error(`[${tid}] received error from ${address}:${port}: unknown error`)
    }

    return Promise.resolve()
  }
}
