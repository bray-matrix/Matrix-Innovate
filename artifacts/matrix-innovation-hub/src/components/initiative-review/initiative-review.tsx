import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  computeScore,
  derivePriority,
  validateInitiativeDraft,
  REQUIRED_INITIATIVE_FIELDS,
  type InitiativeDraftFields,
  type InterviewDraft,
  type ScoringComponents,
} from "@/services/aiInterviewService";
import { withBase } from "@/lib/base-path";
import { checkedResponse, safeErrorMessage } from "@/lib/content-safety-error";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, FileText, FileDown, Loader2, Save, SlidersHorizontal, ChevronUp } from "lucide-react";
import { AutoTextarea } from "./auto-textarea";
import {
  buildReviewBrief, initialNarrative, mergeReviewIntoDraft, serializeForSave,
  type ReviewAIResult, type ReviewNarrative,
} from "./review-model";
import type { InitiativeReviewMetadata } from "@/services/aiInterviewService";
import type { BriefText } from "@workspace/initiative-brief";

type ZeroField = NonNullable<InitiativeReviewMetadata["confirmedZeroFields"]>[number];
const NOT_ESTABLISHED = "Not yet established";
const sourceKind = (t: BriefText): "ai" | "you" | "suggestion" | undefined =>
  t.source === "user" || t.source === "jira" ? "you" : t.source === "suggestion" ? "suggestion" : undefined;

export interface InitiativeReviewProps {
  draft: InterviewDraft;
  aiResult: ReviewAIResult | null;
  jira: { jiraIssueKey: string; summary: string } | null;
  submitterName: string;
  departments: string[];
  categories: string[];
  levels: string[];
  saving: boolean;
  readiness?: string;
  toolbarExtra?: ReactNode;
  /** Fixed for deterministic tests; defaults to mount time. */
  generatedAt?: string;
  onBack: () => void;
  onDraftChange: (draft: InterviewDraft) => void;
  onSave: (fields: InitiativeDraftFields, scoring: ScoringComponents, extras: { executiveSummary: string; reviewDraft: InterviewDraft }) => void;
}

type Errors = Partial<Record<keyof InitiativeDraftFields, string>>;

const FACTORS: { key: keyof ScoringComponents; label: string; max: number; min?: number }[] = [
  { key: "businessValue", label: "Business Value", max: 25 },
  { key: "revenuePotential", label: "Revenue Potential", max: 15 },
  { key: "costSavingsScore", label: "Cost Savings", max: 15 },
  { key: "customerImpactScore", label: "Customer Impact", max: 15 },
  { key: "strategicAlignment", label: "Strategic Alignment", max: 10 },
  { key: "aiReadinessScore", label: "Readiness (scoring model)", max: 10 },
  { key: "prototypeConfidence", label: "Delivery Confidence (scoring model)", max: 10 },
  { key: "technicalComplexityPenalty", label: "Technical Complexity Penalty", max: 0, min: -10 },
  { key: "riskPenalty", label: "Risk Penalty", max: 0, min: -10 },
];

function Source({ kind }: { kind: "ai" | "you" | "suggestion" }) {
  const label = kind === "ai" ? "AI draft" : kind === "you" ? "From you" : "Suggestion";
  return <span className={`brief-source brief-source-${kind}`}>{label}</span>;
}

function Section({ n, title, children, source, id }: { n: string; title: string; children: ReactNode; source?: "ai" | "you" | "suggestion"; id: string }) {
  return (
    <section className="brief-section" aria-labelledby={`h-${id}`} data-testid={`section-${id}`}>
      <header className="brief-section-head">
        <span className="brief-num">{n}</span>
        <h2 id={`h-${id}`}>{title}</h2>
        {source && source !== "ai" && <Source kind={source} />}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children, error, id }: { label: string; children: ReactNode; error?: string; id?: string }) {
  return (
    <div className="brief-sub">
      <h3>{label}</h3>
      {children}
      {error && id && <p id={`error-${id}`} role="alert" className="brief-error" data-print-hide>{error}</p>}
    </div>
  );
}

