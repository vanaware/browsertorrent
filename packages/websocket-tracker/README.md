# @vanaware/browsertorrent-tracker

A high-performance, zero-dependency WebSocket and HTTP BitTorrent tracker written in pure Deno TypeScript, built specifically for WebTorrent, BrowserTorrent, and WebRTC peer swarms.

Published on JSR as [`@vanaware/browsertorrent-tracker`](https://jsr.io/@vanaware/browsertorrent-tracker).

---

## 🚀 Features

- **WebTorrent & WebRTC Signaling**: Full compliance with the `bittorrent-tracker` WebSocket protocol (`announce`, `scrape`, offer exchange, answer forwarding).
- **Embedded WebRTC Offer Pools**: Facilitates direct browser-to-browser P2P WebRTC DataChannel connections.
- **Dual WebSocket & HTTP Endpoints**: Supports both `ws://` / `wss://` WebSocket signaling and standard `/announce` and `/scrape` HTTP queries.
- **LRU Swarm Management**: Automatic eviction and memory limits for large swarms.
- **Zero External Runtime Dependencies**: Powered entirely by Deno native APIs (`Deno.serve`, `WebSocket`).
- **Deploy Anywhere**: Runs instantly on Deno Deploy, Docker, VPS, Fly.io, Railway, or AWS.

---

## 📦 Installation & Usage

### 1. Run Directly via JSR CLI

You can start a tracking server instantly without cloning:

```bash
deno run --allow-net --allow-env jsr:@vanaware/browsertorrent-tracker/cli --port 8000 --host 0.0.0.0
```

Or install it globally as a CLI tool:

```bash
deno install -g -A -n bt-tracker jsr:@vanaware/browsertorrent-tracker/cli
bt-tracker --port 8000
```

---

### 2. Programmatic Usage in Deno Server

```typescript
import { createServer, WebSocketTracker } from "jsr:@vanaware/browsertorrent-tracker";

const tracker = createServer(8000, {
  hostname: "0.0.0.0",
  maxPeers: 5000,
  maxPeersPerTorrent: 50,
  maxTorrents: 1000,
  intervalMs: 120_000,
});

// Start listening
await tracker.start();
```

---

## 🛠️ CLI Options & Environment Variables

| Flag | Env Variable | Default | Description |
| --- | --- | --- | --- |
| `-p, --port` | `PORT` | `8000` | Port to listen on |
| `-H, --host` | `HOSTNAME` | `0.0.0.0` | Hostname or IP to bind |
| `--max-peers` | `MAX_PEERS` | `1000` | Global maximum connected peers |
| `--max-peers-per-torrent` | `MAX_PEERS_PER_TORRENT` | `50` | Maximum peers returned per swarm |
| `--max-torrents` | `MAX_TORRENTS` | `100` | Maximum distinct info-hashes tracked |
| `-h, --help` | — | — | Show help message |

---

## 📡 Endpoints

- **WebSocket Signaling**: `ws://<host>:<port>/` or `wss://<host>:<port>/`
- **HTTP Announce**: `http://<host>:<port>/announce?info_hash=...&peer_id=...`
- **HTTP Scrape**: `http://<host>:<port>/scrape?info_hash=...`
- **Health / Stats**: `http://<host>:<port>/stats`

---

## 📄 License

MIT
