import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetInitiative,
  useGetSettings,
  useUpdateInitiative,
  useDeleteInitiative,
  useListInitiativeVersions,
  usePromoteInitiative,
  useListProjects,
  useListOrganizations,
  useListClients,
  useListPrograms,
  getListProjectsQueryKey,
  useRecalculateInitiative,
  useCompareInitiativeVersions,
  getListInitiativesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetInitiativeQueryKey,
  getListInitiativeVersionsQueryKey,
  getGetInitiativeRecommendationsQueryKey,
  getCompareInitiativeVersionsQueryKey,
  getListCalculationEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/data-table";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { InitiativeIntelligence } from "@/components/initiative-intelligence";
import { InfoHint } from "@/components/info-hint";
import {
  RecalculationResultDialog,
  CalculationHistory,
} from "@/components/calculation-transparency";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { RULE_ENGINE_SOURCE_LABEL } from "@/lib/aiSource";
import {
  Target,
  FileText,
  Briefcase,
  Calculator,
  History,
  ClipboardList,
  Pencil,
  RefreshCw,
  GitCompareArrows,
  UserRound,
  PlusCircle,
  Link2,
} from "lucide-react";
import type {
  Initiative,
  InitiativeUpdate,
  InitiativeVersion,
  RecalculationResult,
} from "@workspace/api-client-react";
import type { InitiativeBrief } from "@workspace/initiative-brief";
import { editReviewedSupplement } from "@/components/initiative-review/review-model";

const PROTOTYPE_SPRINT_DAYS = 14;
const RISK_LEVELS = ["Low", "Medium", "High"] as const;

function isAiInitiative(initiative: Initiative): boolean {
  return /\b(ai|artificial intelligence|machine learning|llm|generative ai|natural language processing)\b/i.test(
    `${initiative.title} ${initiative.aiConcept} ${initiative.prototypeGoal}`,
  );
}

function hasPrototypeGoal(initiative: Initiative): boolean {
  return !!initiative.prototypeGoal?.trim() && !/^(n\/a|none|not applicable|not specified|to be determined|tbd)$/i.test(initiative.prototypeGoal.trim());
}

