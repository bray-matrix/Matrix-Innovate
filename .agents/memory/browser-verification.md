---
name: Authenticated UI verification
description: Safely test gated UI without enterprise login or production sessions.
---
For isolated UI checks, browser-only request interception can supply a synthetic session and API fixtures before navigation; the enterprise login gate is not a blocker for this approach. Keep these checks explicitly separate from real launch/auth integration tests.

**Why:** Browser verification initially stopped at enterprise login unnecessarily. Later apparent missing values came from guessed fixture keys, and apparent mobile clipping came from capturing the drawer mid-animation.

**How to apply:** Read current API contracts before supplying fixtures; never guess aliases or weaken application authentication. Wait for drawer animations to settle and measure its position before diagnosing clipping. State fixture limitations in the final report.