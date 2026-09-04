import { createDb } from "./db/index";
import { PROVIDERS, type StatusPageIncident, type StatusPageIncidentsResponse } from "../shared/statusFeeds";
import { fetchJson } from "./statusFetcher";
import type { D1Database } from "@cloudflare/workers-types";
import type { DbIncident } from "./db/index";

export type ApiIncident = DbIncident & { providerName: string };

const FETCH_TIMEOUT_MS = 7000;

export async function getWorkerIncidents(dbBinding: D1Database, providerId?: string): Promise<ApiIncident[]> {
  const db = createDb(dbBinding);
  const incidents = await db.getIncidents(providerId);
  const providers = await db.getProviders();
  const providerMap = new Map(providers.map((p) => [p.id, p.name]));

  return incidents.map((inc) => ({
    ...inc,
    providerName: providerMap.get(inc.providerId) ?? inc.providerId,
  }));
}

export async function getWorkerIncident(dbBinding: D1Database, id: string): Promise<ApiIncident | null> {
  const db = createDb(dbBinding);
  const incident = await db.getIncident(id);
  if (!incident) return null;
  
  const provider = await db.getProvider(incident.providerId);
  return {
    ...incident,
    providerName: provider?.name ?? incident.providerId,
  };
}

export async function refreshWorkerArchive(dbBinding: D1Database): Promise<void> {
  const db = createDb(dbBinding);
  
  for (const provider of PROVIDERS) {
    if (provider.manualOnly || !provider.incidentsUrl) continue;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      const payload = await fetchJson<StatusPageIncidentsResponse | StatusPageIncident[]>(
        provider.incidentsUrl,
        controller.signal
      );
      
      const incidents = Array.isArray(payload) ? payload : payload.incidents ?? [];
      
      for (const incident of incidents) {
        if (!incident.id || !incident.created_at) continue;
        
        const updates = (incident.incident_updates ?? []).map((u) => ({
          body: u.body ?? "",
          status: u.status ?? "",
          updatedAt: u.updated_at ?? "",
        }));
        
        await db.upsertIncident({
          id: incident.id,
          providerId: provider.id,
          name: incident.name ?? "",
          impact: incident.impact ?? "",
          status: incident.status ?? "",
          createdAt: incident.created_at,
          updatedAt: incident.updated_at ?? incident.created_at,
          resolvedAt: incident.resolved_at,
          updates,
        });
      }
    } catch (_err) {
      // Skip on failure, preserve existing state
    } finally {
      clearTimeout(timeout);
    }
  }
}
