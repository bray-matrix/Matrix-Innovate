import { useMemo } from "react";
import {
  useListInitiatives,
  useGetProductHealth,
  useGetExecutionSummary,
  useGetDashboardAttention
} from "@workspace/api-client-react";
import type { Initiative } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/badges";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Clock,
  Gauge,
  Hourglass,
  Lightbulb,
  ListTodo,
  PackageCheck,
  ParkingCircle,
  PlusCircle,
  Tag,
  TrendingUp,
  UserX,
  Briefcase,
  AlertCircle,
  Target,
  Flag,
  PieChart,
  FileText,
  Users
} from "lucide-react";

const ACTIVE_STATUSES = new Set([
  "Idea",
  "Review",
  "Approved",
  "Prototype",
  "Pilot",
  "Production",
]);
const STATUS_ORDER = [
  "Idea",
  "Review",
  "Approved",
  "Prototype",
  "Pilot",
  "Production",
  "Closed",
  "Declined",
];

const NAVY = "#002D72";
const LIGHT_BLUE = "#00A3E0";
const GOLD = "#FFC72C";
const STATUS_COLORS: Record<string, string> = {
  Idea: LIGHT_BLUE,
  Review: GOLD,
  Approved: "#2E7D32",
  Prototype: "#7C3AED",
  Pilot: "#EA580C",
  Production: NAVY,
  Closed: "#6B7280",
  Declined: "#9CA3AF",
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function computeExecutiveMetrics(initiatives: Initiative[]) {
  const active = initiatives.filter((i) => ACTIVE_STATUSES.has(i.status));

  const annualSavings = initiatives.reduce(
    (sum, i) => sum + (i.estimatedCostSavings ?? 0),
    0,
  );
  const annualRevenue = initiatives.reduce(
    (sum, i) => sum + (i.estimatedRevenueOpportunity ?? 0),
    0,
  );
  const annualHours = initiatives.reduce(
    (sum, i) => sum + (i.estimatedHoursSavedMonthly ?? 0) * 12,
    0,
  );

  const scored = initiatives.filter((i) => i.score > 0);
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, i) => sum + i.score, 0) / scored.length
      : 0;

  return {
    annualSavings,
    annualRevenue,
    annualHours,
    activeInitiatives: active.length,
    awaitingReview: initiatives.filter((i) => i.status === "Review").length,
    approved: initiatives.filter((i) => i.status === "Approved").length,
    avgScore,
  };
}

interface AttentionItemProps {
  initiative: Initiative;
  detail: React.ReactNode;
  onClick: () => void;
}

function AttentionItem({ initiative, detail, onClick }: AttentionItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{initiative.title}</div>
        <div className="text-xs text-muted-foreground truncate">
          {initiative.department}
        </div>
      </div>
      <div className="shrink-0">{detail}</div>
    </button>
  );
}

interface AttentionGroupProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}

