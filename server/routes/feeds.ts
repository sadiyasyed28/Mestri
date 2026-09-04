// RSS / Atom feeds (Phase 2.1).
// Two surfaces:
//   GET /api/feeds/all.xml      - every incident across every provider
//   GET /api/feeds/:providerId.xml - per-provider feed
//
// Both are minimal RSS 2.0 with a proper <lastBuildDate>. Items are derived
// from the persistent incident archive (built by routes/status.ts).

import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INCIDENTS_FILE = path.resolve(__dirname, "..", "data", "incidents.json");

type StoredIncident = {
  providerId: string;
  providerName: string;
  id: string;
  name: string;
  impact: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  updates: Array<{ body: string; status: string; updatedAt: string }>;
};

async function readArchive(): Promise<StoredIncident[]> {
  try {
    const raw = await fs.readFile(INCIDENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoredIncident[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildItems(incidents: StoredIncident[], providerFilter?: string): string {
  const filtered = providerFilter ? incidents.filter((i) => i.providerId === providerFilter) : incidents;
  return filtered
    .slice(0, 50)
    .map((incident) => {
      const description =
        incident.updates
          .slice(0, 3)
          .map((u) => `<p>${escapeXml(u.body)}</p>`)
          .join("") ||
        `<p>${escapeXml(incident.name)}</p>`;
      return `<item>
    <title>${escapeXml(incident.providerName)} — ${escapeXml(incident.name)}</title>
    <link>https://mestri.dev/i/${escapeXml(incident.id)}</link>
    <guid isPermaLink="false">${escapeXml(incident.id)}</guid>
    <pubDate>${new Date(incident.updatedAt).toUTCString()}</pubDate>
    <category>${escapeXml(incident.status)}</category>
    <description><![CDATA[${description}]]></description>
  </item>`;
    })
    .join("\n");
}

export const feedRouter = Router();

feedRouter.get("/all.xml", async (_req, res) => {
  const archive = await readArchive();
  const items = buildItems(archive);
  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=60");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>mestri — all incidents</title>
  <link>https://mestri.dev/</link>
  <description>Aggregated incident feed across all monitored AI providers.</description>
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${items}
</channel>
</rss>`);
});

feedRouter.get("/:providerId.xml", async (req, res) => {
  const archive = await readArchive();
  const providerId = req.params.providerId.replace(/\.xml$/, "");
  const providerName = archive.find((i) => i.providerId === providerId)?.providerName ?? providerId;
  const items = buildItems(archive, providerId);
  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=60");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>mestri — ${escapeXml(providerName)} incidents</title>
  <link>https://mestri.dev/</link>
  <description>Incident feed for ${escapeXml(providerName)}.</description>
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${items}
</channel>
</rss>`);
});
