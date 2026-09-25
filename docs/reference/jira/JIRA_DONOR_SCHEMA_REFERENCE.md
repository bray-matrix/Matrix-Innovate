# JIRA DONOR SCHEMA REFERENCE
Source of truth: `lib/db/src/schema/jira.ts` (Drizzle, PostgreSQL). All 12 tables are runtime-populated by sync/admin actions; the seed only clears them. No FK constraints are declared anywhere — relationships are by convention on key columns. No soft deletes; deletes are physical (and only `jira_project_metrics` is ever deleted, via full replace). All tables actively used unless noted.

Common columns: `created_at`/`updated_at` timestamptz default now.

## jira_projects
Purpose: normalized imported Jira projects (system of record for UI reads).
PK: `id` (text, `JIRA-PROJ-<jiraProjectId>` — stable across re-syncs).
Important: jira_project_id (UNIQUE `jira_projects_jira_project_id_idx`, upsert conflict target), jira_project_key (INDEX), jira_project_name, project_type, lead_name, lead_account_id, is_active (bool, from Jira `archived !== true`).
Relationships: joined to jira_issues on jira_project_key (no FK).
Delete behavior: never deleted by sync (upsert only) — projects removed in Jira linger.

## jira_issues
Purpose: normalized imported issues.
PK: `id` (`JIRA-ISSUE-<jiraIssueId>`).
Important: jira_issue_id (UNIQUE, upsert target), jira_issue_key (INDEX), jira_project_key (INDEX), summary, description, issue_type, status (INDEX; post-status-mapping value), priority, assignee_name/account_id, reporter_name, story_points (double), created_date/updated_date/due_date/resolution_date (TEXT ISO strings, not timestamps), metadata_json (jsonb, always null on live path).
Delete behavior: never deleted — issues deleted in Jira persist until manual cleanup.

## jira_sync_runs
Purpose: audit trail, one row per sync attempt.
PK: id (uuid). Columns: sync_started_at/sync_completed_at (text ISO), status (`running`|`completed`|`failed`), records_processed/created/updated, error_message. INDEX on created_at (recency).
Status lifecycle: created as `running`, updated to `completed`/`failed`. A crash mid-sync leaves a permanent `running` row (no reaper).

## jira_configuration (single row, id "default")
Purpose: admin-saved connection config; takes precedence over JIRA_* env (env is fallback).
Columns: base_url, email, **api_token (plaintext at rest; never returned to browser — routes mask to hasApiToken + hint)**, enabled, server_title, authenticated_user, last_test_at/ok/message (last Test Connection outcome).

## jira_sync_settings (single row, id "default")
Columns: auto_sync_enabled (persisted only — NO scheduler exists), sync_frequency (default "manual"), max_issues_per_run (default 500; 0 = uncapped), sync_mode (default "full"; **stored but never read by sync — only full sync implemented**), issue_types (jsonb string[] allow-list; empty = all).

## jira_discovered_projects
Purpose: snapshot of "Discover Projects" results for the mapping UI. UNIQUE jira_project_id (upsert). Columns: key/name/project_type/lead_name/status, discovered_at (text).

## jira_discovered_fields
Purpose: snapshot of "Discover Fields". UNIQUE field_id. Columns: name, field_type, custom (bool), discovered_at.

## jira_project_mappings
Purpose: per-project import selection + Matrix mapping. PK/UNIQUE: id == jira_project_key.
Columns: selected (bool — authoritative import scope once ANY row exists; zero selected = import nothing), matrix_program_id (→ Matrix programs, no FK), matrix_portfolio_category.

## jira_field_mappings
Purpose: Matrix concept → Jira field id (e.g. "storyPoints" → customfield_xxxxx). PK: id == matrix_concept (UNIQUE). No Jira field id is hardcoded anywhere.

## jira_status_mappings
Purpose: Jira status name → Matrix status, applied at sync time before persistence. PK: id == slug of jira_status; UNIQUE jira_status.

## jira_sync_snapshots
Purpose: point-in-time portfolio aggregates, one per sync run (trend framework; rows accumulate, no pruning). PK: id (uuid). Columns: captured_at (timestamptz, INDEX), sync_run_id (→ jira_sync_runs, no FK), project/issue/open/completed/blocked/critical/overdue counts, 4 priority counts, health_score. Never updated or deleted.

## jira_project_metrics
Purpose: persisted per-project executive metrics, mirror of ProjectMetric. PK: id == jira project key; UNIQUE jira_project_key. Columns: all counts + todo/in_progress/done, open_story_points, health_class, health_score, last_activity, stale_days, is_stale, captured_at.
Delete behavior: FULL REPLACE each sync (delete all, insert fresh).

## Zod/insert schemas
`createInsertSchema(...)` per table (omit created_at/updated_at), exported as Insert*/Row types from `lib/db/src/schema/jira.ts`; re-exported via `lib/db/src/schema/index.ts` as part of `@workspace/db`.
