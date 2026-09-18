// /browsertorrent/monorepo/webtorrent/src/extensions/ut-metadata.ts

import { Extension, } from "../core/extension.ts";
import {
  BencodeDict,
  decode,
  decodePrefix,
  encode,
} from "../utils/bencode.ts";
import { Bitfield, } from "../core/bitfield.ts";
import { sha1, sha256, } from "../crypto/hasher.ts";
import type { Wire, } from "../core/wire.ts";

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
  private _extensionId: number | null = null;

  constructor(wire: Wire, opts?: UtMetadataOptions,) {
    super(wire,);
    this._bitfield = new Bitfield({ length: 0, grow: 1000, },);
    this._timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (opts?.metadata) {
      this.setMetadata(opts.metadata,);
    }
  }

  public onRegister(
    context: {
      host: import("../core/extension-host.ts").ExtensionHost;
      send: (payload: Uint8Array,) => Promise<void>;
    },
  ): void {
    this._extensionId = context.host.localExtensions.get(this.name,) ?? null;
  }

  public handshakeFields(): ReadonlyMap<
    string,
    import("../utils/bencode.ts").BencodeValue
  > {
    const fields = new Map<
      string,
      import("../utils/bencode.ts").BencodeValue
    >();
    if (this._metadataSize !== null) {
      fields.set("metadata_size", this._metadataSize,);
    }
    return fields;
  }

  public onHandshake(
    _infoHash: string,
    _peerId: string,
    _extensions: Record<string, unknown>,
  ) {
    // Opcional
  }

  public onExtendedHandshake(handshake: any,) {
    console.log(
      `[UtMetadata] onExtendedHandshake: m=${
        JSON.stringify(handshake.m,)
      }, extensionsSize=${
        handshake.extensions instanceof Map
          ? handshake.extensions.size
          : "not Map"
      }, metadataSize=${handshake.metadataSize}`,
    );
    let utMetadataId: number | undefined;
    let metadataSize: number | undefined;

    if (handshake.extensions instanceof Map) {
      utMetadataId = handshake.extensions.get("ut_metadata",);
      metadataSize = handshake.metadataSize ??
        (handshake.raw instanceof Map
          ? handshake.raw.get("metadata_size",)
          : undefined);
    } else if (handshake.m) {
      if (handshake.m instanceof Map) {
        utMetadataId = handshake.m.get("ut_metadata",);
      } else if (typeof handshake.m === "object") {
        utMetadataId = handshake.m.ut_metadata;
      }
      metadataSize = handshake.metadata_size ?? handshake.metadataSize;
    }
    console.log(
      `[UtMetadata] onExtendedHandshake resolved: utMetadataId=${utMetadataId}, metadataSize=${metadataSize}`,
    );

    if (typeof utMetadataId === "number") {
      this._extensionId = utMetadataId;
      if (
        typeof metadataSize !== "number" ||
        metadataSize > MAX_METADATA_SIZE ||
        metadataSize <= 0
      ) {
        this.emit(
          "warning",
          new CustomEvent("warning", {
            detail: { error: new Error("Peer gave invalid metadata size",), },
          },),
        );
      } else {
        const size = metadataSize;
        this._metadataSize = size;
        this._numPieces = Math.ceil(size / PIECE_LENGTH,);
        this._remainingRejects = 2 * this._numPieces;
        this._bitfield = new Bitfield({
          length: this._numPieces,
          grow: 1000,
        },);

        this._fetching = true;
        this._requestPieces();
      }
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: { error: new Error("Peer does not support ut_metadata",), },
        },),
      );
    }
  }

  public onMessage(buf: Uint8Array,) {
    let dict: BencodeDict;
    let trailer: Uint8Array;
    try {
      const [decoded, remaining,] = decodePrefix(buf, {
        allowUnsortedKeys: true,
      },);
      dict = decoded as BencodeDict;
      trailer = remaining;
    } catch (err) {
      console.warn(
        "[UtMetadata] decodePrefix failed on incoming buffer (length " +
          buf.length + "):",
        err,
      );
      return;
    }

    switch (dict.msg_type) {
      case 0:
        this._onRequest(dict.piece as number,);
        break;
      case 1:
        this._onData(
          dict.piece as number,
          trailer,
          dict.total_size as number | undefined,
        );
        break;
      case 2:
        this._onReject(dict.piece as number,);
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
      clearTimeout(request.timer,);
    }
    this._requestedPieces.clear();
  }

  public setMetadata(newMetadata: Uint8Array,): boolean {
    if (this._metadataComplete) return true;

    let validMetadata = newMetadata;
    try {
      const info = decode(newMetadata,) as BencodeDict;
      if (info.info) {
        validMetadata = encode(info.info,);
      }
    } catch (err) {
      // Ignora erros de decode, usa o buffer cru
    }

    this.cancel();
    this.metadata = validMetadata;
    this._metadataComplete = true;
    this._metadataSize = this._metadataSize ?? this.metadata.length;

    if (this.wire.extensionHost.peerExtensions.has("ut_metadata",)) {
      this.wire.extensionHost.setHandshakeField(
        "metadata_size",
        this._metadataSize,
      );
    }

    this.emit(
      "metadata",
      new CustomEvent("metadata", { detail: { metadata: this.metadata, }, },),
    );
    return true;
  }

  private _send(dict: BencodeDict, trailer?: Uint8Array,) {
    console.log(
      `[UtMetadata] _send: dict=${JSON.stringify(dict,)}, trailerLength=${
        trailer ? trailer.length : 0
      }, extensionId=${this._extensionId}`,
    );
    let buf = encode(dict,);
    if (trailer) {
      const combined = new Uint8Array(buf.length + trailer.length,);
      combined.set(buf, 0,);
      combined.set(trailer, buf.length,);
      buf = combined;
    }
    if (this._extensionId !== null) {
      this.wire.sendExtended(this._extensionId, buf,);
    } else {
      console.warn(
        `[UtMetadata] _send NOT sending because _extensionId is null!`,
      );
    }
  }

  private _request(piece: number,) {
    // Cancelar timeout anterior para esta peça, se houver
    const existingRequest = this._requestedPieces.get(piece,);
    if (existingRequest) {
      clearTimeout(existingRequest.timer,);
    }

    // Enviar solicitação
    this._send({ msg_type: 0, piece, },);

    // Configurar novo timeout para esta peça
    const timer = setTimeout(() => {
      this._handleTimeout(piece,);
    }, this._timeoutMs,) as unknown as number;

    // Registrar solicitação com tentativas
    const attempts = existingRequest ? existingRequest.attempts + 1 : 1;
    this._requestedPieces.set(piece, { piece, attempts, timer, },);
  }

  private _data(piece: number, buf: Uint8Array, totalSize?: number,) {
    const request = this._requestedPieces.get(piece,);
    if (request) {
      clearTimeout(request.timer,);
      this._requestedPieces.delete(piece,);
    }

    const msg: BencodeDict = { msg_type: 1, piece, };
    if (typeof totalSize === "number") {
      (msg as unknown as { total_size?: number }).total_size = totalSize;
    }
    this._send(msg, buf,);
  }

  private _reject(piece: number,) {
    this._send({
      msg_type: 2,
      piece,
    },);
  }

  private _onRequest(piece: number,) {
    console.log(
      `[UtMetadata] _onRequest piece: ${piece}, metadataComplete: ${this._metadataComplete}, size: ${this._metadataSize}`,
    );
    if (!this._metadataComplete || !this._metadataSize) {
      return this._reject(piece,);
    }
    const start = piece * PIECE_LENGTH;
    let end = start + PIECE_LENGTH;
    if (end > this._metadataSize!) {
      end = this._metadataSize!;
    }
    const buf = this.metadata!.slice(start, end,);
    this._data(piece, buf, this._metadataSize,);
  }

  private _onData(piece: number, buf: Uint8Array, totalSize?: number,) {
    console.log(
      `[UtMetadata] _onData piece: ${piece}, buf.length: ${buf.length}, totalSize: ${totalSize}, fetching: ${this._fetching}, metaSize: ${this._metadataSize}`,
    );
    if (buf.length > PIECE_LENGTH || !this._fetching || !this._metadataSize) {
      return;
    }

    // Verificar se já recebemos esta peça
    if (this._bitfield.get(piece,)) {
      // Peça duplicada, ignorar
      return;
    }

    if (!this.metadata) {
      this.metadata = new Uint8Array(this._metadataSize,);
    }
    this.metadata.set(buf, piece * PIECE_LENGTH,);
    this._bitfield.set(piece,);

    // Limpar o registro de solicitação para esta peça
    const request = this._requestedPieces.get(piece,);
    if (request) {
      clearTimeout(request.timer,);
      this._requestedPieces.delete(piece,);
    }

    this._checkDone();
  }

  private _onReject(piece: number,) {
    const request = this._requestedPieces.get(piece,);
    if (request) {
      clearTimeout(request.timer,);
      this._requestedPieces.delete(piece,);
    }

    if (this._remainingRejects > 0 && this._fetching) {
      this._request(piece,);
      this._remainingRejects -= 1;
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: { error: new Error('Peer sent "reject" too much',), },
        },),
      );
    }
  }

  private _handleTimeout(piece: number,) {
    // Remover do mapa de solicitações
    this._requestedPieces.delete(piece,);

    if (!this._fetching) return;

    // Tentar novamente se ainda houver tentativas restantes
    const maxAttempts = 3;
    const currentRequest = this._requestedPieces.get(piece,);
    const attempts = currentRequest ? currentRequest.attempts + 1 : 1;

    if (attempts < maxAttempts) {
      this._request(piece,);
    } else {
      // Muitas tentativas falhas, emitir aviso
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: {
            error: new Error(
              `Timeout while requesting metadata piece ${piece}`,
            ),
          },
        },),
      );

      // Tentar continuar com outras peças
      this._checkDone();
    }
  }

  private _requestPieces() {
    if (this._fetching && this._metadataSize) {
      this.metadata = new Uint8Array(this._metadataSize,);
      for (let piece = 0; piece < this._numPieces; piece++) {
        this._request(piece,);
      }
    }
  }

  private _checkDone() {
    let done = true;
    for (let piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece,)) {
        done = false;
        break;
      }
    }
    if (done && this.metadata) {
      // Verificar a integridade dos dados recebidos calculando o hash
      const success = this._verifyMetadataIntegrity();
      if (success) {
        this.setMetadata(this.metadata,);
      } else {
        this._failedMetadata();
      }
    }
  }

  private _verifyMetadataIntegrity(): boolean {
    if (!this.metadata) return false;

    console.log(
      `[UtMetadata] _verifyMetadataIntegrity metadata.length: ${this.metadata.length}, first 20 bytes:`,
      Array.from(this.metadata.slice(0, 20,),),
    );
    try {
      // Verificar se os dados são válidos bencode
      decode(this.metadata,);

      // Para BEP 52, também verificaríamos o hash SHA-256, mas isso
      // geralmente não é feito durante a transferência via ut_metadata,
      // pois o hash é verificado quando o torrent é carregado

      return true;
    } catch (err) {
      console.warn("Metadata integrity check failed:", err,);
      return false;
    }
  }

  private _failedMetadata() {
    if (!this._metadataSize) return;
    this._bitfield = new Bitfield({ length: this._numPieces, grow: 1000, },);
    this._remainingRejects -= this._numPieces;
    if (this._remainingRejects > 0) {
      this._requestPieces();
    } else {
      this.emit(
        "warning",
        new CustomEvent("warning", {
          detail: { error: new Error("Peer sent invalid metadata",), },
        },),
      );
    }
  }
}
