# AI Status Tracker — Design Direction

## Three initial stylistic approaches

### Theme Name: Quiet Signal Ledger
Very light editorial status page with warm paper neutrals, thin rules, compact mono metadata, and restrained status colors. Feels trustworthy, calm, and designed for quick scanning.

**Probability:** 0.083

### Theme Name: Night Watch Console
Dark observability surface with graphite panels, luminous status dots, and high-contrast activity strips. Feels focused and technical, with a subtle command-center mood.

**Probability:** 0.061

### Theme Name: Civic Utility Board
Airy public-service interface with off-white surfaces, wide margins, and primary-color accents inspired by municipal signage. Feels open, dependable, and broadly accessible.

**Probability:** 0.027

## Chosen approach: Quiet Signal Ledger

### Design Movement
Swiss editorial modernism crossed with contemporary developer-tool UI: disciplined typographic hierarchy, generous negative space, and visual rules that make information feel organized without feeling bureaucratic.

### Core Principles
- **Scan before read:** each provider gets one strong identity row, one status label, one uptime strip, and one latest update.
- **Quiet confidence:** neutral surfaces, high contrast, and thin borders do the work; decoration stays subordinate to operational content.
- **Human timestamps:** relative time is primary, exact time is available as a title attribute for precision.
- **Status colors with meaning:** lime means available, amber means degraded, coral means outage; never use color as the only signal.

### Color Philosophy
The base is a warm, almost-paper white with ink-black type and cool gray rules. The signature chartreuse-lime is intentionally a little unexpected: it turns “operational” into a visible pulse without making the site feel like a neon dashboard. Amber and coral are reserved for degraded and outage states so the semantic palette stays sparse and memorable.

### Layout Paradigm
A narrow, left-anchored editorial column with a wide breathing margin on larger screens. A compact masthead leads into a single stacked list of provider rows. Each row uses a 4-column rhythm on desktop—identity, status, uptime, update—but collapses into a strict vertical sequence on mobile. No secondary nav, sidebar, filters, charts, or analytics.

### Signature Elements
- A small monogram mark made from three stacked signal bars, used in the masthead and favicon.
- Thin numbered rules and a micro “last checked” line to make the page feel like a live record.
- Rounded-square provider marks rendered as simple letterforms or geometric badges rather than external logo dependencies.

### Interaction Philosophy
Interactions are direct and low-drama. Rows lift by one or two pixels on hover, the manual-check link has a crisp underline transition, and the refresh button gives immediate feedback without opening a drawer or modal. Focus states remain visibly outlined for keyboard users.

### Animation
Use a short, snappy stagger as provider rows enter, with opacity and translateY only. The refresh icon spins once on demand; uptime bars reveal left-to-right on first paint. Keep all transitions below 220ms and disable non-essential motion under `prefers-reduced-motion`.

### Typography System
- **Display / headings:** `Space Grotesk`, 600–700, tight tracking for the masthead and page title.
- **Body:** `DM Sans`, 400–500, used for update copy and explanatory text.
- **Metadata:** `IBM Plex Mono`, 500–600, uppercase, compact, and used for labels, timestamps, percentages, and state text.

Hierarchy: wordmark 13px mono, page title `clamp(2.5rem, 6vw, 5.5rem)`, section label 11px mono, provider name 18px semibold, update copy 14px regular, metadata 11px mono.

### Brand Essence
**mestri is a no-signup field guide to the health of the AI tools people rely on, built for anyone who needs the signal without the noise.**

Personality adjectives: **measured, transparent, alert**.

### Brand Voice
Headlines are concise and observational. CTAs sound like useful actions, not conversion prompts. Microcopy names the limitation plainly when a provider feed is not available.

Example lines:
- “The signal, not the speculation.”
- “Provider-reported updates, gathered in one quiet place.”

### Wordmark & Logo
The wordmark is set in Space Grotesk with a tailored lowercase `mestri` lockup and a lime geometric mark aligned to the cap height. The mark is an abstract three-stroke `m` built from stepped signal lines, creating a compact, measured silhouette without relying on literal text.

### Signature Brand Color
**Signal Lime — `#C8F169`**. It is bright enough to read instantly as a positive live-state indicator, but warm and muted enough to keep the interface editorial rather than cyberpunk.

## Brand update
The product name is now **mestri**. The new mark replaces the earlier pulseboard-bars concept while preserving the same quiet signal language.

## Data notes

Public provider status pages will be linked directly, with live fetch attempts where a browser-safe feed is available. If a provider feed cannot be read client-side because it does not expose a public JSON/RSS endpoint or blocks cross-origin access, the row will remain honest and show a clear **Check manually** action instead of inventing a status update.
