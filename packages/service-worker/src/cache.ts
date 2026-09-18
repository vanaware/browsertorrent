// packages/service-worker/src/cache.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __APP_VERSION__: string;
declare const __GENERATED_ASSETS__: string[];

import { VERSION, } from "@vanaware/browsertorrent";

export const CACHE_VERSION = typeof __APP_VERSION__ !== "undefined"
  ? __APP_VERSION__
  : `v${VERSION}`;

export const CACHE_NAME = `browsertorrent-cache-${CACHE_VERSION}`;

export const ASSETS_TO_CACHE: string[] = typeof __GENERATED_ASSETS__ !== "undefined"
  ? __GENERATED_ASSETS__
  : [];

/**
 * Service Worker install event handler. Caches app shell assets.
 */
export function handleInstall(event: ExtendableEvent): void {
  console.log("[SW-CACHE] Installing Service Worker and caching assets...", CACHE_NAME);
  event.waitUntil((async () => {
    if (ASSETS_TO_CACHE.length > 0) {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW-CACHE] Asset cache warning for ${url}:`, err);
          })
        ),
      );
    }
    await self.skipWaiting();
  })());
}

/**
 * Service Worker activate event handler. Cleans up outdated caches.
 */
export function handleActivate(event: ExtendableEvent): void {
  console.log("[SW-CACHE] Activating Service Worker...", CACHE_NAME);
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cache) => {
        if (cache !== CACHE_NAME && cache.startsWith("browsertorrent-cache-")) {
          console.log(`[SW-CACHE] Purging old cache: ${cache}`);
          return caches.delete(cache);
        }
        return Promise.resolve(false);
      }),
    );
    await self.clients.claim();
  })());
}

/**
 * Network-First fetch handler with fallback to local Cache.
 */
export async function handleCacheFetch(
  event: FetchEvent,
): Promise<Response | undefined> {
  if (event.request.method !== "GET") {
    return undefined;
  }

  // Ignore cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return undefined;
  }

  try {
    const networkResponse = await fetch(event.request);
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, responseClone);
    }
    return networkResponse;
  } catch (_err) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return undefined;
  }
}
