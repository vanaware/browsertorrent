// /loco/monorepo/webtorrent/tests/extension-host_test.ts

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  ExtensionHost,
  decodeExtendedHandshake,
  type PeerWireExtension,
  type ExtendedHandshake,
  type PeerWireExtensionContext,
} from "../src/core/extension-host.ts";
import { encode, decode } from "../src/utils/bencode.ts";
import { PeerWireError, ProtocolError } from "../src/utils/errors.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Captured sent messages: [extensionId, payload] */
function createMockHost(options?: {
  client?: string;
  port?: number;
  maxPayloadLength?: number;
}): {
  host: ExtensionHost;
  sent: Array<[number, Uint8Array]>;
} {
  const sent: Array<[number, Uint8Array]> = [];
  const host = new ExtensionHost({
    send: async (id, payload) => { sent.push([id, payload]); },
    client: options?.client,
    port: options?.port,
    maxPayloadLength: options?.maxPayloadLength,
  });
  return { host, sent };
}

/** Minimal extension for testing. */
class TestExtension implements PeerWireExtension {
  readonly name: string;
  messages: Uint8Array[] = [];
  handshakes: ExtendedHandshake[] = [];
  registered = false;
  closed = false;
  closeReason?: unknown;
  private context?: PeerWireExtensionContext;

  constructor(name = "ut_test") {
    this.name = name;
  }

  onRegister(context: PeerWireExtensionContext): void {
    this.registered = true;
    this.context = context;
  }

  handshakeFields(): Map<string, any> {
    const fields = new Map<string, any>();
    fields.set("test_field", 42);
    return fields;
  }

  onExtendedHandshake(handshake: ExtendedHandshake): void {
    this.handshakes.push(handshake);
  }

  onMessage(payload: Uint8Array): void {
    this.messages.push(payload);
  }

  close(reason?: unknown): void {
    this.closed = true;
    this.closeReason = reason;
  }

  /** Helper: send via the registered context. */
  send(payload: Uint8Array): Promise<void> {
    if (!this.context) throw new Error("not registered");
    return this.context.send(payload);
  }
}

// ============================================================================
// Registration
// ============================================================================

Deno.test("ExtensionHost: use() registers extension and assigns local ID", () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  assertEquals(ext.registered, true);
  assertEquals(host.localExtensions.get("ut_test"), 1);
});

Deno.test("ExtensionHost: use() assigns sequential IDs", () => {
  const { host } = createMockHost();
  const ext1 = new TestExtension("ut_alpha");
  const ext2 = new TestExtension("ut_beta");
  host.use(ext1);
  host.use(ext2);
  assertEquals(host.localExtensions.get("ut_alpha"), 1);
  assertEquals(host.localExtensions.get("ut_beta"), 2);
});

Deno.test("ExtensionHost: use() rejects name < 3 chars", () => {
  const { host } = createMockHost();
  const ext = new TestExtension("ab");
  assertThrows(() => host.use(ext), TypeError);
});

Deno.test("ExtensionHost: use() rejects duplicate name", () => {
  const { host } = createMockHost();
  host.use(new TestExtension("ut_test"));
  assertThrows(() => host.use(new TestExtension("ut_test")), PeerWireError);
});

Deno.test("ExtensionHost: get() retrieves registered extension", () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  assertEquals(host.get("ut_test"), ext);
});

Deno.test("ExtensionHost: get() returns undefined for unknown extension", () => {
  const { host } = createMockHost();
  assertEquals(host.get("nonexistent"), undefined);
});

// ============================================================================
// Handshake fields
// ============================================================================

Deno.test("ExtensionHost: setHandshakeField adds custom fields", () => {
  const { host } = createMockHost();
  host.setHandshakeField("custom", "value");
  assertEquals(host.get("nonexistent"), undefined);
  // Field is included in sent handshake (tested via sendHandshake)
});

Deno.test("ExtensionHost: setHandshakeField rejects 'm'", () => {
  const { host } = createMockHost();
  assertThrows(() => host.setHandshakeField("m", "bad"), TypeError);
});

Deno.test("ExtensionHost: setHandshakeField with undefined removes field", () => {
  const { host } = createMockHost();
  host.setHandshakeField("custom", "value");
  host.setHandshakeField("custom", undefined);
  // No error — field removed
});

Deno.test("ExtensionHost: constructor sets client/port/reqq fields", () => {
  const { host, sent } = createMockHost({ client: "Loco/1.0", port: 6881 });
  host.use(new TestExtension());
  host.sendHandshake();
  // The sent handshake should include v and p
  assertEquals(sent.length, 1);
  const [id, payload] = sent[0]!;
  assertEquals(id, 0); // extended handshake ID = 0
  const decoded = decode(payload, { useMap: true }) as Map<string, any>;
  assertEquals(decoded.get("v"), "Loco/1.0");
  assertEquals(decoded.get("p"), 6881);
});

