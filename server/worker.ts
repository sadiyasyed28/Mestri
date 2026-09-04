import type { D1Database, ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { getWorkerStatus } from "./workerStatus";
import { getWorkerIncidents, getWorkerIncident, refreshWorkerArchive } from "./workerIncidents";
import { getWorkerSubscriptions, createWorkerSubscription, deleteWorkerSubscription } from "./workerNotifications";
import { runMonitoringCycle } from "./cron";

export interface Env {
  DB?: D1Database;
}

function missingDbResponse() {
  return new Response(JSON.stringify({ error: "D1 Database binding missing" }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

function errorResponse(err: any) {
  return new Response(JSON.stringify({ error: err.message }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__worker_health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          worker: true,
          timestamp: new Date().toISOString(),
          message: "Mestri Cloudflare Worker Foundation Active (Phase 1)",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      if (!env.DB) return missingDbResponse();
      try {
        const statuses = await getWorkerStatus(env.DB);
        return new Response(JSON.stringify(statuses), {
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60"
          }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/incidents" && request.method === "GET") {
      if (!env.DB) return missingDbResponse();
      try {
        const providerId = url.searchParams.get("provider") || undefined;
        const incidents = await getWorkerIncidents(env.DB, providerId);
        return new Response(JSON.stringify(incidents), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30",
          },
        });
      } catch (err: any) {
        return errorResponse(err);
      }
    }

    if (url.pathname.startsWith("/api/incidents/") && request.method === "GET") {
      if (!env.DB) return missingDbResponse();
      try {
        const id = url.pathname.replace("/api/incidents/", "");
        const incident = await getWorkerIncident(env.DB, id);
        if (!incident) {
          return new Response(JSON.stringify({ error: "Incident not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(incident), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        });
      } catch (err: any) {
        return errorResponse(err);
      }
    }

    if (url.pathname === "/api/archive/refresh" && request.method === "GET") {
      if (!env.DB) return missingDbResponse();
      try {
        await refreshWorkerArchive(env.DB);
        return new Response(JSON.stringify({ ok: true, timestamp: Date.now() }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return errorResponse(err);
      }
    }

    if (url.pathname === "/api/notifications") {
      if (!env.DB) return missingDbResponse();
      try {
        if (request.method === "GET") {
          const subs = await getWorkerSubscriptions(env.DB);
          return new Response(JSON.stringify(subs), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }
        
        if (request.method === "POST") {
          const body = await request.json() as any;
          const result = await createWorkerSubscription(env.DB, body);
          if ("error" in result) {
            return new Response(JSON.stringify({ error: result.error }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }
          return new Response(JSON.stringify(result), {
            status: 201,
            headers: { "Content-Type": "application/json" }
          });
        }
      } catch (err: any) {
        return errorResponse(err);
      }
    }

    if (url.pathname.startsWith("/api/notifications/") && request.method === "DELETE") {
      if (!env.DB) return missingDbResponse();
      try {
        const id = url.pathname.replace("/api/notifications/", "");
        const result = await deleteWorkerSubscription(env.DB, id);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return errorResponse(err);
      }
    }

    return new Response("Mestri Cloudflare Worker Foundation Active. Visit /__worker_health for worker health check.", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.DB) {
      console.error("Cron Error: D1 Database binding missing");
      return;
    }
    
    try {
      const result = await runMonitoringCycle(env.DB);
      console.log(`Monitoring cycle completed. Providers checked: ${result.providersChecked}, Successful: ${result.successful}, Failed: ${result.failed}, Transitions: ${result.transitions}, Webhooks attempted: ${result.notificationsAttempted}, Failed: ${result.notificationsFailed}`);
    } catch (err: any) {
      console.error("Monitoring cycle failed:", err.message);
    }
  }
};
