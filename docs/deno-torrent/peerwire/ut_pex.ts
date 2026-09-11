import { type BencodeValue, decode, encode } from "@deno-torrent/bencode";
import type {
  PeerWireExtension,
  PeerWireExtensionContext,
} from "@src/extension.ts";
import { PeerWireError, PeerWireProtocolError } from "@src/errors.ts";

/** Registered BEP 10 name for peer exchange. */
export const UT_PEX_NAME = "ut_pex";

/** Flags accompanying compact peers in a BEP 11 update. */
export enum PexPeerFlag {
  PrefersEncryption = 0x01,
  Seed = 0x02,
  Utp = 0x04,
  Holepunch = 0x08,
  Outgoing = 0x10,
}

/** One compact peer candidate carried by BEP 11. */
export interface PexPeer {
  /** Four-byte IPv4 or sixteen-byte IPv6 address. */
  address: Uint8Array;
  /** Unsigned network port. */
  port: number;
  /** Bitwise combination of {@link PexPeerFlag} values. */
  flags?: number;
}

/** Candidate changes reported by one peer; no dialing policy is implied. */
export interface PexUpdate {
  /** New candidates reported by the peer. */
  added: PexPeer[];
  /** Candidates the peer no longer recommends. */
  dropped: PexPeer[];
}

/** Resource and callback options for {@link UtPexExtension}. */
export interface UtPexOptions {
  /** BEP 11 requires at least sixty seconds in production. */
  minSendIntervalMs?: number;
  /** Combined added and dropped peer limit, defaulting to 100. */
  maxPeersPerMessage?: number;
  /** Optional initial listener for validated incoming updates. */
  onUpdate?: (update: PexUpdate) => void;
}

/** Built-in BEP 11 peer exchange codec and transport extension. */
export class UtPexExtension implements PeerWireExtension {
  /** BEP 10 registration name. */
  readonly name: typeof UT_PEX_NAME = UT_PEX_NAME;
  /** Minimum duration enforced between outgoing updates. */
  readonly minSendIntervalMs: number;
  /** Combined candidate limit for each incoming or outgoing update. */
  readonly maxPeersPerMessage: number;

  #context?: PeerWireExtensionContext;
  #lastSentAt = -Infinity;
  #listeners = new Set<(update: PexUpdate) => void>();

  /** Create a bounded PEX codec and notification endpoint. */
  constructor(options: UtPexOptions = {}) {
    this.minSendIntervalMs = options.minSendIntervalMs ?? 60_000;
    this.maxPeersPerMessage = options.maxPeersPerMessage ?? 100;
    if (
      !Number.isSafeInteger(this.minSendIntervalMs) ||
      this.minSendIntervalMs < 0
    ) {
      throw new RangeError(
        "minSendIntervalMs must be a non-negative safe integer",
      );
    }
    if (
      !Number.isSafeInteger(this.maxPeersPerMessage) ||
      this.maxPeersPerMessage < 1
    ) {
      throw new RangeError(
        "maxPeersPerMessage must be a positive safe integer",
      );
    }
    if (options.onUpdate) this.#listeners.add(options.onUpdate);
  }

  /** @internal Implements {@link PeerWireExtension}. */
  onRegister(context: PeerWireExtensionContext): void {
    this.#context = context;
  }

