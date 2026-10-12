/**
 * @module service-worker
 *
 * # @vanaware/browsertorrent/service-worker
 *
 * Provides in-browser Service Worker streaming fetch interception, backpressure message channels,
 * and registration utilities for high-throughput media playback.
 *
 * Enables HTML5 `<video>` and `<audio>` elements to stream directly from live BitTorrent swarms
 * using standard HTTP 206 Partial Content range requests.
 *
 * ## Usage Example
 *
 * ### In Main Page (`main.ts`):
 * ```ts
 * import { registerAndConnectServiceWorker } from "jsr:@vanaware/browsertorrent/service-worker";
 * import { Client } from "jsr:@vanaware/browsertorrent";
 *
 * // 1. Register SW and connect dual MessageChannel bridge
 * await registerAndConnectServiceWorker({
 *   scriptUrl: "./sw.js",
 *   scope: "./",
 * });
 *
 * // 2. Initialize client and streaming server bridge
 * const client = new Client();
 * client.createServer({ scope: "/" });
 *
 * // 3. Download and stream
 * const torrent = await client.add("magnet:?xt=urn:btih:...");
 * torrent.on("ready", () => {
 *   const file = torrent.files[0];
 *   const video = document.querySelector("video")!;
 *   video.src = file.streamURL;
 * });
 * ```
 *
 * ### In Service Worker (`sw.ts`):
 * ```ts
 * import { createWebTorrentFetchHandler } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const torrentHandler = createWebTorrentFetchHandler();
 *
 * self.addEventListener("message", (event) => {
 *   if (event.data?.type === "PORT") {
 *     torrentHandler.setPagePort(event.ports[0]);
 *   }
 * });
 *
 * self.addEventListener("fetch", (event) => {
 *   if (torrentHandler.isStreamRequest(event.request)) {
 *     const responsePromise = torrentHandler.handleFetch(event);
 *     if (responsePromise) event.respondWith(responsePromise);
 *   }
 * });
 * ```
 */

export {
  createWebTorrentFetchHandler,
  getWebTorrentPrefix,
  guessDestination,
  handleStream,
  isWebTorrentStreamRequest,
  type StreamHandlerOptions,
  type WebTorrentFetchHandler,
} from "./stream-handler.ts";

export {
  isServiceWorkerSupported,
  registerServiceWorker,
  type ServiceWorkerRegisterOptions,
} from "./register.ts";

export {
  connectServiceWorkerBridge,
  establishSWConnection,
  guessContentType,
  parseRange,
  registerAndConnectServiceWorker,
  type ServiceWorkerBridgeOptions,
  waitForActivation,
  waitForServiceWorkerActivation,
} from "./bridge.ts";
