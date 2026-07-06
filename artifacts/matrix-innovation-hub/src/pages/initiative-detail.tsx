import { useEffect, useMemo, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetInitiative,
  useGetSettings,
  useUpdateInitiative,
  useDeleteInitiative,
  useListInitiativeVersions,
  useRecalculateInitiative,
  useCompareInitiativeVersions,
  getListInitiativesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetInitiativeQueryKey,
  getListInitiativeVersionsQueryKey,
  getGetInitiativeRecommendationsQueryKey,
  getCompareInitiativeVersionsQueryKey,
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/data-table";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { InitiativeIntelligence } from "@/components/initiative-intelligence";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
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
} from "lucide-react";
import type {
  Initiative,
  InitiativeUpdate,
  InitiativeVersion,
} from "@workspace/api-client-react";

const PROTOTYPE_SPRINT_DAYS = 14;
const RISK_LEVELS = ["Low", "Medium", "High"] as const;

// Local helper to compose AI Opportunity Canvas strings.
// // TODO: OpenAI can be wired in here later to generate more sophisticated summaries.
function generateOpportunityCanvas(initiative: Initiative) {
  return {
    executiveSummary:
      initiative.executiveSummary && initiative.executiveSummary.trim() !== ""
        ? initiative.executiveSummary
        : `${initiative.title} is a ${initiative.category} initiative for the ${initiative.department} department led by ${initiative.submitterName}.`,
    problem: initiative.problemStatement,
    currentProcess: initiative.currentProcess,
    desiredOutcome: initiative.desiredOutcome,
    aiOpportunity: initiative.aiConcept,
    expectedValue: `Estimated ${initiative.estimatedHoursSavedMonthly} hrs/mo saved, $${initiative.estimatedRevenueOpportunity} revenue opportunity, $${initiative.estimatedCostSavings} cost savings.`,
    prototypeGoal: initiative.prototypeGoal,
    successMetric: initiative.successMetric,
    risks: `Compliance: ${initiative.complianceRisk}. Technical: ${initiative.technicalComplexity}. Data Readiness: ${initiative.aiReadiness}.`,
    recommendedNextStep: `Advance to next phase based on ${initiative.priority} priority and score of ${initiative.score}/100.`,
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

function draftFromInitiative(initiative: Initiative): EditDraft {
  return {
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
        onSuccess: (updated) => {
          invalidateAll();
          if (updated.score === initiative.score) {
            toast({
              title: "Recalculation Complete",
              description: `No changes — score remains ${updated.score}/100 (${updated.priority}).`,
            });
          } else {
            toast({
              title: "Recalculation Complete",
              description: `Score updated from ${initiative.score} to ${updated.score}/100 (${updated.priority} priority).`,
            });
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

  const canvas = generateOpportunityCanvas(initiative);
  const generatedSummary = `${initiative.title} is a ${initiative.category} initiative for the ${initiative.department} department led by ${initiative.submitterName}.`;
  const prototypeDayLabel =
    initiative.prototypeDay === null || initiative.prototypeDay === undefined
      ? "—"
      : `Day ${initiative.prototypeDay} of ${PROTOTYPE_SPRINT_DAYS}`;
  const isEditing = editMode && draft !== null;

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
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Priority
              </div>
              <PriorityBadge priority={initiative.priority} />
            </div>
            <div className="text-right ml-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Score
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
          <h2 className="text-xl font-bold">AI Opportunity Canvas</h2>
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
                    Leave blank to use the auto-generated summary.
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
                Problem
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

          <Card className="md:col-span-2 bg-secondary/5 border-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-secondary">
                AI Opportunity
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
                <p className="text-sm">{canvas.aiOpportunity}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Expected Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Prototype Goal
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
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Success Metric
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
                  <RiskLevelSelect
                    label="Data Readiness"
                    value={draft.aiReadiness}
                    onChange={(v) => updateDraft({ aiReadiness: v })}
                  />
                </div>
              ) : (
                <p className="text-sm">{canvas.risks}</p>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1 md:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Recommended Next Step
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{canvas.recommendedNextStep}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Initiative Intelligence */}
      <InitiativeIntelligence initiativeId={id} />

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
            <div className="space-y-1.5">
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
            </div>
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
            <span>
              Prototype progress:{" "}
              <span className="font-medium text-foreground">
                {prototypeDayLabel}
              </span>
            </span>
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

      {/* Version History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <History className="mr-2 h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Version History</h2>
          </div>
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
        <DataTable
          columns={versionColumns}
          data={versions ?? []}
          searchPlaceholder="Search history..."
          exportFileName={`initiative-${initiative.id}-version-history`}
          initialPageSize={10}
          emptyMessage="No version history yet."
        />
      </div>

      <CompareDialog
        id={id}
        open={compareOpen}
        onOpenChange={setCompareOpen}
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
    </div>
  );
}
