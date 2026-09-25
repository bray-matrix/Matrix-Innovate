# JIRA DONOR INTELLIGENCE REFERENCE
Donor: Legacy Matrix Compass (v1.1.1). Documents the deterministic Jira intelligence exactly as implemented. Formulas are NOT reinterpreted or improved.

Compute engine: `lib/jira-intelligence/src/` (pure, deterministic given explicit `now`).
Server persistence adapter: `artifacts/api-server/src/services/jira/intelligence.ts`.
Frontend rollups: `artifacts/matrix-platform/src/repositories/jira/intelligence.ts` (calls the same shared lib).
The api-server and frontend both call the shared lib, so numbers are identical by construction.

## Default thresholds
SOURCE: `lib/jira-intelligence/src/types.ts` (`DEFAULT_THRESHOLDS`)
```
healthyMaxBlockers: 0
watchMaxBlockers:   5
atRiskMaxBlockers:  10
staleProjectDays:   14
agingIssueDays:     30
```
Overridable per call via `IntelOptions.thresholds`; no caller in the donor overrides them (defaults are always in effect).

---

## METRIC: Status classification (statusBucket)
PURPOSE: Map arbitrary tenant status strings to canonical buckets todo / inProgress / blocked / done.
SOURCE FILE: `lib/jira-intelligence/src/classify.ts`
INPUTS: `issue.status` (free text), `issue.resolutionDate`.
FORMULA (ordered, first match wins):
1. `resolutionDate` present → **done** (strongest signal, regardless of status text)
2. empty status → **todo**
3. regex `/block|impediment|on hold|on-hold|waiting|stuck/` → **blocked**
4. regex `/done|closed|resolved|complete|completed|shipped|live|deployed|cancel/` → **done**
5. regex `/progress|review|doing|developing|development|qa|testing|in test|verify/` → **inProgress**
6. otherwise → **todo**
EDGE CASES: Matching is lowercase substring regex — "Blocked by design" → blocked; "Cancelled" → done (cancel keyword). Status strings already remapped through jira_status_mappings still classify because Matrix canonical names use the same keywords.
KNOWN LIMITATIONS: Keyword-based; a tenant status like "Parked" falls to todo. "Waiting for release" classifies blocked even if semantically near-done.

## METRIC: Priority classification (priorityBucket)
PURPOSE: Map arbitrary priority names to highest / high / medium / low.
SOURCE FILE: `lib/jira-intelligence/src/classify.ts`
FORMULA (ordered):
1. empty/null → **medium**
2. `/highest|critical|blocker|p0|urgent/` → **highest**
3. `/high|major|p1/` → **high**
4. `/low|minor|trivial|p3|p4|lowest/` → **low**
5. otherwise → **medium**
`isCriticalPriority` = bucket highest. `isHighPriority` = bucket highest OR high.
KNOWN LIMITATIONS: No mapping table for custom priority values; any unrecognized custom priority silently becomes "medium". (This is a confirmed donor limitation.) Note ordering hazard: "highest" contains "high" but is caught by rule 2 first.

## METRIC: Overdue rule
SOURCE FILE: `lib/jira-intelligence/src/metrics.ts` (`isOverdue`)
FORMULA: overdue ⇔ NOT done AND `dueDate` parses AND `dueDate < now`. Done issues are never overdue. No grace period.

## METRIC: Blocked rule
FORMULA: `statusBucket(issue) === "blocked"` (see status classification). Counted per issue; drives health class.

## METRIC: Aging buckets
SOURCE FILE: `metrics.ts` (`addAging`), applied to OPEN (not-done) issues only, age = whole days since `createdDate` (`daysBetween`, floor; invalid/missing date → 0).
BUCKETS: `d0_7` (≤7), `d8_30` (8–30), `d31_60` (31–60), `d61_90` (61–90), `d90plus` (>90).
"Aging issue" for scoring/risk = open AND age > `agingIssueDays` (30).

## METRIC: Stale-work rule (project level)
SOURCE FILE: `metrics.ts` (computeProjectMetrics)
FORMULA: `lastActivity` = max `updatedDate` across the project's issues; `staleDays` = daysBetween(lastActivity, now); `isStale` ⇔ project has ≥1 issue AND staleDays > `staleProjectDays` (14). Projects with zero issues are never stale (`staleDays` null).

