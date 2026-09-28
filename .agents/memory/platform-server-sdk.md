---
name: Platform server SDK requirement
description: Required approach for outbound Platform directory authentication.
---
Use Matrix server SDK v1.1.0 from the Platform integration package for outbound application trust and Authorized Users access; do not independently implement Bridge login, token caching, or retry logic.

**Why:** The managed application trust instructions superseded the earlier permission to implement a small custom Bridge client. The launch trust-model documentation labeled v1.1 is not the executable server SDK v1.1.0.

**How to apply:** Obtain the actual integration package and use its documented backend client and trust/Authorized Users checks before implementing controlled ownership. Preserve the existing inbound launch/session authentication.