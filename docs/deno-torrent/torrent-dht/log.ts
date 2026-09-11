/**
 * 轻量级日志记录器
 *
 * 封装 console 方法，提供统一的日志格式，无外部依赖。
 * 支持 DEBUG / INFO / WARN / ERROR 四个级别。
 */

/** 日志级别枚举（数值越大优先级越高） */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const

/** 日志级别类型 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

/**
 * 轻量级日志记录器类
 */
class Logger {
  readonly #name: string
  #level: LogLevel

  /**
   * Create a logger.
   *
   * @param name  日志来源名称，将显示在每条日志前缀中
   * @param level 最低输出级别，默认为 INFO
   */
  constructor(name: string, level: LogLevel = 'INFO') {
    this.#name = name
    this.#level = level
  }

  /** 动态设置最低日志级别 */
  setLevel(level: LogLevel): void {
    this.#level = level
  }

  /** 判断给定级别是否应输出 */
  #shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.#level]
  }

  /** 格式化日志前缀 */
  #prefix(level: LogLevel): string {
    return `${new Date().toISOString()} [${level.padEnd(5)}] [${this.#name}]`
  }

  /**
   * 输出 DEBUG 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  debug(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('DEBUG')) {
      console.debug(this.#prefix('DEBUG'), msg, ...args)
    }
  }

  /**
   * 输出 INFO 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  info(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('INFO')) {
      console.info(this.#prefix('INFO'), msg, ...args)
    }
  }

  /**
   * 输出 WARN 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  warn(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('WARN')) {
      console.warn(this.#prefix('WARN'), msg, ...args)
    }
  }

  /**
   * 输出 ERROR 级别日志
   * @param msg  日志消息
   * @param args 附加参数
   */
  error(msg: string, ...args: unknown[]): void {
    if (this.#shouldLog('ERROR')) {
      console.error(this.#prefix('ERROR'), msg, ...args)
    }
  }
}

/** 全局默认日志记录器实例 */
const logger = new Logger('torrent-dht')

export { Logger }
export default logger
