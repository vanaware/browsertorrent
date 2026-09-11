import { BlockingMap } from "@src/blocking_map.ts";
import type { UtpAddr } from "@src/utp_addr.ts";
import { UtpCongestionControl } from "@src/utp_congestion_control.ts";
import type { UtpConn, UtpPacketWithAddr } from "@src/utp_conn.ts";
import type { UtpPacket } from "@src/utp_packet.ts";
import { UtpRttTracker } from "@src/utp_rtt_tracker.ts";
import type { Logger } from "@src/logger.ts";
import { Seq } from "@src/util.ts";

export type UtpPacketWithExtraInfo = {
  packet: UtpPacket;
  resendTimes: number;
  sentTime: number;
  remoteAddr: UtpAddr;
};

export class UtpDeliveryError extends Error {
  readonly seqNr?: number;
  readonly retransmissions?: number;

  constructor(
    message: string,
    options: { seqNr?: number; retransmissions?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "UtpDeliveryError";
    this.seqNr = options.seqNr;
    this.retransmissions = options.retransmissions;
  }
}

/**
 * Send window
 */
export class UtpSendWindow {
  readonly #retransmissionLimit = 3;
  readonly #maxWindowPackets = 64;
  readonly #minWindowPackets = 4;

  #packetMap: BlockingMap<number, UtpPacketWithExtraInfo>;
  #maxWindow: number;
  #minWindow: number;
  #conn: UtpConn;
  #latestCumulativeAck?: number;
  #congestionControl: UtpCongestionControl;
  #rttTracker: UtpRttTracker;
  #remoteWindowBytes?: number;
  #deliveryError?: UtpDeliveryError;
  #flushWaiters: Array<{
    resolve: () => void;
    reject: (reason: UtpDeliveryError) => void;
  }> = [];
  logger: Logger;

