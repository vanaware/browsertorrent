import { BlockingBuffer } from "@src/blocking_buffer.ts";
import { CircularQueue } from "@src/circular_queue.ts";
import type { Logger } from "@src/logger.ts";
import { UtpStatistics } from "@src/utp_statistics.ts";
import { currentMicroseconds, Seq } from "@src/util.ts";
import type { UtpAddr } from "@src/utp_addr.ts";
import { UtpSelectiveAckExtension } from "@src/utp_ext_sack.ts";
import { UtpPacket, UtpPacketType } from "@src/utp_packet.ts";
import { UtpDeliveryError, UtpSendWindow } from "@src/utp_send_window.ts";
import { Utp } from "@src/utp_socket.ts";
import { assert } from "std/assert/assert.ts";
import type { Closer, Reader, Writer } from "std/io/mod.ts";

export enum UtpConnState {
  SynSent,
  SynReceived,
  Connected,
  Reset,
  /** Local write side is closed; the read side remains open. */
  FinSent,
  /** Remote write side is closed; local writes remain allowed. */
  FinReceived,
  /** Both write sides are closed while final acknowledgements drain. */
  Closing,
  Closed,
}

export type UtpPacketWithAddr = {
  packet: UtpPacket;
  remoteAddr: UtpAddr;
};

export class UtpConn implements Reader, Writer, Closer {
  static readonly CONNECT_TIMEOUT_MS = 5_000;
  static readonly CLOSE_TIMEOUT_MS = 10_000;
  static readonly #keepAliveIntervalMs = 29_000;
  static readonly #initiatorReceiveQueueSize = 8192;
  static readonly #responderReceiveQueueSize = 4096;
  static readonly #defaultWriteChunkBytes = 64 * 1024;
  #localReceiveId: number;
  #localSendId: number;
  #localSequenceNumber: number;
  #localAcknowledgementNumber: number;
  #localState: UtpConnState;
  #remoteFinPacket?: UtpPacket; // received ST_FIN packet, indicate remote data send finished
  #localFinPacket?: UtpPacket; // sent ST_FIN packet, indicate local data send finished
  #localSynPacket?: UtpPacket; // sent ST_SYN packet, indicate local connection request
  utp: Utp;
  isInitiator: boolean; // is the syn packet sender or not
  remoteAddr: UtpAddr; // remote peer address
  offsetTime: number; // offset time
  lastPacketTimestampMicroseconds!: number; // last receive time
  lastLiveTime: number; // last live time
  peerTimeIsInvalid: boolean; // peer time is invalid
  listeners: ((state: UtpConnState) => void)[];
  recvPacketQueue: CircularQueue<UtpPacket>; // 数据包循环队列,用于接收非连续seq的数据包,并对其排序
  recvBuffer: BlockingBuffer; // 接收缓冲区
  sendWindow: UtpSendWindow;
  statistics: UtpStatistics;
  closeStartTime?: number; // start time of the close process
  logger: Logger;

  /**
   * create a new connection, and wait for connecting
   * @param utp
   * @param initState
   * @param remoteAddr
   * @param sendId
   * @param recvId
   * @param seqNr
   * @param ackNr
   * @returns a new connection that is waiting for connecting
   */
  static connectTo(
    utp: Utp,
    initState: UtpConnState.SynReceived | UtpConnState.SynSent,
    remoteAddr: UtpAddr,
    sendId: number,
    recvId: number,
    seqNr: number,
    ackNr: number,
  ): Promise<UtpConn> {
    return new UtpConn(utp, initState, remoteAddr, sendId, recvId, seqNr, ackNr)
      .waitForConnecting();
  }