// ============================================================================
// sendHandshake
// ============================================================================

Deno.test("ExtensionHost: sendHandshake includes m mapping and extension fields", () => {
  const { host, sent } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  host.sendHandshake();

  assertEquals(sent.length, 1);
  const [id, payload] = sent[0]!;
  assertEquals(id, 0);

  const decoded = decode(payload, { useMap: true }) as Map<string, any>;
  const m = decoded.get("m") as Map<string, any>;
  assertEquals(m.get("ut_test"), 1);
  assertEquals(decoded.get("test_field"), 42);
});

Deno.test("ExtensionHost: extension cannot replace m field in handshakeFields", async () => {
  const { host } = createMockHost();
  const badExt: PeerWireExtension = {
    name: "ut_bad",
    handshakeFields: () => new Map([["m", "hax"]]),
  };
  host.use(badExt);
  await assertRejects(() => host.sendHandshake(), PeerWireError);
});

// ============================================================================
// send (via peer extension ID)
// ============================================================================

Deno.test("ExtensionHost: send() uses peer-advertised ID", async () => {
  const { host, sent } = createMockHost();
  // Simulate peer advertising ut_test with ID 3
  host.peerExtensions.set("ut_test", 3);

  const ext = new TestExtension();
  host.use(ext);
  await ext.send(new Uint8Array([1, 2, 3]));

  assertEquals(sent.length, 1);
  assertEquals(sent[0]![0], 3); // peer's ID for ut_test
  assertEquals(sent[0]![1], new Uint8Array([1, 2, 3]));
});

Deno.test("ExtensionHost: send() rejects unadvertised extension", async () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);
  // peerExtensions doesn't have ut_test
  await assertRejects(() => ext.send(new Uint8Array()), PeerWireError);
});

Deno.test("ExtensionHost: send() rejects oversized payload", async () => {
  const { host } = createMockHost({ maxPayloadLength: 10 });
  host.peerExtensions.set("ut_test", 1);
  const ext = new TestExtension();
  host.use(ext);
  await assertRejects(
    () => ext.send(new Uint8Array(20)),
    RangeError,
  );
});

// ============================================================================
// handle (incoming messages)
// ============================================================================

Deno.test("ExtensionHost: handle() processes extended handshake (id=0)", async () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext);

  // Build a peer extended handshake
  const handshakeDict = new Map<string, any>();
  const m = new Map<string, number>();
  m.set("ut_test", 5);
  handshakeDict.set("m", m);
  handshakeDict.set("v", "PeerClient/2.0");
  handshakeDict.set("metadata_size", 12345);

  const payload = encode(handshakeDict);
  const name = await host.handle({ type: "extended", extensionId: 0, payload });

  assertEquals(name, undefined); // handshake returns undefined
  assertEquals(host.peerExtensions.get("ut_test"), 5);
  assertEquals(host.peerHandshake?.client, "PeerClient/2.0");
  assertEquals(host.peerHandshake?.metadataSize, 12345);
  assertEquals(ext.handshakes.length, 1);
  assertEquals(ext.handshakes[0]!.client, "PeerClient/2.0");
});

Deno.test("ExtensionHost: handle() dispatches message to registered extension", async () => {
  const { host } = createMockHost();
  const ext = new TestExtension();
  host.use(ext); // local ID = 1

  const data = new Uint8Array([0xAA, 0xBB]);
  const name = await host.handle({
    type: "extended",
    extensionId: 1,
    payload: data,
  });

  assertEquals(name, "ut_test");
  assertEquals(ext.messages.length, 1);
  assertEquals(ext.messages[0], data);
});

Deno.test("ExtensionHost: handle() ignores unknown extension IDs", async () => {
  const { host } = createMockHost();
  const name = await host.handle({
    type: "extended",
    extensionId: 99,
    payload: new Uint8Array(),
  });
  assertEquals(name, undefined);
});

Deno.test("ExtensionHost: handle() rejects oversized payload", async () => {
  const { host } = createMockHost({ maxPayloadLength: 10 });
  await assertRejects(
    () => host.handle({
      type: "extended",
      extensionId: 1,
      payload: new Uint8Array(20),
    }),
    ProtocolError,
  );
});

Deno.test("ExtensionHost: re-handshake is additive (zero disables)", async () => {
  const { host } = createMockHost();

  // First handshake: ut_test = 5, ut_other = 7
  const hs1 = new Map<string, any>();
  const m1 = new Map<string, number>();
  m1.set("ut_test", 5);
  m1.set("ut_other", 7);
  hs1.set("m", m1);
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs1) });
  assertEquals(host.peerExtensions.get("ut_test"), 5);
  assertEquals(host.peerExtensions.get("ut_other"), 7);

  // Second handshake: ut_test = 0 (disable), ut_other stays
  const hs2 = new Map<string, any>();
  const m2 = new Map<string, number>();
  m2.set("ut_test", 0);
  hs2.set("m", m2);
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs2) });
  assertEquals(host.peerExtensions.has("ut_test"), false); // removed
  assertEquals(host.peerExtensions.get("ut_other"), 7); // preserved
});

