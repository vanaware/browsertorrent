/**
 * @module peer
 *
 * # @vanaware/browsertorrent-tracker/peer
 *
 * Peer connection management for the WebSocket tracker.
 * Tracks individual connected peers, their metadata, statistics, and socket handles.
 */

/**
 * Metadata and tracking state for an individual connected peer.
 */
export interface PeerInfo {
  /** Internal unique identifier (UUID) generated for this session. */
  id: string;
  /** 20-byte BitTorrent peer identification string. */
  peerId: string;
  /** Primary torrent info hash associated with this peer. */
  infoHash: string;
  /** Listening port number, or 0 for browser-only WebRTC peers. */
  port: number;
  /** Cumulative bytes uploaded reported by the peer. */
  uploaded: number;
  /** Cumulative bytes downloaded reported by the peer. */
  downloaded: number;
  /** Number of bytes left to download until complete. */
  left: number;
  /** Current lifecycle event (e.g., "started", "completed", "stopped"). */
  event?: string;
  /** Timestamp in milliseconds when the peer first connected. */
  connectedAt: number;
  /** Timestamp in milliseconds when the peer was last active. */
  lastSeen: number;
}

/**
 * Active WebSocket connection combined with peer metadata.
 */
export interface PeerConnection {
  /** The live WebSocket socket for communication with the peer. */
  ws: WebSocket;
  /** Descriptive metadata and statistics for the peer. */
  info: PeerInfo;
}

/**
 * Manages active peer connections with bounded capacity and state tracking.
 *
 * @example
 * ```ts
 * import { PeerConnectionManager } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const manager = new PeerConnectionManager(500);
 * const info = manager.addConnection(
 *   fakeWebSocket,
 *   "-BT0001-abcdef123456",
 *   "01234567890123456789",
 *   6881
 * );
 * console.log("Connected peer:", info.peerId);
 * ```
 */
export class PeerConnectionManager {
  private connections: Map<string, PeerConnection>;
  private readonly maxConnections: number;

  /**
   * Constructs a new PeerConnectionManager.
   *
   * @param maxConnections - Maximum allowed concurrent connections before evicting the oldest (defaults to 1000).
   */
  constructor(maxConnections: number = 1000,) {
    this.connections = new Map();
    this.maxConnections = maxConnections;
  }

  /**
   * Registers a new peer connection and stores its metadata.
   *
   * @param ws - The open WebSocket instance for the peer.
   * @param peerId - The 20-byte peer identification string.
   * @param infoHash - The primary torrent info hash.
   * @param port - The peer listening port.
   * @returns Newly initialized {@link PeerInfo} object.
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
   * Looks up an active connection by its peer ID and updates its last-seen timestamp.
   *
   * @param peerId - The peer ID to search for.
   * @returns The {@link PeerConnection} if found, otherwise `undefined`.
   */
  getConnection(peerId: string,): PeerConnection | undefined {
    const conn = this.connections.get(peerId,);
    if (conn) {
      conn.info.lastSeen = Date.now();
    }
    return conn;
  }

  /**
   * Updates transfer counters and activity timestamp for a given peer.
   *
   * @param peerId - Target peer ID.
   * @param uploaded - Cumulative bytes uploaded.
   * @param downloaded - Cumulative bytes downloaded.
   * @param left - Bytes remaining.
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
   * Updates the latest event string received from a peer.
   *
   * @param peerId - Target peer ID.
   * @param event - Event name (e.g. "started", "completed", "stopped").
   */
  updateEvent(peerId: string, event: string,): void {
    const conn = this.connections.get(peerId,);
    if (conn) {
      conn.info.event = event;
      conn.info.lastSeen = Date.now();
    }
  }

  /**
   * Closes the underlying socket and removes the peer from the connection pool.
   *
   * @param peerId - The peer ID to disconnect and remove.
   * @returns `true` if the connection existed and was closed, `false` otherwise.
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
   * Retrieves all peer metadata associated with a particular info hash.
   *
   * @param infoHash - The 20-byte torrent info hash.
   * @returns An array of {@link PeerInfo} records.
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
   * Retrieves all peer ID strings registered under a particular info hash.
   *
   * @param infoHash - The 20-byte torrent info hash.
   * @returns An array of string peer IDs.
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
   * Returns the total count of currently open peer connections.
   *
   * @returns Current connection count.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Returns an array containing all active peer connections.
   *
   * @returns An array of {@link PeerConnection} objects.
   */
  getAllConnections(): PeerConnection[] {
    return Array.from(this.connections.values(),);
  }

  /**
   * Closes all active WebSocket connections and clears the connection pool.
   */
  clear(): void {
    for (const conn of this.connections.values()) {
      conn.ws.close();
    }
    this.connections.clear();
  }

  /**
   * Evicts the oldest connected peer when connection limits are reached.
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
