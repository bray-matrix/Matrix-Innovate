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

Distinguish reconstructed fixtures and LibreOffice pagination from the original user's Word document.

**Why:** A reported four-page Word export could only be reconstructed as a three-page LibreOffice document with the available source facts. Prior captures also had different readiness values. Those are useful regression samples, not proof of exact historical reproduction.

**How to apply:** Preserve the actual browser download and semantic baseline before edits, compare like-for-like content, name the rendering engine, and disclose fixture-assigned scores/readiness rather than claiming they were recalculated.

Do not use an auto-waiting locator click to prove that a disabled export button suppresses a pending-window duplicate.

**Why:** The browser test waited until the first request completed, then clicked the newly enabled button. The second legitimate request could be mistaken for a duplicate-lock failure.

**How to apply:** Gate the response, inspect disabled state, and use immediate pointer coordinates or a controlled event test while the first request is pending. Record request timing and counts. If a browser context is lost, do not infer a pass from the interrupted probe.