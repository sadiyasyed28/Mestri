import { createDb } from "./db/index";
import type { D1Database } from "@cloudflare/workers-types";
import type { DbSubscription } from "./db/index";

// Minimal webhook delivery logic extracted for Phase 7 reuse
export async function deliverWebhook(target: string, payload: unknown): Promise<boolean> {
  try {
    const resp = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch (_err) {
    return false;
  }
}

export function logEmailStub(target: string, payload: unknown): void {
  console.warn(
    `[notifications] email delivery to ${target} is a no-op. Wire up an email provider to actually send. Payload:`,
    payload,
  );
}

export async function getWorkerSubscriptions(dbBinding: D1Database): Promise<DbSubscription[]> {
  const db = createDb(dbBinding);
  return db.getSubscriptions();
}

export async function createWorkerSubscription(dbBinding: D1Database, body: Partial<DbSubscription>): Promise<{ error: string } | DbSubscription> {
  const { providerId, channel, target } = body;

  if (!providerId || !channel || !target) {
    return { error: "providerId, channel, and target are required" };
  }
  if (channel !== "email" && channel !== "webhook") {
    return { error: "channel must be 'email' or 'webhook'" };
  }
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { error: "target must be a valid email address" };
  }
  if (channel === "webhook" && !/^https?:\/\//.test(target)) {
    return { error: "target must be a valid http(s) URL" };
  }

  const db = createDb(dbBinding);
  
  const sub: DbSubscription = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    providerId,
    channel,
    target,
    createdAt: new Date().toISOString(),
  };

  await db.createSubscription(sub);
  return sub;
}

export async function deleteWorkerSubscription(dbBinding: D1Database, id: string): Promise<{ ok: boolean, removed: number }> {
  const db = createDb(dbBinding);
  const success = await db.deleteSubscription(id);
  return { ok: true, removed: success ? 1 : 0 };
}
