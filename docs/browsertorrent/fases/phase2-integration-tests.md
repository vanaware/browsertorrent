# Phase 2.2 — Integration Test Documentation

> **Date:** 2026-09-16
> **Status:** ✅ Complete
> **Purpose:** Document integration test requirements for BrowserTorrent P2P streaming

---

## 📋 Test Requirements

### Browser Requirements

| Browser | Version | Status | Notes |
|---|---|---|---|
| Chrome | 120+ | ✅ Required | WebRTC + Service Worker + OPFS |
| Firefox | 120+ | ⚠️ Optional | WebRTC + Service Worker |
| Safari | 17+ | ⚠️ Optional | WebRTC + Service Worker |

**Minimum Requirements:**
- WebRTC support (RTCPeerConnection)
- Service Worker support
- OPFS (Origin Private File System) support
- W3C Streams (ReadableStream) support

---

## 🔄 Complete Seeder → Viewer → Peer Workflow

### Test Scenario 1: Basic Seeder Setup

**Steps:**
1. Open browser to `http://localhost:8000`
2. Click "Seeder" mode
3. Select a video file (MP4, WebM, MKV)
4. Click "Seed" button
5. Verify:
   - ✅ Client initializes with OPFS
   - ✅ `client.createServer({ scope: "/" })` called
   - ✅ `server.sendReadyAck()` completes
   - ✅ `wt.seed(file)` returns torrent
   - ✅ Magnet URI generated and displayed
   - ✅ InfoHash visible in UI
   - ✅ `torrentSignal.value` set to seeding mode
   - ✅ `serverSignal.value` set to WebTorrentServer instance

**Expected Results:**
- Seeder mode activated
- Magnet URI displayed
- InfoHash visible
- No errors in console

### Test Scenario 2: Viewer Connects to Seeder

**Steps:**
1. Open second browser tab/window to same URL
2. Click "Viewer" mode
3. Paste magnet URI from seeder
4. Click "Watch" button
5. Verify:
   - ✅ Client initializes
   - ✅ `client.createServer({ scope: "/" })` called
   - ✅ `wt.add(magnetURI)` returns torrent
   - ✅ Torrent metadata received
   - ✅ Files listed in torrent
   - ✅ `torrentSignal.value` set to leeching mode
   - ✅ Video element appears
   - ✅ `file.streamTo(videoElement)` called
   - ✅ Video starts playing

**Expected Results:**
- Viewer connects to seeder via WebRTC
- Video streams via Service Worker bridge
- Playback starts automatically

### Test Scenario 3: Peer Discovery

**Steps:**
1. Start seeder (Scenario 1)
2. Start viewer (Scenario 2)
3. Wait 5-10 seconds for peer connection
4. Verify:
   - ✅ WebRTC connection established
   - ✅ Peer count increases in UI
   - ✅ Download speed > 0
   - ✅ Upload speed > 0
   - ✅ Progress increases

**Expected Results:**
- Peers discovered via WebRTC
- Data flowing between peers
- Stats updating in real-time

---

## 🎬 Video Streaming Test Scenarios

### Test Scenario 4: Video Seek

**Steps:**
1. Start video playback
2. Wait 5 seconds
3. Seek to 50% of video duration
4. Verify:
   - ✅ Video seeks to correct position
   - ✅ No errors in console
   - ✅ Range request sent (HTTP 206)
   - ✅ Video continues playing from new position

**Expected Results:**
- Seek works correctly
- Range requests handled by SW
- Video playback resumes from seek position

### Test Scenario 5: Video Pause and Resume

**Steps:**
1. Start video playback
2. Pause video after 10 seconds
3. Wait 5 seconds
4. Resume playback
5. Verify:
   - ✅ Video pauses correctly
   - ✅ Video resumes from pause position
   - ✅ No re-downloading of already buffered data
   - ✅ Peer connection maintained

**Expected Results:**
- Pause/resume works correctly
- Buffer maintained across pause
- Peer connection stable

### Test Scenario 6: Video Stream URL

**Steps:**
1. Start viewer with magnet URI
2. Copy Stream URL from UI
3. Open new tab
4. Paste Stream URL in address bar
5. Verify:
   - ✅ URL format: `http://localhost:8000/webtorrent/<infoHash>/<fileIndex>/<name>`
   - ✅ Video plays directly from URL
   - ✅ SW intercepts request
   - ✅ Chunks served via MessageChannel

**Expected Results:**
- Stream URL works independently
- SW handles request correctly
- Video plays without viewer UI

### Test Scenario 7: Large File Streaming

**Steps:**
1. Select large video file (> 100MB)
2. Start seeding
3. Start viewer
4. Verify:
   - ✅ Streaming starts without full download
   - ✅ Memory usage stays stable
   - ✅ No out-of-memory errors
   - ✅ Playback smooth

**Expected Results:**
- Streaming works for large files
- Memory efficient (chunked reads)
- No performance degradation

---

## 🛡️ Client Failure Resilience Test Scenarios

### Test Scenario 8: Seeder Disconnect

**Steps:**
1. Start seeder and viewer (Scenario 3)
2. Close seeder tab
3. Verify:
   - ✅ Viewer detects disconnect
   - ✅ Error message displayed
   - ✅ Graceful degradation
   - ✅ No crash in viewer

