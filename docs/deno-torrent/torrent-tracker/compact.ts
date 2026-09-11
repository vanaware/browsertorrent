import { type PeerEndpoint, TrackerError } from "./types.ts";

/** Parses BEP 23 compact IPv4 peers, rejecting malformed byte lengths. */
export function parseCompactIpv4Peers(bytes: Uint8Array): PeerEndpoint[] {
  if (bytes.length % 6 !== 0) {
    throw new TrackerError("compact IPv4 peer list has invalid length");
  }
  const peers: PeerEndpoint[] = [];
  for (let offset = 0; offset < bytes.length; offset += 6) {
    const port = (bytes[offset + 4]! << 8) | bytes[offset + 5]!;
    if (!port) continue;
    peers.push({
      hostname: `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${
        bytes[offset + 3]
      }`,
      port,
      family: "ipv4",
    });
  }
  return deduplicatePeers(peers);
}

/** Parses compact IPv6 peers, rejecting malformed byte lengths. */
export function parseCompactIpv6Peers(bytes: Uint8Array): PeerEndpoint[] {
  if (bytes.length % 18 !== 0) {
    throw new TrackerError("compact IPv6 peer list has invalid length");
  }
  const peers: PeerEndpoint[] = [];
  for (let offset = 0; offset < bytes.length; offset += 18) {
    const port = (bytes[offset + 16]! << 8) | bytes[offset + 17]!;
    if (!port) continue;
    const groups: string[] = [];
    for (let index = 0; index < 16; index += 2) {
      groups.push(
        ((bytes[offset + index]! << 8) | bytes[offset + index + 1]!).toString(
          16,
        ),
      );
    }
    peers.push({ hostname: groups.join(":"), port, family: "ipv6" });
  }
  return deduplicatePeers(peers);
}

/** Deduplicates and validates a bounded list of peer endpoints. */
export function deduplicatePeers(
  peers: readonly PeerEndpoint[],
  maximum = 2_000,
): PeerEndpoint[] {
  const output: PeerEndpoint[] = [];
  const seen = new Set<string>();
  for (const peer of peers) {
    if (output.length >= maximum) break;
    if (!validPort(peer.port) || !peer.hostname) continue;
    const key = `${peer.family}:${peer.hostname.toLowerCase()}:${peer.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...peer,
      peerId: peer.peerId ? new Uint8Array(peer.peerId) : undefined,
    });
  }
  return output;
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}
