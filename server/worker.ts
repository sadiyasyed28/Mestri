export interface Env {
  DB?: D1Database;
}

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
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

    return new Response("Mestri Cloudflare Worker Foundation Active. Visit /__worker_health for worker health check.", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
