// Vitest unit tests for the pure functions in shared/statusFeeds.ts.
// These run in Node (no DOM), so DOM-touching functions live in the client wrapper.

import { describe, expect, it } from "vitest";
import {
  createIncidentHistory,
  createInitialSnapshot,
  createManualSnapshot,
  deriveIncidentsUrl,
  deriveSnapshot,
  normalizeStatus,
  PROVIDERS,
  summaryStatus,
  type StatusPageIncident,
  type StatusPageSummary,
} from "../statusFeeds";

describe("normalizeStatus", () => {
  it("treats 'none' and 'operational' as operational", () => {
    expect(normalizeStatus("none")).toBe("operational");
    expect(normalizeStatus("operational")).toBe("operational");
  });

  it("treats minor/maintenance/degraded/partial as degraded", () => {
    expect(normalizeStatus("minor")).toBe("degraded");
    expect(normalizeStatus("maintenance")).toBe("degraded");
    expect(normalizeStatus("degraded_performance")).toBe("degraded");
    expect(normalizeStatus("partial_outage")).toBe("degraded");
  });

  it("treats major/critical/major_outage as outage", () => {
    expect(normalizeStatus("major")).toBe("outage");
    expect(normalizeStatus("critical")).toBe("outage");
    expect(normalizeStatus("major_outage")).toBe("outage");
  });

  it("falls back to manual for unknown indicators", () => {
    expect(normalizeStatus(undefined)).toBe("manual");
    expect(normalizeStatus("custom_indicator")).toBe("manual");
  });
});

describe("summaryStatus", () => {
  it("prefers the top-level indicator", () => {
    const summary: StatusPageSummary = {
      status: { indicator: "major" },
      components: [{ status: "operational" }],
    };
    expect(summaryStatus(summary)).toBe("outage");
  });

  it("falls back to worst-of-components when indicator is unknown", () => {
    const summary: StatusPageSummary = {
      status: { indicator: "weird" },
      components: [{ status: "operational" }, { status: "major" }],
    };
    expect(summaryStatus(summary)).toBe("outage");
  });

  it("returns degraded if no outage but a degraded component exists", () => {
    const summary: StatusPageSummary = {
      status: { indicator: "weird" },
      components: [{ status: "operational" }, { status: "minor" }],
    };
    expect(summaryStatus(summary)).toBe("degraded");
  });

  it("returns operational if indicator unknown and all components operational", () => {
    const summary: StatusPageSummary = {
      status: { indicator: "weird" },
      components: [{ status: "operational" }],
    };
    expect(summaryStatus(summary)).toBe("operational");
  });
});


describe("createIncidentHistory", () => {
  function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  it("returns a 30-element array of 'operational' when there are no incidents", () => {
    const history = createIncidentHistory([]);
    expect(history).toHaveLength(30);
    expect(history.every((s) => s === "operational")).toBe(true);
  });

  it("marks the day of an outage as 'outage'", () => {
    const incidents: StatusPageIncident[] = [
      {
        id: "1",
        name: "Test outage",
        impact: "major",
        status: "resolved",
        created_at: isoDaysAgo(2),
        updated_at: isoDaysAgo(2),
        resolved_at: isoDaysAgo(2),
      },
    ];
    const history = createIncidentHistory(incidents);
    expect(history[history.length - 3]).toBe("outage");
  });

  it("marks multi-day incidents across the affected days", () => {
    const incidents: StatusPageIncident[] = [
      {
        id: "1",
        name: "Multi-day",
        impact: "minor",
        status: "resolved",
        created_at: isoDaysAgo(5),
        updated_at: isoDaysAgo(2),
        resolved_at: isoDaysAgo(2),
      },
    ];
    const history = createIncidentHistory(incidents);
    expect(history[history.length - 6]).toBe("degraded");
    expect(history[history.length - 3]).toBe("degraded");
  });

  it("ignores incidents with invalid timestamps", () => {
    const incidents: StatusPageIncident[] = [
      { id: "1", name: "Bad", impact: "major", created_at: "not-a-date", resolved_at: isoDaysAgo(1) },
    ];
    const history = createIncidentHistory(incidents);
    expect(history.every((s) => s === "operational")).toBe(true);
  });
});

describe("createInitialSnapshot", () => {
  it("returns a manual snapshot for providers without a feedUrl", () => {
    const p = PROVIDERS.find((x) => x.id === "google");
    if (!p) throw new Error("google provider should exist");
    const snap = createInitialSnapshot(p);
    expect(snap.status).toBe("manual");
    expect(snap.sourceAvailable).toBe(false);
  });

  it("returns a 'checking' snapshot for providers with a feedUrl", () => {
    const p = PROVIDERS.find((x) => x.id === "openai");
    if (!p) throw new Error("openai provider should exist");
    const snap = createInitialSnapshot(p);
    expect(snap.status).toBe("manual");
    expect(snap.message).toMatch(/Checking/);
  });
});

describe("createManualSnapshot", () => {
  it("uses the provided reason", () => {
    const p = PROVIDERS[0];
    const snap = createManualSnapshot(p, "Test reason");
    expect(snap.message).toBe("Test reason");
    expect(snap.status).toBe("manual");
    expect(snap.sourceAvailable).toBe(false);
    expect(snap.history.every((s) => s === "unknown")).toBe(true);
  });
});

describe("deriveSnapshot", () => {
  it("builds a snapshot from summary + incidents", () => {
    const p = PROVIDERS[0];
    const summary: StatusPageSummary = {
      page: { updated_at: "2024-01-01T00:00:00Z" },
      status: { indicator: "none", description: "All systems normal" },
    };
    const incidents: StatusPageIncident[] = [];
    const snap = deriveSnapshot(p, summary, incidents);
    expect(snap.status).toBe("operational");
    expect(snap.message).toBe("All systems normal");
    expect(snap.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(snap.history).toHaveLength(30);
  });

  it("uses the latest incident update body when available", () => {
    const p = PROVIDERS[0];
    const summary: StatusPageSummary = { status: { indicator: "major" } };
    const incidents: StatusPageIncident[] = [
      {
        id: "1",
        name: "Outage",
        impact: "major",
        status: "identified",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T01:00:00Z",
        incident_updates: [
          { body: "We are investigating.", status: "investigating", updated_at: "2024-01-01T01:00:00Z" },
        ],
      },
    ];
    const snap = deriveSnapshot(p, summary, incidents);
    expect(snap.message).toBe("We are investigating.");
    expect(snap.timestamp).toBe("2024-01-01T01:00:00Z");
  });
});

describe("deriveIncidentsUrl", () => {
  it("replaces summary.json with incidents.json in the pathname", () => {
    expect(deriveIncidentsUrl("https://status.openai.com/api/v2/summary.json")).toBe(
      "https://status.openai.com/api/v2/incidents.json",
    );
  });

  it("preserves query string", () => {
    expect(deriveIncidentsUrl("https://example.com/api/v2/summary.json?x=1")).toBe(
      "https://example.com/api/v2/incidents.json?x=1",
    );
  });

  it("returns undefined for invalid input", () => {
    expect(deriveIncidentsUrl(undefined)).toBeUndefined();
  });
});

describe("PROVIDERS", () => {
  it("has unique ids", () => {
    const ids = new Set(PROVIDERS.map((p) => p.id));
    expect(ids.size).toBe(PROVIDERS.length);
  });

  it("derives an incidentsUrl for every provider with a feedUrl", () => {
    for (const p of PROVIDERS) {
      if (p.feedUrl) {
        expect(p.incidentsUrl, `${p.id} should have an incidentsUrl`).toBeTruthy();
      }
    }
  });
});
