// /browsertorrent/monorepo/webtorrent/src/extensions/ut-metadata.ts
/**
 * @file ut-metadata.ts
 * @description BEP 9 (ut_metadata) extension implementation for exchanging torrent metainfo pieces.
 */

import { Extension, } from "../core/extension.ts";
import {
  type BencodeDict,
  type BencodeValue,
  decode,
  decodePrefix,
  encode,
} from "../utils/bencode.ts";
import { Bitfield, } from "../core/bitfield.ts";
import type { Wire, } from "../core/wire.ts";
import type { ExtensionHost } from "../core/extension-host.ts";

const MAX_METADATA_SIZE = 10_000_000;
const PIECE_LENGTH = 16384;
const DEFAULT_TIMEOUT_MS = 15000; // 15 segundos por peça

/**
 * Options for configuring the BEP 9 `ut_metadata` extension.
 */
export interface UtMetadataOptions {
  /** Optional preloaded metadata bytes to seed to peers. */
  metadata?: Uint8Array;
  /** Timeout in milliseconds for requesting pieces (default 15,000 ms). */
  timeoutMs?: number;
}

/**
 * Information regarding an active metadata piece request.
 */
export interface PieceRequest {
  /** Zero-based metadata piece index. */
  piece: number;
  /** Number of request attempts made. */
  attempts: number;
  /** Browser or Deno timeout identifier. */
  timer: number;
}

/**
 * BEP 9 `ut_metadata` extension implementation.
 * Allows peers to discover and transfer `.torrent` metadata pieces over BEP 10 extension protocol.
 *
 * @example
 * ```ts
 * import { UtMetadata } from "jsr:@vanaware/browsertorrent";
 *
 * const utMetadata = new UtMetadata(wire, { timeoutMs: 10000 });
 * utMetadata.fetch();
 * ```
 */
export class UtMetadata extends Extension {
  /** BEP 10 extension identifier name. */
  public readonly name = "ut_metadata";

  private _fetching = false;
  private _metadataComplete = false;
  private _metadataSize: number | null = null;
  private _numPieces = 0;
  private _remainingRejects = 0;
  private _bitfield: Bitfield;
  /** Fully reassembled torrent metadata bytes once transfer completes. */
  public metadata: Uint8Array | null = null;
  private _requestedPieces: Map<number, PieceRequest> = new Map();
  private _timeoutMs: number;
  private _extensionId: number | null = null;

  /**
   * Initializes the ut_metadata extension on a wire.
   *
   * @param wire - Owning peer wire connection.
   * @param opts - Configuration options.
   */
  constructor(wire: Wire, opts?: UtMetadataOptions,) {
    super(wire,);
    this._bitfield = new Bitfield({ length: 0, grow: 1000, },);
    this._timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (opts?.metadata) {
      this.setMetadata(opts.metadata,);
    }
  }

  /**
   * Handles local registration with the wire's extension host.
   *
   * @param context - Registration context containing host and transport sender.
   */
  public onRegister(
    context: {
      host: ExtensionHost;
      send: (payload: Uint8Array,) => Promise<void>;
    },
  ): void {
    this._extensionId = context.host.localExtensions.get(this.name,) ?? null;
  }

  /**
   * Returns metadata dictionary fields to announce during extended handshake.
   *
   * @returns Map of handshake parameters including `metadata_size`.
   */
  public handshakeFields(): ReadonlyMap<string, BencodeValue> {
    const fields = new Map<string, BencodeValue>();
    if (this._metadataSize !== null) {
      fields.set("metadata_size", this._metadataSize,);
    }
    return fields;
  }

  /**
   * Handles standard BitTorrent wire handshake.
   *
   * @param _infoHash - Torrent info hash.
   * @param _peerId - Remote peer ID.
   * @param _extensions - Negotiated handshake extensions.
   */
  public onHandshake(
    _infoHash: string,
    _peerId: string,
    _extensions: Record<string, unknown>,
  ): void {
    // Optional hook
  }

