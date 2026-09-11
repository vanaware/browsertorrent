// /loco/monorepo/webtorrent/src/utils/net.ts
/**
 * Network address, port, and compact-peer utilities.
 *
 * Adaptado de deno-torrent/toolkit/net/net_util.ts para uso browser-first.
 *
 * Mudanças em relação ao deno-torrent:
 * - isNetPort valida 1-65535 (porta 0 não é usável como porta de destino)
 * - getMacAddr() removido (Deno-only, desnecessário no browser)
 * - isDomain, isWellKnownPort, isRegisteredPort, isDynamicPort removidos (não usados)
 * - bytes2IPv4Str / ipv4Str2Bytes internalizados como helpers privados
 * - Adicionado: isIPv6String, parseCompactIpv4Peers, parseCompactIpv6Peers, deduplicatePeers
 */

// ============================================================================
// VALIDAÇÃO DE PORTA
// ============================================================================

/**
 * Verifica se a porta é válida (1-65535).
 * Porta 0 é reservada pelo OS e não é usável como porta de destino.
 */
export function isNetPort(port: number): boolean {
  if (!Number.isInteger(port)) return false;
  return port >= 1 && port <= 65535;
}

// ============================================================================
// VALIDAÇÃO DE IPv4
// ============================================================================

/**
 * Verifica se o string é um endereço IPv4 válido (dotted-decimal).
 * Cada octeto deve estar no range 0-255.
 */
export function isIPv4String(ip: string): boolean {
  return /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/
    .test(ip);
}

/**
 * Verifica se o Uint8Array representa um endereço IPv4 (exatamente 4 bytes).
 */
export function isIPv4Bytes(ip: Uint8Array): boolean {
  return ip.length === 4;
}

// ============================================================================
// VALIDAÇÃO DE IPv6
// ============================================================================

/**
 * Validação básica de string IPv6.
 * Aceita formatos: full (::1, fe80::1), com zona (%eth0), e com IPv4 embutido.
 * Não valida semântica exaustiva — cobre os formatos encontrados em peers/trackers.
 */
export function isIPv6String(ip: string): boolean {
  if (!ip || ip.length < 2) return false;

  // Remover zona (scope id), ex: fe80::1%eth0
  const zoneIdx = ip.indexOf("%");
  const addr = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;

  // Caso especial: "::"
  if (addr === "::") return true;

  // Caso: IPv4-mapped (::ffff:192.168.1.1) ou IPv4-embedded
  const lastColon = addr.lastIndexOf(":");
  if (lastColon >= 0) {
    const afterLastColon = addr.slice(lastColon + 1);
    // Se o segmento após o último ':' contém '.', é IPv4 embutido
    if (afterLastColon.includes(".")) {
      if (!isIPv4String(afterLastColon)) return false;
      // Validar a parte IPv6 antes do IPv4
      // Remove o ':' separador (não é parte dos hextets).
      // Se isso quebrou um "::" (ex: "::192.168.1.1" → ":"), restaura.
      let v6Part = addr.slice(0, lastColon);
      if (v6Part.endsWith(":") && !v6Part.endsWith("::")) {
        v6Part += ":";
      }
      return isValidIpv6Hextets(v6Part, true);
    }
  }

  return isValidIpv6Hextets(addr, false);
}

/**
 * Valida os hextets de um endereço IPv6.
 */
function isValidIpv6Hextets(addr: string, hasEmbeddedIpv4: boolean): boolean {
  // Separar os lados do "::"
  const doubleColonIdx = addr.indexOf("::");
  let leftPart: string;
  let rightPart: string;

  if (doubleColonIdx >= 0) {
    // Verificar se há mais de um "::"
    if (addr.indexOf("::", doubleColonIdx + 1) >= 0) return false;

    leftPart = addr.slice(0, doubleColonIdx);
    rightPart = addr.slice(doubleColonIdx + 2);
  } else {
    leftPart = addr;
    rightPart = "";
  }

  const leftGroups = leftPart ? leftPart.split(":") : [];
  const rightGroups = rightPart ? rightPart.split(":") : [];
  const totalGroups = leftGroups.length + rightGroups.length;

  // Sem "::", deve ter exatamente 8 grupos (ou 6 se IPv4 embutido)
  if (doubleColonIdx < 0) {
    const expected = hasEmbeddedIpv4 ? 6 : 8;
    if (totalGroups !== expected) return false;
  } else {
    // Com "::", o total de grupos deve ser <= 7 (ou 5 com IPv4 embutido)
    const max = hasEmbeddedIpv4 ? 5 : 7;
    if (totalGroups > max) return false;
  }

  // Validar cada grupo
  const allGroups = [...leftGroups, ...rightGroups];
  for (const group of allGroups) {
    if (group === "") return false; // grupo vazio sem "::"
    if (group.length > 4) return false;
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return false;
  }

  return true;
}

