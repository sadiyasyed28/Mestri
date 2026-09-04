# mestri — Upgradation Plan

> A pragmatic, opinionated roadmap from "polished prototype on a starter template" to "shippable, ownable v1 product."
>
> Phases are ordered by **value-to-effort**, not chronology. Each phase lists concrete deliverables, files touched, and the *why* — so you can skip phases that don't match your priorities.

---

## Reading guide

- **P0** = ship-blocker, must do before public launch
- **P1** = v1 quality, do in the first two weeks after launch
- **P2** = v1.1, the product that has a reason to be revisited
- **P3** = strategic moat work, only if you're committed to mestri as a long-term thing

Every item lists *what* to do, *why*, and *how*. Nothing here requires a backend rewrite — the backend isn't started and Phase 0 explicitly defers it.

---

## Phase 0 — Make the thing that exists actually work (P0)

The current build is one missing PNG away from looking broken in production. Fix that first.

### 0.1 Resolve the missing-asset shipblocker

**Why:** `client/src/index.css` references `/manus-storage/pulseboard-paper-grid_0ebdad62.png` and `/manus-storage/pulseboard-signal-field_5b76c8c4.png`, and `client/src/pages/Home.tsx` references `/manus-storage/mestri-mark_e18832b9.png`. None of these exist in `client/public/`. The dev build hides this because the `vitePluginStorageProxy` in `vite.config.ts` quietly redirects to a Manus-hosted blob store that you do not control. In any normal deploy, **the brand mark, the paper grid background, and the signal-field ornament all 404**.

**Deliverables:**
1. Export `mestri-mark` as `client/public/mestri-mark.png` (PNG, not SVG-in-PNG; keep it under 8 KB).
2. Export the paper grid as `client/public/paper-grid.png`.
3. Export the signal-field ornament as `client/public/signal-field.png`.
4. In `client/src/index.css`:
   - Replace `url("/manus-storage/pulseboard-paper-grid_0ebdad62.png")` → `url("/paper-grid.png")`
   - Replace `url("/manus-storage/pulseboard-signal-field_5b76c8c4.png")` → `url("/signal-field.png")`
5. In `client/src/pages/Home.tsx` (two occurrences, in the header and footer):
   - Replace `/manus-storage/mestri-mark_e18832b9.png` → `/mestri-mark.png`
6. Verify by `pnpm build` then `pnpm preview` and check the Network tab — every asset should be a local 200.

**Effort:** ~30 minutes.
**Why P0:** without this, the brand looks broken on day one and nobody trusts a status-tracker whose own logo doesn't load.

---


### 0.2 Fix the live data, not the placeholder

**Why:** `statusFeeds.ts` is the brain of the product, and right now it has two real bugs and one fragile pattern.

**Deliverables:**

1. **Fix the brittle URL transform** in `client/src/lib/statusFeeds.ts` (around line 200):
   - Current: `provider.feedUrl.replace("summary.json", "incidents.json")` — throws if the URL doesn't contain that literal substring.
   - Replace with a real `URL` constructor: build the incidents URL from the summary URL pathname, or add an explicit `incidentsUrl` field to `ProviderConfig`.

2. **Verify each provider's CORS posture from a real browser console** and annotate:
   - For each provider in `PROVIDERS`, run `fetch(feedUrl, { method: "HEAD" })` in DevTools on a deployed preview.
   - Add a `// verified CORS-open YYYY-MM-DD` comment to each provider entry. Update `research-notes.md` with the result.

3. **Make `lastChecked` honest.** In `Home.tsx`:
   - Track `lastSuccessfulCheck` separately from `lastRefreshAttempt`.
   - Rename the UI copy to whichever semantics you actually want. "Last checked" implies success; "Last refresh" does not.

4. **Per-cell history accessibility.** `HistoryStrip` uses `title=` only, which screen readers ignore. Add visually-hidden `<span>` text per segment so the strip is genuinely readable.

