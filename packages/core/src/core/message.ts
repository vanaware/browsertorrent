// /loco/monorepo/webtorrent/src/core/message.ts
/**
 * Complete BitTorrent peer wire message codec.
 *
 * Supports all 20 standard message types plus forward-compatible
 * `unknown` messages. Includes BEP 6 Fast (suggest/haveAll/haveNone/reject/
 * allowedFast), BEP 5 (port), and BEP 52 v2 (hashRequest/hashes/hashReject).
 *
 * Adaptado de deno-torrent/peerwire/message.ts.
 * Replaces `@deno-torrent/toolkit` with local `isNetPort` and
 * `@src/errors.ts` with local `ProtocolError`.
 */

import { PeerMessageId } from "./constants.ts";
import { ProtocolError } from "../utils/errors.ts";
import { isNetPort } from "../utils/net.ts";

// ── Message type interfaces ─────────────────────────────────────────────

export interface KeepAliveMessage {
  type: "keepAlive";
}

export interface ChokeMessage {
  type: "choke";
}

export interface UnchokeMessage {
  type: "unchoke";
}

export interface InterestedMessage {
  type: "interested";
}

export interface NotInterestedMessage {
  type: "notInterested";
}

export interface HaveMessage {
  type: "have";
  pieceIndex: number;
}

export interface BitfieldMessage {
  type: "bitfield";
  bitfield: Uint8Array;
}

export interface BlockRequest {
  pieceIndex: number;
  begin: number;
  length: number;
}

/** Alias used by wire protocol for request/cancel/piece/reject coordinates. */
export type BlockCoordinates = BlockRequest;

export interface RequestMessage extends BlockRequest {
  type: "request";
}

export interface PieceMessage {
  type: "piece";
  pieceIndex: number;
  begin: number;
  block: Uint8Array;
}

export interface CancelMessage extends BlockRequest {
  type: "cancel";
}

export interface PortMessage {
  type: "port";
  port: number;
}

export interface SuggestPieceMessage {
  type: "suggestPiece";
  pieceIndex: number;
}

export interface HaveAllMessage {
  type: "haveAll";
}

export interface HaveNoneMessage {
  type: "haveNone";
}

export interface RejectRequestMessage extends BlockRequest {
  type: "rejectRequest";
}

export interface AllowedFastMessage {
  type: "allowedFast";
  pieceIndex: number;
}

export interface ExtendedMessage {
  type: "extended";
  extensionId: number;
  payload: Uint8Array;
}

/** Common BEP 52 Merkle hash request fields. */
export interface HashRequestFields {
  piecesRoot: Uint8Array;
  baseLayer: number;
  index: number;
  length: number;
  proofLayers: number;
}

export interface HashRequestMessage extends HashRequestFields {
  type: "hashRequest";
}

export interface HashesMessage extends HashRequestFields {
  type: "hashes";
  hashes: Uint8Array;
}

export interface HashRejectMessage extends HashRequestFields {
  type: "hashReject";
}

/** A forward-compatible message whose ID is not known by this library. */
export interface UnknownMessage {
  type: "unknown";
  id: number;
  payload: Uint8Array;
}

export type PeerMessage =
  | KeepAliveMessage
  | ChokeMessage
  | UnchokeMessage
  | InterestedMessage
  | NotInterestedMessage
  | HaveMessage
  | BitfieldMessage
  | RequestMessage
  | PieceMessage
  | CancelMessage
  | PortMessage
  | SuggestPieceMessage
  | HaveAllMessage
  | HaveNoneMessage
  | RejectRequestMessage
  | AllowedFastMessage
  | ExtendedMessage
  | HashRequestMessage
  | HashesMessage
  | HashRejectMessage
  | UnknownMessage;

// ── Encode ──────────────────────────────────────────────────────────────

/** Encode a peer message, including its four-byte big-endian length prefix. */
export function encodeMessage(message: PeerMessage): Uint8Array {
  if (message.type === "keepAlive") return new Uint8Array(4);

  const payload = encodeMessagePayload(message);
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length);
  frame.set(payload, 4);
  return frame;
}

