import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkerStatus, clearWorkerCacheForTesting } from "../workerStatus";
import type { D1Database } from "@cloudflare/workers-types";
import { PROVIDERS } from "../../shared/statusFeeds";

// Mock fetch to simulate provider APIs
global.fetch = vi.fn();

function createMockDb(): D1Database {
  let mockState: Record<string, any> = {};
  let mockSnapshots: any[] = [];
  
  const mockDb = {
    prepare: vi.fn((query: string) => {
      const stmt = {
        bind: vi.fn((...args: any[]) => {
          return {
            first: vi.fn(async () => {
              if (query.includes("FROM status_snapshots")) {
                const id = args[0];
                const matching = mockSnapshots.filter(s => s.provider_id === id).sort((a, b) => b.id - a.id);
                return matching[0] || null;
              }
              if (query.includes("FROM provider_state")) {
                const id = args[0];
                return mockState[id] || null;
              }
              return null;
            }),
            all: vi.fn(async () => ({ results: [], success: true })),
            run: vi.fn(async () => {
              if (query.includes("INSERT INTO provider_state")) {
                mockState[args[0]] = {
                  provider_id: args[0],
                  status: args[1],
                  message: args[2],
                  updated_at: new Date().toISOString()
                };
              }
              if (query.includes("INSERT INTO status_snapshots")) {
                mockSnapshots.push({
                  id: mockSnapshots.length + 1,
                  provider_id: args[0],
                  status: args[1],
                  message: args[2],
                  timestamp: args[3],
                  history: args[4],
                  created_at: new Date().toISOString()
                });
              }
              return { success: true };
            }),
          };
        }),
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [], success: true })),
        run: vi.fn(async () => ({ success: true })),
      };
      return stmt;
    }),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
  return mockDb;
}

describe("Worker Status Route", () => {
  let dbBinding: D1Database;

  beforeEach(() => {
    dbBinding = createMockDb();
    clearWorkerCacheForTesting();
    vi.clearAllMocks();
  });

  it("should fetch upstream status, persist state, and map response contract correctly", async () => {
    // Mock OpenAI (first provider in the list) successful response
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("status.openai.com/api/v2/summary.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            page: { updated_at: "2024-01-01T00:00:00Z" },
            status: { indicator: "none", description: "All Systems Operational" },
            components: []
          })
        });
      }
      if (url.includes("incidents.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ incidents: [] })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({})
      });
    });

    const statuses = await getWorkerStatus(dbBinding);
    
    // Check OpenAI response contract
    const openai = statuses["openai"];
    expect(openai).toBeDefined();
    expect(openai.status).toBe("operational");
    expect(openai.message).toBe("All Systems Operational");
    expect(openai.sourceAvailable).toBe(true);
    expect(openai.history.length).toBe(30);

    // Verify D1 persistence
    // Because the mocked `db.prepare` isn't fully accessible from here easily,
    // we would check if D1 queries were made. The mockDb.prepare should have been called
    // for upserting state and snapshots for OpenAI.
    expect(dbBinding.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO provider_state"));
    expect(dbBinding.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO status_snapshots"));
  });

  it("should preserve provider failures without corrupting state", async () => {
    // Mock failure for all providers
    (global.fetch as any).mockImplementation(() => Promise.reject(new Error("Network Error")));
    
    const statuses = await getWorkerStatus(dbBinding);
    
    // OpenAI should fall back to manual snapshot
    const openai = statuses["openai"];
    expect(openai).toBeDefined();
    expect(openai.status).toBe("manual");
    expect(openai.message).toBe("Upstream feed unreachable.");
    
    // Google is manual-only, should also be manual
    // Google is manual-only, should also be manual
    const google = statuses["google"];
    expect(google).toBeDefined();
    expect(google.status).toBe("manual");
  });

  it("should isolate failing providers without stopping successful ones", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      // openai succeeds
      if (url.includes("openai")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            page: { updated_at: "2024-01-01T00:00:00Z" },
            status: { indicator: "none", description: "OK" }
          })
        });
      }
      // anthropic fails
      if (url.includes("anthropic")) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    });

    const statuses = await getWorkerStatus(dbBinding);

    expect(statuses["openai"].status).toBe("operational");
    expect(statuses["anthropic"].status).toBe("manual");
  });

  it("should handle malformed provider response safely", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("openai")) {
        // Missing "status" object
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ page: {} })
        });
      }
      return Promise.reject(new Error("Unexpected url"));
    });

    const statuses = await getWorkerStatus(dbBinding);
    
    // Fallbacks to manual on malformed JSON
    expect(statuses["openai"].status).toBe("manual");
    expect(statuses["openai"].message).toBe("Upstream feed unreachable.");
  });
});
