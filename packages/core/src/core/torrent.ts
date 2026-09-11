// /loco/monorepo/webtorrent/src/core/torrent.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { ParsedTorrent, ParsedTorrentFile } from "../utils/parse-torrent.ts";
import { ChunkStore } from "../storage/opfs-chunk-store.ts";
import { Bitfield } from "./bitfield.ts";
import { sha1 } from "../crypto/hasher.ts";
import { decode, type BencodeDict } from "../utils/bencode.ts";
import type { Wire } from "./wire.ts";
import type { File } from "./file.ts";

// ============================================================================
// TIPOS DE EVENTOS
// ============================================================================

export interface TorrentEvents {
  ready: Event;
  metadata: CustomEvent<{ files: ParsedTorrentFile[]; length: number; name: string }>;
  download: CustomEvent<{ bytes: number }>;
  upload: CustomEvent<{ bytes: number }>;
  done: Event;
  error: CustomEvent<{ error: Error }>;
  verified: CustomEvent<{ index: number }>;
  /** Emitido quando o torrent é adicionado ao cliente (infoHash disponível) */
  infoHash: CustomEvent<{ infoHash: string }>;
  /** Emitido quando um peer ou tracker reporta um warning não-fatal */
  warning: CustomEvent<{ error: Error }>;
  /** Emitido quando o tracker ou PEX indica que não há peers disponíveis */
  noPeers: CustomEvent<{ source: string }>;
  /** Emitido quando não há atividade de rede por 30 segundos */
  idle: Event;
  /** Emitido quando um novo Wire é estabelecido com um peer */
  wire: CustomEvent<{ wire: Wire; addr: string }>;
}

export interface TorrentOptions {
  store: ChunkStore;
  skipVerify?: boolean;
  /** Swarm externo; quando fornecido, o Torrent delega pause/resume/select/deselect a ele */
  swarm?: any;
}

// ============================================================================
// CLASSE TORRENT
// ============================================================================

export class Torrent extends TypedEventTarget<TorrentEvents> {
  public readonly infoHash: string;
  public name: string;
  public pieceLength: number;
  public length: number;
  /** Returns enriched {@link File} instances (with `streamTo`, `createReadStream`, etc.) when the client has registered them, or the raw metadata file descriptors otherwise. */
  public get files(): File[] | ParsedTorrentFile[] { return this._registeredFiles.length > 0 ? this._registeredFiles : this._rawFiles; }
  /** Raw file descriptors from parsed metadata — used as fallback until the client registers enriched File instances. */
  private _rawFiles: ParsedTorrentFile[] = [];

  private parsedTorrent: ParsedTorrent;
  private store: ChunkStore;
  private bitfield: Bitfield;
  private expectedPieces: Uint8Array[];

  private _downloaded: number = 0;
  private _uploaded: number = 0;
  private _destroyed: boolean = false;
  private _ready: boolean = false;
  private _metadataReceived: boolean = false;
  private _paused: boolean = false;

  /** Swarm ao qual delegamos operações de rede */
  private _swarm?: any;
  /** Bitfield de peças selecionadas */
  private _selected: Bitfield;
  /** Bitfield de peças críticas */
  private _critical: Bitfield;
  /** Velocidade de download atual em bytes/s */
  private _downloadSpeed: number = 0;
  /** Velocidade de upload atual em bytes/s */
  private _uploadSpeed: number = 0;
  /** Timestamp do último sample de velocidade */
  private _lastSpeedSample: number = 0;
  /** Lista de Web Seeds (URLs HTTP) */
  private _webSeeds: string[] = [];
  /** Timeout de inatividade */
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _IDLE_TIMEOUT_MS = 30000;
  /** Intervals de velocidade por wire */
  private readonly _speedIntervals: Set<ReturnType<typeof setInterval>> = new Set();
  /** File objects registrados pelo cliente (para forward de eventos). */
  private _registeredFiles: File[] = [];

