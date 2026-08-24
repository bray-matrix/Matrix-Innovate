import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  useListOrganizations,
  useListClients,
  useListPrograms,
} from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, PlusCircle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PriorityBadge } from "@/components/badges";

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
      header: "Context",
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
      accessorKey: "health",
      header: "Health",
      size: 120,
      meta: { filterable: true },
      cell: ({ row }) => (
        <Badge variant="outline" className={HEALTH_COLORS[row.original.health] ?? ""}>
          {row.original.health}
        </Badge>
      ),
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
  ], [orgMap, clientMap, programMap]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-8 w-8 text-primary" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Track and manage execution of active projects.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> New Project
          </Button>
        </Link>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4">
        <DataTable 
          columns={columns} 
          data={projects ?? []} 
          
          
          
        />
      </div>
    </div>
  );
}
