# Changelog

All notable changes to the Matrix Innovation Hub are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project adheres to semantic versioning (patch = fixes/edits, minor = new
features, major = breaking or milestone changes).

## [1.6.1] - Unreleased

### AI Business Analyst corrective release
- Align structured AI output handling with local validation constraints, retaining evidence safeguards and bounded validation-aware retries with safe diagnostics.
- Make deterministic interview fallback use already supplied context, prefer one primary AI question per turn, and allow confirmation before discarding an active unsaved interview.
- Preserve saved Initiatives, Matrix Platform integration, Jira, scoring, and project/reporting behavior.

## [1.5.2] - 2026-09-28

### Navigation and dashboard clarity
- Relocate sidebar collapse control; group Programs with management navigation.
- Remove the fabricated M mark; the actual Matrix logo asset is unavailable.
- Clean up lifecycle dashboard copy to reflect real capabilities, while preserving the top first-use panel.

## [1.5.1] - 2026-09-27

### Application shell and first-use clarity
- Matrix branding and collapsible left navigation, with authenticated user and Logout in the navigation footer.
- Preserve the application version in the navigation footer.
- Make Guided Idea Interview the primary Dashboard entry point and Quick Submit the secondary direct-entry option.
- Explain the Idea → Initiative → Review / Prioritize → Project → Execution workflow.
- Preserve existing interview, Jira, scoring, project, reporting, portfolio, and Matrix launch/session behavior.
- Primary Owner and Platform server SDK integration remain outside this release.

## [1.5.0] - 2026-09-25

### Business-focused innovation intake
- Business-focused deterministic interviews with optional existing Jira request context.
- Jira identity references carry from intake to Initiative and into Project Linked Work without Jira writes.
- Professional editable titles, clearer required-field validation, and Matrix session submitter prepopulation.
- Improved project planning context, target-date defaults, and intentional empty states.
- Conditional AI/prototype recommendations preserve broader business innovation use cases.
- Approved-user owner selection is deferred pending a Matrix Platform eligible-user directory contract.
- Matrix authentication and existing Jira linked-work behavior retained. No deployment performed.

## [1.4.0] - 2026-09-25

### Linked Jira work items (J2)
- Projects can explicitly link and unlink selected Jira issues; the same issue may be linked to multiple Hub projects.
- Server-side, bounded live Jira search and refresh show current issue details without mirroring or writing Jira issues.
- Additive project Jira link references preserve saved keys during Jira outages; project deletion cascades to links only.
- Project Detail gains Linked Work; J1 connection, projects, fields and statuses remain available.
- Matrix authentication and technical identity unchanged. No deployment performed.

## [1.3.0] - 2026-09-25

### Jira foundation (J1)
- Server-side environment credentials, connection test, project/field/status discovery.
- Additive PostgreSQL connection metadata and project/status/field mappings.
- Admin integration controls with generated OpenAPI clients; no issue synchronization.
- HTTPS-only origin validation, blocked redirects, bounded timeout/rate-limit retries,
  upstream DTO whitelists and credential redaction.
- Preserved donor formulas and schema/sync references under `docs/reference/jira`.
- Matrix authentication and identity contract unchanged. No deployment performed.

## [1.2.1] - 2026-08-23

### Branding cleanup — restore Matrix Innovation Hub name
- Reverted the interim user-facing product name "Compass" back to "Matrix Innovation Hub" across app header, browser title, `/matrix/app-info`, `/matrix/manifest`, footer/about, report and PDF headers, and other visible copy.
- Patch release; no functional, schema, auth, or session changes. Technical slug/audience (`matrix-innovation-hub`), gateway route (`/innovation`), production URL, and Matrix Platform registration all unchanged.

## [1.2.0] - 2026-08-23

