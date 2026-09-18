/**
 * torrent-context.tsx — Contexto global de Preact com Signals.
 * Gerencia o ciclo de vida do WebTorrent client, torrent ativo,
 * peers conectados e estatísticas de rede.
 */
import { createContext, } from "preact";
import { signal, } from "@preact/signals";
import type { ComponentChildren, } from "preact";
import type { Client, Torrent, Wire, } from "@loco/webtorrent";
import type { WebTorrentServer, } from "@loco/webtorrent";
import { db, } from "@loco/worker-db";
import { streamManager, } from "@loco/webtorrent";

// Helper para converter stream Node (usado no WebTorrent original do browser) em Web ReadableStream
// deno-lint-ignore no-explicit-any
function nodeStreamToWebStream(nodeStream: any): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // deno-lint-ignore no-explicit-any
      nodeStream.on("data", (chunk: any) => {
        const buf = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
        controller.enqueue(buf);
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      // deno-lint-ignore no-explicit-any
      nodeStream.on("error", (err: any) => {
        controller.error(err);
      });
    },
    cancel() {
      if (typeof nodeStream.destroy === "function") {
        nodeStream.destroy();
      }
    }
  });
}

// ─── Trackers públicos ─────────────────────────────────────────────────────────

export const PUBLIC_TRACKERS = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443",
];

// ─── Estado global (signals) ─────────────────────────────────────────────────

export const engineSignal = signal<"browsertorrent" | "webtorrent">("browsertorrent");
// deno-lint-ignore no-explicit-any
export const clientSignal = signal<any | null>(null,);
// deno-lint-ignore no-explicit-any
export const serverSignal = signal<any | null>(null,);
// deno-lint-ignore no-explicit-any
export const torrentsSignal = signal<any[]>([]);
// deno-lint-ignore no-explicit-any
export const torrentSignal = signal<any | null>(null,);
// deno-lint-ignore no-explicit-any
export const peersSignal = signal<any[]>([]);
export const downSpeedSignal = signal(0,);
export const upSpeedSignal = signal(0,);
export const tickSignal = signal(0,);
export const errorSignal = signal<string | null>(null,);
export const modeSignal = signal<"idle" | "seeding" | "leeching">("idle",);
export const debugSignal = signal<string[]>([],);

// ─── Debug helper ─────────────────────────────────────────────────────────────

function dbg(...args: unknown[]) {
  const msg = args.map((
    a,
  ) => (typeof a === "object" ? JSON.stringify(a,) : String(a,))).join(" ",);
  const ts = new Date().toISOString().split("T",)[1]!.slice(0, 8,);
  console.log(`[DEBUG ${ts}]`, msg,);
  debugSignal.value = [...debugSignal.value.slice(-99,), `[${ts}] ${msg}`,];
}

// ─── Helpers de ciclo de vida ────────────────────────────────────────────────

const torrentsDb = db("browsertorrent", "torrents",);

