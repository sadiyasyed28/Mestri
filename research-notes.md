# Research notes

## shadcn/ui inspiration
- Repository: https://github.com/shadcn-ui/ui
- Relevant cues: beautifully-designed accessible components, customizable component library, neutral UI chrome, strong typography, crisp borders, and composable primitives.

## OpenAI
- Official status page: https://status.openai.com/
- Visible current message: “We’re fully operational” / “We’re not aware of any issues affecting our systems.”
- Page shows aggregate components including APIs and ChatGPT with uptime percentages.
- Likely Incident.io public status-page structure; known public summary endpoint: https://status.openai.com/api/v2/summary.json
- Manual fallback link should be https://status.openai.com/ if client-side fetch is unavailable.

## Anthropic / Claude
- Official status page redirects to https://status.claude.com/
- Current page state: All Systems Operational.
- The page exposes uptime over the past 90 days for claude.ai, Claude Console, Claude API, Claude Code, Claude Cowork, and Claude for Government.
- Past Incidents list contains incident titles and status updates with UTC timestamps; the page is powered by a public status-page service.
- Likely public incident feed endpoint follows the Statuspage pattern, e.g. https://status.claude.com/api/v2/summary.json and https://status.claude.com/api/v2/incidents.json.
- Manual fallback link: https://status.claude.com/

## xAI / Grok
- Official status page: https://status.x.ai/
- Current page state: No incidents declared; copy says “We are not actively mitigating any known incidents at this time.”
- Page visibly exposes a public RSS Feed link at https://status.x.ai/feed.xml.
- Services include Grok Web, iOS, Android, Build, API regions, API Console, Docs, and more; current service labels are “Available.”
- Manual fallback link: https://status.x.ai/

## Google / Gemini
- Google Cloud Service Health: https://status.cloud.google.com/
- The official Google Cloud page visibly exposes RSS Feed, JSON History, and JSON Product Catalog links and lists Gemini Code Assist, Gemini Enterprise, and Gemini on Agent Platform among products.
- Google AI Studio has a dedicated page at https://aistudio.google.com/status titled “Google AI Studio and the Gemini API Status,” but the browser-rendered page did not expose enough readable content to safely depend on it for client-side parsing.
- Manual fallback link for Gemini: https://aistudio.google.com/status
- A conservative implementation should show Google/Gemini as manual-check unless a browser-safe Google Cloud incident feed can be verified at runtime.