## METRIC: Health class (blocker bands)
SOURCE FILE: `metrics.ts` (`classifyHealth`)
INPUT: project blockedCount only.
BANDS: 0 → healthy; 1–5 → watch; 6–10 → atRisk; >10 → critical.
Rollup uses worst-of (`worstHealth`, rank healthy<watch<atRisk<critical).

## METRIC: Health score 0–100 (per project)
SOURCE FILE: `metrics.ts` (`healthScore`)
FORMULA:
```
score = 100
      - min(blockedCount          * 8, 40)
      - min(overdueCount          * 5, 30)
      - min(highPriorityOpenCount * 3, 20)
      - min(agingOpenCount        * 2, 20)
score = clamp(round(score), 0, 100)
```
WEIGHTS/CAPS: blocked 8pts capped 40; overdue 5pts capped 30; high-priority open 3pts capped 20; aging open (>30d) 2pts capped 20. Theoretical floor = 100−110 → clamped to 0.
NOTE: The 0–100 score is a display metric and is DISTINCT from the blocker-band health class; the two can disagree (e.g. many overdue but zero blockers → healthy class, low score).
Inputs: `highPriorityOpenCount` = open AND (highest|high). `agingOpenCount` = open AND age > 30d. `overdueCount` includes all overdue regardless of priority.

## METRIC: Portfolio/rollup health scores
- Portfolio `healthScore` = round(mean of project healthScores); **empty set → 100** (`averageScore`).
- Program rollup (`rollupByProgram`): sums counts across mapped projects; healthClass = worst-of; healthScore = mean.
- Portfolio rollup (`rollupPortfolio`): sums across programs; overallHealthClass = worst-of; overallHealthScore = mean of program scores (mean-of-means, NOT issue-weighted); empty → 100.
- Program mappings come from jira_project_mappings.matrixProgramId (frontend joins Matrix programs). Unmapped projects are simply absent from program rollups.

## METRIC: Alerts
SOURCE FILE: `metrics.ts` (`buildAlerts`), per project:
| Condition | Severity | ID pattern |
|---|---|---|
| criticalCount > 0 OR healthClass == critical | critical | `alert-critical-<key>` |
| highPriorityOpenCount >= 5 | warning | `alert-highpri-<key>` |
| overdueCount > 0 | info; warning if overdueCount >= 5 | `alert-overdue-<key>` |
| isStale | info | `alert-stale-<key>` |
Sorted critical → warning → info. The `>= 5` thresholds are hardcoded in buildAlerts, NOT in IntelThresholds.

## METRIC: Executive summary / risk indicators
SOURCE FILE: `metrics.ts` (`computeExecutiveMetrics`)
- summary: importedProjects (= metric rows, incl. projects inferred from orphan issue keys), importedIssues, openIssues, completedIssues, blockedIssues, criticalIssues (count of highest-priority issues, open or done), overdueIssues, averageIssueAgeDays (mean age of OPEN issues, rounded; 0 if none).
- risk: blockedIssues, agingIssues (open >30d), overdueIssues, highPriorityOpen, staleProjects.
- portfolioHealth: project count per health class.
- Projects list sorted worst health class first, then issue count desc.
EDGE CASE: Issues whose projectKey has no matching project row create a synthetic project entry (name = key).

## METRIC: Snapshots / trend
SOURCE FILE: `metrics.ts` (`buildSnapshot`) + `services/jira/intelligence.ts` (`buildSnapshotRow`) + `jira_sync_snapshots` table.
One snapshot row per sync run, computed from the FULL post-upsert portfolio (all stored projects/issues, not just that run's rows): projectCount, issueCount, open/completed/blocked/critical/overdue counts, four priority counts, portfolio healthScore. No delta/trend math is computed anywhere — rows just accumulate; UI lists recent snapshots. criticalCount here = highest-priority issue count (not blocker-band).

## METRIC: Persisted per-project executive metrics
`jira_project_metrics` is full-replaced each sync (`replaceAll`) from `computeProjectMetrics` output; columns mirror ProjectMetric (incl. healthClass, healthScore, staleDays, isStale, capturedAt).

## Ambiguities / spread-across-files notes
- "criticalCount" means highest-priority issues (open or done) in project metrics/summary/snapshots, but the critical ALERT can also fire from blocker-band critical health — two different notions share the word "critical".
- Thresholds live in the shared lib; alert thresholds (>=5) are hardcoded separately in buildAlerts.
- Server writes snapshots/metrics at sync time; the frontend ALSO recomputes executive metrics live from issue rows (repositories/jira/*), so UI numbers can drift from the last persisted snapshot between syncs. Same formulas, different `now`.
