// /loco/monorepo/webtorrent/src/core/wire.ts
/**
 * BitTorrent peer wire protocol — event-driven facade with robust internals.
 *
 * Preserves the existing `WireEvents` API consumed by the rest of Loco, while
 * adding the security, validation, and lifecycle management from deno-torrent's
 * `peer_wire.ts`:
 *
 * - Machine states: Handshaking → Connected → Closed
 * - Named reserved-bit negotiation (BEP 5/6/10/52)
 * - Availability-order validation (bitfield/haveAll/haveNone must come first)
 * - Extension gating (Fast, ExtensionProtocol, DHT, V2 messages rejected
 *   unless both sides advertised the capability)
 * - Backpressure: maxMessageLength, maxBlockLength, maxPendingRequests,
 *   maxQueuedWriteBytes
 * - Keepalive timer
 * - Idle timeout
 * - expectedPeerId validation
 * - ExtensionHost BEP 10 integration
 *
 * Adaptado de deno-torrent/peerwire/peer_wire.ts para o modelo
 * Transport síncrono + buffer do Loco.
 */

import { TypedEventTarget } from "../utils/event-target.ts";
import { concat, equals, readUInt32BE, writeUInt32BE } from "../utils/buffer.ts";
import { decode } from "../utils/bencode.ts";
import {
  PeerWireError,
  ProtocolError,
  EofError,
  TimeoutError,
} from "../utils/errors.ts";
import {
  encodeHandshake,
  decodeHandshake,
  hasExtension,
  type PeerHandshake,
} from "./handshake.ts";
import {
  encodeMessage,
  decodeMessagePayload,
  type PeerMessage,
  type BlockCoordinates,
} from "./message.ts";
import {
  BITTORRENT_PROTOCOL,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
  DEFAULT_MAX_MESSAGE_LENGTH,
  DEFAULT_MAX_BLOCK_LENGTH,
  DEFAULT_MAX_PENDING_REQUESTS,
  DEFAULT_MAX_QUEUED_WRITE_BYTES,
} from "./constants.ts";
import { ExtensionHost, type PeerWireExtension } from "./extension-host.ts";

// ── Transport contract ──────────────────────────────────────────────────

export interface Transport {
  send(data: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): void;
  close(): void;
}

// ── Events ──────────────────────────────────────────────────────────────

export interface WireEvents {
  handshake: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array; infoHash: Uint8Array }>;
  choke: Event;
  unchoke: Event;
  interested: Event;
  "not-interested": Event;
  have: CustomEvent<{ index: number }>;
  bitfield: CustomEvent<{ bitfield: Uint8Array }>;
  request: CustomEvent<{ index: number; offset: number; length: number }>;
  piece: CustomEvent<{ index: number; offset: number; block: Uint8Array }>;
  cancel: CustomEvent<{ index: number; offset: number; length: number }>;
  extended: CustomEvent<{ id: number; payload: any }>;
  /** BEP 5 — DHT port */
  port: CustomEvent<{ port: number }>;
  /** BEP 6 — Fast: suggest piece */
  suggestPiece: CustomEvent<{ index: number }>;
  /** BEP 6 — Fast: have all */
  haveAll: Event;
  /** BEP 6 — Fast: have none */
  haveNone: Event;
  /** BEP 6 — Fast: reject request */
  rejectRequest: CustomEvent<{ index: number; offset: number; length: number }>;
  /** BEP 6 — Fast: allowed fast */
  allowedFast: CustomEvent<{ index: number }>;
  /** BEP 52 v2: hash request */
  hashRequest: CustomEvent<{ piecesRoot: Uint8Array; baseLayer: number; index: number; length: number; proofLayers: number }>;
  /** BEP 52 v2: hashes response */
  hashes: CustomEvent<{ piecesRoot: Uint8Array; baseLayer: number; index: number; length: number; proofLayers: number; hashes: Uint8Array }>;
  /** BEP 52 v2: hash reject */
  hashReject: CustomEvent<{ piecesRoot: Uint8Array; baseLayer: number; index: number; length: number; proofLayers: number }>;
  keepAlive: Event;
  unknown: CustomEvent<{ id: number; payload: Uint8Array }>;
  error: CustomEvent<{ error: Error }>;
  close: CustomEvent<{ reason?: unknown }>;
}

// ── Wire states ─────────────────────────────────────────────────────────

export enum WireState {
  Handshaking = "handshaking",
  Connected = "connected",
  Closed = "closed",
}

// ── Options ─────────────────────────────────────────────────────────────

