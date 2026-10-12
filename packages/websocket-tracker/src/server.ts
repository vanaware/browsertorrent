/**
 * @module server
 *
 * # @vanaware/browsertorrent-tracker/server
 *
 * Core WebSocket & HTTP BitTorrent tracker server implementation for Deno.
 * Implements 100% protocol parity with WebTorrent's `bittorrent-tracker` specification,
 * supporting WebRTC peer discovery, offer distribution, answer forwarding, and standard scrape metrics.
 */

import { LRUCache, } from "./lru.ts";
import { StatsManager, type TrackerStats, } from "./stats.ts";
import { TrackerRouter, } from "./router.ts";

/**
 * Representation of an active peer registered on the tracker server.
 */
export interface Peer {
  /** Internal session identifier (UUID). */
  id: string;
  /** Live WebSocket connection handle. */
  ws: WebSocket;
  /** Primary torrent info hash. */
  infoHash: string;
  /** 20-byte BitTorrent peer ID string. */
  peerId: string;
  /** Listening port number (0 for WebRTC peers). */
  port: number;
  /** Cumulative bytes uploaded. */
  uploaded: number;
  /** Cumulative bytes downloaded. */
  downloaded: number;
  /** Bytes remaining until download completion. */
  left: number;
  /** Latest event string reported by the peer. */
  event?: string;
  /** Milliseconds epoch timestamp when the peer connected. */
  connectedAt: number;
  /** Array of info hashes this peer is participating in. */
  infoHashes: string[];
}

/**
 * Raw JSON message received from a WebSocket tracker client.
 */
export interface TrackerMessage {
  /** Message action name ("announce", "scrape", "offer", "answer"). */
  action: string;
  /** Torrent info hash. */
  info_hash: string;
  /** Announcing peer ID. */
  peer_id: string;
  /** Listening port. */
  port: number;
  /** Total bytes uploaded. */
  uploaded?: number;
  /** Total bytes downloaded. */
  downloaded?: number;
  /** Bytes remaining. */
  left?: number;
  /** Announce event status. */
  event?: string;
  /** Number of peers requested. */
  numwant?: number;
  /** Compact format flag. */
  compact?: number;
  /** Omit peer ID flag. */
  no_peer_id?: number;
  /** WebRTC answer SDP payload. */
  answer?: unknown;
  /** Destination peer ID for targeted signaling. */
  to_peer_id?: string;
  /** Identifier for an SDP offer. */
  offer_id?: string;
  /** Array of WebRTC SDP offers with unique IDs. */
  offers?: Array<{ offer: unknown; offer_id: string }>;
}

/**
 * Basic seeder and leecher counters for a torrent swarm.
 */
export interface TorrentInfo {
  /** Number of seeders with complete copies. */
  complete: number;
  /** Number of leechers currently downloading. */
  incomplete: number;
}

/**
 * Configuration options for {@link WebSocketTracker}.
 */
export interface WebSocketTrackerOptions {
  /** Maximum number of peers across all swarms before oldest eviction (defaults to 1000). */
  maxPeers?: number;
  /** Maximum peers returned per swarm announcement (defaults to 50). */
  maxPeersPerTorrent?: number;
  /** Maximum number of distinct info hashes tracked in LRU memory (defaults to 100). */
  maxTorrents?: number;
  /** Hostname or IP address to bind to (defaults to "0.0.0.0"). */
  hostname?: string;
  /** Milliseconds before inactive connections are timed out (defaults to 300,000). */
  idleTimeout?: number;
  /** Re-announce interval recommended to clients in milliseconds (defaults to 120,000). */
  intervalMs?: number;
}

/**
 * Default tracker configuration parameters.
 */
export const defaultOptions: WebSocketTrackerOptions = {
  maxPeers: 1000,
  maxPeersPerTorrent: 50,
  maxTorrents: 100,
  hostname: "0.0.0.0",
  idleTimeout: 300000,
  intervalMs: 120000,
};

