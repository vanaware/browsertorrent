> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém experimentos e código da área de @browsertorrent/service-worker
> O projeto é o **BrowserTorrent [vdev] ** estruturado em bbrowsertorrents. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent [vdev] - Modo: SW

Gerado automaticamente em: 9/12/2026, 8:09:19 PM

---

## Arquivo: `packages/service-worker/deno.jsonc`

```json
{
  "name": "@browsertorrent/service-worker",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns", "webworker"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/fs": "jsr:@std/fs@^1",
    "@std/http": "jsr:@std/http@^1",
    "@std/path": "jsr:@std/path@^1",
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    "fflate": "https://esm.sh/fflate@0.8.2?target=es2022",
    "fake-indexeddb": "https://esm.sh/fake-indexeddb@6.2.5?bundle",
    "fake-indexeddb/auto": "https://esm.sh/fake-indexeddb@6.2.5/auto?bundle"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --allow-write tests/",
    "check": "deno check src/**/*.ts tests/**/*.ts",
    "build": "deno run --allow-import --allow-read --allow-write --allow-env --allow-net --env-file --unstable-bundle ../esbuild.ts sw",
    "tests": "deno task check && deno task test"
  },
  "exports": {
    ".": "./src/mod.ts",
    "./utils": "./src/utils/mod.ts",
    "./handshakes/contato": "./src/handshakes/hand-contato.ts",
    "./handshakes/sdp": "./src/handshakes/hand-sdp.ts",
    "./handshakes/profile": "./src/handshakes/hand-profile.ts",
    "./handshakes/mensagem": "./src/handshakes/hand-mensagem.ts"
  }
}

```

---

## Arquivo: `packages/service-worker/src/mod.ts`

```ts
export * from './utils/mod.ts';

```

---

## Arquivo: `packages/service-worker/src/sw/cache.ts`

```ts
// src/sw/cache.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __GENERATED_ASSETS__: string[];

import { APP_VERSION, } from '@browsertorrent/utils/config';

const CACHE_NAME = `browsertorrent-proto-cache-v${APP_VERSION}`;
const ASSETS_TO_CACHE: string[] = typeof __GENERATED_ASSETS__ !== 'undefined'
  ? __GENERATED_ASSETS__
  : [];

/**
 * Handler de instalação do Service Worker.
 * Exportado para ser orquestrado pelo service-worker.ts principal.
 */
export function handleInstall(event: ExtendableEvent,): void {
  console.log('[SW-CACHE] 🛠️ Instalando novo Service Worker...',);
  event.waitUntil(
    caches.open(CACHE_NAME,).then((cache,) => {
      console.log('[SW-CACHE] 📦 Armazenando assets essenciais no cache local...',);
      return Promise.all(
        ASSETS_TO_CACHE.map((url,) => {
          return cache.add(url,).catch((err,) => {
            console.error(`[SW-CACHE] ❌ Falha ao cachear recurso: ${url}`, err,);
          },);
        },),
      );
    },).then(() => self.skipWaiting()),
  );
}

/**
 * Handler de ativação do Service Worker.
 * Exportado para ser orquestrado pelo service-worker.ts principal.
 */
export function handleActivate(event: ExtendableEvent,): void {
  console.log('[SW-CACHE] ✨ Ativando Service Worker e limpando caches antigos...',);
  event.waitUntil(
    caches.keys().then((cacheNames,) => {
      return Promise.all(
        cacheNames.map((cache,) => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW-CACHE] 🗑️ Removendo cache obsoleto: ${cache}`,);
            return caches.delete(cache,);
          }
        },),
      );
    },).then(() => self.clients.claim()),
  );
}

/**
 * Lógica de fetch para cache (Network-First com fallback para Cache).
 * Exportada para ser orquestrada pelo service-worker.ts principal.
 */
