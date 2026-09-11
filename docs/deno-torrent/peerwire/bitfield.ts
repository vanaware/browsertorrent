import { BitArray } from "@deno-torrent/toolkit";
import { PeerWireProtocolError } from "@src/errors.ts";

/** Mutable, MSB-first BitTorrent piece bitfield. */
export class Bitfield {
  readonly pieceCount: number;
  #bits: BitArray;

  constructor(pieceCount: number, bytes?: Uint8Array) {
    if (!Number.isSafeInteger(pieceCount) || pieceCount < 0) {
      throw new RangeError("pieceCount must be a non-negative safe integer");
    }

    const byteLength = Math.ceil(pieceCount / 8);
    if (bytes && bytes.length !== byteLength) {
      throw new PeerWireProtocolError(
        `bitfield for ${pieceCount} pieces must contain ${byteLength} bytes`,
      );
    }

    this.pieceCount = pieceCount;
    this.#bits = BitArray.fromUint8Array(bytes ?? new Uint8Array(byteLength));
    this.#validateSpareBits();
  }

  static fromBytes(pieceCount: number, bytes: Uint8Array): Bitfield {
    return new Bitfield(pieceCount, bytes);
  }

  get byteLength(): number {
    return this.#bits.length / 8;
  }

  get completedCount(): number {
    let count = 0;
    for (let index = 0; index < this.pieceCount; index++) {
      if (this.has(index)) count++;
    }
    return count;
  }

  has(index: number): boolean {
    this.#assertIndex(index);
    return this.#bits.getBit(index, "msb0");
  }

  set(index: number, available = true): void {
    this.#assertIndex(index);
    this.#bits.setBit(index, available, "msb0");
  }

  clear(): void {
    this.#bits = BitArray.fromUint8Array(new Uint8Array(this.byteLength));
  }

  toBytes(): Uint8Array {
    return this.#bits.bytes;
  }

  *availablePieces(): IterableIterator<number> {
    for (let index = 0; index < this.pieceCount; index++) {
      if (this.has(index)) yield index;
    }
  }

  #assertIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.pieceCount) {
      throw new RangeError(`piece index ${index} is out of range`);
    }
  }

  #validateSpareBits(): void {
    const remainder = this.pieceCount & 7;
    if (remainder === 0 || this.byteLength === 0) return;
    const bytes = this.#bits.bytes;
    const spareMask = (1 << (8 - remainder)) - 1;
    if ((bytes[bytes.length - 1] & spareMask) !== 0) {
      throw new PeerWireProtocolError("bitfield contains non-zero spare bits");
    }
  }
}
