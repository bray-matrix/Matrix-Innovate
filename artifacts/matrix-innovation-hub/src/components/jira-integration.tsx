import { useState } from "react";
import {
  useGetJiraConnection, useTestJiraConnection, useListJiraProjects, useDiscoverJiraProjects,
  useUpdateJiraProject, useListProjects, useListJiraFields, useGetJiraFieldMapping,
  useSaveJiraFieldMapping, useListJiraStatusMappings, useDiscoverJiraStatuses,
  useSaveJiraStatusMapping, getListJiraFieldsQueryKey, type JiraFieldMapping, type JiraField,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const selectClass = "rounded-md border bg-background p-2 text-sm w-full";
function ErrorMessage({ error }: { error: unknown }) {
  return error ? <p role="alert" className="text-sm text-destructive">The Jira operation failed. Check server configuration, permissions, or mapping references and try again.</p> : null;
}
function FieldEditor({ id, fields }: { id: number; fields: JiraField[] }) {
  const query = useGetJiraFieldMapping(id);
  const [draft, setDraft] = useState<JiraFieldMapping | null>(null);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const mutation = useSaveJiraFieldMapping({ mutation: { onSuccess: () => { setSaved(true); void query.refetch(); } } });
  const value = draft || query.data;
  if (!value) return <><ErrorMessage error={query.error} /><p>Loading field mapping…</p></>;
  return <div className="space-y-3">
    <Input aria-label="Search Jira fields" placeholder="Search field name, ID, or type…" value={search} onChange={e => setSearch(e.target.value)} />
    <p className="text-xs text-muted-foreground">System and custom fields are discovered from Jira. An unsaved mapping defaults to Jira's system due-date field; saved overrides (including None) are preserved.</p>
    {(["dueDateField", "blockedField", "storyPointsField"] as const).map((key, i) => <label className="block space-y-1 text-sm" key={key}>
      <span>{["Due date", "Blocked signal", "Story points"][i]}</span>
      <select className={selectClass} value={value[key] || ""} onChange={e => { setSaved(false); setDraft({ ...value, [key]: e.target.value || null }); }}>
        <option value="">None</option>
        {value[key] && !fields.some(f => f.id === value[key]) && <option value={value[key]}>{value[key]} (saved/system)</option>}
        {fields.filter(f => f.id === value[key] || `${f.id} ${f.name} ${f.fieldType || ""}`.toLowerCase().includes(search.toLowerCase())).map(f => <option key={f.id} value={f.id}>{f.name} · {f.id} · {f.custom ? "custom" : "system"} · {f.fieldType || "unknown type"}</option>)}
      </select>
    </label>)}
    <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ id, data: value })}>{mutation.isPending ? "Saving…" : "Save field mapping"}</Button>
    {saved && <p role="status" className="text-sm">Field mapping saved.</p>}
    <ErrorMessage error={mutation.error || query.error} />
  </div>;
}

