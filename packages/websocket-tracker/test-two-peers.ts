// Two-peer discovery test
const infoHash = "a".repeat(20);
let receivedPeers = 0;
let peerA: WebSocket | null = null;

function makePeer(peerId: string, expectPeers: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:8000");
    const timer = setTimeout(() => {
      reject(new Error(`Timeout for ${peerId}`));
      ws.close();
    }, 3000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        action: "announce",
        info_hash: infoHash,
        peer_id: peerId,
        port: 6881,
        uploaded: 0,
        downloaded: 0,
        left: 100,
        event: "started",
      }));
    });

    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      console.log(`[${peerId}] RECV:`, JSON.stringify(msg));
      if (msg.action === "announce") {
        if (expectPeers && msg.peers && msg.peers.length > 0) {
          receivedPeers++;
          clearTimeout(timer);
          ws.close();
          resolve();
        } else if (!expectPeers) {
          clearTimeout(timer);
          resolve();
        }
      }
    });

    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`WS error for ${peerId}: ${e.message}`));
    });

    if (peerId === "a".repeat(20)) {
      peerA = ws;
    }
  });
}

async function main() {
  // Peer A connects first
  await makePeer("a".repeat(20), false);
  console.log("[TEST] Peer A connected");

  // Peer B connects second — should discover Peer A
  await makePeer("b".repeat(20), true);
  console.log("[TEST] Peer B connected and discovered peers");

  // Close Peer A after Peer B has discovered it
  if (peerA) {
    peerA.close();
  }

  if (receivedPeers > 0) {
    console.log("[TEST] ✅ Peer discovery works!");
    Deno.exit(0);
  } else {
    console.error("[TEST] ❌ No peer discovery");
    Deno.exit(1);
  }
}

main().catch((e) => {
  console.error("[TEST] FAILED:", e.message);
  Deno.exit(1);
});