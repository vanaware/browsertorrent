/** A lightweight logger owned by one endpoint context. */
export class Logger {
  #debugEnabled: boolean;

  constructor(readonly tag = "", debugEnabled = false) {
    this.#debugEnabled = debugEnabled;
  }

  get debugEnabled(): boolean {
    return this.#debugEnabled;
  }

  /**
   * 启用日志
   */
  enable(): void {
    this.#debugEnabled = true;
  }

  /**
   * 禁用日志
   */
  disable(): void {
    this.#debugEnabled = false;
  }

  /**
   * 获取带颜色的TAG标识
   */
  private getTagPrefix(): string {
    if (!this.tag) return "";
    // 使用不同的颜色来区分不同的TAG
    const tagColor = "\x1b[35m"; // 紫色
    return `[${tagColor}${this.tag}\x1b[0m]`;
  }

  /**
   * 格式化时间
   */
  private formatTime(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    return `${year}-${month}-${day} ${hour}:${
      minute.toString().padStart(2, "0")
    }:${
      second
        .toString()
        .padStart(2, "0")
    }`;
  }

  /**
   * 调试日志
   */
  debug(message?: unknown, ...optionalParams: unknown[]): void {
    if (!this.#debugEnabled) return;

    const time = this.formatTime();
    const formattedTime = `\x1b[36m${time}\x1b[0m`;
    const formattedMessage =
      `[${formattedTime}] ${this.getTagPrefix()} ${message}`;

    console.log(formattedMessage, ...optionalParams);
  }

  /**
   * 错误日志
   */
  error(message?: unknown, ...optionalParams: unknown[]): void {
    const time = this.formatTime();
    const formattedTime = `\x1b[31m${time}\x1b[0m`;
    const formattedMessage =
      `[${formattedTime}] ${this.getTagPrefix()} ${message}`;

    console.error(formattedMessage, ...optionalParams);
  }

  /**
   * 信息日志
   */
  info(message?: unknown, ...optionalParams: unknown[]): void {
    const time = this.formatTime();
    const formattedTime = `\x1b[32m${time}\x1b[0m`;
    const formattedMessage =
      `[${formattedTime}] ${this.getTagPrefix()} ${message}`;

    console.info(formattedMessage, ...optionalParams);
  }
}
