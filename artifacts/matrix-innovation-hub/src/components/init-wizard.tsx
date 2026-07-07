import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetEnvironmentStatus,
  useInitializeEnvironment,
  useListEnvironmentHistory,
  getGetEnvironmentStatusQueryKey,
  getListEnvironmentHistoryQueryKey,
} from "@workspace/api-client-react";
import type { EnvironmentEvent } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  History,
  Loader2,
  Lock,
  PlayCircle,
  ShieldCheck,
  Wrench,
} from "lucide-react";

interface BusinessDataSelection {
  archiveSampleInitiatives: boolean;
  removeSampleInitiatives: boolean;
  clearValidationRecords: boolean;
  clearCalculationHistory: boolean;
  clearRecommendationHistory: boolean;
}

const EMPTY_SELECTION: BusinessDataSelection = {
  archiveSampleInitiatives: false,
  removeSampleInitiatives: false,
  clearValidationRecords: false,
  clearCalculationHistory: false,
  clearRecommendationHistory: false,
};

const BUSINESS_OPTIONS: {
  key: keyof BusinessDataSelection;
  label: string;
  hint?: string;
}[] = [
  {
    key: "archiveSampleInitiatives",
    label: "Archive sample initiatives",
    hint: "Snapshots initiatives (with versions and calculation history) to an archive, then removes them from the active pipeline.",
  },
  {
    key: "removeSampleInitiatives",
    label: "Remove sample initiatives",
    hint: "Permanently deletes initiatives without keeping an archive snapshot.",
  },
  { key: "clearValidationRecords", label: "Clear validation records" },
  { key: "clearCalculationHistory", label: "Clear calculation history" },
  {
    key: "clearRecommendationHistory",
    label: "Clear recommendation history",
    hint: "Recommendations are computed on demand; nothing is stored, so this is informational.",
  },
];

