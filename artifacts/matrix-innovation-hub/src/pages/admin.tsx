import {
  useGetSettings,
  getGetSettingsQueryKey,
  useTestAiProvider,
  useListAiProviderTests,
  getListAiProviderTestsQueryKey,
} from "@workspace/api-client-react";
import type { ProviderTestEvent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  FlaskConical,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { AIProviderInfo } from "@workspace/api-client-react";
import { InitializeEnvironmentCard } from "@/components/init-wizard";

function formatTestTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy p");
}

function TestStatusBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <Badge className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-100">
      Passed
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 border border-red-300 hover:bg-red-100">
      Failed
    </Badge>
  );
}

function ProviderTestResultCard({ result }: { result: ProviderTestEvent }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {result.passed ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          <span className="font-semibold text-sm">{result.providerName}</span>
          <TestStatusBadge passed={result.passed} />
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTestTime(result.createdAt)}
        </span>
      </div>
      {result.errorMessage && (
        <p className="text-sm text-red-700">{result.errorMessage}</p>
      )}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Capabilities Tested
        </p>
        <div className="space-y-1.5">
          {result.capabilities.map(cap => (
            <div key={cap.capability} className="flex items-start gap-2 text-sm">
              {cap.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              )}
              <span className="font-mono text-xs mt-0.5 shrink-0">{cap.capability}()</span>
              <span className="text-xs text-muted-foreground">{cap.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderStatusBadges({ provider }: { provider: AIProviderInfo }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {provider.isActive ? (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary">Active</Badge>
      ) : (
        <Badge variant="secondary">Available</Badge>
      )}
      {provider.status !== "Active" && (
        <Badge className="bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100">
          Not Configured
        </Badge>
      )}
      {provider.lastTestPassed === true && (
        <Badge className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-100">
          Passed Last Test
        </Badge>
      )}
      {provider.lastTestPassed === false && (
        <Badge className="bg-red-100 text-red-700 border border-red-300 hover:bg-red-100">
          Failed Last Test
        </Badge>
      )}
    </div>
  );
}

function ProviderSummary({ provider }: { provider: AIProviderInfo }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{provider.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{provider.id}</span>
        </div>
        <ProviderStatusBadges provider={provider} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Last Test Result
          </p>
          {provider.lastTestPassed === null ? (
            <span className="text-sm text-muted-foreground">Never tested</span>
          ) : (
            <TestStatusBadge passed={provider.lastTestPassed} />
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Last Test Timestamp
          </p>
          <span className="text-sm">
            {provider.lastTestAt ? formatTestTime(provider.lastTestAt) : "—"}
          </span>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Capabilities
        </p>
        <div className="flex flex-wrap gap-1.5">
          {provider.capabilities.map(cap => (
            <Badge key={cap} variant="outline" className="font-mono text-xs font-normal">
              {cap}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Notes
        </p>
        <p className="text-sm text-muted-foreground">{provider.notes}</p>
      </div>
    </div>
  );
}

function ProviderSwitchingPreview({
  activeProvider,
  providers,
}: {
  activeProvider: string;
  providers: AIProviderInfo[];
}) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Provider Switching Preview</CardTitle>
        <CardDescription>
          A read-only preview of what switching providers would mean. Switching is not yet
          enabled — the active provider is controlled by the AI_PROVIDER environment variable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Current Active Provider
          </span>
          <Badge className="bg-primary text-primary-foreground hover:bg-primary">
            {activeProvider}
          </Badge>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">
            OpenAI, Claude, Azure OpenAI, and Local LLM are registered but not configured.
            Switching to any of them today would cause every AI capability to fail until the
            provider is implemented and configured. No API keys are stored in this application.
          </p>
        </div>
        <div className="space-y-2">
          {providers.map(p => (
            <div
              key={p.id}
              className="flex items-start gap-3 border-b pb-2.5 last:border-0 last:pb-0"
            >
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{p.label}</span>
                  {p.isActive ? (
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Available</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.switchImpact}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderTestHistory() {
  const { data, isLoading, isError } = useListAiProviderTests({
    query: { queryKey: getListAiProviderTestsQueryKey() },
  });

  if (isLoading) return <Skeleton className="h-24" />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load provider test history.
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No provider tests recorded yet. Run "Test Provider" above to record the
        first readiness test.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Tested At</th>
            <th className="py-2 pr-4 font-medium">Provider</th>
            <th className="py-2 pr-4 font-medium">Result</th>
            <th className="py-2 pr-4 font-medium">Capabilities</th>
            <th className="py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {data.map(event => {
            const passedCount = event.capabilities.filter(c => c.passed).length;
            return (
              <tr key={event.id} className="border-b last:border-0 align-top">
                <td className="py-2 pr-4 whitespace-nowrap">{formatTestTime(event.createdAt)}</td>
                <td className="py-2 pr-4">{event.providerName}</td>
                <td className="py-2 pr-4"><TestStatusBadge passed={event.passed} /></td>
                <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                  {passedCount}/{event.capabilities.length} passed
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {event.errorMessage ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin() {
  const { data: settings, isLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const [latestResult, setLatestResult] = useState<ProviderTestEvent | null>(null);
  const { data: testHistory } = useListAiProviderTests({
    query: { queryKey: getListAiProviderTestsQueryKey() },
  });
  const displayResult = latestResult ?? testHistory?.[0] ?? null;
  const testMutation = useTestAiProvider({
    mutation: {
      onSuccess: (result) => {
        setLatestResult(result);
        queryClient.invalidateQueries({ queryKey: getListAiProviderTestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
    },
  });

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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle>AI Provider Configuration</CardTitle>
                  <CardDescription>
                    All generated intelligence flows through a provider abstraction. No API keys are stored or shown here.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FlaskConical className="mr-2 h-4 w-4" />
                  )}
                  Test Provider
                </Button>
              </div>
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Registered Providers</p>
                <div className="space-y-3">
                  {settings.aiProvider.availableProviders.map(p => (
                    <ProviderSummary key={p.id} provider={p} />
                  ))}
                </div>
              </div>

              {testMutation.isError && (
                <p className="text-sm text-red-700">
                  The provider test could not be run. Check that the API server
                  is reachable and try again.
                </p>
              )}
              {displayResult && <ProviderTestResultCard result={displayResult} />}

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-muted-foreground">{settings.aiProvider.providerNotes}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {settings.aiProvider && (
          <ProviderSwitchingPreview
            activeProvider={settings.aiProvider.activeProvider}
            providers={settings.aiProvider.availableProviders}
          />
        )}

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Provider Test History</CardTitle>
            <CardDescription>
              Every readiness test run against a provider, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProviderTestHistory />
          </CardContent>
        </Card>

        <InitializeEnvironmentCard />
      </div>
    </div>
  );
}
