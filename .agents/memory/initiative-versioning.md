---
name: Initiative smart version bump & history
description: How per-initiative semantic versions are bumped and why history writes must be atomic
---

Each initiative carries a semver string (`vMAJOR.MINOR.PATCH`, default `v0.1.0`) and an append-only `initiative_versions` audit table. On every meaningful change the server bumps the version and inserts one history row.

**Smart bump rule (server-authoritative, in the PATCH handler + versioning lib):**
- Normal field edit (no status change) → PATCH bump.
- Status change → MINOR bump.
- Status change specifically to `Production` → MAJOR bump.
- A PATCH that changes nothing (all incoming values equal current) is a no-op: no bump, no history row, returns the unchanged record.

**Why:** the score/version model must stay authoritative in one place (server), mirroring how score/priority are computed server-side. The frontend never sends the final version.

**How to apply:** any new mutation path that changes an initiative must go through the same PATCH logic so it gets a history row. The initiative UPDATE and the `initiative_versions` INSERT are wrapped in a single `db.transaction` (both POST-create and PATCH) so a failed history insert rolls back the state change — audit completeness must never diverge from the record.

Date fields (`lastReviewedAt`, `nextReviewAt`) are validated (`new Date` + `Number.isNaN(getTime())`) and reject invalid strings with 400 before any DB write.
