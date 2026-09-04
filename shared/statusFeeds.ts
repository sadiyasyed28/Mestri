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
  incidentsUrl?: string;
  accent: string;
  monogram: string;
  /** When set, forces the provider into manual mode (no live feed). Useful for providers
   *  without a public CORS-open status feed. */
  manualOnly?: boolean;
};

export type ProviderSnapshot = {
  status: StatusKind;
  message: string;
  timestamp?: string;
  history: HistoryKind[];
  sourceAvailable: boolean;
  error?: string;
};

export type StatusPageIncident = {
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

export type StatusPageSummary = {
  page?: { updated_at?: string };
  status?: { indicator?: string; description?: string };
  components?: Array<{ status?: string }>;
};

export type StatusPageIncidentsResponse = {
  page?: { updated_at?: string };
  incidents?: StatusPageIncident[];
};

export const UNKNOWN_HISTORY: HistoryKind[] = Array.from({ length: 30 }, () => "unknown");

export function deriveIncidentsUrl(summaryUrl: string | undefined): string | undefined {
  if (!summaryUrl) return undefined;
  try {
    const url = new URL(summaryUrl);
    url.pathname = url.pathname.replace(/summary\.json$/, "incidents.json");
    return url.toString();
  } catch (_err) {
    return undefined;
  }
}

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
    manualOnly: true,
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
  {
    id: "cohere",
    name: "Cohere",
    service: "Cohere + API",
    sourceLabel: "status.cohere.com",
    sourceUrl: "https://status.cohere.com/",
    feedUrl: "https://status.cohere.com/api/v2/summary.json",
    accent: "#39594D",
    monogram: "C",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    service: "Inference + Hub",
    sourceLabel: "status.huggingface.co",
    sourceUrl: "https://status.huggingface.co/",
    feedUrl: "https://status.huggingface.co/api/v2/summary.json",
    accent: "#FFD21E",
    monogram: "H",
  },
  {
    id: "replicate",
    name: "Replicate",
    service: "Replicate API",
    sourceLabel: "status.replicate.com",
    sourceUrl: "https://status.replicate.com/",
    feedUrl: "https://status.replicate.com/api/v2/summary.json",
    accent: "#000000",
    monogram: "R",
  },
];

for (const p of PROVIDERS) {
  if (p.feedUrl && !p.incidentsUrl) {
    p.incidentsUrl = deriveIncidentsUrl(p.feedUrl);
  }
}


export function normalizeStatus(indicator?: string): StatusKind {
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

export function summaryStatus(summary: StatusPageSummary): StatusKind {
  const directStatus = normalizeStatus(summary.status?.indicator);
  if (directStatus !== "manual") return directStatus;

  const componentStates = (summary.components ?? []).map((component) => normalizeStatus(component.status));
  if (componentStates.includes("outage")) return "outage";
  if (componentStates.includes("degraded")) return "degraded";
  return "operational";
}

function startOfDay(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function incidentStatus(incident: StatusPageIncident): Exclude<StatusKind, "manual"> {
  const impact = normalizeStatus(incident.impact);
  if (impact !== "manual") return impact;
  const liveUpdate = incident.incident_updates?.find(
    (u) => u.status === "identified" || u.status === "monitoring" || u.status === "investigating",
  );
  if (liveUpdate) return "degraded";
  return "operational";
}

export function createIncidentHistory(incidents: StatusPageIncident[]): HistoryKind[] {
  const days: HistoryKind[] = Array.from({ length: 30 }, () => "operational");
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
      const day = today - offset * 86400000;
      if (day >= startOfDay(new Date(created)) && day <= startOfDay(new Date(ended))) {
        days[29 - offset] = state;
      }
    }
  });

  return days;
}

export function createManualSnapshot(provider: ProviderConfig, reason?: string): ProviderSnapshot {
  return {
    status: "manual",
    message: reason ?? "This provider does not expose a browser-readable public feed here.",
    history: UNKNOWN_HISTORY,
    sourceAvailable: false,
  };
}

export function createInitialSnapshot(provider: ProviderConfig): ProviderSnapshot {
  if (provider.manualOnly || !provider.feedUrl) {
    return createManualSnapshot(provider);
  }
  return {
    status: "manual",
    message: "Checking the provider's public status feed…",
    history: UNKNOWN_HISTORY,
    sourceAvailable: false,
  };
}

/** Result of a successful fetch — kept separate from `ProviderSnapshot` so the wire format
 *  can evolve without touching the data model. */
export type FetchedSnapshot = Omit<ProviderSnapshot, "sourceAvailable">;

export function buildSnapshot(_provider: ProviderConfig, fetched: FetchedSnapshot): ProviderSnapshot {
  return { ...fetched, sourceAvailable: true };
}

export function deriveSnapshot(
  _provider: ProviderConfig,
  summary: StatusPageSummary,
  incidents: StatusPageIncident[],
): FetchedSnapshot {
  const currentStatus = summaryStatus(summary);
  const latestIncident = incidents[0];
  const latestUpdate = latestIncident?.incident_updates?.[0];
  const message =
    latestUpdate?.body || latestIncident?.name || summary.status?.description || "No active incident reported by provider.";
  const timestamp = latestUpdate?.updated_at || latestIncident?.updated_at || summary.page?.updated_at;

  return {
    status: currentStatus,
    message,
    timestamp,
    history: createIncidentHistory(incidents),
  };
}
