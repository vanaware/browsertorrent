/**
 * Swarm management for WebSocket tracker.
 * Handles peer discovery and swarm state.
 */

import { LRUCache, } from "./lru.ts";
import { PeerConnectionManager, } from "./peer.ts";

export interface SwarmInfo {
  infoHash: string;
  peerCount: number;
  complete: number;
  incomplete: number;
  downloaded: number;
  createdAt: number;
  lastUpdated: number;
}

export interface PeerAnnounce {
  peerId: string;
  infoHash: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
  event?: string;
}

/**
 * Manages swarms (torrents) and their peers.
 * Uses LRU cache for efficient peer management.
 */
export class SwarmManager {
  private swarms: LRUCache<Set<string>>; // infoHash -> Set(peerIds)
  private peerManager: PeerConnectionManager;
  private readonly maxPeersPerTorrent: number;

  constructor(maxPeersPerTorrent: number = 50, maxTorrents: number = 100,) {
    this.swarms = new LRUCache<Set<string>>(maxTorrents,);
    this.peerManager = new PeerConnectionManager();
    this.maxPeersPerTorrent = maxPeersPerTorrent;
  }

  /**
   * Add a peer to a swarm (torrent).
   */
  addPeer(announce: PeerAnnounce,): void {
    const { infoHash, peerId, } = announce;

    // Get or create peer set for this torrent
    let peerIds = this.swarms.get(infoHash,);
    if (!peerIds) {
      peerIds = new Set();
    }

    // Check if we're at max peers per torrent
    if (peerIds.size >= this.maxPeersPerTorrent) {
      // Remove the oldest peer from this torrent
      const oldestPeerId = Array.from(peerIds,)[0];
      if (oldestPeerId) {
        peerIds.delete(oldestPeerId,);
      }
    }

    // Add peer to swarm
    peerIds.add(peerId,);
    this.swarms.put(infoHash, peerIds,);

    // Update peer manager
    this.peerManager.addConnection(
      {} as unknown as WebSocket, // Placeholder - actual WS passed from server
      peerId,
      infoHash,
      announce.port,
    );

    console.log("[SWARM] Peer", peerId, "added to swarm", infoHash,);
  }

  /**
   * Remove a peer from a swarm (torrent).
   */
  removePeer(infoHash: string, peerId: string,): void {
    const peerIds = this.swarms.get(infoHash,);
    if (!peerIds) return;

    peerIds.delete(peerId,);
    this.swarms.put(infoHash, peerIds,);

    this.peerManager.removeConnection(peerId,);

    console.log("[SWARM] Peer", peerId, "removed from swarm", infoHash,);
  }

  /**
   * Get peers for a specific torrent.
   */
  getPeers(infoHash: string, numwant: number = 50,): string[] {
    const peerIds = this.swarms.get(infoHash,);
    if (!peerIds) return [];

    // Return up to numwant peers
    const peers = Array.from(peerIds,);
    return peers.slice(0, numwant,);
  }

  /**
   * Get swarm info for a specific torrent.
   */
  getSwarmInfo(infoHash: string,): SwarmInfo {
    const peerIds = this.swarms.get(infoHash,);
    const peerCount = peerIds ? peerIds.size : 0;

    return {
      infoHash,
      peerCount,
      complete: peerCount, // Simplified - all peers are considered "complete"
      incomplete: 0,
      downloaded: 0, // Would need to track this separately
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get all swarm info.
   */
  getAllSwarmInfo(): SwarmInfo[] {
    const swarms: SwarmInfo[] = [];

    for (const [infoHash,] of this.swarms.entries()) {
      swarms.push(this.getSwarmInfo(infoHash,),);
    }

    return swarms;
  }

  /**
   * Get total number of swarms.
   */
  getSwarmCount(): number {
    return this.swarms.getSize();
  }

  /**
   * Get total number of peers across all swarms.
   */
  getTotalPeerCount(): number {
    let total = 0;
    for (const peerIds of this.swarms.values()) {
      total += peerIds.size;
    }
    return total;
  }

  /**
   * Clear all swarms.
   */
  clear(): void {
    this.swarms.clear();
    this.peerManager.clear();
  }
}
