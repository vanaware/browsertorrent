// /loco/monorepo/webtorrent/src/network/tracker.ts
/**
 * BitTorrent tracker clients (HTTP + WebSocket).
 *
 * Adaptado de deno-torrent/torrent-tracker/ (http.ts, compact.ts, types.ts,
 * request.ts). Browser-first: `fetch`-based, sem transporte UDP.
 *
 * Mudanças em relação à versão anterior do Loco:
 * - `info_hash`/`peer_id` agora usam percent-encoding byte-a-byte (BEP 3).
 *   A versão anterior usava `URLSearchParams` com binary string, que corrompia
 *   bytes > 0x7F ao re-encodar como UTF-8.
 * - Suporte a peers compactos IPv6 (`peers6`, BEP 7) e deduplicação.
 * - `failure reason` agora gera erro tipado `TrackerError`.
 * - Limites de recursos: tamanho de resposta, URL, numwant, dicionário de peers.
 * - `trackerid` retornado pelo tracker é reenviado nos announces seguintes.
 *
 * A fachada pública (`TrackerOptions`, `TrackerResponse`, `Tracker`,
 * `HttpTracker`, `WsTracker`, `createTracker`) é preservada.
 */

import { decode, BencodeDict, BencodeMap, BencodeValue } from "../utils/bencode.ts";
import { TrackerError } from "../utils/errors.ts";
import {
  deduplicatePeers,
  parseCompactIpv4Peers,
  parseCompactIpv6Peers,
  type PeerEndpoint,
} from "../utils/net.ts";
import { uint8ArrayToBinaryString } from "../utils/encode-util.ts";

export type { PeerEndpoint };

// ── Limites de recursos (adaptados de torrent-tracker/request.ts) ───────

/** Default per-announce timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Maximum allowed per-announce timeout in milliseconds. */
export const MAX_TIMEOUT_MS = 300_000;
/** Maximum `numwant` accepted by trackers (BEP 3 recommendation). */
export const MAX_NUM_WANT = 2_000;
/** Maximum tracker URL length accepted. */
export const MAX_TRACKER_URL_LENGTH = 8_192;
/** Maximum tracker id length accepted. */
export const MAX_TRACKER_ID_LENGTH = 1_024;
/** Maximum bencoded tracker response size. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Maximum peers parsed from a dictionary-format response. */
export const MAX_DICTIONARY_PEERS = 2_000;

// ── Tipos ────────────────────────────────────────────────────────────────

/** Lifecycle event sent to a tracker (BEP 3). */
export type TrackerEvent = "started" | "completed" | "stopped";

export interface TrackerOptions {
  infoHash: Uint8Array;
  peerId: Uint8Array;
  port?: number;
  uploaded?: number;
  downloaded?: number;
  left?: number;
  compact?: boolean;
  numwant?: number;
  /** Optional unsigned 32-bit client key, sent as `key`. */
  key?: number;
  /** Per-announce timeout in milliseconds (default 15000). */
  timeoutMs?: number;
}

export interface TrackerAnnounceEvent {
  event?: TrackerEvent;
}

export interface TrackerResponse {
  interval: number;
  minInterval?: number;
  complete: number;
  incomplete: number;
  peers: PeerEndpoint[];
  /** Tracker-provided identifier to echo back as `trackerid`. */
  trackerId?: string;
  /** Non-fatal tracker warning message. */
  warning?: string;
}

export interface Tracker {
  announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse>;
  destroy(): void;
}

// ── Construção e validação de request (torrent-tracker/request.ts) ──────

/**
 * Percent-encodes raw bytes byte-a-byte (`%XX`), como exigido pelo BEP 3
 * para `info_hash` e `peer_id`. Nunca passa pela codificação UTF-8.
 */
