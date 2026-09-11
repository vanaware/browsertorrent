// /loco/monorepo/webtorrent/src/extensions/ut-pex.ts
//
// Implementação do BEP 11 (ut_pex - Peer Exchange) para o @loco/webtorrent.
// Adaptado do deno-torrent para nosso ecossistema Browser/Deno.
//
// O ut_pex permite que peers compartilhem listas de outros peers diretamente,
// criando uma rede verdadeiramente descentralizada e resiliente.

import { Extension } from "../core/extension.ts";
import { encode, decode, BencodeDict, BencodeValue } from "../utils/bencode.ts";

/** BEP 10 registration name for peer exchange. */
export const UT_PEX_NAME = "ut_pex";

/** Flags accompanying compact peers in a BEP 11 update. */
export enum PexPeerFlag {
  /** Peer prefers encryption (PE supports encryption). */
  PrefersEncryption = 0x01,
  /** Peer is a seed (has all pieces). */
  Seed = 0x02,
  /** Peer supports uTP (micro transport protocol). */
  Utp = 0x04,
  /** Peer supports holepunching. */
  Holepunch = 0x08,
  /** Connection to peer is outgoing. */
  Outgoing = 0x10,
}

/** One compact peer candidate carried by BEP 11. */
export interface PexPeer {
  /** Four-byte IPv4 or sixteen-byte IPv6 address. */
  address: Uint8Array;
  /** Unsigned network port (1-65535). */
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
export class UtPexExtension extends Extension {
  /** BEP 10 registration name. */
  public readonly name = UT_PEX_NAME;

  /** Minimum duration enforced between outgoing updates. */
  public readonly minSendIntervalMs: number;
  /** Combined candidate limit for each incoming or outgoing update. */
  public readonly maxPeersPerMessage: number;

  private _lastSentAt = -Infinity;
  private _listeners = new Set<(update: PexUpdate) => void>();
  private _extensionId: number | null = null;

