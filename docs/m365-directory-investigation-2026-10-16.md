# Innovation Hub — M365 directory investigation

Read-only investigation for UX Release B, October 16, 2026 (US Central).
No Platform files, registration, service grants, credentials or employee records
were changed. No live employee directory payloads were retrieved.

## Conclusion

**Platform has a Graph-backed tenant directory service, but the existing
name-search picker targets a different population. Do not integrate that picker
as a substitute for the requested M365 employee selector.**

No directory picker was implemented in this release. Safe identity storage,
employee eligibility, the workload grant and a bounded tenant-search contract
need confirmation before implementation. The visual release is independent.

## Evidence inspected

Read through the existing GitHub connection from `bray-matrix/Matrix-Platform`,
default `main` branch:

- `docs/Shared-Microsoft-Directory-Service.md`
- `docs/Authorized-Application-User-Directory.md`
- `docs/Development-Preview-Launch.md`
- `artifacts/api-server/src/routes/directory.ts`
- `artifacts/api-server/src/lib/directory-auth.ts`
- `artifacts/api-server/src/lib/directory-graph.ts`

Locally inspected the installed `@workspace/matrix-sdk` 1.2.1 server-client
interface and Innovation Hub's existing project, initiative, resource and
assignment schema. This is current source/contract evidence, not proof that a
particular Platform deployment and Innovation service grant are enabled.

## 1. Existing endpoints

### Tenant M365 directory

- `GET /api/platform/directory/users?limit=1..100&cursor=...`
- `GET /api/platform/directory/users/{entraObjectId}`

Both require the registered application's existing server-to-server Bridge
session and an explicit `directory.users.read` grant. A browser launch token or
logged-in Platform user session is not a substitute. Neither Bridge enablement
nor another shared-service grant automatically grants directory access.

The server reads Microsoft Graph `/users` using centrally managed credentials;
it does not join candidates against Platform users or launch assignments.
Consequently it can include tenant users who have never registered with Platform.
It is not automatically an “active employees only” list: `accountEnabled` and
`userType` are exposed, and eligibility/guest policy needs a business decision.

**Search limitation:** the inspected tenant endpoint implements bounded listing
and detail, not name/email search. Its route reads only limit/cursor and its Graph
query has fixed projections, optional manager expansion and page size. Appending
`q` would not create search semantics. Filtering one fetched page in the browser
would incorrectly imply a complete directory search.

### Platform-authorized application users

- `GET /api/platform/applications/self/authorized-users?q=...&limit=...&offset=...`
- `GET /api/platform/applications/self/authorized-users/{stableUserId}`

This supports search and revalidation, but only for active persisted Platform
users eligible to launch the calling application. Graph-only employees are
explicitly excluded. Its `stableUserId` is Platform's numeric user ID represented
as a string, **not** an Entra object ID. Its grant is `applications.users.read`,
which is distinct from `directory.users.read`.

The installed SDK exposes `authorizedUsers.search` and `authorizedUsers.resolve`,
but does not expose an equivalent typed tenant-directory search operation.
Do not hand-roll an alternative Bridge authentication client to bypass this gap.

## 2. Stable fields and safe display

Tenant identity reference: **`entraObjectId`**, anchored to the known
Platform-managed tenant/provider. Do not use display name, UPN or email as an
immutable ID, and do not mix it with Platform `stableUserId`.

The normalized tenant DTO includes:

- `entraObjectId`
- `displayName`, `givenName`, `surname`
- `userPrincipalName`, `primaryEmail`
- `jobTitle`, `department`, `officeLocation`
- `accountEnabled`, `userType`, `createdDateTime`
- optional manager and license data

For an authorized picker, project only the minimum useful presentation:
display name, primary email (nullable), department and job title where available,
plus the opaque identity reference. UPN may be displayed distinctly if approved;
do not silently relabel it as email. The existing service deliberately does not
substitute UPN for missing Graph mail.

Manager/license metadata is not needed to choose an owner. Do not expose raw
Graph responses, tokens, credentials, tenant identifiers or unrelated directory
attributes to the browser. A directory match must not grant application access.

## 3. Existing field compatibility

`primaryOwner` and `supportingOwners` are free-text project fields. Initiative
executive sponsor is also text. Resources have their own local ID and descriptive
fields; project assignments reference that local resource ID, not an Entra ID.

A picker could technically write a display name into existing text without a
migration, but this would be a name suggestion, **not identity-backed ownership**.
It would discard the stable selection, cannot reliably distinguish namesakes or
renames, and cannot support reliable future identity-linked assignments.
Embedding an Entra ID into a name field would break display/report semantics.

Therefore a safe authoritative directory-backed owner cannot be represented by
the current text field alone. A separately approved additive identity-reference
and display-snapshot design is needed, preserving legacy names as unverified and
never backfilling by name matching.

Supporting owners and named resources can eventually reuse the same bounded
directory-search/resolve mechanism, but need their own compatible identity
mapping. Department-only resource demand must remain available. Sponsor selection
must not create a new project sponsor field or reinterpret supporting owners.

## 4. Minimal future work — not performed

1. Confirm the deployed directory capability and Innovation's explicit
   `directory.users.read` grant through existing administration. Do not rotate
   credentials, alter application registration or copy Microsoft credentials.
2. Approve employee-selection policy separately from application-launch policy:
   active/disabled/unknown accounts, guests, and unavailable identities.
3. If tenant name/email search is required, extend the **existing** Platform
   directory service with a documented bounded search and typed SDK support.
   Validate query input, preserve capability checks and safe error/continuation
   contracts, avoid arbitrary consumer Graph URLs/filters, and keep all Graph
   calls inside Platform. No new Entra registration or authentication system.
4. Approve the additive Hub identity/snapshot mapping, then implement a
   session-protected Hub backend adapter using the managed server SDK; revalidate
   a new selection before saving. Keep historical free text and all linked data.

Existing list/detail service reuse may require only approved configuration for
reads. **The current inspected contract does not supply a scalable tenant-search
picker**, so that complete requirement needs separately approved Platform work
unless a newer supported search contract is demonstrated.

## Verification limits

- Non-Platform tenant coverage is confirmed by source architecture, not by
  comparing real employee accounts in this session.
- Actual Innovation directory-grant state and deployed service readiness were
  not queried or changed.
- No real M365 integration or end-to-end directory selection is claimed.
- The Platform development-preview contract is documented and preserves existing
  signed launch behavior. Documentation alone does not provide a real user session
  to this session's test browser; no identity substitution was added to the app.
