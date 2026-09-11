import { HttpTrackerClient } from "./http.ts";
import type {
  AnnounceClient,
  TrackerAnnounceAnyRequest,
  TrackerAnnounceRequest,
  TrackerAnnounceResponse,
} from "./types.ts";
import { TrackerError } from "./types.ts";
import { UdpTrackerClient } from "./udp.ts";
import {
  DEFAULT_TIMEOUT_MS,
  isAbortError,
  validateAnnounceRequest,
  validateTimeout,
} from "./request.ts";

/** Protocol-selecting tracker client with ordered failover. */
export class TrackerClient implements AnnounceClient {
  /** Creates a client with an application-specific HTTP User-Agent. */
  static withUserAgent(userAgent: string): TrackerClient {
    return new TrackerClient(new HttpTrackerClient({ userAgent }));
  }

  /** Creates a client from optional HTTP and UDP transport implementations. */
  constructor(
    readonly http: AnnounceClient = new HttpTrackerClient(),
    readonly udp: AnnounceClient = new UdpTrackerClient(),
  ) {}

  /** Announces through the transport selected by the tracker URL. */
  announce(request: TrackerAnnounceRequest): Promise<TrackerAnnounceResponse> {
    validateAnnounceRequest(request);
    const protocol = new URL(request.tracker).protocol;
    if (protocol === "http:" || protocol === "https:") {
      return this.http.announce(request);
    }
    if (protocol === "udp:") return this.udp.announce(request);
    return Promise.reject(
      new TrackerError(`unsupported tracker protocol: ${protocol}`),
    );
  }

  /**
   * Tries trackers in order while sharing one overall deadline.
   *
   * Caller cancellation and `AbortError` failures terminate immediately;
   * ordinary tracker failures continue to the next candidate.
   */
  async announceAny(
    trackers: readonly string[],
    request: TrackerAnnounceAnyRequest,
  ): Promise<TrackerAnnounceResponse> {
    if (trackers.length === 0 || trackers.length > 256) {
      throw new TrackerError("trackers must contain between 1 and 256 URLs");
    }
    const {
      overallTimeoutMs: requestedOverallTimeout,
      ...announceRequest
    } = request;
    const overallTimeoutMs = validateTimeout(
      requestedOverallTimeout ?? request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "overallTimeoutMs",
    );
    const deadlineSignal = AbortSignal.timeout(overallTimeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, deadlineSignal])
      : deadlineSignal;
    const deadline = performance.now() + overallTimeoutMs;
    const failures: string[] = [];
    for (const tracker of trackers) {
      const remainingMs = Math.max(1, Math.ceil(deadline - performance.now()));
      try {
        return await abortable(
          this.announce({
            ...announceRequest,
            tracker,
            signal,
            timeoutMs: Math.min(
              announceRequest.timeoutMs ?? DEFAULT_TIMEOUT_MS,
              remainingMs,
            ),
          }),
          signal,
        );
      } catch (error) {
        if (request.signal?.aborted) throw request.signal.reason;
        if (deadlineSignal.aborted) {
          throw new TrackerError("tracker announce deadline exceeded", {
            cause: deadlineSignal.reason,
          });
        }
        if (isAbortError(error)) throw error;
        failures.push(
          `${safeTrackerLabel(tracker)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    throw new TrackerError(`all trackers failed (${failures.join("; ")})`);
  }
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

function safeTrackerLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "invalid tracker";
  }
}
