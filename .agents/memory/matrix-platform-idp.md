---
name: Matrix Platform identity provider
description: How the real Matrix Platform IdP exposes OIDC metadata and what to trust
---
- As of Matrix Platform v0.20.0, OIDC discovery lives at `https://matrix-platform.replit.app/.well-known/openid-configuration`; issuer is the literal string `matrix-platform` (NOT the platform URL) and JWKS is at `/.well-known/jwks.json`. Older `/api/platform/jwks` path is obsolete.
- **Why:** hard-coding issuer/JWKS broke when the platform changed them; ticket IH003 requires discovery-based config, never hard-coded JWKS.
- **How to apply:** always resolve issuer/jwks_uri/matrix_logout_endpoint from the discovery doc; validate discovered URLs stay on the platform host and use https. Launch-token TTL from platform is 300s. Full auth regression suite: `node test-launch-guard.mjs` in `artifacts/api-server/` (mock discovery + JWKS).
