# Changelog

## [2026-09-04] v1.0 — The signal, not the speculation.

- Shipped the editorial status page with eight providers: OpenAI, Anthropic, xAI, Google (Gemini + AI Studio, manual-check), Mistral, Cohere, Hugging Face, and Replicate.
- Added a 30-day daily uptime signal per provider.
- Added a server-side `/api/status` endpoint with a 60-second in-memory cache — survives provider feed outages and CORS locks.
- Added per-incident detail pages at `/i/:id` and a JSON sitemap for SEO.
- Added per-provider and global RSS feeds at `/api/feeds/:providerId.xml` and `/api/feeds/all.xml`.
- Added webhook subscriptions at `/api/notifications` for status transitions (webhook delivery is fully functional; email delivery is intentionally a no-op until an email provider is wired in — see `server/routes/notifications.ts`).
- Added an embeddable widget at `/embed/:providerId` for use in any `<iframe>`.
- Added a light/dark theme toggle in the header (Phase 1.1).
- Removed template residue: Google Maps integration, Manus auth dialog, OAuth scaffolding, debug collector plugin, the wouter fork-patch, and ~150 KB of dead dependencies.
- Fixed brittle URL transform in `statusFeeds.ts` (no more `feedUrl.replace("summary.json", ...)`).
- Fixed FOUC on dark mode by setting the `<html>` theme class synchronously in `index.html`.
- Made the "Last checked" timestamp honest — it now reflects the last *successful* refresh, not the last attempt.

## [2026-08-12] v0.9 — internal preview

- Initial scaffold from a starter template.
- Brand mark, paper grid, and signal-field ornament exported as local assets.
- Quiet Signal Ledger design system (paper-white canvas, ink-black hierarchy, signal-lime operational accent).
- Provider data layer (`statusFeeds.ts`) with Statuspage v2 schema parsing.
