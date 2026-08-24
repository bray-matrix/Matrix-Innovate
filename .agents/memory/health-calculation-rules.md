---
name: Deterministic health & readiness rules
description: Where and how Compass project health / go-live readiness are computed; override semantics.
---

All health and readiness logic lives in artifacts/api-server/src/lib/project-health.ts — never duplicate the rules in the frontend or other routes; portfolio, dashboard attention, and project detail all import it.

**Rules:** readiness = Not Ready (required Fail) / Ready (all required Pass|NA) / Not Started (no items or untouched, not near target) / At Risk (otherwise; near-target = 14 days). Health: Off Track (open Critical risk; Not Ready near target; stage-gate milestone >14d overdue), At Risk (open High risk, any overdue milestone, pending Go-Live Sign-Off/Stage Gate approval, readiness At Risk/Not Ready, near target with incomplete milestones), On Track (active + any data), Unknown (closed or no data).

**Override semantics:** effectiveHealth = manual override when healthOverrideAt is set, else calculated. PATCH project health sets override (reason/by/at; "by" from Matrix session identity); health="Unknown" clears all three. Approval decidedAt stamps only on a real Pending→decided transition and clears only on revert to Pending — metadata edits must never rewrite it.

**Why:** spec requires AI/heuristics never own health; auditability of overrides and decisions.
**How to apply:** any new rollup or rule tweak goes in project-health.ts; extend test-phase2.mjs regression checks (G2/G3, M1–M4, J1–J3).
