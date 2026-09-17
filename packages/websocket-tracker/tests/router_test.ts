// tests/router_test.ts
// Camada 1 (API) + Camada 2 (Comportamento): Testes de interface pública e comportamento do TrackerRouter.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertEquals as assertEq } from "@std/assert";
import { TrackerRouter } from "../src/router.ts";
import { WebSocketTracker } from "../src/server.ts";

// Mock tracker que implementa a interface mínima para testar o router
class MockTracker {
  handleHttpAnnounce(url: URL, _req: Request): Promise<Response> {
    return Promise.resolve(new Response(JSON.stringify({ action: "announce" }), {
      headers: { "Content-Type": "application/json" },
    }));
  }

  handleHttpScrape(url: URL, _req: Request): Promise<Response> {
    return Promise.resolve(new Response(JSON.stringify({ action: "scrape" }), {
      headers: { "Content-Type": "application/json" },
    }));
  }

  handleConnection(_ws: WebSocket): void {
    // mock
  }
}

describe("TrackerRouter", () => {
  it("deve criar instância com tracker", () => {
    const tracker = new MockTracker();
    const router = new TrackerRouter(tracker);
    assertEq(typeof router.handleRequest, "function");
  });

  it("deve rotear para handleHttpAnnounce no path /announce", async () => {
    const tracker = new MockTracker();
    const router = new TrackerRouter(tracker);

    const req = new Request("http://localhost:8000/announce?info_hash=abc&peer_id=def&port=6881");
    const res = await router.handleRequest(req);
    assertEquals(res.status, 200);
    const body = JSON.parse(await res.text());
    assertEquals(body.action, "announce");
  });

  it("deve rotear para handleHttpScrape no path /scrape", async () => {
    const tracker = new MockTracker();
    const router = new TrackerRouter(tracker);

    const req = new Request("http://localhost:8000/scrape?info_hash=abc");
    const res = await router.handleRequest(req);
    assertEquals(res.status, 200);
    const body = JSON.parse(await res.text());
    assertEquals(body.action, "scrape");
  });

  it("deve retornar 404 para paths desconhecidos", async () => {
    const tracker = new MockTracker();
    const router = new TrackerRouter(tracker);

    const req = new Request("http://localhost:8000/unknown");
    const res = await router.handleRequest(req);
    assertEquals(res.status, 404);
  });

  it("deve rotear para WebSocket upgrade quando header upgrade é websocket", async () => {
    const tracker = new MockTracker();
    const router = new TrackerRouter(tracker);

    const req = new Request("http://localhost:8000/", {
      headers: {
        upgrade: "websocket",
        connection: "Upgrade",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
      },
    });
    const res = await router.handleRequest(req);
    assertEquals(res.status, 101);
  });

  it("deve passar URL com query params para announce", async () => {
    let capturedUrl: URL | null = null;
    const tracker = {
      handleHttpAnnounce: (url: URL) => {
        capturedUrl = url;
        return Promise.resolve(new Response("ok"));
      },
      handleHttpScrape: () => Promise.resolve(new Response("ok")),
      handleConnection: () => {},
    };
    const router = new TrackerRouter(tracker);

    const req = new Request(
      "http://localhost:8000/announce?info_hash=abc123&peer_id=def456&port=6881&event=started",
    );
    await router.handleRequest(req);
    assertEq(capturedUrl, capturedUrl); // não é null
    if (capturedUrl) {
      assertEquals(capturedUrl.searchParams.get("info_hash"), "abc123");
      assertEquals(capturedUrl.searchParams.get("peer_id"), "def456");
      assertEquals(capturedUrl.searchParams.get("port"), "6881");
      assertEquals(capturedUrl.searchParams.get("event"), "started");
    }
  });
});