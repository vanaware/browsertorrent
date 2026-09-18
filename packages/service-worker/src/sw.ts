/**
 * sw.ts — Service Worker para streaming P2P BrowserTorrent.
 * Re-exporta e inicializa o motor de Service Worker do core.
 */
/// <reference lib="webworker" />
import { initStreamingServiceWorker, } from "../../core/src/service-worker/mod.ts";

initStreamingServiceWorker();
