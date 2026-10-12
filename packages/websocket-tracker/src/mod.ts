/**
 * @file mod.ts
 * @description Primary entry point for `@vanaware/browsertorrent-tracker`.
 * A lightweight, high-performance WebSocket & HTTP BitTorrent tracker in pure Deno TypeScript
 * designed for WebTorrent & BrowserTorrent WebRTC peer swarms.
 *
 * @example
 * ```ts
 * import { createServer, WebSocketTracker } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const tracker = createServer(8000, {
 *   hostname: "0.0.0.0",
 *   maxTorrents: 500,
 * });
 *
 * await tracker.start();
 * ```
 */

import {
  defaultOptions,
  type Peer,
  type TorrentInfo,
  type TrackerMessage as ServerTrackerMessage,
  WebSocketTracker,
  type WebSocketTrackerOptions,
} from "./server.ts";
import { type ITracker, TrackerRouter } from "./router.ts";
import {
  type PeerConnection,
  PeerConnectionManager,
  type PeerInfo,
} from "./peer.ts";
import { type PeerAnnounce, type SwarmInfo, SwarmManager } from "./swarm.ts";
import { LRUCache } from "./lru.ts";
import { type ServerHealth, StatsManager, type TrackerStats } from "./stats.ts";
import {
  formatAnnounceResponse,
  formatErrorResponse,
  formatScrapeResponse,
  parseWebSocketMessage,
  type TrackerAnnounceRequest,
  type TrackerAnnounceResponse,
  type TrackerErrorResponse,
  type TrackerMessage,
  type TrackerResponse,
  type TrackerScrapeRequest,
  type TrackerScrapeResponse,
  validateTrackerMessage,
} from "./parse-websocket.ts";

export {
  defaultOptions,
  formatAnnounceResponse,
  formatErrorResponse,
  formatScrapeResponse,
  LRUCache,
  parseWebSocketMessage,
  PeerConnectionManager,
  StatsManager,
  SwarmManager,
  TrackerRouter,
  validateTrackerMessage,
  WebSocketTracker,
};

export type {
  ITracker,
  Peer,
  PeerAnnounce,
  PeerConnection,
  PeerInfo,
  ServerHealth,
  ServerTrackerMessage,
  SwarmInfo,
  TorrentInfo,
  TrackerAnnounceRequest,
  TrackerAnnounceResponse,
  TrackerErrorResponse,
  TrackerMessage,
  TrackerResponse,
  TrackerScrapeRequest,
  TrackerScrapeResponse,
  TrackerStats,
  WebSocketTrackerOptions,
};

/**
 * Creates a new instance of {@link WebSocketTracker}.
 *
 * @param port - Port to listen on (defaults to 8000).
 * @param options - Tracker configuration options.
 * @returns Initialized {@link WebSocketTracker} ready to call `start()`.
 *
 * @example
 * ```ts
 * import { createServer } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const tracker = createServer(8000, {
 *   hostname: "0.0.0.0",
 *   maxPeers: 1000,
 *   intervalMs: 60000,
 * });
 *
 * await tracker.start();
 * ```
 */
export function createServer(
  port: number = 8000,
  options?: Partial<WebSocketTrackerOptions>,
): WebSocketTracker {
  return new WebSocketTracker(port, options);
}

/**
 * Executes the command-line tracker daemon reading options from CLI arguments and environment variables.
 * Gracefully terminates on `SIGINT` and `SIGTERM`.
 *
 * @returns Promise that resolves when the daemon stops.
 *
 * @example
 * ```bash
 * deno run -A jsr:@vanaware/browsertorrent-tracker
 * ```
 */
export async function runCLI(): Promise<void> {
  const port = Number(Deno.env.get("PORT") || "8000");
  const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";

  console.log(
    "[TRACKER] Starting WebSocket tracker on",
    hostname,
    "port",
    port,
  );

  const tracker = createServer(port, {
    hostname,
    maxPeers: Number(Deno.env.get("MAX_PEERS") || "1000"),
    maxPeersPerTorrent: Number(Deno.env.get("MAX_PEERS_PER_TORRENT") || "50"),
    maxTorrents: Number(Deno.env.get("MAX_TORRENTS") || "100"),
    intervalMs: Number(Deno.env.get("INTERVAL_MS") || "120000"),
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("[TRACKER] Shutting down...");
    tracker.close();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  // Start listening (runs indefinitely until close() is called)
  await tracker.start();
}

// Auto-start if run directly
if (import.meta.main) {
  runCLI();
}
