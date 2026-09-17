import { TypedEventTarget } from "../utils/event-target.ts";
import { Peer } from "./peer.ts";
import {
  createTracker,
  Tracker,
  TrackerOptions,
  TrackerResponse,
  TrackerOffer,
  WebRTCSdp,
} from "./tracker.ts";
import { UtMetadata } from "../extensions/ut-metadata.ts";
import type { Wire } from "../core/wire.ts";

export interface SwarmEvents {
  [key: string]: Event | CustomEvent;
  peer: CustomEvent<{ peer: Peer; source: string }>;
  wire: CustomEvent<{ wire: Wire; addr: string }>;
  error: CustomEvent<{ error: Error }>;
  warning: CustomEvent<{ error: Error }>;
  trackerAnnounce: Event;
  noPeers: CustomEvent<{ source: string }>;
  metadata: CustomEvent<{ metadata: Uint8Array; peer: Peer }>;
}

export interface SwarmOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  announce: string[];
  maxConns?: number;
  port?: number;
  wrtc?: typeof RTCPeerConnection;
  metadata?: Uint8Array; // Metadata já conhecido (para seed)
}

interface QueuedPeer {
  addr: string;
  retries: number;
  timeoutId?: number;
}

const RECONNECT_WAIT = [1000, 5000, 15000];
const MAX_QUEUED_PEERS = 200;

export class Swarm extends TypedEventTarget<SwarmEvents> {
  public readonly infoHash: Uint8Array;
  public readonly peerId: Uint8Array;
  public peers = new Map<string, Peer>();
  private queue: QueuedPeer[] = [];
  private trackers: Tracker[] = [];
  public maxConns: number;
  public wrtc?: typeof RTCPeerConnection;
  private metadata?: Uint8Array;
  private pendingOffers = new Map<string, Peer>(); // offer_id -> Peer (initiator)

  public torrent: {
    emit?: (type: string, event: Event | CustomEvent) => boolean;
    _registerWire?: (wire: Wire, addr: string) => void;
  } | null = null;

  public destroyed = false;
  private paused = false;
  private _downloadLimit: number = 0;
  private _uploadLimit: number = 0;

  constructor(opts: SwarmOptions) {
    super();
    this.infoHash = opts.infoHash;
    this.peerId = opts.peerId;
    this.maxConns = opts.maxConns || 55;
    this.wrtc = opts.wrtc;
    this.metadata = opts.metadata;

    for (const announceUrl of opts.announce) {
      try {
        const trackerOpts: TrackerOptions = {
          infoHash: opts.infoHash,
          peerId: opts.peerId,
          port: opts.port || 6881,
        };
        const tracker = createTracker(announceUrl, trackerOpts);
        
        // Ouça eventos de peers recebidos via WsTracker
        tracker.on("peer", (e: any) => {
           const { peerId, offer, answer, offerId } = e.detail;
           this._onTrackerPeer(tracker, peerId, offer, answer, offerId);
        });
        
        tracker.on("warning", (e: any) => {
           this.emit("warning", new CustomEvent("warning", { detail: { error: new Error(e.detail) } }));
        });
        
        tracker.on("error", (e: any) => {
           this.emit("warning", new CustomEvent("warning", { detail: { error: e.detail } }));
        });
        
        this.trackers.push(tracker);
      } catch (err) {
        this.emit(
          "warning",
          new CustomEvent("warning", {
            detail: {
              error: err instanceof Error ? err : new Error(String(err)),
            },
          }),
        );
      }
    }
  }

  public async start(): Promise<void> {
    if (this.destroyed) return;

    for (const tracker of this.trackers) {
      try {
        let offers: TrackerOffer[] = [];
        
        // Gera ofertas apenas para WsTrackers
        if (tracker.constructor.name === "WsTracker") {
           offers = await this._generateOffers(Math.min(this.maxConns - this.peers.size, 5));
        }

        const response = await tracker.announce({ event: "started", offers });
        this._onTrackerResponse(response, tracker);
      } catch (err) {
        this.emit(
          "warning",
          new CustomEvent("warning", {
            detail: { error: err instanceof Error ? err : new Error(String(err)) },
          }),
        );
      }
    }
  }
  
