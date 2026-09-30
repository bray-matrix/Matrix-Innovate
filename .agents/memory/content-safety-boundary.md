---
name: Content safety boundary
description: Local-first safety rationale and limits on moderation capability claims.
---
Keep likely secrets local: never send suspect credentials to an AI service for classification. Preserve ordinary financial metrics and professional compliance/security discussions.

**Why:** The requested safety release explicitly prohibited new providers and credentials. Inspection of the installed official SDK exposed generation, not a reusable moderation API; that does not establish that the wider Platform will never offer moderation.

**How to apply:** Consult the release safety document for current rules and limitations. Recheck the official SDK/service contract before a future centralized-service handoff. Do not describe bounded deterministic checks as comprehensive DLP, or fixture tests as proof that every sensitive passage is detectable.