import { createDb } from "./db/index";
import { PROVIDERS, type ProviderConfig, type ProviderSnapshot } from "../shared/statusFeeds";
import { fetchProviderSnapshotRemote } from "./statusFetcher";
import type { D1Database } from "@cloudflare/workers-types";

type CacheEntry = { fetchedAt: number; snapshot: ProviderSnapshot };
const CACHE_TTL_MS = 60000;
const workerCache = new Map<string, CacheEntry>();

export function clearWorkerCacheForTesting() {
  workerCache.clear();
}

export async function getWorkerStatus(dbBinding: D1Database): Promise<Record<string, ProviderSnapshot>> {
  const db = createDb(dbBinding);
  
  const entries = await Promise.all(
    PROVIDERS.map(async (provider) => {
      let snapshot: ProviderSnapshot | null = null;
      let fromDb = false;
      
      // 1. Check in-memory cache
      const cached = workerCache.get(provider.id);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        snapshot = cached.snapshot;
      }
      
      // 2. Check D1 for recent snapshot (survives cold starts)
      if (!snapshot) {
         const latest = await db.getLatestStatus(provider.id);
         if (latest) {
           const age = Date.now() - new Date(latest.createdAt).getTime();
           if (age < CACHE_TTL_MS) {
             snapshot = {
               status: latest.status,
               message: latest.message,
               timestamp: latest.timestamp,
               history: latest.history,
               sourceAvailable: !provider.manualOnly && !!provider.feedUrl
             };
             fromDb = true;
             workerCache.set(provider.id, { fetchedAt: Date.now() - age, snapshot });
           }
         }
      }
      
      // 3. Fetch fresh from upstream if needed
      if (!snapshot) {
        snapshot = await fetchProviderSnapshotRemote(provider);
        
        // 4. Persist to D1 provider_state and status_snapshots
        const state = await db.getProviderState(provider.id);
        const hasStateChanged = !state || state.status !== snapshot.status || state.message !== snapshot.message;
        
        if (hasStateChanged) {
           await db.upsertProviderState({
             providerId: provider.id,
             status: snapshot.status,
             message: snapshot.message
           });
        }
        
        // Avoid duplicate snapshots: only save if status changed or it's been at least 60s
        // We know it's been at least 60s because we missed the D1 check above
        await db.saveStatusSnapshot(provider.id, {
           providerId: provider.id,
           status: snapshot.status,
           message: snapshot.message,
           timestamp: snapshot.timestamp,
           history: snapshot.history
        });
        
        // Update memory cache
        workerCache.set(provider.id, { fetchedAt: Date.now(), snapshot });
      }
      
      return [provider.id, snapshot] as const;
    })
  );
  
  return Object.fromEntries(entries);
}
