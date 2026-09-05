import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWorkerSubscriptions, createWorkerSubscription, deleteWorkerSubscription, deliverWebhook, logEmailStub, isSafeWebhookUrl } from "../workerNotifications";
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

  it("should execute email stub behavior without failing", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logEmailStub("test@example.com", { message: "hello" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("email delivery to test@example.com is a no-op"),
      { message: "hello" }
    );
    consoleSpy.mockRestore();
  });

  describe("SSRF Protection", () => {
    it("should allow valid public HTTPS URLs", () => {
      expect(isSafeWebhookUrl("https://example.com/webhook")).toBe(true);
      expect(isSafeWebhookUrl("https://api.github.com/v1/test")).toBe(true);
      expect(isSafeWebhookUrl("https://1.1.1.1")).toBe(true);
    });

    it("should reject localhost", () => {
      expect(isSafeWebhookUrl("http://localhost/hook")).toBe(false);
      expect(isSafeWebhookUrl("http://localhost:8080")).toBe(false);
    });

    it("should reject IPv4 loopback and private ranges", () => {
      expect(isSafeWebhookUrl("http://127.0.0.1/")).toBe(false);
      expect(isSafeWebhookUrl("http://10.0.0.1/")).toBe(false);
      expect(isSafeWebhookUrl("http://192.168.1.1/")).toBe(false);
      expect(isSafeWebhookUrl("http://169.254.169.254/")).toBe(false);
      expect(isSafeWebhookUrl("http://172.16.0.1/")).toBe(false);
      expect(isSafeWebhookUrl("http://172.31.255.255/")).toBe(false);
      expect(isSafeWebhookUrl("http://0.0.0.0/")).toBe(false);
    });

    it("should reject IPv6 loopback and private ranges", () => {
      expect(isSafeWebhookUrl("http://[::1]/")).toBe(false);
      expect(isSafeWebhookUrl("http://[fc00::1]/")).toBe(false);
      expect(isSafeWebhookUrl("http://[fd00:1234::]/")).toBe(false);
      expect(isSafeWebhookUrl("http://[fe80::1]/")).toBe(false);
    });

    it("should reject userinfo in URL", () => {
      expect(isSafeWebhookUrl("https://user:pass@example.com/")).toBe(false);
      expect(isSafeWebhookUrl("https://user@example.com/")).toBe(false);
    });

    it("should reject decimal and hex IP forms", () => {
      expect(isSafeWebhookUrl("http://2130706433/")).toBe(false); // 127.0.0.1
      expect(isSafeWebhookUrl("http://0x7f000001/")).toBe(false); // 127.0.0.1
      expect(isSafeWebhookUrl("http://0x7f.0.0.1/")).toBe(false);
      expect(isSafeWebhookUrl("http://0177.0.0.1/")).toBe(false); // octal
    });
  });
});
