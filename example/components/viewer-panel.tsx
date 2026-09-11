/**
 * viewer-panel.tsx — Input magnet/infoHash e player de vídeo.
 */
import { useSignal } from "@preact/signals";
import {
  addTorrent,
  torrentSignal,
  clientSignal,
  serverSignal,
  modeSignal,
  errorSignal,
} from "../torrent-context.tsx";
import { buildStreamURL } from "@loco/webtorrent";
import { useEffect, useRef } from "preact/hooks";

export function ViewerPanel() {
  const input = useSignal("");
  const loading = useSignal(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamUrl = useSignal<string | null>(null);

  const torrent = torrentSignal.value;
  const isLeeching = modeSignal.value === "leeching";

  // Reconstrói stream URL quando o torrent fica ready
  useEffect(() => {
    if (!torrent || !serverSignal.value) return;

    const file = torrent.files[0];
    if (!file) return;

    streamUrl.value = buildStreamURL("/", torrent.infoHash, 0, file.name);

    // Conecta stream ao <video> via client._makeFileObjects() (File wrapper com streamTo)
    const client = clientSignal.value;
    if (client && videoRef.current) {
      const files = (client as any)._makeFileObjects(torrent, "/");
      files[0]?.streamTo(videoRef.current);
    }
  }, [torrent?.infoHash, serverSignal.value]);

  const handleWatch = async () => {
    const id = input.value.trim();
    if (!id) return;

    loading.value = true;
    try {
      await addTorrent(id);
    } finally {
      loading.value = false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleWatch();
  };

  return (
    <div class="panel no-padding">
      <div class="middle">
        <span class="material-symbols">play_circle</span>
        <h4>Viewer</h4>
      </div>

      {!isLeeching
        ? (
          <div class="field label border">
            <input
              type="text"
              id="magnet-input"
              placeholder="magnet:?xt=... ou infoHash"
              value={input.value}
              onInput={(e) => { input.value = (e.target as HTMLInputElement).value; }}
              onKeyDown={handleKeyDown}
            />
            <label for="magnet-input">Magnet URI / InfoHash</label>
          </div>
        )
        : (
          <div class="blue small-text">
            <span class="material-symbols small">link</span>
            {torrent?.name ?? "connecting..."}
          </div>
        )}

      {!isLeeching && (
        <button
          class={loading.value ? "loading" : ""}
          disabled={!input.value || loading.value}
          onClick={handleWatch}
        >
          <span class="material-symbols">movie</span>
          Watch
        </button>
      )}

      {isLeeching && streamUrl.value && (
        <div class="row left-align">
          <div style="width:100%">
            <video
              ref={videoRef}
              controls
              autoplay
              style="width:100%; border-radius: 8px;"
            />
            {torrent && (
              <div class="field label suffix border" style="margin-top:0.5rem">
                <input
                  type="text"
                  value={streamUrl.value}
                  readonly
                  onClick={(e) => { (e.target as HTMLInputElement).select(); }}
                />
                <label>Stream URL</label>
                <i
                  class="front"
                  style="cursor:pointer"
                  onClick={() => navigator.clipboard.writeText(streamUrl.value!)}
                >
                  📋
                </i>
              </div>
            )}
          </div>
        </div>
      )}

      {errorSignal.value && (
        <div class="red">
          <span class="material-symbols small">error</span>
          {errorSignal.value}
        </div>
      )}
    </div>
  );
}
