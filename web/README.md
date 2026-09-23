# Taiwan Weather Dashboard V2 — Web Application

This directory contains the Next.js / Vercel stateless web application for the Taiwan Weather Dashboard V2.

## Milestones Overview

### Milestone M7 — Foundation
- Next.js (App Router) + TypeScript foundation
- Standardized API contract envelope (`{ ok, data, error }`)
- Server-only environment module with on-demand credential validation
- Safe server HTTP client with explicit error taxonomy and defense-in-depth redaction
- Service health endpoint at `GET /api/health`
- Complete unit test suite with Vitest

### Milestone M8 — CWA 7-Day Forecast Server API
- Server-only CWA Open Data client for dataset `F-D0047-091`
- `GET /api/weather/forecast` endpoint
- Normalizes ~685 KB raw response down to ~15 KB clean, sorted payload
- Dynamically pairs "最低溫度" and "最高溫度" by time intervals
- Cache-Control policy: `public, max-age=300, s-maxage=600, stale-while-revalidate=1800`
- Safe error classification without leaking API keys or raw upstream bodies

> **Status Notice:**
> - The existing Streamlit version in the repository root remains available and functional.
> - Observations, air quality (MOENV), and UV integrations will be added in subsequent milestones.

## Local Requirements

- **Node.js**: `v20+` (tested on `v24.13.1`)
- **npm**: `v10+` (tested on `11.8.0`)

## Development & Testing Scripts

Run all commands from within the `web/` directory:

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Run ESLint
npm run lint

# Run TypeScript type check
npm run typecheck

# Run unit tests (Vitest)
npm run test:run

# Run unit tests in watch mode
npm run test

# Create production build
npm run build

# Start production server
npm run start
```

## Environment Configuration

Copy the example file to `.env.local` for local development if needed:

```bash
cp .env.example .env.local
```

- `.env.example` contains only non-sensitive placeholders.
- Real API keys (`CWA_API_KEY`, `MOENV_API_KEY`, `ADMIN_PASSWORD`) must **never** be committed to Git.
- `web/.gitignore` automatically ignores `.env`, `.env.local`, and `.env.*.local`.
- Building and running `/api/health` does **not** require any API keys.
- `/api/weather/forecast` requires `CWA_API_KEY` when called; returns `CONFIG_ERROR` if unconfigured.