// deno-lint-ignore no-explicit-any
export async function initClient(): Promise<any> {
  const existing = clientSignal.value;
  if (existing) {
    dbg("initClient: reusing existing client",);
    return existing;
  }

  let wt;
  if (engineSignal.value === "browsertorrent") {
    const { Client: WT, } = await import("@loco/webtorrent");
    const opfsAvailable = navigator.storage?.getDirectory != null;
    dbg(
      "initClient: creating BrowserTorrent client, OPFS available:",
      opfsAvailable,
    );

    wt = new WT({
      peerId: undefined,
      maxConns: 55,
      useOPFS: opfsAvailable,
      rtcConfig: {
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      },
    },);
  } else {
    dbg("initClient: creating original WebTorrent client...");
    // deno-lint-ignore no-explicit-any
    const WT = (window as any).WebTorrent;
    if (!WT) {
      throw new Error("original WebTorrent library not loaded from CDN!");
    }
    wt = new WT({
      maxConns: 55,
      tracker: {
        rtcConfig: {
          iceServers: [
            {
              urls: [
                "stun:stun.l.google.com:19302",
                "stun:global.stun.twilio.com:3478",
              ],
            },
          ],
        },
      },
    });
  }

  // deno-lint-ignore no-explicit-any
  wt.on("error", (e: any) => {
    const msg = e?.detail?.message ?? e?.message ?? String(e,);
    dbg("CLIENT ERROR:", msg,);
    errorSignal.value = msg;
  },);

  // Log all torrent events for debugging
  // deno-lint-ignore no-explicit-any
  wt.on("torrent", (e: any) => {
    const t = e?.detail ?? e;
    dbg("wt.torrent event:", t.infoHash,);
    if (!torrentsSignal.value.find((x,) => x.infoHash === t.infoHash)) {
      torrentsSignal.value = [...torrentsSignal.value, t,];
    }
  },);

  clientSignal.value = wt;
  dbg("initClient: client created and stored",);

  // Periodic UI tick
  setInterval(() => {
    tickSignal.value += 1;
  }, 1000,);

  // Resume torrents from DB
  try {
    const saved = await torrentsDb.values<{ magnetURI: string }>();
    dbg(`initClient: found ${saved.length} torrents in DB`,);
    for (const item of saved) {
      dbg(`initClient: resuming torrent ${item.magnetURI}`,);
      if (engineSignal.value === "browsertorrent") {
        // deno-lint-ignore no-explicit-any
        wt.add(item.magnetURI,).catch((err: any) => {
          dbg(`initClient: error resuming torrent:`, err,);
        },);
      } else {
        wt.add(item.magnetURI);
      }
    }
  } catch (err) {
    dbg("initClient: error loading torrents from DB", err,);
  }

  return wt;
}

