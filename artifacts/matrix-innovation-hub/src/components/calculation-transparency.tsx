import {
  useListCalculationEvents,
  getListCalculationEventsQueryKey,
} from "@workspace/api-client-react";
import type {
  RecalculationResult,
  CalculationEvent,
  ScoringComponentChange,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/badges";
import { format } from "date-fns";
import { ArrowRight, History, UserRound } from "lucide-react";
import { RULE_ENGINE_SOURCE_LABEL } from "@/lib/aiSource";

function formatEventTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy p");
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge variant="secondary" className="font-mono">
        ±0
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`font-mono ${
        delta > 0
          ? "border-green-300 bg-green-50 text-green-800"
          : "border-red-300 bg-red-50 text-red-700"
      }`}
    >
      {delta > 0 ? `+${delta}` : delta}
    </Badge>
  );
}

function ComponentChangeRow({ change }: { change: ScoringComponentChange }) {
  const delta = change.next - change.previous;
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{change.label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-sm text-muted-foreground">
            {change.previous}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-semibold">{change.next}</span>
          <DeltaBadge delta={delta} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{change.reason}</p>
    </div>
  );
}

export function RecalculationResultDialog({
  result,
  onOpenChange,
}: {
  result: RecalculationResult | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recalculation Result</DialogTitle>
          <DialogDescription>
            What changed in this recalculation and why.
            {result?.sourceLabel && (
              <span className="mt-1 block text-xs">
                Source: {result.sourceLabel}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Innovation Score
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-lg text-muted-foreground">
                    {result.previousScore}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-lg font-bold">
                    {result.newScore}
                  </span>
                  <DeltaBadge delta={result.netScoreChange} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Priority
                </div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  {result.previousPriority !== result.newPriority && (
                    <>
                      <PriorityBadge priority={result.previousPriority} />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </>
                  )}
                  <PriorityBadge priority={result.newPriority} />
                </div>
              </div>
            </div>

            {result.changes.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Changed Components
                </div>
                {result.changes.map((change) => (
                  <ComponentChangeRow key={change.component} change={change} />
                ))}
              </div>
            )}

            {result.unchangedComponents.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Unchanged Components
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.unchangedComponents.map((label) => (
                    <Badge key={label} variant="secondary" className="font-normal">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CalculationEventCard({ event }: { event: CalculationEvent }) {
  const delta = event.newScore - event.previousScore;
  const changed = event.changes.length > 0 || delta !== 0;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{formatEventTime(event.createdAt)}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            {event.changedBy}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">
            {event.previousScore}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-semibold">
            {event.newScore}
          </span>
          <DeltaBadge delta={delta} />
          {event.previousPriority !== event.newPriority && (
            <PriorityBadge priority={event.newPriority} />
          )}
        </div>
      </div>
      {changed ? (
        <div className="mt-3 space-y-2">
          {event.changes.length > 0 ? (
            event.changes.map((change) => (
              <ComponentChangeRow key={change.component} change={change} />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              The stored total was out of sync with its scoring components and
              was recomputed.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No changes detected. Innovation Score remained unchanged.
        </p>
      )}
    </div>
  );
}

export function CalculationHistory({ initiativeId }: { initiativeId: number }) {
  const { data, isLoading, isError } = useListCalculationEvents(initiativeId, {
    query: {
      enabled: !!initiativeId,
      queryKey: getListCalculationEventsQueryKey(initiativeId),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array(3)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Unable to load calculation history. Refresh the page to try again.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        <History className="mx-auto mb-2 h-6 w-6 opacity-50" />
        No calculations recorded yet. Use the Recalculate button to run the
        scoring model — every run is recorded here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Component explanations are generated by the active intelligence
        provider — currently {RULE_ENGINE_SOURCE_LABEL} (see Admin &gt; AI
        Provider Configuration).
      </p>
      {data.map((event) => (
        <CalculationEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
