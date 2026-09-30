---
name: Production Admin boundaries
description: Pilot cleanup decisions about legacy initialization and AI telemetry claims.
---

Keep historical setup/reset utilities out of normal production administration;
do not restore them as a convenience while editing history views.

**Why:** The pilot has real Initiatives and Projects. Legacy actions described
as targeting samples actually targeted all initiatives. The approved cleanup
preferred retiring the action and keeping history, not retaining destructive
controls behind cosmetic warnings.

**How to apply:** Any future destructive maintenance requires a separately
approved scope, real administrator enforcement and explicit impact confirmation.

Distinguish documented AI architecture from observed runtime provider or health.

**Why:** The approved architecture identifies Anthropic Claude, but the available
SDK only returns provider/model on generation responses. A successful past call
or a configured trust credential is not proof of current availability.

**How to apply:** No paid generation calls to populate an Admin health badge;
use supported read-only telemetry if later available, otherwise say not reported.