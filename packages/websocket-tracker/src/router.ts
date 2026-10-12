/**
 * @module router
 *
 * # @vanaware/browsertorrent-tracker/router
 *
 * HTTP and WebSocket request router for the BitTorrent tracker server.
 * Dispatches upgrade requests to WebSocket handlers and query requests to HTTP announce/scrape handlers.
 */

/**
 * Interface that tracker backends must implement to be mounted on {@link TrackerRouter}.
 */
export interface ITracker {
  /**
   * Handles an HTTP GET announce request.
   *
   * @param url - Parsed request URL containing search parameters.
   * @param req - The raw HTTP request object.
   * @returns HTTP Response with bencoded or JSON announce data.
   */
  handleHttpAnnounce(url: URL, req: Request): Response | Promise<Response>;

  /**
   * Handles an HTTP GET scrape request.
   *
   * @param url - Parsed request URL containing search parameters.
   * @param req - The raw HTTP request object.
   * @returns HTTP Response with scrape metrics.
   */
  handleHttpScrape(url: URL, req: Request): Response | Promise<Response>;

  /**
   * Attaches an upgraded WebSocket connection to the tracker's peer pool.
   *
   * @param ws - Open WebSocket instance.
   */
  handleConnection(ws: WebSocket): void;
}

/**
 * HTTP request router for the tracker server.
 * Handles WebSocket upgrades at the root path and routes `/announce` and `/scrape` HTTP queries.
 *
 * @example
 * ```ts
 * import { TrackerRouter, WebSocketTracker } from "jsr:@vanaware/browsertorrent-tracker";
 *
 * const tracker = new WebSocketTracker(8000);
 * const router = new TrackerRouter(tracker);
 *
 * Deno.serve({ port: 8000 }, (req) => router.handleRequest(req));
 * ```
 */
export class TrackerRouter {
  private tracker: ITracker;

  /**
   * Constructs a new TrackerRouter instance.
   *
   * @param tracker - Tracker backend implementing {@link ITracker}.
   */
  constructor(tracker: ITracker) {
    this.tracker = tracker;
  }

  /**
   * Dispatches incoming HTTP requests to either WebSocket upgrade or HTTP endpoints.
   *
   * @param req - Incoming HTTP Request.
   * @returns An HTTP Response or WebSocket upgrade response.
   */
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
      return await this.tracker.handleHttpAnnounce(url, req);
    }
    if (url.pathname === "/scrape") {
      return await this.tracker.handleHttpScrape(url, req);
    }

    return new Response("Not Found", { status: 404 });
  }
}
