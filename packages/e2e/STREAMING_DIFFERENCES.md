# Streaming Comparison: BrowserTorrent vs WebTorrent

This document maps the architectural and functional differences between the streaming solutions implemented in BrowserTorrent and the original WebTorrent client.

## 1. Architectural Mapping

| Feature | BrowserTorrent | WebTorrent (Original) |
| :--- | :--- | :--- |
| **Primary Method** | **Service Worker Hijacking** | **Blob URLs / MediaSource / Node-HTTP** |
| **Request Interception** | Native `fetch` event in SW. | No native interception; requires API call to render. |
| **Data Transport** | `MessageChannel` (Main ↔ SW) ➔ `ReadableStream`. | Direct buffer access ➔ `Blob` or `videostream` polyfill. |
| **Memory Profile** | **O(chunk_size)**: Only active chunks are in RAM. | **O(file_size)**: When using `getBlobURL()`, entire file is in RAM. |
| **Range Support** | Native browser behavior (HTTP 206). | Emulated via custom stream slicing in JS. |

## 2. BrowserTorrent Solution (Service Worker)

BrowserTorrent leverages the **Service Worker (SW)** as a transparent proxy.

1.  **Transparency**: The UI uses standard URLs like `/webtorrent/<hash>/file.mp4`.
2.  **Native Integration**: The browser's native media engine handles buffering, seeking, and retry logic through standard HTTP range requests.
3.  **Cross-Context**: If multiple tabs are open, they can all share the same SW-served stream.
4.  **Efficiency**: Pieces are pulled from the P2P swarm only when the browser's playback cursor approaches them.

## 3. WebTorrent Solution (Standard)

WebTorrent's browser implementation traditionally relies on:

1.  **Blob URLs**: `URL.createObjectURL(blob)`. Simple but fatal for files larger than available RAM.
2.  **`renderTo` / `videostream`**: A sophisticated polyfill that feeds chunks into a `MediaSource`. It is very reliable for video but doesn't provide a "URL" that other browser features (like "Save As" or background downloads) can use easily.
3.  **Local HTTP Server**: In Node.js, WebTorrent starts a real `http` server on a random port. In the browser, this is not possible without an SW bridge (which BrowserTorrent implements).

## 4. Key Differences identified during E2E

- **Seek Performance**: BrowserTorrent relies on the browser's native implementation of range requests, which is generally more robust than custom `MediaSource` buffers.
- **Resource Cleanup**: WebTorrent `Blob` URLs must be manually revoked. BrowserTorrent streams are cleaned up when the `fetch` request is closed/cancelled by the browser.
- **Protocol Overhead**: WebTorrent's `videostream` has minimal overhead as it works directly with buffers. BrowserTorrent has the overhead of `MessageChannel` serialization (though `Uint8Array` is transferable/efficient).

## 5. E2E Verification Results

All streaming scenarios were validated in the automated test suite (`test_scenarios.js`):
- **Scenario D (SW Streaming)**: Successfully verified that BrowserTorrent can seed a file, a leecher can discover it, and then the leecher's browser can perform a native `fetch` to `/webtorrent/<hash>/...` which is intercepted by the SW and served byte-for-byte from the P2P swarm.
- **Scenario E (Compatibility Streaming)**: Verified that our Service Worker bridge is implementation-agnostic on the seeder side. An original WebTorrent seeder provided data to a BrowserTorrent leecher, which successfully served the data through the Service Worker via native `fetch`. This confirms that the P2P wire protocol is perfectly bridged to the browser's HTTP stack.

---
*Note: This document was generated as part of the E2E validation suite for BrowserTorrent.*
