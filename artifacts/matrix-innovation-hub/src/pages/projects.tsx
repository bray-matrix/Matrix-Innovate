import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  useListOrganizations,
  useListClients,
  useListPrograms,
  useGetPortfolio,
} from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, PlusCircle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PriorityBadge } from "@/components/badges";
import { buildHealthIndex, healthSortValue } from "@/lib/project-details";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

const STAGE_COLORS: Record<string, string> = {
  "Planning": "bg-slate-100 text-slate-700 border-slate-200",
  "Ready": "bg-blue-100 text-blue-700 border-blue-200",
  "In Progress": "bg-purple-100 text-purple-700 border-purple-200",
  "On Hold": "bg-amber-100 text-amber-700 border-amber-200",
  "Completed": "bg-green-100 text-green-700 border-green-200",
  "Cancelled": "bg-gray-100 text-gray-500 border-gray-200",
};

const HEALTH_COLORS: Record<string, string> = {
  "On Track": "bg-green-100 text-green-700 border-green-200",
  "At Risk": "bg-amber-100 text-amber-700 border-amber-200",
  "Off Track": "bg-red-100 text-red-700 border-red-200",
  "Unknown": "bg-slate-100 text-slate-500 border-slate-200",
};

export default function ProjectsPage() {
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const { data: organizations, isLoading: orgsLoading } = useListOrganizations();
  const { data: clients, isLoading: clientsLoading } = useListClients();
  const { data: programs, isLoading: programsLoading } = useListPrograms();

  const { data: portfolio, isLoading: portfolioLoading, isError: portfolioError, refetch: refetchPortfolio } = useGetPortfolio();
  const healthOf = useMemo(() => buildHealthIndex(portfolio?.rows, portfolioLoading), [portfolio, portfolioLoading]);

  const orgMap = useMemo(() => new Map((organizations ?? []).map(o => [o.id, o.name])), [organizations]);
  const clientMap = useMemo(() => new Map((clients ?? []).map(c => [c.id, c.name])), [clients]);
  const programMap = useMemo(() => new Map((programs ?? []).map(p => [p.id, p.name])), [programs]);

  const columns = useMemo<ColumnDef<Project>[]>(() => [
    {
      accessorKey: "name",
      header: "Project",
      size: 250,
      cell: ({ row }) => (
        <div>
          <Link href={`/projects/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">
            {row.original.projectType}
          </div>
        </div>
      ),
    },
    {
      id: "context",
      header: "Client / program",
      size: 200,
      cell: ({ row }) => {
        const parts = [];
        if (row.original.organizationId) parts.push(orgMap.get(row.original.organizationId) || "Org");
        if (row.original.clientId) parts.push(clientMap.get(row.original.clientId) || "Client");
        if (row.original.programId) parts.push(programMap.get(row.original.programId) || "Program");
        return <span className="text-muted-foreground text-sm">{parts.length ? parts.join(" / ") : "Internal"}</span>;
      },
    },
    {
      accessorKey: "lifecycleStage",
      header: "Stage",
      size: 130,
      meta: { filterable: true },
      cell: ({ row }) => (
        <Badge variant="outline" className={STAGE_COLORS[row.original.lifecycleStage] ?? ""}>
          {row.original.lifecycleStage}
        </Badge>
      ),
    },
    {
      id: "effectiveHealth",
      accessorFn: (row) => healthSortValue(healthOf(row.id)),
      header: "Health",
      size: 140,
      meta: { filterable: true },
      cell: ({ row }) => {
        const h = healthOf(row.original.id);
        if (h.status === "loading") return <span className="inline-block h-5 w-16 rounded bg-muted animate-pulse" data-testid={`status-health-loading-${row.original.id}`} />;
        if (h.status === "unavailable") return <span className="text-xs text-muted-foreground" title="Calculated health is not available right now" data-testid={`status-health-${row.original.id}`}>Unavailable</span>;
        return (
          <div className="flex flex-col items-start gap-0.5" data-testid={`status-health-${row.original.id}`}>
            <Badge variant="outline" className={HEALTH_COLORS[h.effective] ?? ""}>{h.effective}</Badge>
            <span className="text-[10px] text-muted-foreground" title={h.overridden ? `Calculated: ${h.calculated}` : undefined}>
              {h.overridden ? `Manual override (calc. ${h.calculated})` : "Calculated"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "priority",
      header: "Priority",
      size: 110,
      meta: { filterable: true },
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      accessorKey: "primaryOwner",
      header: "Owner",
      size: 150,
      cell: ({ row }) => row.original.primaryOwner || "—",
    },
    {
      accessorKey: "targetDate",
      header: "Target",
      size: 110,
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.targetDate)}</span>,
    }
  ], [orgMap, clientMap, programMap, healthOf]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-8 w-8 text-primary" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Work selected for planning or delivery. Health matches Portfolio: calculated unless manually overridden.
          </p>
        </div>
        <Link href="/projects/new" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" data-testid="link-create-project">
          <PlusCircle className="mr-2 h-4 w-4" /> Create project
        </Link>
      </div>
      {portfolioError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="alert-health-unavailable">
          Calculated project health could not be loaded, so health is shown as Unavailable rather than a stored value.
          <Button size="sm" variant="outline" onClick={() => void refetchPortfolio()} data-testid="button-retry-health">Retry</Button>
        </div>
      )}

      <div className="bg-card rounded-xl border shadow-sm p-4">
        <DataTable 
          columns={columns} 
          data={projects ?? []} 
          
          
          
        />
      </div>
    </div>
  );
}
