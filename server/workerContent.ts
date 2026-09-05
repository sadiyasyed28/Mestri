import type { D1Database } from "@cloudflare/workers-types";
import { createDb, type DbIncident } from "./db/index";
import { PROVIDERS } from "../shared/statusFeeds";

export interface Env {
  DB?: D1Database;
  BASE_URL?: string;
}

function getBaseUrl(request: Request, env: Env): string {
  // Use explicit environment variable if set, otherwise derive from the request origin.
  // This inherently supports local dev (http://localhost:8787) and production domains.
  return env.BASE_URL || new URL(request.url).origin;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSingleRssItem(incident: DbIncident, providerName: string, baseUrl: string): string {
  const description =
    incident.updates
      .slice(0, 3)
      .map((u) => `<p>${escapeXml(u.body)}</p>`)
      .join("") || `<p>${escapeXml(incident.name)}</p>`;

  const lines = [
    "  <item>",
    `    <title>${escapeXml(providerName)} — ${escapeXml(incident.name)}</title>`,
    `    <link>${baseUrl}/i/${encodeURIComponent(incident.id)}</link>`,
    `    <guid isPermaLink="false">${escapeXml(incident.id)}</guid>`,
    `    <pubDate>${new Date(incident.updatedAt).toUTCString()}</pubDate>`,
    `    <category>${escapeXml(incident.status)}</category>`,
    `    <description><![CDATA[${description}]]></description>`,
    "  </item>",
  ];
  return lines.join("\n");
}

function renderRssXml(title: string, description: string, items: string, baseUrl: string): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    `  <title>${title}</title>`,
    `  <link>${baseUrl}/</link>`,
    `  <description>${description}</description>`,
    "  <language>en</language>",
    `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items ? items : "",
    "</channel>",
    "</rss>",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function handleFeedsAll(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return new Response("Database binding missing", { status: 500 });
  const db = createDb(env.DB);
  const baseUrl = getBaseUrl(request, env);
  
  try {
    const incidents = await db.getIncidents();
    const items = incidents.slice(0, 50).map(inc => {
      const provider = PROVIDERS.find(p => p.id === inc.providerId);
      const providerName = provider ? provider.name : inc.providerId;
      return buildSingleRssItem(inc, providerName, baseUrl);
    }).join("\n");
    
    const xml = renderRssXml("mestri — all incidents", "Aggregated incident feed across all monitored AI providers.", items, baseUrl);
    
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err: any) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function handleFeedsProvider(request: Request, env: Env, providerIdExt: string): Promise<Response> {
  if (!env.DB) return new Response("Database binding missing", { status: 500 });
  const db = createDb(env.DB);
  const baseUrl = getBaseUrl(request, env);
  
  const providerId = providerIdExt.replace(/\.xml$/, "");
  
  try {
    const incidents = await db.getIncidents(providerId);
    const provider = PROVIDERS.find(p => p.id === providerId);
    const providerName = provider ? provider.name : providerId;
    
    const items = incidents.slice(0, 50).map(inc => {
      return buildSingleRssItem(inc, providerName, baseUrl);
    }).join("\n");
    
    const xml = renderRssXml(`mestri — ${escapeXml(providerName)} incidents`, `Incident feed for ${escapeXml(providerName)}.`, items, baseUrl);
    
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err: any) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function handleSitemap(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return new Response("Database binding missing", { status: 500 });
  const db = createDb(env.DB);
  const baseUrl = getBaseUrl(request, env);
  
  try {
    const incidents = await db.getIncidents();
    
    const staticUrls = ["/", "/changelog"]
      .map(
        (urlPath) =>
          `<url><loc>${baseUrl}${urlPath}</loc><changefreq>daily</changefreq><priority>${urlPath === "/" ? "1.0" : "0.5"}</priority></url>`
      )
      .join("\n");
      
    const incidentUrls = incidents
      .slice(0, 5000)
      .map(
        (i) =>
          `<url><loc>${baseUrl}/i/${encodeURIComponent(i.id)}</loc><lastmod>${new Date(i.updatedAt).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`
      )
      .join("\n");
      
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      staticUrls,
      incidentUrls,
      "</urlset>",
    ];
    
    return new Response(lines.filter(Boolean).join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (err: any) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function handleRobots(request: Request, env: Env): Promise<Response> {
  const baseUrl = getBaseUrl(request, env);
  const text = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
  
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
