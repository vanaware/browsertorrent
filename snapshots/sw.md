> **AI INSTRUCTION:** 
> O texto abaixo contém experimentos e código da área de @workerDB/service-worker
> Each file starts with a title indicating its exact relative path (e.g., `## File: src/main.ts`).
> Whenever suggesting changes, clearly indicate which file should be modified based on these paths and provide the complete new code for the file.

---

# Exported Context from Project BrowserTorrent [v0.1.2#mv5nijrw] - Mode: SW

Automatically generated at: 2026-10-12T19:34:55.483Z

---

## File: `packages/service-worker/deno.jsonc`

```json
{
  "name": "@browsertorrent/service-worker",
  "compilerOptions": {
    "lib": [
      "dom",
      "dom.iterable",
      "dom.asynciterable",
      "esnext",
      "deno.ns",
      "webworker"
    ],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/fs": "jsr:@std/fs@^1",
    "@std/path": "jsr:@std/path@^1"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --allow-write src/",
    "check": "deno check src/**/*.ts",
    "build": "deno run -A ../../scripts/esbuild.ts sw",
    "tests": "deno task check && deno task test"
  },
  "exports": {
    ".": "./src/mod.ts"
  }
}

```

---

## File: `packages/service-worker/src/cache.ts`

```ts
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

export const ASSETS_TO_CACHE: string[] =
  typeof __GENERATED_ASSETS__ !== "undefined" ? __GENERATED_ASSETS__ : [];

/**
 * Service Worker install event handler. Caches app shell assets.
 */
export function handleInstall(event: ExtendableEvent,): void {
  console.log(
    "[SW-CACHE] Installing Service Worker and caching assets...",
    CACHE_NAME,
  );
  event.waitUntil(
    (async () => {
      if (ASSETS_TO_CACHE.length > 0) {
        const cache = await caches.open(CACHE_NAME,);
        await Promise.all(
          ASSETS_TO_CACHE.map((url,) =>
            cache.add(url,).catch((err,) => {
              console.warn(`[SW-CACHE] Asset cache warning for ${url}:`, err,);
            },)
          ),
        );
      }
      await self.skipWaiting();
    })(),
  );
}

/**
 * Service Worker activate event handler. Cleans up outdated caches.
 */
export function handleActivate(event: ExtendableEvent,): void {
  console.log("[SW-CACHE] Activating Service Worker...", CACHE_NAME,);
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cache,) => {
          if (
            cache !== CACHE_NAME && cache.startsWith("browsertorrent-cache-",)
          ) {
            console.log(`[SW-CACHE] Purging old cache: ${cache}`,);
            return caches.delete(cache,);
          }
          return Promise.resolve(false,);
        },),
      );
      await self.clients.claim();
    })(),
  );
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
  if (!event.request.url.startsWith(self.location.origin,)) {
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
    return undefined;
  }
}

```

---

## File: `packages/service-worker/src/mod.ts`

```ts
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

```

---

## File: `packages/service-worker/src/sw.ts`

```ts
// packages/service-worker/src/sw.ts
/**
 * BrowserTorrent Reference Service Worker Implementation.
 * Demonstrates how to combine the @vanaware/browsertorrent streaming runtime
 * with standard PWA application caching, install, and activation events.
 */
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { createWebTorrentFetchHandler, } from "@vanaware/browsertorrent/service-worker";
import { handleActivate, handleCacheFetch, handleInstall, } from "./cache.ts";

// Initialize the WebTorrent stream interception handler from core
const torrentStreamHandler = createWebTorrentFetchHandler();

// Standard SW Install Lifecycle
self.addEventListener("install", (e: ExtendableEvent,) => {
  handleInstall(e,);
},);

// Standard SW Activation & Cache Invalidation Lifecycle
self.addEventListener("activate", (e: ExtendableEvent,) => {
  handleActivate(e,);
},);

// Intercept Port handshake from the main window (TorrentProvider)
self.addEventListener("message", (e: ExtendableMessageEvent,) => {
  const { data, } = e;
  if (data?.type === "PORT" && e.ports[0]) {
    torrentStreamHandler.setPagePort(e.ports[0],);
  }
},);

// Fetch Dispatcher: route /webtorrent/ streams to core, all other requests to cache/network
self.addEventListener("fetch", (e: FetchEvent,) => {
  // 1. BitTorrent P2P Streaming Request Check
  const streamPromise = torrentStreamHandler.handleFetch(e,);
  if (streamPromise) {
    e.respondWith(streamPromise,);
    return;
  }

  // 2. Application shell & static assets cache fallback
  e.respondWith(
    handleCacheFetch(e,).then((response,) => response || fetch(e.request,)),
  );
},);

```

---

