> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém os arquivos de CÓDIGO FONTE principais da aplicação exemplo (UI).
> O projeto é o **BrowserTorrent [vdev] ** estruturado em bbrowsertorrents. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto BrowserTorrent [vdev] - Modo: UI

Gerado automaticamente em: 9/12/2026, 8:09:18 PM

---

## Arquivo: `packages/example/src/components/debug-panel.tsx`

```tsx
/**
 * debug-panel.tsx — Painel de debug com logs em tempo real.
 */
import { useSignal } from "@preact/signals";
import { debugSignal } from "../torrent-context.tsx";

export function DebugPanel() {
  const expanded = useSignal(false);
  const logs = debugSignal.value;

  return (
    <article class="border round debug-panel">
      <nav class="middle" onClick={() => { expanded.value = !expanded.value; }}>
        <i class="material-symbols">terminal</i>
        <h5>Debug Log</h5>
        <span class="chip">{logs.length} msgs</span>
        <button
          class="transparent"
          onClick={(e) => {
            e.stopPropagation();
            debugSignal.value = [];
          }}
          title="Limpar logs"
        >
          <i class="material-symbols small">delete</i>
        </button>
        <button class="transparent">
          <i class="material-symbols small">
            {expanded.value ? "expand_less" : "expand_more"}
          </i>
        </button>
      </nav>

      {expanded.value && (
        <div class="debug-log">
          {logs.length === 0 ? (
            <div class="secondary-text small-text">Nenhuma mensagem de debug</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} class="debug-line">
                <code>{log}</code>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}

```

---

## Arquivo: `packages/example/src/components/leecher-panel.tsx`

```tsx
/**
 * leecher-panel.tsx — Download via magnet e opção de ajudar compartilhando.
 */
import { useSignal } from "@preact/signals";
import { addTorrent, torrentSignal, modeSignal, peersSignal } from "../torrent-context.tsx";

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

interface Props {
  disabled?: boolean;
}

export function LeecherPanel({ disabled }: Props) {
  const magnetInput = useSignal("");
  const loading = useSignal(false);
  const helpingShare = useSignal(false);

  const handleDownload = async () => {
    const id = magnetInput.value.trim();
    if (!id) return;

    loading.value = true;
    try {
      await addTorrent(id);
    } catch {
      // erro no signal
    } finally {
      loading.value = false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleDownload();
  };

  const torrent = torrentSignal.value;
  const isLeeching = modeSignal.value === "leeching";
  const isSeeding = modeSignal.value === "seeding";
  const hasActiveTorrent = isLeeching || isSeeding;

  return (
    <div class="field">
      {/* Input magnet */}
      {!hasActiveTorrent && (
        <div class="field label border">
          <input
            type="text"
            id="magnet-input"
            placeholder="magnet:?xt=urn:btih:..."
            disabled={disabled}
            value={magnetInput.value}
            onInput={(e) => {
              magnetInput.value = (e.target as HTMLInputElement).value;
            }}
            onKeyDown={handleKeyDown}
          />
          <label for="magnet-input">Magnet / InfoHash</label>
        </div>
      )}

      {/* Status download ativo */}
      {isLeeching && torrent && (
        <div class="blue-text small-text">
          <i class="material-symbols small">download</i>
          {" "}{torrent.name ?? "Baixando..."}
        </div>
      )}

      {/* Botão Download */}
      {!hasActiveTorrent && (
        <button
          class={loading.value ? "loading" : ""}
          disabled={disabled || !magnetInput.value || loading.value}
          onClick={handleDownload}
        >
          <i class="material-symbols">download</i>
          Download
        </button>
      )}

      {/* Info do torrent */}
      {isLeeching && torrent && (
        <div class="field label border">
          <input type="text" value={torrent.infoHash} readonly />
          <label>InfoHash</label>
        </div>
      )}

      {/* Switch ajudar compartilhando */}
      {hasActiveTorrent && (
        <label class="switch">
          <input
            type="checkbox"
            checked={helpingShare.value}
            onChange={() => { helpingShare.value = !helpingShare.value; }}
          />
          <span>Ajudar compartilhando</span>
        </label>
      )}

      {/* Status de peers */}
      {hasActiveTorrent && (
        <div class="chip">
          <i class="material-symbols small">group</i>
          {peersSignal.value.length} peers
        </div>
      )}
    </div>
  );
}

```

---

## Arquivo: `packages/example/src/components/peer-panel.tsx`

```tsx
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

```

---

## Arquivo: `packages/example/src/components/player-panel.tsx`

```tsx
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
import { buildStreamURL, type File } from "@vanaware/browsertorrent";

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

```

---

## Arquivo: `packages/example/src/components/seeder-panel.tsx`

```tsx
/**
 * seeder-panel.tsx — Upload de vídeo e seeding P2P.
 */
import { useSignal } from "@preact/signals";
import { seedFile, torrentSignal, modeSignal, PUBLIC_TRACKERS } from "../torrent-context.tsx";
import type { Torrent } from "@vanaware/browsertorrent";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function buildMagnetURI(torrent: Torrent): string {
  const ih = torrent.infoHash;
  const name = encodeURIComponent(torrent.name ?? "download");
  const trackers = torrent.announce?.length
    ? torrent.announce
    : PUBLIC_TRACKERS;
  const trs = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${ih}&dn=${name}${trs}`;
}

