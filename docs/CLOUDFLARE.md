# MESTRI — Cloudflare Foundation & Migration Architecture

> **Phase 1 Infrastructure Scaffolding Report**  
> Established on: 2026-09-04  
> Repository: `hameem-codes/Mestri`

---

## 1. Current State

Cloudflare infrastructure tooling and worker entrypoint scaffolding have been added to the repository:

- **`wrangler.toml`**: Configured with Worker entrypoint (`server/worker.ts`), Node.js compatibility flags (`nodejs_compat`), and D1 database binding placeholder (`DB`).
- **`server/worker.ts`**: Initial lightweight Cloudflare Worker entrypoint exposing an isolated health endpoint (`GET /__worker_health`).
- **`server/__tests__/worker.test.ts`**: Unit test suite validating Worker response contracts.

> ⚠️ **Important**: Mestri's existing Express backend (`server/index.ts`) and Vercel configuration (`vercel.json`) have **NOT** been removed or altered. The Express server remains the primary local runtime while Cloudflare infrastructure is scaffolded.

---

## 2. Target Architecture

### User Request Flow (Client & Edge API)
```
React 19 / Vite 7 (Frontend SPA)
       │
       ▼
Cloudflare Worker (Edge API & Static Asset Handler)
       │
       ▼
Cloudflare D1 (Serverless Relational Database)
```

### Automated Monitoring Flow (Cron & Persistence)
```
Cloudflare Cron Triggers (Periodic Schedules)
       │
       ▼
Worker Scheduled Job (`server/worker.ts` scheduled handler)
       │
       ▼
Upstream Provider APIs (OpenAI, Anthropic, Vercel, Supabase, etc.)
       │
       ▼
Cloudflare D1 Database (Incident Archive & Snapshot Persistence)
```

---

## 3. Tooling & Prerequisites

- **Package Manager**: `pnpm` (`v10.4.1`)
- **CLI Tooling**: `wrangler` (`^4.129.0`)
- **TypeScript Types**: `@cloudflare/workers-types` (`^5.20260904.1`)

---

## 4. Local Development Commands

| Task | Command | Description |
| :--- | :--- | :--- |
| **Express Local Dev** | `pnpm run dev` | Runs Vite dev server + Express backend (existing workflow) |
| **Worker Local Preview** | `pnpm run worker:dev` | Runs `wrangler dev server/worker.ts` for local Worker testing |
| **Worker Build Verification** | `pnpm exec wrangler deploy --dry-run` | Validates `wrangler.toml` and Worker compilation |
| **Type Check** | `pnpm run check` | Validates TypeScript across Client, Server, and Worker |
| **Unit Tests** | `pnpm test` | Runs Vitest tests for shared feed logic and Worker health route |
| **Production Build** | `pnpm run build` | Builds Vite client dist and Esbuild Node server bundle |

---

## 5. Separation of Runtimes

- **Express Backend (`server/index.ts`)**: Continues serving `/api/*`, `/embed/*`, `/sitemap.xml`, and static assets during baseline development.
- **Cloudflare Worker (`server/worker.ts`)**: Serves `GET /__worker_health` during Phase 1 scaffolding. Full Express API logic will be systematically migrated to Worker routes in subsequent phases.

Example Health Endpoint Response:
```http
GET /__worker_health
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "status": "ok",
  "worker": true,
  "timestamp": "2026-09-04T23:35:00.000Z",
  "message": "Mestri Cloudflare Worker Foundation Active (Phase 1)"
}
```

---

## 6. Cloudflare Migration Sequence (Phases 2 – 14)

```
[ Phase 1: Infrastructure Scaffolding ] (COMPLETE)
                 │
                 ▼
[ Phase 2: D1 Database Schema & Initial Migrations ]
                 │
                 ▼
[ Phase 3: Database Access Layer (D1 Abstraction) ]
                 │
                 ▼
[ Phase 4: Status API Migration (/api/status & /api/providers) ]
                 │
                 ▼
[ Phase 5: Incident Archive Migration (/api/incidents & /api/incidents/:id) ]
                 │
                 ▼
[ Phase 6: Notifications Migration (/api/notifications) ]
                 │
                 ▼
[ Phase 7: Cron Worker Monitoring (Cloudflare Scheduled Triggers) ]
                 │
                 ▼
[ Phase 8: RSS, Sitemap & Robots Migration (/api/feeds, /sitemap.xml, /robots.txt) ]
                 │
                 ▼
[ Phase 9: Embed Widget & Static Asset Serving ]
                 │
                 ▼
[ Phase 10: Frontend Integration & Endpoint Alignment ]
                 │
                 ▼
[ Phase 11: End-to-End & Integration Verification ]
                 │
                 ▼
[ Phase 12: Production Cloudflare Worker & D1 Deployment ]
                 │
                 ▼
[ Phase 13: Production Verification & Health Audit ]
                 │
                 ▼
[ Phase 14: Documentation, Metrics & Architecture Handover ]
```
