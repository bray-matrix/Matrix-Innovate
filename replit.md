# Matrix Innovation Hub

An internal web application (v0.2.4) for Matrix employees to submit AI innovation ideas — either through a conversational AI Innovation Interview or a classic form — auto-structure them into an AI Opportunity Canvas, score them on a 100-point model, and move them through a lightweight innovation pipeline (Idea → Review → Approved → Prototype → Pilot → Production → Closed/Declined).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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
- Theme/colors: `artifacts/matrix-innovation-hub/src/index.css`

## Architecture decisions

- Uses Replit's built-in PostgreSQL + Drizzle (not Supabase). Only `initiatives` is a real table; documents and admin settings are static server-side config.
- Score and priority are computed server-side in `scoring.ts` on create/update — the frontend sends raw scoring components, never the final score, so the model stays authoritative in one place.
- The AI Opportunity Canvas is composed client-side from initiative fields via a `generateOpportunityCanvas()` helper (placeholder for future OpenAI wiring — no AI calls yet, per MVP scope).

## Product

Matrix employees can: view a dashboard of pipeline metrics, submit a new AI initiative through a guided multi-section form, view an auto-generated AI Opportunity Canvas per initiative, score initiatives on a 100-point model, browse/filter the initiative list, move initiatives across a Kanban board by status, view governance documents, and review admin configuration.

## User preferences

- Show the app version number at the bottom-left of the blue sidebar menu (requested after v0.1.4; apply with the next change).

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
