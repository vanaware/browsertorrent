import { currentMicroseconds } from "@src/util.ts";
import type { UtpConn } from "@src/utp_conn.ts";
import { UtpSelectiveAckExtension } from "@src/utp_ext_sack.ts";
import { UtpExtensionBits } from "@src/utp_ext_bits.ts";
import { UtpContext } from "@src/utp_context.ts";
import type { Logger } from "@src/logger.ts";

export enum UtpPacketType {
  ST_DATA = 0,
  ST_FIN = 1,
  ST_STATE = 2,
  ST_RESET = 3,
  ST_SYN = 4,
}

export enum ExtensionType {
  SelectiveAcknowledgement = 1,
  ExtensionBits = 2,
}

export interface Extension {
  type: ExtensionType;
  toBytes(): Uint8Array;
}

/** A BEP 29 uTP packet and its extension chain. */
export class UtpPacket {
  static readonly HEADER_SIZE = 20;
  static readonly EXTENSION_HEADER_SIZE = 2;
  static readonly MIN_PACKET_SIZE = UtpPacket.HEADER_SIZE;
  static readonly MAX_PACKET_SIZE = 1 << 16;

  // type 4 bits
  type: UtpPacketType = UtpPacketType.ST_SYN;
  // version 4 bits
  version: number = 1;
  // Zero means no extension header; DATA payload may still follow directly.
  extension: number = 0;
  // connection id 16 bits(2 bytes)
  connId!: number;
  // timestamp 32 bits(4 bytes), milliseconds since the connection was established
  timestampMicroseconds: number = -1;
  // timestamp difference 32 bits(4 bytes), milliseconds since the last packet was sent
  timestampDifferenceMicroseconds: number = 0;
  // window size 32 bits(4 bytes), the number of bytes that can be sent
  windowSize: number = 0;
  // sequence number 16 bits(2 bytes), the sequence number of the packet
  seqNr: number = 0;
  // acknowledgment number 16 bits(2 bytes), the sequence number of the last packet received
  ackNr: number = 0;
  // extensions
  extensions: Extension[] = [];
  // payload
  data?: Uint8Array;
  logger: Logger;
  constructor(context: UtpContext = new UtpContext()) {
    this.logger = context.getLogger("UTP_PACKET");
  }

  get sackExtension(): UtpSelectiveAckExtension | undefined {
    return this.extensions.find(
      (ext) => ext.type === ExtensionType.SelectiveAcknowledgement,
    ) as UtpSelectiveAckExtension;
  }

  get extensionBitsExtension(): UtpExtensionBits | undefined {
    return this.extensions.find(
      (ext) => ext.type === ExtensionType.ExtensionBits,
    ) as UtpExtensionBits;
  }

  get extensionPayloadLength(): number {
    return (
      UtpPacket.EXTENSION_HEADER_SIZE * this.extensions.length +
      this.extensions.reduce((acc, ext) => acc + ext.toBytes().length, 0)
    );
  }

  static fromBytes(
    buffer: Uint8Array,
    context: UtpContext = new UtpContext(),
  ): UtpPacket {
    if (buffer.length < UtpPacket.MIN_PACKET_SIZE) {
      throw new TypeError(
        `uTP packet must contain at least ${UtpPacket.MIN_PACKET_SIZE} bytes`,
      );
    }

    // Copy the datagram so parsed payload slices cannot alias caller memory.
    const bytes = new Uint8Array(buffer);
    const dataView = new DataView(bytes.buffer);
    const packet = new UtpPacket(context);
    packet.type = dataView.getUint8(0) >> 4;
    packet.version = dataView.getUint8(0) & 0b1111;
    packet.extension = dataView.getUint8(1);
    packet.connId = dataView.getUint16(2);
    packet.timestampMicroseconds = dataView.getUint32(4);
    packet.timestampDifferenceMicroseconds = dataView.getUint32(8);
    packet.windowSize = dataView.getUint32(12);
    packet.seqNr = dataView.getUint16(16);
    packet.ackNr = dataView.getUint16(18);

    let extensionType = packet.extension;
    let offset = this.HEADER_SIZE;

    // Each extension header points to the following extension, not itself.
    while (extensionType > 0) {
      if (offset + this.EXTENSION_HEADER_SIZE > bytes.length) {
        throw new TypeError("Truncated uTP extension header");
      }

      const nextExtensionType = dataView.getUint8(offset);
      const extensionLength = dataView.getUint8(offset + 1);
      const extensionEnd = offset + this.EXTENSION_HEADER_SIZE +
        extensionLength;
      if (extensionEnd > bytes.length) {
        throw new TypeError("Truncated uTP extension payload");
      }

      const payload = bytes.slice(
        offset + this.EXTENSION_HEADER_SIZE,
        extensionEnd,
      );

      if (extensionType === ExtensionType.SelectiveAcknowledgement) {
        const extension = UtpSelectiveAckExtension.createFromBytes(
          packet.ackNr,
          payload,
        );
        packet.extensions.push(extension);
      } else if (extensionType === ExtensionType.ExtensionBits) {
        const extension = UtpExtensionBits.createFromBytes(payload);
        packet.extensions.push(extension);
      } else {
        packet.logger.debug("unsupported extension type:", extensionType);
      }

      offset = extensionEnd;
      extensionType = nextExtensionType;
    }

    if (offset < bytes.length) {
      packet.data = bytes.slice(offset);
    }

    return packet;
  }

