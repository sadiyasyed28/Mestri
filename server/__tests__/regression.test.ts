import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../worker";
import { runMonitoringCycle } from "../cron";
import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import * as fetcher from "../statusFetcher";
import * as notif from "../workerNotifications";
import { PROVIDERS } from "../../shared/statusFeeds";

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
  let snapshots: any[] = [];
  let subscriptions: Record<string, any> = {
    "sub1": { id: "sub1", provider_id: "openai", channel: "webhook", target: "https://example.com/hook", created_at: "now" }
  };
  
  return {
    prepare: vi.fn((query: string) => {
      const stmt = {
        bind: vi.fn((...args: any[]) => {
          return {
            first: vi.fn(async () => {
              if (query.includes("FROM provider_state")) return providerState[args[0]] || null;
              if (query.includes("FROM status_snapshots")) {
                const id = args[0];
                return snapshots.filter(s => s.provider_id === id).sort((a, b) => b.id - a.id)[0] || null;
              }
              return null;
            }),
            run: vi.fn(async () => {
              if (query.includes("INSERT OR IGNORE INTO provider_state") || query.includes("INSERT INTO provider_state")) {
                providerState[args[0]] = { provider_id: args[0], status: args[1], message: args[2], updated_at: "now" };
                return { meta: { changes: 1 }, success: true };
              }
              if (query.includes("UPDATE provider_state")) {
                providerState[args[0]] = { provider_id: args[0], status: args[4], message: args[2], updated_at: "now" };
                return { meta: { changes: 1 }, success: true };
              }
              if (query.includes("INSERT INTO status_snapshots")) {
                snapshots.push({ id: snapshots.length + 1, provider_id: args[0], status: args[1], message: args[2], timestamp: args[3], history: args[4] });
                return { meta: { changes: 1 }, success: true };
              }
              return { meta: { changes: 1 }, success: true };
            }),
            all: vi.fn(async () => {
              if (query.includes("FROM subscriptions")) return { results: Object.values(subscriptions), success: true };
              return { results: [], success: true };
            }),
          };
        }),
        first: vi.fn(async () => null),
        all: vi.fn(async () => {
          if (query.includes("FROM subscriptions")) return { results: Object.values(subscriptions), success: true };
          return { results: [], success: true };
        }),
        run: vi.fn(async () => ({ meta: { changes: 1 }, success: true })),
      };
      return stmt;
    }),
  } as unknown as D1Database;
}

describe("Worker E2E Regression", () => {
  let dbBinding: D1Database;
  let mockEnv: any;

  beforeEach(() => {
    dbBinding = createMockDb();
    mockEnv = { DB: dbBinding, ASSETS: { fetch: vi.fn() } };
    vi.clearAllMocks();
  });

  it("Full critical path: fetch upstream -> save state -> respond to frontend API", async () => {
    // 1. Cron cycle fetches the upstream provider response
    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation((provider: any) => {
      if (provider.id === "openai") {
        return Promise.resolve({
          status: "degraded",
          message: "API latency issues",
          timestamp: "2024-01-01T00:00:00Z",
          history: []
        });
      }
      return Promise.resolve({ status: "operational", message: "OK", timestamp: "now", history: [] });
    });

    await runMonitoringCycle(dbBinding);

    // 2. Validate D1 state by querying the worker API mimicking the frontend
    const req = new Request("https://mestri.dev/api/status");
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
    const res = await worker.fetch(req, mockEnv, ctx);
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    
    // Status normalization and response successfully occurred
    expect(data["openai"].status).toBe("degraded");
    expect(data["openai"].message).toBe("API latency issues");
  });

  it("Full CAS transition path: operational -> degraded -> notification delivery", async () => {
    // Phase 1: Operational
    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation(() => {
      return Promise.resolve({ status: "operational", message: "OK", timestamp: "now", history: [] });
    });
    
    // Initialize state
    await runMonitoringCycle(dbBinding);
    expect(notif.deliverWebhook).not.toHaveBeenCalled(); // First observation, no notification

    // Phase 2: Provider transitions to degraded
    (fetcher.fetchProviderSnapshotRemote as any).mockImplementation((provider: any) => {
      if (provider.id === "openai") {
        return Promise.resolve({ status: "degraded", message: "Latency", timestamp: "now", history: [] });
      }
      return Promise.resolve({ status: "operational", message: "OK", timestamp: "now", history: [] });
    });

    const result = await runMonitoringCycle(dbBinding);
    
    expect(result.transitions).toBe(1);
    expect(result.notificationsAttempted).toBe(1);
    
    // Validate the notification subsystem successfully triggered delivery payload
    expect(notif.deliverWebhook).toHaveBeenCalledWith("https://example.com/hook", expect.objectContaining({
      providerId: "openai",
      oldStatus: "operational",
      newStatus: "degraded"
    }));
  });
});
