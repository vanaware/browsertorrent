// /loco/monorepo/webtorrent/tests/mod_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { WebTorrent } from "../src/mod.ts";
import { encode } from "../src/utils/bencode.ts";
import type { ParsedTorrent } from "../src/utils/parse-torrent.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal valid bencoded .torrent that parseTorrent accepts. */
function minimalTorrentBytes(infoHash: string): Uint8Array {
  const info = { name: "test", "piece length": 16, pieces: new Uint8Array(20), length: 16 };
  const torrent = { info, "announce": "udp://tracker.example:80" };
  return new Uint8Array(encode(torrent));
}

/** Build a fake ParsedTorrent matching what parseTorrent returns from minimalTorrentBytes. */
function minimalParsedTorrent(infoHash: string): ParsedTorrent {
  return {
    infoHash,
    infoHashBuffer: new Uint8Array(20),
    name: "test",
    announce: ["udp://tracker.example:80"],
    urlList: [],
    peerAddresses: [],
    files: [{ path: "test", name: "test", length: 16, offset: 0 }],
    length: 16,
    pieceLength: 16,
    pieces: [new Uint8Array(20)],
    info: {} as any,
    magnetURI: "",
  };
}

Deno.test("webtorrent: initializes with default options", () => {
  const client = new WebTorrent();
  
  assertEquals(client.peerId.length, 40);
  assertEquals(client.peerIdBuffer.length, 20);
  assertEquals(client.torrentCount, 0);
  assertEquals(client.isDestroyed, false);
  
  client.destroy();
});

Deno.test("webtorrent: initializes with custom peerId", () => {
  const customPeerId = "a".repeat(40);
  const client = new WebTorrent({ peerId: customPeerId });
  
  assertEquals(client.peerId, customPeerId);
  assertEquals(client.peerIdBuffer[0], 0xaa);
  
  client.destroy();
});

Deno.test("webtorrent: emits 'ready' event", async () => {
  const client = new WebTorrent();
  
  let readyEmitted = false;
  client.on("ready", () => {
    readyEmitted = true;
  });
  
  await new Promise((resolve) => setTimeout(resolve, 10));
  
  assertEquals(readyEmitted, true);
  assertEquals(client.isReady, true);
  
  client.destroy();
});

Deno.test("webtorrent: add() throws if client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  
  await assertRejects(
    () => client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10"),
    Error,
    "WebTorrent client is destroyed"
  );
});

Deno.test("webtorrent: destroy() cleans up all torrents", async () => {
  const client = new WebTorrent();
  
  const torrent = await client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(client.torrentCount, 1);
  
  await client.destroy();
  
  assertEquals(client.torrentCount, 0);
  assertEquals(client.isDestroyed, true);
});

Deno.test("webtorrent: remove() removes a specific torrent", async () => {
  const client = new WebTorrent();
  
  const torrent = await client.add("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(client.torrentCount, 1);
  
  await client.remove(torrent.infoHash);
  assertEquals(client.torrentCount, 0);
  
  client.destroy();
});

Deno.test("webtorrent: add() returns same torrent if already exists", async () => {
  const client = new WebTorrent();

  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  const torrent1 = await client.add(magnet);
  const torrent2 = await client.add(magnet);

  assertEquals(torrent1, torrent2);
  assertEquals(client.torrentCount, 1);

  client.destroy();
});

// ============================================================================
// PHASE 6: WEBRTC_SUPPORT
// ============================================================================

Deno.test("webtorrent: WEBRTC_SUPPORT is a boolean static property", () => {
  assertEquals(typeof WebTorrent.WEBRTC_SUPPORT, "boolean");
  assertEquals(WebTorrent.WEBRTC_SUPPORT === true || WebTorrent.WEBRTC_SUPPORT === false, true);
});

// ============================================================================
// PHASE 6: AGGREGATE GETTERS
// ============================================================================

Deno.test("webtorrent: downloadSpeed aggregates zero when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.downloadSpeed, 0);
  client.destroy();
});

Deno.test("webtorrent: uploadSpeed aggregates zero when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.uploadSpeed, 0);
  client.destroy();
});

Deno.test("webtorrent: progress is 0 when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.progress, 0);
  client.destroy();
});

Deno.test("webtorrent: ratio is 0 when no torrents", () => {
  const client = new WebTorrent();
  assertEquals(client.ratio, 0);
  client.destroy();
});

Deno.test("webtorrent: downloadLimit and uploadLimit reflect constructor options", () => {
  const client = new WebTorrent({ downloadLimit: 1024, uploadLimit: 512 });
  assertEquals(client.downloadLimit, 1024);
  assertEquals(client.uploadLimit, 512);
  client.destroy();
});

Deno.test("webtorrent: downloadLimit and uploadLimit default to 0", () => {
  const client = new WebTorrent();
  assertEquals(client.downloadLimit, 0);
  assertEquals(client.uploadLimit, 0);
  client.destroy();
});

// ============================================================================
// PHASE 6: THROTTLE
// ============================================================================

