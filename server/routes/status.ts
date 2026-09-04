// Server-side status fetcher. Caches snapshots in-memory for 60s and
// persists the rolling incident archive to a JSON file on disk so the
// /i/:incidentId pages in Phase 2.2 have something to render.

import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import {
  buildSnapshot,
  createManualSnapshot,
  deriveSnapshot,
  type FetchedSnapshot,
  PROVIDERS,
  type ProviderConfig,
  type ProviderSnapshot,
  type StatusPageIncident,
  type StatusPageIncidentsResponse,
  type StatusPageSummary,
} from "../../shared/statusFeeds";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FETCH_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 60000;
const DATA_DIR = path.resolve(__dirname, "..", "data");
const INCIDENTS_FILE = path.join(DATA_DIR, "incidents.json");

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "mestri-status-aggregator/1.0 (+https://mestri.dev)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function fetchProviderSnapshotRemote(provider: ProviderConfig): Promise<ProviderSnapshot> {
  if (provider.manualOnly || !provider.feedUrl) {
    return createManualSnapshot(provider);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const summary = await fetchJson<StatusPageSummary>(provider.feedUrl, controller.signal);
    let incidents: StatusPageIncident[] = [];
    if (provider.incidentsUrl) {
      try {
        const payload = await fetchJson<StatusPageIncidentsResponse | StatusPageIncident[]>(
          provider.incidentsUrl,
          controller.signal,
        );
        incidents = Array.isArray(payload) ? payload : payload.incidents ?? [];
      } catch (_err) {
        incidents = [];
      }
    }
    const fetched: FetchedSnapshot = deriveSnapshot(provider, summary, incidents);
    return buildSnapshot(provider, fetched);
  } catch (_err) {
    return createManualSnapshot(provider, "Upstream feed unreachable.");
  } finally {
    clearTimeout(timeout);
  }
}

type CacheEntry = { fetchedAt: number; snapshot: ProviderSnapshot };
const cache = new Map<string, CacheEntry>();

async function getSnapshot(provider: ProviderConfig): Promise<ProviderSnapshot> {
  const cached = cache.get(provider.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.snapshot;
  const snapshot = await fetchProviderSnapshotRemote(provider);
  cache.set(provider.id, { fetchedAt: Date.now(), snapshot });
  return snapshot;
}


// ----- Persistent incident archive -----

type StoredIncident = {
  providerId: string;
  providerName: string;
  id: string;
  name: string;
  impact: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  updates: Array<{ body: string; status: string; updatedAt: string }>;
};

async function readArchive(): Promise<StoredIncident[]> {
  try {
    const raw = await fs.readFile(INCIDENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoredIncident[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_err) {
    return [];
  }
}

async function writeArchive(incidents: StoredIncident[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(INCIDENTS_FILE, JSON.stringify(incidents, null, 2), "utf-8");
}

async function upsertIncidents(
  providerId: string,
  providerName: string,
  incidents: StatusPageIncident[],
): Promise<void> {
  const archive = await readArchive();
  const byKey = new Map<string, StoredIncident>();
  for (const item of archive) {
    byKey.set(`${item.providerId}|${item.id}|${item.createdAt}`, item);
  }
  for (const incident of incidents) {
    if (!incident.id || !incident.created_at) continue;
    const key = `${providerId}|${incident.id}|${incident.created_at}`;
    const updates = (incident.incident_updates ?? []).map((u) => ({
      body: u.body ?? "",
      status: u.status ?? "",
      updatedAt: u.updated_at ?? "",
    }));
    byKey.set(key, {
      providerId,
      providerName,
      id: incident.id,
      name: incident.name ?? "",
      impact: incident.impact ?? "",
      status: incident.status ?? "",
      createdAt: incident.created_at,
      updatedAt: incident.updated_at ?? incident.created_at,
      resolvedAt: incident.resolved_at,
      updates,
    });
  }
  await writeArchive(Array.from(byKey.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
}

export const statusRouter = Router();

statusRouter.get("/status", async (_req, res) => {
  const entries = await Promise.all(
    PROVIDERS.map(async (provider) => [provider.id, await getSnapshot(provider)] as const),
  );
  res.set("Cache-Control", "public, max-age=60");
  res.json(Object.fromEntries(entries));
});

statusRouter.get("/providers", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(
    PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      service: p.service,
      sourceLabel: p.sourceLabel,
      sourceUrl: p.sourceUrl,
      feedUrl: p.feedUrl,
      manualOnly: p.manualOnly ?? false,
      monogram: p.monogram,
      accent: p.accent,
    })),
  );
});

// ----- Incident archive endpoints (Phase 2.2) -----

statusRouter.get("/incidents", async (req, res) => {
  const providerId = typeof req.query.provider === "string" ? req.query.provider : undefined;
  const archive = await readArchive();
  const filtered = providerId ? archive.filter((i) => i.providerId === providerId) : archive;
  res.set("Cache-Control", "public, max-age=30");
  res.json(filtered);
});

statusRouter.get("/incidents/:id", async (req, res) => {
  const archive = await readArchive();
  const found = archive.find((i) => i.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json(found);
});

// ----- Background archive refresh worker -----

let lastArchiveRefresh = 0;
const ARCHIVE_REFRESH_MS = 5 * 60000;

async function refreshArchive(): Promise<void> {
  for (const provider of PROVIDERS) {
    if (provider.manualOnly || !provider.incidentsUrl) continue;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const payload = await fetchJson<StatusPageIncidentsResponse | StatusPageIncident[]>(
        provider.incidentsUrl,
        controller.signal,
      );
      const incidents = Array.isArray(payload) ? payload : payload.incidents ?? [];
      await upsertIncidents(provider.id, provider.name, incidents);
    } catch (_err) {
      // Skip — archive only grows; missing fetches aren't destructive.
    } finally {
      clearTimeout(timeout);
    }
  }
  lastArchiveRefresh = Date.now();
}

statusRouter.get("/archive/refresh", async (_req, res) => {
  if (Date.now() - lastArchiveRefresh < 30000) {
    res.json({ skipped: true, lastArchiveRefresh });
    return;
  }
  await refreshArchive();
  res.json({ ok: true, lastArchiveRefresh });
});

// Kick off an initial archive refresh shortly after boot.
setTimeout(() => {
  void refreshArchive();
}, 5000);
setInterval(() => {
  void refreshArchive();
}, ARCHIVE_REFRESH_MS).unref?.();
