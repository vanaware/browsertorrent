// packages/core/src/service-worker/mod.ts
/**
 * BrowserTorrent Service Worker module.
 * Provides streaming fetch interception and client registration utilities for BitTorrent web seeding and playback.
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