const PRESERVED_ITEMS = [
  "Preserve governance documents",
  "Preserve product backlog",
  "Preserve parking lot",
  "Preserve AI provider configuration",
  "Preserve application settings",
  "Preserve validation templates",
  "Preserve version history",
];

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function InitializeEnvironmentCard() {
  const queryClient = useQueryClient();
  const { data: status } = useGetEnvironmentStatus();
  const { data: history } = useListEnvironmentHistory();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"options" | "confirm" | "done">("options");
  const [selection, setSelection] =
    useState<BusinessDataSelection>(EMPTY_SELECTION);
  const [performedBy, setPerformedBy] = useState("");
  const [result, setResult] = useState<EnvironmentEvent | null>(null);

  const initMutation = useInitializeEnvironment({
    mutation: {
      onSuccess: (event) => {
        setResult(event);
        setStep("done");
        // Cleanup may have removed initiatives, validations, and history
        // across the app — refresh everything.
        queryClient.invalidateQueries();
        toast({ title: "Environment initialized" });
      },
      onError: (error) =>
        toast({
          title: "Initialization failed",
          description: `No changes were recorded. ${
            error instanceof Error && error.message
              ? error.message
              : "The server could not be reached — it may be restarting. Try again in a moment."
          }`,
          variant: "destructive",
        }),
    },
  });

  const openWizard = () => {
    setSelection(EMPTY_SELECTION);
    setPerformedBy("");
    setResult(null);
    setStep("options");
    setOpen(true);
  };

  const selectedOptions = BUSINESS_OPTIONS.filter((o) => selection[o.key]);

  const counts = status?.counts;

  const countHint = (key: keyof BusinessDataSelection): string | null => {
    if (!counts) return null;
    switch (key) {
      case "archiveSampleInitiatives":
      case "removeSampleInitiatives":
        return `${counts.initiatives} initiative(s) currently in the pipeline`;
      case "clearValidationRecords":
        return `${counts.validationRecords} validation record(s) stored`;
      case "clearCalculationHistory":
        return `${counts.calculationEvents} calculation event(s) stored`;
      default:
        return null;
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-[#002D72]" />
              Environment Initialization
            </CardTitle>
            <CardDescription>
              Prepare the Matrix Innovation Hub for production use by clearing
              sample business data while preserving system configuration.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {status &&
              (status.firstTimeSetupComplete ? (
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-700 border-green-200"
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  First-Time Setup Complete
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-700 border-amber-200"
                >
                  Setup Pending
                </Badge>
              ))}
            {status && (
              <Badge variant="outline" className="font-mono text-xs">
                {status.environment}
              </Badge>
            )}
            <Button onClick={openWizard}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Initialize Environment
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Environment History */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Environment History
          </div>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No initialization runs recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border p-3 text-sm space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {formatDateTime(event.createdAt)}
                    </span>
                    <Badge variant="secondary">{event.performedBy}</Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {event.environment}
                    </Badge>
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {event.actions.map((a) => (
                      <li key={a.action} className="flex gap-2">
                        <span className="font-medium text-foreground">
                          {a.label}:
                        </span>
                        <span>{a.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {step === "options" && (
            <>
              <DialogHeader>
                <DialogTitle>System Initialization Wizard</DialogTitle>
                <DialogDescription>
                  Select the cleanup actions to perform. System data is always
                  preserved.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="grid gap-2">
                  <Label htmlFor="init-user">Performed By</Label>
                  <Input
                    id="init-user"
                    value={performedBy}
                    onChange={(e) => setPerformedBy(e.target.value)}
                    placeholder="Administrator name"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Archive className="h-4 w-4 text-[#00A3E0]" />
                    Business Data
                  </div>
                  {BUSINESS_OPTIONS.map((opt) => (
                    <div key={opt.key} className="flex items-start gap-2">
                      <Checkbox
                        id={`init-${opt.key}`}
                        checked={selection[opt.key]}
                        onCheckedChange={(c) =>
                          setSelection((s) => ({ ...s, [opt.key]: c === true }))
                        }
                        className="mt-0.5"
                      />
                      <div className="grid gap-0.5">
                        <Label
                          htmlFor={`init-${opt.key}`}
                          className="font-normal"
                        >
                          {opt.label}
                        </Label>
                        {(opt.hint || countHint(opt.key)) && (
                          <p className="text-xs text-muted-foreground">
                            {[countHint(opt.key), opt.hint]
                              .filter(Boolean)
                              .join(" — ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    System Data (always preserved)
                  </div>
                  {PRESERVED_ITEMS.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Checkbox checked disabled />
                      <span>{item}</span>
                      <Lock className="h-3 w-3" />
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!performedBy.trim()) {
                      toast({
                        title: "Performed By is required",
                        variant: "destructive",
                      });
                      return;
                    }
                    setStep("confirm");
                  }}
                >
                  Review Summary
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Confirm Initialization
                </DialogTitle>
                <DialogDescription>
                  Review the summary below. Only the selected actions will be
                  executed. This cannot be undone.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="rounded-md border p-3 space-y-1.5">
                  <div className="font-semibold">Will be executed</div>
                  {selectedOptions.length === 0 ? (
                    <p className="text-muted-foreground">
                      No cleanup actions selected — the environment will only
                      be marked as initialized.
                    </p>
                  ) : (
                    <ul className="list-disc pl-5 space-y-0.5">
                      {selectedOptions.map((o) => (
                        <li key={o.key}>
                          {o.label}
                          {countHint(o.key) && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({countHint(o.key)})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-md border p-3 space-y-1.5">
                  <div className="font-semibold">Will be preserved</div>
                  <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                    {PRESERVED_ITEMS.map((item) => (
                      <li key={item}>{item.replace(/^Preserve /, "")}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-muted-foreground">
                  Performed by <span className="font-medium text-foreground">{performedBy.trim()}</span>{" "}
                  in the{" "}
                  <span className="font-medium text-foreground">
                    {status?.environment ?? "Development"}
                  </span>{" "}
                  environment. The run will be recorded in the Environment
                  History log and the First-Time Setup Complete flag will be
                  set.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("options")}>
                  Back
                </Button>
                <Button
                  variant="destructive"
                  disabled={initMutation.isPending}
                  onClick={() =>
                    initMutation.mutate({
                      data: {
                        performedBy: performedBy.trim(),
                        ...selection,
                      },
                    })
                  }
                >
                  {initMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-2 h-4 w-4" />
                  )}
                  Execute Initialization
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "done" && result && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Initialization Complete
                </DialogTitle>
                <DialogDescription>
                  Recorded in the Environment History log on{" "}
                  {formatDateTime(result.createdAt)}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 text-sm">
                {result.actions.map((a) => (
                  <div key={a.action} className="rounded-md border p-3">
                    <div className="font-medium">{a.label}</div>
                    <div className="text-muted-foreground">{a.detail}</div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
