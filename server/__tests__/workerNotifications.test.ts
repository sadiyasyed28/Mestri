import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkerSubscriptions, createWorkerSubscription, deleteWorkerSubscription, deliverWebhook } from "../workerNotifications";
import type { D1Database } from "@cloudflare/workers-types";

global.fetch = vi.fn();

function createMockDb(): D1Database {
  let mockSubs: Record<string, any> = {};
  
  const mockDb = {
    prepare: vi.fn((query: string) => {
      const stmt = {
        bind: vi.fn((...args: any[]) => {
          return {
            first: vi.fn(async () => null),
            all: vi.fn(async () => {
              if (query.includes("FROM subscriptions")) {
                return { results: Object.values(mockSubs), success: true };
              }
              return { results: [], success: true };
            }),
            run: vi.fn(async () => {
              if (query.includes("INSERT INTO subscriptions")) {
                const id = args[0];
                mockSubs[id] = {
                  id: args[0],
                  provider_id: args[1],
                  channel: args[2],
                  target: args[3],
                  created_at: args[4]
                };
              }
              if (query.includes("DELETE FROM subscriptions")) {
                const id = args[0];
                const exists = !!mockSubs[id];
                delete mockSubs[id];
                return { meta: { changes: exists ? 1 : 0 }, success: true };
              }
              return { success: true };
            }),
          };
        }),
        first: vi.fn(async () => null),
        all: vi.fn(async () => {
          if (query.includes("FROM subscriptions")) {
            return { results: Object.values(mockSubs), success: true };
          }
          return { results: [], success: true };
        }),
        run: vi.fn(async () => ({ success: true })),
      };
      return stmt;
    }),
  } as unknown as D1Database;
  
  return mockDb;
}

describe("Worker Notifications Routes", () => {
  let dbBinding: D1Database;

  beforeEach(() => {
    dbBinding = createMockDb();
    vi.clearAllMocks();
  });

  it("should create a valid email subscription", async () => {
    const sub = await createWorkerSubscription(dbBinding, {
      providerId: "openai",
      channel: "email",
      target: "test@example.com"
    });
    
    expect("error" in sub).toBe(false);
    if (!("error" in sub)) {
      expect(sub.providerId).toBe("openai");
      expect(sub.channel).toBe("email");
      expect(sub.target).toBe("test@example.com");
      expect(sub.id).toBeDefined();
    }
  });

  it("should reject invalid email addresses", async () => {
    const sub = await createWorkerSubscription(dbBinding, {
      providerId: "openai",
      channel: "email",
      target: "not-an-email"
    });
    
    expect("error" in sub).toBe(true);
  });

  it("should reject invalid webhook URLs", async () => {
    const sub = await createWorkerSubscription(dbBinding, {
      providerId: "openai",
      channel: "webhook",
      target: "ftp://example.com"
    });
    
    expect("error" in sub).toBe(true);
  });

  it("should list subscriptions", async () => {
    await createWorkerSubscription(dbBinding, {
      providerId: "openai",
      channel: "webhook",
      target: "https://example.com/hook"
    });
    
    const subs = await getWorkerSubscriptions(dbBinding);
    expect(subs.length).toBe(1);
    expect(subs[0].target).toBe("https://example.com/hook");
  });

  it("should delete subscriptions", async () => {
    const sub = await createWorkerSubscription(dbBinding, {
      providerId: "openai",
      channel: "webhook",
      target: "https://example.com/hook"
    }) as any;
    
    const del = await deleteWorkerSubscription(dbBinding, sub.id);
    expect(del.ok).toBe(true);
    expect(del.removed).toBe(1);
    
    const subs = await getWorkerSubscriptions(dbBinding);
    expect(subs.length).toBe(0);
  });

  it("should safely handle deleting nonexistent subscriptions", async () => {
    const del = await deleteWorkerSubscription(dbBinding, "nonexistent");
    expect(del.ok).toBe(true);
    expect(del.removed).toBe(0);
  });

  it("should safely deliver webhooks without crashing", async () => {
    (global.fetch as any).mockImplementation(() => Promise.resolve({ ok: true }));
    const success = await deliverWebhook("https://example.com", { test: true });
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });
  
  it("should isolate failing webhooks", async () => {
    (global.fetch as any).mockImplementation(() => Promise.reject(new Error("Network down")));
    const success = await deliverWebhook("https://example.com", { test: true });
    expect(success).toBe(false);
  });
});
