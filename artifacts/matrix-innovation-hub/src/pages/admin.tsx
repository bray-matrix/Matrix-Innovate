import {
  useGetSettings,
  getGetSettingsQueryKey,
  useCreateDepartment,
  useUpdateDepartment,
  useInitializeDepartments,
} from "@workspace/api-client-react";
import type { AIServiceStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMatrixAuth } from "@/components/matrix-gate";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Lock } from "lucide-react";
import { EnvironmentHistoryCard } from "@/components/init-wizard";
import { JiraIntegration } from "@/components/jira-integration";

// Must match the server allowlist (platform_administrator + existing aliases).
const ADMIN_ROLES = ["platform_administrator", "admin", "superadmin", "super_admin", "super admin"];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${title}`} className="space-y-3">
      <div className="border-b pb-2">
        <h3 id={`sec-${title}`} className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ReadOnlyBadge({ label = "Read-only" }: { label?: string }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Lock className="h-3 w-3" aria-hidden="true" />{label}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function AIServiceCard({ info }: { info: AIServiceStatus | null | undefined }) {
  if (!info) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>AI Service</CardTitle>
            <ReadOnlyBadge />
          </div>
          <CardDescription>AI service metadata is unavailable. The server did not return it.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>AI Service</CardTitle>
          <ReadOnlyBadge />
        </div>
        <CardDescription>
          Generative AI is provided through a Matrix Platform shared service. There is no provider selection in Innovation Hub.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Service">{info.service}</Field>
          <Field label="Provider (documented architecture)">
            {info.provider}
            <span className="block text-xs text-muted-foreground">Documented policy, not a live observation.</span>
          </Field>
          <Field label="Runtime status">
            <Badge variant="outline">{info.status}</Badge>
            <span className="block text-xs text-muted-foreground">{info.statusNotes}</span>
          </Field>
        </dl>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Used for">
            <ul className="list-disc pl-4">{info.usedFor.map(u => <li key={u}>{u}</li>)}</ul>
          </Field>
          <Field label="Credentials">{info.credentials}</Field>
        </dl>
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Deterministic Rule Engine</span>
            <Badge variant="secondary" className="font-mono text-xs">{info.deterministicEngine}</Badge>
            <span className="text-xs text-muted-foreground">Not an AI model or LLM. Separate from the AI Service.</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {info.deterministicUses.map(u => <Badge key={u} variant="outline" className="font-normal">{u}</Badge>)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { data: settings, isLoading, isError, refetch } = useGetSettings();
  const { user } = useMatrixAuth();
  const canManage = user.roles?.some(role => ADMIN_ROLES.includes(role.toLowerCase())) ?? false;
  const { toast } = useToast();
  const [departmentName, setDepartmentName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const refreshDepartments = () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
  const departmentError = (error: unknown) => toast({
    title: "Department change failed",
    description: error instanceof Error ? error.message : "Please try again.",
    variant: "destructive",
  });
  const createDepartment = useCreateDepartment({ mutation: {
    onSuccess: () => { setDepartmentName(""); refreshDepartments(); toast({ title: "Department added" }); },
    onError: departmentError,
  } });
  const initializeDepartments = useInitializeDepartments({ mutation: {
    onSuccess: () => { refreshDepartments(); toast({ title: "Default departments added" }); },
    onError: departmentError,
  } });
  const withDefaultDepartment = async (name: string, action: (id: number) => void) => {
    try {
      const rows = await initializeDepartments.mutateAsync();
      const row = rows.find(dept => dept.name === name);
      if (row) action(row.id);
    } catch {
      // Mutation error is surfaced by onError; keep fallback values visible.
    }
  };
  const updateDepartment = useUpdateDepartment({ mutation: {
    onSuccess: () => { setEditingId(null); setDepartmentName(""); refreshDepartments(); toast({ title: "Department updated" }); },
    onError: departmentError,
  } });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <div role="alert" className="max-w-5xl mx-auto rounded-md border p-4 text-sm flex items-center justify-between gap-3">
        <span>Admin settings could not be loaded.</span>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }

  const fallbackRows = settings.departmentMaster.length === 0
    ? settings.departments.map(name => ({ key: `f-${name}`, name, active: true, id: null as number | null }))
    : settings.departmentMaster.map(d => ({ key: `d-${d.id}`, name: d.name, active: d.active, id: d.id as number | null }));
  const busy = initializeDepartments.isPending || updateDepartment.isPending;
  const startRename = (row: { id: number | null; name: string }) => row.id === null
    ? void withDefaultDepartment(row.name, id => { setEditingId(id); setDepartmentName(row.name); })
    : (setEditingId(row.id), setDepartmentName(row.name));
  const toggleActive = (row: { id: number | null; name: string; active: boolean }) => row.id === null
    ? void withDefaultDepartment(row.name, id => updateDepartment.mutate({ id, data: { active: false } }))
    : updateDepartment.mutate({ id: row.id, data: { active: !row.active } });

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Settings</h2>
          <p className="text-muted-foreground">Integrations, business configuration, and system policy reference.</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">{settings.applicationVersion}</Badge>
      </div>

      <Section title="Integrations" description="External services used by Innovation Hub.">
        <JiraIntegration canManage={canManage} />
        <AIServiceCard info={settings.aiService} />
      </Section>

      <Section title="Business Configuration" description="Values administrators maintain for day-to-day use.">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Departments</CardTitle>
                {canManage ? <Badge variant="secondary" className="font-normal">Editable</Badge> : <ReadOnlyBadge />}
              </div>
              <CardDescription>Active departments are available for new selections. Inactive departments remain on historical records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="divide-y rounded-md border">
                {fallbackRows.map(row => (
                  <li key={row.key} className="flex items-center justify-between gap-2 px-3 py-1.5 min-h-10">
                    <span className={`text-sm ${row.active ? "" : "text-muted-foreground"}`}>
                      {row.name}
                      {!row.active && <Badge variant="outline" className="ml-2 font-normal text-xs">Inactive</Badge>}
                    </span>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy} aria-label={`Actions for ${row.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => startRename(row)}>Rename</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toggleActive(row)}>{row.active ? "Deactivate" : "Reactivate"}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
              </ul>
              {canManage && (
                <form className="flex gap-2" onSubmit={e => {
                  e.preventDefault();
                  if (!departmentName.trim()) return;
                  if (editingId === null) createDepartment.mutate({ data: { name: departmentName } });
                  else updateDepartment.mutate({ id: editingId, data: { name: departmentName } });
                }}>
                  <Input aria-label={editingId === null ? "New department name" : "Rename department"} value={departmentName} maxLength={120} onChange={e => setDepartmentName(e.target.value)} placeholder={editingId === null ? "New department name" : "Rename department"} />
                  <Button type="submit" disabled={!departmentName.trim() || createDepartment.isPending || updateDepartment.isPending}>
                    {editingId === null ? "Add" : "Save"}
                  </Button>
                  {editingId !== null && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setDepartmentName(""); }}>Cancel</Button>}
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Categories</CardTitle>
                <ReadOnlyBadge label="Code-defined" />
              </div>
              <CardDescription>Initiative classification types. System-defined in application code; not editable here.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {settings.categories.map(cat => <li key={cat}>{cat}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="System Policy & Reference" description="Code-defined policy shown for reference. Changes require a release.">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Statuses</CardTitle>
                <ReadOnlyBadge label="Code-defined" />
              </div>
              <CardDescription>Workflow progression states, controlled by the workflow. Not editable.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {settings.statuses.map((stat, i) => <li key={stat}><span className="font-mono text-xs text-muted-foreground mr-1">{i + 1}.</span>{stat}</li>)}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Scoring Model</CardTitle>
                <ReadOnlyBadge label="Code-defined" />
              </div>
              <CardDescription>Current scoring model, read-only. Maximum values for each scoring component.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                {settings.scoringWeights.map(sw => (
                  <div key={sw.name} className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                    <dt className="text-sm">{sw.name}</dt>
                    <dd className="font-mono text-sm">{sw.weight > 0 ? `+${sw.weight}` : sw.weight}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="System & Maintenance" description="Historical system records. No setup or reset actions are available here.">
        <EnvironmentHistoryCard />
      </Section>
    </div>
  );
}
