# Application version management

Innovation Hub uses `artifacts/api-server/src/application-version.json` as its
authoritative version source:

- Intended release: **v1.6.14**
- Internal development: **v1.6.14-dev.2**

The API selects the release identifier under `NODE_ENV=production`, and the
development identifier otherwise. Existing workflows already explicitly set this
environment, so no deployment settings or new environment variables are needed.
Settings (and therefore the sidebar), Matrix health/app-info/manifest, reports
and validation metadata share the existing `APPLICATION_VERSION` export.

Package versions deliberately track development. OpenAPI documentation and
generated specification headers track the intended release. These are checked
copies, not independent authoritative values.

## Updating versions

1. Edit the manifest explicitly.
2. Run `pnpm version:sync` to update package/OpenAPI metadata.
3. Run `pnpm --filter @workspace/api-spec run codegen`.
4. Run `pnpm version:check` and `pnpm version:check:release`, typechecks, tests,
   and production builds.
5. Obtain Brian's explicit approval before GitHub synchronization or republishing.

Builds validate; they do not rewrite source metadata. The production API build
and Vite build both reject a release identifier with `-dev` or any other prerelease
suffix. A stable `x.y.z` release is required. Metadata drift also fails clearly.
API runtime validation adds a second check when starting in production mode.
Development identifiers remain supported; development mode does not require the
selected development version to be stable.

## Validation for this correction

- **147 passing checks:** 6 manifest/CLI safeguard checks; 16 version/settings
  checks across development and production modes; 33 UX/scoring/interview
  regression checks; 92 synthetic signed-launch/session/authorization checks.
- Shared-library, API and frontend typechecks passed.
- API production build and frontend production build passed.
- Development workflow rebuilt successfully; its actual health endpoint returns
  `v1.6.14-dev.2` and database health `ok`.
- Production-mode endpoint tests verify health, app-info, manifest and settings
  report `v1.6.14`, with mocked database responses.
- Negative safeguard tests verify nonzero exit for prerelease release identifiers
  and metadata drift, and successful development validation for dev identifiers.
- The first broader Jira suite attempt encountered a database-backed TEMP-table
  test and failed against the intentionally unreachable synthetic connection.
  It was not retried against either database. Focused no-write endpoint tests
  replaced it; database persistence suites were excluded.
- No database schema/data, authentication, authorization, Graph integration,
  Platform or deployment configuration changes. No unrelated UX changes.
- Existing nonblocking frontend sourcemap/chunk-size warnings remain.

No publishing, deployment or GitHub push was performed. Production will retain
its currently published version label until an explicitly approved republish.
