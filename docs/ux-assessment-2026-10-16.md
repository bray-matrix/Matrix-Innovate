# Innovation Hub — UX assessment and workflow simplification

**Assessment date:** October 16, 2026 — America/Chicago  
**Target:** Innovation Hub  
**Accepted production baseline:** v1.6.13  
**Current source version:** v1.6.13  
**Status:** Recommendations only. Not an approved design or implementation plan.

## Scope, method, and evidence

This assessment is for Matrix Imaging's approximately 180 employees, including occasional, nontechnical users across leadership, sales, account management, operations, project management, IT, finance, compliance, and HR.

**Formal Planning Mode used: NO.** Replit's documented Plan Mode is appropriate for read-only investigation and discussion before implementation. This session remained in its existing mode, using read-only source inspection and isolated browser assessment instead. No implementation tasks were submitted for approval or execution. No claim is made that Planning Mode prevents browser inspection.

Evidence labels:

- **C — Code-confirmed:** observed in current routes, components, API contracts, or schema. Not proof of a successful live transaction.
- **V — Visually inspected:** rendered-browser evidence; see the browser addendum for exact coverage and fixture limitations.
- **R — Recommendation:** proposed behavior, not functionality that exists today.
- **D — Decision needed:** business policy or terminology that cannot be settled from code.

All 21 named client routes, the fallback route, all 17 sidebar destinations, their main components, and the relevant execution, governance, directory, reporting, and intake data paths were inspected. Findings are a heuristic assessment, not employee usability-study results. No task-completion times, adoption rates, or success rates were measured.

Source citations use the evidence index at the end. No production records, application code, schema, configuration, integration, or version were changed.

### Browser assessment — completed with explicit limitations

The unmodified development preview displayed **Matrix Platform sign-in required**. No real authenticated session was available. This does not establish whether Platform's current development-launch capability has changed since the earlier investigation.

To inspect actual rendered components without weakening authentication or writing data, the browser intercepted the session response with a synthetic identity and supplied empty/contract-shaped API responses. All non-GET and cross-origin requests were blocked. No real cookies or signed identity tokens were created. These fixtures existed only in the browser; they were not installed in the application.

**Visually inspected routes (12):** `/`, `/projects`, `/projects/new`, `/submit`, `/initiatives`, `/clients`, `/portfolio`, `/resources`, `/validation`, `/backlog`, `/documents`, `/approvals`.

| Requested workflow | Browser portion completed | Not visually verified |
|---|---|---|
| A — Employee idea | Quick Submit form and sections | Guided interview, AI, draft resume, final save |
| B — Manager review | Initiative list/table/empty state | Populated initiative detail, review and history |
| C — Direct project | Home → Projects → New Project; full form/dropdowns; Cancel back to list; desktop/mobile | Create request, validation feedback after submit, persistence |
| D — Project from initiative | Source inspection only | Promotion dialog and successful linked creation |
| E — Ownership/resources | Resources empty state, filters and controls | Project detail, assignment dialog, changing owner/sponsor |
| F — Executive oversight | Portfolio layout and filters with synthetic zero metrics | Populated analytics, drill-down, report export |
| G — Client discovery | Clients list, New Client dialog and Cancel | Populated client relationships and real client report |

Additional visual inspection covered Approval status tabs, Backlog/Parking Lot empty states, Validation's empty state, and Documents' empty state. No generation, approval, deletion, submission or external-service action was performed.

**V — Layout findings:** at 1280×720, navigation requires its own vertical scrolling; the Dashboard puts Product Health prominently below idea entry. The project form has no visible required markers and requires scrolling to reach the bottom controls. At 390×844, the form stacks into one column, with bottom actions reachable and no apparent horizontal overflow. The mobile drawer was inspected after settling and measured 288px wide. The initiative table is wide and horizontally scrollable; reduce default columns rather than remove advanced table capability.

**Important fixture boundary:** empty records and zero metrics are not real business data. In particular, the visually empty Documents screen does not contradict the source-confirmed six static document entries: the browser supplied an empty fixture. Initial generic settings/portfolio fixtures caused rendering errors; replacing them with the actual contract shapes resolved those fixture errors. They are not reported as application defects.

Sixteen browser screenshots were captured, including the genuine sign-in gate, desktop/mobile project form, navigation, client dialog and the listed empty-state screens. The project-form, Dashboard and mobile captures were also reviewed directly for this report. Remaining routes and populated details were assessed from source only. This is not a successful live authentication or end-to-end persistence test.

## A. Executive summary — five most significant problems

### 1. Navigation presents modules rather than user goals

**C:** The same 17 destinations in eight groups are constructed for every signed-in user. Dashboard, Portfolio, Reports, Validation, Product Backlog, and Admin compete with the two most common entry tasks: submitting an idea and managing a project. “My Attention Required” is calculated from the full initiative list, not the signed-in user's assignments. [E1, E2]

**Impact:** Users must learn the application taxonomy before they can choose a starting point. “My” implies responsibility the application has not actually established.

**R:** Preserve the existing first-use idea introduction. Add an equally explicit direct-project entry, organize navigation by work, and move product-maintenance tools to a secondary area. Rename the current global queue “Needs attention” until real ownership-based filtering is supported.

### 2. Project setup is front-loaded, but basic project editing is missing

**C:** Direct creation exists at `/projects/new`; no initiative is required. It exposes 13 fields, including three different status concepts and three optional relationship selectors. Name and Primary Owner are enforced by the form, but neither is marked required there. Type is preselected as Internal Technology. The API contract requires name/type but not Primary Owner. [E3, E4]

