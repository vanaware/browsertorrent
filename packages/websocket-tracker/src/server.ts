/**
 * WebSocket server for BrowserTorrent tracker.
 * Parity with original bittorrent-tracker for browser-compatible features.
 */

import { LRUCache, } from "./lru.ts";
import { parseWebSocketMessage, } from "./parse-websocket.ts";
import { StatsManager, } from "./stats.ts";
import { TrackerRouter, } from "./router.ts";

interface Peer {
  id: string;
  ws: WebSocket;
  infoHash: string;
  peerId: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
  event?: string;
  connectedAt: number;
  infoHashes: string[];
}

interface TrackerMessage {
  action: string;
  info_hash: string;
  peer_id: string;
  port: number;
  uploaded?: number;
  downloaded?: number;
  left?: number;
  event?: string;
  numwant?: number;
  compact?: number;
  no_peer_id?: number;
  answer?: any;
  to_peer_id?: string;
  offer_id?: string;
  offers?: Array<{ offer: any; offer_id: string }>;
}

interface TorrentInfo {
  complete: number;
  incomplete: number;
}

export class WebSocketTracker {
  private server: Deno.HttpServer | undefined;
  private peers: Map<string, Peer>; // peerId -> Peer
  private peersByInfoHash: LRUCache<Set<string>>; // infoHash -> Set(peerIds)
  private torrents: Map<string, TorrentInfo>; // infoHash -> TorrentInfo
  private stats: StatsManager;
  private readonly maxPeers: number;
  private readonly maxPeersPerTorrent: number;
  private readonly hostname: string;
  private readonly port: number;
  private readonly idleTimeout: number;
  private readonly intervalMs: number;
  private readonly router: TrackerRouter;

  constructor(
    port: number = 8000,
    options: Partial<WebSocketTrackerOptions> = {},
  ) {
    const config = { ...defaultOptions, ...options, };
    this.maxPeers = config.maxPeers ?? 1000;
    this.maxPeersPerTorrent = config.maxPeersPerTorrent ?? 50;
    this.hostname = config.hostname ?? "0.0.0.0";
    this.port = port;
    this.idleTimeout = config.idleTimeout ?? 300000;
    this.intervalMs = config.intervalMs ?? 120000; // 2 minutes for WS

    this.peers = new Map();
    this.peersByInfoHash = new LRUCache<Set<string>>(
      config.maxTorrents ?? 100,
    );
    this.torrents = new Map<string, TorrentInfo>();
    this.stats = new StatsManager();
    this.router = new TrackerRouter(this,);
  }

  async start(): Promise<void> {
    this.server = Deno.serve(
      {
        port: this.port,
      },
      (req: Request,): Response | Promise<Response> =>
        this.router.handleRequest(req,),
    );

    console.log("[TRACKER] WebSocket server listening on port", this.port,);
    // Deno.serve() runs indefinitely until shutdown() is called
    await new Promise(() => {},);
  }

  handleHttpAnnounce(url: URL, req: Request,): Response {
    const params = url.searchParams;
    const infoHash = params.get("info_hash",) || "";
    const peerId = params.get("peer_id",) || "";
    const port = Number(params.get("port",),) || 0;
    const uploaded = Number(params.get("uploaded",),) || 0;
    const downloaded = Number(params.get("downloaded",),) || 0;
    const left = Number(params.get("left",),) || 0;
    const event = params.get("event",) || undefined;
    const numwant = params.has("numwant",)
      ? Math.min(
        Number(params.get("numwant",),) ?? 50,
        this.maxPeersPerTorrent,
      )
      : undefined;

    if (!infoHash || !peerId) {
      return new Response(
        JSON.stringify({
          action: "error",
          error: "Missing required parameters: info_hash and peer_id",
          failure_reason: "Missing required parameters: info_hash and peer_id",
        },),
        { status: 400, headers: { "Content-Type": "application/json", }, },
      );
    }

    // Find or create HTTP peer
    let peer = this.peers.get(peerId,);
    if (!peer) {
      peer = {
        id: peerId,
        ws: {} as WebSocket,
        infoHash: "",
        peerId,
        port,
        uploaded,
        downloaded,
        left,
        connectedAt: Date.now(),
        infoHashes: [],
      };
      this.peers.set(peerId, peer,);
      this.stats.incrementConnections();
    }

    // Process announce using existing logic
    peer.peerId = peerId;
    peer.infoHash = infoHash;
    peer.port = port;
    peer.uploaded = uploaded;
    peer.downloaded = downloaded;
    peer.left = left;

    if (!peer.infoHashes.includes(infoHash,)) {
      peer.infoHashes.push(infoHash,);
    }

    switch (event) {
      case "started":
        this.addPeerToTorrent(infoHash, peer,);
        break;
      case "completed":
        this.addPeerToTorrent(infoHash, peer,);
        this.incrementComplete(infoHash,);
        break;
      case "stopped":
        this.removePeerFromTorrent(infoHash, peer,);
        break;
      case "update":
        this.addPeerToTorrent(infoHash, peer,);
        break;
      default:
        this.addPeerToTorrent(infoHash, peer,);
        break;
    }

    this.peers.set(peerId, peer,);

    // Build response
    const response = this.buildAnnounceResponse(infoHash, peer, numwant,);

    return new Response(JSON.stringify(response,), {
      headers: { "Content-Type": "application/json", },
    },);
  }

