/* BrowserTorrent v0.0.111-mu76cjbv */

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};

// <define:__GENERATED_ASSETS__>
var define_GENERATED_ASSETS_default;
var init_define_GENERATED_ASSETS = __esm({
  "<define:__GENERATED_ASSETS__>"() {
    define_GENERATED_ASSETS_default = ["./main.js", "./worker-db.js", "./webtorrent.min.js", "./index.html"];
  }
});

// packages/core/src/utils/bencode.ts
var _td, _te, _defaultMaxBytes;
var init_bencode = __esm({
  "packages/core/src/utils/bencode.ts"() {
    init_define_GENERATED_ASSETS();
    _td = new TextDecoder("utf-8");
    _te = new TextEncoder();
    _defaultMaxBytes = 64 * 1024 * 1024;
  }
});

// packages/core/src/torrent-generator/types.ts
var init_types = __esm({
  "packages/core/src/torrent-generator/types.ts"() {
    init_define_GENERATED_ASSETS();
  }
});

// packages/core/src/torrent-generator/opfs-walker.ts
var init_opfs_walker = __esm({
  "packages/core/src/torrent-generator/opfs-walker.ts"() {
    init_define_GENERATED_ASSETS();
  }
});

// packages/core/src/torrent-generator/opfs-reader.ts
var init_opfs_reader = __esm({
  "packages/core/src/torrent-generator/opfs-reader.ts"() {
    init_define_GENERATED_ASSETS();
  }
});

// packages/core/src/torrent-generator/util.ts
var init_util = __esm({
  "packages/core/src/torrent-generator/util.ts"() {
    init_define_GENERATED_ASSETS();
    init_types();
    init_opfs_reader();
  }
});

// packages/core/src/torrent-generator/generator.ts
var init_generator = __esm({
  "packages/core/src/torrent-generator/generator.ts"() {
    init_define_GENERATED_ASSETS();
    init_bencode();
    init_types();
    init_opfs_walker();
    init_util();
  }
});

// packages/core/src/torrent-generator/mod.ts
var init_mod = __esm({
  "packages/core/src/torrent-generator/mod.ts"() {
    init_define_GENERATED_ASSETS();
    init_bencode();
    init_generator();
    init_opfs_walker();
    init_opfs_reader();
    init_util();
    init_types();
  }
});

// packages/service-worker/src/sw.ts
init_define_GENERATED_ASSETS();

// packages/core/src/service-worker/mod.ts
init_define_GENERATED_ASSETS();

