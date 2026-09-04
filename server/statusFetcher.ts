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
} from "../shared/statusFeeds";

const FETCH_TIMEOUT_MS = 7000;

export async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
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

export async function fetchProviderSnapshotRemote(provider: ProviderConfig): Promise<ProviderSnapshot> {
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
