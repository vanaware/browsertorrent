import { type BencodeValue, decode, encode } from "@deno-torrent/bencode";
import { BytesUtil, HashUtil } from "@deno-torrent/toolkit";
import type {
  ExtendedHandshake,
  PeerWireExtension,
  PeerWireExtensionContext,
} from "@src/extension.ts";
import {
  PeerWireError,
  PeerWireProtocolError,
  PeerWireRequestRejectedError,
  PeerWireTimeoutError,
} from "@src/errors.ts";

/** Registered BEP 10 name for metadata exchange. */
export const UT_METADATA_NAME = "ut_metadata";
/** BEP 9's fixed metadata block size. */
export const UT_METADATA_BLOCK_LENGTH = 16 * 1024;

/** Limits and optional serving data for {@link UtMetadataExtension}. */
export interface UtMetadataOptions {
  /** Expected v1 SHA-1 or v2 SHA-256 info hash for downloaded metadata. */
  infoHash: Uint8Array;
  /** Raw bencoded info dictionary to serve to requesting peers. */
  metadata?: Uint8Array;
  /** Maximum metadata accepted or served, defaulting to 4 MiB. */
  maxMetadataSize?: number;
  /** Default handshake and per-block deadline. */
  requestTimeoutMs?: number;
  /** Maximum number of metadata blocks requested concurrently. */
  maxOutstandingRequests?: number;
}

/** Per-download cancellation and deadline overrides. */
export interface UtMetadataFetchOptions {
  /** Cancel the pending handshake and block requests. */
  signal?: AbortSignal;
  /** Override the configured deadline for this download. */
  timeoutMs?: number;
}

interface PendingPiece {
  resolve: (block: Uint8Array) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

type UtMetadataMessage =
  | { type: "request"; piece: number }
  | { type: "data"; piece: number; totalSize: number; data: Uint8Array }
  | { type: "reject"; piece: number };

/** Built-in BEP 9 metadata exchange extension. */
export class UtMetadataExtension implements PeerWireExtension {
  /** BEP 10 registration name. */
  readonly name: typeof UT_METADATA_NAME = UT_METADATA_NAME;
  /** Expected SHA-1 (v1) or SHA-256 (v2) digest of the info dictionary. */
  readonly infoHash: Uint8Array;
  /** Maximum metadata size accepted in either direction. */
  readonly maxMetadataSize: number;
  /** Default handshake and per-block deadline. */
  readonly requestTimeoutMs: number;
  /** Maximum number of pipelined block requests. */
  readonly maxOutstandingRequests: number;

  /** Raw metadata served locally, or the most recently verified download. */
  metadata?: Uint8Array;
  /** Size most recently advertised by the peer. */
  peerMetadataSize?: number;

  #context?: PeerWireExtensionContext;
  #pending = new Map<number, PendingPiece>();

