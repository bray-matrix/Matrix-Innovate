import { useState, useMemo } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useGetInitiative,
  useGetInitiativeRecommendations,
  useUpdateProject,
  useDeleteProject,
  useListProjectMilestones,
  useCreateProjectMilestone,
  useUpdateProjectMilestone,
  useDeleteProjectMilestone,
  useListProjectRisks,
  useCreateProjectRisk,
  useUpdateProjectRisk,
  useDeleteProjectRisk,
  useListProjectApprovals,
  useCreateProjectApproval,
  useUpdateProjectApproval,
  useListReadinessAssessments,
  useCreateReadinessAssessment,
  useCreateReadinessItem,
  useUpdateReadinessItem,
  useDeleteReadinessItem,
  useListOrganizations,
  useListClients,
  useListPrograms,
  useListProjectResourceAssignments,
  useCreateProjectResourceAssignment,
  useUpdateProjectResourceAssignment,
  useDeleteProjectResourceAssignment,
  useListResources,
  useGetSettings,
  getGetProjectQueryKey,
  getGetInitiativeQueryKey,
  getGetInitiativeRecommendationsQueryKey,
  getListProjectsQueryKey,
  getListProjectMilestonesQueryKey,
  getListProjectRisksQueryKey,
  getListProjectApprovalsQueryKey,
  getListReadinessAssessmentsQueryKey,
  getListApprovalsQueryKey,
  getGetPortfolioQueryKey,
  getGetDashboardAttentionQueryKey,
  getGetExecutionSummaryQueryKey,
  getListProjectResourceAssignmentsQueryKey,
  getListResourcesQueryKey
} from "@workspace/api-client-react";
import type { 
  ProjectMilestone, 
  ProjectRisk,
  ProjectApproval,
  ReadinessAssessment,
  ReadinessItem,
  ProjectMilestoneCreate, 
  ProjectRiskCreate,
  ProjectApprovalCreate,
  ReadinessAssessmentCreate,
  ReadinessItemCreate,
  ResourceAssignment
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Briefcase, Users, ChevronLeft, Trash2, PlusCircle, Pencil, Flag, Link2, AlertCircle, AlertTriangle, ShieldCheck, Target, CheckSquare, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/badges";
import { ProjectLinkedWork } from "@/components/project-linked-work";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

const STAGES = ["Planning", "Ready", "In Progress", "On Hold", "Completed", "Cancelled"];
const STATES = ["Active", "On Hold", "Closed"];
const HEALTHS = ["On Track", "At Risk", "Off Track", "Unknown"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const MILESTONE_STATUSES = ["Not Started", "In Progress", "Completed", "Missed"];
const RISK_SEVERITIES = ["Low", "Medium", "High", "Critical"];
const RISK_PROBABILITIES = ["Low", "Medium", "High"];
const RISK_IMPACTS = ["Low", "Medium", "High"];
const RISK_STATUSES = ["Open", "Mitigating", "Mitigated", "Closed"];
const APPROVAL_TYPES = ["Go-Live Sign-Off", "Scope Change", "Stage Gate", "Hold", "Resource Request", "Other"];
const READINESS_CATEGORIES = ["Requirements", "Development", "Testing", "Data", "Operations", "Client", "Security / Compliance", "Production", "Training / Documentation"];
const READINESS_ITEM_STATUSES = ["Not Tested", "Pass", "Fail", "Not Applicable"];

const RISK_SEVERITY_COLORS: Record<string, string> = {
  "Critical": "bg-red-100 text-red-700 border-red-200",
  "High": "bg-orange-100 text-orange-700 border-orange-200",
  "Medium": "bg-amber-100 text-amber-700 border-amber-200",
  "Low": "bg-slate-100 text-slate-600 border-slate-200",
};

const READINESS_COLORS: Record<string, string> = {
  "Ready": "bg-green-100 text-green-700 border-green-200",
  "At Risk": "bg-amber-100 text-amber-700 border-amber-200",
  "Not Ready": "bg-red-100 text-red-700 border-red-200",
  "Not Started": "bg-slate-100 text-slate-600 border-slate-200",
};

function EmptyTab({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-8 text-center">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      <Button size="sm" variant="outline" onClick={onAction}>{action}</Button>
    </div>
  );
}

export default function ProjectDetailPage() {
  const [, params] = useRoute("/projects/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useGetProject(id, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) }
  });
  const initiativeId = project?.initiativeId ?? 0;
  const { data: sourceInitiative } = useGetInitiative(initiativeId, {
    query: { enabled: !!initiativeId, queryKey: getGetInitiativeQueryKey(initiativeId) }
  });
  const { data: planningSuggestions } = useGetInitiativeRecommendations(initiativeId, {
    query: { enabled: !!initiativeId, queryKey: getGetInitiativeRecommendationsQueryKey(initiativeId) }
  });
  
  const { data: milestones } = useListProjectMilestones(id, {
    query: { enabled: !!id, queryKey: getListProjectMilestonesQueryKey(id) }
  });

  const { data: risks } = useListProjectRisks(id, {
    query: { enabled: !!id, queryKey: getListProjectRisksQueryKey(id) }
  });

  const { data: approvals } = useListProjectApprovals(id, {
    query: { enabled: !!id, queryKey: getListProjectApprovalsQueryKey(id) }
  });

  const { data: resourcesData } = useListProjectResourceAssignments(id, { query: { enabled: !!id, queryKey: getListProjectResourceAssignmentsQueryKey(id) } });
  const { data: allResources } = useListResources();
  const { data: settings } = useGetSettings();

  const { data: assessments } = useListReadinessAssessments(id, {
    query: { enabled: !!id, queryKey: getListReadinessAssessmentsQueryKey(id) }
  });

  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  const { data: programs } = useListPrograms();

  const invalidateGlobal = () => {
    queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardAttentionQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetExecutionSummaryQueryKey() });
  };

  const updateMutation = useUpdateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Project updated" });
        setHealthReasonDialog(false);
      },
      onError: () => toast({ title: "Failed to update project", variant: "destructive" }),
    }
  });

  const deleteMutation = useDeleteProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Project deleted" });
        setLocation("/projects");
      },
      onError: () => toast({ title: "Failed to delete project", variant: "destructive" }),
    }
  });

  const handleDeleteProject = () => {
    if (window.confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  // Health Override
  const [healthReasonDialog, setHealthReasonDialog] = useState(false);
  const [pendingHealth, setPendingHealth] = useState("");
  const [healthReason, setHealthReason] = useState("");

  const handleHealthChange = (newHealth: string) => {
    if (newHealth === "Unknown") {
      updateMutation.mutate({ id, data: { health: "Unknown", healthOverrideReason: null } });
    } else {
      setPendingHealth(newHealth);
      setHealthReason("");
      setHealthReasonDialog(true);
    }
  };

  const submitHealthOverride = () => {
    updateMutation.mutate({ id, data: { health: pendingHealth, healthOverrideReason: healthReason } });
  };

  // Milestone State
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [msForm, setMsForm] = useState<{name: string, description: string, owner: string, dueDate: string, status: string, stageGate: boolean, sequence: string}>({
    name: "", description: "", owner: "", dueDate: "", status: "Not Started", stageGate: false, sequence: "1"
  });

  const createMsMutation = useCreateProjectMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Milestone created" });
        setMilestoneOpen(false);
      }
    }
  });

  const updateMsMutation = useUpdateProjectMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Milestone updated" });
        setMilestoneOpen(false);
      }
    }
  });

  const deleteMsMutation = useDeleteProjectMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Milestone deleted" });
        setMilestoneOpen(false);
      }
    }
  });

  const submitMilestone = () => {
    if (!msForm.name.trim()) return;
    const data = {
      name: msForm.name.trim(), description: msForm.description, owner: msForm.owner,
      dueDate: msForm.dueDate || null, status: msForm.status, stageGate: msForm.stageGate,
      sequence: parseInt(msForm.sequence, 10) || 1, projectId: id
    };
    if (editingMilestone) {
      updateMsMutation.mutate({ id, milestoneId: editingMilestone.id, data });
    } else {
      (createMsMutation.mutate as any)({ id, data });
    }
  };

  const openMilestoneDialog = (ms: ProjectMilestone | null) => {
    setEditingMilestone(ms);
    if (ms) {
      setMsForm({
        name: ms.name, description: ms.description, owner: ms.owner,
        dueDate: toDateInput(ms.dueDate), status: ms.status, stageGate: ms.stageGate, sequence: String(ms.sequence)
      });
    } else {
      setMsForm({ name: "", description: "", owner: "", dueDate: "", status: "Not Started", stageGate: false, sequence: String((milestones?.length || 0) + 1) });
    }
    setMilestoneOpen(true);
  };

  // Risk State
  const [riskOpen, setRiskOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null);
  const [riskForm, setRiskForm] = useState<{title: string, description: string, severity: string, probability: string, impact: string, status: string, owner: string, mitigationPlan: string, dueDate: string}>({
    title: "", description: "", severity: "Medium", probability: "Medium", impact: "Medium", status: "Open", owner: "", mitigationPlan: "", dueDate: ""
  });

  const createRiskMutation = useCreateProjectRisk({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectRisksQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Risk created" });
        setRiskOpen(false);
      }
    }
  });

  const updateRiskMutation = useUpdateProjectRisk({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectRisksQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Risk updated" });
        setRiskOpen(false);
      }
    }
  });

  const deleteRiskMutation = useDeleteProjectRisk({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectRisksQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Risk deleted" });
        setRiskOpen(false);
      }
    }
  });

  const submitRisk = () => {
    if (!riskForm.title.trim()) return;
    const data = { ...riskForm, projectId: id, dueDate: riskForm.dueDate || null };
    if (editingRisk) {
      updateRiskMutation.mutate({ id, riskId: editingRisk.id, data });
    } else {
      (createRiskMutation.mutate as any)({ id, data });
    }
  };

  const openRiskDialog = (r: ProjectRisk | null) => {
    setEditingRisk(r);
    if (r) {
      setRiskForm({
        title: r.title, description: r.description, severity: r.severity, probability: r.probability, impact: r.impact,
        status: r.status, owner: r.owner, mitigationPlan: r.mitigationPlan, dueDate: toDateInput(r.dueDate)
      });
    } else {
      setRiskForm({ title: "", description: "", severity: "Medium", probability: "Medium", impact: "Medium", status: "Open", owner: "", mitigationPlan: "", dueDate: "" });
    }
    setRiskOpen(true);
  };

  // Approval State
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalForm, setApprovalForm] = useState<{type: string, title: string, description: string, requestedBy: string, approver: string}>({
    type: "Go-Live Sign-Off", title: "", description: "", requestedBy: "", approver: ""
  });

  const createApprovalMutation = useCreateProjectApproval({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectApprovalsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
        invalidateGlobal();
        toast({ title: "Approval requested" });
        setApprovalOpen(false);
      }
    }
  });

  const updateApprovalMutation = useUpdateProjectApproval({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectApprovalsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
        invalidateGlobal();
        toast({ title: "Approval updated" });
      }
    }
  });

  const submitApproval = () => {
    if (!approvalForm.title.trim()) return;
    const data = { ...approvalForm, projectId: id };
    (createApprovalMutation.mutate as any)({ id, data });
  };

  // Readiness State
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessForm, setReadinessForm] = useState<{name: string, targetDate: string, seedStandardItems: boolean}>({
    name: "Go-Live Assessment", targetDate: "", seedStandardItems: true
  });

  const createReadinessMutation = useCreateReadinessAssessment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReadinessAssessmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        toast({ title: "Assessment created" });
        setReadinessOpen(false);
      }
    }
  });

  const submitReadiness = () => {
    if (!readinessForm.name.trim()) return;
    const data = { name: readinessForm.name, targetDate: readinessForm.targetDate || null, seedStandardItems: readinessForm.seedStandardItems, projectId: id };
    (createReadinessMutation.mutate as any)({ id, data });
  };

  const updateReadinessItemMutation = useUpdateReadinessItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReadinessAssessmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
      }
    }
  });

  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{item: ReadinessItem, assessmentId: number} | null>(null);
  const [itemForm, setItemForm] = useState<{category: string, requirement: string, owner: string, status: string, required: boolean}>({
    category: "Requirements", requirement: "", owner: "", status: "Not Tested", required: true
  });

  // Resource Assignment State
  const [resourceOpen, setResourceOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ResourceAssignment | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<"named" | "demand">("named");
  const [assignmentForm, setAssignmentForm] = useState<{resourceId: string, department: string, roleDescription: string, allocationPercent: string, plannedHours: string, startDate: string, endDate: string, status: string}>({
    resourceId: "", department: "", roleDescription: "", allocationPercent: "100", plannedHours: "", startDate: "", endDate: "", status: "Planned"
  });

  const createItemMutation = useCreateReadinessItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReadinessAssessmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        setItemOpen(false);
      }
    }
  });

  const deleteItemMutation = useDeleteReadinessItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReadinessAssessmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        invalidateGlobal();
        setItemOpen(false);
      }
    }
  });

  const createAssignmentMutation = useCreateProjectResourceAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectResourceAssignmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        invalidateGlobal();
        setResourceOpen(false);
        toast({ title: "Resource assigned" });
      }
    }
  });

  const updateAssignmentMutation = useUpdateProjectResourceAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectResourceAssignmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        invalidateGlobal();
        setResourceOpen(false);
        toast({ title: "Assignment updated" });
      }
    }
  });

  const deleteAssignmentMutation = useDeleteProjectResourceAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectResourceAssignmentsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        invalidateGlobal();
        toast({ title: "Assignment removed" });
      }
    }
  });

  const submitAssignment = () => {
    const data = {
      resourceId: assignmentMode === "named" && assignmentForm.resourceId ? parseInt(assignmentForm.resourceId) : null,
      department: assignmentMode === "demand" ? assignmentForm.department : null,
      roleDescription: assignmentForm.roleDescription || null,
      allocationPercent: parseInt(assignmentForm.allocationPercent) || null,
      plannedHours: assignmentForm.plannedHours ? parseInt(assignmentForm.plannedHours) : null,
      startDate: assignmentForm.startDate || null,
      endDate: assignmentForm.endDate || null,
      status: assignmentForm.status as any
    };

    if (editingAssignment) {
      updateAssignmentMutation.mutate({ id, assignmentId: editingAssignment.id, data });
    } else {
      createAssignmentMutation.mutate({ id, data });
    }
  };

  const submitItem = () => {
    if (!itemForm.requirement.trim() || !editingItem?.assessmentId) return;
    const data = { ...itemForm };
    if (editingItem.item.id) {
      updateReadinessItemMutation.mutate({ id, assessmentId: editingItem.assessmentId, itemId: editingItem.item.id, data });
    } else {
      (createItemMutation.mutate as any)({ id, assessmentId: editingItem.assessmentId, data });
    }
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!project) return <div>Project not found.</div>;

  const contextParts = [];
  if (project.organizationId) contextParts.push(organizations?.find(o => o.id === project.organizationId)?.name || "Org");
  if (project.clientId) contextParts.push(clients?.find(c => c.id === project.clientId)?.name || "Client");
  if (project.programId) contextParts.push(programs?.find(p => p.id === project.programId)?.name || "Program");

  const sortedMilestones = (milestones ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const sortedApprovals = (approvals ?? []).slice().sort((a, b) => (a.status === "Pending" ? -1 : 1));

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">{project.projectType}</Badge>
            <span className="text-xs text-muted-foreground font-mono">PRJ-{String(project.id).padStart(4, "0")}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {project.name}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="font-medium">Context: {contextParts.length ? contextParts.join(" / ") : "Internal"}</span>
            {project.initiativeId && (
              <Link href={`/initiatives/${project.initiativeId}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                <Link2 className="h-4 w-4" />
                From Initiative INI-{String(project.initiativeId).padStart(4,"0")}: {project.initiativeTitle || sourceInitiative?.title}
              </Link>
            )}
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteProject}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="milestones">Milestones</TabsTrigger>
              <TabsTrigger value="risks">Risks {risks?.filter(r => r.status === "Open" && (r.severity === "Critical" || r.severity === "High")).length ? <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-red-500"></span> : null}</TabsTrigger>
              <TabsTrigger value="approvals">Approvals {approvals?.filter(a => a.status === "Pending").length ? <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-amber-500"></span> : null}</TabsTrigger>
              <TabsTrigger value="golive">Go-Live Readiness</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
              <TabsTrigger value="linked-work">Linked Work</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <div className="text-sm mt-1 whitespace-pre-wrap">{project.description || "—"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Primary Owner</Label>
                      <div className="text-sm mt-1 font-medium">{project.primaryOwner || "—"}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Supporting Owners</Label>
                      <div className="text-sm mt-1">{project.supportingOwners || "—"}</div>
                    </div>
                  </div>
                  {sourceInitiative && (
                    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="font-semibold">Initiative planning context</Label>
                        <Badge variant="outline">Source: INI-{String(sourceInitiative.id).padStart(4, "0")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Source information for planning; not approved execution records.</p>
                      {sourceInitiative.desiredOutcome && <div><Label className="text-xs text-muted-foreground">Desired outcome</Label><p className="text-sm whitespace-pre-wrap">{sourceInitiative.desiredOutcome}</p></div>}
                      {sourceInitiative.successMetric && <div><Label className="text-xs text-muted-foreground">Success measures</Label><p className="text-sm whitespace-pre-wrap">{sourceInitiative.successMetric}</p></div>}
                      {sourceInitiative.currentProcess && <div><Label className="text-xs text-muted-foreground">Current process</Label><p className="text-sm whitespace-pre-wrap">{sourceInitiative.currentProcess}</p></div>}
                      {sourceInitiative.complianceRisk && <p className="text-sm">Compliance consideration: {sourceInitiative.complianceRisk} (review before adding a project risk).</p>}
                      {sourceInitiative.prototypeGoal && !/^(n\/a|none|not applicable|not specified|to be determined|tbd)$/i.test(sourceInitiative.prototypeGoal.trim()) && <div><Label className="text-xs text-muted-foreground">Proposed prototype scope (not committed)</Label><p className="text-sm whitespace-pre-wrap">{sourceInitiative.prototypeGoal}</p></div>}
                      {planningSuggestions && (
                        <div className="space-y-2 border-t pt-3">
                          <p className="text-xs font-medium">Planning suggestions · {planningSuggestions.sourceLabel} · Not approved execution records</p>
                          {!!planningSuggestions.risks.length && <div><Label className="text-xs text-muted-foreground">Potential risks to assess</Label><ul className="list-disc pl-5 text-sm">{planningSuggestions.risks.map(risk => <li key={risk}>{risk}</li>)}</ul></div>}
                          {!!planningSuggestions.teamRoles.length && <div><Label className="text-xs text-muted-foreground">Possible roles to consider (not assigned resources)</Label><p className="text-sm">{planningSuggestions.teamRoles.join(", ")}</p></div>}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="milestones">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Milestones</CardTitle>
                    <CardDescription>Track project phases and stage gates.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openMilestoneDialog(null)}>
                    <PlusCircle className="h-4 w-4 mr-2" /> Add Milestone
                  </Button>
                </CardHeader>
                <CardContent>
                  {sortedMilestones.length === 0 ? (
                    <EmptyTab title="No milestones have been added yet" description="Add delivery checkpoints, dates and stage gates when the plan is agreed." action="Add Milestone" onAction={() => openMilestoneDialog(null)} />
                  ) : (
                    <div className="space-y-4">
                      {sortedMilestones.map((ms) => (
                        <div key={ms.id} className="flex items-start justify-between p-4 border rounded-md relative hover:bg-muted/30 transition-colors group">
                          {ms.stageGate && (
                            <div className="absolute -left-1.5 -top-1.5 bg-primary text-primary-foreground p-1 rounded-full shadow-sm" title="Stage Gate">
                              <Flag className="h-3 w-3" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 rounded">#{ms.sequence}</span>
                              <span className="font-medium text-sm">{ms.name}</span>
                              <Badge variant="outline" className={ms.status === "Completed" ? "bg-green-100 text-green-700 border-green-200" : ""}>{ms.status}</Badge>
                            </div>
                            {ms.description && <div className="text-xs text-muted-foreground mt-1">{ms.description}</div>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              {ms.owner && <span>Owner: {ms.owner}</span>}
                              {ms.dueDate && <span>Due: {formatDate(ms.dueDate)}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => openMilestoneDialog(ms)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="risks">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Project Risks</CardTitle>
                    <CardDescription>Identify and mitigate threats to delivery.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openRiskDialog(null)}>
                    <AlertTriangle className="h-4 w-4 mr-2" /> Add Risk
                  </Button>
                </CardHeader>
                <CardContent>
                  {(!risks || risks.length === 0) ? (
                    <EmptyTab title="No project risks have been logged yet" description="Review potential concerns from the initiative, then log only risks confirmed for this project." action="Add Risk" onAction={() => openRiskDialog(null)} />
                  ) : (
                    <div className="space-y-4">
                      {risks.map((r) => (
                        <div key={r.id} className="p-4 border rounded-md relative hover:bg-muted/30 transition-colors group">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{r.title}</span>
                                <Badge variant="outline" className={RISK_SEVERITY_COLORS[r.severity] ?? ""}>{r.severity} Severity</Badge>
                                <Badge variant="secondary">{r.status}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                <div>
                                  <div className="text-[10px] uppercase text-muted-foreground">Probability</div>
                                  <div className="text-xs font-medium">{r.probability}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase text-muted-foreground">Impact</div>
                                  <div className="text-xs font-medium">{r.impact}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase text-muted-foreground">Owner</div>
                                  <div className="text-xs font-medium">{r.owner || "—"}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase text-muted-foreground">Due Date</div>
                                  <div className="text-xs font-medium">{formatDate(r.dueDate)}</div>
                                </div>
                              </div>
                              
                              {r.mitigationPlan && (
                                <div className="mt-4 bg-muted/50 p-2 rounded text-xs border">
                                  <div className="font-medium mb-1">Mitigation Plan</div>
                                  <div className="text-muted-foreground">{r.mitigationPlan}</div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {r.status !== "Closed" && (
                                <Button variant="outline" size="sm" className="h-8" onClick={() => updateRiskMutation.mutate({id, riskId: r.id, data: {status: "Closed"}})}>
                                  Close
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => openRiskDialog(r)}>
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="approvals">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Approvals</CardTitle>
                    <CardDescription>Manage formal requests for sign-off or changes.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setApprovalOpen(true)}>
                    <CheckSquare className="h-4 w-4 mr-2" /> Request Approval
                  </Button>
                </CardHeader>
                <CardContent>
                  {sortedApprovals.length === 0 ? (
                    <EmptyTab title="No approvals have been requested yet" description="Request a stage-gate, change or go-live decision when sign-off is needed." action="Request Approval" onAction={() => setApprovalOpen(true)} />
                  ) : (
                    <div className="space-y-4">
                      {sortedApprovals.map((a) => (
                        <div key={a.id} className="flex flex-col md:flex-row items-start justify-between p-4 border rounded-md relative hover:bg-muted/30 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{a.type}</Badge>
                              <span className="font-medium text-sm">{a.title}</span>
                              <Badge variant={a.status === "Pending" ? "default" : a.status === "Approved" ? "outline" : "secondary"} className={a.status === "Approved" ? "bg-green-100 text-green-700 border-green-200" : a.status === "Rejected" ? "bg-red-100 text-red-700" : ""}>
                                {a.status}
                              </Badge>
                            </div>
                            {a.description && <div className="text-xs text-muted-foreground mt-1">{a.description}</div>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              {a.requestedBy && <span>Requested By: {a.requestedBy}</span>}
                              {a.approver && <span>Approver: {a.approver}</span>}
                              <span>Age: {formatDate(a.requestedAt)}</span>
                            </div>
                            
                            {a.status !== "Pending" && a.decisionNotes && (
                              <div className="mt-3 bg-muted/50 p-2 rounded text-xs border">
                                <div className="font-medium mb-1 flex items-center justify-between">
                                  <span>Decision Notes</span>
                                  {a.decidedAt && <span>{formatDate(a.decidedAt)}</span>}
                                </div>
                                <div className="text-muted-foreground">{a.decisionNotes}</div>
                              </div>
                            )}
                          </div>
                          
                          {a.status === "Pending" && (
                            <div className="mt-4 md:mt-0 flex items-center gap-2 md:ml-4 shrink-0">
                               <Button variant="outline" size="sm" onClick={() => updateApprovalMutation.mutate({id, approvalId: a.id, data: {status: "Cancelled"}})}>
                                Cancel
                               </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="golive">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Go-Live Readiness</CardTitle>
                    <CardDescription>Assess operational readiness against standard checklists.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setReadinessOpen(true)}>
                    <Target className="h-4 w-4 mr-2" /> New Assessment
                  </Button>
                </CardHeader>
                <CardContent>
                  {(!assessments || assessments.length === 0) ? (
                    <EmptyTab title="No readiness assessment has been started yet" description="Create a checklist when you are ready to evaluate requirements, testing and operational go-live." action="New Assessment" onAction={() => setReadinessOpen(true)} />
                  ) : (
                    <div className="space-y-8">
                      {assessments.map((assessment) => {
                        const items = assessment.items || [];
                        const categories = Array.from(new Set(items.map(i => i.category)));

                        return (
                          <div key={assessment.id} className="border rounded-lg overflow-hidden">
                            <div className="bg-muted p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                              <div>
                                <h3 className="font-bold text-lg">{assessment.name}</h3>
                                {assessment.targetDate && <p className="text-sm text-muted-foreground">Target Date: {formatDate(assessment.targetDate)}</p>}
                              </div>
                              <div className="flex items-center gap-4">
                                <Badge className={READINESS_COLORS[assessment.readinessStatus] ?? ""}>{assessment.readinessStatus}</Badge>
                                <Button size="sm" variant="outline" onClick={() => {
                                  setItemForm({category: "Requirements", requirement: "", owner: "", status: "Not Tested", required: true});
                                  setEditingItem({item: {} as ReadinessItem, assessmentId: assessment.id});
                                  setItemOpen(true);
                                }}>
                                  <PlusCircle className="h-4 w-4 mr-2" /> Add Item
                                </Button>
                              </div>
                            </div>
                            
                            <div className="p-4 space-y-6">
                              {categories.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center">No checklist items.</p>
                              ) : (
                                categories.map(cat => (
                                  <div key={cat} className="space-y-2">
                                    <h4 className="font-medium text-sm text-foreground/80 border-b pb-1">{cat}</h4>
                                    <div className="space-y-2">
                                      {items.filter(i => i.category === cat).map(i => (
                                        <div key={i.id} className="flex flex-col md:flex-row gap-4 items-start md:items-center text-sm p-2 hover:bg-muted/30 rounded border border-transparent hover:border-border transition-colors group">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              {i.required && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded uppercase tracking-wider font-semibold">Req</span>}
                                              <span className="font-medium">{i.requirement}</span>
                                            </div>
                                            {i.notes && <div className="text-xs text-muted-foreground mt-1 truncate">{i.notes}</div>}
                                          </div>
                                          <div className="flex items-center gap-4 w-full md:w-auto shrink-0">
                                            <span className="text-xs text-muted-foreground w-24 truncate">{i.owner || "Unassigned"}</span>
                                            <Select 
                                              value={i.status} 
                                              onValueChange={(v) => updateReadinessItemMutation.mutate({id, assessmentId: assessment.id, itemId: i.id, data: {status: v}})}
                                            >
                                              <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                {READINESS_ITEM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                              </SelectContent>
                                            </Select>
                                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8" onClick={() => {
                                              setItemForm({category: i.category, requirement: i.requirement, owner: i.owner, status: i.status, required: i.required});
                                              setEditingItem({item: i, assessmentId: assessment.id});
                                              setItemOpen(true);
                                            }}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="resources">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Resource Assignments</CardTitle>
                    <CardDescription>Manage team allocations and role demands for this project.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => {
                    setEditingAssignment(null);
                    setAssignmentMode("named");
                    setAssignmentForm({ resourceId: "", department: "", roleDescription: "", allocationPercent: "100", plannedHours: "", startDate: "", endDate: "", status: "Planned" });
                    setResourceOpen(true);
                  }}>
                    <PlusCircle className="h-4 w-4 mr-2" /> Add Resource
                  </Button>
                </CardHeader>
                <CardContent>
                  {(!resourcesData || resourcesData.length === 0) ? (
                    <EmptyTab title="No resources have been assigned yet" description="Add an actual resource or a reviewed department demand. Suggested initiative roles are not assignments." action="Add Resource" onAction={() => { setEditingAssignment(null); setAssignmentMode("named"); setAssignmentForm({ resourceId: "", department: "", roleDescription: "", allocationPercent: "100", plannedHours: "", startDate: "", endDate: "", status: "Planned" }); setResourceOpen(true); }} />
                  ) : (
                    <div className="space-y-4">
                      {resourcesData.map(assignment => (
                        <div key={assignment.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {assignment.resourceName ? (
                                <span className="font-semibold">{assignment.resourceName}</span>
                              ) : (
                                <Badge variant="secondary" className="font-medium bg-blue-100 text-blue-800 hover:bg-blue-100">{assignment.department} Demand</Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] uppercase">{assignment.status}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">{assignment.roleDescription || "No role specified"}</div>
                            <div className="text-xs text-muted-foreground flex gap-3">
                              <span>{assignment.allocationPercent}% Allocated</span>
                              {assignment.plannedHours ? <span>• {assignment.plannedHours} hrs planned</span> : null}
                              {(assignment.startDate || assignment.endDate) && (
                                <span>• {formatDate(assignment.startDate)} - {formatDate(assignment.endDate)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4 sm:mt-0">
                            <Button variant="ghost" size="icon" onClick={() => {
                              setEditingAssignment(assignment);
                              setAssignmentMode(assignment.resourceId ? "named" : "demand");
                              setAssignmentForm({
                                resourceId: assignment.resourceId?.toString() || "",
                                department: assignment.department || "",
                                roleDescription: assignment.roleDescription || "",
                                allocationPercent: assignment.allocationPercent?.toString() || "100",
                                plannedHours: assignment.plannedHours?.toString() || "",
                                startDate: assignment.startDate ? assignment.startDate.split("T")[0] : "",
                                endDate: assignment.endDate ? assignment.endDate.split("T")[0] : "",
                                status: assignment.status
                              });
                              setResourceOpen(true);
                            }}>
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => {
                              if (window.confirm("Remove this assignment?")) {
                                deleteAssignmentMutation.mutate({ id, assignmentId: assignment.id });
                              }
                            }}>
                              <Trash2 className="h-4 w-4 text-destructive/70 hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="linked-work">
              <ProjectLinkedWork projectId={id} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status & Attributes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Stage</Label>
                <Select value={project.lifecycleStage} onValueChange={(v) => updateMutation.mutate({id, data: {lifecycleStage: v}})}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">State</Label>
                <Select value={project.state} onValueChange={(v) => updateMutation.mutate({id, data: {state: v}})}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1 p-2 rounded bg-muted/30 border">
                <Label className="text-xs text-muted-foreground flex justify-between">
                  <span>Health</span>
                  {project.healthOverridden && <span className="text-[10px] text-amber-600 bg-amber-100 px-1 rounded font-semibold uppercase">Override</span>}
                </Label>
                <Select value={project.effectiveHealth} onValueChange={handleHealthChange}>
                  <SelectTrigger className="h-8 font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent>{HEALTHS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                {project.healthOverridden && (
                  <div className="mt-2 text-[10px] text-muted-foreground space-y-1 pt-1 border-t">
                    <div><span className="font-medium">Calculated:</span> {project.calculatedHealth}</div>
                    {project.healthOverrideReason && <div><span className="font-medium">Reason:</span> {project.healthOverrideReason}</div>}
                    <div className="flex justify-between">
                      <span>{project.healthOverrideBy}</span>
                      <span>{formatDate(project.healthOverrideAt)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={project.priority} onValueChange={(v) => updateMutation.mutate({id, data: {priority: v}})}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 pt-2">
                <Label className="text-xs text-muted-foreground block mb-1">Target Date</Label>
                <Input type="date" className="h-8" value={toDateInput(project.targetDate)} onChange={(e) => updateMutation.mutate({id, data: {targetDate: e.target.value || null}})} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Milestone Dialog */}
      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMilestone ? "Edit Milestone" : "Add Milestone"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={msForm.name} onChange={(e) => setMsForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={msForm.description} onChange={(e) => setMsForm(f => ({...f, description: e.target.value}))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Input value={msForm.owner} onChange={(e) => setMsForm(f => ({...f, owner: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>Due Date</Label>
                <Input type="date" value={msForm.dueDate} onChange={(e) => setMsForm(f => ({...f, dueDate: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={msForm.status} onValueChange={(v) => setMsForm(f => ({...f, status: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MILESTONE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Sequence Order</Label>
                <Input type="number" value={msForm.sequence} onChange={(e) => setMsForm(f => ({...f, sequence: e.target.value}))} />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="stageGate" checked={msForm.stageGate} onCheckedChange={(c) => setMsForm(f => ({...f, stageGate: !!c}))} />
              <Label htmlFor="stageGate" className="font-normal cursor-pointer">This is a formal Stage Gate</Label>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <div>
              {editingMilestone && (
                <Button variant="destructive" onClick={() => deleteMsMutation.mutate({ id, milestoneId: editingMilestone.id })}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMilestoneOpen(false)}>Cancel</Button>
              <Button onClick={submitMilestone} disabled={createMsMutation.isPending || updateMsMutation.isPending}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Dialog */}
      <Dialog open={riskOpen} onOpenChange={setRiskOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRisk ? "Edit Risk" : "Add Risk"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input value={riskForm.title} onChange={(e) => setRiskForm(f => ({...f, title: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={riskForm.description} onChange={(e) => setRiskForm(f => ({...f, description: e.target.value}))} rows={2} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select value={riskForm.severity} onValueChange={(v) => setRiskForm(f => ({...f, severity: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISK_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Probability</Label>
                <Select value={riskForm.probability} onValueChange={(v) => setRiskForm(f => ({...f, probability: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISK_PROBABILITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Impact</Label>
                <Select value={riskForm.impact} onValueChange={(v) => setRiskForm(f => ({...f, impact: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISK_IMPACTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={riskForm.status} onValueChange={(v) => setRiskForm(f => ({...f, status: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISK_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Input value={riskForm.owner} onChange={(e) => setRiskForm(f => ({...f, owner: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>Due Date</Label>
                <Input type="date" value={riskForm.dueDate} onChange={(e) => setRiskForm(f => ({...f, dueDate: e.target.value}))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Mitigation Plan</Label>
              <Textarea value={riskForm.mitigationPlan} onChange={(e) => setRiskForm(f => ({...f, mitigationPlan: e.target.value}))} rows={2} />
            </div>
          </div>
          <DialogFooter className="justify-between">
            <div>
              {editingRisk && (
                <Button variant="destructive" onClick={() => deleteRiskMutation.mutate({ id, riskId: editingRisk.id })}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRiskOpen(false)}>Cancel</Button>
              <Button onClick={submitRisk} disabled={createRiskMutation.isPending || updateRiskMutation.isPending}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={approvalForm.type} onValueChange={(v) => setApprovalForm(f => ({...f, type: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APPROVAL_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input value={approvalForm.title} onChange={(e) => setApprovalForm(f => ({...f, title: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Description / Justification</Label>
              <Textarea value={approvalForm.description} onChange={(e) => setApprovalForm(f => ({...f, description: e.target.value}))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Requested By</Label>
                <Input value={approvalForm.requestedBy} onChange={(e) => setApprovalForm(f => ({...f, requestedBy: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>Approver (Optional)</Label>
                <Input value={approvalForm.approver} onChange={(e) => setApprovalForm(f => ({...f, approver: e.target.value}))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>Cancel</Button>
            <Button onClick={submitApproval} disabled={createApprovalMutation.isPending}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resource Assignment Dialog */}
      <Dialog open={resourceOpen} onOpenChange={setResourceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAssignment ? "Edit Assignment" : "Add Resource"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Tabs value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="named">Named Resource</TabsTrigger>
                <TabsTrigger value="demand">Department Demand</TabsTrigger>
              </TabsList>
            </Tabs>

            {assignmentMode === "named" ? (
              <div className="grid gap-2 mt-2">
                <Label>Resource</Label>
                <Select value={assignmentForm.resourceId} onValueChange={(v) => setAssignmentForm(f => ({...f, resourceId: v}))}>
                  <SelectTrigger><SelectValue placeholder="Select resource" /></SelectTrigger>
                  <SelectContent>
                    {allResources?.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name} ({r.department})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-2 mt-2">
                <Label>Department</Label>
                <Select value={assignmentForm.department} onValueChange={value => setAssignmentForm(f => ({ ...f, department: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {assignmentForm.department && !settings?.departments.includes(assignmentForm.department) && <SelectItem value={assignmentForm.department}>{assignmentForm.department} (Inactive)</SelectItem>}
                    {settings?.departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Role Description</Label>
              <Input value={assignmentForm.roleDescription} onChange={(e) => setAssignmentForm(f => ({...f, roleDescription: e.target.value}))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Allocation %</Label>
                <Input type="number" value={assignmentForm.allocationPercent} onChange={(e) => setAssignmentForm(f => ({...f, allocationPercent: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>Planned Hours (Optional)</Label>
                <Input type="number" value={assignmentForm.plannedHours} onChange={(e) => setAssignmentForm(f => ({...f, plannedHours: e.target.value}))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Date</Label>
                <Input type="date" value={assignmentForm.startDate} onChange={(e) => setAssignmentForm(f => ({...f, startDate: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>End Date</Label>
                <Input type="date" value={assignmentForm.endDate} onChange={(e) => setAssignmentForm(f => ({...f, endDate: e.target.value}))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={assignmentForm.status} onValueChange={(v) => setAssignmentForm(f => ({...f, status: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planned">Planned</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResourceOpen(false)}>Cancel</Button>
            <Button onClick={submitAssignment} disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}>Save Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Readiness Assessment Dialog */}
      <Dialog open={readinessOpen} onOpenChange={setReadinessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Go-Live Assessment</DialogTitle>
            <DialogDescription>Initialize a readiness checklist.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Assessment Name</Label>
              <Input value={readinessForm.name} onChange={(e) => setReadinessForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div className="grid gap-2">
              <Label>Target Date</Label>
              <Input type="date" value={readinessForm.targetDate} onChange={(e) => setReadinessForm(f => ({...f, targetDate: e.target.value}))} />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="seed" checked={readinessForm.seedStandardItems} onCheckedChange={(c) => setReadinessForm(f => ({...f, seedStandardItems: !!c}))} />
              <Label htmlFor="seed" className="font-normal cursor-pointer">Seed standard checklist items by category</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReadinessOpen(false)}>Cancel</Button>
            <Button onClick={submitReadiness} disabled={createReadinessMutation.isPending}>Create Assessment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Readiness Item Dialog */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem?.item?.id ? "Edit Checklist Item" : "Add Checklist Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={itemForm.category} onValueChange={(v) => setItemForm(f => ({...f, category: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{READINESS_CATEGORIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Requirement</Label>
              <Input value={itemForm.requirement} onChange={(e) => setItemForm(f => ({...f, requirement: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Input value={itemForm.owner} onChange={(e) => setItemForm(f => ({...f, owner: e.target.value}))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={itemForm.status} onValueChange={(v) => setItemForm(f => ({...f, status: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{READINESS_ITEM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="required" checked={itemForm.required} onCheckedChange={(c) => setItemForm(f => ({...f, required: !!c}))} />
              <Label htmlFor="required" className="font-normal cursor-pointer">This requirement is mandatory for Go-Live</Label>
            </div>
          </div>
          <DialogFooter className="justify-between">
            <div>
              {editingItem?.item?.id && (
                <Button variant="destructive" onClick={() => {
                  deleteItemMutation.mutate({ id, assessmentId: editingItem.assessmentId, itemId: editingItem.item.id });
                }}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setItemOpen(false)}>Cancel</Button>
              <Button onClick={submitItem} disabled={createItemMutation.isPending || updateReadinessItemMutation.isPending}>Save Item</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Health Override Reason Dialog */}
      <Dialog open={healthReasonDialog} onOpenChange={setHealthReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Project Health</DialogTitle>
            <DialogDescription>
              Provide an optional reason for overriding the calculated project health to <strong>{pendingHealth}</strong>.
              Setting it to "Unknown" will clear any existing overrides and revert to automatic calculation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Reason (Optional)</Label>
            <Textarea className="mt-2" value={healthReason} onChange={(e) => setHealthReason(e.target.value)} rows={3} placeholder="Briefly explain why health is being set manually..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHealthReasonDialog(false)}>Cancel</Button>
            <Button onClick={submitHealthOverride} disabled={updateMutation.isPending}>Confirm Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
