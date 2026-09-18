/**
 * torrent-list.tsx — Lista de torrents ativos e persistidos.
 */
import {
  modeSignal,
  removeTorrent,
  tickSignal,
  torrentsSignal,
  torrentSignal,
} from "../torrent-context.tsx";
import type { Torrent, } from "@loco/webtorrent";

function formatSize(bytes: number,): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1,)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1,)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2,)} GB`;
}

export function TorrentList() {
  const torrents = torrentsSignal.value;
  // deno-lint-ignore no-unused-vars
  const _tick = tickSignal.value;

  if (torrents.length === 0) {
    return (
      <div class="center-align padding">
        <i class="material-symbols large opacity">
          folder_open
        </i>
        <p class="opacity">
          Nenhum torrent na lista.
        </p>
      </div>
    );
  }

  return (
    <div class="list">
      {torrents.map((t,) => {
        const isActive = torrentSignal.value?.infoHash === t.infoHash;
        const progress = Math.round(t.progress * 100,);
        
        return (
          <div class={`row padding border round ${isActive ? "primary-container" : ""}`} key={t.infoHash}>
            <div class="max">
              <h6 class="no-margin">
                {t.name || "Desconhecido"}
              </h6>
              <div class="secondary-text small-text">
                {formatSize(t.length || 0)} • {t.infoHash.substring(0, 8)}...
              </div>
              <div class="field no-margin">
                <progress value={progress} max="100"></progress>
                <div class="secondary-text small-text right-align">
                  {progress}%
                </div>
              </div>
            </div>
            <nav>
              {!isActive && (
                <button
                  type="button"
                  class="circle transparent"
                  onClick={() => {
                    torrentSignal.value = t;
                    modeSignal.value = t.progress === 1 ? "seeding" : "leeching";
                  }}>
                  <i class="material-symbols">
                    play_arrow
                  </i>
                </button>
              )}
              <button
                type="button"
                class="circle transparent"
                onClick={() => removeTorrent(t.infoHash)}>
                <i class="material-symbols">
                  delete
                </i>
              </button>
            </nav>
          </div>
        );
      })}
    </div>
  );
}
