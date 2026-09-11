// /loco/monorepo/webtorrent/src/server/server.ts

import type { File } from "../core/file.ts";
import type { Torrent } from "../core/torrent.ts";
import {
  buildStreamURL,
  parseStreamURL,
  streamManager,
  type StreamEntry,
} from "./stream-manager.ts";

/**
 * Pull-style payload the Service Worker sends to the main thread when
 * it wants the next chunk of a streaming response.
 *
 * The wire protocol is intentionally minimal: the SW opens a
 * `MessageChannel` per request, the server answers with
 * {@link StreamResponseMetadata} (or a `STREAM` sentinel) and then both
 * ends treat the channel as a backpressure pump — `true` requests the
 * next chunk, `false` (or closing the port) ends the stream.
 */
export interface StreamRequestMessage {
  type: "webtorrent-request";
  url: string;
  method: string;
  headers: Record<string, string>;
  scope: string;
  destination: RequestDestination | string;
}

/**
 * First reply on the streaming channel.  When `body === "STREAM"` the
 * caller must continue pulling chunks by sending `true` on the port.
 * A non-stream body is returned verbatim and ends the exchange.
 */
export interface StreamResponseMetadata {
  body: "STREAM" | ArrayBuffer | string | Uint8Array | null;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

/**
 * Incoming message from the Service Worker announcing that the bridge
 * is ready to serve `/webtorrent/*` requests.
 */
export interface WebTorrentReadyMessage {
  type: "WEBTORRENT_READY";
}

/**
 * Acknowledgement sent back to the Service Worker via the transferred
 * port once the main thread is ready to receive streaming requests.
 */
export interface WebTorrentAckMessage {
  type: "WEBTORRENT_ACK";
}

/**
 * Pull signal sent by the SW on the streaming port.  Receiving `true`
 * means "send me the next chunk".  Receiving `false` means "tear down".
 */
export type PullSignal = boolean;

/**
 * Pluggable transport used by {@link WebTorrentServer} to communicate
 * with the Service Worker.
 *
 * - The production implementation backed by `navigator.serviceWorker` is
 *   built by {@link createServiceWorkerTransport} when a live controller
 *   is provided.
 * - The test suite injects a {@link InProcessTransport} that records
 *   every message and lets tests drive the protocol deterministically.
 *
 * The transport must guarantee that {@link Transport.send} delivers
 * messages to the SW (or its in-process replacement) within a reasonable
 * time.  If the SW is not registered yet, implementations should buffer
 * until ready and reject after a timeout.
 */
export interface Transport {
  /**
   * Posts a one-shot message to the SW (no response expected).  Used
   * for the `WEBTORRENT_ACK` handshake.
   */
  postMessage(message: unknown): void;

  /**
   * Posts a message to the SW that must be paired with a response
   * on the supplied port.  Returns a promise that resolves with the
   * first {@link StreamResponseMetadata} the SW sends back.
   *
   * After the metadata is received, the implementation can attach
   * additional `onmessage` listeners on `port` to receive pull-style
   * chunks.  This mirrors the `MessageChannel` flow used by the real
   * `webtorrent.min.js` integration.
   */
  requestStream(
    message: StreamRequestMessage,
    port: MessagePort,
  ): Promise<StreamResponseMetadata>;

