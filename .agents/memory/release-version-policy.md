---
name: Release version policy
description: Preserve development tracking while explicitly promoting stable production metadata.
---

Keep production release identity separate from internal development tracking.
Never silently strip a development suffix to approve a release; reject it and
require an explicit stable release identifier.

**Why:** Publishing previously carried a development-labelled version into
production even though the deployment mode and database separation were correct.
Brian requested a safeguard without blocking normal development/preview testing.

**How to apply:** Update the authoritative version manifest and synchronize its
checked metadata copies. Preserve the development identifier when promoting the
release. Obtain explicit approval before GitHub synchronization or republishing.
