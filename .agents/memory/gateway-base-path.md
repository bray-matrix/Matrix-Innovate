---
name: Gateway base-path pattern
description: How the SPA runs both standalone and beneath a prefix-stripping gateway from one build
---

Rule: one build serves both standalone root and a prefix-stripping gateway (e.g. platform /innovation) by combining (1) Vite `base: ""` only for `command === "build"` (relative asset URLs), (2) an inline index.html bootstrap that reads the configured prefix (`%VITE_GATEWAY_BASE_PATH%`), compares it to `location.pathname`, sets `window.__BASE_PATH__`, and `document.write`s a `<base>` tag before module scripts, and (3) runtime prefix applied to the wouter router base, generated API-client base URL, and all hand-written fetches.

**Why:** the gateway strips the prefix before forwarding, so the server must stay at root; asset/API URLs can only be resolved correctly at runtime from the browser URL. Build-time base paths would break one of the two modes.

**How to apply:** configure via `GATEWAY_BASE_PATH` (precedence) or a non-root `BASE_PATH` in the artifact env; never hardcode hostnames. Any new client-side fetch outside the generated client must be wrapped with `withBase()` from `src/lib/base-path.ts`. Known accepted limitation: visiting the standalone URL directly at `/<prefix>/*` is treated as gateway mode.