**C:** After creation, project detail shows name, description, owner, supporting owners, type, and relationship context without a corresponding general edit form. Its status, priority, health, and target-date controls do update. A user cannot use this screen to correct the principal owner or the project name. [E5]

**Impact:** Users must decide too much before they understand the project, then cannot correct important details through the normal interface.

**R:** Fix basic project editing before deferring setup fields. Start creation with project name, accountable owner, and a clear work type; group optional details. Send users to a short, dismissible “Next steps” section, not an unprioritized set of tabs.

### 3. The idea-to-project story is not the actual state machine

**C:** An Idea is already an Initiative record with a status, not a separate object that becomes an Initiative only after approval. The guided interview creates a private draft, then a reviewed brief, then a saved/scored Initiative. “Approved” is one initiative status. Creating a linked Project is not gated on that status in the inspected UI or promotion handler. The Approvals screen manages project approval records, not initiative approval. [E6, E7, E8]

**C:** “Quick Submit” displays 19 inputs/selectors and requires ten fields, including AI Concept and Prototype Goal. This conflicts with the business expectation that any employee can submit a business problem without technical planning. [E6]

**Impact:** Users cannot reliably infer what “review,” “approval,” “save,” or “create project” means. The application appears more prescriptive in some places and less governed in others.

**R:** Explain the two legitimate starting paths. Use “Create linked project” for the initiative action and explain what is retained. Rename Quick Submit to “Enter a defined idea” as an immediate honest label. Any later reduction of intake requirements needs separate validation; do not fabricate values or alter scoring/convergence.

### 4. Relationships are easy to enter but hard to use

**C:** Clients, Organizations, and Programs primarily offer lists and create/edit dialogs. Clicking a client name does not provide a related-work workspace. Project creation asks for all three relationships independently. The schema permits them to be absent and does not establish a mandatory organization → client → program → project chain. Initiatives do not have direct client/organization/program references. [E3, E9]

**Impact:** An account manager cannot start with a client and naturally discover its work. Users must understand the schema to enter “Context,” and can assume relationships exist that the data does not represent.

**R:** Add contextual “View projects” and “View client report” actions using existing IDs. Present client work as “Who is this for?” Keep parent organization and program grouping optional. Do not infer client relationships to unlinked initiatives from text.

### 5. Guidance and information trust are inconsistent

**C:** The Document Library returns six static “Not Published” entries; Download has no handler or link. The project list displays stored `health`, whereas Portfolio uses `effectiveHealth`. Project attributes save immediately, initiative editing uses explicit save/cancel, and interview review's “Cancel” returns to the interview rather than discarding it. [E5, E7, E10, E11]

**Impact:** Labels imply help, status consistency, or a cancellation behavior that is not always delivered.

**R:** Remove misleading affordances, add task-specific guidance, consume the same existing effective-health result across views, and make save behavior explicit. The current project-list response supplies stored health, so that consistency work requires an appropriate existing portfolio-data mapping or a bounded response enhancement, not merely swapping a field name. Do not change the health calculation itself.

## B. Current application map and complete screen inventory

### Current primary navigation

```text
HOME:                Dashboard; Portfolio
INNOVATION:          Guided Idea Interview; Quick Submit; Initiatives; Kanban
EXECUTION:           Projects; Clients; Organizations; Resources; Approvals
REPORTING:           Reports
GOVERNANCE:          Validation; Documents
MANAGEMENT:          Programs
PRODUCT MANAGEMENT:  Product Backlog
ADMINISTRATION:      Admin
```

The header title is matched by exact route. Detail and creation paths can fall back to “Innovation Hub,” although the page itself has a specific heading. Sidebar active-state matching is broader. Breadcrumbs are not consistently supplied. [E1]

### Route inventory

“Primary?” below is a recommendation, not an existing permission change. Intended users are inferred from the functions, not implemented role models.

