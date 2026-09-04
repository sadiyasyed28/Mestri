import { describe, expect, it } from "vitest";
import worker from "../worker";

describe("Cloudflare Worker Foundation (Phase 1)", () => {
  it("returns HTTP 200 OK JSON for /__worker_health", async () => {
    const req = new Request("http://localhost/__worker_health");
    const ctx = {} as ExecutionContext;
    const res = await worker.fetch(req, {}, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const json = (await res.json()) as { status: string; worker: boolean };
    expect(json.status).toBe("ok");
    expect(json.worker).toBe(true);
  });

  it("returns default status message for root / request", async () => {
    const req = new Request("http://localhost/");
    const ctx = {} as ExecutionContext;
    const res = await worker.fetch(req, {}, ctx);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Mestri Cloudflare Worker Foundation Active");
  });
});
