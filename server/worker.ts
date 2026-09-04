import type { D1Database } from "@cloudflare/workers-types";
import { getWorkerStatus } from "./workerStatus";

export interface Env {
  DB?: D1Database;
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
      if (!env.DB) {
        return new Response(JSON.stringify({ error: "D1 Database binding missing" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
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

    return new Response("Mestri Cloudflare Worker Foundation Active. Visit /__worker_health for worker health check.", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
