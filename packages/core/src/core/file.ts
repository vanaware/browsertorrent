// /loco/monorepo/webtorrent/src/core/file.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Piece } from "./piece.ts";
import { buildStreamURL } from "../server/stream-manager.ts";
import type { ChunkStore } from "../storage/opfs-chunk-store.ts";
import type { Torrent } from "./torrent.ts";

/**
 * Minimal MIME type map for common file extensions encountered in torrents.
 * Falls back to `"application/octet-stream"`.
 */
const MIME_MAP: Record<string, string> = {
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
  iso: "application/x-iso9660-image",
};

/**
 * Browser-first File class — the "live" view of a file inside a torrent.
 *
 * Mirrors the upstream `webtorrent.min.js` `File` class: a piece-aware
 * facade that exposes streaming (`createReadStream`, `stream`),
 * `ReadableStream<Uint8Array>` adapters, byte buffers (`arrayBuffer`,
 * `blob`, `getBlobURL`), iteration (`Symbol.asyncIterator`), and
 * Service Worker integration (`streamURL`, `streamTo`).
 *
 * **Adaptação do upstream**: a implementação upstream lê diretamente do
 * sistema de arquivos do torrent (que no browser não existe); aqui,
 * toda leitura é roteada ao {@link ChunkStore} do torrent.  Isso
 * permite streaming sob demanda de peças que ainda estão sendo baixadas
 * ou que vieram do OPFS.
 */

export interface FileOptions {
  /** Backend store for the file's bytes (peça-a-peça). */
  store: ChunkStore;
  /** Total size of the file in bytes. */
  length: number;
  /** Byte offset of the file inside the concatenated torrent stream. */
  offset: number;
  /** Piece size used by the torrent. */
  pieceLength: number;
  /** File name (e.g. `"movie.mp4"`); used in {@link streamURL}. */
  name?: string;
  /** Full path inside the torrent (defaults to `name`). */
  path?: string;
  /** Identifier of the torrent owning this file. */
  infoHash?: string;
  /** File index inside the torrent (0-based). */
  fileIndex?: number;
  /** Service Worker scope (e.g. `"/"`). */
  scope?: string;
  /** Default block size for streaming (defaults to 64 KiB). */
  blockSize?: number;
  /** Owning torrent (used for per-file downloaded/progress tracking). */
  torrent?: Torrent;
}

export interface FileEvents {
  /** Emitido quando `createReadStream()` é chamado, com a stream resultante. */
  stream: CustomEvent<ReadableStream<Uint8Array>>;
  /** Emitido quando o iterator `Symbol.asyncIterator` é criado. */
  iterator: CustomEvent<AsyncIterable<Uint8Array>>;
  /** Emitido quando a leitura/streaming termina com sucesso. */
  done: CustomEvent<void>;
  /** Emitido em erro durante leitura. */
  error: CustomEvent<{ error: Error }>;
  /** Emitido quando bytes deste arquivo específico são baixados. */
  download: CustomEvent<{ bytes: number }>;
  /** Emitido quando bytes deste arquivo são enviados a peers. */
  upload: CustomEvent<{ bytes: number }>;
}

/**
 * A `File` inside a torrent.
 *
 * Provides streaming reads, byte buffer adapters, and Service Worker
 * integration for browser media playback.
 */
export class File extends TypedEventTarget<FileEvents> {
  private _store: ChunkStore;
  private _length: number;
  private _offset: number;
  private _pieceLength: number;
  private _name: string;
  private _path: string;
  private _infoHash?: string;
  private _fileIndex?: number;
  private _scope: string;
  private _blockSize: number;
  private _destroyed = false;
  private _torrent?: Torrent;

