# mestri

> **AI service availability — The signal, not the speculation.**
>
> A quiet, no-signup status tracker for the AI services you rely on.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Vercel Ready](https://img.shields.io/badge/deploy-vercel-black?logo=vercel)

---

## Overview

**mestri** is a minimalist, fast, and deterministic availability ledger for top AI platforms including OpenAI, Anthropic, xAI, Google AI Studio, and Mistral. It queries live public status feeds directly without requiring account creation or telemetry tracking.

- **Direct Signal**: Connects directly to provider status feeds.
- **Incident History**: 30-day visual health ledger and historical timelines.
- **Zero Config**: No database or backend credentials required for standard usage.
- **Vercel Native**: Fully configured for static edge deployment with client-side SPA routing.

---

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + Custom Design System
- **Routing**: [wouter](https://github.com/molefrog/wouter)
- **Icons & UI**: [Lucide React](https://lucide.dev/), [Radix UI](https://www.radix-ui.com/)
- **Deployment**: [Vercel](https://vercel.com/) (Edge Static CDN)

---

## Deploy to Vercel

### Option 1: Import via Vercel Dashboard

1. Push this repository to GitHub.
2. Go to your [Vercel Dashboard](https://vercel.com/new).
3. Click **"Import Project"** and select `Mestri`.
4. Vercel automatically detects the configuration from [`vercel.json`](./vercel.json):
   - **Framework Preset**: `Vite`
   - **Output Directory**: `dist/public`
   - **Build Command**: `pnpm run build`
5. Click **Deploy**.

### Option 2: Deploy via Vercel CLI

```bash
npx vercel
```

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [pnpm](https://pnpm.io/) (v10+ recommended)

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hameem-codes/Mestri.git
   cd Mestri
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Start development server:**
   ```bash
   pnpm run dev
   ```

4. **Build for production:**
   ```bash
   pnpm run build
   ```

5. **Type check:**
   ```bash
   pnpm run check
   ```

---

## License

[MIT](LICENSE)
