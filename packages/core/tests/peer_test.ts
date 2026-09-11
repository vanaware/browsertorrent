// /loco/monorepo/webtorrent/tests/peer_test.ts

import { assertEquals, assertExists } from "@std/assert";
import { Peer } from "../src/network/peer.ts";

// ============================================================================
// MOCKS
// ============================================================================

class MockRTCPeerConnection {
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public onicecandidate: ((event: any) => void) | null = null;
  public ondatachannel: ((event: any) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public connectionState: RTCPeerConnectionState = "new";
  public iceConnectionState: RTCIceConnectionState = "new";
  
  private channel: MockRTCDataChannel | null = null;
  private static instances: MockRTCPeerConnection[] = [];

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }

  async createOffer() {
    return { type: "offer" as const, sdp: "mock-sdp-offer" };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "mock-sdp-answer" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc;
  }

  async addIceCandidate() {}

  createDataChannel(label: string) {
    this.channel = new MockRTCDataChannel(label);
    return this.channel;
  }

  close() {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  }

  simulateChannelOpen() {
    if (this.channel) {
      this.channel.readyState = "open";
      this.channel.onopen?.(new Event("open"));
    }
  }

  simulateIncomingChannel(channel: MockRTCDataChannel) {
    this.ondatachannel?.({ channel });
  }

  simulateConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  static getLastInstance(): MockRTCPeerConnection | undefined {
    return MockRTCPeerConnection.instances.at(-1);
  }

  static resetInstances() {
    MockRTCPeerConnection.instances = [];
  }
}

class MockRTCDataChannel {
  public readyState: RTCDataChannelState = "connecting";
  public binaryType: string = "arraybuffer";
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  
  constructor(public label: string) {}

  send(data: ArrayBuffer | Uint8Array) {
    // Mock implementation
  }

  close() {
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}

// ============================================================================
// TESTES
// ============================================================================

Deno.test("peer: initiator creates offer and data channel", async () => {
  MockRTCPeerConnection.resetInstances();
  
  const infoHash = new Uint8Array(20).fill(1);
  const peerId = new Uint8Array(20).fill(65);

  const peer = new Peer({
    initiator: true,
    infoHash,
    peerId,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  let signalEmitted = false;
  // 🔥 CORREÇÃO: Tipagem explícita como Error | null para evitar inferência 'never'
  let peerError: Error | null = null; 
  
  peer.on("signal", (e: any) => {
    signalEmitted = true;
    assertEquals((e.detail.data as RTCSessionDescriptionInit).type, "offer");
  });
  
  peer.on("error", (e: any) => {
    peerError = e.detail?.error || e;
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  if (peerError) {
    // 🔥 CORREÇÃO: Assegão de tipo para acessar .message com segurança
    throw new Error(`Peer inesperadamente emitiu um erro: ${(peerError as Error).message}`);
  }

  assertEquals(signalEmitted, true);
  
  peer.destroy();
});

Deno.test("peer: non-initiator waits for data channel", async () => {
  MockRTCPeerConnection.resetInstances();
  
  const infoHash = new Uint8Array(20).fill(1);
  const peerId = new Uint8Array(20).fill(66);

  const peer = new Peer({
    initiator: false,
    infoHash,
    peerId,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  const mockChannel = new MockRTCDataChannel("webtorrent");
  const pc = MockRTCPeerConnection.getLastInstance();
  assertExists(pc);
  pc.simulateIncomingChannel(mockChannel);

  let connectEmitted = false;
  peer.on("connect", () => {
    connectEmitted = true;
  });

  mockChannel.readyState = "open";
  mockChannel.onopen?.(new Event("open"));

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(connectEmitted, true);
  assertEquals(peer.wire !== null, true);
  
  peer.destroy();
});

Deno.test("peer: destroy() is idempotent (can be called multiple times)", () => {
  MockRTCPeerConnection.resetInstances();
  
  const peer = new Peer({
    initiator: true,
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  peer.destroy();
  peer.destroy();
  peer.destroy();

  assertEquals(peer.destroyed, true);
});

Deno.test("peer: emits error on connection failure", async () => {
  MockRTCPeerConnection.resetInstances();
  
  const peer = new Peer({
    initiator: true,
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  let errorEmitted = false;
  peer.on("error", () => {
    errorEmitted = true;
  });

  const pc = MockRTCPeerConnection.getLastInstance();
  assertExists(pc);
  pc.simulateConnectionState("failed");

  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(errorEmitted, true);
  assertEquals(peer.destroyed, true);
});