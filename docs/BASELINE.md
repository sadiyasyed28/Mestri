# MESTRI — Project Baseline & Architecture Audit

> **Phase 0 Audit Report**  
> Established on: 2026-09-04  
> Repository: `hameem-codes/Mestri`

---

## 1. Project Overview & Framework Identifiers

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + Vite 7 | `react`, `react-dom`, `@vitejs/plugin-react`, `@tailwindcss/vite` |
| **Routing (Client)** | Wouter 3 | Lightweight client router (`Switch`, `Route`, `Link`) |
| **Styling & UI** | Vanilla CSS + Tailwind CSS v4 | Curated dark mode design system in `client/src/index.css` |
| **Backend Framework** | Express 4 (Node.js ESM) | Native ESM (`"type": "module"`) running on Node 20/24 |
| **Data Storage** | Local JSON Files | Disk persistence in `data/*.json` + in-memory Map caches |
| **Build System** | Vite + Esbuild | `vite build` (client -> `dist`) & `esbuild` (server -> `dist-server`) |
| **Test Runner** | Vitest | 22 unit tests covering shared status feed logic |

---

## 2. Directory Structure

```
Mestri/
├── .vscode/
│   └── settings.json          # Workspace IDE linter configuration
├── client/
│   ├── index.html             # HTML entrypoint
│   ├── public/                # Static assets (brand marks, background textures, CHANGELOG.md)
│   └── src/
│       ├── App.tsx            # App root, ThemeProvider, Wouter client routes
│       ├── main.tsx           # React DOM hydration entry point
│       ├── index.css          # CSS design tokens & base rules
│       ├── components/        # ErrorBoundary, Radix UI slots/tooltips, Sonner toast
│       ├── contexts/          # ThemeContext (pure dark mode state)
│       ├── lib/               # Client-side status feed fetcher & utils
│       └── pages/             # Home, Incident detail, Changelog, NotFound
├── data/                      # Local filesystem persistent storage (JSON)
│   ├── incidents.json         # Historical incident archive
│   ├── subscriptions.json     # Notification email & webhook subscriptions
│   └── last-status.json       # State transition tracking for notification triggers
├── docs/
│   └── BASELINE.md            # Phase 0 Baseline Audit Report (this document)
├── server/
│   ├── index.ts               # Express server bootstrap, static handler, embed/robots routes
│   └── routes/
│       ├── status.ts          # Provider status snapshots, caching, background worker, archive
│       ├── feeds.ts           # RSS 2.0 XML endpoints (/all.xml, /:providerId.xml)
│       ├── notifications.ts   # Webhook/email subscription CRUD & transition detection
│       └── sitemap.ts         # Dynamic XML sitemap generator
├── shared/
│   ├── statusFeeds.ts         # Shared provider configs, status derivation, manual fallbacks
│   └── __tests__/
│       └── statusFeeds.test.ts # Vitest suite verifying feed parsing & state logic
├── package.json               # Node dependencies and build scripts
├── tsconfig.json              # TypeScript compiler configuration (react-jsx)
├── vite.config.ts             # Vite bundler config
├── vitest.config.ts           # Vitest test runner config
└── vercel.json                # Vercel SPA rewrite fallback configuration
```

---

## 3. Current API Routes

