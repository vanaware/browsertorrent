/**
 * Statistics manager for WebSocket tracker.
 * Tracks server metrics and provides endpoints for monitoring.
 */

export interface TrackerStats {
  totalPeers: number;
  totalTorrents: number;
  connections: number;
  messages: number;
  completed: number;
  downloaded: number;
  uptime: number;
  startTime: number;
}

export interface ServerHealth {
  status: "healthy" | "degraded" | "unhealthy";
  totalPeers: number;
  totalTorrents: number;
  memoryUsage: number;
  uptime: number;
}

/**
 * Manages tracker statistics and health metrics.
 */
export class StatsManager {
  private connections: number;
  private messages: number;
  private completed: number;
  private downloaded: number;
  private startTime: number;
  private readonly maxMemoryMB: number;

  constructor(maxMemoryMB: number = 512,) {
    this.connections = 0;
    this.messages = 0;
    this.completed = 0;
    this.downloaded = 0;
    this.startTime = Date.now();
    this.maxMemoryMB = maxMemoryMB;
  }

  /**
   * Increment connection count.
   */
  incrementConnections(): void {
    this.connections++;
  }

  /**
   * Decrement connection count.
   */
  decrementConnections(): void {
    if (this.connections > 0) {
      this.connections--;
    }
  }

  /**
   * Increment message count.
   */
  incrementMessages(): void {
    this.messages++;
  }

  /**
   * Increment completed downloads.
   */
  incrementCompleted(): void {
    this.completed++;
  }

  /**
   * Increment downloaded bytes.
   */
  addDownloaded(bytes: number,): void {
    this.downloaded += bytes;
  }

  /**
   * Get current statistics.
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
   * Get server health status.
   */
  getHealth(totalPeers: number, totalTorrents: number,): ServerHealth {
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
   * Get memory usage in MB.
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
   * Get uptime in seconds.
   */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000,);
  }

  /**
   * Get formatted uptime string.
   */
  getFormattedUptime(): string {
    const seconds = this.getUptimeSeconds();
    const hours = Math.floor(seconds / 3600,);
    const minutes = Math.floor((seconds % 3600) / 60,);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, "0",)}:${
      minutes.toString().padStart(2, "0",)
    }:${secs.toString().padStart(2, "0",)}`;
  }

  /**
   * Increment peers count.
   */
  incrementPeers(): void {
    this.connections++;
  }

  /**
   * Decrement peers count.
   */
  decrementPeers(): void {
    if (this.connections > 0) {
      this.connections--;
    }
  }

  /**
   * Get downloaded bytes.
   */
  getDownloaded(): number {
    return this.downloaded;
  }

  /**
   * Get connections count.
   */
  getConnections(): number {
    return this.connections;
  }

  /**
   * Get messages count.
   */
  getMessages(): number {
    return this.messages;
  }

  /**
   * Get completed count.
   */
  getCompleted(): number {
    return this.completed;
  }

  /**
   * Reset all statistics.
   */
  reset(): void {
    this.connections = 0;
    this.messages = 0;
    this.completed = 0;
    this.downloaded = 0;
    this.startTime = Date.now();
  }
}
