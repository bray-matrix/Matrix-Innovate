import { useListDocuments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, FileText, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Documents() {
  const { data: documents, isLoading } = useListDocuments();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-20 bg-card rounded-xl border border-dashed">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No Documents</h3>
        <p className="text-muted-foreground">There are no governance documents available at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Document Library</h2>
        <p className="text-muted-foreground">Access templates, policies, and governance guidelines.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex flex-col">
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
            <CardContent className="flex-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <User className="mr-2 h-4 w-4" /> {doc.owner}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