export interface WireOptions {
  /** Expected info hash for handshake validation. */
  expectedInfoHash?: Uint8Array;
  /** Expected peer ID for handshake validation. */
  expectedPeerId?: Uint8Array;
  /** Reserved-bit capabilities to advertise. */
  extensions?: Iterable<HandshakeExtension>;
  /** Torrent geometry for bitfield/block validation. */
  pieceCount?: number;
  /** Normal piece size. */
  pieceLength?: number;
  /** Total payload size (for last-piece derivation). */
  totalLength?: number;
  /** Largest length-prefixed peer message accepted (default 2 MiB). */
  maxMessageLength?: number;
  /** Largest piece block accepted or requested (default 16 KiB). */
  maxBlockLength?: number;
  /** Maximum outstanding requests in either direction (default 250). */
  maxPendingRequests?: number;
  /** Maximum encoded bytes waiting behind the active transport write (default 4 MiB). */
  maxQueuedWriteBytes?: number;
  /** Handshake deadline in ms (default 30000, 0 = disabled). */
  handshakeTimeoutMs?: number;
  /** Close the connection after this much inactivity in ms (0 = disabled). */
  idleTimeoutMs?: number;
  /** Send keepalives after this much inactivity in ms (0 = disabled). */
  keepAliveIntervalMs?: number;
  /** BEP 10 extension host: client name. */
  clientName?: string;
  /** BEP 10 extension host: listen port. */
  listenPort?: number;
}

// ── Wire ────────────────────────────────────────────────────────────────

export class Wire extends TypedEventTarget<WireEvents> {
  // ── Public observable state (BEP 3 four flags) ─────────────────────
  public amChoking: boolean = true;
  public amInterested: boolean = false;
  public peerChoking: boolean = true;
  public peerInterested: boolean = false;

  public peerId: string | null = null;
  public peerIdBuffer: Uint8Array | null = null;

  // ── Lifecycle state ────────────────────────────────────────────────
  public state: WireState = WireState.Handshaking;
  public remoteHandshake?: PeerHandshake;

  // ── Stats ──────────────────────────────────────────────────────────
  public uploadedBytes: number = 0;
  public downloadedBytes: number = 0;
  public lastActivityAt: number = Date.now();

  // ── Speed tracking (bytes/s) ─────────────────────────────────────────
  private _downloadSpeed: number = 0;
  private _uploadSpeed: number = 0;
  private _lastSpeedSample: number = Date.now();
  private _lastDownloaded: number = 0;
  private _lastUploaded: number = 0;
  private _speedInterval?: ReturnType<typeof setInterval>;

  /** Upload speed in bytes/s (rolling 1-second average). */
  get uploadSpeed(): number { return this._uploadSpeed; }

  /** Download speed in bytes/s (rolling 1-second average). */
  get downloadSpeed(): number { return this._downloadSpeed; }

  // ── Peer address ────────────────────────────────────────────────────
  /** Set by Peer when the DataChannel opens. */
  public remoteAddress: string = "";
  public remotePort: number = 0;

  // ── BEP 3 / upstream parity ───────────────────────────────────────

  /**
   * Connection type. Always `'webrtc'` in this browser-first implementation.
   *
   * Mirrors `webtorrent.min.js` `wire.type`.
   */
  public get type(): string {
    return "webrtc";
  }

  /**
   * Extension capabilities advertised by the remote peer.
   *
   * Mirrors `webtorrent.min.js` `wire.extensions` — a Record of extension
   * name to any value. Populated from the BEP-10 extended handshake `m` dict.
   */
  public get extensions(): Record<string, unknown> {
    return this.extensionHost.remoteExtensions;
  }

  /**
   * ID-to-name mapping from the remote peer's BEP-10 extended handshake.
   * Mirrors `webtorrent.min.js` `wire.extendedMapping`.
   */
  public get extendedMapping(): Record<number, string> {
    return this.extensionHost.remoteIdToName;
  }

  // ── BEP 6 Fast sets ────────────────────────────────────────────────
  public readonly localAllowedFast: Set<number> = new Set();
  public readonly remoteAllowedFast: Set<number> = new Set();

  // ── Read-only config ───────────────────────────────────────────────
  public readonly expectedInfoHash: Uint8Array | null;
  public readonly expectedPeerId: Uint8Array | null;
  public readonly localExtensions: ReadonlySet<HandshakeExtension>;
  public readonly pieceCount: number | undefined;
  public readonly pieceLength: number | undefined;
  public readonly totalLength: number | undefined;
  public readonly maxMessageLength: number;
  public readonly maxBlockLength: number;
  public readonly maxPendingRequests: number;
  public readonly maxQueuedWriteBytes: number;
  public readonly handshakeTimeoutMs: number;
  public readonly idleTimeoutMs: number;

