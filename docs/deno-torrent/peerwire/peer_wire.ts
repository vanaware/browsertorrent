import {
  type ByteReader,
  BytesUtil,
  type ByteWriter,
  InvalidByteCountError,
  IoUtil,
  UnexpectedEofError,
} from "@deno-torrent/toolkit";
import {
  DEFAULT_MAX_BLOCK_LENGTH,
  DEFAULT_MAX_MESSAGE_LENGTH,
  DEFAULT_MAX_PENDING_REQUESTS,
  DEFAULT_MAX_QUEUED_WRITE_BYTES,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
} from "@src/constants.ts";
import {
  PeerWireEofError,
  PeerWireError,
  PeerWireProtocolError,
  PeerWireRequestRejectedError,
  PeerWireTimeoutError,
} from "@src/errors.ts";
import {
  decodeHandshake,
  encodeHandshake,
  type PeerHandshake,
} from "@src/handshake.ts";
import {
  decodeMessagePayload,
  encodeMessage,
  type HashRequestFields,
  type PeerMessage,
} from "@src/message.ts";
import { Bitfield } from "@src/bitfield.ts";
import { ExtensionHost, type PeerWireExtension } from "@src/extension.ts";

/** The minimal stream contract needed by {@link PeerWire}. */
export interface PeerWireTransport extends ByteReader, ByteWriter {
  close(): void | Promise<void>;
}

export enum PeerWireState {
  Handshaking,
  Connected,
  Closed,
}

export interface PeerWireOptions {
  /** Owned byte stream. Closing the wire closes this transport. */
  transport: PeerWireTransport;
  /** Twenty-byte v1 hash or truncated v2 hash sent in this endpoint's handshake. */
  infoHash: Uint8Array;
  /** Additional twenty-byte hashes accepted from a hybrid/v2 peer. */
  acceptedInfoHashes?: Iterable<Uint8Array>;
  /** Local twenty-byte peer ID, or a UTF-8 string that encodes to twenty bytes. */
  peerId: Uint8Array | string;
  /** Tracker-provided identity used to reject an unexpected remote peer. */
  expectedPeerId?: Uint8Array | string;
  /** Reserved-bit capabilities advertised in the standard handshake. */
  extensions?: Iterable<HandshakeExtension>;
  /** Torrent geometry used for bitfield and block validation. */
  pieceCount?: number;
  /** Normal piece size; the final piece is derived from `totalLength`. */
  pieceLength?: number;
  /** Payload size used to derive the final piece boundary. */
  totalLength?: number;
  /** Exact length of every logical piece, for BEP-52 file-aligned torrents. */
  pieceLengths?: readonly number[];
  /** Largest length-prefixed peer message accepted or sent. */
  maxMessageLength?: number;
  /** Largest piece block accepted or requested, defaulting to 16 KiB. */
  maxBlockLength?: number;
  /** Maximum outstanding requests tracked in either direction. */
  maxPendingRequests?: number;
  /** Maximum encoded bytes waiting behind the active transport write. */
  maxQueuedWriteBytes?: number;
  /** Maximum payload passed through the BEP 10 extension host. */
  maxExtensionPayloadLength?: number;
  /** Default deadline for correlated block and hash requests. */
  requestTimeoutMs?: number;
  /** Handshake deadline; zero disables it. */
  handshakeTimeoutMs?: number;
  /** Deadline for each peer frame read; zero disables it. */
  readTimeoutMs?: number;
  /** Deadline for each serialized transport write; zero disables it. */
  writeTimeoutMs?: number;
  /** Close the connection after this much inactivity; zero disables it. */
  idleTimeoutMs?: number;
  /** Send keepalives after this much inactivity; zero disables them. */
  keepAliveIntervalMs?: number;
  /** Optional BEP 10 handshake identity and listening port. */
  clientName?: string;
  listenPort?: number;
}

export interface PeerWireRequestOptions {
  /** Override the connection's default timeout for this operation. */
  timeoutMs?: number;
  /** Cancel this operation. Read cancellation closes the owned byte stream. */
  signal?: AbortSignal;
}

interface PendingBlockRequest {
  request: Readonly<BlockCoordinates>;
  resolve?: (block: Uint8Array) => void;
  reject?: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

interface PendingHashRequest {
  request: Readonly<HashRequestFields>;
  resolve: (hashes: Uint8Array) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
}

/** Coordinates shared by request, cancel, piece, and reject messages. */
export interface BlockCoordinates {
  pieceIndex: number;
  begin: number;
  length: number;
}

/** A transport-independent BitTorrent peer-wire session. */
export class PeerWire implements AsyncIterable<PeerMessage> {
  readonly transport: PeerWireTransport;
  readonly infoHash: Uint8Array;
  readonly acceptedInfoHashes: readonly Uint8Array[];
  readonly peerId: Uint8Array;
  readonly expectedPeerId?: Uint8Array;
  readonly extensions: ReadonlySet<HandshakeExtension>;
  readonly pieceCount?: number;
  readonly pieceLength?: number;
  readonly totalLength?: number;
  readonly pieceLengths?: readonly number[];
  readonly maxMessageLength: number;
  readonly maxBlockLength: number;
  readonly maxPendingRequests: number;
  readonly maxQueuedWriteBytes: number;
  readonly requestTimeoutMs: number;
  readonly handshakeTimeoutMs: number;
  readonly readTimeoutMs: number;
  readonly writeTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly extensionHost: ExtensionHost;

  /** Current lifecycle state. Protocol and transport failures end in Closed. */
  state = PeerWireState.Handshaking;
  /** First failure that closed the connection; absent after a clean close. */
  terminalError?: unknown;
  remoteHandshake?: PeerHandshake;
  remoteBitfield?: Bitfield;

