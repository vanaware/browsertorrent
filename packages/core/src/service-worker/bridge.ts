// packages/core/src/service-worker/bridge.ts
import { parseStreamURL, streamManager } from "../server/stream-manager.ts";

/**
 * Guesses the MIME `Content-Type` header from a file name extension.
 *
 * Supports common video, audio, image, and text formats suitable for in-browser streaming.
 *
 * @param name - File name or path (e.g., `"movie.mp4"`, `"track.mp3"`).
 * @returns The matched MIME type string, or `"application/octet-stream"` if unrecognized.
 *
 * @example
 * ```ts
 * import { guessContentType } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const mime = guessContentType("video.mp4"); // "video/mp4"
 * ```
 */
export function guessContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    html: "text/html",
    txt: "text/plain",
    json: "application/json",
    pdf: "application/pdf",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

/**
 * Parses an HTTP `Range` request header (e.g., `"bytes=0-1048575"`) into inclusive start and end byte indices.
 *
 * @param header - Raw `Range` header string received from an HTTP request.
 * @param fileLength - Total length of the requested file in bytes.
 * @returns An object containing `{ start, end }` byte offsets, or `null` if the header is missing, malformed, or out of bounds.
 *
 * @example
 * ```ts
 * import { parseRange } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const range = parseRange("bytes=0-499", 1000);
 * // { start: 0, end: 499 }
 * ```
 */
export function parseRange(
  header: string | undefined,
  fileLength: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const endStr = match[2];
  const end = endStr ? Number(endStr) : fileLength - 1;
  if (!Number.isFinite(start) || start < 0 || start >= fileLength) return null;
  if (!Number.isFinite(end) || end < start || end >= fileLength) return null;
  return { start, end };
}

/**
 * Waits for a Service Worker instance in `installing` or `waiting` state to become `activated`.
 *
 * @param worker - The target {@link ServiceWorker} instance.
 * @returns A promise that resolves when the worker enters the `"activated"` state.
 *
 * @example
 * ```ts
 * import { waitForServiceWorkerActivation } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const reg = await navigator.serviceWorker.register("./sw.js");
 * if (reg.installing) {
 *   await waitForServiceWorkerActivation(reg.installing);
 * }
 * ```
 */
export function waitForServiceWorkerActivation(
  worker: ServiceWorker,
): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === "activated") {
      resolve();
      return;
    }
    const onChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onChange);
        resolve();
      }
    };
    worker.addEventListener("statechange", onChange);
  });
}

/**
 * Backward-compatibility alias for {@link waitForServiceWorkerActivation}.
 */
export const waitForActivation: (worker: ServiceWorker) => Promise<void> =
  waitForServiceWorkerActivation;

/**
 * Options for configuring the low-level Service Worker streaming bridge.
 */
export interface ServiceWorkerBridgeOptions {
  /** Target active ServiceWorker. If omitted, awaits navigator.serviceWorker.ready. */
  worker?: ServiceWorker;
  /** Application scope prefix for stream URL parsing (default: "/"). */
  scope?: string;
}

/**
 * Low-level bridge that connects an active Service Worker to the {@link streamManager} for BitTorrent streaming.
 *
 * Transfers a `MessageChannel` port to the Service Worker (`{ type: "PORT" }`) and sets up a duplex
 * streaming protocol for serving file chunks with backpressure and range requests.
 *
 * @param workerOrOptions - An active {@link ServiceWorker} instance or a {@link ServiceWorkerBridgeOptions} object.
 * @param optionsOrScope - Scope URL string or configuration options when passing a worker instance.
 * @returns The established {@link MessageChannel}, or `null` if Service Workers are unsupported or no active worker is found.
 *
 * @example
 * ```ts
 * import { connectServiceWorkerBridge, waitForServiceWorkerActivation } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const reg = await navigator.serviceWorker.register("./sw.js");
 * if (reg.installing) await waitForServiceWorkerActivation(reg.installing);
 * const channel = await connectServiceWorkerBridge(reg.active!, { scope: "./" });
 * ```
 */
