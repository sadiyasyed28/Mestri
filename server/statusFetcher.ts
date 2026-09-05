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
  UNKNOWN_HISTORY,
  createIncidentHistory
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

export async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: {
      "User-Agent": "mestri-status-aggregator/1.0 (+https://mestri.dev)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

async function fetchStatuspageAdapter(provider: ProviderConfig, controller: AbortController): Promise<FetchedSnapshot> {
  const summary = await fetchJson<StatusPageSummary>(provider.feedUrl!, controller.signal);
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
  return deriveSnapshot(provider, summary, incidents);
}

async function fetchInstatusAdapter(provider: ProviderConfig, controller: AbortController): Promise<FetchedSnapshot> {
  const data = await fetchJson<any>(provider.feedUrl!, controller.signal);
  
  let status: "operational" | "degraded" | "outage" = "operational";
  if (data.page?.status === "HAS_ISSUES" || data.page?.status === "MAJOROUTAGE") {
    status = data.page?.status === "MAJOROUTAGE" ? "outage" : "degraded";
  }
  
  const incidents: StatusPageIncident[] = [];
  if (Array.isArray(data.activeIncidents)) {
    data.activeIncidents.forEach((inc: any) => {
      incidents.push({
        id: inc.id,
        name: inc.name,
        created_at: inc.startedAt,
        updated_at: inc.updatedAt,
        resolved_at: inc.resolvedAt,
        impact: status === "outage" ? "critical" : "minor",
        incident_updates: [{ body: inc.message, updated_at: inc.updatedAt }]
      });
    });
  }
  
  return {
    status,
    message: data.page?.status_description || incidents[0]?.name || "All systems operational",
    timestamp: new Date().toISOString(),
    history: createIncidentHistory(incidents)
  };
}

async function fetchGoogleCloudAdapter(provider: ProviderConfig, controller: AbortController): Promise<FetchedSnapshot> {
  const incidentsRaw = await fetchJson<any[]>(provider.feedUrl!, controller.signal);
  const aiIncidents = incidentsRaw.filter((inc) => {
    const s = (inc.service_name || "").toLowerCase();
    return s.includes("gemini") || s.includes("vertex") || s.includes("ai");
  });
  
  const active = aiIncidents.filter((inc) => !inc.end || new Date(inc.end).getTime() > Date.now());
  
  const mappedIncidents = aiIncidents.map((inc) => ({
    id: inc.id,
    name: inc.external_desc || inc.service_name,
    created_at: inc.begin,
    resolved_at: inc.end,
    impact: inc.severity === "high" ? "critical" : "minor"
  }));
  
  let status: "operational" | "degraded" | "outage" = "operational";
  let message = "No active incident reported by provider.";
  
  if (active.length > 0) {
    status = active.some(i => i.severity === "high") ? "outage" : "degraded";
    message = active[0].external_desc || active[0].service_name || "Active incident on Google Cloud AI.";
  }
  
  return {
    status,
    message,
    timestamp: new Date().toISOString(),
    history: createIncidentHistory(mappedIncidents)
  };
}

async function fetchRssAdapter(provider: ProviderConfig, controller: AbortController): Promise<FetchedSnapshot> {
  const xml = await fetchText(provider.feedUrl!, controller.signal);
  
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    
    if (titleMatch) {
      items.push({
        title: titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(),
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined
      });
    }
  }
  
  let status: "operational" | "degraded" | "outage" = "operational";
  let message = "All systems operational";
  let timestamp = new Date().toISOString();
  
  const mappedIncidents: StatusPageIncident[] = [];
  
  if (items.length > 0) {
    const latest = items[0];
    const isResolved = latest.title.toLowerCase().includes("resolved") || latest.title.toLowerCase().includes("completed");
    
    if (!isResolved) {
      status = "degraded";
      message = latest.title;
    }
    timestamp = latest.pubDate ? new Date(latest.pubDate).toISOString() : timestamp;
    
    items.forEach((item, index) => {
       const resolved = item.title.toLowerCase().includes("resolved") || item.title.toLowerCase().includes("completed");
       mappedIncidents.push({
         id: `rss-${index}`,
         name: item.title,
         created_at: item.pubDate,
         resolved_at: resolved ? item.pubDate : undefined,
         impact: item.title.toLowerCase().includes("outage") ? "critical" : "minor"
       });
    });
  }
  
  return {
    status,
    message,
    timestamp,
    history: createIncidentHistory(mappedIncidents)
  };
}

export async function fetchProviderSnapshotRemote(provider: ProviderConfig): Promise<ProviderSnapshot> {
  if (provider.manualOnly || !provider.feedUrl || provider.adapter === "manual") {
    return createManualSnapshot(provider);
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    let fetched: FetchedSnapshot;
    
    switch (provider.adapter) {
      case "statuspage":
        fetched = await fetchStatuspageAdapter(provider, controller);
        break;
      case "instatus":
        fetched = await fetchInstatusAdapter(provider, controller);
        break;
      case "google-cloud":
        fetched = await fetchGoogleCloudAdapter(provider, controller);
        break;
      case "rss":
        fetched = await fetchRssAdapter(provider, controller);
        break;
      default:
        fetched = await fetchStatuspageAdapter(provider, controller);
    }
    
    return buildSnapshot(provider, fetched);
  } catch (err) {
    console.error(`Failed to fetch ${provider.id}:`, err);
    return createManualSnapshot(provider, "Upstream feed unreachable.");
  } finally {
    clearTimeout(timeout);
  }
}
