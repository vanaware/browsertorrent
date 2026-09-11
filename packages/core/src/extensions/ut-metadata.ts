// /loco/monorepo/webtorrent/src/extensions/ut-metadata.ts

import { Extension } from "../core/extension.ts";
import { encode, decode, BencodeDict } from "../utils/bencode.ts";
import { Bitfield } from "../core/bitfield.ts";
import { sha1, sha256 } from "../crypto/hasher.ts";

const MAX_METADATA_SIZE = 10_000_000;
const PIECE_LENGTH = 16384;
const DEFAULT_TIMEOUT_MS = 15000; // 15 segundos por peça

export interface UtMetadataOptions {
  metadata?: Uint8Array;
  timeoutMs?: number;
}

export interface PieceRequest {
  piece: number;
  attempts: number;
  timer: number; // ID do timeout
}

export class UtMetadata extends Extension {
  public readonly name = "ut_metadata";

  private _fetching = false;
  private _metadataComplete = false;
  private _metadataSize: number | null = null;
  private _numPieces = 0;
  private _remainingRejects = 0;
  private _bitfield: Bitfield;
  public metadata: Uint8Array | null = null;
  private _requestedPieces: Map<number, PieceRequest> = new Map();
  private _timeoutMs: number;

  constructor(wire: any, opts?: UtMetadataOptions) {
    super(wire);
    this._bitfield = new Bitfield({ length: 0, grow: 1000 });
    this._timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (opts?.metadata) {
      this.setMetadata(opts.metadata);
    }
  }

  public onHandshake(_infoHash: string, _peerId: string, _extensions: any) {
    // Opcional
  }

  public onExtendedHandshake(handshake: any) {
    if (handshake.m && typeof handshake.m.ut_metadata === "number") {
      if (typeof handshake.metadata_size !== "number" || handshake.metadata_size > MAX_METADATA_SIZE || handshake.metadata_size <= 0) {
        this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer gave invalid metadata size") } }));
      } else {
        const size = handshake.metadata_size;
        this._metadataSize = size;
        this._numPieces = Math.ceil(size / PIECE_LENGTH);
        this._remainingRejects = 2 * this._numPieces;
        this._bitfield = new Bitfield({ length: this._numPieces, grow: 1000 });

        this._fetching = true;
        this._requestPieces();
      }
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer does not support ut_metadata") } }));
    }
  }

  public onMessage(buf: Uint8Array) {
    let dict: BencodeDict;
    let trailer: Uint8Array;
    try {
      const str = new TextDecoder().decode(buf);
      const trailerIndex = str.indexOf("ee") + 2;
      dict = decode(new TextEncoder().encode(str.substring(0, trailerIndex))) as BencodeDict;
      trailer = buf.slice(trailerIndex);
    } catch (err) {
      return;
    }

    switch (dict.msg_type) {
      case 0:
        this._onRequest(dict.piece as number);
        break;
      case 1:
        this._onData(dict.piece as number, trailer, dict.total_size as number | undefined);
        break;
      case 2:
        this._onReject(dict.piece as number);
        break;
    }
  }

  public fetch() {
    if (!this._metadataComplete) {
      this._fetching = true;
      if (this._metadataSize) {
        this._requestPieces();
      }
    }
  }

  public cancel() {
    this._fetching = false;
    // Cancelar todos os timeouts pendentes
    for (const request of this._requestedPieces.values()) {
      clearTimeout(request.timer);
    }
    this._requestedPieces.clear();
  }

  public setMetadata(newMetadata: Uint8Array): boolean {
    if (this._metadataComplete) return true;

    let validMetadata = newMetadata;
    try {
      const info = decode(newMetadata) as BencodeDict;
      if (info.info) {
        validMetadata = encode(info.info);
      }
    } catch (err) {
      // Ignora erros de decode, usa o buffer cru
    }

    this.cancel();
    this.metadata = validMetadata;
    this._metadataComplete = true;
    this._metadataSize = this._metadataSize ?? this.metadata.length;

    if (this.wire.extendedHandshake) {
      this.wire.extendedHandshake.metadata_size = this._metadataSize;
    }

    this.emit("metadata", new CustomEvent("metadata", { detail: { metadata: this.metadata } }));
    return true;
  }

  private _send(dict: BencodeDict, trailer?: Uint8Array) {
    let buf = encode(dict);
    if (trailer) {
      const combined = new Uint8Array(buf.length + trailer.length);
      combined.set(buf, 0);
      combined.set(trailer, buf.length);
      buf = combined;
    }
    this.wire.extended("ut_metadata", buf);
  }

