import { useEffect, useMemo, useState } from "react";
import {
  useListValidations,
  useCreateValidation,
  useGetValidation,
  useUpdateValidation,
  useDeleteValidation,
  useUpdateValidationItem,
  getListValidationsQueryKey,
  getGetValidationQueryKey,
} from "@workspace/api-client-react";
import type {
  ValidationRecord,
  ValidationDetail,
  ValidationItem,
  ValidationItemUpdateResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  ClipboardCheck,
  Plus,
  Copy,
  MessageSquareText,
  Trash2,
  CheckCircle2,
  XCircle,
  CircleDashed,
} from "lucide-react";

const RESULT_OPTIONS: ValidationItemUpdateResult[] = [
  "Pass",
  "Fail",
  "Not Tested",
];

function statusBadgeVariant(status: string) {
  switch (status) {
    case "Passed":
      return "bg-green-100 text-green-800 border-green-200";
    case "Failed":
      return "bg-red-100 text-red-800 border-red-200";
    case "In Progress":
      return "bg-[#00A3E0]/10 text-[#002D72] border-[#00A3E0]/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy p");
}

function buildReplitFeedback(detail: ValidationDetail): string {
  const passed = detail.items.filter((i) => i.result === "Pass");
  const failed = detail.items.filter((i) => i.result === "Fail");
  const notTested = detail.items.filter((i) => i.result === "Not Tested");
  const commented = detail.items.filter((i) => i.comments.trim() !== "");

  const lines: string[] = [];
  lines.push(`Validation feedback for Matrix Innovation Hub`);
  lines.push(``);
  lines.push(`Version tested: ${detail.applicationVersion}`);
  if (detail.releaseName) lines.push(`Release name: ${detail.releaseName}`);
  if (detail.validatorName) lines.push(`Validator: ${detail.validatorName}`);
  lines.push(`Validation status: ${detail.status}`);
  lines.push(`Validation date: ${formatDate(detail.validationDate)}`);
  lines.push(
    `Results: ${passed.length} passed / ${failed.length} failed / ${notTested.length} not tested (of ${detail.totalItems})`,
  );
  if (detail.summary.trim()) {
    lines.push(``);
    lines.push(`Summary: ${detail.summary.trim()}`);
  }

  lines.push(``);
  lines.push(`PASSED (${passed.length}):`);
  if (passed.length === 0) lines.push(`- None`);
  for (const item of passed) {
    lines.push(`- [${item.featureArea}] ${item.whatToValidate}`);
  }

  lines.push(``);
  lines.push(`FAILED (${failed.length}):`);
  if (failed.length === 0) lines.push(`- None`);
  for (const item of failed) {
    lines.push(`- [${item.featureArea}] ${item.breadcrumb}`);
    lines.push(`  What was validated: ${item.whatToValidate}`);
    lines.push(`  Expected result: ${item.expectedResult}`);
    if (item.comments.trim()) {
      lines.push(`  Observed / comments: ${item.comments.trim()}`);
    }
  }

  lines.push(``);
  lines.push(`NOT TESTED (${notTested.length}):`);
  if (notTested.length === 0) lines.push(`- None`);
  for (const item of notTested) {
    lines.push(`- [${item.featureArea}] ${item.whatToValidate}`);
  }

  if (commented.length > 0) {
    lines.push(``);
    lines.push(`ALL COMMENTS:`);
    for (const item of commented) {
      lines.push(
        `- [${item.featureArea}] (${item.result}) ${item.comments.trim()}`,
      );
    }
  }

  lines.push(``);
  lines.push(`RECOMMENDED FIXES:`);
  if (failed.length === 0) {
    lines.push(`- No failures found. No fixes required for this version.`);
  } else {
    for (const item of failed) {
      lines.push(
        `- Fix [${item.featureArea}] at ${item.breadcrumb}: expected "${item.expectedResult}"${
          item.comments.trim() ? ` — observed: ${item.comments.trim()}` : ""
        }`,
      );
    }
  }

  if (detail.overallNotes.trim()) {
    lines.push(``);
    lines.push(`OVERALL NOTES:`);
    lines.push(detail.overallNotes.trim());
  }

  return lines.join("\n");
}

function ResultToggle({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (result: ValidationItemUpdateResult) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {RESULT_OPTIONS.map((option) => {
        const active = value === option;
        const activeClass =
          option === "Pass"
            ? "bg-green-600 text-white border-green-600 hover:bg-green-600"
            : option === "Fail"
              ? "bg-red-600 text-white border-red-600 hover:bg-red-600"
              : "bg-muted-foreground text-white border-muted-foreground hover:bg-muted-foreground";
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className={`h-7 px-2 text-xs ${active ? activeClass : ""}`}
            onClick={() => onChange(option)}
          >
            {option === "Pass" && <CheckCircle2 className="mr-1 h-3 w-3" />}
            {option === "Fail" && <XCircle className="mr-1 h-3 w-3" />}
            {option === "Not Tested" && (
              <CircleDashed className="mr-1 h-3 w-3" />
            )}
            {option}
          </Button>
        );
      })}
    </div>
  );
}

