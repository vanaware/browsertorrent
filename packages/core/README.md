# @vanaware/browsertorrent

[![JSR](https://jsr.io/badges/@vanaware/browsertorrent)](https://jsr.io/@vanaware/browsertorrent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A high-performance, browser-first BitTorrent v1 client implemented in pure Deno TypeScript.

Leverages **WebRTC DataChannels** for peer-to-peer swarms, the **Origin Private File System (OPFS)** for persistent piece storage, and an in-browser **Service Worker streaming bridge** with HTTP 206 Partial Content range requests for zero-latency `<video>` and `<audio>` playback.

---

## ⚡ Key Highlights

- **Pure TypeScript & Zero NPM Runtime Dependencies**: Fully built for Deno and modern web browsers without node polyfills.
- **WebRTC P2P Swarming**: Direct browser-to-browser data transfer using WebRTC DataChannels over WebSocket trackers.
- **OPFS Storage Engine**: High-throughput piece persistence in the browser's Origin Private File System, with automatic RAM fallback.
- **Service Worker Media Streaming**: Streams video and audio directly to standard HTML5 `<video>` and `<audio>` elements with HTTP 206 range requests and backpressure.
- **In-Browser Torrent Generator**: Produces standard bencoded `.torrent` files directly from browser `FileSystemFileHandle` or OPFS directory trees.
- **Standards Compliant**: Full protocol parity with BEP 3 (core wire protocol), BEP 9 (`ut_metadata`), BEP 10 (extension host), BEP 11 (`ut_pex`), and BEP 15/31 (WebSocket tracker).
- **WebTorrent Interoperability**: 100% cross-compatible with `webtorrent.js` swarms and trackers.

---

## 📦 Installation

Add `@vanaware/browsertorrent` to your project from JSR:

### Deno
```bash
deno add jsr:@vanaware/browsertorrent
```

### npm / pnpm / yarn (via JSR)
```bash
npx jsr add @vanaware/browsertorrent
```

### In Browser (ES Modules / CDN)
```html
<script type="module">
  import { Client } from "https://esm.sh/jsr/@vanaware/browsertorrent";
  const client = new Client();
</script>
```

---

## 🚀 Quick Start

### 1. Downloading from a Magnet URI

```typescript
import { Client } from "jsr:@vanaware/browsertorrent";

const client = new Client({
  maxConns: 55,
  downloadLimit: 2 * 1024 * 1024, // 2 MB/s throttle (optional)
});

const magnetURI =
  "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=wss%3A%2F%2Ftracker.webtorrent.dev";

const torrent = await client.add(magnetURI, {
  onReady: (t) => console.log("Metadata ready:", t.name, t.length),
  onDone: (t) => console.log("Download finished!"),
});

torrent.on("download", (e) => {
  console.log(
    `Speed: ${(torrent.downloadSpeed / 1024).toFixed(1)} KB/s, ` +
    `Progress: ${(torrent.progress * 100).toFixed(1)}%`
  );
});
```

---

### 2. Seeding a File from Browser OPFS

```typescript
import { Client, PieceSizeEnum } from "jsr:@vanaware/browsertorrent";

const client = new Client();

// Retrieve file handle from Origin Private File System
const rootDir = await navigator.storage.getDirectory();
const fileHandle = await rootDir.getFileHandle("presentation.mp4");

const torrent = await client.seed(fileHandle, {
  name: "presentation.mp4",
  pieceSize: PieceSizeEnum.SIZE_AUTO,
  announce: ["wss://tracker.webtorrent.dev"],
});

console.log("Seeding started! Share this Magnet URI:");
console.log(torrent.magnetURI);
```

---

### 3. Media Streaming with Service Worker

Stream torrent video chunks directly to HTML5 `<video controls>` without downloading the entire file first.

#### In Your Main Script (`main.ts`):
```typescript
import { Client } from "jsr:@vanaware/browsertorrent";
import { registerAndConnectServiceWorker } from "jsr:@vanaware/browsertorrent/service-worker";

// 1. Register Service Worker and establish dual MessageChannel bridge
await registerAndConnectServiceWorker({
  scriptUrl: "./sw.js",
  scope: "./",
});

// 2. Initialize BitTorrent client and streaming server
const client = new Client();
client.createServer({ scope: "/" });

// 3. Add torrent and assign streamURL to video element
const torrent = await client.add("magnet:?xt=urn:btih:...");

torrent.on("ready", () => {
  const file = torrent.files[0];
  const videoEl = document.querySelector<HTMLVideoElement>("#player")!;
  videoEl.src = file.streamURL;
  videoEl.play();
});
```

#### In Your Service Worker (`sw.ts`):
```typescript
import { createWebTorrentFetchHandler } from "jsr:@vanaware/browsertorrent/service-worker";

const torrentHandler = createWebTorrentFetchHandler();

self.addEventListener("message", (event) => {
  if (event.data?.type === "PORT") {
    torrentHandler.setPagePort(event.ports[0]);
  }
});

self.addEventListener("fetch", (event) => {
  if (torrentHandler.isStreamRequest(event.request)) {
    const responsePromise = torrentHandler.handleFetch(event);
    if (responsePromise) event.respondWith(responsePromise);
  }
});
```

---

## 🗂️ Subpath Exports

`@vanaware/browsertorrent` is modularized into four distinct subpath exports:

| Subpath | Description |
| :--- | :--- |
| `jsr:@vanaware/browsertorrent` | Core BitTorrent engine: `Client`, `Torrent`, `Swarm`, `Peer`, `Wire`, `File`, `OPFSChunkStore`. |
| `jsr:@vanaware/browsertorrent/service-worker` | Streaming fetch interceptor, dual MessageChannel bridges, and SW lifecycle handlers. |
| `jsr:@vanaware/browsertorrent/server` | In-browser HTTP streaming server bridge (`createServer`, `registerTorrentFiles`). |
| `jsr:@vanaware/browsertorrent/torrent-generator` | High-speed `.torrent` generator reading directly from browser OPFS handles. |

---

## 📖 Core API Reference

### `Client` (also aliased as `WebTorrent`)

- `new Client(options?: ClientOptions)`: Initializes a new client instance.
- `client.add(torrentId, options?)`: Adds a Magnet URI, 40-hex info hash, or `.torrent` Uint8Array.
- `client.seed(input, options?, callback?)`: Seeds OPFS handles, Blobs, Files, or Uint8Arrays.
- `client.remove(infoHash, destroyStore?)`: Removes a torrent and optionally deletes its OPFS data.
- `client.destroy(callback?)`: Gracefully closes all swarms and servers.
- `client.get(torrentId)`: Retrieves an active torrent by ID or info hash.
- `client.createServer(options?)`: Initializes the in-browser streaming HTTP bridge.
- `client.throttleDownload(bytesPerSecond)`: Throttles client-wide download bandwidth.
- `client.throttleUpload(bytesPerSecond)`: Throttles client-wide upload bandwidth.
- `client.downloadSpeed`: Current aggregate download speed in bytes/s.
- `client.uploadSpeed`: Current aggregate upload speed in bytes/s.
- `client.progress`: Overall download progress from `0.0` to `1.0`.
- `client.ratio`: Ratio of uploaded bytes to downloaded bytes.

### `Torrent`

- `torrent.name`: Display name of the torrent.
- `torrent.infoHash`: 40-character lowercase hexadecimal hash.
- `torrent.magnetURI`: Complete magnet URI including trackers.
- `torrent.files`: Array of enriched {@link File} instances.
- `torrent.progress`: Progress between `0.0` and `1.0`.
- `torrent.downloadSpeed`: Current download rate in bytes/s.
- `torrent.uploadSpeed`: Current upload rate in bytes/s.
- `torrent.numPeers`: Number of connected WebRTC peers in the swarm.
- `torrent.timeRemaining`: Estimated seconds until completion (`null` if unknown).
- `torrent.pause()` / `torrent.resume()`: Pauses or resumes swarm transfers.
- `torrent.select(start, end, priority)`: Prioritizes a specific range of pieces.
- `torrent.deselect(start, end, priority)`: Deprioritizes a range of pieces.
- `torrent.critical(pieceIndex)`: Marks a piece as urgent (for streaming seek positions).

### `File`

- `file.name`: File name with extension.
- `file.length`: Total size in bytes.
- `file.streamURL`: Absolute URL served via the Service Worker bridge.
- `file.createReadStream(options?)`: Returns a `ReadableStream<Uint8Array>`.
- `file.arrayBuffer()`: Returns a promise resolving to an `ArrayBuffer`.
- `file.blob()`: Returns a promise resolving to a `Blob`.
- `file.getBlobURL()`: Returns an object URL (`blob:...`).

---

## 🌐 Platform & Browser Support

| Platform / Browser | WebRTC DataChannels | OPFS Storage | Service Worker Streaming |
| :--- | :---: | :---: | :---: |
| **Google Chrome / Chromium** (86+) | ✅ Full | ✅ Full | ✅ Full |
| **Mozilla Firefox** (111+) | ✅ Full | ✅ Full | ✅ Full |
| **Apple Safari** (15.2+) | ✅ Full | ✅ Full | ✅ Full |
| **Microsoft Edge** | ✅ Full | ✅ Full | ✅ Full |
| **Deno** (v2.x) | ✅ CLI / Server | ⚠️ RAM fallback | ⚠️ Server-side |

---

## 🧪 Testing & Validation

`@vanaware/browsertorrent` undergoes continuous validation with automated unit and integration tests:

```bash
# Run all unit tests
deno test -A packages/core/tests/

# Verify type-checking
deno check packages/core/src/mod.ts

# Dry-run JSR publishing verification
deno publish --dry-run --config packages/core/deno.jsonc
```

---

## 📄 License

MIT © [Vanaware](https://github.com/vanaware)
