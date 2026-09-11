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
