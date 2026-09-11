import {
  type BencodeKey,
  type BencodeValue,
  decode,
} from "@deno-torrent/bencode";
import {
  deduplicatePeers,
  parseCompactIpv4Peers,
  parseCompactIpv6Peers,
} from "./compact.ts";
import {
  type AnnounceClient,
  type PeerEndpoint,
  type TrackerAnnounceRequest,
  type TrackerAnnounceResponse,
  TrackerError,
} from "./types.ts";
import {
  DEFAULT_TIMEOUT_MS,
  integerInRange,
  isAbortError,
  validateAnnounceRequest,
} from "./request.ts";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Options for the HTTP(S) tracker transport. */
export interface HttpTrackerClientOptions {
  /** Fetch implementation, primarily for custom runtimes and tests. */
  fetch?: typeof fetch;
  /** User-Agent sent to trackers. */
  userAgent?: string;
  /** Optional application policy evaluated before every request/redirect. */
  validateUrl?: (url: URL, signal: AbortSignal) => void | Promise<void>;
  /** Maximum redirects followed within the request deadline. */
  maxRedirects?: number;
}

/** HTTP(S) BitTorrent tracker client. */
export class HttpTrackerClient implements AnnounceClient {
  readonly #fetch: typeof fetch;
  readonly #userAgent: string;
  readonly #validateUrl?: (
    url: URL,
    signal: AbortSignal,
  ) => void | Promise<void>;
  readonly #maxRedirects: number;

  /** Creates an HTTP tracker client with optional policy hooks. */
  constructor(options: HttpTrackerClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#userAgent = options.userAgent ??
      "@deno-torrent/torrent-tracker/0.1.0";
    this.#validateUrl = options.validateUrl;
    this.#maxRedirects = integerInRange(
      options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      "maxRedirects",
      0,
      20,
    );
  }

  /** Announces to an HTTP(S) tracker. */
  async announce(
    request: TrackerAnnounceRequest,
  ): Promise<TrackerAnnounceResponse> {
    validateAnnounceRequest(request);
    const url = buildAnnounceUrl(request);
    const timeout = AbortSignal.timeout(
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    let response: Response;
    try {
      response = await this.#fetchFollowingRedirects(url, signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      if (timeout.aborted) {
        throw new TrackerError("HTTP tracker request timed out", {
          cause: error,
        });
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("HTTP tracker request failed", { cause: error });
    }
    if (!response.ok) {
      await cancelBody(response);
      throw new TrackerError(`HTTP tracker returned ${response.status}`);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBody(response, MAX_RESPONSE_BYTES, signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      if (timeout.aborted) {
        throw new TrackerError("HTTP tracker request timed out", {
          cause: error,
        });
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("HTTP tracker response could not be read", {
        cause: error,
      });
    }
    return parseHttpTrackerResponse(bytes, request.tracker);
  }

  async #fetchFollowingRedirects(
    initialUrl: URL,
    signal: AbortSignal,
  ): Promise<Response> {
    let url = initialUrl;
    for (let redirectCount = 0;; redirectCount++) {
      validateHttpUrl(url);
      if (this.#validateUrl) {
        try {
          await runUrlPolicy(this.#validateUrl, new URL(url), signal);
        } catch (error) {
          throw new TrackerError("HTTP tracker URL was rejected", {
            cause: error,
          });
        }
      }
      const response = await this.#fetch(url, {
        headers: { "user-agent": this.#userAgent },
        redirect: "manual",
        signal,
      });
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      if (redirectCount >= this.#maxRedirects) {
        await cancelBody(response);
        throw new TrackerError("HTTP tracker redirected too many times");
      }
      const location = response.headers.get("location");
      if (!location) {
        await cancelBody(response);
        throw new TrackerError("HTTP tracker redirect has no location");
      }
      let next: URL;
      try {
        next = new URL(location, url);
      } catch (error) {
        await cancelBody(response);
        throw new TrackerError("HTTP tracker redirect location is invalid", {
          cause: error,
        });
      }
      await cancelBody(response);
      url = next;
    }
  }
}

/** Builds an announce URL while preserving binary identity parameters. */
export function buildAnnounceUrl(request: TrackerAnnounceRequest): URL {
  validateAnnounceRequest(request);
  const url = new URL(request.tracker);
  validateHttpUrl(url);
  const parameters = [
    `info_hash=${percentEncodeBytes(request.infoHash)}`,
    `peer_id=${percentEncodeBytes(request.peerId)}`,
    `port=${request.port}`,
    `uploaded=${request.uploaded ?? 0}`,
    `downloaded=${request.downloaded ?? 0}`,
    `left=${request.left}`,
    "compact=1",
    `numwant=${request.numWant ?? 50}`,
  ];
  if (request.event) parameters.push(`event=${request.event}`);
  if (request.key !== undefined) {
    parameters.push(`key=${request.key}`);
  }
  if (request.trackerId) {
    parameters.push(`trackerid=${encodeURIComponent(request.trackerId)}`);
  }
  url.search += `${url.search ? "&" : ""}${parameters.join("&")}`;
  return url;
}

/** Parses a bencoded HTTP tracker response. */
export function parseHttpTrackerResponse(
  bytes: Uint8Array,
  tracker = "http://tracker.invalid/announce",
): TrackerAnnounceResponse {
  let value: BencodeValue;
  try {
    value = decode(bytes, {
      maxBytes: MAX_RESPONSE_BYTES,
      maxDepth: 32,
      allowUnsortedKeys: true,
    });
  } catch (error) {
    throw new TrackerError("tracker returned invalid bencode", {
      cause: error,
    });
  }
  if (!(value instanceof Map)) {
    throw new TrackerError("tracker response must be a dictionary");
  }
  const failure = mapString(value, "failure reason");
  if (failure) throw new TrackerError(failure);
  const interval = mapNonNegativeInteger(value, "interval");
  if (!interval || interval < 1) {
    throw new TrackerError("tracker response has no valid interval");
  }
  const peers: PeerEndpoint[] = [];
  const ipv4 = mapGet(value, "peers");
  if (ipv4 instanceof Uint8Array) peers.push(...parseCompactIpv4Peers(ipv4));
  else if (Array.isArray(ipv4)) peers.push(...parseDictionaryPeers(ipv4));
  else if (typeof ipv4 === "string") {
    peers.push(...parseCompactIpv4Peers(new TextEncoder().encode(ipv4)));
  }
  const ipv6 = mapGet(value, "peers6");
  if (ipv6 instanceof Uint8Array) peers.push(...parseCompactIpv6Peers(ipv6));
  else if (typeof ipv6 === "string") {
    peers.push(...parseCompactIpv6Peers(new TextEncoder().encode(ipv6)));
  }
  return {
    tracker,
    interval,
    minInterval: mapNonNegativeInteger(value, "min interval"),
    trackerId: mapString(value, "tracker id"),
    warning: mapString(value, "warning message"),
    complete: mapNonNegativeInteger(value, "complete"),
    incomplete: mapNonNegativeInteger(value, "incomplete"),
    peers: deduplicatePeers(peers),
  };
}

function parseDictionaryPeers(values: BencodeValue[]): PeerEndpoint[] {
  const peers: PeerEndpoint[] = [];
  for (const value of values.slice(0, 2_000)) {
    if (!(value instanceof Map)) continue;
    const hostname = mapString(value, "ip");
    const port = mapNonNegativeInteger(value, "port");
    if (!hostname || !port || port > 65_535) continue;
    const peerId = mapGet(value, "peer id");
    peers.push({
      hostname,
      port,
      family: hostname.includes(":") ? "ipv6" : "ipv4",
      peerId: peerId instanceof Uint8Array && peerId.length === 20
        ? peerId
        : undefined,
    });
  }
  return peers;
}

function mapGet(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): BencodeValue | undefined {
  for (const [candidate, value] of map) {
    if (
      candidate === key ||
      candidate instanceof Uint8Array && equalsAscii(candidate, key)
    ) return value;
  }
  return undefined;
}

function mapString(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): string | undefined {
  const value = mapGet(map, key);
  return typeof value === "string" ? value : undefined;
}

function mapInteger(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): number | undefined {
  const value = mapGet(map, key);
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function mapNonNegativeInteger(
  map: Map<BencodeKey, BencodeValue>,
  key: string,
): number | undefined {
  const value = mapInteger(map, key);
  return value !== undefined && value >= 0 ? value : undefined;
}

function equalsAscii(bytes: Uint8Array, text: string): boolean {
  return bytes.length === text.length &&
    bytes.every((byte, index) => byte === text.charCodeAt(index));
}

function percentEncodeBytes(bytes: Uint8Array): string {
  return [...bytes].map((byte) =>
    `%${byte.toString(16).padStart(2, "0").toUpperCase()}`
  ).join("");
}

function validateHttpUrl(url: URL): void {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname
  ) {
    throw new TrackerError(
      `unsupported HTTP tracker URL: ${url.protocol}`,
    );
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) {
    await cancelBody(response, signal.reason);
    throw signal.reason;
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      await cancelBody(response, "invalid Content-Length");
      throw new TrackerError("tracker response has invalid Content-Length");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      await cancelBody(response, "tracker response is too large");
      throw new TrackerError("tracker response is too large");
    }
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await readChunk(reader, signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new TrackerError("tracker response is too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    await cancelReader(reader, error);
    throw error;
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

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    await cancelReader(reader, signal.reason);
    throw signal.reason;
  }
  return await new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener("abort", abort);
      const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        void cancelReader(reader, signal.reason).then(() => {
          reject(signal.reason);
        });
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      reader.read().then(
        (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        },
        (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      );
    },
  );
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason?: unknown,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // The primary tracker or cancellation error remains authoritative.
  }
}

async function cancelBody(response: Response, reason?: unknown): Promise<void> {
  try {
    await response.body?.cancel(reason);
  } catch {
    // The response is already unusable; cancellation is best-effort.
  }
}

async function runUrlPolicy(
  policy: NonNullable<HttpTrackerClientOptions["validateUrl"]>,
  url: URL,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw signal.reason;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  const operation = Promise.resolve().then(() => {
    if (signal.aborted) throw signal.reason;
    return policy(url, signal);
  });
  try {
    await Promise.race([operation, aborted]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