// ============================================================================
// HELPERS PRIVADOS: conversão IPv4 bytes ↔ string
// ============================================================================

function bytesToIPv4String(bytes: Uint8Array): string {
  return `${bytes[0]!}.${bytes[1]!}.${bytes[2]!}.${bytes[3]!}`;
}

function ipv4StringToBytes(ip: string): Uint8Array | undefined {
  if (!isIPv4String(ip)) return undefined;
  return Uint8Array.from(ip.split(".").map((v) => parseInt(v, 10)));
}

// ============================================================================
// COMPACT PEER PARSING (BEP 23 / BEP 7)
// ============================================================================

export interface PeerEndpoint {
  ip: string;
  port: number;
}

/**
 * Decodifica peers no formato compact IPv4 (BEP 23).
 * Cada peer ocupa 6 bytes: 4 bytes IP + 2 bytes porta (big-endian).
 *
 * @param data - Buffer contendo os peers compactos
 * @returns Array de { ip, port }
 * @throws {RangeError} Se o comprimento de data não for múltiplo de 6
 */
export function parseCompactIpv4Peers(data: Uint8Array): Array<PeerEndpoint> {
  if (data.length % 6 !== 0) {
    throw new RangeError(
      `compact IPv4 peer data length must be a multiple of 6, got ${data.length}`,
    );
  }

  const peers: Array<PeerEndpoint> = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    const ip = bytesToIPv4String(data.subarray(offset, offset + 4));
    const port = (data[offset + 4]! << 8) | data[offset + 5]!;
    peers.push({ ip, port });
  }
  return peers;
}

/**
 * Decodifica peers no formato compact IPv6 (BEP 7).
 * Cada peer ocupa 18 bytes: 16 bytes IP + 2 bytes porta (big-endian).
 *
 * @param data - Buffer contendo os peers compactos
 * @returns Array de { ip, port }
 * @throws {RangeError} Se o comprimento de data não for múltiplo de 18
 */
export function parseCompactIpv6Peers(data: Uint8Array): Array<PeerEndpoint> {
  if (data.length % 18 !== 0) {
    throw new RangeError(
      `compact IPv6 peer data length must be a multiple of 18, got ${data.length}`,
    );
  }

  const peers: Array<PeerEndpoint> = [];
  for (let offset = 0; offset < data.length; offset += 18) {
    const ipBytes = data.subarray(offset, offset + 16);
    const ip = bytesToIPv6String(ipBytes);
    const port = (data[offset + 16]! << 8) | data[offset + 17]!;
    peers.push({ ip, port });
  }
  return peers;
}

/**
 * Converte 16 bytes em string IPv6 abreviado (RFC 5952 simplificado).
 * Compressa a sequência mais longa de grupos zero para "::".
 */
function bytesToIPv6String(bytes: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    const value = (bytes[i]! << 8) | bytes[i + 1]!;
    groups.push(value.toString(16));
  }

  // Encontrar a sequência mais longa de grupos "0"
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === "0") {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  // Comprimir a sequência mais longa
  if (bestLen >= 2) {
    const left = groups.slice(0, bestStart).join(":");
    const right = groups.slice(bestStart + bestLen).join(":");
    if (left === "" && right === "") return "::";
    if (left === "") return `::${right}`;
    if (right === "") return `${left}::`;
    return `${left}::${right}`;
  }

  return groups.join(":");
}

// ============================================================================
// DEDUPLICAÇÃO DE PEERS
// ============================================================================

/**
 * Remove peers duplicados (mesmo ip + port).
 * Preserva a ordem de primeira ocorrência.
 */
export function deduplicatePeers(
  peers: Array<PeerEndpoint>,
): Array<PeerEndpoint> {
  const seen = new Set<string>();
  const result: Array<PeerEndpoint> = [];

  for (const peer of peers) {
    const key = `${peer.ip}:${peer.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(peer);
    }
  }

  return result;
}
