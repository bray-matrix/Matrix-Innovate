---
name: Authenticated UI verification
description: Safely test gated UI without enterprise login or production sessions.
---
For isolated UI checks, browser-only request interception can supply a synthetic session and API fixtures before navigation; the enterprise login gate is not a blocker for this approach. Keep these checks explicitly separate from real launch/auth integration tests.

**Why:** Browser verification initially stopped at enterprise login unnecessarily. Later apparent missing values came from guessed fixture keys, and apparent mobile clipping came from capturing the drawer mid-animation.

**How to apply:** Read current API contracts before supplying fixtures; never guess aliases or weaken application authentication. Wait for drawer animations to settle and measure its position before diagnosing clipping. State fixture limitations in the final report.

Use stored representative evidence for validation; never substitute a fresh interview when inference calls are explicitly limited.

**Why:** A shortened live interview produced a different score and was initially mistaken for a regression. An incorrectly seeded explicit-zero flag and missing source facts also produced misleading export failures. Saved-detail editing and Initiative Review are different surfaces; scrolling in one does not establish a defect in the other.

**How to apply:** Verify the exact component and fixture semantics before judging results. For download/persistence acceptance, use authenticated development API requests rather than simulated successful responses. Inspect rendered final pages: successful downloads and selectable text alone do not establish acceptable pagination.