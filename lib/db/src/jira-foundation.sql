-- J1 additive development schema. No changes to existing domain tables/data.
CREATE TABLE IF NOT EXISTS jira_connection_state (
  id text PRIMARY KEY DEFAULT 'default',
  base_url text, account_email_masked text, configured boolean NOT NULL DEFAULT false,
  last_test_status text, last_test_message text, last_test_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jira_projects (
  id serial PRIMARY KEY, jira_project_id text NOT NULL UNIQUE,
  key text NOT NULL, name text NOT NULL, project_type text,
  sync_enabled boolean NOT NULL DEFAULT false,
  project_id integer REFERENCES projects(id) ON DELETE SET NULL,
  last_discovered_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jira_status_mappings (
  id serial PRIMARY KEY,
  jira_project_id integer REFERENCES jira_projects(id) ON DELETE CASCADE,
  jira_status_id text NOT NULL, jira_status_name text NOT NULL,
  canonical_category text NOT NULL DEFAULT 'todo',
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT jira_status_category_check CHECK (canonical_category IN ('todo','in_progress','blocked','done'))
);
CREATE UNIQUE INDEX IF NOT EXISTS jira_status_scope_unique ON jira_status_mappings(jira_project_id,jira_status_id) WHERE jira_project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jira_status_global_unique ON jira_status_mappings(jira_status_id) WHERE jira_project_id IS NULL;
CREATE TABLE IF NOT EXISTS jira_field_mappings (
  id serial PRIMARY KEY,
  jira_project_id integer NOT NULL UNIQUE REFERENCES jira_projects(id) ON DELETE CASCADE,
  due_date_field text, blocked_field text, story_points_field text, additional_mappings jsonb,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);