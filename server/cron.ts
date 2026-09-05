import type { D1Database } from "@cloudflare/workers-types";
import { createDb } from "./db/index";
import { PROVIDERS } from "../shared/statusFeeds";
import { fetchProviderSnapshotRemote } from "./statusFetcher";
import { getWorkerSubscriptions, deliverWebhook } from "./workerNotifications";
import { refreshWorkerArchive } from "./workerIncidents";

export async function runMonitoringCycle(dbBinding: D1Database): Promise<{
  providersChecked: number;
  successful: number;
  failed: number;
  transitions: number;
  notificationsAttempted: number;
  notificationsFailed: number;
}> {
  const db = createDb(dbBinding);
  let successful = 0;
  let failed = 0;
  let transitions = 0;
  let notificationsAttempted = 0;
  let notificationsFailed = 0;

  // 1. Process incidents updates safely (matches old setInterval 5m logic)
  await refreshWorkerArchive(dbBinding).catch(() => {
    // Isolate failure
  });

  // 2. Load all subscriptions upfront for efficiency
  const allSubscriptions = await getWorkerSubscriptions(dbBinding).catch(() => []);

  // 3. Monitor active providers
  const activeProviders = PROVIDERS.filter((p) => !p.manualOnly);
  
  for (const provider of activeProviders) {
    try {
      // Fetch and normalize status
      const snapshot = await fetchProviderSnapshotRemote(provider);
      
      // Read previous state
      const previous = await db.getProviderState(provider.id);
      
      // Detect transition (ignore first observation for notifications)
      let isTransition = false;
      let shouldNotify = false;
      
      if (!previous) {
        // First observation: just record, no notification.
        isTransition = true; 
        shouldNotify = false;
      } else if (previous.status !== snapshot.status) {
        isTransition = true;
        shouldNotify = true;
      }
      
      // Upsert current state atomically to prevent race conditions
      if (isTransition) {
        const wonRace = await db.compareAndSetProviderState({
          providerId: provider.id,
          status: snapshot.status,
          message: snapshot.message
        }, previous ? previous.status : null);
        
        if (!wonRace) {
          // Another execution already updated this state, abort notification.
          shouldNotify = false;
        } else if (previous) {
          transitions++;
        }
      }
      
      // Persist snapshot (always write a snapshot for successful fetches to track latency/history)
      await db.saveStatusSnapshot(provider.id, {
        providerId: provider.id,
        status: snapshot.status,
        message: snapshot.message,
        timestamp: snapshot.timestamp,
        history: snapshot.history
      });
      
      successful++;
      
      // Process notifications
      if (shouldNotify && previous) {
        const subs = allSubscriptions.filter((s) => s.providerId === provider.id);
        
        const payload = {
          providerId: provider.id,
          oldStatus: previous.status,
          newStatus: snapshot.status,
          message: snapshot.message ?? "",
          mestriUrl: "https://mestri.dev/",
        };
        
        for (const sub of subs) {
          if (sub.channel === "webhook") {
            notificationsAttempted++;
            const ok = await deliverWebhook(sub.target, payload);
            if (!ok) notificationsFailed++;
          }
        }
      }
      
    } catch (_err) {
      // Isolate provider failure
      failed++;
    }
  }

  return {
    providersChecked: activeProviders.length,
    successful,
    failed,
    transitions,
    notificationsAttempted,
    notificationsFailed
  };
}
