import { useGetSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Admin() {
  const { data: settings, isLoading } = useGetSettings();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Settings</h2>
          <p className="text-muted-foreground">System configuration and application metadata.</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {settings.applicationVersion}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
            <CardDescription>Configured business units</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {settings.departments.map(dept => (
                <Badge key={dept} variant="secondary">{dept}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Initiative classification types</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {settings.categories.map(cat => (
                <Badge key={cat} variant="secondary">{cat}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statuses</CardTitle>
            <CardDescription>Workflow progression states</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {settings.statuses.map(stat => (
                <Badge key={stat} variant="secondary">{stat}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scoring Weights</CardTitle>
            <CardDescription>Maximum values for scoring components</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {settings.scoringWeights.map(sw => (
                <div key={sw.name} className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-sm">{sw.name}</span>
                  <Badge variant="outline" className="font-mono">{sw.weight > 0 ? `+${sw.weight}` : sw.weight}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {settings.aiProvider && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>AI Provider Configuration</CardTitle>
              <CardDescription>
                All generated intelligence flows through a provider abstraction. Read-only view — no API keys are stored or shown here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Active Provider</p>
                  <Badge className="bg-primary text-primary-foreground">{settings.aiProvider.activeProvider}</Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                  <Badge variant={settings.aiProvider.providerStatus === "Active" ? "default" : "outline"}>
                    {settings.aiProvider.providerStatus}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last Provider Test</p>
                  <span className="text-sm">
                    {settings.aiProvider.lastProviderTest
                      ? new Date(settings.aiProvider.lastProviderTest).toLocaleString()
                      : "Never run"}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Available Providers</p>
                <div className="space-y-2">
                  {settings.aiProvider.availableProviders.map(p => (
                    <div key={p.id} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
                      <div>
                        <span className="font-medium text-sm">{p.label}</span>
                        <p className="text-xs text-muted-foreground">{p.notes}</p>
                      </div>
                      <Badge variant={p.status === "Active" ? "default" : "secondary"} className="shrink-0">
                        {p.status === "Active" ? "Active" : "Not Configured"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-muted-foreground">{settings.aiProvider.providerNotes}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
