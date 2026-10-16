---
name: Platform server SDK requirement
description: Required approach for outbound Platform directory authentication.
---
Use the actual Matrix server SDK for outbound application trust; do not independently implement Bridge login, token caching, or retry logic. For Shared AI, use SDK v1.2.0 or newer compatible releases, not the old launch trust-model documentation.

**Why:** The managed application trust instructions superseded the earlier permission to implement a small custom Bridge client. The launch trust-model documentation labeled v1.1 is not the executable server SDK v1.1.0.

**How to apply:** Obtain the actual integration package and use its documented backend client and trust/Authorized Users checks before implementing controlled ownership. Preserve the existing inbound launch/session authentication.

The Platform source repository is `bray-matrix/Matrix-Platform`. Use the existing GitHub connector to retrieve its SDK distribution and service documentation directly rather than asking for manual cross-project file transfers.

**Why:** Platform source paths under `exports/` and `docs/` are not necessarily published download routes: the public site can return HTTP 200 with SPA HTML for those paths. This does not mean the SDK is inaccessible through GitHub.

**How to apply:** Inspect the repository tree through authenticated read-only GitHub access, retrieve the actual package and matching contract, and check response content types when probing published downloads. Keep GitHub retrieval separate from runtime application trust.

Development authentication must remain Platform-backed, with no separate
Microsoft/Graph registration or duplicated vendor credentials inside Hub.

**Why:** The development stabilization scope explicitly preserves production
authentication/audience and requires real Matrix identity; simulation is only
a last resort after supported Platform options are unavailable.

**How to apply:** Inspect current Platform launch contracts before adding child
navigation. Preview URL metadata alone is not proof of a preview launch capability.
Do not repoint the existing production launch destination to make preview work.

Brian's October 16, 2026 UX brief confirms Platform-authenticated development
testing is available. Preserve that supported workflow; an agent's signed-out
test browser is not evidence that development authentication is unavailable.

**Why:** User-confirmed preview testing and agent fixture-based testing are
different evidence and must not be conflated.

**How to apply:** Use a real supported Platform session when available; otherwise
report the limitation of this test session, without changing authentication or
claiming fixture interactions prove live Platform-authenticated persistence.