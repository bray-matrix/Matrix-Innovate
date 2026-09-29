# Compass (formerly Matrix Innovation Hub)

Compass (v1.2.0) is the combined innovation + execution management product for Matrix, created in the Phase 1 consolidation of Matrix Innovation Hub (surviving foundation) and Matrix Compass. User-facing branding is "Compass"; the technical slug/audience remain `matrix-innovation-hub` (Matrix Platform registration unchanged — migrating them is tracked technical debt).

Execution layer (Phase 1): organizations, clients, programs, projects, and project milestones (all additive tables; org/client/program optional on projects so internal work needs no client). Initiatives can be promoted to projects via POST /api/initiatives/{id}/promote — the initiative is preserved and linked, with duplicate protection (409 unless allowDuplicate). Pages: /projects, /projects/new, /projects/:id, /organizations, /clients, /programs; sidebar navigation is grouped (HOME / INNOVATION / EXECUTION / GOVERNANCE / PRODUCT MANAGEMENT / ADMINISTRATION); dashboard has an execution summary strip.

Governance layer (Phase 2): project risks, formal approvals (server stamps decidedAt on Pending→decided transition only; revert to Pending clears it), and go-live readiness assessments with checklist items (optional standard-category seeding). Readiness status and project health (On Track / At Risk / Off Track / Unknown) are deterministic server-side calculations in artifacts/api-server/src/lib/project-health.ts — AI never sets health. Manual health overrides record reason/who/when and are cleared by setting health to "Unknown". Pages: /portfolio (real-DB rollup with six filters), /approvals (global queue, pending first), project detail tabs (Overview / Milestones / Risks / Approvals / Go-Live Readiness); dashboard shows attention indicators via /api/dashboard/attention. Backend validation harness: artifacts/api-server/test-phase2.mjs.

Reporting & resources layer (Phase 3): resources and project resource assignments (named resource or department-only demand — departments are free-text with standard suggestions, not hard-coded; deleting a resource converts its assignments to department demand, department backfilled transactionally). Capacity is deterministic server-side in artifacts/api-server/src/lib/capacity.ts (Overallocated >100%, Near Capacity 85-100%, Available <85%; only Active assignments within their date window count). Reporting engine artifacts/api-server/src/lib/reporting.ts produces one structured report model (sections of cards/table/keyValues/note) consumed by both the /reports web renderer and the pdfmake PDF renderer (artifacts/api-server/src/lib/report-pdf.ts, standard Helvetica fonts, pdfmake kept external in build.mjs). Eight reports: executive-portfolio, project-status, client-portfolio, program-portfolio, resource-capacity, risk-approval, go-live-readiness, board-pack. Pages: /resources, /reports, project detail Resources tab; portfolio summary includes resource capacity stats. Backend validation harness: artifacts/api-server/test-phase3.mjs.

The innovation core: an internal web application for Matrix employees to submit AI innovation ideas — either through a conversational AI Innovation Interview or a classic form — auto-structure them into an AI Opportunity Canvas, score them on a 100-point model, and move them through a lightweight innovation pipeline (Idea → Review → Approved → Prototype → Pilot → Production → Closed/Declined).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `node test-launch-guard.mjs` (from `artifacts/api-server/`, after `pnpm run build`) — full launch-guard auth test matrix against a local mock JWKS
- Required env: `DATABASE_URL` — Postgres connection string; `SESSION_SECRET` — signs the local session cookie. Optional Matrix auth overrides (defaults in `src/matrix/auth.ts`): `MATRIX_PLATFORM_URL` (default https://matrix-platform.replit.app; issuer and JWKS are discovered from its /.well-known/openid-configuration — never hard-coded), `MATRIX_AUDIENCE` (default matrix-innovation-hub), `MATRIX_SESSION_TTL_SECONDS` (default 28800)

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
- Matrix Platform integration (SDK v1): server platform module `artifacts/api-server/src/matrix/` — `platform.ts` (/matrix/app-info, /matrix/health, /matrix/manifest + /matrix/session launch exchange, /matrix/logout) and `auth.ts` (SDK v1.1 Launch Guard: OIDC discovery of issuer/JWKS from the platform, RS256 launch-token verification, HttpOnly session cookie, `requireMatrixSession` guard on all /api routes except /api/healthz); frontend launch capture + session gate `artifacts/matrix-innovation-hub/src/lib/matrix-platform.ts` and `src/components/matrix-gate.tsx`
- Theme/colors: `artifacts/matrix-innovation-hub/src/index.css`

## Architecture decisions

- Uses Replit's built-in PostgreSQL + Drizzle (not Supabase). Only `initiatives` is a real table; documents and admin settings are static server-side config.
- Score and priority are computed server-side in `scoring.ts` on create/update — the frontend sends raw scoring components, never the final score, so the model stays authoritative in one place.
- Matrix Platform endpoints live under /matrix (proxy routes /matrix to the API server) and are intentionally kept OUT of the business OpenAPI spec — platform infrastructure is separated from business logic per Matrix SDK best practices.
- The interview uses the server-side AI advance endpoint when available, with a deterministic client-side fallback; scoring remains server-authoritative.
- Interview transcript is durable state independent of the adaptive question plan/index: persist user/assistant turns on each transition and resume them verbatim; derive visible answer counts from retained submitted user turns. At AI-to-deterministic-fallback boundaries, map only explicit user/Jira evidence into known fields, retain original qualitative wording/source, and ask the next missing fact without inventing numeric estimates or requiring AI for recovery. Start Over clears only the active local interview draft, never saved Initiatives.

## Product

Matrix employees can: view a dashboard of pipeline metrics, submit a new AI initiative through a guided multi-section form, view an auto-generated AI Opportunity Canvas per initiative, score initiatives on a 100-point model, browse/filter the initiative list, move initiatives across a Kanban board by status, view governance documents, and review admin configuration.

## User preferences

- Show the app version number at the bottom-left of the blue sidebar menu (requested after v0.1.4; apply with the next change).

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