  /**
   * create a new connection
   * @param utp
   * @param initState
   * @param remoteAddr
   */
  private constructor(
    utp: Utp,
    initState: UtpConnState.SynReceived | UtpConnState.SynSent,
    remoteAddr: UtpAddr,
    sendId: number,
    recvId: number,
    seqNr: number,
    ackNr: number,
  ) {
    this.utp = utp;
    this.#localState = initState;
    this.#localSendId = sendId;
    this.#localReceiveId = recvId;
    this.#localSequenceNumber = seqNr;
    this.#localAcknowledgementNumber = ackNr;
    this.remoteAddr = remoteAddr;
    this.isInitiator = initState === UtpConnState.SynSent;
    this.offsetTime = 0;
    this.lastLiveTime = performance.now();
    this.peerTimeIsInvalid = false;
    this.listeners = [];

    // 初始化logger，使用连接ID作为标识
    this.logger = utp.context.getLogger(`CONN_${this.connectionKey}`);

    // 根据连接类型动态调整接收队列大小
    const queueSize = this.isInitiator
      ? UtpConn.#initiatorReceiveQueueSize
      : UtpConn.#responderReceiveQueueSize;
    this.recvPacketQueue = new CircularQueue(queueSize);

    this.recvBuffer = new BlockingBuffer();
    this.sendWindow = new UtpSendWindow(this);
    this.statistics = new UtpStatistics();

    utp.addConnection(this);
  }

  get receiveConnectionId(): number {
    return this.#localReceiveId;
  }

  get sendConnectionId(): number {
    return this.#localSendId;
  }

  set sequenceNumber(seqNumber: number) {
    this.#localSequenceNumber = seqNumber & 0xFFFF;
  }

  get sequenceNumber(): number {
    return this.#localSequenceNumber;
  }

  set acknowledgementNumber(ackNumber: number) {
    this.#localAcknowledgementNumber = ackNumber & 0xFFFF;
  }

  /**
   * 接收到的最大确认号
   */
  get acknowledgementNumber(): number {
    return this.#localAcknowledgementNumber;
  }

