import { useRoute, Link, useLocation } from "wouter";
import { useGetInitiative, useGetSettings, useUpdateInitiative, useDeleteInitiative, getListInitiativesQueryKey, getGetDashboardSummaryQueryKey, getGetInitiativeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Activity, Target, AlertTriangle, ChevronRight, FileText, Briefcase, Calculator } from "lucide-react";
import type { Initiative } from "@workspace/api-client-react";

// Local helper to compose AI Opportunity Canvas strings.
// // TODO: OpenAI can be wired in here later to generate more sophisticated summaries.
function generateOpportunityCanvas(initiative: Initiative) {
  return {
    executiveSummary: `${initiative.title} is a ${initiative.category} initiative for the ${initiative.department} department led by ${initiative.submitterName}.`,
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

export default function InitiativeDetail() {
  const [, params] = useRoute("/initiatives/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: initiative, isLoading } = useGetInitiative(id, {
    query: { enabled: !!id, queryKey: getGetInitiativeQueryKey(id) }
  });
  
  const { data: settings } = useGetSettings();
  const updateInitiative = useUpdateInitiative();
  const deleteInitiative = useDeleteInitiative();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

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
        <p className="text-muted-foreground">The requested initiative does not exist or has been removed.</p>
        <Link href="/initiatives">
          <Button className="mt-4">Back to Initiatives</Button>
        </Link>
      </div>
    );
  }

  const handleStatusChange = (newStatus: string) => {
    updateInitiative.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInitiativeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Status Updated", description: `Initiative status changed to ${newStatus}.` });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this initiative?")) {
      deleteInitiative.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            toast({ title: "Initiative Deleted", description: "The initiative has been removed." });
            setLocation("/initiatives");
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to delete initiative.", variant: "destructive" });
          }
        }
      );
    }
  };

  const canvas = generateOpportunityCanvas(initiative);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-xl border shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline">{initiative.category}</Badge>
            <span className="text-sm text-muted-foreground">ID: #{initiative.id}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{initiative.title}</h1>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center"><Briefcase className="mr-1 h-4 w-4" /> {initiative.department}</span>
            <span>Submitted by {initiative.submitterName} on {format(new Date(initiative.createdAt), "MMM d, yyyy")}</span>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-3 w-full md:w-auto">
          <div className="flex items-center gap-3">
            <Select value={initiative.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-40 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settings.statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Link href={`/initiatives/${id}/score`}>
              <Button>
                <Calculator className="mr-2 h-4 w-4" /> Score
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Priority</div>
              <PriorityBadge priority={initiative.priority} />
            </div>
            <div className="text-right ml-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Score</div>
              <div className="text-xl font-bold font-mono">{initiative.score}<span className="text-sm text-muted-foreground">/100</span></div>
            </div>
            <Button variant="destructive" size="sm" className="ml-2" disabled={deleteInitiative.isPending} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center">
          <Target className="mr-2 h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">AI Opportunity Canvas</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-primary">Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium">{canvas.executiveSummary}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Problem</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.problem}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Current Process</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.currentProcess}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Desired Outcome</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.desiredOutcome}</p></CardContent>
          </Card>

          <Card className="md:col-span-2 bg-secondary/5 border-secondary/20">
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-secondary">AI Opportunity</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.aiOpportunity}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Expected Value</CardTitle></CardHeader>
            <CardContent><p className="text-sm font-medium">{canvas.expectedValue}</p></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Prototype Goal</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.prototypeGoal}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Success Metric</CardTitle></CardHeader>
            <CardContent><p className="text-sm font-medium">{canvas.successMetric}</p></CardContent>
          </Card>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-destructive">Risks & Complexity</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.risks}</p></CardContent>
          </Card>
          
          <Card className="col-span-1 md:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Recommended Next Step</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{canvas.recommendedNextStep}</p></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
