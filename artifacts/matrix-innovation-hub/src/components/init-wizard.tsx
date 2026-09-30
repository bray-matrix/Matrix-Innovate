// v1.6.13: Environment Initialization (archive/remove sample initiatives, clear
// validation/calculation history) was retired from the production UI. Only the
// read-only Environment History is retained here.
import { useListEnvironmentHistory, getListEnvironmentHistoryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function EnvironmentHistoryCard() {
  const { data: history, isLoading, isError, refetch, isFetching } = useListEnvironmentHistory({
    query: { queryKey: getListEnvironmentHistoryQueryKey() },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Environment History
          </CardTitle>
          <Badge variant="outline">Read-only</Badge>
        </div>
        <CardDescription>
          Historical record of past environment initialization runs. Initialization is a setup-only
          utility and is no longer available from Admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm">
            <span className="text-destructive">Environment history could not be loaded.</span>
            <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>Retry</Button>
          </div>
        ) : !history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No initialization runs recorded.</p>
        ) : (
          <ul className="space-y-2">
            {history.map(event => (
              <li key={event.id} className="rounded-md border p-3 text-sm space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatDateTime(event.createdAt)}</span>
                  <Badge variant="secondary">{event.performedBy}</Badge>
                  <Badge variant="outline" className="font-mono text-xs">{event.environment}</Badge>
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {event.actions.map(a => (
                    <li key={a.action} className="flex gap-2">
                      <span className="font-medium text-foreground">{a.label}:</span>
                      <span>{a.detail}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