| Route / screen | Purpose and intended user | Reach and primary action | Connections / main issue | Primary? |
|---|---|---|---|---|
| `/` Dashboard | Idea entry plus innovation, delivery, and product-maintenance summaries; currently everyone | Sidebar/home; start guided idea or manual submission | Links Portfolio, Reports, Resources, Backlog, initiatives; overloaded and not genuinely personalized | Yes, as Home |
| `/interview` Guided Idea Interview | Help an employee structure an idea | Home/sidebar; optional Jira context, answer questions, review, save | Private resume/discard states, AI processing, editable brief; technical Jira choice precedes business narrative | Within Ideas |
| `/submit` Submit Initiative | Manual structured intake for a well-defined idea | Quick Submit sidebar/home; submit full form | Goes to initiative detail; name promises brevity not supported by requirements | Within Ideas |
| `/initiatives` Initiatives | Search, sort, filter, review proposals | Sidebar; open initiative row | Shared table with column controls, saved layout and CSV; lifecycle/score terminology needs explanation | Yes, under Ideas & Initiatives |
| `/initiatives/:id` Initiative detail | Review business case, ownership, score, status, history | List, board, dashboard, linked project | Edit mode, score/recalculate, export/brief tools, create linked project; competing actions and no clear recommended next action | Contextual |
| `/initiatives/:id/score` Score Initiative | Manually assess value drivers and penalties | Initiative detail; adjust and save | Returns to detail; specialist governance activity, not first-time employee work | Contextual reviewer tool |
| `/kanban` Kanban Board | Initiatives grouped by status | Sidebar; open card or change status with selector | Same records as list; not a project task board and not drag-and-drop in current component | Alternate Ideas view |
| `/projects` Projects | Find delivery projects | Sidebar; New Project or project link | Owner, stage, health, priority, target/context columns; health presentation differs from portfolio | Yes |
| `/projects/new` New Project | Create independent delivery work | Projects → New Project | Optional organization/client/program, no initiative dependency; 13 visible fields and hidden requiredness | Contextual action |
| `/projects/:id` Project detail | Manage delivery and governance | Projects, Portfolio, reports, approvals, promotion | Seven tabs plus status card; no general edit basics UI, prominent Delete | Contextual |
| `/clients` Clients | Maintain external client records | Sidebar; New/Edit/Delete | Optional organization; no client-work drill-down | Secondary under Projects, pinned for account managers |
| `/organizations` Organizations | Maintain grouping records | Sidebar; New/Edit/Delete | Optional parent for clients/programs/projects; “overarching organizational entities” is not a usable definition | Secondary relationship maintenance |
| `/programs` Programs | Maintain multi-project grouping metadata | Sidebar; New/Edit/Delete | Owner, description, status, optional client/org; no linked-project workspace here | Within Portfolio |
| `/portfolio` Portfolio | Cross-project delivery/health/capacity oversight | Sidebar/dashboard; filter and drill into project | Effective health, risk/readiness and resource links; overlaps other summaries but serves a distinct job | Yes |
| `/approvals` Approvals | Project approval queue | Sidebar/project context; approve/reject, notes | Pending/Approved/Rejected/Cancelled/All; not initiative review and not a verified personal inbox | Secondary work queue |
| `/resources` Resources | People/capacity planning | Sidebar/portfolio; search, create/edit resource, inspect capacity | Name, department, role, weekly capacity, status; not Platform identity management | Secondary under Projects |
| `/reports` Reports | Select and read/export eight report types | Sidebar/dashboard; choose scope then generate | Client/program reports partially compensate for missing contextual pages | Under Portfolio, contextual shortcuts |
| `/validation` Validation | Record validation of Innovation Hub releases | Sidebar; record checklist outcomes and export evidence | Version/release/validator/date fields, result history and details; easily mistaken for business-project checks | Product maintenance only |
| `/documents` Documents | Advertised governance/help library | Sidebar; currently inert Download | Six metadata cards, no document content; not currently working task guidance | Replace entry with honest Help experience |
| `/backlog` Product Backlog | Maintain the Hub product's own evolution | Sidebar/dashboard; backlog/parking forms | Linked initiative/validation/version fields; not general business work intake | Product maintenance only |
| `/admin` Admin Settings | Integration/configuration visibility and department management | Sidebar | Jira settings, AI service information, department edits, read-only categories/status/scoring, environment history; some actions role-gated, sidebar entry is not | Secondary admin area |
| Unmatched route | 404 | Direct invalid URL | Technical “Page Not Found”; recovery guidance can improve | No |

### Embedded workflows, forms, dialogs and secondary screens

These do not have separate routes. Hiding a sidebar item must not remove them.

| Host | Surfaces inventoried | Save/edit/delete behavior and UX issue |
|---|---|---|
| Guided interview | Existing-draft resume; discard confirmation; optional Jira search/select; question flow; processing state; Initiative Review | Private autosave and explicit final save differ; never describe a fixture walkthrough as verified persistence |
| Initiative Review | Nine brief sections; supporting context; unknowns; editable values; export controls; top/bottom save actions | “Cancel” invokes return-to-interview; label should state this rather than imply discard |
| Initiative detail | Edit Mode; ownership/business narrative; Tracking & Governance; status selector; score/recalculate; version history and comparison; calculation history/transparency; promotion dialog; delete confirmation | Mixes business planning, calculation detail and technical version information; advanced detail can stay available without leading the page |
| Promotion | Context preview; owner/type; optional org/client/program/date; linked-project warning; explicit additional-project action | Preserves source initiative and selected Jira links; no milestones/risks/resources/approvals are committed automatically |
| Project detail | Overview; Milestones; Risks; Approvals; Go-Live Readiness; Resources; Linked Work | Tabs are legitimate capabilities; default Overview should guide setup and decisions |
| Milestones | Add/edit dialog, due date, owner, sequence, formal stage gate, delete | Explain milestone vs stage gate; sequence is an advanced control |
| Risks | Add/edit/delete, severity/probability/impact, owner, mitigation, due date | Three risk dimensions without examples can be hard for occasional users |
| Project approvals | Request approval; global approve/reject dialog; status actions | Clarify scope and decision authority; free-text approver is not proof of an authorization relationship |
| Go-live | Create assessment, optional standard checklist, add/edit/delete checklist items, required flag/status | Keep readiness rules; explain when an assessment is applicable and what “Not Applicable” means |
| Assignments | Named Resource / Department Demand modes; role, allocation, planned hours, start/end, status; edit/remove | Distinguish committed staffing from unfilled demand; not the same as accountable owner |
| Linked Work | Jira search/filter/select/confirm; open Jira; unlink confirmation | Existing helper text correctly says work stays in Jira; preserve this boundary |
| Project health | Computed/overridden display; manual override dialog; clear override | Keep calculation explanation but move expert controls behind an explicit action |
| Client / Organization / Program | Create/edit dialogs and delete confirmations | Primarily record administration, not a workspace for business users |
| Resources | Create/edit dialog, capacity summaries, department/status/search/overallocation filters | Directory linkage is future scope; do not imply name matching is identity |
| Reports | Catalog; project/client/program selector; report viewer; export controls | Useful capability, but should be accessible from the record being discussed |
| Validation | Release form, grouped check results, result detail/history, export | Technical assurance of Hub itself, not validation of initiatives |
| Backlog / Parking Lot | Separate create/edit forms, status/priority/module/version/link fields; parked reason/value/candidate flag | Product backlog and parked product ideas must not become another business idea pipeline |
| Admin | Department create/rename/activate/deactivate; Jira integration controls; read-only configuration/history | Keep the accepted production-safe Admin scope; do not reintroduce broad setup/reset actions |
| Shared table | Global search, column filters, sorting, column visibility, pagination, saved layout and CSV | Preserve advanced controls, but select task-relevant initial columns and clearer empty/error states |

