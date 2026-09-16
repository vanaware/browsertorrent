// monorepo/service-worker/src/service-worker.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { initializeSwEventAdapter, } from "./sw/event-adapter.ts";
import { APP_VERSION, } from "@browsertorrent/utils/config";

console.log(
  `[SW] 🌌 Service Worker orquestrador carregado (v${APP_VERSION}).`,
);

// Inicializa a Fronteira de Eventos.
// Toda a lógica de addEventListener, roteamento de fetch, message, push, etc.
// agora vive dentro do event-adapter.ts.
initializeSwEventAdapter();