interface Props {
  disabled?: boolean;
}

export function SeederPanel({ disabled }: Props) {
  const selectedFile = useSignal<File | null>(null);
  const loading = useSignal(false);
  const magnetCopied = useSignal(false);

  const handleSeed = async () => {
    const file = selectedFile.value;
    if (!file) return;

    loading.value = true;
    try {
      await seedFile(file);
    } catch {
      // erro no signal
    } finally {
      loading.value = false;
    }
  };

  const handleCopyMagnet = () => {
    const t = torrentSignal.value;
    if (!t) return;
    // Constrói magnet URI manualmente (parsedTorrent.magnetURI é "" para torrents gerados)
    const magnet = buildMagnetURI(t);
    navigator.clipboard.writeText(magnet);
    magnetCopied.value = true;
    setTimeout(() => { magnetCopied.value = false; }, 2000);
  };

  const getMagnetURI = (): string => {
    const t = torrentSignal.value;
    if (!t) return "";
    return buildMagnetURI(t);
  };

  const torrent = torrentSignal.value;
  const isSeeding = modeSignal.value === "seeding";

  return (
    <div class="field">
      {/* Botão selecionar mídia */}
      {!isSeeding && (
        <button
          class={selectedFile.value ? "tertiary" : ""}
          disabled={disabled}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "video/*,audio/*";
            input.onchange = () => {
              if (input.files?.[0]) {
                selectedFile.value = input.files[0]!;
              }
            };
            input.click();
          }}
        >
          <i class="material-symbols">{selectedFile.value ? "file_present" : "add"}</i>
          {selectedFile.value ? selectedFile.value.name : "Selecionar mídia"}
        </button>
      )}

      {/* Info do arquivo */}
      {selectedFile.value && !isSeeding && (
        <div class="secondary-text small-text">
          <i class="material-symbols small">file_present</i>
          {" "}{formatSize(selectedFile.value.size)}
        </div>
      )}

      {/* Status seeding */}
      {isSeeding && (
        <div class="green-text small-text">
          <i class="material-symbols small">check_circle</i>
          {" "}{torrent?.name}
        </div>
      )}

      {/* Botão Seed */}
      {!isSeeding && (
        <button
          class={loading.value ? "loading" : ""}
          disabled={disabled || !selectedFile.value || loading.value}
          onClick={handleSeed}
        >
          <i class="material-symbols">upload</i>
          Seed
        </button>
      )}

      {/* Magnet URI */}
      {isSeeding && torrent && (
        <div class="field label suffix border">
          <input
            type="text"
            value={getMagnetURI()}
            id="magnet-output"
            readonly
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              handleCopyMagnet();
            }}
          />
          <label>Magnet URI</label>
          <button
            class="transparent front"
            onClick={handleCopyMagnet}
            title="Copiar magnet"
          >
            <i class="material-symbols small">{magnetCopied.value ? "check" : "content_copy"}</i>
          </button>
        </div>
      )}

      {/* InfoHash */}
      {isSeeding && torrent && (
        <div class="field label border">
          <input type="text" value={torrent.infoHash} readonly />
          <label>InfoHash</label>
        </div>
      )}
    </div>
  );
}

```

---

## Arquivo: `packages/example/src/components/viewer-panel.tsx`

```tsx
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
import { buildStreamURL } from "@vanaware/browsertorrent";
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

```

---

## Arquivo: `packages/example/src/app.tsx`

```tsx
/**
 * app.tsx — Componente raiz da demo WebTorrent.
 * Layout: 3 cards (Seeder | Leecher | Player) responsivos.
 */
import { useSignal } from "@preact/signals";
import { SeederPanel } from "./components/seeder-panel.tsx";
import { LeecherPanel } from "./components/leecher-panel.tsx";
import { PlayerPanel } from "./components/player-panel.tsx";
import { DebugPanel } from "./components/debug-panel.tsx";
import {
  modeSignal,
  errorSignal,
  cleanup,
  peersSignal,
  debugSignal,
  initClient,
} from "./torrent-context.tsx";

function dbg(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  const ts = new Date().toISOString().split("T")[1]!.slice(0, 8);
  console.log(`[APP ${ts}]`, msg);
  debugSignal.value = [...debugSignal.value.slice(-99), `[${ts}] APP: ${msg}`];
}

