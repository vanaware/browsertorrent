# BrowserTorrent E2E Test Plan

This document outlines the End-to-End (E2E) testing strategy for validating BrowserTorrent and its interoperability with original WebTorrent clients.

## 1. Environment Requirements
- **Runtime**: Deno (for server/tracker)
- **E2E Tool**: Playwright (Chromium)
- **Port**: 3000 (Local Dev Server)

## 2. Test Scenarios

### Scenario A: WebTorrent ↔ WebTorrent (Deno Tracker)
- **Goal**: Verify that two original WebTorrent clients can successfully discover each other and transfer data using the custom Deno WebSocket tracker.
- **Setup**:
    - Seeder: WebTorrent (Original)
    - Leecher: WebTorrent (Original)
    - Tracker: `ws://127.0.0.1:3000/tracker`
- **Verification**: Byte-for-byte hash check of the received payload.

### Scenario B: WebTorrent ↔ BrowserTorrent (Cross-Client)
- **Goal**: Validate the "Golden Rule" of interoperability between different implementations.
- **Sub-scenarios**:
    1. **WT Seeder ➔ BT Leecher (Deno Tracker)**
    2. **BT Seeder ➔ WT Leecher (Deno Tracker)**
    3. **WT Seeder ➔ BT Leecher (Public Trackers)**: Using `wss://tracker.webtorrent.dev`.
    4. **BT Seeder ➔ WT Leecher (Public Trackers)**: Using `wss://tracker.webtorrent.dev`.
- **Verification**: Successful metadata exchange (UT_METADATA), peer wire handshake, and piece transfer.

### Scenario C: BrowserTorrent ↔ BrowserTorrent (Public Trackers)
- **Goal**: Ensure BrowserTorrent can operate entirely on public infrastructure.
- **Setup**:
    - Seeder: BrowserTorrent
    - Leecher: BrowserTorrent
    - Trackers: Public WebTorrent trackers.
- **Verification**: P2P connectivity over public signaling.

### Scenario D: Service Worker (SW) Streaming
- **Goal**: Validate BrowserTorrent's ability to create a virtual file server in the Service Worker.
- **Mechanism**:
    1. Seed a media file (video or image) in BrowserTorrent.
    2. Leecher joins and starts downloading.
    3. Leecher attempts to access `GET /webtorrent/<infoHash>/<filename>`.
    4. SW intercepts the fetch, requests chunks from the main thread via `MessageChannel`, and streams them back to the browser.
- **Verification**:
    - Response headers (`Content-Type`, `Accept-Ranges`).
    - Progressive loading (video seeking).

### Scenario E: WebTorrent Streaming (Comparison)
- **Goal**: Compare BrowserTorrent's SW-based streaming with WebTorrent's standard approach.
- **Mechanism**: Use WebTorrent's `file.renderTo` or `file.createReadStream` and map how it handles ranges vs BrowserTorrent.

---

## 3. Comparison Mapping: BrowserTorrent vs WebTorrent

| Feature | BrowserTorrent | WebTorrent (Original) |
| :--- | :--- | :--- |
| **Streaming Approach** | **Native SW Interception**: Uses Service Worker to hijack `/webtorrent/*` paths. Allows standard `<video src="...">` usage. | **Blob URLs / Internal Server**: Often uses `URL.createObjectURL` (high RAM) or an internal `http` server (requires Node.js context or complex worker bridge). |
| **Memory Management** | **Streaming-First**: Chunks are piped directly from P2P wire to SW response. Low RAM overhead for large files. | **Buffering**: Tends to buffer pieces in memory before surfacing them to the UI unless explicitly streaming. |
| **UX Implementation** | **Direct Link**: Any element can point to a torrent path as if it were a static file on a real server. | **API Driven**: Requires calling specific render methods or handling streams manually in JS. |
| **Protocol** | `ReadableStream` over `MessageChannel`. | `Node.js ReadableStream` polyfills. |

## 4. Execution Command
```bash
# From packages/e2e
npx playwright test
```
