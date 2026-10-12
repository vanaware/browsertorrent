/**
 * @file swarm.ts
 * @description Swarm management for the WebSocket BitTorrent tracker.
 * Groups peers by torrent info hash and coordinates peer discovery with LRU eviction.
 */

import { LRUCache } from "./lru.ts";
import { PeerConnectionManager } from "./peer.ts";

/**
 * Aggregated statistics and lifecycle info for an individual torrent swarm.
 */
export interface SwarmInfo {
  /** 20-byte torrent info hash identifying the swarm. */
  infoHash: string;
  /** Total number of peers currently in the swarm. */
  peerCount: number;
  /** Count of seeders that have 100% of the torrent data. */
  complete: number;
  /** Count of leechers actively downloading. */
  incomplete: number;
  /** Cumulative count of finished downloads reported to this tracker. */
  downloaded: number;
  /** Epoch timestamp in milliseconds when this swarm was first created. */
  createdAt: number;
  /** Epoch timestamp in milliseconds of the most recent announce in this swarm. */
  lastUpdated: number;
}

/**
 * Announcement payload used to register or update a peer inside a swarm.
 */
export interface PeerAnnounce {
  /** 20-byte peer identification string. */
  peerId: string;
  /** 20-byte torrent info hash. */
  infoHash: string;
  /** Peer listening port number (0 for WebRTC peers). */
  port: number;
  /** Uploaded bytes count. */
  uploaded: number;
  /** Downloaded bytes count. */
  downloaded: number;
  /** Bytes remaining until completion. */
  left: number;
  /** Lifecycle event string ("started", "completed", "stopped", etc.). */
  event?: string;
}

/**
 * Manages torrent swarms and their member peers using an LRU cache.
 *
 * @example
 * ```ts
 * import { SwarmManager } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const swarms = new SwarmManager(50, 200);
 * swarms.addPeer({
 *   infoHash: "01234567890123456789",
 *   peerId: "-BT0001-abcdef123456",
 *   port: 6881,
 *   uploaded: 0,
 *   downloaded: 0,
 *   left: 1048576,
 * });
 *
 * const peers = swarms.getPeers("01234567890123456789", 10);
 * console.log("Peers in swarm:", peers);
 * ```
 */
export class SwarmManager {
  private swarms: LRUCache<Set<string>>; // infoHash -> Set(peerIds)
  private peerManager: PeerConnectionManager;
  private readonly maxPeersPerTorrent: number;

  /**
   * Constructs a new SwarmManager.
   *
   * @param maxPeersPerTorrent - Maximum peers stored per torrent swarm (defaults to 50).
   * @param maxTorrents - Maximum number of distinct swarms tracked before LRU eviction (defaults to 100).
   */
  constructor(maxPeersPerTorrent: number = 50, maxTorrents: number = 100) {
    this.swarms = new LRUCache<Set<string>>(maxTorrents);
    this.peerManager = new PeerConnectionManager();
    this.maxPeersPerTorrent = maxPeersPerTorrent;
  }

  /**
   * Registers a peer within the specified torrent swarm.
   *
   * @param announce - Peer announcement data containing IDs and network metrics.
   */
  addPeer(announce: PeerAnnounce): void {
    const { infoHash, peerId } = announce;

    // Get or create peer set for this torrent
    let peerIds = this.swarms.get(infoHash);
    if (!peerIds) {
      peerIds = new Set();
    }

    // Check if we're at max peers per torrent
    if (peerIds.size >= this.maxPeersPerTorrent) {
      // Remove the oldest peer from this torrent
      const oldestPeerId = Array.from(peerIds)[0];
      if (oldestPeerId) {
        peerIds.delete(oldestPeerId);
      }
    }

    // Add peer to swarm
    peerIds.add(peerId);
    this.swarms.put(infoHash, peerIds);

    // Update peer manager
    this.peerManager.addConnection(
      {} as unknown as WebSocket, // Placeholder - actual WS passed from server
      peerId,
      infoHash,
      announce.port,
    );

    console.log("[SWARM] Peer", peerId, "added to swarm", infoHash);
  }

  /**
   * Removes a peer from the specified swarm and closes its connection entry.
   *
   * @param infoHash - Torrent info hash.
   * @param peerId - Peer ID to remove.
   */
  removePeer(infoHash: string, peerId: string): void {
    const peerIds = this.swarms.get(infoHash);
    if (!peerIds) return;

    peerIds.delete(peerId);
    this.swarms.put(infoHash, peerIds);

    this.peerManager.removeConnection(peerId);

    console.log("[SWARM] Peer", peerId, "removed from swarm", infoHash);
  }

  /**
   * Retrieves a subset of peer IDs from a swarm to return to an announcing client.
   *
   * @param infoHash - Torrent info hash.
   * @param numwant - Maximum number of peer IDs requested (defaults to 50).
   * @returns An array of peer ID strings.
   */
  getPeers(infoHash: string, numwant: number = 50): string[] {
    const peerIds = this.swarms.get(infoHash);
    if (!peerIds) return [];

    // Return up to numwant peers
    const peers = Array.from(peerIds);
    return peers.slice(0, numwant);
  }

  /**
   * Generates a snapshot of swarm statistics for a particular torrent.
   *
   * @param infoHash - Torrent info hash.
   * @returns A {@link SwarmInfo} object with peer counts and status.
   */
  getSwarmInfo(infoHash: string): SwarmInfo {
    const peerIds = this.swarms.get(infoHash);
    const peerCount = peerIds ? peerIds.size : 0;

    return {
      infoHash,
      peerCount,
      complete: peerCount, // Simplified - all peers are considered "complete"
      incomplete: 0,
      downloaded: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Returns snapshot statistics for all currently tracked swarms.
   *
   * @returns An array of {@link SwarmInfo} objects.
   */
  getAllSwarmInfo(): SwarmInfo[] {
    const swarms: SwarmInfo[] = [];

    for (const [infoHash] of this.swarms.entries()) {
      swarms.push(this.getSwarmInfo(infoHash));
    }

    return swarms;
  }

  /**
   * Returns the total count of distinct active torrent swarms.
   *
   * @returns Number of active swarms.
   */
  getSwarmCount(): number {
    return this.swarms.getSize();
  }

  /**
   * Returns the sum of all peers across all active swarms.
   *
   * @returns Total peer instances across all swarms.
   */
  getTotalPeerCount(): number {
    let total = 0;
    for (const peerIds of this.swarms.values()) {
      total += peerIds.size;
    }
    return total;
  }

  /**
   * Clears all swarms and evicts all connected peers.
   */
  clear(): void {
    this.swarms.clear();
    this.peerManager.clear();
  }
}
