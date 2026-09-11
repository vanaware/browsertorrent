/** A peer endpoint returned by a tracker. */
export interface PeerEndpoint {
  /** IPv4/IPv6 literal or DNS hostname. */
  hostname: string;
  /** TCP/uTP listening port. */
  port: number;
  /** Address family advertised by the tracker. */
  family: "ipv4" | "ipv6";
  /** Optional 20-byte peer ID from a non-compact response. */
  peerId?: Uint8Array;
}

/** Lifecycle event sent to a tracker. */
export type TrackerEvent = "started" | "completed" | "stopped";

/** Parameters for one tracker announce. */
export interface TrackerAnnounceRequest {
  /** HTTP(S) or UDP tracker URL. */
  tracker: string;
  /** Torrent v1 info hash (20 bytes). */
  infoHash: Uint8Array;
  /** Local BitTorrent peer ID (20 bytes). */
  peerId: Uint8Array;
  /** Local peer listening port. */
  port: number;
  /** Bytes uploaded for this torrent. */
  uploaded?: number;
  /** Bytes downloaded for this torrent. */
  downloaded?: number;
  /** Bytes remaining for this torrent. */
  left: number;
  /** Optional lifecycle event. */
  event?: TrackerEvent;
  /** Maximum requested peers, from 0 through 2,000. */
  numWant?: number;
  /** Optional unsigned 32-bit client key. */
  key?: number;
  /** Tracker ID returned by an earlier announce. */
  trackerId?: string;
  /** Cancels the announce without attempting another tracker. */
  signal?: AbortSignal;
  /** Per-announce timeout in milliseconds. */
  timeoutMs?: number;
}

/** Parameters shared by each candidate passed to `announceAny`. */
export interface TrackerAnnounceAnyRequest
  extends Omit<TrackerAnnounceRequest, "tracker"> {
  /** Total deadline across all candidates, in milliseconds. */
  overallTimeoutMs?: number;
}

/** Normalized tracker announce result. */
export interface TrackerAnnounceResponse {
  /** Original tracker URL used for the announce. */
  tracker: string;
  /** Requested delay before the next announce, in seconds. */
  interval: number;
  /** Optional lower bound for the next announce, in seconds. */
  minInterval?: number;
  /** Tracker-provided identifier for subsequent announces. */
  trackerId?: string;
  /** Non-fatal tracker warning. */
  warning?: string;
  /** Number of complete peers reported by the tracker. */
  complete?: number;
  /** Number of incomplete peers reported by the tracker. */
  incomplete?: number;
  /** Deduplicated, validated peer endpoints. */
  peers: PeerEndpoint[];
}

/** Minimal interface implemented by tracker transports. */
export interface AnnounceClient {
  /** Announces one torrent and returns normalized tracker data. */
  announce(request: TrackerAnnounceRequest): Promise<TrackerAnnounceResponse>;
}

/** Error raised for invalid requests or tracker protocol failures. */
export class TrackerError extends Error {
  /** Creates a tracker error with an optional underlying cause. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TrackerError";
  }
}