function AttentionGroup({
  icon: Icon,
  iconColor,
  title,
  count,
  emptyText,
  children,
}: AttentionGroupProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColor}`} />
            {title}
          </span>
          <Badge variant="secondary" className="font-mono">
            {count}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: initiatives, isLoading, isError, refetch } = useListInitiatives();
  const [, setLocation] = useLocation();

  const metrics = useMemo(
    () => computeExecutiveMetrics(initiatives ?? []),
    [initiatives],
  );

  const attention = useMemo(() => {
    const list = initiatives ?? [];
    const awaitingReview = list.filter((i) => i.status === "Review");
    const highValueNoSponsor = list.filter(
      (i) =>
        ACTIVE_STATUSES.has(i.status) &&
        (i.priority === "High" || i.priority === "Critical" || i.score >= 70) &&
        !i.executiveSponsor,
    );
    return { awaitingReview, highValueNoSponsor };
  }, [initiatives]);

  const pipelineData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of initiatives ?? []) {
      counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
    }
    return STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
  }, [initiatives]);

  const departmentValueData = useMemo(() => {
    const totals = new Map<string, { savings: number; revenue: number }>();
    for (const i of initiatives ?? []) {
      const entry = totals.get(i.department) ?? { savings: 0, revenue: 0 };
      entry.savings += i.estimatedCostSavings ?? 0;
      entry.revenue += i.estimatedRevenueOpportunity ?? 0;
      totals.set(i.department, entry);
    }
    return Array.from(totals.entries())
      .map(([department, v]) => ({ department, ...v }))
      .sort((a, b) => b.savings + b.revenue - (a.savings + a.revenue))
      .slice(0, 8);
  }, [initiatives]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const initiativesFailed = isError || !initiatives;

  const kpis = [
    {
      title: "Potential Annual Savings",
      value: currency.format(metrics.annualSavings),
      sub: "estimated cost reduction",
      icon: BadgeDollarSign,
      accent: "border-l-[#2E7D32]",
      iconColor: "text-[#2E7D32]",
    },
    {
      title: "Potential Annual Revenue",
      value: currency.format(metrics.annualRevenue),
      sub: "new revenue opportunity",
      icon: TrendingUp,
      accent: "border-l-[#00A3E0]",
      iconColor: "text-[#00A3E0]",
    },
    {
      title: "Estimated Hours Saved",
      value: compactNumber.format(metrics.annualHours),
      sub: "hours per year",
      icon: Hourglass,
      accent: "border-l-[#FFC72C]",
      iconColor: "text-[#B58900]",
    },
    {
      title: "Active Initiatives",
      value: String(metrics.activeInitiatives),
      sub: "in the pipeline",
      icon: Lightbulb,
      accent: "border-l-[#002D72]",
      iconColor: "text-primary",
    },
    {
      title: "Awaiting Review",
      value: String(metrics.awaitingReview),
      sub: "initiatives in Review status",
      icon: Clock,
      accent: "border-l-[#FFC72C]",
      iconColor: "text-[#B58900]",
    },
    {
      title: "Approved Initiatives",
      value: String(metrics.approved),
      sub: "in Approved status",
      icon: CheckCircle2,
      accent: "border-l-[#2E7D32]",
      iconColor: "text-[#2E7D32]",
    },
    {
      title: "Average Innovation Score",
      value: metrics.avgScore > 0 ? metrics.avgScore.toFixed(1) : "—",
      sub: "of 100 across scored initiatives",
      icon: Gauge,
      accent: "border-l-[#00A3E0]",
      iconColor: "text-[#00A3E0]",
    },
  ];

  const goTo = (id: number) => setLocation(`/initiatives/${id}`);

  return (
    <div className="space-y-8">
      {/* Front door */}
      <section className="bg-primary text-primary-foreground rounded-xl shadow-lg overflow-hidden" data-testid="section-front-door">
        <div className="p-6 md:p-8 grid gap-6 lg:grid-cols-[1.1fr_1fr] items-start">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[#FFC72C] uppercase">Innovation Hub</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Have an idea? Start here.</h2>
            <p className="mt-2 text-primary-foreground/80 max-w-xl">
              Bring an idea, problem, client request, or improvement. We help shape it, review it, and turn the best ones into real projects.
            </p>
            <ol className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs font-medium" aria-label="How ideas move through Innovation Hub" data-testid="list-workflow">
              {["Idea", "Initiative", "Review / Prioritize", "Project", "Execution"].map((step, i, arr) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 ${i === 0 ? "bg-[#FFC72C] text-[#002D72]" : "bg-white/10 text-primary-foreground/90"}`}>{step}</span>
                  {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-primary-foreground/50" aria-hidden />}
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-3">
            <Link href="/interview" data-testid="link-start-interview" className="group block rounded-lg bg-white text-[#231F20] p-4 shadow-md transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC72C]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#FFC72C] text-[#002D72]"><Lightbulb className="h-5 w-5" /></span>
                <div className="flex-1">
                  <div className="font-semibold text-[#002D72]">Start an Idea <span className="text-muted-foreground font-normal">- Guided Idea Interview</span></div>
                  <p className="text-sm text-muted-foreground mt-0.5">Use this when you have an idea, problem, client request, or improvement opportunity and want Innovation Hub to help develop it.</p>
                </div>
                <ArrowRight className="h-4 w-4 text-[#002D72] transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
            <Link href="/submit" data-testid="link-quick-submit" className="group block rounded-lg border border-white/25 p-4 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC72C]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10"><PlusCircle className="h-5 w-5" /></span>
                <div className="flex-1">
                  <div className="font-semibold">Quick Submit</div>
                  <p className="text-sm text-primary-foreground/75 mt-0.5">Use this when the idea is already well defined and you simply want to enter it directly.</p>
                </div>
                <ArrowRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-2">Quick Links:</span>
        <Link href="/portfolio">
          <Button variant="outline" size="sm" className="h-8">
            <PieChart className="mr-2 h-4 w-4" /> View Portfolio
          </Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="h-8">
            <FileText className="mr-2 h-4 w-4" /> View Reports
          </Button>
        </Link>
        <Link href="/resources">
          <Button variant="outline" size="sm" className="h-8">
            <Users className="mr-2 h-4 w-4" /> View Resources
          </Button>
        </Link>
      </div>

      {/* Product Health */}
      <ProductHealthWidget />

      {/* Execution Summary */}
      <ExecutionSummaryWidget />

      {initiativesFailed ? (
        <Card className="border-destructive/40" data-testid="error-initiatives">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <span className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> Initiative metrics could not be loaded. Values are not shown to avoid reporting false zeros.
            </span>
            <Button variant="outline" size="sm" onClick={() => void refetch()} data-testid="button-retry-initiatives">Retry</Button>
          </CardContent>
        </Card>
      ) : (<>
      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card
            key={k.title}
            className={`border-l-4 ${k.accent} hover-elevate transition-all`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {k.title}
              </CardTitle>
              <k.icon className={`h-5 w-5 ${k.iconColor}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{k.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attention Required */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#B58900]" />
          <h2 className="text-xl font-bold">My Attention Required</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AttentionGroup
            icon={Clock}
            iconColor="text-amber-500"
            title="Awaiting Review"
            count={attention.awaitingReview.length}
            emptyText="No initiatives waiting for review."
          >
            {attention.awaitingReview.map((i) => (
              <AttentionItem
                key={i.id}
                initiative={i}
                detail={<PriorityBadge priority={i.priority} />}
                onClick={() => goTo(i.id)}
              />
            ))}
          </AttentionGroup>

          <AttentionGroup
            icon={UserX}
            iconColor="text-orange-500"
            title="High Value, No Sponsor"
            count={attention.highValueNoSponsor.length}
            emptyText="All high-value initiatives have sponsors."
          >
            {attention.highValueNoSponsor.map((i) => (
              <AttentionItem
                key={i.id}
                initiative={i}
                detail={
                  <span className="font-mono text-sm font-semibold">
                    {i.score}
                  </span>
                }
                onClick={() => goTo(i.id)}
              />
            ))}
          </AttentionGroup>

        </div>
      </div>

      {/* Visual summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Initiative Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No initiatives yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={pipelineData}
                  layout="vertical"
                  margin={{ left: 12, right: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={90}
                    fontSize={12}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,45,114,0.06)" }}
                    formatter={(value) => [value, "Initiatives"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
                    {pipelineData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? LIGHT_BLUE}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Value Opportunity by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            {departmentValueData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No initiatives yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={departmentValueData}
                  margin={{ left: 12, right: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="department"
                    fontSize={12}
                    interval={0}
                    tickFormatter={(v: string) =>
                      v.length > 12 ? `${v.slice(0, 11)}…` : v
                    }
                  />
                  <YAxis
                    fontSize={12}
                    tickFormatter={(v: number) => currency.format(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,45,114,0.06)" }}
                    formatter={(value: number, name) => [
                      currency.format(value),
                      name === "savings" ? "Cost Savings" : "Revenue Opportunity",
                    ]}
                  />
                  <Bar
                    dataKey="savings"
                    stackId="value"
                    fill={NAVY}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="revenue"
                    stackId="value"
                    fill={GOLD}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: NAVY }}
                />
                Cost Savings
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: GOLD }}
                />
                Revenue Opportunity
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      </>)}

      <div className="flex justify-end">
        <Link href="/initiatives">
          <Button variant="outline">View All Initiatives</Button>
        </Link>
      </div>
    </div>
  );
}

function ProductHealthWidget() {
  const { data: health, isLoading } = useGetProductHealth();

  const stats = [
    {
      title: "Open Backlog Items",
      value: health?.openBacklogItems,
      icon: ListTodo,
      iconColor: "text-[#00A3E0]",
    },
    {
      title: "Parking Lot Items",
      value: health?.parkingLotItems,
      icon: ParkingCircle,
      iconColor: "text-amber-500",
    },
    {
      title: "Completed This Release",
      value: health?.completedThisRelease,
      icon: PackageCheck,
      iconColor: "text-green-600",
    },
    {
      title: "Current Version",
      value: health?.applicationVersion,
      icon: Tag,
      iconColor: "text-[#002D72]",
      mono: true,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[#002D72]" />
            Product Health
          </span>
          <Link href="/backlog">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              View Backlog
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.title} className="flex items-center gap-3">
              <s.icon className={`h-6 w-6 shrink-0 ${s.iconColor}`} />
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-6 w-14" />
                ) : (
                  <div
                    className={`text-xl font-bold leading-tight ${s.mono ? "font-mono text-lg" : ""}`}
                  >
                    {s.value ?? "—"}
                  </div>
                )}
                <div className="text-xs text-muted-foreground truncate">
                  {s.title}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


function ExecutionSummaryWidget() {
  const { data: summary, isLoading: summaryLoading } = useGetExecutionSummary();
  const { data: attention, isLoading: attentionLoading } = useGetDashboardAttention();

  const isLoading = summaryLoading || attentionLoading;

  const stats = [
    {
      title: "Active Projects",
      value: summary?.activeProjects,
      icon: Briefcase,
      iconColor: "text-blue-600",
      link: "/projects"
    },
    {
      title: "At Risk Projects",
      value: summary?.atRiskProjects,
      icon: AlertCircle,
      iconColor: "text-amber-500",
      link: "/portfolio"
    },
    {
      title: "Crit/High Risks",
      value: attention?.openCriticalHighRisks,
      icon: AlertTriangle,
      iconColor: "text-orange-500",
      link: "/portfolio"
    },
    {
      title: "Pending Approvals",
      value: attention?.pendingApprovals,
      icon: Flag,
      iconColor: "text-indigo-500",
      link: "/approvals"
    },
    {
      title: "Not Ready (Go-Live)",
      value: attention?.notReadyProjects,
      icon: Target,
      iconColor: "text-pink-500",
      link: "/portfolio"
    },
    {
      title: "Overdue Milestones",
      value: attention?.overdueMilestones,
      icon: Clock,
      iconColor: "text-red-500",
      link: "/projects"
    }
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[#002D72]" />
            Execution Summary
          </span>
          <Link href="/portfolio">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              View Portfolio
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {stats.map((s) => (
            <Link href={s.link} key={s.title}>
              <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors cursor-pointer">
                <s.icon className={`h-6 w-6 shrink-0 ${s.iconColor}`} />
                <div className="min-w-0">
                  {isLoading ? (
                    <Skeleton className="h-6 w-14" />
                  ) : (
                    <div className="text-xl font-bold leading-tight">
                      {s.value ?? "—"}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground truncate">
                    {s.title}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
