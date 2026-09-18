// /browsertorrent/monorepo/webtorrent/src/mod.ts
import { TypedEventTarget, } from "./utils/event-target.ts";
import {
  type ParsedTorrent,
  type ParsedTorrentFile,
  parseTorrent,
} from "./utils/parse-torrent.ts";
import { Torrent, } from "./core/torrent.ts";
import { Swarm, } from "./network/swarm.ts";
import { generateBrowserTorrentPeerId, } from "./utils/peerid.ts";
import { OPFSChunkStore, } from "./storage/opfs-chunk-store.ts";
import { type ChunkStore, } from "./storage/opfs-chunk-store.ts";
import { MemoryChunkStore, } from "./storage/memory-chunk-store.ts";
import { decode, encode, } from "./utils/bencode.ts";
import type { BencodeDict, } from "./utils/bencode.ts";
import {
  createServer,
  registerTorrentFiles,
  unregisterTorrentFiles,
  type WebTorrentServer,
} from "./server/server.ts";
import { File, } from "./core/file.ts";
import {
  generateTorrent,
  type OPFSFileEntry,
  PieceSizeEnum,
} from "./torrent-generator/mod.ts";
import { CORE_VERSION, VERSION, } from "./version.ts";

export { CORE_VERSION, VERSION, } from "./version.ts";

// ── WebRTC feature detection ──────────────────────────────────────────
const _WEBRTC_SUPPORT: boolean = (() => {
  if (typeof globalThis === "undefined") return false;
  return typeof (globalThis as unknown as {
        RTCPeerConnection: typeof RTCPeerConnection;
      }).RTCPeerConnection !== "undefined" ||
    typeof (globalThis as unknown as {
        webkitRTCPeerConnection: typeof RTCPeerConnection;
      }).webkitRTCPeerConnection !== "undefined";
})();

export interface WebTorrentEvents {
  [key: string]: Event | CustomEvent;
  /** Emitted when a torrent is added to the client (after add/seed). */
  torrent: CustomEvent<{ torrent: Torrent }>;
  /**
   * Emitted when a torrent is added to `client.torrents`.
   * Mirrors upstream `client.on('add', torrent)`.
   */
  add: CustomEvent<{ torrent: Torrent }>;
  /**
   * Emitted when a torrent is removed from `client.torrents`.
   * Mirrors upstream `client.on('remove', torrent)`.
   */
  remove: CustomEvent<{ torrent: Torrent; infoHash: string }>;
  error: CustomEvent<{ error: Error }>;
  ready: Event;
}

export interface ClientOptions {
  peerId?: Uint8Array | string;
  maxConns?: number;
  port?: number;
  useOPFS?: boolean;
  rtcConfig?: RTCConfiguration;
  serviceWorkerUrl?: string;
  serviceWorkerScope?: string;
  /**
   * Global download rate limit, in bytes/s. `0` = unlimited.
   * Default: `0`.
   */
  downloadLimit?: number;
  /**
   * Global upload rate limit, in bytes/s. `0` = unlimited.
   * Default: `0`.
   */
  uploadLimit?: number;
}

export interface AddTorrentOptions {
  skipVerify?: boolean;
  destroyStoreOnDestroy?: boolean;
  announce?: string[];
  onReady?: (torrent: Torrent,) => void;
  /**
   * Optional callback invoked when the torrent is fully done.
   */
  onDone?: (torrent: Torrent,) => void;
}

/** Input options for `client.seed()`. */
export interface SeedOptions {
  /** Display name; if omitted, the entry's name is used. */
  name?: string;
  /** Piece size preset or raw bytes. Default: `AUTO`. */
  pieceSize?: PieceSizeEnum | number;
  /** BEP-12 trackers. */
  trackers?: string[];
  /** Alias for trackers to match WebTorrent API. */
  announce?: string[];
  /** BEP-19 web seeds. */
  webSeeds?: string[];
  /** BEP-9 comment. */
  comment?: string;
  /** BEP-9 created-by string. */
  createdBy?: string;
  /** Mark as private (no DHT/PEX). */
  private?: boolean;
  /** BEP-47: align files on piece boundaries. */
  alignPiece?: boolean;
  /** Skip files whose name starts with `"."`. */
  ignoreHiddenFile?: boolean;
  /** Forward to {@link AddTorrentOptions}. */
  skipVerify?: boolean;
  /** Forward to {@link AddTorrentOptions}. */
  onReady?: (torrent: Torrent,) => void;
  /** Forward to {@link AddTorrentOptions}. */
  onDone?: (torrent: Torrent,) => void;
}