### Actual relationship map

```text
Matrix identity (stable sub)
  └─ owns private interview draft
       └─ reviewed/saved as Initiative
            ├─ version history / calculation history
            ├─ optional selected Jira issue links
            └─ optional linked Project(s), created by promotion

Organization
  ├─ optional reference from Client
  ├─ optional reference from Program
  └─ optional reference from Project
Client
  ├─ optional reference from Program
  └─ optional reference from Project
Program
  └─ optional reference from Project

Project
  ├─ Milestones
  ├─ Risks
  ├─ Approval requests
  ├─ Readiness assessments → checklist items
  ├─ Assignments → named Resource OR department-only demand
  └─ selected Jira issue links
```

**Required:** a milestone, risk, approval, assignment or assessment belongs to a project; a checklist item belongs to an assessment. Resource name/department are required in the resource form. Direct-project UI requires name/owner and supplies a type; its API contract differs as noted above.

**Optional:** project initiative, organization, client and program references; client organization; program client/organization; assignment named resource. A project can be internal and stand alone.

**Not a forced hierarchy:** project organization/client/program are separate foreign keys. The creation selectors do not constrain each other. A parent relationship does not imply every descendant field is automatically inherited.

**Not represented:** initiatives have no direct structured client, organization or program fields; projects do not have distinct sponsor and project-manager columns. Initiative business owner/sponsor are text; promotion copies other relevant owners into supporting owners. Local Resource IDs are not Platform identity IDs.

**Historical safety:** several parent references use `ON DELETE SET NULL`; deleting a project cascades its child records. Existing confirmations do not explain all of that impact. Prefer explaining impact and emphasizing existing inactive/closed states, not inventing an archive capability or changing deletion rules during UX work.

**Jira:** an application Project is not a Jira project. Hub stores selected issue links and bounded metadata; Jira remains authoritative. No broad synchronization or migration is recommended. [E4, E8, E9, E12]

## C. Terminology assessment

| Current term | Actual meaning | Why confusing | Recommended user-facing wording | Disposition |
|---|---|---|---|---|
| Idea | An early initiative status, or unsaved/private interview material | Looks like a separate public record type | “Idea” for intake; explain “saved as an initiative” | Keep, explain |
| Initiative | Business proposal/case with scoring and lifecycle | Sounds interchangeable with project | “Initiative — an idea being evaluated” in help | Keep |
| Project | Delivery record with milestones, risks, staffing and approvals | “Execution” implies a technical subsystem | “Project — work we are planning or delivering” | Keep |
| Promote | Creates another linked record; does not replace initiative | Suggests conversion or approval | “Create linked project” | Rename action/dialog wording |
| Program | Optional grouping of related projects | No visible business example; looks mandatory | “Program (group of related projects)” | Keep, secondary |
| Organization | Optional grouping/parent record for client/program/project | Could mean Matrix department or client company | “Parent organization” only after confirming business usage | Decision; secondary |
| Client | External client record, optionally grouped by organization | User expects related work, gets maintenance | “Client” with “View work” action | Keep, improve context |
| Dashboard | Mixed entry and summaries | Competes with Portfolio as the “main” screen | “Home” | Rename |
| Portfolio | Cross-project oversight | Sounds like another dashboard | “Portfolio” with “All projects, priorities and delivery health” | Keep |
| Kanban | Initiatives grouped by status | Agile jargon; may imply project task board | “Board view” within Ideas & Initiatives | Consolidate destination |
| Quick Submit | Full manual initiative form | Neither particularly quick nor minimal | “Enter a defined idea” | Rename |
| Guided Idea Interview | Question-assisted private drafting | “Interview” may sound formal, but function is useful | “Develop an idea” action; retain explanatory feature name | Simplify entry wording |
| Innovation Canvas | Structured initiative detail | “Canvas” does not explain purpose | “Business case” or “Initiative brief” | Rename presentation |
| Product Backlog | Hub feature/fix/technical-debt tracker | Sounds like business priorities | “Hub improvements” | Rename; secondary |
| Parking Lot | Deferred Hub product ideas | Confused with paused initiatives/projects | “Deferred improvements” within Hub improvements | Rename; secondary |
| Validation | Hub release testing | Confused with idea validation or project readiness | “Release checks” | Rename; secondary |
| Documents | Static unpublished governance metadata | Promises accessible content | “Help & guides” once usable; honest unavailable state meanwhile | Replace presentation, not pretend content exists |
| Resources | Local people/capacity records and staffing views | Generic and impersonal | “People & capacity” | Rename presentation |
| Primary Owner | Accountable project lead, free text | May be mistaken for manager or assigned worker | “Project owner” plus accountability explanation | Rename label |
| Supporting Owners | Free-text additional people; copied sponsor/owner context on promotion | Does not distinguish sponsor vs delivery contributors | Keep field initially, explain; “Supporting contacts” requires agreement | Decision |
| Executive Sponsor | Initiative sponsorship, not distinct project field | Users expect it everywhere | “Sponsor” with scope explanation | Keep, contextual |
| Approvals | Project requests/decisions | Implies initiative approval queue | “Project approvals” | Rename |
| Stage / State / Health | Delivery phase / administrative activity / computed or overridden risk indicator | Overlapping “On Hold,” “Closed,” “Completed” concepts | “Delivery stage,” “Active/closed status,” “Delivery health” | Clarify; hide advanced state control by default |
| Readiness | Interview completeness or go-live checklist result, depending on screen | Same word for different calculations | “Idea completeness” versus “Go-live readiness” | Qualify; preserve calculations |
| Priority | Score-derived for initiative; selectable on project | Looks like one policy but behaves differently | “Initiative priority (score-based)” / “Project priority” | Qualify |
| Context | Concatenated organization/client/program names | Data-model language | “Client / program” with separate links | Rename display |

