import {
  BITTORRENT_PROTOCOL,
  HANDSHAKE_LENGTH,
  HandshakeExtension,
  PEER_ID_LENGTH,
} from "@src/constants.ts";
import { PeerWireProtocolError } from "@src/errors.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const protocolBytes = textEncoder.encode(BITTORRENT_PROTOCOL);

export interface PeerHandshake {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  reserved: Uint8Array;
  extensions: ReadonlySet<HandshakeExtension>;
}

export interface EncodeHandshakeOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array | string;
  reserved?: Uint8Array;
  extensions?: Iterable<HandshakeExtension>;
}

export function encodeHandshake(options: EncodeHandshakeOptions): Uint8Array {
  assertTwentyBytes("infoHash", options.infoHash);
  const peerId = typeof options.peerId === "string"
    ? textEncoder.encode(options.peerId)
    : options.peerId;
  assertTwentyBytes("peerId", peerId);

  const reserved = options.reserved
    ? new Uint8Array(options.reserved)
    : new Uint8Array(8);
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  for (const extension of options.extensions ?? []) {
    setExtension(reserved, extension, true);
  }

  const bytes = new Uint8Array(HANDSHAKE_LENGTH);
  bytes[0] = protocolBytes.length;
  bytes.set(protocolBytes, 1);
  bytes.set(reserved, 20);
  bytes.set(options.infoHash, 28);
  bytes.set(peerId, 48);
  return bytes;
}

export function decodeHandshake(bytes: Uint8Array): PeerHandshake {
  if (bytes.length !== HANDSHAKE_LENGTH) {
    throw new PeerWireProtocolError(
      `peer handshake must contain ${HANDSHAKE_LENGTH} bytes`,
    );
  }
  const protocolLength = bytes[0];
  const protocol = textDecoder.decode(bytes.subarray(1, 1 + protocolLength));
  if (
    protocolLength !== protocolBytes.length ||
    protocol !== BITTORRENT_PROTOCOL
  ) {
    throw new PeerWireProtocolError(`unsupported peer protocol: ${protocol}`);
  }

  const reserved = bytes.slice(20, 28);
  const extensions = new Set<HandshakeExtension>();
  for (const extension of Object.values(HandshakeExtension)) {
    if (hasExtension(reserved, extension)) extensions.add(extension);
  }

  return {
    infoHash: bytes.slice(28, 48),
    peerId: bytes.slice(48, 68),
    reserved,
    extensions,
  };
}

export function hasExtension(
  reserved: Uint8Array,
  extension: HandshakeExtension,
): boolean {
  if (reserved.length !== 8) return false;
  const [byte, mask] = extensionLocation(extension);
  return (reserved[byte] & mask) !== 0;
}

export function setExtension(
  reserved: Uint8Array,
  extension: HandshakeExtension,
  enabled: boolean,
): void {
  if (reserved.length !== 8) {
    throw new RangeError("reserved handshake field must contain 8 bytes");
  }
  const [byte, mask] = extensionLocation(extension);
  if (enabled) reserved[byte] |= mask;
  else reserved[byte] &= ~mask;
}

function extensionLocation(extension: HandshakeExtension): [number, number] {
  switch (extension) {
    case HandshakeExtension.Fast:
      return [7, 0x04];
    case HandshakeExtension.ExtensionProtocol:
      return [5, 0x10];
    case HandshakeExtension.Dht:
      return [7, 0x01];
    case HandshakeExtension.V2:
      return [7, 0x10];
  }
}

function assertTwentyBytes(name: string, bytes: Uint8Array): void {
  if (bytes.length !== PEER_ID_LENGTH) {
    throw new RangeError(`${name} must contain ${PEER_ID_LENGTH} bytes`);
  }
}
