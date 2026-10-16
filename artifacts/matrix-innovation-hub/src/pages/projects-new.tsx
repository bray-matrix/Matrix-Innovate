import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProject,
  useListOrganizations,
  useListClients,
  useListPrograms,
  getListProjectsQueryKey,
  getGetPortfolioQueryKey,
} from "@workspace/api-client-react";
import type { ProjectCreate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { Briefcase, ChevronLeft, ChevronDown, Sparkles, Lightbulb } from "lucide-react";
import {
  NameField, OwnerField, WorkTypeField, DescriptionField, RelationSelect, SupportingOwnersField, TargetDateField, RELATION_HELP,
} from "@/components/project-details-fields";
import { validateProjectDetails, apiErrorMessage } from "@/lib/project-details";
import type { ProjectDetailsErrors, ProjectDetailsForm } from "@/lib/project-details";

const STAGES = ["Planning", "Ready", "In Progress", "On Hold", "Completed", "Cancelled"];
const STATES = ["Active", "On Hold", "Closed"];
const HEALTHS = ["On Track", "At Risk", "Off Track", "Unknown"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

function SimpleSelect({ id, label, help, value, options, onChange }: { id: string; label: string; help?: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-testid={`select-${id}`}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
      </Select>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  const { data: programs } = useListPrograms();

  const [form, setForm] = useState<ProjectDetailsForm>({
    name: "", description: "", primaryOwner: "", supportingOwners: "",
    projectType: "", clientId: null, organizationId: null, programId: null, targetDate: "",
  });
  const [extra, setExtra] = useState({ lifecycleStage: "Planning", state: "Active", health: "Unknown", priority: "Medium" });
  const [errors, setErrors] = useState<ProjectDetailsErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const inFlight = useRef(false);

  const createMutation = useCreateProject();

  const submit = () => {
    if (inFlight.current) return;
    const v = validateProjectDetails(form);
    setErrors(v);
    if (Object.keys(v).length) {
      const first = v.name ? "new-project-name" : v.primaryOwner ? "new-project-owner" : "new-project-type";
      document.getElementById(first)?.focus();
      return;
    }
    const data: ProjectCreate = {
      name: form.name.trim(),
      description: form.description,
      projectType: form.projectType,
      lifecycleStage: extra.lifecycleStage,
      state: extra.state,
      health: extra.health,
      priority: extra.priority,
      primaryOwner: form.primaryOwner.trim(),
      supportingOwners: form.supportingOwners,
      targetDate: form.targetDate || null,
      organizationId: form.organizationId,
      clientId: form.clientId,
      programId: form.programId,
    };
    inFlight.current = true;
    setApiError(null);
    createMutation.mutate({ data }, {
      onSuccess: (project) => {
        inFlight.current = false;
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        toast({ title: "Project created", description: `${project.name} was saved.` });
        setLocation(`/projects/${project.id}?created=1`);
      },
      onError: (err) => {
        inFlight.current = false;
        const msg = apiErrorMessage(err, "The project could not be created. Your entries are still here; please try again.");
        setApiError(msg);
        toast({ title: "Project not created", description: msg, variant: "destructive" });
      },
    });
  };

  const pending = createMutation.isPending;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/projects" aria-label="Back to projects" className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-8 w-8 text-primary" />
            Create project
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            A project manages work selected for planning or delivery.
          </p>
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/5" data-testid="card-initiative-first">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 sm:items-center">
          <Lightbulb className="h-6 w-6 text-primary shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Recommended: start with an initiative</p>
            <p className="text-muted-foreground">
              Developing the idea as an initiative first helps establish scope, expected outcomes and business justification. You can then create a linked project from it.
              Use this form when the work is already well defined.
            </p>
          </div>
          <Link href="/interview" className="inline-flex items-center justify-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted shrink-0" data-testid="link-develop-idea-instead">
            <Sparkles className="h-4 w-4" /> Develop an idea
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            Fields marked <span className="text-destructive">*</span> are required. Other details can be added or changed later on the project page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <NameField form={form} setForm={setForm} error={errors.name} idPrefix="new-project" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OwnerField form={form} setForm={setForm} error={errors.primaryOwner} idPrefix="new-project" />
              <WorkTypeField form={form} setForm={setForm} error={errors.projectType} idPrefix="new-project" />
            </div>
          </div>

          <div className="grid gap-4 border-t pt-6">
            <p className="text-sm font-medium text-muted-foreground">Optional</p>
            <DescriptionField form={form} setForm={setForm} idPrefix="new-project" />
            <div className="md:max-w-sm">
              <RelationSelect label="Client" kind="client" idPrefix="new-project" help={RELATION_HELP.client} value={form.clientId} options={clients} onChange={(v) => setForm(f => ({ ...f, clientId: v }))} />
            </div>
          </div>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="px-0 hover:bg-transparent" data-testid="button-toggle-additional-details">
                <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                Additional details (optional)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RelationSelect label="Organization" kind="organization" idPrefix="new-project" help={RELATION_HELP.organization} value={form.organizationId} options={organizations} onChange={(v) => setForm(f => ({ ...f, organizationId: v }))} />
                <RelationSelect label="Program" kind="program" idPrefix="new-project" help={RELATION_HELP.program} value={form.programId} options={programs} onChange={(v) => setForm(f => ({ ...f, programId: v }))} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SupportingOwnersField form={form} setForm={setForm} idPrefix="new-project" />
                <TargetDateField form={form} setForm={setForm} idPrefix="new-project" disabled={pending} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleSelect id="new-project-stage" label="Delivery stage" value={extra.lifecycleStage} options={STAGES} onChange={(v) => setExtra(x => ({ ...x, lifecycleStage: v }))} />
                <SimpleSelect id="new-project-state" label="Active / closed status" value={extra.state} options={STATES} onChange={(v) => setExtra(x => ({ ...x, state: v }))} />
                <SimpleSelect id="new-project-priority" label="Project priority" value={extra.priority} options={PRIORITIES} onChange={(v) => setExtra(x => ({ ...x, priority: v }))} />
                <SimpleSelect id="new-project-health" label="Initial health value" help="Leave as Unknown. Displayed health is calculated; a manual override can be set under Delivery health after creating the project." value={extra.health} options={HEALTHS} onChange={(v) => setExtra(x => ({ ...x, health: v }))} />
              </div>
            </CollapsibleContent>
          </Collapsible>
          {apiError && <p role="alert" className="text-sm text-destructive" data-testid="text-create-project-error">{apiError}</p>}
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6">
          <Link href="/projects" aria-disabled={pending} onClick={(event) => { if (inFlight.current) event.preventDefault(); }} className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted ${pending ? "pointer-events-none opacity-50" : ""}`} data-testid="link-cancel-create-project">Cancel</Link>
          <Button onClick={submit} disabled={pending} data-testid="button-create-project">{pending ? "Creating..." : "Create project"}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
