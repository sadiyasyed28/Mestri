# mestri — Free-Tier Backend Plan (Option A)

> A zero-cost deployment plan that keeps **every** existing mestri function working,
> with **no surprise bills** and **no credit card on file**.
>
> Scope of this document: the backend only. Frontend changes are noted where they
> are required for a function to keep working, but no visual redesign is included.

---

## 1. The Constraint

- **Total monthly cost must be $0.** Not "$0 within free trial", not "$0 for the
  first year". $0 forever, on the hobby tier of whatever we pick.
- **Every existing function must keep working**, including:
  - `/api/status` (live provider snapshots, 60 s cache, 30-day history)
  - `/api/providers` (provider metadata)
  - `/api/incidents` and `/api/incidents/:id` (incident archive)
  - `/api/feeds/all.xml` and `/api/feeds/:providerId.xml` (RSS)
  - `/api/notifications` POST / GET / DELETE (subscriptions)
  - Transition detection + webhook delivery
  - `/sitemap.xml`
  - `/robots.txt`
  - `/embed/:providerId`
  - The `/i/:incidentId` SPA route
  - The background archive refresh worker (every 5 min)
- **No new paid dependency.** No Upstash, no KV, no Resend, no Postmark, no Sentry
  with a paid tier, no Logtail, no nothing.

## 2. The Decision

**Option A — Vercel static hosting + Vercel serverless function with in-memory
state.**

Why this one:

1. **Vercel's hobby tier is permanently free for static + serverless.** 100 GB
   bandwidth/month, 100 GB-hours serverless execution, no credit card required.
   That's an order of magnitude more headroom than mestri will ever need.
2. **Your code already fits the shape.** The Express app, the route files, the
   shared status module, the client-side fetcher — none of it requires a database,
   a queue, or a long-running worker. The only thing it touches is local JSON
   files on disk and the public provider feeds.
3. **The only disk writes can be removed without losing functionality.**
   `data/incidents.json`, `data/subscriptions.json`, `data/last-status.json` —
   all three are best-effort caches of things we can either re-derive on cold
   start (incidents, status) or treat as ephemeral (subscriptions, last-status).
4. **The `pnpm start` workflow keeps working locally.** Nothing about Option A
   prevents you from running the full Express server on your laptop. It's just
   that in production, Vercel runs the same Express app inside a serverless
   function and the disk is not used.

What this plan **is not**:

- Not a rewrite. We're not switching frameworks, not switching to Hono or to
  Next.js, not switching routing libraries.
- Not a database introduction. There is no database in Option A.
- Not a UI change. The frontend stays exactly as it is, except for **one**
  small adjustment to `/i/:id` explained in §6.

---

## 3. What Changes (High-Level)

| File | Change | Reason |
|---|---|---|
| `api/index.ts` | **New.** Re-exports the Express app as a serverless handler. | Vercel needs an entrypoint in `/api` to map requests to your serverless function. |
| `vercel.json` | Replace the catch-all rewrite with a negative-lookahead rewrite; declare the function config. | Don't let the SPA rewrite swallow `/api/*`; tell Vercel how to run the function. |
| `server/routes/status.ts` | Replace the three `fs/promises` calls with an in-memory `Map`. | Vercel serverless has read-only filesystem. |
| `server/routes/notifications.ts` | Replace `readJson`/`writeJson` with in-memory arrays; gate `writeJson` behind a no-op (or keep in memory). | Same reason. |
| `server/routes/feeds.ts` | Replace `readArchive()` with the same in-memory `Map` exposed from `routes/status.ts`. | All routes share one archive. |
| `server/routes/sitemap.ts` | Replace `readFile` with the same in-memory `Map`. | All routes share one archive. |
| `client/src/pages/Incident.tsx` | Fall back to the provider's public `incidents.json` if `/api/incidents/:id` returns 404 on a cold instance with no archived data. | `/i/:id` keeps working on a cold start even before the archive has been re-warmed. |
| `server/index.ts` | **Unchanged** in behavior, except it now exports the `app` instead of calling `server.listen`. A small wrapper makes both `node dist-server/index.js` and `import app from '../api/index'` work. | Lets `pnpm start` keep working locally while Vercel uses the serverless entrypoint. |
| `package.json` | Add `"build:client"` is what Vercel runs; `build:server` is now local-only. No script changes strictly required, but document it. | Vercel only needs the Vite output. |