export function App() {
  const wtEnabled = useSignal(false);
  const mode = modeSignal.value;
  const error = errorSignal.value;

  const handleToggle = async () => {
    if (wtEnabled.value) {
      dbg("WebTorrent OFF — calling cleanup");
      cleanup();
      wtEnabled.value = false;
    } else {
      dbg("WebTorrent ON — initializing client...");
      wtEnabled.value = true;
      await initClient();
      dbg("WebTorrent ready");
    }
  };

  return (
    <>
      {/* Header com status */}
      <nav class="top primary">
        {/* Status no header */}
        <label class="chip transparent white-text">
          <i class="material-symbols small white-text">
            {mode === "idle" ? "power_off" : mode === "seeding" ? "upload" : "download"}
          </i>
          {mode === "idle" ? "Off" : mode === "seeding" ? "Seeding" : "Leeching"}
        </label>
        <label class="chip transparent white-text">
          <i class="material-symbols small white-text">group</i>
          {peersSignal.value.length}
        </label>

        <label class="max center-align">
          <h5 class="white-text">BrowserTorrent WebTorrent</h5>
        </label>

        {/* Toggle WebTorrent */}
        <label class="switch">
          <input
            type="checkbox"
            checked={wtEnabled.value}
            onChange={handleToggle}
          />
          <span class="white-text">
            <i class="material-symbols small">power_settings_new</i>
          </span>
        </label>
      </nav>

      {/* Erro */}
      {error && (
        <article class="error-container border left-margin right-margin top-margin">
          <i class="red-text">error</i>
          <span class="red-text">{error}</span>
        </article>
      )}

      {/* 3 cards full-width verticais em mobile, lado a lado em large */}
      <main class="responsive">
        {/* Card 1: Seeder */}
        <article class="border round">
          <nav class="middle">
            <i class="material-symbols">upload</i>
            <h5>Seeder</h5>
          </nav>
          <SeederPanel disabled={!wtEnabled.value} />
        </article>

        {/* Card 2: Leecher */}
        <article class="border round">
          <nav class="middle">
            <i class="material-symbols">download</i>
            <h5>Leecher</h5>
          </nav>
          <LeecherPanel disabled={!wtEnabled.value} />
        </article>

        {/* Card 3: Player */}
        <article class="border round">
          <nav class="middle">
            <i class="material-symbols">play_circle</i>
            <h5>Player</h5>
          </nav>
          <PlayerPanel />
        </article>

        {/* Card 4: Debug Log */}
        <DebugPanel />
      </main>
    </>
  );
}

```

---

## Arquivo: `packages/example/src/main.tsx`

```tsx
/**
 * main.tsx — Entry point do demo.
 *
 * Implementa o protocolo webtorrent.io via Service Worker:
 *
 *   SW intercepta /webtorrent/... → cria MessageChannel → envia para cá
 *   → buscamos o arquivo no streamManager → pump de chunks via porta
 *
 * Protocolo (compatível com sw.min.js):
 *
 *   1. SW envia `webtorrent-request` com port2
 *   2. Página responde: `port2.postMessage(responseMetadata)`
 *   3. SW abre Response(body=ReadableStream)
 *   4. SW pede chunks: `port1.postMessage(true)`
 *   5. Página responde com chunks: `port1.postMessage(Uint8Array)` ou `null`
 */
import { render } from "preact";
import { App } from "./app.tsx";
import { TorrentProvider } from "./torrent-context.tsx";
import { streamManager, parseStreamURL, type WebTorrentServer } from "@vanaware/browsertorrent";

function waitForActivation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === "activated") {
      resolve();
      return;
    }
    const onChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onChange);
        resolve();
      }
    };
    worker.addEventListener("statechange", onChange);
  });
}

async function establishSWConnection() {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.ready;
  const sw = reg.active;
  if (!sw) return;

  const { port1, port2 } = new MessageChannel();

  // Porta que fica no SW para streaming
  sw.postMessage({ type: "PORT" }, [port1]);

  // Porta que fica na página (recebe requests do SW)
  port2.onmessage = async (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type !== "webtorrent-request") return;

    const { url, method, headers, scope, destination } = msg;
    // SW transfere 2 portas:
    //   e.ports[0] = chunkPort2 (main envia chunks por aqui)
    //   e.ports[1] = requestPort1 (main recebe requests do SW)
    const chunkPort = e.ports[0]!;       // main → SW: chunks
    const requestPort = e.ports[1]!;     // SW → main: requests (não usado aqui, mas mantido)

    console.log("[main] SW request:", method, url);

    try {
      // Parse URL → (infoHash, fileIndex)
      const parsed = parseStreamURL(url, scope || "/");
      if (!parsed) {
        chunkPort.postMessage({ status: 404, body: "Not Found" });
        chunkPort.postMessage(null);
        chunkPort.close();
        return;
      }

      // Lookup file via streamManager
      const entry = streamManager.get(parsed.infoHash, parsed.fileIndex);
      if (!entry) {
        console.log(
          "[main] streamManager MISS — looking for:",
          parsed.infoHash,
          "idx:",
          parsed.fileIndex,
          "\n  Registered entries:",
          streamManager.list().map((e) => `${e.infoHash}:${e.fileIndex} (${e.file.name})`),
        );
        chunkPort.postMessage({ status: 404, body: "File not registered" });
        chunkPort.postMessage(null);
        chunkPort.close();
        return;
      }

      const file = entry.file;

      // Parse Range header
      const range = parseRange(headers["range"], file.length);
      const status = range ? 206 : 200;
      const statusText = range ? "Partial Content" : "OK";
      const contentType = guessContentType(file.name);

      const respHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };

      if (range) {
        respHeaders["Content-Range"] = `bytes ${range.start}-${range.end}/${file.length}`;
        respHeaders["Content-Length"] = String(range.end - range.start + 1);
      } else {
        respHeaders["Content-Length"] = String(file.length);
      }

      // ── Tracking de offset para leitura progressiva ─────────────────
      const rangeStart = range?.start ?? 0;
      const rangeEnd = range?.end ?? (file.length - 1);
      let currentOffset = rangeStart;

      let fileStream: ReadableStream<Uint8Array> | null = null;
      let fileIterator: ReadableStreamDefaultReader<Uint8Array> | null = null;

      function ensureStream() {
        if (!fileStream) {
          console.log("[main] ensureStream: creating ReadableStream, start:", rangeStart, "end:", rangeEnd);
          fileStream = file.createReadStream({ start: rangeStart, end: rangeEnd });
          fileIterator = fileStream.getReader();
          console.log("[main] ensureStream: stream created, file.length:", file.length);
        }
      }

      // ── Instalar handler no chunkPort ANTES de enviar metadata ─────
      let closed = false;
      const cleanup = () => {
        closed = true;
        fileIterator = null;
        fileStream = null;
        chunkPort.close();
      };

      chunkPort.onmessage = async (ev: MessageEvent) => {
        console.log("[main] chunkPort.onmessage FIRED, data:", ev.data, "closed:", closed);
        if (closed) return;
        const data = ev.data;

        if (data === null || data === false) {
          cleanup();
          return;
        }

        if (data === true) {
          console.log("[main] SW wants chunk, currentOffset:", currentOffset, "rangeEnd:", rangeEnd);
          if (currentOffset > rangeEnd) {
            console.log("[main] all bytes sent, sending null");
            chunkPort.postMessage(null);
            cleanup();
            return;
          }

          ensureStream();
          console.log("[main] reading chunk from fileIterator...");

          const { value, done } = await fileIterator!.read();
          console.log("[main] fileIterator.read() returned, done:", done, "value:", value?.byteLength ?? "null");
          if (closed) return;

          if (done || !value || value.byteLength === 0) {
            console.log("[main] stream done, sending null, read bytes:", currentOffset - rangeStart, "/", rangeEnd - rangeStart + 1);
            chunkPort.postMessage(null);
            cleanup();
            return;
          }

          currentOffset += value.byteLength;
          console.log("[main] → chunk to SW:", value.byteLength, "bytes, offset:", currentOffset, "/", rangeEnd + 1);
          chunkPort.postMessage(value);
        }
      };

      chunkPort.start?.();
      console.log("[main] chunkPort started, readyState:", chunkPort.readyState);

      // ── Enviar metadata da resposta via requestPort ──────────────
      requestPort.postMessage({
        status,
        statusText,
        headers: respHeaders,
        body: "STREAM",
      });

      console.log("[main] Response metadata sent, body=STREAM, range:", rangeStart, "-", rangeEnd);
    } catch (err) {
      console.error("[main] Error:", err);
      chunkPort.postMessage({ status: 500, body: String(err) });
      chunkPort.postMessage(null);
      chunkPort.close();
    }
  };
}