Do not rename persisted enum values merely to change labels. Do not claim these recommendations reflect established Matrix vocabulary until reviewed.

## D. Workflow assessment

### A — General employee submits an idea

**Current:** Home gives a helpful explanation and two entry choices. Guided entry first offers optional Jira context, then private questions, review, and Save Initiative. Manual entry requires a substantially developed business case. The saved initiative becomes visible in the shared initiative workflow; the private interview itself is identity-owned.

**Problems:** Jira-first terminology distracts nontechnical employees. “Quick” is misleading. Defaults such as medium risk/readiness and zero value estimates can be read as assessed facts; avoid inventing certainty in revised copy. Users need to know when private drafting becomes shared work.

**Recommendation:** Keep the accepted introduction. Use “Develop an idea” and “Enter a defined idea”; make the optional Jira association visually secondary without removing it or changing intake context handling. Explain private autosave versus shared final save. Broader minimal-intake changes are not a prerequisite to the first pilot usability release.

### B — Manager reviews an initiative

**Current:** Find it via list, board, or global attention group; open brief/detail; review score and owner; choose status, score or create project. History and calculations are available.

**Problems:** No clear reviewer task hierarchy. “My Attention” is not personal. Score, completeness, priority, and approval are easily conflated. Initiative status selection and project approval records are different mechanisms.

**Recommendation:** A short summary should state current status, accountable owner, unresolved business questions, and available next actions. Advanced scoring/history remain accessible. Do not describe a suggested action as a mandatory gate unless it is actually enforced.

### C — Project manager creates a project directly

**Current:** Projects → New Project → 13-field form → toast → project detail. No initiative required.

**Problems:** Default Internal Technology biases non-IT work; optionality is unclear; no distinction between state and stage; generic error toast; owner required only at the form layer; name/owner/context cannot be corrected on the normal detail screen.

**Recommendation:** See section F. Add basic edit first; preserve direct creation as a first-class path. Never require an artificial initiative to obtain a project.

### D — Project manager creates a project from an “approved” initiative

**Current:** Open any initiative outside Edit Mode → Create Project → promotion dialog → create linked project. Owner prefilled from business owner or sponsor; name from title; six input choices; linked-project warning/explicit additional creation. Server locks the initiative during duplicate check/create. The source initiative stays intact. Selected Jira links are carried over; no delivery commitments are generated automatically.

**Important:** Approval is not a prerequisite in the inspected handler. “Approved initiative → project” is a suggested business path, not the enforced current contract.

**Recommendation:** “Create linked project” with source summary, inherited versus editable fields, and clear outcome. Retain duplicate protection and explicit additional-project creation. Decide separately whether approval must gate creation; do not introduce a hidden governance change as a UX cleanup.

### E — Assign owner, sponsor and resources

**Current:** Initiative has business owner/sponsor. Direct project has primary/supporting owners; resources are separate local records assigned in the project tab, or department demand without a named person.

**Problems:** No single workflow covers the three concepts. Project owner cannot be edited in detail. Project has no distinct sponsor/manager fields. Typing a person's name does not establish a Platform identity or grant permissions.

**Recommendation:** Explain accountable owner vs sponsor vs delivery team. Provide basic-owner edit, then “Add people or request department capacity.” Do not add sponsor/manager schema casually; retain initiative sponsorship context. Future Platform directory work is a separate dependency.

### F — Executive reviews priorities and delivery

**Current:** Dashboard combines initiative and execution metrics with Hub product health. Portfolio provides project filters and drill-down. Reports supplies eight report types, including leadership pack.

**Problems:** Competing entry points; global attention looks personal; delivery health can differ between list and portfolio because of field selection; summaries mix app-maintenance and business work.

**Recommendation:** Portfolio is the decision-oriented cross-project workspace; Home remains the starting/action page. Move Hub product maintenance metrics to its secondary workspace. Use existing effective-health values consistently. Label innovation value estimates as estimates, not realized returns.

### G — Account manager finds a client's work

**Current:** Clients provides record maintenance. Reports → Client Portfolio → select client is a supported alternative. Portfolio search can match displayed context, but is not a structured client workspace.

**Problems:** No obvious client → work path; relying on names/search is weaker than ID-based context. Initiatives without project links cannot honestly be included as structured client work.

**Recommendation:** Add View projects and View report at the client row/detail; preselect exact client ID. Show initiatives only through explicit linked projects, clearly labeled, until separately approved relationship work exists.

### Existing-project maintenance and consistency

Milestones, risks, readiness, approvals, assignments and linked Jira work are useful, distinct capabilities. Preserve them. A project overview should summarize next milestone, blockers, staffing gaps, and pending decisions, with links into the existing tabs.

Move Delete into a secondary action menu and explain its consequences. Label immediate-saving attributes; use explicit Save/Cancel for multi-field edits. Give Cancel a consistent meaning, and warn about dirty forms where loss is possible. Do not assert persistence or rollback from a visual-only inspection.

