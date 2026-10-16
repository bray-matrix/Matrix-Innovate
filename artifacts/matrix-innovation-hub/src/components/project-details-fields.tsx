import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_TYPES, WORK_TYPE_DESCRIPTIONS } from "@/lib/project-details";
import type { ProjectDetailsErrors, ProjectDetailsForm } from "@/lib/project-details";

type SetForm = (updater: (f: ProjectDetailsForm) => ProjectDetailsForm) => void;

export interface RelationOption { id: number; name: string; status?: string | null }

export function RequiredMark() {
  return <span className="text-destructive ml-0.5" aria-hidden="true">*</span>;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="text-sm text-destructive" data-testid={`error-${id}`}>{message}</p>;
}

export const RELATION_HELP = {
  client: "The Matrix customer or account this work is for. Leave empty for internal work.",
  organization: "Optional parent company or corporate entity, if the client belongs to one.",
  program: "Optional grouping of related projects.",
  owner: "The person accountable for successful delivery. Often also the project manager.",
  supporting: "Other people involved, separated by commas. Assign people doing the work later under Assigned resources.",
};

export function NameField({ form, setForm, error, idPrefix }: { form: ProjectDetailsForm; setForm: SetForm; error?: string; idPrefix: string }) {
  const id = `${idPrefix}-name`;
  const visibleError = form.name.trim() ? undefined : error;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Project name<RequiredMark /></Label>
      <Input id={id} data-testid={`input-${id}`} aria-required="true" aria-invalid={!!visibleError} aria-describedby={visibleError ? `${id}-error` : undefined}
        value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Q3 Compliance Rollout" />
      <FieldError id={`${id}-error`} message={visibleError} />
    </div>
  );
}

export function OwnerField({ form, setForm, error, idPrefix }: { form: ProjectDetailsForm; setForm: SetForm; error?: string; idPrefix: string }) {
  const id = `${idPrefix}-owner`;
  const visibleError = form.primaryOwner.trim() ? undefined : error;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Project owner<RequiredMark /></Label>
      <Input id={id} data-testid={`input-${id}`} aria-required="true" aria-invalid={!!visibleError} aria-describedby={`${id}-help${visibleError ? ` ${id}-error` : ""}`}
        value={form.primaryOwner} onChange={(e) => setForm(f => ({ ...f, primaryOwner: e.target.value }))} placeholder="Full name" />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">{RELATION_HELP.owner}</p>
      <FieldError id={`${id}-error`} message={visibleError} />
    </div>
  );
}

export function WorkTypeField({ form, setForm, error, idPrefix }: { form: ProjectDetailsForm; setForm: SetForm; error?: string; idPrefix: string }) {
  const id = `${idPrefix}-type`;
  const known = (PROJECT_TYPES as readonly string[]).includes(form.projectType);
  const visibleError = form.projectType.trim() ? undefined : error;
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>Work type<RequiredMark /></Label>
      <Select value={form.projectType} onValueChange={(v) => setForm(f => ({ ...f, projectType: v }))}>
        <SelectTrigger className="min-w-0" id={id} data-testid={`select-${id}`} aria-required="true" aria-invalid={!!visibleError} aria-describedby={`${id}-help`}>
          <SelectValue placeholder="Choose the kind of work">{form.projectType || undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-3rem)]">
          {!known && form.projectType && <SelectItem value={form.projectType}>{form.projectType} (current)</SelectItem>}
          {PROJECT_TYPES.map(t => (
            <SelectItem key={t} value={t} textValue={t}>
              <span className="flex max-w-72 flex-col items-start whitespace-normal">
                <span>{t}</span>
                <span className="text-xs text-muted-foreground">{WORK_TYPE_DESCRIPTIONS[t]}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {WORK_TYPE_DESCRIPTIONS[form.projectType] || "Choose the category that best describes the work."}
      </p>
      <FieldError id={`${id}-error`} message={visibleError} />
    </div>
  );
}

export function DescriptionField({ form, setForm, idPrefix }: { form: ProjectDetailsForm; setForm: SetForm; idPrefix: string }) {
  const id = `${idPrefix}-description`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Description / intended outcome</Label>
      <Textarea id={id} data-testid={`input-${id}`} rows={3} value={form.description}
        onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What should be different when this project is done?" />
    </div>
  );
}

export function RelationSelect({
  label, help, value, onChange, options, idPrefix, kind,
}: {
  label: string; help: string; value: number | null; onChange: (v: number | null) => void;
  options: RelationOption[] | undefined; idPrefix: string; kind: string;
}) {
  const id = `${idPrefix}-${kind}`;
  const list = options ?? [];
  const current = value != null ? list.find(o => o.id === value) : undefined;
  const missing = value != null && options !== undefined && !current;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value != null ? String(value) : "none"} onValueChange={(v) => onChange(v === "none" ? null : Number(v))}>
        <SelectTrigger id={id} data-testid={`select-${id}`}><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {missing && <SelectItem value={String(value)}>Unavailable record #{value} (kept unless changed)</SelectItem>}
          {list.map(o => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.name}{o.status && o.status !== "Active" ? ` (${o.status.toLowerCase()})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

export function SupportingOwnersField({ form, setForm, idPrefix }: { form: ProjectDetailsForm; setForm: SetForm; idPrefix: string }) {
  const id = `${idPrefix}-supporting`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Supporting owners</Label>
      <Input id={id} data-testid={`input-${id}`} value={form.supportingOwners}
        onChange={(e) => setForm(f => ({ ...f, supportingOwners: e.target.value }))} placeholder="Comma-separated names" />
      <p className="text-xs text-muted-foreground">{RELATION_HELP.supporting}</p>
    </div>
  );
}

export function TargetDateField({ form, setForm, idPrefix, disabled }: { form: ProjectDetailsForm; setForm: SetForm; idPrefix: string; disabled?: boolean }) {
  const id = `${idPrefix}-target-date`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Target date</Label>
      <div className="flex gap-2">
        <Input id={id} data-testid={`input-${id}`} type="date" value={form.targetDate} disabled={disabled}
          onChange={(e) => setForm(f => ({ ...f, targetDate: e.target.value }))} />
        <button type="button" data-testid={`button-clear-${id}`} disabled={!form.targetDate || disabled}
          onClick={() => setForm(f => ({ ...f, targetDate: "" }))}
          className="text-sm px-3 rounded-md border hover:bg-muted disabled:opacity-50">Clear</button>
      </div>
    </div>
  );
}

export type { ProjectDetailsErrors };