// packages/core/src/service-worker/stream-handler.ts
init_define_GENERATED_ASSETS();
function guessDestination(pathname) {
  if (/\.(mp4|webm|mkv|avi|mov)$/i.test(pathname)) return "video";
  if (/\.(mp3|m4a|ogg|wav)$/i.test(pathname)) return "audio";
  if (/\.(jpe?g|png|gif|webp)$/i.test(pathname)) return "image";
  return "document";
}
__name(guessDestination, "guessDestination");
function getWebTorrentPrefix(scope) {
  const baseScope = scope || (typeof self !== "undefined" && self.registration?.scope ? self.registration.scope : "/");
  const pathname = new URL(baseScope, typeof self !== "undefined" && self.location?.origin ? self.location.origin : "http://localhost").pathname;
  return (pathname.endsWith("/") ? pathname : pathname + "/") + "webtorrent/";
}
__name(getWebTorrentPrefix, "getWebTorrentPrefix");
function isWebTorrentStreamRequest(urlOrRequest, scope) {
  const urlString = typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest instanceof Request ? urlOrRequest.url : urlOrRequest.href;
  const url = new URL(urlString, typeof self !== "undefined" && self.location?.origin ? self.location.origin : "http://localhost");
  const prefix = getWebTorrentPrefix(scope);
  return url.pathname.startsWith(prefix);
}
__name(isWebTorrentStreamRequest, "isWebTorrentStreamRequest");
function handleStream(req, url, pagePort, scope) {
  return new Promise((resolve) => {
    const chunkChannel = new MessageChannel();
    const chunkPort1 = chunkChannel.port1;
    const chunkPort2 = chunkChannel.port2;
    const requestChannel = new MessageChannel();
    const requestPort1 = requestChannel.port1;
    const requestPort2 = requestChannel.port2;
    const dest = guessDestination(url.pathname);
    let bodyController = null;
    let closed = false;
    let pendingPullResolve = null;
    let pendingPull = Promise.resolve();
    chunkPort1.onmessage = (ev) => {
      const chunk = ev.data;
      if (chunk === null || chunk === false) {
        console.log("[sw-stream] stream END");
        closed = true;
        if (pendingPullResolve) {
          const r = pendingPullResolve;
          pendingPullResolve = null;
          pendingPull = Promise.resolve();
          r();
        }
        if (bodyController) {
          try {
            bodyController.close();
          } catch {
          }
        }
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        return;
      }
      if (!(chunk instanceof Uint8Array)) {
        console.warn("[sw-stream] unexpected data on chunkPort1:", typeof chunk);
        return;
      }
      console.log("[sw-stream] chunk received:", chunk.byteLength, "bytes");
      if (bodyController) {
        try {
          bodyController.enqueue(chunk);
        } catch (err) {
          console.error("[sw-stream] enqueue error:", err);
        }
      }
      if (pendingPullResolve) {
        const r = pendingPullResolve;
        pendingPullResolve = null;
        pendingPull = Promise.resolve();
        r();
      }
    };
    chunkPort1.start?.();
    requestPort2.onmessage = (ev) => {
      const data = ev.data;
      console.log("[sw-stream] requestPort2 received:", typeof data, data?.body);
      if (data === null || data === void 0) {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(new Response("Stream unavailable", {
          status: 503
        }));
        return;
      }
      const metadata = data;
      if (metadata.body !== "STREAM") {
        chunkPort1.close();
        chunkPort2.close();
        requestPort1.close();
        requestPort2.close();
        resolve(new Response(String(metadata.body ?? ""), {
          status: metadata.status ?? 200,
          headers: new Headers(metadata.headers ?? {})
        }));
        return;
      }
      const headers = new Headers(metadata.headers ?? {});
      function doPull(_controller) {
        if (closed || pendingPullResolve !== null) return;
        chunkPort1.postMessage(true);
        pendingPull = new Promise((resolve2) => {
          pendingPullResolve = resolve2;
        });
        const timeout = setTimeout(() => {
          if (pendingPullResolve) {
            console.warn("[sw-stream] chunk pull timeout \u2014 closing stream");
            closed = true;
            pendingPullResolve = null;
            pendingPull = Promise.resolve();
            if (bodyController) {
              try {
                bodyController.close();
              } catch {
              }
            }
            chunkPort1.close();
            chunkPort2.close();
            requestPort1.close();
            requestPort2.close();
          }
        }, 1e4);
        pendingPull = pendingPull.finally(() => clearTimeout(timeout));
      }
      __name(doPull, "doPull");
      const bodyStream = new ReadableStream({
        start(controller) {
          bodyController = controller;
          doPull(controller);
        },
        async pull(controller) {
          if (pendingPullResolve) {
            await pendingPull;
          }
          if (closed) {
            try {
              controller.close();
            } catch {
            }
            return;
          }
          doPull(controller);
        },
        cancel() {
          console.log("[sw-stream] stream cancel");
          closed = true;
          chunkPort1.postMessage(false);
          chunkPort1.close();
          chunkPort2.close();
          requestPort1.close();
          requestPort2.close();
        }
      });
      resolve(new Response(bodyStream, {
        status: metadata.status ?? 200,
        headers
      }));
    };
    requestPort2.start?.();
    pagePort.postMessage({
      type: "webtorrent-request",
      url: url.pathname,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      scope,
      destination: dest
    }, [
      chunkPort2,
      requestPort1
    ]);
  });
}
__name(handleStream, "handleStream");
function createWebTorrentFetchHandler(options = {}) {
  const requestQueue = [];
  let pagePort = null;
  function setPagePort(port) {
    pagePort = port;
    console.log("[sw-fetch-handler] pagePort attached");
    processQueue();
  }
  __name(setPagePort, "setPagePort");
  function getPagePort() {
    return pagePort;
  }
  __name(getPagePort, "getPagePort");
  function isStreamRequest(urlOrRequest) {
    return isWebTorrentStreamRequest(urlOrRequest, options.prefix);
  }
  __name(isStreamRequest, "isStreamRequest");
  function handleFetch(event) {
    const url = new URL(event.request.url);
    if (!isStreamRequest(url)) {
      return null;
    }
    console.log("[sw-fetch-handler] intercepting stream fetch:", url.pathname);
    if (!pagePort) {
      return new Promise((resolve) => {
        requestQueue.push({
          resolve,
          req: event.request,
          url
        });
      });
    }
    const scope = typeof self !== "undefined" && self.registration?.scope ? self.registration.scope : "/";
    return handleStream(event.request, url, pagePort, scope);
  }
  __name(handleFetch, "handleFetch");
  async function processQueue() {
    const scope = typeof self !== "undefined" && self.registration?.scope ? self.registration.scope : "/";
    while (requestQueue.length > 0 && pagePort) {
      const item = requestQueue.shift();
      const resp = await handleStream(item.req, item.url, pagePort, scope);
      item.resolve(resp);
    }
  }
  __name(processQueue, "processQueue");
  return {
    setPagePort,
    getPagePort,
    isStreamRequest,
    handleFetch,
    handleStream: /* @__PURE__ */ __name((req, url, port, scope) => handleStream(req, url, port, scope), "handleStream")
  };
}
__name(createWebTorrentFetchHandler, "createWebTorrentFetchHandler");

