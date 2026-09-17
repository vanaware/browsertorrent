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
    }, 5000);

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
        // Verify response format: interval, complete, incomplete, peers array
        if (typeof msg.interval !== "number") {
          reject(new Error(`Missing interval in announce response from ${peerId}`));
          return;
        }
        if (typeof msg.complete !== "number") {
          reject(new Error(`Missing complete in announce response from ${peerId}`));
          return;
        }
        if (typeof msg.incomplete !== "number") {
          reject(new Error(`Missing incomplete in announce response from ${peerId}`));
          return;
        }
        if (!Array.isArray(msg.peers)) {
          reject(new Error(`Missing peers array in announce response from ${peerId}`));
          return;
        }
        // Verify peer object format: {peer_id, ip, port}
        for (const p of msg.peers) {
          if (!p.peer_id || !p.ip || !p.port) {
            reject(new Error(`Invalid peer object format: ${JSON.stringify(p)}`));
            return;
          }
        }

        if (expectPeers && msg.peers.length > 0) {
          receivedPeers++;
          clearTimeout(timer);
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

  // Keep Peer A alive for verification
  if (peerA) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (receivedPeers > 0) {
    console.log("[TEST] ✅ Peer discovery works!");
    peerA?.close();
    Deno.exit(0);
  } else {
    console.error("[TEST] ❌ No peer discovery");
    peerA?.close();
    Deno.exit(1);
  }
}

main().catch((e) => {
  console.error("[TEST] FAILED:", e.message);
  peerA?.close();
  Deno.exit(1);
});