export async function handleCacheFetch(event: FetchEvent,): Promise<Response | undefined> {
  // Ignora métodos que não sejam GET
  if (event.request.method !== 'GET') {
    return undefined;
  }

  // Ignora requisições externas à origem ou rotas de API
  if (
    !event.request.url.startsWith(self.location.origin,) || event.request.url.includes('/api/',)
  ) {
    return undefined;
  }

  try {
    // Tenta buscar da rede primeiro
    const networkResponse = await fetch(event.request,);

    // Se for bem-sucedido, clona e salva no cache
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME,);
      await cache.put(event.request, responseClone,);
    }

    return networkResponse;
  } catch (err) {
    // Fallback Offline
    console.log(`[SW-CACHE] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`,);
    const cache = await caches.open(CACHE_NAME,);
    const cachedResponse = await cache.match(event.request,);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response('Você está offline e este recurso não foi mapeado no cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', },
    },);
  }
}

```

---

## Arquivo: `packages/service-worker/src/sw/event-adapter.ts`

```ts
// monorepo/service-worker/src/sw/event-adapter.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { EventBus, } from '@browsertorrent/utils/eventbus';
import { APP_VERSION, } from '@browsertorrent/utils/config';
import { addDebugLog, } from '@browsertorrent/utils/debug';

// === HANDLERS NATIVOS EXISTENTES (INFRAESTRUTURA) ===
import { handleActivate, handleCacheFetch, handleInstall, } from './cache.ts';

/**
 * Inicializa a Fronteira de Eventos do Service Worker.
 * Este é o ÚNICO ponto onde addEventListener nativos devem ser registrados no SW.
 */
export function initializeSwEventAdapter() {
  addDebugLog(`[SW-ADAPTER] 🌌 Inicializando Adaptador de Eventos do SW (v${APP_VERSION}).`,);

  // ==========================================
  // 1. LIFECYCLE EVENTS
  // ==========================================
  self.addEventListener('install', (event,) => {
    handleInstall(event,);
  },);

  self.addEventListener('activate', (event,) => {
    handleActivate(event,);
  },);

  // ==========================================
  // 2. FETCH EVENT
  // ==========================================
  self.addEventListener('fetch', (event: FetchEvent,) => {
    const cachePromise = handleCacheFetch(event,);
    event.respondWith(
      cachePromise.then((response,) => {
        if (response) return response;
        return fetch(event.request,);
      },),
    );
  },);

  // ==========================================
  // 3. MESSAGE EVENT (A MÁGICA DO EVENTBUS)
  // ==========================================
  self.addEventListener('message', (event: ExtendableMessageEvent,) => {
    if (!event.data) return;
    const { type, payload, } = event.data;

    if (type === 'PING_SW_VERSION') {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'PONG_SW_VERSION', version: APP_VERSION, },);
      }
      return;
    }
  },);

  self.addEventListener('online', (event: Event) => {
    // ✅ Chave exata do EventMap
    EventBus.emit('browsertorrent:network:online',);
    //handleOnline(event,);
  },);

  self.addEventListener('offline', (event: Event) => {
    // ✅ Chave exata do EventMap
    EventBus.emit('browsertorrent:network:offline',);
  },);

  addDebugLog(`[SW-ADAPTER] ✅ Adaptador de Eventos inicializado e listeners nativos acoplados.`,);
}

/**
 * Helper para broadcast de mensagens para todas as janelas/abas do app.
 */
async function broadcastToClients(message: unknown,) {
  if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true, },);
    clients.forEach((client,) => client.postMessage(message,));
  }
}

```

---

## Arquivo: `packages/service-worker/src/sw/mod.ts`

```ts
// reservado para futuras exportações

```

---

## Arquivo: `packages/service-worker/src/utils/mod.ts`

```ts
// monorepo/service-worker/src/utils/mod.ts
import { addDebugLog, } from '@browsertorrent/utils/debug';
import { APP_VERSION, } from '@browsertorrent/utils/config';
import { EventBus, } from '@browsertorrent/utils/eventbus';

let uiAdapterInitialized = false;

/**
 * Inicializa a Fronteira de Eventos da UI (Main Thread).
 * Traduz postMessage do SW e eventos nativos do Window para o EventBus da UI.
 */