export async function connectServiceWorkerBridge(
  workerOrOptions?: ServiceWorker | ServiceWorkerBridgeOptions,
  optionsOrScope?: { scope?: string } | string,
): Promise<MessageChannel | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  let sw: ServiceWorker | undefined;
  let scope: string | undefined;

  if (
    workerOrOptions && typeof workerOrOptions === "object" &&
    "postMessage" in workerOrOptions
  ) {
    sw = workerOrOptions as ServiceWorker;
    if (typeof optionsOrScope === "string") {
      scope = optionsOrScope;
    } else if (optionsOrScope && typeof optionsOrScope === "object") {
      scope = optionsOrScope.scope;
    }
  } else if (workerOrOptions && typeof workerOrOptions === "object") {
    const opts = workerOrOptions as ServiceWorkerBridgeOptions;
    sw = opts.worker;
    scope = opts.scope;
  }

  if (!sw) {
    const reg = await navigator.serviceWorker.ready;
    sw = reg.active ?? undefined;
  }
  if (!sw) return null;

  const channel = new MessageChannel();
  const { port1, port2 } = channel;

  // Send port1 to SW for streaming
  sw.postMessage({ type: "PORT" }, [port1]);

  // port2 listens for streaming requests from SW
  port2.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type !== "webtorrent-request") return;

    const { url, method, headers, scope } = msg;
    const chunkPort = e.ports[0];
    const requestPort = e.ports[1];

    if (!chunkPort || !requestPort) return;

    try {
      const parsed = parseStreamURL(url, scope || "/");
      if (!parsed) {
        chunkPort.postMessage({ status: 404, body: "Not Found" });
        chunkPort.postMessage(null);
        chunkPort.close();
        return;
      }

      const entry = streamManager.get(parsed.infoHash, parsed.fileIndex);
      if (!entry) {
        chunkPort.postMessage({ status: 404, body: "File not registered" });
        chunkPort.postMessage(null);
        chunkPort.close();
        return;
      }

      // deno-lint-ignore no-explicit-any
      const file = entry.file as any;
      const range = parseRange(headers?.["range"], file.length);
      const status = range ? 206 : 200;
      const statusText = range ? "Partial Content" : "OK";
      const contentType = guessContentType(file.name);

      const respHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };

      if (range) {
        respHeaders["Content-Range"] =
          `bytes ${range.start}-${range.end}/${file.length}`;
        respHeaders["Content-Length"] = String(range.end - range.start + 1);
      } else {
        respHeaders["Content-Length"] = String(file.length);
      }

      const rangeStart = range?.start ?? 0;
      const rangeEnd = range?.end ?? (file.length - 1);
      let currentOffset = rangeStart;

      let fileStream: ReadableStream<Uint8Array> | null = null;
      let fileIterator: ReadableStreamDefaultReader<Uint8Array> | null = null;

      const ensureStream = () => {
        if (!fileStream) {
          if (typeof file.createReadStream === "function") {
            fileStream = file.createReadStream({
              start: rangeStart,
              end: rangeEnd,
            });
          } else {
            fileStream = new ReadableStream<Uint8Array>({
              async start(controller) {
                if (file[Symbol.asyncIterator]) {
                  for await (const chunk of file) {
                    controller.enqueue(chunk);
                  }
                }
                controller.close();
              },
            });
          }
          fileIterator = fileStream!.getReader();
        }
      };

      let closed = false;
      const cleanup = () => {
        closed = true;
        fileIterator = null;
        fileStream = null;
        chunkPort.close();
      };

      chunkPort.onmessage = async (ev: MessageEvent) => {
        if (closed) return;
        const data = ev.data;

        if (data === null || data === false) {
          cleanup();
          return;
        }

        if (data === true) {
          if (currentOffset > rangeEnd) {
            chunkPort.postMessage(null);
            cleanup();
            return;
          }

          ensureStream();
          const { value, done } = await fileIterator!.read();
          if (closed) return;

          if (done || !value || value.byteLength === 0) {
            chunkPort.postMessage(null);
            cleanup();
            return;
          }

          currentOffset += value.byteLength;
          chunkPort.postMessage(value);
        }
      };

      chunkPort.start?.();

      requestPort.postMessage({
        status,
        statusText,
        headers: respHeaders,
        body: "STREAM",
      });
    } catch (err) {
      chunkPort.postMessage({ status: 500, body: String(err) });
      chunkPort.postMessage(null);
      chunkPort.close();
    }
  };

  return channel;
}

/**
 * Backward-compatibility alias for {@link connectServiceWorkerBridge}.
 */
export const establishSWConnection: typeof connectServiceWorkerBridge =
  connectServiceWorkerBridge;

/**
 * High-level helper that registers the Service Worker, awaits its activation,
 * and automatically establishes the duplex streaming MessageChannel bridge.
 *
 * This provides an out-of-the-box solution for progressive web apps to support
 * video and audio streaming from BitTorrent swarms.
 *
 * @param options - Registration and script options:
 *   - `scriptUrl`: Custom path to the Service Worker file (defaults to `${scope}sw.js`).
 *   - `scope`: Application URL scope for the Service Worker (defaults to base pathname).
 *   - `version`: Version cache-busting query parameter.
 * @returns A promise resolving to the registration and established {@link MessageChannel}, or `null` if unsupported.
 *
 * @example
 * ```ts
 * import { registerAndConnectServiceWorker } from "jsr:@vanaware/browsertorrent/service-worker";
 *
 * const res = await registerAndConnectServiceWorker({
 *   scriptUrl: "./sw.js",
 *   scope: "./",
 * });
 * console.log("Service Worker connected:", res?.registration.scope);
 * ```
 */
export async function registerAndConnectServiceWorker(
  options: { scriptUrl?: string; scope?: string; version?: string } = {},
): Promise<
  { registration: ServiceWorkerRegistration; channel: MessageChannel | null } | null
> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const { registerServiceWorker } = await import("./register.ts");
  const reg = await registerServiceWorker(options);
  if (!reg) return null;

  const activeWorker = reg.active ?? reg.installing ?? reg.waiting;
  if (activeWorker) {
    if (activeWorker.state !== "activated") {
      await waitForServiceWorkerActivation(activeWorker);
    }
    const channel = await connectServiceWorkerBridge({
      worker: reg.active ?? activeWorker,
      scope: options.scope,
    });
    return { registration: reg, channel };
  }

  return { registration: reg, channel: null };
}
