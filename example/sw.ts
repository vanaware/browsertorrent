/**
 * sw.ts — Service Worker para streaming P2P.
 *
 * Arquitetura de portas (3 portas):
 *
 *   chunkChannel.port1  = SW (recebe chunks de main)
 *   chunkChannel.port2  = main (envia chunks para SW)
 *   requestChannel.port1 = main (recebe requests do SW)
 *   requestChannel.port2 = SW (envia requests para main)
 *
 *   O SW MANTÉM as referências que ele precisa usar (port1 do chunkChannel,
 *   port2 do requestChannel). As outras duas são transferidas para main.
 *
 * Fluxo:
 *   1. SW intercepta fetch → cria 2 MessageChannels
 *   2. SW envia requestChannel.port1 + chunkChannel.port2 para main via pagePort
 *   3. main responde metadata na requestChannel.port1
 *   4. SW cria ReadableStream e resolve respondWith()
 *   5. Browser puxa: SW pede chunk via chunkChannel.port1.postMessage(true)
 *   6. main responde com chunk via chunkChannel.port2.postMessage(Uint8Array)
 *   7. SW enqueue → repeat until null → close
 */
/// <reference lib="dom" />
const SW_SCOPE = "/";

declare const self: ServiceWorkerGlobalScope;

// ─── Estado ──────────────────────────────────────────────────────────

const requestQueue: Array<{ resolve: (r: Response) => void; url: URL }> = [];
let pagePort: MessagePort | null = null;

// ─── Registro ─────────────────────────────────────────────────────────

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e: ExtendableEvent) => {
  e.waitUntil(self.clients.claim());
});

// ─── Conexão com a página ────────────────────────────────────────────

self.addEventListener("message", (e: ExtendableMessageEvent) => {
  const { data } = e;
  if (data?.type === "PORT") {
    pagePort = e.ports[0]!;
    console.log("[sw] pagePort received");
    processQueue();
  }
});

// ─── Fetch handler ───────────────────────────────────────────────────

self.addEventListener("fetch", (e: FetchEvent) => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith("/webtorrent/")) return;
  console.log("[sw] fetch intercepted:", url.pathname);
  if (!pagePort) {
    e.respondWith(
      new Promise<Response>((resolve) => {
        requestQueue.push({ resolve, url });
      }),
    );
    return;
  }
  e.respondWith(handleStream(e.request, url));
});

async function processQueue() {
  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!;
    const fakeReq = new Request(item.url.toString());
    const resp = await handleStream(fakeReq, item.url);
    item.resolve(resp);
  }
}

function guessDestination(pathname: string): string {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname)) return "image";
  return "document";
}

/**
 * Fluxo completo:
 *
 *   SW cria chunkChannel + requestChannel
 *   → pagePort.postMessage(REQUEST, [chunkPort2, requestPort1])
 *   main recebe: chunkPort2 (para enviar chunks) + requestPort1 (para receber requests)
 *   main responde: requestPort1.postMessage({ body: "STREAM", ... })
 *   SW cria ReadableStream → resolve Response
 *   SW pede chunk: chunkPort1.postMessage(true)
 *   main responde: chunkPort2.postMessage(Uint8Array)
 *   SW enqueue → null → close
 */
function handleStream(req: Request, url: URL): Promise<Response> {
  return new Promise<Response>((resolve) => {
    // Canal para chunks: SW recebe (port1), main envia (port2)
    const chunkChannel = new MessageChannel();
    const chunkPort1 = chunkChannel.port1; // SW usa para receber chunks
    const chunkPort2 = chunkChannel.port2; // main usa para enviar chunks

    // Canal para requests: main recebe (port1), SW envia (port2)
    const requestChannel = new MessageChannel();
    const requestPort1 = requestChannel.port1; // main usa para receber requests
    const requestPort2 = requestChannel.port2; // SW usa para enviar requests

    const dest = guessDestination(url.pathname);

    // ── chunkPort1: receber chunks de main ─────────────────────────────
    chunkPort1.onmessage = (ev: MessageEvent) => {
      const chunk = ev.data;

      if (chunk === null || chunk === false) {
        console.log("[sw] stream END");
        closed = true;
        if (pendingPullResolve) {
          const r = pendingPullResolve!;
          pendingPullResolve = null;
          pendingPull = Promise.resolve();
          r();
        }
        if (bodyController) {
          try { bodyController.close(); } catch { /* already closed */ }
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
        try { bodyController.enqueue(chunk); } catch (err) {
          console.error("[sw] enqueue error:", err);
        }
      }

      if (pendingPullResolve) {
        const r = pendingPullResolve!;
        pendingPullResolve = null;
        pendingPull = Promise.resolve();
        r();
      }
    };

    chunkPort1.start?.();
    console.log("[sw] chunkPort1 started, readyState:", chunkPort1.readyState);

    // ── requestPort2: receber resposta de main (metadata) ─────────────
    requestPort2.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      console.log("[sw] requestPort2 received:", typeof data, data?.body);

      if (data === null || data === undefined) {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(new Response("Stream unavailable", { status: 503 }));
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
          headers: new Headers(metadata.headers ?? {}),
        }));
        return;
      }

      // ── Streaming response ─────────────────────────────────────────
      console.log("[sw] STREAM response, building ReadableStream…");
      const headers = new Headers(metadata.headers ?? {});
      let bodyController: ReadableStreamDefaultController<Uint8Array> | null = null;
      let closed = false;
      let pendingPullResolve: (() => void) | null = null;
      let pendingPull: Promise<void> = Promise.resolve();

      function doPull(controller: ReadableStreamDefaultController<Uint8Array>) {
        if (closed || pendingPullResolve !== null) return;
        console.log("[sw] doPull: chunkPort1 readyState:", chunkPort1.readyState);
        console.log("[sw] → requesting chunk from main");
        chunkPort1.postMessage(true);
        console.log("[sw] doPull: chunkPort1.postMessage(true) called");
        pendingPull = new Promise<void>((resolve) => {
          pendingPullResolve = resolve;
        });

        const timeout = setTimeout(() => {
          if (pendingPullResolve) {
            console.warn("[sw] chunk timeout — closing stream");
            closed = true;
            pendingPullResolve = null;
            pendingPull = Promise.resolve();
            if (bodyController) {
              try { bodyController.close(); } catch { /* already closed */ }
            }
            chunkPort1.close();
            chunkPort2.close();
            requestPort1.close();
            requestPort2.close();
          }
        }, 10_000);
        pendingPull = pendingPull.finally(() => clearTimeout(timeout));
      }

      const bodyStream = new ReadableStream<Uint8Array>({
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
            try { controller.close(); } catch { /* closed */ }
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
        },
      });

      resolve(new Response(bodyStream, {
        status: metadata.status ?? 200,
        headers,
      }));
    };

    requestPort2.start?.();
    console.log("[sw] requestPort2 started, readyState:", requestPort2.readyState);

    // ── Enviar request para main com as 2 portas que main precisa ─────
    console.log("[sw] → forwarding request to main:", url.pathname);
    pagePort!.postMessage(
      {
        type: "webtorrent-request",
        url: url.pathname,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        scope: SW_SCOPE,
        destination: dest,
      },
      [chunkPort2, requestPort1], // main recebe ambas as portas
    );
    console.log("[sw] ports transferred to main, chunkPort1 readyState:", chunkPort1.readyState, "requestPort2 readyState:", requestPort2.readyState);
  });
}