## E. Proposed navigation and alternatives

### Recommended hierarchy — proposal, not approval

```text
Home
  Start an idea | Create a project | Needs attention | Recent work

Ideas & Initiatives
  Initiatives: List / Board
  Develop an idea
  Enter a defined idea
  [Initiative detail → business case, review, score, history, linked projects]

Projects
  All projects | Create project
  Clients
    Client work | Client report
    Parent organizations [secondary maintenance]
  People & capacity
  Project approvals
  [Project detail → overview, milestones, risks, readiness, team, Jira work]

Portfolio
  Overview
  Programs
  Reports

Help & guides [persistent secondary link]
Administration [secondary, existing capability-aware presentation]
  Settings & integrations
  Hub improvements
    Active improvements | Deferred improvements
  Release checks
```

Maintain current URLs/deep links initially. “List / Board” changes navigation presentation, not record identity. Risks, milestones, documents/help and reporting remain reachable; none are removed.

**Alternative 1: five work areas plus Clients as a primary area.** Better for frequent account managers, but adds global complexity for everyone else. Recommend a client shortcut/pin before a universal sixth area.

**Alternative 2: separate role homepages and menus.** Potentially valuable, but current people ownership is often free text and current roles do not establish the requested five personas. Too risky to make role inference or new permissions a prerequisite.

**Alternative 3: simply collapse current eight groups.** Low cost but preserves confusing semantics. Not sufficient alone.

**Why the recommendation:** it preserves capability and route structure while aligning the menu to starting work, managing delivery, and overseeing results. Administration placement is not a security mechanism. Preserve current server authorization and do not hide currently permitted specialist functions behind invented admin checks.

## F. Simplified project creation — proposed steps

### Prerequisite: make deferred fields editable

Add a bounded Edit project details surface backed by the existing update contract: name, description, owner, supporting owners, type and optional context. Preserve history/links and existing policies. Without this, “complete later” is a misleading promise.

### 1. Choose the starting path

- **Create a project:** the work is already identified; no initiative necessary.
- **Create linked project:** reached from an initiative; retains the business case and traceability.

Do not add a mandatory wizard just to explain two choices. Use short inline guidance and the existing entry points.

### 2. Provide the minimum initial information

| Field | Initially | Rationale |
|---|---|---|
| Project name | Required | Identifies the work; inherited and identified as such in linked creation |
| Project owner | Required under current UI expectation | One accountable lead; align server validation only as an explicitly reviewed consistency change |
| Work type | Required choice / clearly explained default | API already requires it; avoid silently classifying everything as IT |
| Description / intended result | Optional, strongly encouraged | Current contract permits omission; do not add governance through copy |
| Client | Optional; ask “Is this client work?” | Existing data model does not require a client, even for a client-oriented type; any mandatory client rule is a decision |
| Parent organization | Optional advanced context | Do not force users to maintain hierarchy |
| Program | Optional advanced grouping | Use only for genuine coordinated delivery |
| Supporting owners | Later | Not required to establish accountable lead |
| Target date | Optional / later | Unknown is valid; do not manufacture deadlines |
| Priority | Existing Medium default, editable later | Distinguish from initiative score-derived priority |
| Stage | Existing Planning default | No need to ask a new user unless intentionally importing ongoing work |
| State | Existing Active default | Preserve but do not lead with overlapping administrative status |
| Health | System-derived display after creation | Do not request an unsupported health judgment before evidence exists; preserve explicit override capability |

Use an “Additional details” disclosure for optional controls, visible required markers, associated labels, inline validation and a specific error message. Keep the form one page unless observed user tests establish a real need for steps.

### 3. Review and create

Button: **Create project** or **Create linked project**. Show which initiative/context is being retained. Do not imply this approves funding or authorizes launch. Preserve double-submit/duplicate guards and all source links.

### 4. Land on the project with concrete next actions

Show the newly created project and three optional next steps:

1. Confirm the scope and owner.
2. Add the next milestone.
3. Add people or record department demand.

Offer risk/approval/readiness setup contextually, according to existing rules. This is guidance, not newly generated obligations or automatic commitments.

### 5. Keep corrections and navigation straightforward

Edit details available on Overview; links back to source initiative/client/program where applicable; Cancel returns to the originating context. Distinguish unsaved forms from immediately saved status controls. No schema change is needed for the core creation/editing simplification.

## G. Role-based experience without inventing permissions

| Perspective | Useful starting point | Information/actions that matter | Current obstacle | Proposed presentation |
|---|---|---|---|---|
| General employee | Home → Develop an idea | Private draft, understandable questions, what happens after submission | Technical intake and maintenance navigation | Simple entry and clear privacy/save explanation; advanced tools secondary |
| Project manager | Projects | Create/edit, next milestone, risks, resources, approvals | Setup complexity and missing general edit | Project workspace and next steps |
| Department manager | Portfolio / People & capacity | Department demand, ownership, priorities, capacity | Department resources do not equal project department ownership | Explicit filters with scope explained; no false “my team” promises |
| Account manager | Clients shortcut | Related projects, status, client report | Maintenance list does not expose work | Client work context using exact IDs |
| Executive | Portfolio | Delivery exceptions, upcoming decisions, priorities, business-value context | Mixed dashboard purposes, inconsistent health display | Decision summary and drill-down; leadership report shortcut |

These are work perspectives, not five new security roles. Current Platform identity and server authorization remain authoritative. Do not infer ownership or role from names/emails or department text. A genuine “My work” view should wait for reliable identity references; the minimum release can honestly use “Needs attention.”

## H. Documentation and contextual guidance

### Current assessment

