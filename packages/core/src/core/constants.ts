// /loco/monorepo/webtorrent/src/core/constants.ts
/**
 * BitTorrent peer wire protocol constants, message IDs, and limits.
 *
 * Adaptado de deno-torrent/peerwire/constants.ts.
 * Sem dependências externas — tudo é browser-puro.
 */

// ── Protocol identifiers ────────────────────────────────────────────────

/** The protocol identifier used by the BitTorrent peer wire handshake. */
export const BITTORRENT_PROTOCOL = "BitTorrent protocol";

/** The fixed byte length of a standard BitTorrent peer wire handshake. */
export const HANDSHAKE_LENGTH = 68;

/** Length of an info hash and a peer ID, in bytes. */
export const PEER_ID_LENGTH = 20;

// ── Default limits ──────────────────────────────────────────────────────

/** Default upper bound for a peer wire message payload. */
export const DEFAULT_MAX_MESSAGE_LENGTH = 2 * 1024 * 1024;

/** Maximum block payload accepted by current interoperable clients. */
export const DEFAULT_MAX_BLOCK_LENGTH = 16 * 1024;

/** Default number of queued requests accepted in either direction. */
export const DEFAULT_MAX_PENDING_REQUESTS = 250;

/** Default maximum number of bytes waiting in the serialized write queue. */
export const DEFAULT_MAX_QUEUED_WRITE_BYTES = 4 * 1024 * 1024;

// ── Peer wire message IDs ───────────────────────────────────────────────

/** Peer wire message IDs from BEP 3 and commonly implemented extensions. */
export enum PeerMessageId {
  Choke = 0,
  Unchoke = 1,
  Interested = 2,
  NotInterested = 3,
  Have = 4,
  Bitfield = 5,
  Request = 6,
  Piece = 7,
  Cancel = 8,
  Port = 9,
  SuggestPiece = 13,
  HaveAll = 14,
  HaveNone = 15,
  RejectRequest = 16,
  AllowedFast = 17,
  Extended = 20,
  HashRequest = 21,
  Hashes = 22,
  HashReject = 23,
}

// ── Handshake reserved bits ─────────────────────────────────────────────

/** Named bits in the eight reserved handshake bytes. */
export enum HandshakeExtension {
  /** BEP 6 fast extension. */
  Fast = "fast",
  /** BEP 10 extension protocol. */
  ExtensionProtocol = "extensionProtocol",
  /** BEP 5 DHT port message. */
  Dht = "dht",
  /** BEP 52 BitTorrent v2/hybrid wire protocol. */
  V2 = "v2",
}