  toBytes(): Uint8Array {
    const buffer = new Uint8Array(this.byteLength);
    const dataView = new DataView(buffer.buffer);
    dataView.setUint8(0, (this.type << 4) | this.version);
    dataView.setUint8(1, this.extension);
    dataView.setUint16(2, this.connId);
    dataView.setUint32(4, this.timestampMicroseconds);
    dataView.setUint32(8, this.timestampDifferenceMicroseconds);
    dataView.setUint32(12, this.windowSize);
    dataView.setUint16(16, this.seqNr);
    dataView.setUint16(18, this.ackNr);

    let offset = UtpPacket.HEADER_SIZE;

    if (this.extensions.length > 0) {
      const EXT_HEADER_SIZE = 2;
      for (let i = 0; i < this.extensions.length; i++) {
        const ext = this.extensions[i];
        const nextExtType = i + 1 < this.extensions.length
          ? this.extensions[i + 1].type
          : 0;
        const payload = ext.toBytes();
        const payloadLength = payload.length;
        dataView.setUint8(offset, nextExtType); // next extension type,8 bits,1 byte
        dataView.setUint8(offset + 1, payloadLength); // extension length,8 bits,1 byte
        buffer.set(payload, offset + EXT_HEADER_SIZE);
        offset += EXT_HEADER_SIZE + payloadLength;
      }
    }

    if (this.data) {
      buffer.set(this.data, offset);
    }

    return buffer;
  }

  /**
   * include header and payload(extensions and data)
   *
   * @returns
   */
  get byteLength(): number {
    // 0               8               16
    // +---------------+---------------+
    // | extension     | len           |
    // +---------------+---------------+
    const EXTENSION_HEADER_SIZE = 2;

    const extHeaderLength = EXTENSION_HEADER_SIZE * this.extensions.length;

    const extPayloadLength = this.extensions.reduce(
      (acc, ext) => acc + ext.toBytes().length,
      0,
    );

    const extLength = extHeaderLength + extPayloadLength;

    const utpPacketPayloadLength = extLength + (this.data?.length ?? 0);

    return UtpPacket.HEADER_SIZE + utpPacketPayloadLength;
  }