  /** Create a bounded BEP 9 downloader and optional metadata server. */
  constructor(options: UtMetadataOptions) {
    if (options.infoHash.length !== 20 && options.infoHash.length !== 32) {
      throw new RangeError("ut_metadata infoHash must contain 20 or 32 bytes");
    }
    this.infoHash = new Uint8Array(options.infoHash);
    this.maxMetadataSize = options.maxMetadataSize ?? 4 * 1024 * 1024;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.maxOutstandingRequests = options.maxOutstandingRequests ?? 4;
    if (
      !Number.isSafeInteger(this.maxMetadataSize) || this.maxMetadataSize < 1
    ) {
      throw new RangeError("maxMetadataSize must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1
    ) {
      throw new RangeError("requestTimeoutMs must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(this.maxOutstandingRequests) ||
      this.maxOutstandingRequests < 1
    ) {
      throw new RangeError(
        "maxOutstandingRequests must be a positive safe integer",
      );
    }
    if (options.metadata) this.setMetadata(options.metadata);
  }

  /** @internal Implements {@link PeerWireExtension}. */
  onRegister(context: PeerWireExtensionContext): void {
    this.#context = context;
  }

  /** Advertise `metadata_size` only when local metadata is available. */
  handshakeFields(): ReadonlyMap<string, BencodeValue> {
    return this.metadata
      ? new Map<string, BencodeValue>([["metadata_size", this.metadata.length]])
      : new Map();
  }

  /** Capture and bound the peer's advertised metadata size. */
  onExtendedHandshake(handshake: ExtendedHandshake): void {
    const size = handshake.metadataSize;
    if (size !== undefined && (size < 1 || size > this.maxMetadataSize)) {
      throw new PeerWireProtocolError(
        `peer metadata size ${size} exceeds limit ${this.maxMetadataSize}`,
      );
    }
    this.peerMetadataSize = size;
  }

  /** Serve requests or correlate incoming BEP 9 data and rejection messages. */
  async onMessage(payload: Uint8Array): Promise<void> {
    const message = decodeUtMetadataMessage(payload);
    if (message.type === "request") {
      await this.#serve(message.piece);
      return;
    }
    const pending = this.#pending.get(message.piece);
    if (!pending) return;
    this.#pending.delete(message.piece);
    clearPending(pending);
    if (message.type === "reject") {
      pending.reject(
        new PeerWireRequestRejectedError(
          `peer rejected metadata piece ${message.piece}`,
        ),
      );
      return;
    }
    if (
      this.peerMetadataSize !== undefined &&
      message.totalSize !== this.peerMetadataSize
    ) {
      pending.reject(new PeerWireProtocolError("peer changed metadata size"));
      return;
    }
    if (message.totalSize < 1 || message.totalSize > this.maxMetadataSize) {
      pending.reject(
        new PeerWireProtocolError("peer metadata size is invalid"),
      );
      return;
    }
    this.peerMetadataSize ??= message.totalSize;
    const expected = Math.min(
      UT_METADATA_BLOCK_LENGTH,
      message.totalSize - message.piece * UT_METADATA_BLOCK_LENGTH,
    );
    if (expected < 1 || message.data.length !== expected) {
      pending.reject(
        new PeerWireProtocolError("metadata block length is invalid"),
      );
      return;
    }
    pending.resolve(message.data);
  }

  /** Replace the raw info dictionary advertised and served to the peer. */
  setMetadata(metadata: Uint8Array): void {
    if (metadata.length < 1 || metadata.length > this.maxMetadataSize) {
      throw new RangeError(
        `metadata must contain 1 to ${this.maxMetadataSize} bytes`,
      );
    }
    this.metadata = new Uint8Array(metadata);
  }

  /** Download, assemble, and verify the remote info dictionary bytes. */
  async fetch(options: UtMetadataFetchOptions = {}): Promise<Uint8Array> {
    const context = this.#requireContext();
    if (this.metadata) return new Uint8Array(this.metadata);
    const handshake = await withDeadline(
      context.host.waitForPeerHandshake(),
      options.timeoutMs ?? this.requestTimeoutMs,
      options.signal,
      "waiting for ut_metadata handshake",
    );
    if (!context.host.peerExtensions.has(this.name)) {
      throw new PeerWireError("remote peer did not advertise ut_metadata");
    }
    const size = handshake.metadataSize;
    if (size === undefined) {
      throw new PeerWireError("remote peer did not advertise metadata_size");
    }
    if (size < 1 || size > this.maxMetadataSize) {
      throw new PeerWireProtocolError(`peer metadata size ${size} is invalid`);
    }
    // BEP 9 fixes metadata blocks at 16 KiB. A small worker pool pipelines
    // requests without allowing metadata size to dictate unbounded concurrency.
    const blocks = new Array<Uint8Array>(
      Math.ceil(size / UT_METADATA_BLOCK_LENGTH),
    );
    let nextPiece = 0;
    const worker = async () => {
      for (;;) {
        const piece = nextPiece++;
        if (piece >= blocks.length) return;
        blocks[piece] = await this.#requestPiece(piece, options);
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(this.maxOutstandingRequests, blocks.length) },
          worker,
        ),
      );
    } catch (error) {
      this.#rejectPending(error);
      throw error;
    }
    const metadata = new Uint8Array(size);
    let offset = 0;
    for (const block of blocks) {
      metadata.set(block, offset);
      offset += block.length;
    }
    const digest = this.infoHash.length === 32
      ? await HashUtil.sha256(metadata)
      : await HashUtil.sha1(metadata);
    if (!BytesUtil.equals(digest, this.infoHash)) {
      throw new PeerWireProtocolError(
        "received metadata does not match info hash",
      );
    }
    this.metadata = metadata;
    return new Uint8Array(metadata);
  }

  /** Reject every pending metadata block when the owning wire closes. */
  close(reason: unknown = new PeerWireError("peer wire closed")): void {
    this.#rejectPending(reason);
  }

  #rejectPending(reason: unknown): void {
    for (const pending of this.#pending.values()) {
      clearPending(pending);
      pending.reject(reason);
    }
    this.#pending.clear();
  }

