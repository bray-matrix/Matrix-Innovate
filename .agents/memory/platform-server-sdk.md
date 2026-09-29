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