  // BEP 3 defines these four flags independently for both directions.
  localChoking = true;
  localInterested = false;
  remoteChoking = true;
  remoteInterested = false;

  uploadedBytes = 0;
  downloadedBytes = 0;
  lastActivityAt: number = Date.now();

  /** Pieces we permit the remote peer to request while it is choked. */
  readonly localAllowedFast: Set<number> = new Set();
  /** Pieces the remote peer permits us to request while we are choked. */
  readonly remoteAllowedFast: Set<number> = new Set();

  // A request sent by us is pendingRequests; a request received from the peer
  // is peerRequests. Keeping the directions explicit prevents reject/piece
  // responses from accidentally resolving the wrong side of the connection.
  #pendingRequests = new Map<string, PendingBlockRequest>();
  #peerRequests = new Map<string, BlockCoordinates>();
  #pendingHashRequests = new Map<string, PendingHashRequest>();
  #peerHashRequests = new Map<string, HashRequestFields>();
  // ByteWriter permits partial writes and callers may send concurrently. This
  // promise chain preserves call order while #queuedWriteBytes bounds memory.
  #writeTail: Promise<void> = Promise.resolve();
  #queuedWriteBytes = 0;
  #reading = false;
  #handshakeSent = false;
  #handshakeReceived = false;
  #extensionHandshakeSent = false;
  // BEP 3/BEP 6 permit a bitfield (or have-all/none) only in the initial
  // availability slot. Extended handshakes do not consume this slot because
  // real clients may advertise BEP 10 before their availability message.
  #localAvailabilityOpen = true;
  #remoteAvailabilityOpen = true;
  #localAvailabilityDeclared = false;
  #remoteAvailabilityDeclared = false;
  #keepAliveTimer?: ReturnType<typeof setTimeout>;
  #idleTimer?: ReturnType<typeof setTimeout>;
  #keepAliveIntervalMs = 0;

  constructor(options: PeerWireOptions) {
    assertLength20("infoHash", options.infoHash);
    this.acceptedInfoHashes = [...options.acceptedInfoHashes ?? []].map(
      (hash) => {
        assertLength20("accepted info hash", hash);
        return new Uint8Array(hash);
      },
    );
    assertOptionalSafeInteger("pieceCount", options.pieceCount, 0);
    assertOptionalSafeInteger("pieceLength", options.pieceLength, 1);
    assertOptionalSafeInteger("totalLength", options.totalLength, 0);
    if (options.pieceLengths !== undefined) {
      if (options.pieceLength === undefined) {
        throw new RangeError(
          "pieceLength is required when pieceLengths is configured",
        );
      }
      if (
        options.pieceCount !== undefined &&
        options.pieceCount !== options.pieceLengths.length
      ) {
        throw new RangeError("pieceCount does not match pieceLengths");
      }
      for (const length of options.pieceLengths) {
        if (
          !Number.isSafeInteger(length) || length < 1 ||
          length > options.pieceLength
        ) {
          throw new RangeError(
            "pieceLengths entries must be from 1 to pieceLength",
          );
        }
      }
    }
    if (
      options.totalLength !== undefined && options.pieceLength === undefined
    ) {
      throw new RangeError(
        "pieceLength is required when totalLength is configured",
      );
    }
    if (
      options.pieceCount !== undefined && options.pieceLength !== undefined &&
      options.totalLength !== undefined && options.pieceLengths === undefined &&
      Math.ceil(options.totalLength / options.pieceLength) !==
        options.pieceCount
    ) {
      throw new RangeError(
        "pieceCount does not match pieceLength and totalLength",
      );
    }

    const peerId = typeof options.peerId === "string"
      ? new TextEncoder().encode(options.peerId)
      : options.peerId;
    assertLength20("peerId", peerId);
    const expectedPeerId = typeof options.expectedPeerId === "string"
      ? new TextEncoder().encode(options.expectedPeerId)
      : options.expectedPeerId;
    if (expectedPeerId) assertLength20("expectedPeerId", expectedPeerId);

    this.transport = options.transport;
    this.infoHash = new Uint8Array(options.infoHash);
    this.peerId = new Uint8Array(peerId);
    this.expectedPeerId = expectedPeerId
      ? new Uint8Array(expectedPeerId)
      : undefined;
    this.extensions = new Set(options.extensions);
    this.pieceCount = options.pieceCount ?? options.pieceLengths?.length;
    this.pieceLength = options.pieceLength;
    this.totalLength = options.totalLength;
    this.pieceLengths = options.pieceLengths === undefined
      ? undefined
      : [...options.pieceLengths];
    this.maxMessageLength = positiveOption(
      "maxMessageLength",
      options.maxMessageLength,
      DEFAULT_MAX_MESSAGE_LENGTH,
    );
    this.maxBlockLength = positiveOption(
      "maxBlockLength",
      options.maxBlockLength,
      DEFAULT_MAX_BLOCK_LENGTH,
    );
    this.maxPendingRequests = positiveOption(
      "maxPendingRequests",
      options.maxPendingRequests,
      DEFAULT_MAX_PENDING_REQUESTS,
    );
    this.maxQueuedWriteBytes = positiveOption(
      "maxQueuedWriteBytes",
      options.maxQueuedWriteBytes,
      DEFAULT_MAX_QUEUED_WRITE_BYTES,
    );
    this.requestTimeoutMs = positiveOption(
      "requestTimeoutMs",
      options.requestTimeoutMs,
      30_000,
    );
    this.handshakeTimeoutMs = nonNegativeOption(
      "handshakeTimeoutMs",
      options.handshakeTimeoutMs,
      30_000,
    );
    this.readTimeoutMs = nonNegativeOption(
      "readTimeoutMs",
      options.readTimeoutMs,
      0,
    );
    this.writeTimeoutMs = nonNegativeOption(
      "writeTimeoutMs",
      options.writeTimeoutMs,
      0,
    );
    this.idleTimeoutMs = nonNegativeOption(
      "idleTimeoutMs",
      options.idleTimeoutMs,
      0,
    );
    this.#keepAliveIntervalMs = nonNegativeOption(
      "keepAliveIntervalMs",
      options.keepAliveIntervalMs,
      0,
    );
    this.extensionHost = new ExtensionHost({
      send: (id, payload) => this.extended(id, payload),
      maxPayloadLength: options.maxExtensionPayloadLength,
      client: options.clientName,
      port: options.listenPort,
      requestQueue: this.maxPendingRequests,
    });
  }

