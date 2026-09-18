/* BrowserTorrent v0.0.102-mu72e0l8 */

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// packages/service-worker/src/sw.ts
var requestQueue = [];
var pagePort = null;
function getScope() {
  return self.registration.scope;
}
__name(getScope, "getScope");
function getWebTorrentPrefix() {
  const scope = getScope();
  const base = new URL(scope).pathname;
  return (base.endsWith("/") ? base : base + "/") + "webtorrent/";
}
__name(getWebTorrentPrefix, "getWebTorrentPrefix");
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
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
  const prefix = getWebTorrentPrefix();
  if (!url.pathname.startsWith(prefix)) return;
  console.log("[sw] fetch intercepted:", url.pathname, "prefix:", prefix);
  if (!pagePort) {
    e.respondWith(new Promise((resolve) => {
      requestQueue.push({
        resolve,
        url
      });
    }));
    return;
  }
  e.respondWith(handleStream(e.request, url));
});
async function processQueue() {
  while (requestQueue.length > 0) {
    const item = requestQueue.shift();
    const fakeReq = new Request(item.url.toString());
    const resp = await handleStream(fakeReq, item.url);
    item.resolve(resp);
  }
}
__name(processQueue, "processQueue");
function guessDestination(pathname) {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname)) return "image";
  return "document";
}
__name(guessDestination, "guessDestination");
function handleStream(req, url) {
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
        console.log("[sw] stream END");
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
        console.warn("[sw] unexpected data on chunkPort1:", typeof chunk);
        return;
      }
      console.log("[sw] chunk received:", chunk.byteLength, "bytes");
      if (bodyController) {
        try {
          bodyController.enqueue(chunk);
        } catch (err) {
          console.error("[sw] enqueue error:", err);
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
    console.log("[sw] chunkPort1 started");
    requestPort2.onmessage = (ev) => {
      const data = ev.data;
      console.log("[sw] requestPort2 received:", typeof data, data?.body);
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
        console.log("[sw] non-stream response:", metadata.body);
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
      console.log("[sw] STREAM response, building ReadableStream\u2026");
      const headers = new Headers(metadata.headers ?? {});
      function doPull(controller) {
        if (closed || pendingPullResolve !== null) return;
        console.log("[sw] doPull: requesting chunk from main");
        chunkPort1.postMessage(true);
        console.log("[sw] doPull: chunkPort1.postMessage(true) called");
        pendingPull = new Promise((resolve2) => {
          pendingPullResolve = resolve2;
        });
        const timeout = setTimeout(() => {
          if (pendingPullResolve) {
            console.warn("[sw] chunk timeout \u2014 closing stream");
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
          console.log("[sw] stream start, requesting first chunk");
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
          console.log("[sw] stream cancel");
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
    console.log("[sw] requestPort2 started");
    console.log("[sw] \u2192 forwarding request to main:", url.pathname);
    pagePort.postMessage({
      type: "webtorrent-request",
      url: url.pathname,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      scope: getScope(),
      destination: dest
    }, [
      chunkPort2,
      requestPort1
    ]);
    console.log("[sw] ports transferred to main");
  });
}
__name(handleStream, "handleStream");
//# sourceMappingURL=sw.js.map
