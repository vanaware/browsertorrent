/** Bencode type definitions and custom error classes. */

/** A safe JavaScript integer representable by the 2.0 numeric API. */
export type BencodeInteger = number;

/** A UTF-8 string or an explicitly binary byte string. */
export type BencodeByteString = string | Uint8Array;

/** A dictionary key with an exact on-wire representation. */
export type BencodeKey = BencodeByteString;

/** An ordered sequence of bencode values. */
export type BencodeList = BencodeValue[];

/**
 * A Bencode dictionary.
 *
 * `Map` is intentional: it preserves binary keys without converting them to a
 * lossy string representation. Encoding sorts entries by their wire bytes.
 */
export type BencodeDict = Map<BencodeKey, BencodeValue>;

/** All values accepted by the 2.0 encoder and returned by the decoder. */
export type BencodeValue =
  | BencodeInteger
  | BencodeByteString
  | BencodeList
  | BencodeDict;

/**
 * Thrown when encoding fails due to an invalid or unsupported value.
 * @example
 * ```ts
 * encode(1.5)   // throws BencodeEncodeError: only integers are supported
 * encode(null)  // throws BencodeEncodeError: unsupported value type
 * ```
 */
export class BencodeEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeEncodeError";
  }
}

/**
 * Thrown when decoding fails due to malformed or truncated bencode input.
 * @example
 * ```ts
 * decode(new TextEncoder().encode('i123'))  // throws BencodeDecodeError: unterminated integer
 * ```
 */
export class BencodeDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BencodeDecodeError";
  }
}
