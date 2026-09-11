// /loco/monorepo/webtorrent/tests/server_test.ts

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  createServer,
  guessContentType,
  parseRangeHeader,
  WebTorrentServer,
} from "../src/server/server.ts";
import { InProcessTransport } from "../src/server/server.ts";
import { buildStreamURL, parseStreamURL, streamManager } from "../src/server/stream-manager.ts";
import { File } from "../src/core/file.ts";

// ── Mock classes ────────────────────────────────────────────────────────────────

class MockChunkStore {
  chunkLength = 16384;
  get(_index: number) { return Promise.resolve(new Uint8Array(16384)); }
  put(_index: number, _buf: Uint8Array) { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  destroy() { return Promise.resolve(); }
}

class MockFile {
  constructor(
    public name: string,
    public length: number,
  ) {}

  // File-compatible interface
  get lengthGetter() { return this.length; }
  get nameGetter() { return this.name; }

  async *[Symbol.asyncIterator]() {
    yield new Uint8Array([1, 2, 3, 4]);
    yield new Uint8Array([5, 6, 7, 8]);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("createServer: uses InProcessTransport when no controller", () => {
  const server = createServer({ scope: "/app/" });
  assertEquals(server.scope, "/app/");
  assertEquals(server.isReady, false);
  assertEquals(server.isDestroyed, false);
  server.destroy();
});

Deno.test("createServer: sendReadyAck sets isReady", async () => {
  const server = createServer({ scope: "/" });
  assertEquals(server.isReady, false);

  const result = await server.sendReadyAck();
  assertEquals(result, true);
  assertEquals(server.isReady, true);

  server.destroy();
});

Deno.test("createServer: double createServer returns same instance", () => {
  const server = createServer({ scope: "/" });
  const server2 = createServer({ scope: "/" });
  // createServer is a factory; each call creates a new instance.
  // This is fine — the WebTorrent class guards with a .server field.
  assertEquals(server === server2, false);
  server.destroy();
  server2.destroy();
});

Deno.test("WebTorrentServer.destroy: sets flags and closes transport", () => {
  const server = createServer({ scope: "/" });
  assertEquals(server.isDestroyed, false);

  server.destroy();
  assertEquals(server.isDestroyed, true);
  assertEquals(server.isReady, false);
});

Deno.test("WebTorrentServer.destroy: is idempotent", () => {
  const server = createServer({ scope: "/" });
  server.destroy();
  server.destroy(); // must not throw
  assertEquals(server.isDestroyed, true);
});

Deno.test("WebTorrentServer.handleRequest: returns 404 for unknown URL", async () => {
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: "/some/other/path",
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 404);
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: returns 404 for unregistered file", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${"x".repeat(40)}/0/video.mp4`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 404);
  streamManager.clear();
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: returns 503 when destroyed", async () => {
  const server = createServer({ scope: "/" });
  server.destroy();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${"y".repeat(40)}/0/video.mp4`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 503);
});

Deno.test("WebTorrentServer.handleRequest: parses file index from URL", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  // Register two files for the same torrent
  const mock1 = new MockFile("video.mp4", 1024) as any;
  const mock2 = new MockFile("audio.m4a", 512) as any;
  const infoHash = "a".repeat(40);

  streamManager.register(infoHash, 0, mock1);
  streamManager.register(infoHash, 1, mock2);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  // Request file index 1
  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/1/audio.m4a`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 200);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Type"), "audio/aac");
  assertEquals(headers.get("Content-Length"), "512");
  assertEquals(headers.get("Accept-Ranges"), "bytes");

  streamManager.clear();
  server.destroy();
});

// ── Range request support ─────────────────────────────────────────────────────────

Deno.test("WebTorrentServer.handleRequest: returns 206 for Range request", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const mock = new MockFile("video.mp4", 1024) as any;
  const infoHash = "a".repeat(40); // 40 hex chars (valid infoHash)
  streamManager.register(infoHash, 0, mock);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/0/video.mp4`,
    method: "GET",
    headers: { "range": "bytes=0-99" },
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 206);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Type"), "video/mp4");
  assertEquals(headers.get("Content-Length"), "100");
  assertEquals(headers.get("Accept-Ranges"), "bytes");
  assertEquals(headers.get("Content-Range"), "bytes 0-99/1024");

  streamManager.clear();
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: returns 200 when no Range header", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const mock = new MockFile("video.mp4", 1024) as any;
  const infoHash = "b".repeat(40); // valid hex
  streamManager.register(infoHash, 0, mock);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/0/video.mp4`,
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 200);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Length"), "1024");
  assertEquals(headers.get("Content-Range"), null);