  constructor(conn: UtpConn) {
    this.#packetMap = new BlockingMap<number, UtpPacketWithExtraInfo>(
      this.#minWindowPackets,
    );
    this.#congestionControl = new UtpCongestionControl(
      this.#minWindowPackets,
      100,
      conn.utp.context,
    );
    this.#maxWindow = this.#maxWindowPackets;
    this.#minWindow = this.#minWindowPackets;
    this.#rttTracker = new UtpRttTracker(conn.utp.context);
    this.#conn = conn;
    this.logger = conn.utp.context.getLogger(
      `SEND_WINDOW_${conn.connectionKey}`,
    );
  }

  /** Compare in uint16 sequence space so ACK processing survives wraparound. */
  private isPacketAcked(seqNr: number): boolean {
    return (
      this.#latestCumulativeAck !== undefined &&
      Seq.ge(this.#latestCumulativeAck, seqNr)
    );
  }

  /**
   * 重传超时的数据包
   */
  async resend(): Promise<void> {
    const now = Date.now();
    const seqNrs = this.#pendingSequenceNumbers();
    for (const seqNr of seqNrs) {
      const packetWithExtraInfo = this.#packetMap.get(seqNr);
      if (packetWithExtraInfo) {
        const rto = this.#rttTracker.rto;
        if (now - packetWithExtraInfo.sentTime > rto) {
          if (packetWithExtraInfo.resendTimes >= this.#retransmissionLimit) {
            // 重传次数超过限制，视为丢包
            this.#congestionControl.onPacketLoss();
            this.#applyWindowSize();
            this.#packetMap.delete(seqNr);
            const error = new UtpDeliveryError(
              `Packet ${packetWithExtraInfo.packet.seqNr} was not acknowledged after ${packetWithExtraInfo.resendTimes} retransmissions`,
              {
                seqNr: packetWithExtraInfo.packet.seqNr,
                retransmissions: packetWithExtraInfo.resendTimes,
              },
            );
            this.#fail(error);
            this.logger.debug(error.message);
            continue;
          }
          // 重传数据包
          packetWithExtraInfo.resendTimes++;
          packetWithExtraInfo.sentTime = now;
          await this.#conn.utp.sendUtpPacket(
            packetWithExtraInfo.packet,
            packetWithExtraInfo.remoteAddr,
          );
        }
      }
    }
  }

  /**
   * 将拥塞控制计算出的窗口大小与对端接收窗口共同约束发送容量
   */
  #applyWindowSize(): void {
    const ccWindow = Math.max(
      this.#minWindow,
      Math.min(this.#maxWindow, this.#congestionControl.windowSize),
    );
    let size = ccWindow;
    // 同时尊重对端广播的接收窗口（避免溢出对端接收缓冲区）
    if (this.#remoteWindowBytes !== undefined) {
      const mtu = this.#conn.maxPacketSize;
      const remoteWindowPackets = Math.max(
        1,
        Math.floor(this.#remoteWindowBytes / mtu),
      );
      size = Math.min(ccWindow, remoteWindowPackets);
    }
    this.#packetMap.updateCapacity(size);
    this.logger.debug(
      `SendWindow: window capacity updated to ${size} (cc=${ccWindow}, remoteBytes=${
        this.#remoteWindowBytes ?? "unknown"
      })`,
    );
  }

  /**
   * 检查超时的数据包
   */
  async timeoutCheck(): Promise<void> {
    await this.resend();
  }

  /**
   * 将数据包登记到发送窗口并等待窗口有空间（若窗口已满则阻塞）
   * 实际发送由调用方（conn.sendUtpPacket）负责，避免重复发送
   * @param packetWithAddr
   */
  async waitForAck(packetWithAddr: UtpPacketWithAddr): Promise<void> {
    this.assertHealthy();
    const packet = packetWithAddr.packet;
    const seqNr = packet.seqNr;
    this.logger.debug(`SendWindow.waitForAck seqNr=${packet.seqNr}`);

    // 将数据包放入发送窗口，若窗口已满则在此阻塞，等待 ACK 腾出空间
    await this.#packetMap.set(seqNr, {
      packet,
      resendTimes: 0,
      sentTime: Date.now(),
      remoteAddr: packetWithAddr.remoteAddr,
    });

    if (this.#deliveryError) {
      this.#packetMap.delete(seqNr);
      throw this.#deliveryError;
    }
  }

  /** Wait until every currently queued DATA/FIN packet is acknowledged. */
  flush(): Promise<void> {
    if (this.#deliveryError) return Promise.reject(this.#deliveryError);
    if (this.isEmpty()) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.#flushWaiters.push({ resolve, reject });
    });
  }

  assertHealthy(): void {
    if (this.#deliveryError) throw this.#deliveryError;
  }

  abort(error: UtpDeliveryError): void {
    this.#fail(error);
  }

  /**
   * 处理ACK包
   * @param ackPacket
   */
  handleAck(ackPacket: UtpPacket): void {
    // 更新对端广播的接收窗口大小
    this.#remoteWindowBytes = ackPacket.windowSize;

    // 更新对方收到的最大的包的序列号
    if (
      this.#latestCumulativeAck === undefined ||
      Seq.gt(ackPacket.ackNr, this.#latestCumulativeAck)
    ) {
      this.#latestCumulativeAck = ackPacket.ackNr;
    }

    // 处理SACK扩展
    if (ackPacket.sackExtension) {
      const sack = ackPacket.sackExtension;
      const ackedSeqNrs = sack.getReceivedSequenceNumbers();
      for (const seqNr of ackedSeqNrs) {
        const info = this.#packetMap.get(seqNr);
        if (info) {
          if (info.resendTimes === 0) this.#rttTracker.update(info);
          this.#packetMap.delete(seqNr);
        }
      }
    }

    // 处理累积ACK
    const seqNrs = this.#pendingSequenceNumbers();
    for (const seqNr of seqNrs) {
      if (this.isPacketAcked(seqNr)) {
        const info = this.#packetMap.get(seqNr);
        if (info && info.resendTimes === 0) this.#rttTracker.update(info);
        this.#packetMap.delete(seqNr);
      }
    }

    // 根据最新RTT调整拥塞窗口（RTT tracker 保证 rtt >= 1，此处无需守卫）
    this.#congestionControl.updateRtt(this.#rttTracker.rtt);
    this.#applyWindowSize();
    this.#resolveFlushIfIdle();

    this.logger.debug(
      "SendWindow.handleAck",
      "window capacity:",
      this.#packetMap.capacity,
      "waiting ack count:",
      this.#packetMap.size,
    );
  }

  /**
   * 检查发送窗口是否为空
   * @returns
   */
  isEmpty(): boolean {
    return this.#packetMap.size === 0;
  }

  #pendingSequenceNumbers(): number[] {
    return Array.from(this.#packetMap.keys());
  }

  /**
   * 重置发送窗口
   */
  reset(error?: UtpDeliveryError): void {
    if (error) {
      this.#fail(error);
    } else {
      this.#packetMap.clear();
    }
    this.#latestCumulativeAck = undefined;
    this.#remoteWindowBytes = undefined;
    this.#congestionControl.reset();
    this.#packetMap.updateCapacity(this.#minWindow);
  }

  #fail(error: UtpDeliveryError): void {
    if (this.#deliveryError) return;
    this.#deliveryError = error;
    this.#packetMap.abort(error);
    const waiters = this.#flushWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  #resolveFlushIfIdle(): void {
    if (!this.isEmpty() || this.#deliveryError) return;
    const waiters = this.#flushWaiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }
}
