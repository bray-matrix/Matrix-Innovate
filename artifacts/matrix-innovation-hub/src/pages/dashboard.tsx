import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { Lightbulb, Clock, FlaskConical, Rocket, CheckCircle2, TrendingUp, PlusCircle } from "lucide-react";

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const metrics = [
    { title: "Total Initiatives", value: data.totalInitiatives, icon: Lightbulb, color: "text-blue-500" },
    { title: "Awaiting Review", value: data.awaitingReview, icon: Clock, color: "text-amber-500" },
    { title: "Active Prototypes", value: data.activePrototypes, icon: FlaskConical, color: "text-purple-500" },
    { title: "In Pilot", value: data.inPilot, icon: Rocket, color: "text-orange-500" },
    { title: "Production", value: data.inProduction, icon: CheckCircle2, color: "text-green-500" },
    { title: "Average Score", value: data.averageScore.toFixed(1), icon: TrendingUp, color: "text-indigo-500" },
  ];

  return (
    <div className="space-y-8">
      {/* Prominent Banner */}
      <div className="bg-primary text-primary-foreground p-8 rounded-xl shadow-lg relative overflow-hidden flex justify-between items-center">
        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight">Every prototype must prove value within two weeks.</h2>
          <p className="mt-2 text-primary-foreground/80 text-lg">Matrix Innovation Hub</p>
        </div>
        <div className="relative z-10 hidden sm:block">
          <Link href="/submit">
            <Button size="lg" variant="secondary" className="font-semibold shadow-md">
              <PlusCircle className="mr-2 h-5 w-5" /> Quick Submit
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((m) => (
          <Card key={m.title} className="hover-elevate transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.title}</CardTitle>
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Initiatives</CardTitle>
          <Link href="/initiatives">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentInitiatives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No initiatives found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.recentInitiatives.map((init) => (
                    <TableRow key={init.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <Link href={`/initiatives/${init.id}`} className="font-medium hover:underline text-primary">
                          {init.title}
                        </Link>
                      </TableCell>
                      <TableCell>{init.department}</TableCell>
                      <TableCell><StatusBadge status={init.status} /></TableCell>
                      <TableCell>{init.score}</TableCell>
                      <TableCell><PriorityBadge priority={init.priority} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
