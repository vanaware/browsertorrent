// /loco/monorepo/webtorrent/tests/parse-torrent_test.ts

// ... (mantenha todo o resto do arquivo igual)
import { assertEquals, assertRejects } from "@std/assert";
import { parseTorrent, ParsedTorrent } from "../src/utils/parse-torrent.ts";
import { encode, BencodeValue } from "../src/utils/bencode.ts";

const TEXT_ENCODER = new TextEncoder();

// Helper para criar um .torrent falso em memória
function createFakeTorrentBuffer(isMultiFile = false): Uint8Array {
  const PIECE_LENGTH = 16384;
  let total: number;
  if (isMultiFile) {
    total = 3000;
  } else {
    total = 5000;
  }
  const pieceCount = Math.ceil(total / PIECE_LENGTH);
  const pieces = new Uint8Array(pieceCount * 20);
  
  const info: Record<string, BencodeValue> = {
    "piece length": 16384,
    pieces,
  };

  if (isMultiFile) {
    info["files"] = [
      { length: 1000, path: [TEXT_ENCODER.encode("folder"), TEXT_ENCODER.encode("file1.txt")] },
      { length: 2000, path: [TEXT_ENCODER.encode("folder"), TEXT_ENCODER.encode("file2.txt")] },
    ];
    info["name"] = TEXT_ENCODER.encode("my-multi-file-torrent");
  } else {
    info["length"] = 5000;
    info["name"] = TEXT_ENCODER.encode("single-file.mp4");
  }

  const torrentObj: Record<string, BencodeValue> = {
    info,
    announce: TEXT_ENCODER.encode("udp://tracker.example.com:6969"),
    "announce-list": [
      [TEXT_ENCODER.encode("udp://tracker.example.com:6969")],
      [TEXT_ENCODER.encode("wss://tracker.btorrent.xyz")],
    ],
    "url-list": [TEXT_ENCODER.encode("https://webtorrent.io/torrents/")],
    comment: TEXT_ENCODER.encode("Test torrent"),
    "created by": TEXT_ENCODER.encode("Loco WebTorrent"),
  };

  return encode(torrentObj);
}

Deno.test("parse-torrent: parse single-file .torrent buffer", async () => {
  const buffer = createFakeTorrentBuffer(false);
  const parsed = await parseTorrent(buffer);

  assertEquals(parsed.files.length, 1);
  assertEquals(parsed.files[0]!.name, "single-file.mp4");
  assertEquals(parsed.files[0]!.length, 5000);
  assertEquals(parsed.length, 5000);
  assertEquals(parsed.pieceLength, 16384);
  assertEquals(parsed.pieces.length, 1); // 1 piece for 5000 bytes with 16384 piece length
  assertEquals(parsed.announce.length, 2); // deduplicado
  assertEquals(parsed.urlList.length, 1);
  assertEquals(parsed.comment, "Test torrent");
  assertEquals(parsed.infoHash.length, 40);
});

Deno.test("parse-torrent: parse multi-file .torrent buffer", async () => {
  const buffer = createFakeTorrentBuffer(true);
  const parsed = await parseTorrent(buffer);

  assertEquals(parsed.files.length, 2);
  assertEquals(parsed.files[0]!.path, "folder/file1.txt");
  assertEquals(parsed.files[0]!.offset, 0);
  assertEquals(parsed.files[1]!.path, "folder/file2.txt");
  assertEquals(parsed.files[1]!.offset, 1000);
  assertEquals(parsed.length, 3000);
  assertEquals(parsed.name, "my-multi-file-torrent");
});

Deno.test("parse-torrent: parse magnet URI", async () => {
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.example.com";
  const parsed = await parseTorrent(magnet);

  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.name, "Sintel");
  assertEquals(parsed.announce.length, 1);
  assertEquals(parsed.files.length, 0); // Magnet não tem arquivos até baixar metadados
  assertEquals(parsed.length, 0);
});

Deno.test("parse-torrent: parse raw infoHash string", async () => {
  const parsed = await parseTorrent("08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(parsed.infoHash, "08ada5a7a6183aae1e09d831df6748d566095a10");
});

Deno.test("parse-torrent: throws on invalid input", async () => {
  await assertRejects(
    () => parseTorrent("invalid-string"),
    Error,
    "Invalid torrent identifier"
  );
});
Deno.test("parse-torrent: returns same object if already parsed", async () => {
  const original: ParsedTorrent = {
    infoHash: "08ada5a7a6183aae1e09d831df6748d566095a10",
    infoHashBuffer: new Uint8Array(20),
    name: "Unknown", // 🔥 CORREÇÃO: Adicionado 'name' para satisfazer a interface
    announce: [],
    urlList: [],
    peerAddresses: [],
    files: [],
    length: 0,
    pieceLength: 0,
    pieces: [],
    info: {},
    magnetURI: "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10",
  };
  const result = await parseTorrent(original);
  assertEquals(result, original);
});