  // ---- Observable request/session state ---------------------------------

  /** Block requests sent locally that still await a piece or rejection. */
  get pendingRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#pendingRequests.values()].map((entry) => entry.request);
  }

  /** Requests received from the peer that have not been served or rejected. */
  get peerRequests(): readonly Readonly<BlockCoordinates>[] {
    return [...this.#peerRequests.values()];
  }

  /** BEP 52 requests sent locally that still await hashes or rejection. */
  get pendingHashRequests(): readonly Readonly<HashRequestFields>[] {
    return [...this.#pendingHashRequests.values()].map((entry) =>
      entry.request
    );
  }

  /** BEP 52 requests received from the peer and awaiting a local response. */
  get peerHashRequests(): readonly Readonly<HashRequestFields>[] {
    return [...this.#peerHashRequests.values()];
  }

  /** Encoded bytes admitted to the serialized write queue but not completed. */
  get queuedWriteBytes(): number {
    return this.#queuedWriteBytes;
  }

  /** Register a named BEP 10 extension before the standard handshake. */
  use<T extends PeerWireExtension>(extension: T): T {
    if (this.state !== PeerWireState.Handshaking) {
      throw new PeerWireError(
        "extensions must be registered before handshaking",
      );
    }
    if (!this.extensions.has(HandshakeExtension.ExtensionProtocol)) {
      throw new PeerWireError(
        "BEP 10 must be enabled before registering extensions",
      );
    }
    return this.extensionHost.use(extension);
  }

  // ---- Handshake and BEP 10 negotiation ---------------------------------

  /** Exchange standard handshakes and automatically advertise BEP 10 extensions. */
  async handshake(
    options: PeerWireRequestOptions = {},
  ): Promise<PeerHandshake> {
    this.#assertOpen();
    const operation = Promise.all([
      this.sendHandshake(),
      this.receiveHandshake(),
    ]);
    const [, remote] = await withDeadline(
      operation,
      options.timeoutMs ?? this.handshakeTimeoutMs,
      options.signal,
      "peer handshake",
      (error) => this.#terminate(error),
    );
    await this.sendExtendedHandshake();
    return remote;
  }

  /** Send this endpoint's standard 68-byte peer-wire handshake exactly once. */
  async sendHandshake(): Promise<void> {
    this.#assertOpen();
    if (this.#handshakeSent) {
      throw new PeerWireError("local handshake has already been sent");
    }
    this.#handshakeSent = true;
    try {
      await this.#write(encodeHandshake({
        infoHash: this.infoHash,
        peerId: this.peerId,
        extensions: this.extensions,
      }));
      this.#updateConnectedState();
    } catch (error) {
      this.#handshakeSent = false;
      throw error;
    }
  }

  /** Receive and validate the remote standard handshake exactly once. */
  async receiveHandshake(): Promise<PeerHandshake> {
    this.#assertOpen();
    if (this.#handshakeReceived) {
      throw new PeerWireError("remote handshake has already been received");
    }
    const bytes = await this.#read(
      HANDSHAKE_LENGTH,
      false,
      this.handshakeTimeoutMs,
    );
    const handshake = decodeHandshake(bytes!);
    if (
      !BytesUtil.equals(handshake.infoHash, this.infoHash) &&
      !this.acceptedInfoHashes.some((hash) =>
        BytesUtil.equals(hash, handshake.infoHash)
      )
    ) {
      throw await this.#protocolFailure(
        "remote handshake has a different info hash",
      );
    }
    if (
      this.expectedPeerId &&
      !BytesUtil.equals(handshake.peerId, this.expectedPeerId)
    ) {
      throw await this.#protocolFailure(
        "remote handshake has an unexpected peer ID",
      );
    }
    this.#handshakeReceived = true;
    this.remoteHandshake = handshake;
    this.#updateConnectedState();
    return handshake;
  }

  /** Advertise registered extensions; pass force to send an additive update. */
  async sendExtendedHandshake(force = false): Promise<void> {
    if (this.#extensionHandshakeSent && !force) return;
    if (!this.#hasNegotiated(HandshakeExtension.ExtensionProtocol)) return;
    await this.extensionHost.sendHandshake();
    this.#extensionHandshakeSent = true;
  }

  /** Validate, serialize, and atomically apply one outgoing peer message. */
  async send(message: PeerMessage): Promise<void> {
    await this.#send(message, true);
  }

  // ---- Framed message I/O ------------------------------------------------

  async #send(message: PeerMessage, trackRequests: boolean): Promise<void> {
    // Validation happens before encoding and queue admission. State is committed
    // only after the complete frame is written, so a rejected send is retryable.
    this.#assertConnected();
    this.#assertExtensionNegotiated(message);
    this.#validateOutgoing(message);
    let trackedBlockKey: string | undefined;
    let trackedHashKey: string | undefined;
    if (trackRequests && message.type === "request") {
      trackedBlockKey = this.#trackBlockRequest(message);
    }
    if (trackRequests && message.type === "hashRequest") {
      trackedHashKey = hashKey(message);
      if (this.#pendingHashRequests.has(trackedHashKey)) {
        throw new PeerWireError("hash request is already pending");
      }
      if (this.#pendingHashRequests.size >= this.maxPendingRequests) {
        throw new PeerWireError("too many pending hash requests");
      }
      const entry: PendingHashRequest = {
        request: copyHashRequest(message),
        resolve: () => undefined,
        reject: () => undefined,
      };
      if (this.requestTimeoutMs > 0) {
        entry.timer = setTimeout(
          () => this.#removeHashRequest(trackedHashKey!),
          this.requestTimeoutMs,
        );
      }
      this.#pendingHashRequests.set(trackedHashKey, entry);
    }
    let frame: Uint8Array;
    try {
      frame = encodeMessage(message);
    } catch (error) {
      if (trackedBlockKey) this.#removeBlockRequest(trackedBlockKey, error);
      if (trackedHashKey) this.#removeHashRequest(trackedHashKey, error);
      throw error;
    }
    if (frame.length - 4 > this.maxMessageLength) {
      if (trackedBlockKey) this.#removeBlockRequest(trackedBlockKey);
      throw new RangeError(
        `message length exceeds configured limit ${this.maxMessageLength}`,
      );
    }
    try {
      await this.#write(frame);
    } catch (error) {
      if (trackedBlockKey) this.#removeBlockRequest(trackedBlockKey, error);
      if (trackedHashKey) this.#removeHashRequest(trackedHashKey, error);
      throw error;
    }
    this.uploadedBytes += frame.length;
    this.#commitAvailabilityOrder(message, true);
    this.#applyLocalState(message);
    await this.#afterLocalMessage(message);
  }

  /** Read, validate, update state, and dispatch one message. */
  async readMessage(
    options: PeerWireRequestOptions = {},
  ): Promise<PeerMessage | null> {
    this.#assertConnected();
    try {
      const prefix = await this.#read(
        4,
        true,
        options.timeoutMs ?? this.readTimeoutMs,
        options.signal,
      );
      if (prefix === null) {
        await this.#terminate();
        return null;
      }
      const length = new DataView(prefix.buffer).getUint32(0);
      if (length > this.maxMessageLength) {
        throw new PeerWireProtocolError(
          `peer message length ${length} exceeds limit ${this.maxMessageLength}`,
        );
      }
      const message = length === 0
        ? { type: "keepAlive" } as const
        : decodeMessagePayload(
          (await this.#read(
            length,
            false,
            options.timeoutMs ?? this.readTimeoutMs,
            options.signal,
          ))!,
        );
      this.#assertExtensionNegotiated(message);
      // Wire validation precedes state mutation and extension callbacks. A
      // malformed peer therefore cannot leave a partially-updated session.
      this.#validateIncoming(message);
      this.#commitAvailabilityOrder(message, false);
      this.downloadedBytes += 4 + length;
      await this.#applyRemoteState(message);
      if (message.type === "extended") await this.extensionHost.handle(message);
      return message;
    } catch (error) {
      if (error instanceof PeerWireProtocolError) await this.#terminate(error);
      throw error;
    }
  }

  /** Close the owned transport and reject all pending operations. */
  async close(): Promise<void> {
    await this.#terminate();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<PeerMessage> {
    for (;;) {
      const message = await this.readMessage();
      if (message === null) return;
      yield message;
    }
  }

  /** Configure inactivity-based keepalives; `true` selects two minutes. */
  setKeepAlive(interval: number | boolean = true): void {
    if (interval === false) this.#keepAliveIntervalMs = 0;
    else if (interval === true) this.#keepAliveIntervalMs = 120_000;
    else {
      this.#keepAliveIntervalMs = nonNegativeOption(
        "keepAlive interval",
        interval,
        0,
      );
    }
    this.#resetKeepAlive();
  }

  // ---- Message convenience API ------------------------------------------

  choke(): Promise<void> {
    return this.send({ type: "choke" });
  }

  unchoke(): Promise<void> {
    return this.send({ type: "unchoke" });
  }

  interested(): Promise<void> {
    return this.send({ type: "interested" });
  }

  notInterested(): Promise<void> {
    return this.send({ type: "notInterested" });
  }

  have(pieceIndex: number): Promise<void> {
    return this.send({ type: "have", pieceIndex });
  }

  bitfield(bitfield: Bitfield | Uint8Array): Promise<void> {
    const bytes = bitfield instanceof Bitfield ? bitfield.toBytes() : bitfield;
    return this.send({ type: "bitfield", bitfield: bytes });
  }

  request(pieceIndex: number, begin: number, length: number): Promise<void> {
    return this.send({ type: "request", pieceIndex, begin, length });
  }

  /** Send a block request and resolve it when the read loop receives its response. */
  async requestBlock(
    pieceIndex: number,
    begin: number,
    length: number,
    options: PeerWireRequestOptions = {},
  ): Promise<Uint8Array> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    const request = { pieceIndex, begin, length };
    this.#validateBlock(request, false);
    const key = blockKey(request);
    if (this.#pendingRequests.has(key)) {
      throw new PeerWireError("block request is already pending");
    }
    if (this.#pendingRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending block requests");
    }
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      this.#pendingRequests.set(
        key,
        this.#pendingEntry(request, resolve, reject, options),
      );
    });
    try {
      await this.#send({ type: "request", ...request }, false);
    } catch (error) {
      this.#removeBlockRequest(key, error);
    }
    return await promise;
  }

  piece(pieceIndex: number, begin: number, block: Uint8Array): Promise<void> {
    return this.send({ type: "piece", pieceIndex, begin, block });
  }

  cancel(pieceIndex: number, begin: number, length: number): Promise<void> {
    return this.send({ type: "cancel", pieceIndex, begin, length });
  }

  port(port: number): Promise<void> {
    return this.send({ type: "port", port });
  }

  suggest(pieceIndex: number): Promise<void> {
    return this.send({ type: "suggestPiece", pieceIndex });
  }

  haveAll(): Promise<void> {
    return this.send({ type: "haveAll" });
  }

  haveNone(): Promise<void> {
    return this.send({ type: "haveNone" });
  }

  reject(pieceIndex: number, begin: number, length: number): Promise<void> {
    return this.send({ type: "rejectRequest", pieceIndex, begin, length });
  }

  allowedFast(pieceIndex: number): Promise<void> {
    return this.send({ type: "allowedFast", pieceIndex });
  }

  extended(extensionId: number, payload: Uint8Array): Promise<void> {
    return this.send({ type: "extended", extensionId, payload });
  }

  hashRequest(request: HashRequestFields): Promise<void> {
    return this.send({ type: "hashRequest", ...request });
  }

  /** Request a BEP 52 hash block and resolve it from the active read loop. */
  async requestHashes(
    request: HashRequestFields,
    options: PeerWireRequestOptions = {},
  ): Promise<Uint8Array> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    const key = hashKey(request);
    if (this.#pendingHashRequests.has(key)) {
      throw new PeerWireError("hash request is already pending");
    }
    if (this.#pendingHashRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending hash requests");
    }
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      const entry: PendingHashRequest = {
        request: copyHashRequest(request),
        resolve,
        reject,
      };
      this.#configurePending(entry, key, options, true);
      this.#pendingHashRequests.set(key, entry);
    });
    try {
      await this.#send({ type: "hashRequest", ...request }, false);
    } catch (error) {
      this.#removeHashRequest(key, error);
    }
    return await promise;
  }

  hashes(request: HashRequestFields, hashes: Uint8Array): Promise<void> {
    return this.send({ type: "hashes", ...request, hashes });
  }

  hashReject(request: HashRequestFields): Promise<void> {
    return this.send({ type: "hashReject", ...request });
  }

  // ---- Transport serialization ------------------------------------------

  #write(bytes: Uint8Array): Promise<void> {
    this.#assertOpen();
    if (this.#queuedWriteBytes + bytes.length > this.maxQueuedWriteBytes) {
      throw new PeerWireError(
        `write queue exceeds configured limit ${this.maxQueuedWriteBytes}`,
      );
    }
    this.#queuedWriteBytes += bytes.length;
    const operation = this.#writeTail.then(async () => {
      try {
        await withDeadline(
          IoUtil.writeAll(this.transport, bytes),
          this.writeTimeoutMs,
          undefined,
          "peer write",
          (error) => this.#terminate(error),
        );
        this.#touchActivity();
      } catch (error) {
        if (error instanceof InvalidByteCountError) {
          const wrapped = error.count <= 0
            ? new PeerWireEofError("transport stopped while writing", {
              cause: error,
            })
            : new PeerWireError("transport reported an invalid write length", {
              cause: error,
            });
          await this.#terminate(wrapped);
          throw wrapped;
        }
        await this.#terminate(error);
        throw error;
      } finally {
        this.#queuedWriteBytes -= bytes.length;
      }
    });
    this.#writeTail = operation.catch(() => undefined);
    return operation;
  }

  async #read(
    length: number,
    allowCleanEof: boolean,
    timeoutMs = 0,
    signal?: AbortSignal,
  ): Promise<Uint8Array | null> {
    if (this.#reading) {
      throw new PeerWireError("concurrent reads are not supported");
    }
    this.#reading = true;
    try {
      const bytes = new Uint8Array(length);
      try {
        const complete = await withDeadline(
          IoUtil.readExactly(this.transport, bytes, { allowCleanEof }),
          timeoutMs,
          signal,
          "peer read",
          (error) => this.#terminate(error),
        );
        if (complete) this.#touchActivity();
        return complete ? bytes : null;
      } catch (error) {
        if (error instanceof UnexpectedEofError) {
          const wrapped = new PeerWireEofError(
            `transport ended after ${error.bytesRead} of ${error.expectedBytes} bytes`,
            { cause: error },
          );
          await this.#terminate(wrapped);
          throw wrapped;
        }
        if (error instanceof InvalidByteCountError) {
          const wrapped = new PeerWireError(
            "transport reported an invalid read length",
            {
              cause: error,
            },
          );
          await this.#terminate(wrapped);
          throw wrapped;
        }
        throw error;
      }
    } finally {
      this.#reading = false;
    }
  }

  #updateConnectedState(): void {
    if (this.#handshakeSent && this.#handshakeReceived) {
      this.state = PeerWireState.Connected;
      this.#resetKeepAlive();
      this.#resetIdleTimeout();
    }
  }

  // ---- Protocol state transitions ---------------------------------------

  #applyLocalState(message: PeerMessage): void {
    switch (message.type) {
      case "choke":
        this.localChoking = true;
        break;
      case "unchoke":
        this.localChoking = false;
        break;
      case "interested":
        this.localInterested = true;
        break;
      case "notInterested":
        this.localInterested = false;
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
      case "hashes":
      case "hashReject":
        this.#peerHashRequests.delete(hashKey(message));
        break;
    }
  }

  async #afterLocalMessage(message: PeerMessage): Promise<void> {
    // Under BEP 6/BEP 52, choke and cancel no longer silently discard requests:
    // every request must eventually receive piece or reject.
    if (message.type === "cancel" && !this.#rejectSemanticsNegotiated()) {
      this.#removeBlockRequest(
        blockKey(message),
        new PeerWireError("block request cancelled"),
      );
    }
    if (message.type !== "choke" || !this.#rejectSemanticsNegotiated()) return;
    const requests = [...this.#peerRequests.values()];
    for (const request of requests) {
      if (
        !this.#fastNegotiated() ||
        !this.localAllowedFast.has(request.pieceIndex)
      ) {
        await this.reject(request.pieceIndex, request.begin, request.length);
      }
    }
  }

  async #applyRemoteState(message: PeerMessage): Promise<void> {
    // This is the single receive-side state transition point. Extension
    // payload dispatch happens afterwards in readMessage().
    switch (message.type) {
      case "choke":
        this.remoteChoking = true;
        if (!this.#rejectSemanticsNegotiated()) {
          for (const key of [...this.#pendingRequests.keys()]) {
            this.#removeBlockRequest(
              key,
              new PeerWireError("peer choked the request"),
            );
          }
        }
        break;
      case "unchoke":
        this.remoteChoking = false;
        break;
      case "interested":
        this.remoteInterested = true;
        break;
      case "notInterested":
        this.remoteInterested = false;
        break;
      case "bitfield":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield = Bitfield.fromBytes(
            this.pieceCount,
            message.bitfield,
          );
        }
        break;
      case "have":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield ??= new Bitfield(this.pieceCount);
          this.remoteBitfield.set(message.pieceIndex);
        }
        break;
      case "haveAll":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield = new Bitfield(this.pieceCount);
          for (let index = 0; index < this.pieceCount; index++) {
            this.remoteBitfield.set(index);
          }
        }
        break;
      case "haveNone":
        if (this.pieceCount !== undefined) {
          this.remoteBitfield = new Bitfield(this.pieceCount);
        }
        break;
      case "allowedFast":
        this.remoteAllowedFast.add(message.pieceIndex);
        break;
      case "request": {
        const key = blockKey(message);
        if (
          this.localChoking && this.#rejectSemanticsNegotiated() &&
          (!this.#fastNegotiated() ||
            !this.localAllowedFast.has(message.pieceIndex))
        ) {
          await this.reject(message.pieceIndex, message.begin, message.length);
        } else {
          this.#peerRequests.set(key, copyBlock(message));
        }
        break;
      }
      case "cancel":
        if (!this.#rejectSemanticsNegotiated()) {
          this.#peerRequests.delete(blockKey(message));
        }
        break;
      case "piece": {
        const key = blockKey({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.block.length,
        });
        const pending = this.#pendingRequests.get(key);
        if (!pending && this.#rejectSemanticsNegotiated()) {
          throw new PeerWireProtocolError("peer sent an unsolicited piece");
        }
        if (pending) {
          this.#pendingRequests.delete(key);
          clearPending(pending);
          pending.resolve?.(new Uint8Array(message.block));
        }
        break;
      }
      case "rejectRequest": {
        const key = blockKey(message);
        if (!this.#pendingRequests.has(key)) {
          throw new PeerWireProtocolError(
            "peer rejected a request that was never sent",
          );
        }
        this.#removeBlockRequest(
          key,
          new PeerWireRequestRejectedError("peer rejected block request"),
        );
        break;
      }
      case "hashRequest":
        this.#peerHashRequests.set(hashKey(message), copyHashRequest(message));
        break;
      case "hashes": {
        const key = hashKey(message);
        const pending = this.#pendingHashRequests.get(key);
        if (!pending) {
          throw new PeerWireProtocolError("unsolicited hashes message");
        }
        this.#pendingHashRequests.delete(key);
        clearPending(pending);
        pending.resolve(new Uint8Array(message.hashes));
        break;
      }
      case "hashReject": {
        const key = hashKey(message);
        if (!this.#pendingHashRequests.has(key)) {
          throw new PeerWireProtocolError("unsolicited hash reject message");
        }
        this.#removeHashRequest(
          key,
          new PeerWireRequestRejectedError("peer rejected hash request"),
        );
        break;
      }
    }
  }

  #validateOutgoing(message: PeerMessage): void {
    this.#validateAvailabilityOrder(message, true);
    this.#validateMessageBounds(message, false);
    if (
      this.#rejectSemanticsNegotiated() &&
      (message.type === "piece" || message.type === "rejectRequest")
    ) {
      const key = blockKey({
        pieceIndex: message.pieceIndex,
        begin: message.begin,
        length: message.type === "piece"
          ? message.block.length
          : message.length,
      });
      if (!this.#peerRequests.has(key)) {
        throw new PeerWireProtocolError(
          "cannot answer a block request that was not received",
        );
      }
    }
    if (message.type === "hashes" || message.type === "hashReject") {
      if (!this.#peerHashRequests.has(hashKey(message))) {
        throw new PeerWireProtocolError(
          "cannot answer a hash request that was not received",
        );
      }
    }
  }

  // ---- Ordering, bounds, and capability validation ----------------------

  #validateIncoming(message: PeerMessage): void {
    this.#validateAvailabilityOrder(message, false);
    this.#validateMessageBounds(message, true);
    if (
      message.type === "request" &&
      this.#peerRequests.size >= this.maxPendingRequests
    ) {
      throw new PeerWireProtocolError(
        "peer exceeded outstanding request limit",
      );
    }
    if (
      message.type === "hashRequest" &&
      this.#peerHashRequests.size >= this.maxPendingRequests
    ) {
      throw new PeerWireProtocolError(
        "peer exceeded outstanding hash request limit",
      );
    }
  }

  #validateAvailabilityOrder(message: PeerMessage, local: boolean): void {
    if (message.type === "keepAlive" || message.type === "extended") return;
    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" ||
      message.type === "haveNone";
    const open = local
      ? this.#localAvailabilityOpen
      : this.#remoteAvailabilityOpen;
    const declared = local
      ? this.#localAvailabilityDeclared
      : this.#remoteAvailabilityDeclared;
    if (declaration) {
      if (!open || declared) {
        throw new PeerWireProtocolError(
          "availability declaration must appear once after handshake",
        );
      }
    } else if (this.#fastNegotiated() && open && !declared) {
      throw new PeerWireProtocolError(
        "Fast peers must send bitfield, have all, or have none before other messages",
      );
    }
  }

  #commitAvailabilityOrder(message: PeerMessage, local: boolean): void {
    // Called only after outgoing bytes were written or incoming bytes passed
    // every validation check. This separation keeps failed operations atomic.
    if (message.type === "keepAlive" || message.type === "extended") return;
    const declaration = message.type === "bitfield" ||
      message.type === "haveAll" || message.type === "haveNone";
    if (local) {
      this.#localAvailabilityDeclared ||= declaration;
      this.#localAvailabilityOpen = false;
    } else {
      this.#remoteAvailabilityDeclared ||= declaration;
      this.#remoteAvailabilityOpen = false;
    }
  }

  #validateMessageBounds(message: PeerMessage, incoming: boolean): void {
    switch (message.type) {
      case "bitfield":
        if (this.pieceCount !== undefined) {
          try {
            Bitfield.fromBytes(this.pieceCount, message.bitfield);
          } catch (error) {
            if (incoming) throw error;
            throw new RangeError("outgoing bitfield is invalid", {
              cause: error,
            });
          }
        }
        break;
      case "have":
      case "suggestPiece":
      case "allowedFast":
        this.#validatePieceIndex(message.pieceIndex, incoming);
        break;
      case "request":
      case "cancel":
      case "rejectRequest":
        this.#validateBlock(message, incoming);
        break;
      case "piece":
        this.#validateBlock({
          pieceIndex: message.pieceIndex,
          begin: message.begin,
          length: message.block.length,
        }, incoming);
        break;
    }
  }

  #validatePieceIndex(pieceIndex: number, incoming: boolean): void {
    if (
      !Number.isInteger(pieceIndex) || pieceIndex < 0 ||
      pieceIndex > 0xffffffff ||
      (this.pieceCount !== undefined && pieceIndex >= this.pieceCount)
    ) {
      const ErrorType = incoming ? PeerWireProtocolError : RangeError;
      throw new ErrorType(`piece index ${pieceIndex} is out of range`);
    }
  }

  #validateBlock(request: BlockCoordinates, incoming: boolean): void {
    const ErrorType = incoming ? PeerWireProtocolError : RangeError;
    this.#validatePieceIndex(request.pieceIndex, incoming);
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
      let actualLength = this.pieceLengths?.[request.pieceIndex] ??
        this.pieceLength;
      if (
        this.pieceLengths === undefined &&
        this.totalLength !== undefined && this.pieceCount !== undefined &&
        request.pieceIndex === this.pieceCount - 1
      ) {
        actualLength = this.totalLength - request.pieceIndex * this.pieceLength;
      }
      if (request.begin + request.length > actualLength) {
        throw new ErrorType("block exceeds piece boundary");
      }
    }
  }

  #assertExtensionNegotiated(message: PeerMessage): void {
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
    if (!this.#hasNegotiated(required)) {
      throw new PeerWireProtocolError(
        `${required} message was used without negotiation`,
      );
    }
  }

  #hasNegotiated(extension: HandshakeExtension): boolean {
    return this.extensions.has(extension) &&
      this.remoteHandshake?.extensions.has(extension) === true;
  }

  #fastNegotiated(): boolean {
    return this.#hasNegotiated(HandshakeExtension.Fast);
  }

  #rejectSemanticsNegotiated(): boolean {
    // BEP 52 adopts BEP 6's request/reject correlation without adopting the
    // allowed-fast set itself.
    return this.#fastNegotiated() ||
      this.#hasNegotiated(HandshakeExtension.V2);
  }

  #trackBlockRequest(request: BlockCoordinates): string {
    this.#validateBlock(request, false);
    const key = blockKey(request);
    if (this.#pendingRequests.has(key)) {
      throw new PeerWireError("block request is already pending");
    }
    if (this.#pendingRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending block requests");
    }
    const entry: PendingBlockRequest = { request: copyBlock(request) };
    if (this.requestTimeoutMs > 0) {
      entry.timer = setTimeout(
        () => this.#removeBlockRequest(key),
        this.requestTimeoutMs,
      );
    }
    this.#pendingRequests.set(key, entry);
    return key;
  }

  // ---- Pending request lifecycle ----------------------------------------

  #pendingEntry(
    request: BlockCoordinates,
    resolve: (block: Uint8Array) => void,
    reject: (reason: unknown) => void,
    options: PeerWireRequestOptions,
  ): PendingBlockRequest {
    if (this.#pendingRequests.size >= this.maxPendingRequests) {
      throw new PeerWireError("too many pending block requests");
    }
    const entry: PendingBlockRequest = {
      request: copyBlock(request),
      resolve,
      reject,
    };
    this.#configurePending(entry, blockKey(request), options, false);
    return entry;
  }

  #configurePending(
    entry: PendingBlockRequest | PendingHashRequest,
    key: string,
    options: PeerWireRequestOptions,
    hash: boolean,
  ): void {
    // Timers and abort listeners are stored on the entry so every completion
    // path (piece, reject, cancel, close, timeout) performs identical cleanup.
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    if (timeoutMs > 0) {
      entry.timer = setTimeout(() => {
        const error = new PeerWireTimeoutError("peer request timed out");
        if (hash) this.#removeHashRequest(key, error);
        else this.#removeBlockRequest(key, error);
      }, timeoutMs);
    }
    if (options.signal) {
      entry.signal = options.signal;
      entry.abort = () => {
        const reason = options.signal!.reason ??
          new DOMException("Aborted", "AbortError");
        if (hash) this.#removeHashRequest(key, reason);
        else this.#removeBlockRequest(key, reason);
      };
      options.signal.addEventListener("abort", entry.abort, { once: true });
      if (options.signal.aborted) entry.abort();
    }
  }

  #removeBlockRequest(key: string, reason?: unknown): void {
    const entry = this.#pendingRequests.get(key);
    if (!entry) return;
    this.#pendingRequests.delete(key);
    clearPending(entry);
    if (reason !== undefined) entry.reject?.(reason);
  }

  #removeHashRequest(key: string, reason?: unknown): void {
    const entry = this.#pendingHashRequests.get(key);
    if (!entry) return;
    this.#pendingHashRequests.delete(key);
    clearPending(entry);
    if (reason !== undefined) entry.reject(reason);
  }

  #touchActivity(): void {
    this.lastActivityAt = Date.now();
    this.#resetKeepAlive();
    this.#resetIdleTimeout();
  }

  // ---- Timers and terminal cleanup --------------------------------------

  #resetKeepAlive(): void {
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    this.#keepAliveTimer = undefined;
    if (
      this.#keepAliveIntervalMs > 0 && this.state === PeerWireState.Connected
    ) {
      this.#keepAliveTimer = setTimeout(() => {
        // A one-shot timer is restarted by #touchActivity. Keepalives are thus
        // sent after inactivity instead of adding traffic to an active peer.
        this.#keepAliveTimer = undefined;
        if (this.state === PeerWireState.Connected) {
          void this.send({ type: "keepAlive" }).catch((error) =>
            this.#terminate(error)
          );
        }
      }, this.#keepAliveIntervalMs);
    }
  }

  #resetIdleTimeout(): void {
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.idleTimeoutMs > 0 && this.state === PeerWireState.Connected) {
      this.#idleTimer = setTimeout(() => {
        void this.#terminate(
          new PeerWireTimeoutError("peer connection became idle"),
        );
      }, this.idleTimeoutMs);
    }
  }

  async #protocolFailure(message: string): Promise<PeerWireProtocolError> {
    const error = new PeerWireProtocolError(message);
    await this.#terminate(error);
    return error;
  }

  async #terminate(reason?: unknown): Promise<void> {
    // Closing the transport first-class is important: it unblocks a pending
    // read/write instead of waiting forever for the serialized write tail.
    if (this.state === PeerWireState.Closed) return;
    this.state = PeerWireState.Closed;
    this.terminalError ??= reason;
    if (this.#keepAliveTimer !== undefined) clearTimeout(this.#keepAliveTimer);
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.extensionHost.close(reason);
    const closeReason = reason ?? new PeerWireEofError("peer wire closed");
    for (const key of [...this.#pendingRequests.keys()]) {
      this.#removeBlockRequest(key, closeReason);
    }
    for (const key of [...this.#pendingHashRequests.keys()]) {
      this.#removeHashRequest(key, closeReason);
    }
    this.#peerRequests.clear();
    this.#peerHashRequests.clear();
    await this.transport.close();
  }

  #assertOpen(): void {
    if (this.state === PeerWireState.Closed) {
      throw new PeerWireError("peer wire is closed");
    }
  }

  #assertConnected(): void {
    this.#assertOpen();
    if (this.state !== PeerWireState.Connected) {
      throw new PeerWireError("peer wire handshake is not complete");
    }
  }
}

