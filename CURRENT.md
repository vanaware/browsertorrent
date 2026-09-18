# SyntaxMesh - Progress Tracking

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

## Critical Debugging (Active)
- [ ] **Fix P2P Transfer Timeout**: Investigating why file blocks are not transferring after metadata exchange.
  - **See Log**: `docs/bugsfound/2026-09-17-e2e-p2p-timeout.md`
  - **Next Step**: Investigate why the Seeder keeps the Leecher in `choke` state.

## Current Task
- [ ] Phase 8: OPFS WorkerDB and UI integration.
  - [ ] Integrate `WorkerDB` for persistent torrent state.
  - [ ] Connect `Swarm` and `Peer` logic to the UI reactive signals.
  - [ ] Implement a clean dashboard using BeerCSS for managing torrents.
  - [ ] Ensure offline capability via Service Worker and IndexedDB.