// packages/core/src/service-worker/register.ts
init_define_GENERATED_ASSETS();

// packages/core/src/version.ts
init_define_GENERATED_ASSETS();

// packages/service-worker/src/cache.ts
init_define_GENERATED_ASSETS();

// packages/core/src/mod.ts
init_define_GENERATED_ASSETS();

// packages/core/src/utils/event-target.ts
init_define_GENERATED_ASSETS();
var TypedEventTarget = class extends EventTarget {
  static {
    __name(this, "TypedEventTarget");
  }
  /**
   * Registra um listener para um evento específico.
   */
  on(type, listener, options) {
    this.addEventListener(type, listener, options);
    return this;
  }
  /**
   * Registra um listener que será removido após a primeira execução.
   */
  once(type, listener) {
    this.addEventListener(type, listener, {
      once: true
    });
    return this;
  }
  /**
   * Remove um listener.
   */
  off(type, listener, options) {
    this.removeEventListener(type, listener, options);
    return this;
  }
  /**
   * Emite um evento.
   * 🔥 CORREÇÃO: Usamos `(detail as unknown) instanceof Event` para contornar
   * a restrição do TypeScript com tipos genéricos union (TS2358).
   */
  emit(type, detail) {
    const event = detail && detail instanceof Event ? detail : new CustomEvent(type, {
      detail,
      cancelable: true
    });
    return this.dispatchEvent(event);
  }
  /**
   * Remove todos os listeners de um tipo específico (ou de todos os tipos).
   * Nota: EventTarget nativo não expõe os listeners, então esta implementação
   * é um no-op seguro, confiando no Garbage Collector quando o alvo é destruído.
   */
  removeAllListeners(type) {
    return this;
  }
};

// packages/core/src/utils/parse-torrent.ts
init_define_GENERATED_ASSETS();

// packages/core/src/utils/magnet.ts
init_define_GENERATED_ASSETS();

// packages/core/src/utils/encoding.ts
init_define_GENERATED_ASSETS();
var HEX_TABLE = Array.from({
  length: 256
}, (_, i) => i.toString(16).padStart(2, "0"));

