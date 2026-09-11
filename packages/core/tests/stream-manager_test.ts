// /loco/monorepo/webtorrent/tests/stream-manager_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  buildStreamURL,
  parseStreamURL,
  streamManager,
  StreamManager,
} from "../src/server/stream-manager.ts";

// Mock File for testing
class MockFile {
  name = "test.mp4";
  length = 1024;
  constructor(public infoHash?: string, public fileIndex?: number) {}
}

Deno.test("streamManager: register and get", () => {
  streamManager.clear();
  const file = new MockFile("abc123", 0) as any;
  streamManager.register("abc123", 0, file);

  const entry = streamManager.get("abc123", 0);
  assertEquals(entry?.infoHash, "abc123");
  assertEquals(entry?.fileIndex, 0);
  assertEquals(entry?.file, file);
  streamManager.clear();
});

Deno.test("streamManager: unregister", () => {
  streamManager.clear();
  const file = new MockFile() as any;
  streamManager.register("abc", 0, file);
  streamManager.register("abc", 1, file);

  assertEquals(streamManager.size(), 2);

  streamManager.unregister("abc", 0);
  assertEquals(streamManager.size(), 1);
  assertEquals(streamManager.get("abc", 0), undefined);
  assertEquals(streamManager.get("abc", 1)?.file, file);

  streamManager.clear();
});

Deno.test("streamManager: unregisterTorrent removes all files", () => {
  streamManager.clear();
  const file = new MockFile() as any;
  streamManager.register("hash1", 0, file);
  streamManager.register("hash1", 1, file);
  streamManager.register("hash2", 0, file);

  assertEquals(streamManager.size(), 3);

  streamManager.unregisterTorrent("hash1");
  assertEquals(streamManager.size(), 1);
  assertEquals(streamManager.get("hash1", 0), undefined);
  assertEquals(streamManager.get("hash1", 1), undefined);
  assertEquals(streamManager.get("hash2", 0)?.file, file);

  streamManager.clear();
});

Deno.test("streamManager: list returns all entries", () => {
  streamManager.clear();
  const file1 = new MockFile() as any;
  const file2 = new MockFile() as any;
  streamManager.register("h1", 0, file1);
  streamManager.register("h1", 1, file2);

  const entries = streamManager.list();
  assertEquals(entries.length, 2);

  streamManager.clear();
});

Deno.test("streamManager: clear removes everything", () => {
  streamManager.clear();
  const file = new MockFile() as any;
  for (let i = 0; i < 5; i++) {
    streamManager.register("h", i, file);
  }
  assertEquals(streamManager.size(), 5);

  streamManager.clear();
  assertEquals(streamManager.size(), 0);
});

Deno.test("buildStreamURL: produces correct URL format", () => {
  const url = buildStreamURL("/", "a".repeat(40), 3, "video.mp4");
  assertEquals(url, `/webtorrent/${"a".repeat(40)}/3/video.mp4`);
});

Deno.test("buildStreamURL: URL-encodes file name with spaces", () => {
  const url = buildStreamURL("/app/", "b".repeat(40), 0, "my video file.mp4");
  assertEquals(url.includes("my%20video%20file.mp4"), true);
});

Deno.test("parseStreamURL: parses valid URL", () => {
  const infoHash = "c".repeat(40);
  const url = `/webtorrent/${infoHash}/5/my%20file.mp4`;

  const result = parseStreamURL(url, "/");
  assertEquals(result?.infoHash, infoHash);
  assertEquals(result?.fileIndex, 5);
  assertEquals(result?.name, "my file.mp4");
});

Deno.test("parseStreamURL: returns null for non-matching scope", () => {
  const url = `/webtorrent/${"d".repeat(40)}/0/file.txt`;
  assertEquals(parseStreamURL(url, "/app/"), null);
});

Deno.test("parseStreamURL: returns null for invalid infoHash length", () => {
  const url = `/webtorrent/abc123/0/file.txt`;
  assertEquals(parseStreamURL(url, "/"), null);
});

Deno.test("parseStreamURL: returns null for negative fileIndex", () => {
  const url = `/webtorrent/${"e".repeat(40)}/-1/file.txt`;
  assertEquals(parseStreamURL(url, "/"), null);
});

Deno.test("parseStreamURL: handles nested path in file name", () => {
  const infoHash = "f".repeat(40);
  const url = `/webtorrent/${infoHash}/2/path/to/file.txt`;

  const result = parseStreamURL(url, "/");
  assertEquals(result?.fileIndex, 2);
  assertEquals(result?.name, "path/to/file.txt");
});

Deno.test("parseStreamURL: normalizes infoHash to lowercase", () => {
  const infoHash = "A".repeat(40);
  const url = `/webtorrent/${infoHash}/0/file.txt`;

  const result = parseStreamURL(url, "/");
  assertEquals(result?.infoHash, "a".repeat(40));
});