### Compass Consolidation Phase 3 — Reporting / PDF + Resources / Capacity
- Resources: resources + project_resource_assignments tables (additive), CRUD APIs, /resources page with capacity, allocation, and overallocation filters; deleting a resource converts its assignments to department-only demand.
- Assignments support both named resources and department-only demand; project detail gains a Resources tab.
- Deterministic server-side capacity calculation (Overallocated >100%, Near Capacity 85-100%, Available <85%); department demand reported separately from named capacity.
- Portfolio summary now includes overallocated resources, near-capacity resources, and unfilled department demand with drill-through to /resources.
- Reporting engine: centralized service producing a structured report model consumed by both the web renderer and the PDF renderer. Catalog: Executive Portfolio, Project Status, Client Portfolio, Program Portfolio, Resource Capacity, Risk & Approval Summary, Go-Live Readiness, Board / Leadership Pack.
- PDF export for every report (server-side pdfmake, standard fonts) with generated timestamp, Compass branding, version, and scope; identical data model to on-screen view.
- /reports page with scope selection (project/client/program), on-screen rendering, PDF download, and print-friendly output.
- Dashboard gains a small quick-links area (Portfolio, Reports, Resources); navigation adds Resources and a REPORTING section.
- All schema changes additive; no seeded business data; SDK v1.1 auth unchanged.

## [1.1.0] - 2026-08-23

### Compass Consolidation Phase 2 — Portfolio, Risks, Approvals, Go-Live Readiness
- Risk register: project_risks table + CRUD, severity/probability/impact/status, Risks tab on Project Detail.
- Formal approvals: project_approvals table + CRUD, approve/reject with decision notes (server stamps decidedAt), pending-first project section and global /approvals queue.
- Go-Live Readiness: readiness_assessments + readiness_items (extends the validation/checklist pattern), optional standard-category seeding, deterministic server-computed readiness status (Ready / At Risk / Not Ready / Not Started).
- Portfolio (/portfolio): real-DB summary + per-project rollup (milestone progress, top open risk, pending approvals, readiness) with search and filters.
- Deterministic server-side project health (On Track / At Risk / Off Track / Unknown) from risks, milestones, approvals, and readiness; manual health overrides tracked with reason/who/timestamp and never silently overwritten.
- Dashboard execution attention indicators (open Critical/High risks, pending approvals, not-ready go-live projects, overdue milestones).
- Navigation: Portfolio under HOME, Approvals under EXECUTION.
- All schema changes additive; SDK v1.1 integration unchanged.

## [1.0.0] - 2026-08-23

### Compass Consolidation Phase 1 (surviving foundation)
- Product renamed to **Compass** (user-facing branding only; technical slug/audience remain matrix-innovation-hub pending Platform coordination).
- New execution domain: organizations, clients, programs, projects, project_milestones tables (additive; Drizzle FKs; no existing table changed).
- Projects support client AND internal Matrix work — organization/client/program all optional; extensible projectType.
- Initiative -> Project promotion (POST /api/initiatives/{id}/promote) with duplicate protection (409 unless allowDuplicate); initiative preserved as business-case record.
- New pages: /projects, /projects/new, /projects/:id, /organizations, /clients, /programs; grouped sidebar navigation.
- Dashboard execution summary (active / at-risk / due-soon projects, approved-unpromoted initiatives).
- Matrix SDK v1.1 integration unchanged; version reporting bumped to v1.0.0.

## [0.4.0] — 2026-07-16

### Added

