# Changelog

All notable changes to the Matrix Innovation Hub are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project adheres to semantic versioning (patch = fixes/edits, minor = new
features, major = breaking or milestone changes).

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
