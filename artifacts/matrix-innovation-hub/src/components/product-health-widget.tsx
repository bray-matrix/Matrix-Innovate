import { Link } from "wouter";
import { useGetProductHealth } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Gauge, ListTodo, PackageCheck, ParkingCircle, Tag } from "lucide-react";

/** Hub product-maintenance metrics (moved from Home to Hub improvements). */
export function ProductHealthWidget() {
  const { data: health, isLoading } = useGetProductHealth();

  const stats = [
    {
      title: "Open Hub improvements",
      value: health?.openBacklogItems,
      icon: ListTodo,
      iconColor: "text-[#00A3E0]",
    },
    {
      title: "Deferred improvements",
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
            Hub product health
          </span>
          <Link href="/validation">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Release checks
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


