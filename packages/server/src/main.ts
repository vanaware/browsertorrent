/// <reference lib="deno.ns" />
import { serveDir } from "@std/http/file-server";
import { WebSocketTracker } from "../../websocket-tracker/src/server.ts";

const port = Number(Deno.env.get("PORT") ?? 3000);

// Initialize a local tracker instance sharing the main port
const tracker = new WebSocketTracker(port);

const __dirname = new URL(".", import.meta.url).pathname;
const fsRoot = Deno.env.get("FS_ROOT") ?? new URL("../build/dist", import.meta.url).pathname;

Deno.serve({ port }, async (req) => {
  try {
    const url = new URL(req.url);
    
    // Route websocket traffic to the tracker
    if (req.headers.get("upgrade") === "websocket") {
       const { socket, response } = Deno.upgradeWebSocket(req);
       tracker.handleConnection(socket);
       return response;
    }

    const staticResponse = await serveDir(req, {
      fsRoot,
      showDirListing: false,
      quiet: true,
    });
    return staticResponse;
  } catch (err) {
    console.warn(
      `[STATIC] Falha ao servir arquivo estático. Build ainda não foi executado?`,
      err instanceof Error ? err.message : err,
    );
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
});