// packages/core/src/utils/magnet.ts
var MAX_MAGNET_LENGTH = 1024 * 1024;
var MAX_QUERY_PARAMETER_LENGTH = 64 * 1024;

// packages/core/src/utils/metainfo-identity.ts
init_define_GENERATED_ASSETS();
init_bencode();

// packages/core/src/utils/errors.ts
init_define_GENERATED_ASSETS();

// packages/core/src/utils/metainfo-parser.ts
init_define_GENERATED_ASSETS();
init_bencode();

// packages/core/src/utils/torrent-types.ts
init_define_GENERATED_ASSETS();
var DEFAULT_MAX_METAINFO_SIZE = 16 * 1024 * 1024;

// packages/core/src/utils/metainfo-v2.ts
init_define_GENERATED_ASSETS();
var BLOCK_LENGTH = 16 * 1024;

// packages/core/src/core/torrent.ts
init_define_GENERATED_ASSETS();

// packages/core/src/core/bitfield.ts
init_define_GENERATED_ASSETS();

// packages/core/src/crypto/hasher.ts
init_define_GENERATED_ASSETS();

// packages/core/src/core/torrent.ts
init_bencode();

// packages/core/src/core/wire.ts
init_define_GENERATED_ASSETS();

// packages/core/src/utils/buffer.ts
init_define_GENERATED_ASSETS();

// packages/core/src/core/wire.ts
init_bencode();

// packages/core/src/core/handshake.ts
init_define_GENERATED_ASSETS();

// packages/core/src/core/constants.ts
init_define_GENERATED_ASSETS();
var BITTORRENT_PROTOCOL = "BitTorrent protocol";
var DEFAULT_MAX_MESSAGE_LENGTH = 2 * 1024 * 1024;
var DEFAULT_MAX_BLOCK_LENGTH = 16 * 1024;
var DEFAULT_MAX_QUEUED_WRITE_BYTES = 4 * 1024 * 1024;

// packages/core/src/core/handshake.ts
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var protocolBytes = textEncoder.encode(BITTORRENT_PROTOCOL);

// packages/core/src/core/message.ts
init_define_GENERATED_ASSETS();

// packages/core/src/utils/net.ts
init_define_GENERATED_ASSETS();

// packages/core/src/core/extension-host.ts
init_define_GENERATED_ASSETS();
init_bencode();

// packages/core/src/core/piece.ts
init_define_GENERATED_ASSETS();

// packages/core/src/network/swarm.ts
init_define_GENERATED_ASSETS();

// packages/core/src/network/peer.ts
init_define_GENERATED_ASSETS();

// packages/core/src/network/tracker.ts
init_define_GENERATED_ASSETS();
init_bencode();

// packages/core/src/utils/encode-util.ts
init_define_GENERATED_ASSETS();

// packages/core/src/network/tracker.ts
var MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// packages/core/src/extensions/ut-metadata.ts
init_define_GENERATED_ASSETS();

// packages/core/src/core/extension.ts
init_define_GENERATED_ASSETS();

// packages/core/src/extensions/ut-metadata.ts
init_bencode();

// packages/core/src/utils/peerid.ts
init_define_GENERATED_ASSETS();

// packages/core/src/crypto/random.ts
init_define_GENERATED_ASSETS();

// packages/core/src/storage/opfs-chunk-store.ts
init_define_GENERATED_ASSETS();

// packages/core/src/storage/memory-chunk-store.ts
init_define_GENERATED_ASSETS();

// packages/core/src/mod.ts
init_bencode();

// packages/core/src/server/server.ts
init_define_GENERATED_ASSETS();

