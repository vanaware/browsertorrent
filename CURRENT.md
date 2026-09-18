# BrowserTorrent - Progress Tracking

## Completed Phases
- [x] Phase 1: Core Deno/Preact/Signals Setup
- [x] Phase 2: BeerCSS UI Integration
- [x] Phase 3: PWA & Service Worker
- [x] Phase 4: Bencode & Metainfo Parser
- [x] Phase 5: Storage (ChunkStore & OPFS)
- [x] Phase 6: Peer-to-Peer (WebRTC & BitTorrent Protocol)
  - [x] BitTorrent Wire Protocol (BEP 3, BEP 52, BEP 6, BEP 10)
  - [x] BEP 10 ExtensionHost & BEP 9 `ut_metadata` piecewise transfer
  - [x] Peer WebRTC DataChannel transport with binary ArrayBuffer framing
- [x] Phase 7: Tracker & Swarm Signaling (WebSocket Tracker)
  - [x] Handled embedded signaling in `announce` messages (offers/answers).
  - [x] Implemented offer pool distribution for peer discovery.
  - [x] Fixed binary string encoding/decoding for `peer_id` and `info_hash` (20-byte binary strings).
  - [x] Verified full protocol compatibility with original WebTorrent `bittorrent-tracker` specification.
  - [x] Verified connection to public trackers (e.g., `wss://tracker.webtorrent.dev`).
  - [x] Verified end-to-end file seeding, P2P discovery, metadata exchange, and block transfer via local Deno `WsTracker`.
  - [x] Automated Playwright + Chromium E2E verification suite (`packages/e2e/test_trackers.js`).
  - [x] Advanced Cross-Compatibility E2E Matrix implemented (`packages/e2e/test_scenarios.js`).
    - [x] WebTorrent ↔ WebTorrent (Deno Tracker): PASSED
    - [x] WebTorrent ↔ BrowserTorrent Interoperability: PASSED
    - [x] BrowserTorrent SW Streaming Validation: PASSED
    - [x] WebTorrent ➔ BrowserTorrent SW Streaming Compatibility: PASSED
    - [x] Public Tracker Scenarios (B_PUBLIC/C): TIMEOUT (Sandbox env limitation)
    - [x] Documentation of streaming differences (`packages/e2e/STREAMING_DIFFERENCES.md`).
- [x] Phase 8: Core Consolidation & Service Worker Decoupling
  - [x] Migrated all required utilities into `@vanaware/browsertorrent` core package.
  - [x] Made `packages/core` 100% self-contained for JSR publishing (`jsr:@vanaware/browsertorrent`).
  - [x] Synchronized versioning with `packages/core/src/version.ts` and `packages/core/deno.jsonc`.
  - [x] Decoupled Service Worker into streaming fetch runtime (`packages/core/src/service-worker`) and reference PWA cache example (`packages/service-worker`).
  - [x] Exported subpath modules: `.`, `./service-worker`, `./server`, `./torrent-generator`.
  - [x] Updated documentation (`README.md`, `IMPORT_GUIDE.md`, `00-api-browsertorrent.md`, `08-comparison-table.md`).

## Current Task
- [ ] Phase 9: OPFS WorkerDB and UI integration.
  - [ ] Integrate `WorkerDB` for persistent torrent state.
  - [ ] Connect `Swarm` and `Peer` logic to the UI reactive signals.
  - [ ] Implement a clean dashboard using BeerCSS for managing torrents.
  - [ ] Ensure offline capability via Service Worker and IndexedDB.
