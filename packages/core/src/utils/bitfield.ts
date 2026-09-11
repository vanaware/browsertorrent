// /loco/monorepo/webtorrent/src/core/bitfield.ts

import { BitfieldError } from "../utils/errors.ts";

export interface BitfieldOptions {
  /** Tamanho inicial do bitfield (número de bits) */
  length: number;
  /** Se true, permite crescimento dinâmico quando um índice fora do range é acessado */
  grow?: boolean | number;
}

/**
 * Estrutura de dados eficiente para rastrear o estado de peças (pieces).
 * Suporta crescimento dinâmico opcional para casos onde o tamanho final não é conhecido.
 */
export class Bitfield {
  private buffer: Uint8Array;
  private _length: number;
  private grow: boolean | number;

  constructor(length: number | BitfieldOptions, opts?: { grow?: boolean | number }) {
    if (typeof length === "object") {
      this._length = length.length;
      this.grow = length.grow ?? false;
    } else {
      this._length = length;
      this.grow = opts?.grow ?? false;
    }

    const byteLength = Math.ceil(this._length / 8);
    this.buffer = new Uint8Array(byteLength);
  }

  get length(): number {
    return this._length;
  }

  /**
   * Verifica se o bit no índice especificado está marcado.
   */
  get(index: number): boolean {
    if (index < 0) return false;
    
    // Se grow está habilitado e o índice está fora do range, retorna false
    if (index >= this._length) {
      if (this.grow === false) return false;
      return false; // Bit fora do range não está marcado
    }

    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (this.buffer[byteIndex]! & (128 >> bitIndex)) !== 0;
  }

  /**
   * Marca o bit no índice especificado.
   */
  set(index: number): void {
    if (index < 0) {
      throw new BitfieldError("Cannot set negative index", "NEGATIVE_INDEX");
    }

    // Crescimento dinâmico se necessário
    if (index >= this._length) {
      if (this.grow === false) {
        throw new BitfieldError(
          `Index ${index} is out of range (length: ${this._length})`,
          "INDEX_OUT_OF_RANGE"
        );
      }

      const newLength = typeof this.grow === "number"
        ? Math.max(this._length + this.grow, index + 1)
        : index + 1;

      this._resize(newLength);
    }

    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! |= (128 >> bitIndex);
  }

  /**
   * Desmarca o bit no índice especificado.
   */
  unset(index: number): void {
    if (index < 0 || index >= this._length) return;

    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.buffer[byteIndex]! &= ~(128 >> bitIndex);
  }

  /**
   * Conta quantos bits estão marcados.
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.get(i)) count++;
    }
    return count;
  }

  /**
   * Retorna uma cópia do buffer interno.
   */
  toBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Redimensiona o bitfield para um novo tamanho.
   */
  private _resize(newLength: number): void {
    const newByteLength = Math.ceil(newLength / 8);
    const newBuffer = new Uint8Array(newByteLength);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    this._length = newLength;
  }
}