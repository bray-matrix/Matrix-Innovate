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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  const openerRef = useRef<HTMLElement | null>(null);
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
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-none md:w-[clamp(34rem,46vw,56rem)]"
        data-testid="dialog-edit-project-details"
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          // This controlled Sheet has multiple external openers, not a SheetTrigger.
          // Return focus to the actual opener on Cancel, Escape and successful save.
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus({ preventScroll: true });
          }
        }}
        onInteractOutside={(e) => { if (inFlight.current) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (inFlight.current) e.preventDefault(); }}
      >
        <SheetHeader className="border-b px-6 py-5 pr-12 text-left space-y-1">
          <p className="text-sm text-muted-foreground font-mono" data-testid="text-edit-project-context">PRJ-{String(project.id).padStart(4, "0")} · {project.name}</p>
          <SheetTitle className="text-xl">Edit project details</SheetTitle>
          <SheetDescription className="text-sm">
            Save stores only the fields you change. Cancel discards your edits. Milestones, risks, approvals, resources, readiness, Jira links and the linked initiative are not affected.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid min-w-0 gap-6 [&>div]:min-w-0 [&_input]:min-w-0 [&_button]:min-w-0">
            <section className="grid gap-4" aria-labelledby="edit-project-basics">
              <h3 id="edit-project-basics" className="text-base font-semibold">Basics</h3>
              <NameField form={form} setForm={setForm} error={errors.name} idPrefix="edit-project" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <OwnerField form={form} setForm={setForm} error={errors.primaryOwner} idPrefix="edit-project" />
                <WorkTypeField form={form} setForm={setForm} error={errors.projectType} idPrefix="edit-project" />
              </div>
              <DescriptionField form={form} setForm={setForm} idPrefix="edit-project" />
              <SupportingOwnersField form={form} setForm={setForm} idPrefix="edit-project" />
            </section>
            <section className="grid gap-4 border-t pt-6" aria-labelledby="edit-project-relationships">
              <h3 id="edit-project-relationships" className="text-base font-semibold">Relationships and dates</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RelationSelect label="Client" kind="client" idPrefix="edit-project" help={RELATION_HELP.client} value={form.clientId} options={clients} onChange={(v) => setForm(f => ({ ...f, clientId: v }))} />
                <RelationSelect label="Organization" kind="organization" idPrefix="edit-project" help={RELATION_HELP.organization} value={form.organizationId} options={organizations} onChange={(v) => setForm(f => ({ ...f, organizationId: v }))} />
                <RelationSelect label="Program" kind="program" idPrefix="edit-project" help={RELATION_HELP.program} value={form.programId} options={programs} onChange={(v) => setForm(f => ({ ...f, programId: v }))} />
                <TargetDateField form={form} setForm={setForm} idPrefix="edit-project" disabled={pending} />
              </div>
            </section>
          </div>
        </div>
        <div className="border-t bg-card px-6 py-4 space-y-2">
          {apiError && <p role="alert" className="text-sm text-destructive" data-testid="text-edit-project-error">{apiError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => close(false)} disabled={pending} data-testid="button-cancel-edit-project">Cancel</Button>
            <Button onClick={save} disabled={pending} data-testid="button-save-edit-project">{pending ? "Saving..." : apiError ? "Try saving again" : "Save changes"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