  private async _generateOffers(count: number): Promise<TrackerOffer[]> {
     const offers: TrackerOffer[] = [];
     const promises = Array.from({ length: count }).map(async () => {
        const offerId = Array.from(crypto.getRandomValues(new Uint8Array(20)))
                           .map(b => b.toString(16).padStart(2, '0')).join('');
        
        const peer = new Peer({
          initiator: true,
          infoHash: this.infoHash,
          peerId: this.peerId,
          wrtc: this.wrtc,
          addr: `webrtc:${offerId}`
        });
        
        this.pendingOffers.set(offerId, peer);
        
        return new Promise<void>((resolve) => {
           let resolved = false;
           const timeoutId = setTimeout(() => {
              if (!resolved) {
                 resolved = true;
                 resolve();
              }
           }, 5000); // Max wait for ICE gathering
           
           peer.on("signal", (e: any) => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timeoutId);
              offers.push({
                 offer: e.detail.data as WebRTCSdp,
                 offer_id: offerId
              });
              resolve();
           });
           
           peer.on("error", () => {
              if (!resolved) {
                 resolved = true;
                 clearTimeout(timeoutId);
                 resolve();
              }
           });
        });
     });
     
     await Promise.all(promises);
     return offers;
  }
  
  private _onTrackerPeer(tracker: Tracker, peerIdHex: string, offer?: WebRTCSdp, answer?: WebRTCSdp, offerId?: string): void {
     if (this.destroyed || this.paused) return;
     
     // Recebemos uma RESPOSTA (Answer) a uma oferta nossa
     if (answer && offerId) {
        const peer = this.pendingOffers.get(offerId);
        if (peer) {
           peer.id = peerIdHex;
           this.peers.set(`webrtc:${peerIdHex}`, peer);
           this.pendingOffers.delete(offerId);
           this._hookPeerEvents(peer, `webrtc:${peerIdHex}`);
           peer.signal(answer);
           this.emit("peer", new CustomEvent("peer", { detail: { peer, source: "tracker" } }));
        }
        return;
     }
     
     // Recebemos uma OFERTA (Offer) de um peer remoto
     if (offer && offerId) {
        if (this.peers.has(`webrtc:${peerIdHex}`)) return; // Já estamos conectados ou conectando
        
        const peer = new Peer({
           initiator: false,
           infoHash: this.infoHash,
           peerId: this.peerId,
           wrtc: this.wrtc,
           addr: `webrtc:${peerIdHex}`
        });
        peer.id = peerIdHex;
        this.peers.set(`webrtc:${peerIdHex}`, peer);
        this._hookPeerEvents(peer, `webrtc:${peerIdHex}`);
        
        // Quando nossa answer for gerada, enviaremos de volta pelo Tracker
        peer.on("signal", (e: any) => {
           const answerSdp = e.detail.data as WebRTCSdp;
           tracker.announce({
              to_peer_id: peerIdHex,
              offer_id: offerId,
              answer: answerSdp
           }).catch(console.warn);
        });
        
        peer.signal(offer);
        this.emit("peer", new CustomEvent("peer", { detail: { peer, source: "tracker" } }));
     }
  }

  public addPeer(addr: string): boolean {
    if (this.destroyed || this.paused) return false;
    if (this.peers.has(addr)) return false;
    if (this.peers.size >= this.maxConns) {
      if (this.queue.length < MAX_QUEUED_PEERS) {
        this.queue.push({ addr, retries: 0 });
      }
      return false;
    }

    this._connectPeer(addr);
    return true;
  }

  public removePeer(addr: string): void {
    const peer = this.peers.get(addr);
    if (peer) {
      peer.destroy();
      this.peers.delete(addr);
      this._drain();
    }
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
    this._drain();
  }

  get downloadLimit(): number { return this._downloadLimit; }
  get uploadLimit(): number { return this._uploadLimit; }

  throttleDownload(rate: number): void {
    this._downloadLimit = Math.max(0, rate);
    for (const peer of this.peers.values()) {
      if (peer.wire && !(peer.wire as any).isDestroyed) {
        (peer.wire as any).throttleDownload?.(this._downloadLimit);
      }
    }
  }

  throttleUpload(rate: number): void {
    this._uploadLimit = Math.max(0, rate);
    for (const peer of this.peers.values()) {
      if (peer.wire && !(peer.wire as any).isDestroyed) {
        (peer.wire as any).throttleUpload?.(this._uploadLimit);
      }
    }
  }

  public _sendInterested(): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) peer.wire.sendInterested();
    }
  }

  public _sendNotInterested(): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) peer.wire.sendNotInterested();
    }
  }

  public _sendSuggestPiece(index: number): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) peer.wire.sendSuggestPiece(index);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const queued of this.queue) {
      if (queued.timeoutId) clearTimeout(queued.timeoutId);
    }
    this.queue = [];

    for (const [, peer] of this.peers) {
      peer.destroy();
    }
    this.peers.clear();
    
    for (const [, peer] of this.pendingOffers) {
      peer.destroy();
    }
    this.pendingOffers.clear();

    for (const tracker of this.trackers) {
      tracker.destroy();
    }
    this.trackers = [];

    this.torrent = null;
  }

  private _onTrackerResponse(response: TrackerResponse, _tracker: Tracker): void {
    this.emit("trackerAnnounce");

    if (response.peers.length === 0) {
      this.emit("noPeers", new CustomEvent("noPeers", { detail: { source: "tracker" } }));
      this.torrent?.emit?.("noPeers", new CustomEvent("noPeers", { detail: { source: "tracker" } }));
      return;
    }

    for (const peerInfo of response.peers) {
      if (peerInfo.ip && peerInfo.port) {
        const addr = `${peerInfo.ip}:${peerInfo.port}`;
        this.addPeer(addr);
      }
    }
  }

  private _connectPeer(addr: string): void {
    if (this.destroyed || this.paused) return;
    if (this.peers.has(addr)) return;

    // Conexões IP regulares assumem initiator true (se for WebRTC e falhar o fallback pro WsTracker não existe, mas mantemos o padrão)
    const peer = new Peer({
      initiator: true,
      infoHash: this.infoHash,
      peerId: this.peerId,
      wrtc: this.wrtc,
      addr,
    });

    this.peers.set(addr, peer);
    this._hookPeerEvents(peer, addr);
  }
  
  private _hookPeerEvents(peer: Peer, addr: string): void {
    peer.on("connect", () => {
      // Connect emitido no _onTrackerPeer e _connectPeer, mas evitamos duplicação
      // O peer do _onTrackerPeer já emitiu 'peer', entao so faz o hook de wire.
    });

    peer.on("handshake", (e) => {
      if (peer.wire) {
        const wire: Wire = peer.wire;
        const utMetadata = new UtMetadata(wire, { metadata: this.metadata });

        if (this.metadata) {
          utMetadata.setMetadata(this.metadata);
        }

        utMetadata.on("metadata", (metadataEvent: any) => {
            const metadata = metadataEvent.detail?.metadata || metadataEvent;
            this.emit("metadata", new CustomEvent("metadata", { detail: { metadata, peer } }));
        });

        utMetadata.on("warning", (warningEvent: any) => {
            const error = warningEvent.detail?.error || warningEvent;
            this.emit("warning", new CustomEvent("warning", { detail: { error } }));
            this.torrent?.emit?.("warning", new CustomEvent("warning", { detail: { error } }));
        });

        if (!this.metadata) {
          utMetadata.fetch();
        }

        this.emit("wire", new CustomEvent("wire", { detail: { wire, addr } }));
        this.torrent?._registerWire?.(wire, addr);
      }
    });

    peer.on("close", () => {
      this.peers.delete(addr);
      this._drain();
    });

    peer.on("error", (e: any) => {
      this.peers.delete(addr);
      const error = e.detail?.error || e;
      this.emit("warning", new CustomEvent("warning", { detail: { error } }));
      this._drain();
    });
  }

  private _drain(): void {
    if (this.destroyed || this.paused) return;
    while (this.peers.size < this.maxConns && this.queue.length > 0) {
      const queued = this.queue.shift();
      if (queued) {
        this._connectPeer(queued.addr);
      }
    }
  }
}
