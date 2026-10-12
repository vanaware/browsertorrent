/**
 * @module parse-websocket
 *
 * # @vanaware/browsertorrent-tracker/parse-websocket
 *
 * WebSocket message parsing and serialization for the BEP 15/31 BitTorrent tracker protocol.
 * Validates incoming JSON messages from WebTorrent/BrowserTorrent peers and formats standard responses.
 */

/**
 * Announce request message sent by a BitTorrent peer over WebSocket.
 * Follows the WebTorrent WebSocket tracker specification.
 */
export interface TrackerAnnounceRequest {
  /** The action type, always "announce". */
  action: "announce";
  /** 20-byte torrent info hash as a binary string or 40-character hex. */
  info_hash: string;
  /** 20-byte peer identification string. */
  peer_id: string;
  /** Port number the peer is listening on, or 0 for pure WebRTC browser peers. */
  port: number;
  /** Total bytes uploaded so far. */
  uploaded?: number;
  /** Total bytes downloaded so far. */
  downloaded?: number;
  /** Bytes left to download until complete. */
  left?: number;
  /** Event state notification: "started", "completed", "stopped", or empty string. */
  event?: "started" | "completed" | "stopped" | "";
  /** Number of peer addresses requested (defaults to 50). */
  numwant?: number;
  /** Whether compact peer representation is requested (1 or 0). */
  compact?: number;
  /** Whether the tracker should omit peer IDs in the response (1 or 0). */
  no_peer_id?: number;
  /** Optional WebRTC offer payload forwarded to other peers. */
  offer?: unknown;
  /** Unique ID for the WebRTC offer. */
  offer_id?: string;
  /** WebRTC answer payload forwarded to the offering peer. */
  answer?: unknown;
  /** Target peer ID to which an answer or offer is directed. */
  to_peer_id?: string;
  /** Array of WebRTC offers to be stored in the tracker pool. */
  offers?: Array<{ offer: unknown; offer_id: string }>;
}

/**
 * Scrape request message sent by a peer to query swarm statistics without joining.
 */
export interface TrackerScrapeRequest {
  /** The action type, always "scrape". */
  action: "scrape";
  /** 20-byte torrent info hash. */
  info_hash: string;
  /** 20-byte peer identification string. */
  peer_id: string;
}

/**
 * Standard error response formatted and sent to a connected peer.
 */
export interface TrackerErrorResponse {
  /** The action type, always "error". */
  action: "error";
  /** Error code identifier (e.g., "invalid_message", "unsupported_action"). */
  code: string;
  /** Human-readable explanation of why the request failed. */
  message: string;
}

/**
 * Announce response message returned to an announcing peer.
 */
export interface TrackerAnnounceResponse {
  /** The action type, always "announce". */
  action: "announce";
  /** The torrent info hash associated with this announce. */
  info_hash: string;
  /** Target peer identification string. */
  peer_id: string;
  /** List of peer addresses formatted as "ip:port" or peer objects. */
  peers: string[];
}

/**
 * Scrape response containing aggregated stats for a torrent swarm.
 */
export interface TrackerScrapeResponse {
  /** The action type, always "scrape". */
  action: "scrape";
  /** Torrent info hash queried. */
  info_hash: string;
  /** Number of complete seeders in the swarm. */
  complete: number;
  /** Number of active incomplete leechers in the swarm. */
  incomplete: number;
  /** Total number of completed downloads recorded by the tracker. */
  downloaded: number;
}

/**
 * Union of all supported incoming WebSocket tracker requests.
 */
export type TrackerMessage = TrackerAnnounceRequest | TrackerScrapeRequest;

/**
 * Union of all outgoing WebSocket tracker responses.
 */
export type TrackerResponse =
  | TrackerAnnounceResponse
  | TrackerScrapeResponse
  | TrackerErrorResponse;

/**
 * Parses and validates an incoming raw JSON string message from a WebSocket client.
 *
 * @param data - The raw string message received over the WebSocket connection.
 * @returns A validated {@link TrackerMessage} object, or `null` if the message is malformed.
 *
 * @example
 * ```ts
 * import { parseWebSocketMessage } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const raw = JSON.stringify({
 *   action: "announce",
 *   info_hash: "01234567890123456789",
 *   peer_id: "-BT0001-abcdef123456",
 *   port: 6881,
 * });
 *
 * const msg = parseWebSocketMessage(raw);
 * if (msg && msg.action === "announce") {
 *   console.log("Announce for info hash:", msg.info_hash);
 * }
 * ```
 */
