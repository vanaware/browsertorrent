// packages/core/src/service-worker/register.ts
import { VERSION, } from "../version.ts";

/**
 * Options for registering the streaming Service Worker.
 */
export interface ServiceWorkerRegisterOptions {
  /** Target URL of the service worker script (defaults to `${scope}sw.js`). */
  scriptUrl?: string;
  /** Registration scope URL prefix (defaults to base pathname). */
  scope?: string;
  /** Cache-busting version query string attached to the script URL. */
  version?: string;
}

/**
 * Checks whether the current browser environment supports Service Workers.
 *
 * @returns `true` if `navigator.serviceWorker` is available.
 */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Registers the BrowserTorrent Service Worker with automatic scope detection and cache-busting versioning.
 *
 * @param options - Registration and script path configuration.
 * @returns The active {@link ServiceWorkerRegistration}, or `null` if unsupported.
 *
 * @example
 * ```ts
 * import { registerServiceWorker } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const reg = await registerServiceWorker({
 *   scriptUrl: "./sw.js",
 *   scope: "./",
 * });
 * ```
 */
export async function registerServiceWorker(
  options: ServiceWorkerRegisterOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.warn(
      "[BrowserTorrent] Service Workers are not supported in this environment.",
    );
    return null;
  }

  let basePath = options.scope ||
    (typeof globalThis !== "undefined" && globalThis.location
      ? globalThis.location.pathname
      : "/");
  if (basePath.split("/",).pop()?.includes(".",)) {
    basePath = basePath.substring(0, basePath.lastIndexOf("/",) + 1,);
  } else if (!basePath.endsWith("/",)) {
    basePath += "/";
  }

  const ver = options.version || VERSION;
  const scriptName = options.scriptUrl || `${basePath}sw.js`;
  const finalUrl = scriptName.includes("?",)
    ? `${scriptName}&v=${ver}`
    : `${scriptName}?v=${ver}`;

  try {
    const registration = await navigator.serviceWorker.register(finalUrl, {
      scope: basePath,
    },);

    await navigator.serviceWorker.ready;
    console.log(
      `[BrowserTorrent] Service Worker ready with scope: ${basePath}`,
    );
    return registration;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err,);
    console.error(
      "[BrowserTorrent] Failed to register Service Worker:",
      message,
    );
    throw new Error(`Failed to register Service Worker: ${message}`,);
  }
}