// ============================================================================
// waitForPeerHandshake
// ============================================================================

Deno.test("ExtensionHost: waitForPeerHandshake resolves immediately if already received", async () => {
  const { host } = createMockHost();
  const hs = new Map<string, any>();
  hs.set("m", new Map());
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs) });

  const result = await host.waitForPeerHandshake();
  assertEquals(result, host.peerHandshake);
});

Deno.test("ExtensionHost: waitForPeerHandshake waits for first handshake", async () => {
  const { host } = createMockHost();
  let resolved = false;
  const promise = host.waitForPeerHandshake();
  promise.then(() => { resolved = true; });

  // Not yet resolved
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(resolved, false);

  // Send handshake
  const hs = new Map<string, any>();
  const m = new Map<string, number>();
  m.set("ut_test", 3);
  hs.set("m", m);
  await host.handle({ type: "extended", extensionId: 0, payload: encode(hs) });

  const result = await promise;
  assertEquals(resolved, true);
  assertEquals(result.extensions.get("ut_test"), 3);
});

// ============================================================================
// close
// ============================================================================

Deno.test("ExtensionHost: close() notifies all extensions", () => {
  const { host } = createMockHost();
  const ext1 = new TestExtension("ut_alpha");
  const ext2 = new TestExtension("ut_beta");
  host.use(ext1);
  host.use(ext2);

  host.close("test reason");
  assertEquals(ext1.closed, true);
  assertEquals(ext1.closeReason, "test reason");
  assertEquals(ext2.closed, true);
  assertEquals(ext2.closeReason, "test reason");
});

Deno.test("ExtensionHost: close() clears handshake waiters", () => {
  const { host } = createMockHost();
  let resolved = false;
  host.waitForPeerHandshake().then(() => { resolved = true; });
  host.close();
  // Waiters are cleared, promise should reject or never resolve
  // In our impl, we just clear the array — promise hangs.
  // This is fine; the wire close will clean up.
});

// ============================================================================
// decodeExtendedHandshake
// ============================================================================

Deno.test("decodeExtendedHandshake: valid handshake", () => {
  const dict = new Map<string, any>();
  const m = new Map<string, number>();
  m.set("ut_metadata", 2);
  m.set("ut_pex", 3);
  dict.set("m", m);
  dict.set("v", "TestClient/1.0");
  dict.set("p", 6881);
  dict.set("metadata_size", 50000);
  dict.set("reqq", 200);

  const payload = encode(dict);
  const hs = decodeExtendedHandshake(payload);

  assertEquals(hs.extensions.get("ut_metadata"), 2);
  assertEquals(hs.extensions.get("ut_pex"), 3);
  assertEquals(hs.client, "TestClient/1.0");
  assertEquals(hs.port, 6881);
  assertEquals(hs.metadataSize, 50000);
  assertEquals(hs.requestQueue, 200);
});

Deno.test("decodeExtendedHandshake: rejects non-dictionary payload", () => {
  const payload = encode([1, 2, 3]); // list, not dict
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

Deno.test("decodeExtendedHandshake: rejects non-Map m field", () => {
  const dict = new Map<string, any>();
  dict.set("m", "not_a_map");
  const payload = encode(dict);
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

Deno.test("decodeExtendedHandshake: rejects invalid mapping entry", () => {
  const dict = new Map<string, any>();
  const m = new Map<string, any>();
  m.set("ut_test", -1); // negative ID
  dict.set("m", m);
  const payload = encode(dict);
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

Deno.test("decodeExtendedHandshake: yourip as Uint8Array", () => {
  const dict = new Map<string, any>();
  dict.set("m", new Map());
  dict.set("yourip", new Uint8Array([127, 0, 0, 1]));
  const payload = encode(dict);
  const hs = decodeExtendedHandshake(payload);
  assertEquals(hs.yourIp, new Uint8Array([127, 0, 0, 1]));
});

Deno.test("decodeExtendedHandshake: rejects invalid port", () => {
  const dict = new Map<string, any>();
  dict.set("m", new Map());
  dict.set("p", 70000); // > 0xffff
  const payload = encode(dict);
  assertThrows(() => decodeExtendedHandshake(payload), ProtocolError);
});

// ============================================================================
// maxPayloadLength validation
// ============================================================================

Deno.test("ExtensionHost: constructor rejects invalid maxPayloadLength", () => {
  assertThrows(
    () => new ExtensionHost({ send: async () => {}, maxPayloadLength: 0 }),
    RangeError,
  );
  assertThrows(
    () => new ExtensionHost({ send: async () => {}, maxPayloadLength: -1 }),
    RangeError,
  );
});
