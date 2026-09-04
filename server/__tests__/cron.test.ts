import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMonitoringCycle } from "../cron";
import type { D1Database } from "@cloudflare/workers-types";
import { PROVIDERS } from "../../shared/statusFeeds";
import * as fetcher from "../statusFetcher";
import * as notif from "../workerNotifications";

vi.mock("../statusFetcher", async () => ({
  fetchProviderSnapshotRemote: vi.fn(),
  fetchJson: vi.fn()
}));

vi.mock("../workerNotifications", async () => {
  const actual = await vi.importActual("../workerNotifications");
  return {
    ...actual as any,
    deliverWebhook: vi.fn(() => Promise.resolve(true))
  };
});

function createMockDb(): D1Database {
  let providerState: Record<string, any> = {};
  let subscriptions: Record<string, any> = {
    "sub1": { id: "sub1", provider_id: "openai", channel: "webhook", target: "https://example.com" }
  };
  
  const mockDb = {
    prepare: vi.fn((query: string) => {
      const stmt = {
        bind: vi.fn((...args: any[]) => {
          return {
            first: vi.fn(async () => {
              if (query.includes("FROM provider_state WHERE provider_id = ?")) {
                const id = args[0];
                return providerState[id] || null;
              }
              return null;
            }),
            run: vi.fn(async () => {
              if (query.includes("INSERT OR REPLACE INTO provider_state") || query.includes("INSERT INTO provider_state")) {
                const id = args[0];
                providerState[id] = { provider_id: id, status: args[1], message: args[2], updated_at: "now" };
              }
              if (query.includes("UPDATE provider_state")) {
                return { meta: { changes: 1 }, success: true };
              }
              if (query.includes("INSERT OR IGNORE INTO provider_state")) {
                return { meta: { changes: 1 }, success: true };
              }
              return { meta: { changes: 1 }, success: true };
            }),
            all: vi.fn(async () => {
              if (query.includes("FROM subscriptions")) {
                return { results: Object.values(subscriptions), success: true };
              }
              return { results: [], success: true };
            }),
          };
        }),
        all: vi.fn(async () => {
          if (query.includes("FROM subscriptions")) {
            return { results: Object.values(subscriptions), success: true };
          }
          return { results: [], success: true };
        }),
        run: vi.fn(async () => ({ meta: { changes: 1 }, success: true })),
      };
      return stmt;
    }),
  } as unknown as D1Database;
  
  // Method to manually update state for test setup
  (mockDb as any).__setState = (id: string, status: string) => {
    providerState[id] = { provider_id: id, status, message: "" };
  };
  
  return mockDb;
}

describe("Worker Cron Monitoring Engine", () => {
  let dbBinding: D1Database;

  beforeEach(() => {
    dbBinding = createMockDb();
    vi.clearAllMocks();
    
    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation((provider: any) => {
      return Promise.resolve({
        status: "operational",
        message: "",
        timestamp: "2024-01-01T00:00:00Z",
        history: []
      });
    });
  });

  it("should handle first provider observation without notifying", async () => {
    // OpenAI has no previous state
    const result = await runMonitoringCycle(dbBinding);
    expect(result.providersChecked).toBeGreaterThan(0);
    expect(result.transitions).toBe(0); // First observation doesn't count as transition
    expect(result.notificationsAttempted).toBe(0);
  });

  it("should handle unchanged operational status without notifying", async () => {
    (dbBinding as any).__setState("openai", "operational");
    
    const result = await runMonitoringCycle(dbBinding);
    expect(result.transitions).toBe(0);
    expect(result.notificationsAttempted).toBe(0);
  });

  it("should handle degraded transition and notify", async () => {
    (dbBinding as any).__setState("openai", "operational");
    
    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation((provider: any) => {
      if (provider.id === "openai") {
        return Promise.resolve({
          status: "degraded",
          message: "API latency",
          timestamp: "2024-01-01T00:00:00Z",
          history: []
        });
      }
      return Promise.resolve({ status: "operational", message: "", timestamp: "2024-01-01T00:00:00Z", history: [] });
    });

    const result = await runMonitoringCycle(dbBinding);
    expect(result.transitions).toBe(1);
    expect(result.notificationsAttempted).toBe(1); // One webhook subscription for openai
    expect(notif.deliverWebhook).toHaveBeenCalledWith("https://example.com", expect.objectContaining({
      providerId: "openai",
      oldStatus: "operational",
      newStatus: "degraded"
    }));
  });

  it("should prevent duplicate notifications if a concurrent execution updates state first", async () => {
    (dbBinding as any).__setState("openai", "operational");
    
    // Simulate D1 returning changes = 0 indicating compareAndSet failed (race condition lost)
    const originalPrepare = dbBinding.prepare;
    dbBinding.prepare = vi.fn((query: string) => {
      const stmt = originalPrepare(query) as any;
      if (query.includes("UPDATE provider_state")) {
        const originalRun = stmt.bind().run;
        stmt.bind = vi.fn((...args: any[]) => {
          return {
            run: vi.fn(async () => {
              // Override meta.changes to 0 to simulate lost race
              return { meta: { changes: 0 }, success: true };
            }),
            first: stmt.bind(...args).first,
            all: stmt.bind(...args).all
          };
        });
      }
      return stmt;
    });

    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation((provider: any) => {
      if (provider.id === "openai") {
        return Promise.resolve({
          status: "degraded",
          message: "API latency",
          timestamp: "2024-01-01T00:00:00Z",
          history: []
        });
      }
      return Promise.resolve({ status: "operational", message: "", timestamp: "2024-01-01T00:00:00Z", history: [] });
    });

    const result = await runMonitoringCycle(dbBinding);
    expect(result.transitions).toBe(0); // Failed to transition
    expect(result.notificationsAttempted).toBe(0); // Notification aborted safely
    expect(notif.deliverWebhook).not.toHaveBeenCalled();
    
    dbBinding.prepare = originalPrepare; // Restore mock
  });

  it("should isolate provider failure and continue", async () => {
    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation((provider: any) => {
      if (provider.id === "openai") return Promise.reject(new Error("Timeout"));
      return Promise.resolve({ status: "operational", message: "", timestamp: "2024-01-01T00:00:00Z", history: [] });
    });

    const result = await runMonitoringCycle(dbBinding);
    expect(result.failed).toBe(1); // OpenAI failed
    expect(result.successful).toBeGreaterThan(0); // Others succeeded
  });
});
