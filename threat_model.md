# Threat Model

## Project Overview

Matrix Innovation Hub is an internal idea-management application for Matrix employees. It has a React/Vite frontend in `artifacts/matrix-innovation-hub/`, an Express API in `artifacts/api-server/`, and a PostgreSQL database accessed through Drizzle. Deployment metadata indicates a public production target, so successful production builds must be treated as internet-reachable even if the product is intended for internal users. The `artifacts/mockup-sandbox/` app is treated as dev-only unless production reachability is demonstrated.

## Assets

- **Initiative records and version history** — submissions include employee names, business owners, executive sponsors, internal process descriptions, planned AI use cases, and estimated revenue/cost impacts. Exposure would leak internal strategy and operational details.
- **Operational workflow data** — backlog items, parking-lot items, validation records, environment history, and provider test history reveal internal roadmap, release readiness, and operational activity.
- **Integrity of pipeline state** — initiative status, scores, priorities, version snapshots, validation outcomes, and environment-initialization actions drive business decisions. Unauthorized changes could disrupt governance and mislead stakeholders.
- **Application secrets and infrastructure access** — database credentials and any future AI-provider credentials are high-impact if exposed through code, logs, or unsafe integrations.

## Trust Boundaries

- **Browser to API** — all frontend requests cross from an untrusted client into the Express server. The browser, URL parameters, headers, and request bodies must all be treated as attacker-controlled.
- **API to PostgreSQL** — the API has direct read/write access to sensitive business data and operational history. Any route-level authorization failure exposes the full dataset.
- **Matrix platform to application** — Matrix launch parameters and headers are intended to convey identity, but the public deployment means the app must not assume requests came from the trusted platform unless authenticity is actually verified server-side.
- **Public to internal-user boundary** — the product is described as internal, but the deployment visibility is public. Internal-only data and admin operations therefore require explicit server-side authentication and authorization.
- **Production to dev-only boundary** — `artifacts/mockup-sandbox/` and other experimentation-only surfaces are out of scope unless they are shown to be reachable from the production deployment.

## Scan Anchors

- Production backend entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/`, `artifacts/api-server/src/matrix/platform.ts`
- Production frontend entry points: `artifacts/matrix-innovation-hub/src/main.tsx`, `artifacts/matrix-innovation-hub/src/App.tsx`, `artifacts/matrix-innovation-hub/src/lib/matrix-platform.ts`
- Highest-risk code areas: `/api/initiatives*`, `/api/environment*`, `/api/settings*`, `/api/validations*`, `/api/backlog*`, and matrix launch-token handling
- Public vs authenticated vs admin surfaces: `/matrix/*` is infrastructure metadata; business routes under `/api/*` include both read and write operations and must not rely on frontend-only assumptions for access control
- Dev-only area to usually ignore: `artifacts/mockup-sandbox/`

## Threat Categories

### Spoofing

The application is intended to trust Matrix Platform launch context instead of a separate login flow. That only works if the backend can distinguish real platform-issued identity from attacker-supplied headers or bearer tokens. On a public deployment, the server must verify authenticity before treating a request as an authenticated internal user. Any route that accepts a claimed launch token or username without validation risks letting an external attacker impersonate arbitrary employees.

### Tampering

The client submits initiative content, scoring inputs, validation outcomes, backlog changes, and environment-management actions. Because these fields affect governance decisions and can trigger destructive state changes, all write routes must enforce server-side authorization in addition to Zod schema validation. Validation alone protects shape, not permission. Environment reset/archive actions and status or score changes are especially sensitive because they can alter or destroy operational data.

### Information Disclosure

The database stores internal business proposals, employee names, workflow history, and operational status. Publicly reachable read endpoints must not expose these records without confirmed internal-user authorization. API error handling and logs must also avoid leaking credentials, cookies, or infrastructure details. Future AI-provider configuration must never expose provider keys, endpoints, or sensitive prompt data through settings or test surfaces.

### Denial of Service

Public routes can be abused to trigger repeated database scans, repeated provider tests, or expensive recommendation and recalculation flows. Endpoints that mutate large datasets or run repeated computation must either require authenticated users with the right role or apply defensive throttling and bounded work. Bulk environment-initialization actions are especially sensitive because they can be used to repeatedly disrupt service data.

### Elevation of Privilege

This project has a meaningful distinction between ordinary internal viewers and operator/admin-style actions such as deleting initiatives, modifying backlog and validation data, testing providers, and initializing the environment. Those privileged actions must be enforced server-side. The system must not let unauthenticated internet users, or ordinary users, reach destructive or administrative capabilities simply because the frontend shows them an admin page or because a request includes a self-asserted Matrix header.