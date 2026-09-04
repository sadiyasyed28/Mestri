// Tiny static sitemap (Phase 2.2 SEO).

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INCIDENTS_FILE = path.resolve(__dirname, "..", "data", "incidents.json");

type StoredIncident = {
  id: string;
  updatedAt: string;
};

export async function buildSitemap(): Promise<string> {
  let incidents: StoredIncident[] = [];
  try {
    const raw = await fs.readFile(INCIDENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoredIncident[];
    if (Array.isArray(parsed)) incidents = parsed;
  } catch {
    incidents = [];
  }

  const base = "https://mestri.dev";
  const staticUrls = ["/", "/changelog"]
    .map(
      (path) =>
        `<url><loc>${base}${path}</loc><changefreq>daily</changefreq><priority>${path === "/" ? "1.0" : "0.5"}</priority></url>`,
    )
    .join("\n");

  const incidentUrls = incidents
    .slice(0, 5000)
    .map(
      (i) =>
        `<url><loc>${base}/i/${i.id}</loc><lastmod>${new Date(i.updatedAt).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${incidentUrls}
</urlset>`;
}