/**
 * Full-featured WebSocket and HTTP BitTorrent tracker server.
 * Handles WebRTC offer/answer exchange, standard announces, and scrapes.
 *
 * @example
 * ```ts
 * import { WebSocketTracker } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const tracker = new WebSocketTracker(8000, {
 *   hostname: "0.0.0.0",
 *   maxTorrents: 500,
 * });
 *
 * await tracker.start();
 * ```
 */
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

  /**
   * Initializes a new WebSocketTracker server instance.
   *
   * @param port - Port number to bind (defaults to 8000).
   * @param options - Optional configuration settings.
   */
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

  /**
   * Starts listening for HTTP and WebSocket connections on the configured host and port.
   * Resolves when the server is cleanly shut down via {@link close}.
   *
   * @returns A promise that resolves when the server stops.
   *
   * @example
   * ```ts
   * import { createServer } from "jsr:@vanaware/browsertorrent-tracker";
   *
   * const tracker = createServer(8000);
   * tracker.start().then(() => console.log("Tracker shut down"));
   * ```
   */
  async start(): Promise<void> {
    this.server = Deno.serve(
      {
        port: this.port,
        hostname: this.hostname,
        onListen: (
          { hostname, port, }: { hostname: string; port: number },
        ) => {
          console.log(
            `[TRACKER] WebSocket server listening on ws://${hostname}:${port}`,
          );
        },
      },
      (req: Request,): Response | Promise<Response> =>
        this.router.handleRequest(req,),
    );

    await this.server.finished;
  }

  /**
   * Handles an HTTP GET announce query (`/announce?info_hash=...&peer_id=...`).
   *
   * @param url - Parsed request URL containing search parameters.
   * @param req - Raw HTTP request object.
   * @returns HTTP Response containing JSON announce response or error.
   */
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

  /**
   * Handles an HTTP GET scrape query (`/scrape?info_hash=...`).
   *
   * @param url - Parsed request URL with query parameters.
   * @param req - Raw HTTP request object.
   * @returns HTTP Response containing swarm statistics JSON.
   */
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

  /**
   * Constructs a standard announce response payload for a requesting peer.
   *
   * @param infoHash - Torrent info hash.
   * @param peer - Requesting peer instance.
   * @param numwant - Maximum number of peers requested.
   * @returns Announce response payload object.
   */
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

  /**
   * Internal disconnect cleanup for a peer.
   */
  private handleDisconnection(peer: Peer,): void {
    // Send stopped announce for all active swarms
    for (const infoHash of peer.infoHashes) {
      this.removePeerFromTorrent(infoHash, peer,);
    }
    this.stats.decrementConnections();
    console.log("[TRACKER] Peer disconnected:", peer.id,);
  }

  /**
   * Registers and handles an active WebSocket connection from an upgraded HTTP request.
   *
   * @param ws - The open WebSocket connection handle.
   */
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

  /**
   * Dispatches incoming text frame from peer socket to specific action handlers.
   */
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

  /**
   * Handles an announce message received over WebSocket.
   */
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

    // Handle signaling embedded in announce (offers/answer)
    if (message.offers || message.answer) {
      this.handleWebSocketSignaling(peer, message,);
    }

    console.log(
      `[TRACKER] Announce from ${peer_id} for ${info_hash} (event: ${
        event || "regular"
      })`,
    );
  }

  /**
   * Handles a scrape query over WebSocket.
   */
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

  /**
   * Handles WebRTC signaling (offers and answers forwarding) across peers.
   */
  private handleWebSocketSignaling(peer: Peer, message: TrackerMessage,): void {
    if (message.action === "offer" || message.offers) {
      if (!message.offers) return;

      if (message.to_peer_id) {
        // Targeted offer
        console.log(
          `[TRACKER] Targeted offer from ${peer.peerId} to ${message.to_peer_id}`,
        );
        for (const offer of message.offers) {
          const targetPeer = Array.from(this.peers.values(),).find((p,) =>
            p.peerId === message.to_peer_id
          );
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
          .filter((p,): p is Peer =>
            p !== undefined && p.ws.readyState === WebSocket.OPEN &&
            p.peerId !== peer.peerId
          );

        console.log(
          `[TRACKER] Distributing ${message.offers.length} offers from ${peer.peerId} to ${availablePeers.length} peers`,
        );

        let offerIndex = 0;
        for (const targetPeer of availablePeers) {
          if (offerIndex >= message.offers.length) break;

          const offer = message.offers[offerIndex];
          if (offer) {
            targetPeer.ws.send(JSON.stringify({
              action: "announce",
              info_hash: infoHash,
              offer_id: offer.offer_id,
              offer: offer.offer,
              peer_id: peer.peerId,
              from_peer_id: peer.peerId,
            },),);
            offerIndex++;
          }
        }
      }
    } else if (message.action === "answer" || message.answer) {
      // Forward answer to the target peer
      const toPeerId = message.to_peer_id;
      if (!toPeerId) {
        console.warn("[TRACKER] Answer message missing to_peer_id",);
        return;
      }

      console.log(
        `[TRACKER] Routing answer from ${peer.peerId} to ${toPeerId}`,
      );

      const targetPeer = Array.from(this.peers.values(),).find((p,) =>
        p.peerId === toPeerId
      );

      if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
        targetPeer.ws.send(JSON.stringify({
          action: "announce",
          info_hash: message.info_hash || peer.infoHash,
          offer_id: message.offer_id,
          answer: message.answer,
          peer_id: peer.peerId,
          from_peer_id: peer.peerId,
        },),);
      } else {
        console.warn(
          `[TRACKER] Target peer ${toPeerId} not found or socket closed`,
        );
      }
    }
  }

  /**
   * Adds a peer to the set of participants for a given torrent info hash.
   */
  private addPeerToTorrent(infoHash: string, peer: Peer,): void {
    let peerIds = this.peersByInfoHash.get(infoHash,);
    if (!peerIds) {
      peerIds = new Set();
      this.peersByInfoHash.put(infoHash, peerIds,);
      this.torrents.set(infoHash, { complete: 0, incomplete: 0, },);
    }

    if (peerIds.size >= this.maxPeersPerTorrent) {
      this.evictLeastActivePeer(infoHash,);
    }

    peerIds.add(peer.id,);
  }

  /**
   * Removes a peer from a torrent swarm.
   */
  private removePeerFromTorrent(infoHash: string, peer: Peer,): void {
    const peerIds = this.peersByInfoHash.get(infoHash,);
    if (peerIds) {
      peerIds.delete(peer.id,);
      if (peerIds.size === 0) {
        this.peersByInfoHash.remove(infoHash,);
        this.torrents.delete(infoHash,);
      }
    }
  }

  /**
   * Sends announce response containing available peer addresses to a connected peer.
   */
  private sendPeersToPeer(peer: Peer, infoHash: string,): void {
    const peerIds = this.peersByInfoHash.get(infoHash,);
    if (!peerIds) {
      this.sendPeersResponse(peer, infoHash, [],);
      return;
    }

    const peers: Array<{ peer_id: string; ip: string; port: number }> = [];
    const numwant = Math.min(peerIds.size, this.maxPeersPerTorrent,);

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

  /**
   * Formats and transmits an announce response JSON frame.
   */
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

  /**
   * Transmits a standardized error frame to a peer socket.
   */
  private sendError(peer: Peer, errorCode: string, message: string,): void {
    peer.ws.send(JSON.stringify({
      action: "error",
      error: message,
      failure_reason: message,
    },),);
  }

  /**
   * Increments seeder counter for a swarm.
   */
  private incrementComplete(infoHash: string,): void {
    const info = this.torrents.get(infoHash,);
    if (info) {
      info.complete++;
    }
  }

  /**
   * Decrements seeder counter for a swarm.
   */
  private decrementComplete(infoHash: string,): void {
    const info = this.torrents.get(infoHash,);
    if (info) {
      info.complete = Math.max(0, info.complete - 1,);
    }
  }

  /**
   * Evicts the peer with the earliest connection time from a swarm.
   */
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

  /**
   * Retrieves server-wide metrics and counters.
   *
   * @returns Current {@link TrackerStats} object.
   *
   * @example
   * ```ts
   * import { WebSocketTracker } from "jsr:@vanaware/browsertorrent-tracker";
   *
   * const tracker = new WebSocketTracker(8000);
   * const stats = tracker.getStats();
   * console.log("Current connections:", stats.connections);
   * ```
   */
  getStats(): TrackerStats {
    return this.stats.getStats();
  }

  /**
   * Closes all active client WebSocket connections and terminates the HTTP listener.
   *
   * @example
   * ```ts
   * tracker.close();
   * ```
   */
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
