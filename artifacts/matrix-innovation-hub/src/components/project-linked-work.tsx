import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetJiraConnection, useListJiraProjects, useSearchJiraIssues, useListProjectJiraLinks,
  useCreateProjectJiraLink, useDeleteProjectJiraLink, getListProjectJiraLinksQueryKey,
  getListJiraProjectsQueryKey, getSearchJiraIssuesQueryKey,
  type JiraWorkItem, type ProjectJiraLink,
} from "@workspace/api-client-react";
import { AlertCircle, ArrowUpRight, Link2, PlusCircle, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

function jiraUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

function updatedAt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function ProjectLinkedWork({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const links = useListProjectJiraLinks(projectId, {
    query: { enabled: projectId > 0, queryKey: getListProjectJiraLinksQueryKey(projectId), retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const connection = useGetJiraConnection();
  const [linkOpen, setLinkOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [searchCriteria, setSearchCriteria] = useState<{ q?: string; projectKey?: string; limit: number } | null>(null);
  const [selected, setSelected] = useState<JiraWorkItem | null>(null);
  const confirming = useRef(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [unlinking, setUnlinking] = useState<ProjectJiraLink | null>(null);
  const projects = useListJiraProjects({ query: { enabled: linkOpen, queryKey: getListJiraProjectsQueryKey() } });
  const search = useSearchJiraIssues(searchCriteria ?? { limit: 25 }, {
    query: { enabled: linkOpen && searchCriteria !== null, queryKey: getSearchJiraIssuesQueryKey(searchCriteria ?? { limit: 25 }), retry: false },
  });
  const refreshLinks = () => void queryClient.invalidateQueries({ queryKey: getListProjectJiraLinksQueryKey(projectId) });
  const create = useCreateProjectJiraLink({
    mutation: {
      onSuccess: () => {
        confirming.current = false;
        setConfirmPending(false);
        refreshLinks();
        setLinkOpen(false);
        setSelected(null);
        toast({ title: "Jira work item linked" });
      },
      onError: () => {
        confirming.current = false;
        setConfirmPending(false);
        toast({ title: "Could not link Jira work item", description: "The item may already be linked, or Jira may be unavailable. Please try again.", variant: "destructive" });
      },
    },
  });
  const remove = useDeleteProjectJiraLink({
    mutation: {
      onSuccess: () => {
        refreshLinks();
        setUnlinking(null);
        toast({ title: "Jira work item unlinked" });
      },
      onError: () => toast({ title: "Could not unlink Jira work item", variant: "destructive" }),
    },
  });

  function openLinkDialog() {
    setSearchText("");
    setProjectKey("");
    setSearchCriteria(null);
    setSelected(null);
    setLinkOpen(true);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchText.trim();
    if (!q && !projectKey) return;
    setSelected(null);
    const criteria = { ...(q ? { q } : {}), ...(projectKey ? { projectKey } : {}), limit: 25 };
    if (JSON.stringify(criteria) === JSON.stringify(searchCriteria)) {
      void search.refetch();
    } else {
      setSearchCriteria(criteria);
    }
  }

  function confirmLink() {
    if (!selected || confirming.current) return;
    confirming.current = true; // synchronous guard, before React's next render
    setConfirmPending(true);
    create.mutate({ projectId, data: { jiraIssueId: selected.jiraIssueId } });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Linked Work</CardTitle>
            <CardDescription className="mt-1">Selected execution work stays in Jira. Linked issue details update automatically when needed; Jira issues are never changed here.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-testid="button-link-jira" onClick={openLinkDialog}><PlusCircle className="h-4 w-4 mr-2" />Link Jira Work Item</Button>
          </div>
        </CardHeader>
        <CardContent>
          {links.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading linked work…</p>}
          {links.isError && <p role="alert" className="mb-3 text-sm text-destructive">Could not load saved Jira links. The rest of this project is still available. Reopen Linked Work to try again.</p>}
          {!links.isLoading && !links.isError && !links.data?.length && (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No external work items linked yet. Choose Jira work items to connect execution to this project.</div>
          )}
          <div className="space-y-3">
            {links.data?.map(link => {
              const detail = link.details;
              const url = jiraUrl(detail?.url) || jiraUrl(connection.data?.baseUrl
                ? `${connection.data.baseUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(link.jiraIssueKey)}`
                : undefined);
              return (
                <div key={link.id} data-testid={`card-jira-link-${link.id}`} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Jira</Badge>
                        <span data-testid={`text-jira-key-${link.id}`} className="font-mono text-sm font-semibold">{link.jiraIssueKey}</span>
                        <Badge variant="secondary">{detail?.jiraIssueType || link.jiraIssueType}</Badge>
                        {detail?.status && <Badge variant="outline" data-testid={`status-jira-${link.id}`}>{detail.status}</Badge>}
                      </div>
                      {detail ? (
                        <p data-testid={`text-jira-summary-${link.id}`} className="font-medium break-words">{detail.summary}</p>
                      ) : (
                        <p role="status" className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400"><AlertCircle className="h-4 w-4 shrink-0" />Current Jira details temporarily unavailable. Saved reference remains linked.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {url && <Button variant="outline" size="sm" asChild><a href={url} target="_blank" rel="noopener noreferrer" data-testid={`link-open-jira-${link.id}`}>Open in Jira <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></a></Button>}
                      <Button variant="ghost" size="sm" onClick={() => setUnlinking(link)} data-testid={`button-unlink-jira-${link.id}`}><Unlink className="h-3.5 w-3.5 mr-1" />Unlink</Button>
                    </div>
                  </div>
                  {detail && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <div><dt>Jira project</dt><dd className="text-foreground">{detail.jiraProjectName} ({detail.jiraProjectKey})</dd></div>
                    <div><dt>Assignee</dt><dd className="text-foreground">{detail.assignee || "Unassigned"}</dd></div>
                    <div><dt>Priority</dt><dd className="text-foreground">{detail.priority || "—"}</dd></div>
                    <div><dt>Last updated</dt><dd className="text-foreground">{updatedAt(detail.updated)}</dd></div>
                  </dl>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={linkOpen} onOpenChange={open => { if (!create.isPending) setLinkOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Jira Work Item</DialogTitle>
            <DialogDescription>Search Jira by exact issue key or text. Text matches are Jira search results, not ranked recommendations. Select one result to enable Confirm Link.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSearch} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1"><Label htmlFor="jira-search-text">Key or summary</Label><Input id="jira-search-text" data-testid="input-jira-search" maxLength={200} placeholder="e.g. ABC-123 or onboarding" value={searchText} onChange={event => setSearchText(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="jira-search-project">Jira project (optional)</Label>
                <select id="jira-search-project" data-testid="select-jira-project" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={projectKey} onChange={event => setProjectKey(event.target.value)}>
                  <option value="">All projects</option>
                  {projects.data?.map(project => <option value={project.key} key={project.id}>{project.key} · {project.name}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={search.isFetching || (!searchText.trim() && !projectKey)} data-testid="button-search-jira">{search.isFetching ? "Searching…" : "Search Jira"}</Button>
            </div>
            {projects.isError && <p role="alert" className="text-xs text-destructive">Jira projects could not be loaded. You can still search by key or text.</p>}
          </form>
          {search.isError && <p role="alert" className="text-sm text-destructive">Jira search is unavailable. Check your connection and try again.</p>}
          {search.isFetching && <p role="status" className="text-sm text-muted-foreground">Searching Jira…</p>}
          {searchCriteria && !search.isFetching && !search.isError && !search.data?.length && <p className="text-sm text-muted-foreground">No Jira work items found. Try a different key, text, or project.</p>}
          {searchCriteria && !search.isError && !!search.data?.length && <div role="radiogroup" aria-label="Jira search results — select one to link" className="space-y-2 max-h-64 overflow-y-auto">
            {search.data.map(item => {
              const alreadyLinked = links.data?.some(link => link.jiraIssueId === item.jiraIssueId);
              return <button key={item.jiraIssueId} type="button" role="radio" aria-checked={selected?.jiraIssueId === item.jiraIssueId} disabled={alreadyLinked || confirmPending} data-testid={`button-select-jira-${item.jiraIssueKey}`} onClick={() => setSelected(item)} className={`w-full rounded-md border-2 p-3 text-left text-sm transition-colors ${selected?.jiraIssueId === item.jiraIssueId ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted/50"} disabled:opacity-50`}>
                <span className="flex flex-wrap items-center gap-2"><span aria-hidden="true" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected?.jiraIssueId === item.jiraIssueId ? "border-primary" : "border-muted-foreground"}`}>{selected?.jiraIssueId === item.jiraIssueId && <span className="h-2 w-2 rounded-full bg-primary" />}</span><span className="font-mono font-semibold">{item.jiraIssueKey}</span><Badge variant="outline">{item.jiraIssueType}</Badge><Badge variant="secondary">{item.status}</Badge>{alreadyLinked && <span className="text-xs">Already linked</span>}{selected?.jiraIssueId === item.jiraIssueId && <span className="ml-auto font-semibold text-primary">Selected</span>}</span>
                <span className="block font-medium mt-1">{item.summary}</span>
                <span className="block text-xs text-muted-foreground mt-1">{item.jiraProjectName} ({item.jiraProjectKey}) · {item.assignee || "Unassigned"} · {item.priority || "No priority"}</span>
              </button>;
            })}
          </div>}
          {selected && <p role="status" className="rounded-md bg-muted p-3 text-sm"><Link2 className="inline h-4 w-4 mr-1" />Link <strong>{selected.jiraIssueKey}</strong> — {selected.summary} to this project?</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={confirmPending} data-testid="button-cancel-jira-link">Cancel</Button>
            <Button disabled={!selected || confirmPending} onClick={confirmLink} data-testid="button-confirm-jira-link">{confirmPending ? "Linking…" : selected ? "Confirm Link" : "Select a result to link"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!unlinking} onOpenChange={open => { if (!open && !remove.isPending) setUnlinking(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Jira work item?</DialogTitle>
            <DialogDescription>Remove {unlinking?.jiraIssueKey} from this Hub project? This only removes the link. The Jira issue will not be changed or deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlinking(null)} disabled={remove.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} data-testid="button-confirm-jira-unlink" onClick={() => unlinking && remove.mutate({ projectId, linkId: unlinking.id })}>{remove.isPending ? "Unlinking…" : "Unlink"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}