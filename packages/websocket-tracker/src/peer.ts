/**
 * Peer connection management for WebSocket tracker.
 * Handles individual peer connections and state.
 */

export interface PeerInfo {
  id: string;
  peerId: string;
  infoHash: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
  event?: string;
  connectedAt: number;
  lastSeen: number;
}

export interface PeerConnection {
  ws: WebSocket;
  info: PeerInfo;
}

/**
 * Manages individual peer connections with state tracking.
 */
export class PeerConnectionManager {
  private connections: Map<string, PeerConnection>;
  private readonly maxConnections: number;

  constructor(maxConnections: number = 1000,) {
    this.connections = new Map();
    this.maxConnections = maxConnections;
  }

  /**
   * Add a new peer connection.
   */
  addConnection(
    ws: WebSocket,
    peerId: string,
    infoHash: string,
    port: number,
  ): PeerInfo {
    // Check if we're at max connections
    if (this.connections.size >= this.maxConnections) {
      this.evictOldestConnection();
    }

    const info: PeerInfo = {
      id: crypto.randomUUID(),
      peerId,
      infoHash,
      port,
      uploaded: 0,
      downloaded: 0,
      left: 0,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
    };

    this.connections.set(peerId, { ws, info, },);

    return info;
  }

  /**
   * Get a peer connection by peer ID.
   */
  getConnection(peerId: string,): PeerConnection | undefined {
    const conn = this.connections.get(peerId,);
    if (conn) {
      conn.info.lastSeen = Date.now();
    }
    return conn;
  }

  /**
   * Update peer stats.
   */
  updateStats(
    peerId: string,
    uploaded: number,
    downloaded: number,
    left: number,
  ): void {
    const conn = this.connections.get(peerId,);
    if (conn) {
      conn.info.uploaded = uploaded;
      conn.info.downloaded = downloaded;
      conn.info.left = left;
      conn.info.lastSeen = Date.now();
    }
  }

  /**
   * Update peer event.
   */
  updateEvent(peerId: string, event: string,): void {
    const conn = this.connections.get(peerId,);
    if (conn) {
      conn.info.event = event;
      conn.info.lastSeen = Date.now();
    }
  }

  /**
   * Remove a peer connection.
   */
  removeConnection(peerId: string,): boolean {
    const conn = this.connections.get(peerId,);
    if (conn) {
      conn.ws.close();
      this.connections.delete(peerId,);
      return true;
    }
    return false;
  }

  /**
   * Get all peers for a specific infoHash.
   */
  getPeersByInfoHash(infoHash: string,): PeerInfo[] {
    const peers: PeerInfo[] = [];

    for (const conn of this.connections.values()) {
      if (conn.info.infoHash === infoHash) {
        peers.push(conn.info,);
      }
    }

    return peers;
  }

  /**
   * Get all peer IDs for a specific infoHash.
   */
  getPeerIdsByInfoHash(infoHash: string,): string[] {
    const peerIds: string[] = [];

    for (const conn of this.connections.values()) {
      if (conn.info.infoHash === infoHash) {
        peerIds.push(conn.info.peerId,);
      }
    }

    return peerIds;
  }

  /**
   * Get total number of connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all connections.
   */
  getAllConnections(): PeerConnection[] {
    return Array.from(this.connections.values(),);
  }

  /**
   * Clear all connections.
   */
  clear(): void {
    for (const conn of this.connections.values()) {
      conn.ws.close();
    }
    this.connections.clear();
  }

  /**
   * Evict the oldest connection to make room for new ones.
   */
  private evictOldestConnection(): void {
    let oldestPeerId: string | null = null;
    let oldestTime = Infinity;

    for (const [peerId, conn,] of this.connections.entries()) {
      if (conn.info.connectedAt < oldestTime) {
        oldestTime = conn.info.connectedAt;
        oldestPeerId = peerId;
      }
    }

    if (oldestPeerId) {
      this.removeConnection(oldestPeerId,);
      console.log("[PEER] Evicted oldest connection:", oldestPeerId,);
    }
  }
}
