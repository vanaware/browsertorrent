/**
 * main.tsx — Entry point do demo.
 *
 * Utiliza o core consolidado do @vanaware/browsertorrent:
 *   - Gerenciamento de swarm, peers e torrents
 *   - Bridge de streaming do Service Worker com backpressure e range requests
 */
import { render } from "preact";
import { App } from "./app.tsx";
import { TorrentProvider } from "./torrent-context.tsx";

import {
  Client,
  Peer,
  registerAndConnectServiceWorker,
  Swarm,
  Torrent,
  WsTracker,
} from "@vanaware/browsertorrent";

// EXPOSE GLOBALS FOR E2E PLAYWRIGHT TESTING
// deno-lint-ignore no-explicit-any
(window as any).BrowserTorrentTest = {
  Client,
  Torrent,
  Swarm,
  Peer,
  WsTracker,
};

async function bootstrap() {
  if (!navigator.storage?.getDirectory) {
    console.warn("[main] OPFS não disponível");
  }

  if ("serviceWorker" in navigator) {
    try {
      await registerAndConnectServiceWorker({
        scriptUrl: "./sw.js",
        scope: "./",
      });
      console.log("[main] SW registered and MessageChannel established via @vanaware/browsertorrent");
    } catch (e) {
      console.error("[main] SW Registration failed:", e);
    }
  }

  render(
    (
      <TorrentProvider>
        <App />
      </TorrentProvider>
    ),
    document.getElementById("app")!,
  );
}

bootstrap().catch(console.error);
