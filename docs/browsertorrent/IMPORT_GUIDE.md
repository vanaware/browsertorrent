# BrowserTorrent Integration & Import Guide

This guide explains how to integrate and use the `@vanaware/browsertorrent` library across different environments: via JSR, direct GitHub imports, and bundlers.

---

## 1. JSR (Recommended for Deno & Modern TypeScript)

`@vanaware/browsertorrent` is published on [JSR](https://jsr.io/@vanaware/browsertorrent) as a zero-dependency, pure browser & Deno TypeScript library.

### Installation / Import in Deno

```bash
deno add jsr:@vanaware/browsertorrent
```

Or import directly in your code without an installation step:

```typescript
import { Client } from "jsr:@vanaware/browsertorrent";

const client = new Client();

// Seed a file
const file = new File(["Hello P2P World!"], "hello.txt", { type: "text/plain" });
const torrent = await client.seed(file);

console.log("Seeding InfoHash:", torrent.infoHash);
console.log("Magnet URI:", torrent.magnetURI);
```

### Subpath Exports on JSR

- **Core Client & Torrent Engine**: `jsr:@vanaware/browsertorrent`
- **Service Worker Streaming Runtime**: `jsr:@vanaware/browsertorrent/service-worker`
- **Virtual Stream Server**: `jsr:@vanaware/browsertorrent/server`
- **OPFS Torrent Generator**: `jsr:@vanaware/browsertorrent/torrent-generator`

---

## 2. Direct GitHub Import

Deno allows direct URL imports from GitHub without npm or package registries:

```typescript
import {
  Client,
  Torrent,
  VERSION
} from "https://raw.githubusercontent.com/vanaware/browsertorrent/main/packages/core/src/mod.ts";

console.log(`BrowserTorrent v${VERSION}`);
const client = new Client();
```

---

## 3. Browser & Bundler Usage (Vite, Webpack, esbuild)

For standard web bundlers, you can use [esm.sh](https://esm.sh) or install from JSR via `npm` / `pnpm` / `yarn`:

```bash
npx jsr add @vanaware/browsertorrent
```

Or import directly in browser ES modules via CDN:

```typescript
import { Client } from "https://esm.sh/jsr/@vanaware/browsertorrent";

const client = new Client();

// Download a torrent from a Magnet Link
const torrent = await client.add("magnet:?xt=urn:btih:...");
torrent.on("download", (bytes) => {
  console.log(`Downloaded ${bytes} bytes. Progress: ${(torrent.progress * 100).toFixed(1)}%`);
});
```

---

## 4. Service Worker Media Streaming Integration

BrowserTorrent provides a decoupled Service Worker streaming layer. The core package (`@vanaware/browsertorrent/service-worker`) handles WebRTC chunk pull & fetch interception, allowing your application to retain full control over caching, install, and activation.

### Step A: Create your Service Worker (`sw.ts`)

```typescript
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { createWebTorrentFetchHandler } from "@vanaware/browsertorrent/service-worker";

// 1. Initialize the WebTorrent stream interception handler
const torrentStreamHandler = createWebTorrentFetchHandler();

// 2. Capture the communication port sent by the main application
self.addEventListener("message", (e: ExtendableMessageEvent) => {
  const { data } = e;
  if (data?.type === "PORT" && e.ports[0]) {
    torrentStreamHandler.setPagePort(e.ports[0]);
  }
});

// 3. Delegate streaming requests to BrowserTorrent, other requests to your cache/network
self.addEventListener("fetch", (e: FetchEvent) => {
  const streamResponse = torrentStreamHandler.handleFetch(e);
  if (streamResponse) {
    e.respondWith(streamResponse);
    return;
  }

  // Your custom caching or network fallback logic here:
  e.respondWith(fetch(e.request));
});
```

### Step B: Register the Service Worker in your Main Application

```typescript
import {
  Client,
  registerServiceWorker,
  streamManager,
} from "@vanaware/browsertorrent";

// Register the Service Worker
await registerServiceWorker({ scriptUrl: "./sw.js", scope: "./" });

// Create the client
const client = new Client();

// Seed or add torrents and connect to the streaming bridge
const torrent = await client.add(magnetURI);
torrent.on("ready", () => {
  // Stream files directly to HTML5 <video> / <audio> tags
  const file = torrent.files[0];
  const videoElement = document.querySelector("video");
  if (videoElement && file) {
    file.streamTo(videoElement);
  }
});
```

---

## 5. WebTorrent API Compatibility

`@vanaware/browsertorrent` is designed to be an easy upgrade from legacy `webtorrent`:
- Both `Client` and `WebTorrent` constructor aliases are exported.
- Standard events (`ready`, `torrent`, `download`, `upload`, `wire`, `done`, `error`) are supported.
- `torrent.files[i].streamTo(mediaElement)` provides seamless streaming with automatic backpressure.
