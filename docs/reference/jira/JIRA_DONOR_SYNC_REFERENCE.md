# JIRA DONOR SYNC REFERENCE
Describes the sync implementation exactly as it exists in the donor, including weaknesses.
Sources: `artifacts/api-server/src/services/jira/{config,connector,sync}.ts`, `routes/jira.ts`, `repositories/jira.ts`.

## Jira REST endpoints used (Jira Cloud REST API v3)
| Endpoint | Use |
|---|---|
| `GET /rest/api/3/project` | project list (sync + Discover Projects). Non-paginated legacy list endpoint. |
| `GET /rest/api/3/search/jql` | issue search (enhanced search; token pagination, no `total`) |
| `GET /rest/api/3/field` | field discovery |
| `GET /rest/api/3/myself` | identity for Test Connection + reachability probe |
| `GET /rest/api/3/serverInfo` | server title for Test Connection |

## Authentication
Basic auth: `Authorization: Basic base64(email:apiToken)` built per request in `connector.ts` (`authHeader`). Token comes from effective config: DB row `jira_configuration` (id "default") takes precedence; `JIRA_ENABLED=true` + `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` env is the fallback. Base URL normalized (trim, strip trailing slashes, force https://). Token never logged/returned; routes mask it (hasApiToken + short hint). Note: DB-stored token is plaintext at rest.
When not configured at all, every connector operation returns deterministic SAMPLE data (`sampleData.ts`) and flags `usingSampleData: true` — sync still "works" against samples.

## JQL
`<restriction> order by updated DESC` where restriction is:
- `project in ("KEY1","KEY2",...)` when a project selection exists;
- `created >= "1970-01-01"` otherwise (enhanced search rejects unbounded JQL).
Requested fields are listed explicitly (summary, description, issuetype, status, priority, assignee, reporter, created, updated, duedate, resolutiondate, project) plus the mapped story-points custom field when configured.
An existing-but-empty selection returns [] without querying (empty `project in ()` is invalid JQL).

## Pagination & issue limits
- `maxResults=100` per page; opaque `nextPageToken`; loop hard-bounded at **50 pages → absolute cap 5,000 issues per run** regardless of settings.
- `maxIssuesPerRun` from jira_sync_settings (default row value 500; **no settings row → 0 → uncapped up to the 5,000 hard bound**). Applied both as an early loop break and a final `slice`.
- Ordering `updated DESC` means large projects truncate to the most-recently-updated slice. (Confirmed donor limitation.)

## Full vs incremental
Full only. `sync_mode` setting is persisted but never read by `sync.ts`. No `updated >= lastSync` incremental JQL. Every run re-fetches and re-upserts everything in scope.

## 429 / retry / timeout behavior
NONE. No rate-limit detection, no Retry-After handling, no retries, no backoff, no fetch timeout/AbortController. Any non-OK response throws (`Jira request failed with status <n>: <body[0..400]>`) and fails the whole run. A hung connection hangs until platform default socket timeout.

## Sync-run lifecycle
1. `POST /api/jira/sync` → `runJiraSync(log)`. Returns null → HTTP 503 when Postgres is not configured (PG is the system of record).
2. Insert jira_sync_runs row status `running` (uuid, startedAt ISO).
3. Load settings + project/field/status mappings (all optional; absent → legacy full import).
4. Connector fetch (projects + issues in parallel).
5. Filter: projects/issues to selected keys (once ANY mapping row exists, selection is authoritative — zero selected imports nothing); issue-type allow-list (case-insensitive); then remap statuses via jira_status_mappings.
6. Upsert projects then issues (per-row: SELECT existing by unique jira id, then INSERT … ON CONFLICT DO UPDATE; counts created vs updated from the pre-select — N+1 queries, not batched; no transaction around the run).
7. Update run row → `completed` with processed/created/updated counts.
8. Best-effort intelligence persistence: recompute from FULL stored portfolio; insert jira_sync_snapshots row + full-replace jira_project_metrics. Failure here logs but does not fail the sync.
9. On any error: run row → `failed` with generic message ("Sync failed. See server logs for details." — details only in server logs, credential-free).

## Failure handling / crash behavior
- Errors are caught once at the top; partial upserts persist (no rollback).
- Process crash mid-run leaves the run row stuck at `running` forever (no reaper/timeout).

## Missing/deleted issue behavior
Upsert-only. Projects/issues deleted in Jira are NEVER removed from Postgres; they linger and continue to count in intelligence. No tombstoning, no `is_deleted`, no prune.

## Concurrency protection
NONE. No mutex/advisory lock; two simultaneous POST /sync calls run concurrently and double-write (idempotent upserts limit damage, but run stats and snapshot rows duplicate).

## Auto-sync / scheduling
`auto_sync_enabled` + `sync_frequency` are stored settings surfaced in the admin UI, but **no scheduler exists** — sync is manual POST only. No inbound webhooks.

## Snapshots & diagnostics
- Snapshot per completed sync (see intelligence reference). `GET /api/jira/snapshots?limit=` lists recent.
- `GET /api/jira/diagnostics`: aggregates recent sync runs (success/failure, last completed, counts) + executive health rollup (blocked totals, per-project health) computed live from stored rows.
- `GET /api/jira/status`: config presence, DB availability, live reachability probe (`/myself`, never throws), last sync summary.

## API surface (donor routes, all under /api, session-gated)
status; projects; projects/:id; issues[?projectKey&status]; issues/:id; sync (POST); config (GET/PUT); config/test (POST); discover/projects (POST) + discovered-projects (GET); discover/fields (POST) + discovered-fields (GET); project-mappings (GET/PUT); field-mappings (GET/PUT); status-mappings (GET/PUT); sync-settings (GET/PUT); sync-runs?limit=; diagnostics; snapshots?limit=; project-metrics. Contracts in `lib/api-spec/openapi.yaml` (Jira* schemas) with generated zod types in `lib/api-zod`.

## Known weaknesses summary (do not silently "fix" during port without a decision)
1. 5,000-issue hard cap (50×100) + updated-DESC truncation for large tenants.
2. No 429/retry/backoff/timeout handling.
3. Full sync only; sync_mode is dead config.
4. No deletion reconciliation (stale rows).
5. Per-row upserts (N+1) — slow for large imports; no transaction.
6. No concurrency guard; auto-sync settings without a scheduler.
7. API token plaintext in DB.
8. Stuck `running` run rows after a crash.