That's it. **No other files are touched.** No CSS, no UI, no provider config,
no Tailwind tokens, no types, no shared module.

---

## 4. Step-by-Step Implementation

### Step 4.1 — Create `api/index.ts` (the Vercel serverless entrypoint)

**New file** at the project root: `api/index.ts`.

This file:

- Imports the existing Express `app` from `server/index.ts`.
- Exports it as the default handler in the shape Vercel expects:
  `export default (req: VercelRequest, res: VercelResponse) => app(req, res)`.
- Does **not** call `app.listen`. Vercel provides the HTTP server.

Notes for the implementation:

- `server/index.ts` currently calls `startServer()` at the bottom. That call
  must be **gated** behind a check like `if (process.env.NODE_ENV !== 'vercel'
  && !process.env.VERCEL) startServer()` so it runs under `pnpm start` but not
  when Vercel imports the module as a serverless function.
- The Express app object must be exported from `server/index.ts`. Today it is a
  local variable inside `startServer()`. Refactor: lift `const app = express()`
  to module scope, register all middleware and routes at module scope too,
  then call `server.listen` only inside `startServer()`.
- Vercel provides `@vercel/node` types, but you can also use the structural
  types `import type { IncomingMessage, ServerResponse } from "node:http"`.
  Add `@vercel/node` to `devDependencies` for proper types.

Expected shape:

```ts
// api/index.ts
import app from "../server/index";

export default app;
```

```ts
// server/index.ts (refactored tail)
export const app = express();
// ... all middleware/routes registered at module scope ...

async function startServer() {
  const server = createServer(app);
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`mestri on http://localhost:${port}/`));
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("Failed to start mestri server:", err);
    process.exit(1);
  });
}
```

### Step 4.2 — Update `vercel.json`

Replace the current file contents with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm run build:client",
  "outputDirectory": "dist",
  "functions": {
    "api/index.ts": {
      "maxDuration": 10,
      "memory": 128
    }
  },
  "rewrites": [
    {
      "source": "/((?!api/|embed/|sitemap\\.xml|robots\\.txt).*)",
      "destination": "/index.html"
    }
  ]
}
```

Why each key:

- `buildCommand` — only run the Vite build. The Express bundle is no longer
  needed in production.
- `outputDirectory` — Vercel's static hosting looks here for the SPA shell.
- `functions` — `maxDuration: 10s` matches the per-feed fetch timeout
  (7s) with 3s of headroom. `memory: 128` is the minimum tier and is plenty.
