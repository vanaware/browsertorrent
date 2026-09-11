// /loco/monorepo/webtorrent/tests/swarm_test.ts

import { assertEquals } from "@std/assert";
import { Swarm } from "../src/network/swarm.ts";

class MockRTCPeerConnection {
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public onicecandidate: ((event: any) => void) | null = null;
  public ondatachannel: ((event: any) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public connectionState: RTCPeerConnectionState = "new";
  
  private channel: MockRTCDataChannel | null = null;

  constructor() {}

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
  }
}

class MockRTCDataChannel {
  public readyState: RTCDataChannelState = "connecting";
  public binaryType: string = "arraybuffer";
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  
  constructor(public label: string) {}

  send(data: ArrayBuffer | Uint8Array) {}

  close() {
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}

Deno.test("swarm: initializes with correct infoHash", () => {
  const infoHash = new Uint8Array(20).fill(1);
  const peerId = new Uint8Array(20).fill(2);

  const swarm = new Swarm({
    infoHash,
    peerId,
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  assertEquals(swarm.infoHash, infoHash);
  assertEquals(swarm.peerId, peerId);
  assertEquals(swarm.peers.size, 0);

  swarm.destroy();
});

Deno.test("swarm: addPeer respects maxConns", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 2,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.addPeer("1.1.1.1:6881");
  swarm.addPeer("2.2.2.2:6881");
  const added = swarm.addPeer("3.3.3.3:6881");

  assertEquals(added, false);
  assertEquals(swarm.peers.size, 2);

  swarm.destroy();
});

Deno.test("swarm: pause prevents new connections", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.pause();
  const added = swarm.addPeer("1.1.1.1:6881");

  assertEquals(added, false);
  assertEquals(swarm.peers.size, 0);

  swarm.destroy();
});

Deno.test("swarm: destroy cleans up everything", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.addPeer("1.1.1.1:6881");
  swarm.destroy();

  assertEquals(swarm.peers.size, 0);
  assertEquals(swarm.destroyed, true);
});

Deno.test("swarm: duplicate peers are rejected", () => {
  const swarm = new Swarm({
    infoHash: new Uint8Array(20),
    peerId: new Uint8Array(20),
    announce: [],
    maxConns: 10,
    wrtc: MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
  });

  swarm.addPeer("1.1.1.1:6881");
  const duplicate = swarm.addPeer("1.1.1.1:6881");

  assertEquals(duplicate, false);
  assertEquals(swarm.peers.size, 1);

  swarm.destroy();
});