  // ── ExtensionHost ──────────────────────────────────────────────────
  public readonly extensionHost: ExtensionHost;

  // ── Private ────────────────────────────────────────────────────────
  private transport: Transport;
  private buffer: Uint8Array = new Uint8Array(0);

  private handshakeSent: boolean = false;
  private handshakeReceived: boolean = false;
  private extensionHandshakeSent: boolean = false;

  // Availability order: bitfield/haveAll/haveNone must be first
  private localAvailabilityOpen: boolean = true;
  private remoteAvailabilityOpen: boolean = true;
  private localAvailabilityDeclared: boolean = false;
  private remoteAvailabilityDeclared: boolean = false;

  // Pending requests tracking
  #pendingRequests = new Map<string, BlockCoordinates>();
  #peerRequests = new Map<string, BlockCoordinates>();

  // Write backpressure
  #writeTail: Promise<void> = Promise.resolve();
  #queuedWriteBytes: number = 0;

  // Timers
  #keepAliveTimer?: ReturnType<typeof setTimeout>;
  #idleTimer?: ReturnType<typeof setTimeout>;
  #handshakeTimer?: ReturnType<typeof setTimeout>;
  #keepAliveIntervalMs: number;

  constructor(transport: Transport, opts: WireOptions = {}) {
    super();
    this.transport = transport;
    this.expectedInfoHash = opts.expectedInfoHash ?? null;
    this.expectedPeerId = opts.expectedPeerId
      ? new Uint8Array(opts.expectedPeerId)
      : null;
    this.localExtensions = new Set(opts.extensions);
    this.pieceCount = opts.pieceCount;
    this.pieceLength = opts.pieceLength;
    this.totalLength = opts.totalLength;
    this.maxMessageLength = positiveOption(
      "maxMessageLength", opts.maxMessageLength, DEFAULT_MAX_MESSAGE_LENGTH,
    );
    this.maxBlockLength = positiveOption(
      "maxBlockLength", opts.maxBlockLength, DEFAULT_MAX_BLOCK_LENGTH,
    );
    this.maxPendingRequests = positiveOption(
      "maxPendingRequests", opts.maxPendingRequests, DEFAULT_MAX_PENDING_REQUESTS,
    );
    this.maxQueuedWriteBytes = positiveOption(
      "maxQueuedWriteBytes", opts.maxQueuedWriteBytes, DEFAULT_MAX_QUEUED_WRITE_BYTES,
    );
    this.handshakeTimeoutMs = nonNegativeOption(
      "handshakeTimeoutMs", opts.handshakeTimeoutMs, 30_000,
    );
    this.idleTimeoutMs = nonNegativeOption(
      "idleTimeoutMs", opts.idleTimeoutMs, 0,
    );
    this.#keepAliveIntervalMs = nonNegativeOption(
      "keepAliveIntervalMs", opts.keepAliveIntervalMs, 0,
    );

    this.extensionHost = new ExtensionHost({
      send: (id, payload) => this._sendExtendedMessage(id, payload),
      client: opts.clientName,
      port: opts.listenPort,
      requestQueue: this.maxPendingRequests,
    });

    this.transport.onMessage((data) => this._onData(data));

