// /loco/monorepo/webtorrent/src/utils/constants.ts

/**
 * Constantes do protocolo BitTorrent (BEP 3, BEP 10).
 * Centraliza todos os IDs de mensagens e códigos de extensão.
 */

// ============================================================================
// IDs DE MENSAGENS DO PROTOCOLO BITTORRENT (BEP 3)
// ============================================================================

export const MSG_CHOKE = 0;
export const MSG_UNCHOKE = 1;
export const MSG_INTERESTED = 2;
export const MSG_NOT_INTERESTED = 3;
export const MSG_HAVE = 4;
export const MSG_BITFIELD = 5;
export const MSG_REQUEST = 6;
export const MSG_PIECE = 7;
export const MSG_CANCEL = 8;
export const MSG_PORT = 9; // DHT port (BEP 5)
export const MSG_SUGGEST = 13; // BEP 6 (Fast Extension)
export const MSG_HAVE_ALL = 14; // BEP 6
export const MSG_HAVE_NONE = 15; // BEP 6
export const MSG_REJECT = 16; // BEP 6
export const MSG_ALLOWED_FAST = 17; // BEP 6

// ============================================================================
// PROTOCOLO DE EXTENSÃO (BEP 10)
// ============================================================================

export const MSG_EXTENDED = 20;
export const EXT_HANDSHAKE = 0; // ID reservado para handshake de extensões

// ============================================================================
// TAMANHOS DE MENSAGENS
// ============================================================================

export const HANDSHAKE_LENGTH = 68; // 1 + 19 + 8 + 20 + 20
export const KEEP_ALIVE_LENGTH = 4; // Apenas o length prefix (0)

// ============================================================================
// LIMITES E TIMEOUTS
// ============================================================================

export const DEFAULT_MAX_CONNS = 55;
export const WEBRTC_CONNECT_TIMEOUT = 25_000; // 25 segundos
export const BITTORRENT_HANDSHAKE_TIMEOUT = 25_000; // 25 segundos
export const TRACKER_TIMEOUT = 15_000; // 15 segundos

// ============================================================================
// PROTOCOLO STRING
// ============================================================================

export const PSTR = "BitTorrent protocol";
export const PSTR_BUFFER = new TextEncoder().encode(PSTR);