  async #requestPiece(
    piece: number,
    options: UtMetadataFetchOptions,
  ): Promise<Uint8Array> {
    const context = this.#requireContext();
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    if (this.#pending.has(piece)) {
      throw new PeerWireError(`metadata piece ${piece} is already pending`);
    }
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      const pending: PendingPiece = { resolve, reject };
      const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
      pending.timer = setTimeout(() => {
        this.#pending.delete(piece);
        reject(new PeerWireTimeoutError(`metadata piece ${piece} timed out`));
      }, timeoutMs);
      if (options.signal) {
        pending.signal = options.signal;
        pending.abort = () => {
          this.#pending.delete(piece);
          clearPending(pending);
          reject(
            options.signal!.reason ?? new DOMException("Aborted", "AbortError"),
          );
        };
        options.signal.addEventListener("abort", pending.abort, { once: true });
      }
      this.#pending.set(piece, pending);
    });
    try {
      await context.send(encodeMetadataHeader(0, piece));
    } catch (error) {
      const pending = this.#pending.get(piece);
      if (pending) {
        this.#pending.delete(piece);
        clearPending(pending);
        pending.reject(error);
      }
    }
    return await promise;
  }

  async #serve(piece: number): Promise<void> {
    const context = this.#requireContext();
    const metadata = this.metadata;
    if (!metadata) {
      await context.send(encodeMetadataHeader(2, piece));
      return;
    }
    const start = piece * UT_METADATA_BLOCK_LENGTH;
    if (!Number.isSafeInteger(piece) || piece < 0 || start >= metadata.length) {
      await context.send(encodeMetadataHeader(2, piece));
      return;
    }
    const header = encodeMetadataHeader(1, piece, metadata.length);
    const block = metadata.subarray(start, start + UT_METADATA_BLOCK_LENGTH);
    const payload = new Uint8Array(header.length + block.length);
    payload.set(header);
    payload.set(block, header.length);
    await context.send(payload);
  }

  #requireContext(): PeerWireExtensionContext {
    if (!this.#context) {
      throw new PeerWireError("ut_metadata is not registered");
    }
    return this.#context;
  }
}

function encodeMetadataHeader(type: number, piece: number, totalSize?: number) {
  const dictionary = new Map<string, BencodeValue>([
    ["msg_type", type],
    ["piece", piece],
  ]);
  if (totalSize !== undefined) dictionary.set("total_size", totalSize);
  return encode(dictionary);
}

function decodeUtMetadataMessage(payload: Uint8Array): UtMetadataMessage {
  // A data message appends raw metadata bytes after its bencoded dictionary,
  // so the strict bencode decoder must receive only the dictionary prefix.
  const headerLength = bencodePrefixLength(payload);
  let value: BencodeValue;
  try {
    value = decode(payload.subarray(0, headerLength), {
      maxBytes: 64 * 1024,
      maxDepth: 16,
    });
  } catch (cause) {
    throw new PeerWireProtocolError("invalid ut_metadata header", { cause });
  }
  if (!(value instanceof Map)) {
    throw new PeerWireProtocolError("ut_metadata header must be a dictionary");
  }
  const type = requiredInteger(value, "msg_type");
  const piece = requiredInteger(value, "piece");
  if (type === 0) return { type: "request", piece };
  if (type === 2) return { type: "reject", piece };
  if (type !== 1) {
    throw new PeerWireProtocolError("unknown ut_metadata message type");
  }
  return {
    type: "data",
    piece,
    totalSize: requiredInteger(value, "total_size"),
    data: payload.slice(headerLength),
  };
}

function requiredInteger(
  dictionary: Map<string | Uint8Array, BencodeValue>,
  key: string,
) {
  const value = dictionary.get(key);
  if (typeof value !== "number" || value < 0) {
    throw new PeerWireProtocolError(`ut_metadata ${key} must be non-negative`);
  }
  return value;
}

/** Locate the end of the first bencoded value without consuming appended data. */
function bencodePrefixLength(bytes: Uint8Array): number {
  const scan = (start: number, depth: number): number => {
    if (depth > 32 || start >= bytes.length) {
      throw new PeerWireProtocolError("truncated ut_metadata header");
    }
    const marker = bytes[start];
    if (marker === 0x69) {
      const end = bytes.indexOf(0x65, start + 1);
      if (end < 0) throw new PeerWireProtocolError("truncated bencode integer");
      return end + 1;
    }
    if (marker === 0x6c || marker === 0x64) {
      let offset = start + 1;
      while (offset < bytes.length && bytes[offset] !== 0x65) {
        offset = scan(offset, depth + 1);
      }
      if (offset >= bytes.length) {
        throw new PeerWireProtocolError("truncated bencode container");
      }
      return offset + 1;
    }
    if (marker >= 0x30 && marker <= 0x39) {
      let colon = start;
      while (colon < bytes.length && bytes[colon] !== 0x3a) colon++;
      if (colon >= bytes.length) {
        throw new PeerWireProtocolError("truncated bencode string");
      }
      const length = Number(
        new TextDecoder().decode(bytes.subarray(start, colon)),
      );
      const end = colon + 1 + length;
      if (!Number.isSafeInteger(length) || length < 0 || end > bytes.length) {
        throw new PeerWireProtocolError("invalid bencode string length");
      }
      return end;
    }
    throw new PeerWireProtocolError("invalid bencode marker");
  };
  return scan(0, 0);
}

function clearPending(pending: PendingPiece): void {
  if (pending.timer !== undefined) clearTimeout(pending.timer);
  if (pending.signal && pending.abort) {
    pending.signal.removeEventListener("abort", pending.abort);
  }
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: string,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PeerWireTimeoutError(`${operation} timed out`)),
      timeoutMs,
    );
    const abort = () =>
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    });
  });
}