The Documents page is a catalog of six unpublished titles: Charter, AI Opportunity Playbook, Operating Manual, AI Project Lifecycle, Scoring and Prioritization Guide, and Functional Specification. The API does not supply their body content or download URLs. Therefore document accuracy cannot be validated from this surface, and a functional download cannot be claimed. Internal validation and architecture notes in the repository are not a substitute for business-facing help.

### Priority improvements

1. **“Where do I start?”** Idea vs project, with examples: mail-production improvement, client onboarding rollout, compliance change, internal technology work.
2. **Create a project directly** and **Create a project from an initiative**: separate, short guides that match actual permissions and gates.
3. **Who does what?** Owner, sponsor, supporting owner, assigned person, department demand; distinguish labels from authorization.
4. **What happens after save?** Draft privacy, shared initiative, linked project, next milestone.
5. **Understand status:** initiative lifecycle, project delivery stage, administrative state, health, and readiness.
6. **Find client work** and **Read Portfolio** with scope/metric definitions.
7. **Jira remains the execution source for linked issues:** linking/unlinking does not edit Jira.

Readable application pages and runtime PDF downloads should ultimately share one content source, with visible revision date. That is a future documentation implementation, not something implemented in this audit. First remove or disable misleading Download controls and show an honest availability message; a small set of real guides is better than a large empty library.

Contextual help should sit beside decisions: optional program, unknown target date, computed health, and promotion effects. Keep detailed technical/scoring guidance available for specialists.

## I. Prioritized improvement backlog

Priority means **P0: task blocker; P1: before broader pilot; P2: important but deferrable; P3: future enhancement.** Complexity is relative (S/M/L), not an estimate. Risk separates interface changes from data/policy changes.

| ID / priority | Problem | Proposed solution | User impact | Complexity | Architecture/data risk |
|---|---|---|---|---|---|
| U01 — P0 for project correction | Project owner/name/context cannot be corrected in normal UI | Add Edit project details using existing update contract | Completes core maintenance loop; avoids recreating records | M | Low–medium: preserve links, validate null/unchanged semantics |
| U02 — P1 | 17 destinations/eight groups expose maintenance concepts | Proposed hierarchy, board as view, secondary maintenance | Easier starting point for all users | M | Low if routes and existing access remain |
| U03 — P1 | Creation overload and misleading requiredness | Progressive optional fields, required markers, neutral type choice, inline errors | PM can start without understanding schema | M | Medium: depends on U01; owner validation consistency needs explicit review |
| U04 — P1 | Initiative/project/approval semantics conflict | Plain-language next steps and linked-project wording; documented actual gates | Managers know what action means | S–M | Low for copy; high if turned into new approval enforcement |
| U05 — P1 | “Quick” intake requires technical answers | Honest entry labels, optional Jira visual emphasis, privacy/save help | Nontechnical employees can choose correctly | S | Low if convergence/requirements/scoring unchanged |
| U06 — P1 | Client screen is a dead end for work discovery | Exact-ID View projects/View report actions | Account managers find delivery work | M | Low–medium: do not fabricate initiative associations |
| U07 — P1 | Global attention labeled “My” | Rename to Needs attention; show scope | Prevents false assignment assumptions | S | Low; no identity redesign |
| U08 — P1 | Stored/effective health displayed inconsistently | Use existing effective-health field consistently and label overrides | Executives see consistent status | S–M | Low–medium; preserve deterministic computation |
| U09 — P1 | Nonfunctional document downloads and absent guidance | Honest unavailable state plus initial task guides | Restores trust and self-service | S–M | Low; no promised PDF until implemented |
| U10 — P1 | Inconsistent Save/Cancel and prominent destructive action | Explain immediate-save fields; label return-to-interview; move Delete secondary with impact copy | Fewer accidental actions and less uncertainty | M | Medium: must preserve saved drafts/transactions |
| U11 — P2 | Organization/client/program choices appear dependent but are independent | Context help, optional grouped selection and contextual links | Less relationship confusion | M | Medium: do not overwrite inconsistent historical combinations |
| U12 — P2 | Broad tables and poor error/empty distinction | Task-focused defaults, explicit loading/error/empty states, contextual CTAs | Easier scanning and recovery | M | Low; keep export/filter capabilities |
| U13 — P2 | Programs are metadata rather than a useful grouping workspace | Program → existing projects/report navigation | Program owners see grouped delivery | M | Low; no new program model needed |
| U14 — P2 | Help/catalog lacks usable content architecture | Single-source web guides and runtime PDFs | Current, readable help and shareable copies | M | Low–medium: export parity and access |
| U15 — P2 | Persona navigation not tailored | Saved/pinned shortcuts and explicit view choices | Occasional users see relevant work | M | Low if presentation only; no inferred permissions |
| U16 — P3 | Names are not stable identity references | Separately scoped Platform directory references with historical snapshots | Enables reliable My work/owner selection | L | High relative to UI cleanup; no Graph secrets, migration by explicit mapping only |
| U17 — P3 / decision | No distinct project sponsor/manager semantics | Validate business need before introducing fields/policies | Prevents redundant ownership concepts | Unknown until decision | Potential schema/report/auth impact |

**No universal P0 outage is asserted.** U01 is a confirmed missing core task path, not proof that project creation fails. Live development authentication is also a verification dependency; this assessment did not establish its current Platform-side readiness and does not reopen authentication implementation.

## J. Proposed bounded release sequence

These are proposed scopes only, without new version numbers or implementation authorization.

### Release A — Core project usability and honest guidance

U01, U03, U04's wording, U05's label/help, U07, U08, immediate U09 honesty and U10's highest-risk labels.

