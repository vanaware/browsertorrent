// /loco/monorepo/webtorrent/src/utils/parse-torrent.ts
/**
 * Torrent identifier parsing — magnet URIs, raw info hashes and `.torrent`
 * buffers — producing the `ParsedTorrent` shape consumed by Loco.
 *
 * Fase 2 (Metadata & Discovery): a decodificação de buffers agora delega para
 * `metainfo-parser.ts` + `metainfo-identity.ts`:
 *
 * - Validação rigorosa (BEP 3/12/19/47/52) com `TorrentParseError` tipado.
 * - Os bytes exatos do dicionário `info` são preservados (`infoBytes`), de
 *   modo que o info hash é sempre fiel ao arquivo original — a versão
 *   anterior fazia `sha1(encode(info))`, que pode divergir do hash real.
 * - Suporte a metadados v2/hybrid (BEP 52): `infoHashV2`, `version` e
 *   arquivos derivados do `file tree`.
 *
 * A forma pública (`ParsedTorrent`, `ParsedTorrentFile`, `parseTorrent`) é
 * preservada; campos novos são opcionais.
 */

import { BencodeDict } from "./bencode.ts";
import { parseMagnet, ParsedMagnet } from "./magnet.ts";
import { parseTorrentWithIdentity } from "./metainfo-identity.ts";
import { flattenV2Files } from "./metainfo-v2.ts";
import type { TorrentV2Info } from "./torrent-types.ts";

export interface ParsedTorrentFile {
  path: string;
  name: string;
  length: number;
  offset: number;
}

export interface ParsedTorrent {
  infoHash: string;
  infoHashBuffer: Uint8Array;
  name: string;
  announce: string[];
  urlList: string[];
  peerAddresses: string[];
  files: ParsedTorrentFile[];
  length: number;
  pieceLength: number;
  pieces: Uint8Array[];
  info: BencodeDict;
  magnetURI: string;
  comment?: string;
  createdBy?: string;
  /** Full 64-char hex BEP-52 info hash, when the metadata is v2 or hybrid. */
  infoHashV2?: string;
  /** Exact bencoded bytes of the `info` dictionary (faithful hash / BEP 9). */
  infoBytes?: Uint8Array;
  /** Original `.torrent` bytes, when parsed from a buffer. */
  torrentFileBytes?: Uint8Array;
  /** Detected metadata version. */
  version?: "v1" | "v2" | "hybrid";
}

/** Resource limits accepted by `parseTorrent` for buffer input. */
export interface ParseTorrentInputOptions {
  /** Maximum encoded metainfo size in bytes (default 16 MiB). */
  maxBytes?: number;
  /** Allow v2 metadata without its outer piece layers (BEP 9 bootstrap). */
  allowMissingPieceLayers?: boolean;
}

export async function parseTorrent(
  torrentId: string | Uint8Array | ParsedTorrent,
  options: ParseTorrentInputOptions = {},
): Promise<ParsedTorrent> {
  // 1. Se já for um objeto ParsedTorrent, apenas retorna
  if (typeof torrentId === "object" && !(torrentId instanceof Uint8Array) && "infoHash" in torrentId && "files" in torrentId) {
    return torrentId as ParsedTorrent;
  }

  // 2. Se for string, assume que é Magnet URI (ou infoHash puro)
  if (typeof torrentId === "string") {
    let magnetUri = torrentId;
    if (/^[a-f0-9]{40}$/i.test(torrentId) || /^[a-z2-7]{32}$/i.test(torrentId)) {
      magnetUri = `magnet:?xt=urn:btih:${torrentId}`;
    }
    if (!magnetUri.startsWith("magnet:?")) {
      throw new Error("Invalid torrent identifier");
    }
    return magnetToParsed(parseMagnet(magnetUri));
  }

  // 3. Se for Uint8Array, assume que é um arquivo .torrent codificado em Bencode
  if (torrentId instanceof Uint8Array) {
    return await bufferToParsed(torrentId, options);
  }

  throw new Error("Invalid torrent identifier type");
}

