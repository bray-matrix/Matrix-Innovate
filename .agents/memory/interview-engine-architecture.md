---
name: Interview AI and deterministic governance
description: Platform-only AI boundary and verification requirements for guided interviews.
---

Use Matrix Platform Shared AI through the official server SDK only. Keep deterministic scoring, lifecycle, approvals and execution authoritative; retain Rule Engine as explicit fallback.

**Why:** The approved direction is a business analyst that interprets conversation, not a model that approves work. Direct OpenAI/Anthropic integration and duplicate provider credentials were explicitly prohibited.

**How to apply:** Use existing application trust and centralized accounting labeled `guided-interview-v2`. Do not implement the paused Primary Owner picker as part of AI work. A successful Bridge login does not establish AI capability authorization; check each service separately.

Preserve complete interview context within Platform's request bounds; do not silently truncate. Keep unsupported inferences separate from evidence-backed facts, including at draft review.

**Why:** Natural-language models can return useful structured drafts containing paraphrased facts and unsupported quantities. Structure validation alone does not establish factual provenance. Platform also limits individual messages independently of total request length.

**How to apply:** Validate structure and source evidence separately. Live model checks are necessary to assess semantic question quality; fixture tests only establish application behavior.

## Verification boundary

Normal interview turns must return compact context deltas, not regenerate a complete Initiative. Generate full draft prose only at completion.

**Why:** A production provider response reached its 2,048-token budget and was rejected by Platform after HTTP 200. Truncation was plausible but not proven; reducing repeated output addresses the architectural pressure without asserting an unverified cause.

**How to apply:** Preserve the transcript separately, keep structured collections bounded, verify SDK-supported budgets before raising them, and never use a normal answer-count cutoff to force convergence. Twelve is only the emergency ceiling.

Use browser-only Matrix/Jira fixtures without weakening real authentication; verify actual relationship persistence separately with isolated database route tests.

**Why:** A fixture can make save look successful without persisting Jira identity, while an incomplete detail/settings fixture can incorrectly make working navigation look broken.

**How to apply:** Use contract-valid IDs and complete response shapes, capture save/promotion payloads, and clearly distinguish browser fixture evidence from live AI and database persistence evidence.