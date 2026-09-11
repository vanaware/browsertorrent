// /loco/monorepo/webtorrent/src/utils/encode-util.ts

/**
 * Converte um Uint8Array em uma string onde cada caractere representa um byte.
 * Isso é essencial para enviar info_hash e peer_id em URLs de trackers HTTP,
 * pois o encodeURIComponent padrão corrompe bytes > 0x7F.
 */
export function uint8ArrayToBinaryString(buffer: Uint8Array): string {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i]!);
  }
  return result;
}

/**
 * Converte uma string de byte único de volta para Uint8Array.
 */
export function binaryStringToUint8Array(str: string): Uint8Array {
  const buffer = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    buffer[i] = str.charCodeAt(i);
  }
  return buffer;
}