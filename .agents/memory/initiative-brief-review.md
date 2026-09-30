---
name: Initiative Brief review boundaries
description: Preserve document parity and safe retry semantics without changing accepted scoring or interview behavior.
---
Use one semantic brief for the browser and document exporters; presentation changes must not change deterministic scoring policy.

**Why:** The accepted interview intentionally allows unknown financial values. Numeric scoring currently conflates unknown with zero; changing that policy requires an explicit decision, not a visual redesign.

**How to apply:** Show evidence limitations separately, retain existing score thresholds, and distinguish explicit zero from unknown in document wording.

Keep the private review draft unflattened when preparing a final Initiative save.

**Why:** Supplemental document content uses labelled paragraphs in existing Initiative narrative storage to avoid a schema migration. Writing that serialized payload back into the private draft can duplicate those paragraphs after a failed save and resume.

**How to apply:** Flush current editable fields/canvas into the private draft, but serialize supplemental sections only for the final Initiative request. Test retry/resume and web/Word/PDF content parity.

Validate generated brief quality through the same baseline, grounded AI merge, and review initialization used by the browser—not by constructing a standalone brief from only the accepted AI fields.

**Why:** A live final-generation replay had an empty grounded outcome despite clear source evidence. A standalone export fixture incorrectly showed that outcome as unknown, while the browser retained baseline context. Fixture success alone also missed repetitive risk prose.

**How to apply:** Capture one synthetic live response and replay it offline through the application completion path when refining deterministic cleanup. Keep live AI quality evidence separate from fixture-only browser and export checks. Compare pagination only for equivalent content; a longer representative sample is not a like-for-like page-count improvement.

Test semantic corrections from faulty raw evidence and completion output, never from a fixture already containing the expected final narrative.

**Why:** Prewritten risk statements hid a real generation defect: the production completion still copied impact into risks and embedded question/answer notes in the future state. A stored score also differed from the Review's recalculated score when fixture components did not match.

**How to apply:** Exercise baseline generation, completion merge, Review initialization and shared brief construction. Assert live component-derived assessment and evidence retention, including unique answers following transcript labels. Use negative controls so healthy ownership/compliance descriptions do not invent gaps. Development reconstruction does not establish production acceptance; published Guided Interview/Resume, Draft and actual downloads require separate validation after manual publication.