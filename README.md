# BrowserTorrent

A modern, browser-native BitTorrent client, library, and PWA built in TypeScript with Deno, WebRTC, OPFS (Origin Private File System), and BeerCSS.

---

## 🚀 Overview

**BrowserTorrent** is a zero-dependency, browser-first BitTorrent client engineered to operate 100% within modern web browsers. It provides direct peer-to-peer data transfers over WebRTC DataChannels and communicates with both public WebTorrent WebSocket trackers and built-in Deno-based WebSocket trackers (`WsTracker`).

Available on JSR as [`@vanaware/browsertorrent`](https://jsr.io/@vanaware/browsertorrent).

---

## 📦 Quick Start

### 1. Deno (via JSR)

```bash
deno add jsr:@vanaware/browsertorrent
```

```typescript
import { Client } from "jsr:@vanaware/browsertorrent";

const client = new Client();

// Seed a file directly from the browser
const file = new File(["Hello WebRTC P2P!"], "hello.txt", { type: "text/plain" });
const torrent = await client.seed(file);

console.log("Seeding InfoHash:", torrent.infoHash);
console.log("Magnet URI:", torrent.magnetURI);
```

### 2. Browser / ESM

```typescript
import { Client } from "https://esm.sh/jsr/@vanaware/browsertorrent";

const client = new Client();
const torrent = await client.add("magnet:?xt=urn:btih:...");

torrent.on("download", (bytes) => {
  console.log(`Progress: ${(torrent.progress * 100).toFixed(1)}%`);
});
```

---

## 🧩 Modular Subpath Exports

| Module | Purpose |
| --- | --- |
| `@vanaware/browsertorrent` | Core client, torrent engine, swarm coordinator, bencode, and wire protocols. |
| `@vanaware/browsertorrent/service-worker` | Decoupled streaming fetch interceptor and registration helpers for P2P video/audio playback. |
| `@vanaware/browsertorrent/server` | In-browser HTTP server bridge for Service Worker streaming. |
| `@vanaware/browsertorrent/torrent-generator` | High-speed torrent metainfo generator over Origin Private File System (OPFS). |

---

## ✨ Key Features

- **Pure Deno & Web Standards**: Zero Node.js runtime dependencies; uses standard `Uint8Array`, `EventTarget`, and `ReadableStream`.
- **Decoupled Service Worker Streaming**: Real-time HTTP 206 Partial Content range requests streaming directly into HTML5 `<video>` and `<audio>` tags.
- **WebRTC P2P DataChannels**: Binary `ArrayBuffer` transport with automatic framing and backpressure management.
- **Full BitTorrent Wire Protocol**: Supports BEP 3 wire protocol, BEP 52 v2 Merkle hashing, BEP 6 fast extension, and BEP 10 extension protocol.
- **Metadata Exchange (`ut_metadata` / BEP 9)**: Piecewise metainfo retrieval for magnet links directly across WebRTC swarms.
- **Bi-directional WebRTC Signaling**: 100% interoperable with `bittorrent-tracker` WebSocket JSON specification and public trackers (`wss://tracker.webtorrent.dev`).
- **OPFS & In-Memory Storage**: High-performance persistence via `FileSystemSyncAccessHandle` in dedicated workers.
- **Responsive UI**: Built with `@preact/signals` and BeerCSS (Material Design 3).

---

## 🧪 Testing & Verification

BrowserTorrent includes a comprehensive test suite of **700+ unit, integration, and E2E tests**:

```bash
# Run full unit and integration test suite
deno task test

# Run build orchestrator (esbuild + Deno.bundle)
deno task build

# Run linting and type checks
deno task lint
deno task check
```

---

## 📚 Documentation & Integration Guides

- **[Integration & Import Guide](./docs/browsertorrent/IMPORT_GUIDE.md)**
- **[API Reference](./docs/browsertorrent/00-api-browsertorrent.md)**
- **[WebTorrent vs BrowserTorrent Comparison Table](./docs/browsertorrent/08-comparison-table.md)**
- **[WebRTC Signaling Architecture](./docs/browsertorrent/09-webrtc-signaling-architecture.md)**
