/* BrowserTorrent v0.0.106-mu74q2or */

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// <define:__GENERATED_ASSETS__>
var define_GENERATED_ASSETS_default = ["./main.js", "./worker-db.js", "./webtorrent.min.js", "./index.html"];

// packages/core/src/version.ts
var VERSION = "0.0.106-mu74q2or";

// packages/core/src/service-worker/cache.ts
var CACHE_NAME = `browsertorrent-cache-v${VERSION}`;
function handleCacheInstall(event, assetsToCache) {
  const assets = assetsToCache ?? (typeof define_GENERATED_ASSETS_default !== "undefined" ? define_GENERATED_ASSETS_default : []);
  console.log("[SW-CACHE] Installing Service Worker cache...");
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => {
    console.log("[SW-CACHE] Caching essential resources:", assets.length, "items");
    return Promise.all(assets.map((url) => {
      return cache.add(url).catch((err) => {
        console.warn(`[SW-CACHE] Failed to cache resource: ${url}`, err);
      });
    }));
  }).then(() => self.skipWaiting()));
}
__name(handleCacheInstall, "handleCacheInstall");
function handleCacheActivate(event) {
  console.log("[SW-CACHE] Activating Service Worker and cleaning old caches...");
  event.waitUntil(caches.keys().then((cacheNames) => {
    return Promise.all(cacheNames.map((cache) => {
      if (cache !== CACHE_NAME && cache.startsWith("browsertorrent-")) {
        console.log(`[SW-CACHE] Removing old cache: ${cache}`);
        return caches.delete(cache);
      }
    }));
  }).then(() => self.clients.claim()));
}
__name(handleCacheActivate, "handleCacheActivate");
async function handleCacheFetch(event) {
  if (event.request.method !== "GET") {
    return void 0;
  }
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return void 0;
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
    return new Response("Resource unavailable offline.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}
__name(handleCacheFetch, "handleCacheFetch");

// packages/core/src/service-worker/stream-handler.ts
function guessDestination(pathname) {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname)) return "image";
  return "document";
}
__name(guessDestination, "guessDestination");
function getWebTorrentPrefix(scope) {
  const baseScope = scope || (typeof self !== "undefined" && self.registration?.scope ? self.registration.scope : "/");
  const pathname = new URL(baseScope, typeof self !== "undefined" ? self.location?.origin || "http://localhost" : "http://localhost").pathname;
  return (pathname.endsWith("/") ? pathname : pathname + "/") + "webtorrent/";
}
__name(getWebTorrentPrefix, "getWebTorrentPrefix");
function handleStream(req, url, pagePort, scope) {
  return new Promise((resolve) => {
    const chunkChannel = new MessageChannel();
    const chunkPort1 = chunkChannel.port1;
    const chunkPort2 = chunkChannel.port2;
    const requestChannel = new MessageChannel();
    const requestPort1 = requestChannel.port1;
    const requestPort2 = requestChannel.port2;
    const dest = guessDestination(url.pathname);
    let bodyController = null;
    let closed = false;
    let pendingPullResolve = null;
    let pendingPull = Promise.resolve();
    chunkPort1.onmessage = (ev) => {
      const chunk = ev.data;
      if (chunk === null || chunk === false) {
        console.log("[sw-stream] stream END");
        closed = true;
        if (pendingPullResolve) {
          const r = pendingPullResolve;
          pendingPullResolve = null;
          pendingPull = Promise.resolve();
          r();
        }
        if (bodyController) {
          try {
            bodyController.close();
          } catch {
          }
        }
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        return;
      }
      if (!(chunk instanceof Uint8Array)) {
        console.warn("[sw-stream] unexpected data on chunkPort1:", typeof chunk);
        return;
      }
      console.log("[sw-stream] chunk received:", chunk.byteLength, "bytes");
      if (bodyController) {
        try {
          bodyController.enqueue(chunk);
        } catch (err) {
          console.error("[sw-stream] enqueue error:", err);
        }
      }
      if (pendingPullResolve) {
        const r = pendingPullResolve;
        pendingPullResolve = null;
        pendingPull = Promise.resolve();
        r();
      }
    };
    chunkPort1.start?.();
    requestPort2.onmessage = (ev) => {
      const data = ev.data;
      console.log("[sw-stream] requestPort2 received:", typeof data, data?.body);
      if (data === null || data === void 0) {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(new Response("Stream unavailable", {
          status: 503
        }));
        return;
      }
      const metadata = data;
      if (metadata.body !== "STREAM") {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(new Response(String(metadata.body ?? ""), {
          status: metadata.status ?? 200,
          headers: new Headers(metadata.headers ?? {})
        }));
        return;
      }
      const headers = new Headers(metadata.headers ?? {});
      function doPull(_controller) {
        if (closed || pendingPullResolve !== null) return;
        chunkPort1.postMessage(true);
        pendingPull = new Promise((resolve2) => {
          pendingPullResolve = resolve2;
        });
        const timeout = setTimeout(() => {
          if (pendingPullResolve) {
            console.warn("[sw-stream] chunk pull timeout \u2014 closing stream");
            closed = true;
            pendingPullResolve = null;
            pendingPull = Promise.resolve();
            if (bodyController) {
              try {
                bodyController.close();
              } catch {
              }
            }
            chunkPort1.close();
            chunkPort2.close();
            requestPort1.close();
            requestPort2.close();
          }
        }, 1e4);
        pendingPull = pendingPull.finally(() => clearTimeout(timeout));
      }
      __name(doPull, "doPull");
      const bodyStream = new ReadableStream({
        start(controller) {
          bodyController = controller;
          doPull(controller);
        },
        async pull(controller) {
          if (pendingPullResolve) {
            await pendingPull;
          }
          if (closed) {
            try {
              controller.close();
            } catch {
            }
            return;
          }
          doPull(controller);
        },
        cancel() {
          console.log("[sw-stream] stream cancel");
          closed = true;
          chunkPort1.postMessage(false);
          chunkPort1.close();
          chunkPort2.close();
          requestPort1.close();
          requestPort2.close();
        }
      });
      resolve(new Response(bodyStream, {
        status: metadata.status ?? 200,
        headers
      }));
    };
    requestPort2.start?.();
    pagePort.postMessage({
      type: "webtorrent-request",
      url: url.pathname,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      scope,
      destination: dest
    }, [
      chunkPort2,
      requestPort1
    ]);
  });
}
__name(handleStream, "handleStream");
function initStreamingServiceWorker(options = {}) {
  const requestQueue = [];
  let pagePort = null;
  self.addEventListener("install", (e) => {
    if (options.cacheAssets !== false) {
      handleCacheInstall(e);
    } else {
      self.skipWaiting();
    }
  });
  self.addEventListener("activate", (e) => {
    if (options.cacheAssets !== false) {
      handleCacheActivate(e);
    } else {
      e.waitUntil(self.clients.claim());
    }
  });
  self.addEventListener("message", (e) => {
    const { data } = e;
    if (data?.type === "PORT") {
      pagePort = e.ports[0];
      console.log("[sw] pagePort received");
      processQueue();
    }
  });
  self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    const prefix = options.prefix || getWebTorrentPrefix();
    if (!url.pathname.startsWith(prefix)) {
      if (options.cacheAssets !== false) {
        const cachePromise = handleCacheFetch(e);
        e.respondWith(cachePromise.then((resp) => resp || fetch(e.request)));
      }
      return;
    }
    console.log("[sw] stream fetch intercepted:", url.pathname);
    if (!pagePort) {
      e.respondWith(new Promise((resolve) => {
        requestQueue.push({
          resolve,
          req: e.request,
          url
        });
      }));
      return;
    }
    e.respondWith(handleStream(e.request, url, pagePort, self.registration.scope));
  });
  async function processQueue() {
    while (requestQueue.length > 0 && pagePort) {
      const item = requestQueue.shift();
      const resp = await handleStream(item.req, item.url, pagePort, self.registration.scope);
      item.resolve(resp);
    }
  }
  __name(processQueue, "processQueue");
}
__name(initStreamingServiceWorker, "initStreamingServiceWorker");

// packages/service-worker/src/sw.ts
initStreamingServiceWorker();
//# sourceMappingURL=sw.js.map