- `rewrites` — the negative-lookahead `(?!)` prevents the SPA fallback from
  swallowing `/api/*`, `/embed/*`, `/sitemap.xml`, or `/robots.txt`. These
  four paths are now handled by either the serverless function (api/*, embed/*)
  or the static responses in `server/index.ts` (sitemap, robots).

### Step 4.3 — Replace `fs/promises` in `server/routes/status.ts`

The current file has four filesystem touchpoints:

1. `readArchive()` — reads `INCIDENTS_FILE` (data/incidents.json).
2. `writeArchive()` — writes the same file.
3. The `refreshArchive()` worker — appends to that file every 5 min.

Replace all three with an **in-memory `Map<string, StoredIncident>`** at module
scope, plus a `getArchive(): StoredIncident[]` helper that returns the
array form the existing callers expect.

Concrete diff sketch:

```ts
// At module scope
const archive = new Map<string, StoredIncident>();

export function getArchive(): StoredIncident[] {
  return Array.from(archive.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
}

export function upsertIncidents(
  providerId: string,
  providerName: string,
  incidents: StatusPageIncident[],
): void {
  // same logic as today, but `archive.set(key, ...)` instead of fs.writeFile
  // and the map already merged
}
```

Drop the `fs`, `path`, `fileURLToPath` imports. They become unused.

The `refreshArchive()` worker stays — it just becomes a pure in-memory
operation. The `setTimeout(..., 5_000)` + `setInterval(..., ARCHIVE_REFRESH_MS)`
need a small adjustment: serverless functions don't run between requests, so
the interval won't fire. **That's fine for cold starts.** When the function
wakes up for a request, we want to (a) serve that request fast and (b) trigger
an archive refresh in the background so the next request sees fresh data.

Wrap the interval in a "kick once on first request" pattern:

```ts
let archivePrimed = false;
function ensureArchivePrimed() {
  if (archivePrimed) return;
  archivePrimed = true;
  // Fire-and-forget; don't await. Errors are swallowed.
  refreshArchive().catch(() => {});
}

// In statusRouter.get("/status"), statusRouter.get("/incidents"), etc.:
ensureArchivePrimed();
```

Also keep the original `setInterval` for the local `pnpm start` path:

```ts
if (!process.env.VERCEL) {
  setInterval(() => void refreshArchive(), ARCHIVE_REFRESH_MS).unref?.();
}
```

### Step 4.4 — Replace `fs/promises` in `server/routes/notifications.ts`

Same pattern:

- `SUBS_FILE` and `STATE_FILE` go away.
- `subscriptions: Subscription[]` becomes an in-memory array at module scope.
- `lastStatus: Record<string, ProviderStatusSnapshot>` becomes an in-memory
  object.
- `readJson<T>(file, fallback)` is no longer needed. The in-memory values
  become the source of truth.
- `writeJson(file, value)` is no longer needed; mutations happen directly on the
  in-memory structures.

The handlers (`POST /`, `GET /`, `DELETE /:id`, `detectAndDeliver`) are
otherwise unchanged.

**Document the trade-off in a comment** at the top of the file:

```ts
// NOTE (Free Tier / Option A): Subscriptions and last-status live in memory.
// On serverless cold start, they are reset to empty. This means subscriptions
// created on one instance are not visible to another instance, and disappear
// on redeploy or cold start. Webhook delivery still works during a single
// warm instance. To make subscriptions durable, see free_backend.md §7
// (Upgrade Path → Option B: Vercel KV).
```

### Step 4.5 — Replace `fs/promises` in `server/routes/feeds.ts`

The only filesystem touchpoint is `readArchive()`, which reads
`data/incidents.json`. Replace it with an import from `routes/status.ts`:

```ts
import { getArchive } from "./status.js";
```

Then inside the handlers:

```ts
const archive = getArchive();
```

That's it. No other behavior changes.

### Step 4.6 — Replace `fs/promises` in `server/routes/sitemap.ts`

Same as Step 4.5:

```ts
import { getArchive } from "./status.js";
```

Inside `buildSitemap()`:

```ts
const incidents = getArchive().map((i) => ({ id: i.id, updatedAt: i.updatedAt }));
```

### Step 4.7 — Adjust `client/src/pages/Incident.tsx` for cold-start resilience

Today the page does:

```ts
fetch(`/api/incidents/${id}`)
  .then(...) // 404 if not in archive
```

On a cold serverless start, the archive is empty until `refreshArchive()`
finishes (could be 5–10 seconds after first request). During that window, a
direct hit to `/i/<incidentId>` returns 404 even though the incident really
exists.

**Fix:** if `/api/incidents/:id` returns 404, the client falls back to fetching
the provider's public `incidents.json` endpoint directly and resolving the
incident client-side. The user always gets a page; the worst case is "fetched
from upstream" instead of "fetched from the archive".

Implementation outline:

1. Need to know which provider an incident belongs to. Today the URL is just
   `/i/:id` with no provider. Two options:
   - **(a) Pass provider in the URL: `/i/:providerId/:id`.** Cleanest, but
     breaks existing inbound links. Migrate with a redirect.
   - **(b) Try `/api/incidents/:id` first; on 404, fetch each provider's
     `incidents.json` until found.** Ugly but link-compatible. mestri has at
     most ~10 providers; this is fine.
2. Pick (b) for link compatibility. Implementation:

```ts
useEffect(() => {
  setLoading(true);
  setError(null);

  const abort = new AbortController();

  (async () => {
    try {
      const r = await fetch(`/api/incidents/${encodeURIComponent(params.id)}`, { signal: abort.signal });
      if (r.ok) {
        setIncident(await r.json());
        return;
      }
      if (r.status !== 404) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Network error — fall through to upstream.
    }

    // Fallback: scan provider feeds until we find the incident.
    const providers = await fetch("/api/providers").then((r) => r.json());
    for (const p of providers as Array<{ id: string; incidentsUrl?: string }>) {
      if (!p.incidentsUrl) continue;
      try {
        const payload = await fetch(p.incidentsUrl, { signal: abort.signal }).then((r) => r.json());
        const list = Array.isArray(payload) ? payload : payload.incidents ?? [];
        const found = list.find((i: { id?: string }) => i.id === params.id);
        if (found) {
          // Map Statuspage incident shape → IncidentDetail shape client-side.
          // (Mirror what server/routes/status.ts does in upsertIncidents.)
          setIncident(mapUpstreamToDetail(p.id, found));
          return;
        }
      } catch { /* try next provider */ }
    }

    setError("Incident not found in the mestri archive or any upstream feed.");
  })().finally(() => setLoading(false));

  return () => abort.abort();
}, [params.id]);
```

### Step 4.8 — Add `@vercel/node` types

```json
// package.json devDependencies
"@vercel/node": "^3.0.0"
```

This is what gives `api/index.ts` proper `VercelRequest` / `VercelResponse`
types. Not strictly required — Express's `(req, res)` is structurally
compatible — but it removes type-check warnings.

### Step 4.9 — Local development still works

After these changes:

- `pnpm install` — installs `@vercel/node`.
- `pnpm run dev` — runs Vite only (frontend dev server, as today). The server
  bundle isn't used in dev because the frontend calls the browser-side
  `fetchProviderSnapshot()` directly.
- `pnpm run build` — still builds client + server. Server bundle is unused in
  production but still useful for `pnpm start`.
- `pnpm start` — runs `node dist-server/index.js`. This calls
  `startServer()` because `process.env.VERCEL` is unset. Everything works
  exactly like today, **except** subscriptions/archive/last-status are not
  persisted to disk. They live in memory and reset on each `pnpm start`. For
  local dev this is fine; for testing persistence, use a real DB or accept
  the in-memory behavior.

### Step 4.10 — Deploy

1. Push to GitHub.
2. In the Vercel dashboard, "Add New → Project" → import the repo.
3. Vercel detects Vite, sees `vercel.json`, builds with `pnpm run build:client`.
4. Vercel auto-creates the serverless function from `api/index.ts`.
5. **No environment variables required.** Option A uses none.

---

## 5. Verification Checklist

After deploy, run through each of these on the production URL. Every one of
these must succeed for the plan to be considered done.

| # | Function | How to test | Expected |
|---|---|---|---|
| 1 | Home page | Browser → `https://<app>.vercel.app/` | Renders 4+ provider rows with status pills, latest message, footer |
| 2 | Live `/api/status` | `curl -i https://<app>.vercel.app/api/status` | `200`, JSON with `openai`, `anthropic`, etc., each has `status`/`message`/`history[30]`; `Cache-Control: public, max-age=60` header |
| 3 | Providers list | `curl https://<app>.vercel.app/api/providers` | JSON array with all providers from `PROVIDERS` |
| 4 | Incidents list | `curl https://<app>.vercel.app/api/incidents` | JSON array (may be `[]` on first cold start; populated within ~10s) |
| 5 | Incident detail (warm) | `curl -i https://<app>.vercel.app/api/incidents/<some-id>` | `200` with full incident detail |
| 6 | Incident detail (cold) | Pick an incident id from the live OpenAI feed, hit `/i/<id>` in a fresh incognito window | Page renders (uses upstream fallback) |
| 7 | RSS feed | `curl -i https://<app>.vercel.app/api/feeds/all.xml` | `200`, `Content-Type: application/rss+xml`, valid XML |
| 8 | Per-provider RSS | `curl -i https://<app>.vercel.app/api/feeds/openai.xml` | `200`, valid XML, only openai items |
| 9 | Sitemap | `curl https://<app>.vercel.app/sitemap.xml` | `200`, valid XML, lists `/`, `/changelog`, and `/i/<id>` for archived incidents |
| 10 | Robots | `curl https://<app>.vercel.app/robots.txt` | `200`, plaintext `User-agent: *\nAllow: /\nSitemap: ...` |
| 11 | Notifications POST | `curl -X POST -H "Content-Type: application/json" -d '{"providerId":"openai","channel":"webhook","target":"https://webhook.site/<id>"}' https://<app>.vercel.app/api/notifications` | `201` with subscription object |
| 12 | Notifications GET | `curl https://<app>.vercel.app/api/notifications` | JSON array containing the subscription just created |
| 13 | Notifications DELETE | `curl -X DELETE https://<app>.vercel.app/api/notifications/<id>` | `200` `{ok: true}` |
| 14 | Embed | `curl -i https://<app>.vercel.app/embed/openai` | `200`, HTML with live dot, status word, message |
| 15 | SPA fallback | `curl -i https://<app>.vercel.app/changelog` | `200`, `Content-Type: text/html`, returns `index.html` (the SPA renders the route) |
| 16 | Cache header | `curl -I https://<app>.vercel.app/api/status` | `Cache-Control: public, max-age=60` |
| 17 | Build | `pnpm run build` locally | Both client and server bundles succeed, no TS errors |
| 18 | Type check | `pnpm run check` | `0` errors |
| 19 | Tests | `pnpm test` | All tests still pass (no test changes were needed) |

