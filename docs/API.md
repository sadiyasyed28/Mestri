# Mestri API Documentation

Mestri exposes a suite of public HTTP endpoints powered by Cloudflare Workers. 

## Public Endpoints

### `GET /api/status`
- **Purpose**: Returns the aggregated status, history, and current message for all monitored providers.
- **Response**: JSON object keyed by provider ID (e.g., `openai`, `anthropic`).

### `GET /api/incidents`
- **Purpose**: Returns a list of active and recently resolved incidents across all providers.
- **Response**: JSON array of incident objects.

### `GET /api/incidents/:id`
- **Purpose**: Returns detailed information about a specific incident.
- **Response**: JSON object representing the incident.

### `POST /api/notifications`
- **Purpose**: Subscribe to status updates via webhook or email.
- **Parameters**: `providerId` (string), `channel` ("email" | "webhook"), `target` (string).
- **Response**: JSON confirmation of subscription creation.

### `GET /api/feeds/all.xml`
- **Purpose**: A global RSS feed of incidents across all providers.
- **Response**: `application/rss+xml`.

### `GET /api/feeds/:providerId.xml`
- **Purpose**: A provider-specific RSS feed of incidents.
- **Response**: `application/rss+xml`.

### `GET /sitemap.xml`
- **Purpose**: XML Sitemap for search engines, listing dynamic incident URLs and provider pages.
- **Response**: `text/xml`.

### `GET /robots.txt`
- **Purpose**: Standard crawler directives.
- **Response**: `text/plain`.

### `GET /embed/:providerId`
- **Purpose**: A lightweight, standalone HTML status widget for a specific provider.
- **Response**: `text/html`.

---

## Private / Removed Endpoints

The following endpoints were strictly for internal/administrative use and **are NOT publicly accessible** (they will return a 404 Not Found):

- `GET /api/notifications` (Removed to prevent exposing subscriber data)
- `DELETE /api/notifications/:id` (Removed to prevent unauthorized unsubscriptions)
- `GET /api/archive/refresh` (Removed; functionality handled by internal Cron)
