/**
 * Bounded helpers for byte readers and writers that may complete operations
 * partially. Adapted from deno-torrent/toolkit/io/io_util.ts.
 *
 * Browser-first: no Deno.* or node:* APIs — standard web APIs only.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A byte source compatible with the generic reader contract. */
export interface ByteReader {
  read(p: Uint8Array): Promise<number | null>;
}

/** A byte sink compatible with the generic writer contract. */
export interface ByteWriter {
  write(p: Uint8Array): Promise<number>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** An invalid byte count reported by a reader or writer. */
export class InvalidByteCountError extends RangeError {
  /** Whether the invalid count was returned by a read or write operation. */
  readonly operation: "read" | "write";

  /** The invalid byte count returned by the operation. */
  readonly count: number;

  /** The largest byte count that would have been valid. */
  readonly maximum: number;

  constructor(operation: "read" | "write", count: number, maximum: number) {
    super(
      `${operation} returned invalid byte count ${count}; expected an integer from 1 to ${maximum}`,
    );
    this.name = "InvalidByteCountError";
    this.operation = operation;
    this.count = count;
    this.maximum = maximum;
  }
}

/** EOF encountered before an exact-size read could be completed. */
export class UnexpectedEofError extends Error {
  /** Number of bytes successfully read before EOF. */
  readonly bytesRead: number;

  /** Total number of bytes requested by the caller. */
  readonly expectedBytes: number;

  constructor(bytesRead: number, expectedBytes: number) {
    super(`unexpected EOF after ${bytesRead} of ${expectedBytes} bytes`);
    this.name = "UnexpectedEofError";
    this.bytesRead = bytesRead;
    this.expectedBytes = expectedBytes;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertCount(
  count: number,
  maximum: number,
  operation: "read" | "write",
): void {
  if (!Number.isSafeInteger(count) || count <= 0 || count > maximum) {
    throw new InvalidByteCountError(operation, count, maximum);
  }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/** Options controlling {@link readExactly}. */
export interface ReadExactlyOptions {
  /**
   * Return `false` when EOF occurs before any bytes are read.
   * Defaults to `false`, which causes {@link UnexpectedEofError} instead.
   */
  allowCleanEof?: boolean;
}

/**
 * Reads exactly `target.length` bytes into the caller-provided array.
 * Valid partial reads are retried until the target is full.
 *
 * No target buffer is allocated internally. For an empty target this method
 * returns `true` without calling the reader.
 *
 * @returns `true` when the target is full, or `false` only when
 * `allowCleanEof` is enabled and the first read encounters EOF.
 * @throws {UnexpectedEofError} If EOF occurs before the target is full.
 * @throws {InvalidByteCountError} If the reader reports an invalid byte count.
 */
export async function readExactly(
  reader: ByteReader,
  target: Uint8Array,
  options: ReadExactlyOptions = {},
): Promise<boolean> {
  if (target.length === 0) return true;

  let offset = 0;
  while (offset < target.length) {
    const remaining = target.length - offset;
    const count = await reader.read(target.subarray(offset));
    if (count === null) {
      if (offset === 0 && options.allowCleanEof === true) return false;
      throw new UnexpectedEofError(offset, target.length);
    }
    assertCount(count, remaining, "read");
    offset += count;
  }
  return true;
}

/**
 * Writes every byte, retrying after valid partial writes.
 *
 * @throws {InvalidByteCountError} If the writer reports no progress or an invalid count.
 */
export async function writeAll(
  writer: ByteWriter,
  data: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const count = await writer.write(data.subarray(offset));
    assertCount(count, remaining, "write");
    offset += count;
  }
}
