// /loco/monorepo/webtorrent/src/network/swarm.ts

import { TypedEventTarget } from "../utils/event-target.ts";
import { Peer } from "./peer.ts";
import { createTracker, Tracker, TrackerOptions, TrackerResponse } from "./tracker.ts";
import { UtMetadata } from "../extensions/ut-metadata.ts";
import type { Wire } from "../core/wire.ts";

export interface SwarmEvents {
  peer: CustomEvent<{ peer: Peer; source: string }>;
  wire: CustomEvent<{ wire: any; addr: string }>;
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

  public readonly peers: Map<string, Peer> = new Map();
  private queue: QueuedPeer[] = [];
  private trackers: Tracker[] = [];
  private maxConns: number;
  private wrtc?: typeof RTCPeerConnection;
  private metadata?: Uint8Array;

  /** Torrent dono deste swarm. Definido externamente (ver WebTorrent.add). */
  public torrent: any | null = null;

  public destroyed = false;
  private paused = false;
  /** Download rate limit in bytes/s (0 = unlimited). */
  private _downloadLimit: number = 0;
  /** Upload rate limit in bytes/s (0 = unlimited). */
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
        this.trackers.push(tracker);
      } catch (err) {
        this.emit("warning", new CustomEvent("warning", {
          detail: { error: err instanceof Error ? err : new Error(String(err)) }
        }));
      }
    }
  }

  public start(): void {
    if (this.destroyed) return;

    for (const tracker of this.trackers) {
      tracker.announce({ event: "started" }).then((response: TrackerResponse) => {
        this._onTrackerResponse(response, tracker);
      }).catch((err: Error) => {
        this.emit("warning", new CustomEvent("warning", {
          detail: { error: err }
        }));
      });
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

  // ==========================================================================
  // THROTTLE
  // ==========================================================================

  /** Currently configured download rate limit (bytes/s). */
  get downloadLimit(): number { return this._downloadLimit; }

  /** Currently configured upload rate limit (bytes/s). */
  get uploadLimit(): number { return this._uploadLimit; }

  /**
   * Set the download rate limit for this swarm's wires.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleDownload(rate: number): void {
    this._downloadLimit = Math.max(0, rate);
    for (const peer of this.peers.values()) {
      if (peer.wire && !(peer.wire as any).isDestroyed) {
        (peer.wire as any).throttleDownload?.(this._downloadLimit);
      }
    }
  }

  /**
   * Set the upload rate limit for this swarm's wires.
   * @param rate bytes/s; `0` removes the limit.
   */
  throttleUpload(rate: number): void {
    this._uploadLimit = Math.max(0, rate);
    for (const peer of this.peers.values()) {
      if (peer.wire && !(peer.wire as any).isDestroyed) {
        (peer.wire as any).throttleUpload?.(this._uploadLimit);
      }
    }
  }

  // ==========================================================================
  // DELEGAÇÃO DO TORRENT
  // ==========================================================================

  /** Envia `interested` para todos os wires conectados. */
  public _sendInterested(): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) {
        peer.wire.sendInterested();
      }
    }
  }

  /** Envia `not-interested` para todos os wires conectados. */
  public _sendNotInterested(): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) {
        peer.wire.sendNotInterested();
      }
    }
  }

  /** Envia `suggest-piece` (BEP 6) para todos os wires. */
  public _sendSuggestPiece(index: number): void {
    for (const [, peer] of this.peers) {
      if (peer.wire && !peer.wire.isDestroyed) {
        peer.wire.sendSuggestPiece(index);
      }
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

    const peer = new Peer({
      initiator: true,
      infoHash: this.infoHash,
      peerId: this.peerId,
      wrtc: this.wrtc,
      addr,
    });

    this.peers.set(addr, peer);

    peer.on("connect", () => {
      this.emit("peer", new CustomEvent("peer", { detail: { peer, source: "tracker" } }));
    });

    // 🔥 INTEGRAÇÃO: Quando o Wire é criado, registrar extensão ut_metadata
    peer.on("handshake", (e) => {
      if (peer.wire) {
        const wire: Wire = peer.wire;

        // Cria e registra a extensão ut_metadata
        const utMetadata = new UtMetadata(wire, { metadata: this.metadata });

        // Se temos o metadata, define no ut_metadata para servir a outros peers
        if (this.metadata) {
          utMetadata.setMetadata(this.metadata);
        }

        // Registra listener para quando o metadata for recebido
        utMetadata.on("metadata", (metadataEvent: any) => {
          const metadata = metadataEvent.detail?.metadata || metadataEvent;
          this.emit("metadata", new CustomEvent("metadata", {
            detail: { metadata, peer }
          }));
        });

        utMetadata.on("warning", (warningEvent: any) => {
          const error = warningEvent.detail?.error || warningEvent;
          this.emit("warning", new CustomEvent("warning", { detail: { error } }));
          this.torrent?.emit?.("warning", new CustomEvent("warning", { detail: { error } }));
        });

        // Inicia o fetch do metadata se não temos
        if (!this.metadata) {
          utMetadata.fetch();
        }

        this.emit("wire", new CustomEvent("wire", {
          detail: { wire, addr }
        }));

        // Repassa o wire ao Torrent (que cria interval de velocidade, idle timer etc.)
        if (this.torrent && typeof this.torrent._registerWire === "function") {
          this.torrent._registerWire(wire, addr);
        }
      }
    });

    peer.on("error", (e) => {
      this._onPeerError(addr, e.detail.error);
    });

    peer.on("close", () => {
      this._onPeerClose(addr);
    });
  }

  private _onPeerError(addr: string, error: Error): void {
    this.emit("warning", new CustomEvent("warning", { detail: { error } }));
    this.torrent?.emit?.("warning", new CustomEvent("warning", { detail: { error } }));
    this.peers.delete(addr);
    this._drain();
  }

  private _onPeerClose(addr: string): void {
    this.peers.delete(addr);

    const queued = this.queue.find(q => q.addr === addr);
    const retries = queued ? queued.retries : 0;

    if (retries < RECONNECT_WAIT.length && !this.destroyed && !this.paused) {
      const waitMs = RECONNECT_WAIT[retries]!;
      const timeoutId = setTimeout(() => {
        if (!this.destroyed && !this.paused) {
          this._connectPeer(addr);
        }
      }, waitMs) as unknown as number;

      if (!queued) {
        this.queue.push({ addr, retries: retries + 1, timeoutId });
      } else {
        queued.retries = retries + 1;
        queued.timeoutId = timeoutId;
      }
    }

    this._drain();
  }

  private _drain(): void {
    if (this.destroyed || this.paused) return;

    while (this.peers.size < this.maxConns && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        if (next.timeoutId) clearTimeout(next.timeoutId);
        this._connectPeer(next.addr);
      }
    }
  }
}
