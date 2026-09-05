import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../worker";
import type { D1Database, Fetcher } from "@cloudflare/workers-types";

function createMockDb(): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [], success: true })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true })),
      })),
      all: vi.fn(async () => ({ results: [], success: true })),
      run: vi.fn(async () => ({ success: true })),
    })),
  } as unknown as D1Database;
}

function createMockAssets(): Fetcher {
  return {
    fetch: vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? new URL(request) : new URL(request.url);
      
      if (url.pathname === "/index.html") {
        return new Response("<html>SPA Entry</html>", { status: 200, headers: { "Content-Type": "text/html" } });
      }
      
      if (url.pathname === "/assets/index.js") {
        return new Response("console.log('hi');", { status: 200, headers: { "Content-Type": "application/javascript" } });
      }
      
      return new Response("Not found", { status: 404 });
    })
  } as unknown as Fetcher;
}

describe("Worker Routing (Phase 9)", () => {
  let mockEnv: any;
  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => "" });
    mockEnv = { 
      DB: createMockDb(),
      ASSETS: createMockAssets(),
    };
  });

  describe("API Routing Priority", () => {
    it("should route /api/status to the API handler", async () => {
      const req = new Request("https://mestri.dev/api/status");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      if (res.status === 500) {
        console.error("API Error Response:", await res.clone().text());
      }
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });
    
    it("should route /api/incidents to the API handler", async () => {
      const req = new Request("https://mestri.dev/api/incidents");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
    });

    it("should route /api/incidents/:id to the API handler", async () => {
      const req = new Request("https://mestri.dev/api/incidents/inc123");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      // Returns 404 from the incident mock since it wasn't found in mock DB, which is a valid API response
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });

    it("should route /api/feeds/all.xml to the RSS handler", async () => {
      const req = new Request("https://mestri.dev/api/feeds/all.xml");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
    });

    it("should route /sitemap.xml to the sitemap handler", async () => {
      const req = new Request("https://mestri.dev/sitemap.xml");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/xml");
    });

    it("should route /robots.txt to the robots handler", async () => {
      const req = new Request("https://mestri.dev/robots.txt");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
    });

    it("should return API 404 for unknown /api/* endpoints, NOT index.html", async () => {
      const req = new Request("https://mestri.dev/api/does-not-exist");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      
      const body = await res.json();
      expect(body).toEqual({ error: "Not found" });
    });
  });

  describe("Embed Routing", () => {
    it("should route /embed/:providerId and return HTML", async () => {
      const req = new Request("https://mestri.dev/embed/openai");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const text = await res.text();
      expect(text).toContain("mestri embed");
    });
  });

  describe("Static Assets and SPA Fallback", () => {
    it("should route GET / to SPA fallback (index.html)", async () => {
      const req = new Request("https://mestri.dev/");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const text = await res.text();
      expect(text).toBe("<html>SPA Entry</html>");
    });

    it("should route GET /changelog to SPA fallback", async () => {
      const req = new Request("https://mestri.dev/changelog");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("<html>SPA Entry</html>");
    });

    it("should route GET /i/:incidentId to SPA fallback", async () => {
      const req = new Request("https://mestri.dev/i/incident123");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("<html>SPA Entry</html>");
    });

    it("should return static assets successfully", async () => {
      const req = new Request("https://mestri.dev/assets/index.js");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/javascript");
    });

    it("should return 404 for missing static assets (has extension), NOT index.html", async () => {
      const req = new Request("https://mestri.dev/assets/missing.css");
      const res = await worker.fetch(req as any, mockEnv, mockCtx as any);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).not.toContain("<html>SPA Entry</html>");
    });
  });
});