**Effort:** ~1 hour.
**Why P0:** the data layer is the product. Two small bugs here = silent misreporting on launch day.

---

### 0.3 Strip the template scaffolding

**Why:** this project was forked from a Manus-style starter. Most of that starter is dead weight that makes the codebase dishonest and the bundle bigger than it needs to be.

**Delete unconditionally:**
- `client/src/components/Map.tsx` — Google Maps integration, never imported.
- `client/src/components/ManusDialog.tsx` — "Login with Manus" dialog, never imported.
- `client/src/const.ts` — `getLoginUrl()`, OAuth portal, never imported.
- `client/src/hooks/useComposition.ts` — verify with grep; almost certainly unused.
- `client/src/hooks/usePersistFn.ts` — only used by `Map.tsx`; becomes unused after deletion.
- `shared/const.ts` — `COOKIE_NAME` / `ONE_YEAR_MS`, never imported.
- `client/public/__manus__/` — debug collector + version file, only useful for Manus preview.
- `patches/wouter@3.7.1.patch` + the `pnpm.patchedDependencies` entry in `package.json` — exposes routes on `window.__WOUTER_ROUTES__`, nothing reads it.
- The `vite-plugin-manus-runtime`, `@builder.io/vite-plugin-jsx-loc` devDeps from `package.json`.
- `vitePluginManusRuntime()`, `vitePluginManusDebugCollector()`, `vitePluginStorageProxy()` from `vite.config.ts`, plus the related `vitePluginManusRuntime` import.

**Trim dependencies** in `package.json` (verify each with grep first):
- `axios` — you use `fetch`.
- `@hookform/resolvers`, `react-hook-form`, `input-otp`, `react-day-picker`, `zod` — none of these are imported anywhere in `client/src/`.
- The entire `@radix-ui/*` suite except `@radix-ui/react-tooltip`, `@radix-ui/react-slot`, and anything actually used by the `sonner` toaster.
- `@types/google.maps` — only `Map.tsx` used it.
- `nanoid`, `streamdown`, `vaul`, `cmdk`, `embla-carousel-react`, `framer-motion`, `react-resizable-panels`, `recharts`, `next-themes` — none are imported by `client/src/`. Verify before deleting.
- `tw-animate-css` — imported in `index.css`; check whether any class actually uses it before removing.
- `components.json` — shadcn config; delete if you don't use the shadcn CLI to add components.

After deletion:
```
pnpm install
pnpm check    # tsc --noEmit, should pass
pnpm build    # vite build, should succeed
```

If `pnpm check` complains about `@/components/ui/*` that's still imported by `App.tsx` or `Home.tsx` (sonner, tooltip, button) — keep only those.

**Effort:** ~1–2 hours.
**Why P0:** makes the project look like *your* project, not someone else's scaffold. ~150 KB of dead deps, half a dozen files that exist only to confuse future-you.

---

### 0.4 Write a README

**Why:** there is no README. `ideas.md`, `research-notes.md`, `todo.md`, `reference-notes.md` are all useful internal docs, but none of them tells a new contributor (or future-you in 3 months) how to run, build, or deploy the thing.

**Deliverables:** create `README.md` with these sections:

1. **What this is** — one paragraph from `ideas.md` Brand Essence.
2. **Quickstart** — `pnpm install && pnpm dev` → http://localhost:3000.
3. **Scripts** — table: `dev`, `build`, `start`, `preview`, `check`, `format`.
4. **Project layout** — bullet list of `client/`, `server/`, `shared/`, `dist/`.
5. **Providers** — current list (OpenAI, Anthropic, xAI, Google, Mistral) with feed URLs and the CORS verification dates from 0.2.
6. **Adding a provider** — short recipe: add to `PROVIDERS` in `statusFeeds.ts`, verify CORS, ship.
7. **Design system** — link to `ideas.md`, list the three fonts and where they're used.
8. **Deploy** — any static host works for now (Vercel, Netlify, Cloudflare Pages). Document the asset caveat from 0.1 so the next deployer doesn't reintroduce the bug.
9. **Contributing** — keep it short; one paragraph.

