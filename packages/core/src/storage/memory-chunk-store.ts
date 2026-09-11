// /loco/monorepo/webtorrent/src/storage/memory-chunk-store.ts

import type { ChunkStore } from "./opfs-chunk-store.ts";

export interface MemoryChunkStoreOptions {
  chunkLength: number;
  length?: number;
}

export class MemoryChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private chunks: Map<number, Uint8Array> = new Map();
  private closed = false;

  constructor(opts: MemoryChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
  }

  // ── Overloads ──
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  
  // ── Implementation (SEM a palavra-chave 'async') ──
  get(index: number, optsOrCb?: any, cb?: any): Promise<Uint8Array> | void {
    const opts = typeof optsOrCb === "object" ? optsOrCb : undefined;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return; // Retorna void para a assinatura do callback
    }

    return this._getAsync(index, opts); // Retorna Promise<Uint8Array>
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    
    const buf = this.chunks.get(index);
    if (!buf) {
      const err = new Error(`Chunk ${index} not found`);
      (err as any).notFound = true;
      throw err;
    }
    
    if (opts) {
      const offset = opts.offset || 0;
      const length = opts.length || buf.length - offset;
      return buf.subarray(offset, offset + length);
    }
    
    return buf;
  }

  async put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._putAsync(index, buf);
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _putAsync(index: number, buf: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Storage is closed");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    this.chunks.set(index, buf);
  }

  async close(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._closeAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _closeAsync(): Promise<void> {
    if (this.closed) throw new Error("Storage is already closed");
    this.closed = true;
    this.chunks.clear();
  }

  async destroy(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._destroyAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _destroyAsync(): Promise<void> {
    this.closed = true;
    this.chunks.clear();
  }
}