import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchProviderSnapshotRemote } from "../statusFetcher";
import { PROVIDERS, ProviderConfig } from "../../shared/statusFeeds";

// Mock the global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("statusFetcher Adapters", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe("xAI (RSS Adapter)", () => {
    const xaiProvider = PROVIDERS.find((p) => p.id === "xai")!;

    it("should return operational when there are no active incidents", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel>
          <item><title>Resolved: All systems go</title><pubDate>Mon, 01 Jan 2026 12:00:00 GMT</pubDate></item>
        </channel></rss>`
      });

      const snapshot = await fetchProviderSnapshotRemote(xaiProvider);
      expect(snapshot.status).toBe("operational");
      expect(snapshot.message).toBe("All systems operational");
    });

    it("should return degraded when an active incident exists", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel>
          <item><title>Degraded performance</title><pubDate>Mon, 01 Jan 2026 12:00:00 GMT</pubDate></item>
        </channel></rss>`
      });

      const snapshot = await fetchProviderSnapshotRemote(xaiProvider);
      expect(snapshot.status).toBe("degraded");
      expect(snapshot.message).toBe("Degraded performance");
    });

    it("should return manual if RSS feed is malformed or throws", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      const snapshot = await fetchProviderSnapshotRemote(xaiProvider);
      expect(snapshot.status).toBe("manual");
      expect(snapshot.message).toBe("Upstream feed unreachable.");
    });
  });

  describe("Hugging Face (RSS Adapter)", () => {
    const hfProvider = PROVIDERS.find((p) => p.id === "huggingface")!;

    it("should handle degraded component", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel>
          <item><title>Inference Endpoints Degraded</title><pubDate>Mon, 01 Jan 2026 12:00:00 GMT</pubDate></item>
        </channel></rss>`
      });

      const snapshot = await fetchProviderSnapshotRemote(hfProvider);
      expect(snapshot.status).toBe("degraded");
    });

    it("should handle critical incident", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel>
          <item><title>Major Outage on Hub</title><pubDate>Mon, 01 Jan 2026 12:00:00 GMT</pubDate></item>
        </channel></rss>`
      });

      const snapshot = await fetchProviderSnapshotRemote(hfProvider);
      // Our RSS adapter logic maps "outage" string to "critical" impact.
      // But status is still "degraded" if it doesn't say "resolved", though we map the word outage:
      // wait, our RSS sets status="degraded" for any active incident. Let's ensure it's degraded.
      expect(snapshot.status).toBe("degraded");
    });
  });

  describe("Mistral (Instatus Adapter)", () => {
    const mistralProvider = PROVIDERS.find((p) => p.id === "mistral")!;

    it("should return operational when UP", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          page: { status: "UP", status_description: "All systems operational" },
          activeIncidents: []
        })
      });

      const snapshot = await fetchProviderSnapshotRemote(mistralProvider);
      expect(snapshot.status).toBe("operational");
    });

    it("should return degraded on HAS_ISSUES", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          page: { status: "HAS_ISSUES", status_description: "Minor API issues" },
          activeIncidents: [{ id: "1", name: "API Issues" }]
        })
      });

      const snapshot = await fetchProviderSnapshotRemote(mistralProvider);
      expect(snapshot.status).toBe("degraded");
      expect(snapshot.message).toBe("Minor API issues");
    });
  });

  describe("Google (Google Cloud Adapter)", () => {
    const googleProvider = PROVIDERS.find((p) => p.id === "google")!;

    it("should ignore irrelevant Google Cloud incidents", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { service_name: "Google Compute Engine", begin: new Date().toISOString() }
        ]
      });

      const snapshot = await fetchProviderSnapshotRemote(googleProvider);
      expect(snapshot.status).toBe("operational");
    });

    it("should report degraded for Gemini incidents", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { service_name: "Gemini API", severity: "medium", begin: new Date().toISOString() }
        ]
      });

      const snapshot = await fetchProviderSnapshotRemote(googleProvider);
      expect(snapshot.status).toBe("degraded");
    });

    it("should report outage for severe Gemini incidents", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { service_name: "Vertex AI", severity: "high", begin: new Date().toISOString() }
        ]
      });

      const snapshot = await fetchProviderSnapshotRemote(googleProvider);
      expect(snapshot.status).toBe("outage");
    });
  });
  
  describe("Manual Providers (Groq, Perplexity)", () => {
    it("should return manual directly", async () => {
      const groqProvider = PROVIDERS.find((p) => p.id === "groq")!;
      const snapshot = await fetchProviderSnapshotRemote(groqProvider);
      expect(snapshot.status).toBe("manual");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
  
  describe("DeepSeek", () => {
    it("should return manual if source unavailable behavior", async () => {
      const deepseekProvider = PROVIDERS.find((p) => p.id === "deepseek")!;
      fetchMock.mockRejectedValueOnce(new Error("DNS Error"));
      const snapshot = await fetchProviderSnapshotRemote(deepseekProvider);
      expect(snapshot.status).toBe("manual");
      expect(snapshot.message).toBe("Upstream feed unreachable.");
    });
  });
});