export function parseWebSocketMessage(data: string,): TrackerMessage | null {
  try {
    const parsed = JSON.parse(data,);

    // Validate required fields
    if (!parsed.action || !parsed.info_hash || !parsed.peer_id) {
      return null;
    }

    // Parse based on action type
    switch (parsed.action) {
      case "announce":
        return parseAnnounceRequest(parsed,);
      case "scrape":
        return parseScrapeRequest(parsed,);
      default:
        return null;
    }
  } catch (error) {
    console.error("[PARSE] Failed to parse message:", error,);
    return null;
  }
}

/**
 * Parses an announce request record.
 */
function parseAnnounceRequest(
  data: Record<string, unknown>,
): TrackerAnnounceRequest | null {
  // Validate required fields
  if (!data.info_hash || !data.peer_id || !data.port) {
    return null;
  }

  return {
    action: "announce",
    info_hash: String(data.info_hash,),
    peer_id: String(data.peer_id,),
    port: Number(data.port,),
    uploaded: Number(data.uploaded,) || 0,
    downloaded: Number(data.downloaded,) || 0,
    left: Number(data.left,) || 0,
    event: (data.event as TrackerAnnounceRequest["event"]) || "",
    numwant: Number(data.numwant,) || 50,
    compact: Number(data.compact,) || 0,
    no_peer_id: Number(data.no_peer_id,) || 0,
  };
}

/**
 * Parses a scrape request record.
 */
function parseScrapeRequest(
  data: Record<string, unknown>,
): TrackerScrapeRequest | null {
  // Validate required fields
  if (!data.info_hash || !data.peer_id) {
    return null;
  }

  return {
    action: "scrape",
    info_hash: String(data.info_hash,),
    peer_id: String(data.peer_id,),
  };
}

/**
 * Formats a standardized error response object.
 *
 * @param code - Short machine-readable error code.
 * @param message - Human-readable explanation.
 * @returns A formatted {@link TrackerErrorResponse} object.
 *
 * @example
 * ```ts
 * import { formatErrorResponse } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const error = formatErrorResponse("invalid_hash", "Info hash is too short");
 * console.log(JSON.stringify(error));
 * ```
 */
export function formatErrorResponse(
  code: string,
  message: string,
): TrackerErrorResponse {
  return {
    action: "error",
    code,
    message,
  };
}

/**
 * Formats a standardized announce response object.
 *
 * @param infoHash - Torrent info hash.
 * @param peerId - The target peer ID.
 * @param peers - Array of peer addresses formatted as strings.
 * @returns A formatted {@link TrackerAnnounceResponse} object.
 *
 * @example
 * ```ts
 * import { formatAnnounceResponse } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const resp = formatAnnounceResponse(
 *   "01234567890123456789",
 *   "-BT0001-abcdef123456",
 *   ["192.168.1.10:6881"]
 * );
 * ```
 */
export function formatAnnounceResponse(
  infoHash: string,
  peerId: string,
  peers: string[],
): TrackerAnnounceResponse {
  return {
    action: "announce",
    info_hash: infoHash,
    peer_id: peerId,
    peers,
  };
}

/**
 * Formats a standardized scrape response object.
 *
 * @param infoHash - Torrent info hash.
 * @param complete - Number of seeders.
 * @param incomplete - Number of leechers.
 * @param downloaded - Number of completed downloads.
 * @returns A formatted {@link TrackerScrapeResponse} object.
 *
 * @example
 * ```ts
 * import { formatScrapeResponse } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const scrape = formatScrapeResponse("01234567890123456789", 5, 2, 10);
 * console.log("Complete seeders:", scrape.complete);
 * ```
 */
export function formatScrapeResponse(
  infoHash: string,
  complete: number,
  incomplete: number,
  downloaded: number,
): TrackerScrapeResponse {
  return {
    action: "scrape",
    info_hash: infoHash,
    complete,
    incomplete,
    downloaded,
  };
}

/**
 * Validates essential fields and formatting of a tracker message.
 *
 * @param message - The parsed {@link TrackerMessage} to validate.
 * @returns `true` if valid, `false` otherwise.
 *
 * @example
 * ```ts
 * import { validateTrackerMessage } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const isValid = validateTrackerMessage({
 *   action: "announce",
 *   info_hash: "01234567890123456789",
 *   peer_id: "-BT0001-abcdef123456",
 *   port: 6881,
 * });
 * console.log("Message valid:", isValid);
 * ```
 */
export function validateTrackerMessage(message: TrackerMessage,): boolean {
  // Validate info_hash format (should be at least 20-byte string)
  if (!message.info_hash || message.info_hash.length < 20) {
    return false;
  }

  // Validate peer_id format (should be at least 20-byte string)
  if (!message.peer_id || message.peer_id.length < 20) {
    return false;
  }

  // Validate port range if present
  if ("port" in message) {
    const port = Number(message.port,);
    if (port < 1 || port > 65535) {
      return false;
    }
  }

  return true;
}