If any of these fail after deployment, the most common causes are:

- **CORS / upstream feed timing out**: 7-second timeout may be tight on first
  cold start when Vercel is also warming up. The function's `maxDuration: 10`
  gives 3 seconds of buffer; if this is too tight, raise to `maxDuration: 30`
  (still in free tier).
- **404 on `/api/*` in production**: the negative-lookahead rewrite isn't
  matching. Verify by hitting `https://<app>.vercel.app/api/status` directly
  in a browser; if you see HTML instead of JSON, the rewrite is wrong.
- **Archive empty on cold start**: this is expected; tests 4–8 may need to be
  retried 10 seconds after the first request hits the function.

---

## 6. Trade-offs (Be Honest)

These are the things you give up by going with Option A. Each one has a known
mitigation if it ever becomes painful.

### 6.1 Subscriptions don't survive cold starts

On Vercel serverless, an instance can be recycled at any time. When it does,
all subscriptions created on that instance vanish from the in-memory store.
A user who subscribed yesterday may find their subscription gone today if the
function went cold overnight.

**Mitigation today:** Add a small UI banner in the notifications section that
says subscriptions are temporary on the free tier. Or just don't advertise
subscriptions prominently until you move to Option B.

**Mitigation later:** Upgrade to Option B (Vercel KV), documented in §7.

