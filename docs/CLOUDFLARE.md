# Cloudflare Deployment

This document describes the CURRENT production architecture using Cloudflare Workers and D1.

## Prerequisites
- Cloudflare account
- Node.js (v18+)
- `pnpm`

## Wrangler Authentication
Login to Cloudflare using Wrangler:
```bash
npx wrangler login
```
Verify authentication:
```bash
npx wrangler whoami
```

## D1 Database Setup
Create the production D1 database:
```bash
npx wrangler d1 create mestri-db
```
Update your `wrangler.toml` with the returned `database_id`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "mestri-db"
database_id = "YOUR-DATABASE-ID"
```

## Migration
Apply the database schema to the remote production database:
```bash
npx wrangler d1 migrations apply mestri-db --remote
```

## Provider Seed / Bootstrap
The production database MUST be seeded with the canonical provider list before the Worker can persist snapshots, otherwise foreign key constraints will fail.
Create a `seed.sql` containing `INSERT INTO providers...` (derived from `shared/statusFeeds.ts`) and run:
```bash
npx wrangler d1 execute mestri-db --remote --file seed.sql
```

## Worker Deployment
Deploy the Worker, Assets, and Cron trigger to production:
```bash
npx wrangler deploy
```

## Cron Configuration
The Worker is configured in `wrangler.toml` to run every 5 minutes:
```toml
[triggers]
crons = ["*/5 * * * *"]
```

## Production Verification
Test the health and status endpoints:
```bash
curl https://mestri.YOUR_SUBDOMAIN.workers.dev/__worker_health
curl https://mestri.YOUR_SUBDOMAIN.workers.dev/api/status
```

## Useful Commands
Query D1 remotely:
```bash
npx wrangler d1 execute mestri-db --remote --command "SELECT count(*) FROM status_snapshots"
```
View worker logs:
```bash
npx wrangler tail
```

## Known Limitations
- The Worker's in-memory cache is isolate-local and not shared globally, which is why D1 is the canonical storage.
- Real webhook delivery and email sending features are implemented in the code but have not been comprehensively validated with real subscriptions in production.

*(Note: The legacy `/api/notifications`, `/api/notifications/:id`, and `/api/archive/refresh` endpoints have been completely removed from public routing for security.)*
