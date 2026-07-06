---
name: Scoring penalty sign convention
description: How penalty components flow between client and server in the Innovation Score model
---

# Innovation Score penalty sign convention

Penalty scoring components (`technicalComplexityPenalty`, `riskPenalty`) are
**negative magnitudes** (0 down to -10) everywhere: the client score-editor UIs
(Score page and AI Interview review) send negatives, and the DB stores negatives.

**Rule:** the authoritative server calculation (`artifacts/api-server/src/lib/scoring.ts`)
must clamp penalties to `[-max, 0]` and **add** them to the positive total — never
clamp to `[0, max]` and subtract.

**Why:** a `[0, max]` clamp turns any incoming negative penalty into 0, silently
neutralizing all penalties, so the persisted score diverges from the client's
pre-save preview. This was a latent bug affecting the existing Score page too.

**How to apply:** any new positive component uses a `[0, max]` clamp; any new
penalty component uses a `[-max, 0]` clamp and is added. Keep client preview math
(`aiInterviewService.computeScore`) and server math in lockstep.
