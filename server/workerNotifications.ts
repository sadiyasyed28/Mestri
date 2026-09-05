import { createDb } from "./db/index";
import type { D1Database } from "@cloudflare/workers-types";
import type { DbSubscription } from "./db/index";

// Minimal webhook delivery logic extracted for Phase 7 reuse
export async function deliverWebhook(target: string, payload: unknown): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return resp.ok;
  } catch (_err) {
    return false;
  } finally {
    clearTimeout(timeoutId);
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

export function isSafeWebhookUrl(urlStr: string): boolean {
  if (!/^https?:\/\//.test(urlStr)) return false;
  try {
    const parsed = new URL(urlStr);
    
    // Reject userinfo
    if (parsed.username || parsed.password) return false;
    
    const h = parsed.hostname.toLowerCase();
    
    // Reject localhost
    if (h === "localhost") return false;

    // IPv4 patterns
    if (/^127\./.test(h)) return false;
    if (/^10\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false;
    if (h === "0.0.0.0") return false;

    // IPv6 patterns (strip brackets if any)
    const v6 = h.replace(/^\[|\]$/g, "");
    if (v6 === "::1" || v6 === "::") return false;
    if (/^fc[0-9a-f]{2}:/i.test(v6) || /^fd[0-9a-f]{2}:/i.test(v6)) return false;
    if (/^fe[89ab][0-9a-f]:/i.test(v6)) return false;
    
    // Decimal/hex/octal forms: if the hostname is just a number
    // If there are no dots or colons, it might be a flat decimal/hex IP, block it.
    if (!h.includes(".") && !h.includes(":")) {
      return false;
    }
    
    // Hex/Octal in IPv4 dotted format
    if (h.includes(".")) {
      const parts = h.split(".");
      for (const p of parts) {
        if (/^0x/i.test(p)) return false; // Hex
        if (/^0\d+/.test(p)) return false; // Octal
      }
    }

    return true;
  } catch {
    return false;
  }
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
  if (channel === "webhook" && !isSafeWebhookUrl(target)) {
    return { error: "target must be a valid, safe http(s) URL" };
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