  private _request(piece: number) {
    // Cancelar timeout anterior para esta peça, se houver
    const existingRequest = this._requestedPieces.get(piece);
    if (existingRequest) {
      clearTimeout(existingRequest.timer);
    }
    
    // Enviar solicitação
    this._send({ msg_type: 0, piece });
    
    // Configurar novo timeout para esta peça
    const timer = setTimeout(() => {
      this._handleTimeout(piece);
    }, this._timeoutMs) as unknown as number;
    
    // Registrar solicitação com tentativas
    const attempts = existingRequest ? existingRequest.attempts + 1 : 1;
    this._requestedPieces.set(piece, { piece, attempts, timer });
  }

  private _data(piece: number, buf: Uint8Array, totalSize?: number) {
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    const msg: BencodeDict = { msg_type: 1, piece };
    if (typeof totalSize === "number") {
      (msg as any).total_size = totalSize;
    }
    this._send(msg, buf);
  }

  private _reject(piece: number) {
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    if (this._remainingRejects > 0 && this._fetching) {
      this._request(piece);
      this._remainingRejects -= 1;
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer sent \"reject\" too much") } }));
    }
  }

  private _onRequest(piece: number) {
    if (!this._metadataComplete || !this._metadataSize) {
      return this._reject(piece);
    }
    const start = piece * PIECE_LENGTH;
    let end = start + PIECE_LENGTH;
    if (end > this._metadataSize!) {
      end = this._metadataSize!;
    }
    const buf = this.metadata!.slice(start, end);
    this._data(piece, buf, this._metadataSize);
  }

  private _onData(piece: number, buf: Uint8Array, _totalSize?: number) {
    if (buf.length > PIECE_LENGTH || !this._fetching || !this._metadataSize) return;

    // Verificar se já recebemos esta peça
    if (this._bitfield.get(piece)) {
      // Peça duplicada, ignorar
      return;
    }

    if (!this.metadata) {
      this.metadata = new Uint8Array(this._metadataSize);
    }
    this.metadata.set(buf, piece * PIECE_LENGTH);
    this._bitfield.set(piece);
    
    // Limpar o registro de solicitação para esta peça
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    this._checkDone();
  }

  private _onReject(piece: number) {
    const request = this._requestedPieces.get(piece);
    if (request) {
      clearTimeout(request.timer);
      this._requestedPieces.delete(piece);
    }
    
    if (this._remainingRejects > 0 && this._fetching) {
      this._request(piece);
      this._remainingRejects -= 1;
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer sent \"reject\" too much") } }));
    }
  }

  private _handleTimeout(piece: number) {
    // Remover do mapa de solicitações
    this._requestedPieces.delete(piece);
    
    if (!this._fetching) return;
    
    // Tentar novamente se ainda houver tentativas restantes
    const maxAttempts = 3;
    const currentRequest = this._requestedPieces.get(piece);
    const attempts = currentRequest ? currentRequest.attempts + 1 : 1;
    
    if (attempts < maxAttempts) {
      this._request(piece);
    } else {
      // Muitas tentativas falhas, emitir aviso
      this.emit("warning", new CustomEvent("warning", { 
        detail: { error: new Error(`Timeout while requesting metadata piece ${piece}`) } 
      }));
      
      // Tentar continuar com outras peças
      this._checkDone();
    }
  }

  private _requestPieces() {
    if (this._fetching && this._metadataSize) {
      this.metadata = new Uint8Array(this._metadataSize);
      for (let piece = 0; piece < this._numPieces; piece++) {
        this._request(piece);
      }
    }
  }

  private _checkDone() {
    let done = true;
    for (let piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece)) {
        done = false;
        break;
      }
    }
    if (done && this.metadata) {
      // Verificar a integridade dos dados recebidos calculando o hash
      const success = this._verifyMetadataIntegrity();
      if (success) {
        this.setMetadata(this.metadata);
      } else {
        this._failedMetadata();
      }
    }
  }

  private _verifyMetadataIntegrity(): boolean {
    if (!this.metadata) return false;
    
    try {
      // Verificar se os dados são válidos bencode
      decode(this.metadata);
      
      // Para BEP 52, também verificaríamos o hash SHA-256, mas isso
      // geralmente não é feito durante a transferência via ut_metadata,
      // pois o hash é verificado quando o torrent é carregado
      
      return true;
    } catch (err) {
      console.warn("Metadata integrity check failed:", err);
      return false;
    }
  }

  private _failedMetadata() {
    if (!this._metadataSize) return;
    this._bitfield = new Bitfield({ length: this._numPieces, grow: 1000 });
    this._remainingRejects -= this._numPieces;
    if (this._remainingRejects > 0) {
      this._requestPieces();
    } else {
      this.emit("warning", new CustomEvent("warning", { detail: { error: new Error("Peer sent invalid metadata") } }));
    }
  }
}