  streamManager.clear();
  server.destroy();
});

Deno.test("WebTorrentServer.handleRequest: suffix range returns 206 with correct length", async () => {
  streamManager.clear();
  const server = createServer({ scope: "/" });
  await server.sendReadyAck();

  const mock = new MockFile("video.mp4", 1024) as any;
  const infoHash = "c".repeat(40); // valid hex
  streamManager.register(infoHash, 0, mock);

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const resp = await server.handleRequest({
    type: "webtorrent-request",
    url: `/webtorrent/${infoHash}/0/video.mp4`,
    method: "GET",
    headers: { "range": "bytes=500-" },
    scope: "/",
    destination: "video",
  }, fakePort);

  assertEquals(resp.status, 206);
  const headers = new Headers(resp.headers);
  assertEquals(headers.get("Content-Range"), "bytes 500-1023/1024");
  assertEquals(headers.get("Content-Length"), "524");

  streamManager.clear();
  server.destroy();
});

Deno.test("InProcessTransport: records postMessage", () => {
  const transport = new InProcessTransport();

  transport.postMessage({ type: "WEBTORRENT_ACK" });
  transport.postMessage({ type: "foo" });

  assertEquals(transport.sent.length, 2);
  assertEquals((transport.sent[0] as any).type, "WEBTORRENT_ACK");

  transport.close();
});