  /** Decode, validate, and notify listeners of one peer update. */
  onMessage(payload: Uint8Array): void {
    const update = decodePexUpdate(payload, this.maxPeersPerMessage);
    for (const listener of this.#listeners) listener(update);
  }

  /** Subscribe to validated updates and return an unsubscribe function. */
  onUpdate(listener: (update: PexUpdate) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Send a bounded update without dialing or modifying any swarm state. */
  async send(update: PexUpdate): Promise<void> {
    // BEP 11 limits production senders to one update per minute. Tests and
    // specialized callers may choose a different interval explicitly.
    if (!this.#context) throw new PeerWireError("ut_pex is not registered");
    const now = Date.now();
    if (now - this.#lastSentAt < this.minSendIntervalMs) {
      throw new PeerWireError("ut_pex updates may not be sent this frequently");
    }
    if (update.added.length + update.dropped.length > this.maxPeersPerMessage) {
      throw new RangeError(
        `ut_pex update exceeds ${this.maxPeersPerMessage} peers`,
      );
    }
    const payload = encodePexUpdate(update);
    await this.#context.send(payload);
    this.#lastSentAt = now;
  }
}

/** Encode IPv4 and IPv6 candidates into BEP 11 compact fields. */
export function encodePexUpdate(update: PexUpdate): Uint8Array {
  const added4 = update.added.filter((peer) => peer.address.length === 4);
  const added6 = update.added.filter((peer) => peer.address.length === 16);
  const dropped4 = update.dropped.filter((peer) => peer.address.length === 4);
  const dropped6 = update.dropped.filter((peer) => peer.address.length === 16);
  if (
    added4.length + added6.length !== update.added.length ||
    dropped4.length + dropped6.length !== update.dropped.length
  ) {
    throw new RangeError("PEX addresses must contain four or sixteen bytes");
  }
  const dictionary = new Map<string, BencodeValue>();
  if (added4.length) {
    dictionary.set("added", compactPeers(added4, 4));
    dictionary.set(
      "added.f",
      Uint8Array.from(added4, (peer) => peer.flags ?? 0),
    );
  }
  if (added6.length) {
    dictionary.set("added6", compactPeers(added6, 16));
    dictionary.set(
      "added6.f",
      Uint8Array.from(added6, (peer) => peer.flags ?? 0),
    );
  }
  if (dropped4.length) dictionary.set("dropped", compactPeers(dropped4, 4));
  if (dropped6.length) dictionary.set("dropped6", compactPeers(dropped6, 16));
  return encode(dictionary);
}

/** Decode and bound a BEP 11 update from an untrusted peer. */
export function decodePexUpdate(
  payload: Uint8Array,
  maxPeers = 100,
): PexUpdate {
  let value: BencodeValue;
  try {
    value = decode(payload, { maxBytes: 256 * 1024, maxDepth: 16 });
  } catch (cause) {
    throw new PeerWireProtocolError("invalid ut_pex payload", { cause });
  }
  if (!(value instanceof Map)) {
    throw new PeerWireProtocolError("ut_pex payload must be a dictionary");
  }
  const added = [
    ...decodePeers(value, "added", "added.f", 4),
    ...decodePeers(value, "added6", "added6.f", 16),
  ];
  const dropped = [
    ...decodePeers(value, "dropped", undefined, 4),
    ...decodePeers(value, "dropped6", undefined, 16),
  ];
  if (added.length + dropped.length > maxPeers) {
    throw new PeerWireProtocolError(`ut_pex update exceeds ${maxPeers} peers`);
  }
  return { added, dropped };
}

function compactPeers(peers: PexPeer[], addressLength: number): Uint8Array {
  const result = new Uint8Array(peers.length * (addressLength + 2));
  let offset = 0;
  for (const peer of peers) {
    if (peer.address.length !== addressLength) {
      throw new RangeError("PEX peer address family changed while encoding");
    }
    if (!Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535) {
      throw new RangeError("PEX peer port must be in the range 1..65535");
    }
    if (
      peer.flags !== undefined &&
      (!Number.isInteger(peer.flags) || peer.flags < 0 || peer.flags > 255)
    ) {
      throw new RangeError("PEX peer flags must be an unsigned byte");
    }
    result.set(peer.address, offset);
    new DataView(result.buffer).setUint16(offset + addressLength, peer.port);
    offset += addressLength + 2;
  }
  return result;
}

function decodePeers(
  dictionary: Map<string | Uint8Array, BencodeValue>,
  peersKey: string,
  flagsKey: string | undefined,
  addressLength: number,
): PexPeer[] {
  const compact = optionalBytes(dictionary, peersKey);
  if (!compact) return [];
  const width = addressLength + 2;
  if (compact.length % width !== 0) {
    throw new PeerWireProtocolError(
      `${peersKey} has a truncated compact endpoint`,
    );
  }
  const count = compact.length / width;
  const flags = flagsKey ? optionalBytes(dictionary, flagsKey) : undefined;
  if (flags && flags.length !== count) {
    throw new PeerWireProtocolError(
      `${flagsKey} length does not match peer count`,
    );
  }
  const peers: PexPeer[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * width;
    const port = new DataView(
      compact.buffer,
      compact.byteOffset + offset + addressLength,
      2,
    ).getUint16(0);
    if (port === 0) {
      throw new PeerWireProtocolError("PEX peer port may not be zero");
    }
    peers.push({
      address: compact.slice(offset, offset + addressLength),
      port,
      flags: flags?.[index] ?? 0,
    });
  }
  return peers;
}

function optionalBytes(
  dictionary: Map<string | Uint8Array, BencodeValue>,
  key: string,
): Uint8Array | undefined {
  const value = dictionary.get(key);
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new PeerWireProtocolError(`ut_pex ${key} must be a byte string`);
}
