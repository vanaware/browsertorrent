// packages/core/src/service-worker/stream-handler.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { handleCacheActivate, handleCacheFetch, handleCacheInstall, } from "./cache.ts";

export interface StreamHandlerOptions {
  prefix?: string;
  cacheAssets?: boolean;
}

/**
 * Guesses media destination type from URL pathname.
 */
export function guessDestination(pathname: string,): string {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname,)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname,)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname,)) return "image";
  return "document";
}

/**
 * Computes the /webtorrent/ URL prefix for stream request interception.
 */
export function getWebTorrentPrefix(scope?: string,): string {
  const baseScope = scope || (typeof self !== "undefined" && self.registration?.scope ? self.registration.scope : "/");
  const pathname = new URL(baseScope, typeof self !== "undefined" ? self.location?.origin || "http://localhost" : "http://localhost",).pathname;
  return (pathname.endsWith("/",) ? pathname : pathname + "/") + "webtorrent/";
}

/**
 * Handles WebTorrent streaming fetch interception using dual MessageChannels.
 */
export function handleStream(
  req: Request,
  url: URL,
  pagePort: MessagePort,
  scope: string,
): Promise<Response> {
  return new Promise<Response>((resolve,) => {
    // Channel for chunks: SW receives (port1), main thread sends (port2)
    const chunkChannel = new MessageChannel();
    const chunkPort1 = chunkChannel.port1;
    const chunkPort2 = chunkChannel.port2;

    // Channel for requests: main thread receives (port1), SW sends (port2)
    const requestChannel = new MessageChannel();
    const requestPort1 = requestChannel.port1;
    const requestPort2 = requestChannel.port2;

    const dest = guessDestination(url.pathname,);

    let bodyController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let closed = false;
    let pendingPullResolve: (() => void) | null = null;
    let pendingPull: Promise<void> = Promise.resolve();

    // ── chunkPort1: receive chunks from main thread ──────────────────
    chunkPort1.onmessage = (ev: MessageEvent,) => {
      const chunk = ev.data;

      if (chunk === null || chunk === false) {
        console.log("[sw-stream] stream END",);
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
          } catch { /* already closed */ }
        }
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        return;
      }

      if (!(chunk instanceof Uint8Array)) {
        console.warn("[sw-stream] unexpected data on chunkPort1:", typeof chunk,);
        return;
      }

      console.log("[sw-stream] chunk received:", chunk.byteLength, "bytes",);
      if (bodyController) {
        try {
          bodyController.enqueue(chunk,);
        } catch (err) {
          console.error("[sw-stream] enqueue error:", err,);
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

    // ── requestPort2: receive response headers and stream signal ──────
    requestPort2.onmessage = (ev: MessageEvent,) => {
      const data = ev.data;
      console.log("[sw-stream] requestPort2 received:", typeof data, data?.body,);

      if (data === null || data === undefined) {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(new Response("Stream unavailable", { status: 503, },),);
        return;
      }

      const metadata = data;

      if (metadata.body !== "STREAM") {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(
          new Response(String(metadata.body ?? "",), {
            status: metadata.status ?? 200,
            headers: new Headers(metadata.headers ?? {},),
          },),
        );
        return;
      }

      const headers = new Headers(metadata.headers ?? {},);

      function doPull(
        _controller: ReadableStreamDefaultController<Uint8Array>,
      ) {
        if (closed || pendingPullResolve !== null) return;
        chunkPort1.postMessage(true,);
        pendingPull = new Promise<void>((resolve,) => {
          pendingPullResolve = resolve;
        },);

        const timeout = setTimeout(() => {
          if (pendingPullResolve) {
            console.warn("[sw-stream] chunk pull timeout — closing stream",);
            closed = true;
            pendingPullResolve = null;
            pendingPull = Promise.resolve();
            if (bodyController) {
              try {
                bodyController.close();
              } catch { /* already closed */ }
            }
            chunkPort1.close();
            chunkPort2.close();
            requestPort1.close();
            requestPort2.close();
          }
        }, 10_000,);
        pendingPull = pendingPull.finally(() => clearTimeout(timeout,));
      }

      const bodyStream = new ReadableStream<Uint8Array>({
        start(controller,) {
          bodyController = controller;
          doPull(controller,);
        },

        async pull(controller,) {
          if (pendingPullResolve) {
            await pendingPull;
          }
          if (closed) {
            try {
              controller.close();
            } catch { /* closed */ }
            return;
          }
          doPull(controller,);
        },

        cancel() {
          console.log("[sw-stream] stream cancel",);
          closed = true;
          chunkPort1.postMessage(false,);
          chunkPort1.close();
          chunkPort2.close();
          requestPort1.close();
          requestPort2.close();
        },
      },);

      resolve(
        new Response(bodyStream, {
          status: metadata.status ?? 200,
          headers,
        },),
      );
    };

    requestPort2.start?.();

    // ── Forward stream request to main thread ─────────────────────────
    pagePort.postMessage(
      {
        type: "webtorrent-request",
        url: url.pathname,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries(),),
        scope,
        destination: dest,
      },
      [chunkPort2, requestPort1,],
    );
  },);
}

/**
 * Initializes all event listeners on ServiceWorkerGlobalScope for BrowserTorrent P2P streaming and caching.
 */
export function initStreamingServiceWorker(options: StreamHandlerOptions = {}): void {
  const requestQueue: Array<{ resolve: (r: Response,) => void; req: Request; url: URL }> = [];
  let pagePort: MessagePort | null = null;

  self.addEventListener("install", (e: ExtendableEvent,) => {
    if (options.cacheAssets !== false) {
      handleCacheInstall(e,);
    } else {
      self.skipWaiting();
    }
  },);

  self.addEventListener("activate", (e: ExtendableEvent,) => {
    if (options.cacheAssets !== false) {
      handleCacheActivate(e,);
    } else {
      e.waitUntil(self.clients.claim(),);
    }
  },);

  self.addEventListener("message", (e: ExtendableMessageEvent,) => {
    const { data, } = e;
    if (data?.type === "PORT") {
      pagePort = e.ports[0]!;
      console.log("[sw] pagePort received",);
      processQueue();
    }
  },);

  self.addEventListener("fetch", (e: FetchEvent,) => {
    const url = new URL(e.request.url,);
    const prefix = options.prefix || getWebTorrentPrefix();

    if (!url.pathname.startsWith(prefix,)) {
      if (options.cacheAssets !== false) {
        const cachePromise = handleCacheFetch(e,);
        e.respondWith(
          cachePromise.then((resp,) => resp || fetch(e.request,),),
        );
      }
      return;
    }

    console.log("[sw] stream fetch intercepted:", url.pathname,);

    if (!pagePort) {
      e.respondWith(
        new Promise<Response>((resolve,) => {
          requestQueue.push({ resolve, req: e.request, url, },);
        },),
      );
      return;
    }

    e.respondWith(handleStream(e.request, url, pagePort, self.registration.scope,),);
  },);

  async function processQueue() {
    while (requestQueue.length > 0 && pagePort) {
      const item = requestQueue.shift()!;
      const resp = await handleStream(
        item.req,
        item.url,
        pagePort,
        self.registration.scope,
      );
      item.resolve(resp,);
    }
  }
}