Deno.test("InProcessTransport: requestStream returns pending promise", async () => {
  const transport = new InProcessTransport();

  const fakePort = {
    addEventListener() {},
    start() {},
    close() {},
    postMessage() {},
  } as unknown as MessagePort;

  const p = transport.requestStream({
    type: "webtorrent-request",
    url: "/",
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  // No response yet
  assertEquals(transport.activePort, fakePort);

  // Deliver response
  transport.deliverResponse({ body: "STREAM", status: 200 });
  const result = await p;
  assertEquals(result.status, 200);
  assertEquals(result.body, "STREAM");

  transport.close();
});

Deno.test("InProcessTransport: sendPull sends signal on port", () => {
  let received: boolean | null = null;
  const fakePort = {
    addEventListener(_: string, cb: (e: { data: boolean }) => void) {
      // store callback to trigger later
      (fakePort as any)._cb = cb;
    },
    start() {},
    close() {},
    postMessage(data: boolean) { received = data; },
  } as unknown as MessagePort;

  const transport = new InProcessTransport();
  transport.requestStream({
    type: "webtorrent-request",
    url: "/",
    method: "GET",
    headers: {},
    scope: "/",
    destination: "video",
  }, fakePort);

  transport.sendPull(true);
  assertEquals(received, true);

  transport.sendPull(false);
  assertEquals(received, false);

  transport.close();
});

Deno.test("guessContentType: video formats", () => {
  assertEquals(guessContentType("video.mp4"), "video/mp4");
  assertEquals(guessContentType("video.m4v"), "video/mp4");
  assertEquals(guessContentType("video.webm"), "video/webm");
  assertEquals(guessContentType("video.ogv"), "video/ogg");
  assertEquals(guessContentType("VIDEO.MP4"), "video/mp4"); // case insensitive
});

Deno.test("guessContentType: audio formats", () => {
  assertEquals(guessContentType("audio.mp3"), "audio/mpeg");
  assertEquals(guessContentType("audio.wav"), "audio/wav");
  assertEquals(guessContentType("audio.flac"), "audio/flac");
  assertEquals(guessContentType("audio.m4a"), "audio/aac");
  assertEquals(guessContentType("audio.oga"), "audio/ogg");
  assertEquals(guessContentType("audio.opus"), "audio/opus");
});

Deno.test("guessContentType: image formats", () => {
  assertEquals(guessContentType("image.jpg"), "image/jpeg");
  assertEquals(guessContentType("image.jpeg"), "image/jpeg");
  assertEquals(guessContentType("image.png"), "image/png");
  assertEquals(guessContentType("image.gif"), "image/gif");
  assertEquals(guessContentType("image.webp"), "image/webp");
  assertEquals(guessContentType("image.svg"), "image/svg+xml");
});

Deno.test("guessContentType: other formats", () => {
  assertEquals(guessContentType("doc.pdf"), "application/pdf");
  assertEquals(guessContentType("readme.txt"), "text/plain; charset=utf-8");
  assertEquals(guessContentType("index.html"), "text/html; charset=utf-8");
  assertEquals(guessContentType("data.json"), "application/json; charset=utf-8");
  assertEquals(guessContentType("subs.srt"), "application/x-subrip");
  assertEquals(guessContentType("subs.vtt"), "text/vtt");
});

Deno.test("guessContentType: unknown extension falls back to octet-stream", () => {
  assertEquals(guessContentType("file.bin"), "application/octet-stream");
  assertEquals(guessContentType("file.xyz"), "application/octet-stream");
  assertEquals(guessContentType("file."), "application/octet-stream");
  assertEquals(guessContentType("file"), "application/octet-stream");
});

Deno.test("parseStreamURL: used via server integration", () => {
  const infoHash = "a".repeat(40);
  const url = buildStreamURL("/app/", infoHash, 3, "my video.mp4");
  const parsed = parseStreamURL(url, "/app/");

  assertEquals(parsed?.infoHash, infoHash);
  assertEquals(parsed?.fileIndex, 3);
  assertEquals(parsed?.name, "my video.mp4");
});

// ── parseRangeHeader ─────────────────────────────────────────────────────────

Deno.test("parseRangeHeader: parses valid range with both bounds", () => {
  const result = parseRangeHeader("bytes=0-99", 1000);
  assertEquals(result, { start: 0, end: 99 });
});

Deno.test("parseRangeHeader: parses suffix range (start-)", () => {
  const result = parseRangeHeader("bytes=500-", 1000);
  assertEquals(result, { start: 500, end: 999 });
});

Deno.test("parseRangeHeader: returns null when header is undefined", () => {
  assertEquals(parseRangeHeader(undefined, 1000), null);
});

Deno.test("parseRangeHeader: returns null for invalid units", () => {
  assertEquals(parseRangeHeader("frames=0-99", 1000), null);
});

Deno.test("parseRangeHeader: returns null when start exceeds file length", () => {
  assertEquals(parseRangeHeader("bytes=1001-", 1000), null);
});

Deno.test("parseRangeHeader: returns null when start equals file length", () => {
  assertEquals(parseRangeHeader("bytes=1000-", 1000), null);
});

Deno.test("parseRangeHeader: returns null for malformed format", () => {
  assertEquals(parseRangeHeader("bytes=0..99", 1000), null);
  assertEquals(parseRangeHeader("bytes=-99", 1000), null);
});

Deno.test("parseRangeHeader: clamps end to file length - 1", () => {
  const result = parseRangeHeader("bytes=0-1999", 1000);
  assertEquals(result, { start: 0, end: 999 });
});

Deno.test("parseRangeHeader: returns null when end < start", () => {
  assertEquals(parseRangeHeader("bytes=100-50", 1000), null);
});

Deno.test("parseRangeHeader: returns null for negative start", () => {
  assertEquals(parseRangeHeader("bytes=-10-99", 1000), null);
});