    // Start handshake timeout
    if (this.handshakeTimeoutMs > 0) {
      this.#handshakeTimer = setTimeout(() => {
        if (this.state === WireState.Handshaking) {
          this._terminate(new TimeoutError("handshake timed out"));
        }
      }, this.handshakeTimeoutMs);
    }
  }

  // ====================================================================
  // Handshake
  // ====================================================================

  public sendHandshake(
    infoHash: Uint8Array,
    peerId: Uint8Array,
    extensions?: Uint8Array,
  ): void {
    if (infoHash.length !== 20 || peerId.length !== 20) {
      throw new RangeError("infoHash and peerId must be exactly 20 bytes");
    }

    const bytes = encodeHandshake({
      infoHash,
      peerId,
      extensions: this.localExtensions,
      reserved: extensions,
    });

    this.transport.send(bytes);
    this.handshakeSent = true;
    this._tryTransitionToConnected();
  }

  /** Send the BEP 10 extended handshake (after standard handshake completes). */
  public async sendExtendedHandshake(): Promise<void> {
    if (this.extensionHandshakeSent) return;
    if (!this._hasNegotiated(HandshakeExtension.ExtensionProtocol)) return;
    await this.extensionHost.sendHandshake();
    this.extensionHandshakeSent = true;
  }

  /** Register a BEP 10 extension before the standard handshake. */
  public use<T extends PeerWireExtension>(extension: T): T {
    if (this.state !== WireState.Handshaking) {
      throw new PeerWireError("extensions must be registered before handshaking");
    }
    if (!this.localExtensions.has(HandshakeExtension.ExtensionProtocol)) {
      throw new PeerWireError("BEP 10 must be enabled before registering extensions");
    }
    return this.extensionHost.use(extension);
  }

  // ====================================================================
  // BEP 3 messages
  // ====================================================================

  public sendChoke(): void { this._sendMessage({ type: "choke" }); }
  public sendUnchoke(): void { this._sendMessage({ type: "unchoke" }); }
  public sendInterested(): void { this._sendMessage({ type: "interested" }); }
  public sendNotInterested(): void { this._sendMessage({ type: "notInterested" }); }

  public sendHave(index: number): void {
    this._sendMessage({ type: "have", pieceIndex: index });
  }

  public sendBitfield(bitfield: Uint8Array): void {
    this._sendMessage({ type: "bitfield", bitfield });
  }

  public sendRequest(index: number, offset: number, length: number): void {
    // Backpressure: não enviar requests se o peer nos chokeou
    if (this.peerChoking) {
      this._debug(`sendRequest bloqueado: peer está nos choking (piece ${index})`);
      return;
    }
    this._sendMessage({ type: "request", pieceIndex: index, begin: offset, length });
  }

  public sendPiece(index: number, offset: number, block: Uint8Array): void {
    this._sendMessage({ type: "piece", pieceIndex: index, begin: offset, block });
  }

  public sendCancel(index: number, offset: number, length: number): void {
    this._sendMessage({ type: "cancel", pieceIndex: index, begin: offset, length });
  }

  // ====================================================================
  // BEP 5, 6, 10 messages
  // ====================================================================

  public sendPort(port: number): void {
    this._sendMessage({ type: "port", port });
  }

  public sendSuggestPiece(index: number): void {
    this._sendMessage({ type: "suggestPiece", pieceIndex: index });
  }

  public sendHaveAll(): void { this._sendMessage({ type: "haveAll" }); }
  public sendHaveNone(): void { this._sendMessage({ type: "haveNone" }); }

  public sendRejectRequest(index: number, offset: number, length: number): void {
    this._sendMessage({ type: "rejectRequest", pieceIndex: index, begin: offset, length });
  }

  public sendAllowedFast(index: number): void {
    this._sendMessage({ type: "allowedFast", pieceIndex: index });
  }

  public sendExtended(extId: number, payload: Uint8Array): void {
    this._sendMessage({ type: "extended", extensionId: extId, payload });
  }

  // ====================================================================
  // BEP 52 v2 messages
  // ====================================================================

  /** Send a hash request for a range of SHA-256 hashes from the piece layers. */
  public sendHashRequest(
    piecesRoot: Uint8Array,
    baseLayer: number,
    index: number,
    length: number,
    proofLayers: number,
  ): void {
    this._sendMessage({
      type: "hashRequest",
      piecesRoot,
      baseLayer,
      index,
      length,
      proofLayers,
    });
  }

  /** Send a batch of SHA-256 hashes in response to a hash request. */
  public sendHashes(
    piecesRoot: Uint8Array,
    baseLayer: number,
    index: number,
    length: number,
    proofLayers: number,
    hashes: Uint8Array,
  ): void {
    this._sendMessage({
      type: "hashes",
      piecesRoot,
      baseLayer,
      index,
      length,
      proofLayers,
      hashes,
    });
  }

  /** Reject a hash request. */
  public sendHashReject(
    piecesRoot: Uint8Array,
    baseLayer: number,
    index: number,
    length: number,
    proofLayers: number,
  ): void {
    this._sendMessage({
      type: "hashReject",
      piecesRoot,
      baseLayer,
      index,
      length,
      proofLayers,
    });
  }

  // ====================================================================
  // Keepalive
  // ====================================================================

  /** Configure inactivity-based keepalives; `true` selects two minutes. */
  public setKeepAlive(interval: number | boolean = true): void {
    if (interval === false) this.#keepAliveIntervalMs = 0;
    else if (interval === true) this.#keepAliveIntervalMs = 120_000;
    else {
      this.#keepAliveIntervalMs = nonNegativeOption(
        "keepAlive interval", interval, 0,
      );
    }
    this.#resetKeepAlive();
  }

  // ====================================================================
  // Pending request tracking
  // ====================================================================

  /** Block requests sent locally that still await a piece or rejection. */
  get pendingRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#pendingRequests.values()];
  }

  /** Requests received from the peer that have not been served or rejected. */
  get peerRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#peerRequests.values()];
  }

  // ====================================================================
  // Lifecycle
  // ====================================================================

  public destroy(): void {
    this._terminate();
  }

  get isDestroyed(): boolean {
    return this.state === WireState.Closed;
  }

  // ====================================================================
  // Data reception (buffer-based stream parser)
  // ====================================================================

  private _onData(chunk: Uint8Array): void {
    if (this.state === WireState.Closed) return;
    this.buffer = concat([this.buffer, chunk]);

    try {
      this._processBuffer();
    } catch (err) {
      this.emit("error", new CustomEvent("error", {
        detail: { error: err instanceof Error ? err : new Error(String(err)) },
      }));
      this._terminate(err);
    }
  }

  private _processBuffer(): void {
    // Phase 1: Handshake
    if (!this.handshakeReceived) {
      if (this.buffer.length < HANDSHAKE_LENGTH) return;

      const handshake = decodeHandshake(this.buffer.subarray(0, HANDSHAKE_LENGTH));

      // Validate infoHash
      if (this.expectedInfoHash && !equals(handshake.infoHash, this.expectedInfoHash)) {
        throw new ProtocolError("InfoHash mismatch in handshake: peer announced a different torrent");
      }

      // Validate expectedPeerId
      if (this.expectedPeerId && !equals(handshake.peerId, this.expectedPeerId)) {
        throw new ProtocolError("Unexpected peer ID in handshake");
      }

      this.buffer = this.buffer.subarray(HANDSHAKE_LENGTH);
      this.handshakeReceived = true;
      this.remoteHandshake = handshake;

      this.peerIdBuffer = handshake.peerId;
      this.peerId = Array.from(handshake.peerId)
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("");

      this.emit("handshake", new CustomEvent("handshake", {
        detail: {
          peerId: handshake.peerId,
          extensions: handshake.reserved,
          infoHash: handshake.infoHash,
        },
      }));

      this._tryTransitionToConnected();

      // Fall through to process remaining messages in buffer
    }

    // Phase 2: Length-prefixed messages
    while (this.buffer.length >= 4) {
      const length = readUInt32BE(this.buffer, 0);

      // Keepalive
      if (length === 0) {
        this.buffer = this.buffer.subarray(4);
        this.emit("keepAlive");
        this._touchActivity();
        continue;
      }

      // Validate message size
      if (length > this.maxMessageLength) {
        throw new ProtocolError(
          `peer message length ${length} exceeds limit ${this.maxMessageLength}`,
        );
      }

      if (this.buffer.length < 4 + length) return;

      const payload = this.buffer.subarray(4, 4 + length);
      const message = decodeMessagePayload(new Uint8Array(payload));

      // Extension gating: reject messages for un-negotiated extensions
      this._assertExtensionNegotiated(message);

      // Availability order validation
      this._validateAvailabilityOrder(message, false);

      // Message bounds validation
      this._validateIncoming(message);

      // Commit availability order after validation passes
      this._commitAvailabilityOrder(message, false);

      // Apply state transitions
      this._applyRemoteState(message);

      // Track downloaded bytes
      this.downloadedBytes += 4 + length;

      // Dispatch to events and extension host
      this._dispatchMessage(message);

      this.buffer = this.buffer.subarray(4 + length);
      this._touchActivity();
    }
  }

  // ====================================================================
  // Message sending (with validation and backpressure)
  // ====================================================================

  private _sendMessage(message: PeerMessage): void {
    if (this.state === WireState.Closed) {
      throw new PeerWireError("wire is closed");
    }
    if (this.state !== WireState.Connected && message.type !== "keepAlive") {
      throw new PeerWireError("wire handshake is not complete");
    }

    // Extension gating
    this._assertExtensionNegotiated(message);

    // Availability order validation
    this._validateAvailabilityOrder(message, true);

    // Outgoing bounds validation
    this._validateOutgoing(message);

    // Encode
    let frame: Uint8Array;
    try {
      frame = encodeMessage(message);
    } catch (err) {
      if (err instanceof Error) {
        this.emit("error", new CustomEvent("error", { detail: { error: err } }));
      }
      throw err;
    }

    // Message size limit
    if (frame.length - 4 > this.maxMessageLength) {
      throw new RangeError(
        `message length exceeds configured limit ${this.maxMessageLength}`,
      );
    }

    // Write with backpressure
    this._writeFrame(frame);

    // Commit availability order after successful write
    this._commitAvailabilityOrder(message, true);

    // Apply local state transitions
    this._applyLocalState(message);

    // Track uploaded bytes
    this.uploadedBytes += frame.length;
    this._touchActivity();
  }

  private _sendExtendedMessage(id: number, payload: Uint8Array): Promise<void> {
    this._sendMessage({ type: "extended", extensionId: id, payload });
    return Promise.resolve();
  }

  private _writeFrame(frame: Uint8Array): void {
    if (this.#queuedWriteBytes + frame.length > this.maxQueuedWriteBytes) {
      throw new PeerWireError(
        `write queue exceeds configured limit ${this.maxQueuedWriteBytes}`,
      );
    }
    this.#queuedWriteBytes += frame.length;
    try {
      this.transport.send(frame);
    } finally {
      this.#queuedWriteBytes -= frame.length;
    }
  }

  // ====================================================================
  // Event dispatch
  // ====================================================================

  private _dispatchMessage(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.emit("choke");
        break;
      case "unchoke":
        this.emit("unchoke");
        break;
      case "interested":
        this.emit("interested");
        break;
      case "notInterested":
        this.emit("not-interested");
        break;
      case "have":
        this.emit("have", new CustomEvent("have", { detail: { index: message.pieceIndex } }));
        break;
      case "bitfield":
        this.emit("bitfield", new CustomEvent("bitfield", { detail: { bitfield: message.bitfield } }));
        break;
      case "request":
        this.emit("request", new CustomEvent("request", {
          detail: { index: message.pieceIndex, offset: message.begin, length: message.length },
        }));
        break;
      case "piece":
        this.emit("piece", new CustomEvent("piece", {
          detail: { index: message.pieceIndex, offset: message.begin, block: message.block },
        }));
        break;
      case "cancel":
        this.emit("cancel", new CustomEvent("cancel", {
          detail: { index: message.pieceIndex, offset: message.begin, length: message.length },
        }));
        break;
      case "port":
        this.emit("port", new CustomEvent("port", { detail: { port: message.port } }));
        break;
      case "suggestPiece":
        this.emit("suggestPiece", new CustomEvent("suggestPiece", { detail: { index: message.pieceIndex } }));
        break;
      case "haveAll":
        this.emit("haveAll");
        break;
      case "haveNone":
        this.emit("haveNone");
        break;
      case "rejectRequest":
        this.emit("rejectRequest", new CustomEvent("rejectRequest", {
          detail: { index: message.pieceIndex, offset: message.begin, length: message.length },
        }));
        break;
      case "allowedFast":
        this.emit("allowedFast", new CustomEvent("allowedFast", { detail: { index: message.pieceIndex } }));
        break;
      case "extended": {
        if (message.extensionId === 0) {
          try {
            const handshake = decode(message.payload, {
              maxBytes: 256 * 1024,
              maxDepth: 32,
            });
            this.emit("extended", new CustomEvent("extended", { detail: { id: 0, payload: handshake } }));
          } catch {
            this._debug("Failed to parse extended handshake");
          }
        } else {
          this.emit("extended", new CustomEvent("extended", { detail: { id: message.extensionId, payload: message.payload } }));
        }
        // Also dispatch through ExtensionHost
        void this.extensionHost.handle(message).catch(() => {});
        break;
      }
      case "keepAlive":
        this.emit("keepAlive");
        break;
      case "unknown":
        this.emit("unknown", new CustomEvent("unknown", {
          detail: { id: message.id, payload: message.payload },
        }));
        break;
      case "hashRequest":
        this.emit("hashRequest", new CustomEvent("hashRequest", {
          detail: {
            piecesRoot: message.piecesRoot,
            baseLayer: message.baseLayer,
            index: message.index,
            length: message.length,
            proofLayers: message.proofLayers,
          },
        }));
        break;
      case "hashes":
        this.emit("hashes", new CustomEvent("hashes", {
          detail: {
            piecesRoot: message.piecesRoot,
            baseLayer: message.baseLayer,
            index: message.index,
            length: message.length,
            proofLayers: message.proofLayers,
            hashes: message.hashes,
          },
        }));
        break;
      case "hashReject":
        this.emit("hashReject", new CustomEvent("hashReject", {
          detail: {
            piecesRoot: message.piecesRoot,
            baseLayer: message.baseLayer,
            index: message.index,
            length: message.length,
            proofLayers: message.proofLayers,
          },
        }));
        break;
    }
  }

  // ====================================================================
  // State transitions
  // ====================================================================

  private _applyLocalState(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.amChoking = true;
        break;
      case "unchoke":
        this.amChoking = false;
        break;
      case "interested":
        this.amInterested = true;
        break;
      case "notInterested":
        this.amInterested = false;
        break;
      case "allowedFast":
        this.localAllowedFast.add(message.pieceIndex);
        break;
      case "piece":
      case "rejectRequest":
        this.#peerRequests.delete(blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.type === "piece"
            ? message.block.length
            : message.length,
        }));
        break;
      case "request":
        this.#pendingRequests.set(blockKey(message), {
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.length,
        });
        break;
      case "cancel": {
        const key = blockKey(message);
        this.#peerRequests.delete(key);
        break;
      }
    }
  }

  private _applyRemoteState(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.peerChoking = true;
        // Under reject semantics, choke doesn't clear pending requests
        if (!this._rejectSemanticsNegotiated()) {
          this.#pendingRequests.clear();
        }
        break;
      case "unchoke":
        this.peerChoking = false;
        break;
      case "interested":
        this.peerInterested = true;
        break;
      case "notInterested":
        this.peerInterested = false;
        break;
      case "allowedFast":
        this.remoteAllowedFast.add(message.pieceIndex);
        break;
      case "request":
        this.#peerRequests.set(blockKey(message), {
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.length,
        });
        break;
      case "cancel":
        this.#peerRequests.delete(blockKey(message));
        break;
      case "piece":
      case "rejectRequest":
        this.#pendingRequests.delete(blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.type === "piece"
            ? message.block.length
            : message.length,
        }));
        break;
    }
  }

  // ====================================================================
  // Validation
  // ====================================================================

  private _validateOutgoing(message: PeerMessage): void {
    this._validateMessageBounds(message, false);
  }

  private _validateIncoming(message: PeerMessage): void {
    this._validateMessageBounds(message, true);
    if (
      message.type === "request" &&
      this.#peerRequests.size >= this.maxPendingRequests
    ) {
      throw new ProtocolError("peer exceeded outstanding request limit");
    }
  }

  private _validateMessageBounds(message: PeerMessage, incoming: boolean): void {
    const ErrorType = incoming ? ProtocolError : RangeError;
    switch (message.type) {
      case "have":
      case "suggestPiece":
      case "allowedFast":
        this._validatePieceIndex(message.pieceIndex, incoming);
        break;
      case "request":
      case "cancel":
      case "rejectRequest":
        this._validateBlock(message, incoming);
        break;
      case "piece":
        this._validateBlock({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.block.length,
        }, incoming);
        break;
      case "bitfield":
        // Bitfield spare-bit validation can be added later with Bitfield.fromBytes
        break;
    }
  }

  private _validatePieceIndex(pieceIndex: number, incoming: boolean): void {
    if (
      !Number.isInteger(pieceIndex) || pieceIndex < 0 ||
      pieceIndex > 0xffffffff ||
      (this.pieceCount !== undefined && pieceIndex >= this.pieceCount)
    ) {
      const ErrorType = incoming ? ProtocolError : RangeError;
      throw new ErrorType(`piece index ${pieceIndex} is out of range`);
    }
  }

  private _validateBlock(request: BlockCoordinates, incoming: boolean): void {
    const ErrorType = incoming ? ProtocolError : RangeError;
    this._validatePieceIndex(request.pieceIndex, incoming);
    if (request.length < 1 || request.length > this.maxBlockLength) {
      throw new ErrorType(
        `block length must be from 1 to ${this.maxBlockLength}`,
      );
    }
    if (
      !Number.isInteger(request.begin) || request.begin < 0 ||
      request.begin > 0xffffffff
    ) {
      throw new ErrorType("block begin must be a non-negative integer");
    }
    if (this.pieceLength !== undefined) {
      let actualLength = this.pieceLength;
      if (
        this.totalLength !== undefined &&
        this.pieceCount !== undefined &&
        request.pieceIndex === this.pieceCount - 1
      ) {
        actualLength = this.totalLength - request.pieceIndex * this.pieceLength;
      }
      if (request.begin + request.length > actualLength) {
        throw new ErrorType("block exceeds piece boundary");
      }
    }
  }

  // ── Availability order ─────────────────────────────────────────────

  private _validateAvailabilityOrder(message: PeerMessage, local: boolean): void {
    if (message.type === "keepAlive" || message.type === "extended") return;

    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" ||
      message.type === "haveNone";

    const open = local
      ? this.localAvailabilityOpen
      : this.remoteAvailabilityOpen;
    const declared = local
      ? this.localAvailabilityDeclared
      : this.remoteAvailabilityDeclared;

    if (declaration) {
      if (!open || declared) {
        throw new ProtocolError(
          "availability declaration must appear once after handshake",
        );
      }
    } else if (this._fastNegotiated() && open && !declared) {
      throw new ProtocolError(
        "Fast peers must send bitfield, have all, or have none before other messages",
      );
    }
  }

  private _commitAvailabilityOrder(message: PeerMessage, local: boolean): void {
    if (message.type === "keepAlive" || message.type === "extended") return;
    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" || message.type === "haveNone";
    if (local) {
      this.localAvailabilityDeclared ||= declaration;
      this.localAvailabilityOpen = false;
    } else {
      this.remoteAvailabilityDeclared ||= declaration;
      this.remoteAvailabilityOpen = false;
    }
  }

  // ── Extension negotiation ──────────────────────────────────────────

  private _assertExtensionNegotiated(message: PeerMessage): void {
    let required: HandshakeExtension | undefined;
    switch (message.type) {
      case "suggestPiece":
      case "haveAll":
      case "haveNone":
      case "rejectRequest":
      case "allowedFast":
        required = HandshakeExtension.Fast;
        break;
      case "extended":
        required = HandshakeExtension.ExtensionProtocol;
        break;
      case "port":
        required = HandshakeExtension.Dht;
        break;
      case "hashRequest":
      case "hashes":
      case "hashReject":
        required = HandshakeExtension.V2;
        break;
      default:
        return;
    }
    if (!this._hasNegotiated(required)) {
      throw new ProtocolError(
        `${required} message was used without negotiation`,
      );
    }
  }

  private _hasNegotiated(extension: HandshakeExtension): boolean {
    return this.localExtensions.has(extension) &&
      this.remoteHandshake?.extensions.has(extension) === true;
  }

  private _fastNegotiated(): boolean {
    return this._hasNegotiated(HandshakeExtension.Fast);
  }

  private _rejectSemanticsNegotiated(): boolean {
    return this._fastNegotiated() ||
      this._hasNegotiated(HandshakeExtension.V2);
  }

  // ====================================================================
  // Lifecycle helpers
  // ====================================================================

  private _tryTransitionToConnected(): void {
    if (this.handshakeSent && this.handshakeReceived) {
      this.state = WireState.Connected;
      if (this.#handshakeTimer !== undefined) {
        clearTimeout(this.#handshakeTimer);
        this.#handshakeTimer = undefined;
      }
      this.#resetKeepAlive();
      this.#resetIdleTimeout();
      this._startSpeedTracking();
    }
  }

  private _startSpeedTracking(): void {
    this._lastSpeedSample = Date.now();
    this._lastDownloaded = this.downloadedBytes;
    this._lastUploaded = this.uploadedBytes;
    this._speedInterval = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();
      const dt = (now - this._lastSpeedSample) / 1000;
      if (dt <= 0) return;
      const dl = this.downloadedBytes - this._lastDownloaded;
      const ul = this.uploadedBytes - this._lastUploaded;
      this._downloadSpeed = Math.round(dl / dt);
      this._uploadSpeed = Math.round(ul / dt);
      this._lastSpeedSample = now;
      this._lastDownloaded = this.downloadedBytes;
      this._lastUploaded = this.uploadedBytes;
    }, 1000);
  }

  private _touchActivity(): void {
    this.lastActivityAt = Date.now();
    this.#resetKeepAlive();
    this.#resetIdleTimeout();
  }

  private _terminate(reason?: unknown): void {
    if (this.state === WireState.Closed) return;
    this.state = WireState.Closed;

    if (this.#handshakeTimer !== undefined) clearTimeout(this.#handshakeTimer);
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    if (this._speedInterval !== undefined) {
      clearInterval(this._speedInterval);
      this._speedInterval = undefined;
    }

    this.extensionHost.close(reason);
    this.#pendingRequests.clear();
    this.#peerRequests.clear();

    this.emit("close", new CustomEvent("close", { detail: { reason } }));

    try {
      this.transport.close();
    } catch {
      // transport close may throw; swallow
    }
  }

  // ====================================================================
  // Timer management
  // ====================================================================

  #resetKeepAlive(): void {
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    this.#keepAliveTimer = undefined;
    if (
      this.#keepAliveIntervalMs > 0 && this.state === WireState.Connected
    ) {
      this.#keepAliveTimer = setTimeout(() => {
        this.#keepAliveTimer = undefined;
        if (this.state === WireState.Connected) {
          try {
            this._sendMessage({ type: "keepAlive" });
          } catch {
            // send failed — connection likely dead
          }
        }
      }, this.#keepAliveIntervalMs);
    }
  }

  #resetIdleTimeout(): void {
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.idleTimeoutMs > 0 && this.state === WireState.Connected) {
      this.#idleTimer = setTimeout(() => {
        this._terminate(new TimeoutError("peer connection became idle"));
      }, this.idleTimeoutMs);
    }
  }

  private _debug(msg: string): void {
    console.debug(`[Wire] ${msg}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function blockKey(request: BlockCoordinates): string {
  return `${request.pieceIndex}:${request.begin}:${request.length}`;
}

function positiveOption(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function nonNegativeOption(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return resolved;
}
