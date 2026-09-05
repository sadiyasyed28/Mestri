# Mestri

> Mestri is a production-grade AI service status monitoring platform that aggregates provider health, incidents, historical status, RSS feeds, embeddable status widgets, and automated monitoring into a single interface.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Ready](https://img.shields.io/badge/deploy-cloudflare-orange?logo=cloudflare)

## Resume Highlights
* **Cloudflare Workers & D1 Migration**: Re-architected an Express-based Node application to a globally distributed edge computing paradigm using Cloudflare Workers and a serverless D1 (SQLite) database, resulting in a single deployment artifact with instantaneous global API reads.
* **Automated Cron Monitoring**: Designed a scheduled monitoring engine running autonomously on `*/5 * * * *` intervals, capturing time-series status metrics and aggregating them from fragmented upstream sources across 8 distinct AI providers into a single normalized data layer.
* **Race-Safe State Transitions**: Implemented strict Compare-And-Swap (CAS) `UPSERT` logic within the database persistence layer to guarantee idempotent updates and prevent duplicated provider states or incidents across concurrent edge executions.
* **Incident Persistence**: Bootstrapped the storage of 125+ historical provider incidents alongside 60+ aggregated point-in-time state snapshots, eliminating the need to re-fetch heavy payload data on every client request.
* **Robust Automated Testing**: Validated edge functionality and API routing via a comprehensive 94-test suite using Vitest (11 suites covering unit, integration, and security checks) against mock Cloudflare environments.

## Key Features
- **Direct Signal Aggregation**: Monitors 8 canonical AI providers (OpenAI, Anthropic, Google, xAI, Mistral, Cohere, Hugging Face, Replicate).
- **Incident History Ledger**: 30-day visual health ledger and detailed historical timelines.
- **Edge Deployment**: Globally distributed execution with Cloudflare Workers.
- **Embeddable Widgets**: Dynamic HTML status widgets via `/embed/:providerId`.
- **Global RSS**: Subscribe to `/api/feeds/all.xml` for unified system alerts.

## Live Demo
Check out the live production deployment at: [https://mestri.mestri.workers.dev](https://mestri.mestri.workers.dev)

## Architecture
Mestri runs entirely on the edge using Cloudflare Workers, serving the React SPA (Vite) from Cloudflare Assets and dynamic API routes from the worker. A background Cron trigger routinely fetches upstream provider feeds and persists the latest state, snapshots, and incidents directly into a Cloudflare D1 database. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full architectural documentation.

## Technology Stack
- **Framework**: [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/)
- **Backend/Edge**: [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono/itty-router alternatives]
- **Database**: [Cloudflare D1 (SQLite)](https://developers.cloudflare.com/d1/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Routing**: [wouter](https://github.com/molefrog/wouter)
- **Testing**: [Vitest](https://vitest.dev/)

## API Overview
Mestri offers several public API endpoints:
- `GET /api/status` - Aggregated status across all providers.
- `GET /api/incidents` - List of active/recent incidents.
- `GET /api/feeds/all.xml` - Aggregated RSS incident feed.
See [docs/API.md](docs/API.md) for the complete API reference.

## Production Deployment
Mestri is deployed natively on Cloudflare. For instructions on deploying your own instance, D1 database provisioning, and Cron configuration, see [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).

## Testing
Mestri maintains rigorous test coverage (94 tests across 11 files) ensuring robust routing, SSRF security validation, database query reliability, and concurrent Cron execution safety.

## Security Considerations
Mestri strictly limits public routes to read-only endpoints. The endpoints for notifications and archive refreshing have been removed. Webhook deliveries (when fully wired up) include internal SSRF validation, private IP blocking, and strict execution timeouts. SQL execution is strictly parameterized.

## Limitations & Future Improvements
Currently, some provider feeds lacking a standard JSON API fallback gracefully to a "manual" state. In addition, real outbound production email and webhook notification delivery have not been exhaustively scaled with live subscriptions, and snapshot growth management requires a D1 automated retention cron job in the future. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for full details.

## License
[MIT](LICENSE)