// packages/core/src/server/stream-manager.ts
init_define_GENERATED_ASSETS();
var StreamManager = class {
  static {
    __name(this, "StreamManager");
  }
  entries = /* @__PURE__ */ new Map();
  /**
   * Registers (or replaces) the file entry for a `(infoHash, fileIndex)`.
   *
   * The same `File` object is also bound back to the entry through
   * `infoHash`/`fileIndex` so {@link File.streamURL} can produce a URL
   * that resolves back to the same record.
   *
   * @param infoHash - 40-char hex info hash identifying the torrent.
   * @param fileIndex - Zero-based file index inside the torrent.
   * @param file - The {@link File} instance to serve.
   */
  register(infoHash, fileIndex, file) {
    const key = this._key(infoHash, fileIndex);
    this.entries.set(key, {
      infoHash,
      fileIndex,
      file
    });
  }
  /**
   * Removes a single file entry.  Safe to call when the entry does not
   * exist.
   */
  unregister(infoHash, fileIndex) {
    this.entries.delete(this._key(infoHash, fileIndex));
  }
  /**
   * Removes every file entry that belongs to the given torrent.  Used
   * when a torrent is removed from the client so the SW cannot keep
   * streaming after the underlying data is gone.
   */
  unregisterTorrent(infoHash) {
    const prefix = `${infoHash}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
  /**
   * Returns the file entry for a `(infoHash, fileIndex)` or `undefined`
   * if no such file is registered.
   */
  get(infoHash, fileIndex) {
    return this.entries.get(this._key(infoHash, fileIndex));
  }
  /**
   * Lists every currently registered file entry.  Used by tests and
   * diagnostics — not by the hot path of the streaming protocol.
   */
  list() {
    return Array.from(this.entries.values());
  }
  /**
   * Returns the total number of registered file entries.  Useful for
   * shutdown checks and for tests asserting cleanup behaviour.
   */
  size() {
    return this.entries.size;
  }
  /**
   * Removes every entry.  Called by the test suite and (in the future)
   * by a full client destruction path that wants to wipe state without
   * touching each torrent individually.
   */
  clear() {
    this.entries.clear();
  }
  _key(infoHash, fileIndex) {
    return `${infoHash}:${fileIndex}`;
  }
};
var streamManager = new StreamManager();
function buildStreamURL(scope, infoHash, fileIndex, name) {
  const safeName = encodeURIComponent(name);
  return `${scope}webtorrent/${infoHash}/${fileIndex}/${safeName}`;
}
__name(buildStreamURL, "buildStreamURL");

// packages/core/src/server/server.ts
var STREAM_BLOCK_SIZE = 16 * 1024;

// packages/core/src/core/file.ts
init_define_GENERATED_ASSETS();
var _computedKey;
var MIME_MAP = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  xml: "application/xml",
  md: "text/markdown",
  iso: "application/x-iso9660-image"
};
_computedKey = Symbol.asyncIterator;
var File = class extends TypedEventTarget {
  static {
    __name(this, "File");
  }
  _store;
  _length;
  _offset;
  _pieceLength;
  _name;
  _path;
  _infoHash;
  _fileIndex;
  _scope;
  _blockSize;
  _destroyed = false;
  _torrent;
  constructor(options) {
    super();
    this._store = options.store;
    this._length = options.length;
    this._offset = options.offset;
    this._pieceLength = options.pieceLength;
    this._name = options.name ?? "file";
    this._path = options.path ?? this._name;
    this._infoHash = options.infoHash;
    this._fileIndex = options.fileIndex;
    this._scope = options.scope ?? "/";
    this._blockSize = options.blockSize ?? 64 * 1024;
    this._torrent = options.torrent;
  }
  get length() {
    return this._length;
  }
  get name() {
    return this._name;
  }
  get path() {
    return this._path;
  }
  get pieceLength() {
    return this._pieceLength;
  }
  get offset() {
    return this._offset;
  }
  get infoHash() {
    return this._infoHash;
  }
  get fileIndex() {
    return this._fileIndex;
  }
  get scope() {
    return this._scope;
  }
  get destroyed() {
    return this._destroyed;
  }
  /**
   * MIME type inferred from the file name extension.
   *
   * Mirrors the upstream `webtorrent.min.js` `file.type`.
   */
  get type() {
    const ext = this._name.toLowerCase().split(".").pop() ?? "";
    return MIME_MAP[ext] ?? "application/octet-stream";
  }
  /**
   * Número de bytes baixados deste arquivo específico.
   * Calculado a partir do array de Piece objects do torrent.
   */
  get downloaded() {
    const torrent = this._torrent;
    if (!torrent) return 0;
    const { first, last } = this.pieceRange;
    const pieces = torrent.pieces;
    if (!pieces || !Array.isArray(pieces)) return 0;
    const pieceLength = this._pieceLength;
    let downloaded = 0;
    for (let i = first; i <= last; i++) {
      if (pieces[i]?.hash) {
        downloaded += i === last ? Math.min(pieceLength, this._offset + this._length - i * pieceLength) : pieceLength;
      }
    }
    return Math.min(downloaded, this._length);
  }
  /**
   * Progress de download deste arquivo específico (0..1).
   */
  get progress() {
    if (this._length === 0) return 0;
    return this.downloaded / this._length;
  }
  /**
   * Compute the range of piece indices that this file overlaps.
   *
   * Useful for piece selection algorithms that need to know which pieces
   * "belong" to a given file.
   */
  get pieceRange() {
    const first = Math.floor(this._offset / this._pieceLength);
    const last = Math.floor((this._offset + this._length - 1) / this._pieceLength);
    return {
      first,
      last
    };
  }
  /**
   * Returns true if the given piece index is part of this file.
   *
   * Supports both upstream signatures:
   * - `includes(pieceIndex: number)` — piece index
   * - `includes(piece: Piece)` — Piece object (legacy)
   */
  includes(pieceOrIndex) {
    const { first, last } = this.pieceRange;
    const index = typeof pieceOrIndex === "number" ? pieceOrIndex : pieceOrIndex.index;
    return index >= first && index <= last;
  }
  /**
   * Mark pieces [startPiece, endPiece] (inclusive) as selected for download.
   * Delegates to the owning torrent's `select`.
   *
   * If the file is not attached to a torrent, this is a no-op.
   */
  select(startPiece, endPiece) {
    if (!this._torrent || !this._torrent.pieces) return;
    const { first, last } = this.pieceRange;
    const start = startPiece ?? first;
    const end = endPiece ?? last;
    this._torrent.select(start, end);
  }
  /**
   * Mark pieces [startPiece, endPiece] as deselected.
   * Delegates to the owning torrent's `deselect`.
   *
   * If the file is not attached to a torrent, this is a no-op.
   */
  deselect(startPiece, endPiece) {
    if (!this._torrent || !this._torrent.pieces) return;
    const { first, last } = this.pieceRange;
    const start = startPiece ?? first;
    const end = endPiece ?? last;
    this._torrent.deselect(start, end);
  }
  // ==========================================================================
  // STREAMING
  // ==========================================================================
  /**
   * Create a W3C `ReadableStream<Uint8Array>` that reads this file's bytes
   * from the underlying {@link ChunkStore}, in order, in blocks of
   * {@link blockSize} bytes (default 64 KiB).
   *
   * Emits the `stream` event with the resulting stream as detail.
   *
   * Reading is **lazy**: each `pull` requests the next block from the
   * store.  This is the path that `<video src="…">` uses via the Service
   * Worker bridge.
   */
  createReadStream(opts = {}) {
    if (this._destroyed) {
      throw new Error("File has been destroyed");
    }
    const fileStart = opts.start ?? 0;
    const fileEnd = opts.end ?? this._length;
    const absStart = this._offset + fileStart;
    const absEnd = this._offset + fileEnd;
    if (fileStart < 0 || fileEnd > this._length || fileStart > fileEnd) {
      throw new RangeError(`Invalid range start=${fileStart}, end=${fileEnd}, length=${this._length}`);
    }
    let cursor = absStart;
    let cancelled = false;
    let doneEmitted = false;
    const stream = new ReadableStream({
      pull: /* @__PURE__ */ __name(async (controller) => {
        if (cancelled) {
          controller.close();
          return;
        }
        if (cursor >= absEnd) {
          if (!doneEmitted) {
            doneEmitted = true;
            this.emit("done", new CustomEvent("done"));
          }
          controller.close();
          return;
        }
        try {
          const block = await this._readBlock(cursor, Math.min(this._blockSize, absEnd - cursor));
          if (cancelled) return;
          if (block.length === 0) {
            controller.close();
            return;
          }
          controller.enqueue(block);
          cursor += block.length;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit("error", new CustomEvent("error", {
            detail: {
              error
            }
          }));
          controller.error(error);
        }
      }, "pull"),
      cancel: /* @__PURE__ */ __name(() => {
        cancelled = true;
      }, "cancel")
    });
    this.emit("stream", new CustomEvent("stream", {
      detail: stream
    }));
    return stream;
  }
  /**
   * Alias for {@link createReadStream}.  Returns a `ReadableStream<Uint8Array>`.
   */
  stream(opts = {}) {
    return this.createReadStream(opts);
  }
  /**
   * Async iterator yielding this file's bytes as `Uint8Array` chunks.
   *
   * Used by `for await (const chunk of file)` loops and is the basis of
   * `arrayBuffer` and `blob`.
   */
  [_computedKey]() {
    const stream = this.createReadStream();
    const iterator = stream[Symbol.asyncIterator]();
    this.emit("iterator", new CustomEvent("iterator", {
      detail: iterator
    }));
    return iterator;
  }
  /**
   * Read the entire file (or a byte range) into a single `ArrayBuffer`.
   *
   * Materializes the file in memory; suitable for small files only.
   * For large files prefer {@link createReadStream} or
   * {@link streamTo}.
   *
   * Supports `{ start, end }` to read a byte range — mirrors upstream
   * `file.arrayBuffer({ start, end })`.
   */
  async arrayBuffer(opts = {}) {
    const stream = this.createReadStream(opts);
    const chunks = [];
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out.buffer;
  }
  /**
   * Read the entire file (or a byte range) into a `Blob`.
   *
   * Supports `{ start, end }` to read a byte range — mirrors upstream
   * `file.blob({ start, end })`.
   */
  async blob(opts = {}) {
    const stream = this.createReadStream(opts);
    const chunks = [];
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return new Blob([
      out.buffer
    ], {
      type: this.type
    });
  }
  /**
   * Read the entire file into a `Blob` and return a temporary object URL
   * that can be assigned to `<video src>` etc.
   *
   * The caller is responsible for revoking the URL via
   * `URL.revokeObjectURL` when no longer needed.
   */
  async getBlobURL() {
    const blob = await this.blob();
    return URL.createObjectURL(blob);
  }
  /**
   * Wire this file's stream into a `<video>` / `<audio>` element via the
   * Service Worker bridge.
   *
   * Requires that the client has called `client.createServer({ controller })`
   * so the SW has a transport to the main thread.
   */
  streamTo(element) {
    const url = this.streamURL();
    element.src = url;
    element.load();
  }
  /**
   * Return the virtual URL the Service Worker uses to stream this file.
   *
   * Format: `<scope>webtorrent/<infoHash>/<fileIndex>/<encodedName>`.
   *
   * @throws Error if `infoHash` or `fileIndex` are not set, which means
   *   the file was constructed directly (not via `WebTorrent.add`).
   */
  streamURL() {
    if (!this._infoHash || this._fileIndex === void 0) {
      throw new Error("infoHash and fileIndex are required to generate streamURL. Create files via WebTorrent client (client.createServer + add).");
    }
    return buildStreamURL(this._scope, this._infoHash, this._fileIndex, this.name);
  }
  /**
   * Mark the file as destroyed; subsequent reads throw.
   */
  destroy() {
    this._destroyed = true;
  }
  // ==========================================================================
  // Internals
  // ==========================================================================
  /**
   * Read up to `length` bytes starting at the file's `absOffset` (the
   * absolute byte offset inside the torrent).
   *
   * Because the file's bytes may straddle piece boundaries, this method
   * pulls whole pieces from the {@link ChunkStore} and slices out the
   * exact byte range requested.
   */
  async _readBlock(absOffset, length) {
    const fileStart = this._offset;
    const fileEnd = this._offset + this._length;
    if (absOffset < fileStart || absOffset >= fileEnd) {
      return new Uint8Array(0);
    }
    const end = Math.min(absOffset + length, fileEnd);
    const out = new Uint8Array(end - absOffset);
    let written = 0;
    let cursor = absOffset;
    while (cursor < end) {
      const pieceIndex = Math.floor(cursor / this._pieceLength);
      const pieceStart = pieceIndex * this._pieceLength;
      const offsetInPiece = cursor - pieceStart;
      const pieceLen = Math.min(this._pieceLength, fileEnd - pieceStart);
      const wantInPiece = Math.min(pieceLen - offsetInPiece, end - cursor);
      const buf = await this._store.get(pieceIndex);
      if (!buf || buf.length === 0) break;
      out.set(buf.subarray(offsetInPiece, offsetInPiece + wantInPiece), written);
      written += wantInPiece;
      cursor += wantInPiece;
    }
    return out.subarray(0, written);
  }
};

// packages/core/src/mod.ts
init_mod();

// packages/core/src/extensions/ut-pex.ts
init_define_GENERATED_ASSETS();
init_bencode();

// packages/core/src/mod.ts
init_mod();
var _WEBRTC_SUPPORT = (() => {
  if (typeof globalThis === "undefined") return false;
  return typeof globalThis.RTCPeerConnection !== "undefined" || typeof globalThis.webkitRTCPeerConnection !== "undefined";
})();

// packages/service-worker/src/cache.ts
var CACHE_VERSION = true ? "v0.0.111-mu76cjbv" : `v${VERSION2}`;
var CACHE_NAME = `browsertorrent-cache-${CACHE_VERSION}`;
var ASSETS_TO_CACHE = typeof define_GENERATED_ASSETS_default !== "undefined" ? define_GENERATED_ASSETS_default : [];
function handleInstall(event) {
  console.log("[SW-CACHE] Installing Service Worker and caching assets...", CACHE_NAME);
  event.waitUntil((async () => {
    if (ASSETS_TO_CACHE.length > 0) {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(ASSETS_TO_CACHE.map((url) => cache.add(url).catch((err) => {
        console.warn(`[SW-CACHE] Asset cache warning for ${url}:`, err);
      })));
    }
    await self.skipWaiting();
  })());
}
__name(handleInstall, "handleInstall");
function handleActivate(event) {
  console.log("[SW-CACHE] Activating Service Worker...", CACHE_NAME);
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cache) => {
      if (cache !== CACHE_NAME && cache.startsWith("browsertorrent-cache-")) {
        console.log(`[SW-CACHE] Purging old cache: ${cache}`);
        return caches.delete(cache);
      }
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
}
__name(handleActivate, "handleActivate");
async function handleCacheFetch(event) {
  if (event.request.method !== "GET") {
    return void 0;
  }
  if (!event.request.url.startsWith(self.location.origin)) {
    return void 0;
  }
  try {
    const networkResponse = await fetch(event.request);
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, responseClone);
    }
    return networkResponse;
  } catch (_err) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return void 0;
  }
}
__name(handleCacheFetch, "handleCacheFetch");

// packages/service-worker/src/sw.ts
var torrentStreamHandler = createWebTorrentFetchHandler();
self.addEventListener("install", (e) => {
  handleInstall(e);
});
self.addEventListener("activate", (e) => {
  handleActivate(e);
});
self.addEventListener("message", (e) => {
  const { data } = e;
  if (data?.type === "PORT" && e.ports[0]) {
    torrentStreamHandler.setPagePort(e.ports[0]);
  }
});
self.addEventListener("fetch", (e) => {
  const streamPromise = torrentStreamHandler.handleFetch(e);
  if (streamPromise) {
    e.respondWith(streamPromise);
    return;
  }
  e.respondWith(handleCacheFetch(e).then((response) => response || fetch(e.request)));
});
//# sourceMappingURL=sw.js.map
