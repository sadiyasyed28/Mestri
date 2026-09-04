// Notifications (Phase 2.3) — minimal email/webhook subscriptions.
//
// This module deliberately does NOT include a real email provider. Email
// delivery requires an API key (Resend / Postmark / SES) and a domain
// verification, both of which are out of scope for a self-hosted install.
// Webhook delivery, on the other hand, requires nothing but an HTTPS URL
// and is fully functional.
//
// Data is persisted to data/subscriptions.json. The transition detector
// runs on every archive refresh and triggers deliveries.

import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");
const STATE_FILE = path.join(DATA_DIR, "last-status.json");

type Subscription = {
  id: string;
  providerId: string;
  channel: "email" | "webhook";
  target: string; // email address or webhook URL
  createdAt: string;
};

type ProviderStatusSnapshot = { status: string; message?: string };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf-8");
}

export async function initNotificationStore(): Promise<void> {
  const subs = await readJson<Subscription[]>(SUBS_FILE, []);
  void subs; // touch to ensure file exists lazily
}

export const notificationRouter = Router();

notificationRouter.get("/", async (_req, res) => {
  const subs = await readJson<Subscription[]>(SUBS_FILE, []);
  res.json(subs);
});

notificationRouter.post("/", async (req, res) => {
  const { providerId, channel, target } = req.body as Partial<Subscription>;
  if (!providerId || !channel || !target) {
    res.status(400).json({ error: "providerId, channel, and target are required" });
    return;
  }
  if (channel !== "email" && channel !== "webhook") {
    res.status(400).json({ error: "channel must be 'email' or 'webhook'" });
    return;
  }
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    res.status(400).json({ error: "target must be a valid email address" });
    return;
  }
  if (channel === "webhook" && !/^https?:\/\//.test(target)) {
    res.status(400).json({ error: "target must be a valid http(s) URL" });
    return;
  }
  const subs = await readJson<Subscription[]>(SUBS_FILE, []);
  const sub: Subscription = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    providerId,
    channel,
    target,
    createdAt: new Date().toISOString(),
  };
  subs.push(sub);
  await writeJson(SUBS_FILE, subs);
  res.status(201).json(sub);
});

notificationRouter.delete("/:id", async (req, res) => {
  const subs = await readJson<Subscription[]>(SUBS_FILE, []);
  const next = subs.filter((s) => s.id !== req.params.id);
  await writeJson(SUBS_FILE, next);
  res.json({ ok: true, removed: subs.length - next.length });
});

// ----- Transition detection + delivery -----

const RECENT_DELIVERIES = new Map<string, number>();
const DELIVERY_COOLDOWN_MS = 5 * 60_000;

async function deliverWebhook(target: string, payload: unknown): Promise<boolean> {
  try {
    const resp = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function logEmailStub(target: string, payload: unknown): void {
  // Email delivery is intentionally NOT implemented. Log a clear hint to the
  // operator that they need to wire up an email provider (Resend, Postmark, SES).
  console.warn(
    `[notifications] email delivery to ${target} is a no-op. Wire up an email provider to actually send. Payload:`,
    payload,
  );
}

export async function detectAndDeliver(providerId: string, current: ProviderStatusSnapshot): Promise<void> {
  const last = await readJson<Record<string, ProviderStatusSnapshot>>(STATE_FILE, {});
  const previous = last[providerId];
  last[providerId] = current;
  await writeJson(STATE_FILE, last);

  if (!previous || previous.status === current.status) return;

  const subs = await readJson<Subscription[]>(SUBS_FILE, []);
  const matching = subs.filter((s) => s.providerId === providerId);
  if (matching.length === 0) return;

  const payload = {
    providerId,
    oldStatus: previous.status,
    newStatus: current.status,
    message: current.message ?? "",
    mestriUrl: `https://mestri.dev/`,
  };

  for (const sub of matching) {
    const cooldownKey = `${sub.id}|${current.status}`;
    const lastDelivery = RECENT_DELIVERIES.get(cooldownKey);
    if (lastDelivery && Date.now() - lastDelivery < DELIVERY_COOLDOWN_MS) continue;
    RECENT_DELIVERIES.set(cooldownKey, Date.now());

    if (sub.channel === "webhook") {
      void deliverWebhook(sub.target, payload);
    } else {
      logEmailStub(sub.target, payload);
    }
  }
}
