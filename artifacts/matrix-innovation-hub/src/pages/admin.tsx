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
          v{settings.applicationVersion}
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
      </div>
    </div>
  );
}
