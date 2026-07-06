import { useListInitiatives, useUpdateInitiative, useGetSettings, getListInitiativesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { PriorityBadge } from "@/components/badges";

export default function KanbanBoard() {
  const { data: initiatives, isLoading } = useListInitiatives();
  const { data: settings } = useGetSettings();
  const updateInitiative = useUpdateInitiative();
  const queryClient = useQueryClient();

  if (isLoading || !settings) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="w-80 shrink-0 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const handleStatusChange = (id: number, newStatus: string) => {
    updateInitiative.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
          toast({ title: "Status Updated", description: "Initiative status has been updated." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
        }
      }
    );
  };

  const columns = settings.statuses;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Kanban Board</h2>
        <p className="text-muted-foreground">Visual pipeline of all active initiatives.</p>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-8 snap-x min-h-[60vh]">
        {columns.map(status => {
          const columnInitiatives = initiatives?.filter(i => i.status === status) || [];
          
          return (
            <div key={status} className="w-80 shrink-0 snap-start flex flex-col bg-muted/30 rounded-xl p-4">
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="font-semibold text-sm uppercase tracking-wider">{status}</h3>
                <Badge variant="secondary">{columnInitiatives.length}</Badge>
              </div>
              
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                {columnInitiatives.map(init => (
                  <Card key={init.id} className="shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex justify-between items-start gap-2">
                        <PriorityBadge priority={init.priority} />
                        <span className="text-xs font-mono font-medium">{init.score} pts</span>
                      </div>
                      <Link href={`/initiatives/${init.id}`}>
                        <CardTitle className="text-base mt-2 hover:text-primary transition-colors cursor-pointer line-clamp-2">
                          {init.title}
                        </CardTitle>
                      </Link>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <p className="text-xs text-muted-foreground mb-3">{init.department}</p>
                      {init.businessOwner && (
                        <p className="text-xs text-muted-foreground mb-3 truncate">
                          Owner: <span className="font-medium text-foreground">{init.businessOwner}</span>
                        </p>
                      )}
                      
                      <div className="mt-4">
                        <Select 
                          value={init.status} 
                          onValueChange={(val) => handleStatusChange(init.id, val)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-muted/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {settings.statuses.map(s => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {columnInitiatives.length === 0 && (
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-muted rounded-lg h-24">
                    <span className="text-xs text-muted-foreground font-medium">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
