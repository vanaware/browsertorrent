// packages/core/src/service-worker/bridge.ts
import { parseStreamURL, streamManager } from "../server/stream-manager.ts";

/**
 * Guesses MIME content-type from filename extension.
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
 * Parses HTTP Range header into start and end byte offsets.
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
 * Waits for a ServiceWorker in installing/waiting state to become activated.
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

// Backward-compatibility alias
export const waitForActivation = waitForServiceWorkerActivation;

export interface ServiceWorkerBridgeOptions {
  /** Target active ServiceWorker. If omitted, awaits navigator.serviceWorker.ready. */
  worker?: ServiceWorker;
  /** Application scope prefix for stream URL parsing (default: "/"). */
  scope?: string;
}

/**
 * Low-level bridge: Connects an active Service Worker to the streamManager for BitTorrent streaming.
 * Accepts either a ServiceWorker instance directly or a ServiceWorkerBridgeOptions object.
 *
 * @example
 * // Low-level direct worker pass:
 * const reg = await navigator.serviceWorker.register("./my-sw.js");
 * await waitForServiceWorkerActivation(reg.active!);
 * const channel = await connectServiceWorkerBridge(reg.active!, { scope: "./" });
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

// Backward-compatibility alias
export const establishSWConnection = connectServiceWorkerBridge;

/**
 * Complete helper that registers the Service Worker, waits for activation,
 * and sets up the streaming bridge.
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
