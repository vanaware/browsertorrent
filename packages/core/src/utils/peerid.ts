// /loco/monorepo/webtorrent/src/utils/peerid.ts

import { generateRandomString } from "../crypto/random.ts";

export interface ClientInfo {
  code: string;
  name?: string;
  version?: string;
  style: "azureus" | "shadow" | "unknown";
}

export const LOCO_PEER_ID_PREFIX = "-LO0100-";

const AZUREUS_CLIENTS: Record<string, string> = {
  "AG": "Ares",
  "A~": "Ares",
  "AR": "Arctic",
  "AT": "Artemis",
  "AV": "Avicora",
  "AX": "BitPump",
  "AZ": "Azureus/Vuze",
  "BB": "BitBuddy",
  "BC": "BitComet",
  "BE": "Baretorrent",
  "BF": "Bitflu",
  "BG": "BTG (libtorrent)",
  "BL": "BitCometLite",
  "BP": "BitTorrent Pro",
  "BR": "BitRocket",
  "BS": "BTSlave",
  "BT": "mainline BitTorrent",
  "BW": "BitWombat",
  "BX": "~Bittorrent X",
  "CD": "Enhanced CTorrent",
  "CT": "CTorrent",
  "DE": "Deluge",
  "DP": "Propagate Data Client",
  "EB": "EBit",
  "ES": "electric sheep",
  "FC": "FileCroc",
  "FD": "Free Download Manager",
  "FT": "FoxTorrent",
  "FX": "Freebox BitTorrent",
  "GS": "GSTorrent",
  "HK": "Hekate",
  "HL": "Halite",
  "HM": "hMule (libtorrent)",
  "HN": "Hydranode",
  "IL": "iLivid",
  "JS": "Justseed.it",
  "JT": "JavaTorrent",
  "KG": "KGet",
  "KT": "KTorrent",
  "LC": "LeechCraft",
  "LH": "LH-ABC",
  "LO": "Loco", // 🔥 NOSSO CLIENTE
  "LP": "Lphant",
  "LT": "libtorrent (Rasterbar)",
  "lt": "libTorrent (Rakshasa)",
  "LW": "LimeWire",
  "MK": "Meerkat",
  "MO": "MonoTorrent",
  "MP": "MooPolice",
  "MR": "Miro",
  "MT": "MoonlightTorrent",
  "NB": "Net::BitTorrent",
  "NX": "Net Transport",
  "OS": "OneSwarm",
  "OT": "OmegaTorrent",
  "PB": "Protocol::BitTorrent",
  "PD": "Pando",
  "PI": "PicoTorrent",
  "PT": "PHPTracker",
  "qB": "qBittorrent",
  "QD": "QQDownload",
  "QT": "Qt 4 Torrent",
  "RT": "Retriever",
  "RZ": "RezTorrent",
  "S~": "Shareaza (alpha/beta)",
  "SB": "~Swiftbit",
  "SD": "Thunder (XùnLéi)",
  "SM": "SoMud",
  "SP": "BitSpirit",
  "SS": "SwarmScope",
  "ST": "SymTorrent",
  "st": "sharktorrent",
  "SZ": "Shareaza",
  "TB": "Torch",
  "TE": "terasaur Seed Bank",
  "TL": "Tribler",
  "TN": "TorrentDotNET",
  "TR": "Transmission",
  "TS": "Torrentstorm",
  "TT": "TuoTu",
  "UL": "uLeecher!",
  "UM": "µTorrent for Mac",
  "UT": "µTorrent",
  "VG": "Vagaa",
  "WD": "WebTorrent Desktop",
  "WT": "BitLet",
  "WW": "WebTorrent",
  "WY": "FireTorrent",
  "XF": "Xfplay",
  "XL": "Xunlei",
  "XS": "XSwifter",
  "XT": "XanTorrent",
  "XX": "Xtorrent",
  "ZT": "ZipTorrent",
};

const SHADOW_CLIENTS: Record<string, string> = {
  "A": "ABC",
  "O": "Osprey Permaseed",
  "Q": "BTQueue",
  "R": "Tribler",
  "S": "Shadow's Client",
  "T": "BitTornado",
  "U": "UPnP NAT Bit Torrent",
};

// Funções utilitárias para validação
export function isBase32Char(char: string): boolean {
  return /^[A-Z2-7]$/.test(char);
}

export function isBase32(str: string): boolean {
  return /^[A-Z2-7]+$/.test(str);
}

export function isHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str);
}

export function isSha1(str: string): boolean {
  return str.length === 40 && isHex(str);
}

// Funções de validação de Peer ID
export function isAzStyle(peerid: string): boolean {
  return (
    peerid.length >= 8 &&
    peerid[0] === "-" &&
    peerid[7] === "-" &&
    /^[A-Za-z0-9]{2}$/.test(peerid.slice(1, 3)) &&
    /^\d{4}$/.test(peerid.slice(3, 7))
  );
}