  /**
   * Handles incoming BEP 10 extended handshake from remote peer.
   *
   * @param handshake - Decoded extended handshake record or Map.
   */
  public onExtendedHandshake(handshake: Record<string, unknown> | any): void {
    console.log(
      `[UtMetadata] onExtendedHandshake: m=${
        JSON.stringify(handshake.m,)
      }, extensionsSize=${
        handshake.extensions instanceof Map
          ? handshake.extensions.size
          : "not Map"
      }, metadataSize=${handshake.metadataSize}`,
    );
    let utMetadataId: number | undefined;
    let metadataSize: number | undefined;

    if (handshake.extensions instanceof Map) {
      utMetadataId = handshake.extensions.get("ut_metadata",);
      metadataSize = handshake.metadataSize ??
        (handshake.raw instanceof Map
          ? handshake.raw.get("metadata_size",)
          : undefined);
    } else if (handshake.m) {
      if (handshake.m instanceof Map) {
        utMetadataId = handshake.m.get("ut_metadata",);
      } else if (typeof handshake.m === "object") {
        utMetadataId = handshake.m.ut_metadata;
      }
      metadataSize = handshake.metadata_size ?? handshake.metadataSize;
    }
    console.log(
      `[UtMetadata] onExtendedHandshake resolved: utMetadataId=${utMetadataId}, metadataSize=${metadataSize}`,
    );

    if (typeof utMetadataId === "number") {
      this._extensionId = utMetadataId;
      if (
        typeof metadataSize !== "number" ||
        metadataSize > MAX_METADATA_SIZE ||
        metadataSize <= 0
      ) {
        this.emit(
          "warning",
          new CustomEvent("warning", {
            detail: { error: new Error("Peer gave invalid metadata size",), },
          },),
        );
      } else {
        const size = metadataSize;
        this._metadataSize = size;
        this._numPieces = Math.ceil(size / PIECE_LENGTH,);
        this._remainingRejects = 2 * this._numPieces;
        this._bitfield = new Bitfield({
          length: this._numPieces,
          grow: 1000,
        },);

        this._fetching = true;
        this.#requestPieces();
      }
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: {
            error: new Error("Peer does not support ut_metadata extension",),
          },
        },),
      );
    }
  }

  /**
   * Handles incoming binary messages directed to this extension ID.
   *
   * @param buf - Raw payload bytes.
   */
  public onMessage(buf: Uint8Array): void {
    let dict: BencodeDict;
    let trailer: Uint8Array;
    try {
      const [decoded, remaining,] = decodePrefix(buf, {
        allowUnsortedKeys: true,
      },);
      dict = decoded as BencodeDict;
      trailer = remaining;
    } catch (err) {
      console.warn(
        "[UtMetadata] decodePrefix failed on incoming buffer (length " +
          buf.length + "):",
        err,
      );
      return;
    }

    switch (dict.msg_type) {
      case 0:
        this.#onRequest(dict.piece as number,);
        break;
      case 1:
        this.#onData(
          dict.piece as number,
          trailer,
          dict.total_size as number | undefined,
        );
        break;
      case 2:
        this.#onReject(dict.piece as number,);
        break;
    }
  }

  /**
   * Starts requesting metadata pieces from the remote peer.
   */
  public fetch(): void {
    if (!this._metadataComplete) {
      this._fetching = true;
      if (this._metadataSize) {
        this.#requestPieces();
      }
    }
  }

  /**
   * Cancels any active metadata piece requests and timers.
   */
  public cancel(): void {
    this._fetching = false;
    for (const request of this._requestedPieces.values()) {
      clearTimeout(request.timer,);
    }
    this._requestedPieces.clear();
  }

  /**
   * Sets known metadata bytes (for seeding or after successful reassembly).
   *
   * @param newMetadata - Raw metadata buffer.
   * @returns `true` if metadata was set.
   */
  public setMetadata(newMetadata: Uint8Array,): boolean {
    if (this._metadataComplete) return true;

    let validMetadata = newMetadata;
    try {
      const info = decode(newMetadata,) as BencodeDict;
      if (info && info.info) {
        validMetadata = encode(info.info,);
      }
    } catch (_err) {
      // Keep raw metadata buffer if not a full torrent bencode dict
    }

    this.metadata = validMetadata;
    this._metadataSize = validMetadata.length;
    this._metadataComplete = true;
    this._fetching = false;

    if (this.wire.extensionHost.peerExtensions.has("ut_metadata",)) {
      this.wire.extensionHost.setHandshakeField(
        "metadata_size",
        this._metadataSize,
      );
    }

    this.emit(
      "metadata",
      new CustomEvent("metadata", { detail: { metadata: this.metadata, }, },),
    );
    return true;
  }

  #send(dict: BencodeDict, trailer?: Uint8Array): void {
    console.log(
      `[UtMetadata] _send: dict=${JSON.stringify(dict,)}, trailerLength=${
        trailer ? trailer.length : 0
      }, extensionId=${this._extensionId}`,
    );
    let buf = encode(dict,);
    if (trailer) {
      const combined = new Uint8Array(buf.length + trailer.length,);
      combined.set(buf, 0,);
      combined.set(trailer, buf.length,);
      buf = combined;
    }
    if (this._extensionId !== null) {
      this.wire.sendExtended(this._extensionId, buf,);
    } else {
      console.warn(
        `[UtMetadata] _send NOT sending because _extensionId is null!`,
      );
    }
  }

  #request(piece: number): void {
    const existingRequest = this._requestedPieces.get(piece,);
    if (existingRequest) {
      clearTimeout(existingRequest.timer,);
    }

    this.#send({ msg_type: 0, piece, },);

    const timer = setTimeout(() => {
      this.#handleTimeout(piece,);
    }, this._timeoutMs,) as unknown as number;

    const attempts = existingRequest ? existingRequest.attempts + 1 : 1;
    this._requestedPieces.set(piece, { piece, attempts, timer, },);
  }

  #data(piece: number, buf: Uint8Array, totalSize?: number): void {
    const request = this._requestedPieces.get(piece,);
    if (request) {
      clearTimeout(request.timer,);
      this._requestedPieces.delete(piece,);
    }

    const msg: BencodeDict = { msg_type: 1, piece, };
    if (typeof totalSize === "number") {
      (msg as unknown as { total_size?: number }).total_size = totalSize;
    }
    this.#send(msg, buf,);
  }

  #reject(piece: number): void {
    this.#send({
      msg_type: 2,
      piece,
    },);
  }

  #onRequest(piece: number): void {
    console.log(
      `[UtMetadata] _onRequest piece: ${piece}, metadataComplete: ${this._metadataComplete}, size: ${this._metadataSize}`,
    );
    if (!this._metadataComplete || !this._metadataSize) {
      return this.#reject(piece,);
    }
    const start = piece * PIECE_LENGTH;
    let end = start + PIECE_LENGTH;
    if (end > this._metadataSize!) {
      end = this._metadataSize!;
    }
    const buf = this.metadata!.slice(start, end,);
    this.#data(piece, buf, this._metadataSize,);
  }

  #onData(piece: number, buf: Uint8Array, totalSize?: number): void {
    console.log(
      `[UtMetadata] _onData piece: ${piece}, buf.length: ${buf.length}, totalSize: ${totalSize}, fetching: ${this._fetching}, metaSize: ${this._metadataSize}`,
    );
    if (buf.length > PIECE_LENGTH || !this._fetching || !this._metadataSize) {
      return;
    }

    if (this._bitfield.get(piece,)) {
      return;
    }

    if (!this.metadata) {
      this.metadata = new Uint8Array(this._metadataSize,);
    }
    this.metadata.set(buf, piece * PIECE_LENGTH,);
    this._bitfield.set(piece,);

    const request = this._requestedPieces.get(piece,);
    if (request) {
      clearTimeout(request.timer,);
      this._requestedPieces.delete(piece,);
    }

    this.#checkDone();
  }

  #onReject(piece: number): void {
    const request = this._requestedPieces.get(piece,);
    if (request) {
      clearTimeout(request.timer,);
      this._requestedPieces.delete(piece,);
    }

    if (this._remainingRejects > 0 && this._fetching) {
      this.#request(piece,);
      this._remainingRejects -= 1;
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: { error: new Error('Peer sent "reject" too much',), },
        },),
      );
    }
  }

  #handleTimeout(piece: number): void {
    this._requestedPieces.delete(piece,);

    if (!this._fetching) return;

    const maxAttempts = 3;
    const currentRequest = this._requestedPieces.get(piece,);
    const attempts = currentRequest ? currentRequest.attempts + 1 : 1;

    if (attempts < maxAttempts) {
      this.#request(piece,);
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: {
            error: new Error(
              `Timeout while requesting metadata piece ${piece}`,
            ),
          },
        },),
      );
      this.#checkDone();
    }
  }

  #requestPieces(): void {
    if (this._fetching && this._metadataSize) {
      this.metadata = new Uint8Array(this._metadataSize,);
      for (let piece = 0; piece < this._numPieces; piece++) {
        this.#request(piece,);
      }
    }
  }

  #checkDone(): void {
    let done = true;
    for (let piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece,)) {
        done = false;
        break;
      }
    }
    if (done && this.metadata) {
      const success = this.#verifyMetadataIntegrity();
      if (success) {
        this.setMetadata(this.metadata,);
      } else {
        this.#failedMetadata();
      }
    }
  }

  #verifyMetadataIntegrity(): boolean {
    if (!this.metadata) return false;

    console.log(
      `[UtMetadata] _verifyMetadataIntegrity metadata.length: ${this.metadata.length}, first 20 bytes:`,
      Array.from(this.metadata.slice(0, 20,),),
    );
    try {
      decode(this.metadata,);
      return true;
    } catch (err) {
      console.warn("Metadata integrity check failed:", err,);
      return false;
    }
  }

  #failedMetadata(): void {
    if (!this._metadataSize) return;
    this._bitfield = new Bitfield({ length: this._numPieces, grow: 1000, },);
    this._remainingRejects -= this._numPieces;
    if (this._remainingRejects > 0) {
      this.#requestPieces();
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: { error: new Error("Peer sent invalid metadata",), },
        },),
      );
    }
  }
}
