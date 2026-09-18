// packages/core/src/service-worker/mod.ts
export {
  getWebTorrentPrefix,
  guessDestination,
  handleStream,
  initStreamingServiceWorker,
  type StreamHandlerOptions,
} from "./stream-handler.ts";

export {
  isServiceWorkerSupported,
  registerServiceWorker,
  type ServiceWorkerRegisterOptions,
} from "./register.ts";

export {
  CACHE_NAME,
  handleCacheActivate,
  handleCacheFetch,
  handleCacheInstall,
} from "./cache.ts";
