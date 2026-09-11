/**
 * torrent-context.tsx — Contexto global de Preact com Signals.
 * Gerencia o ciclo de vida do WebTorrent client, torrent ativo,
 * peers conectados e estatísticas de rede.
 */
import { createContext } from "preact";
import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import type { WebTorrent, Torrent, Wire } from "@loco/webtorrent";
import type { WebTorrentServer } from "@loco/webtorrent";

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

  const { WebTorrent: WT } = await import("@loco/webtorrent");
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