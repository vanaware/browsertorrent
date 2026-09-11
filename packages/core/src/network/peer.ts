// /loco/monorepo/webtorrent/src/network/peer.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Wire, Transport } from "../core/wire.ts";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface PeerEvents {
  /** Emitido quando o Peer precisa enviar dados de sinalização (offer, answer, ICE) para o Tracker/SW */
  signal: CustomEvent<{ data: RTCSessionDescriptionInit | RTCIceCandidateInit }>;
  /** Emitido quando a conexão WebRTC e o DataChannel estão abertos */
  connect: Event;
  /** Emitido quando o handshake do BitTorrent é concluído com sucesso */
  handshake: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>;
  /** Emitido quando a conexão é fechada (normalmente ou por erro) */
  close: Event;
  /** Emitido em caso de erro fatal */
  error: CustomEvent<{ error: Error }>;
}

export interface PeerOptions {
  /** Se true, este peer inicia a conexão (cria a offer). Se false, aguarda uma offer. */
  initiator: boolean;
  /** InfoHash do torrent (usado para validação no handshake) */
  infoHash: Uint8Array;
  /** PeerId local (20 bytes) */
  peerId: Uint8Array;
  /** Construtor do RTCPeerConnection (injetável para testes ou fallbacks) */
  wrtc?: typeof RTCPeerConnection;
  /** Configuração ICE (servidores STUN/TURN) */
  config?: RTCConfiguration;
  /** Nome do canal (padrão: "webtorrent") */
  channelName?: string;
  /** Endereço do peer (usado para stats `remoteAddress`/`remotePort`). */
  addr?: string;
}

// ============================================================================
// CLASSE PEER
// ============================================================================

export class Peer extends TypedEventTarget<PeerEvents> {
  /** PeerId remoto em formato hex (preenchido após o handshake) */
  public id: string = "unknown";
  public readonly type = "webrtc";
  public wire: Wire | null = null;
  
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private opts: PeerOptions;
  
  public destroyed = false;
  public addr = "";
  private connected = false;
  private handshakeCompleted = false;
  
  private connectTimeoutId: number | null = null;
  private handshakeTimeoutId: number | null = null;