  set state(state: UtpConnState) {
    if (this.#localState === state) return;
    const oldState = this.#localState;
    const newState = state;
    this.#localState = state;
    this.notifyStateChange(oldState, newState);
  }

  get state(): UtpConnState {
    return this.#localState;
  }

  get tag(): string {
    return `[CONNECTION|${this.connectionKey}|state(${
      UtpConnState[this.state]
    })]`;
  }

  get maxWriteSpeed(): number {
    return this.statistics.maxSentSpeed;
  }

  get minWriteSpeed(): number {
    return this.statistics.minSentSpeed;
  }

  get averageWriteSpeed(): number {
    return this.statistics.averageSentSpeed;
  }

  get maxReadSpeed(): number {
    return this.statistics.maxRecvSpeed;
  }

  get minReadSpeed(): number {
    return this.statistics.minRecvSpeed;
  }

  get averageReadSpeed(): number {
    return this.statistics.averageRecvSpeed;
  }

  /** Stable lookup key for this peer and its paired uTP connection IDs. */
  get connectionKey(): string {
    return UtpConn.createConnectionKey(
      this.remoteAddr,
      this.#localSendId,
      this.#localReceiveId,
    );
  }

  static createConnectionKey(
    remoteAddr: UtpAddr,
    localSendId: number,
    localRecvId: number,
  ): string {
    return `addr(${remoteAddr.toString()})|send_id(${
      localSendId & 0xFFFF
    })|recv_id(${localRecvId & 0xFFFF})`;
  }

  notifyStateChange(oldState: UtpConnState, newState: UtpConnState): void {
    this.logger.debug(
      `[STATE CHANGE]: ${UtpConnState[oldState]} ===> ${
        UtpConnState[newState]
      }`,
    );
    this.listeners.forEach((listener) => {
      listener(this.state);
    });
  }

  addListener(listener: (state: UtpConnState) => void): void {
    this.listeners.push(listener);
  }

  removeListener(listener: (state: UtpConnState) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * handle incoming packet at syn sent state
   * @param packet
   * @param remoteAddr
   * @returns true if the packet is handled, otherwise false
   */
  private handleAtSynSent(packetWithAddr: UtpPacketWithAddr): Promise<boolean> {
    const packet = packetWithAddr.packet;
    if (packet.type !== UtpPacketType.ST_STATE) {
      this.logger.debug(`SynSentState: ignore packet type: ${packet.type}`);
      return Promise.resolve(false);
    }

    // 此时ackNr还没有初始化
    // uTP中ST_STATE（SYN-ACK）不消耗序列号，对端第一个ST_DATA与SYN-ACK使用
    // 相同的seqNr，因此localAckNr需设为seqNr-1，使duplicate检测正常工作
    this.acknowledgementNumber = Seq.add(packet.seqNr, -1);
    this.state = UtpConnState.Connected;
    return Promise.resolve(true);
  }

  /**
   * handle incoming packet at syn received state
   * @param packet
   * @param remoteAddr
   * @returns true if the packet is handled, otherwise false
   */
  private async handleAtSynReceived(
    packetWithAddr: UtpPacketWithAddr,
  ): Promise<boolean> {
    const packet = packetWithAddr.packet;
    if (packet.type !== UtpPacketType.ST_DATA) {
      this.logger.debug(`SynReceivedState: ignore packet type: ${packet.type}`);
      return false;
    }

    // check ack: 客户端应 ACK 我们的 SYN-ACK（SYN-ACK不消耗seqNr，ackNr = seqNr - 1）
    if (packet.ackNr !== Seq.add(this.sequenceNumber, -1)) {
      this.logger.debug(
        `SynReceivedState: ignore packet ackNumber: ${packet.ackNr},because it's not equal to conn.seqNumber-1 ${
          Seq.add(this.sequenceNumber, -1)
        }`,
      );
      return false;
    }

    // 此时ackNr还没有初始化,直接赋值
    this.acknowledgementNumber = packet.seqNr;
    this.state = UtpConnState.Connected;

    // 直接将数据放入payload blocking queue,
    if (packet.data) {
      await this.recvBuffer.write(packet.data);
      // 更新统计数据
      this.statistics.updateRecvData(packet.data.length);
    }

    const selectAckExtension = UtpSelectiveAckExtension.createFromConn(this);
    const ackPacket = UtpPacket.createAckPacket(this, selectAckExtension);

    // 发送ACK
    await this.sendUtpPacket(ackPacket);

    this.logger.debug(`SynReceivedState: connection is connected`);
    return true;
  }

  /**
   * handle incoming packet at connected state
   * @param packet
   * @param remoteAddr
   * @returns true if the packet is handled, otherwise false
   */
  private async handleAtConnected(
    packetWithAddr: UtpPacketWithAddr,
  ): Promise<boolean> {
    const packet = packetWithAddr.packet;

    // 检查连接是否已关闭
    if (this.isClosed()) {
      this.logger.debug(`ConnectedState: 连接已关闭，忽略数据包`);
      return false;
    }

    // 连接建立后,只处理ST_DATA和ST_FIN包
    if (
      packet.type !== UtpPacketType.ST_FIN &&
      packet.type !== UtpPacketType.ST_DATA
    ) {
      this.logger.debug(`ConnectedState: 忽略非数据包类型: ${packet.type}`);
      return false;
    }

    // 丢弃重复的数据包
    if (packet.seqNr === this.acknowledgementNumber) {
      this.logger.debug(
        `ConnectedState: 丢弃重复的数据包 seqNr=${packet.seqNr}`,
      );
      return false;
    }

    if (
      this.#remoteFinPacket && Seq.gt(packet.seqNr, this.#remoteFinPacket.seqNr)
    ) {
      this.logger.debug(
        `ConnectedState: 丢弃超出FIN包序号的数据包 seqNr=${packet.seqNr}, FIN_seqNr=${this.#remoteFinPacket.seqNr}`,
      );
      return false;
    }

    // FIN participates in sequence ordering. Record its boundary immediately,
    // but do not close until every preceding DATA packet has been assembled.
    if (packet.type === UtpPacketType.ST_FIN) {
      this.logger.debug(`ConnectedState: 收到FIN包 seqNr=${packet.seqNr}`);
      this.#remoteFinPacket = packet;
    }

    // 检查接收队列是否已满
    if (this.recvPacketQueue.size >= this.recvPacketQueue.capacity) {
      this.logger.debug(
        `ConnectedState: 接收队列已满, 当前大小=${this.recvPacketQueue.size}, 容量=${this.recvPacketQueue.capacity}`,
      );
      // 如果队列已满，尝试处理已有的数据包
      await this.processReceivedPackets();
    }

    // 将收到的所有ST_DATA和ST_FIN包放入接收窗口
    try {
      this.recvPacketQueue.enqueue(packet.seqNr, packet);
      this.logger.debug(
        `ConnectedState: 成功将数据包加入队列 seqNr=${packet.seqNr}, 当前队列大小=${this.recvPacketQueue.size}`,
      );
    } catch (error) {
      this.logger.debug(
        `ConnectedState: 将数据包加入队列失败 seqNr=${packet.seqNr}: ${error}`,
      );
      return false;
    }

    // 处理接收到的数据包
    await this.processReceivedPackets();

    // A FIN may arrive ahead of missing DATA packets. Only expose EOF and
    // start closing once the receive sequence is continuous through the FIN.
    if (
      this.#remoteFinPacket &&
      this.acknowledgementNumber === this.#remoteFinPacket.seqNr
    ) {
      this.updateClosingState();
      this.recvBuffer.drain();
    }

    // 再次检查连接是否已关闭，避免在连接关闭后发送ACK
    if (this.isClosed()) {
      this.logger.debug(`ConnectedState: 连接已关闭，不发送ACK`);
      return true;
    }

    try {
      const selectAckExtension = UtpSelectiveAckExtension.createFromConn(this);
      const ackPacket = UtpPacket.createAckPacket(this, selectAckExtension);

      // 无论接收到的ackNr是否连续,都需要发送ACK,因为对端可能会重发数据包
      await this.sendUtpPacket(ackPacket);
      this.logger.debug(
        `ConnectedState: 发送ACK包 ackNr=${this.acknowledgementNumber}`,
      );
    } catch (error) {
      this.logger.debug(`ConnectedState: 发送ACK包失败: ${error}`);
    }

    if (
      this.#remoteFinPacket &&
      this.acknowledgementNumber === this.#remoteFinPacket.seqNr
    ) {
      await this.trySafeRelease();
    }

    return true;
  }

  private async processReceivedPackets(): Promise<void> {
    // Consume by the next expected sequence instead of numerically sorting the
    // queue. Numeric ordering is incorrect across the uint16 wrap boundary.
    for (;;) {
      const seq = Seq.add(this.acknowledgementNumber, 1);
      const packet = this.recvPacketQueue.dequeueByKey(seq);
      if (!packet) break;

      this.acknowledgementNumber = seq;
      this.logger.debug(`ProcessReceivedPackets: 更新ackNr=${seq}`);

      if (packet.data && packet.type === UtpPacketType.ST_DATA) {
        try {
          await this.recvBuffer.write(packet.data);
          this.statistics.updateRecvData(packet.data.length);
          this.logger.debug(
            `ProcessReceivedPackets: 成功写入数据到接收缓冲区 seq=${seq}, 数据大小=${packet.data.length}`,
          );
        } catch (error) {
          this.logger.debug(
            `ProcessReceivedPackets: 写入数据到接收缓冲区失败 seq=${seq}: ${error}`,
          );
        }
      }
    }
  }

  /**
   * handle incoming packet,but ST_SYN and ST_RESET packet will not be handled here
   * @param incomingPacket
   * @param addr
   * @returns
   */
  async handleIncomingPacket(
    packetWithAddr: UtpPacketWithAddr,
  ): Promise<boolean> {
    this.logger.debug(
      `=======> ${UtpConnState[this.state]}: handleIncomingPacket`,
    );
    this.logger.debug(packetWithAddr.packet.toString());

    // Every non-reset uTP packet carries a cumulative ack_nr. Real peers may
    // piggyback acknowledgements on DATA/FIN instead of sending a standalone
    // STATE packet, so all of those headers must advance the send window.
    if (packetWithAddr.packet.type !== UtpPacketType.ST_RESET) {
      await this.sendWindow.handleAck(packetWithAddr.packet);
    }

    let handled = false;
    switch (this.state) {
      case UtpConnState.SynSent:
        handled = await this.handleAtSynSent(packetWithAddr);
        break;
      case UtpConnState.SynReceived:
        handled = await this.handleAtSynReceived(packetWithAddr);
        break;
      case UtpConnState.Connected:
      case UtpConnState.FinSent:
      case UtpConnState.FinReceived:
        handled = await this.handleAtConnected(packetWithAddr);
        break;
      case UtpConnState.Closing:
        handled = packetWithAddr.packet.type === UtpPacketType.ST_STATE;
        await this.trySafeRelease();
        break;
      case UtpConnState.Closed:
      case UtpConnState.Reset:
        // 已关闭或重置的连接不处理任何包
        break;
      default:
        this.logger.debug(`未知状态: ${UtpConnState[this.state]}`);
        break;
    }

    if (handled) {
      this.lastPacketTimestampMicroseconds = currentMicroseconds();
    }

    return handled;
  }

  /**
   * 等待连接建立，这里需要处理两种情况，一种是本地是SYN包的发送方，一种是本地是SYN包的接收方
   */
  private async waitForConnecting(): Promise<UtpConn> {
    this.logger.debug(`${this.tag} is waiting for connecting`);

    // 如果已经连接，直接解决 Promise
    if (this.state === UtpConnState.Connected) {
      this.logger.debug(`${this.tag} is already connected`);
      return this;
    }

    let packet: UtpPacket;
    // 发起连接尝试
    if (this.isInitiator) {
      packet = UtpPacket.createSynPacket(this);
      this.#localSynPacket = packet;
      // SYN 消耗一个序列号，与服务端的 SYN-ACK 保持一致
      // BEP 29：发送方下一个 DATA 的 seqNr 必须比 SYN 大 1
      this.sequenceNumber++;
    } else {
      packet = UtpPacket.createAckPacket(this);
      // uTP中ST_STATE（SYN-ACK）不消耗序列号——与Transmission等主流实现保持一致：
      // 服务端第一个ST_DATA与SYN-ACK共用同一seqNr。
      // STATE does not consume a sequence number, so the first DATA reuses it.
    }

    await this.sendUtpPacket(packet);

    // 返回一个新的 Promise，它会在状态变为 CONNECTED 时解决
    return new Promise((resolve, reject) => {
      // 设置连接超时
      const timeoutId = setTimeout(() => {
        this.removeListener(onStateChange);
        reject(
          new Error(
            `Connection timeout after ${UtpConn.CONNECT_TIMEOUT_MS}ms`,
          ),
        );
      }, UtpConn.CONNECT_TIMEOUT_MS);

      // 状态变化监听器
      const onStateChange = (state: UtpConnState): void => {
        if (state === UtpConnState.Connected) {
          this.removeListener(onStateChange);
          clearTimeout(timeoutId);
          resolve(this);
        } else if (state === UtpConnState.Reset) {
          this.removeListener(onStateChange);
          clearTimeout(timeoutId);
          reject(new Error("Connection reset by remote"));
        } else if (state === UtpConnState.Closed) {
          this.removeListener(onStateChange);
          clearTimeout(timeoutId);
          reject(new Error("Connection is closed"));
        }
      };

      try {
        // 添加状态变化监听器
        this.addListener(onStateChange);
      } catch (e) {
        // 移除状态变化监听器和超时定时器
        this.removeListener(onStateChange);
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  async read(buffer: Uint8Array): Promise<number | null> {
    return await this.recvBuffer.read(buffer);
  }

  /**
   * 获取最大允许发送的数据包大小,也就是此大小的数据包不会被分片
   * get the maximum allowed size of the data packet sent, that is, the data packet of this size will not be fragmented
   */
  get maxPacketSize(): number {
    return Utp.DEFAULT_MTU;
  }

  /**
   * write data to the connection
   * @param bytes data to write
   */
  async write(dataToSend: Uint8Array): Promise<number> {
    this.sendWindow.assertHealthy();
    if (this.isClosed()) {
      throw new Error(`Cannot send packet on closed connection ${this.tag}`);
    }
    if (!this.canWrite()) {
      throw new Error(`Cannot write after local FIN on connection ${this.tag}`);
    }
    this.logger.debug(`Write: 开始发送数据, 总大小=${dataToSend.length}`);

    const chunkSize = Math.min(
      UtpConn.#defaultWriteChunkBytes,
      Utp.DEFAULT_MTU - UtpPacket.HEADER_SIZE,
    );
    let offset = 0;

    while (offset < dataToSend.length) {
      // 创建分片
      const chunk = dataToSend.subarray(offset, offset + chunkSize);
      this.logger.debug(
        `Write: 创建数据分片, 大小=${chunk.length}, 偏移量=${offset}`,
      );

      // 创建数据包以获取实际的扩展大小
      const dataPacket = UtpPacket.createDataPacket(this, chunk);

      // 发送数据包
      const n = await this.sendUtpPacket(dataPacket);
      this.logger.debug(
        `Write: 发送数据包, 大小=${n}, seqNr=${dataPacket.seqNr}`,
      );

      assert(
        n === dataPacket.byteLength,
        `发送的数据包长度不等于要发送的数据包长度,发送的数据包长度${n},要发送的数据包长度${dataPacket.byteLength}`,
      );

      // 更新发送统计
      this.statistics.updateSentData(chunk.length);

      // 更新偏移量
      offset += chunk.length;
    }

    assert(
      dataToSend.length === offset,
      `发送的数据长度不等于要发送的数据长度,发送的数据长度${offset},要发送的数据长度${dataToSend.length}`,
    );

    this.logger.debug(`Write: 数据发送完成, 总大小=${offset}`);
    return dataToSend.length;
  }

  /** Wait until all DATA packets queued by write() have been acknowledged. */
  async flush(): Promise<void> {
    await this.sendWindow.flush();
  }

  get receiveWindowBytes(): number {
    return this.recvBuffer.freeSpace;
  }

  /**
   * check if the connection is timeout
   */
  async timeoutCheck(): Promise<void> {
    switch (this.state) {
      case UtpConnState.SynSent: {
        const isConnectTimeout = this.#localSynPacket &&
          currentMicroseconds() -
                this.#localSynPacket.timestampMicroseconds >
            UtpConn.CONNECT_TIMEOUT_MS * 1000;
        if (isConnectTimeout) {
          this.logger.debug(
            `Connection ${this.tag} connect timeout, force close`,
          );
          this.forceClose();
        }
        break;
      }
      case UtpConnState.SynReceived:
      case UtpConnState.Connected:
      case UtpConnState.FinReceived:
        {
          // 检查是否需要发送keep alive包
          const now = performance.now();
          if (now - this.lastLiveTime > UtpConn.#keepAliveIntervalMs) {
            this.logger.debug(
              `Connection ${this.tag} sending keep alive packet`,
            );
            await this.sendUtpPacket(
              UtpPacket.createAckPacket(
                this,
                UtpSelectiveAckExtension.createFromConn(this),
              ),
            );
            this.lastLiveTime = now;
          }

          // 检查连接是否超时
          await this.sendWindow.timeoutCheck();
        }
        break;
      case UtpConnState.FinSent:
      case UtpConnState.Closing: {
        await this.sendWindow.timeoutCheck();
        await this.trySafeRelease();
        break;
      }
      default:
        break;
    }
  }

  /**
   * 安全关闭连接的善后工作
   * 1.查看是否还有待ACK的数据包,可能存在丢包,需要重发
   * 2.发送ST_FIN包,通知对方数据发送完毕
   * 3.等待对方发送ST_FIN包,通知数据接收完毕
   * 4.关闭连接
   * @returns
   */
  private trySafeRelease(): void {
    if (!this.#localFinPacket && !this.#remoteFinPacket) return;

    this.logger.debug(`try safe release connection ${this.tag}`);

    // 检查是否超时
    const closeStartTime = this.closeStartTime || performance.now();
    if (performance.now() - closeStartTime > UtpConn.CLOSE_TIMEOUT_MS) {
      this.logger.debug(`Connection ${this.tag} close timeout, force close`);
      this.forceClose();
      return;
    }

    // Both directions have reached EOF and every tracked DATA/FIN packet has
    // been acknowledged. The connection can now be removed safely.
    if (
      this.#localFinPacket && this.#remoteFinPacket &&
      this.sendWindow.isEmpty()
    ) {
      this.logger.debug(
        `Remote FIN packet received and send window is empty, closing connection`,
      );
      this.forceClose();
      return;
    }

    this.updateClosingState();
  }

  /** Close only the local write side and keep receiving until remote FIN. */
  async closeWrite(): Promise<void> {
    if (this.isClosed() || this.state === UtpConnState.Reset) return;
    if (this.#localFinPacket) {
      await this.flush();
      return;
    }
    if (!this.canWrite()) {
      throw new Error(
        `Connection is not writable in ${UtpConnState[this.state]}`,
      );
    }

    await this.flush();
    this.closeStartTime ??= performance.now();
    this.#localFinPacket = UtpPacket.createFinPacket(this);
    this.updateClosingState();
    await this.sendUtpPacket(this.#localFinPacket);
    await this.flush();
    await this.trySafeRelease();
  }

  /**
   * close the connection
   */
  async close(): Promise<void> {
    if (this.isClosed()) {
      this.logger.debug(`Connection ${this.tag} is already closed`);
      return;
    }

    if (this.state === UtpConnState.Reset) {
      this.logger.debug(`Connection ${this.tag} is already reset`);
      return;
    }

    if (
      this.state === UtpConnState.SynSent ||
      this.state === UtpConnState.SynReceived
    ) {
      this.forceClose();
      return;
    }

    try {
      await this.closeWrite();
    } catch (error) {
      this.forceClose();
      throw error;
    }
  }

  reset(): void {
    this.logger.debug(`Reset connection ${this.tag}`);
    this.utp.removeConnection(this);
    this.statistics.release();
    this.state = UtpConnState.Reset;
    this.recvPacketQueue.clear();
    this.#remoteFinPacket = undefined;
    this.sendWindow.reset(
      new UtpDeliveryError(
        "Connection reset before pending data was delivered",
      ),
    );
    this.sendUtpPacket(UtpPacket.createResetPacket(this));
  }

  /**
   * send utp packet to remote address
   * @param outgoingPacket
   * @returns
   */
  async sendUtpPacket(outgoingPacket: UtpPacket): Promise<number> {
    this.lastLiveTime = performance.now();
    this.logger.debug(
      "=======> Send utp packet to remote address",
      this.remoteAddr,
    );
    this.logger.debug(outgoingPacket.toString());

    // 检查连接状态，如果已关闭则抛出异常
    if (this.isClosed()) {
      throw new Error(`Cannot send packet on closed connection ${this.tag}`);
    }

    // sendWindow只有在连接建立后才会启用
    // 优先将数据包放入发送窗口后,再发送数据包
    // 只将ST_DATA和ST_FIN包放入发送窗口,其他包不放入发送窗口
    if (
      [UtpPacketType.ST_DATA, UtpPacketType.ST_FIN].includes(
        outgoingPacket.type,
      )
    ) {
      await this.sendWindow.waitForAck({
        packet: outgoingPacket,
        remoteAddr: this.remoteAddr,
      });
    }

    // 发送数据包
    return await this.utp.sendUtpPacket(outgoingPacket, this.remoteAddr);
  }

  isConnected(): boolean {
    return [UtpConnState.Connected, UtpConnState.FinReceived].includes(
      this.state,
    );
  }

  isClosed(): boolean {
    return this.state === UtpConnState.Closed;
  }

  private canWrite(): boolean {
    return [UtpConnState.Connected, UtpConnState.FinReceived].includes(
      this.state,
    );
  }

  private updateClosingState(): void {
    if (this.isClosed() || this.state === UtpConnState.Reset) return;
    if (this.#localFinPacket && this.#remoteFinPacket) {
      this.state = UtpConnState.Closing;
    } else if (this.#localFinPacket) {
      this.state = UtpConnState.FinSent;
    } else if (this.#remoteFinPacket) {
      this.state = UtpConnState.FinReceived;
    }
  }

  private forceClose(): void {
    this.logger.debug(`Force closing connection ${this.tag}`);
    if (!this.sendWindow.isEmpty()) {
      this.sendWindow.abort(
        new UtpDeliveryError(
          "Connection closed before pending data was delivered",
        ),
      );
    }
    // drain() 而非 close()：保留缓冲区内尚未读取的数据，让应用层可以继续读取；
    // 缓冲区耗尽后 read() 自动返回 null（EOF）。
    this.recvBuffer.drain();
    this.utp.removeConnection(this);
    this.statistics.release();
    this.state = UtpConnState.Closed;
  }
}