### 6.2 Incident archive doesn't grow across cold starts

When the function starts cold, the in-memory archive is empty. The
`refreshArchive()` worker re-derives it from each provider's `incidents.json`
endpoint, which is exactly what your existing code does — except today it
persists that result to disk. On Option A, that result lives only until the
next cold start.

In practice this means:

- Right after a cold start, `/api/incidents` returns `[]` for ~5–10 seconds
  while the worker fills the in-memory map.
- Once warm, `/api/incidents` returns everything from the upstream feeds
  (Statuspage APIs return up to ~90 days of incidents per request, so you
  don't lose much historical depth — you just don't get cross-instance
  accumulation).

**Mitigation today:** The `/i/:id` client fallback (§4.7) handles the cold-start
window transparently. Users never see "incident not found" for an incident
that's still on the provider's feed.

**Mitigation later:** Option B (Vercel KV).

### 6.3 Notifications state machine resets on cold start

The transition detector (`detectAndDeliver`) compares current status against
`lastStatus` to decide whether to fire a webhook. On cold start, `lastStatus`
is empty, so the first transition observed after cold start will fire a
delivery. This can lead to spurious "operational → degraded" webhooks right
after a deploy.

**Mitigation today:** The `DELIVERY_COOLDOWN_MS = 5 min` cooldown inside
`detectAndDeliver` still applies, but it only deduplicates within a single
warm instance. Cross-instance duplicates are possible.

