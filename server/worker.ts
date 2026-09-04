import type { D1Database, ExecutionContext, ScheduledController, Fetcher } from "@cloudflare/workers-types";
import { getWorkerStatus } from "./workerStatus";
import { getWorkerIncidents, getWorkerIncident, refreshWorkerArchive } from "./workerIncidents";
import { getWorkerSubscriptions, createWorkerSubscription, deleteWorkerSubscription } from "./workerNotifications";
import { handleFeedsAll, handleFeedsProvider, handleSitemap, handleRobots } from "./workerContent";
import { runMonitoringCycle } from "./cron";

export interface Env {
  DB?: D1Database;
  ASSETS?: Fetcher;
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

    // --- Phase 8: Content Surfaces ---
    if (request.method === "GET") {
      if (url.pathname === "/api/feeds/all.xml") {
        return handleFeedsAll(request, env);
      }
      if (url.pathname.startsWith("/api/feeds/") && url.pathname.endsWith(".xml")) {
        const providerIdExt = url.pathname.replace("/api/feeds/", "");
        return handleFeedsProvider(request, env, providerIdExt);
      }
      if (url.pathname === "/sitemap.xml") {
        return handleSitemap(request, env);
      }
      if (url.pathname === "/robots.txt") {
        return handleRobots(request, env);
      }
    }

    // --- Phase 9: Embed Pages ---
    if (request.method === "GET" && url.pathname.startsWith("/embed/")) {
      const html = `<!doctype html><meta charset="utf-8"><title>mestri embed</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:8px;background:#f5f4ef;color:#18201b}
a{color:inherit;text-decoration:none}
.row{display:flex;align-items:center;gap:8px}
.dot{width:8px;height:8px;border-radius:50%}
.s{font-family:"IBM Plex Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
</style>
<div id="mestri-embed">Loading…</div>
<script>
(async()=>{
  try{
    const r=await fetch("/api/status");
    const j=await r.json();
    const s=j[location.pathname.split("/").pop()]||{status:"manual",message:"Feed unavailable",sourceUrl:"#"};
    const colors={operational:"#9bc440",degraded:"#d6a348",outage:"#d76750",manual:"#7c817b"};
    document.getElementById("mestri-embed").innerHTML=
      '<div class="row"><span class="dot" style="background:'+colors[s.status]+'"></span>'+
      '<span class="s">'+s.status+'</span></div>'+
      '<a href="'+s.sourceUrl+'" target="_blank" rel="noreferrer">'+ (s.message||"") +'</a>';
  }catch(e){document.getElementById("mestri-embed").textContent="Embed unavailable";}
})();
</script>`;
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60"
        }
      });
    }

    // Default 404 for unhandled API routes in Worker
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // --- Phase 9: Static Assets & SPA Fallback ---
    if (env.ASSETS && request.method === "GET") {
      try {
        // 1. Attempt to fetch the exact asset
        const assetResponse = await env.ASSETS.fetch(request as any);
        if (assetResponse.status < 400) {
          return assetResponse as unknown as Response;
        }
        
        // 2. SPA Fallback: If not found, and it's not a static file request (no extension), serve index.html
        if (!url.pathname.match(/\.[a-zA-Z0-9]+$/)) {
          const fallbackRequest = new Request(new URL("/index.html", request.url).toString(), request as any);
          const fallbackResponse = await env.ASSETS.fetch(fallbackRequest as any);
          if (fallbackResponse.status < 400) {
            return fallbackResponse as unknown as Response;
          }
        }
      } catch (err: any) {
        console.error("Asset fetch error:", err.message);
      }
    }

    return new Response("Not found", { status: 404 });
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
