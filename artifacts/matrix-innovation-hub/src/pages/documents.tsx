import { useListDocuments } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, User, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const GUIDANCE: { term: string; text: string }[] = [
  { term: "Initiative", text: "Evaluates whether an idea or opportunity is worth pursuing. Saved from Develop an idea or Enter a defined idea." },
  { term: "Project", text: "Manages work selected for planning or delivery: milestones, risks, project approvals, readiness and assigned resources." },
  { term: "Recommended path", text: "Develop an idea, save the initiative, evaluate it, create a linked project, then manage the project. These steps are recommended, not mandatory gates." },
  { term: "Create linked project", text: "Creates a separate project. The initiative remains intact, the link between them is kept, and existing initiative Jira links are carried over. It is not a formal approval." },
  { term: "Direct project creation", text: "Available for work that is already well defined. Starting with an initiative is recommended because it establishes scope, expected outcomes and business justification." },
  { term: "Project owner", text: "The person accountable for successful delivery. In many Matrix projects the project owner is also the project manager." },
  { term: "Executive sponsor", text: "Provides leadership sponsorship and helps remove obstacles. Recorded on initiatives." },
  { term: "Assigned resources", text: "People or departments performing project work, managed in People & capacity and on each project." },
  { term: "Client", text: "An individual Matrix customer or account." },
  { term: "Organization", text: "An optional parent company or corporate entity." },
  { term: "Program", text: "An optional grouping of related projects." },
  { term: "Delivery health", text: "Calculated from project data unless someone sets a manual override, which is labeled as such." },
];

export default function Documents() {
  const { data: documents, isLoading, isError, refetch } = useListDocuments();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Help &amp; guides</h2>
        <p className="text-muted-foreground">Short explanations of how Innovation Hub works today.</p>
      </div>

      <Card data-testid="card-help-guidance">
        <CardHeader>
          <CardTitle className="text-base">Key terms and workflow</CardTitle>
          <CardDescription>Working definitions for this release. Some are provisional and may be refined.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2">
            {GUIDANCE.map(g => (
              <div key={g.term}>
                <dt className="text-sm font-semibold">{g.term}</dt>
                <dd className="text-sm text-muted-foreground">{g.text}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/interview" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted" data-testid="link-help-develop-idea">Develop an idea</Link>
            <Link href="/projects/new" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted" data-testid="link-help-create-project">Create project</Link>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Governance documents</h3>
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="text-documents-unavailable">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>These documents are planned but not yet published, so they cannot be opened or downloaded here. Nothing listed below is an approved Matrix policy until it is published.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm" role="alert">
            The document list could not be loaded.
            <Button size="sm" variant="outline" onClick={() => void refetch()} data-testid="button-retry-documents">Retry</Button>
          </div>
        ) : !documents || documents.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-dashed">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No governance documents are listed yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <Card key={doc.id} className="flex flex-col" data-testid={`card-document-${doc.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <Badge variant="secondary">{doc.status}</Badge>
                  </div>
                  <CardTitle className="line-clamp-2" title={doc.title}>{doc.title}</CardTitle>
                  <CardDescription>Version {doc.version}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <User className="mr-2 h-4 w-4" /> {doc.owner}
                  </div>
                  <p className="text-xs text-muted-foreground">Not available to download yet.</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
