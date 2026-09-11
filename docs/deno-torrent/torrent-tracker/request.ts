import type { TrackerAnnounceRequest } from "./types.ts";
import { TrackerError } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 300_000;
export const MAX_NUM_WANT = 2_000;
export const MAX_TRACKER_URL_LENGTH = 8_192;
export const MAX_TRACKER_ID_LENGTH = 1_024;

const EVENTS = new Set(["started", "completed", "stopped"]);

export function validateAnnounceRequest(
  request: TrackerAnnounceRequest,
): void {
  if (
    !(request.infoHash instanceof Uint8Array) ||
    !(request.peerId instanceof Uint8Array) ||
    request.infoHash.length !== 20 || request.peerId.length !== 20
  ) {
    throw new TrackerError("infoHash and peerId must contain 20 bytes");
  }
  if (
    typeof request.tracker !== "string" || !request.tracker ||
    request.tracker.length > MAX_TRACKER_URL_LENGTH
  ) {
    throw new TrackerError("tracker URL is invalid");
  }
  try {
    new URL(request.tracker);
  } catch (error) {
    throw new TrackerError("tracker URL is invalid", { cause: error });
  }
  integerInRange(request.port, "port", 1, 65_535);
  integerInRange(request.uploaded ?? 0, "uploaded", 0);
  integerInRange(request.downloaded ?? 0, "downloaded", 0);
  integerInRange(request.left, "left", 0);
  if (request.numWant !== undefined) {
    integerInRange(request.numWant, "numWant", 0, MAX_NUM_WANT);
  }
  if (request.key !== undefined) {
    integerInRange(request.key, "key", 0, 0xffff_ffff);
  }
  if (
    request.event !== undefined &&
    (typeof request.event !== "string" || !EVENTS.has(request.event))
  ) {
    throw new TrackerError("event is invalid");
  }
  if (
    request.trackerId !== undefined &&
    (typeof request.trackerId !== "string" ||
      request.trackerId.length > MAX_TRACKER_ID_LENGTH)
  ) {
    throw new TrackerError("trackerId is invalid");
  }
  if (request.timeoutMs !== undefined) validateTimeout(request.timeoutMs);
}

export function validateTimeout(value: number, name = "timeoutMs"): number {
  return integerInRange(value, name, 1, MAX_TIMEOUT_MS);
}

export function integerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) || value < minimum || value > maximum
  ) {
    throw new TrackerError(`${name} is invalid`);
  }
  return value;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