**Effort:** ~30 minutes.
**Why P0:** a project without a README is a project people don't share.

---


## Phase 1 — v1 quality (P1)

Do these in the first two weeks after public launch. Each is independently shippable.

### 1.1 Light/dark decision and polish

**Why:** `App.tsx` sets `defaultTheme="dark"` but the design system in `ideas.md` is light-first (paper-white editorial canvas, lime operational accent that "turns operational into a visible pulse without making the site feel like a neon dashboard"). The dark palette in `index.css` is more recent and looks considered, but the default is the wrong way around.

**Options:**

- **Option A (recommended): ship light-first, keep dark.** Match `ideas.md`. Set `defaultTheme="light"` in `App.tsx`. Add a small theme toggle in the header (the design system already accommodates it — `.theme-toggle-label`, `.theme-toggle` classes exist in CSS but no toggle is wired up).
- **Option B: ship dark-first, update `ideas.md`.** Valid if you personally prefer the dark look. Just commit to it.

**Deliverable:** whichever option, plus an explicit `<html class="dark">` or no-class on first paint to avoid the FOUC. Currently the ThemeContext's `useEffect` adds the class *after* React mounts — there's a brief light flash on dark default.

**Effort:** ~1 hour.

---

### 1.2 Finish the open design tasks from `todo.md`

**Why:** `todo.md` is explicit:

```
- [ ] Give the last-checked block an explicit high-contrast surface and stable placement.
- [ ] Increase and rebalance the mestri logo mark and wordmark.
- [ ] Verify desktop and mobile layouts, then save a new checkpoint.
```

These are open design tasks, not code tasks. Do them.

**Deliverables:**
1. Last-checked block: give it a `border`, `padding`, and a stable `place-self` so it doesn't visually drift between mobile and desktop.
2. Logo: bump `.brand-mark { width: 25px; height: 25px }` to ~32–36px and rebalance the wordmark weight/spacing in `.brand-name`.
3. Mobile verification: open on real iOS Safari and Android Chrome at 360px, 390px, 430px widths. Screenshot. The CSS already has `@media (max-width: 980px)` and `@media (max-width: 680px)` rules; just verify they actually deliver.
4. Save a new "checkpoint" — a screenshot pair (desktop + mobile) into `client/public/` or `docs/` so future iterations have a reference.

**Effort:** ~2 hours.

---

### 1.3 Tests for the data layer

**Why:** `vitest` is installed but there are zero tests. `statusFeeds.ts` is the most important file in the project, and its pure functions (`normalizeStatus`, `summaryStatus`, `createIncidentHistory`, `incidentStatus`) are exactly the kind of thing that should have unit tests. A regression in `createIncidentHistory` means mestri shows green on a day the provider was on fire.

**Deliverables:** create `client/src/lib/__tests__/statusFeeds.test.ts` covering:
- `normalizeStatus`: each indicator mapping (`none`, `minor`, `major`, `critical`, `partial_outage`, `degraded_performance`, `maintenance`, unknown).
- `summaryStatus`: prefers `status.indicator`; falls back to worst-of-components.
- `createIncidentHistory`: a 30-day window with one mid-window incident correctly colors the right days.
- `createInitialSnapshot`: returns `"manual"` for providers without `feedUrl`.

Add a `test` script to `package.json`: `"test": "vitest run"`.

**Effort:** ~2 hours.

---


### 1.4 Provider additions

**Why:** the current five (OpenAI, Anthropic, xAI, Google, Mistral) are the obvious ones, but mestri gets more useful the more providers it has. Reasonable additions:

