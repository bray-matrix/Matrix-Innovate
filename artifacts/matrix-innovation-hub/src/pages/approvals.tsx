import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListApprovals, useUpdateProjectApproval } from "@workspace/api-client-react";
import type { ApprovalQueueEntry } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckSquare, Clock } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { 
  getListApprovalsQueryKey, 
  getGetProjectQueryKey,
  getGetPortfolioQueryKey,
  getGetDashboardAttentionQueryKey
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

function timeSince(dateString: string) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

const STATUS_COLORS: Record<string, string> = {
  "Pending": "bg-amber-100 text-amber-700 border-amber-200",
  "Approved": "bg-green-100 text-green-700 border-green-200",
  "Rejected": "bg-red-100 text-red-700 border-red-200",
  "Cancelled": "bg-slate-100 text-slate-500 border-slate-200",
};

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { data: approvals, isLoading } = useListApprovals();
  const [statusFilter, setStatusFilter] = useState<string>("Pending");

  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean;
    approval: ApprovalQueueEntry | null;
    action: "Approved" | "Rejected";
    notes: string;
  }>({ open: false, approval: null, action: "Approved", notes: "" });

  const updateMutation = useUpdateProjectApproval({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(variables.id) });
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardAttentionQueryKey() });
        if (decisionDialog.open) {
          toast({ title: `Approval ${decisionDialog.action.toLowerCase()}` });
          setDecisionDialog(prev => ({ ...prev, open: false }));
        }
      },
      onError: () => toast({ title: "Failed to save decision", variant: "destructive" })
    }
  });

  const handleDecisionSubmit = () => {
    if (!decisionDialog.approval) return;
    if (decisionDialog.action === "Rejected" && !decisionDialog.notes.trim()) {
      toast({ title: "Rejection requires notes", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: decisionDialog.approval.projectId,
      approvalId: decisionDialog.approval.id,
      data: {
        status: decisionDialog.action,
        decisionNotes: decisionDialog.notes.trim() || null
      }
    });
  };

  const filteredApprovals = useMemo(() => {
    if (!approvals) return [];
    if (statusFilter === "All") return approvals;
    return approvals.filter(a => a.status === statusFilter);
  }, [approvals, statusFilter]);

  const columns = useMemo<ColumnDef<ApprovalQueueEntry>[]>(() => [
    {
      accessorKey: "projectName",
      header: "Project",
      size: 200,
      cell: ({ row }) => (
        <Link href={`/projects/${row.original.projectId}`} className="font-medium hover:underline text-primary">
          {row.original.projectName}
        </Link>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      size: 150,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.type}</span>,
    },
    {
      accessorKey: "title",
      header: "Request",
      size: 250,
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-sm">{row.original.title}</div>
          {row.original.description && (
            <div className="text-xs text-muted-foreground truncate max-w-[250px]">{row.original.description}</div>
          )}
        </div>
      )
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 100,
      cell: ({ row }) => (
        <Badge variant="outline" className={STATUS_COLORS[row.original.status] ?? ""}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "requestedBy",
      header: "Requested By",
      size: 120,
    },
    {
      accessorKey: "requestedAt",
      header: "Age",
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {timeSince(row.original.requestedAt)}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Action",
      size: 170,
      cell: ({ row }) => {
        if (row.original.status !== "Pending") {
          return <span className="text-xs text-muted-foreground">Decided</span>;
        }
        return (
          <div className="flex gap-1.5">
            <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => setDecisionDialog({ open: true, approval: row.original, action: "Approved", notes: "" })}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setDecisionDialog({ open: true, approval: row.original, action: "Rejected", notes: "" })}>
              Reject
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-7 px-2 text-xs" 
              onClick={() => {
                updateMutation.mutate({
                  id: row.original.projectId,
                  approvalId: row.original.id,
                  data: { status: "Cancelled" }
                });
                toast({ title: "Approval cancelled" });
              }}
            >
              Cancel
            </Button>
          </div>
        );
      }
    }
  ], []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CheckSquare className="h-8 w-8 text-primary" />
            Global Approvals
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Review and decide on project stage gates, scope changes, and sign-offs.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4 space-y-4">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="Pending">Pending</TabsTrigger>
            <TabsTrigger value="Approved">Approved</TabsTrigger>
            <TabsTrigger value="Rejected">Rejected</TabsTrigger>
            <TabsTrigger value="Cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="All">All Requests</TabsTrigger>
          </TabsList>
        </Tabs>

        <DataTable 
          columns={columns} 
          data={filteredApprovals}
        />
      </div>

      <Dialog open={decisionDialog.open} onOpenChange={(open) => !open && setDecisionDialog(p => ({...p, open: false}))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialog.action === "Approved" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.approval?.title} for {decisionDialog.approval?.projectName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Decision Notes {decisionDialog.action === "Rejected" && <span className="text-destructive">*</span>}</Label>
            <Textarea 
              className="mt-2"
              placeholder="Provide reason or context for this decision..."
              rows={3}
              value={decisionDialog.notes}
              onChange={(e) => setDecisionDialog(p => ({...p, notes: e.target.value}))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(p => ({...p, open: false}))}>Cancel</Button>
            <Button 
              variant={decisionDialog.action === "Approved" ? "default" : "destructive"} 
              onClick={handleDecisionSubmit}
              disabled={updateMutation.isPending}
            >
              {decisionDialog.action === "Approved" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
