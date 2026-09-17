import { Peer } from "./packages/core/src/network/peer.ts";
import { TrackerOffer, WebRTCSdp } from "./packages/core/src/network/tracker.ts";
import { encodeHex } from "jsr:@std/encoding/hex";

export async function generateOffers(swarm: any, count: number): Promise<{ offers: TrackerOffer[], peers: Record<string, Peer> }> {
  const offers: TrackerOffer[] = [];
  const peers: Record<string, Peer> = {};
  
  const promises = Array.from({ length: count }).map(async () => {
    // Generate a random 20-byte offerId (hex)
    const offerIdBytes = new Uint8Array(20);
    crypto.getRandomValues(offerIdBytes);
    const offerId = encodeHex(offerIdBytes);
    
    // We create a temporary Peer
    const peer = new Peer({
      initiator: true,
      infoHash: swarm.infoHash,
      peerId: swarm.peerId,
      wrtc: swarm.wrtc,
      addr: offerId // Use offerId as temporary addr to store it
    });
    
    peers[offerId] = peer;
    
    // Wait for the signal event (which is the ICE gathered offer SDP)
    return new Promise<void>((resolve, reject) => {
       let resolved = false;
       const timeoutId = setTimeout(() => {
          if (!resolved) {
             resolved = true;
             resolve(); // Ignore timeout and just proceed without this offer if it takes too long
          }
       }, 5000);
       
       peer.on("signal", (e: any) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          offers.push({
             offer: e.detail.data as WebRTCSdp,
             offer_id: offerId
          });
          resolve();
       });
       
       peer.on("error", () => {
          if (!resolved) {
             resolved = true;
             clearTimeout(timeoutId);
             resolve();
          }
       });
    });
  });
  
  await Promise.all(promises);
  return { offers, peers };
}