  /**
   * Releases any owned ports.  Called on `destroy` to free resources.
   */
  close(): void;
}

/**
 * Minimal controller surface used by the default transport.  Matches
 * the relevant subset of `ServiceWorkerContainer`/`ServiceWorker`
 * behavior, so we can mock it in tests without standing up a real SW.
 */
export interface ServiceWorkerControllerLike {
  scope: string;
  active: { postMessage?: (data: unknown, transfer?: Transferable[]) => void } | null;
  /**
   * Returns a promise that resolves when a `message` event matches the
   * supplied `sourceId`.  In the real SW this is replaced by a
   * `navigator.serviceWorker.addEventListener('message', ...)` handler
   * that filters by the `MessageEvent.source.id`.
   */
  waitForMessage(sourceId: string): Promise<any>;
}

/**
 * Default transport that talks to a real Service Worker.  The transport
 * is constructed only when a live controller is present (browser
 * environment) — see {@link createServiceWorkerTransport}.
 */
export function createServiceWorkerTransport(
  controller: ServiceWorker,
  scope: string,
): Transport {
  const PORT_TIMEOUT_MS = 5000;
  const pending = new Map<string, (data: StreamResponseMetadata) => void>();

  const onMessage = (event: any) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "webtorrent-response" && typeof event.data.sourceId === "string") {
      const resolver = pending.get(event.data.sourceId);
      if (resolver) {
        pending.delete(event.data.sourceId);
        resolver(event.data as StreamResponseMetadata);
      }
    }
  };

  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", onMessage as EventListener);
  }

  return {
    postMessage(message) {
      controller.postMessage(message);
    },

    requestStream(message, port) {
      const sourceId = crypto.randomUUID();
      return new Promise<StreamResponseMetadata>((resolve) => {
        const timeout = setTimeout(() => {
          if (pending.delete(sourceId)) {
            resolve({ body: null, status: 503, statusText: "Service Unavailable" });
          }
        }, PORT_TIMEOUT_MS);

        pending.set(sourceId, (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        controller.postMessage(
          { ...message, sourceId, type: "webtorrent" },
          [port],
        );
      });
    },

    close() {
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", onMessage as EventListener);
      }
      pending.clear();
    },
  };
}

/**
 * In-process transport used by tests.  It records every outbound
 * message, lets the test driver send the `WEBTORRENT_ACK` /
 * `webtorrent-response` back, and exposes a counter so the suite can
 * assert the protocol was honored.
 */
export class InProcessTransport implements Transport {
  readonly sent: unknown[] = [];
  private responseResolver?: (data: StreamResponseMetadata) => void;
  /** @internal — exposed for tests. */
  public activePort?: MessagePort;

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  requestStream(
    _message: StreamRequestMessage,
    port: MessagePort,
  ): Promise<StreamResponseMetadata> {
    this.activePort = port;
    return new Promise<StreamResponseMetadata>((resolve) => {
      this.responseResolver = resolve;
    });
  }

  /** Test helper: deliver the metadata reply for the current request. */
  deliverResponse(data: StreamResponseMetadata): void {
    this.responseResolver?.(data);
  }

  /** Test helper: send a pull signal (`true` for more, `false` to end). */
  sendPull(signal: PullSignal): void {
    this.activePort?.postMessage(signal);
  }

  close(): void {
    this.activePort?.close();
    this.activePort = undefined;
    this.responseResolver = undefined;
  }
}

/**
 * High-level façade exposed as `client.createServer({ controller })`.
 *
 * `WebTorrentServer` owns:
 *
 * 1. A reference to the {@link Transport} used to talk to the SW.
 * 2. The handshake (sending `WEBTORRENT_ACK` and waiting for the
 *    `WEBTORRENT_READY` to flip the `isReady` flag).
 * 3. The request-reply loop that turns a SW pull into a chunked
 *    {@link ReadableStream} of bytes.
 *
 * The server is transport-agnostic: production code passes the SW
 * transport, while tests pass an {@link InProcessTransport}.  This
 * keeps the streaming protocol exercised even in environments without a
 * real Service Worker (Node, Deno, CI).
 */
export class WebTorrentServer {
  public readonly scope: string;
  public isReady: boolean = false;
  public isDestroyed: boolean = false;

  private readonly transport: Transport;
  private readonly pendingAcks: Set<(ok: boolean) => void> = new Set();

  constructor(opts: { transport: Transport; scope: string }) {
    this.transport = opts.transport;
    this.scope = opts.scope;
  }

