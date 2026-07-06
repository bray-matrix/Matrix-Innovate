import { useMemo } from "react";
import { useListInitiatives } from "@workspace/api-client-react";
import type { Initiative } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

const PROTOTYPE_SPRINT_DAYS = 14;

function prototypeDayLabel(day: number | null | undefined): string {
  if (day === null || day === undefined) return "—";
  return `Day ${day} of ${PROTOTYPE_SPRINT_DAYS}`;
}

export default function InitiativeList() {
  const { data: initiatives, isLoading } = useListInitiatives();
  const [, setLocation] = useLocation();

  const columns = useMemo<ColumnDef<Initiative, unknown>[]>(
    () => [
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        size: 90,
        meta: { title: "Initiative ID" },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            INI-{String(row.original.id).padStart(4, "0")}
          </span>
        ),
      },
      {
        id: "title",
        accessorKey: "title",
        header: "Title",
        size: 260,
        meta: { title: "Title" },
        cell: ({ row }) => (
          <span className="font-medium text-primary">{row.original.title}</span>
        ),
      },
      {
        id: "version",
        accessorKey: "version",
        header: "Version",
        size: 100,
        meta: { title: "Version" },
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.version}</span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 120,
        meta: { title: "Status" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "priority",
        accessorKey: "priority",
        header: "Priority",
        size: 110,
        meta: { title: "Priority" },
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: "score",
        accessorKey: "score",
        header: "Innovation Score",
        size: 130,
        meta: { title: "Innovation Score", align: "right" },
        cell: ({ row }) => (
          <span className="font-mono">{row.original.score}</span>
        ),
      },
      {
        id: "aiReadiness",
        accessorKey: "aiReadiness",
        header: "AI Readiness",
        size: 130,
        meta: { title: "AI Readiness" },
        cell: ({ row }) => row.original.aiReadiness || "—",
      },
      {
        id: "department",
        accessorKey: "department",
        header: "Department",
        size: 150,
        meta: { title: "Department" },
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Category",
        size: 150,
        meta: { title: "Category" },
      },
      {
        id: "businessOwner",
        accessorKey: "businessOwner",
        header: "Business Owner",
        size: 160,
        meta: { title: "Business Owner" },
        cell: ({ row }) => row.original.businessOwner || "—",
      },
      {
        id: "executiveSponsor",
        accessorKey: "executiveSponsor",
        header: "Executive Sponsor",
        size: 170,
        meta: { title: "Executive Sponsor" },
        cell: ({ row }) => row.original.executiveSponsor || "—",
      },
      {
        id: "assignedTeam",
        accessorKey: "assignedTeam",
        header: "Assigned Team",
        size: 150,
        meta: { title: "Assigned Team" },
        cell: ({ row }) => row.original.assignedTeam || "—",
      },
      {
        id: "currentPhase",
        accessorKey: "currentPhase",
        header: "Current Phase",
        size: 140,
        meta: { title: "Current Phase" },
        cell: ({ row }) => row.original.currentPhase || "—",
      },
      {
        id: "prototypeDay",
        accessorKey: "prototypeDay",
        header: "Prototype Day",
        size: 140,
        meta: {
          title: "Prototype Day",
          exportValue: (row) => prototypeDayLabel(row.prototypeDay),
        },
        cell: ({ row }) => prototypeDayLabel(row.original.prototypeDay),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Created Date",
        size: 130,
        meta: {
          title: "Created Date",
          exportValue: (row) => formatDate(row.createdAt),
        },
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Last Updated",
        size: 130,
        meta: {
          title: "Last Updated",
          exportValue: (row) => formatDate(row.updatedAt),
        },
        cell: ({ row }) => formatDate(row.original.updatedAt),
      },
      {
        id: "lastReviewedAt",
        accessorKey: "lastReviewedAt",
        header: "Last Reviewed",
        size: 130,
        meta: {
          title: "Last Reviewed",
          exportValue: (row) => formatDate(row.lastReviewedAt),
        },
        cell: ({ row }) => formatDate(row.original.lastReviewedAt),
      },
      {
        id: "nextReviewAt",
        accessorKey: "nextReviewAt",
        header: "Next Review Date",
        size: 140,
        meta: {
          title: "Next Review Date",
          exportValue: (row) => formatDate(row.nextReviewAt),
        },
        cell: ({ row }) => formatDate(row.original.nextReviewAt),
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Initiatives</h2>
        <p className="text-muted-foreground">
          Manage and track all innovation initiatives.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={initiatives ?? []}
        onRowClick={(row) => setLocation(`/initiatives/${row.id}`)}
        searchPlaceholder="Search initiatives..."
        exportFileName="initiatives"
        initialPageSize={25}
        emptyMessage="No initiatives found."
        initialColumnVisibility={{
          businessOwner: false,
          executiveSponsor: false,
          assignedTeam: false,
          currentPhase: false,
          lastReviewedAt: false,
          nextReviewAt: false,
        }}
      />
    </div>
  );
}
