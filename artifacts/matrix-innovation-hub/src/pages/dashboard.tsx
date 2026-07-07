import { useMemo } from "react";
import {
  useListInitiatives,
  useGetProductHealth,
} from "@workspace/api-client-react";
import type { Initiative } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/badges";
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
  BadgeDollarSign,
  CheckCircle2,
  Clock,
  FlaskConical,
  Gauge,
  Hourglass,
  Lightbulb,
  ListTodo,
  PackageCheck,
  ParkingCircle,
  PlusCircle,
  Tag,
  Timer,
  TrendingUp,
  UserX,
} from "lucide-react";

const PROTOTYPE_SPRINT_DAYS = 14;
const NEARING_DEADLINE_DAY = 10;
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
  const prototypes = initiatives.filter((i) => i.status === "Prototype");
  const advanced = initiatives.filter(
    (i) => i.status === "Pilot" || i.status === "Production",
  );
  const everPrototyped = prototypes.length + advanced.length;

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

  const withDay = initiatives.filter(
    (i) => i.prototypeDay !== null && i.prototypeDay !== undefined,
  );
  const avgPrototypeDuration =
    withDay.length > 0
      ? withDay.reduce((sum, i) => sum + (i.prototypeDay ?? 0), 0) /
        withDay.length
      : null;

  return {
    annualSavings,
    annualRevenue,
    annualHours,
    activeInitiatives: active.length,
    activePrototypes: prototypes.length,
    successRate:
      everPrototyped > 0 ? (advanced.length / everPrototyped) * 100 : null,
    avgScore,
    avgPrototypeDuration,
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
  const { data: initiatives, isLoading } = useListInitiatives();
  const [, setLocation] = useLocation();

  const metrics = useMemo(
    () => computeExecutiveMetrics(initiatives ?? []),
    [initiatives],
  );

  const attention = useMemo(() => {
    const list = initiatives ?? [];
    const awaitingReview = list.filter((i) => i.status === "Review");
    const nearingDeadline = list.filter(
      (i) =>
        i.status === "Prototype" &&
        i.prototypeDay !== null &&
        i.prototypeDay !== undefined &&
        i.prototypeDay >= NEARING_DEADLINE_DAY,
    );
    const highValueNoSponsor = list.filter(
      (i) =>
        ACTIVE_STATUSES.has(i.status) &&
        (i.priority === "High" || i.priority === "Critical" || i.score >= 70) &&
        !i.executiveSponsor,
    );
    const recentlyCompleted = list
      .filter((i) => i.status === "Pilot" || i.status === "Production")
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 5);
    return { awaitingReview, nearingDeadline, highValueNoSponsor, recentlyCompleted };
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
      title: "Active Prototypes",
      value: String(metrics.activePrototypes),
      sub: `${PROTOTYPE_SPRINT_DAYS}-day sprints in flight`,
      icon: FlaskConical,
      accent: "border-l-[#7C3AED]",
      iconColor: "text-[#7C3AED]",
    },
    {
      title: "Prototype Success Rate",
      value:
        metrics.successRate === null
          ? "—"
          : `${metrics.successRate.toFixed(0)}%`,
      sub: "advanced to pilot or production",
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
    {
      title: "Average Prototype Duration",
      value:
        metrics.avgPrototypeDuration === null
          ? "—"
          : `${metrics.avgPrototypeDuration.toFixed(1)} days`,
      sub: `target under ${PROTOTYPE_SPRINT_DAYS} days`,
      icon: Timer,
      accent: "border-l-[#FFC72C]",
      iconColor: "text-[#B58900]",
    },
  ];

  const goTo = (id: number) => setLocation(`/initiatives/${id}`);

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="bg-primary text-primary-foreground p-8 rounded-xl shadow-lg relative overflow-hidden flex justify-between items-center">
        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight">
            Executive Command Center
          </h2>
          <p className="mt-2 text-primary-foreground/80 text-lg">
            Every prototype must prove value within two weeks.
          </p>
        </div>
        <div className="relative z-10 hidden sm:block">
          <Link href="/submit">
            <Button
              size="lg"
              variant="secondary"
              className="font-semibold shadow-md"
            >
              <PlusCircle className="mr-2 h-5 w-5" /> Quick Submit
            </Button>
          </Link>
        </div>
      </div>

      {/* Product Health */}
      <ProductHealthWidget />

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
            icon={Timer}
            iconColor="text-red-500"
            title="Nearing 14-Day Deadline"
            count={attention.nearingDeadline.length}
            emptyText="No prototypes close to deadline."
          >
            {attention.nearingDeadline.map((i) => (
              <AttentionItem
                key={i.id}
                initiative={i}
                detail={
                  <Badge variant="destructive" className="font-mono">
                    Day {i.prototypeDay}/{PROTOTYPE_SPRINT_DAYS}
                  </Badge>
                }
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

          <AttentionGroup
            icon={CheckCircle2}
            iconColor="text-green-600"
            title="Recently Completed Prototypes"
            count={attention.recentlyCompleted.length}
            emptyText="No prototypes completed recently."
          >
            {attention.recentlyCompleted.map((i) => (
              <AttentionItem
                key={i.id}
                initiative={i}
                detail={<StatusBadge status={i.status} />}
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
            <CardTitle className="text-base">Pipeline Distribution</CardTitle>
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
