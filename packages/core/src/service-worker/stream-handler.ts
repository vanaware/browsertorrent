// packages/core/src/service-worker/stream-handler.ts
declare const self: {
  registration?: { scope?: string };
  location?: { origin?: string };
};

/**
 * Configuration options for creating a WebTorrent Service Worker stream handler.
 */
export interface StreamHandlerOptions {
  /** Optional custom URL path prefix to intercept (defaults to `"/webtorrent/"`). */
  prefix?: string;
}

/**
 * Service Worker fetch handler interface providing interception and streaming bridge logic.
 */
export interface WebTorrentFetchHandler {
  /**
   * Sets or updates the active MessagePort connected to the client window.
   */
  setPagePort: (port: MessagePort) => void;

  /**
   * Returns the current active MessagePort, or `null` if disconnected.
   */
  getPagePort: () => MessagePort | null;

  /**
   * Tests whether an incoming URL or Request targets the streaming interceptor prefix.
   */
  isStreamRequest: (urlOrRequest: URL | Request | string) => boolean;

  /**
   * Intercepts a Service Worker FetchEvent and streams data from the main thread torrent engine.
   */
  handleFetch: (event: FetchEvent) => Promise<Response> | null;

  /**
   * Handles low-level stream reading with HTTP 206 Partial Content range requests and backpressure.
   */
  handleStream: (
    req: Request,
    url: URL,
    port: MessagePort,
    scope: string,
  ) => Promise<Response>;
}

/**
 * Guesses the HTML5 media category (`"video"`, `"audio"`, `"image"`, or `"document"`)
 * based on the file extension of the requested URL.
 *
 * @param pathname - URL path string.
 * @returns `"video" | "audio" | "image" | "document"`.
 *
 * @example
 * ```ts
 * import { guessDestination } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * guessDestination("/webtorrent/abc/video.mp4"); // "video"
 * ```
 */
export function guessDestination(pathname: string): string {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname)) return "image";
  return "document";
}

/**
 * Computes the normalized `/webtorrent/` URL prefix used by the streaming interceptor
 * for a given Service Worker registration scope.
 *
 * @param scope - Base URL scope of the Service Worker.
 * @returns Prefix string ending with `/webtorrent/`.
 *
 * @example
 * ```ts
 * import { getWebTorrentPrefix } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * getWebTorrentPrefix("/"); // "/webtorrent/"
 * ```
 */
export function getWebTorrentPrefix(scope?: string): string {
  const baseScope = scope ||
    (typeof self !== "undefined" && self.registration?.scope
      ? self.registration.scope
      : "/");
  const pathname = new URL(
    baseScope,
    typeof self !== "undefined" && self.location?.origin
      ? self.location.origin
      : "http://localhost",
  ).pathname;
  return (pathname.endsWith("/") ? pathname : pathname + "/") + "webtorrent/";
}

/**
 * Determines whether an incoming URL or HTTP Request targets the WebTorrent streaming interceptor.
 *
 * @param urlOrRequest - URL string, {@link URL} object, or {@link Request} object to check.
 * @param scope - Optional custom Service Worker scope.
 * @returns `true` if the request matches the streaming prefix.
 *
 * @example
 * ```ts
 * import { isWebTorrentStreamRequest } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * if (isWebTorrentStreamRequest(event.request)) {
 *   // Intercept streaming fetch
 * }
 * ```
 */
export function isWebTorrentStreamRequest(
  urlOrRequest: URL | Request | string,
  scope?: string,
): boolean {
  const urlString = typeof urlOrRequest === "string"
    ? urlOrRequest
    : urlOrRequest instanceof Request
    ? urlOrRequest.url
    : urlOrRequest.href;
  const url = new URL(
    urlString,
    typeof self !== "undefined" && self.location?.origin
      ? self.location.origin
      : "http://localhost",
  );
  const prefix = getWebTorrentPrefix(scope);
  return url.pathname.startsWith(prefix);
}

