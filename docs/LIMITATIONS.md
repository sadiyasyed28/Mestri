# Limitations

The following are the known, real limitations of the Mestri platform running in production.

### Current limitations
- **Webhook / Email Delivery**: The codebase contains implementations for webhook SSRF protections, payload generation, and simulated dispatch, but real outbound production delivery has not been fully verified with external email services or real webhooks.
- **Storage Growth**: Status snapshots are appended to D1 every 5 minutes (yielding ~2,300 rows daily). While this comfortably fits into the Cloudflare 5GB free tier (estimated ~850MB per year), there is currently no retention or cleanup job to prune snapshots older than 30 days.
- **Worker Memory Cache**: The in-memory cache used by the Worker (`workerCache`) is isolate-local. It prevents redundant remote fetches within a single Cloudflare node, but different edge locations will experience cold starts and rely on the D1 database fallback.
- **Provider Unreachability**: Some AI provider feeds (e.g., `xai`, `mistral`, `huggingface`) may block edge worker IP ranges or have malformed CORS headers, causing them to gracefully degrade to a `manual` / "Upstream feed unreachable" state.

### Future improvements
- **Automated D1 Retention Pruning**: Introduce a daily cron trigger to `DELETE FROM status_snapshots WHERE created_at < datetime('now', '-30 days')`.
- **Subscription Management UI**: Build a secure frontend for users to manage, verify, and unsubscribe from notifications using signed JWT tokens.
- **Legacy Code Cleanup**: Ensure all remnants of the original Express/Vercel configuration (`vercel.json`, old server files) are fully purged to avoid confusion.