**Expected Results:**
- Viewer handles seeder disconnect
- Error displayed to user
- Application remains stable

### Test Scenario 9: Viewer Disconnect

**Steps:**
1. Start seeder and viewer (Scenario 3)
2. Close viewer tab
3. Verify:
   - ✅ Seeder detects disconnect
   - ✅ Peer count decreases
   - ✅ Seeder continues running
   - ✅ No errors in seeder console

**Expected Results:**
- Seeder handles viewer disconnect
- Peer count updates correctly
- Seeder remains stable

### Test Scenario 10: Network Interruption

**Steps:**
1. Start seeder and viewer (Scenario 3)
2. Disable network (Airplane mode)
3. Wait 10 seconds
4. Re-enable network
5. Verify:
   - ✅ Connection lost detected
   - ✅ Reconnection attempted
   - ✅ Streaming resumes after reconnect
   - ✅ No data corruption

**Expected Results:**
- Network interruption handled
- Auto-reconnect works
- Streaming resumes correctly

### Test Scenario 11: Client Crash Recovery

**Steps:**
1. Start seeder and viewer (Scenario 3)
2. Kill seeder process (force close)
3. Verify:
   - ✅ Viewer detects crash
   - ✅ Error handled gracefully
   - ✅ No memory leaks
   - ✅ Application remains usable

**Expected Results:**
- Crash detected and handled
- No resource leaks
- Application stable

### Test Scenario 12: Multiple Viewers

**Steps:**
1. Start seeder
2. Start 3 viewers simultaneously
3. Verify:
   - ✅ All viewers connect
   - ✅ Peer count = 3
   - ✅ All viewers stream independently
   - ✅ No interference between viewers

**Expected Results:**
- Multiple viewers supported
- Each viewer streams independently
- No performance degradation

---

## 🧪 Automated Test Checklist

### Pre-Test Setup

```bash
# 1. Run type checking
deno check packages/example/src/**/*.ts
deno check packages/service-worker/src/**/*.ts

# 2. Run linting
deno lint packages/example/src/
deno lint packages/service-worker/src/

# 3. Run formatting check
deno fmt --check packages/example/src/
deno fmt --check packages/service-worker/src/

# 4. Run core tests
deno test -P packages/core/tests/
```

### Manual Test Execution

| Test ID | Scenario | Expected Result | Pass/Fail |
|---|---|---|---|
| T1 | Basic Seeder Setup | Seeder mode activated, magnet URI displayed | ☐ |
| T2 | Viewer Connects | Video plays via P2P streaming | ☐ |
| T3 | Peer Discovery | Peers connected, stats updating | ☐ |
| T4 | Video Seek | Seek to position works correctly | ☐ |
| T5 | Pause/Resume | Pause and resume works correctly | ☐ |
| T6 | Stream URL | Direct URL playback works | ☐ |
| T7 | Large File | Large file streams without issues | ☐ |
| T8 | Seeder Disconnect | Viewer handles disconnect gracefully | ☐ |
| T9 | Viewer Disconnect | Seeder handles disconnect gracefully | ☐ |
| T10 | Network Interruption | Auto-reconnect works | ☐ |
| T11 | Client Crash | Crash handled gracefully | ☐ |
| T12 | Multiple Viewers | 3 viewers stream independently | ☐ |

---

## 📊 Test Environment

### Local Development

```bash
# Start local server
deno run -A --watch server.ts

# Or use Python
python3 -m http.server 8000

# Or use Node.js
npx serve .
```

### Required Permissions

**Chrome Flags (if needed):**
- `chrome://flags/#enable-experimental-web-platform-features`
- `chrome://flags/#enable-service-worker`

**Permissions Required:**
- `navigator.serviceWorker` — Service Worker registration
- `navigator.storage.getDirectory()` — OPFS access
- `RTCPeerConnection` — WebRTC peer connections
- `WebSocket` — Tracker communication

---

## 🐛 Known Issues

| Issue | Impact | Workaround |
|---|---|---|
| Pre-existing type errors in example/service-worker | None (runtime works) | Ignore during development |
| SW scope must be `/` | None | Ensure SW registered with scope `/` |
| MessageChannel protocol | None | Verified working |

---

## ✅ Test Completion Criteria

### Phase 2.2 Complete When:

- [x] Test documentation created
- [x] All test scenarios documented
- [x] Manual test checklist provided
- [x] Automated test checklist provided
- [x] Test environment documented
- [x] Known issues documented
- [x] Completion criteria defined

### Phase 2.2 Sign-off:

- [ ] All manual tests pass (T1-T12)
- [ ] All automated tests pass
- [ ] No critical bugs found
- [ ] Test documentation reviewed
- [ ] Sign-off by reviewer

---

## 📝 Notes

- Tests should be run on Chrome 120+ for full WebRTC + SW + OPFS support
- Service Worker must be registered with scope `/`
- `client.createServer({ scope: "/" })` must be called before `file.streamURL()` / `file.streamTo()`
- SW handles `/webtorrent/*` paths for streaming
- Main thread responds to SW messages via `port.postMessage()`
- Video streaming via `<video>` element + `file.streamTo(video)` + `streamURL()`
