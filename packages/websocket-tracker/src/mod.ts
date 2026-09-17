/**
 * WebSocket Tracker - Simple tracker for BrowserTorrent
 * Optimized for small servers with minimal dependencies
 */

import { WebSocketTracker } from "./server.ts";
import { TrackerRouter } from "./router.ts";
import { PeerConnectionManager } from "./peer.ts";
import { SwarmManager } from "./swarm.ts";
import { LRUCache } from "./lru.ts";
import { StatsManager } from "./stats.ts";
import { parseWebSocketMessage } from "./parse-websocket.ts";

export { WebSocketTracker };
export { TrackerRouter };
export { PeerConnectionManager };
export { SwarmManager };
export { LRUCache };
export { StatsManager };
export { parseWebSocketMessage };

/**
 * Create a new WebSocket tracker instance.
 * @param port - Port to listen on (default: 8000)
 * @param options - Tracker configuration options
 * @returns WebSocketTracker instance
 */
export function createServer(port: number = 8000, options?: Partial<WebSocketTrackerOptions>): WebSocketTracker {
  return new WebSocketTracker(port, options);
}

/**
 * Default tracker options.
 */
export interface WebSocketTrackerOptions {
  hostname?: string;
  idleTimeout?: number;
  maxPeers?: number;
  maxPeersPerTorrent?: number;
  maxTorrents?: number;
  intervalMs?: number;
}

const defaultOptions: WebSocketTrackerOptions = {
  hostname: "0.0.0.0",
  idleTimeout: 300000, // 5 minutes
  maxPeers: 1000,
  maxPeersPerTorrent: 50,
  maxTorrents: 100,
  intervalMs: 120000,
};

export { defaultOptions };

/**
 * Simple CLI for running the WebSocket tracker.
 */
export async function runCLI() {
  const port = Number(Deno.env.get("PORT") || "8000");
  const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";

  console.log("[TRACKER] Starting WebSocket tracker on", hostname, "port", port);

  const tracker = createServer(port, {
    hostname,
    maxPeers: Number(Deno.env.get("MAX_PEERS") || "1000"),
    maxPeersPerTorrent: Number(Deno.env.get("MAX_PEERS_PER_TORRENT") || "50"),
    maxTorrents: Number(Deno.env.get("MAX_TORRENTS") || "100"),
    intervalMs: Number(Deno.env.get("INTERVAL_MS") || "120000"),
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("[TRACKER] Shutting down...")
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