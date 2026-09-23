# Taiwan Weather Dashboard V2 — Web Application

This directory contains the Next.js / Vercel stateless web application for the Taiwan Weather Dashboard V2, established in Milestone M7.

## Purpose (Milestone M7)

Milestone M7 establishes the technical foundation for the V2 web application:
- Next.js (App Router) + TypeScript foundation
- Standardized API contract envelope (`{ ok, data, error }`)
- Server-only environment module with on-demand credential validation
- Safe server HTTP client with explicit error taxonomy and defense-in-depth redaction
- Service health endpoint at `/api/health`
- Complete unit test suite with Vitest

> **Status Notice:**
> - The existing Streamlit version in the repository root remains available and functional.
> - Upstream CWA / MOENV data integration will be added in subsequent milestones (M8+).
> - This application has **not** yet been deployed to Vercel.

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
- In Milestone M7, building and running the application (including `/api/health`) does **not** require any API keys.
