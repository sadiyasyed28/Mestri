import type { D1Database } from "@cloudflare/workers-types";
import { getWorkerStatus } from "./workerStatus";
import { getWorkerIncidents, getWorkerIncident, refreshWorkerArchive } from "./workerIncidents";

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
        // We aren't doing the 30s throttle here for simplicity, 
        // D1 operations are safe and idempotent.
        await refreshWorkerArchive(env.DB);
        return new Response(JSON.stringify({ ok: true, timestamp: Date.now() }), {
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
};
