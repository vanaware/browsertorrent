/**
 * Router for WebSocket tracker server.
 * Handles routing between WebSocket and HTTP tracker endpoints.
 */

import { WebSocketTracker } from "./server.ts";

export class TrackerRouter {
  private tracker: WebSocketTracker;

  constructor(tracker: WebSocketTracker) {
    this.tracker = tracker;
  }

  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      this.tracker.handleConnection(socket);
      return response;
    }

    // HTTP tracker endpoints
    if (url.pathname === "/announce") {
      return this.tracker.handleHttpAnnounce(url, req);
    }
    if (url.pathname === "/scrape") {
      return this.tracker.handleHttpScrape(url, req);
    }

    return new Response("Not Found", { status: 404 });
  }
}