| Provider | Why | Feed source |
|----------|-----|-------------|
| Perplexity | Major consumer AI, no public status page — **manual-check only**. Honest. | n/a |
| Cohere | API-only provider, devs care. statuspage.io | `https://status.cohere.com/api/v2/summary.json` |
| Hugging Face | Used heavily by devs. statuspage.io | `https://status.huggingface.co/api/v2/summary.json` |
| Replicate | Used heavily by builders. statuspage.io | `https://status.replicate.com/api/v2/summary.json` |
| DeepSeek | Recent major player. Custom. | needs research |
| Cursor | Editors matter to "AI tools I rely on." Custom. | needs research |

For each: research, add to `PROVIDERS`, verify CORS (Phase 0.2 process), ship.

**Effort:** ~30 min per provider once the pattern is established. First one ~2 hours.

---

### 1.5 Public status JSON endpoint

**Why:** right now mestri is a website. The cheapest possible way to make it a *platform* is to expose the same snapshots it already shows as a public JSON endpoint. Other tools (CLI dashboards, Slack bots, Raycast extensions) can then consume mestri as a source.

**Option A (no backend):** generate a static JSON file at build time by running `statusFeeds.ts` once during `pnpm build` and writing `client/public/api/status.json`. Re-builds are how snapshots refresh — fine for v1, bad for live accuracy.

**Option B (tiny backend, recommended):** add a single route to `server/index.ts`:
```ts
app.get("/api/status", async (_req, res) => {
  const snapshots = await fetchAllSnapshots(); // lifted from statusFeeds.ts
  res.set("Cache-Control", "public, max-age=60");
  res.json(snapshots);
});
```
Lift `fetchProviderSnapshot` and the `PROVIDERS` list into `shared/` so both client and server can import them.

**Deliverables (Option B):**
1. Move `statusFeeds.ts` core into `shared/statusFeeds.ts`.
2. Add `server/routes/status.ts` with the `/api/status` route.
3. Cache snapshots in-memory for 60 seconds.
4. Document the endpoint in README.
5. Optional but very cheap: add a `Cache-Control` + `ETag` to avoid re-fetching from status providers on every request.

**Effort:** ~3 hours.

---


## Phase 2 — v1.1, the product that has a reason to be revisited (P2)

These are the moves that turn mestri from a "nice status page" into something with retention.

### 2.1 RSS / Atom feed per provider + a global feed

**Why:** the entire product is "I want to know when something changes." An RSS feed is the lightest possible way to deliver that change signal. Power users (and devs especially) already have an RSS reader.

**Deliverables:**
1. Per-provider feed at `/api/feeds/:providerId.xml` (e.g., `/api/feeds/openai.xml`).
2. Global feed at `/api/feeds/all.xml`.
3. Each item includes: incident title, status (operational/degraded/outage), `updated_at`, link to mestri row.
4. Source: the same `incidents.json` you already fetch, persisted to a tiny JSON store (SQLite or a flat file with a debounced write).

**Effort:** ~4 hours.

---

### 2.2 Historical archive + incident pages

**Why:** status pages are forgettable; *incident histories* are not. If someone Googles "Was OpenAI down on March 14?" mestri should have the answer. This is also where SEO compounds — every incident becomes a long-tail search hit.

**Deliverables:**
1. Persistent incident store (SQLite via `better-sqlite3` is fine, ~250 KB dep).
2. On every `/api/status` call, upsert new incidents into the store.
3. Add `/i/:incidentId` route that renders a single incident page (provider, status, timeline of updates with timestamps).
4. Submit a sitemap so search engines find them.

**Effort:** ~2 days.

---

### 2.3 Email + webhook notifications

**Why:** the loop. Without notifications, mestri is something you check when you think something is broken. With notifications, mestri is something that tells you when something is broken. Different product.

**Deliverables:**
1. Per-provider subscription: `/subscribe/:providerId` with email OR webhook URL.
2. Server-side: when a status transitions `operational → degraded/outage` or back, fire all subscribers for that provider.
3. Webhook payload: `{ provider, oldStatus, newStatus, incident, mestriUrl }`.
4. Email: transactional via Resend / Postmark / SES (pick one — Resend is the cleanest DX). One HTML template, one text template.
5. Rate-limit per subscriber to prevent storms.