/** Input accepted by `client.seed()`. */
export type SeedInput =
  | FileSystemFileHandle
  | FileSystemDirectoryHandle
  | File
  | Blob
  | Uint8Array
  | { name: string; length: number; data: Uint8Array }
  | Array<
    FileSystemFileHandle | File | Blob | Uint8Array | {
      name: string;
      length: number;
      data: Uint8Array;
    }
  >;

export class Client extends TypedEventTarget<WebTorrentEvents> {
  /** `true` if the runtime supports WebRTC (RTCPeerConnection). */
  public static readonly WEBRTC_SUPPORT: boolean = _WEBRTC_SUPPORT;

  public readonly peerId: string;
  public readonly peerIdBuffer: Uint8Array;
  public readonly torrents: Map<string, Torrent> = new Map();
  public readonly torrentList: Torrent[] = [];
  public server: WebTorrentServer | null = null;

  private swarms: Map<string, Swarm> = new Map();
  private opts: ClientOptions;
  private destroyed = false;
  private ready = false;
  /** Global download throttle in bytes/s (0 = unlimited). */
  private _downloadLimit: number = 0;
  /** Global upload throttle in bytes/s (0 = unlimited). */
  private _uploadLimit: number = 0;

  constructor(opts: ClientOptions = {},) {
    super();
    this.opts = opts;
    this._downloadLimit = Math.max(0, opts.downloadLimit ?? 0,);
    this._uploadLimit = Math.max(0, opts.uploadLimit ?? 0,);

    let peerIdBuffer: Uint8Array;
    if (opts.peerId) {
      if (typeof opts.peerId === "string") {
        peerIdBuffer = new Uint8Array(20,);
        for (let i = 0; i < 20; i++) {
          peerIdBuffer[i] = parseInt(
            opts.peerId.substring(i * 2, i * 2 + 2,),
            16,
          );
        }
      } else {
        peerIdBuffer = opts.peerId;
      }
    } else {
      peerIdBuffer = generateBrowserTorrentPeerId();
    }

    this.peerIdBuffer = peerIdBuffer;
    this.peerId = Array.from(peerIdBuffer,)
      .map((b,) => b.toString(16,).padStart(2, "0",))
      .join("",);

    queueMicrotask(() => {
      this.ready = true;
      this.emit("ready",);
    },);
  }

  // ── Aggregate getters ──────────────────────────────────────────────

  get isReady(): boolean {
    return this.ready && !this.destroyed;
  }
  get isDestroyed(): boolean {
    return this.destroyed;
  }
  get torrentCount(): number {
    return this.torrents.size;
  }

  /** Aggregate download speed across all torrents (bytes/s). */
  get downloadSpeed(): number {
    let total = 0;
    for (const t of this.torrents.values()) {
      total += t.downloadSpeed;
    }
    return total;
  }

  /** Aggregate upload speed across all torrents (bytes/s). */
  get uploadSpeed(): number {
    let total = 0;
    for (const t of this.torrents.values()) {
      total += t.uploadSpeed;
    }
    return total;
  }

  /** Aggregate progress (0..1) weighted by torrent length. */
  get progress(): number {
    let totalLen = 0;
    let totalDownloaded = 0;
    for (const t of this.torrents.values()) {
      totalLen += t.length;
      totalDownloaded += t.downloaded;
    }
    if (totalLen === 0) return 0;
    return totalDownloaded / totalLen;
  }

  /** Aggregate ratio: total uploaded / total downloaded. */
  get ratio(): number {
    let totalDown = 0;
    let totalUp = 0;
    for (const t of this.torrents.values()) {
      totalDown += t.downloaded;
      totalUp += t.uploaded;
    }
    if (totalDown === 0) return totalUp > 0 ? Infinity : 0;
    return totalUp / totalDown;
  }

  /** Currently configured download limit (bytes/s). */
  get downloadLimit(): number {
    return this._downloadLimit;
  }