export async function seedFile(file: File,): Promise<void> {
  errorSignal.value = null;
  modeSignal.value = "idle";
  dbg("seedFile: starting, file:", file.name, "size:", file.size,);

  const wt = await initClient();
  dbg(
    "seedFile: client ready, server:",
    serverSignal.value ? "exists" : "NULL",
  );

  let server = serverSignal.value;

  if (engineSignal.value === "browsertorrent") {
    if (!server) {
      dbg("seedFile: creating server...",);
      server = wt.createServer({ scope: "/", },);
      dbg("seedFile: server created, calling sendReadyAck...",);
      await server.sendReadyAck();
      dbg("seedFile: server ready, storing in serverSignal",);
      serverSignal.value = server;
    } else {
      dbg("seedFile: reusing existing server",);
    }
  }

  try {
    dbg("seedFile: calling wt.seed() with trackers:", PUBLIC_TRACKERS,);
    const torrent = await wt.seed(file, {
      name: file.name,
      announce: PUBLIC_TRACKERS,
    },);
    dbg("seedFile: wt.seed() returned",);
    dbg(
      "  torrent.infoHash:",
      torrent.infoHash,
      "(length:",
      torrent.infoHash?.length ?? "undefined",
      ")",
    );
    dbg("  torrent.name:", torrent.name,);
    dbg("  torrent.magnetURI:", torrent.magnetURI,);
    dbg("  torrent.files.length:", torrent.files?.length,);
    dbg("  torrent.announce:", torrent.announce,);

    torrentSignal.value = torrent;
    modeSignal.value = "seeding";
    dbg("seedFile: torrentSignal.value set, mode = seeding",);

    // Save to DB
    torrentsDb.set(torrent.infoHash, {
      name: torrent.name,
      magnetURI: torrent.magnetURI,
      addedAt: Date.now(),
    },).catch(console.warn,);

    // ── Torrent lifecycle events ──────────────────────────────────────────────

    torrent.on("infoHash", () => {
      dbg("EVENT: infoHash ready:", torrent.infoHash,);
    },);

    torrent.on("metadata", () => {
      dbg("EVENT: metadata ready, infoHash:", torrent.infoHash,);
      dbg("  torrent.name:", torrent.name,);
      dbg(
        "  torrent.files:",
        torrent.files?.map((f: { name: string },) => f.name),
      );
    },);

    const onReady = () => {
      dbg("EVENT: torrent ready!",);
      dbg("  infoHash:", torrent.infoHash,);
      dbg("  name:", torrent.name,);
      dbg("  files:", torrent.files?.length,);
      dbg("  server:", serverSignal.value ? "available" : "NULL",);

      if (engineSignal.value === "webtorrent") {
        // deno-lint-ignore no-explicit-any
        torrent.files.forEach((file: any, idx: number) => {
          const compatibleFile = {
            name: file.name,
            length: file.length,
            createReadStream(opts?: { start?: number; end?: number }) {
              const nodeStream = file.createReadStream(opts);
              return nodeStreamToWebStream(nodeStream);
            }
          };
          // deno-lint-ignore no-explicit-any
          streamManager.register(torrent.infoHash, idx, compatibleFile as any);
        });
        dbg("Original WebTorrent files registered in streamManager manually.");
      }
    };

    torrent.on("ready", onReady);
    if (torrent.ready) {
      onReady();
    }

    // deno-lint-ignore no-explicit-any
    torrent.on("error", (e: any) => {
      const msg = e?.detail?.message ?? e?.message ?? String(e,);
      dbg("EVENT: torrent error:", msg,);
    },);

    // deno-lint-ignore no-explicit-any
    torrent.on("wire", (e: any) => {
      const wire = e?.detail?.wire ?? e;
      const addr = e?.detail?.addr ?? wire?.remoteAddress ?? "unknown";
      dbg("EVENT: wire/peer CONNECTED from:", addr,);
      const wires = torrent.wires || [];
      dbg("  total peers:", wires.length,);
      peersSignal.value = wires;
      wire.on("close", () => {
        dbg("EVENT: wire/peer disconnected from:", addr,);
        peersSignal.value = torrent.wires || [];
      },);
      wire.on("handshake", () => {
        dbg("EVENT: wire handshake complete with:", addr,);
      },);
    },);

    // deno-lint-ignore no-explicit-any
    torrent.on("warning", (e: any) => {
      const msg = e?.detail?.message ?? e?.message ?? String(e,);
      dbg("EVENT: warning:", msg,);
    },);

    // Log swarm state periodically for debugging
    const swarmInterval = setInterval(() => {
      const swarm = torrent.swarm;
      if (swarm) {
        const peers = swarm.peers ? [...swarm.peers.keys(),] : (torrent.wires || []);
        dbg(
          "SWARM STATUS: peers:",
          peers.length,
          "infoHash:",
          torrent.infoHash,
        );
        if (peers.length > 0) {
          // deno-lint-ignore no-explicit-any
          dbg("  peer addrs:", peers.map((p: any) => p.remoteAddress || p),);
        }
      }
    }, 5000,);

    dbg("seedFile: all event listeners attached",);
    dbg("SEEDER READY — infoHash:", torrent.infoHash,);
    dbg("  Trackers configured:", torrent.announce?.length ?? 0,);
    dbg("  Swarm listening — waiting for peers to connect...",);

    // Log tracker connection attempts via client events
    wt.on("trackerAnnounce", (...args: unknown[]) => {
      const tracker = args[1] as string;
      dbg("EVENT: client trackerAnnounce to:", tracker,);
    },);
    wt.on("trackerWarning", (...args: unknown[]) => {
      const tracker = args[1] as string;
      dbg("EVENT: client trackerWarning from:", tracker,);
    },);
    wt.on("trackerError", (...args: unknown[]) => {
      // deno-lint-ignore no-explicit-any
      const e = args[0] as any;
      const msg = e?.detail?.message ?? e?.message ?? String(e,);
      dbg("EVENT: client trackerError:", msg,);
    },);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e,);
    dbg("seedFile: ERROR:", msg,);
    errorSignal.value = msg;
    throw e;
  }
}

