/** Bencode 2.0 encoder. */

import {
  type BencodeDict,
  BencodeEncodeError,
  type BencodeKey,
  type BencodeList,
  type BencodeValue,
} from "./types.ts";

const _te = new TextEncoder();

/**
 * Encode a Bencode value into its canonical byte representation.
 *
 * Dictionaries must be `Map` instances so binary keys can be represented
 * without conversion. Entries are sorted by their encoded key bytes.
 *
 * @throws {BencodeEncodeError} If the value is unsupported, unsafe, cyclic, or ambiguous.
 */
export function encode(value: BencodeValue): Uint8Array {
  const writer = new _ByteWriter();
  _encodeValue(value, writer, new WeakSet<object>());
  return writer.finish();
}

function _encodeValue(
  value: BencodeValue,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  if (typeof value === "number") {
    _encodeInteger(value, out);
    return;
  }
  if (typeof value === "string") {
    _encodeString(value, out);
    return;
  }
  if (value instanceof Uint8Array) {
    _encodeBytes(value, out);
    return;
  }
  if (Array.isArray(value) || value instanceof Map) {
    if (ancestors.has(value)) {
      throw new BencodeEncodeError("cannot encode cyclic data");
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) _encodeList(value, out, ancestors);
      else _encodeDict(value, out, ancestors);
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  throw new BencodeEncodeError(`unsupported value type: ${typeof value}`);
}

function _encodeInteger(value: number, out: _ByteWriter): void {
  if (!Number.isSafeInteger(value)) {
    throw new BencodeEncodeError(
      `only safe integers are supported, got: ${value}`,
    );
  }
  out.write(_te.encode(`i${value}e`));
}

function _encodeString(value: string, out: _ByteWriter): void {
  _encodeBytes(_te.encode(value), out);
}

function _encodeBytes(value: Uint8Array, out: _ByteWriter): void {
  out.write(_te.encode(`${value.length}:`));
  out.write(value);
}

function _encodeList(
  value: BencodeList,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  out.write(_te.encode("l"));
  for (const item of value) _encodeValue(item, out, ancestors);
  out.write(_te.encode("e"));
}

function _encodeDict(
  value: BencodeDict,
  out: _ByteWriter,
  ancestors: WeakSet<object>,
): void {
  const entries = [...value.entries()].map(([key, item]) => ({
    bytes: _keyBytes(key),
    item,
  }));
  entries.sort((a, b) => _compareBytes(a.bytes, b.bytes));

  out.write(_te.encode("d"));
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && _compareBytes(entries[i - 1].bytes, entries[i].bytes) === 0) {
      throw new BencodeEncodeError(
        "duplicate dictionary key after byte encoding",
      );
    }
    _encodeBytes(entries[i].bytes, out);
    _encodeValue(entries[i].item, out, ancestors);
  }
  out.write(_te.encode("e"));
}

function _keyBytes(key: BencodeKey): Uint8Array {
  if (typeof key === "string") return _te.encode(key);
  if (key instanceof Uint8Array) return key;
  throw new BencodeEncodeError(
    "dictionary keys must be string or Uint8Array",
  );
}

function _compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

class _ByteWriter {
  #buffer = new Uint8Array(1024);
  #length = 0;

  write(chunk: Uint8Array): void {
    const required = this.#length + chunk.length;
    if (required > this.#buffer.length) {
      let capacity = this.#buffer.length;
      while (capacity < required) capacity *= 2;
      const next = new Uint8Array(capacity);
      next.set(this.#buffer);
      this.#buffer = next;
    }
    this.#buffer.set(chunk, this.#length);
    this.#length = required;
  }

  finish(): Uint8Array {
    return this.#buffer.slice(0, this.#length);
  }
}
