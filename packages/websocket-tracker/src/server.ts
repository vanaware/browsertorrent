/**
 * Simple WebSocket server for BrowserTorrent tracker.
 * Optimized for small servers with minimal dependencies.
 */

import { LRUCache } from "./lru.ts";
import { parseWebSocketMessage } from "./parse-websocket.ts";
import { StatsManager } from "./stats.ts";

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
}

export class WebSocketTracker {
  private server: Deno.HttpServer | undefined;
  private peers: Map<string, Peer>; // peerId -> Peer
  private peersByInfoHash: LRUCache<Set<string>>; // infoHash -> Set(peerIds)
  private stats: StatsManager;
  private readonly maxPeers: number;
  private readonly maxPeersPerTorrent: number;
  private readonly hostname: string;
  private readonly port: number;
  private readonly idleTimeout: number;

  constructor(port: number = 8000, options: Partial<WebSocketTrackerOptions> = {}) {
    const config = { ...defaultOptions, ...options };
    this.maxPeers = config.maxPeers ?? 1000;
    this.maxPeersPerTorrent = config.maxPeersPerTorrent ?? 50;
    this.hostname = config.hostname ?? "0.0.0.0";
    this.port = port;
    this.idleTimeout = config.idleTimeout ?? 300000;

    this.peers = new Map();
    this.peersByInfoHash = new LRUCache<Set<string>>(config.maxTorrents ?? 100);
    this.stats = new StatsManager();
  }

  async start(): Promise<void> {
    this.server = Deno.serve({
      port: this.port,
    }, (req: Request): Response | Promise<Response> => this.handleRequest(req));

    console.log("[TRACKER] WebSocket server listening on port", this.port);
    // Deno.serve() runs indefinitely until shutdown() is called
    // Keep the process alive
    await new Promise(() => {});
  }

