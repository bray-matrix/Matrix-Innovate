---
name: Workflow restart drops in-flight browser requests
description: Diagnosing "failed request with no server log" — often the API workflow was rebuilding at that moment
---
When a user reports a failed request but the API server log shows no matching entry (not even a 4xx/5xx), check whether the API workflow was restarting/rebuilding around that time before hunting for code bugs.

**Why:** The api-server workflow rebuilds with esbuild on restart (~30-60s window). During that window the shared proxy cannot reach it, so browser fetches fail at the network level — the client shows a generic error while the server logs nothing. A retry seconds later succeeds unchanged.

**How to apply:** Correlate the failure time with recent `restart_workflow` calls or the "Server listening" line in the workflow log. Make client error toasts surface the underlying error message so transient network drops are distinguishable from real API errors.
