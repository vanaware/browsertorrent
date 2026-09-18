// packages/service-worker/src/mod.ts
/**
 * Service worker utilities and cache management for BrowserTorrent applications.
 */

export {
  ASSETS_TO_CACHE,
  CACHE_NAME,
  CACHE_VERSION,
  handleActivate,
  handleCacheFetch,
  handleInstall,
} from "./cache.ts";

export {
  createWebTorrentFetchHandler,
  getWebTorrentPrefix,
  guessDestination,
  handleStream,
  isServiceWorkerSupported,
  isWebTorrentStreamRequest,
  registerServiceWorker,
  type ServiceWorkerRegisterOptions,
  type StreamHandlerOptions,
} from "@vanaware/browsertorrent/service-worker";
