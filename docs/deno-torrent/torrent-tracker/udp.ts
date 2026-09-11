import { parseCompactIpv4Peers } from "./compact.ts";
import {
  type AnnounceClient,
  type TrackerAnnounceRequest,
  type TrackerAnnounceResponse,
  TrackerError,
} from "./types.ts";
import {
  DEFAULT_TIMEOUT_MS,
  isAbortError,
  validateAnnounceRequest,
} from "./request.ts";

const CONNECT_MAGIC = 0x41727101980n;

/** UDP BitTorrent tracker client implementing BEP 15. */
export class UdpTrackerClient implements AnnounceClient {
  /** Announces to a UDP tracker within one DNS/connect/retry budget. */
  async announce(
    request: TrackerAnnounceRequest,
  ): Promise<TrackerAnnounceResponse> {
    validateAnnounceRequest(request);
    const url = new URL(request.tracker);
    if (url.protocol !== "udp:" || !url.hostname) {
      throw new TrackerError(
        `unsupported UDP tracker URL: ${url.protocol}`,
      );
    }
    const port = Number(url.port || 80);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new TrackerError("UDP tracker port is invalid");
    }
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    let hostnames: string[];
    try {
      hostnames = await resolveIpv4Hostnames(url.hostname, signal);
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      if (timeout.aborted) {
        throw new TrackerError("UDP tracker request timed out", {
          cause: timeout.reason,
        });
      }
      if (isAbortError(error)) throw error;
      if (error instanceof TrackerError) throw error;
      throw new TrackerError("UDP tracker DNS lookup failed", {
        cause: error,
      });
    }
    let lastError: unknown;
    const attempts = Math.max(2, Math.min(hostnames.length, 4));
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0 || signal.aborted) throw signal.reason;
        const attemptDeadline = Date.now() +
          Math.max(1, Math.ceil(remaining / (attempts - attempt)));
        return await announceAttempt(
          request,
          {
            transport: "udp",
            hostname: hostnames[attempt % hostnames.length]!,
            port,
          },
          attemptDeadline,
          signal,
        );
      } catch (error) {
        if (request.signal?.aborted) throw request.signal.reason;
        if (isAbortError(error)) throw error;
        lastError = error;
      }
    }
    if (timeout.aborted) {
      throw new TrackerError("UDP tracker request timed out", {
        cause: timeout.reason,
      });
    }
    throw new TrackerError("UDP tracker announce failed", { cause: lastError });
  }
}

