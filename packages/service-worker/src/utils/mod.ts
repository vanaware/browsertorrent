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
  globalThis.addEventListener('online', () => {
    addDebugLog(`[UI-ADAPTER] 🟢 Rede online detectada.`,);
    EventBus.emit('browsertorrent:network:online',);
  },);

  globalThis.addEventListener('offline', () => {
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
