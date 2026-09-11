// /loco/monorepo/webtorrent/tests/errors_test.ts

import { assertEquals } from "@std/assert";
import {
  PeerWireError,
  ProtocolError,
  EofError,
  TimeoutError,
  RequestRejectedError,
} from "../src/utils/errors.ts";

Deno.test("PeerWireError — instanceof chain and defaults", () => {
  const err = new PeerWireError("base");
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "PeerWireError");
  assertEquals(err.message, "base");
  assertEquals(err.code, "PEERWIRE_ERROR");
});

Deno.test("PeerWireError — custom code", () => {
  const err = new PeerWireError("x", "CUSTOM");
  assertEquals(err.code, "CUSTOM");
});

Deno.test("ProtocolError — instanceof chain and defaults", () => {
  const err = new ProtocolError("bad state");
  assertEquals(err instanceof ProtocolError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "ProtocolError");
  assertEquals(err.message, "bad state");
  assertEquals(err.code, "PROTOCOL_ERROR");
});

Deno.test("EofError — instanceof chain and defaults", () => {
  const err = new EofError("stream ended");
  assertEquals(err instanceof EofError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "EofError");
  assertEquals(err.message, "stream ended");
  assertEquals(err.code, "EOF_ERROR");
});

Deno.test("TimeoutError — instanceof chain and defaults", () => {
  const err = new TimeoutError("handshake timed out");
  assertEquals(err instanceof TimeoutError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "TimeoutError");
  assertEquals(err.message, "handshake timed out");
  assertEquals(err.code, "TIMEOUT_ERROR");
});

Deno.test("RequestRejectedError — instanceof chain and defaults", () => {
  const err = new RequestRejectedError("peer rejected piece 0");
  assertEquals(err instanceof RequestRejectedError, true);
  assertEquals(err instanceof PeerWireError, true);
  assertEquals(err instanceof Error, true);
  assertEquals(err.name, "RequestRejectedError");
  assertEquals(err.message, "peer rejected piece 0");
  assertEquals(err.code, "REQUEST_REJECTED");
});

Deno.test("ProtocolError — custom code overrides default", () => {
  const err = new ProtocolError("unexpected bitfield", "BAD_BITFIELD");
  assertEquals(err.code, "BAD_BITFIELD");
  assertEquals(err.name, "ProtocolError");
});

Deno.test("EofError — custom code overrides default", () => {
  const err = new EofError("truncated", "SHORT_READ");
  assertEquals(err.code, "SHORT_READ");
});

Deno.test("TimeoutError — custom code overrides default", () => {
  const err = new TimeoutError("slow", "KEEPALIVE_TIMEOUT");
  assertEquals(err.code, "KEEPALIVE_TIMEOUT");
});

Deno.test("RequestRejectedError — custom code overrides default", () => {
  const err = new RequestRejectedError("no", "FAST_REJECT");
  assertEquals(err.code, "FAST_REJECT");
});
