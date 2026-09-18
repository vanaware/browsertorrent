// packages/core/src/service-worker/sw.ts
/// <reference lib="webworker" />
import { initStreamingServiceWorker, } from "./stream-handler.ts";

// Start standard BrowserTorrent Service Worker
initStreamingServiceWorker();