  handleHttpScrape(url: URL, req: Request,): Response {
    const params = url.searchParams;
    const infoHash = params.get("info_hash",) || "";

    if (!infoHash) {
      return new Response(
        JSON.stringify({
          action: "error",
          error: "Missing required parameter: info_hash",
          failure_reason: "Missing required parameter: info_hash",
        },),
        { status: 400, headers: { "Content-Type": "application/json", }, },
      );
    }

    const peerIds = this.peersByInfoHash.get(infoHash,);
    const peerCount = peerIds ? peerIds.size : 0;
    const torrentInfo = this.torrents.get(infoHash,) ||
      { complete: 0, incomplete: 0, };

    const response = {
      action: "scrape",
      info_hash: infoHash,
      complete: torrentInfo.complete,
      incomplete: torrentInfo.incomplete,
      downloaded: this.stats.getDownloaded(),
    };

    return new Response(JSON.stringify(response,), {
      headers: { "Content-Type": "application/json", },
    },);
  }

  buildAnnounceResponse(infoHash: string, peer: Peer, numwant?: number,): {
    action: string;
    interval: number;
    complete: number;
    incomplete: number;
    peers: Array<{ peer_id: string; ip: string; port: number }>;
  } {
    const peerIds = this.peersByInfoHash.get(infoHash,);
    const peers: Array<{ peer_id: string; ip: string; port: number }> = [];

    if (peerIds) {
      const limit = numwant ?? Math.min(peerIds.size, this.maxPeersPerTorrent,);
      for (const pid of peerIds) {
        if (peers.length >= limit) break;
        if (pid === peer.id) continue;
        const p = this.peers.get(pid,);
        if (p && p.port > 0) {
          peers.push({ peer_id: p.peerId, ip: "127.0.0.1", port: p.port, },);
        }
      }
    }

    const torrentInfo = this.torrents.get(infoHash,) ||
      { complete: 0, incomplete: 0, };

    return {
      action: "announce",
      interval: Math.ceil(this.intervalMs / 1000,),
      complete: torrentInfo.complete,
      incomplete: torrentInfo.incomplete,
      peers,
    };
  }

  private handleDisconnection(peer: Peer,): void {
    // Send stopped announce for all active swarms
    for (const infoHash of peer.infoHashes) {
      this.removePeerFromTorrent(infoHash, peer,);
    }
    this.stats.decrementConnections();
    console.log("[TRACKER] Peer disconnected:", peer.id,);
  }

  handleConnection(ws: WebSocket,): void {
    const peerId = crypto.randomUUID();
    const peer: Peer = {
      id: peerId,
      ws,
      infoHash: "",
      peerId,
      port: 0,
      uploaded: 0,
      downloaded: 0,
      left: 0,
      connectedAt: Date.now(),
      infoHashes: [],
    };

    this.peers.set(peerId, peer,);
    this.stats.incrementConnections();

    console.log("[TRACKER] New peer connected:", peerId,);

    ws.addEventListener("message", (event,) => {
      this.handleMessage(peer, event.data as string,);
    },);

    ws.addEventListener("close", () => {
      this.handleDisconnection(peer,);
    },);

    ws.addEventListener("error", (event,) => {
      console.error("[TRACKER] Peer error:", peerId, event,);
    },);
  }

  private handleMessage(peer: Peer, data: string,): void {
    try {
      const message = JSON.parse(data,) as TrackerMessage;
      this.stats.incrementMessages();

      switch (message.action) {
        case "announce":
          this.handleAnnounce(peer, message,);
          break;
        case "scrape":
          this.handleScrape(peer, message,);
          break;
        case "offer":
          this.handleWebSocketSignaling(peer, message,);
          break;
        case "answer":
          this.handleWebSocketSignaling(peer, message,);
          break;
        default:
          this.sendError(
            peer,
            "unsupported_action",
            `Action not supported: ${message.action}`,
          );
      }
    } catch (error) {
      this.sendError(
        peer,
        "invalid_message",
        `Invalid message format: ${error}`,
      );
    }
  }

