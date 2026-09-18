/**
 * swarm-visualizer.tsx — Visualização detalhada dos peers no enxame.
 */
import { peersSignal, torrentSignal, } from "../torrent-context.tsx";

export function SwarmVisualizer() {
  const peers = peersSignal.value;
  const torrent = torrentSignal.value;

  if (!torrent) return null;

  return (
    <article class="border round top-margin">
      <nav class="middle">
        <i class="material-symbols">hub</i>
        <h5 class="max">Swarm Details</h5>
        <div class="chip border">{peers.length} active peers</div>
      </nav>
      <div class="padding">
        {peers.length === 0 ? (
          <p class="secondary-text italic center-align">Aguardando conexões P2P...</p>
        ) : (
          <div class="list">
            {peers.map((wire: any, idx: number) => (
              <div class="row padding border round" key={idx}>
                <i class="material-symbols green-text">router</i>
                <div class="max">
                  <h6 class="no-margin">Peer {idx + 1}</h6>
                  <div class="secondary-text small-text">
                    {wire.remoteAddress || "WebRTC Peer"} • 
                    Type: {wire.type || "unknown"} • 
                    Client: {wire.peerId ? wire.peerId.substring(0, 8) : "N/A"}
                  </div>
                </div>
                <div class="row no-space">
                   <i class="material-symbols small green-text">download</i>
                   <i class="material-symbols small red-text">upload</i>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div class="divider top-margin bottom-margin"></div>
        <div class="row">
           <div class="chip transparent">
              <i class="material-symbols small">speed</i>
              Down: {Math.round(torrent.downloadSpeed / 1024)} KB/s
           </div>
           <div class="chip transparent">
              <i class="material-symbols small">speed</i>
              Up: {Math.round(torrent.uploadSpeed / 1024)} KB/s
           </div>
        </div>
      </div>
    </article>
  );
}
