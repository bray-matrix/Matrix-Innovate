# Matrix Innovation Hub

An internal web application (v0.3.1) for Matrix employees to submit AI innovation ideas — either through a conversational AI Innovation Interview or a classic form — auto-structure them into an AI Opportunity Canvas, score them on a 100-point model, and move them through a lightweight innovation pipeline (Idea → Review → Approved → Prototype → Pilot → Production → Closed/Declined).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `node test-launch-guard.mjs` (from `artifacts/api-server/`, after `pnpm run build`) — full launch-guard auth test matrix against a local mock JWKS
- Required env: `DATABASE_URL` — Postgres connection string; `SESSION_SECRET` — signs the local session cookie. Optional Matrix auth overrides (defaults in `src/matrix/auth.ts`): `MATRIX_PLATFORM_URL`, `MATRIX_ISSUER`, `MATRIX_JWKS_URL` (default ${platform}/api/platform/jwks), `MATRIX_AUDIENCE` (default matrix-innovation-hub), `MATRIX_SESSION_TTL_SECONDS` (default 28800)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend: `artifacts/matrix-innovation-hub/src/` (React + Vite, wouter routing, TanStack Query)
- API contract (source of truth): `lib/api-spec/openapi.yaml` → codegen into `lib/api-client-react` (hooks) and `lib/api-zod` (schemas)
- DB schema (source of truth): `lib/db/src/schema/initiatives.ts`
- API routes: `artifacts/api-server/src/routes/` (initiatives, dashboard, documents, settings)
- Scoring logic: `artifacts/api-server/src/lib/scoring.ts`
- Initiative Intelligence Engine (rule-based recommendations behind a swappable `RecommendationProvider` abstraction): `artifacts/api-server/src/lib/intelligence/`
- AI Provider Abstraction Layer (`AIProvider` interface, `getAIProvider()` factory driven by the `AI_PROVIDER` env var, rule-based active + OpenAI/Claude/Azure/Local LLM placeholders): `artifacts/api-server/src/lib/ai/`
- Internal changelog: `CHANGELOG.md` (update on every version bump)
- Matrix Platform integration (SDK v1): server platform module `artifacts/api-server/src/matrix/` — `platform.ts` (/matrix/app-info, /matrix/health, /matrix/manifest + /matrix/session launch exchange, /matrix/logout) and `auth.ts` (SDK v1.1 Launch Guard: JWKS/RS256 launch-token verification, HttpOnly session cookie, `requireMatrixSession` guard on all /api routes except /api/healthz); frontend launch capture + session gate `artifacts/matrix-innovation-hub/src/lib/matrix-platform.ts` and `src/components/matrix-gate.tsx`
- Theme/colors: `artifacts/matrix-innovation-hub/src/index.css`

## Architecture decisions

- Uses Replit's built-in PostgreSQL + Drizzle (not Supabase). Only `initiatives` is a real table; documents and admin settings are static server-side config.
- Score and priority are computed server-side in `scoring.ts` on create/update — the frontend sends raw scoring components, never the final score, so the model stays authoritative in one place.
- Matrix Platform endpoints live under /matrix (proxy routes /matrix to the API server) and are intentionally kept OUT of the business OpenAPI spec — platform infrastructure is separated from business logic per Matrix SDK best practices.
- The AI Opportunity Canvas is composed client-side from initiative fields via a `generateOpportunityCanvas()` helper (placeholder for future OpenAI wiring — no AI calls yet, per MVP scope).

## Product

Matrix employees can: view a dashboard of pipeline metrics, submit a new AI initiative through a guided multi-section form, view an auto-generated AI Opportunity Canvas per initiative, score initiatives on a 100-point model, browse/filter the initiative list, move initiatives across a Kanban board by status, view governance documents, and review admin configuration.

## User preferences

- Show the app version number at the bottom-left of the blue sidebar menu (requested after v0.1.4; apply with the next change).

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
