/**
 * peer-panel.tsx — Status de peers e velocidades.
 */
import { useSignal, useComputed } from "@preact/signals";
import {
  peersSignal,
  downSpeedSignal,
  upSpeedSignal,
  torrentSignal,
} from "../torrent-context.tsx";
import { useEffect } from "preact/hooks";

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(2)} MB/s`;
}

export function PeerPanel() {
  const updateInterval = useSignal<number | null>(null);

  useEffect(() => {
    // Atualiza speeds a cada 500ms
    const id = setInterval(() => {
      const t = torrentSignal.value;
      if (t) {
        downSpeedSignal.value = t.downloadSpeed;
        upSpeedSignal.value = t.uploadSpeed;
      }
    }, 500) as unknown as number;

    updateInterval.value = id;

    return () => clearInterval(id);
  }, []);

  const peers = peersSignal.value;
  const torrent = torrentSignal.value;

  const seedCount = peers.filter((w) => w.amChoking === false).length;
  const leecherCount = peers.length - seedCount;

  return (
    <div class="panel no-padding">
      <div class="middle">
        <span class="material-symbols">group</span>
        <h4>Swarm</h4>
      </div>

      {torrent && (
        <>
          <div class="row">
            <div class="field label suffix border">
              <input type="text" value={peers.length} readonly />
              <label>Peers</label>
              <i class="front">👥</i>
            </div>
            <div class="field label suffix border">
              <input type="text" value={seedCount} readonly />
              <label>Seeds</label>
              <i class="front">🌱</i>
            </div>
            <div class="field label suffix border">
              <input type="text" value={leecherCount} readonly />
              <label>Leechers</label>
              <i class="front">📥</i>
            </div>
          </div>

          <div class="row">
            <div class="field label suffix border">
              <input type="text" value={formatSpeed(downSpeedSignal.value)} readonly />
              <label>Download</label>
              <i class="front green-text">↓</i>
            </div>
            <div class="field label suffix border">
              <input type="text" value={formatSpeed(upSpeedSignal.value)} readonly />
              <label>Upload</label>
              <i class="front red-text">↑</i>
            </div>
          </div>

          {torrent.progress > 0 && (
            <div class="field">
              <progress value={torrent.progress} class="max" />
              <label>{Math.round(torrent.progress * 100)}% baixado</label>
            </div>
          )}
        </>
      )}

      {!torrent && (
        <div class="small-text secondary-text">
          Nenhum torrent ativo
        </div>
      )}

      {peers.length > 0 && (
        <div style="max-height: 200px; overflow-y: auto;">
          {peers.map((wire, i) => (
            <div key={i} class="row border secondary">
              <div class="max">
                <span class="material-symbols small">person</span>
                {" "}
                {wire.peerId?.slice(0, 8) ?? "?"}
              </div>
              <div>
                {wire.amChoking ? (
                  <span class="red-text small-text">choked</span>
                ) : (
                  <span class="green-text small-text">active</span>
                )}
              </div>
              <div class="secondary-text small-text">
                {wire.remoteAddress || "?"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