  /** Currently configured upload limit (bytes/s). */
  get uploadLimit(): number {
    return this._uploadLimit;
  }

  // ── Throttle ───────────────────────────────────────────────────────

  /**
   * Set the global download rate limit.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleDownload(rate: number,): void {
    this._downloadLimit = Math.max(0, rate,);
    for (const swarm of this.swarms.values()) {
      swarm.throttleDownload(this._downloadLimit,);
    }
  }

  /**
   * Set the global upload rate limit.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleUpload(rate: number,): void {
    this._uploadLimit = Math.max(0, rate,);
    for (const swarm of this.swarms.values()) {
      swarm.throttleUpload(this._uploadLimit,);
    }
  }

  /**
   * Get a torrent by `infoHash` (hex), magnet URI, or `.torrent` file buffer.
   * Returns `null` if not found.
   */
  async get(
    torrentId: string | Uint8Array | ParsedTorrent,
  ): Promise<Torrent | null> {
    if (this.destroyed) return null;
    try {
      const parsed = await parseTorrent(torrentId,);
      return this.torrents.get(parsed.infoHash,) ?? null;
    } catch {
      return null;
    }
  }

  // ── Service Worker integration ─────────────────────────────────────

  createServer(
    opts: { controller?: ServiceWorker; scope?: string } = {},
  ): WebTorrentServer {
    if (this.server) return this.server;

    const scope = opts.scope || this.opts.serviceWorkerScope || "/";
    this.server = createServer({ controller: opts.controller, scope, },);

    for (const torrent of this.torrents.values()) {
      const files = this._makeFileObjects(torrent, scope,);
      console.log(
        "[mod] createServer init: registering",
        files.length,
        "files for",
        torrent.infoHash,
      );
      registerTorrentFiles(torrent, files,);
      (torrent as unknown as {
        _registerFiles?: (files: ParsedTorrentFile[],) => void;
      })._registerFiles?.(files,);
    }

    this.on("torrent", (e: CustomEvent<{ torrent: Torrent }>,) => {
      const torrent: Torrent = e.detail.torrent;
      const files = this._makeFileObjects(torrent, scope,);
      console.log(
        "[mod] torrent event: registering",
        files.length,
        "files for",
        torrent.infoHash,
      );
      registerTorrentFiles(torrent, files,);
      (torrent as unknown as {
        _registerFiles?: (files: ParsedTorrentFile[],) => void;
      })._registerFiles?.(files,);
    },);

    return this.server;
  }

  private _makeFileObjects(torrent: Torrent, scope: string,): File[] {
    return torrent.files.map((pf, idx,) =>
      new File({
        store: torrent.store,
        length: pf.length,
        offset: pf.offset,
        pieceLength: torrent.pieceLength,
        name: pf.name,
        infoHash: torrent.infoHash,
        fileIndex: idx,
        scope,
        torrent,
      },)
    );
  }