function blockKey(request: BlockCoordinates): string {
  return `${request.pieceIndex}:${request.begin}:${request.length}`;
}

function copyBlock(request: BlockCoordinates): BlockCoordinates {
  return {
    pieceIndex: request.pieceIndex,
    begin: request.begin,
    length: request.length,
  };
}

function hashKey(request: HashRequestFields): string {
  return `${
    hex(request.piecesRoot)
  }:${request.baseLayer}:${request.index}:${request.length}:${request.proofLayers}`;
}

function copyHashRequest(request: HashRequestFields): HashRequestFields {
  return {
    piecesRoot: new Uint8Array(request.piecesRoot),
    baseLayer: request.baseLayer,
    index: request.index,
    length: request.length,
    proofLayers: request.proofLayers,
  };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function clearPending(entry: PendingBlockRequest | PendingHashRequest): void {
  if (entry.timer !== undefined) clearTimeout(entry.timer);
  if (entry.signal && entry.abort) {
    entry.signal.removeEventListener("abort", entry.abort);
  }
}

function assertLength20(name: string, bytes: Uint8Array): void {
  if (bytes.length !== 20) {
    throw new RangeError(`${name} must contain 20 bytes`);
  }
}

function assertOptionalSafeInteger(
  name: string,
  value: number | undefined,
  minimum: number,
) {
  if (
    value !== undefined && (!Number.isSafeInteger(value) || value < minimum)
  ) {
    throw new RangeError(
      `${name} must be a safe integer greater than or equal to ${minimum}`,
    );
  }
}

function positiveOption(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function nonNegativeOption(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return resolved;
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: string,
  onFailure?: (error: unknown) => void | Promise<void>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (timeoutMs <= 0 && !signal) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const fail = (error: unknown) =>
      finish(() => {
        void onFailure?.(error);
        reject(error);
      });
    const timer = timeoutMs > 0
      ? setTimeout(
        () => fail(new PeerWireTimeoutError(`${operation} timed out`)),
        timeoutMs,
      )
      : undefined;
    const abort = () =>
      fail(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => fail(error),
    );
  });
}