  constructor(parsedTorrent: ParsedTorrent, opts: TorrentOptions) {
    super();
    this.parsedTorrent = parsedTorrent;
    this.store = opts.store;
    this._swarm = opts.swarm;

    this.infoHash = parsedTorrent.infoHash;
    this.name = parsedTorrent.name || "Unknown";
    this.pieceLength = parsedTorrent.pieceLength;
    this.length = parsedTorrent.length;
    this._rawFiles = parsedTorrent.files;

    const numPieces = parsedTorrent.pieces.length;
    this.bitfield = new Bitfield(numPieces);
    this.expectedPieces = parsedTorrent.pieces;
    this._selected = new Bitfield(numPieces);
    this._critical = new Bitfield(numPieces);
    this._webSeeds = [...(parsedTorrent.urlList || [])];

    queueMicrotask(() => {
      this._init(opts.skipVerify || false).catch((err) => {
        this._onError(err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.emit("infoHash", new CustomEvent("infoHash", { detail: { infoHash: this.infoHash } }));
  }

  // ==========================================================================
  // GETTERS COMPUTADOS
  // ==========================================================================

  get ready(): boolean { return this._ready; }
  get destroyed(): boolean { return this._destroyed; }
  get downloaded(): number { return this._downloaded; }
  get uploaded(): number { return this._uploaded; }
  get paused(): boolean { return this._paused; }

  get progress(): number {
    if (this.length === 0) return 0;
    return this._downloaded / this.length;
  }

  get numPieces(): number { return this.expectedPieces.length; }

  get lastPieceLength(): number {
    return this.length % this.pieceLength || this.pieceLength;
  }

  /** URI magnet completo. */
  get magnetURI(): string {
    return this.parsedTorrent.magnetURI || "";
  }

  /** Número de peers conectados (via swarm). */
  get numPeers(): number {
    return this._swarm?.peers?.size ?? 0;
  }

  /** Velocidade de download em bytes/s. */
  get downloadSpeed(): number { return this._downloadSpeed; }

  /** Velocidade de upload em bytes/s. */
  get uploadSpeed(): number { return this._uploadSpeed; }

  /** Ratio upload/download. Infinity se nada foi baixado. */
  get ratio(): number {
    if (this._downloaded === 0) return Infinity;
    return this._uploaded / this._downloaded;
  }

  /** Tempo restante estimado em segundos. null se não pode estimar. */
  get timeRemaining(): number | null {
    if (this._downloadSpeed <= 0 || this.progress >= 1) return null;
    const remaining = this.length - this._downloaded;
    return Math.ceil(remaining / this._downloadSpeed);
  }

  /** Bitfield de peças baixadas. */
  get pieces(): Bitfield { return this.bitfield; }

  /** Bitfield de peças selecionadas. */
  get selected(): Bitfield { return this._selected; }

  /** Bitfield de peças críticas. */
  get criticalPieces(): Bitfield { return this._critical; }

  /** Lista de Web Seeds. */
  get webSeeds(): string[] { return [...this._webSeeds]; }

  // ── webtorrent.min.js parity ─────────────────────────────────────────

  /** Alias de `downloaded`. */
  get received(): number { return this._downloaded; }

  /** `true` quando `progress === 1`. */
  get done(): boolean { return this.progress >= 1; }

  /** Data de criação do torrent (de `creation date`). */
  get created(): Date | undefined {
    const ts = this.parsedTorrent.info["creation date"];
    return typeof ts === "number" ? new Date(ts * 1000) : undefined;
  }

  /** Campo `created by` do torrent. */
  get createdBy(): string | undefined { return this.parsedTorrent.createdBy; }

  /** Campo `comment` do torrent. */
  get comment(): string | undefined { return this.parsedTorrent.comment; }

  /**
   * Bencode bytes do arquivo `.torrent` completo.
   * `undefined` se o torrent foi adicionado via magnet (sem arquivo `.torrent`).
   */
  get torrentFile(): Uint8Array | undefined {
    return this.parsedTorrent.torrentFileBytes;
  }

  /**
   * Blob do arquivo `.torrent`. Útil para download pelo usuário.
   * `undefined` se o torrent foi adicionado via magnet.
   */
  get torrentFileBlob(): Blob | undefined {
    const bytes = this.torrentFile;
    return bytes ? new Blob([new Uint8Array(bytes)]) : undefined;
  }

  /** Lista de trackers do torrent. */
  get announce(): string[] { return this.parsedTorrent.announce; }

  /** Máximo de conexões Web Seed simultâneas. */
  get maxWebConns(): number { return this._swarm?.maxConns ?? 10; }

  // ==========================================================================
  // SELEÇÃO DE PEÇAS
  // ==========================================================================

  /**
   * Marca interesse em peças [startPiece, endPiece] e envia `interested` nos wires.
   * Se endPiece for omitido, seleciona até o fim.
   */
  select(startPiece: number, endPiece?: number, _priority = 0, _notify = false): void {
    const end = endPiece ?? this.numPieces - 1;
    for (let i = startPiece; i <= end; i++) {
      this._selected.set(i);
    }
    this._swarm?._sendInterested();
  }

  /**
   * Remove interesse em peças [startPiece, endPiece] e envia `not-interested` se
   * nenhuma peça estiver mais selecionada.
   */
  deselect(startPiece: number, endPiece?: number): void {
    const end = endPiece ?? this.numPieces - 1;
    for (let i = startPiece; i <= end; i++) {
      this._selected.unset(i);
    }
    if (this._selected.count() === 0) {
      this._swarm?._sendNotInterested();
    }
  }

  /**
   * Marca peças como críticas (raras) e envia `suggestPiece` nos wires.
   * Peças críticas são solicitadas antes das demais.
   */
  setCritical(startPiece: number, endPiece?: number): void {
    const end = endPiece ?? startPiece;
    for (let i = startPiece; i <= end; i++) {
      this._critical.set(i);
    }
    for (let i = startPiece; i <= end; i++) {
      this._swarm?._sendSuggestPiece(i);
    }
  }

  // ==========================================================================
  // RESCAN FILES
  // ==========================================================================

  /**
   * Re-verifica todas as peças existentes no store.
   * Útil quando o store foi manipulado externamente.
   *
   * @param cb - Callback chamado com `(err, res)` quando a varredura termina.
   *             Se omitido, retorna uma Promise.
   */
  rescanFiles(cb?: (err: Error | null) => void): void | Promise<void> {
    const task = this._verifyExistingPieces()
      .then(() => { cb?.(null); })
      .catch((err) => { cb?.(err instanceof Error ? err : new Error(String(err))); });

    if (!cb) return task;
  }

  // ==========================================================================
  // PAUSE / RESUME
  // ==========================================================================

  pause(): void {
    this._paused = true;
    this._swarm?.pause();
  }

  resume(): void {
    this._paused = false;
    this._swarm?.resume();
  }

  // ==========================================================================
  // PEERS E WEB SEEDS
  // ==========================================================================

  addPeer(addr: string): boolean {
    return this._swarm?.addPeer(addr) ?? false;
  }

  removePeer(addr: string): void {
    this._swarm?.removePeer(addr);
  }

  addWebSeed(url: string): void {
    if (!this._webSeeds.includes(url)) {
      this._webSeeds.push(url);
    }
  }

  removeWebSeed(url: string): void {
    const idx = this._webSeeds.indexOf(url);
    if (idx !== -1) this._webSeeds.splice(idx, 1);
  }

  // ==========================================================================
  // REGISTRO DE WIRES (chamado pelo Swarm)
  // ==========================================================================

  _registerWire(wire: Wire, addr: string): void {
    this.emit("wire", new CustomEvent("wire", { detail: { wire, addr } }));

    let lastDownloaded = 0;
    let lastUploaded = 0;
    const interval = setInterval(() => {
      if (wire.isDestroyed) {
        clearInterval(interval);
        this._speedIntervals.delete(interval);
        return;
      }
      const now = Date.now();
      const dt = (now - this._lastSpeedSample) / 1000;
      if (dt > 0) {
        const dl = (wire.downloadedBytes - lastDownloaded) / dt;
        const ul = (wire.uploadedBytes - lastUploaded) / dt;
        this._downloadSpeed = Math.round(this._downloadSpeed * 0.8 + dl * 0.2);
        this._uploadSpeed = Math.round(this._uploadSpeed * 0.8 + ul * 0.2);
      }
      lastDownloaded = wire.downloadedBytes;
      lastUploaded = wire.uploadedBytes;
      this._lastSpeedSample = now;
    }, 1000);

    this._speedIntervals.add(interval);
    this._resetIdleTimer();
  }

  // ==========================================================================
  // INJEÇÃO TARDIA DE METADADOS (Magnet URIs)
  // ==========================================================================

  async setMetadata(infoBuffer: Uint8Array): Promise<boolean> {
    if (this._metadataReceived) return false;

    try {
      const info = decode(infoBuffer) as BencodeDict;

      const pieceLength = info["piece length"] as number;
      const piecesRaw = info["pieces"];

      if (typeof pieceLength !== "number" || !(piecesRaw instanceof Uint8Array)) {
        throw new Error("Invalid metadata: missing piece length or pieces");
      }

      const newExpectedPieces: Uint8Array[] = [];
      for (let i = 0; i < piecesRaw.length; i += 20) {
        newExpectedPieces.push(piecesRaw.subarray(i, i + 20));
      }

      const newFiles: ParsedTorrentFile[] = [];
      let totalLength = 0;
      const textDecoder = new TextDecoder();

      if (info["files"]) {
        const filesList = info["files"] as BencodeDict[];
        for (const fileDict of filesList) {
          const length = fileDict["length"] as number;
          const pathList = fileDict["path"] as (Uint8Array | string)[];
          const pathParts = pathList.map((p) =>
            typeof p === "string" ? p : textDecoder.decode(p)
          );
          const path = pathParts.join("/");
          const name = pathParts[pathParts.length - 1]!;
          newFiles.push({ path, name, length, offset: totalLength });
          totalLength += length;
        }
      } else {
        const length = info["length"] as number;
        const nameRaw = info["name"];
        const name = typeof nameRaw === "string"
          ? nameRaw
          : textDecoder.decode(nameRaw as Uint8Array);
        newFiles.push({ path: name, name, length, offset: 0 });
        totalLength = length;
      }

      this.pieceLength = pieceLength;
      this.length = totalLength;
      this._rawFiles = newFiles;
      this.expectedPieces = newExpectedPieces;

      const nameRaw = info["name"];
      this.name = typeof nameRaw === "string"
        ? nameRaw
        : textDecoder.decode(nameRaw as Uint8Array);

      const newNum = newExpectedPieces.length;
      this.bitfield = new Bitfield(newNum);
      this._selected = new Bitfield(newNum);
      this._critical = new Bitfield(newNum);
      this._metadataReceived = true;

      this.emit("metadata", new CustomEvent("metadata", {
        detail: { files: this.files, length: this.length, name: this.name }
      }));

      await this._verifyExistingPieces();
      return true;
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  // ==========================================================================
  // CICLO DE VIDA
  // ==========================================================================

  private async _init(skipVerify: boolean): Promise<void> {
    try {
      if (!skipVerify && this.numPieces > 0) {
        await this._verifyExistingPieces();
      }
      this._ready = true;
      this._lastSpeedSample = Date.now();
      this.emit("ready");
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async _verifyExistingPieces(): Promise<void> {
    for (let i = 0; i < this.numPieces; i++) {
      try {
        const opts = i === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
        const buf = await this.store.get(i, opts);
        await this._verifyPiece(i, buf);
      } catch (err: any) {
        if (!err.notFound) {
          console.warn(`[Torrent] Erro ao verificar peça ${i}:`, err);
        }
      }
    }
  }

  // ==========================================================================
  // RECEBIMENTO DE DADOS
  // ==========================================================================

  async receivePiece(index: number, buf: Uint8Array): Promise<boolean> {
    if (this._destroyed) return false;
    if (this.bitfield.get(index)) return true;
    if (!this._metadataReceived && this.numPieces === 0) return false;

    try {
      await this._verifyPiece(index, buf);
      await this.store.put(index, buf);
      this.bitfield.set(index);
      const pieceLen = index === this.numPieces - 1 ? this.lastPieceLength : this.pieceLength;
      this._downloaded += pieceLen;
      this._resetIdleTimer();

      this.emit("verified", new CustomEvent("verified", { detail: { index } }));
      this.emit("download", new CustomEvent("download", { detail: { bytes: pieceLen } }));
      this._forwardToFiles("download", index, pieceLen);

      if (this.progress >= 1) {
        this.emit("done");
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Registra `File` instances para receberem os eventos `download`/`upload`.
   * Chamado pelo {@link WebTorrent} após criar os `File`s.
   */
  _registerFiles(files: File[]): void {
    this._registeredFiles = files;
  }

  /**
   * Emite um evento de download/upload nos Files cujo `pieceRange` contém `index`.
   */
  private _forwardToFiles(
    type: "download" | "upload",
    index: number,
    bytes: number,
  ): void {
    for (const f of this._registeredFiles) {
      const file = f as {
        pieceRange: { first: number; last: number };
        emit: (type: string, ev: Event) => void;
      };
      if (index >= file.pieceRange.first && index <= file.pieceRange.last) {
        file.emit(type, new CustomEvent(type, { detail: { bytes } }));
      }
    }
  }

  async getPiece(index: number): Promise<Uint8Array | null> {
    if (!this.bitfield.get(index)) return null;
    try {
      const opts = index === this.numPieces - 1 ? { length: this.lastPieceLength } : undefined;
      return await this.store.get(index, opts);
    } catch {
      return null;
    }
  }

  async destroy(destroyStore = false): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const interval of this._speedIntervals) clearInterval(interval);
    this._speedIntervals.clear();

    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }

    try {
      if (destroyStore) {
        await this.store.destroy();
      } else {
        await this.store.close();
      }
    } catch (err) {
      console.warn("[Torrent] Erro ao fechar store:", err);
    }
  }

  // ==========================================================================
  // PRIVADOS
  // ==========================================================================

  private async _verifyPiece(index: number, buf: Uint8Array): Promise<void> {
    const expected = this.expectedPieces[index];
    if (!expected) throw new Error(`Índice de peça ${index} fora do limite.`);

    const actual = await sha1(buf);
    const expectedHex = Array.from(expected)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (actual !== expectedHex) {
      throw new Error(`Hash mismatch na peça ${index}.`);
    }
  }

  private _resetIdleTimer(): void {
    if (this._idleTimer !== null) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this.emit("idle");
    }, this._IDLE_TIMEOUT_MS) as unknown as ReturnType<typeof setTimeout>;
  }

  private _onError(err: Error): void {
    this.emit("error", new CustomEvent("error", { detail: { error: err } }));
  }
}