async function announceAttempt(
  request: TrackerAnnounceRequest,
  address: Deno.NetAddr,
  deadline: number,
  signal: AbortSignal,
): Promise<TrackerAnnounceResponse> {
  const socket = Deno.listenDatagram({
    transport: "udp",
    hostname: "0.0.0.0",
    port: 0,
  });
  try {
    const connectTransaction = randomUint32();
    const connect = new Uint8Array(16);
    const connectView = new DataView(connect.buffer);
    connectView.setBigUint64(0, CONNECT_MAGIC);
    connectView.setUint32(8, 0);
    connectView.setUint32(12, connectTransaction);
    await socket.send(connect, address);
    const connectResponse = await receive(
      socket,
      address,
      remainingMs(deadline),
      signal,
    );
    const connectionId = parseConnectResponse(
      connectResponse,
      connectTransaction,
    );

    const transaction = randomUint32();
    const packet = new Uint8Array(98);
    const view = new DataView(packet.buffer);
    view.setBigUint64(0, connectionId);
    view.setUint32(8, 1);
    view.setUint32(12, transaction);
    packet.set(request.infoHash, 16);
    packet.set(request.peerId, 36);
    view.setBigUint64(56, BigInt(request.downloaded ?? 0));
    view.setBigUint64(64, BigInt(request.left));
    view.setBigUint64(72, BigInt(request.uploaded ?? 0));
    view.setUint32(80, eventCode(request.event));
    view.setUint32(84, 0);
    view.setUint32(88, request.key ?? randomUint32());
    view.setInt32(92, request.numWant ?? -1);
    view.setUint16(96, request.port);
    await socket.send(packet, address);
    return parseAnnounceResponse(
      await receive(socket, address, remainingMs(deadline), signal),
      transaction,
      request.tracker,
    );
  } finally {
    socket.close();
  }
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

function parseConnectResponse(bytes: Uint8Array, transaction: number): bigint {
  if (bytes.length < 8) {
    throw new TrackerError("UDP connect response is truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const action = view.getUint32(0);
  if (view.getUint32(4) !== transaction) {
    throw new TrackerError("UDP connect transaction mismatch");
  }
  if (action === 3) throw new TrackerError(decodeError(bytes));
  if (action !== 0 || bytes.length < 16) {
    throw new TrackerError("UDP connect response is invalid");
  }
  return view.getBigUint64(8);
}

/** Parses and validates a UDP announce response packet. */
export function parseAnnounceResponse(
  bytes: Uint8Array,
  transaction: number,
  tracker = "udp://tracker.invalid:80",
): TrackerAnnounceResponse {
  if (bytes.length < 8) {
    throw new TrackerError("UDP announce response is truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const action = view.getUint32(0);
  if (view.getUint32(4) !== transaction) {
    throw new TrackerError("UDP announce transaction mismatch");
  }
  if (action === 3) throw new TrackerError(decodeError(bytes));
  if (action !== 1 || bytes.length < 20 || (bytes.length - 20) % 6 !== 0) {
    throw new TrackerError("UDP announce response is invalid");
  }
  const interval = view.getUint32(8);
  if (interval < 1) {
    throw new TrackerError("UDP announce response has no valid interval");
  }
  return {
    tracker,
    interval,
    incomplete: view.getUint32(12),
    complete: view.getUint32(16),
    peers: parseCompactIpv4Peers(bytes.subarray(20)),
  };
}

async function receive(
  socket: Deno.DatagramConn,
  expectedAddress: Deno.NetAddr,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw signal.reason;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (signal.aborted) throw signal.reason;
    const [bytes, address] = await receiveOnce(
      socket,
      remainingMs(deadline),
      signal,
    );
    if (sameUdpAddress(address, expectedAddress)) return bytes;
  }
}

/** @internal Receives one datagram while honoring an already-aborted signal. */
export async function receiveOnce(
  socket: Deno.DatagramConn,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<[Uint8Array, Deno.Addr]> {
  if (signal.aborted) throw signal.reason;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  return await new Promise<[Uint8Array, Deno.Addr]>((resolve, reject) => {
    const abort = () => reject(combined.reason);
    combined.addEventListener("abort", abort, { once: true });
    if (combined.aborted) {
      combined.removeEventListener("abort", abort);
      reject(combined.reason);
      return;
    }
    socket.receive().then(
      (packet) => {
        combined.removeEventListener("abort", abort);
        resolve(packet);
      },
      (error) => {
        combined.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function sameUdpAddress(actual: Deno.Addr, expected: Deno.NetAddr): boolean {
  return actual.transport === "udp" && actual.hostname === expected.hostname &&
    actual.port === expected.port;
}

async function resolveIpv4Hostnames(
  hostname: string,
  signal: AbortSignal,
): Promise<string[]> {
  if (isIpv4Address(hostname)) return [hostname];
  if (hostname.includes(":") || hostname.startsWith("[") || !hostname) {
    throw new TrackerError("UDP trackers currently require an IPv4 address");
  }
  const addresses = await Deno.resolveDns(hostname, "A", { signal });
  const unique = [...new Set(addresses.filter(isIpv4Address))];
  if (unique.length === 0) {
    throw new TrackerError("UDP tracker hostname has no IPv4 address");
  }
  return unique;
}

function isIpv4Address(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function decodeError(bytes: Uint8Array): string {
  return new TextDecoder().decode(
    bytes.subarray(8, Math.min(bytes.length, 8 + 1024)),
  ) ||
    "UDP tracker returned an error";
}

function eventCode(event: TrackerAnnounceRequest["event"]): number {
  return event === "completed"
    ? 1
    : event === "started"
    ? 2
    : event === "stopped"
    ? 3
    : 0;
}

function randomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
