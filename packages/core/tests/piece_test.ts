// /loco/monorepo/webtorrent/tests/piece_test.ts

import { assertEquals } from "@std/assert";
import { Piece } from "../src/core/piece.ts";

Deno.test("piece: constructor stores index, length, offset", () => {
  const p = new Piece(5, 16384, 81920);
  assertEquals(p.index, 5);
  assertEquals(p.length, 16384);
  assertEquals(p.offset, 81920);
});

Deno.test("piece: downloaded returns false when hash is not set", () => {
  const p = new Piece(0, 16384, 0);
  assertEquals(p.downloaded, false);
});

Deno.test("piece: downloaded returns true when hash is set", () => {
  const p = new Piece(0, 16384, 0);
  p.hash = new Uint8Array(20);
  assertEquals(p.downloaded, true);
});

Deno.test("piece: missing is true when hash is not set", () => {
  const p = new Piece(0, 16384, 0);
  assertEquals(p.missing, true);
});

Deno.test("piece: missing is false when hash is set", () => {
  const p = new Piece(0, 16384, 0);
  p.hash = new Uint8Array(20);
  assertEquals(p.missing, false);
});

Deno.test("piece: toString describes piece state", () => {
  const missing = new Piece(3, 16384, 49152);
  assertEquals(missing.toString().includes("index=3"), true);
  assertEquals(missing.toString().includes("missing"), true);

  const done = new Piece(3, 16384, 49152);
  done.hash = new Uint8Array(20);
  assertEquals(done.toString().includes("downloaded"), true);
});
