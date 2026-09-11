import type { Logger } from "@src/logger.ts";
import type { UtpConn } from "@src/utp_conn.ts";
import { UtpContext } from "@src/utp_context.ts";

/** Queues established inbound connections and pending accept calls in FIFO order. */
export class UtpListener implements AsyncIterable<UtpConn> {
  #connections: UtpConn[] = [];
  #pendingConnections: UtpConn[] = [];
  #closed = false;
  #waitingAccepts: Array<{
    resolve: (value: UtpConn) => void;
    reject: (reason: Error) => void;
  }> = [];
  logger: Logger;

  constructor(context: UtpContext = new UtpContext()) {
    this.logger = context.getLogger("UTP_LISTENER");
  }

  addConnection(conn: UtpConn): void {
    if (this.#closed) {
      this.logger.debug("Listener is closed, rejecting connection");
      conn.close();
      return;
    }

    this.#connections.push(conn);

    const waiter = this.#waitingAccepts.shift();
    if (waiter) {
      waiter.resolve(conn);
    } else {
      this.#pendingConnections.push(conn);
    }
  }

  accept(): Promise<UtpConn> {
    if (this.#closed) {
      return Promise.reject(new Error("Listener is closed"));
    }

    if (this.#pendingConnections.length > 0) {
      return Promise.resolve(this.#pendingConnections.shift()!);
    }

    return new Promise<UtpConn>((resolve, reject) => {
      this.#waitingAccepts.push({ resolve, reject });
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const conn of this.#connections) void conn.close();
    this.#connections = [];
    this.#pendingConnections = [];

    for (const waiter of this.#waitingAccepts) {
      waiter.reject(new Error("Listener is closed"));
    }
    this.#waitingAccepts = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<UtpConn> {
    return {
      next: async () => {
        try {
          return { value: await this.accept(), done: false };
        } catch (_error) {
          return { value: undefined, done: true };
        }
      },
    };
  }
}