export function isShadowStyle(peerid: string): boolean {
  return (
    peerid.length >= 9 &&
    /^[A-Za-z]$/.test(peerid[0]!) && // 🔥 Ajuste TS: non-null assertion
    peerid.slice(6, 9) === "---"
  );
}

// Funções de conversão de versão
function parseAzVersion(versionStr: string): string {
  if (versionStr.length !== 4) return versionStr;

  const majorChar = versionStr[0]!;
  const minorChar = versionStr[1]!;

  // Validar que major/minor são dígitos
  if (!/\d/.test(majorChar) || !/\d/.test(minorChar)) {
    throw new Error('Invalid Azureus version format: major/minor must be digits');
  }

  const major = majorChar;
  const minor = minorChar;
  const patchNum = parseInt(versionStr.slice(2), 10);

  // Validar range do patch (0-99)
  if (patchNum < 0 || patchNum > 99) {
    throw new Error('Invalid Azureus version format: patch must be between 0-99');
  }

  return `${major}.${minor}.${patchNum}`;
}

function parseShadowVersion(versionStr: string): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-";
  const parts: number[] = [];

  for (const char of versionStr) {
    if (char === "-") break;
    const idx = chars.indexOf(char);
    if (idx !== -1) parts.push(idx);
  }

  return parts.length > 0 ? parts.join(".") : "0";
}

// Funções de encode para diferentes estilos
export function encodeAzStyle(clientCode: string, version: string): string {
  if (clientCode.length !== 2) {
    throw new Error("Client code must be exactly 2 characters");
  }
  
  // Converter versão para formato de 4 dígitos (ex: "1.2.3" -> "1203")
  const parts = version.split(".");
  let major = "0", minor = "0", patch = "0";
  
  if (parts.length >= 1) major = parts[0]?.substring(0, 1) || "0";
  if (parts.length >= 2) minor = parts[1]?.substring(0, 1) || "0";
  if (parts.length >= 3) patch = parts[2]?.substring(0, 2).padStart(2, "0") || "00";
  
  // Garantir que patch tenha 2 dígitos
  if (patch.length === 1) patch = "0" + patch;
  
  const versionStr = `${major}${minor}${patch}`;
  if (versionStr.length !== 4) {
    throw new Error("Version must be in format X.Y.Z where X,Y,Z are single digits or XX for patch");
  }
  
  return `-${clientCode}${versionStr}-`;
}

export function encodeShadowStyle(clientCode: string, version: string): string {
  if (clientCode.length !== 1) {
    throw new Error("Client code must be exactly 1 character");
  }
  
  // Converter versão para formato shadow (ex: "1.2.3" -> "abc")
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-";
  const parts = version.split(".").slice(0, 3);
  let versionStr = "";
  
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num >= chars.length) {
      versionStr += "0"; // fallback para "0" se o número for inválido
    } else {
      versionStr += chars[num];
    }
  }
  
  // Preencher com "0" se necessário
  while (versionStr.length < 5) {
    versionStr += "0";
  }
  
  return `${clientCode}${versionStr}---`;
}

export function encodeGeneric(clientCode: string, version: string, style: "azureus" | "shadow"): string {
  if (style === "azureus") {
    return encodeAzStyle(clientCode, version);
  } else {
    return encodeShadowStyle(clientCode, version);
  }
}

export function decodePeerId(peerId: string | Uint8Array): ClientInfo | null {
  const peeridStr = typeof peerId === "string"
    ? peerId
    : new TextDecoder("utf-8", { fatal: false }).decode(peerId);

  if (peeridStr.length < 20) return null;
  const id = peeridStr.slice(0, 20);

  if (isAzStyle(id)) {
    const code = id.slice(1, 3);
    const versionRaw = id.slice(3, 7);
    const name = AZUREUS_CLIENTS[code] || `Unknown (${code})`;
    const version = parseAzVersion(versionRaw);

    return { code, name, version, style: "azureus" };
  }

  if (isShadowStyle(id)) {
    const code = id[0]!; // 🔥 Ajuste TS: non-null assertion
    const versionRaw = id.slice(1, 6);
    const name = SHADOW_CLIENTS[code] || `Unknown (${code})`;
    const version = parseShadowVersion(versionRaw);

    return { code, name, version, style: "shadow" };
  }

  // 🔥 CORREÇÃO: Retornar null para peers desconhecidos, conforme esperado pelos testes
  return null;
}

export function getPeerIdClientName(peerId: string | Uint8Array): string {
  const info = decodePeerId(peerId);
  return info?.name || "Unknown Client";
}

export function generateLocoPeerId(): Uint8Array {
  const prefix = LOCO_PEER_ID_PREFIX;
  const randomPart = generateRandomString(20 - prefix.length);
  const peerIdStr = prefix + randomPart;

  return new TextEncoder().encode(peerIdStr);
}

