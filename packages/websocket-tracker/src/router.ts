/**
 * Router for WebSocket tracker server.
 * Handles routing between WebSocket and HTTP tracker endpoints.
 */

import { WebSocketTracker, } from "./server.ts";

export interface ITracker {
  handleHttpAnnounce(url: URL, req: Request,): Response | Promise<Response>;
  handleHttpScrape(url: URL, req: Request,): Response | Promise<Response>;
  handleConnection(ws: WebSocket,): void;
}

export class TrackerRouter {
  private tracker: ITracker;

  constructor(tracker: ITracker,) {
    this.tracker = tracker;
  }

  async handleRequest(req: Request,): Promise<Response> {
    const url = new URL(req.url,);

    // WebSocket upgrade
    if (req.headers.get("upgrade",) === "websocket") {
      const { socket, response, } = Deno.upgradeWebSocket(req,);
      this.tracker.handleConnection(socket,);
      return response;
    }

    // HTTP tracker endpoints
    if (url.pathname === "/announce") {
      return await this.tracker.handleHttpAnnounce(url, req,);
    }
    if (url.pathname === "/scrape") {
      return await this.tracker.handleHttpScrape(url, req,);
    }

    return new Response("Not Found", { status: 404, },);
  }
}