/**
 * Handles WebTorrent streaming fetch interception using dual `MessageChannel`s with backpressure.
 *
 * Exchanges messages between the Service Worker and the client window page to fulfill
 * HTTP 206 Partial Content range requests and standard full downloads.
 *
 * @param req - The incoming fetch {@link Request}.
 * @param url - The parsed {@link URL}.
 * @param pagePort - The {@link MessagePort} connected to the main thread.
 * @param scope - Service Worker registration scope URL.
 * @returns A promise resolving to an HTTP {@link Response} stream.
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

    let bodyController: ReadableStreamDefaultController<Uint8Array> | null =
      null;
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
        console.warn(
          "[sw-stream] unexpected data on chunkPort1:",
          typeof chunk,
        );
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
      console.log(
        "[sw-stream] requestPort2 received:",
        typeof data,
        data?.body,
      );

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
 * Creates a complete WebTorrent streaming fetch interceptor handler for any Service Worker.
 *
 * Decouples BitTorrent streaming logic from static caching, lifecycle events, and offline PWA assets.
 * Handles incoming `FetchEvent` requests matching `/webtorrent/` and queries the main thread
 * via {@link MessagePort} for chunk data.
 *
 * @param options - Interceptor options, including optional custom prefix.
 * @returns A {@link WebTorrentFetchHandler} instance with methods `setPagePort`, `isStreamRequest`, and `handleFetch`.
 *
 * @example
 * ```ts
 * import { createWebTorrentFetchHandler } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const handler = createWebTorrentFetchHandler();
 *
 * self.addEventListener("message", (event) => {
 *   if (event.data?.type === "PORT") {
 *     handler.setPagePort(event.ports[0]);
 *   }
 * });
 *
 * self.addEventListener("fetch", (event) => {
 *   if (handler.isStreamRequest(event.request)) {
 *     const responsePromise = handler.handleFetch(event);
 *     if (responsePromise) event.respondWith(responsePromise);
 *   }
 * });
 * ```
 */
export function createWebTorrentFetchHandler(
  options: StreamHandlerOptions = {},
): WebTorrentFetchHandler {
  const requestQueue: Array<
    { resolve: (r: Response,) => void; req: Request; url: URL }
  > = [];
  let pagePort: MessagePort | null = null;

  function setPagePort(port: MessagePort,): void {
    pagePort = port;
    console.log("[sw-fetch-handler] pagePort attached",);
    processQueue();
  }

  function getPagePort(): MessagePort | null {
    return pagePort;
  }

  function isStreamRequest(urlOrRequest: URL | Request | string,): boolean {
    return isWebTorrentStreamRequest(urlOrRequest, options.prefix,);
  }

  function handleFetch(event: FetchEvent,): Promise<Response> | null {
    const url = new URL(event.request.url,);
    if (!isStreamRequest(url,)) {
      return null;
    }

    console.log("[sw-fetch-handler] intercepting stream fetch:", url.pathname,);

    if (!pagePort) {
      return new Promise<Response>((resolve,) => {
        requestQueue.push({ resolve, req: event.request, url, },);
      },);
    }

    const scope = (typeof self !== "undefined" && self.registration?.scope)
      ? self.registration.scope
      : "/";
    return handleStream(event.request, url, pagePort, scope,);
  }

  async function processQueue(): Promise<void> {
    const scope = (typeof self !== "undefined" && self.registration?.scope)
      ? self.registration.scope
      : "/";
    while (requestQueue.length > 0 && pagePort) {
      const item = requestQueue.shift()!;
      const resp = await handleStream(
        item.req,
        item.url,
        pagePort,
        scope,
      );
      item.resolve(resp,);
    }
  }

  return {
    setPagePort,
    getPagePort,
    isStreamRequest,
    handleFetch,
    handleStream: (req: Request, url: URL, port: MessagePort, scope: string,) =>
      handleStream(req, url, port, scope,),
  };
}
