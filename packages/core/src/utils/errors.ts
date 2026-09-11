// /loco/monorepo/webtorrent/src/utils/errors.ts

/**
 * Classes de erro customizadas para o Loco WebTorrent.
 * Facilita debugging e tratamento de erros específicos.
 */

export class BitfieldError extends Error {
  constructor(message: string, public code: string = "BITFIELD_ERROR") {
    super(message);
    this.name = "BitfieldError";
  }
}

export class WireError extends Error {
  constructor(message: string, public code: string = "WIRE_ERROR") {
    super(message);
    this.name = "WireError";
  }
}

export class TrackerError extends Error {
  constructor(message: string, public code: string = "TRACKER_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.name = "TrackerError";
  }
}

export class PeerError extends Error {
  constructor(message: string, public code: string = "PEER_ERROR") {
    super(message);
    this.name = "PeerError";
  }
}

export class TorrentError extends Error {
  constructor(message: string, public code: string = "TORRENT_ERROR") {
    super(message);
    this.name = "TorrentError";
  }
}

/**
 * Thrown when input cannot be parsed as a valid `.torrent` file.
 * Adaptado de deno-torrent/metainfo/parser.ts.
 */
export class TorrentParseError extends TorrentError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "TORRENT_PARSE_ERROR");
    if (options) {
      this.cause = options.cause;
    }
    this.name = "TorrentParseError";
  }
}

// ── PeerWire error taxonomy (adapted from deno-torrent/peerwire/errors.ts) ──

/** Base error for invalid or failed peer wire operations. */
export class PeerWireError extends Error {
  constructor(message: string, public code: string = "PEERWIRE_ERROR", options?: ErrorOptions) {
    super(message, options);
    this.name = "PeerWireError";
  }
}

/** Protocol violation — unexpected message, bad state, malformed handshake. */
export class ProtocolError extends PeerWireError {
  constructor(message: string, code: string = "PROTOCOL_ERROR", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "ProtocolError";
  }
}

/** Peer disconnected or transport stream ended prematurely. */
export class EofError extends PeerWireError {
  constructor(message: string, code: string = "EOF_ERROR", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "EofError";
  }
}

/** A peer wire operation exceeded its configured deadline. */
export class TimeoutError extends PeerWireError {
  constructor(message: string, code: string = "TIMEOUT_ERROR", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "TimeoutError";
  }
}

/** Peer explicitly rejected a piece request (BEP 6 Fast Extension). */
export class RequestRejectedError extends PeerWireError {
  constructor(message: string, code: string = "REQUEST_REJECTED", options?: ErrorOptions) {
    super(message, code, options);
    this.name = "RequestRejectedError";
  }
}