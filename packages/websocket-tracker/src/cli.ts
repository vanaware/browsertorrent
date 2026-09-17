#!/usr/bin/env deno run --allow-net --allow-env --allow-read --allow-write

/**
 * CLI for WebSocket Tracker.
 * Run with: deno run --allow-all src/cli.ts [options]
 */

import { createServer, WebSocketTracker, } from "./mod.ts";

interface CLIOptions {
  port: number;
  hostname: string;
  maxPeers: number;
  maxPeersPerTorrent: number;
  maxTorrents: number;
}

function parseArgs(): CLIOptions {
  const args = Deno.args;

  const options: CLIOptions = {
    port: Number(Deno.env.get("PORT",) || "8000",),
    hostname: Deno.env.get("HOSTNAME",) || "0.0.0.0",
    maxPeers: Number(Deno.env.get("MAX_PEERS",) || "1000",),
    maxPeersPerTorrent: Number(Deno.env.get("MAX_PEERS_PER_TORRENT",) || "50",),
    maxTorrents: Number(Deno.env.get("MAX_TORRENTS",) || "100",),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--port":
      case "-p":
        options.port = Number(args[++i],);
        break;
      case "--host":
      case "-H": {
        const hostArg = args[++i];
        if (hostArg) options.hostname = hostArg;
        break;
      }
      case "--max-peers":
        options.maxPeers = Number(args[++i],);
        break;
      case "--max-peers-per-torrent":
        options.maxPeersPerTorrent = Number(args[++i],);
        break;
      case "--max-torrents":
        options.maxTorrents = Number(args[++i],);
        break;
      case "--help":
      case "-h":
        printHelp();
        Deno.exit(0,);
        break;
      default:
        console.warn("Unknown option:", args[i],);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
WebSocket Tracker - Simple tracker for BrowserTorrent

Usage: deno run --allow-all src/cli.ts [options]

Options:
  -p, --port <port>            Port to listen on (default: 8000)
  -H, --host <hostname>        Hostname to bind (default: 0.0.0.0)
  --max-peers <number>         Maximum peers (default: 1000)
  --max-peers-per-torrent <n>  Maximum peers per torrent (default: 50)
  --max-torrents <number>      Maximum torrents (default: 100)
  -h, --help                   Show this help message

Environment Variables:
  PORT                         Port to listen on
  HOSTNAME                     Hostname to bind
  MAX_PEERS                    Maximum peers
  MAX_PEERS_PER_TORRENT        Maximum peers per torrent
  MAX_TORRENTS                 Maximum torrents

Example:
  deno run --allow-all src/cli.ts --port 8000 --host 0.0.0.0
`,);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log("[TRACKER] Starting WebSocket tracker",);
  console.log("[TRACKER] Host:", options.hostname,);
  console.log("[TRACKER] Port:", options.port,);
  console.log("[TRACKER] Max peers:", options.maxPeers,);
  console.log("[TRACKER] Max peers per torrent:", options.maxPeersPerTorrent,);
  console.log("[TRACKER] Max torrents:", options.maxTorrents,);

  const tracker = createServer(options.port, {
    hostname: options.hostname,
    maxPeers: options.maxPeers,
    maxPeersPerTorrent: options.maxPeersPerTorrent,
    maxTorrents: options.maxTorrents,
  },);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("[TRACKER] Shutting down...",);
    tracker.close();
    Deno.exit(0,);
  };

  Deno.addSignalListener("SIGINT", shutdown,);
  Deno.addSignalListener("SIGTERM", shutdown,);

  // Keep the process running
  await new Promise(() => {},);
}

main().catch((error,) => {
  console.error("[TRACKER] Failed to start:", error,);
  Deno.exit(1,);
},);
