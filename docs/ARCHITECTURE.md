# Mestri Architecture

Mestri is a production-grade AI service status monitoring platform.

```text
Browser
   │
   ▼
Cloudflare Worker
   ├── React/Vite static assets
   ├── API routes
   ├── RSS/Sitemap/Robots
   ├── Embed
   └── Cron handler
          │
          ▼
        D1
   ┌──────┼─────────┐
   │      │         │
Providers State   Incidents
   │
Snapshots
```

## Why Cloudflare Workers
Cloudflare Workers provide a globally distributed, edge-first execution environment. This ensures low-latency responses for the React SPA and status API, while offering native Cron capabilities for scheduled monitoring without managing separate server infrastructure.

## Why D1
D1 is Cloudflare's native serverless SQL database (built on SQLite). It offers fast reads at the edge, seamless integration with Workers via bindings, and zero-configuration scaling, making it ideal for persisting provider state, incidents, and historical snapshots.

## Why Cron
Cloudflare Worker Scheduled events (Cron) are used to autonomously aggregate provider health status every 5 minutes (`*/5 * * * *`). This decouples the heavy lifting of fetching and processing upstream status APIs from user-facing requests, ensuring instantaneous API responses.

## Provider Status Fetching
During the Cron cycle, the Worker iterates through the canonical list of providers and fetches their respective public status JSON APIs (e.g., Atlassian Statuspage). If a provider feed is unreachable, it gracefully degrades to a `manual` state.

## State Transitions & CAS
When a new snapshot is fetched, it is compared against the latest state in D1. The application uses atomic Compare-And-Swap (CAS) `UPSERT` operations to transition provider state. This prevents duplicate snapshot records and ensures race-safe transitions if multiple worker instances execute concurrently.

## Incident Persistence
Upstream incidents are normalized into a standard Mestri format and stored in the `incidents` table using `UPSERT` operations keyed by the original provider's incident ID. This guarantees idempotent updates without duplicating ongoing incidents.

## Frontend Communication
The frontend is a React SPA built with Vite. It fetches aggregated JSON data directly from the Worker API (`/api/status`, `/api/incidents`). API requests are same-origin.

## SPA Fallback
The Cloudflare Worker explicitly intercepts specific API, RSS, and embed routes. All other routes (e.g., `/`, `/changelog`, `/i/:id`) fall through to Cloudflare's Asset serving behavior, which provides a fallback to `index.html` for client-side React Router navigation.

## Embeds
Mestri provides embeddable status widgets (e.g., `/embed/openai`). The Worker dynamically injects the requested provider's state into a lightweight, standalone HTML template directly from the edge, removing the need for the consumer to run JavaScript or React.

## RSS / Sitemap / Robots
The Worker dynamically generates standard `application/rss+xml` and `text/xml` outputs for `/api/feeds/all.xml`, `/sitemap.xml`, and `/robots.txt` using the live D1 data, providing SEO benefits and integrations for external systems.