  private handleAnnounce(peer: Peer, message: TrackerMessage,): void {
    const {
      info_hash,
      peer_id,
      port,
      uploaded = 0,
      downloaded = 0,
      left = 0,
      event,
    } = message;

    peer.peerId = peer_id;
    peer.infoHash = info_hash;
    peer.port = port;
    peer.uploaded = uploaded;
    peer.downloaded = downloaded;
    peer.left = left;

    if (!peer.infoHashes.includes(info_hash,)) {
      peer.infoHashes.push(info_hash,);
    }

    switch (event) {
      case "started":
        this.addPeerToTorrent(info_hash, peer,);
        break;
      case "completed":
        this.addPeerToTorrent(info_hash, peer,);
        this.incrementComplete(info_hash,);
        break;
      case "stopped":
        this.removePeerFromTorrent(info_hash, peer,);
        break;
      case "update":
        this.addPeerToTorrent(info_hash, peer,);
        break;
      default:
        this.addPeerToTorrent(info_hash, peer,);
        break;
    }

    this.peers.set(peer.id, peer,);
    this.sendPeersToPeer(peer, info_hash,);

    // FASE 7: Handle signaling embedded in announce (offers/answer)
    if (message.offers || message.answer) {
      this.handleWebSocketSignaling(peer, message,);
    }

    console.log(
      `[TRACKER] Announce from ${peer_id} for ${info_hash} (event: ${
        event || "regular"
      })`,
    );
  }

  private handleScrape(peer: Peer, message: TrackerMessage,): void {
    const { info_hash, } = message;
    const peerIds = this.peersByInfoHash.get(info_hash,);
    const peerCount = peerIds ? peerIds.size : 0;
    const torrentInfo = this.torrents.get(info_hash,) ||
      { complete: 0, incomplete: 0, };

    const response = {
      action: "scrape",
      info_hash: info_hash,
      complete: torrentInfo.complete,
      incomplete: torrentInfo.incomplete,
      downloaded: this.stats.getDownloaded(),
    };

    peer.ws.send(JSON.stringify(response,),);
    console.log(
      "[TRACKER] Scrape for",
      info_hash,
      "returned",
      peerCount,
      "peers",
    );
  }

