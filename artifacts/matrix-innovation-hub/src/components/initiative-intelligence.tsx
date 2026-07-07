import { useState } from "react";
import { Link } from "wouter";
import {
  useGetInitiativeRecommendations,
  getGetInitiativeRecommendationsQueryKey,
} from "@workspace/api-client-react";
import type {
  InitiativeRecommendations,
  SimilarInitiative,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/badges";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  Copy,
  FlaskConical,
  Gauge,
  Layers,
  TrendingUp,
  Timer,
  Users,
} from "lucide-react";

const COMPLEXITY_STYLES: Record<string, string> = {
  Low: "bg-green-100 text-green-800 border-green-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-200",
  High: "bg-red-100 text-red-800 border-red-200",
};

interface IntelligenceCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  accent: string;
  iconColor: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  confidence?: number;
  source?: string;
  children: React.ReactNode;
}

function IntelligenceCard({
  icon: Icon,
  title,
  accent,
  iconColor,
  badge,
  defaultOpen = true,
  confidence,
  source,
  children,
}: IntelligenceCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={`border-l-4 ${accent}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="flex flex-row items-center justify-between py-4 space-y-0">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className={`h-4 w-4 ${iconColor}`} />
              {title}
            </CardTitle>
            <div className="flex items-center gap-2">
              {badge}
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {children}
            {(confidence !== undefined || source) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                {confidence !== undefined && (
                  <span>
                    Confidence:{" "}
                    <span className="font-medium text-foreground">
                      {confidence}%
                    </span>
                  </span>
                )}
                {source && (
                  <span>
                    Source:{" "}
                    <span className="font-medium text-foreground">
                      {source}
                    </span>
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SimilarInitiativeRow({ similar }: { similar: SimilarInitiative }) {
  return (
    <Link
      href={`/initiatives/${similar.id}`}
      className="block rounded-md border bg-background px-3 py-2 hover:bg-muted/50 transition-colors"
    >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{similar.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {similar.department} · {similar.category}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={similar.status} />
            <Badge variant="secondary" className="font-mono">
              {similar.similarityScore}% match
            </Badge>
          </div>
        </div>
        {similar.reasons.length > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            {similar.reasons.join(" · ")}
          </div>
        )}
    </Link>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-green-600" : value >= 45 ? "bg-[#FFC72C]" : "bg-red-500";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight">{value}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Confidence in these recommendations based on scoring completeness,
        readiness, sponsorship, and complexity.
      </p>
    </div>
  );
}

export function InitiativeIntelligence({ initiativeId }: { initiativeId: number }) {
  const { data, isLoading, isError } = useGetInitiativeRecommendations(
    initiativeId,
    {
      query: {
        enabled: !!initiativeId,
        queryKey: getGetInitiativeRecommendationsQueryKey(initiativeId),
      },
    },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <BrainCircuit className="mr-2 h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Initiative Intelligence</h2>
        </div>
        {data && (
          <Badge variant="outline" className="font-mono text-xs">
            Source: {data.sourceLabel}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
          Unable to generate recommendations right now. Refresh the page to try
          again.
        </div>
      )}

      {data && <IntelligenceCards data={data} />}
    </div>
  );
}

function IntelligenceCards({ data }: { data: InitiativeRecommendations }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Recommended Next Action — full width, most prominent */}
      <div className="md:col-span-2">
        <IntelligenceCard
          icon={ArrowRight}
          title="Recommended Next Action"
          accent="border-l-[#002D72]"
          iconColor="text-primary"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
        >
          <p className="text-lg font-semibold text-foreground">
            {data.nextAction}
          </p>
        </IntelligenceCard>
      </div>

      <IntelligenceCard
        icon={Copy}
        title="Similar Initiatives"
        accent="border-l-[#00A3E0]"
        iconColor="text-[#00A3E0]"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
        badge={
          <Badge variant="secondary" className="font-mono">
            {data.similarInitiatives.length}
          </Badge>
        }
      >
        {data.similarInitiatives.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No closely related initiatives found in the portfolio.
          </p>
        ) : (
          <div className="space-y-2">
            {data.similarInitiatives.map((s) => (
              <SimilarInitiativeRow key={s.id} similar={s} />
            ))}
          </div>
        )}
      </IntelligenceCard>

      <IntelligenceCard
        icon={FlaskConical}
        title="Recommended Prototype Scope"
        accent="border-l-[#7C3AED]"
        iconColor="text-[#7C3AED]"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
      >
        <p className="text-sm leading-relaxed">{data.prototypeScope}</p>
      </IntelligenceCard>

      <IntelligenceCard
        icon={Layers}
        title="Estimated Complexity"
        accent="border-l-[#FFC72C]"
        iconColor="text-[#B58900]"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
        badge={
          <Badge
            variant="outline"
            className={COMPLEXITY_STYLES[data.complexity] ?? ""}
          >
            {data.complexity}
          </Badge>
        }
      >
        <BulletList items={data.complexityFactors} />
      </IntelligenceCard>

      <IntelligenceCard
        icon={Timer}
        title="Estimated Prototype Duration"
        accent="border-l-[#00A3E0]"
        iconColor="text-[#00A3E0]"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">
            {data.estimatedPrototypeDurationDays}
          </span>
          <span className="text-sm text-muted-foreground">
            days (within the standard 14-day sprint)
          </span>
        </div>
      </IntelligenceCard>

      <IntelligenceCard
        icon={Users}
        title="Suggested Team Roles"
        accent="border-l-[#002D72]"
        iconColor="text-primary"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
        badge={
          <Badge variant="secondary" className="font-mono">
            {data.teamRoles.length}
          </Badge>
        }
      >
        <BulletList items={data.teamRoles} />
      </IntelligenceCard>

      <IntelligenceCard
        icon={AlertTriangle}
        title="Potential Risks"
        accent="border-l-red-500"
        iconColor="text-red-500"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
        badge={
          <Badge variant="secondary" className="font-mono">
            {data.risks.length}
          </Badge>
        }
      >
        <BulletList items={data.risks} />
      </IntelligenceCard>

      <IntelligenceCard
        icon={TrendingUp}
        title="Expected Business Value"
        accent="border-l-[#2E7D32]"
        iconColor="text-[#2E7D32]"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
      >
        <p className="text-sm font-medium leading-relaxed">
          {data.expectedBusinessValue}
        </p>
      </IntelligenceCard>

      <IntelligenceCard
        icon={Gauge}
        title="Confidence Score"
        accent="border-l-[#FFC72C]"
        iconColor="text-[#B58900]"
        confidence={data.confidenceScore}
        source={data.sourceLabel}
      >
        <ConfidenceMeter value={data.confidenceScore} />
      </IntelligenceCard>
    </div>
  );
}
