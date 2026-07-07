# Changelog

All notable changes to the Matrix Innovation Hub are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project adheres to semantic versioning (patch = fixes/edits, minor = new
features, major = breaking or milestone changes).

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
