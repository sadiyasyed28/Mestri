# Mestri
> **AI service availability — The signal, not the speculation.**

Mestri is a production-grade AI service status monitoring platform that aggregates provider health, incidents, historical status, RSS feeds, embeddable status widgets, and automated monitoring into a single interface.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Ready](https://img.shields.io/badge/deploy-cloudflare-orange?logo=cloudflare)

## Live Demo
Check out the live production deployment at: [https://mestri.mestri.workers.dev](https://mestri.mestri.workers.dev)

## What Mestri Does
Mestri acts as a deterministic availability ledger for top AI platforms (OpenAI, Anthropic, xAI, Google AI Studio, Mistral, Cohere, Hugging Face, Replicate). It replaces manual checking of fragmented status pages by autonomously polling provider feeds and persisting normalized point-in-time snapshots and incidents to an edge database.

## Key Features
- **Direct Signal Aggregation**: Unifies 8 canonical AI provider status feeds.
- **Incident History Ledger**: 30-day visual health ledger and detailed historical timelines.
- **Automated Monitoring**: Background scheduled polling keeps data fresh without blocking client requests.
- **Embeddable Widgets**: Dynamic HTML status widgets via `/embed/:providerId`.
- **Global RSS**: Subscribe to `/api/feeds/all.xml` for unified system alerts.

## Architecture
Mestri runs entirely on the edge. A background Cron trigger routinely fetches upstream provider feeds and persists the latest state, snapshots, and incidents directly into a Cloudflare D1 database using race-safe `UPSERT` logic. The React SPA (Vite) is served from Cloudflare Assets, and dynamic API routes are handled by the worker—ensuring instantaneous global API reads.

## Tech Stack
- **Framework**: [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/)
- **Backend/Edge**: [Cloudflare Workers](https://workers.cloudflare.com/) 
- **Database**: [Cloudflare D1 (SQLite)](https://developers.cloudflare.com/d1/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Routing**: [wouter](https://github.com/molefrog/wouter)
- **Testing**: [Vitest](https://vitest.dev/)

## Production Metrics
*As of September 2026:*
- **Providers Monitored**: 8
- **Historical Incidents**: 125+
- **Production Snapshots**: 60+ (and growing autonomously)
- **Cron Interval**: Every 5 minutes (`*/5 * * * *`)

## Security & Reliability
Mestri is built with edge safety in mind:
- **Provider Failure Isolation**: Unreachable upstream feeds gracefully degrade to a `manual` state without failing the aggregation pipeline.
- **Race-Safe State**: Strict Compare-And-Swap (CAS) ensures concurrent Cron invocations don't duplicate data.
- **SSRF Protection**: Internal validation prevents Server-Side Request Forgery on webhook targets.
- **Webhook Timeouts**: Outbound dispatch is strictly capped at 5 seconds.
- **SQL Parameterization**: Zero dynamic SQL injection risk.

## Testing
Mestri maintains rigorous test coverage ensuring robust routing, SSRF security validation, database query reliability, and concurrent edge execution safety:
- **94 Automated Tests** (across 11 Vitest suites)
- **0 TypeScript Errors** on strict checking

## API Overview
Mestri offers read-only public API endpoints:
- `GET /api/status` - Aggregated status across all providers.
- `GET /api/incidents` - List of active/recent incidents.
- `GET /api/feeds/all.xml` - Aggregated RSS incident feed.

*(Note: Legacy notification and archive refresh endpoints have been fully removed from public routing.)*

## Known Limitations
- Some provider feeds lacking a standard JSON API fallback gracefully to a "manual" state.
- The Worker's in-memory cache is isolate-local and not globally synchronized.
- Real outbound production email and webhook notification deliveries are implemented but have not been exhaustively scaled with live external subscriber traffic.

## Resume Highlights
* **Cloudflare Workers & D1 Migration**: Re-architected a Node application to a globally distributed edge computing paradigm using Cloudflare Workers and a serverless D1 database, resulting in a single deployment artifact with instantaneous global API reads.
* **Automated Cron Monitoring**: Designed an autonomous monitoring engine running on a 5-minute interval, aggregating fragmented upstream sources into a single normalized data layer.
* **Concurrency & Safety**: Implemented strict Compare-And-Swap (CAS) `UPSERT` logic within the database persistence layer to guarantee idempotent updates and prevent duplicated provider states or incidents.
* **Robust Automated Testing**: Validated edge functionality and API routing via a comprehensive 94-test suite (11 suites covering unit, integration, and security checks) against mock Cloudflare environments.

## Future Improvements
- Implement an automated D1 retention cron job to safely prune status snapshots older than 30 days.
- Build a secure frontend for users to manage, verify, and unsubscribe from notifications using signed JWT tokens.

---
[MIT License](LICENSE)
