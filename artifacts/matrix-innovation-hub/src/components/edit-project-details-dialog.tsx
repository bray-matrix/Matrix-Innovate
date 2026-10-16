import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProject,
  useListOrganizations,
  useListClients,
  useListPrograms,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getGetPortfolioQueryKey,
  getGetDashboardAttentionQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetExecutionSummaryQueryKey,
  getListReportsQueryKey,
} from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  NameField, OwnerField, WorkTypeField, DescriptionField, RelationSelect, SupportingOwnersField, TargetDateField, RELATION_HELP,
} from "@/components/project-details-fields";
import {
  projectToDetailsForm, buildProjectDetailsPatch, validateProjectDetails, hasChanges, apiErrorMessage,
} from "@/lib/project-details";
import type { ProjectDetailsErrors, ProjectDetailsForm } from "@/lib/project-details";

export function EditProjectDetailsDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  const { data: programs } = useListPrograms();
  const [form, setForm] = useState<ProjectDetailsForm>(() => projectToDetailsForm(project));
  const [errors, setErrors] = useState<ProjectDetailsErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const originalRef = useRef(project);

  // Initialize from current data each time the dialog opens (discarding prior unsaved edits).
  useEffect(() => {
    if (open) {
      originalRef.current = projectRef.current;
      setForm(projectToDetailsForm(projectRef.current));
      setErrors({});
      setApiError(null);
    }
  }, [open, project.id]);

  const update = useUpdateProject();

  const close = (next: boolean) => {
    if (inFlight.current) return;
    onOpenChange(next);
  };

  const save = () => {
    if (inFlight.current) return;
    const v = validateProjectDetails(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    // Compare against the opening snapshot, not a background-refetched project:
    // a field the user did not edit must never overwrite another saved change.
    const patch = buildProjectDetailsPatch(originalRef.current, form);
    if (!hasChanges(patch)) {
      toast({ title: "No changes to save" });
      onOpenChange(false);
      return;
    }
    inFlight.current = true;
    setApiError(null);
    update.mutate({ id: project.id, data: patch }, {
      onSuccess: () => {
        inFlight.current = false;
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardAttentionQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExecutionSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
        queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/reports/") });
        toast({ title: "Project details saved" });
        onOpenChange(false);
      },
      onError: (err) => {
        inFlight.current = false;
        const msg = apiErrorMessage(err, "The project could not be saved. Your edits are still here; please try again.");
        setApiError(msg);
        toast({ title: "Project details not saved", description: msg, variant: "destructive" });
      },
    });
  };

  const pending = update.isPending;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto" data-testid="dialog-edit-project-details">
        <DialogHeader>
          <DialogTitle>Edit project details</DialogTitle>
          <DialogDescription>
            Save stores only the fields you change. Cancel discards your edits. Milestones, risks, approvals, resources, readiness, Jira links and the linked initiative are not affected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 [&>div]:min-w-0 [&_input]:min-w-0 [&_button]:min-w-0">
          <NameField form={form} setForm={setForm} error={errors.name} idPrefix="edit-project" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OwnerField form={form} setForm={setForm} error={errors.primaryOwner} idPrefix="edit-project" />
            <WorkTypeField form={form} setForm={setForm} error={errors.projectType} idPrefix="edit-project" />
          </div>
          <DescriptionField form={form} setForm={setForm} idPrefix="edit-project" />
          <SupportingOwnersField form={form} setForm={setForm} idPrefix="edit-project" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RelationSelect label="Client" kind="client" idPrefix="edit-project" help={RELATION_HELP.client} value={form.clientId} options={clients} onChange={(v) => setForm(f => ({ ...f, clientId: v }))} />
            <RelationSelect label="Organization" kind="organization" idPrefix="edit-project" help={RELATION_HELP.organization} value={form.organizationId} options={organizations} onChange={(v) => setForm(f => ({ ...f, organizationId: v }))} />
            <RelationSelect label="Program" kind="program" idPrefix="edit-project" help={RELATION_HELP.program} value={form.programId} options={programs} onChange={(v) => setForm(f => ({ ...f, programId: v }))} />
          </div>
          <TargetDateField form={form} setForm={setForm} idPrefix="edit-project" disabled={pending} />
          {apiError && <p role="alert" className="text-sm text-destructive" data-testid="text-edit-project-error">{apiError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={pending} data-testid="button-cancel-edit-project">Cancel</Button>
          <Button onClick={save} disabled={pending} data-testid="button-save-edit-project">{pending ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
