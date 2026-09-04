import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDb } from "../index";
import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";

// Helper to mock D1Database
function createMockDb(): D1Database {
  const mockDb = {
    prepare: vi.fn(),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
  return mockDb;
}

function createMockStmt(resultData: any = []) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(resultData[0] || null),
    all: vi.fn().mockResolvedValue({ results: resultData, success: true, meta: { duration: 1 } }),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1, duration: 1 } }),
    raw: vi.fn().mockResolvedValue(resultData),
  };
  return stmt;
}

describe("D1 Database Access Layer", () => {
  let mockDb: any;
  let dbLayer: ReturnType<typeof createDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    dbLayer = createDb(mockDb);
  });

  describe("Providers", () => {
    it("should get all providers and map correctly", async () => {
      const stmt = createMockStmt([{
        id: "test", name: "Test", service: "API", source_label: "test.com", source_url: "https://test.com",
        feed_url: null, incidents_url: null, accent: "#000", monogram: "T", manual_only: 1
      }]);
      mockDb.prepare.mockReturnValue(stmt);

      const providers = await dbLayer.getProviders();
      expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM providers");
      expect(providers).toHaveLength(1);
      expect(providers[0]).toEqual({
        id: "test", name: "Test", service: "API", sourceLabel: "test.com", sourceUrl: "https://test.com",
        feedUrl: undefined, incidentsUrl: undefined, accent: "#000", monogram: "T", manualOnly: true
      });
    });

    it("should upsert a provider", async () => {
      const stmt = createMockStmt();
      mockDb.prepare.mockReturnValue(stmt);

      await dbLayer.upsertProvider({
        id: "test", name: "Test", service: "API", sourceLabel: "test.com", sourceUrl: "https://test.com",
        accent: "#000", monogram: "T", manualOnly: true
      });

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(stmt.bind).toHaveBeenCalledWith("test", "Test", "API", "test.com", "https://test.com", null, null, "#000", "T", 1);
      expect(stmt.run).toHaveBeenCalled();
    });
  });

  describe("Status Snapshots", () => {
    it("should save status snapshot with history as JSON string", async () => {
      const stmt = createMockStmt();
      mockDb.prepare.mockReturnValue(stmt);

      await dbLayer.saveStatusSnapshot("openai", {
        providerId: "openai", status: "operational", message: "All good", history: ["operational", "operational"]
      });

      expect(stmt.bind).toHaveBeenCalledWith("openai", "operational", "All good", null, '["operational","operational"]');
      expect(stmt.run).toHaveBeenCalled();
    });

    it("should get latest status and parse JSON history", async () => {
      const stmt = createMockStmt([{
        id: 1, provider_id: "openai", status: "operational", message: "All good", timestamp: null,
        history: '["operational"]', created_at: "2024-01-01T00:00:00Z"
      }]);
      mockDb.prepare.mockReturnValue(stmt);

      const status = await dbLayer.getLatestStatus("openai");
      expect(status?.history).toEqual(["operational"]);
      expect(status?.createdAt).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("Incidents", () => {
    it("should get incident and parse updates", async () => {
      const stmt = createMockStmt([{
        id: "inc1", provider_id: "p1", name: "Outage", impact: "major", status: "investigating",
        created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z", resolved_at: null,
        updates: '[{"body":"We are looking into it","status":"investigating","updatedAt":"2024-01-01T00:00:00Z"}]'
      }]);
      mockDb.prepare.mockReturnValue(stmt);

      const incident = await dbLayer.getIncident("inc1");
      expect(incident?.updates[0].body).toBe("We are looking into it");
    });

    it("should upsert incident and stringify updates", async () => {
      const stmt = createMockStmt();
      mockDb.prepare.mockReturnValue(stmt);

      await dbLayer.upsertIncident({
        id: "inc1", providerId: "p1", name: "Outage", impact: "major", status: "investigating",
        createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
        updates: [{ body: "test", status: "investigating", updatedAt: "2024-01-01T00:00:00Z" }]
      });

      expect(stmt.bind).toHaveBeenCalledWith(
        "inc1", "p1", "Outage", "major", "investigating", "2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z", null,
        '[{"body":"test","status":"investigating","updatedAt":"2024-01-01T00:00:00Z"}]'
      );
    });
  });

  describe("Subscriptions", () => {
    it("should create subscription", async () => {
      const stmt = createMockStmt();
      mockDb.prepare.mockReturnValue(stmt);

      await dbLayer.createSubscription({
        id: "sub1", providerId: "p1", channel: "webhook", target: "https://example.com/hook", createdAt: "2024-01-01T00:00:00Z"
      });

      expect(stmt.bind).toHaveBeenCalledWith("sub1", "p1", "webhook", "https://example.com/hook", "2024-01-01T00:00:00Z");
      expect(stmt.run).toHaveBeenCalled();
    });
  });

  describe("Provider State", () => {
    it("should upsert provider state omitting updatedAt", async () => {
      const stmt = createMockStmt();
      mockDb.prepare.mockReturnValue(stmt);

      await dbLayer.upsertProviderState({ providerId: "p1", status: "operational", message: "OK" });

      expect(stmt.bind).toHaveBeenCalledWith("p1", "operational", "OK");
      expect(stmt.run).toHaveBeenCalled();
    });
  });
});
