import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFeedsAll, handleFeedsProvider, handleSitemap, handleRobots } from "../workerContent";
import type { D1Database } from "@cloudflare/workers-types";
import { PROVIDERS } from "../../shared/statusFeeds";

function createMockDb(): D1Database {
  let incidents = [
    {
      id: "inc1",
      provider_id: "openai",
      name: "API Outage",
      impact: "critical",
      status: "resolved",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T02:00:00Z",
      resolved_at: "2024-01-01T02:00:00Z",
      updates: JSON.stringify([{ body: "Issue resolved", status: "resolved", updatedAt: "2024-01-01T02:00:00Z" }])
    },
    {
      id: "inc2",
      provider_id: "anthropic",
      name: "Elevated Error Rates & Latency",
      impact: "minor",
      status: "investigating",
      created_at: "2024-01-02T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      updates: JSON.stringify([])
    }
  ];
  
  return {
    prepare: vi.fn((query: string) => {
      return {
        bind: vi.fn((...args: any[]) => {
          return {
            all: vi.fn(async () => {
              if (query.includes("WHERE provider_id = ?")) {
                const results = incidents.filter(i => i.provider_id === args[0]);
                return { results, success: true };
              }
              return { results: incidents, success: true };
            }),
          };
        }),
        all: vi.fn(async () => {
          return { results: incidents, success: true };
        }),
      } as any;
    }),
  } as unknown as D1Database;
}

describe("Worker Content Routes (Phase 8)", () => {
  let dbBinding: D1Database;
  let mockEnv: any;
  let mockRequest: any;

  beforeEach(() => {
    dbBinding = createMockDb();
    mockEnv = { DB: dbBinding, BASE_URL: "https://mestri.dev" };
    mockRequest = { url: "https://mestri.dev/api/feeds/all.xml" } as Request;
  });

  describe("handleFeedsAll", () => {
    it("should generate valid RSS XML for all incidents", async () => {
      const res = await handleFeedsAll(mockRequest, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
      
      const xml = await res.text();
      expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
      expect(xml).toContain("<rss version=\"2.0\">");
      expect(xml).toContain("<title>mestri — all incidents</title>");
      expect(xml).toContain("OpenAI — API Outage"); // Should map 'openai' to 'OpenAI'
      expect(xml).toContain("Anthropic — Elevated Error Rates &amp; Latency"); // Escaping &
      expect(xml).toContain("<link>https://mestri.dev/i/inc1</link>");
      expect(xml).toContain("<guid isPermaLink=\"false\">inc1</guid>");
    });
  });

  describe("handleFeedsProvider", () => {
    it("should generate valid RSS XML for a specific provider", async () => {
      const res = await handleFeedsProvider(mockRequest, mockEnv, "openai");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
      
      const xml = await res.text();
      expect(xml).toContain("<title>mestri — OpenAI incidents</title>");
      expect(xml).toContain("OpenAI — API Outage");
      expect(xml).not.toContain("Anthropic"); // Should not expose unrelated providers
    });
    
    it("should handle unknown providers gracefully", async () => {
      const res = await handleFeedsProvider(mockRequest, mockEnv, "unknown-provider");
      expect(res.status).toBe(200);
      
      const xml = await res.text();
      expect(xml).toContain("<title>mestri — unknown-provider incidents</title>");
      // Empty feed
      expect(xml).not.toContain("<item>");
    });
  });

  describe("handleSitemap", () => {
    it("should generate valid sitemap XML including static and incident routes", async () => {
      const res = await handleSitemap(mockRequest, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
      
      const xml = await res.text();
      expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
      expect(xml).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
      // Static routes
      expect(xml).toContain("<loc>https://mestri.dev/</loc>");
      expect(xml).toContain("<loc>https://mestri.dev/changelog</loc>");
      // Incident routes
      expect(xml).toContain("<loc>https://mestri.dev/i/inc1</loc>");
      expect(xml).toContain("<lastmod>2024-01-01T02:00:00.000Z</lastmod>");
      expect(xml).toContain("<loc>https://mestri.dev/i/inc2</loc>");
    });

    it("should bound incident URLs to maximum limit", async () => {
      // Temporarily mock db to return 6000 incidents
      const largeIncidents = Array.from({ length: 6000 }, (_, i) => ({
        id: `inc${i}`,
        provider_id: "openai",
        name: "Test",
        impact: "minor",
        status: "resolved",
        created_at: "2024-01-01T02:00:00Z",
        updated_at: "2024-01-01T02:00:00Z",
        resolved_at: "2024-01-01T02:00:00Z",
        updates: "[]"
      }));
      
      const originalDbBinding = dbBinding;
      dbBinding = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn(async () => ({ results: largeIncidents, success: true }))
          })),
          all: vi.fn(async () => ({ results: largeIncidents, success: true }))
        }))
      } as any;
      mockEnv.DB = dbBinding;

      const res = await handleSitemap(mockRequest, mockEnv);
      const xml = await res.text();
      
      const locMatches = xml.match(/<loc>.*?\/i\/inc/g) || [];
      expect(locMatches.length).toBe(5000); // Bounded to 5000
      
      dbBinding = originalDbBinding; // Restore
      mockEnv.DB = dbBinding;
    });
  });

  describe("handleRobots", () => {
    it("should generate exact robots.txt string", async () => {
      const res = await handleRobots(mockRequest, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      
      const text = await res.text();
      expect(text).toBe("User-agent: *\nAllow: /\nSitemap: https://mestri.dev/sitemap.xml\n");
    });
  });
});
