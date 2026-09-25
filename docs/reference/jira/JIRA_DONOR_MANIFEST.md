# JIRA DONOR MANIFEST
Package: `legacy-compass-jira-donor.zip`
Donor: Legacy Matrix Compass v1.1.1 (matrix-compass.replit.app), created 2026-08-25.
Purpose: source-code preservation of the Jira vertical for consolidation into Matrix Innovation Hub. No secrets, no business data, no synced Jira issue data. Source files are verbatim copies; relative paths preserved under /source.

## /reference
| File | Why |
|---|---|
| JIRA_DONOR_INTELLIGENCE_REFERENCE.md | Exact deterministic formulas: classification, health score/bands, aging, stale, alerts, rollups, snapshots. The most important artifact. |
| JIRA_DONOR_SCHEMA_REFERENCE.md | All 12 jira_* tables: purpose, PKs, uniques/indexes, relationships, delete behavior. |
| JIRA_DONOR_SYNC_REFERENCE.md | REST endpoints, auth, JQL, pagination/limits, lifecycle, failure handling, known weaknesses. |

## /source — API server (Express 5)
| File | Why |
|---|---|
| artifacts/api-server/src/routes/jira.ts | All ~20 Jira HTTP endpoints: status, projects, issues, sync, config (+test), discovery, mappings, settings, sync-runs, diagnostics, snapshots, project-metrics. Token masking lives here. |
| artifacts/api-server/src/routes/index.ts | Shows how the Jira router is mounted and session-gated (context only). |
| artifacts/api-server/src/repositories/jira.ts | Drizzle repositories: idempotent upserts by unique Jira ids, list/read helpers, snapshot insert, project-metric replaceAll. |
| artifacts/api-server/src/services/jira/config.ts | Effective config resolution: DB row over JIRA_* env fallback; base-URL normalization; enable gating. References env var NAMES only. |
| artifacts/api-server/src/services/jira/connector.ts | The only Jira Cloud caller: Basic auth, REST v3 endpoints, enhanced-search token pagination, normalizers, discovery, test/probe, sample fallback. |
| artifacts/api-server/src/services/jira/sync.ts | Sync orchestration: run lifecycle, selection/type filters, status remapping, upserts, best-effort intelligence persistence. |
| artifacts/api-server/src/services/jira/intelligence.ts | Row→intel adapters + snapshot/metric row builders (server side of the shared compute). |
| artifacts/api-server/src/services/jira/sampleData.ts | Synthetic sample projects/issues/fields used when Jira is unconfigured (not production data). |

## /source — shared intelligence library
| File | Why |
|---|---|
| lib/jira-intelligence/src/classify.ts | Status/priority keyword classification + date math. |
| lib/jira-intelligence/src/metrics.ts | The compute engine: project metrics, health score/bands, alerts, executive metrics, snapshots, program/portfolio rollups. |
| lib/jira-intelligence/src/types.ts | Metric shapes + DEFAULT_THRESHOLDS. |
| lib/jira-intelligence/src/index.ts | Public exports. |
| lib/jira-intelligence/package.json, tsconfig.json | Package boundary so the lib can be dropped in as a workspace package. |

## /source — database schema
| File | Why |
|---|---|
| lib/db/src/schema/jira.ts | All 12 jira_* Drizzle tables + zod insert schemas/types. |
| lib/db/src/schema/index.ts | Shows how jira schema exports join @workspace/db (context only; also exports non-Jira schemas). |

## /source — API contracts
| File | Why |
|---|---|
| lib/api-spec/openapi.yaml | OpenAPI source of truth; Jira paths/schemas (Jira*, listJira*). NOTE: whole-spec file — also contains non-Jira Compass paths; only the Jira sections are relevant. |
| lib/api-zod/src/generated/types/jira*.ts, listJira*.ts (24 files) | Generated zod contract types for every Jira request/response shape. Regenerable from the spec, included so the package stands alone. |

## /source — frontend (React/Vite)
| File | Why |
|---|---|
| artifacts/matrix-platform/src/pages/jira-portfolio.tsx | Jira Portfolio page: executive summary, alerts, health/status/priority/aging analytics, rollups, snapshots, refresh, source badge. |
| artifacts/matrix-platform/src/components/jira/intelligence.tsx | Shared UI presenters for intelligence data (badges, charts, tables). |
| artifacts/matrix-platform/src/components/jira/JiraExecutivePanel.tsx | Dashboard-embedded executive Jira panel. |
| artifacts/matrix-platform/src/components/admin/JiraConnector.tsx | Admin UI: connection config/test, discovery, mappings, sync settings, sync history/diagnostics. |
| artifacts/matrix-platform/src/repositories/jira/{index,types,mock,postgres,sampleJira,intelligence}.ts | Frontend data seam: repository interface, mock + API-backed implementations, sample data, client-side rollup compute (calls the shared lib). |

## /source — documentation
| File | Why |
|---|---|
| JIRA_LIVE_VALIDATION_REPORT.md | Donor's live-Jira validation evidence (what was proven to work). |
| CM_IMPORT_READINESS_REPORT.md | Large-project import readiness analysis; documents the 5,000-issue cap and truncation behavior. |

## Deliberately excluded
- node_modules, dist/build output, caches, pnpm-lock.yaml.
- Database contents/dumps, synced Jira issue data, sync history rows.
- Secrets/env values (source references env var NAMES only: JIRA_ENABLED, JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).
- Unrelated Compass business modules (portfolio/projects/reports/PDF/AI etc.).
- lib/db/src/seeds/seed.ts (business seed; its only Jira role is clearing jira_* tables).
- Tests: the donor has NO Jira test files (none exist in the repo).

## Porting notes for Innovation Hub
- The intelligence lib is pure and dependency-free — port it first, verbatim, and keep formulas identical until a deliberate decision changes them (see weaknesses list in the sync reference).
- Auth differs: donor routes assume Compass session middleware; re-gate under Hub's requireMatrixSession.
- Donor UI reads through a repository seam (mock | postgres) — Hub can keep only the API-backed path.