| HTTP Method | Route | Description | Source File | Cache / Storage |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/status` | Returns live status snapshots for all monitored providers | `server/routes/status.ts` | 60s in-memory cache |
| `GET` | `/api/providers` | Returns provider metadata array (IDs, URLs, monograms) | `server/routes/status.ts` | 300s cache |
| `GET` | `/api/incidents` | Returns incident archive (all or `?provider=id`) | `server/routes/status.ts` | Reads `data/incidents.json` |
| `GET` | `/api/incidents/:id` | Returns single incident detail by ID | `server/routes/status.ts` | Reads `data/incidents.json` |
| `GET` | `/api/archive/refresh` | Triggers background worker fetch of upstream feeds | `server/routes/status.ts` | Writes `data/incidents.json` |
| `GET` | `/api/feeds/all.xml` | RSS 2.0 XML feed of all incidents across providers | `server/routes/feeds.ts` | Derived from `data/incidents.json` |
| `GET` | `/api/feeds/:id.xml` | RSS 2.0 XML feed for a specific provider | `server/routes/feeds.ts` | Derived from `data/incidents.json` |
| `GET` | `/api/notifications` | Returns active webhook & email subscriptions | `server/routes/notifications.ts` | Reads `data/subscriptions.json` |
| `POST` | `/api/notifications` | Registers new notification subscription | `server/routes/notifications.ts` | Writes `data/subscriptions.json` |
| `DELETE` | `/api/notifications/:id` | Cancels subscription by ID | `server/routes/notifications.ts` | Writes `data/subscriptions.json` |
| `GET` | `/embed/:providerId` | Returns standalone HTML widget for iframe embedding | `server/index.ts` | Dynamic HTML response |
| `GET` | `/sitemap.xml` | Dynamically generates XML sitemap for SEO | `server/routes/sitemap.ts` | Reads `data/incidents.json` |
| `GET` | `/robots.txt` | Returns static robots directive pointing to sitemap | `server/index.ts` | Text response |

---

## 4. Current Data Flow

```
[ External Status Pages ] (OpenAI, Anthropic, Vercel, Supabase, GitHub, Cloudflare)
         │
         ▼ (HTTPS Fetch)
[ server/routes/status.ts ] ──(In-Memory Cache)──► GET /api/status ──► Client Home.tsx
         │
         ├─► Writes data/incidents.json ──► GET /api/incidents ──► Client Incident.tsx
         │                               ├─► GET /api/feeds/*.xml (RSS)
         │                               └─► GET /sitemap.xml
         │
         └─► detectAndDeliver()
                   │
                   ├─► Writes data/last-status.json
                   └─► Reads data/subscriptions.json ──► Webhook POST Delivery
```

---

## 5. Deployment Assumptions & Environment

- **Target Execution**: Standard Node.js long-running server (`process.env.PORT` or default `3000`).
- **Process Lifecycle**: Relies on `setInterval` inside Node.js process space for background archive refresh (`5 min` cadence).
- **Filesystem Access**: Requires write permissions to `./data` directory relative to project root.
- **Static Hosting (Vercel)**: `vercel.json` provides a fallback rewrite (`/(.*) -> /index.html`) for client-only deployments, but full backend persistence features currently expect a Node server process.

---

## 6. Files That Write to Disk

The following files perform direct Node.js `fs` write calls to disk:

1. **`server/routes/status.ts`**
   - Function: `writeArchive()`
   - Target: `data/incidents.json`
   - Purpose: Persists upstream incident updates into local JSON archive.
2. **`server/routes/notifications.ts`**
   - Function: `writeJson()`
   - Target: `data/subscriptions.json`, `data/last-status.json`
   - Purpose: Saves subscriber endpoints and provider transition states.

---

## 7. Migration Candidates (for Serverless / Edge Migration)

When migrating to serverless (e.g. Cloudflare Workers, Vercel Serverless, D1, KV):

| File | Current Implementation | Required Migration Target |
| :--- | :--- | :--- |
| `server/routes/status.ts` | `fs.readFile` / `fs.writeFile` for `incidents.json` + `new Map()` cache | KV / D1 database for snapshot storage & archive queries |
| `server/routes/notifications.ts` | `fs.readFile` / `fs.writeFile` for `subscriptions.json` & `last-status.json` | D1 database / KV store for subscription records |
| `server/index.ts` | Express `app.listen()` + Node `setInterval` worker | Cloudflare Worker / Serverless handlers + Scheduled Cron triggers |
| `server/routes/feeds.ts` | Reads `data/incidents.json` via Node `fs` | Queries KV/D1 database layer for RSS rendering |
| `server/routes/sitemap.ts` | Reads `data/incidents.json` via Node `fs` | Queries KV/D1 database layer for sitemap XML rendering |

---

## 8. Baseline Verification Results

- **Type-Check Verification (`pnpm run check`)**: `0 errors` (Clean)
- **Unit Test Verification (`pnpm test`)**: `22 / 22 tests passing` (Clean)
- **Production Build Verification (`pnpm run build`)**: Vite client build & Esbuild server bundle completed with exit code `0`.
