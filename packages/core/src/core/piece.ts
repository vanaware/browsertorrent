// /loco/monorepo/webtorrent/src/core/piece.ts

/**
 * Represents a single piece within a torrent.
 *
 * Exposed in the browser API as `torrent.files[0].pieces[i]` etc.
 * Each piece carries its index, length, byte offset inside the
 * torrent stream, and optional hash verification state.
 */
export class Piece {
  /** The zero-based piece index in the torrent. */
  readonly index: number;
  /** The byte length of this piece (may differ for the last piece). */
  readonly length: number;
  /** The byte offset of this piece inside the concatenated torrent stream. */
  readonly offset: number;
  /** Whether the piece hash has been verified (optional, set by consumer). */
  hash?: Uint8Array;

  constructor(index: number, length: number, offset: number) {
    this.index = index;
    this.length = length;
    this.offset = offset;
  }

  /**
   * Returns `true` if this piece is partially or fully downloaded.
   * The `downloaded` flag is computed by the consumer (the `Bitfield`
   * tracks the actual state).
   */
  get downloaded(): boolean {
    return !!this.hash;
  }

  /**
   * Returns `true` if the piece is missing (not yet downloaded).
   */
  get missing(): boolean {
    return !this.hash;
  }

  /**
   * Returns a human-readable description of this piece.
   */
  toString(): string {
    return `Piece(index=${this.index}, length=${this.length}, offset=${this.offset}, ${this.missing ? "missing" : "downloaded"})`;
  }
}