**Effort:** ~3 days. Email is the bulk of it.

---

### 2.4 A small "what's new" page

**Why:** incident pages from 2.2 + this gives mestri a blog-like surface that earns organic traffic and gives you a place to ship product updates.

**Deliverables:** `/changelog.md` rendered at `/changelog`, fed by a markdown file in the repo. No CMS. Ship.

**Effort:** ~2 hours.

---


## Phase 3 — Strategic moat (P3)

Only do these if mestri is becoming a real thing and not a side project.

### 3.1 Server-side aggregation across providers

The client-side fetch story breaks the day any provider locks down CORS. By Phase 3 you should have a server-side fetch loop that:
- Polls each provider every 60s.
- Stores results in SQLite.
- Exposes a single `/api/status` with ETag-based caching.
- Runs as a long-lived process or a cron-style scheduled worker (Vercel Cron, GitHub Actions, Cloudflare Workers Cron — pick one).

**Effort:** ~1 week.

---

### 3.2 A "did mestri catch this before the provider admitted it?" feed

This is the moat. Some incidents are visible in component latency / error rates long before the provider's status page updates. mestri could poll a few cheap synthetic checks (e.g., `POST /v1/chat/completions` with a 1-token prompt, measure response time and status) and report "elevated latency, no provider acknowledgement yet" — with a clear disclaimer.

This is sensitive. Do not ship without:
- Explicit consent from the providers whose APIs you're probing.
- A clear "unofficial signal, not provider-reported" label.
- Strict rate limits (e.g., once per 5 minutes per provider).

**Effort:** ~2 weeks including the legal review.
**Don't do it lightly.** This is the difference between "a trusted status page" and "a sketchy scrape."

---

### 3.3 Public status embedding

Tiny `iframe`-friendly embed: `<iframe src="/embed/openai" width="240" height="80">` that shows one provider's current status. Lets blogs, docs sites, and internal dashboards embed mestri without depending on it.

**Effort:** ~2 days.

---

## Things I am explicitly **not** recommending

- ❌ **Accounts / sign-in.** Your brand essence is "no signup." Don't ruin it. The OAuth scaffolding in `client/src/const.ts` and `ManusDialog.tsx` is a tell that the template wanted it; resist.
- ❌ **A native mobile app.** The site is already responsive. The marginal utility of an app is tiny and the maintenance cost is large.
- ❌ **A chatbot / AI assistant.** mestri is about *signal*. Adding an LLM to your status page would be the most on-brand-broken move possible.
- ❌ **"Compare providers" feature.** Cute idea, but mestri's positioning is observation, not evaluation. Don't cross the line into reviews.
- ❌ **Migrating to Next.js / a meta-framework.** The current Vite SPA is right-sized. Adding SSR for a status page is pure complexity tax. If you want SEO for the incident pages in Phase 2.2, consider static generation of just those pages, not a full framework swap.

---

## Suggested sequencing

A solo developer working on mestri in spare time:

| Week | What |
|------|------|
| 1 | Phase 0 (ship-blockers) — should ship by end of week. |
| 2 | Phase 1.1 + 1.2 (design polish) and Phase 1.3 (tests). |
| 3 | Phase 1.4 (add 2 providers) and Phase 1.5 (public JSON endpoint). |
| 4 | Public launch + tweet it + post on HN. Watch for breakage. |
| 5–6 | Phase 2.1 (RSS) + Phase 2.4 (changelog). |
| 7–10 | Phase 2.2 (incident archive) — this is the SEO play. |
| 11+ | Decide: is mestri a hobby, a portfolio piece, or a product? If product → Phase 3. If not → stop at 2.4 and keep it tidy. |

The biggest unlock is Phase 2.2. Everything before it is "make the thing work." Everything after it is "make the thing matter."