  constructor(opts: PeerOptions) {
    super();
    this.opts = opts;
    this.id = "unknown";
    this.addr = opts.addr ?? "";

    // 🔥 CORREÇÃO: Fallback seguro para ambiente de teste ou browser
    const RTCPeerConnectionCtor = opts.wrtc || globalThis.RTCPeerConnection;
    if (!RTCPeerConnectionCtor) {
      throw new Error("WebRTC not supported. Provide 'wrtc' option or run in a supported browser.");
    }

    this.pc = new RTCPeerConnectionCtor(opts.config || {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this._setupPeerConnection();
    this._startConnectTimeout();

    if (opts.initiator) {
      this._initiateConnection();
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /** Retorna true se o peer está conectado e com handshake do BitTorrent completo */
  get isReady(): boolean {
    return this.connected && this.handshakeCompleted;
  }

  // ==========================================================================
  // API PÚBLICA
  // ==========================================================================

  /**
   * Processa dados de sinalização recebidos do Tracker ou Service Worker.
   * Pode ser uma offer, answer ou ICE candidate.
   */
  public async signal(data: RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void> {
    if (this.destroyed) return;

    try {
      if ("type" in data && (data.type === "offer" || data.type === "answer")) {
        await this.pc!.setRemoteDescription(data);
        
        // Se recebemos uma offer e não somos o iniciador, geramos uma answer
        if (data.type === "offer" && !this.opts.initiator) {
          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          this.emit("signal", new CustomEvent("signal", { detail: { data: answer } }));
        }
      } else if ("candidate" in data && data.candidate) {
        await this.pc!.addIceCandidate(data);
      }
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Destrói a conexão, liberando todos os recursos WebRTC e de protocolo.
   * Pode ser chamado múltiplas vezes sem erro (idempotente).
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this._clearTimeouts();

    if (this.wire) {
      this.wire.destroy();
      this.wire = null;
    }

    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // Ignora erros de fechamento
      }
      this.channel = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // Ignora erros de fechamento
      }
      this.pc = null;
    }

    this.connected = false;
    this.handshakeCompleted = false;
    this.emit("close");
  }

  // ==========================================================================
  // LÓGICA INTERNA (WebRTC)
  // ==========================================================================

  private _setupPeerConnection(): void {
    this.pc!.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit("signal", new CustomEvent("signal", { detail: { data: event.candidate.toJSON() } }));
      }
    };

    this.pc!.onconnectionstatechange = () => {
      const state = this.pc!.connectionState;
      if (state === "failed" || state === "closed") {
        this._onError(new Error(`WebRTC connection ${state}`));
      }
    };

    // Se não somos o iniciador, esperamos o outro peer criar o DataChannel
    if (!this.opts.initiator) {
      this.pc!.ondatachannel = (event) => {
        this._setupData(event.channel);
      };
    }
  }

  private async _initiateConnection(): Promise<void> {
    const channelName = this.opts.channelName || "webtorrent";
    const channel = this.pc!.createDataChannel(channelName, {
      ordered: true, // BitTorrent exige ordem nas mensagens de controle
      negotiated: false,
    });
    this._setupData(channel);

    try {
      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      this.emit("signal", new CustomEvent("signal", { detail: { data: offer } }));
    } catch (err) {
      this._onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private _setupData(channel: RTCDataChannel): void {
    this.channel = channel;
    this.channel.binaryType = "arraybuffer";

    this.channel.onopen = () => {
      this._clearConnectTimeout();
      this.connected = true;
      this.emit("connect");
      this._setupWire();
    };

    this.channel.onclose = () => {
      if (!this.destroyed) {
        this.destroy();
      }
    };

    this.channel.onerror = () => {
      this._onError(new Error("DataChannel error"));
    };
  }

  // ==========================================================================
  // LÓGICA INTERNA (Wire Protocol / BitTorrent)
  // ==========================================================================

  private _setupWire(): void {
    if (!this.channel) return;

    // Criamos um Transport que adapta o RTCDataChannel para a interface esperada pelo Wire
    const transport: Transport = {
      send: (data: Uint8Array) => {
        if (this.channel && this.channel.readyState === "open") {
          // 🔥 CORREÇÃO: Extrair um ArrayBuffer estrito para satisfazer os tipos rigorosos do Deno
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          this.channel.send(arrayBuffer as ArrayBuffer);
        }
      },
      onMessage: (handler: (data: Uint8Array) => void) => {
        if (this.channel) {
          this.channel.onmessage = (event) => {
            const buf = event.data instanceof ArrayBuffer
              ? new Uint8Array(event.data)
              : new Uint8Array(event.data);
            handler(buf);
          };
        }
      },
      close: () => {
        if (this.channel) {
          this.channel.close();
        }
      },
    };

    this.wire = new Wire(transport);
    // Expor o endereço do peer nos stats do Wire.
    if (this.opts.addr) {
      const parts = this.opts.addr.split(":");
      this.wire.remoteAddress = parts[0] ?? "";
      this.wire.remotePort = parseInt(parts[1] ?? "0", 10) || 0;
    }

    // Listener do Handshake do BitTorrent
    this.wire.on("handshake", (e: CustomEvent<{ peerId: Uint8Array; extensions: Uint8Array }>) => {
      // Converte o peerId remoto (Uint8Array) para string hex para facilitar logs e UI
      this.id = Array.from(e.detail.peerId).map((b: number) => b.toString(16).padStart(2, "0")).join("");
      this._clearHandshakeTimeout();
      this.handshakeCompleted = true;
      this.emit("handshake", new CustomEvent("handshake", { detail: e.detail }));
    });

    // Listener de erro do Wire
    this.wire.on("error", (e: CustomEvent<{ error: Error }>) => {
      this._onError(e.detail.error);
    });

    this._startHandshakeTimeout();
    
    // Inicia o handshake do BitTorrent
    this.wire.sendHandshake(this.opts.infoHash, this.opts.peerId);
  }

  // ==========================================================================
  // TIMEOUTS E ERROS
  // ==========================================================================

  private _startConnectTimeout(): void {
    this.connectTimeoutId = setTimeout(() => {
      if (!this.connected && !this.destroyed) {
        this._onError(new Error("WebRTC connection timeout"));
      }
    }, 25000) as unknown as number;
  }

  private _clearConnectTimeout(): void {
    if (this.connectTimeoutId !== null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  private _startHandshakeTimeout(): void {
    this.handshakeTimeoutId = setTimeout(() => {
      if (!this.handshakeCompleted && !this.destroyed) {
        this._onError(new Error("BitTorrent handshake timeout"));
      }
    }, 25000) as unknown as number;
  }

  private _clearHandshakeTimeout(): void {
    if (this.handshakeTimeoutId !== null) {
      clearTimeout(this.handshakeTimeoutId);
      this.handshakeTimeoutId = null;
    }
  }

  private _clearTimeouts(): void {
    this._clearConnectTimeout();
    this._clearHandshakeTimeout();
  }

  private _onError(err: Error): void {
    if (this.destroyed) return;
    this.emit("error", new CustomEvent("error", { detail: { error: err } }));
    this.destroy();
  }
}