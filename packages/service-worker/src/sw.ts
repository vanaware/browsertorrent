// packages/service-worker/src/sw.ts
/**
 * BrowserTorrent Reference Service Worker Implementation.
 * Demonstrates how to combine the @vanaware/browsertorrent streaming runtime
 * with standard PWA application caching, install, and activation events.
 */
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { createWebTorrentFetchHandler } from "@vanaware/browsertorrent/service-worker";
import {
  handleActivate,
  handleCacheFetch,
  handleInstall,
} from "./cache.ts";

// Initialize the WebTorrent stream interception handler from core
const torrentStreamHandler = createWebTorrentFetchHandler();

// Standard SW Install Lifecycle
self.addEventListener("install", (e: ExtendableEvent) => {
  handleInstall(e);
});

// Standard SW Activation & Cache Invalidation Lifecycle
self.addEventListener("activate", (e: ExtendableEvent) => {
  handleActivate(e);
});

// Intercept Port handshake from the main window (TorrentProvider)
self.addEventListener("message", (e: ExtendableMessageEvent) => {
  const { data } = e;
  if (data?.type === "PORT" && e.ports[0]) {
    torrentStreamHandler.setPagePort(e.ports[0]);
  }
});

// Fetch Dispatcher: route /webtorrent/ streams to core, all other requests to cache/network
self.addEventListener("fetch", (e: FetchEvent) => {
  // 1. BitTorrent P2P Streaming Request Check
  const streamPromise = torrentStreamHandler.handleFetch(e);
  if (streamPromise) {
    e.respondWith(streamPromise);
    return;
  }

  // 2. Application shell & static assets cache fallback
  e.respondWith(
    handleCacheFetch(e).then((response) => response || fetch(e.request)),
  );
});