  async initServiceWorker(): Promise<ServiceWorker | null> {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return null;
    }
    if (!this.opts.serviceWorkerUrl) {
      return null;
    }
    const reg = await navigator.serviceWorker.register(
      this.opts.serviceWorkerUrl,
      { scope: this.opts.serviceWorkerScope || "/", },
    );
    await navigator.serviceWorker.ready;
    this.createServer({ controller: reg.active ?? undefined, },);
    return reg.active;
  }

  // ── add / remove / destroy ─────────────────────────────────────────

  async add(
    torrentId: string | Uint8Array | ParsedTorrent,
    opts: AddTorrentOptions = {},
  ): Promise<Torrent> {
    if (this.destroyed) throw new Error("Client is destroyed",);

    const parsed = await parseTorrent(torrentId,);

    if (this.torrents.has(parsed.infoHash,)) {
      return this.torrents.get(parsed.infoHash,)!;
    }

    const store = await this._createChunkStore(parsed,);

    const announceList: string[] = [];
    if (parsed.announce) {
      announceList.push(...parsed.announce,);
    }
    if (opts.announce) {
      announceList.push(...opts.announce,);
    }

    const swarm = new Swarm({
      infoHash: parsed.infoHashBuffer,
      peerId: this.peerIdBuffer,
      announce: announceList,
      maxConns: this.opts.maxConns,
      port: this.opts.port,
      rtcConfig: this.opts.rtcConfig,
      metadata: parsed.infoBytes ??
        (parsed.pieces.length > 0 ? encode(parsed.info,) : undefined),
    },);

    const torrent = new Torrent(parsed, {
      store,
      skipVerify: opts.skipVerify,
      swarm,
    },);

    swarm.torrent = torrent;

    swarm.on("metadata", async (e: any,) => {
      const metadataBuffer = e.detail?.metadata || e.metadata || e;
      console.log(
        "[Client] swarm metadata event fired, size:",
        metadataBuffer?.length,
      );
      if (metadataBuffer instanceof Uint8Array) {
        await torrent.setMetadata(metadataBuffer,);
      }
    },);

    swarm.on("error", (e: CustomEvent<{ error: Error }>,) => {
      this.emit(
        "error",
        new CustomEvent("error", { detail: { error: e.detail.error, }, },),
      );
    },);

    swarm.on("noPeers", (e: CustomEvent<{ source: string }>,) => {
      torrent.emit(
        "noPeers",
        new CustomEvent("noPeers", { detail: e.detail, },),
      );
    },);

    // Aplica throttle se configurado.
    if (this._downloadLimit > 0) swarm.throttleDownload(this._downloadLimit,);
    if (this._uploadLimit > 0) swarm.throttleUpload(this._uploadLimit,);

    swarm.start();

    this.torrents.set(parsed.infoHash, torrent,);
    this.swarms.set(parsed.infoHash, swarm,);
    this.torrentList.push(torrent,);

    this.emit("add", new CustomEvent("add", { detail: { torrent, }, },),);

    if (this.server) {
      const files = this._makeFileObjects(torrent, this.server.scope,);
      registerTorrentFiles(torrent, files,);
      (torrent as unknown as {
        _registerFiles?: (files: ParsedTorrentFile[],) => void;
      })._registerFiles?.(files,);
    } else {
      // Registra os files mesmo sem server (para events download/upload nos Files).
      const files = this._makeFileObjects(torrent, "/",);
      (torrent as unknown as {
        _registerFiles?: (files: ParsedTorrentFile[],) => void;
      })._registerFiles?.(files,);
    }

    this.emit(
      "torrent",
      new CustomEvent("torrent", { detail: { torrent, }, },),
    );

    if (opts.onReady) {
      torrent.on("ready", () => opts.onReady!(torrent,),);
    }
    if (opts.onDone) {
      torrent.on("done", () => opts.onDone!(torrent,),);
    }

    return torrent;
  }

  /**
   * Seed a file or directory as a new torrent.
   *
   * Internally:
   * 1. Builds an OPFS-backed generator entry.
   * 2. Calls `generateTorrent()` to produce a `.torrent` buffer.
   * 3. Calls {@link WebTorrent.add} on that buffer.
   *
   * @returns the {@link Torrent} once it's been added and announced.
   */
  async seed(
    input: SeedInput,
    opts: SeedOptions = {},
    cb?: (torrent: Torrent,) => void,
  ): Promise<Torrent> {
    if (this.destroyed) throw new Error("Client is destroyed",);

    const { entry, name, length, } = await this._prepareSeedInput(
      input,
      opts.name,
    );

    // 1. Acumula os bytes do .torrent num Writer em memória.
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    const writer = {
      write: (p: Uint8Array,): Promise<number> => {
        chunks.push(p,);
        totalLen += p.length;
        return Promise.resolve(p.length,);
      },
    };

    // 2. Gera o .torrent.
    await generateTorrent({
      entry,
      writer,
      pieceSize: opts.pieceSize ?? PieceSizeEnum.SIZE_AUTO,
      trackers: opts.trackers ?? (opts.announce ?? []),
      webSeeds: opts.webSeeds ?? [],
      comment: opts.comment,
      createdBy: opts.createdBy,
      isPrivate: opts.private,
      alignPiece: opts.alignPiece,
      ignoreHiddenFile: opts.ignoreHiddenFile,
    },);

    const torrentBytes = new Uint8Array(totalLen,);
    let off = 0;
    for (const c of chunks) {
      torrentBytes.set(c, off,);
      off += c.length;
    }

    // 3. Adiciona o torrent ao cliente.
    const torrent = await this.add(torrentBytes, {
      skipVerify: opts.skipVerify ?? true,
      onReady: opts.onReady,
      onDone: opts.onDone,
    },);

    // O nome é usado como display-name se ainda não tiver.
    if (name && (!torrent.name || torrent.name === "Unknown")) {
      (torrent as unknown as { name: string }).name = name;
    }
    if (length && torrent.length === 0) {
      (torrent as unknown as { length: number }).length = length;
    }

    // 4. Popula o OPFSChunkStore com os dados do arquivo original (para streaming)
    // Sem isso, o streaming falha com "Chunk N not found"
    const store = torrent.store;
    console.log(
      "[seed] store available:",
      !!store,
      "put?",
      typeof store.put,
      "entry?",
      !!entry,
      "pieceLength:",
      torrent.pieceLength,
    );
    if (store && typeof store.put === "function" && entry) {
      console.log(
        "[seed] Populating chunk store with",
        Array.isArray(entry,) ? entry.length + " files" : "directory",
      );
      await this._populateChunkStoreFromOPFSEntry(
        entry,
        store,
        torrent.pieceLength,
      );
      await torrent.rescanFiles();
      console.log("[seed] Chunk store populated and verified successfully",);
    } else {
      console.log(
        "[seed] Skipping chunk store population: store=" + !!store,
        "put=" + typeof store.put,
        "entry=" + !!entry,
      );
    }

    if (cb) cb(torrent,);
    return torrent;
  }

  /**
   * Populates an OPFSChunkStore by reading from OPFS file entries.
   * This is needed because the seed writes files as a single OPFS file,
   * but OPFSChunkStore expects pieces as separate N.chunk files.
   */
  private async _populateChunkStoreFromOPFSEntry(
    entry: FileSystemDirectoryHandle | OPFSFileEntry[],
    store: { put(index: number, buf: Uint8Array,): Promise<void> },
    pieceLength: number,
  ): Promise<void> {
    let files: OPFSFileEntry[];
    if (Array.isArray(entry,)) {
      files = entry;
    } else {
      const { walkOPFSDir, } = await import("./torrent-generator/mod.ts");
      files = await walkOPFSDir(entry, false,);
    }
    console.log(
      "[_populateChunkStore] Starting with",
      files.length,
      "files, pieceLength:",
      pieceLength,
    );

    // Read all files sequentially and write pieces to the chunk store
    const PIECE_SIZE = pieceLength || 16384;
    let pieceIndex = 0;
    let pieceBuffer = new Uint8Array(PIECE_SIZE,);
    let pieceOffset = 0;
    let totalWritten = 0;

    for (const fileEntry of files) {
      if (!fileEntry.handle) {
        console.warn(
          "[_populateChunkStore] Skipping file without handle:",
          fileEntry.name,
        );
        continue;
      }
      const file = await fileEntry.handle.getFile();
      console.log(
        "[_populateChunkStore] Reading file:",
        fileEntry.name,
        "size:",
        file.size,
      );
      let fileOffset = 0;

      while (fileOffset < file.size) {
        const want = Math.min(
          PIECE_SIZE - pieceOffset,
          file.size - fileOffset,
        );
        const blob = file.slice(fileOffset, fileOffset + want,);
        const buf = new Uint8Array(await blob.arrayBuffer(),);

        pieceBuffer.set(buf, pieceOffset,);
        pieceOffset += buf.byteLength;
        fileOffset += buf.byteLength;

        if (pieceOffset === PIECE_SIZE) {
          await store.put(pieceIndex, pieceBuffer,);
          totalWritten += pieceBuffer.length;
          pieceIndex++;
          pieceBuffer = new Uint8Array(PIECE_SIZE,);
          pieceOffset = 0;
        }
      }
    }

    // Write any remaining partial piece
    if (pieceOffset > 0) {
      const partial = pieceBuffer.slice(0, pieceOffset,);
      await store.put(pieceIndex, partial,);
      totalWritten += partial.length;
      console.log(
        "[_populateChunkStore] Wrote final piece",
        pieceIndex,
        "size:",
        pieceOffset,
      );
    }
    console.log(
      "[_populateChunkStore] Done. Total pieces:",
      pieceIndex + (pieceOffset > 0 ? 1 : 0),
      "bytes written:",
      totalWritten,
    );
  }

  /**
   * Normaliza o `SeedInput` para uma entrada que o generator aceita.
   *
   * - FileSystemDirectoryHandle → passa direto.
   * - Array de handles/files      → escreve no OPFS num diretório temporário.
   * - File/Blob/Uint8Array único → escreve no OPFS num diretório temporário.
   * - Plain object                → mesma estratégia.
   */
  private async _prepareSeedInput(
    input: SeedInput,
    displayName?: string,
  ): Promise<
    {
      entry: FileSystemDirectoryHandle | OPFSFileEntry[];
      name?: string;
      length?: number;
    }
  > {
    // Validate input early to ensure TypeError is thrown (not ReferenceError from
    // instanceof checks against browser-only globals like FileSystemFileHandle).
    if (
      input === null ||
      input === undefined ||
      (input !== null && typeof input !== "object" && typeof input !== "string")
    ) {
      throw new TypeError("Unsupported seed input",);
    }

    // Caso 1: directory handle direto.
    if (input instanceof FileSystemDirectoryHandle) {
      return { entry: input, name: displayName, };
    }

    // Caso 2: array de inputs → escreve no OPFS e devolve o directory handle.
    if (Array.isArray(input,)) {
      const rootDir = await this._createTempOPFSDir();
      const entries: OPFSFileEntry[] = [];
      for (const item of input) {
        const { name: iname, size, data, } = await this._materializeInput(
          item,
        );
        const fileHandle = await rootDir.getFileHandle(iname, {
          create: true,
        },);
        const writable = await fileHandle.createWritable();
        await writable.write(new Uint8Array(data,),);
        await writable.close();
        entries.push({ name: iname, size, handle: fileHandle, },);
      }
      return { entry: rootDir, name: displayName, };
    }

    // Caso 3: input único.
    const { name: iname, size, data, } = await this._materializeInput(input,);
    const rootDir = await this._createTempOPFSDir();
    const fileHandle = await rootDir.getFileHandle(iname, { create: true, },);
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(data,),);
    await writable.close();
    return {
      entry: [{ name: iname, size, handle: fileHandle, },],
      name: displayName ?? iname,
      length: size,
    };
  }

  /** Converte um input em `{ name, size, data: Uint8Array }`. */
  private async _materializeInput(
    item: FileSystemFileHandle | File | Blob | Uint8Array | {
      name: string;
      length: number;
      data: Uint8Array;
    },
  ): Promise<{ name: string; size: number; data: Uint8Array }> {
    let data: Uint8Array;
    let name: string;

    if (item instanceof FileSystemFileHandle) {
      const file = await item.getFile();
      data = new Uint8Array(await file.arrayBuffer(),);
      name = item.name;
    } else if (
      item instanceof File ||
      (typeof Blob !== "undefined" && item instanceof Blob)
    ) {
      data = new Uint8Array(await item.arrayBuffer(),);
      name = (item as File).name ?? "file";
    } else if (item instanceof Uint8Array) {
      // Ensure non-shared ArrayBuffer for OPFS compatibility.
      data = item.buffer instanceof ArrayBuffer &&
          !(typeof SharedArrayBuffer !== "undefined" &&
            item.buffer instanceof SharedArrayBuffer)
        ? item
        : new Uint8Array(item,);
      name = "file";
    } else if (
      item && typeof item === "object" && "data" in item && "name" in item
    ) {
      name = String(item.name,);
      data = item.data instanceof Uint8Array
        ? (item.data.buffer instanceof ArrayBuffer &&
            !(typeof SharedArrayBuffer !== "undefined" &&
              item.data.buffer instanceof SharedArrayBuffer)
          ? item.data
          : new Uint8Array(item.data,))
        : new Uint8Array(item.data as ArrayBuffer,);
    } else {
      throw new TypeError("Unsupported seed input",);
    }

    const size = data.length;
    return { name, size, data, };
  }

  /** Cria (ou reusa) um diretório temporário dentro do OPFS para seeding. */
  private async _createTempOPFSDir(): Promise<FileSystemDirectoryHandle> {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      throw new Error("OPFS not available: cannot seed from this environment",);
    }
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle("browsertorrent-seed", { create: true, },);
  }

  async remove(infoHash: string, destroyStore = false,): Promise<void> {
    const torrent = this.torrents.get(infoHash,);
    const swarm = this.swarms.get(infoHash,);

    if (!torrent) return;

    if (swarm) {
      swarm.destroy();
      this.swarms.delete(infoHash,);
    }

    await torrent.destroy(destroyStore,);
    this.torrents.delete(infoHash,);

    const index = this.torrentList.indexOf(torrent,);
    if (index !== -1) {
      this.torrentList.splice(index, 1,);
    }

    this.emit(
      "remove",
      new CustomEvent("remove", { detail: { torrent, infoHash, }, },),
    );

    if (this.server) {
      unregisterTorrentFiles(infoHash,);
    }
  }

  async destroy(callback?: () => void,): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const [, swarm,] of this.swarms) {
      swarm.destroy();
    }
    this.swarms.clear();

    for (const [, torrent,] of this.torrents) {
      await torrent.destroy(false,);
    }
    this.torrents.clear();
    this.torrentList.length = 0;

    if (this.server) {
      this.server.destroy();
      this.server = null;
    }

    if (callback) callback();
  }

  private async _createChunkStore(parsed: ParsedTorrent,): Promise<ChunkStore> {
    const useOPFS = this.opts.useOPFS !== false;

    if (useOPFS && globalThis.navigator?.storage?.getDirectory) {
      try {
        const rootDir = await globalThis.navigator.storage.getDirectory();
        const torrentDir = await rootDir.getDirectoryHandle(
          `webtorrent-${parsed.infoHash}`,
          { create: true, },
        );

        return new OPFSChunkStore({
          chunkLength: parsed.pieceLength || 16384,
          length: parsed.length || 0,
          rootDir: torrentDir,
        },);
      } catch (err) {
        console.warn(
          "[WebTorrent] OPFS not available, falling back to memory store:",
          err,
        );
      }
    }

    return new MemoryChunkStore({
      chunkLength: parsed.pieceLength || 16384,
      length: parsed.length || 0,
    },);
  }
}

