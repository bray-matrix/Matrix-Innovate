---
name: Publish expression-index introspection
description: Observed Publish diff truncation of a nested PostgreSQL expression index and safe verification approach.
---

When a Publish migration contains truncated expression-index SQL, compare it with `pg_indexes.indexdef` before changing business normalization rules.

**Why:** The department index was valid in PostgreSQL, but the recomputed Publish diff truncated its nested lower/btrim/regexp_replace expression inside a text cast. The precise internal parser cause was not established. Moving the same expression into a stored generated column and indexing the column produced a complete, valid diff without weakening duplicate protection.

**How to apply:** Inspect development and production read-only, recompute the diff, preserve normalization semantics and validate the resulting statements in an isolated temporary table. Never edit production, bypass Publish, or assume all nested expression indexes have this defect.