export function JiraIntegration() {
  const connection = useGetJiraConnection();
  const projects = useListJiraProjects();
  const hubProjects = useListProjects();
  const statuses = useListJiraStatusMappings();
  const fields = useListJiraFields({ query: { queryKey: getListJiraFieldsQueryKey(), enabled: false, retry: false } });
  const [selected, setSelected] = useState("");
  const [scope, setScope] = useState("");
  const test = useTestJiraConnection({ mutation: { onSuccess: () => void connection.refetch() } });
  const discover = useDiscoverJiraProjects({ mutation: { onSuccess: () => void projects.refetch() } });
  const update = useUpdateJiraProject({ mutation: { onSuccess: () => void projects.refetch() } });
  const discoverStatuses = useDiscoverJiraStatuses({ mutation: { onSuccess: () => void statuses.refetch() } });
  const saveStatus = useSaveJiraStatusMapping({ mutation: { onSuccess: () => void statuses.refetch() } });
  const state = connection.data;
  const statusRows = (statuses.data || []).filter(s => s.jiraProjectId === null);
  return <Card>
    <CardHeader><CardTitle>Jira Integration</CardTitle><CardDescription>Jira foundation · connection, discovery, and execution mappings. Credentials remain server-side.</CardDescription></CardHeader>
    <CardContent>
      <Tabs defaultValue="connection">
        <TabsList className="flex flex-wrap h-auto justify-start">{["connection", "projects", "fields", "statuses"].map(tab => <TabsTrigger key={tab} value={tab} className="capitalize">{tab}</TabsTrigger>)}</TabsList>
        <TabsContent value="connection" className="space-y-4">
          <Badge variant="outline">Configured: {state?.configured ? "YES" : "NO"}</Badge>
          <dl className="grid gap-2 text-sm"><div>Base URL: {state?.baseUrl || "Not configured"}</div><div>Account: {state?.accountEmailMasked || "Not configured"}</div><div>Last test: {state?.lastTestStatus || "Not tested"} {state?.lastTestAt ? `· ${new Date(state.lastTestAt).toLocaleString()}` : ""}</div></dl>
          {state?.lastTestMessage && <p role="status" className="text-sm">{state.lastTestMessage}</p>}
          <p className="text-sm text-muted-foreground">Configure JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in server-side secrets. Never enter credentials into this page.</p>
          <Button disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? "Testing…" : "Test Connection"}</Button>
          <ErrorMessage error={test.error || connection.error} />
        </TabsContent>
        <TabsContent value="projects" className="space-y-4">
          <Button disabled={discover.isPending} onClick={() => discover.mutate()}>{discover.isPending ? "Discovering…" : "Discover Projects"}</Button>
          <p className="text-sm text-muted-foreground">Discovered Jira projects are available for work-item search. A Hub project may also be associated with more than one Jira project.</p>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{["Jira Key", "Jira Name", "Type", "Hub Project", "Last Discovered"].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead>
            <tbody>{projects.data?.map(p => <tr key={p.id} className="border-b"><td className="p-2">{p.key}</td><td className="p-2">{p.name}</td><td className="p-2">{p.projectType || "—"}</td><td className="p-2"><select aria-label={`Hub project for ${p.key}`} className={selectClass} disabled={update.isPending} value={p.projectId || ""} onChange={e => update.mutate({ id: p.id, data: { projectId: e.target.value ? Number(e.target.value) : null } })}><option value="">Unmapped</option>{hubProjects.data?.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></td><td className="p-2">{new Date(p.lastDiscoveredAt).toLocaleString()}</td></tr>)}</tbody></table></div>
          {!projects.data?.length && <p className="text-sm">No Jira projects discovered yet.</p>}
          <ErrorMessage error={discover.error || update.error || projects.error || hubProjects.error} />
        </TabsContent>
        <TabsContent value="fields" className="space-y-4">
          <Button disabled={fields.isFetching} onClick={() => void fields.refetch()}>{fields.isFetching ? "Discovering…" : "Discover Fields"}</Button>
          <label className="block text-sm">Jira project<select className={selectClass} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select project</option>{projects.data?.map(p => <option key={p.id} value={p.id}>{p.key} · {p.name}</option>)}</select></label>
          {selected && <FieldEditor key={selected} id={Number(selected)} fields={fields.data || []} />}
          <ErrorMessage error={fields.error} />
        </TabsContent>
        <TabsContent value="statuses" className="space-y-4">
          <Button disabled={discoverStatuses.isPending} onClick={() => discoverStatuses.mutate()}>{discoverStatuses.isPending ? "Discovering…" : "Discover Statuses"}</Button>
          <label className="block text-sm">Mapping scope<select className={selectClass} value={scope} onChange={e => setScope(e.target.value)}><option value="">Global defaults</option>{projects.data?.map(p => <option key={p.id} value={p.id}>{p.key} · {p.name}</option>)}</select></label>
          <p className="text-sm text-muted-foreground">Jira category metadata supplies initial defaults. Rediscovery never overwrites administrator choices. Project overrides take precedence over global defaults.</p>
          {statusRows.map(s => {
            const override = scope ? statuses.data?.find(x => x.jiraProjectId === Number(scope) && x.jiraStatusId === s.jiraStatusId) : s;
            return <label className="flex items-center justify-between gap-3 text-sm" key={s.id}><span>{s.jiraStatusName} · {s.jiraStatusId}{scope && !override ? " (global default)" : ""}</span><select className={`${selectClass} max-w-48`} disabled={saveStatus.isPending} value={override?.canonicalCategory || s.canonicalCategory} onChange={e => saveStatus.mutate({ data: { jiraProjectId: scope ? Number(scope) : null, jiraStatusId: s.jiraStatusId, jiraStatusName: s.jiraStatusName, canonicalCategory: e.target.value as "todo" | "in_progress" | "blocked" | "done" } })}>{[["todo", "To Do"], ["in_progress", "In Progress"], ["blocked", "Blocked"], ["done", "Done"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>;
          })}
          {!statusRows.length && <p className="text-sm">No statuses discovered yet.</p>}
          <ErrorMessage error={discoverStatuses.error || saveStatus.error || statuses.error} />
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>;
}