function encodeMessagePayload(message: Exclude<PeerMessage, KeepAliveMessage>): Uint8Array {
  let id: number;
  let body: Uint8Array;

  switch (message.type) {
    case "choke":
      [id, body] = [PeerMessageId.Choke, new Uint8Array()];
      break;
    case "unchoke":
      [id, body] = [PeerMessageId.Unchoke, new Uint8Array()];
      break;
    case "interested":
      [id, body] = [PeerMessageId.Interested, new Uint8Array()];
      break;
    case "notInterested":
      [id, body] = [PeerMessageId.NotInterested, new Uint8Array()];
      break;
    case "have":
      id = PeerMessageId.Have;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "bitfield":
      id = PeerMessageId.Bitfield;
      body = new Uint8Array(message.bitfield);
      break;
    case "request":
      id = PeerMessageId.Request;
      body = encodeBlockRequest(message);
      break;
    case "piece": {
      id = PeerMessageId.Piece;
      body = new Uint8Array(8 + message.block.length);
      const view = new DataView(body.buffer);
      view.setUint32(0, asUint32(message.pieceIndex, "pieceIndex"));
      view.setUint32(4, asUint32(message.begin, "begin"));
      body.set(message.block, 8);
      break;
    }
    case "cancel":
      id = PeerMessageId.Cancel;
      body = encodeBlockRequest(message);
      break;
    case "port":
      id = PeerMessageId.Port;
      if (!isNetPort(message.port)) {
        throw new RangeError("port must be an unsigned 16-bit integer");
      }
      body = new Uint8Array(2);
      new DataView(body.buffer).setUint16(0, message.port);
      break;
    case "suggestPiece":
      id = PeerMessageId.SuggestPiece;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "haveAll":
      [id, body] = [PeerMessageId.HaveAll, new Uint8Array()];
      break;
    case "haveNone":
      [id, body] = [PeerMessageId.HaveNone, new Uint8Array()];
      break;
    case "rejectRequest":
      id = PeerMessageId.RejectRequest;
      body = encodeBlockRequest(message);
      break;
    case "allowedFast":
      id = PeerMessageId.AllowedFast;
      body = uint32Body(message.pieceIndex, "pieceIndex");
      break;
    case "extended":
      id = PeerMessageId.Extended;
      if (
        !Number.isInteger(message.extensionId) ||
        message.extensionId < 0 ||
        message.extensionId > 0xff
      ) {
        throw new RangeError("extensionId must be an unsigned 8-bit integer");
      }
      body = new Uint8Array(1 + message.payload.length);
      body[0] = message.extensionId;
      body.set(message.payload, 1);
      break;
    case "hashRequest":
      id = PeerMessageId.HashRequest;
      body = encodeHashRequest(message);
      break;
    case "hashes": {
      id = PeerMessageId.Hashes;
      if (message.hashes.length < 32 || message.hashes.length % 32 !== 0) {
        throw new RangeError(
          "hashes must contain complete 32-byte SHA-256 hashes",
        );
      }
      body = new Uint8Array(48 + message.hashes.length);
      body.set(encodeHashRequest(message));
      body.set(message.hashes, 48);
      break;
    }
    case "hashReject":
      id = PeerMessageId.HashReject;
      body = encodeHashRequest(message);
      break;
    case "unknown":
      if (
        !Number.isInteger(message.id) ||
        message.id < 0 ||
        message.id > 0xff
      ) {
        throw new RangeError("message id must be an unsigned 8-bit integer");
      }
      id = message.id;
      body = new Uint8Array(message.payload);
      break;
  }

  const payload = new Uint8Array(1 + body.length);
  payload[0] = id;
  payload.set(body, 1);
  return payload;
}

// ── Decode ──────────────────────────────────────────────────────────────

/** Decode one complete length-prefixed peer wire frame. */
export function decodeMessage(frame: Uint8Array): PeerMessage {
  if (frame.length < 4) {
    throw new ProtocolError("peer message is missing its length prefix");
  }
  const length = new DataView(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength,
  ).getUint32(0);

  if (length !== frame.length - 4) {
    throw new ProtocolError(
      `peer message length prefix is ${length}, received ${frame.length - 4}`,
    );
  }
  if (length === 0) return { type: "keepAlive" };
  return decodeMessagePayload(frame.subarray(4));
}