  static createSynPacket(conn: UtpConn): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_SYN;
    packet.connId = conn.receiveConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = 0;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.windowSize = 0;
    packet.extension = ExtensionType.ExtensionBits;
    packet.extensions.push(UtpExtensionBits.create());
    return packet;
  }

  /**
   * create a ack packet
   * @param conn UtpConn
   * @param sack SelectiveAckExtension, optional
   * @returns
   */
  static createAckPacket(
    conn: UtpConn,
    sack?: UtpSelectiveAckExtension,
  ): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_STATE;
    packet.extension = sack ? ExtensionType.SelectiveAcknowledgement : 0;
    packet.connId = conn.sendConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = conn.acknowledgementNumber;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.windowSize = conn.receiveWindowBytes;

    if (sack) {
      packet.extensions.push(sack);
    }
    return packet;
  }

  /**
   * @param conn
   * @param data
   * @returns
   */
  static createDataPacket(conn: UtpConn, data: Uint8Array): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_DATA;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.seqNr = conn.sequenceNumber;
    packet.connId = conn.sendConnectionId;
    packet.ackNr = conn.acknowledgementNumber;
    packet.windowSize = conn.receiveWindowBytes;
    // Writes may reuse their source buffer before this packet is acknowledged.
    packet.data = new Uint8Array(data);
    conn.sequenceNumber++;
    return packet;
  }

  static createFinPacket(conn: UtpConn): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_FIN;
    packet.connId = conn.sendConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = conn.acknowledgementNumber;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.windowSize = conn.receiveWindowBytes;
    conn.sequenceNumber++;
    return packet;
  }

  static createResetPacket(conn: UtpConn): UtpPacket {
    const packet = new UtpPacket(conn.utp.context);
    packet.type = UtpPacketType.ST_RESET;
    packet.connId = conn.sendConnectionId;
    packet.seqNr = conn.sequenceNumber;
    packet.ackNr = conn.acknowledgementNumber;
    packet.timestampMicroseconds = currentMicroseconds();
    packet.timestampDifferenceMicroseconds = currentMicroseconds() -
      conn.lastPacketTimestampMicroseconds;
    packet.windowSize = 0;
    packet.extension = 0;
    return packet;
  }

  static isPacket(
    buffer: Uint8Array,
    context: UtpContext = new UtpContext(),
  ): boolean {
    const packet = new UtpPacket(context);
    if (buffer.length < UtpPacket.MIN_PACKET_SIZE) {
      packet.logger.debug("not a μTP packet, the length is less than 20 bytes");
      return false;
    }

    if (buffer.length > UtpPacket.MAX_PACKET_SIZE) {
      packet.logger.debug("not a μTP packet, the length is greater than 64KB");
      return false;
    }

    let decodedPacket: UtpPacket;
    try {
      decodedPacket = UtpPacket.fromBytes(buffer, context);
    } catch (error) {
      packet.logger.debug(`not a μTP packet: ${error}`);
      return false;
    }

    if (decodedPacket.version !== 1) {
      packet.logger.debug("not a μTP packet, the version is not 1");
      return false;
    }

    if (decodedPacket.type < 0 || decodedPacket.type > 4) {
      packet.logger.debug("not a μTP packet, the type is invalid");
      return false;
    }

    if (decodedPacket.extension < 0 || decodedPacket.extension > 255) {
      packet.logger.debug("not a μTP packet, the extension is invalid");
      return false;
    }

    if (decodedPacket.connId < 0 || decodedPacket.connId > 65535) {
      packet.logger.debug("not a μTP packet, the connectionId is invalid");
      return false;
    }

    if (decodedPacket.timestampMicroseconds < 0) {
      packet.logger.debug("not a μTP packet, the timestamp is invalid");
      return false;
    }

    if (decodedPacket.timestampDifferenceMicroseconds < 0) {
      packet.logger.debug(
        "not a μTP packet, the timestampDifference is invalid",
      );
      return false;
    }

    if (decodedPacket.windowSize < 0) {
      packet.logger.debug("not a μTP packet, the windowSize is invalid");
      return false;
    }

    if (decodedPacket.seqNr < 0 || decodedPacket.seqNr > 65535) {
      packet.logger.debug("not a μTP packet, the seqNumber is invalid");
      return false;
    }

    if (decodedPacket.ackNr < 0 || decodedPacket.ackNr > 65535) {
      packet.logger.debug("not a μTP packet, the ackNumber is invalid");
      return false;
    }

    return true;
  }

  /**
   * toString
   * @description This method is used to convert the packet to a string
   */
  toString(): string {
    return `{
  type: ${this.type}(${UtpPacketType[this.type]}),
  version: ${this.version},
  extension: ${this.extension},
  connectionId: ${this.connId},
  timestamp: ${this.timestampMicroseconds},
  timestampDifference: ${this.timestampDifferenceMicroseconds},
  windowSize: ${this.windowSize},
  seqNumber: ${this.seqNr},
  ackNumber: ${this.ackNr},
  data: ${this.data?.length},
}`;
  }
}