export { Torrent, } from "./core/torrent.ts";
export { Swarm, } from "./network/swarm.ts";
export { Peer, } from "./network/peer.ts";
export { HttpTracker, WsTracker, } from "./network/tracker.ts";
export type { Tracker, } from "./network/tracker.ts";
export { Wire, } from "./core/wire.ts";
export { File, } from "./core/file.ts";
export { Piece, } from "./core/piece.ts";
export { parseTorrent, } from "./utils/parse-torrent.ts";
export {
  decodePeerId,
  generateBrowserTorrentPeerId,
  BT_PEER_ID_PREFIX,
} from "./utils/peerid.ts";
export { UtMetadata, } from "./extensions/ut-metadata.ts";
export {
  decodePexUpdate,
  encodePexUpdate,
  PexPeerFlag,
  UtPexExtension,
} from "./extensions/ut-pex.ts";
export type { ParsedTorrent, } from "./utils/parse-torrent.ts";
export type { ClientInfo, } from "./utils/peerid.ts";
export type { PexPeer, PexUpdate, UtPexOptions, } from "./extensions/ut-pex.ts";
export {
  createServer,
  type StreamRequestMessage,
  WebTorrentServer,
} from "./server/server.ts";
export {
  buildStreamURL,
  parseStreamURL,
  streamManager,
} from "./server/stream-manager.ts";
// Phase 5.3: OPFS-based torrent generator
export {
  buildPieceFiles,
  calcPieceSize,
  fileSizeSum,
  generateTorrent,
  getDefaultCreatedBy,
  getOPFSFileSize,
  isHiddenFile,
  OPFSMultiFileReader,
  PieceSizeEnum,
  sha1sum,
  walkOPFSDir,
} from "./torrent-generator/mod.ts";
export type {
  GeneratorOptions,
  OPFSFileEntry,
  PieceFile,
  Torrent as GeneratedTorrent,
  Writer as TorrentWriter,
} from "./torrent-generator/mod.ts";
// Service Worker integration
export {
  getWebTorrentPrefix,
  guessDestination,
  handleStream,
  initStreamingServiceWorker,
  isServiceWorkerSupported,
  registerServiceWorker,
  type ServiceWorkerRegisterOptions,
  type StreamHandlerOptions,
} from "./service-worker/mod.ts";

