/**
 * player-panel.tsx — Player de stream P2P + status de peers.
 */
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  torrentSignal,
  peersSignal,
  modeSignal,
  downSpeedSignal,
  upSpeedSignal,
  debugSignal,
} from "../torrent-context.tsx";
import { buildStreamURL, type File } from "@loco/webtorrent";

function dbg(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  const ts = new Date().toISOString().split("T")[1]!.slice(0, 8);
  console.log(`[PLAYER ${ts}]`, msg);
  debugSignal.value = [...debugSignal.value.slice(-99), `[${ts}] PLAYER: ${msg}`];
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function PlayerPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPlaying = useSignal(false);

  // Reads signal value (re-runs on change).  We poll torrentSignal
  // and call streamTo when we have a file and a video element ready.
  const torrent = torrentSignal.value;
  const mode = modeSignal.value;
  const peers = peersSignal.value;
  const isActive = mode !== "idle";

  // Polling interval: watches for a torrent with files + a video element
  // and wires them together via file.streamTo(videoElement).  Polling
  // because Preact signals don't trigger useEffect — we trigger manually
  // when torrentSignal changes (see useEffect below).
  const setupIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    dbg("effect: torrent:", torrent?.infoHash, "files:", torrent?.files?.length, "video:", !!videoRef.current);

    if (setupIntervalRef.current) {
      clearInterval(setupIntervalRef.current);
      setupIntervalRef.current = null;
    }

    if (!torrent || torrent.files.length === 0) {
      dbg("effect: no torrent or no files, waiting...");
      setupIntervalRef.current = setInterval(() => {
        const t = torrentSignal.value;
        if (t && t.files.length > 0 && videoRef.current) {
          dbg("poll: torrent ready with files, calling streamTo");
          const file = t.files[0]! as File;
          try {
            file.streamTo(videoRef.current);
            dbg("poll: streamTo done, src =", videoRef.current.src);
          } catch (err) {
            dbg("poll: streamTo error:", String(err));
          }
          if (setupIntervalRef.current) {
            clearInterval(setupIntervalRef.current);
            setupIntervalRef.current = null;
          }
        }
      }, 200) as unknown as number;
      return;
    }

    // torrent has files immediately
    if (videoRef.current) {
      const file = torrent.files[0]! as File;
      dbg("effect: immediate streamTo, file:", file.name);
      try {
        file.streamTo(videoRef.current);
        dbg("effect: streamTo done");
      } catch (err) {
        dbg("effect: streamTo error:", String(err));
      }
    } else {
      // video element not yet mounted — wait for next render
      dbg("effect: video ref not ready, polling...");
      setupIntervalRef.current = setInterval(() => {
        const t = torrentSignal.value;
        if (t && t.files.length > 0 && videoRef.current) {
          dbg("poll: video ready, calling streamTo");
          const file = t.files[0]! as File;
          try {
            file.streamTo(videoRef.current);
            dbg("poll: streamTo done, src =", videoRef.current.src);
          } catch (err) {
            dbg("poll: streamTo error:", String(err));
          }
          if (setupIntervalRef.current) {
            clearInterval(setupIntervalRef.current);
            setupIntervalRef.current = null;
          }
        }
      }, 200) as unknown as number;
    }

    // Periodically update speeds
    const speedInterval = setInterval(() => {
      const t = torrentSignal.value;
      if (t) {
        downSpeedSignal.value = t.downloadSpeed;
        upSpeedSignal.value = t.uploadSpeed;
      }
    }, 500);

    return () => {
      clearInterval(speedInterval);
      if (setupIntervalRef.current) {
        clearInterval(setupIntervalRef.current);
        setupIntervalRef.current = null;
      }
    };
  }, [torrent?.infoHash, torrent?.files?.length, mode]);

  const handleCanPlay = () => {
    isPlaying.value = true;
  };

  const handleEnded = () => {
    isPlaying.value = false;
  };

  const isVideo = (() => {
    const name = torrent?.files[0]?.name ?? "";
    return /\.(mp4|webm|mkv|avi|mov)$/i.test(name);
  })();

  const displayUrl = (() => {
    if (!torrent || !isActive) return null;
    const file = torrent.files[0];
    if (!file) return null;
    return buildStreamURL("/", torrent.infoHash, 0, file.name);
  })();

  return (
    <div class="field">
      {/* Video/Audio player */}
      {isActive && isVideo && (
        <video
          ref={videoRef}
          controls
          autoplay
          class="responsive round"
          onCanPlay={handleCanPlay}
          onEnded={handleEnded}
        />
      )}

      {/* Status de streaming */}
      {isActive && !isVideo && (
        <div class="chip">
          <i class="material-symbols small">audio_file</i>
          Áudio detectado — use player externo com:
        </div>
      )}

      {isActive && displayUrl && (
        <div class="field label suffix border">
          <input
            type="text"
            value={displayUrl}
            readonly
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              navigator.clipboard.writeText(displayUrl);
            }}
          />
          <label>Stream URL</label>
          <button
            type="button"
            class="transparent front"
            onClick={() => navigator.clipboard.writeText(displayUrl)}
            title="Copiar URL"
          >
            <i class="material-symbols small">content_copy</i>
          </button>
        </div>
      )}

      {/* Progresso */}
      {isActive && torrent && (
        <div class="field">
          <progress value={torrent.progress} class="max" />
          <label>{Math.round(torrent.progress * 100)}%</label>
        </div>
      )}

      {/* Velocidades */}
      {isActive && (
        <div class="row no-space">
          <div class="field label border">
            <input
              type="text"
              value={formatSpeed(downSpeedSignal.value)}
              readonly
            />
            <label class="green-text">
              <i class="material-symbols small">download</i>
              Download
            </label>
          </div>
          <div class="field label border">
            <input
              type="text"
              value={formatSpeed(upSpeedSignal.value)}
              readonly
            />
            <label class="red-text">
              <i class="material-symbols small">upload</i>
              Upload
            </label>
          </div>
        </div>
      )}

      {/* Peers conectados */}
      {isActive && peers.length > 0 && (
        <div class="chip">
          <i class="material-symbols small">group</i>
          {peers.length} peer{peers.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Info do arquivo */}
      {isActive && torrent && torrent.files[0] && (
        <div class="chip">
          <i class="material-symbols small">file_present</i>
          {torrent.files[0].name} ({formatSize(torrent.files[0].length)})
        </div>
      )}

      {/* Estado ocioso */}
      {!isActive && (
        <div class="secondary-text small-text">
          <i class="material-symbols small">info</i>
          Ative o WebTorrent e adicione um torrent para iniciar
        </div>
      )}
    </div>
  );
}