  private async handleRequest(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      this.handleConnection(socket);
      return response;
    }
    return new Response("Not Found", { status: 404 });
  }

  private handleDisconnection(peer: Peer): void {
    this.peers.delete(peer.id);
    this.stats.decrementConnections();
    console.log("[TRACKER] Peer disconnected:", peer.id);
  }

  private handleConnection(ws: WebSocket): void {
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
    };

    this.peers.set(peerId, peer);
    this.stats.incrementConnections();

    console.log("[TRACKER] New peer connected:", peerId);

    ws.addEventListener("message", (event) => {
      this.handleMessage(peer, event.data as string);
    });

    ws.addEventListener("close", () => {
      this.handleDisconnection(peer);
    });

    ws.addEventListener("error", (event) => {
      console.error("[TRACKER] Peer error:", peerId, event);
    });
  }

  private handleMessage(peer: Peer, data: string): void {
    try {
      const message = JSON.parse(data) as TrackerMessage;
      this.stats.incrementMessages();

      switch (message.action) {
        case "announce":
          this.handleAnnounce(peer, message);
          break;
        case "scrape":
          this.handleScrape(peer, message);
          break;
        default:
          this.sendError(peer, "unsupported_action", `Action not supported: ${message.action}`);
      }
    } catch (error) {
      this.sendError(peer, "invalid_message", `Invalid message format: ${error}`);
    }
  }

  private handleAnnounce(peer: Peer, message: TrackerMessage): void {
    const { info_hash, peer_id, port, uploaded = 0, downloaded = 0, left = 0, event } = message;

    peer.infoHash = info_hash;
    peer.port = port;
    peer.uploaded = uploaded;
    peer.downloaded = downloaded;
    peer.left = left;

    switch (event) {
      case "started":
        this.addPeerToTorrent(info_hash, peer);
        break;
      case "completed":
        this.addPeerToTorrent(info_hash, peer);
        this.stats.incrementCompleted();
        break;
      case "stopped":
        this.removePeerFromTorrent(info_hash, peer);
        break;
      default:
        this.addPeerToTorrent(info_hash, peer);
        break;
    }

    // Ensure peer is in the peers map before sending peers response
    this.peers.set(peer.id, peer);
    this.sendPeersToPeer(peer, info_hash);
    console.log(`[TRACKER] Announce from ${peer_id} for ${info_hash} (event: ${event || "regular"})`);
  }

  private handleScrape(peer: Peer, message: TrackerMessage): void {
    const { info_hash } = message;
    const peerIds = this.peersByInfoHash.get(info_hash);
    const peerCount = peerIds ? peerIds.size : 0;

    const response = {
      action: "scrape",
      info_hash: info_hash,
      complete: peerCount,
      incomplete: 0,
      downloaded: this.stats.getDownloaded(),
    };

    peer.ws.send(JSON.stringify(response));
    console.log("[TRACKER] Scrape for", info_hash, "returned", peerCount, "peers");
  }

  private addPeerToTorrent(infoHash: string, peer: Peer): void {
    if (this.peers.size >= this.maxPeers) {
      this.evictLeastActivePeer();
    }

    const peerIds = this.peersByInfoHash.get(infoHash) || new Set();
    if (peerIds.size >= this.maxPeersPerTorrent) {
      const lruKeys = Array.from(this.peersByInfoHash.keys());
      const lruKey = lruKeys[lruKeys.length - 1];
      if (typeof lruKey === "string") {
        const lruPeers = this.peersByInfoHash.get(lruKey);
        if (lruPeers && lruPeers.size > 0) {
          const oldestPeerIds = Array.from(lruPeers);
          const oldestPeerId = oldestPeerIds[0];
          if (typeof oldestPeerId === "string") {
            const oldestPeer = this.peers.get(oldestPeerId);
            if (oldestPeer && oldestPeer.infoHash === infoHash) {
              this.removePeerFromTorrent(infoHash, oldestPeer);
            }
          }
        }
      }
    }

    peerIds.add(peer.id);
    this.peersByInfoHash.put(infoHash, peerIds);
    this.stats.incrementPeers();
  }

  private removePeerFromTorrent(infoHash: string, peer: Peer): void {
    const peerIds = this.peersByInfoHash.get(infoHash);
    if (!peerIds) return;

    peerIds.delete(peer.id);
    this.peersByInfoHash.put(infoHash, peerIds);

    peer.ws.close();
    this.peers.delete(peer.id);
    this.stats.decrementPeers();
  }

  private sendPeersToPeer(peer: Peer, infoHash: string): void {
    const peerIds = this.peersByInfoHash.get(infoHash);
    if (!peerIds || peerIds.size === 0) {
      this.sendPeersResponse(peer, []);
      return;
    }

    const peers: Array<{ peer_id: string; ip: string; port: number }> = [];
    for (const peerId of peerIds) {
      const otherPeer = this.peers.get(peerId);
      if (otherPeer && otherPeer.id !== peer.id) {
        peers.push({
          peer_id: otherPeer.peerId,
          ip: "127.0.0.1",
          port: otherPeer.port,
        });
      }
    }
    this.sendPeersResponse(peer, peers);
  }

  private sendPeersResponse(peer: Peer, peers: Array<{ peer_id: string; ip: string; port: number }>): void {
    const response = {
      action: "announce",
      info_hash: peer.infoHash,
      peer_id: peer.peerId,
      peers: peers.map(p => `${p.ip}:${p.port}`),
    };
    try {
      peer.ws.send(JSON.stringify(response));
    } catch (error) {
      console.error("[TRACKER] Failed to send peers response:", error);
    }
  }

  private sendError(peer: Peer, code: string, message: string): void {
    const response = { action: "error", code, message };
    try {
      peer.ws.send(JSON.stringify(response));
    } catch (error) {
      console.error("[TRACKER] Failed to send error response:", error);
    }
  }

  private evictLeastActivePeer(): void {
    if (this.peers.size === 0) return;
    let leastActivePeer: Peer | null = null;
    let leastActiveTime = Date.now();
    for (const peer of this.peers.values()) {
      if (peer.connectedAt < leastActiveTime) {
        leastActiveTime = peer.connectedAt;
        leastActivePeer = peer;
      }
    }
    if (leastActivePeer) {
      const peerIds = this.peersByInfoHash.get(leastActivePeer.infoHash);
      if (peerIds) {
        peerIds.delete(leastActivePeer.id);
        this.peersByInfoHash.put(leastActivePeer.infoHash, peerIds);
      }
      leastActivePeer.ws.close();
      this.peers.delete(leastActivePeer.id);
      this.stats.decrementPeers();
      console.log("[TRACKER] Evicted least active peer:", leastActivePeer.id);
    }
  }

  public getStats(): any {
    return {
      totalPeers: this.peers.size,
      totalTorrents: this.peersByInfoHash.getSize(),
      connections: this.stats.getConnections(),
      messages: this.stats.getMessages(),
      completed: this.stats.getCompleted(),
      downloaded: this.stats.getDownloaded(),
    };
  }

  public close(): void {
    for (const peer of this.peers.values()) {
      peer.ws.close();
    }
    this.peers.clear();
    this.peersByInfoHash.clear();
    if (this.server) {
      this.server.shutdown();
    }
    console.log("[TRACKER] WebSocket tracker closed");
  }
}

interface WebSocketTrackerOptions {
  hostname?: string;
  idleTimeout?: number;
  maxPeers?: number;
  maxPeersPerTorrent?: number;
  maxTorrents?: number;
}

const defaultOptions: WebSocketTrackerOptions = {
  hostname: "0.0.0.0",
  idleTimeout: 300000,
  maxPeers: 1000,
  maxPeersPerTorrent: 50,
  maxTorrents: 100,
};