export function InitiativeReview({
  draft, aiResult, jira, submitterName, departments, categories, levels, saving,
  readiness, toolbarExtra, generatedAt: generatedAtProp, onBack, onDraftChange, onSave,
}: InitiativeReviewProps) {
  const { toast } = useToast();
  const [fields, setFields] = useState<InitiativeDraftFields>({ ...draft.fields, submitterName: draft.fields.submitterName || submitterName });
  const [scoring, setScoring] = useState<ScoringComponents>(draft.scoring);
  const [narrative, setNarrative] = useState<ReviewNarrative>(() => initialNarrative(draft, aiResult));
  const [errors, setErrors] = useState<Errors>({});
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [confirmedZero, setConfirmedZero] = useState<ZeroField[]>(draft.review?.confirmedZeroFields ?? []);
  const [generatedAt] = useState(() => generatedAtProp ?? new Date().toISOString());

  const changeRef = useRef(onDraftChange);
  changeRef.current = onDraftChange;
  const baseRef = useRef(draft);
  baseRef.current = draft;
  const editsRef = useRef({ fields, scoring, narrative, confirmedZero });
  editsRef.current = { fields, scoring, narrative, confirmedZero };

  // Flush latest edits on unmount (Back to Interview, navigation).
  useEffect(() => () => {
    const e = editsRef.current;
    changeRef.current(mergeReviewIntoDraft(baseRef.current, e.fields, e.scoring, e.narrative, { confirmedZeroFields: e.confirmedZero }));
  }, []);
  // Debounced autosave of every editable field, including narrative.
  useEffect(() => {
    const timer = window.setTimeout(() => changeRef.current(mergeReviewIntoDraft(baseRef.current, fields, scoring, narrative, { confirmedZeroFields: confirmedZero })), 700);
    return () => window.clearTimeout(timer);
  }, [fields, scoring, narrative, confirmedZero]);
  useEffect(() => {
    if (submitterName) setFields(prev => prev.submitterName ? prev : { ...prev, submitterName });
  }, [submitterName]);

  const setField = <K extends keyof InitiativeDraftFields>(key: K, value: InitiativeDraftFields[K]) => {
    editsRef.current = { ...editsRef.current, fields: { ...editsRef.current.fields, [key]: value } };
    setFields(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };
  const setNarr = (key: keyof ReviewNarrative, value: string) => {
    editsRef.current = { ...editsRef.current, narrative: { ...editsRef.current.narrative, [key]: value } };
    setNarrative(prev => ({ ...prev, [key]: value }));
  };
  const setScore = (key: keyof ScoringComponents, value: string) => {
    const num = parseInt(value, 10);
    const v = Number.isNaN(num) ? 0 : num;
    editsRef.current = { ...editsRef.current, scoring: { ...editsRef.current.scoring, [key]: v } };
    setScoring(prev => ({ ...prev, [key]: v }));
  };

  const liveScore = computeScore(scoring);
  const livePriority = derivePriority(liveScore);
  // ONE semantic brief drives every non-input element AND the export payload.
  const brief = useMemo(() => buildReviewBrief({
    draft, fields, scoring, narrative, ai: aiResult, jiraKey: jira?.jiraIssueKey,
    score: liveScore, priority: livePriority, readiness, confirmedZeroFields: confirmedZero, generatedAt,
  }), [draft, fields, scoring, narrative, aiResult, jira?.jiraIssueKey, liveScore, livePriority, readiness, confirmedZero, generatedAt]);
  const critical = brief.unknowns.filter(u => u.priority === "critical");
  const discovery = brief.unknowns.filter(u => u.priority === "discovery");
  const candidates = brief.successMeasures.candidates.filter(c => c.text !== NOT_ESTABLISHED);
  const facts = brief.supportingContext.facts;
  const generated = new Date(brief.metadata.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const impact = brief.businessNeed.businessImpact;
  const setEstimate = (key: ZeroField, raw: string) => {
    const zero = raw.trim() !== "" && Number(raw) === 0;
    setConfirmedZero(prev => zero ? [...new Set([...prev, key])] : prev.filter(k => k !== key));
    setField(key, Number(raw) || 0);
  };

  const handleSave = () => {
    const missing = validateInitiativeDraft(fields, departments, categories);
    setErrors(missing);
    if (Object.keys(missing).length) {
      const first = REQUIRED_INITIATIVE_FIELDS.find(key => missing[key]);
      if (first) requestAnimationFrame(() => {
        const el = document.getElementById(`review-${first}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
      });
      return;
    }
    const out = serializeForSave(fields, narrative, {
      critical: critical.map(u => u.text), discovery: discovery.map(u => u.text),
      candidates: candidates.map(c => c.text),
      facts: facts.map(f => `${f.value} (${f.source === "jira" ? "Jira" : "interview"})`),
    });
    onSave(out.fields, scoring, {
      executiveSummary: out.executiveSummary,
      reviewDraft: mergeReviewIntoDraft(
        { ...draft, review: { ...draft.review, confirmedZeroFields: confirmedZero } }, fields, scoring, narrative,
      ),
    });
  };

  const exportBrief = async (format: "docx" | "pdf") => {
    setExporting(format);
    try {
      const response = await fetch(withBase(`/api/initiative-brief/export/${format}`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      await checkedResponse(response, "Export failed. Please retry.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (brief.metadata.title || "Initiative Brief").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
      a.href = url; a.download = `${safe || "Initiative-Brief"}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast({ title: "Export unavailable", description: safeErrorMessage(error, "Please retry."), variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const narrativeInput = (key: keyof ReviewNarrative, placeholder: string, testId: string) => (
    <AutoTextarea id={`review-${key}`} data-testid={testId} value={narrative[key]}
      onValueChange={v => setNarr(key, v)} placeholder={placeholder} className="brief-prose" />
  );
  const fieldInput = (key: "problemStatement" | "currentProcess" | "desiredOutcome" | "aiConcept" | "prototypeGoal" | "successMetric", placeholder: string, required = false) => (
    <AutoTextarea id={`review-${key}`} data-testid={`input-${key}`} value={fields[key]}
      onValueChange={v => setField(key, v)} placeholder={placeholder} className="brief-prose"
      aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined}
      aria-required={required || undefined} />
  );
  const metaText = (key: "submitterName" | "businessOwner" | "executiveSponsor", label: string, required = false) => (
    <div className="brief-meta-item">
      <dt><label htmlFor={`review-${key}`}>{label}{required && <span className="brief-req"> *</span>}</label></dt>
      <dd>
        <AutoTextarea singleLine id={`review-${key}`} data-testid={`input-${key}`} value={fields[key]}
          onValueChange={v => setField(key, v)} placeholder="Not yet assigned" className="brief-meta-input"
          aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} />
        {errors[key] && <p id={`error-${key}`} role="alert" className="brief-error" data-print-hide>{errors[key]}</p>}
      </dd>
    </div>
  );
  const metaSelect = (key: "department" | "category", label: string, options: string[]) => (
    <div className="brief-meta-item">
      <dt><label htmlFor={`review-${key}`}>{label}<span className="brief-req"> *</span></label></dt>
      <dd>
        <Select value={options.includes(fields[key]) ? fields[key] : ""} onValueChange={v => setField(key, v)}>
          <SelectTrigger id={`review-${key}`} data-testid={`select-${key}`} className="brief-select"
            aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined}>
            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
        <span className="brief-print-text">{fields[key]}</span>
        {errors[key] && <p id={`error-${key}`} role="alert" className="brief-error" data-print-hide>{errors[key]}</p>}
      </dd>
    </div>
  );
  const levelSelect = (key: "customerImpact" | "complianceRisk" | "technicalComplexity" | "aiReadiness", label: string) => (
    <label className="brief-control">
      <span>{label}</span>
      <Select value={fields[key]} onValueChange={v => setField(key, v)}>
        <SelectTrigger data-testid={`select-${key}`} className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>{levels.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
  const numberInput = (key: "estimatedHoursSavedMonthly" | "estimatedRevenueOpportunity" | "estimatedCostSavings", label: string) => (
    <label className="brief-control">
      <span>{label}</span>
      <input type="number" min={0} data-testid={`input-${key}`} className="brief-number"
        value={fields[key] || (confirmedZero.includes(key) ? 0 : "")} placeholder="Not yet quantified"
        onChange={e => setEstimate(key, e.target.value)} />
    </label>
  );

  return (
    <div className="brief-shell" data-testid="initiative-review">
      <div className="brief-toolbar" data-print-hide>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={saving} data-testid="button-back-interview">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Interview
        </Button>
        <div className="brief-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => void exportBrief("docx")} disabled={!!exporting} data-testid="button-export-word">
            {exporting === "docx" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} Export Word
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportBrief("pdf")} disabled={!!exporting} data-testid="button-export-pdf">
            {exporting === "pdf" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />} Export PDF
          </Button>
          {toolbarExtra}
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-initiative">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {saving ? "Saving..." : "Save Initiative"}
          </Button>
        </div>
      </div>

      <article className="brief-doc" aria-label="Initiative Brief">
        <div className="brief-masthead">
          <img src={withBase("/matrix-wordmark.png")} alt="Matrix" className="brief-wordmark" data-testid="img-matrix-wordmark" />
          <span className="brief-doctype">Initiative Brief &middot; Draft for review</span>
        </div>

        <p className="brief-note" data-print-hide>
          Draft narrative was generated from interview responses and should be reviewed before approval. Source facts and potential measures are identified separately. Click any paragraph to edit. Changes save to your private draft automatically.
        </p>
        {!departments.includes(fields.department) && (
          <p className="brief-error" role="status" data-testid="required-department-notice" data-print-hide>
            Required before Save Initiative: select a Department. Business Owner and Executive Sponsor are optional.
          </p>
        )}

        <header className="brief-title-block">
          <label htmlFor="review-title" className="brief-kicker">Initiative Title<span className="brief-req"> *</span></label>
          <AutoTextarea singleLine id="review-title" data-testid="input-title" value={fields.title}
            onValueChange={v => setField("title", v)} placeholder="Name this initiative" className="brief-title"
            aria-invalid={!!errors.title} aria-describedby={errors.title ? "error-title" : undefined} />
          {errors.title && <p id="error-title" role="alert" className="brief-error" data-print-hide>{errors.title}</p>}
          <dl className="brief-meta">
            {metaSelect("category", "Initiative Type", categories)}
            {metaSelect("department", "Department", departments)}
            {metaText("submitterName", "Submitter", true)}
            {metaText("businessOwner", "Business Owner")}
            {metaText("executiveSponsor", "Executive Sponsor")}
            <div className="brief-meta-item"><dt>Status</dt><dd className="brief-meta-static" data-testid="text-brief-status">{brief.metadata.status} &middot; {generated}</dd></div>
            {brief.assessment.readiness && <div className="brief-meta-item"><dt>Readiness</dt><dd className="brief-meta-static" data-testid="text-brief-readiness">{brief.assessment.readiness}</dd></div>}
            {brief.metadata.jiraKey && <div className="brief-meta-item"><dt>Jira Request</dt><dd className="brief-meta-static" data-testid="text-brief-jira">{brief.metadata.jiraKey}</dd></div>}
          </dl>
        </header>

        <Section n="01" id="executive-summary" title="Executive Summary" source="ai">
          {narrativeInput("executiveSummary", "Summarize the initiative in two or three sentences.", "input-executiveSummary")}
        </Section>

        <Section n="02" id="business-need" title="Business Need" source="ai">
          <Field label="Problem / Opportunity" error={errors.problemStatement} id="problemStatement">
            {fieldInput("problemStatement", "What problem or opportunity does this address?", true)}
          </Field>
          <Field label="Current State">{fieldInput("currentProcess", "How does this work today?")}</Field>
          {impact && <div className="brief-sub"><h3>Business Impact {sourceKind(impact) && <Source kind={sourceKind(impact)!} />}</h3><p className="brief-body" data-testid="text-business-impact">{impact.text}</p></div>}
        </Section>

        <Section n="03" id="future-state" title="Proposed Future State" source="ai">
          <Field label="Desired Outcome">{fieldInput("desiredOutcome", "What will be true when this succeeds?")}</Field>
          <Field label="High-level Approach">{fieldInput("aiConcept", NOT_ESTABLISHED)}</Field>
          {(brief.futureState.prototype || draft.fields.prototypeGoal.trim()) && <Field label="Initial Prototype">{fieldInput("prototypeGoal", NOT_ESTABLISHED)}</Field>}
        </Section>

        <Section n="04" id="expected-value" title="Expected Business Value">
          <Field label="Qualitative value">
            {narrativeInput("expectedValue", brief.expectedValue.qualitative.text, "input-expectedValue")}
          </Field>
          <div className="brief-sub">
            <h3>Quantified value</h3>
            <ul className="brief-list" data-testid="list-quantified-value">
              {brief.expectedValue.quantified.map(q => (
                <li key={q.label}><strong>{q.label}:</strong> {q.text}{q.status !== "unknown" && <span className="brief-muted"> (user estimate, unverified)</span>}</li>
              ))}
            </ul>
            {brief.expectedValue.quantified.every(q => q.status === "unknown") && <p className="brief-muted brief-small" data-testid="text-quantified-unknown">No financial or time figures were supplied; none have been assumed.</p>}
          </div>
        </Section>

        <Section n="05" id="success-measures" title="Success Measures">
          <div className="brief-sub">
            <h3>Success measure {sourceKind(brief.successMeasures.drafted) && <Source kind={sourceKind(brief.successMeasures.drafted)!} />}</h3>
            {!fields.successMetric.trim() && <p className="brief-muted">Success measures have not yet been finalized.</p>}
            {fieldInput("successMetric", "Add an agreed success measure")}
          </div>
          {candidates.length > 0 && (
            <div className="brief-sub">
              <h3>Potential Success Measures <Source kind="suggestion" /></h3>
              <ul className="brief-list" data-testid="list-candidate-measures">{candidates.map(m => <li key={m.text}>{m.text}</li>)}</ul>
              <p className="brief-muted brief-small">Suggestions to consider, not established targets.</p>
            </div>
          )}
        </Section>

        <Section n="06" id="risks" title="Risks, Constraints & Unknowns">
          <Field label="Risks and considerations">
            {narrativeInput("risks", "Not yet known. Add known risks or constraints.", "input-risks")}
          </Field>
          {critical.length > 0 && (
            <div className="brief-sub">
              <h3>Critical unknowns</h3>
              <ul className="brief-list" data-testid="list-critical-unknowns">{critical.map(u => <li key={u.text}>{u.text}</li>)}</ul>
            </div>
          )}
          {discovery.length > 0 && (
            <div className="brief-sub">
              <h3>For project discovery</h3>
              <ul className="brief-list brief-list-quiet" data-testid="list-discovery-unknowns">{discovery.map(u => <li key={u.text}>{u.text}</li>)}</ul>
            </div>
          )}
        </Section>

        <Section n="07" id="next-steps" title="Recommended Next Steps" source="ai">
          {narrativeInput("nextSteps", "What should happen next?", "input-nextSteps")}
        </Section>

        <Section n="08" id="assessment" title="Current Assessment">
          <div className="brief-assess">
            <div className="brief-score">
              <span className="brief-score-num" data-testid="text-live-score">{brief.assessment.score}</span>
              <span className="brief-score-of">/ 100</span>
              <span className={`brief-priority brief-priority-${brief.assessment.priority.toLowerCase()}`} data-testid="text-live-priority">{brief.assessment.priority} priority</span>
            </div>
            <dl className="brief-factors" data-testid="list-assessment-factors">
              {brief.assessment.factors.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
            </dl>
          </div>
          <p className="brief-muted brief-small">
            Deterministic rule-engine score. Revenue and cost factors score zero when value has not been quantified, so an early brief may rank lower until estimates are supplied.
          </p>
          <button type="button" className="brief-link" data-print-hide data-testid="button-edit-assessment"
            aria-expanded={assessmentOpen} onClick={() => setAssessmentOpen(o => !o)}>
            {assessmentOpen ? <ChevronUp className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            {assessmentOpen ? "Close assessment editor" : "Edit Assessment"}
          </button>
          {assessmentOpen && (
            <div className="brief-assess-editor" data-print-hide data-testid="panel-assessment-editor">
              <fieldset>
                <legend>Scoring factors</legend>
                <div className="brief-control-grid">
                  {FACTORS.map(f => (
                    <label key={f.key} className="brief-control">
                      <span>{f.label} <em>{f.min !== undefined ? `${f.min} to ${f.max}` : `max ${f.max}`}</em></span>
                      <input type="number" min={f.min ?? 0} max={f.max} className="brief-number" data-testid={`input-score-${f.key}`}
                        value={scoring[f.key]} onChange={e => setScore(f.key, e.target.value)} />
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Impact and readiness</legend>
                <p className="brief-muted brief-small">Figures are unverified user estimates. Leave blank when unknown; unquantified value is not zero value.</p>
                <div className="brief-control-grid">
                  {numberInput("estimatedHoursSavedMonthly", "Hours saved / month")}
                  {numberInput("estimatedRevenueOpportunity", "Revenue opportunity ($)")}
                  {numberInput("estimatedCostSavings", "Cost savings ($)")}
                  {levelSelect("customerImpact", "Customer impact")}
                  {levelSelect("complianceRisk", "Compliance risk")}
                  {levelSelect("technicalComplexity", "Technical complexity")}
                  {levelSelect("aiReadiness", "AI readiness (if relevant)")}
                </div>
              </fieldset>
            </div>
          )}
        </Section>

        {(facts.length > 0 || jira) && (
          <Section n="09" id="supporting-context" title="Supporting Context">
            {jira && <p className="brief-body" data-testid="text-jira-context">Originated from Jira request <strong>{brief.supportingContext.jiraKey}</strong>: {jira.summary}. This read-only link is saved with the initiative.</p>}
            {facts.length > 0 && (
              <div className="brief-sub">
                <h3>Source facts <Source kind="you" /></h3>
                <ul className="brief-list" data-testid="list-known-facts">
                  {facts.map((f, i) => <li key={i}>{f.value} <span className="brief-muted">({f.source === "jira" ? "Jira" : "interview"})</span></li>)}
                </ul>
              </div>
            )}
          </Section>
        )}

        <footer className="brief-footer">
          <span>Innovation Hub</span>
          <span>{brief.metadata.title} &middot; Generated {generated}</span>
        </footer>
      </article>

      {Object.keys(errors).some(k => errors[k as keyof Errors]) && (
        <p role="alert" className="brief-error brief-error-summary" data-print-hide>Please complete all marked fields before saving.</p>
      )}
      <div className="brief-bottom-actions" data-print-hide>
        <Button variant="outline" onClick={onBack} disabled={saving} data-testid="button-cancel-review">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} data-testid="button-save-initiative-bottom">
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Initiative</>}
        </Button>
      </div>
    </div>
  );
}