async function readNextChunk(
  file: any,
  start: number,
  end: number,
): Promise<Uint8Array> {
  // Usa createReadStream com range
  const stream = file.createReadStream({ start, end });
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    totalSize += value.byteLength;
    chunks.push(value);
    // Reset to avoid unlimited growth — only keep first chunk for now
    if (chunks.length > 1) {
      // Concatenate
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const c of chunks) {
        combined.set(c, offset);
        offset += c.byteLength;
      }
      return combined;
    }
  }

  return chunks[0] ?? new Uint8Array(0);
}

function parseRange(
  header: string | undefined,
  fileLength: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const endStr = match[2];
  const end = endStr ? Number(endStr) : fileLength - 1;
  if (!Number.isFinite(start) || start < 0 || start >= fileLength) return null;
  if (!Number.isFinite(end) || end < start || end >= fileLength) return null;
  return { start, end };
}

function guessContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

async function bootstrap() {
  if (!navigator.storage?.getDirectory) {
    console.warn("[main] OPFS não disponível");
  }

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("[main] SW Registered:", reg.scope);

      // Wait for the SW to be active. On a fresh page load, reg.active is
      // null until install + activate complete. Use serviceWorker.ready
      // (which resolves when there's an active worker) instead of checking
      // reg.active at registration time.
      const activeWorker = reg.active ?? reg.installing ?? reg.waiting;
      if (activeWorker) {
        if (activeWorker.state === "activated") {
          await establishSWConnection();
          console.log("[main] SW MessageChannel established");
        } else {
          await waitForActivation(activeWorker);
          await establishSWConnection();
          console.log("[main] SW MessageChannel established (after activation)");
        }
      } else {
        // Last-resort: register again so updatefound fires
        const reg2 = await navigator.serviceWorker.ready;
        const w = reg2.active;
        if (w) {
          await establishSWConnection();
          console.log("[main] SW MessageChannel established (via ready)");
        }
      }
    } catch (e) {
      console.error("[main] SW Registration failed:", e);
    }
  }

  render(
    <TorrentProvider>
      <App />
    </TorrentProvider>,
    document.getElementById("app")!,
  );
}

bootstrap().catch(console.error);

```

---

## Arquivo: `packages/example/src/test_trackers.ts`

```ts
/**
 * @file test_trackers.ts
 * @description Utilitário para testar a saúde e resposta de trackers WebTorrent (WebSocket)
 * @stack Deno 2.x, TypeScript, Web Crypto API, jsr:@std/encoding
 * 
 * Fontes pesquisadas:
 * - Documentação oficial webtorrent.io
 * - Repositório ngosang/trackerslist (issue #257)
 * - Projeto bitvid (js/constants.js)
 * - Instâncias PeerTube
 */