  private handleWebSocketSignaling(peer: Peer, message: TrackerMessage,): void {
    if (message.action === "offer" || message.offers) {
      if (!message.offers) return;

      if (message.to_peer_id) {
        // Targeted offer
        console.log(`[TRACKER] Targeted offer from ${peer.peerId} to ${message.to_peer_id}`);
        for (const offer of message.offers) {
          const targetPeer = Array.from(this.peers.values()).find(p => p.peerId === message.to_peer_id);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              action: "announce",
              info_hash: message.info_hash || peer.infoHash,
              offer_id: offer.offer_id,
              offer: offer.offer,
              peer_id: peer.peerId,
              from_peer_id: peer.peerId,
            },),);
          }
        }
      } else {
        // Distribute offers to other peers in the swarm
        const infoHash = message.info_hash || peer.infoHash;
        if (!infoHash) return;

        const peerIds = this.peersByInfoHash.get(infoHash,);
        if (!peerIds) return;

        const availablePeers = Array.from(peerIds,)
          .filter((id,) => id !== peer.id)
          .map((id,) => this.peers.get(id,))
          .filter((p,) => p && p.ws.readyState === WebSocket.OPEN) as Peer[];

        console.log(`[TRACKER] Distributing ${message.offers.length} offers from ${peer.peerId} to ${availablePeers.length} peers in ${infoHash}`);

        // Distribute one offer per peer
        for (
          let i = 0;
          i < Math.min(message.offers.length, availablePeers.length,);
          i++
        ) {
          const targetPeer = availablePeers[i]!;
          const offer = message.offers[i]!;
          targetPeer.ws.send(JSON.stringify({
            action: "announce",
            info_hash: infoHash,
            offer_id: offer.offer_id,
            offer: offer.offer,
            peer_id: peer.peerId,
            from_peer_id: peer.peerId,
          },),);
        }
      }
    } else if (message.action === "answer" || message.answer) {
      if (!message.answer || !message.to_peer_id) {
        if (message.action === "answer") {
          this.sendError(
            peer,
            "invalid_answer",
            "Answer requires answer and to_peer_id",
          );
        }
        return;
      }

      console.log(`[TRACKER] Routing answer from ${peer.peerId} to ${message.to_peer_id}`);
      const targetPeer = Array.from(this.peers.values()).find(p => p.peerId === message.to_peer_id);
      if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
        targetPeer.ws.send(JSON.stringify({
          action: "announce",
          info_hash: message.info_hash || peer.infoHash,
          offer_id: message.offer_id,
          answer: message.answer,
          peer_id: peer.peerId,
          from_peer_id: peer.peerId,
          to_peer_id: message.to_peer_id,
        },),);
      }
    }
  }

  private addPeerToTorrent(infoHash: string, peer: Peer,): void {
    if (!this.torrents.has(infoHash,)) {
      this.torrents.set(infoHash, { complete: 0, incomplete: 0, },);
    }

    let peerIds = this.peersByInfoHash.get(infoHash,);
    if (!peerIds) {
      peerIds = new Set();
      this.peersByInfoHash.put(infoHash, peerIds,);
    }

    if (peerIds.size >= this.maxPeersPerTorrent) {
      this.evictLeastActivePeer(infoHash,);
    }

    peerIds.add(peer.id,);
    this.peers.set(peer.id, peer,);
  }

  private removePeerFromTorrent(infoHash: string, peer: Peer,): void {
    const peerIds = this.peersByInfoHash.get(infoHash,);
    if (peerIds) {
      peerIds.delete(peer.id,);
    }

    const index = peer.infoHashes.indexOf(infoHash,);
    if (index !== -1) {
      peer.infoHashes.splice(index, 1,);
    }

    this.peers.set(peer.id, peer,);
  }

  private sendPeersToPeer(peer: Peer, infoHash: string,): void {
    const peerIds = this.peersByInfoHash.get(infoHash,);
    if (!peerIds) {
      this.sendPeersResponse(peer, infoHash, [],);
      return;
    }

    const numwant = Math.min(peerIds.size, this.maxPeersPerTorrent,);
    const peers: Array<{ peer_id: string; ip: string; port: number }> = [];

    for (const pid of peerIds) {
      if (peers.length >= numwant) break;
      if (pid === peer.id) continue;
      const p = this.peers.get(pid,);
      if (p && p.ws.readyState === WebSocket.OPEN) {
        peers.push({ peer_id: p.peerId, ip: "127.0.0.1", port: p.port, },);
      }
    }

    this.sendPeersResponse(peer, infoHash, peers,);
  }

  private sendPeersResponse(
    peer: Peer,
    infoHash: string,
    peers: Array<{ peer_id: string; ip: string; port: number }>,
  ): void {
    const torrentInfo = this.torrents.get(infoHash,) ||
      { complete: 0, incomplete: 0, };
    const response = {
      action: "announce",
      interval: Math.ceil(this.intervalMs / 1000,),
      info_hash: infoHash,
      complete: torrentInfo.complete,
      incomplete: torrentInfo.incomplete,
      peers,
    };
    peer.ws.send(JSON.stringify(response,),);
  }

  private sendError(peer: Peer, errorCode: string, message: string,): void {
    peer.ws.send(JSON.stringify({
      action: "error",
      error: message,
      failure_reason: message,
    },),);
  }

  private incrementComplete(infoHash: string,): void {
    const info = this.torrents.get(infoHash,);
    if (info) {
      info.complete++;
    }
  }

  private decrementComplete(infoHash: string,): void {
    const info = this.torrents.get(infoHash,);
    if (info) {
      info.complete = Math.max(0, info.complete - 1,);
    }
  }

  private evictLeastActivePeer(infoHash: string,): void {
    const peerIds = this.peersByInfoHash.get(infoHash,);
    if (!peerIds || peerIds.size === 0) return;

    let oldestPeerId: string | undefined;
    let oldestTime = Infinity;

    for (const pid of peerIds) {
      const p = this.peers.get(pid,);
      if (p && p.connectedAt < oldestTime) {
        oldestTime = p.connectedAt;
        oldestPeerId = pid;
      }
    }

    if (oldestPeerId) {
      peerIds.delete(oldestPeerId,);
      const p = this.peers.get(oldestPeerId,);
      if (p) {
        const index = p.infoHashes.indexOf(infoHash,);
        if (index !== -1) {
          p.infoHashes.splice(index, 1,);
        }
      }
    }
  }

  getStats() {
    return this.stats.getStats();
  }

  close(): void {
    if (this.server) {
      this.server.shutdown();
      this.server = undefined;
    }
    for (const peer of this.peers.values()) {
      peer.ws.close();
    }
    this.peers.clear();
    this.peersByInfoHash.clear();
    this.torrents.clear();
  }
}

interface WebSocketTrackerOptions {
  maxPeers?: number;
  maxPeersPerTorrent?: number;
  maxTorrents?: number;
  hostname?: string;
  idleTimeout?: number;
  intervalMs?: number;
}

const defaultOptions: WebSocketTrackerOptions = {
  maxPeers: 1000,
  maxPeersPerTorrent: 50,
  maxTorrents: 100,
  hostname: "0.0.0.0",
  idleTimeout: 300000,
  intervalMs: 120000,
};
