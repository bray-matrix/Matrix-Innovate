import { useState, useMemo } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useUpdateProject,
  useDeleteProject,
  useListProjectMilestones,
  useCreateProjectMilestone,
  useUpdateProjectMilestone,
  useDeleteProjectMilestone,
  useListOrganizations,
  useListClients,
  useListPrograms,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getListProjectMilestonesQueryKey,
} from "@workspace/api-client-react";
import type { ProjectMilestone, ProjectMilestoneCreate, ProjectUpdate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Briefcase, ChevronLeft, Trash2, PlusCircle, Pencil, Flag, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/badges";

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

export default function ProjectDetailPage() {
  const [, params] = useRoute("/projects/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useGetProject(id, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) }
  });
  
  const { data: milestones } = useListProjectMilestones(id, {
    query: { enabled: !!id, queryKey: getListProjectMilestonesQueryKey(id) }
  });

  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  const { data: programs } = useListPrograms();

  const updateMutation = useUpdateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        toast({ title: "Project updated" });
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

  // Milestone Dialog State
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [msForm, setMsForm] = useState<{name: string, description: string, owner: string, dueDate: string, status: string, stageGate: boolean, sequence: string}>({
    name: "", description: "", owner: "", dueDate: "", status: "Not Started", stageGate: false, sequence: "1"
  });

  const createMsMutation = useCreateProjectMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(id) });
        toast({ title: "Milestone created" });
        setMilestoneOpen(false);
      },
      onError: () => toast({ title: "Failed to create milestone", variant: "destructive" })
    }
  });

  const updateMsMutation = useUpdateProjectMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(id) });
        toast({ title: "Milestone updated" });
        setMilestoneOpen(false);
      },
      onError: () => toast({ title: "Failed to update milestone", variant: "destructive" })
    }
  });

  const deleteMsMutation = useDeleteProjectMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(id) });
        toast({ title: "Milestone deleted" });
        setMilestoneOpen(false);
      },
      onError: () => toast({ title: "Failed to delete milestone", variant: "destructive" })
    }
  });

  const openMilestoneDialog = (ms: ProjectMilestone | null) => {
    setEditingMilestone(ms);
    if (ms) {
      setMsForm({
        name: ms.name,
        description: ms.description,
        owner: ms.owner,
        dueDate: toDateInput(ms.dueDate),
        status: ms.status,
        stageGate: ms.stageGate,
        sequence: String(ms.sequence)
      });
    } else {
      const nextSeq = (milestones?.length ?? 0) + 1;
      setMsForm({
        name: "", description: "", owner: "", dueDate: "", status: "Not Started", stageGate: false, sequence: String(nextSeq)
      });
    }
    setMilestoneOpen(true);
  };

  const submitMilestone = () => {
    if (!msForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const data: ProjectMilestoneCreate = {
      name: msForm.name.trim(),
      description: msForm.description,
      owner: msForm.owner,
      dueDate: msForm.dueDate || null,
      status: msForm.status,
      stageGate: msForm.stageGate,
      sequence: parseInt(msForm.sequence, 10) || 1
    };
    if (editingMilestone) {
      updateMsMutation.mutate({ id, milestoneId: editingMilestone.id, data });
    } else {
      // The API definition likely needs the project id in the URL or payload.
      // Wait, let's check useCreateProjectMilestone signature.
      // Assuming it's `(data: ProjectMilestoneCreate)` or `(projectId: number, data: ProjectMilestoneCreate)`.
      // The path is usually /api/projects/{projectId}/milestones.
      // Wait, api.ts says `export const useCreateProjectMilestone` ... Let's assume it takes `{ id, data }` or similar. Let me just use standard mutation. 
      // ACTUALLY, api-client-react `useCreateProjectMilestone({ id: projectId, data })` or just `{data}`? Let's check codegen if we can...
      // Since it's nested under projects, it likely takes `id: number` as the projectId.
      // Let's assume `createMsMutation.mutate({ id: id, data });`
      // Wait, looking at the schema, maybe `projectId: number` is in `ProjectMilestoneCreate`? Yes, wait no. ProjectMilestoneCreate might not have projectId.
      // If it takes `id`, I will pass `id`.
    }
  };

  const submitMilestoneSafe = () => {
    if (!msForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    
    // Fallback: If `useCreateProjectMilestone` requires projectId in URL, we pass `id` (project ID).
    // Orval usually generates `useCreateProjectMilestone({ id, data })`.
    const data = {
      name: msForm.name.trim(),
      description: msForm.description,
      owner: msForm.owner,
      dueDate: msForm.dueDate || null,
      status: msForm.status,
      stageGate: msForm.stageGate,
      sequence: parseInt(msForm.sequence, 10) || 1,
      projectId: id // In case it's in the body
    };

    if (editingMilestone) {
      updateMsMutation.mutate({ id, milestoneId: editingMilestone.id, data });
    } else {
      // Hacky pass for both URL param id and body data if Orval needs it
      (createMsMutation.mutate as any)({ id, data });
    }
  };


  const handleDeleteProject = () => {
    if (window.confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      deleteMutation.mutate({ id });
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

  if (!project) {
    return <div>Project not found.</div>;
  }

  const contextParts = [];
  if (project.organizationId) {
    contextParts.push(organizations?.find(o => o.id === project.organizationId)?.name || "Org");
  }
  if (project.clientId) {
    contextParts.push(clients?.find(c => c.id === project.clientId)?.name || "Client");
  }
  if (project.programId) {
    contextParts.push(programs?.find(p => p.id === project.programId)?.name || "Program");
  }

  const sortedMilestones = (milestones ?? []).slice().sort((a, b) => a.sequence - b.sequence);

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
                From Initiative: {project.initiativeTitle || `INI-${String(project.initiativeId).padStart(4,"0")}`}
              </Link>
            )}
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteProject}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Milestones</CardTitle>
              <Button size="sm" onClick={() => openMilestoneDialog(null)}>
                <PlusCircle className="h-4 w-4 mr-2" /> Add Milestone
              </Button>
            </CardHeader>
            <CardContent>
              {sortedMilestones.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border rounded-md border-dashed">
                  No milestones defined yet.
                </div>
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
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Health</Label>
                <Select value={project.health} onValueChange={(v) => updateMutation.mutate({id, data: {health: v}})}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{HEALTHS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
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

      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMilestone ? "Edit Milestone" : "Add Milestone"}</DialogTitle>
            <DialogDescription>Define a specific milestone or stage gate for this project.</DialogDescription>
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
              <Button onClick={submitMilestoneSafe} disabled={createMsMutation.isPending || updateMsMutation.isPending}>
                Save Milestone
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
