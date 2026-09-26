import { useState, type FormEvent } from "react";
import {
  useListJiraProjects, useSearchJiraIssues,
  getListJiraProjectsQueryKey, getSearchJiraIssuesQueryKey,
  type JiraWorkItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withBase } from "@/lib/base-path";

export type JiraIntakeContext = JiraWorkItem & { description?: string | null };

export function InterviewJiraPicker({ onConfirm, onSkip }: {
  onConfirm: (item: JiraIntakeContext) => void;
  onSkip: () => void;
}) {
  const [query, setQuery] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [criteria, setCriteria] = useState<{ q?: string; projectKey?: string; limit: number } | null>(null);
  const [selected, setSelected] = useState<JiraWorkItem | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState("");
  const projects = useListJiraProjects({ query: { queryKey: getListJiraProjectsQueryKey(), retry: false } });
  const results = useSearchJiraIssues(criteria ?? { limit: 25 }, {
    query: { enabled: !!criteria, queryKey: getSearchJiraIssuesQueryKey(criteria ?? { limit: 25 }), retry: false },
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() && !projectKey) return;
    const next = { ...(query.trim() ? { q: query.trim() } : {}), ...(projectKey ? { projectKey } : {}), limit: 25 };
    setSelected(null);
    setContextError("");
    if (JSON.stringify(criteria) === JSON.stringify(next)) void results.refetch();
    else setCriteria(next);
  }

  async function confirm() {
    if (!selected) return;
    setLoadingContext(true);
    setContextError("");
    try {
      const response = await fetch(withBase(`/api/jira/issues/${encodeURIComponent(selected.jiraIssueId)}/intake-context`), { credentials: "include" });
      if (!response.ok) throw new Error(`Could not read Jira request (${response.status}). Please retry or continue without Jira.`);
      const context = await response.json() as JiraIntakeContext;
      if (context.jiraIssueId !== selected.jiraIssueId) throw new Error("The Jira request did not match your selection. Please retry.");
      onConfirm(context);
    } catch (error) {
      setContextError(error instanceof Error ? error.message : "Could not read Jira context. Please retry.");
    } finally {
      setLoadingContext(false);
    }
  }

  return <div className="max-w-2xl mx-auto space-y-5 py-8">
    <div><h2 className="text-2xl font-bold">Start your innovation request</h2>
      <p className="text-muted-foreground mt-2">Is there already a Jira request or work item related to this idea? This is optional; we will only read it, not change it.</p></div>
    <Button variant="outline" onClick={onSkip}>No — Continue without Jira</Button>
    <div className="rounded-lg border p-5 space-y-4">
      <h3 className="font-semibold">Yes — Find Jira Work Item</h3>
      <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1"><Label htmlFor="intake-jira-query">Issue key or summary</Label><Input id="intake-jira-query" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} placeholder="ABC-123 or onboarding" /></div>
        <div className="space-y-1"><Label htmlFor="intake-jira-project">Jira project (optional)</Label>
          <select id="intake-jira-project" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={projectKey} onChange={e => setProjectKey(e.target.value)}>
            <option value="">All projects</option>{projects.data?.map(project => <option key={project.id} value={project.key}>{project.key} · {project.name}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={results.isFetching || (!query.trim() && !projectKey)}>Search Jira</Button>
      </form>
      {projects.isError && <p role="alert" className="text-sm text-destructive">Jira projects could not be loaded. Search by key or text instead.</p>}
      {results.isError && <p role="alert" className="text-sm text-destructive">Jira search is unavailable. Please retry or continue without Jira.</p>}
      {results.isFetching && <p role="status">Searching Jira…</p>}
      {criteria && !results.isFetching && !results.isError && !results.data?.length && <p>No Jira work items found. Try another search.</p>}
      {criteria && !!results.data?.length && <div role="radiogroup" aria-label="Jira work items" className="space-y-2 max-h-64 overflow-y-auto">
        {results.data.map(item => <button key={item.jiraIssueId} type="button" role="radio" aria-checked={selected?.jiraIssueId === item.jiraIssueId} onClick={() => setSelected(item)} className={`w-full text-left rounded-md border p-3 text-sm ${selected?.jiraIssueId === item.jiraIssueId ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
          <span className="font-mono font-semibold">{item.jiraIssueKey}</span> · {item.status}
          <span className="block font-medium">{item.summary}</span>
          <span className="block text-muted-foreground">{item.jiraProjectName} ({item.jiraProjectKey}) · {item.jiraIssueType}</span>
        </button>)}
      </div>}
      {selected && <p>Selected: <strong>{selected.jiraIssueKey}</strong> — {selected.summary}</p>}
      {contextError && <p role="alert" className="text-sm text-destructive">{contextError}</p>}
      <Button onClick={() => void confirm()} disabled={!selected || loadingContext}>{loadingContext ? "Reading Jira context…" : "Confirm selected work item"}</Button>
    </div>
  </div>;
}