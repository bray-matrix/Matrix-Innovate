import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetPortfolio } from "@workspace/api-client-react";
import type { PortfolioRow } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Briefcase, AlertCircle, AlertTriangle, CalendarClock, Target, Flag } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PriorityBadge } from "@/components/badges";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

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

const RISK_SEVERITY_COLORS: Record<string, string> = {
  "Critical": "bg-red-100 text-red-700 border-red-200",
  "High": "bg-orange-100 text-orange-700 border-orange-200",
  "Medium": "bg-amber-100 text-amber-700 border-amber-200",
  "Low": "bg-slate-100 text-slate-600 border-slate-200",
  "None": "bg-slate-50 text-slate-400 border-slate-100",
};

const READINESS_COLORS: Record<string, string> = {
  "Ready": "bg-green-100 text-green-700 border-green-200",
  "At Risk": "bg-amber-100 text-amber-700 border-amber-200",
  "Not Ready": "bg-red-100 text-red-700 border-red-200",
  "Not Started": "bg-slate-100 text-slate-600 border-slate-200",
};

export default function PortfolioPage() {
  const { data: portfolio, isLoading } = useGetPortfolio();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [contextFilter, setContextFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const owners = useMemo(() => {
    if (!portfolio?.rows) return [];
    const distinct = new Set(portfolio.rows.map(r => r.primaryOwner).filter(Boolean));
    return Array.from(distinct).sort();
  }, [portfolio?.rows]);

  const filteredRows = useMemo(() => {
    if (!portfolio?.rows) return [];
    let rows = portfolio.rows;
    
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(r => 
        r.name.toLowerCase().includes(s) || 
        r.primaryOwner.toLowerCase().includes(s) ||
        r.context.toLowerCase().includes(s)
      );
    }
    
    if (typeFilter !== "all") {
      rows = rows.filter(r => r.projectType === typeFilter);
    }
    if (healthFilter !== "all") {
      rows = rows.filter(r => r.effectiveHealth === healthFilter);
    }
    if (ownerFilter !== "all") {
      rows = rows.filter(r => r.primaryOwner === ownerFilter);
    }
    if (contextFilter !== "all") {
      if (contextFilter === "client") rows = rows.filter(r => !!r.clientId);
      else if (contextFilter === "internal") rows = rows.filter(r => !r.clientId);
    }
    if (priorityFilter !== "all") {
      rows = rows.filter(r => r.priority === priorityFilter);
    }

    return rows;
  }, [portfolio?.rows, search, typeFilter, healthFilter, ownerFilter, contextFilter, priorityFilter]);

  const columns = useMemo<ColumnDef<PortfolioRow>[]>(() => [
    {
      accessorKey: "name",
      header: "Project",
      size: 250,
      cell: ({ row }) => (
        <div>
          <Link href={`/projects/${row.original.id}`} className="font-medium hover:underline text-primary">
            {row.original.name}
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
            <span>{row.original.projectType}</span>
            <span>&bull;</span>
            <span className="truncate max-w-[150px]">{row.original.context}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "lifecycleStage",
      header: "Stage",
      size: 110,
      cell: ({ row }) => (
        <Badge variant="outline" className={STAGE_COLORS[row.original.lifecycleStage] ?? ""}>
          {row.original.lifecycleStage}
        </Badge>
      ),
    },
    {
      accessorKey: "effectiveHealth",
      header: "Health",
      size: 130,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={HEALTH_COLORS[row.original.effectiveHealth] ?? ""}>
            {row.original.effectiveHealth}
          </Badge>
          {row.original.healthOverridden && (
            <div title="Manual Override">
              <AlertCircle className="h-3 w-3 text-amber-500" />
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      size: 100,
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      accessorKey: "primaryOwner",
      header: "Owner",
      size: 120,
      cell: ({ row }) => <span className="text-sm">{row.original.primaryOwner || "—"}</span>,
    },
    {
      id: "milestones",
      header: "Milestones",
      size: 120,
      cell: ({ row }) => {
        const total = row.original.milestonesTotal;
        if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
        const progress = (row.original.milestonesCompleted / total) * 100;
        return (
          <div className="w-full space-y-1.5" title={`${row.original.milestonesCompleted} of ${total} completed`}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{row.original.milestonesCompleted}/{total}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        );
      }
    },
    {
      accessorKey: "targetDate",
      header: "Target",
      size: 100,
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.targetDate)}</span>,
    },
    {
      accessorKey: "topOpenRiskSeverity",
      header: "Top Risk",
      size: 90,
      cell: ({ row }) => {
        const severity = row.original.topOpenRiskSeverity || "None";
        return (
          <Badge variant="outline" className={RISK_SEVERITY_COLORS[severity] ?? ""}>
            {severity}
          </Badge>
        );
      }
    },
    {
      accessorKey: "readinessStatus",
      header: "Go-Live",
      size: 110,
      cell: ({ row }) => {
        const r = row.original.readinessStatus || "Not Started";
        return (
          <Badge variant="outline" className={READINESS_COLORS[r] ?? ""}>
            {r}
          </Badge>
        );
      }
    },
    {
      accessorKey: "pendingApprovals",
      header: "Approvals",
      size: 90,
      cell: ({ row }) => {
        const count = row.original.pendingApprovals;
        if (count === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return <Badge variant="secondary">{count} Pending</Badge>;
      }
    }
  ], []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!portfolio) {
    return <div>Failed to load portfolio.</div>;
  }

  const { summary } = portfolio;

  const statCards = [
    { title: "Active", value: summary.activeProjects, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "At Risk / Off Track", value: summary.atRiskProjects + summary.offTrackProjects, icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-50" },
    { title: "Due ≤30d", value: summary.dueSoonProjects, icon: CalendarClock, color: "text-red-500", bg: "bg-red-50" },
    { title: "Crit/High Risks", value: summary.openCriticalHighRisks, icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
    { title: "Pending Approvals", value: summary.pendingApprovals, icon: Flag, color: "text-indigo-500", bg: "bg-indigo-50" },
    { title: "Not Ready (Go-Live)", value: summary.notReadyProjects, icon: Target, color: "text-pink-500", bg: "bg-pink-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PieChart className="h-8 w-8 text-primary" />
            Portfolio
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            High-level health and delivery readiness across all projects.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map(s => (
          <Card key={s.title} className="shadow-sm border-muted">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-md ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold leading-tight">{s.value}</div>
                <div className="text-xs text-muted-foreground truncate" title={s.title}>{s.title}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link href="/resources" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
          <Card className="shadow-sm border-muted hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-red-50">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Overallocated</div>
                  <div className="text-xs text-muted-foreground">Resources &gt; 100% capacity</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-red-600">{summary.overallocatedResources}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/resources" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
          <Card className="shadow-sm border-muted hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-amber-50">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Near Capacity</div>
                  <div className="text-xs text-muted-foreground">Resources at 90-100% capacity</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-amber-500">{summary.nearCapacityResources}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/resources" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
          <Card className="shadow-sm border-muted hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-50">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Unfilled Demand</div>
                  <div className="text-xs text-muted-foreground">Department-only assignments</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-blue-600">{summary.unfilledDepartmentDemand}</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center bg-card p-3 rounded-lg border shadow-sm">
        <div className="flex-1 w-full relative">
          <Input 
            placeholder="Search projects, owners, context..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] bg-background"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Client Implementation">Client Implementation</SelectItem>
              <SelectItem value="Internal Technology">Internal Technology</SelectItem>
              <SelectItem value="Internal Operations">Internal Operations</SelectItem>
              <SelectItem value="Innovation">Innovation</SelectItem>
            </SelectContent>
          </Select>
          <Select value={contextFilter} onValueChange={setContextFilter}>
            <SelectTrigger className="w-[120px] bg-background"><SelectValue placeholder="Context" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Context</SelectItem>
              <SelectItem value="client">Client (Any)</SelectItem>
              <SelectItem value="internal">Internal (Any)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger className="w-[130px] bg-background"><SelectValue placeholder="Health" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Health</SelectItem>
              <SelectItem value="On Track">On Track</SelectItem>
              <SelectItem value="At Risk">At Risk</SelectItem>
              <SelectItem value="Off Track">Off Track</SelectItem>
              <SelectItem value="Unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[130px] bg-background"><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[130px] bg-background"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4">
        <DataTable 
          columns={columns} 
          data={filteredRows}
        />
      </div>
    </div>
  );
}