// Display business inputs without claiming that unquantified value is zero.
function generateOpportunityCanvas(initiative: Initiative) {
  const value = [
    initiative.estimatedHoursSavedMonthly > 0 && `${initiative.estimatedHoursSavedMonthly} hours saved per month`,
    initiative.estimatedRevenueOpportunity > 0 && `$${initiative.estimatedRevenueOpportunity.toLocaleString()} revenue opportunity`,
    initiative.estimatedCostSavings > 0 && `$${initiative.estimatedCostSavings.toLocaleString()} cost savings`,
  ].filter(Boolean);
  return {
    executiveSummary:
      initiative.executiveSummary && initiative.executiveSummary.trim() !== ""
        ? initiative.executiveSummary
         : "No executive summary recorded.",
    problem: initiative.problemStatement,
    currentProcess: initiative.currentProcess,
    desiredOutcome: initiative.desiredOutcome,
    aiOpportunity: initiative.aiConcept,
    expectedValue: value.length ? `Estimated ${value.join(", ")}.` : "Value not yet quantified. Confirm the expected business impact during planning.",
    prototypeGoal: initiative.prototypeGoal,
    successMetric: initiative.successMetric,
    risks: `Compliance: ${initiative.complianceRisk}. Technical complexity: ${initiative.technicalComplexity}.${isAiInitiative(initiative) ? ` AI/data readiness: ${initiative.aiReadiness}.` : ""}`,
    recommendedNextStep: "See Initiative Intelligence for a state-based recommended next action.",
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy p");
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd");
}

interface EditDraft {
  expectedValue: string;
  risks: string;
  nextSteps: string;
  candidateMeasures: string;
  criticalUnknowns: string;
  discoveryUnknowns: string;
  supportingFacts: string;
  executiveSummary: string;
  problemStatement: string;
  currentProcess: string;
  desiredOutcome: string;
  aiConcept: string;
  estimatedHoursSavedMonthly: string;
  estimatedRevenueOpportunity: string;
  estimatedCostSavings: string;
  prototypeGoal: string;
  successMetric: string;
  complianceRisk: string;
  technicalComplexity: string;
  aiReadiness: string;
  businessOwner: string;
  executiveSponsor: string;
}

// The generated OpenAPI export schema exposes nested JSON as index signatures;
// the shared brief module defines its concrete semantic shape.
function getReviewedBrief(initiative: Initiative): InitiativeBrief | null {
  return initiative.reviewedBrief as unknown as InitiativeBrief | null;
}
const lines = (values: string[]) => values.join("\n");

function draftFromInitiative(initiative: Initiative): EditDraft {
  const brief = getReviewedBrief(initiative);
  return {
    expectedValue: brief?.expectedValue.qualitative.text ?? "",
    risks: brief?.risks.text ?? "",
    nextSteps: brief?.nextSteps.text ?? "",
    candidateMeasures: lines(brief?.successMeasures.candidates.map(c => c.text) ?? []),
    criticalUnknowns: lines(brief?.unknowns.filter(u => u.priority === "critical").map(u => u.text) ?? []),
    discoveryUnknowns: lines(brief?.unknowns.filter(u => u.priority === "discovery").map(u => u.text) ?? []),
    supportingFacts: lines(brief?.supportingContext.facts.map(f => f.value) ?? []),
    executiveSummary: initiative.executiveSummary ?? "",
    problemStatement: initiative.problemStatement,
    currentProcess: initiative.currentProcess,
    desiredOutcome: initiative.desiredOutcome,
    aiConcept: initiative.aiConcept,
    estimatedHoursSavedMonthly: String(initiative.estimatedHoursSavedMonthly),
    estimatedRevenueOpportunity: String(initiative.estimatedRevenueOpportunity),
    estimatedCostSavings: String(initiative.estimatedCostSavings),
    prototypeGoal: initiative.prototypeGoal,
    successMetric: initiative.successMetric,
    complianceRisk: initiative.complianceRisk,
    technicalComplexity: initiative.technicalComplexity,
    aiReadiness: initiative.aiReadiness,
    businessOwner: initiative.businessOwner ?? "",
    executiveSponsor: initiative.executiveSponsor ?? "",
  };
}

function RiskLevelSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {RISK_LEVELS.map((level) => (
            <SelectItem key={level} value={level}>
              {level}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompareDialog({
  id,
  open,
  onOpenChange,
}: {
  id: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: comparison, isLoading } = useCompareInitiativeVersions(id, {
    query: {
      enabled: open && !!id,
      queryKey: getCompareInitiativeVersionsQueryKey(id),
    },
  });

  const changedCount =
    comparison?.fields.filter((f) => f.changed).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-primary" />
            Version Comparison
          </DialogTitle>
          <DialogDescription>
            {comparison?.available
              ? `Comparing ${comparison.previousVersion} with ${comparison.currentVersion} — ${changedCount} field${changedCount === 1 ? "" : "s"} changed.`
              : "Side-by-side comparison of the current version with the previous version."}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {!isLoading && comparison && !comparison.available && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {comparison.reason ?? "Comparison is not available."}
          </div>
        )}

        {!isLoading && comparison && comparison.available && (
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-[160px_1fr_1fr] bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="px-3 py-2">Field</div>
              <div className="px-3 py-2 border-l">
                Previous ({comparison.previousVersion})
              </div>
              <div className="px-3 py-2 border-l">
                Current ({comparison.currentVersion})
              </div>
            </div>
            {comparison.fields.map((field) => (
              <div
                key={field.field}
                className={`grid grid-cols-[160px_1fr_1fr] border-t text-sm ${
                  field.changed ? "bg-[#FFC72C]/10" : ""
                }`}
              >
                <div className="px-3 py-2 font-medium flex items-start gap-1.5">
                  {field.changed && (
                    <span
                      className="mt-1.5 h-2 w-2 rounded-full bg-[#FFC72C] shrink-0"
                      aria-label="Changed"
                    />
                  )}
                  <span>{field.label}</span>
                </div>
                <div
                  className={`px-3 py-2 border-l whitespace-pre-wrap break-words ${
                    field.changed
                      ? "text-muted-foreground line-through decoration-muted-foreground/50"
                      : "text-muted-foreground"
                  }`}
                >
                  {field.previous}
                </div>
                <div
                  className={`px-3 py-2 border-l whitespace-pre-wrap break-words ${
                    field.changed ? "font-medium" : "text-muted-foreground"
                  }`}
                >
                  {field.current}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>

  );
}


function PromoteDialog({
  initiative,
  open,
  onOpenChange
}: {
  initiative: Initiative;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: projects } = useListProjects(undefined, { query: { enabled: open, queryKey: getListProjectsQueryKey() } });
  const linkedProjects = (projects || []).filter(p => p.initiativeId === initiative.id);
  
  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  const { data: programs } = useListPrograms();
  const promoteInFlight = useRef(false);
  const ownerInputRef = useRef<HTMLInputElement>(null);
  const [ownerError, setOwnerError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<{
    projectType: string;
    organizationId: number | null;
    clientId: number | null;
    programId: number | null;
    primaryOwner: string;
    targetDate: string;
  }>({
    projectType: "Innovation",
    organizationId: null,
    clientId: null,
    programId: null,
    primaryOwner: initiative.businessOwner || initiative.executiveSponsor || "",
    targetDate: "",
  });
  useEffect(() => {
    if (open) {
      setForm({
        projectType: "Innovation", organizationId: null, clientId: null, programId: null,
        primaryOwner: initiative.businessOwner || initiative.executiveSponsor || "", targetDate: "",
      });
      setOwnerError(false);
    }
  }, [open, initiative.id]);

  const promoteMutation = usePromoteInitiative({
    mutation: {
      onSuccess: (proj) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Project Created", description: `Project "${proj.name}" successfully created.` });
        onOpenChange(false);
        setLocation(`/projects/${proj.id}`);
      },
      onError: (err) => {
        promoteInFlight.current = false;
        setSubmitting(false);
        toast({ title: "Promotion Failed", description: err instanceof Error ? err.message : "Please retry.", variant: "destructive" });
      },
      onSettled: () => {
        promoteInFlight.current = false;
        setSubmitting(false);
      }
    }
  });

  const submit = (allowDuplicate = false) => {
    if (promoteInFlight.current) return;
    if (!form.primaryOwner.trim()) {
      setOwnerError(true);
      ownerInputRef.current?.focus();
      return;
    }
    setOwnerError(false);
    promoteInFlight.current = true;
    setSubmitting(true);
    promoteMutation.mutate({
      id: initiative.id,
      data: {
        projectType: form.projectType,
        organizationId: form.organizationId,
        clientId: form.clientId,
        programId: form.programId,
        primaryOwner: form.primaryOwner.trim(),
        targetDate: form.targetDate || null,
        allowDuplicate
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!promoteInFlight.current) onOpenChange(next); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Promote to Execution Project</DialogTitle>
          <DialogDescription>
            Create an execution project linked to {initiative.title} (INI-{String(initiative.id).padStart(4, "0")}). Its name comes from the initiative title.
          </DialogDescription>
        </DialogHeader>

        {linkedProjects.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md text-sm mb-4">
            <div className="font-semibold flex items-center gap-1"><Link2 className="h-4 w-4"/> Linked Projects Exist</div>
            <div className="mt-1">
              This initiative is already linked to:
              <ul className="list-disc pl-5 mt-1">
                {linkedProjects.map(p => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <span className="text-xs ml-2 opacity-80">({p.lifecycleStage} / {p.state})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid gap-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium">Planning context from initiative</p>
            <p className="break-words">{initiative.problemStatement}</p>
            <p className="text-muted-foreground">Priority: {initiative.priority} · Owner: {initiative.businessOwner || "Not specified"}</p>
            <p className="text-xs text-muted-foreground">Recommendations are suggestions only. No milestones, risks, approvals or resource commitments are created here.</p>
            {!!initiative.jiraLinks?.length && <p className="text-xs">Jira work to carry into Linked Work: {initiative.jiraLinks.map(link => link.jiraIssueKey).join(", ")}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Project Type</Label>
              <Select value={form.projectType} onValueChange={(v) => setForm(f => ({...f, projectType: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Client Implementation", "Internal Technology", "Internal Operations", "Executive Initiative", "Innovation", "Other"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="promotion-owner">Primary Owner <span className="text-destructive">(Required)</span></Label>
              <Input id="promotion-owner" ref={ownerInputRef} required aria-required="true" aria-invalid={ownerError}
                aria-describedby={ownerError ? "promotion-owner-error" : undefined}
                data-testid="input-promotion-owner" value={form.primaryOwner}
                onChange={(e) => { setForm(f => ({...f, primaryOwner: e.target.value})); if (e.target.value.trim()) setOwnerError(false); }} />
              {ownerError && <p id="promotion-owner-error" role="alert" className="text-sm text-destructive">Primary Owner is required to create a project.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Organization (Optional)</Label>
              <Select value={form.organizationId ? String(form.organizationId) : "none"} onValueChange={(v) => setForm(f => ({...f, organizationId: v === "none" ? null : Number(v)}))}>
                <SelectTrigger><SelectValue placeholder="Internal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Internal)</SelectItem>
                  {(organizations || []).map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Client (Optional)</Label>
              <Select value={form.clientId ? String(form.clientId) : "none"} onValueChange={(v) => setForm(f => ({...f, clientId: v === "none" ? null : Number(v)}))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(clients || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Program (Optional)</Label>
              <Select value={form.programId ? String(form.programId) : "none"} onValueChange={(v) => setForm(f => ({...f, programId: v === "none" ? null : Number(v)}))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(programs || []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Target Date (Optional)</Label>
              <div className="flex gap-2">
                <Input data-testid="input-promotion-target-date" type="date" value={form.targetDate} onChange={(e) => setForm(f => ({...f, targetDate: e.target.value}))} />
                <Button data-testid="button-clear-promotion-target-date" variant="outline" type="button" onClick={() => setForm(f => ({...f, targetDate: ""}))} disabled={!form.targetDate || submitting}>Clear</Button>
              </div>
              <p className="text-xs text-muted-foreground">Leave blank until a delivery date is agreed. A review date is not a project deadline.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <div className="flex gap-2">
            {linkedProjects.length > 0 ? (
              <Button variant="secondary" data-testid="button-create-additional-project" onClick={() => submit(true)} disabled={submitting || promoteMutation.isPending}>
                {submitting ? "Creating..." : "Create Additional Project"}
              </Button>
            ) : (
              <Button data-testid="button-confirm-create-project" onClick={() => submit(false)} disabled={submitting || promoteMutation.isPending}>
                {submitting ? "Creating..." : "Create Project"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InitiativeDetail() {
  const [, params] = useRoute("/initiatives/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const { data: initiative, isLoading } = useGetInitiative(id, {
    query: { enabled: !!id, queryKey: getGetInitiativeQueryKey(id) },
  });

  const { data: settings } = useGetSettings();
  const { data: versions } = useListInitiativeVersions(id, {
    query: { enabled: !!id, queryKey: getListInitiativeVersionsQueryKey(id) },
  });
  const updateInitiative = useUpdateInitiative();
  const deleteInitiative = useDeleteInitiative();
  const recalculateInitiative = useRecalculateInitiative();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [recalcResult, setRecalcResult] = useState<RecalculationResult | null>(
    null,
  );

  const [tracking, setTracking] = useState({
    assignedTeam: "",
    currentPhase: "",
    prototypeDay: "",
    nextReviewAt: "",
  });

  useEffect(() => {
    if (initiative) {
      setTracking({
        assignedTeam: initiative.assignedTeam ?? "",
        currentPhase: initiative.currentPhase ?? "",
        prototypeDay:
          initiative.prototypeDay === null ||
          initiative.prototypeDay === undefined
            ? ""
            : String(initiative.prototypeDay),
        nextReviewAt: toDateInput(initiative.nextReviewAt),
      });
    }
  }, [initiative]);

  const versionColumns = useMemo<ColumnDef<InitiativeVersion, unknown>[]>(
    () => [
      {
        id: "version",
        accessorKey: "version",
        header: "Version",
        size: 110,
        meta: { title: "Version" },
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium">
            {row.original.version}
          </span>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Date",
        size: 200,
        meta: {
          title: "Date",
          exportValue: (row) => formatDateTime(row.createdAt),
        },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: "changedBy",
        accessorKey: "changedBy",
        header: "User",
        size: 160,
        meta: { title: "User" },
      },
      {
        id: "summary",
        accessorKey: "summary",
        header: "Summary of Changes",
        size: 360,
        meta: { title: "Summary of Changes" },
        cell: ({ row }) => (
          <span className="whitespace-normal">{row.original.summary}</span>
        ),
      },
    ],
    [],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetInitiativeQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetDashboardSummaryQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getListInitiativeVersionsQueryKey(id),
    });
    queryClient.invalidateQueries({
      queryKey: getGetInitiativeRecommendationsQueryKey(id),
    });
    queryClient.invalidateQueries({
      queryKey: getListCalculationEventsQueryKey(id),
    });
    queryClient.invalidateQueries({
      queryKey: getCompareInitiativeVersionsQueryKey(id),
    });
  };

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96 col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!initiative) {
    return (
      <div className="text-center py-20 bg-card rounded-xl border border-dashed">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Initiative Not Found</h3>
        <p className="text-muted-foreground">
          The requested initiative does not exist or has been removed.
        </p>
        <Link href="/initiatives">
          <Button className="mt-4">Back to Initiatives</Button>
        </Link>
      </div>
    );
  }

  const handleEditModeChange = (enabled: boolean) => {
    if (enabled) {
      setDraft(draftFromInitiative(initiative));
      setEditMode(true);
    } else {
      setDraft(null);
      setEditMode(false);
    }
  };

  const updateDraft = (patch: Partial<EditDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const handleSaveEdits = () => {
    if (!draft) return;

    const numbers: Array<{
      key:
        | "estimatedHoursSavedMonthly"
        | "estimatedRevenueOpportunity"
        | "estimatedCostSavings";
      label: string;
    }> = [
      { key: "estimatedHoursSavedMonthly", label: "Hours saved" },
      { key: "estimatedRevenueOpportunity", label: "Revenue opportunity" },
      { key: "estimatedCostSavings", label: "Cost savings" },
    ];

    const data: InitiativeUpdate = {};

    for (const { key, label } of numbers) {
      const raw = draft[key].trim();
      const value = raw === "" ? 0 : Number(raw);
      if (Number.isNaN(value) || value < 0) {
        toast({
          title: "Invalid value",
          description: `${label} must be a non-negative number.`,
          variant: "destructive",
        });
        return;
      }
      if (value !== initiative[key]) {
        data[key] = value;
      }
    }

    const stringPairs: Array<{
      key: keyof EditDraft & keyof InitiativeUpdate;
      original: string;
    }> = [
      { key: "problemStatement", original: initiative.problemStatement },
      { key: "currentProcess", original: initiative.currentProcess },
      { key: "desiredOutcome", original: initiative.desiredOutcome },
      { key: "aiConcept", original: initiative.aiConcept },
      { key: "prototypeGoal", original: initiative.prototypeGoal },
      { key: "successMetric", original: initiative.successMetric },
      { key: "complianceRisk", original: initiative.complianceRisk },
      {
        key: "technicalComplexity",
        original: initiative.technicalComplexity,
      },
      { key: "aiReadiness", original: initiative.aiReadiness },
      { key: "businessOwner", original: initiative.businessOwner ?? "" },
      {
        key: "executiveSponsor",
        original: initiative.executiveSponsor ?? "",
      },
      {
        key: "executiveSummary",
        original: initiative.executiveSummary ?? "",
      },
    ];
    for (const { key, original } of stringPairs) {
      const value = draft[key];
      if (value !== original) {
        (data as Record<string, string>)[key] = value;
      }
    }
    const brief = getReviewedBrief(initiative);
    if (brief) {
      const original = draftFromInitiative(initiative);
      const supplemental = (["expectedValue", "risks", "nextSteps", "candidateMeasures", "criticalUnknowns", "discoveryUnknowns", "supportingFacts"] as const)
        .some(key => draft[key] !== original[key]);
      if (supplemental) {
        // Only update supplemental reviewed fields. Core edits are carried by the
        // normal patch, not copied back from an older brief snapshot.
        const reviewedBrief = editReviewedSupplement(brief, draft);
        data.reviewedBrief = reviewedBrief as unknown as NonNullable<InitiativeUpdate["reviewedBrief"]>;
      }
    }

    if (Object.keys(data).length === 0) {
      toast({
        title: "No changes",
        description: "Nothing to save — no fields were modified.",
      });
      handleEditModeChange(false);
      return;
    }

    updateInitiative.mutate(
      { id, data },
      {
        onSuccess: (updated) => {
          invalidateAll();
          handleEditModeChange(false);
          toast({
            title: "Changes Saved",
            description: `Initiative updated to version ${updated.version}.`,
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save changes.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRecalculate = () => {
    recalculateInitiative.mutate(
      { id },
      {
        onSuccess: (result) => {
          invalidateAll();
          if (!result.changed) {
            toast({
              title: "Recalculation Complete",
              description:
                "No changes detected. Innovation Score remains unchanged.",
            });
          } else {
            setRecalcResult(result);
          }
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to recalculate initiative.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleStatusChange = (newStatus: string) => {
    updateInitiative.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          invalidateAll();
          toast({
            title: "Status Updated",
            description: `Initiative status changed to ${newStatus}.`,
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to update status.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSaveTracking = () => {
    const prototypeDayValue =
      tracking.prototypeDay.trim() === ""
        ? undefined
        : Number(tracking.prototypeDay);
    if (
      prototypeDayValue !== undefined &&
      (Number.isNaN(prototypeDayValue) || prototypeDayValue < 0)
    ) {
      toast({
        title: "Invalid value",
        description: "Prototype day must be a positive number.",
        variant: "destructive",
      });
      return;
    }
    updateInitiative.mutate(
      {
        id,
        data: {
          assignedTeam: tracking.assignedTeam,
          currentPhase: tracking.currentPhase,
          prototypeDay: prototypeDayValue,
          nextReviewAt: tracking.nextReviewAt
            ? new Date(tracking.nextReviewAt).toISOString()
            : null,
        },
      },
      {
        onSuccess: () => {
          invalidateAll();
          toast({
            title: "Tracking Updated",
            description: "Governance and tracking details saved.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to update tracking details.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this initiative?")) {
      deleteInitiative.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListInitiativesQueryKey(),
            });
            queryClient.invalidateQueries({
              queryKey: getGetDashboardSummaryQueryKey(),
            });
            toast({
              title: "Initiative Deleted",
              description: "The initiative has been removed.",
            });
            setLocation("/initiatives");
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to delete initiative.",
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  const brief = getReviewedBrief(initiative);
  const legacyCanvas = generateOpportunityCanvas(initiative);
  const canvas = brief ? {
    ...legacyCanvas,
    expectedValue: brief.expectedValue.qualitative.text || "Not yet established.",
    risks: brief.risks.text || "Not yet established.",
    recommendedNextStep: brief.nextSteps.text || "Not yet established. See Initiative Intelligence for a state-based next action.",
  } : legacyCanvas;
  const generatedSummary = "Add an executive summary";
  const prototypeDayLabel =
    initiative.prototypeDay === null || initiative.prototypeDay === undefined
      ? "—"
      : `Day ${initiative.prototypeDay} of ${PROTOTYPE_SPRINT_DAYS}`;
  const isEditing = editMode && draft !== null;
  const jiraReferences = initiative.jiraLinks ?? [];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-xl border shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline">{initiative.category}</Badge>
            <span className="text-sm text-muted-foreground">
              ID: INI-{String(initiative.id).padStart(4, "0")}
            </span>
            <Badge variant="secondary" className="font-mono">
              {initiative.version}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {initiative.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center">
              <Briefcase className="mr-1 h-4 w-4" /> {initiative.department}
            </span>
            <span>
              Submitted by {initiative.submitterName} on{" "}
              {format(new Date(initiative.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          {jiraReferences.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
              <span className="text-muted-foreground">Source Jira work:</span>
              {jiraReferences.map((link) => <Badge key={link.jiraIssueId} variant="outline" className="font-mono">{link.jiraIssueKey}</Badge>)}
              <span className="text-xs text-muted-foreground">Carried into Linked Work on project creation</span>
            </div>
          )}
          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-xl">
              <div className="space-y-1">
                <Label htmlFor="businessOwner" className="text-xs">
                  Business Owner
                </Label>
                <Input
                  id="businessOwner"
                  value={draft.businessOwner}
                  placeholder="e.g. Jane Rivera"
                  onChange={(e) =>
                    updateDraft({ businessOwner: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="executiveSponsor" className="text-xs">
                  Executive Sponsor
                </Label>
                <Input
                  id="executiveSponsor"
                  value={draft.executiveSponsor}
                  placeholder="e.g. Mark Chen"
                  onChange={(e) =>
                    updateDraft({ executiveSponsor: e.target.value })
                  }
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center">
                <UserRound className="mr-1 h-4 w-4" />
                Owner:{" "}
                <span className="ml-1 font-medium text-foreground">
                  {initiative.businessOwner || "—"}
                </span>
              </span>
              <span className="flex items-center">
                <UserRound className="mr-1 h-4 w-4" />
                Sponsor:{" "}
                <span className="ml-1 font-medium text-foreground">
                  {initiative.executiveSponsor || "—"}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-3 w-full md:w-auto shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="edit-mode" className="text-sm cursor-pointer">
                Edit Mode
              </Label>
              <Switch
                id="edit-mode"
                checked={editMode}
                onCheckedChange={handleEditModeChange}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleRecalculate}
              disabled={recalculateInitiative.isPending || editMode}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  recalculateInitiative.isPending ? "animate-spin" : ""
                }`}
              />
              Recalculate
            </Button>
            <Button
              onClick={() => setPromoteOpen(true)}
              disabled={editMode}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={initiative.status}
              onValueChange={handleStatusChange}
              disabled={editMode}
            >
              <SelectTrigger className="w-40 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settings.statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link href={`/initiatives/${id}/score`}>
              <Button disabled={editMode}>
                <Calculator className="mr-2 h-4 w-4" /> Score
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Priority
                <InfoHint
                  title="Priority"
                  howCalculated="Derived automatically from the Innovation Score: 80+ is Critical, 65–79 is High, 50–64 is Medium, and below 50 is Low. Priority is recomputed whenever the score changes."
                  inputs={["Innovation Score (0–100)"]}
                  systemGenerated={["Priority level", "Innovation Score"]}
                />
              </div>
              <PriorityBadge priority={initiative.priority} />
            </div>
            <div className="text-right ml-2">
              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Score
                <InfoHint
                  title="Innovation Score"
                   howCalculated="The deterministic Initiative assessment/prioritization score (0–100), based on scoring components and penalties. It is not interview intake readiness or confidence in recommendations."
                  inputs={[
                    "Business value, customer impact, strategic alignment ratings",
                    "Estimated revenue opportunity and cost savings",
                    "AI/Data readiness level (High/Medium/Low)",
                    "Prototype confidence rating",
                    "Technical complexity and compliance risk levels",
                  ]}
                  userEntered={[
                    "Scoring ratings and estimates from the scoring form",
                    "Readiness, complexity, and risk levels",
                  ]}
                  systemGenerated={[
                    "Component point conversions",
                    "Penalty deductions",
                    "Final 0–100 score",
                  ]}
                />
              </div>
              <div className="text-xl font-bold font-mono">
                {initiative.score}
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="ml-2"
              disabled={deleteInitiative.isPending || editMode}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center">
          <Target className="mr-2 h-5 w-5 text-primary" />
           <h2 className="text-xl font-bold">Innovation Canvas</h2>
          <span className="ml-3 text-xs text-muted-foreground">
            Source: {brief ? "Core Initiative fields + reviewed Initiative Brief" : RULE_ENGINE_SOURCE_LABEL}
          </span>
          {isEditing && (
            <Badge variant="outline" className="ml-3 border-[#FFC72C] text-foreground">
              Editing
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-primary">
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={draft.executiveSummary}
                    placeholder={generatedSummary}
                    rows={3}
                    onChange={(e) =>
                      updateDraft({ executiveSummary: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                     Leave blank to show that no executive summary is recorded.
                  </p>
                </div>
              ) : (
                <p className="text-lg font-medium">{canvas.executiveSummary}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                 Problem / Opportunity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={draft.problemStatement}
                  rows={4}
                  onChange={(e) =>
                    updateDraft({ problemStatement: e.target.value })
                  }
                />
              ) : (
                <p className="text-sm">{canvas.problem}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Current Process
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={draft.currentProcess}
                  rows={4}
                  onChange={(e) =>
                    updateDraft({ currentProcess: e.target.value })
                  }
                />
              ) : (
                <p className="text-sm">{canvas.currentProcess}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Desired Outcome
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={draft.desiredOutcome}
                  rows={4}
                  onChange={(e) =>
                    updateDraft({ desiredOutcome: e.target.value })
                  }
                />
              ) : (
                <p className="text-sm">{canvas.desiredOutcome}</p>
              )}
            </CardContent>
          </Card>

           {(initiative.aiConcept?.trim() || isEditing) && <Card className="md:col-span-2 bg-secondary/5 border-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-secondary">
                 Proposed Approach{isAiInitiative(initiative) ? " / AI Opportunity" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={draft.aiConcept}
                  rows={3}
                  onChange={(e) => updateDraft({ aiConcept: e.target.value })}
                />
              ) : (
                 <p className="text-sm">{canvas.aiOpportunity || "Approach to be determined during review."}</p>
              )}
            </CardContent>
           </Card>}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm uppercase tracking-wider text-muted-foreground">
                Expected Value
                <InfoHint
                  title="Expected Value"
                   howCalculated={brief ? "Reviewed qualitative value from the Initiative Brief; numeric estimates are separate." : "Based on numeric estimates entered on the initiative; qualitative value may not yet be recorded."}
                  inputs={[
                    "Estimated hours saved per month",
                    "Estimated revenue opportunity ($)",
                    "Estimated cost savings ($)",
                  ]}
                   userEntered={brief ? ["Reviewed qualitative value", "Numeric estimates (hours, revenue, cost savings)"] : ["Numeric estimates (hours, revenue, cost savings)"]}
                   systemGenerated={brief ? [] : ["The composed summary sentence"]}
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  {brief && <div className="space-y-1"><Label className="text-xs">Qualitative expected value</Label><Textarea data-testid="input-reviewed-value" value={draft.expectedValue} onChange={e => updateDraft({ expectedValue: e.target.value })} /></div>}
                  <div className="space-y-1">
                    <Label className="text-xs">Hours saved / month</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.estimatedHoursSavedMonthly}
                      onChange={(e) =>
                        updateDraft({
                          estimatedHoursSavedMonthly: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Revenue opportunity ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.estimatedRevenueOpportunity}
                      onChange={(e) =>
                        updateDraft({
                          estimatedRevenueOpportunity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cost savings ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.estimatedCostSavings}
                      onChange={(e) =>
                        updateDraft({ estimatedCostSavings: e.target.value })
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium">{canvas.expectedValue}</p>
              )}
            </CardContent>
          </Card>

          {(hasPrototypeGoal(initiative) || isEditing) && <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Proposed Prototype Goal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={draft.prototypeGoal}
                  rows={4}
                  onChange={(e) =>
                    updateDraft({ prototypeGoal: e.target.value })
                  }
                />
              ) : (
                <p className="text-sm">{canvas.prototypeGoal}</p>
              )}
            </CardContent>
          </Card>}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Success Measures
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={draft.successMetric}
                  rows={4}
                  onChange={(e) =>
                    updateDraft({ successMetric: e.target.value })
                  }
                />
              ) : (
                <p className="text-sm font-medium">{canvas.successMetric}</p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-destructive">
                Risks & Complexity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  {brief && <div className="space-y-1"><Label className="text-xs">Reviewed risks / considerations</Label><Textarea data-testid="input-reviewed-risks" value={draft.risks} onChange={e => updateDraft({ risks: e.target.value })} /></div>}
                  <RiskLevelSelect
                    label="Compliance Risk"
                    value={draft.complianceRisk}
                    onChange={(v) => updateDraft({ complianceRisk: v })}
                  />
                  <RiskLevelSelect
                    label="Technical Complexity"
                    value={draft.technicalComplexity}
                    onChange={(v) => updateDraft({ technicalComplexity: v })}
                  />
                  {isAiInitiative(initiative) && <RiskLevelSelect
                    label="AI/Data Readiness"
                    value={draft.aiReadiness}
                    onChange={(v) => updateDraft({ aiReadiness: v })}
                  />}
                </div>
              ) : (
                <p className="text-sm">{canvas.risks}</p>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1 md:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm uppercase tracking-wider text-muted-foreground">
                Recommended Next Step
                <InfoHint
                  title="Recommended Next Step"
                   howCalculated={brief ? "Reviewed next steps from the Initiative Brief; separate from deterministic intelligence recommendations." : "Legacy canvas guidance; see Initiative Intelligence for state-driven next action."}
                  inputs={["Priority level", "Innovation Score (0–100)"]}
                  systemGenerated={[
                    "Priority level",
                    "Innovation Score",
                    "The recommendation sentence",
                  ]}
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
               {isEditing && brief ? <Textarea data-testid="input-reviewed-next-steps" value={draft.nextSteps} onChange={e => updateDraft({ nextSteps: e.target.value })} /> : <p className="text-sm">{canvas.recommendedNextStep}</p>}
            </CardContent>
          </Card>
        </div>
        {brief && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {([
            ["candidateMeasures", "Suggested Success Measures", brief.successMeasures.candidates.map(c => c.text)],
            ["criticalUnknowns", "Critical Unknowns", brief.unknowns.filter(u => u.priority === "critical").map(u => u.text)],
            ["discoveryUnknowns", "For Project Discovery", brief.unknowns.filter(u => u.priority === "discovery").map(u => u.text)],
            ["supportingFacts", "Supporting Context", brief.supportingContext.facts.map(f => f.value)],
          ] as const).map(([key, label, items]) => (items.length > 0 || isEditing) && <Card key={key}>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider">{label}</CardTitle></CardHeader>
            <CardContent>{isEditing ? <Textarea data-testid={`input-reviewed-${key}`} value={draft[key]} rows={4} onChange={e => updateDraft({ [key]: e.target.value })} /> :
              <ul className="list-disc pl-5 space-y-1 text-sm">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}</CardContent>
          </Card>)}
        </div>}
        {brief?.assessment.readiness && <p data-testid="text-intake-readiness" className="mt-3 text-sm text-muted-foreground">
          Intake readiness: {brief.assessment.readiness}. This describes completeness and quality of business context gathered during the interview, not the scoring model’s AI/Data Readiness factor, Initiative assessment score, or recommendation confidence heuristic.
        </p>}
      </div>

      {/* Initiative Intelligence */}
      <InitiativeIntelligence initiativeId={id} hasPrototype={hasPrototypeGoal(initiative)} reviewedBrief={brief} />

      {/* Tracking & Governance */}
      <div className="space-y-4">
        <div className="flex items-center">
          <ClipboardList className="mr-2 h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Tracking & Governance</h2>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="assignedTeam">Assigned Team</Label>
              <Input
                id="assignedTeam"
                value={tracking.assignedTeam}
                placeholder="e.g. AI Platform Squad"
                onChange={(e) =>
                  setTracking((t) => ({ ...t, assignedTeam: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currentPhase">Current Phase</Label>
              <Input
                id="currentPhase"
                value={tracking.currentPhase}
                placeholder="e.g. Discovery"
                onChange={(e) =>
                  setTracking((t) => ({ ...t, currentPhase: e.target.value }))
                }
              />
            </div>
            {(hasPrototypeGoal(initiative) || initiative.prototypeDay != null) && <div className="space-y-1.5">
              <Label htmlFor="prototypeDay">
                Prototype Day (of {PROTOTYPE_SPRINT_DAYS})
              </Label>
              <Input
                id="prototypeDay"
                type="number"
                min={0}
                max={PROTOTYPE_SPRINT_DAYS}
                value={tracking.prototypeDay}
                placeholder="e.g. 4"
                onChange={(e) =>
                  setTracking((t) => ({ ...t, prototypeDay: e.target.value }))
                }
              />
            </div>}
            <div className="space-y-1.5">
              <Label htmlFor="nextReviewAt">Next Review Date</Label>
              <Input
                id="nextReviewAt"
                type="date"
                value={tracking.nextReviewAt}
                onChange={(e) =>
                  setTracking((t) => ({ ...t, nextReviewAt: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {(hasPrototypeGoal(initiative) || initiative.prototypeDay != null) && <span>
              Prototype progress:{" "}
              <span className="font-medium text-foreground">
                {prototypeDayLabel}
              </span>
            </span>}
            <span>
              Last reviewed:{" "}
              <span className="font-medium text-foreground">
                {formatDateTime(initiative.lastReviewedAt)}
              </span>
            </span>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleSaveTracking}
              disabled={updateInitiative.isPending || editMode}
            >
              Save Tracking
            </Button>
          </div>
        </div>
      </div>

      {/* History: Version History + Calculation History */}
      <div className="space-y-4">
        <div className="flex items-center">
          <History className="mr-2 h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">History</h2>
        </div>
        <Tabs defaultValue="versions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="versions">Version History</TabsTrigger>
              <TabsTrigger value="calculations">
                Calculation History
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompareOpen(true)}
              disabled={(versions?.length ?? 0) < 2}
            >
              <GitCompareArrows className="mr-2 h-4 w-4" />
              Compare with Previous
            </Button>
          </div>
          <TabsContent value="versions" className="mt-4">
            <DataTable
              columns={versionColumns}
              data={versions ?? []}
              searchPlaceholder="Search history..."
              exportFileName={`initiative-${initiative.id}-version-history`}
              initialPageSize={10}
              emptyMessage="No version history yet."
            />
          </TabsContent>
          <TabsContent value="calculations" className="mt-4">
            <CalculationHistory initiativeId={id} />
          </TabsContent>
        </Tabs>
      </div>

      <CompareDialog
        id={id}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />

      <RecalculationResultDialog
        result={recalcResult}
        onOpenChange={(open) => {
          if (!open) setRecalcResult(null);
        }}
      />

      {/* Sticky edit-mode action bar */}
      {isEditing && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Pencil className="h-4 w-4 text-[#FFC72C]" />
              <span>
                Editing <span className="font-medium text-foreground">{initiative.title}</span>{" "}
                — saving will create a new version.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => handleEditModeChange(false)}
                disabled={updateInitiative.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdits}
                disabled={updateInitiative.isPending}
              >
                {updateInitiative.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <PromoteDialog initiative={initiative} open={promoteOpen} onOpenChange={setPromoteOpen} />
    </div>
  );
}
