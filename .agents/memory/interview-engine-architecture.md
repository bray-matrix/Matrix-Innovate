---
name: Adaptive interview engine architecture
description: Contract between the interview decision engine and the scoring/draft model lib in matrix-innovation-hub
---

The AI Innovation Interview is split into two modules on purpose:

- `services/interviewEngine.ts` = swappable DECISION logic (classification, adaptive
  question planning, draft orchestration). Exposes an `InterviewEngine` interface +
  `interviewEngine` singleton.
- `services/aiInterviewService.ts` = deterministic MODEL lib (scoring math, priority,
  loss parsing, draft field/canvas synthesis). No decision logic here.

**Why:** so a future OpenAI integration only has to reimplement the `InterviewEngine`
interface — the score model and draft shape stay stable and the UI (`pages/interview.tsx`)
needs no changes.

**How to apply:**
- Keep classification/question-selection in the engine; keep scoring/draft synthesis in
  the model lib. Do not leak one into the other.
- Answers are keyed by question id (not index) throughout, because the plan is dynamic.
- Detected category is display-only (badge in chat + review, pre-fills the Category
  dropdown via `suggestedInitiativeCategory`). It is NOT persisted — no DB/schema field.
- Only show the "Detected Initiative Type" badge once `answers.idea` is non-empty
  (including the localStorage resume path).

## Verification boundary

Use browser-only Matrix/Jira fixtures to verify interview navigation without weakening real authentication; verify actual relationship persistence separately with isolated database route tests.

**Why:** A browser fixture can make a save look successful even with an invalid Jira identity or shared Initiative state. Conversely, incomplete fixture response shapes can make a working detail page appear broken.

**How to apply:** Require contract-valid IDs, separate records for Jira/non-Jira paths, captured save/promotion payloads, and normal first-project promotion. Clearly label browser fixture evidence separately from database persistence evidence.
