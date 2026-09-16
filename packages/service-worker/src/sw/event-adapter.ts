// monorepo/service-worker/src/sw/event-adapter.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { EventBus, } from "@browsertorrent/utils/eventbus";
import { APP_VERSION, } from "@browsertorrent/utils/config";
import { addDebugLog, } from "@browsertorrent/utils/debug";

// === HANDLERS NATIVOS EXISTENTES (INFRAESTRUTURA) ===
import { handleActivate, handleCacheFetch, handleInstall, } from "./cache.ts";

/**
 * Inicializa a Fronteira de Eventos do Service Worker.
 * Este é o ÚNICO ponto onde addEventListener nativos devem ser registrados no SW.
 */
export function initializeSwEventAdapter() {
  addDebugLog(
    `[SW-ADAPTER] 🌌 Inicializando Adaptador de Eventos do SW (v${APP_VERSION}).`,
  );

  // ==========================================
  // 1. LIFECYCLE EVENTS
  // ==========================================
  self.addEventListener("install", (event,) => {
    handleInstall(event,);
  },);

  self.addEventListener("activate", (event,) => {
    handleActivate(event,);
  },);

  // ==========================================
  // 2. FETCH EVENT
  // ==========================================
  self.addEventListener("fetch", (event: FetchEvent,) => {
    const url = new URL(event.request.url,);
    // Skip /webtorrent/ URLs — handled by sw.ts streaming handler
    if (url.pathname.startsWith("/webtorrent/",)) return;

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
  self.addEventListener("message", (event: ExtendableMessageEvent,) => {
    if (!event.data) return;
    const { type, payload, } = event.data;

    if (type === "PING_SW_VERSION") {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          type: "PONG_SW_VERSION",
          version: APP_VERSION,
        },);
      }
      return;
    }
  },);

  self.addEventListener("online", (event: Event,) => {
    // ✅ Chave exata do EventMap
    EventBus.emit("browsertorrent:network:online",);
    //handleOnline(event,);
  },);

  self.addEventListener("offline", (event: Event,) => {
    // ✅ Chave exata do EventMap
    EventBus.emit("browsertorrent:network:offline",);
  },);

  addDebugLog(
    `[SW-ADAPTER] ✅ Adaptador de Eventos inicializado e listeners nativos acoplados.`,
  );
}

/**
 * Helper para broadcast de mensagens para todas as janelas/abas do app.
 */
async function broadcastToClients(message: unknown,) {
  if (
    typeof self !== "undefined" && self.clients &&
    typeof self.clients.matchAll === "function"
  ) {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    },);
    clients.forEach((client,) => client.postMessage(message,));
  }
}
