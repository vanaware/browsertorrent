import { TimerManager } from "@src/timer_manager.ts";
import { isIPv4, isIPv6, randomUint16, Seq } from "@src/util.ts";
import { UtpAddr } from "@src/utp_addr.ts";
import { UtpConn, UtpConnState } from "@src/utp_conn.ts";
import { UtpListener } from "@src/utp_listener.ts";
import { UtpPacket, UtpPacketType } from "@src/utp_packet.ts";
import { assert } from "std/assert/assert.ts";
import type { Logger } from "@src/logger.ts";
import { UtpContext } from "@src/utp_context.ts";

export enum UtpState {
  Active,
  Closing,
  Closed,
}

export type UtpAddressFamily = "IPv4" | "IPv6";

export interface UtpConnectOptions {
  port: number;
  hostname: string;
  /** Select a DNS address family. Dual-stack names prefer IPv4 by default. */
  family?: UtpAddressFamily;
}

export interface UtpDatagramTransport {
  readonly addr: Deno.Addr;
  receive(buffer?: Uint8Array): Promise<[Uint8Array, Deno.Addr]>;
  send(data: Uint8Array, address: Deno.Addr): Promise<number>;
  close(): void;
}

export interface UtpOptions {
  /** Caller-owned datagram channel, used when uTP shares one UDP port. */
  transport?: UtpDatagramTransport;
}

export class Utp {
  static readonly DEFAULT_MTU = 1400;
  #udpSocket!: UtpDatagramTransport;
  #udpFamily?: "IPv4" | "IPv6";
  readonly #timeoutTimerName = `UTP_TIMEOUT_CHECK_TIMER_${crypto.randomUUID()}`;
  readonly #timeoutCheckIntervalMs = 300;
  listener: UtpListener;
  listening: boolean;
  #connTable: Map<string, UtpConn>;
  #state: UtpState;
  #totalBytesWritten: number;
  #totalBytesRead: number;
  #totalUdpPacketSent: number;
  #totalUdpPacketReceived: number;
  #utpPacketReceived: number;
  #mockPacketLossRate: number;
  #mockPacketLossEnabled: boolean;
  #tag: string;
  logger: Logger;
  readonly context: UtpContext;