**Mitigation later:** Option B. Or: change the initial "previous" status to
the current status on cold start (don't fire on the first observation). One
line change; do it as a P1 if notifications ever become important.

### 6.4 Email delivery is still a stub

This is not new to Option A — your current code already logs a warning
instead of sending. The plan doesn't touch email.

### 6.5 No file-based debugging breadcrumbs

Today, `data/incidents.json` is a debugging artifact you can `cat` after a
deploy to see what mestri has seen. On Option A, that file is gone.

**Mitigation today:** Tail function logs in the Vercel dashboard. Add a
`console.log` inside `refreshArchive()` that prints the count of upserted
incidents per cycle.

---

## 7. Upgrade Path — When To Leave Option A

You should leave Option A only if **any** of the following become real pain,
not theoretical pain:

| Trigger | Move to | Cost |
|---|---|---|
| Users start complaining "my subscription disappeared" | **Option B: Vercel KV** for subscriptions only | $0 (KV hobby tier: 30k req/mo) |
| You want 90+ day incident archive that survives cold starts | **Option B: Vercel KV** for incidents | $0 |
| You want email notifications to actually send | Add Resend / Postmark free tier (100 emails/day) | $0 |
| Traffic exceeds 100 GB/mo bandwidth (≈100k daily visitors) | Upgrade Vercel to Pro | $20/mo |
| You want to do server-side synthetic checks | **Option C: Render / Fly** for a long-running Node process | $0 (with cold starts) or $5+/mo (without) |

The migration from Option A → Option B is **two file changes** (add `@vercel/kv`,
replace the three in-memory stores with `kv.get`/`kv.set`). Nothing else moves.

---

## 8. What This Plan Doesn't Cover

These are intentionally out of scope. Flag any of these and I'll add a section.

- **Custom domain setup** — Vercel free tier supports custom domains. One CNAME
  record. Not technical, just paperwork.
- **Vercel Analytics / Speed Insights** — free, opt-in via dashboard.
- **Sentry / error tracking** — free tier exists; one-line integration. Worth
  adding once you're past Phase 0.
- **CI / automated deploys** — Vercel auto-deploys on every push to the default
  branch. No CI config needed unless you want preview environments for PRs
  (Vercel does this automatically too).
- **Hugging Face provider** — not currently in `PROVIDERS`. If you want it,
  add an entry to `shared/statusFeeds.ts` and the rest of the system picks it
  up unchanged. The prompt that triggered this plan asked for it, but it's a
  separate piece of work.

---

## 9. Summary

| Concern | Resolution |
|---|---|
| Where does it run? | Vercel (static + serverless). |
| What does it cost? | $0/month. Forever. |
| What database do I need? | None. |
| What env vars do I need? | None. |
| What changes in code? | 5 files modified, 1 file created (`api/index.ts`), 1 file lightly edited (`client/src/pages/Incident.tsx`). |
| What changes in `vercel.json`? | Add `buildCommand`, `functions`, and a negative-lookahead rewrite. |
| What existing functions keep working? | All 13 listed in §1. |
| What do I lose? | Cross-cold-start persistence for subscriptions, archive, and last-status. The `/i/:id` page has a client-side fallback so users don't notice. |
| When do I leave Option A? | When you need durable subscriptions, durable archive, or >100 GB/mo traffic. Migration is a 2-file change to Option B. |