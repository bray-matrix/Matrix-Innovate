# Development authentication investigation

## Status
Accepted baseline: v1.6.13. Application code and version unchanged.
Implementation blocked on a bounded Platform preview-launch addition.
No Platform changes, production operations, secrets, or Graph connections added.

## Existing flow and evidence
The child captures `#matrix_token`, removes it from the URL, and exchanges it
once at POST `/matrix/session`. The server verifies Platform signature, discovered
issuer/JWKS, audience, expiration and application-ID consistency before minting
an HttpOnly application session. GET session exposes sub/name/email/roles.
Business APIs require that session; private drafts remain scoped to stable sub.

Public Platform discovery advertises `/matrix/launch`. Its current public UI
uses an authenticated POST with `{applicationId}` and navigates to the selected
application destination with the returned token in the fragment. This establishes
normal launch, NOT a supported development-target parameter or redirect API.
No token-minting request was made during this investigation.

SDK 1.2.1 and supplied integration documentation expose development/preview URL
metadata, but no verified preview-launch helper or destination-selection contract.
Application-trust Bridge login is service authentication, not human sign-in.

Hub's sign-in button points to Platform home. A direct preview visit without a
launch token or local session correctly fails closed. A production-host session
cookie cannot authenticate a different preview host. No failed signed exchange
was observed that proves an issuer, audience, or signature problem. Embedded
preview cookie restrictions remain a possible secondary issue, not a diagnosis.

## Preferred supported approach
Platform authenticates the real user and authorizes access to the existing child
application, selects its approved development destination, and hands off the same
short-lived signed launch identity. Hub reuses its existing verifier/session flow.
Open preview as a top-level browser page for initial validation.

## Exact bounded Platform requirement, if not already supported
1. Allow an authenticated, app-authorized user to select Development for the
   existing Innovation Hub application without replacing its production URL.
2. Register/allowlist the exact current HTTPS preview destination; reject arbitrary
   redirect URLs and unregistered destinations.
3. Issue the existing short-lived signed launch identity for the existing child
   audience, preserving stable sub/name/email and actual Platform roles, including
   platform_administrator when legitimately granted.
4. Deliver via the established fragment handoff to that destination. Do not put
   tokens in query strings, logs, or persistent browser storage.
5. Document the supported launch entry point/request contract, destination
   registration and user/environment authorization policy.
6. Preserve production launch, audience, credentials and destination unchanged.

Read-only inspection through the existing GitHub connection confirmed the
current Platform implementation has one registered launch destination, not a
per-request preview selector. Its previewUrl is metadata, not an alternate launch
mode. Changing launchUrl would also change ordinary production launches and was
not done. A bounded Platform addition is required for the preferred separate
development launch flow; it must be implemented and approved in Platform, not here.

Source evidence in bray-matrix/Matrix-Platform:
- lib/db/src/schema/applications.ts: launchUrl and previewUrl are distinct fields.
- artifacts/api-server/src/routes/identity.ts: POST /matrix/launch consumes only
  applicationId; no environment or destination selector.
- artifacts/api-server/src/lib/application-canonical.ts: chooses registered
  launchUrl (or legacy route), never previewUrl.
- artifacts/matrix-platform/src/lib/launch.ts: navigates to that registered
  destination after obtaining the token.
- docs/Platform-Trust-Contract-v1.md: documents these same handoffs.

Repository inspection is evidence about the inspected source, not a claim that
every deployed Platform byte matches that revision. Do not fabricate a GET
launch URL from the POST endpoint.
No fallback was built: inability to discover a supported route is not proof that
Platform support is impossible, and simulation would not verify real identity.

## Validation boundary
No new development login succeeded and no real identity was captured in this
investigation. Subject/name/email/roles verification remains pending a supported
launch. No new implementation regression pass is claimed. Authentication,
authorization, private drafts, Jira, Shared AI and scoring code remain unchanged.
No development fallback exists to activate in production.

## Future Matrix user-directory readiness — documentation only
Current people fields are mostly free text: Initiative business owner/sponsor/
submitter; Project and Program owners; milestone/risk/readiness owners; approval
requester/approver. Resources are local serial-ID records with name/email,
department, role, manager, status and capacity. Assignments reference local
resource IDs or department-only demand. These IDs are not Platform identities.

The installed managed SDK already supports bounded application-authorized
`authorizedUsers.search` and `authorizedUsers.resolve`, returning stableUserId,
displayName, email, active and eligibleForApplication. Use existing application
trust server-side; do not create a Graph connection or duplicate Microsoft secrets.
The older PRIMARY_OWNER_PLATFORM_HANDOFF proposal is not the current SDK contract.

Future integration:
- Session-protected Hub search/resolve adapters, bounded query length/pagination;
  no browser Platform secrets or full directory replication.
- Validate every new/changed selection through SDK resolve and fail closed on
  unavailability/ineligibility.
- Store nullable stable Platform references with server-derived display snapshots;
  retain old free text as legacy, never auto-match names/email.
- Keep Hub resource capacity and assignment IDs separate from Platform identity.
- Preserve references and snapshots when users become inactive; exclude them from
  new selections without deleting historical assignments or approval decisions.
- Confirm stable-ID namespace/non-recycling and workflow-specific reviewer/
  approver eligibility before implementation. App access alone is not approval
  authority.
- Start with owner/sponsor selections only after a separately approved scope.

## Delivery status
GIT READINESS: NOT READY for development authentication (contract blocked).
PUBLISHED: NO
DEPLOYED: NO
PUSHED: NO