import type { UtpPacketWithExtraInfo } from "@src/utp_send_window.ts";
import type { Logger } from "@src/logger.ts";
import { UtpContext } from "@src/utp_context.ts";

/**
 * 网络延迟监控器
 * 用于估计网络质量，计算重传超时时间
 */
export class UtpRttTracker {
  readonly #minimumRtoMs = 1000;
  readonly #maximumRttMs = 6000;
  #rtt: number; // round trip time 往返时间
  #baseDelay: number; // 连接建立后观测到的最小RTT，作为延迟的基准
  #rttVar: number; // round trip time variance 往返时间方差
  #rto: number; // retransmission timeout 重传超时时间
  logger: Logger;

  constructor(context: UtpContext = new UtpContext()) {
    this.#rtt = 0;
    this.#rttVar = 0;
    this.#baseDelay = 0;
    this.#rto = this.#minimumRtoMs;
    this.logger = context.getLogger("RTT_TRACKER");
  }

  // 获取RTT和RTT_VAR的方法
  get rtt(): number {
    return this.#rtt;
  }

  get rttVar(): number {
    return this.#rttVar;
  }

  /**
   * 更新网络质量信息
   * @param packetWithExtraInfo
   */
  update(packetWithExtraInfo: UtpPacketWithExtraInfo): void {
    try {
      const now = Date.now();
      // 估计往返时间 estimated round trip time
      // Date.now() 分辨率为 1ms，loopback 实际 RTT < 1ms 时会得到 0，至少取 1ms
      const ertt = Math.max(now - packetWithExtraInfo.sentTime, 1);
      if (this.#rtt === 0) {
        // 第一个往返时间样本
        this.#rtt = ertt;
        this.#rttVar = ertt / 2;
        // 合理性检查。RTT不应超过6秒
        this.sanityCheckRtt();
      } else {
        // 计算新的往返时间
        const delta = this.#rtt - ertt;
        this.#rttVar += (Math.abs(delta) - this.#rttVar) / 4;
        this.#rtt = (this.#rtt * 7) / 8 + ertt / 8;
        // 合理性检查。RTT不应超过6秒
        this.sanityCheckRtt();
      }

      // 更新最小RTT
      if (this.#baseDelay === 0 || this.#rtt < this.#baseDelay) {
        this.#baseDelay = this.#rtt;
      }

      // 重传超时时间 = RTT + 4 * RTT_VAR
      // 为了避免过小的超时时间，设置最小超时时间为1s
      this.#rto = Math.max(
        this.#rtt + this.#rttVar * 4,
        this.#minimumRtoMs,
      );

      this.logger.debug(
        "rtt:",
        this.#rtt,
        "rttVar:",
        this.#rttVar,
        "rto:",
        this.#rto,
      );
    } catch (error) {
      this.logger.debug("update rtt error:", error);
    }
  }

  /**
   * 合理性检查。RTT不应超过6秒
   */
  private sanityCheckRtt(): void {
    if (this.#rtt >= this.#maximumRttMs) {
      throw new Error("RTT sanity check failed");
    }
  }

  get rto(): number {
    return this.#rto;
  }
}
