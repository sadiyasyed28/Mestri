// Quiet Signal Ledger: keep provider data deterministic, explicit, and honest about feed availability.

export type StatusKind = "operational" | "degraded" | "outage" | "manual";
export type HistoryKind = Exclude<StatusKind, "manual"> | "unknown";

export type ProviderConfig = {
  id: string;
  name: string;
  service: string;
  sourceLabel: string;
  sourceUrl: string;
  feedUrl?: string;
  accent: string;
  monogram: string;
};

export type ProviderSnapshot = {
  status: StatusKind;
  message: string;
  timestamp?: string;
  history: HistoryKind[];
  sourceAvailable: boolean;
  error?: string;
};

type StatusPageIncident = {
  id?: string;
  name?: string;
  impact?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
  incident_updates?: Array<{
    body?: string;
    status?: string;
    updated_at?: string;
  }>;
};

type StatusPageSummary = {
  page?: { updated_at?: string };
  status?: { indicator?: string; description?: string };
  components?: Array<{ status?: string }>;
};

type StatusPageIncidentsResponse = {
  page?: { updated_at?: string };
  incidents?: StatusPageIncident[];
};

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    service: "ChatGPT + API",
    sourceLabel: "status.openai.com",
    sourceUrl: "https://status.openai.com/",
    feedUrl: "https://status.openai.com/api/v2/summary.json",
    accent: "#111111",
    monogram: "O",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    service: "Claude + API",
    sourceLabel: "status.claude.com",
    sourceUrl: "https://status.claude.com/",
    feedUrl: "https://status.claude.com/api/v2/summary.json",
    accent: "#9D5F35",
    monogram: "A",
  },
  {
    id: "xai",
    name: "xAI",
    service: "Grok + API",
    sourceLabel: "status.x.ai",
    sourceUrl: "https://status.x.ai/",
    feedUrl: "https://status.x.ai/api/v2/summary.json",
    accent: "#111111",
    monogram: "X",
  },
  {
    id: "google",
    name: "Google",
    service: "Gemini + AI Studio",
    sourceLabel: "aistudio.google.com/status",
    sourceUrl: "https://aistudio.google.com/status",
    accent: "#4285F4",
    monogram: "G",
  },
  {
    id: "mistral",
    name: "Mistral",
    service: "Le Chat + API",
    sourceLabel: "status.mistral.ai",
    sourceUrl: "https://status.mistral.ai/",
    feedUrl: "https://status.mistral.ai/api/v2/summary.json",
    accent: "#F15A29",
    monogram: "M",
  },
];

const UNKNOWN_HISTORY: HistoryKind[] = Array.from({ length: 30 }, () => "unknown");

function normalizeStatus(indicator?: string): StatusKind {
  switch (indicator) {
    case "none":
    case "operational":
      return "operational";
    case "minor":
    case "maintenance":
    case "degraded_performance":
    case "partial_outage":
      return "degraded";
    case "major":
    case "critical":
    case "major_outage":
      return "outage";
    default:
      return "manual";
  }
}

function summaryStatus(summary: StatusPageSummary): StatusKind {
  const directStatus = normalizeStatus(summary.status?.indicator);
  if (directStatus !== "manual") return directStatus;

  const componentStates = (summary.components ?? []).map((component) => normalizeStatus(component.status));
  if (componentStates.includes("outage")) return "outage";
  if (componentStates.includes("degraded")) return "degraded";
  if (componentStates.length > 0 && componentStates.every((state) => state === "operational")) return "operational";
  return "manual";
}

function incidentStatus(incident: StatusPageIncident): Exclude<StatusKind, "manual"> {
  const impact = `${incident.impact ?? ""} ${incident.status ?? ""}`.toLowerCase();
  if (impact.includes("major") || impact.includes("critical") || impact.includes("outage")) {
    return "outage";
  }
  return "degraded";
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function createIncidentHistory(incidents: StatusPageIncident[] = []): HistoryKind[] {
  const days = Array.from({ length: 30 }, () => "operational" as HistoryKind);
  const today = startOfDay(new Date());

  incidents.forEach((incident) => {
    const created = incident.created_at ? new Date(incident.created_at).getTime() : undefined;
    const ended = incident.resolved_at
      ? new Date(incident.resolved_at).getTime()
      : incident.updated_at
        ? new Date(incident.updated_at).getTime()
        : Date.now();

    if (!created || Number.isNaN(created) || Number.isNaN(ended)) return;

    const state = incidentStatus(incident);
    for (let offset = 0; offset < 30; offset += 1) {
      const day = today - offset * 86_400_000;
      if (day >= startOfDay(new Date(created)) && day <= startOfDay(new Date(ended))) {
        days[29 - offset] = state;
      }
    }
  });

  return days;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchProviderSnapshot(provider: ProviderConfig): Promise<ProviderSnapshot> {
  if (!provider.feedUrl) {
    return {
      status: "manual",
      message: "This provider does not expose a browser-readable public feed here.",
      history: UNKNOWN_HISTORY,
      sourceAvailable: false,
    };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);

  try {
    const [summary, incidentPayload] = await Promise.all([
      fetchJson<StatusPageSummary>(provider.feedUrl, controller.signal),
      fetchJson<StatusPageIncidentsResponse | StatusPageIncident[]>(provider.feedUrl.replace("summary.json", "incidents.json"), controller.signal).catch(
        () => ({ incidents: [] }),
      ),
    ]);

    const incidents = Array.isArray(incidentPayload) ? incidentPayload : (incidentPayload.incidents ?? []);
    const currentStatus = summaryStatus(summary);
    const latestIncident = incidents[0];
    const latestUpdate = latestIncident?.incident_updates?.[0];
    const message = latestUpdate?.body || latestIncident?.name || summary.status?.description || "No active incident reported by provider.";
    const timestamp = latestUpdate?.updated_at || latestIncident?.updated_at || summary.page?.updated_at;

    return {
      status: currentStatus,
      message,
      timestamp,
      history: createIncidentHistory(incidents),
      sourceAvailable: true,
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "The feed took too long to respond." : "This feed could not be read in the current browser.";
    return {
      status: "manual",
      message: "Public feed unavailable in this view.",
      history: UNKNOWN_HISTORY,
      sourceAvailable: false,
      error: reason,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function createInitialSnapshot(provider: ProviderConfig): ProviderSnapshot {
  if (!provider.feedUrl) {
    return {
      status: "manual",
      message: "This provider does not expose a browser-readable public feed here.",
      history: UNKNOWN_HISTORY,
      sourceAvailable: false,
    };
  }

  return {
    status: "manual",
    message: "Checking the provider’s public status feed…",
    history: UNKNOWN_HISTORY,
    sourceAvailable: false,
  };
}