export async function addTorrent(torrentId: string,): Promise<void> {
  errorSignal.value = null;
  modeSignal.value = "idle";
  dbg("addTorrent: starting, torrentId:", torrentId,);

  const wt = await initClient();
  dbg(
    "addTorrent: client ready, server:",
    serverSignal.value ? "exists" : "NULL",
  );

  let server = serverSignal.value;

  if (engineSignal.value === "browsertorrent") {
    if (!server) {
      dbg("addTorrent: creating server...",);
      server = wt.createServer({ scope: "/", },);
      dbg("addTorrent: server created, calling sendReadyAck...",);
      await server.sendReadyAck();
      dbg("addTorrent: server ready, storing in serverSignal",);
      serverSignal.value = server;
    } else {
      dbg("addTorrent: reusing existing server",);
    }
  }

  try {
    dbg("addTorrent: calling wt.add('" + torrentId + "')",);
    const torrent = await wt.add(torrentId,);
    dbg("addTorrent: wt.add() returned",);
    dbg(
      "  torrent.infoHash:",
      torrent.infoHash,
      "(length:",
      torrent.infoHash?.length ?? "undefined",
      ")",
    );
    dbg("  torrent.name:", torrent.name,);
    dbg("  torrent.magnetURI:", torrent.magnetURI,);
    dbg("  torrent.files.length:", torrent.files?.length,);

    torrentSignal.value = torrent;
    modeSignal.value = "leeching";
    dbg("addTorrent: torrentSignal.value set, mode = leeching",);

    // Save to DB
    torrentsDb.set(torrent.infoHash, {
      name: torrent.name,
      magnetURI: torrent.magnetURI,
      addedAt: Date.now(),
    },).catch(console.warn,);

    // ── Torrent lifecycle events ──────────────────────────────────────────────

    torrent.on("infoHash", () => {
      dbg("EVENT: infoHash ready:", torrent.infoHash,);
    },);

    torrent.on("metadata", () => {
      dbg("EVENT: metadata ready, infoHash:", torrent.infoHash,);
      dbg("  torrent.name:", torrent.name,);
      dbg(
        "  torrent.files:",
        torrent.files?.map((f: { name: string },) => f.name),
      );
    },);

    const onReady = () => {
      dbg("EVENT: torrent ready!",);
      dbg("  infoHash:", torrent.infoHash,);
      dbg("  name:", torrent.name,);
      dbg("  files:", torrent.files?.length,);
      dbg("  server:", serverSignal.value ? "available" : "NULL",);

      if (engineSignal.value === "webtorrent") {
        // deno-lint-ignore no-explicit-any
        torrent.files.forEach((file: any, idx: number) => {
          const compatibleFile = {
            name: file.name,
            length: file.length,
            createReadStream(opts?: { start?: number; end?: number }) {
              const nodeStream = file.createReadStream(opts);
              return nodeStreamToWebStream(nodeStream);
            }
          };
          // deno-lint-ignore no-explicit-any
          streamManager.register(torrent.infoHash, idx, compatibleFile as any);
        });
        dbg("Original WebTorrent files registered in streamManager manually.");
      }
    };

    torrent.on("ready", onReady);
    if (torrent.ready) {
      onReady();
    }

    // deno-lint-ignore no-explicit-any
    torrent.on("error", (e: any) => {
      const msg = e?.detail?.message ?? e?.message ?? String(e,);
      dbg("EVENT: torrent error:", msg,);
    },);

    // deno-lint-ignore no-explicit-any
    torrent.on("wire", (e: any) => {
      const wire = e?.detail?.wire ?? e;
      const addr = e?.detail?.addr ?? wire?.remoteAddress ?? "unknown";
      dbg("EVENT: wire/peer connected from:", addr,);
      const wires = torrent.wires || [];
      dbg("  total peers:", wires.length,);
      peersSignal.value = wires;
      wire.on("close", () => {
        dbg("EVENT: wire/peer disconnected from:", addr,);
        peersSignal.value = torrent.wires || [];
      },);
    },);

    // deno-lint-ignore no-explicit-any
    torrent.on("warning", (e: any) => {
      const msg = e?.detail?.message ?? e?.message ?? String(e,);
      dbg("EVENT: warning:", msg,);
    },);

    // deno-lint-ignore no-explicit-any
    torrent.on("download", (e: any) => {
      const bytesNum = typeof e === "number" ? e : (e?.detail?.bytes ?? 0);
      dbg(
        "EVENT: download:",
        bytesNum,
        "bytes, progress:",
        Math.round(torrent.progress * 100,) + "%",
      );
    },);

    torrent.on("done", () => {
      dbg("EVENT: torrent download complete!",);
    },);

    dbg("addTorrent: all event listeners attached",);
    dbg("LEECHER READY — infoHash:", torrent.infoHash,);
    dbg(
      "  Downloading from peers — progress:",
      Math.round(torrent.progress * 100,) + "%",
    );

    // Log swarm state periodically for debugging
    const swarmInterval = setInterval(() => {
      const swarm = torrent.swarm;
      if (swarm) {
        const peers = swarm.peers ? [...swarm.peers.keys(),] : (torrent.wires || []);
        dbg(
          "SWARM STATUS: peers:",
          peers.length,
          "infoHash:",
          torrent.infoHash,
        );
        dbg("  downloaded:", torrent.downloaded, "of", torrent.length,);
        if (peers.length > 0) {
          // deno-lint-ignore no-explicit-any
          dbg("  peer addrs:", peers.map((p: any) => p.remoteAddress || p),);
        }
      }
    }, 5000,);

    // Log tracker connection attempts via client events
    wt.on("trackerAnnounce", (...args: unknown[]) => {
      const tracker = args[1] as string;
      dbg("EVENT: client trackerAnnounce to:", tracker,);
    },);
    wt.on("trackerWarning", (...args: unknown[]) => {
      const tracker = args[1] as string;
      dbg("EVENT: client trackerWarning from:", tracker,);
    },);
    wt.on("trackerError", (...args: unknown[]) => {
      // deno-lint-ignore no-explicit-any
      const e = args[0] as any;
      const msg = e?.detail?.message ?? e?.message ?? String(e,);
      dbg("EVENT: client trackerError:", msg,);
    },);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e,);
    dbg("addTorrent: ERROR:", msg,);
    errorSignal.value = msg;
    throw e;
  }
}

