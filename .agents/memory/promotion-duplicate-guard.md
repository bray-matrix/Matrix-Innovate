---
name: Promotion duplicate guard + zod date coercion
description: Atomicity pattern for initiative->project promotion and a codegen date pitfall in api-zod bodies.
---

- Initiative -> project promotion must run in a transaction with `SELECT ... FOR UPDATE` on the initiative row; a plain check-then-insert races under concurrency because projects.initiative_id has no unique constraint (allowDuplicate is a legitimate path, so a unique index can't be used).
- **Why:** duplicate-protection (409 unless allowDuplicate) is a spec guarantee; review caught a race in the naive version.
- Generated `@workspace/api-zod` bodies use `zod.coerce.date()` for date-time fields — route handlers receive `Date` objects, not strings. Any string-only date parsing silently nulls valid dates. Accept `Date | string`.
- **How to apply:** any new route touching date-time body fields or uniqueness-by-convention checks.
