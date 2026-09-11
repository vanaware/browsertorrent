// /loco/monorepo/webtorrent/src/storage/opfs-chunk-store.ts

import { MemoryChunkStore } from "./memory-chunk-store.ts";

export interface ChunkStore {
  chunkLength: number;
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  put(index: number, buf: Uint8Array, cb?: (err: Error | null) => void): Promise<void>;
  close(cb?: (err: Error | null) => void): Promise<void>;
  destroy(cb?: (err: Error | null) => void): Promise<void>;
}

export interface ChunkStoreOptions {
  chunkLength: number;
  length?: number;
  rootDir?: FileSystemDirectoryHandle;
}

export class OPFSChunkStore implements ChunkStore {
  public chunkLength: number;
  private length: number;
  private lastChunkLength: number;
  private lastChunkIndex: number;
  private rootDir: FileSystemDirectoryHandle | null;
  private closed = false;
  private fallbackStore: MemoryChunkStore | null = null;

  constructor(opts: ChunkStoreOptions) {
    this.chunkLength = opts.chunkLength;
    this.length = opts.length || Infinity;
    
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
      this.lastChunkIndex = Math.floor(this.length / this.chunkLength);
    } else {
      this.lastChunkLength = this.chunkLength;
      this.lastChunkIndex = Infinity;
    }
    
    this.rootDir = opts.rootDir || null;
    
    if (!this.rootDir) {
      console.warn("[OPFSChunkStore] OPFS not available, falling back to memory store");
      this.fallbackStore = new MemoryChunkStore({ chunkLength: this.chunkLength, length: this.length });
    }
  }

  // ── Overloads ──
  get(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array>;
  get(index: number, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  get(index: number, opts: { offset?: number; length?: number }, cb: (err: Error | null, buf?: Uint8Array) => void): void;
  
  // ── Implementation (SEM a palavra-chave 'async') ──
  get(index: number, optsOrCb?: any, cb?: any): Promise<Uint8Array> | void {
    if (this.fallbackStore) {
      if (typeof optsOrCb === "function") {
        return this.fallbackStore.get(index, optsOrCb);
      }
      return this.fallbackStore.get(index, optsOrCb as any, cb as any);
    }

    const opts = typeof optsOrCb === "object" ? optsOrCb : undefined;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (callback) {
      this._getAsync(index, opts)
        .then((buf) => callback(null, buf))
        .catch((err) => callback(err));
      return;
    }

    return this._getAsync(index, opts);
  }

  private async _getAsync(index: number, opts?: { offset?: number; length?: number }): Promise<Uint8Array> {
    if (this.closed) throw new Error("Storage is closed");
    if (!this.rootDir) throw new Error("OPFS root directory not available");
    
    const fileName = `${index}.chunk`;
    
    try {
      const fileHandle = await this.rootDir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      let buf = new Uint8Array(arrayBuffer);
      
      const isLastChunk = index === this.lastChunkIndex;
      const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
      
      if (buf.length !== expectedLength) {
        throw new Error(`Chunk ${index} has invalid length: expected ${expectedLength}, got ${buf.length}`);
      }
      
      if (opts) {
        const offset = opts.offset || 0;
        const length = opts.length || buf.length - offset;
        buf = buf.subarray(offset, offset + length);
      }
      
      return buf;
    } catch (err: any) {
      if (err.name === "NotFoundError") {
        const error = new Error(`Chunk ${index} not found`);
        (error as any).notFound = true;
        throw error;
      }
      throw err;
    }
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
    if (!this.rootDir) throw new Error("OPFS root directory not available");
    
    const isLastChunk = index === this.lastChunkIndex;
    const expectedLength = isLastChunk ? this.lastChunkLength : this.chunkLength;
    
    if (buf.length !== expectedLength) {
      throw new Error(`Invalid chunk length: expected ${expectedLength}, got ${buf.length}`);
    }
    
    const fileName = `${index}.chunk`;
    
    try {
      const fileHandle = await this.rootDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      
      // Cast explícito para satisfazer o Deno
      const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      await writable.write(arrayBuffer);
      await writable.close();
    } catch (err) {
      throw new Error(`Failed to write chunk ${index}: ${err}`);
    }
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
    this.rootDir = null;
  }

  async destroy(cb?: (err: Error | null) => void): Promise<void> {
    const promise = this._destroyAsync();
    if (cb) {
      promise.then(() => cb(null)).catch((err) => cb(err));
    }
    return promise;
  }

  private async _destroyAsync(): Promise<void> {
    if (!this.rootDir) {
      this.closed = true;
      return;
    }
    
    try {
      for await (const entry of (this.rootDir as any).values()) {
        if (entry.kind === "file") {
          await this.rootDir.removeEntry(entry.name);
        }
      }
    } catch (err) {
      console.warn("[OPFSChunkStore] Error during destroy:", err);
    }
    
    this.closed = true;
    this.rootDir = null;
  }
}