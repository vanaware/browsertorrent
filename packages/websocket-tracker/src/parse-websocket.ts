/**
 * WebSocket message parsing for BEP-15/31 tracker protocol.
 * Parses incoming messages and formats responses.
 */

export interface TrackerAnnounceRequest {
  action: "announce";
  info_hash: string;
  peer_id: string;
  port: number;
  uploaded?: number;
  downloaded?: number;
  left?: number;
  event?: "started" | "completed" | "stopped" | "";
  numwant?: number;
  compact?: number;
  no_peer_id?: number;
}

export interface TrackerScrapeRequest {
  action: "scrape";
  info_hash: string;
  peer_id: string;
}

export interface TrackerErrorResponse {
  action: "error";
  code: string;
  message: string;
}

export interface TrackerAnnounceResponse {
  action: "announce";
  info_hash: string;
  peer_id: string;
  peers: string[]; // Array of "ip:port" strings
}

export interface TrackerScrapeResponse {
  action: "scrape";
  info_hash: string;
  complete: number;
  incomplete: number;
  downloaded: number;
}

export type TrackerMessage = TrackerAnnounceRequest | TrackerScrapeRequest;
export type TrackerResponse =
  | TrackerAnnounceResponse
  | TrackerScrapeResponse
  | TrackerErrorResponse;

/**
 * Parse an incoming WebSocket message.
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
 * Parse an announce request.
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
 * Parse a scrape request.
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
 * Format an error response.
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
 * Format an announce response.
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
 * Format a scrape response.
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
 * Validate a tracker message.
 */
export function validateTrackerMessage(message: TrackerMessage,): boolean {
  // Validate info_hash format (should be 20-byte hex string)
  if (!message.info_hash || message.info_hash.length < 20) {
    return false;
  }

  // Validate peer_id format (should be 20-byte string)
  if (!message.peer_id || message.peer_id.length < 20) {
    return false;
  }

  // Validate port range
  if ("port" in message) {
    const port = Number(message.port,);
    if (port < 1 || port > 65535) {
      return false;
    }
  }

  return true;
}