import { encodeBase64 } from "jsr:@std/encoding/base64";

/**
 * Lista expandida de trackers WebTorrent candidatos
 */
const TRACKER_CANDIDATES = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443",
  "wss://video.blender.org/tracker/socket",
];

/**
 * Gera uma string Base64 de 20 bytes aleatórios, simulando info_hash ou peer_id.
 * Usa a Web Crypto API nativa do Deno.
 */
function generateRandom20BytesBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return encodeBase64(bytes);
}

/**
 * Testa um único tracker WebTorrent enviando um payload de announce válido.
 * @param url A URL do tracker (ws:// ou wss://)
 * @param timeoutMs Tempo máximo de espera em milissegundos (padrão: 3000ms)
 * @returns Promise<{success: boolean, timeMs: number, error?: string}>
 */
async function testTracker(
  url: string,
  timeoutMs = 3000
): Promise<{ success: boolean; timeMs: number; error?: string }> {
  const startTime = performance.now();
  
  return new Promise((resolve) => {
    let resolved = false;
    let ws: WebSocket | null = null;

    const cleanup = (success: boolean, error?: string) => {
      if (!resolved) {
        resolved = true;
        const timeMs = Math.round(performance.now() - startTime);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close(1000, success ? "Resposta recebida" : "Teste concluído");
        }
        resolve({ success, timeMs, error });
      }
    };

    try {
      ws = new WebSocket(url);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
      cleanup(false, `Falha ao instanciar WebSocket: ${errorMsg}`);
      return;
    }

    ws.onopen = () => {
      try {
        // Payload mínimo válido conforme especificação do bittorrent-tracker
        const payload = {
          action: "announce",
          info_hash: generateRandom20BytesBase64(),
          peer_id: generateRandom20BytesBase64(),
          numwant: 1,
          port: 6881,
          left: 0,
          event: "started",
        };
        ws!.send(JSON.stringify(payload));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
        cleanup(false, `Erro ao enviar payload: ${errorMsg}`);
      }
    };

    ws.onmessage = (event) => {
      if (!resolved) {
        // Verifica se a resposta contém estrutura válida
        try {
          const response = JSON.parse(event.data);
          if (response && typeof response === "object") {
            cleanup(true);
          } else {
            cleanup(false, "Resposta inválida");
          }
        } catch {
          // Mesmo que não seja JSON válido, se recebemos algo, é positivo
          cleanup(true);
        }
      }
    };

    ws.onerror = (event) => {
      const errorMsg = event instanceof ErrorEvent ? event.message : "Erro desconhecido";
      cleanup(false, `WebSocket error: ${errorMsg}`);
    };

    ws.onclose = (event) => {
      if (!resolved) {
        cleanup(false, `Conexão fechada: ${event.reason || "Sem razão"}`);
      }
    };

    // Mecanismo de timeout para evitar conexões "penduradas"
    setTimeout(() => {
      if (!resolved) {
        cleanup(false, "Timeout atingido");
      }
    }, timeoutMs);
  });
}

/**
 * Executa o teste em massa e exibe um relatório formatado no console.
 */
