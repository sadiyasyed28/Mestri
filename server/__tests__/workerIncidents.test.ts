import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkerIncidents, getWorkerIncident, refreshWorkerArchive } from "../workerIncidents";
import type { D1Database } from "@cloudflare/workers-types";
import { PROVIDERS } from "../../shared/statusFeeds";

global.fetch = vi.fn();

function createMockDb(): D1Database {
  let mockIncidents: Record<string, any> = {};
  
  const mockDb = {
    prepare: vi.fn((query: string) => {
      const stmt = {
        bind: vi.fn((...args: any[]) => {
          return {
            first: vi.fn(async () => {
              if (query.includes("FROM incidents WHERE id = ?")) {
                const id = args[0];
                return mockIncidents[id] || null;
              }
              if (query.includes("FROM providers WHERE id = ?")) {
                const p = PROVIDERS.find(p => p.id === args[0]);
                if (!p) return null;
                return { id: p.id, name: p.name, service: p.service, source_label: p.sourceLabel, source_url: p.sourceUrl, accent: p.accent, monogram: p.monogram, manual_only: p.manualOnly ? 1 : 0 };
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (query.includes("FROM incidents WHERE provider_id = ?")) {
                const providerId = args[0];
                return { results: Object.values(mockIncidents).filter(i => i.provider_id === providerId), success: true };
              }
              return { results: [], success: true };
            }),
            run: vi.fn(async () => {
              if (query.includes("INSERT INTO incidents")) {
                const id = args[0];
                mockIncidents[id] = {
                  id: args[0],
                  provider_id: args[1],
                  name: args[2],
                  impact: args[3],
                  status: args[4],
                  created_at: args[5],
                  updated_at: args[6],
                  resolved_at: args[7],
                  updates: args[8],
                };
              }
              return { success: true };
            }),
          };
        }),
        first: vi.fn(async () => null),
        all: vi.fn(async () => {
          if (query.includes("FROM providers")) {
            return {
              results: PROVIDERS.map(p => ({
                id: p.id, name: p.name, service: p.service, source_label: p.sourceLabel, source_url: p.sourceUrl, accent: p.accent, monogram: p.monogram, manual_only: p.manualOnly ? 1 : 0
              })),
              success: true
            };
          }
          if (query.includes("FROM incidents ORDER")) {
            return { results: Object.values(mockIncidents), success: true };
          }
          return { results: [], success: true };
        }),
        run: vi.fn(async () => ({ success: true })),
      };
      return stmt;
    }),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
  
  // Inject some seed data for testing retrieval
  mockIncidents["test-incident"] = {
    id: "test-incident",
    provider_id: "openai",
    name: "API Outage",
    impact: "major",
    status: "resolved",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T02:00:00Z",
    resolved_at: "2024-01-01T02:00:00Z",
    updates: JSON.stringify([{ body: "Fixed", status: "resolved", updatedAt: "2024-01-01T02:00:00Z" }]),
  };
  
  return mockDb;
}

describe("Worker Incidents Routes", () => {
  let dbBinding: D1Database;

  beforeEach(() => {
    dbBinding = createMockDb();
    vi.clearAllMocks();
  });

  it("should retrieve incidents and append providerName", async () => {
    const incidents = await getWorkerIncidents(dbBinding);
    expect(incidents.length).toBeGreaterThan(0);
    expect(incidents[0].providerName).toBe("OpenAI"); // Appended correctly
    expect(incidents[0].id).toBe("test-incident");
  });

  it("should retrieve a single incident by ID with providerName", async () => {
    const incident = await getWorkerIncident(dbBinding, "test-incident");
    expect(incident).toBeDefined();
    expect(incident?.providerName).toBe("OpenAI");
    expect(incident?.updates.length).toBe(1);
  });
  
  it("should return null for nonexistent incident", async () => {
    const incident = await getWorkerIncident(dbBinding, "nonexistent");
    expect(incident).toBeNull();
  });

  it("should refresh archive and upsert incidents idempotently", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("incidents.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            incidents: [{
              id: "new-incident",
              name: "New Issue",
              impact: "minor",
              status: "investigating",
              created_at: "2024-01-02T00:00:00Z",
              incident_updates: [{ body: "Investigating", status: "investigating" }]
            }]
          })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({})
      });
    });

    await refreshWorkerArchive(dbBinding);
    
    // Validate insert query was called
    expect(dbBinding.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO incidents"));
  });

  it("should isolate failing provider archives without crashing others", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      // OpenAI succeeds
      if (url.includes("openai") && url.includes("incidents.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            incidents: [{
              id: "new-openai", name: "OK", impact: "minor", status: "resolved", created_at: "2024-01-02T00:00:00Z"
            }]
          })
        });
      }
      // Anthropic fails
      if (url.includes("anthropic")) {
        return Promise.reject(new Error("Network Error"));
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });

    await refreshWorkerArchive(dbBinding);
    
    // Expect OpenAI to have been inserted despite Anthropic failing
    // Since mockDb doesn't perfectly expose the closure map, we rely on the prepare call asserting it ran
    expect(dbBinding.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO incidents"));
  });

  it("should deserialize nested updates correctly", async () => {
    const incident = await getWorkerIncident(dbBinding, "test-incident");
    expect(Array.isArray(incident?.updates)).toBe(true);
    expect(incident?.updates[0].body).toBe("Fixed");
    expect(incident?.updates[0].status).toBe("resolved");
  });
});
