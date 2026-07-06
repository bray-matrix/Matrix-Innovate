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