  /** Create a bounded PEX codec and notification endpoint. */
  constructor(wire: any, options: UtPexOptions = {}) {
    super(wire);
    this.minSendIntervalMs = options.minSendIntervalMs ?? 60_000;
    this.maxPeersPerMessage = options.maxPeersPerMessage ?? 100;

    if (!Number.isSafeInteger(this.minSendIntervalMs) || this.minSendIntervalMs < 0) {
      throw new RangeError("minSendIntervalMs must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(this.maxPeersPerMessage) || this.maxPeersPerMessage < 1) {
      throw new RangeError("maxPeersPerMessage must be a positive safe integer");
    }
    if (options.onUpdate) this._listeners.add(options.onUpdate);
  }

  /**
   * Called when the extended handshake is received.
   * Registers this extension if the peer supports ut_pex.
   */
  public onExtendedHandshake(handshake: any): void {
    if (handshake.m && typeof handshake.m[UT_PEX_NAME] === "number") {
      this._extensionId = handshake.m[UT_PEX_NAME];
      this.emit("info", new CustomEvent("info", {
        detail: { message: `ut_pex registered with extension ID: ${this._extensionId}` }
      }));
    } else {
      this.emit("warning", new CustomEvent("warning", {
        detail: { error: new Error("Peer does not support ut_pex") }
      }));
    }
  }

  /**
   * Decode, validate, and notify listeners of one peer update.
   */
  public onMessage(payload: Uint8Array): void {
    try {
      const update = decodePexUpdate(payload, this.maxPeersPerMessage);
      for (const listener of this._listeners) {
        listener(update);
      }
    } catch (err) {
      this.emit("warning", new CustomEvent("warning", {
        detail: { error: err instanceof Error ? err : new Error(String(err)) }
      }));
    }
  }

  /**
   * Subscribe to validated updates and return an unsubscribe function.
   */
  public onUpdate(listener: (update: PexUpdate) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Send a bounded update without dialing or modifying any swarm state.
   * BEP 11 limits production senders to one update per minute.
   */
  public async send(update: PexUpdate): Promise<void> {
    if (this._extensionId === null) {
      throw new Error("ut_pex is not registered (no extension ID from extended handshake)");
    }

    const now = Date.now();
    if (now - this._lastSentAt < this.minSendIntervalMs) {
      throw new Error(`ut_pex updates may not be sent this frequently (wait ${this.minSendIntervalMs - (now - this._lastSentAt)}ms)`);
    }
    if (update.added.length + update.dropped.length > this.maxPeersPerMessage) {
      throw new RangeError(`ut_pex update exceeds ${this.maxPeersPerMessage} peers`);
    }

    const payload = encodePexUpdate(update);
    this.wire.extended(this._extensionId, payload);
    this._lastSentAt = now;
  }
}

/**
 * Encode IPv4 and IPv6 candidates into BEP 11 compact fields.
 */
export function encodePexUpdate(update: PexUpdate): Uint8Array {
  const added4 = update.added.filter((peer) => peer.address.length === 4);
  const added6 = update.added.filter((peer) => peer.address.length === 16);
  const dropped4 = update.dropped.filter((peer) => peer.address.length === 4);
  const dropped6 = update.dropped.filter((peer) => peer.address.length === 16);

  if (added4.length + added6.length !== update.added.length ||
      dropped4.length + dropped6.length !== update.dropped.length) {
    throw new RangeError("PEX addresses must contain four or sixteen bytes");
  }

  const dictionary: BencodeDict = {};

  if (added4.length) {
    dictionary["added"] = compactPeers(added4, 4);
    dictionary["added.f"] = Uint8Array.from(added4, (peer) => peer.flags ?? 0);
  }
  if (added6.length) {
    dictionary["added6"] = compactPeers(added6, 16);
    dictionary["added6.f"] = Uint8Array.from(added6, (peer) => peer.flags ?? 0);
  }
  if (dropped4.length) {
    dictionary["dropped"] = compactPeers(dropped4, 4);
  }
  if (dropped6.length) {
    dictionary["dropped6"] = compactPeers(dropped6, 16);
  }

  return encode(dictionary);
}

/**
 * Decode and bound a BEP 11 update from an untrusted peer.
 */
export function decodePexUpdate(payload: Uint8Array, maxPeers = 100): PexUpdate {
  let value: BencodeValue;
  try {
    value = decode(payload);
  } catch (cause) {
    throw new Error(`Invalid ut_pex payload: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ut_pex payload must be a dictionary");
  }

  const dict = value as BencodeDict;

  const added = [
    ...decodePeers(dict, "added", "added.f", 4),
    ...decodePeers(dict, "added6", "added6.f", 16),
  ];
  const dropped = [
    ...decodePeers(dict, "dropped", undefined, 4),
    ...decodePeers(dict, "dropped6", undefined, 16),
  ];

  if (added.length + dropped.length > maxPeers) {
    throw new Error(`ut_pex update exceeds ${maxPeers} peers`);
  }

  return { added, dropped };
}

/**
 * Compact peers into a binary format (address + port).
 */
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
    if (peer.flags !== undefined && (!Number.isInteger(peer.flags) || peer.flags < 0 || peer.flags > 255)) {
      throw new RangeError("PEX peer flags must be an unsigned byte");
    }

    result.set(peer.address, offset);
    new DataView(result.buffer).setUint16(offset + addressLength, peer.port);
    offset += addressLength + 2;
  }

  return result;
}

/**
 * Decode peers from a compact binary format.
 */
function decodePeers(
  dictionary: BencodeDict,
  peersKey: string,
  flagsKey: string | undefined,
  addressLength: number,
): PexPeer[] {
  const compact = optionalBytes(dictionary, peersKey);
  if (!compact) return [];

  const width = addressLength + 2;
  if (compact.length % width !== 0) {
    throw new Error(`${peersKey} has a truncated compact endpoint`);
  }

  const count = compact.length / width;
  const flags = flagsKey ? optionalBytes(dictionary, flagsKey) : undefined;

  if (flags && flags.length !== count) {
    throw new Error(`${flagsKey} length does not match peer count`);
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
      throw new Error("PEX peer port may not be zero");
    }

    peers.push({
      address: compact.slice(offset, offset + addressLength),
      port,
      flags: flags?.[index] ?? 0,
    });
  }

  return peers;
}

/**
 * Extract bytes from a bencode dictionary, handling both Uint8Array and string values.
 */
function optionalBytes(
  dictionary: BencodeDict,
  key: string,
): Uint8Array | undefined {
  const value = dictionary[key];
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new Error(`ut_pex ${key} must be a byte string`);
}
