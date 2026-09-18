# BrowserTorrent

A modern, browser-native BitTorrent client and PWA built in TypeScript with Deno, WebRTC, OPFS (Origin Private File System), and BeerCSS.

## Overview

BrowserTorrent is a zero-dependency, browser-first BitTorrent client engineered to operate 100% within modern web browsers. It implements full peer-to-peer data transfers over WebRTC DataChannels and communicates with both public WebTorrent WebSocket trackers and custom Deno-based WebSocket trackers (`WsTracker`).

## Key Features

- **Pure Deno & Web Standards**: Built without local Node.js or npm dependencies; bundling orchestrated via native esbuild and Deno tasks.
- **WebRTC P2P DataChannels**: Direct browser-to-browser torrent transfer with framing over binary `ArrayBuffer` channels.
- **Full BitTorrent Wire Protocol**: Supports core BEP 3 wire protocol, BEP 52 v2 Merkle hashing, BEP 6 fast extension, and BEP 10 extension protocol.
- **Metadata Exchange (`ut_metadata` / BEP 9)**: Piecewise torrent metainfo retrieval directly over WebRTC extension channels.
- **Bi-directional WebRTC Signaling via WebSocket Trackers**: Fully compliant with the original WebTorrent `bittorrent-tracker` JSON specification, supporting embedded offers/answers for immediate peer discovery and connection establishment.
- **Local Deno Tracker (`WsTracker`)**: Built-in, high-performance WebSocket tracker server with offer pool rotation and client compatibility.
- **OPFS & In-Memory Storage**: ChunkStore persistence using the high-performance browser Origin Private File System (`FileSystemSyncAccessHandle`) and worker threads.
- **Service Worker Media Streaming**: Real-time range-request (HTTP 206 Partial Content) streaming from WebRTC swarms directly to HTML5 video and audio tags.
- **Material Design 3 (BeerCSS)**: Lightweight, semantic UI with responsive design powered by `@preact/signals`.

## E2E & Protocol Verification

BrowserTorrent includes a Playwright and Headless Chromium end-to-end testing suite validating:
1. Public tracker connectivity (`wss://tracker.webtorrent.dev`, `wss://tracker.openwebtorrent.com`).
2. Local Deno tracker (`ws://127.0.0.1:3000/tracker`) handshake and peer signaling.
3. Seeder-to-Leecher P2P file transfers and metadata exchange over local and public swarms.
4. Full compatibility with official WebTorrent clients.

```bash
# Run tests
deno task test

# Run E2E Playwright validation
node packages/e2e/test_trackers.js
```

## How to Use

To use BrowserTorrent in your own application directly from GitHub, check out our **[GitHub Import Guide](./docs/browsertorrent/IMPORT_GUIDE.md)**.
