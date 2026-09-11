// /loco/monorepo/webtorrent/src/utils/buffer.ts
/**
 * Helpers para manipulação de Uint8Array, substituindo o `Buffer` do Node.js.
 * Focado em performance e compatibilidade com o protocolo BitTorrent.
 */

/**
 * Cria um Uint8Array preenchido com zeros.
 */
export function alloc(size: number): Uint8Array {
  return new Uint8Array(size);
}

/**
 * Cria um Uint8Array a partir de uma string (hex ou utf8) ou array.
 */
export function from(
  input: string | number[] | ArrayBuffer | Uint8Array,
  encoding: "hex" | "utf8" = "utf8"
): Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return new Uint8Array(input);

  if (typeof input === "string") {
    if (encoding === "hex") {
      const cleanStr = input.replace(/\s+/g, "");
      if (cleanStr.length % 2 !== 0) throw new Error("Invalid hex string");
      const arr = new Uint8Array(cleanStr.length / 2);
      for (let i = 0; i < cleanStr.length; i += 2) {
        arr[i / 2] = parseInt(cleanStr.substring(i, i + 2), 16);
      }
      return arr;
    }
    // utf8
    return new TextEncoder().encode(input);
  }

  throw new Error("Unsupported input type for buffer.from");
}

/**
 * Concatena múltiplos Uint8Arrays em um único.
 */
export function concat(arrays: Uint8Array[], totalLength?: number): Uint8Array {
  if (totalLength === undefined) {
    totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converte Uint8Array para string.
 */
export function toString(
  buf: Uint8Array,
  encoding: "hex" | "utf8" = "utf8",
  start = 0,
  end?: number
): string {
  const slice = buf.subarray(start, end);
  if (encoding === "hex") {
    return Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return new TextDecoder().decode(slice);
}

/**
 * Compara dois Uint8Arrays.
 */
export function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Lê um UInt32 Big-Endian (usado extensivamente no Wire Protocol).
 * Usamos '!' para afirmar ao TypeScript que o índice existe, garantindo 
 * performance sem verificações de runtime desnecessárias.
 */
export function readUInt32BE(buf: Uint8Array, offset = 0): number {
  return (
    ((buf[offset]!) << 24) |
    ((buf[offset + 1]!) << 16) |
    ((buf[offset + 2]!) << 8) |
    (buf[offset + 3]!)
  ) >>> 0; // >>> 0 força conversão para unsigned 32-bit
}

/**
 * Escreve um UInt32 Big-Endian.
 */
export function writeUInt32BE(buf: Uint8Array, value: number, offset = 0): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

/**
 * XOR byte-a-byte entre dois Uint8Arrays.
 * Lança erro se os comprimentos forem diferentes.
 */
export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new RangeError("Uint8Array lengths must be equal for xor");
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! ^ b[i]!;
  }
  return result;
}

/**
 * Comparação lexicográfica entre dois Uint8Arrays.
 * Retorna -1 se a < b, 0 se iguais, 1 se a > b.
 */
export function compare(a: Uint8Array, b: Uint8Array): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

/**
 * Converte Uint8Array big-endian para bigint.
 * Um array vazio representa zero.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Converte bigint não-negativo para Uint8Array big-endian.
 * Se `length` for fornecido, o resultado é preenchido à esquerda com zeros
 * até atingir exatamente esse comprimento.
 *
 * @throws {RangeError} Se `value` for negativo, `length` for inválido,
 *         ou o valor não couber no comprimento solicitado.
 */
export function bigIntToBytes(value: bigint, length?: number): Uint8Array {
  if (value < 0n) {
    throw new RangeError("value must be a non-negative bigint");
  }
  if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) {
    throw new RangeError("length must be a non-negative safe integer");
  }

  let byteLength = value === 0n ? 1 : 0;
  for (let remaining = value; remaining > 0n; remaining >>= 8n) {
    byteLength++;
  }

  if (length !== undefined) {
    if (value !== 0n && byteLength > length) {
      throw new RangeError("value does not fit in the requested byte length");
    }
    byteLength = length;
  }

  const result = new Uint8Array(byteLength);
  for (
    let index = byteLength - 1, remaining = value;
    index >= 0;
    index--, remaining >>= 8n
  ) {
    result[index] = Number(remaining & 0xffn);
  }
  return result;
}

/**
 * Divide um Uint8Array em chunks de tamanho `chunkSize`.
 * O último chunk pode ser menor se o comprimento não for múltiplo de `chunkSize`.
 *
 * @throws {RangeError} Se `chunkSize` não for um inteiro positivo seguro.
 */
export function chunkBytes(data: Uint8Array, chunkSize: number): Uint8Array[] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive safe integer");
  }

  if (data.length <= chunkSize) {
    return [data];
  }

  const result: Uint8Array[] = [];
  const chunkCount = Math.ceil(data.length / chunkSize);
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = (i + 1) * chunkSize;
    const chunk = data.slice(start, end);
    result.push(chunk);
  }

  return result;
}