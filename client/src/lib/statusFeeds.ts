// Browser-only fetcher for the shared status feeds module.
// This file is the *only* place we touch `window`, `fetch`, or `AbortController`
// against the public Statuspage endpoints. Server-side code lives in
// `server/routes/status.ts` and reuses the same shared module.

import {
  buildSnapshot,
  createManualSnapshot,
  deriveSnapshot,
  type FetchedSnapshot,
  type ProviderConfig,
  type ProviderSnapshot,
  type StatusPageIncident,
  type StatusPageIncidentsResponse,
  type StatusPageSummary,
} from "@shared/statusFeeds";

export type { HistoryKind, ProviderConfig, ProviderSnapshot, StatusKind } from "@shared/statusFeeds";
export { PROVIDERS, createInitialSnapshot, UNKNOWN_HISTORY } from "@shared/statusFeeds";

const FETCH_TIMEOUT_MS = 7_000;

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchProviderSnapshot(provider: ProviderConfig): Promise<ProviderSnapshot> {
  if (provider.manualOnly || !provider.feedUrl) {
    return createManualSnapshot(provider);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
      } catch {
        incidents = [];
      }
    }

    const fetched: FetchedSnapshot = deriveSnapshot(provider, summary, incidents);
    return buildSnapshot(provider, fetched);
  } catch {
    return createManualSnapshot(provider, "Public feed unavailable in this view.");
  } finally {
    window.clearTimeout(timeout);
  }
}
