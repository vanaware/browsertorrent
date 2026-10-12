/**
 * @file stats.ts
 * @description Telemetry and health metrics manager for the WebSocket tracker server.
 * Tracks connected clients, bandwidth volume, message counters, and heap memory usage.
 */

/**
 * Aggregated server-level metrics and runtime statistics.
 */
export interface TrackerStats {
  /** Total number of peers currently connected or announced. */
  totalPeers: number;
  /** Total number of distinct torrent swarms currently being tracked. */
  totalTorrents: number;
  /** Count of currently open network connections. */
  connections: number;
  /** Cumulative count of all WebSocket messages processed. */
  messages: number;
  /** Total completed download events reported by clients. */
  completed: number;
  /** Cumulative bytes downloaded across all swarms. */
  downloaded: number;
  /** Uptime of the tracker in milliseconds. */
  uptime: number;
  /** Epoch timestamp in milliseconds when the tracker process was started. */
  startTime: number;
}

/**
 * Health assessment of the tracker server including memory pressure indicators.
 */
export interface ServerHealth {
  /** Overall server health categorization: "healthy", "degraded", or "unhealthy". */
  status: "healthy" | "degraded" | "unhealthy";
  /** Current peer count across all swarms. */
  totalPeers: number;
  /** Current active swarms count. */
  totalTorrents: number;
  /** Estimated JavaScript heap memory usage in Megabytes. */
  memoryUsage: number;
  /** Server uptime in milliseconds. */
  uptime: number;
}

/**
 * Manages tracking server metrics, transfer counters, and health status.
 *
 * @example
 * ```ts
 * import { StatsManager } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const stats = new StatsManager(512);
 * stats.incrementConnections();
 * stats.addDownloaded(1024 * 1024);
 * console.log("Uptime:", stats.getFormattedUptime());
 * console.log("Stats:", stats.getStats());
 * ```
 */
export class StatsManager {
  private connections: number;
  private messages: number;
  private completed: number;
  private downloaded: number;
  private startTime: number;
  private readonly maxMemoryMB: number;

  /**
   * Constructs a new StatsManager.
   *
   * @param maxMemoryMB - Target memory ceiling in Megabytes used to compute degraded/unhealthy status (defaults to 512).
   */
  constructor(maxMemoryMB: number = 512) {
    this.connections = 0;
    this.messages = 0;
    this.completed = 0;
    this.downloaded = 0;
    this.startTime = Date.now();
    this.maxMemoryMB = maxMemoryMB;
  }

  /**
   * Increments the open connection count.
   */
  incrementConnections(): void {
    this.connections++;
  }

  /**
   * Decrements the open connection count (bounded at 0).
   */
  decrementConnections(): void {
    if (this.connections > 0) {
      this.connections--;
    }
  }

  /**
   * Increments the count of total incoming messages processed.
   */
  incrementMessages(): void {
    this.messages++;
  }

  /**
   * Increments the count of finished downloads.
   */
  incrementCompleted(): void {
    this.completed++;
  }

  /**
   * Adds transferred bytes to the cumulative downloaded total.
   *
   * @param bytes - Number of downloaded bytes to add.
   */
  addDownloaded(bytes: number): void {
    this.downloaded += bytes;
  }

  /**
   * Computes and returns a current snapshot of tracker statistics.
   *
   * @returns Current {@link TrackerStats} object.
   */
  getStats(): TrackerStats {
    return {
      totalPeers: this.connections,
      totalTorrents: 0, // Will be populated by caller
      connections: this.connections,
      messages: this.messages,
      completed: this.completed,
      downloaded: this.downloaded,
      uptime: Date.now() - this.startTime,
      startTime: this.startTime,
    };
  }

  /**
   * Evaluates memory and swarm conditions to determine server health.
   *
   * @param totalPeers - Current total active peers.
   * @param totalTorrents - Current total active swarms.
   * @returns A {@link ServerHealth} evaluation report.
   */
  getHealth(totalPeers: number, totalTorrents: number): ServerHealth {
    const memoryUsage = this.getMemoryUsage();

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (memoryUsage > this.maxMemoryMB * 0.9) {
      status = "unhealthy";
    } else if (memoryUsage > this.maxMemoryMB * 0.7) {
      status = "degraded";
    }

    return {
      status,
      totalPeers,
      totalTorrents,
      memoryUsage,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Internal memory reader from performance.memory API when available.
   */
  private getMemoryUsage(): number {
    if (typeof performance !== "undefined") {
      const mem =
        (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory;
      if (mem) {
        return mem.usedJSHeapSize / (1024 * 1024);
      }
    }
    return 0;
  }

  /**
   * Returns uptime in whole seconds.
   *
   * @returns Total elapsed seconds since server started.
   */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Returns a human-friendly uptime string formatted as `HH:MM:SS`.
   *
   * @returns Formatted uptime string.
   */
  getFormattedUptime(): string {
    const seconds = this.getUptimeSeconds();
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, "0")}:${
      minutes.toString().padStart(2, "0")
    }:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Alias for incrementConnections, increments active peer count.
   */
  incrementPeers(): void {
    this.connections++;
  }

  /**
   * Alias for decrementConnections, decrements active peer count.
   */
  decrementPeers(): void {
    if (this.connections > 0) {
      this.connections--;
    }
  }

  /**
   * Returns cumulative bytes downloaded.
   *
   * @returns Total bytes downloaded.
   */
  getDownloaded(): number {
    return this.downloaded;
  }

  /**
   * Returns current active connections count.
   *
   * @returns Number of connections.
   */
  getConnections(): number {
    return this.connections;
  }

  /**
   * Returns cumulative messages processed.
   *
   * @returns Total message count.
   */
  getMessages(): number {
    return this.messages;
  }

  /**
   * Returns total completed downloads.
   *
   * @returns Completed count.
   */
  getCompleted(): number {
    return this.completed;
  }

  /**
   * Resets all metrics and counters to initial zero state.
   */
  reset(): void {
    this.connections = 0;
    this.messages = 0;
    this.completed = 0;
    this.downloaded = 0;
    this.startTime = Date.now();
  }
}