async function runTrackerDiagnostics() {
  console.log("🚀 Iniciando diagnóstico de Trackers WebTorrent...\n");
  console.log(`| ${"Tracker".padEnd(50)} | ${"Status".padEnd(10)} | ${"Tempo".padEnd(8)} | ${"Detalhes"}`);
  console.log(`|${"-".repeat(52)}|${"-".repeat(12)}|${"-".repeat(10)}|${"-".repeat(20)}|`);

  const results: { url: string; success: boolean; timeMs: number; error?: string }[] = [];

  for (const url of TRACKER_CANDIDATES) {
    const result = await testTracker(url, 3000);
    results.push({ url, ...result });

    const statusIcon = result.success ? "✅ ATIVO" : "❌ FALHOU";
    const statusPadded = statusIcon.padEnd(10);
    const urlPadded = url.padEnd(50);
    const timePadded = `${result.timeMs}ms`.padEnd(8);
    const details = result.error || "OK";

    console.log(`| ${urlPadded} | ${statusPadded} | ${timePadded} | ${details}`);
  }

  console.log(`\n📊 Resumo: ${results.filter((r) => r.success).length} de ${results.length} trackers estão operacionais.`);
  
  // Sugestão de ação: Filtrar apenas os vivos para uso em produção
  const healthyTrackers = results.filter((r) => r.success).map((r) => r.url);
  if (healthyTrackers.length > 0) {
    console.log("\n💡 Lista saudável recomendada para o array PUBLIC_TRACKERS:");
    console.log(JSON.stringify(healthyTrackers, null, 2));
  } else {
    console.warn("\n⚠️ Nenhum tracker respondeu. Verifique sua conexão de rede ou firewall.");
  }

  // Estatísticas adicionais
  const avgTime = results
    .filter((r) => r.success)
    .reduce((sum, r) => sum + r.timeMs, 0) / (healthyTrackers.length || 1);
  
  console.log(`\n⏱️  Tempo médio de resposta: ${Math.round(avgTime)}ms`);
  
  // Classificação por velocidade
  const sorted = results
    .filter((r) => r.success)
    .sort((a, b) => a.timeMs - b.timeMs);
  
  if (sorted.length > 0) {
    console.log("\n🏆 Trackers mais rápidos:");
    sorted.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.url} (${r.timeMs}ms)`);
    });
  }
}

// Executa se for o módulo principal
if (import.meta.main) {
  runTrackerDiagnostics();
}

export { TRACKER_CANDIDATES, testTracker, runTrackerDiagnostics };
```

---

## Arquivo: `packages/example/src/torrent-context.tsx`

```tsx
/**
 * torrent-context.tsx — Contexto global de Preact com Signals.
 * Gerencia o ciclo de vida do WebTorrent client, torrent ativo,
 * peers conectados e estatísticas de rede.
 */
import { createContext } from "preact";
import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import type { WebTorrent, Torrent, Wire } from "@vanaware/browsertorrent";
import type { WebTorrentServer } from "@vanaware/browsertorrent";

// ─── Trackers públicos ─────────────────────────────────────────────────────────

export const PUBLIC_TRACKERS = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443",
];

// ─── Estado global (signals) ─────────────────────────────────────────────────

export const clientSignal = signal<WebTorrent | null>(null);
export const serverSignal = signal<WebTorrentServer | null>(null);
export const torrentSignal = signal<Torrent | null>(null);
export const peersSignal = signal<Wire[]>([]);
export const downSpeedSignal = signal(0);
export const upSpeedSignal = signal(0);
export const errorSignal = signal<string | null>(null);
export const modeSignal = signal<"idle" | "seeding" | "leeching">("idle");
export const debugSignal = signal<string[]>([]);

// ─── Debug helper ─────────────────────────────────────────────────────────────

function dbg(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  const ts = new Date().toISOString().split("T")[1]!.slice(0, 8);
  console.log(`[DEBUG ${ts}]`, msg);
  debugSignal.value = [...debugSignal.value.slice(-99), `[${ts}] ${msg}`];
}

// ─── Helpers de ciclo de vida ────────────────────────────────────────────────

export async function initClient(): Promise<WebTorrent> {
  const existing = clientSignal.value;
  if (existing) {
    dbg("initClient: reusing existing client");
    return existing;
  }

  const { WebTorrent: WT } = await import("@vanaware/browsertorrent");
  const opfsAvailable = navigator.storage?.getDirectory != null;
  dbg("initClient: creating WebTorrent client, OPFS available:", opfsAvailable);

  const wt = new WT({
    peerId: undefined,
    maxConns: 55,
    useOPFS: opfsAvailable,
    rtcConfig: {
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
      ],
    },
  });

  wt.on("error", (e: Event) => {
    const ce = e as CustomEvent<Error>;
    const msg = ce.detail?.message ?? String(e);
    dbg("CLIENT ERROR:", msg);
    errorSignal.value = msg;
  });

  // Log all torrent events for debugging
  wt.on("torrent", (e: Event) => {
    const ce = e as CustomEvent<Torrent>;
    dbg("wt.torrent event:", ce.detail?.infoHash);
  });

  clientSignal.value = wt;
  dbg("initClient: client created and stored");
  return wt;
}

export async function seedFile(file: File): Promise<void> {
  errorSignal.value = null;
  modeSignal.value = "idle";
  dbg("seedFile: starting, file:", file.name, "size:", file.size);

  const wt = await initClient();
  dbg("seedFile: client ready, server:", serverSignal.value ? "exists" : "NULL");

  let server = serverSignal.value;

  if (!server) {
    dbg("seedFile: creating server...");
    server = wt.createServer({ scope: "/" });
    dbg("seedFile: server created, calling sendReadyAck...");
    await server.sendReadyAck();
    dbg("seedFile: server ready, storing in serverSignal");
    serverSignal.value = server;
  } else {
    dbg("seedFile: reusing existing server");
  }

  try {
    dbg("seedFile: calling wt.seed() with trackers:", PUBLIC_TRACKERS);
    const torrent = await wt.seed(file, {
      name: file.name,
      trackers: PUBLIC_TRACKERS,
    });
    dbg("seedFile: wt.seed() returned");
    dbg("  torrent.infoHash:", torrent.infoHash, "(length:", torrent.infoHash?.length ?? "undefined", ")");
    dbg("  torrent.name:", torrent.name);
    dbg("  torrent.magnetURI:", torrent.magnetURI);
    dbg("  torrent.files.length:", torrent.files?.length);
    dbg("  torrent.announce:", torrent.announce);
    const store = (torrent as any).store;
    dbg("  torrent.store:", store ? "available" : "NULL", "type:", store?.constructor?.name);
    dbg("  torrent.pieceLength:", (torrent as any).pieceLength);

    torrentSignal.value = torrent;
    modeSignal.value = "seeding";
    dbg("seedFile: torrentSignal.value set, mode = seeding");

    // ── Torrent lifecycle events ──────────────────────────────────────────────

    torrent.on("infoHash", () => {
      dbg("EVENT: infoHash ready:", torrent.infoHash);
    });

    torrent.on("metadata", () => {
      dbg("EVENT: metadata ready, infoHash:", torrent.infoHash);
      dbg("  torrent.name:", torrent.name);
      dbg("  torrent.files:", torrent.files?.map((f) => f.name));
    });

    torrent.on("ready", () => {
      dbg("EVENT: torrent ready!");
      dbg("  infoHash:", torrent.infoHash);
      dbg("  name:", torrent.name);
      dbg("  files:", torrent.files?.length);
      dbg("  server:", serverSignal.value ? "available" : "NULL");
    });

    torrent.on("error", (e: Event) => {
      const ce = e as CustomEvent<Error>;
      dbg("EVENT: torrent error:", ce.detail?.message ?? String(e));
    });

    torrent.on("wire", (e: CustomEvent<{ wire: Wire; addr: string }>) => {
      dbg("EVENT: wire/peer CONNECTED from:", e.detail.addr);
      const swarm = (torrent as any).swarm;
      const wires = [...(swarm?.peers.values() ?? [])]
        .map((p: any) => p.wire)
        .filter((w: Wire | null): w is Wire => w !== null);
      dbg("  total peers:", wires.length);
      peersSignal.value = wires;
      e.detail.wire.on("close", () => {
        dbg("EVENT: wire/peer disconnected from:", e.detail.addr);
        const updated = [...(swarm?.peers.values() ?? [])]
          .map((p: any) => p.wire)
          .filter((w: Wire | null): w is Wire => w !== null);
      peersSignal.value = updated;
      });
      e.detail.wire.on("handshake", () => {
        dbg("EVENT: wire handshake complete with:", e.detail.addr);
      });
    });

    torrent.on("warning", (e: Event) => {
      const ce = e as CustomEvent<Error>;
      dbg("EVENT: warning:", ce.detail?.message ?? String(e));
    });

    // Log swarm state periodically for debugging
    const swarmInterval = setInterval(() => {
      const swarm = (torrent as any).swarm;
      if (swarm) {
        const peers = swarm.peers ? [...swarm.peers.keys()] : [];
        dbg("SWARM STATUS: peers:", peers.length, "infoHash:", torrent.infoHash);
        if (peers.length > 0) {
          dbg("  peer addrs:", peers);
        }
      }
    }, 5000);

    dbg("seedFile: all event listeners attached");
    dbg("SEEDER READY — infoHash:", torrent.infoHash);
    dbg("  Trackers configured:", torrent.announce?.length ?? 0);
    dbg("  Swarm listening — waiting for peers to connect...");

    // Log tracker connection attempts via client events
    (wt as any).on("trackerAnnounce", (_e: Event, tracker: string) => {
      dbg("EVENT: client trackerAnnounce to:", tracker);
    });
    (wt as any).on("trackerWarning", (_e: Event, tracker: string) => {
      dbg("EVENT: client trackerWarning from:", tracker);
    });
    (wt as any).on("trackerError", (e: Event) => {
      const ce = e as CustomEvent<Error>;
      dbg("EVENT: client trackerError:", ce.detail?.message ?? String(e));
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    dbg("seedFile: ERROR:", msg);
    errorSignal.value = msg;
    throw e;
  }
}

export async function addTorrent(torrentId: string): Promise<void> {
  errorSignal.value = null;
  modeSignal.value = "idle";
  dbg("addTorrent: starting, torrentId:", torrentId);

  const wt = await initClient();
  dbg("addTorrent: client ready, server:", serverSignal.value ? "exists" : "NULL");

  let server = serverSignal.value;

  if (!server) {
    dbg("addTorrent: creating server...");
    server = wt.createServer({ scope: "/" });
    dbg("addTorrent: server created, calling sendReadyAck...");
    await server.sendReadyAck();
    dbg("addTorrent: server ready, storing in serverSignal");
    serverSignal.value = server;
  } else {
    dbg("addTorrent: reusing existing server");
  }

  try {
    dbg("addTorrent: calling wt.add('" + torrentId + "')");
    const torrent = await wt.add(torrentId);
    dbg("addTorrent: wt.add() returned");
    dbg("  torrent.infoHash:", torrent.infoHash, "(length:", torrent.infoHash?.length ?? "undefined", ")");
    dbg("  torrent.name:", torrent.name);
    dbg("  torrent.magnetURI:", torrent.magnetURI);
    dbg("  torrent.files.length:", torrent.files?.length);

    torrentSignal.value = torrent;
    modeSignal.value = "leeching";
    dbg("addTorrent: torrentSignal.value set, mode = leeching");

    // ── Torrent lifecycle events ──────────────────────────────────────────────

    torrent.on("infoHash", () => {
      dbg("EVENT: infoHash ready:", torrent.infoHash);
    });

    torrent.on("metadata", () => {
      dbg("EVENT: metadata ready, infoHash:", torrent.infoHash);
      dbg("  torrent.name:", torrent.name);
      dbg("  torrent.files:", torrent.files?.map((f) => f.name));
    });

    torrent.on("ready", () => {
      dbg("EVENT: torrent ready!");
      dbg("  infoHash:", torrent.infoHash);
      dbg("  name:", torrent.name);
      dbg("  files:", torrent.files?.length);
      dbg("  server:", serverSignal.value ? "available" : "NULL");
    });

    torrent.on("error", (e: Event) => {
      const ce = e as CustomEvent<Error>;
      dbg("EVENT: torrent error:", ce.detail?.message ?? String(e));
    });

    torrent.on("wire", (e: CustomEvent<{ wire: Wire; addr: string }>) => {
      dbg("EVENT: wire/peer connected from:", e.detail.addr);
      const swarm = (torrent as any).swarm;
      const wires = [...(swarm?.peers.values() ?? [])]
        .map((p: any) => p.wire)
        .filter((w: Wire | null): w is Wire => w !== null);
      dbg("  total peers:", wires.length);
      peersSignal.value = wires;
      e.detail.wire.on("close", () => {
        dbg("EVENT: wire/peer disconnected from:", e.detail.addr);
        const updated = [...(swarm?.peers.values() ?? [])]
          .map((p: any) => p.wire)
          .filter((w: Wire | null): w is Wire => w !== null);
      peersSignal.value = updated;
      });
    });

    torrent.on("warning", (e: Event) => {
      const ce = e as CustomEvent<Error>;
      dbg("EVENT: warning:", ce.detail?.message ?? String(e));
    });

    torrent.on("download", (e: CustomEvent<{ bytes: number }>) => {
      dbg("EVENT: download:", e.detail?.bytes, "bytes, progress:", Math.round(torrent.progress * 100) + "%");
    });

    torrent.on("done", () => {
      dbg("EVENT: torrent download complete!");
    });

    dbg("addTorrent: all event listeners attached");
    dbg("LEECHER READY — infoHash:", torrent.infoHash);
    dbg("  Downloading from peers — progress:", Math.round(torrent.progress * 100) + "%");

    // Log swarm state periodically for debugging
    const swarmInterval = setInterval(() => {
      const swarm = (torrent as any).swarm;
      if (swarm) {
        const peers = swarm.peers ? [...swarm.peers.keys()] : [];
        dbg("SWARM STATUS: peers:", peers.length, "infoHash:", torrent.infoHash);
        dbg("  downloaded:", torrent.downloaded, "of", torrent.length);
        if (peers.length > 0) {
          dbg("  peer addrs:", peers);
        }
      }
    }, 5000);

    // Log tracker connection attempts via client events
    (wt as any).on("trackerAnnounce", (_e: Event, tracker: string) => {
      dbg("EVENT: client trackerAnnounce to:", tracker);
    });
    (wt as any).on("trackerWarning", (_e: Event, tracker: string) => {
      dbg("EVENT: client trackerWarning from:", tracker);
    });
    (wt as any).on("trackerError", (e: Event) => {
      const ce = e as CustomEvent<Error>;
      dbg("EVENT: client trackerError:", ce.detail?.message ?? String(e));
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    dbg("addTorrent: ERROR:", msg);
    errorSignal.value = msg;
    throw e;
  }
}

export function cleanup(): void {
  dbg("cleanup: starting...");
  const server = serverSignal.value;
  if (server) {
    dbg("cleanup: destroying server");
    server.destroy();
    serverSignal.value = null;
  }
  const client = clientSignal.value;
  if (client) {
    dbg("cleanup: destroying client");
    client.destroy();
    clientSignal.value = null;
  }
  torrentSignal.value = null;
  peersSignal.value = [];
  modeSignal.value = "idle";
  downSpeedSignal.value = 0;
  upSpeedSignal.value = 0;
  errorSignal.value = null;
  dbg("cleanup: done");
}

// ─── Context provider ────────────────────────────────────────────────────────

export const TorrentContext = createContext({});

export function TorrentProvider({ children }: { children: ComponentChildren }) {
  return (
    <TorrentContext.Provider value={{}}>
      {children}
    </TorrentContext.Provider>
  );
}
```

---

## Arquivo: `packages/example/src/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BrowserTorrent WebTorrent</title>

  <!-- BeerCSS v5 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.css" />
  <script type="module" src="https://cdn.jsdelivr.net/npm/beercss@5.0.3/dist/cdn/beer.min.js"></script>

  <!-- Material Dynamic Colors -->
  <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.4/dist/cdn/material-dynamic-colors.min.js"></script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />

  <!-- Debug Panel Styles -->
  <style>
    .debug-panel {
      margin-top: 1rem;
    }
    .debug-panel nav {
      cursor: pointer;
      user-select: none;
    }
    .debug-log {
      max-height: 300px;
      overflow-y: auto;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 0.5rem;
      border-radius: 0 0 12px 12px;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.75rem;
      line-height: 1.4;
    }
    .debug-line {
      padding: 2px 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .debug-line:hover {
      background: #2d2d2d;
    }
    .debug-line code {
      font-family: inherit;
      color: #d4d4d4;
      background: transparent;
    }
  </style>
</head>
<body class="light">
  <div id="app"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>

```

---

## Arquivo: `packages/example/deno.jsonc`

```json
{
  "name": "@browsertorrent/example",
  "compilerOptions": {
    "lib": [
      "dom",
      "dom.iterable",
      "dom.asynciterable",
      "deno.ns",
      "deno.unstable",
      "DOM",
      "webworker"
    ],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/testing/bdd": "jsr:@std/testing@^1/bdd",
    "preact": "https://esm.sh/preact@10.29.7",
    "preact/": "https://esm.sh/preact@10.29.7/",
    "preact/jsx-runtime": "https://esm.sh/preact@10.29.7/jsx-runtime",
    "@preact/signals": "https://esm.sh/@preact/signals@1.3.1?deps=preact@10.29.7"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read --allow-write tests/",
    "check": "deno check src/**/*.ts tests/**/*.ts",
    "tests": "deno task check && deno task test"
  },
  "exports": {
    ".": "./src/mod.ts"
  }
}

```

---