function ChecklistItemRow({
  item,
  onUpdate,
  pending,
}: {
  item: ValidationItem;
  onUpdate: (
    itemId: number,
    data: { result?: ValidationItemUpdateResult; comments?: string },
  ) => void;
  pending: boolean;
}) {
  const [comments, setComments] = useState(item.comments);

  useEffect(() => {
    setComments(item.comments);
  }, [item.comments]);

  return (
    <div className="border-t px-4 py-3 space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-mono text-muted-foreground">
            {item.breadcrumb}
          </div>
          <div className="text-sm font-medium">{item.whatToValidate}</div>
          <div className="text-sm text-muted-foreground">
            Expected: {item.expectedResult}
          </div>
        </div>
        <div className="shrink-0">
          <ResultToggle
            value={item.result}
            disabled={pending}
            onChange={(result) => onUpdate(item.id, { result })}
          />
        </div>
      </div>
      <Textarea
        value={comments}
        placeholder="Optional comments — describe what you observed, especially on failures."
        rows={1}
        className="text-sm min-h-[36px]"
        onChange={(e) => setComments(e.target.value)}
        onBlur={() => {
          if (comments !== item.comments) {
            onUpdate(item.id, { comments });
          }
        }}
      />
    </div>
  );
}

export default function ValidationPage() {
  const queryClient = useQueryClient();
  const { data: records, isLoading } = useListValidations();
  const createValidation = useCreateValidation();
  const updateValidation = useUpdateValidation();
  const deleteValidation = useDeleteValidation();
  const updateItem = useUpdateValidationItem();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const { data: detail } = useGetValidation(selectedId ?? 0, {
    query: {
      enabled: selectedId !== null,
      queryKey: getGetValidationQueryKey(selectedId ?? 0),
    },
  });

  const [header, setHeader] = useState({
    releaseName: "",
    validatorName: "",
    summary: "",
    overallNotes: "",
  });

  useEffect(() => {
    if (detail) {
      setHeader({
        releaseName: detail.releaseName,
        validatorName: detail.validatorName,
        summary: detail.summary,
        overallNotes: detail.overallNotes,
      });
    }
  }, [detail]);

  useEffect(() => {
    if (selectedId === null && records && records.length > 0) {
      setSelectedId(records[0].id);
    }
  }, [records, selectedId]);

  const invalidate = (id?: number) => {
    queryClient.invalidateQueries({ queryKey: getListValidationsQueryKey() });
    if (id !== undefined) {
      queryClient.invalidateQueries({
        queryKey: getGetValidationQueryKey(id),
      });
    }
  };

  const handleGenerate = () => {
    createValidation.mutate(
      { data: {} },
      {
        onSuccess: (created) => {
          invalidate();
          setSelectedId(created.id);
          toast({
            title: "Validation Checklist Generated",
            description: `Checklist created for ${created.applicationVersion} with ${created.totalItems} items.`,
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to generate validation checklist.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSaveHeader = () => {
    if (selectedId === null || !detail) return;
    const data: Record<string, string> = {};
    if (header.releaseName !== detail.releaseName)
      data.releaseName = header.releaseName;
    if (header.validatorName !== detail.validatorName)
      data.validatorName = header.validatorName;
    if (header.summary !== detail.summary) data.summary = header.summary;
    if (header.overallNotes !== detail.overallNotes)
      data.overallNotes = header.overallNotes;
    if (Object.keys(data).length === 0) {
      toast({ title: "No changes", description: "Nothing to save." });
      return;
    }
    updateValidation.mutate(
      { id: selectedId, data },
      {
        onSuccess: () => {
          invalidate(selectedId);
          toast({
            title: "Validation Updated",
            description: "Record details saved.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save record details.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleItemUpdate = (
    itemId: number,
    data: { result?: ValidationItemUpdateResult; comments?: string },
  ) => {
    if (selectedId === null) return;
    updateItem.mutate(
      { id: selectedId, itemId, data },
      {
        onSuccess: () => {
          invalidate(selectedId);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to update checklist item.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (selectedId === null) return;
    if (!confirm("Delete this validation record and all its checklist items?"))
      return;
    deleteValidation.mutate(
      { id: selectedId },
      {
        onSuccess: () => {
          setSelectedId(null);
          invalidate();
          toast({
            title: "Validation Deleted",
            description: "The validation record has been removed.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to delete validation record.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const feedbackText = useMemo(
    () => (detail ? buildReplitFeedback(detail) : ""),
    [detail],
  );

  const handleCopyFeedback = async () => {
    try {
      await navigator.clipboard.writeText(feedbackText);
      toast({
        title: "Copied",
        description: "Feedback copied to clipboard — paste it into Replit Agent.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text manually and copy it.",
        variant: "destructive",
      });
    }
  };

  const groupedItems = useMemo(() => {
    if (!detail) return [];
    const groups: { featureArea: string; items: ValidationItem[] }[] = [];
    for (const item of detail.items) {
      const last = groups[groups.length - 1];
      if (last && last.featureArea === item.featureArea) {
        last.items.push(item);
      } else {
        groups.push({ featureArea: item.featureArea, items: [item] });
      }
    }
    return groups;
  }, [detail]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Validation Review
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Validate each application version against the feature checklist and
            generate clean feedback for the development team.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={createValidation.isPending}
        >
          <Plus className="mr-2 h-4 w-4" />
          {createValidation.isPending
            ? "Generating..."
            : "Generate Validation Checklist"}
        </Button>
      </div>

      {/* Record list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[110px_1fr_130px_170px_150px_170px] bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground max-md:hidden">
          <div className="px-4 py-2">Version</div>
          <div className="px-4 py-2">Release Name</div>
          <div className="px-4 py-2">Status</div>
          <div className="px-4 py-2">Progress</div>
          <div className="px-4 py-2">Validator</div>
          <div className="px-4 py-2">Validation Date</div>
        </div>
        {(records ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No validation records yet. Generate a checklist for the current
            version to get started.
          </div>
        )}
        {(records ?? []).map((record: ValidationRecord) => (
          <button
            key={record.id}
            type="button"
            onClick={() => setSelectedId(record.id)}
            className={`grid w-full grid-cols-1 md:grid-cols-[110px_1fr_130px_170px_150px_170px] border-t text-left text-sm hover:bg-muted/40 ${
              record.id === selectedId ? "bg-primary/5" : ""
            }`}
          >
            <div className="px-4 py-2.5 font-mono font-medium">
              {record.applicationVersion}
            </div>
            <div className="px-4 py-2.5 truncate">
              {record.releaseName || "—"}
            </div>
            <div className="px-4 py-2.5">
              <Badge variant="outline" className={statusBadgeVariant(record.status)}>
                {record.status}
              </Badge>
            </div>
            <div className="px-4 py-2.5 text-muted-foreground">
              {record.passedItems} pass / {record.failedItems} fail /{" "}
              {record.notTestedItems} untested
            </div>
            <div className="px-4 py-2.5 truncate">
              {record.validatorName || "—"}
            </div>
            <div className="px-4 py-2.5 text-muted-foreground">
              {formatDate(record.validationDate)}
            </div>
          </button>
        ))}
      </div>

      {/* Detail */}
      {detail && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-3">
                  <span>
                    Validation of{" "}
                    <span className="font-mono">{detail.applicationVersion}</span>
                  </span>
                  <Badge
                    variant="outline"
                    className={statusBadgeVariant(detail.status)}
                  >
                    {detail.status}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFeedbackOpen(true)}
                  >
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    Generate Replit Feedback
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleDelete}
                    disabled={deleteValidation.isPending}
                    aria-label="Delete validation record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label>Application Version</Label>
                  <Input value={detail.applicationVersion} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="releaseName">Release Name</Label>
                  <Input
                    id="releaseName"
                    value={header.releaseName}
                    placeholder="e.g. Initiative Workspace release"
                    onChange={(e) =>
                      setHeader((h) => ({ ...h, releaseName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validatorName">Validator Name</Label>
                  <Input
                    id="validatorName"
                    value={header.validatorName}
                    placeholder="Who is validating"
                    onChange={(e) =>
                      setHeader((h) => ({
                        ...h,
                        validatorName: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Validation Date</Label>
                  <Input value={formatDate(detail.validationDate)} disabled />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  value={header.summary}
                  placeholder="Short summary of this validation run."
                  rows={2}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, summary: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overallNotes">Overall Validation Notes</Label>
                <Textarea
                  id="overallNotes"
                  value={header.overallNotes}
                  placeholder="Overall observations, environment details, follow-ups."
                  rows={3}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, overallNotes: e.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveHeader}
                  disabled={updateValidation.isPending}
                >
                  {updateValidation.isPending ? "Saving..." : "Save Details"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {groupedItems.map((group) => {
              const passed = group.items.filter(
                (i) => i.result === "Pass",
              ).length;
              const failed = group.items.filter(
                (i) => i.result === "Fail",
              ).length;
              return (
                <div
                  key={group.featureArea}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                    <div className="font-semibold">{group.featureArea}</div>
                    <div className="text-xs text-muted-foreground">
                      {passed}/{group.items.length} passed
                      {failed > 0 && (
                        <span className="text-red-600 font-medium">
                          {" "}
                          · {failed} failed
                        </span>
                      )}
                    </div>
                  </div>
                  {group.items.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      pending={updateItem.isPending}
                      onUpdate={handleItemUpdate}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-primary" />
              Replit Feedback
            </DialogTitle>
            <DialogDescription>
              Copy this summary and paste it directly into Replit Agent or send
              it to your development team.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            readOnly
            value={feedbackText}
            className="flex-1 min-h-[320px] font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>
              Close
            </Button>
            <Button onClick={handleCopyFeedback}>
              <Copy className="mr-2 h-4 w-4" />
              Copy to Clipboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
