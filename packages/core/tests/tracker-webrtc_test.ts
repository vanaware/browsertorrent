import { assertEquals, assertExists, } from "@std/assert";
import { TrackerOffer, WebRTCSdp, WsTracker, } from "../src/network/tracker.ts";

class MockWebSocket extends EventTarget {
  public readyState: number = WebSocket.CONNECTING;
  public static OPEN = 1;
  public static CLOSED = 3;
  public static CLOSING = 2;
  public static CONNECTING = 0;

  public onopen: (() => void) | null = null;
  public onmessage: ((ev: MessageEvent,) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  public sentMessages: string[] = [];

  constructor(public url: string,) {
    super();
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 10,);
  }

  send(data: string,) {
    this.sentMessages.push(data,);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateMessage(data: any,) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent("message", { data: JSON.stringify(data,), },),
      );
    }
  }
}

Deno.test("WsTracker: sends announce with offers and receives interval", async () => {
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket as any;

  try {
    const tracker = new WsTracker("ws://tracker.test", {
      infoHash: new Uint8Array(20,).fill(1,),
      peerId: new Uint8Array(20,).fill(2,),
    },);

    const offerSdp: WebRTCSdp = { type: "offer", sdp: "mock-sdp", };
    const offers: TrackerOffer[] = [{ offer: offerSdp, offer_id: "id1", },];

    const announcePromise = tracker.announce({ event: "started", offers, },);

    // The websocket is mocked, wait for it to open and send
    await new Promise((resolve,) => setTimeout(resolve, 50,));

    // Simulate tracker response
    const mockWs = tracker["ws"] as unknown as MockWebSocket;
    assertExists(mockWs,);

    const sentMsg = JSON.parse(mockWs.sentMessages[0] as string,);
    assertEquals(sentMsg.action, "announce",);
    assertEquals(sentMsg.offers[0].offer_id, "id1",);

    // Simulate interval response
    mockWs.simulateMessage({
      action: "announce",
      interval: 2000,
      complete: 1,
      incomplete: 2,
      peers: [],
    },);

    const res = await announcePromise;
    assertEquals(res.interval, 2000,);

    tracker.destroy();
  } finally {
    globalThis.WebSocket = originalWs;
  }
});

Deno.test("WsTracker: emits peer event when receiving offer", async () => {
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket as any;

  try {
    const tracker = new WsTracker("ws://tracker.test", {
      infoHash: new Uint8Array(20,).fill(1,),
      peerId: new Uint8Array(20,).fill(2,),
    },);

    const announcePromise = tracker.announce().catch(() => {});
    await new Promise((resolve,) => setTimeout(resolve, 50,));

    const mockWs = tracker["ws"] as unknown as MockWebSocket;

    let peerEventEmitted = false;
    tracker.on("peer", (e: any,) => {
      peerEventEmitted = true;
      assertEquals(e.detail.peerId, "remote-peer",);
      assertEquals(e.detail.offer.sdp, "remote-sdp",);
    },);

    mockWs.simulateMessage({
      action: "announce",
      interval: 1800,
      peer_id: "remote-peer",
      offer_id: "remote-id",
      offer: { type: "offer", sdp: "remote-sdp", },
    },);

    await announcePromise;
    assertEquals(peerEventEmitted, true,);

    tracker.destroy();
  } finally {
    globalThis.WebSocket = originalWs;
  }
});
