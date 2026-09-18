// packages/core/src/service-worker/cache.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __GENERATED_ASSETS__: string[] | undefined;

import { VERSION, } from "../version.ts";

export const CACHE_NAME = `browsertorrent-cache-v${VERSION}`;

/**
 * Service worker installation handler for pre-caching essential assets.
 */
export function handleCacheInstall(
  event: ExtendableEvent,
  assetsToCache?: string[],
): void {
  const assets = assetsToCache ??
    (typeof __GENERATED_ASSETS__ !== "undefined" ? __GENERATED_ASSETS__ : []);

  console.log("[SW-CACHE] Installing Service Worker cache...",);
  event.waitUntil(
    caches.open(CACHE_NAME,).then((cache,) => {
      console.log(
        "[SW-CACHE] Caching essential resources:",
        assets.length,
        "items",
      );
      return Promise.all(
        assets.map((url,) => {
          return cache.add(url,).catch((err,) => {
            console.warn(`[SW-CACHE] Failed to cache resource: ${url}`, err,);
          },);
        },),
      );
    },).then(() => self.skipWaiting()),
  );
}

/**
 * Service worker activation handler for cleaning up obsolete caches.
 */
export function handleCacheActivate(event: ExtendableEvent,): void {
  console.log("[SW-CACHE] Activating Service Worker and cleaning old caches...",);
  event.waitUntil(
    caches.keys().then((cacheNames,) => {
      return Promise.all(
        cacheNames.map((cache,) => {
          if (cache !== CACHE_NAME && cache.startsWith("browsertorrent-",)) {
            console.log(`[SW-CACHE] Removing old cache: ${cache}`,);
            return caches.delete(cache,);
          }
        },),
      );
    },).then(() => self.clients.claim()),
  );
}

/**
 * Network-First fetch handler with CacheStorage fallback.
 */
export async function handleCacheFetch(
  event: FetchEvent,
): Promise<Response | undefined> {
  if (event.request.method !== "GET") {
    return undefined;
  }

  if (
    !event.request.url.startsWith(self.location.origin,) ||
    event.request.url.includes("/api/",)
  ) {
    return undefined;
  }

  try {
    const networkResponse = await fetch(event.request,);
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME,);
      await cache.put(event.request, responseClone,);
    }
    return networkResponse;
  } catch (_err) {
    const cache = await caches.open(CACHE_NAME,);
    const cachedResponse = await cache.match(event.request,);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response(
      "Resource unavailable offline.",
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", },
      },
    );
  }
}
