import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateProject,
  useListOrganizations,
  useListClients,
  useListPrograms,
} from "@workspace/api-client-react";
import type { ProjectCreate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Briefcase, ChevronLeft } from "lucide-react";

const PROJECT_TYPES = ["Client Implementation", "Internal Technology", "Internal Operations", "Executive Initiative", "Innovation", "Other"];
const STAGES = ["Planning", "Ready", "In Progress", "On Hold", "Completed", "Cancelled"];
const STATES = ["Active", "On Hold", "Closed"];
const HEALTHS = ["On Track", "At Risk", "Off Track", "Unknown"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  const { data: programs } = useListPrograms();

  const [form, setForm] = useState<{
    name: string;
    description: string;
    projectType: string;
    lifecycleStage: string;
    state: string;
    health: string;
    priority: string;
    primaryOwner: string;
    supportingOwners: string;
    targetDate: string;
    organizationId: number | null;
    clientId: number | null;
    programId: number | null;
  }>({
    name: "",
    description: "",
    projectType: "Internal Technology",
    lifecycleStage: "Planning",
    state: "Active",
    health: "Unknown",
    priority: "Medium",
    primaryOwner: "",
    supportingOwners: "",
    targetDate: "",
    organizationId: null,
    clientId: null,
    programId: null,
  });

  const createMutation = useCreateProject({
    mutation: {
      onSuccess: (project) => {
        toast({ title: "Project Created" });
        setLocation(`/projects/${project.id}`);
      },
      onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
    },
  });

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!form.primaryOwner.trim()) {
      toast({ title: "Primary Owner is required", variant: "destructive" });
      return;
    }

    const data: ProjectCreate = {
      name: form.name.trim(),
      description: form.description,
      projectType: form.projectType,
      lifecycleStage: form.lifecycleStage,
      state: form.state,
      health: form.health,
      priority: form.priority,
      primaryOwner: form.primaryOwner.trim(),
      supportingOwners: form.supportingOwners,
      targetDate: form.targetDate || null,
      organizationId: form.organizationId,
      clientId: form.clientId,
      programId: form.programId,
    };

    createMutation.mutate({ data });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-8 w-8 text-primary" />
            New Project
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Create a new execution project.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Enter the foundational information for this project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Project Name</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Q3 Compliance Rollout" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({...f, description: e.target.value}))} rows={3} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.projectType} onValueChange={(v) => setForm(f => ({...f, projectType: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({...f, priority: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Organization</Label>
                <Select value={form.organizationId ? String(form.organizationId) : "none"} onValueChange={(v) => setForm(f => ({...f, organizationId: v === "none" ? null : Number(v)}))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Internal)</SelectItem>
                    {(organizations ?? []).map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Client</Label>
                <Select value={form.clientId ? String(form.clientId) : "none"} onValueChange={(v) => setForm(f => ({...f, clientId: v === "none" ? null : Number(v)}))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(clients ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Program</Label>
                <Select value={form.programId ? String(form.programId) : "none"} onValueChange={(v) => setForm(f => ({...f, programId: v === "none" ? null : Number(v)}))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(programs ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select value={form.lifecycleStage} onValueChange={(v) => setForm(f => ({...f, lifecycleStage: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>State</Label>
                <Select value={form.state} onValueChange={(v) => setForm(f => ({...f, state: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Health</Label>
                <Select value={form.health} onValueChange={(v) => setForm(f => ({...f, health: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HEALTHS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Primary Owner</Label>
                <Input value={form.primaryOwner} onChange={(e) => setForm(f => ({...f, primaryOwner: e.target.value}))} placeholder="e.g. Jane Doe" />
              </div>
              <div className="grid gap-2">
                <Label>Supporting Owners</Label>
                <Input value={form.supportingOwners} onChange={(e) => setForm(f => ({...f, supportingOwners: e.target.value}))} placeholder="Comma-separated" />
              </div>
              <div className="grid gap-2">
                <Label>Target Date</Label>
                <Input type="date" value={form.targetDate} onChange={(e) => setForm(f => ({...f, targetDate: e.target.value}))} />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6">
          <Link href="/projects">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={submit} disabled={createMutation.isPending}>Create Project</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
