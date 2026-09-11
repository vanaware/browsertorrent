// /loco/monorepo/webtorrent/tests/metainfo-parser_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { encode, type BencodeValue } from "../src/utils/bencode.ts";
import {
  parseMetainfo,
} from "../src/utils/metainfo-parser.ts";
import { TorrentParseError } from "../src/utils/errors.ts";

const PIECE_LENGTH = 16384;

/** Build a bencoded v1 torrent with a valid `pieces` byte count. */
function v1Buffer(kind: "single" | "multi"): Uint8Array {
  const info: Record<string, BencodeValue> = { "piece length": PIECE_LENGTH };
  let total = 0;

  if (kind === "single") {
    total = 5000;
    info["length"] = total;
    info["name"] = "single.bin";
  } else {
    const files = [
      { length: 1000, path: ["folder", "a.txt"] },
      { length: 2000, path: ["folder", "b.txt"] },
    ];
    total = 3000;
    info["files"] = files;
    info["name"] = "multi";
  }

  const pieceCount = Math.ceil(total / PIECE_LENGTH);
  info["pieces"] = new Uint8Array(pieceCount * 20);

  return encode({
    info,
    announce: "udp://tracker.example.com:6969",
    "announce-list": [
      ["udp://tracker.example.com:6969"],
    ],
    "created by": "loco-test",
    "creation date": 1700000000,
  });
}

/** Build a minimal single-file v2 torrent with no piece layers (small file). */
function v2Buffer(): Uint8Array {
  return encode({
    info: {
      name: "v2-test",
      "piece length": PIECE_LENGTH,
      "meta version": 2,
      "file tree": {
        "file.bin": {
          "": {
            length: 100,
            "pieces root": new Uint8Array(32),
          },
        },
      },
    },
  });
}

Deno.test("metainfo-parser: parses single-file v1 torrent", async () => {
  const torrent = await parseMetainfo(v1Buffer("single"));

  assertEquals(torrent.info.name, "single.bin");
  assertEquals(torrent.announce, "udp://tracker.example.com:6969");
  assertEquals(torrent.info["piece length"], PIECE_LENGTH);
  assertEquals((torrent.info as { length: number }).length, 5000);
  assertEquals((torrent.info["pieces"] as Uint8Array).length, 20);
});

Deno.test("metainfo-parser: parses multi-file v1 torrent", async () => {
  const torrent = await parseMetainfo(v1Buffer("multi"));
  const files = (torrent.info as { files: Array<{ length: number; path: string[] }> })
    .files;

  assertEquals(files.length, 2);
  assertEquals(files[0]!.length, 1000);
  assertEquals(files[0]!.path, ["folder", "a.txt"]);
  assertEquals(files[1]!.path, ["folder", "b.txt"]);
});

Deno.test("metainfo-parser: parses single-file v2 torrent", async () => {
  const torrent = await parseMetainfo(v2Buffer());

  assertEquals((torrent.info as { "meta version"?: number })["meta version"], 2);
  assertEquals(torrent.info.name, "v2-test");
});

Deno.test("metainfo-parser: rejects missing info dictionary", async () => {
  const bytes = encode({ announce: "udp://tracker.example.com:6969" });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "info",
  );
});

Deno.test("metainfo-parser: rejects invalid piece length", async () => {
  const bytes = encode({
    info: { name: "x", "piece length": 0, pieces: new Uint8Array(0) },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "piece length",
  );
});

Deno.test("metainfo-parser: rejects pieces length mismatch", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      length: 5000,
      pieces: new Uint8Array(40), // 2 pieces, but content needs only 1
    },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "info.pieces",
  );
});

Deno.test("metainfo-parser: rejects both length and files", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      length: 100,
      files: [{ length: 100, path: ["a"] }],
      pieces: new Uint8Array(20),
    },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    'both "length" and "files"',
  );
});

Deno.test("metainfo-parser: rejects unsafe path component", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      files: [{ length: 100, path: ["..", "escape"] }],
      pieces: new Uint8Array(20),
    },
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "path",
  );
});

Deno.test("metainfo-parser: rejects BEP-3 torrent with piece layers", async () => {
  const bytes = encode({
    info: {
      name: "x",
      "piece length": PIECE_LENGTH,
      length: 100,
      pieces: new Uint8Array(20),
    },
    "piece layers": new Map<Uint8Array, Uint8Array>([
      [new Uint8Array(32), new Uint8Array(32)],
    ]),
  });
  await assertRejects(
    () => parseMetainfo(bytes),
    TorrentParseError,
    "piece layers",
  );
});

Deno.test("metainfo-parser: enforces maxBytes limit", async () => {
  await assertRejects(
    () => parseMetainfo(v1Buffer("single"), { maxBytes: 4 }),
    TorrentParseError,
    "limit",
  );
});