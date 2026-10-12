# @vanaware/browsertorrent-tracker

[![JSR](https://jsr.io/badges/@vanaware/browsertorrent-tracker)](https://jsr.io/@vanaware/browsertorrent-tracker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A high-performance, zero-dependency WebSocket and HTTP BitTorrent tracker implemented in pure Deno TypeScript.

Specifically designed for **WebTorrent**, **BrowserTorrent**, and **WebRTC** peer swarms. Provides full protocol parity with the standard `bittorrent-tracker` specification, including SDP offer pool distribution and SDP answer forwarding for browser-to-browser P2P connectivity.

---

## 🚀 Features

- **Full WebRTC Signaling**: Manages SDP offer pools and forwards WebRTC SDP answers between browser peers.
- **100% WebTorrent Protocol Compatibility**: Fully interoperable with standard WebTorrent clients and trackers (`ws://` and `wss://`).
- **Dual WebSocket & HTTP Endpoints**: Serves real-time WebSocket signaling at `/` alongside standard HTTP `/announce` and `/scrape` query endpoints.
- **LRU Swarm & Peer Eviction**: High concurrency support with bounded memory limits and automatic stale connection eviction.
- **Built-in Telemetry & Health Monitoring**: Dedicated `/stats` endpoint reporting uptime, active swarms, peer counts, and memory pressure.
- **Zero External Runtime Dependencies**: Built entirely on native Deno APIs (`Deno.serve`, `WebSocket`).
- **Run Anywhere**: Deploys instantly to Deno Deploy, Docker, Fly.io, Railway, AWS, or local VPS.

---

## 📦 Installation & Usage

### 1. Run Directly via JSR CLI (Zero-Install Daemon)

Start a tracker daemon instantly from your terminal without cloning or installing dependencies:

```bash
deno run --allow-net --allow-env jsr:@vanaware/browsertorrent-tracker/cli --port 8000 --host 0.0.0.0
```

Or install it globally as a CLI tool:

```bash
deno install -g -A -n bt-tracker jsr:@vanaware/browsertorrent-tracker/cli
bt-tracker --port 8000
```

---

### 2. Programmatic Usage in Deno Applications

Add the package from JSR:

```bash
deno add jsr:@vanaware/browsertorrent-tracker
```

Start the tracker in your code:

```typescript
import {
  createServer,
  WebSocketTracker,
} from "jsr:@vanaware/browsertorrent-tracker";

// Create tracker instance with custom options
const tracker = createServer(8000, {
  hostname: "0.0.0.0",
  maxPeers: 5000, // Max peers across all swarms
  maxPeersPerTorrent: 50, // Max peers returned in announce responses
  maxTorrents: 1000, // Max distinct info hashes kept in LRU cache
  intervalMs: 120_000, // Client re-announce interval (2 minutes)
},);

// Start listening (resolves when server is closed)
await tracker.start();
```

---

### 3. Custom Router Integration (`TrackerRouter`)

If you want to mount the tracker into an existing `Deno.serve` application:

```typescript
import {
  TrackerRouter,
  WebSocketTracker,
} from "jsr:@vanaware/browsertorrent-tracker";

const tracker = new WebSocketTracker(8000,);
const router = new TrackerRouter(tracker,);

Deno.serve({ port: 8000, }, (req: Request,) => {
  const url = new URL(req.url,);

  // Health check endpoint
  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", },), {
      headers: { "Content-Type": "application/json", },
    },);
  }

  // Forward all tracker traffic (WebSocket upgrades, /announce, /scrape)
  return router.handleRequest(req,);
},);
```

---

## 🛠️ CLI Flags & Environment Variables

| Flag                      | Environment Variable    | Default   | Description                                       |
| :------------------------ | :---------------------- | :-------- | :------------------------------------------------ |
| `-p, --port`              | `PORT`                  | `8000`    | Port to listen on                                 |
| `-H, --host`              | `HOSTNAME`              | `0.0.0.0` | Hostname or IP to bind                            |
| `--max-peers`             | `MAX_PEERS`             | `1000`    | Global maximum connected peers before eviction    |
| `--max-peers-per-torrent` | `MAX_PEERS_PER_TORRENT` | `50`      | Maximum peer addresses returned per announcement  |
| `--max-torrents`          | `MAX_TORRENTS`          | `100`     | Maximum distinct info hashes tracked in LRU cache |
| `-h, --help`              | —                       | —         | Show help message and exit                        |

---

## 🗂️ Subpath Exports

`@vanaware/browsertorrent-tracker` exposes granular subpath exports for specialized workflows:

| Subpath                                                | Description                                                                       |
| :----------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `jsr:@vanaware/browsertorrent-tracker`                 | Main entry point: `createServer`, `WebSocketTracker`, `TrackerRouter`, and types. |
| `jsr:@vanaware/browsertorrent-tracker/cli`             | Command-line daemon entry point with argument parsing and signal handling.        |
| `jsr:@vanaware/browsertorrent-tracker/server`          | Low-level `WebSocketTracker` server class and configuration options.              |
| `jsr:@vanaware/browsertorrent-tracker/router`          | HTTP and WebSocket request router (`TrackerRouter`, `ITracker`).                  |
| `jsr:@vanaware/browsertorrent-tracker/peer`            | Peer connection manager (`PeerConnectionManager`, `PeerInfo`).                    |
| `jsr:@vanaware/browsertorrent-tracker/swarm`           | Swarm manager and peer discovery coordinator (`SwarmManager`).                    |
| `jsr:@vanaware/browsertorrent-tracker/stats`           | Telemetry and health metrics manager (`StatsManager`, `TrackerStats`).            |
| `jsr:@vanaware/browsertorrent-tracker/lru`             | High-speed bounded LRU cache implementation (`LRUCache`).                         |
| `jsr:@vanaware/browsertorrent-tracker/parse-websocket` | Message parser and response formatter for BEP 15/31 protocol.                     |

---

## 📡 WebRTC Signaling Protocol Flow

In WebRTC BitTorrent swarms, browsers cannot accept incoming TCP/UDP connections. Instead, the tracker acts as a signaling channel:

1. **Leecher Announce**: A browser announces to `wss://tracker.example.com` with `action: "announce"`, its `peer_id`, `info_hash`, and a pool of WebRTC SDP `offers`.
2. **Offer Pool**: The tracker stores these offers and pairs them with other peers announcing for the same `info_hash`.
3. **Offer Delivery**: When a second peer announces, the tracker returns one of the first peer's offers with the first peer's `peer_id`.
4. **Answer Forwarding**: The second peer generates an SDP `answer` and sends it back to the tracker with `to_peer_id`.
5. **Direct P2P**: The tracker forwards the answer to the first peer. Both browsers establish a direct WebRTC DataChannel connection and begin exchanging pieces via BEP 3 wire protocol.

---

## 📊 Endpoints & Telemetry

- **WebSocket Signaling**: `ws://<host>:<port>/` or `wss://<host>:<port>/`
- **HTTP Announce**: `http://<host>:<port>/announce?info_hash=...&peer_id=...&port=6881`
- **HTTP Scrape**: `http://<host>:<port>/scrape?info_hash=...`
- **Health & Telemetry**: `http://<host>:<port>/stats`

### Sample `/stats` Output:

```json
{
  "totalPeers": 142,
  "totalTorrents": 18,
  "connections": 142,
  "messages": 12450,
  "completed": 35,
  "downloaded": 1048576000,
  "uptime": 86400000,
  "uptimeFormatted": "24:00:00",
  "memoryUsageMB": 42.5,
  "status": "healthy"
}
```

---

## 🧪 Testing

```bash
# Run tracker test suite
deno test -A packages/websocket-tracker/tests/

# Verify type-checking
deno check packages/websocket-tracker/src/mod.ts

# Dry-run JSR publishing verification
deno publish --dry-run --config packages/websocket-tracker/deno.jsonc
```

---

## 📄 License

MIT © [Vanaware](https://github.com/vanaware)