function magnetToParsed(magnet: ParsedMagnet): ParsedTorrent {
  const version: "v1" | "v2" | "hybrid" =
    magnet.infoHashV1Hex !== undefined && magnet.infoHashV2Hex !== undefined
      ? "hybrid"
      : magnet.protocol;

  return {
    infoHash: magnet.infoHash,
    infoHashBuffer: magnet.handshakeHash,
    name: magnet.name || "Unknown",
    announce: magnet.announce,
    urlList: magnet.webSeeds,
    peerAddresses: magnet.peerAddresses,
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: magnet.magnetURI,
    infoHashV2: magnet.infoHashV2Hex,
    version,
  };
}

async function bufferToParsed(
  buffer: Uint8Array,
  options: ParseTorrentInputOptions,
): Promise<ParsedTorrent> {
  // Validação rigorosa + preservação dos bytes exatos do info dict.
  const identity = await parseTorrentWithIdentity(buffer, {
    maxBytes: options.maxBytes,
    allowMissingPieceLayers: options.allowMissingPieceLayers,
  });
  const torrent = identity.torrent;
  const infoRecord = torrent.info as unknown as BencodeDict;

  const pieceLength = infoRecord["piece length"] as number;

  // Peças v1 (v2-only não possui hashes SHA-1 por peça).
  const pieces: Uint8Array[] = [];
  if (identity.infoHashV1 !== undefined) {
    const piecesRaw = infoRecord["pieces"] as Uint8Array;
    for (let i = 0; i < piecesRaw.length; i += 20) {
      pieces.push(piecesRaw.subarray(i, i + 20));
    }
  }

  // Arquivos: layout v1/hybrid ou file tree v2.
  const files: ParsedTorrentFile[] = [];
  let totalLength = 0;

  if (identity.version === "v2") {
    const v2Files = flattenV2Files(torrent.info as unknown as TorrentV2Info);
    for (const file of v2Files) {
      const path = file.path.join("/");
      const name = file.path[file.path.length - 1]!;
      files.push({ path, name, length: file.length, offset: totalLength });
      totalLength += file.length;
    }
  } else if (infoRecord["files"]) {
    const filesList = infoRecord["files"] as Array<Record<string, unknown>>;
    for (const fileDict of filesList) {
      const length = fileDict["length"] as number;
      const pathParts = fileDict["path"] as string[];
      const path = pathParts.join("/");
      const name = pathParts[pathParts.length - 1]!;
      files.push({ path, name, length, offset: totalLength });
      totalLength += length;
    }
  } else {
    const length = infoRecord["length"] as number;
    const name = infoRecord["name"] as string;
    files.push({ path: name, name, length, offset: 0 });
    totalLength = length;
  }

  // Announce + announce-list (ordem preservada, sem duplicatas).
  const announce: string[] = [];
  if (torrent.announce) {
    announce.push(torrent.announce);
  }
  if (torrent["announce-list"]) {
    for (const tier of torrent["announce-list"]) {
      for (const url of tier) {
        if (!announce.includes(url)) announce.push(url);
      }
    }
  }

  // Web seeds (BEP 19).
  const urlList: string[] = [];
  const rawUrlList = torrent["url-list"] as string | string[] | Uint8Array | undefined;
  if (rawUrlList !== undefined) {
    const candidates = Array.isArray(rawUrlList) ? rawUrlList : [rawUrlList];
    for (const url of candidates) {
      const urlStr = typeof url === "string"
        ? url
        : new TextDecoder().decode(url as Uint8Array);
      if (!urlList.includes(urlStr)) urlList.push(urlStr);
    }
  }

  const infoHashHex = identity.infoHashHex;
  const infoHashBuffer = new Uint8Array(identity.infoHash);

  return {
    infoHash: infoHashHex,
    infoHashBuffer,
    name: infoRecord["name"] as string,
    announce,
    urlList,
    peerAddresses: [],
    files,
    length: totalLength,
    pieceLength,
    pieces,
    info: infoRecord,
    magnetURI: "",
    comment: torrent.comment,
    createdBy: torrent["created by"],
    infoHashV2: identity.infoHashV2 ? toHex(identity.infoHashV2) : undefined,
    infoBytes: identity.infoBytes,
    torrentFileBytes: new Uint8Array(buffer),
    version: identity.version,
  };
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
