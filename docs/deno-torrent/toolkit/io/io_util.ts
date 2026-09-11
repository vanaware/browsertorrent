/**
 * Bounded helpers for readers and writers that may complete operations
 * partially. They deliberately require an explicit read limit.
 *
 * @module
 */

/** A source compatible with Deno's byte-reader contract. */
export interface ByteReader {
  read(p: Uint8Array): Promise<number | null>;
}

/** A sink compatible with Deno's byte-writer contract. */
export interface ByteWriter {
  write(p: Uint8Array): Promise<number>;
}

/** An invalid byte count reported by a reader or writer. */
export class InvalidByteCountError extends RangeError {
  /** Whether the invalid count was returned by a read or write operation. */
  readonly operation: 'read' | 'write';

  /** The invalid byte count returned by the operation. */
  readonly count: number;

  /** The largest byte count that would have been valid. */
  readonly maximum: number;

  constructor(operation: 'read' | 'write', count: number, maximum: number) {
    super(
      `${operation} returned invalid byte count ${count}; expected an integer from 1 to ${maximum}`,
    );
    this.name = 'InvalidByteCountError';
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
    this.name = 'UnexpectedEofError';
    this.bytesRead = bytesRead;
    this.expectedBytes = expectedBytes;
  }
}

/** Options controlling {@link IoUtil.readAll}. */
export interface ReadAllOptions {
  /** Explicit upper bound for returned data. */
  maxBytes: number;
  /** Reusable read buffer size. Defaults to 64 KiB. */
  chunkSize?: number;
}

/** Options controlling {@link IoUtil.readExactly}. */
export interface ReadExactlyOptions {
  /**
   * Return `false` when EOF occurs before any bytes are read.
   * Defaults to `false`, which causes {@link UnexpectedEofError} instead.
   */
  allowCleanEof?: boolean;
}

function assertCount(
  count: number,
  maximum: number,
  operation: 'read' | 'write',
): void {
  if (!Number.isSafeInteger(count) || count <= 0 || count > maximum) {
    throw new InvalidByteCountError(operation, count, maximum);
  }
}

/** Byte-stream utility functions. */
const IoUtil: {
  readAll(reader: ByteReader, options: ReadAllOptions): Promise<Uint8Array>;
  readExactly(
    reader: ByteReader,
    target: Uint8Array,
    options?: ReadExactlyOptions,
  ): Promise<boolean>;
  writeAll(writer: ByteWriter, data: Uint8Array): Promise<void>;
} = {
  /**
   * Reads a stream into one array, failing as soon as `maxBytes` would be exceeded.
   * The explicit cap prevents accidental unbounded memory allocation.
   *
   * @example
   * ```ts
   * const bytes = await IoUtil.readAll(reader, { maxBytes: 1024 * 1024 });
   * ```
   */
  async readAll(reader: ByteReader, options: ReadAllOptions): Promise<Uint8Array> {
    const { maxBytes } = options;
    const chunkSize = options.chunkSize ?? 64 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError('maxBytes must be a positive safe integer');
    }
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('chunkSize must be a positive safe integer');
    }
    const buffer = new Uint8Array(Math.min(chunkSize, maxBytes));
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const count = await reader.read(buffer);
      if (count === null) break;
      assertCount(count, buffer.length, 'read');
      if (count > maxBytes - total) throw new RangeError(`input exceeds maxBytes (${maxBytes})`);
      chunks.push(buffer.slice(0, count));
      total += count;
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  },

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
   *
   * @example
   * ```ts
   * const header = new Uint8Array(4);
   * if (await IoUtil.readExactly(reader, header, { allowCleanEof: true })) {
   *   // Process the complete header.
   * }
   * ```
   */
  async readExactly(
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
      assertCount(count, remaining, 'read');
      offset += count;
    }
    return true;
  },

  /**
   * Writes every byte, retrying after valid partial writes.
   *
   * @throws {InvalidByteCountError} If the writer reports no progress or an invalid count.
   *
   * @example
   * ```ts
   * await IoUtil.writeAll(file, new TextEncoder().encode('complete record'));
   * ```
   */
  async writeAll(writer: ByteWriter, data: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < data.length) {
      const remaining = data.length - offset;
      const count = await writer.write(data.subarray(offset));
      assertCount(count, remaining, 'write');
      offset += count;
    }
  },
};

export { IoUtil };