  constructor(tag: string = "", options: UtpOptions = {}) {
    this.#tag = tag;
    this.context = new UtpContext(this.#tag);
    this.logger = this.context.getLogger("UTP_SOCKET");

    this.listening = false;
    this.listener = new UtpListener(this.context);
    this.#state = UtpState.Active;
    this.#connTable = new Map();
    this.#totalBytesWritten = 0;
    this.#totalBytesRead = 0;
    this.#totalUdpPacketSent = 0;
    this.#totalUdpPacketReceived = 0;
    this.#utpPacketReceived = 0;
    this.#mockPacketLossRate = 0.01;
    this.#mockPacketLossEnabled = false;
    if (options.transport) {
      this.#udpSocket = options.transport;
      const localAddr = UtpAddr.fromDenoAddr(options.transport.addr);
      this.#udpFamily = isIPv6(localAddr.hostname) ? "IPv6" : "IPv4";
      this.logger.info(
        `μTP socket is using shared UDP transport on ${localAddr.toString()}`,
      );
      void this.startListen();
      this.startTimeoutCheck();
    }
  }

  // 启用日志
  enableLogging(): void {
    this.context.setDebug(true);
  }

  // 禁用日志
  disableLogging(): void {
    this.context.setDebug(false);
  }

  get localAddr(): UtpAddr | undefined {
    return this.#udpSocket?.addr
      ? UtpAddr.fromDenoAddr(this.#udpSocket.addr as Deno.Addr)
      : undefined;
  }

  /**
   * @param addr local address to listen on
   */
  private createUdpSocketIfNone(addr: UtpAddr): void {
    if (this.#udpSocket) {
      return;
    }

    this.#udpSocket = Deno.listenDatagram({
      port: addr.port,
      hostname: addr.hostname,
      transport: "udp",
    });

    const localAddr = UtpAddr.fromDenoAddr(this.#udpSocket.addr as Deno.Addr);
    this.#udpFamily = isIPv6(localAddr.hostname) ? "IPv6" : "IPv4";

    this.logger.info(`μTP socket is listening on ${localAddr.toString()}`);

    this.startListen();
    this.startTimeoutCheck();
  }

  /**
   * create a new connection to the peer, and execute the SYN command
   * @param remoteAddr
   * @returns
   */
  async connect(
    { port, hostname, family }: UtpConnectOptions,
  ): Promise<UtpConn> {
    const remoteAddr = await this.resolveRemoteAddr(
      port,
      hostname,
      family ?? this.#udpFamily,
    );
    const remoteFamily = isIPv6(remoteAddr.hostname) ? "IPv6" : "IPv4";
    if (this.#udpSocket && this.#udpFamily !== remoteFamily) {
      throw new Error(
        `uTP socket is bound to ${this.#udpFamily} and cannot connect to ${remoteFamily}`,
      );
    }
    const bindHostname = remoteFamily === "IPv6" ? "::" : "0.0.0.0";
    this.createUdpSocketIfNone(new UtpAddr(0, bindHostname));
    this.logger.info(
      `Attempting to connect to ${remoteAddr.hostname}:${remoteAddr.port}`,
    );

    // BEP 29 assigns adjacent receive/send IDs with uint16 wraparound.
    const localRecvId = randomUint16();
    const localSendId = Seq.add(localRecvId, 1);
    const seqNr = 1;
    const ackNr = 0;

    return await UtpConn.connectTo(
      this,
      UtpConnState.SynSent,
      remoteAddr,
      localSendId,
      localRecvId,
      seqNr,
      ackNr,
    );
  }

  private async resolveRemoteAddr(
    port: number,
    hostname: string,
    family?: UtpAddressFamily,
  ): Promise<UtpAddr> {
    const input = new UtpAddr(port, hostname);
    if (isIPv4(input.hostname) || isIPv6(input.hostname)) {
      const literalFamily = isIPv6(input.hostname) ? "IPv6" : "IPv4";
      if (family && family !== literalFamily) {
        throw new Error(
          `Address ${input.hostname} is ${literalFamily}, not requested ${family}`,
        );
      }
      return input;
    }

    // `resolveDns()` intentionally bypasses the OS hosts file on some Deno
    // platforms. Preserve the universally expected localhost behavior.
    if (input.hostname === "localhost") {
      return new UtpAddr(port, family === "IPv6" ? "::1" : "127.0.0.1");
    }

    const [ipv4, ipv6] = await Promise.all([
      Deno.resolveDns(input.hostname, "A").catch(() => []),
      Deno.resolveDns(input.hostname, "AAAA").catch(() => []),
    ]);
    const resolved = family === "IPv6"
      ? ipv6[0]
      : family === "IPv4"
      ? ipv4[0]
      : ipv4[0] ?? ipv6[0];
    if (!resolved) {
      throw new Error(
        `No ${family ?? "IPv4 or IPv6"} address found for ${input.hostname}`,
      );
    }
    return new UtpAddr(port, resolved);
  }

  /**
   * create a μTP server
   * @param options listen options,if not provided, a random port will be used, and listen on all interfaces
   */
  listen(
    { port, hostname = "0.0.0.0" }: { port: number; hostname?: string },
  ): UtpListener {
    this.createUdpSocketIfNone(new UtpAddr(port, hostname));
    return this.listener;
  }

  /**
   * close the UTP listener and all connections
   */
  close(): Promise<void> {
    if (this.#state === UtpState.Closed) {
      this.logger.debug("The UTP socket is already closed");
      return Promise.resolve();
    }

    if (this.#state === UtpState.Closing) {
      this.logger.debug(
        "The UTP socket is in CLOSE_WAIT state, waiting for the connections to close",
      );
      return Promise.resolve();
    }

    this.#state = UtpState.Closing;

    this.logger.info(
      `Closing UTP listener on ${this.localAddr?.hostname}:${this.localAddr?.port}`,
    );
    this.listener.close();

    const tryCloseSocket = () => {
      if (this.connectionCount === 0) {
        this.stopTimeoutCheck();
        // close() is valid even when listen()/connect() was never called.
        this.#udpSocket?.close();
        this.#state = UtpState.Closed;
        this.logger.info("UTP socket closed");
        return true;
      } else {
        const conns = Array.from(this.#connTable.values());
        const canCloseConns = conns.filter(
          (conn) =>
            conn.state !== UtpConnState.FinSent &&
            conn.state !== UtpConnState.Closing &&
            conn.state !== UtpConnState.Closed,
        );

        for (const conn of canCloseConns) {
          this.logger.debug(`Closing connection: ${conn.connectionKey}`);
          conn.close();
        }
        return false;
      }
    };

    // Connections may still be draining FIN acknowledgements asynchronously.
    if (tryCloseSocket()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (tryCloseSocket()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  logConnectionIds(): void {
    const keys = Array.from(this.#connTable.keys());
    this.logger.debug(
      `Connection table keys: ${keys.length > 0 ? keys.join(", ") : "None"}`,
    );
  }

  addConnection(conn: UtpConn): void {
    this.logger.info(`Adding connection: ${conn.connectionKey}`);
    this.#connTable.set(conn.connectionKey, conn);
  }

  removeConnection(conn: UtpConn): void {
    this.logger.info(`Removing connection: ${conn.connectionKey}`);
    this.#connTable.delete(conn.connectionKey);
  }

  getConnection(connectionKey: string): UtpConn | undefined {
    return this.#connTable.get(connectionKey);
  }

  hasConnection(connectionKey: string): boolean {
    return this.#connTable.has(connectionKey);
  }

  get connectionCount(): number {
    return this.#connTable.size;
  }

  async timeoutCheck(): Promise<void> {
    // iterate all connections
    for (const conn of this.#connTable.values()) {
      if (
        ![UtpConnState.Closed, UtpConnState.Reset].includes(
          conn.state,
        )
      ) {
        await conn.timeoutCheck();
      }
    }
  }

  startTimeoutCheck(): void {
    this.logger.debug(`Starting timeout check timer`);
    TimerManager.setTimer(
      this.#timeoutTimerName,
      this.timeoutCheck.bind(this),
      this.#timeoutCheckIntervalMs,
    );
  }

  stopTimeoutCheck(): void {
    this.logger.debug(`Stopping timeout check timer`);
    TimerManager.clearTimer(this.#timeoutTimerName);
  }

  async startListen(): Promise<void> {
    this.logger.info(`Starting to listen for incoming UTP packets`);
    while (!this.isClosed()) {
      try {
        // DENO BUG:超过1024字节的UDP数据包会被截断,手动调整缓冲区大小为默认MTU的2倍
        const [udpBytes, remoteAddr] = await this.#udpSocket.receive(
          new Uint8Array(Utp.DEFAULT_MTU * 2),
        );

        // mock packet loss,if enabled,drop the packet
        if (
          this.#mockPacketLossEnabled &&
          Math.random() < this.#mockPacketLossRate
        ) {
          continue;
        }

        this.#totalUdpPacketReceived++;
        this.#totalBytesRead += udpBytes.length;
        await this.dispatch(udpBytes, remoteAddr);
      } catch (err) {
        // On Windows an ICMP "port unreachable" response is surfaced on the
        // unconnected UDP receive loop as ConnectionReset. It only concerns
        // the attempted peer; keep the socket alive and let that connection's
        // normal timeout path report the failure.
        if (err instanceof Deno.errors.ConnectionReset) {
          this.logger.debug(
            `UDP receive reported a remote reset: ${err.message}`,
          );
          continue;
        }

        if (this.isClosed()) {
          this.logger.debug("UDP socket is closed");
        } else {
          throw err;
        }
      }
    }
  }

  isClosed(): boolean {
    return this.#state === UtpState.Closed;
  }

  isClosing(): boolean {
    return this.#state === UtpState.Closing;
  }

  isActive(): boolean {
    return this.#state === UtpState.Active;
  }

  /**
   * send utp packet to remote address
   * @param outgoingPacket
   * @returns
   */
  async sendUtpPacket(
    outgoingPacket: UtpPacket,
    remoteAddr: UtpAddr,
  ): Promise<number> {
    if (this.isClosed()) {
      this.logger.debug("The UTP socket is closed, cannot send packet");
      return 0;
    }

    this.logger.debug(
      `=======> UDP: 发送UDP数据包到${remoteAddr.toString()},seq is ${outgoingPacket.seqNr},ack is ${outgoingPacket.ackNr}`,
    );
    const bytes = outgoingPacket.toBytes();
    this.#totalBytesWritten += bytes.length;
    this.#totalUdpPacketSent++;

    const n = await this.#udpSocket.send(bytes, {
      port: remoteAddr.port,
      hostname: remoteAddr.hostname,
      transport: "udp",
    });

    assert(
      n === bytes.length,
      "UDP:发送的数据包长度与实际发送的数据包长度不一致",
    );

    return n;
  }

  /**
   * dispatch the incoming packet to the corresponding handler
   * @param udpBytes
   * @param remoteUdpAddr
   */
  async dispatch(
    udpBytes: Uint8Array,
    remoteUdpAddr: Deno.Addr,
  ): Promise<void> {
    const remoteAddr = UtpAddr.fromDenoAddr(remoteUdpAddr);
    if (!UtpPacket.isPacket(udpBytes, this.context)) {
      // Deno may return null-prototype address objects that cannot be safely
      // coerced by template literals, even when debug output is disabled.
      this.logger.debug(`invalid uTP packet from ${remoteAddr.toString()}`);
      return;
    }

    const packet = UtpPacket.fromBytes(udpBytes, this.context);

    this.logger.debug(
      `<======= Receiving packet from ${remoteAddr.toString()} to the target connection`,
    );
    this.logger.debug(packet.toString());

    this.#utpPacketReceived++;

    if (packet.type === UtpPacketType.ST_SYN) {
      this.logger.debug("received a SYN packet from", remoteAddr);

      // create a new connection
      // only when type is SYN, the connId means sendId
      const remoteRecvId = packet.connId;
      const remoteSendId = Seq.add(packet.connId, 1);

      const localSendId = remoteRecvId;
      const localRecvId = remoteSendId;

      const targetConnectionKey = UtpConn.createConnectionKey(
        remoteAddr,
        localSendId,
        localRecvId,
      );

      const existingConn = this.getConnection(targetConnectionKey);
      if (existingConn) {
        this.logger.debug(
          `connection already exists for the packet from ${remoteAddr}`,
        );
        if (existingConn.state === UtpConnState.SynReceived) {
          await existingConn.sendUtpPacket(
            UtpPacket.createAckPacket(existingConn),
          );
          this.logger.debug(
            `resent ST_STATE for duplicate SYN from ${remoteAddr}`,
          );
        }
        return;
      }

      const seqNr = randomUint16();
      const ackNr = packet.seqNr;
      const conn = UtpConn.connectTo(
        this,
        UtpConnState.SynReceived,
        remoteAddr,
        localSendId,
        localRecvId,
        seqNr,
        ackNr,
      );
      // notify the listener to accept a new connection; swallow rejection (e.g. 5s SYN_RECV timeout)
      conn.then((conn) => this.listener.addConnection(conn)).catch((err) =>
        this.logger.debug(`SYN_RECV connection failed: ${err}`)
      );
    } else {
      // Non-SYN headers carry the sender's send ID. Try both adjacent local
      // send IDs because packet direction is not encoded on the wire.
      const localRecvId = packet.connId;
      const localSendIds = [Seq.add(localRecvId, 1), Seq.add(localRecvId, -1)];
      const targetConns = localSendIds
        .map((sendId) =>
          UtpConn.createConnectionKey(remoteAddr, sendId, localRecvId)
        )
        .map((connectionKey) => this.getConnection(connectionKey))
        .filter((conn) => conn !== undefined) as UtpConn[];

      // if no connection found, ignore the packet
      if (targetConns.length === 0) {
        this.logger.debug(
          `No connection found for the packet from ${remoteAddr}`,
        );
        return;
      }

      // handle the packet
      for (const conn of targetConns) {
        if (packet.type === UtpPacketType.ST_RESET) {
          conn.reset();
        } else {
          const handled = await conn.handleIncomingPacket({
            packet,
            remoteAddr,
          });

          if (handled) {
            break;
          }
        }
      }
    }
  }
}
