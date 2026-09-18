// packages/core/src/service-worker/register.ts
import { VERSION, } from "../version.ts";

export interface ServiceWorkerRegisterOptions {
  scriptUrl?: string;
  scope?: string;
  version?: string;
}

/**
 * Checks whether the current browser environment supports Service Workers.
 */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Registers the BrowserTorrent Service Worker with scope detection and versioning.
 */
export async function registerServiceWorker(
  options: ServiceWorkerRegisterOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.warn("[BrowserTorrent] Service Workers are not supported in this environment.",);
    return null;
  }

  let basePath = options.scope || (typeof globalThis !== "undefined" && globalThis.location ? globalThis.location.pathname : "/");
  if (basePath.split("/",).pop()?.includes(".",)) {
    basePath = basePath.substring(0, basePath.lastIndexOf("/",) + 1,);
  } else if (!basePath.endsWith("/",)) {
    basePath += "/";
  }

  const ver = options.version || VERSION;
  const scriptName = options.scriptUrl || `${basePath}sw.js`;
  const finalUrl = scriptName.includes("?",) ? `${scriptName}&v=${ver}` : `${scriptName}?v=${ver}`;

  try {
    const registration = await navigator.serviceWorker.register(finalUrl, {
      scope: basePath,
    },);

    await navigator.serviceWorker.ready;
    console.log(`[BrowserTorrent] Service Worker ready with scope: ${basePath}`,);
    return registration;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err,);
    console.error("[BrowserTorrent] Failed to register Service Worker:", message,);
    throw new Error(`Failed to register Service Worker: ${message}`,);
  }
}