  /**
   * Sends the `WEBTORRENT_ACK` message to the Service Worker.  In
   * production this is called automatically by the SW the first time a
   * `/webtorrent/*` request arrives; the public `createServer` wrapper
   * may also call it eagerly during `init` to warm the path.
   *
   * @returns A promise that resolves to `true` once the SW has flipped
   *   its internal `isWebTorrentReady` flag.  The current SW code does
   *   not post a separate ack back, so this resolves immediately —
   *   the method exists so future revisions can opt into a stricter
   *   round-trip without changing the public API.
   */
  async sendReadyAck(): Promise<boolean> {
    if (this.isDestroyed) return false;
    const ack: WebTorrentAckMessage = { type: "WEBTORRENT_ACK" };
    this.transport.postMessage(ack);
    this.isReady = true;
    return true;
  }

  /**
   * Streams a file in response to a request originated by the SW.
   *
   * The flow is:
   *
   * 1. Translate the request URL into a `(infoHash, fileIndex)` pair
   *    using {@link parseStreamURL}.
   * 2. Look the entry up in the {@link streamManager}.
   * 3. Hand the entry to {@link buildFileStream} which returns a
   *    `ReadableStream<Uint8Array>` driven by the `MessagePort` pull
   *    signals.
   *
   * @returns A `Response` suitable for `event.respondWith()`.  When the
   *   URL is unknown the method returns a `404`; when the SW is not
   *   ready it returns a `503`.
   */
  async handleRequest(
    message: StreamRequestMessage,
    port: MessagePort,
  ): Promise<Response> {
    if (this.isDestroyed) {
      return new Response("Server destroyed", { status: 503 });
    }

    const parsed = parseStreamURL(message.url, message.scope || this.scope);
    if (!parsed) {
      return new Response("Not Found", { status: 404 });
    }

    const entry: StreamEntry | undefined = streamManager.get(
      parsed.infoHash,
      parsed.fileIndex,
    );
    if (!entry) {
      return new Response("File not registered", { status: 404 });
    }

    const range = parseRangeHeader(message.headers["range"], entry.file.length);
    let status = 200;
    let statusText = "OK";
    const headers: Record<string, string> = {
      "Content-Type": guessContentType(entry.file.name),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };

    if (range) {
      status = 206;
      statusText = "Partial Content";
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${entry.file.length}`;
      headers["Content-Length"] = String(range.end - range.start + 1);
    } else {
      headers["Content-Length"] = String(entry.file.length);
    }

    const stream = buildFileStream(entry, port, this.transport, {
      rangeStart: range?.start,
      rangeEnd: range ? range.end + 1 : undefined,
    });
    return new Response(stream, {
      status,
      statusText,
      headers,
    });
  }

  /**
   * Tears down the server.  Closes the transport so any future pull
   * signals stop firing.  Safe to call more than once.
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isReady = false;
    this.transport.close();
    for (const resolve of this.pendingAcks) resolve(false);
    this.pendingAcks.clear();
  }
}

/**
 * Builds a `ReadableStream<Uint8Array>` that materializes a file
 * piece-by-piece in response to `port` pull signals.
 *
 * The pull-based protocol is the same one `webtorrent.min.js` uses:
 *
 * 1. The SW (or in-process transport) sends `true` on `port` whenever
 *    it is ready for the next chunk.
 * 2. We asynchronously compute the next chunk from the file's
 *    `ChunkStore` and post it back on the same `port`.
 * 3. The stream ends when the SW posts `false` (or the port is closed)
 *    or when the file has been fully served.
 *
 * @param entry - The registered file entry being streamed.
 * @param port - The pull-signal port transferred from the SW.
 * @param transport - The transport implementation; used to forward the
 *   initial metadata reply before the pull loop starts.
 * @param opts - Streaming options.
 */
export function buildFileStream(
  entry: StreamEntry,
  port: MessagePort,
  _transport: Transport,
  opts: { rangeStart?: number; rangeEnd?: number } = {},
): ReadableStream<Uint8Array> {
  const file: File = entry.file;

  let fileOffset = opts.rangeStart ?? 0;
  const endOffset = opts.rangeEnd ?? file.length;
  let closed = false;
  let pendingResolve: (() => void) | null = null;

  const onMessage = (event: MessageEvent<PullSignal | Uint8Array | null>) => {
    const data = event.data;

    if (data === false || data == null) {
      closed = true;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r();
      }
      return;
    }

    if (data === true && pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
  };

  port.addEventListener("message", onMessage as EventListener);
  port.start?.();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (closed) {
          controller.close();
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        if (fileOffset >= endOffset) {
          controller.close();
          port.postMessage(null);
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        // Wait for the next pull signal before emitting.  The transport
        // injects `true` whenever the SW is ready for the next chunk.
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
          if (closed) {
            pendingResolve = null;
            resolve();
          }
        });

        if (closed) {
          controller.close();
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        const chunk = await readNextChunk(file, fileOffset);
        if (chunk.byteLength === 0) {
          controller.close();
          port.postMessage(null);
          port.removeEventListener("message", onMessage as EventListener);
          return;
        }

        fileOffset += chunk.byteLength;
        controller.enqueue(chunk);
        // Send the chunk back through the port so the SW can forward it
        port.postMessage(chunk);
      } catch (err) {
        controller.error(err);
        port.removeEventListener("message", onMessage as EventListener);
      }
    },

    cancel() {
      closed = true;
      port.postMessage(false);
      port.removeEventListener("message", onMessage as EventListener);
    },
  });
}

/** Parsed byte-range result. */
export interface ParsedRange {
  start: number;
  end: number;
}

/**
 * Parse a HTTP `Range` header value (e.g. `"bytes=12345-"`).
 * Returns `null` if the header is absent, invalid, or unsatisfiable.
 *
 * Supports the `bytes` unit only.
 */
export function parseRangeHeader(
  header: string | undefined,
  fileLength: number,
): ParsedRange | null {
  if (!header) return null;

  // "bytes=start-end" or "bytes=start-"
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;

  const start = Number(match[1]);
  const endStr = match[2];

  if (!Number.isFinite(start) || start < 0 || start >= fileLength) {
    return null;
  }

  const end = endStr !== ""
    ? Math.min(Number(endStr), fileLength - 1)
    : fileLength - 1;

  if (!Number.isFinite(end) || end < start || end >= fileLength) {
    return null;
  }

  return { start, end };
}

/**
 * Reads the next chunk of `file` starting at `offset`.  This is a
 * separate function (rather than an inline `for await` loop) so the
 * `File` class can grow a smarter implementation later (e.g. adaptive
 * block size based on `RTT` and `BT_RREQ_RATE`) without changing the
 * streaming protocol.
 *
 * The default block size is 16 KiB — small enough to keep latency
 * snappy for video seeks, large enough to amortize `MessageChannel`
 * overhead.
 */
export const STREAM_BLOCK_SIZE = 16 * 1024;

export async function readNextChunk(
  file: File,
  offset: number,
  length: number = STREAM_BLOCK_SIZE,
): Promise<Uint8Array> {
  // File does not yet implement `createReadStream()`; for the time
  // being we route through the async iterator + manual offset tracking.
  // The File class only knows how to iterate the whole file, so we
  // scan until we hit the requested offset.  Once the real
  // implementation lands (Phase 4.1) this function will be replaced
  // by a direct chunk-store read.
  const it = (file as any)[Symbol.asyncIterator]() as AsyncIterableIterator<Uint8Array>;
  let skipped = 0;
  let remainingToRead = Math.min(length, file.length - offset);

  if (offset === 0) {
    const { value, done } = await it.next();
    if (done || !value) return new Uint8Array(0);
    return value.subarray(0, Math.min(value.length, remainingToRead));
  }

  while (skipped < offset) {
    const result = await it.next();
    if (result.done || !result.value) return new Uint8Array(0);
    const value = result.value;
    skipped += value.length;
    if (skipped > offset) {
      const overflow = skipped - offset;
      const takeFromThis = value.length - overflow;
      if (takeFromThis >= remainingToRead) {
        return value.subarray(value.length - remainingToRead, value.length);
      }
      // Not enough in a single chunk; concatenate
      const first = value.subarray(value.length - takeFromThis, value.length);
      const out = new Uint8Array(remainingToRead);
      out.set(first, 0);
      let written = first.length;
      while (written < remainingToRead) {
        const r = await it.next();
        if (r.done || !r.value) break;
        const take = Math.min(r.value.length, remainingToRead - written);
        out.set(r.value.subarray(0, take), written);
        written += take;
      }
      return out.subarray(0, written);
    }
  }

  // offset fell exactly on a chunk boundary
  const { value, done } = await it.next();
  if (done || !value) return new Uint8Array(0);
  return value.subarray(0, Math.min(value.length, remainingToRead));
}

/**
 * Best-effort content-type guess from the file name.  Returns
 * `application/octet-stream` when no extension matches so the browser
 * can still download the file.
 */
export function guessContentType(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) {
    return "application/octet-stream";
  }
  const ext = name.slice(idx + 1).toLowerCase();
  switch (ext) {
    case "mp4": case "m4v": return "video/mp4";
    case "webm": return "video/webm";
    case "ogg": case "ogv": return "video/ogg";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "flac": return "audio/flac";
    case "m4a": case "aac": return "audio/aac";
    case "oga": return "audio/ogg";
    case "opus": return "audio/opus";
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "pdf": return "application/pdf";
    case "txt": return "text/plain; charset=utf-8";
    case "html": case "htm": return "text/html; charset=utf-8";
    case "json": return "application/json; charset=utf-8";
    case "srt": return "application/x-subrip";
    case "vtt": return "text/vtt";
    default: return "application/octet-stream";
  }
}

/**
 * Public factory matching the `webtorrent.min.js` API:
 *
 * ```ts
 * const server = createServer({ controller });
 * ```
 *
 * In the browser, `controller` is a `ServiceWorker` instance obtained
 * from `navigator.serviceWorker.ready` (the active controller).  In
 * tests, the caller can omit `controller` and use the returned
 * `WebTorrentServer` directly with an injected transport.
 *
 * If `controller` is omitted, the function still returns a working
 * server — it just never receives `WEBTORRENT_READY` events from a SW.
 * Callers wanting a self-test can call {@link WebTorrentServer.sendReadyAck}
 * and then drive the protocol through the test transport.
 */
export interface CreateServerOptions {
  controller?: ServiceWorker;
  scope?: string;
  transport?: Transport;
}

export function createServer(opts: CreateServerOptions = {}): WebTorrentServer {
  let transport: Transport;
  let scope: string;

  if (opts.transport) {
    transport = opts.transport;
    scope = opts.scope || "/";
  } else if (opts.controller) {
    scope = opts.scope || (opts.controller as any).scope || "/";
    transport = createServiceWorkerTransport(opts.controller, scope);
  } else {
    scope = opts.scope || "/";
    transport = new InProcessTransport();
  }

  return new WebTorrentServer({ transport, scope });
}

/**
 * Registers every `File` of a torrent in the {@link streamManager} so
 * that {@link createServer} can serve them.  Called automatically by
 * `Torrent`/`WebTorrent` when a torrent becomes ready.
 *
 * @returns The list of registered entries, in torrent order.  Tests
 *   use this to assert cleanup behaviour.
 */
export function registerTorrentFiles(
  torrent: Torrent,
  files: File[],
): StreamEntry[] {
  const infoHash = torrent.infoHash;
  const registered: StreamEntry[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    console.log("[server] registerTorrentFiles:", infoHash, "fileIndex:", i, "name:", file.name);
    streamManager.register(infoHash, i, file);
    registered.push({ infoHash, fileIndex: i, file });
  }
  return registered;
}

/**
 * Removes every file belonging to a torrent from the registry.  Called
 * when a torrent is removed from the client.
 */
export function unregisterTorrentFiles(infoHash: string): void {
  streamManager.unregisterTorrent(infoHash);
}