export function percentEncodeBytes(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += `%${bytes[i]!.toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return result;
}

/** Valida um inteiro dentro de [minimum, maximum]; retorna o valor. */
export function integerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TrackerError(`${name} is invalid`);
  }
  return value;
}

const TRACKER_EVENTS = new Set<string>(["started", "completed", "stopped"]);

/**
 * Valida a URL do tracker + opções de announce antes do request.
 * Adaptado de `validateAnnounceRequest` (torrent-tracker/request.ts).
 */
export function validateTrackerOptions(
  baseUrl: string,
  opts: TrackerOptions,
  event?: TrackerAnnounceEvent,
): void {
  if (
    !(opts.infoHash instanceof Uint8Array) ||
    !(opts.peerId instanceof Uint8Array) ||
    opts.infoHash.length !== 20 || opts.peerId.length !== 20
  ) {
    throw new TrackerError("infoHash and peerId must contain 20 bytes");
  }
  if (
    typeof baseUrl !== "string" || !baseUrl ||
    baseUrl.length > MAX_TRACKER_URL_LENGTH
  ) {
    throw new TrackerError("tracker URL is invalid");
  }
  try {
    new URL(baseUrl);
  } catch (error) {
    throw new TrackerError("tracker URL is invalid", "TRACKER_ERROR", { cause: error });
  }
  if (opts.port !== undefined) integerInRange(opts.port, "port", 1, 65_535);
  if (opts.uploaded !== undefined) integerInRange(opts.uploaded, "uploaded", 0);
  if (opts.downloaded !== undefined) integerInRange(opts.downloaded, "downloaded", 0);
  if (opts.left !== undefined) integerInRange(opts.left, "left", 0);
  if (opts.numwant !== undefined) integerInRange(opts.numwant, "numwant", 0, MAX_NUM_WANT);
  if (opts.key !== undefined) integerInRange(opts.key, "key", 0, 0xffff_ffff);
  if (opts.timeoutMs !== undefined) {
    integerInRange(opts.timeoutMs, "timeoutMs", 1, MAX_TIMEOUT_MS);
  }
  if (event?.event !== undefined && !TRACKER_EVENTS.has(event.event)) {
    throw new TrackerError("event is invalid");
  }
}

/**
 * Constrói a URL de announce preservando os parâmetros binários
 * (`info_hash`, `peer_id`) com percent-encoding byte-a-byte.
 * Adaptado de `buildAnnounceUrl` (torrent-tracker/http.ts).
 */
export function buildAnnounceUrl(
  baseUrl: string,
  opts: TrackerOptions,
  event?: TrackerAnnounceEvent,
  trackerId?: string,
): URL {
  validateTrackerOptions(baseUrl, opts, event);

  const url = new URL(baseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname
  ) {
    throw new TrackerError(`unsupported HTTP tracker URL: ${url.protocol}`);
  }

  const parameters = [
    `info_hash=${percentEncodeBytes(opts.infoHash)}`,
    `peer_id=${percentEncodeBytes(opts.peerId)}`,
    `port=${opts.port ?? 6881}`,
    `uploaded=${opts.uploaded ?? 0}`,
    `downloaded=${opts.downloaded ?? 0}`,
    `left=${opts.left ?? 0}`,
    "compact=1",
    `numwant=${opts.numwant ?? 50}`,
  ];
  if (event?.event) parameters.push(`event=${event.event}`);
  if (opts.key !== undefined) parameters.push(`key=${opts.key}`);
  if (trackerId) parameters.push(`trackerid=${encodeURIComponent(trackerId)}`);

  url.search += `${url.search ? "&" : ""}${parameters.join("&")}`;
  return url;
}

// ── Parsing de resposta (torrent-tracker/http.ts + compact.ts) ──────────

function dictString(dict: BencodeDict, key: string): string | undefined {
  const value = dict[key];
  return typeof value === "string" ? value : undefined;
}

function dictNonNegativeInteger(
  dict: BencodeDict,
  key: string,
): number | undefined {
  const value = dict[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return undefined;
}

/** Converte peers em formato dicionário (não-compacto) para endpoints. */
function parseDictionaryPeers(values: unknown[]): PeerEndpoint[] {
  const peers: PeerEndpoint[] = [];
  const textDecoder = new TextDecoder();
  for (const value of values.slice(0, MAX_DICTIONARY_PEERS)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const dict = value as BencodeDict;
    const ipRaw = dict["ip"];
    const hostname = typeof ipRaw === "string"
      ? ipRaw
      : ipRaw instanceof Uint8Array
        ? textDecoder.decode(ipRaw)
        : undefined;
    const portRaw = dict["port"];
    const port = typeof portRaw === "number"
      ? portRaw
      : typeof portRaw === "bigint" ? Number(portRaw) : undefined;
    if (!hostname || port === undefined || !Number.isSafeInteger(port)) continue;
    if (port < 1 || port > 65_535) continue;
    peers.push({ ip: hostname, port });
  }
  return peers;
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

/**
 * Faz o parse de uma resposta bencoded de tracker HTTP.
 * Adaptado de `parseHttpTrackerResponse` (torrent-tracker/http.ts).
 *
 * @throws {TrackerError} em `failure reason`, bencode inválido,
 *   ausência de `interval` válido ou lista compacta malformada.
 */
export function parseHttpTrackerResponse(bytes: Uint8Array): TrackerResponse {
  let dict: BencodeDict;
  try {
    const value = decode(bytes, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: 32,
      allowUnsortedKeys: true,
    });
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        value instanceof Uint8Array || value instanceof Map) {
      throw new TrackerError("tracker response must be a dictionary");
    }
    dict = value as BencodeDict;
  } catch (error) {
    if (error instanceof TrackerError) throw error;
    throw new TrackerError("tracker returned invalid bencode", "TRACKER_ERROR", { cause: error });
  }

  const failure = dictString(dict, "failure reason");
  if (failure) {
    throw new TrackerError(`tracker announce failed: ${failure}`);
  }

  const interval = dictNonNegativeInteger(dict, "interval");
  if (interval === undefined || interval < 1) {
    throw new TrackerError("tracker response has no valid interval");
  }

  const peers: PeerEndpoint[] = [];

  const ipv4 = dict["peers"];
  if (ipv4 instanceof Uint8Array || typeof ipv4 === "string") {
    try {
      peers.push(...parseCompactIpv4Peers(toBytes(ipv4)));
    } catch (error) {
      throw new TrackerError("invalid compact IPv4 peer list", "TRACKER_ERROR", { cause: error });
    }
  } else if (Array.isArray(ipv4)) {
    peers.push(...parseDictionaryPeers(ipv4));
  }

  const ipv6 = dict["peers6"];
  if (ipv6 instanceof Uint8Array || typeof ipv6 === "string") {
    try {
      peers.push(...parseCompactIpv6Peers(toBytes(ipv6)));
    } catch (error) {
      throw new TrackerError("invalid compact IPv6 peer list", "TRACKER_ERROR", { cause: error });
    }
  }

  // Porta 0 não é conectável — filtra antes da deduplicação (BEP 23).
  const connectable = peers.filter((peer) => peer.port >= 1 && peer.port <= 65_535);

  return {
    interval,
    minInterval: dictNonNegativeInteger(dict, "min interval"),
    trackerId: dictString(dict, "tracker id"),
    warning: dictString(dict, "warning message"),
    complete: dictNonNegativeInteger(dict, "complete") ?? 0,
    incomplete: dictNonNegativeInteger(dict, "incomplete") ?? 0,
    peers: deduplicatePeers(connectable),
  };
}

// ── Leitura limitada de corpo HTTP ──────────────────────────────────────

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new TrackerError("tracker response has invalid Content-Length");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      throw new TrackerError("tracker response is too large");
    }
  }

  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new TrackerError("tracker response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// ── HttpTracker ──────────────────────────────────────────────────────────

export class HttpTracker implements Tracker {
  private baseUrl: string;
  private opts: TrackerOptions;
  private abortController: AbortController | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private trackerId: string | undefined;

  constructor(baseUrl: string, opts: TrackerOptions) {
    this.baseUrl = baseUrl;
    this.opts = opts;
  }

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    validateTrackerOptions(this.baseUrl, this.opts, event);
    const url = buildAnnounceUrl(this.baseUrl, this.opts, event, this.trackerId);

    this.abortController = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    this.timeoutId = setTimeout(() => {
      timedOut = true;
      this.abortController?.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        signal: this.abortController.signal,
        headers: { "User-Agent": "Loco-WebTorrent/0.1.0" },
      });

      if (!response.ok) {
        throw new TrackerError(`Tracker HTTP error: ${response.status}`);
      }

      const bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES);
      const parsed = parseHttpTrackerResponse(bytes);

      if (parsed.trackerId) this.trackerId = parsed.trackerId;

      return {
        interval: parsed.interval,
        minInterval: parsed.minInterval,
        complete: parsed.complete,
        incomplete: parsed.incomplete,
        peers: parsed.peers,
        trackerId: parsed.trackerId,
        warning: parsed.warning,
      };
    } catch (err) {
      if (timedOut) {
        throw new TrackerError("HTTP tracker request timed out", "TRACKER_ERROR", { cause: err });
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new TrackerError("Tracker announce aborted", "TRACKER_ERROR", { cause: err });
      }
      if (err instanceof TrackerError) throw err;
      throw new TrackerError(
        err instanceof Error ? err.message : "HTTP tracker request failed",
        "TRACKER_ERROR",
        { cause: err },
      );
    } finally {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.abortController = null;
    }
  }

  destroy(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

// ── Scrape support (BEP 48) ────────────────────────────────────────────────

export interface ScrapeResponse {
  files: Record<string, {
    complete: number;
    incomplete: number;
    downloaded: number;
    name?: string;
  }>;
}

/**
 * Fetches scrape data for one or more info hashes from a tracker's scrape endpoint.
 * Falls back to `announce` if `scrape` is not in the URL (BEP 48 §3).
 *
 * @param trackerUrl - Base announce URL (e.g. `https://tracker.example/announce`).
 *   The scrape endpoint is derived by replacing `/announce` with `/scrape`.
 * @param infoHashes - Array of 20-byte info hashes.
 * @param opts - Optional timeout.
 */
export async function scrapeTracker(
  trackerUrl: string,
  infoHashes: Uint8Array[],
  opts: { timeoutMs?: number } = {},
): Promise<ScrapeResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scrapeUrl = trackerUrl.replace(/\/announce(\?.*)?$/, "/scrape$1");

  const sep = scrapeUrl.includes("?") ? "&" : "?";
  const queryParts: string[] = [];
  for (const ih of infoHashes) {
    queryParts.push(`info_hash=${percentEncodeBytes(ih)}`);
  }
  const url = new URL(`${scrapeUrl}${sep}${queryParts.join("&")}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "Loco-WebTorrent/0.1.0" },
    });

    if (!response.ok) {
      throw new TrackerError(`Tracker scrape HTTP error: ${response.status}`);
    }

    const bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    let dict: BencodeMap;
    try {
      const value = decode(bytes, {
        maxBytes: MAX_RESPONSE_BYTES,
        maxDepth: 16,
        allowUnsortedKeys: true,
        useMap: true,
      });
      if (!(value instanceof Map)) {
        throw new TrackerError("scrape response must be a dictionary");
      }
      dict = value;
    } catch (error) {
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("scrape returned invalid bencode", "TRACKER_ERROR", { cause: error });
    }

    const files: ScrapeResponse["files"] = {};

    // Map<string,unknown> -> BencodeDict so dict helpers work
    function mapToDict(m: BencodeMap): BencodeDict {
      const out: BencodeDict = {};
      for (const [k, v] of m) {
        if (typeof k === "string") out[k] = v;
      }
      return out;
    }

    for (const [key, value] of dict) {
      if (typeof key !== "string") continue;
      if (key === "flags") continue;

      let fileStats: BencodeMap | undefined;
      if (key === "files") {
        // BEP 48 "files" variant: "files" -> { infoHash -> stats }
        if (value instanceof Map) fileStats = value;
      } else {
        // Direct infoHash -> stats (some trackers use this form)
        if (value instanceof Map) fileStats = new Map([[key, value]]);
      }

      if (fileStats) {
        for (const [subKey, subVal] of fileStats) {
          if (typeof subKey !== "string" || !(subVal instanceof Map)) continue;
          const sub = mapToDict(subVal);
          const complete = dictNonNegativeInteger(sub, "complete") ?? 0;
          const incomplete = dictNonNegativeInteger(sub, "incomplete") ?? 0;
          const downloaded = dictNonNegativeInteger(sub, "downloaded") ?? 0;
          const name = dictString(sub, "name");
          files[subKey] = { complete, incomplete, downloaded, ...(name ? { name } : {}) };
        }
      }
    }

    return { files };
  } finally {
    clearTimeout(timeout);
  }
}

// ── WsTracker ────────────────────────────────────────────────────────────

export class WsTracker implements Tracker {
  private url: string;
  private opts: TrackerOptions;
  private ws: WebSocket | null = null;

  constructor(url: string, opts: TrackerOptions) {
    this.url = url;
    this.opts = opts;
  }

  async announce(event?: TrackerAnnounceEvent): Promise<TrackerResponse> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          const msg = {
            action: "announce",
            info_hash: uint8ArrayToBinaryString(this.opts.infoHash),
            peer_id: uint8ArrayToBinaryString(this.opts.peerId),
            port: this.opts.port || 6881,
            uploaded: this.opts.uploaded || 0,
            downloaded: this.opts.downloaded || 0,
            left: this.opts.left || 0,
            compact: 1,
            numwant: this.opts.numwant || 50,
            ...(event?.event ? { event: event.event } : {}),
          };
          this.ws?.send(JSON.stringify(msg));
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === "announce") {
              const peers: PeerEndpoint[] = [];
              if (Array.isArray(data.peers)) {
                for (const p of data.peers) {
                  peers.push({ ip: p.ip || p.ipv4 || p.ipv6, port: p.port });
                }
              }

              const response: TrackerResponse = {
                interval: data.interval || 1800,
                complete: data.complete || 0,
                incomplete: data.incomplete || 0,
                peers: deduplicatePeers(peers),
              };

              resolve(response);
              this.ws?.close();
            } else if (data["failure reason"]) {
              reject(new TrackerError(String(data["failure reason"])));
              this.ws?.close();
            }
          } catch (err) {
            reject(err);
            this.ws?.close();
          }
        };

        this.ws.onerror = () => {
          reject(new TrackerError("WebSocket connection failed"));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createTracker(announceUrl: string, opts: TrackerOptions): Tracker {
  if (announceUrl.startsWith("http://") || announceUrl.startsWith("https://")) {
    return new HttpTracker(announceUrl, opts);
  }
  if (announceUrl.startsWith("ws://") || announceUrl.startsWith("wss://")) {
    return new WsTracker(announceUrl, opts);
  }
  throw new TrackerError(`Unsupported tracker protocol: ${announceUrl}`);
}