**Exit checks:** a permitted user can create a project directly and from an initiative, correct owner/name/context, save/cancel without losing data, and see consistent health; source initiative and Jira links are retained; existing score/convergence/auth behavior unchanged. Test ordinary and administrative identities under the existing policy. No synthetic-only test substitutes for successful authenticated persistence.

### Release B — Navigation and business-context discovery

U02, U06, initial task guides, selected U11/U12, and contextual Portfolio/report links.

**Exit checks:** users can find client work and a client report without knowing schema terms; all old routes and specialist capabilities remain reachable; nontechnical entry and PM entry are both obvious; responsive/keyboard navigation and empty/error states verified.

**Minimum broader-pilot gate:** Release A plus navigation reduction, client-work links, and the essential guides from Release B. Do not wait for directory migration, role redesign, full PDF architecture, or additional governance fields.

### Release C — Depth and personalization

Program contextual view, richer web/PDF help, saved shortcuts and further table improvements. Platform directory and any new sponsor/manager model remain separate scoped work, not automatic additions.

### Proposed validation with representative users

After implementation, use the seven requested tasks A–G with employees representing the five perspectives. Observe first-click choice, misunderstanding, requests for help, abandonment, and whether the user can explain the next action. Establish baseline timing then; this audit supplies no fabricated timing targets or measured success rates.

## Architectural risks and decisions for Brian

### Preserve without redesign

Platform-signed identity and stable private-draft ownership; server authorization; Shared AI; centralized Microsoft credentials; Jira selected links; scoring and health/readiness calculations; all existing initiatives/projects, assignments, history, gateway routes and reporting. Innovation Hub remains the surviving application. No legacy Compass revival.

### Decisions that need business confirmation

1. **Is approval required before creating a linked project?** Current behavior does not require it. Keep that behavior during copy/navigation changes unless a separate governance change is approved.
2. **What does Organization mean at Matrix?** Parent client company, legal entity, or another grouping? Do not rename it to Department or merge it into Client without confirmation.
3. **Should client work have a dedicated primary shortcut for account managers?** Recommend yes as a shortcut, not another universal top-level area.
4. **Who should see Hub improvements and Release checks?** Recommend secondary presentation; existing capabilities must remain accessible until an explicit permission decision.
5. **Does every project need distinct sponsor and manager roles?** They do not exist as separate project fields today. Do not overload supporting owners to imply enforced responsibilities.
6. **Which creation policy is intended for Project Owner?** The UI requires it while direct-create API does not. Recommended alignment is an explicit consistency requirement, not an unannounced policy change.

Changing a sidebar label is low risk. Inventing an identity mapping, merging records, deriving permissions from text, auto-filling unknown business facts, or enforcing new gates is not. Most minimum-pilot improvements need no schema changes.

## Evidence index

Paths below are workspace-relative; line numbers may shift after future implementation.

- **E1:** `artifacts/matrix-innovation-hub/src/App.tsx` (named routes); `components/layout.tsx` (17 entries, eight groups, exact-match header, unconditional groups).
- **E2:** `pages/dashboard.tsx` (first-use introduction, global attention filtering, product health/execution widgets).
- **E3:** `pages/projects-new.tsx` (13 fields, validation, defaults, success navigation).
- **E4:** `artifacts/api-server/src/routes/execution.ts` (create/update, promotion); `lib/api-spec/openapi.yaml` (`ProjectCreate`, `ProjectUpdate`, `PromoteInitiativeRequest`).
- **E5:** `pages/project-detail.tsx` (read-only basics, immediate status/date mutations, seven tabs and dialogs).
- **E6:** `pages/submit.tsx` (required schema, 19 controls); `pages/interview.tsx`; `components/interview-jira-picker.tsx`.
- **E7:** `pages/initiative-detail.tsx`; `pages/score-initiative.tsx`; `components/initiative-review/initiative-review.tsx`; `pages/kanban.tsx`; API `routes/settings.ts` (eight initiative statuses).
- **E8:** API `routes/execution.ts` promotion handler (row lock, source preservation, owner mapping, Jira links); `routes/governance.ts`; frontend `pages/approvals.tsx`.
- **E9:** `lib/db/src/schema/execution.ts`, `initiatives.ts`, `interview-drafts.ts`; frontend `pages/clients.tsx`, `organizations.tsx`, `programs.tsx`, `resources.tsx`.
- **E10:** Frontend `pages/documents.tsx`; API `routes/documents.ts` (six static unpublished entries and no download behavior).
- **E11:** Frontend `pages/projects.tsx`, `portfolio.tsx`, `reports.tsx`; API `lib/reporting.ts` (eight report definitions).
- **E12:** `lib/db/src/schema/jira.ts`; `components/project-linked-work.tsx`; API `routes/jira-links.ts`.
- **E13:** Frontend `pages/backlog.tsx`, `validation.tsx`, `admin.tsx`, `components/init-wizard.tsx`, `components/data-table.tsx`; API `routes/settings.ts`; `src/app.ts` (session boundary).

Frontend abbreviated paths above are under `artifacts/matrix-innovation-hub/src/`. API abbreviated paths are under `artifacts/api-server/src/`.

## Completion controls

| Control | Result |
|---|---|
| Application code changed | NO |
| Database/schema/data changed | NO |
| Authentication/authorization/integrations changed | NO |
| Version changed | NO |
| Published | NO |
| Deployed | NO |
| Pushed | NO |
| Implementation started or requested | NO |
| Deliverables | Assessment and proposed improvement sequence only |

Stop for Brian and ChatGPT review. Nothing in this report authorizes implementation.
