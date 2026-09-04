import { describe, it, expect, vi } from "vitest";
import worker from "../worker";
import type { ExecutionContext } from "@cloudflare/workers-types";

describe("Cloudflare Worker Foundation (Phase 1)", () => {
  it("exports fetch handler", () => {
    expect(worker.fetch).toBeDefined();
    expect(typeof worker.fetch).toBe("function");
  });

  it("handles /__worker_health request", async () => {
    const req = new Request("http://localhost/__worker_health");
    const ctx = {} as ExecutionContext;
    const res = await worker.fetch(req, {}, ctx);

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json).toHaveProperty("status", "ok");
    expect(json.worker).toBe(true);
  });

  it("returns default status message for /__worker_health request", async () => {
    const req = new Request("http://localhost/__worker_health");
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    };
    const res = await worker.fetch(req, {}, ctx as any);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Mestri Cloudflare Worker Foundation Active");
  });
});
