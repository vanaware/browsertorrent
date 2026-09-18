/**
 * app.tsx — Componente raiz da demo WebTorrent.
 * Layout: 3 cards (Seeder | Leecher | Player) responsivos.
 */
import { useSignal, } from "@preact/signals";
import { SeederPanel, } from "./components/seeder-panel.tsx";
import { LeecherPanel, } from "./components/leecher-panel.tsx";
import { PlayerPanel, } from "./components/player-panel.tsx";
import { DebugPanel, } from "./components/debug-panel.tsx";
import { TorrentList, } from "./components/torrent-list.tsx";
import { SwarmVisualizer } from "./components/swarm-visualizer.tsx";
import {
  cleanup,
  debugSignal,
  engineSignal,
  errorSignal,
  initClient,
  modeSignal,
  peersSignal,
  useLocalTrackerSignal,
} from "./torrent-context.tsx";

function dbg(...args: unknown[]) {
  const msg = args.map((
    a,
  ) => (typeof a === "object" ? JSON.stringify(a,) : String(a,))).join(" ",);
  const ts = new Date().toISOString().split("T",)[1]!.slice(0, 8,);
  console.log(`[APP ${ts}]`, msg,);
  debugSignal.value = [
    ...debugSignal.value.slice(-99,),
    `[${ts}] APP: ${msg}`,
  ];
}

export function App() {
  const wtEnabled = useSignal(false,);
  const mode = modeSignal.value;
  const error = errorSignal.value;

  const handleEngineChange = async (
    newEngine: "browsertorrent" | "webtorrent",
  ) => {
    if (engineSignal.value === newEngine) return;
    dbg(`Switching engine to: ${newEngine}`,);

    // Se estiver ativo, limpa o atual e reinicializa
    const wasEnabled = wtEnabled.value;
    if (wasEnabled) {
      dbg("Engine switch: cleaning up active client...",);
      cleanup();
    }

    engineSignal.value = newEngine;

    if (wasEnabled) {
      dbg("Engine switch: re-initializing client with new engine...",);
      await initClient();
      dbg("Engine switch: new client ready",);
    }
  };

  const handleToggle = async () => {
    if (wtEnabled.value) {
      dbg("WebTorrent OFF — calling cleanup",);
      cleanup();
      wtEnabled.value = false;
    } else {
      dbg("WebTorrent ON — initializing client...",);
      wtEnabled.value = true;
      await initClient();
      dbg("WebTorrent ready",);
    }
  };

  return (
    <>
      {/* Header com status */}
      <nav class="top primary">
        <button type="button" class="circle transparent">
          <i class="material-symbols white-text">
            hub
          </i>
        </button>
        <label class="max">
          <h5 class="white-text">
            BrowserTorrent
          </h5>
        </label>

        <div class="row no-wrap white-text right-margin" style="gap: 16px;">
          <div class="chip border white-text">
            <i class="material-symbols small white-text">
              settings
            </i>
            {engineSignal.value === "browsertorrent" ? "BrowserTorrent" : "Original WebTorrent"}
          </div>
          <label class="radio">
            <input
              type="radio"
              name="engine"
              checked={engineSignal.value === "browsertorrent"}
              onChange={() => handleEngineChange("browsertorrent",)} />
            <span class="white-text">
              BT
            </span>
          </label>
          <label class="radio">
            <input
              type="radio"
              name="engine"
              checked={engineSignal.value === "webtorrent"}
              onChange={() => handleEngineChange("webtorrent",)} />
            <span class="white-text">
              WT
            </span>
          </label>
        </div>

        <label class="chip transparent white-text" title="Local Tracker (Fast Discovery)">
          <i class="material-symbols small white-text">
            lan
          </i>
          <div class="switch small">
            <input
              type="checkbox"
              checked={useLocalTrackerSignal.value}
              onChange={() => {
                useLocalTrackerSignal.value = !useLocalTrackerSignal.value;
                dbg(`Local tracker ${useLocalTrackerSignal.value ? "enabled" : "disabled"}`);
              }} />
            <span></span>
          </div>
        </label>

        <label class="chip transparent white-text">
          <i class="material-symbols small white-text">
            group
          </i>
          {peersSignal.value.length}
        </label>

        <label class="switch">
          <input
            type="checkbox"
            checked={wtEnabled.value}
            onChange={handleToggle} />
          <span class="white-text">
            <i class="material-symbols small">
              power_settings_new
            </i>
          </span>
        </label>
      </nav>

      {/* Erro */}
      {error && (
        <article class="error-container border left-margin right-margin top-margin">
          <i class="red-text">
            error
          </i>
          <span class="red-text">
            {error}
          </span>
        </article>
      )}

      <main class="responsive">
        <div class="grid">
          {/* Coluna Esquerda: Add & Control */}
          <div class="s12 m4">
            <article class="border round">
              <nav class="middle">
                <i class="material-symbols">
                  add
                </i>
                <h5>
                  Novo Torrent
                </h5>
              </nav>

              <div class="tabs">
                <a class="active">
                  <i class="material-symbols">
                    upload
                  </i>
                  <span>
                    Seed
                  </span>
                </a>
                <a>
                  <i class="material-symbols">
                    download
                  </i>
                  <span>
                    Leech
                  </span>
                </a>
              </div>

              <div class="padding">
                <SeederPanel disabled={!wtEnabled.value} />
                <hr class="divider" />
                <LeecherPanel disabled={!wtEnabled.value} />
              </div>
            </article>

            <article class="border round top-margin">
              <nav class="middle">
                <i class="material-symbols">
                  play_circle
                </i>
                <h5>
                  Player
                </h5>
              </nav>
              <PlayerPanel />
            </article>
          </div>

          {/* Coluna Direita: Lista de Torrents */}
          <div class="s12 m8">
            <article class="border round">
              <nav class="middle">
                <i class="material-symbols">
                  list
                </i>
                <h5 class="max">
                  Torrents
                </h5>
              </nav>
              <TorrentList />
            </article>

            <SwarmVisualizer />

            <DebugPanel />
          </div>
        </div>
      </main>
    </>
  );
}