- Gateway compatibility (MAS-001 — Gateway-Compatible Applications): the app
  can now run beneath an upstream gateway prefix (e.g.
  https://matrix-platform.replit.app/innovation) while remaining fully
  functional at its standalone URL — from a single build and deployment.
- Configurable public base path: `GATEWAY_BASE_PATH` (set to /innovation in
  the web artifact config; a non-root `BASE_PATH` is also honored). No
  hostname is ever hardcoded — the prefix is derived from configuration and
  detected at runtime from the current URL.
- Production builds emit relative asset URLs; an inline bootstrap script in
  index.html detects whether the page is being served beneath the configured
  prefix and anchors assets, favicon, client router (wouter base), generated
  API client calls, and /matrix session calls to that prefix.
- Server API and static routes stay at root — the gateway strips the prefix
  before forwarding, and standalone traffic hits root directly. Session
  cookies (path=/) work unchanged beneath the gateway domain.
- Authentication is unchanged (Launch Guard v0.3.x); no feature or design
  changes.

## [0.3.2] — 2026-07-16

### Changed

- Connected to the real Matrix Platform Identity Provider (Matrix Platform
  v0.20.0). The server now discovers issuer and JWKS via
  `GET /.well-known/openid-configuration` on the platform; the JWKS URL is
  no longer hard-coded and the previous `MATRIX_ISSUER` / `MATRIX_JWKS_URL`
  development overrides were removed.
- Launch tokens are validated against the discovered metadata: issuer from the
  discovery document, application audience, RS256 algorithm pinning,
  expiration, and signature via the discovered `jwks_uri`.
- Discovery document is cached for 5 minutes; a stale copy is served on
  transient platform outages rather than failing verification config.
- Logout now returns the user to Matrix Platform: the server reports the
  discovered `matrix_logout_endpoint` and the frontend navigates there after
  the local session cookie is cleared.
- Direct access remains blocked; no business functionality changed.

## [0.3.1] — 2026-07-16

### Security

- Matrix Platform Launch Guard (Matrix SDK v1.1 Trust Model): unauthenticated
  access to the Innovation Hub is now blocked end to end.
- Launch tokens are no longer trusted by presence. The frontend reads the
  short-lived RS256 launch token from the URL fragment
  (`#matrix_token=<JWT>`), scrubs it from the URL immediately, keeps it only
  in memory, and exchanges it once via `POST /matrix/session`.
- Server-side verification against the Matrix Platform JWKS: RS256 algorithm
  pinning, issuer, application audience, expiration, required identity claim
  (sub), and rejection of contradictory application-id claims. Invalid tokens
  return 401; raw tokens are never logged or persisted.
- Successful exchange mints a short-lived local application session cookie
  (HttpOnly, SameSite=Lax, Secure in production, 8h default TTL). The launch
  token is not the ongoing browser credential.
- All business APIs under /api now require the authenticated session and
  return 401 without it (the deployment health probe /api/healthz remains
  public). Business pages do not render without a session.
- Direct access shows a "Matrix Platform sign-in required" screen with a
  link back to Matrix Platform; no separate login system was added.
- Logout destroys the local session, clears the cookie, and returns to the
  launch-required screen.
- Public metadata endpoints (/matrix/health, /matrix/app-info,
  /matrix/manifest) remain anonymous and expose safe metadata only.
- Resolves Replit Security Center findings: unauthenticated modification /
  deletion / initialization of business data (Critical) and unauthenticated
  reads of internal initiative and workflow data (High).

### Configuration

- New environment variables (all optional, with defaults):
  `MATRIX_PLATFORM_URL`, `MATRIX_ISSUER`, `MATRIX_JWKS_URL`,
  `MATRIX_AUDIENCE`, `MATRIX_SESSION_TTL_SECONDS`. Requires
  `SESSION_SECRET`.

## [0.3.0] — 2026-07-15

### Added

- Matrix Platform onboarding (Matrix SDK v1): the Innovation Hub is now a
  Matrix Platform application.
- New platform endpoints served from a dedicated platform module, separate
  from business routes: `GET /matrix/app-info` (name, slug, version, SDK
  version, owner, auth mode), `GET /matrix/health` (status, version, database
  check), and `GET /matrix/manifest` (application manifest with production
  and preview URLs, health and version endpoints).
- Matrix Platform authentication trust: the server accepts a launch token via
  `X-Matrix-Launch-Token` or bearer authorization and trusts it per the SDK
  (no separate login). Tokens are never logged or persisted server-side.
- Platform launch compatibility: the frontend captures `matrix_token` and
  `matrix_user` launch parameters, stores them for the session, strips them
  from the URL, forwards the token on API calls, and shows the launch context
  in the header.
- Proxy routing for `/matrix` paths to the API server.

## [0.2.4] — 2026-07-07

### Added

- System Initialization Wizard: "Initialize Environment" action in Admin
  Settings to prepare the hub for production use. Business Data options —
  archive sample initiatives (snapshotted with versions and calculation
  history to a new `archived_initiatives` table before removal), remove
  sample initiatives, clear validation records, clear calculation history,
  and clear recommendation history (informational — recommendations are
  computed on demand and never stored). System Data (governance documents,
  product backlog, parking lot, AI provider configuration, application
  settings, validation templates, version history) is always preserved and
  shown as locked in the wizard.
- Confirmation summary step before execution; only selected actions run.
- Environment History log (`environment_events` table) recording date, user,
  environment, and actions performed for every initialization run, displayed
  in Admin Settings.
- "First-Time Setup Complete" flag persisted in a new `system_flags` table
  and surfaced as a badge in Admin Settings so future deployments know
  initialization has already occurred.
- New API endpoints: `GET /api/environment` (status, flag, record counts),
  `POST /api/environment/initialize`, `GET /api/environment/history`.

### Changed

- Application version to v0.2.4. No existing functionality or architecture
  was modified.

## [0.2.3] — 2026-07-07

The Hub now manages its own evolution: a Product Backlog and Parking Lot
module replaces external notes and emails for tracking enhancements, bugs,
technical debt, and parked ideas. No changes to initiative workflows or AI
providers.

### Added

- New "Product Backlog" sidebar item with two views: Active Product Backlog
  and Parking Lot, both in an enterprise table with search, filters, sorting,
  column visibility, CSV export, and an Excel export placeholder.
- Backlog items (PB-0001 ids) with type, priority, status, target version,
  module, submitted by, assigned to, notes, and optional links to
  initiatives, validation records, and application versions.
- Parking lot items (PL-0001 ids) with reason parked, estimated value, and a
  future-release-candidate flag.
- Saved table layouts: the Save Layout button now persists sorting, visible
  columns, and page size per table in the browser.
- Dashboard "Product Health" widget: open backlog items, parking lot items,
  completed this release, and the current application version.
- New API endpoints: `/backlog`, `/backlog/{id}`, `/parking-lot`,
  `/parking-lot/{id}`, `/product-health`, backed by new `backlog_items` and
  `parking_lot_items` tables.
- Seeded the backlog with the six major features delivered so far and the
  parking lot with five deferred ideas.

### Changed

- Application version bumped to v0.2.3.

## [0.2.2] — 2026-07-07

Polish pass on the AI Provider Configuration experience in Admin, preparing
the ground for future OpenAI, Claude, Azure OpenAI, or Local LLM setup. No
provider switching, no API keys, no vendor calls, and no changes to
initiative workflows.

### Added

- **Provider status badges** — each registered provider now shows badges for
  Active, Available, Not Configured, Passed Last Test, and Failed Last Test,
  derived from its registration status and its most recent readiness test.
- **Per-provider configuration summary** — Admin now shows a read-only
  summary card for every registered provider: name, provider key,
  status badges, capability list, last test result, last test timestamp,
  and operator notes.
- **Provider Switching Preview** — a new read-only Admin section showing the
  current active provider, every registered provider, and an explanation of
  what would happen if it became active, with a clear warning that
  placeholder providers are registered but not configured. Actual switching
  remains disabled — the active provider is still selected only via the
  AI_PROVIDER environment variable.
- **API** — `GET /api/settings` now returns per-provider `isActive`,
  `capabilities`, `lastTestPassed`, `lastTestAt`, and `switchImpact`, plus
  the active provider id.

### Changed

- The detailed provider test result panel now hydrates from the latest
  stored test event after a page reload instead of only showing results from
  the current session.

## [0.2.1] — 2026-07-07

AI Provider validation and readiness testing — proving the abstraction layer
works end to end before any real OpenAI or Claude integration. No changes to
user-facing initiative workflows.

### Added

- **Test Provider button** — Admin > AI Provider Configuration now has a
  "Test Provider" button that runs a safe internal readiness test of the
  active provider against synthetic sample initiative data (never real
  initiatives). Results show the provider name, pass/fail status, timestamp,
  every capability tested with its outcome, and the error message if a
  capability failed.
- **Capability coverage** — the test exercises classifyInitiative,
  generateExecutiveSummary, generateOpportunityCanvas,
  generateRecommendations, estimateComplexity, recommendPrototypeScope, and
  explainScoreChange. The rule-based engine passes all seven; placeholder
  providers fail cleanly with "Provider is registered but not configured."
- **Provider Test History** — every test run is stored in a new
  `provider_test_events` table and shown in a new history table in Admin
  (newest first, with capability pass counts and error details).
- **API** — `POST /api/settings/ai-provider/test` runs and stores a test;
  `GET /api/settings/ai-provider/tests` returns the history.

### Changed

- "Last Provider Test" in Admin now reflects the most recent stored test run
  instead of always showing "Never run".

## [0.2.0] — 2026-07-07

Architecture sprint: AI Provider Abstraction Layer. No user-facing behavior
changes — all generated intelligence behaves exactly as before.

### Added

- **AI provider abstraction** — a unified `AIProvider` interface now fronts
  all generated intelligence (classification, executive summaries,
  opportunity canvas, interview questions, recommendations, complexity
  estimates, prototype scope, and score-change explanations). Business logic
  and routes obtain the provider via a config-driven `getAIProvider()`
  factory (`AI_PROVIDER` environment variable) instead of calling any
  implementation directly.
- **Registered provider placeholders** — OpenAI, Claude, Azure OpenAI, and
  Local LLM providers are registered as placeholders that fail loudly if
  selected, so vendors can be implemented later without touching business
  logic or UI. The rule-based engine remains the only active provider.
- **Admin → AI Provider Configuration** — a new read-only section showing
  the active provider, its status, the last provider test, all available
  providers with configuration status, and operator notes. No API keys are
  stored or displayed.
- **Source labels** — every place that displays generated intelligence now
  states its source: the interview review screen (executive summary and
  canvas), the initiative detail canvas, the recalculation result dialog
  (label supplied by the server from the active provider), and the
  calculation history tab.

### Changed

- The recommendations endpoint and the recalculation explanation logic now
  route through the AI provider abstraction (delegating to the same rule
  engine as before — output is unchanged).
- The settings endpoint now includes the AI provider configuration, and the
  recalculation result includes a `sourceLabel` field.

## [0.1.9] — 2026-07-07

### Added

- **Recalculation transparency** — the Recalculate button now returns a
  detailed result. When values change, a "Recalculation Result" dialog shows
  the previous → new Innovation Score with net change, any priority change,
  every changed scoring component (previous → new points with the reason it
  changed), and the list of unchanged components. When nothing changes, a
  toast confirms "No changes detected. Innovation Score remains unchanged."
- **Calculation audit trail** — every recalculation (including no-change runs)
  is stored in a new `calculation_events` table with timestamp, who triggered
  it, previous/new score and priority, and per-component changes with reasons.
  Exposed via `GET /api/initiatives/{id}/calculations`.
- **Calculation History tab** — the Initiative Workspace history section is
  now tabbed: "Version History" (existing table) and a new "Calculation
  History" tab listing each recalculation event with score delta, priority
  change, user, timestamp, and expandable component-level details.
- **Calculated-field info icons** — new reusable info popover explaining how
  each calculated value is derived: Innovation Score and Priority in the
  workspace header, Expected Value and Recommended Next Step on the AI
  Opportunity Canvas. Each popover lists the calculation logic, the inputs
  that affect it, and which values are user-entered vs system-generated.
- **Recommendation provenance** — every Initiative Intelligence card now shows
  a Confidence percentage and a Source label ("Rule Engine v1"), returned by
  the API as `sourceLabel` so a future AI-powered engine can swap in its own
  label without frontend changes.

### Changed

- `POST /api/initiatives/{id}/recalculate` now returns a `RecalculationResult`
  (initiative, changed flag, previous/new score and priority, net change,
  component changes with reasons, unchanged components) instead of the bare
  initiative.
- The Intelligence header badge now shows the recommendation source label
  instead of the internal engine id.

## [0.1.8] — 2026-07-06

### Added

- **Validation Review Checklist system** — a new "Validation" section (new
  sidebar navigation item and `/validation` page) where Matrix users can
  validate every application version before sign-off and generate clean
  feedback for Replit or another development team.
- **Generate Validation Checklist** button — creates a validation record for
  the current application version, seeded from built-in checklist templates
  covering all ten feature areas: Dashboard, AI Innovation Interview,
  Initiative List, Initiative Detail / Workspace, Scoring, Kanban, Documents,
  Admin, Intelligence Engine, and Version History. Each checklist item has a
  feature area, breadcrumb/navigation path, what to validate, expected
  result, a Pass / Fail / Not Tested toggle, and optional comments.
- Validation records store Application Version, Release Name, Validation
  Status, Validation Date, Validator Name, Summary, and Overall Validation
  Notes. Status is derived automatically from item results (Not Started /
  In Progress / Passed / Failed) and the validation date is stamped when a
  run reaches a terminal state.
- **Generate Replit Feedback** button — produces a copy/paste summary with
  the version tested, passed / failed / not tested items, all comments, and
  recommended fixes, formatted for pasting directly back into Replit Agent.
- New database tables `validation_records` and `validation_items`; new API
  endpoints `GET/POST /api/validations`, `GET/PATCH/DELETE
  /api/validations/{id}`, and `PATCH /api/validations/{id}/items/{itemId}`.

## [0.1.7] — 2026-07-06

### Added

- **Initiative Workspace** — the Initiative Detail page now supports inline
  editing behind an Edit Mode toggle. Editable inline: Executive Summary,
  Opportunity Canvas fields (Problem, Current Process, Desired Outcome, AI
  Opportunity), Business Value estimates, Prototype Goal, Success Metrics,
  Risks (Compliance / Technical Complexity / Data Readiness), Business Owner,
  and Executive Sponsor. Saving creates a new Initiative Version.
- **Executive Summary override** — the summary was previously always
  auto-composed from title/category/department. It is now stored per
  initiative when a user edits it; leaving it blank falls back to the
  auto-generated summary (new nullable `executive_summary` column).
- **Recalculate** button — reruns the Scoring Engine, the AI Readiness
  calculation, and refreshes the Initiative Intelligence recommendations from
  the currently stored fields, without repeating the interview. Derived
  components (revenue potential, cost savings, AI readiness, complexity and
  risk penalties) are recomputed deterministically; human-judgment components
  (business value, strategic alignment, prototype confidence, customer
  impact) are preserved. New endpoint `POST /api/initiatives/{id}/recalculate`.
- **Version comparison** — every save now stores a full field snapshot on the
  version history entry (new `snapshot` column). A "Compare with Previous"
  dialog shows a side-by-side comparison of the current vs previous version
  with changed fields highlighted. New endpoint
  `GET /api/initiatives/{id}/compare`. Versions recorded before v0.1.7 have
  no snapshot and report the comparison as unavailable.

## [0.1.6] — 2026-07-06

### Added

- **Initiative Intelligence Engine** — a modular, deterministic (rule-based)
  recommendation engine that analyzes an initiative after submission. It lives
  behind a `RecommendationProvider` abstraction on the API server so it can
  later be replaced by OpenAI, Claude, or another provider without changing
  the API contract or the UI. Placeholder services: `generateRecommendations()`,
  `findSimilarInitiatives()`, `estimateComplexity()`, `recommendPrototypeScope()`.
- New API endpoint `GET /api/initiatives/{id}/recommendations`.
- New **Initiative Intelligence** section on the Initiative Detail page with
  collapsible recommendation cards: Similar Initiatives, Recommended Prototype
  Scope, Estimated Complexity, Estimated Prototype Duration, Suggested Team
  Roles, Potential Risks, Expected Business Value, Confidence Score, and
  Recommended Next Action — styled consistently with the Executive Dashboard.
- Introduced this internal CHANGELOG.

## [0.1.5] — 2026-07-06

### Changed

- Dashboard transformed into an **Executive Command Center**: 8 large KPI
  cards (savings, revenue, hours saved, active initiatives/prototypes,
  success rate, average score, average prototype duration), a "My Attention
  Required" section (awaiting review, prototypes nearing the 14-day deadline,
  high-value initiatives without an executive sponsor, recently completed
  prototypes), and executive-friendly Recharts visual summaries.
- Application version is now displayed at the bottom-left of the sidebar,
  sourced from the settings API.

## [0.1.4] — 2026-07-06

### Added

- Reusable data table (search, sort, pagination, CSV export) used by the
  initiatives list and version history.
- Per-initiative semantic versioning with transactional version-history
  writes (edit = patch, status change = minor, move to Production = major).

### Fixed

- Date fields now validated server-side (400 on invalid dates).

## [0.1.0 – 0.1.3]

- Initial MVP: initiative submission form, AI Innovation Interview flow,
  AI Opportunity Canvas, 100-point scoring model with server-side score and
  priority computation, pipeline Kanban board, dashboard, governance
  documents, and admin settings.
