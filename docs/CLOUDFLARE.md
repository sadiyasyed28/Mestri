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

---

## 7. Database Schema (D1)

The following schema is implemented for D1 (Phase 2):

- **`providers`**: Static provider configuration (`id`, `name`, `service`, `source_url`, `feed_url`, `incidents_url`, `accent`, `monogram`, `manual_only`).
- **`status_snapshots`**: Rolling cache of fetch results per provider (`id`, `provider_id`, `status`, `message`, `timestamp`, `history` JSON array, `created_at`).
- **`incidents`**: Persistent incident archive (`id`, `provider_id`, `name`, `impact`, `status`, `created_at`, `updated_at`, `resolved_at`, `updates` JSON array).
- **`subscriptions`**: Notification targets (`id`, `provider_id`, `channel`, `target`, `created_at`).
- **`provider_state`**: Previous state records for transition detection and alerts (`provider_id`, `status`, `message`, `updated_at`).

---

## 8. Database Access Layer (Phase 3)

The D1 database abstraction layer has been implemented at **`server/db/index.ts`**. 

**Dependency Injection:** 
The database connection is not global. Worker routes and cron jobs instantiate the DB layer by passing the Cloudflare `D1Database` binding environment variable:
```typescript
import { createDb } from "./db/index";
const db = createDb(env.DB);
```

**Available Operations:**
- **Providers**: `getProviders`, `getProvider`, `upsertProvider`
- **Status Snapshots**: `saveStatusSnapshot`, `getStatusHistory`, `getLatestStatus`
- **Incidents**: `getIncidents`, `getIncident`, `upsertIncident`
- **Subscriptions**: `getSubscriptions`, `getSubscription`, `createSubscription`, `deleteSubscription`
- **Provider State**: `getProviderState`, `upsertProviderState`

> The existing Express routes continue to use JSON filesystem persistence for now. Route migration will happen progressively in subsequent phases. This abstraction layer simply prepares the underlying D1 interface for that future migration.

---

## 9. Status System Migration (Phase 4)

The Cloudflare Worker now actively processes the `GET /api/status` endpoint, acting as a functional edge layer while maintaining strict response contract compatibility with the existing frontend. 

**Persistence Strategy:**
- **`provider_state`**: Replaces the persistence role of `data/last-status.json` in the Worker runtime. It tracks the latest status transition and ensures fast state recovery across Worker cold starts and deployments.
- **`status_snapshots`**: Persists all successful checks that contribute to the historical log, replacing the need for an in-memory-only or JSON-bound archive log.
- **Cache Behavior**: D1 serves as the absolute source of truth. An optional, short-lived (60s TTL) memory map caches the latest results within an isolate to prevent redundant upstream fetches, mirroring the original Express backend behavior.
- **30-Day History**: History retrieval remains strictly bounded to approximately 30 days of retained snapshots (per the original `UNKNOWN_HISTORY` length).

**Express/Worker Boundary:**
The existing Express backend (serving `server/index.ts`) safely remains active using the legacy JSON filesystem. The Cloudflare Worker handles its own independent persistence via D1. There is no bidirectional synchronization between the two—each operates independently in its respective runtime.

**Derivable Real Metrics:**
With D1 active for status persistence, the following operational metrics can now be accurately derived directly via SQL (without fabricating data):
- Total number of monitored providers (`SELECT COUNT(*) FROM providers`)
- Total number of successful/failed status checks over time (`SELECT COUNT(*) FROM status_snapshots`)
- Availability tracking (by joining `provider_state` and `status_snapshots`)

---

## 10. Incident Archive Migration (Phase 5)

The Cloudflare Worker now natively handles the incident archive layer, serving historical incident data from the D1 database while preserving full API and JSON contract compatibility.

**Persistence Strategy:**
- **`incidents` table**: The D1 database is the new persistent source of truth for the Cloudflare Worker runtime. Incident persistence uses stable unique identifiers (the provider's upstream incident ID) to ensure all writes are strictly idempotent.
- **Deduplication**: When `GET /api/archive/refresh` triggers an upstream fetch, `ON CONFLICT(id) DO UPDATE` ensures existing incidents simply update their timelines and statuses instead of duplicating.
- **Nested Updates**: Nested JSON arrays representing incident updates (timelines) are stored in D1 as stringified JSON and transparently parsed back into the exact structural shape the frontend expects.

**Worker Endpoints Implemented:**
- `GET /api/incidents`: Retrieves the global incident log (optionally filtered by `?provider=...`), appending the expected `providerName` field dynamically via a relational lookup without requiring schema denormalization.
- `GET /api/incidents/:id`: Retrieves a specific incident by its unique ID.
- `GET /api/archive/refresh`: Manually triggers the upstream provider API incident fetch sequence and syncs the results into D1.

**Express/Worker Boundary:**
Just like Phase 4, `data/incidents.json` remains completely untouched. The Express backend still reads/writes exclusively to the filesystem, while the Cloudflare Worker exclusively accesses D1.

**Derivable Real Metrics:**
With D1 active for incident persistence, the following operational metrics can now be accurately derived directly via SQL:
- Total historical incidents tracked (`SELECT COUNT(*) FROM incidents`)
- Incident severity distribution (`SELECT impact, COUNT(*) FROM incidents GROUP BY impact`)
- Currently active/unresolved incidents (`SELECT COUNT(*) FROM incidents WHERE resolved_at IS NULL`)
- Incidents by provider (`SELECT provider_id, COUNT(*) FROM incidents GROUP BY provider_id`)
