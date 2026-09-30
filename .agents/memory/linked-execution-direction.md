---
name: Linked execution direction
description: Product boundary superseding earlier Jira synchronization plans
---
Jira remains the execution system of record. Innovation Hub deliberately links selected work items and reads current details; do not revive earlier broad synchronization, issue warehouse, polling, or ingestion proposals.

**Why:** Brian explicitly rejected the previously proposed synchronization-based J2 architecture in favor of higher-level project oversight and selected external relationships.

**How to apply:** Treat old donor sync references and earlier J2–J5 plans as historical, not authorization. Keep Linked Work extensible for future sources, but require separate approval for Jira writes, Ninety integration, scoring, or broad snapshots.

Selected linked-issue metadata caching is authorized; it is not permission to build an issue warehouse or background synchronization service. Ordinary Project users should not have a general manual Jira refresh control.

**Why:** Pilot acceptance explicitly prioritized limiting unnecessary external reads while keeping linked status reasonably current. This supersedes the earlier blanket restriction on snapshots only for bounded caches of deliberately linked issues.

**How to apply:** Use application-controlled stale reads and concurrent-request protection; preserve Jira as authoritative and keep reads external/write operations local.

Optional Jira selection during intake is authorized to carry forward automatically into the Initiative and its Project. This preserves a deliberate user choice; it is not permission to auto-discover or bulk-link other issues.

**Why:** The user explicitly requires avoiding repeated Jira selection during the intake-to-project journey.