/** Decode the bytes after a non-zero peer message length prefix. */
export function decodeMessagePayload(payload: Uint8Array): PeerMessage {
  if (payload.length === 0) {
    throw new ProtocolError("non-keepalive message has no message ID");
  }
  const id = payload[0]!;
  const body = payload.subarray(1);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);

  switch (id) {
    case PeerMessageId.Choke:
      assertLength("choke", body, 0);
      return { type: "choke" };
    case PeerMessageId.Unchoke:
      assertLength("unchoke", body, 0);
      return { type: "unchoke" };
    case PeerMessageId.Interested:
      assertLength("interested", body, 0);
      return { type: "interested" };
    case PeerMessageId.NotInterested:
      assertLength("not interested", body, 0);
      return { type: "notInterested" };
    case PeerMessageId.Have:
      assertLength("have", body, 4);
      return { type: "have", pieceIndex: view.getUint32(0) };
    case PeerMessageId.Bitfield:
      return { type: "bitfield", bitfield: new Uint8Array(body) };
    case PeerMessageId.Request:
      return { type: "request", ...decodeBlockRequest("request", body) };
    case PeerMessageId.Piece:
      if (body.length < 8) {
        throw new ProtocolError("piece message must contain a header");
      }
      return {
        type: "piece",
        pieceIndex: view.getUint32(0),
        begin: view.getUint32(4),
        block: body.slice(8),
      };
    case PeerMessageId.Cancel:
      return { type: "cancel", ...decodeBlockRequest("cancel", body) };
    case PeerMessageId.Port:
      assertLength("port", body, 2);
      return { type: "port", port: view.getUint16(0) };
    case PeerMessageId.SuggestPiece:
      assertLength("suggest piece", body, 4);
      return { type: "suggestPiece", pieceIndex: view.getUint32(0) };
    case PeerMessageId.HaveAll:
      assertLength("have all", body, 0);
      return { type: "haveAll" };
    case PeerMessageId.HaveNone:
      assertLength("have none", body, 0);
      return { type: "haveNone" };
    case PeerMessageId.RejectRequest:
      return {
        type: "rejectRequest",
        ...decodeBlockRequest("reject request", body),
      };
    case PeerMessageId.AllowedFast:
      assertLength("allowed fast", body, 4);
      return { type: "allowedFast", pieceIndex: view.getUint32(0) };
    case PeerMessageId.Extended:
      if (body.length < 1) {
        throw new ProtocolError(
          "extended message must contain an extension ID",
        );
      }
      return {
        type: "extended",
        extensionId: body[0]!,
        payload: body.slice(1),
      };
    case PeerMessageId.HashRequest:
      return {
        type: "hashRequest",
        ...decodeHashRequest("hash request", body),
      };
    case PeerMessageId.Hashes: {
      if (body.length < 80 || (body.length - 48) % 32 !== 0) {
        throw new ProtocolError(
          "hashes message must contain a 48-byte header and complete SHA-256 hashes",
        );
      }
      return {
        type: "hashes",
        ...decodeHashRequest("hashes", body.subarray(0, 48)),
        hashes: body.slice(48),
      };
    }
    case PeerMessageId.HashReject:
      return {
        type: "hashReject",
        ...decodeHashRequest("hash reject", body),
      };
    default:
      return { type: "unknown", id, payload: new Uint8Array(body) };
  }
}

// ── Block request helpers ───────────────────────────────────────────────

function encodeBlockRequest(request: BlockRequest): Uint8Array {
  const body = new Uint8Array(12);
  const view = new DataView(body.buffer);
  view.setUint32(0, asUint32(request.pieceIndex, "pieceIndex"));
  view.setUint32(4, asUint32(request.begin, "begin"));
  view.setUint32(8, asUint32(request.length, "length"));
  if (request.length === 0) {
    throw new RangeError("length must be greater than zero");
  }
  return body;
}

function decodeBlockRequest(name: string, body: Uint8Array): BlockRequest {
  assertLength(name, body, 12);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const length = view.getUint32(8);
  if (length === 0) {
    throw new ProtocolError(`${name} length must be greater than zero`);
  }
  return {
    pieceIndex: view.getUint32(0),
    begin: view.getUint32(4),
    length,
  };
}

// ── BEP 52 hash request helpers ─────────────────────────────────────────

function encodeHashRequest(request: HashRequestFields): Uint8Array {
  validateHashRequest(request, RangeError);
  const body = new Uint8Array(48);
  body.set(request.piecesRoot);
  const view = new DataView(body.buffer);
  view.setUint32(32, request.baseLayer);
  view.setUint32(36, request.index);
  view.setUint32(40, request.length);
  view.setUint32(44, request.proofLayers);
  return body;
}

function decodeHashRequest(name: string, body: Uint8Array): HashRequestFields {
  assertLength(name, body, 48);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const request: HashRequestFields = {
    piecesRoot: body.slice(0, 32),
    baseLayer: view.getUint32(32),
    index: view.getUint32(36),
    length: view.getUint32(40),
    proofLayers: view.getUint32(44),
  };
  validateHashRequest(request, ProtocolError);
  return request;
}

function validateHashRequest(
  request: HashRequestFields,
  ErrorType: typeof RangeError | typeof ProtocolError,
): void {
  if (request.piecesRoot.length !== 32) {
    throw new ErrorType("piecesRoot must contain 32 bytes");
  }
  for (
    const [name, value] of [
      ["baseLayer", request.baseLayer],
      ["index", request.index],
      ["length", request.length],
      ["proofLayers", request.proofLayers],
    ] as const
  ) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new ErrorType(`${name} must be an unsigned 32-bit integer`);
    }
  }
  if (
    request.length < 2 || request.length > 512 ||
    (request.length & (request.length - 1)) !== 0
  ) {
    throw new ErrorType(
      "hash request length must be a power of two from 2 to 512",
    );
  }
  if (request.index % request.length !== 0) {
    throw new ErrorType("hash request index must be a multiple of length");
  }
}

// ── Generic helpers ─────────────────────────────────────────────────────

function uint32Body(value: number, name: string): Uint8Array {
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, asUint32(value, name));
  return body;
}

function asUint32(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
  return value;
}

function assertLength(name: string, body: Uint8Array, expected: number): void {
  if (body.length !== expected) {
    throw new ProtocolError(
      `${name} message body must contain ${expected} bytes`,
    );
  }
}