export function initializeUiEventAdapter() {
  if (uiAdapterInitialized) {
    return;
  }
  uiAdapterInitialized = true;

  addDebugLog(`[UI-ADAPTER] 🌌 Inicializando Adaptador de Eventos da UI.`,);

  // 1. Traduz postMessage do SW -> EventBus da UI
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent,) => {
    if (!event.data) return;
    const { type, payload, } = event.data;

    addDebugLog(`[UI-ADAPTER] 📬 postMessage recebido do SW: type=${type}`,);

    if (type === 'PONG_SW_VERSION') {
      EventBus.emit('sw:notify:pong-version', { version: payload.version, },);
    }
  },);

  // 2. Traduz eventos de rede nativos -> EventBus da UI
  window.addEventListener('online', () => {
    addDebugLog(`[UI-ADAPTER] 🟢 Rede online detectada.`,);
    EventBus.emit('browsertorrent:network:online',);
  },);

  window.addEventListener('offline', () => {
    addDebugLog(`[UI-ADAPTER] 🔴 Rede offline detectada.`,);
    EventBus.emit('browsertorrent:network:offline',);
  },);
  // 3. Traduz ciclo de vida da janela -> EventBus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      EventBus.emit('browsertorrent:app:backgrounded',);
    } else if (document.visibilityState === 'visible') {
      EventBus.emit('browsertorrent:app:foregrounded',);
    }
  },);

  addDebugLog('✅ EventAdapter da UI inicializado e ouvindo fronteiras nativas.',);
}

/**
 * Registra o Service Worker e inicializa o EventAdapter da UI.
 */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog('📡 Verificando suporte ao Service Worker...',);
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker não é suportado neste navegador.',);
  }

  let basePath = globalThis.location.pathname;
  if (basePath.split('/',).pop()?.includes('.',)) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/',) + 1,);
  } else if (!basePath.endsWith('/',)) {
    basePath += '/';
  }

  addDebugLog(`⏳ Registrando Service Worker no escopo: ${basePath}`,);

  try {
    const registration = await navigator.serviceWorker.register(
      `${basePath}service-worker.js?v=${APP_VERSION}`,
      { scope: basePath, },
    );

    if (!registration) {
      throw new Error('Service Worker registration retornou null/undefined',);
    }

    addDebugLog('✅ Service Worker registrado, aguardando ready...',);
    const readyReg = await navigator.serviceWorker.ready;

    // 🔥 Inicializa o EventAdapter da UI assim que o SW estiver pronto
    initializeUiEventAdapter();

    // Checagem Introspectiva de Versão (App vs SW)
    if (readyReg.active) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event,) => {
        if (event.data && event.data.type === 'PONG_SW_VERSION') {
          const swVersion = event.data.version;
          if (swVersion !== APP_VERSION) {
            addDebugLog(
              'warn',
              'SYSTEM',
              `⚠️ Inconsistência de Versão! App v${APP_VERSION} vs SW v${swVersion}.`,
            );
          } else {
            addDebugLog('info', 'SYSTEM', `🔒 Match de versão: App e SW em v${APP_VERSION}.`,);
          }
        }
      };
      readyReg.active.postMessage({ type: 'PING_SW_VERSION', }, [channel.port2,],);
    }

    return readyReg;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    addDebugLog('❌ Erro ao registrar Service Worker: ' + errorMessage);
    throw new Error(`Falha ao registrar Service Worker: ${errorMessage}`);
  }
}

```

---

## Arquivo: `packages/service-worker/src/sw.ts`

```ts
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

```

---

## Arquivo: `packages/service-worker/src/sw-review.ts`

```ts
// monorepo/service-worker/src/service-worker.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { initializeSwEventAdapter, } from './sw/event-adapter.ts';
import { APP_VERSION, } from '@browsertorrent/utils/config';

console.log(`[SW] 🌌 Service Worker orquestrador carregado (v${APP_VERSION}).`,);

// Inicializa a Fronteira de Eventos.
// Toda a lógica de addEventListener, roteamento de fetch, message, push, etc.
// agora vive dentro do event-adapter.ts.
initializeSwEventAdapter();

```

---