Deno.test("webtorrent: throttleDownload() sets the download limit", () => {
  const client = new WebTorrent();
  client.throttleDownload(5000);
  assertEquals(client.downloadLimit, 5000);
  client.throttleDownload(0);
  assertEquals(client.downloadLimit, 0);
  client.destroy();
});

Deno.test("webtorrent: throttleUpload() sets the upload limit", () => {
  const client = new WebTorrent();
  client.throttleUpload(3000);
  assertEquals(client.uploadLimit, 3000);
  client.throttleUpload(0);
  assertEquals(client.uploadLimit, 0);
  client.destroy();
});

Deno.test("webtorrent: throttleDownload ignores negative values", () => {
  const client = new WebTorrent();
  client.throttleDownload(-1000);
  assertEquals(client.downloadLimit, 0);
  client.destroy();
});

Deno.test("webtorrent: throttleUpload ignores negative values", () => {
  const client = new WebTorrent();
  client.throttleUpload(-500);
  assertEquals(client.uploadLimit, 0);
  client.destroy();
});

// ============================================================================
// PHASE 6: get()
// ============================================================================

Deno.test("webtorrent: get() returns null when no torrent matches", async () => {
  const client = new WebTorrent();
  const result = await client.get("magnet:?xt=urn:btih:0000000000000000000000000000000000000000");
  assertEquals(result, null);
  client.destroy();
});

Deno.test("webtorrent: get() returns the torrent for a magnet URI", async () => {
  const client = new WebTorrent();
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  const torrent = await client.add(magnet);
  const result = await client.get(magnet);
  assertEquals(result, torrent);
  client.destroy();
});

Deno.test("webtorrent: get() returns null after torrent is removed", async () => {
  const client = new WebTorrent();
  const magnet = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10";
  await client.add(magnet);
  await client.remove("08ada5a7a6183aae1e09d831df6748d566095a10");
  const result = await client.get(magnet);
  assertEquals(result, null);
  client.destroy();
});

Deno.test("webtorrent: get() returns null when client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  const result = await client.get("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  assertEquals(result, null);
});

// ============================================================================
// PHASE 6: seed() — environment and error handling
// ============================================================================

Deno.test("webtorrent: seed() throws when client is destroyed", async () => {
  const client = new WebTorrent();
  client.destroy();
  await assertRejects(
    () => client.seed(new Uint8Array(100)),
    Error,
    "WebTorrent client is destroyed",
  );
});

Deno.test("webtorrent: seed() throws on unsupported input type", async () => {
  const client = new WebTorrent();
  // null hits no instanceof branch → throws TypeError("Unsupported seed input")
  await assertRejects(
    () => client.seed(null as any),
    TypeError,
    "Unsupported seed input",
  );
  client.destroy();
});

// ── client.add / client.remove events — upstream parity ─────────────────────────

Deno.test("webtorrent: emits 'add' event when torrent is added", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("0000000000000000000000000000000000000000");

  let addEvent: CustomEvent | null = null;
  client.on("add", (e) => { addEvent = e; });

  const torrent = await client.add(bytes);
  // The 'add' event detail contains the real torrent
  assertEquals(addEvent !== null, true);
  assertEquals(typeof (addEvent as any).detail.torrent.infoHash, "string");
  assertEquals((addEvent as any).detail.torrent.infoHash, torrent.infoHash);
  client.destroy();
});

Deno.test("webtorrent: emits 'remove' event when torrent is removed", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("1111111111111111111111111111111111111111");
  const torrent = await client.add(bytes);
  const realInfoHash = torrent.infoHash;

  let removeEvent: CustomEvent | null = null;
  client.on("remove", (e) => { removeEvent = e; });

  await client.remove(realInfoHash);

  assertEquals(removeEvent !== null, true);
  assertEquals((removeEvent as any).detail.infoHash, realInfoHash);
  client.destroy();
});

Deno.test("webtorrent: 'add' fires before 'torrent' event", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("2222222222222222222222222222222222222222");
  const events: string[] = [];

  client.on("add", () => events.push("add"));
  client.on("torrent", () => events.push("torrent"));

  await client.add(bytes);
  assertEquals(events[0], "add");
  assertEquals(events[1], "torrent");
  client.destroy();
});

Deno.test("webtorrent: 'add' and 'remove' fire on torrent lifecycle", async () => {
  const client = new WebTorrent();
  const bytes = minimalTorrentBytes("3333333333333333333333333333333333333333");
  let addIH: string | null = null;
  let removeIH: string | null = null;

  client.on("add", (e: any) => { addIH = e.detail.torrent.infoHash; });
  client.on("remove", (e: any) => { removeIH = e.detail.infoHash; });

  const torrent = await client.add(bytes);
  await client.remove(torrent.infoHash);

  assertEquals(addIH, torrent.infoHash);
  assertEquals(removeIH, torrent.infoHash);
  assertEquals(client.torrents.size, 0);
  client.destroy();
});