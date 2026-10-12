// packages/core/src/service-worker/mod.ts
/**
 * BrowserTorrent Service Worker module.
 * Provides streaming fetch interception, client bridge, and PWA cache utilities
 * for BitTorrent web seeding and playback.
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

