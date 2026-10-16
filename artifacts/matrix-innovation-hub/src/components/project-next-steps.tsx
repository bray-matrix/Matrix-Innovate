import { useState } from "react";
import type { Project } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Flag, Pencil, Users, X, Link2, CheckSquare } from "lucide-react";

interface Props {
  project: Project;
  justCreated: boolean;
  milestoneCount: number;
  assignmentCount: number;
  onEditDetails: () => void;
  onAddMilestone: () => void;
  onAssignResources: () => void;
  onOpenTab: (tab: string) => void;
}

/**
 * Contextual next steps for a project. Suggestions only: nothing is created
 * automatically and none of these steps is a required governance gate.
 */
export function ProjectNextSteps({ project, justCreated, milestoneCount, assignmentCount, onEditDetails, onAddMilestone, onAssignResources, onOpenTab }: Props) {
  // Expanded once right after creation; otherwise a compact bar that can be reopened.
  const [open, setOpen] = useState(justCreated);
  const hasMilestones = milestoneCount > 0;
  const hasResources = assignmentCount > 0;

  const saved: string[] = ["Project name", "Project owner", "Work type"];
  if (project.description) saved.push("Description");
  if (project.clientId) saved.push("Client");
  if (project.organizationId) saved.push("Organization");
  if (project.programId) saved.push("Program");
  if (project.supportingOwners) saved.push("Supporting owners");
  if (project.targetDate) saved.push("Target date");
  if (project.initiativeId) saved.push("Link to source initiative");

  const steps = [
    { key: "scope", done: false, icon: Pencil, title: "Confirm scope and ownership", text: "Check the name, description, project owner and client details. You can change them at any time.", action: "Edit project details", onClick: onEditDetails },
    { key: "milestone", done: hasMilestones, icon: Flag, title: "Add the next milestone", text: hasMilestones ? `${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"} recorded.` : "Record the next meaningful checkpoint and its due date.", action: hasMilestones ? "View milestones" : "Add milestone", onClick: hasMilestones ? () => onOpenTab("milestones") : onAddMilestone },
    { key: "resources", done: hasResources, icon: Users, title: "Assign resources or note department needs", text: hasResources ? `${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"} recorded.` : "Add the people doing the work, or a department demand if no one is named yet.", action: hasResources ? "View assigned resources" : "Assign resources", onClick: hasResources ? () => onOpenTab("resources") : onAssignResources },
  ];

  const doneCount = (hasMilestones ? 1 : 0) + (hasResources ? 1 : 0);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5" data-testid="card-project-next-steps" data-mode="compact">
        <Circle className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-sm">
          <span className="font-medium">Suggested next steps</span>
          <span className="text-muted-foreground"> · {doneCount} of 2 delivery suggestions recorded · optional</span>
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="project-next-steps-panel" data-testid="button-show-next-steps">
          Show next steps
        </Button>
      </div>
    );
  }

  return (
    <Card id="project-next-steps-panel" className="border-primary/30 bg-primary/5" data-testid="card-project-next-steps" data-mode="expanded">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{justCreated ? "Project created. Here is what to do next." : "Suggested next steps"}</CardTitle>
          <CardDescription>
            These are suggestions, not required approvals. No milestones, risks, approvals or resource assignments are added automatically.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={true} aria-controls="project-next-steps-panel" onClick={() => setOpen(false)} data-testid="button-dismiss-next-steps">
          <X className="h-4 w-4 mr-1" /> Hide
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {justCreated && (
          <div className="grid gap-3 md:grid-cols-2 text-sm" data-testid="text-project-created-summary">
            <div>
              <p className="font-medium">Saved</p>
              <p className="text-muted-foreground">{saved.join(", ")}.</p>
            </div>
            <div>
              <p className="font-medium">Still optional</p>
              <p className="text-muted-foreground">Milestones, risks, assigned resources, project approvals, go-live readiness and Jira links. Add them when they become useful.</p>
            </div>
          </div>
        )}
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.key} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border bg-card px-4 py-3" data-testid={`step-${s.key}`}>
              {s.done ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium flex items-center gap-2"><s.icon className="h-4 w-4 text-primary" />{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.text}</p>
              </div>
              <Button size="sm" variant={s.done ? "ghost" : "outline"} onClick={s.onClick} data-testid={`button-next-step-${s.key}`}>{s.action}</Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground self-center">Also available:</span>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => onOpenTab("risks")} data-testid="button-next-step-risks">Record a risk</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => onOpenTab("approvals")} data-testid="button-next-step-approvals"><CheckSquare className="h-3.5 w-3.5 mr-1" />Request a project approval</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => onOpenTab("linked-work")} data-testid="button-next-step-linked-work"><Link2 className="h-3.5 w-3.5 mr-1" />Link Jira work</Button>
        </div>
      </CardContent>
    </Card>
  );
}