export async function removeTorrent(infoHash: string,): Promise<void> {
  dbg("removeTorrent: starting, infoHash:", infoHash,);
  const wt = clientSignal.value;
  if (wt) {
    const torrent = await wt.get(infoHash,);
    if (torrent) {
      dbg("removeTorrent: destroying torrent object",);
      torrent.destroy();
    }
  }
  torrentsSignal.value = torrentsSignal.value.filter((t,) =>
    t.infoHash !== infoHash
  );
  if (torrentSignal.value?.infoHash === infoHash) {
    torrentSignal.value = null;
    modeSignal.value = "idle";
  }
  await torrentsDb.delete(infoHash,);
  if (engineSignal.value === "webtorrent") {
    streamManager.unregisterTorrent(infoHash);
  }
  dbg("removeTorrent: done",);
}

export function cleanup(): void {
  dbg("cleanup: starting...",);
  const server = serverSignal.value;
  if (server) {
    dbg("cleanup: destroying server",);
    server.destroy();
    serverSignal.value = null;
  }
  const client = clientSignal.value;
  if (client) {
    dbg("cleanup: destroying client",);
    client.destroy();
    clientSignal.value = null;
  }
  torrentSignal.value = null;
  peersSignal.value = [];
  modeSignal.value = "idle";
  downSpeedSignal.value = 0;
  upSpeedSignal.value = 0;
  errorSignal.value = null;
  streamManager.clear();
  dbg("cleanup: done",);
}

// ─── Context provider ────────────────────────────────────────────────────────

export const TorrentContext = createContext({},);

export function TorrentProvider(
  { children, }: { children: ComponentChildren },
) {
  return (
    <TorrentContext.Provider value={{}}>
      {children}
    </TorrentContext.Provider>
  );
}
