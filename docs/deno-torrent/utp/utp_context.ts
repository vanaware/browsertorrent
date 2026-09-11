// src/utp_context.ts
import { Logger } from "./logger.ts";

/** Owns loggers and debug state for one uTP endpoint. */
export class UtpContext {
  #debugEnabled = false;
  readonly #loggers = new Map<string, Logger>();

  constructor(readonly endpointTag = "") {}

  getLogger(moduleType: string): Logger {
    const key = `${this.endpointTag}:${moduleType}`;
    let logger = this.#loggers.get(key);
    if (!logger) {
      logger = new Logger(key, this.#debugEnabled);
      this.#loggers.set(key, logger);
    }
    return logger;
  }

  get debugEnabled(): boolean {
    return this.#debugEnabled;
  }

  setDebug(enabled: boolean): void {
    this.#debugEnabled = enabled;
    for (const logger of this.#loggers.values()) {
      if (enabled) {
        logger.enable();
      } else {
        logger.disable();
      }
    }
  }
}