  constructor(options: FileOptions) {
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

  get length(): number {
    return this._length;
  }

  get name(): string {
    return this._name;
  }

  get path(): string {
    return this._path;
  }

  get pieceLength(): number {
    return this._pieceLength;
  }

  get offset(): number {
    return this._offset;
  }

  get infoHash(): string | undefined {
    return this._infoHash;
  }

  get fileIndex(): number | undefined {
    return this._fileIndex;
  }

  get scope(): string {
    return this._scope;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * MIME type inferred from the file name extension.
   *
   * Mirrors the upstream `webtorrent.min.js` `file.type`.
   */
  get type(): string {
    const ext = this._name.toLowerCase().split(".").pop() ?? "";
    return MIME_MAP[ext] ?? "application/octet-stream";
  }

  /**
   * Número de bytes baixados deste arquivo específico.
   * Calculado a partir do bitfield do torrent.
   */
  get downloaded(): number {
    const torrent = this._torrent;
    if (!torrent) return 0;
    const { first, last } = this.pieceRange;
    const bitfield = (torrent as any).pieces as { get(i: number): boolean } | undefined;
    if (!bitfield) return 0;
    const pieceLength = this._pieceLength;
    let downloaded = 0;
    for (let i = first; i <= last; i++) {
      if (bitfield.get(i)) {
        downloaded += i === last
          ? Math.min(pieceLength, this._offset + this._length - i * pieceLength)
          : pieceLength;
      }
    }
    return Math.min(downloaded, this._length);
  }

  /**
   * Progress de download deste arquivo específico (0..1).
   */
  get progress(): number {
    if (this._length === 0) return 0;
    return this.downloaded / this._length;
  }

  /**
   * Compute the range of piece indices that this file overlaps.
   *
   * Useful for piece selection algorithms that need to know which pieces
   * "belong" to a given file.
   */
  get pieceRange(): { first: number; last: number } {
    const first = Math.floor(this._offset / this._pieceLength);
    const last = Math.floor((this._offset + this._length - 1) / this._pieceLength);
    return { first, last };
  }

  /**
   * Returns true if the given piece index is part of this file.
   *
   * Supports both upstream signatures:
   * - `includes(pieceIndex: number)` — piece index
   * - `includes(piece: Piece)` — Piece object (legacy)
   */
  includes(pieceOrIndex: Piece | number): boolean {
    const { first, last } = this.pieceRange;
    const index = typeof pieceOrIndex === "number"
      ? pieceOrIndex
      : (pieceOrIndex as Piece).index;
    return index >= first && index <= last;
  }

  /**
   * Mark pieces [startPiece, endPiece] (inclusive) as selected for download.
   * Delegates to the owning torrent's `select`.
   *
   * If the file is not attached to a torrent, this is a no-op.
   */
  select(startPiece?: number, endPiece?: number): void {
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
  deselect(startPiece?: number, endPiece?: number): void {
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
  createReadStream(opts: { start?: number; end?: number } = {}): ReadableStream<Uint8Array> {
    if (this._destroyed) {
      throw new Error("File has been destroyed");
    }

    // opts.start / opts.end are relative to the file (0 = file start).
    // Map them to absolute torrent offsets.
    const fileStart = opts.start ?? 0;
    const fileEnd = opts.end ?? this._length;
    const absStart = this._offset + fileStart;
    const absEnd = this._offset + fileEnd;

    if (fileStart < 0 || fileEnd > this._length || fileStart > fileEnd) {
      throw new RangeError(
        `Invalid range start=${fileStart}, end=${fileEnd}, length=${this._length}`,
      );
    }

    let cursor = absStart;
    let cancelled = false;
    let doneEmitted = false;

    const self = this;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller): Promise<void> {
        if (cancelled) {
          controller.close();
          return;
        }
        if (cursor >= absEnd) {
          if (!doneEmitted) {
            doneEmitted = true;
            self.emit("done", new CustomEvent("done"));
          }
          controller.close();
          return;
        }

        try {
          const block = await self._readBlock(
            cursor,
            Math.min(self._blockSize, absEnd - cursor),
          );
          if (cancelled) return;
          if (block.length === 0) {
            controller.close();
            return;
          }
          controller.enqueue(block);
          cursor += block.length;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          self.emit("error", new CustomEvent("error", { detail: { error } }));
          controller.error(error);
        }
      },
      cancel(): void {
        cancelled = true;
      },
    });

    this.emit("stream", new CustomEvent("stream", { detail: stream }));
    return stream;
  }

  /**
   * Alias for {@link createReadStream}.  Returns a `ReadableStream<Uint8Array>`.
   */
  stream(opts: { start?: number; end?: number } = {}): ReadableStream<Uint8Array> {
    return this.createReadStream(opts);
  }

  /**
   * Async iterator yielding this file's bytes as `Uint8Array` chunks.
   *
   * Used by `for await (const chunk of file)` loops and is the basis of
   * `arrayBuffer` and `blob`.
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    const stream = this.createReadStream();
    const iterator = stream[Symbol.asyncIterator]();
    this.emit("iterator", new CustomEvent("iterator", { detail: iterator }));
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
  async arrayBuffer(opts: { start?: number; end?: number } = {}): Promise<ArrayBuffer> {
    const stream = this.createReadStream(opts);
    const chunks: Uint8Array[] = [];
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
  async blob(opts: { start?: number; end?: number } = {}): Promise<Blob> {
    const stream = this.createReadStream(opts);
    const chunks: Uint8Array[] = [];
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
    return new Blob([out.buffer], { type: this.type });
  }

  /**
   * Read the entire file into a `Blob` and return a temporary object URL
   * that can be assigned to `<video src>` etc.
   *
   * The caller is responsible for revoking the URL via
   * `URL.revokeObjectURL` when no longer needed.
   */
  async getBlobURL(): Promise<string> {
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
  streamTo(element: HTMLMediaElement): void {
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
  streamURL(): string {
    if (!this._infoHash || this._fileIndex === undefined) {
      throw new Error(
        "infoHash and fileIndex are required to generate streamURL. " +
          "Create files via WebTorrent client (client.createServer + add).",
      );
    }
    return buildStreamURL(this._scope, this._infoHash, this._fileIndex, this.name);
  }

  /**
   * Mark the file as destroyed; subsequent reads throw.
   */
  destroy(): void {
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
  private async _readBlock(absOffset: number, length: number): Promise<Uint8Array> {
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
}
