import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetInitiative, useUpdateInitiative, getGetInitiativeQueryKey, getListInitiativesQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Calculator, Save, ArrowLeft } from "lucide-react";

export default function ScoreInitiative() {
  const [, params] = useRoute("/initiatives/:id/score");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  
  const { data: initiative, isLoading } = useGetInitiative(id, {
    query: { enabled: !!id, queryKey: getGetInitiativeQueryKey(id) }
  });
  
  const updateInitiative = useUpdateInitiative();
  const queryClient = useQueryClient();

  const [scores, setScores] = useState({
    businessValue: 0,
    revenuePotential: 0,
    costSavingsScore: 0,
    customerImpactScore: 0,
    strategicAlignment: 0,
    aiReadinessScore: 0,
    prototypeConfidence: 0,
    technicalComplexityPenalty: 0,
    riskPenalty: 0,
  });

  useEffect(() => {
    if (initiative) {
      setScores({
        businessValue: initiative.businessValue,
        revenuePotential: initiative.revenuePotential,
        costSavingsScore: initiative.costSavingsScore,
        customerImpactScore: initiative.customerImpactScore,
        strategicAlignment: initiative.strategicAlignment,
        aiReadinessScore: initiative.aiReadinessScore,
        prototypeConfidence: initiative.prototypeConfidence,
        technicalComplexityPenalty: initiative.technicalComplexityPenalty,
        riskPenalty: initiative.riskPenalty,
      });
    }
  }, [initiative]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!initiative) return null;

  const handleScoreChange = (field: keyof typeof scores, value: string) => {
    const num = parseInt(value, 10) || 0;
    setScores(prev => ({ ...prev, [field]: num }));
  };

  // Live recalculation for display
  const positives = scores.businessValue + scores.revenuePotential + scores.costSavingsScore + 
                    scores.customerImpactScore + scores.strategicAlignment + scores.aiReadinessScore + 
                    scores.prototypeConfidence;
  
  const penalties = scores.technicalComplexityPenalty + scores.riskPenalty;
  
  // Note: Risk penalty should be negative or 0 based on DB schema, so we add it if it's already negative, 
  // but if the UI is capturing positive numbers for penalties, we subtract. Let's assume the UI captures 
  // negative numbers directly (e.g. 0 to -10) as specified: "Technical Complexity Penalty 0 to -10"
  // Wait, let's look at the instruction: "Technical Complexity Penalty 0 to -10".
  // So we'll just sum them, assuming the user types negative numbers, or we enforce it.
  // Actually, standard math: positives + penalties (if penalties are negative).
  // Let's coerce penalties to be <= 0.
  
  const techPenalty = Math.min(0, scores.technicalComplexityPenalty);
  const rskPenalty = Math.min(0, scores.riskPenalty);
  
  const totalRaw = positives + techPenalty + rskPenalty;
  const total = Math.max(0, Math.min(100, totalRaw));

  let derivedPriority = "Low";
  if (total >= 80) derivedPriority = "Critical";
  else if (total >= 65) derivedPriority = "High";
  else if (total >= 50) derivedPriority = "Medium";

  const handleSave = () => {
    updateInitiative.mutate(
      { 
        id, 
        data: {
          businessValue: scores.businessValue,
          revenuePotential: scores.revenuePotential,
          costSavingsScore: scores.costSavingsScore,
          customerImpactScore: scores.customerImpactScore,
          strategicAlignment: scores.strategicAlignment,
          aiReadinessScore: scores.aiReadinessScore,
          prototypeConfidence: scores.prototypeConfidence,
          technicalComplexityPenalty: techPenalty,
          riskPenalty: rskPenalty,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInitiativeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Scores Saved", description: "The initiative's score and priority have been updated." });
          setLocation(`/initiatives/${id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save scores.", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Link href={`/initiatives/${id}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Score Initiative</h2>
          <p className="text-muted-foreground">Evaluate and prioritize: {initiative.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="text-lg">Value Drivers (Positives)</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Value (0-25)</Label>
                  <Input type="number" min="0" max="25" value={scores.businessValue} onChange={(e) => handleScoreChange('businessValue', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Revenue Potential (0-15)</Label>
                  <Input type="number" min="0" max="15" value={scores.revenuePotential} onChange={(e) => handleScoreChange('revenuePotential', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cost Savings (0-15)</Label>
                  <Input type="number" min="0" max="15" value={scores.costSavingsScore} onChange={(e) => handleScoreChange('costSavingsScore', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Customer Impact (0-15)</Label>
                  <Input type="number" min="0" max="15" value={scores.customerImpactScore} onChange={(e) => handleScoreChange('customerImpactScore', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Strategic Alignment (0-10)</Label>
                  <Input type="number" min="0" max="10" value={scores.strategicAlignment} onChange={(e) => handleScoreChange('strategicAlignment', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>AI Readiness (0-10)</Label>
                  <Input type="number" min="0" max="10" value={scores.aiReadinessScore} onChange={(e) => handleScoreChange('aiReadinessScore', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Prototype Confidence (0-10)</Label>
                  <Input type="number" min="0" max="10" value={scores.prototypeConfidence} onChange={(e) => handleScoreChange('prototypeConfidence', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader className="bg-destructive/5 border-b border-destructive/20">
              <CardTitle className="text-lg text-destructive">Risk & Complexity (Penalties)</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Technical Complexity (0 to -10)</Label>
                  <Input type="number" max="0" min="-10" value={scores.technicalComplexityPenalty} onChange={(e) => handleScoreChange('technicalComplexityPenalty', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Risk Penalty (0 to -10)</Label>
                  <Input type="number" max="0" min="-10" value={scores.riskPenalty} onChange={(e) => handleScoreChange('riskPenalty', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader className="bg-primary text-primary-foreground rounded-t-xl">
              <CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5" /> Score Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="text-sm text-muted-foreground uppercase font-semibold tracking-wider mb-1">Total Score</div>
                <div className="text-5xl font-mono font-bold">{total}</div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground uppercase font-semibold tracking-wider mb-1">Derived Priority</div>
                <div className={`text-2xl font-bold ${
                  derivedPriority === 'Critical' ? 'text-red-600' :
                  derivedPriority === 'High' ? 'text-orange-500' :
                  derivedPriority === 'Medium' ? 'text-blue-500' : 'text-slate-500'
                }`}>
                  {derivedPriority}
                </div>
              </div>

              <div className="pt-4 border-t border-border/50 text-sm space-y-2 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Positives Sum</span>
                  <span className="font-mono">{positives}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Penalties</span>
                  <span className="font-mono">{techPenalty + rskPenalty}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-6 pt-0">
              <Button className="w-full" size="lg" onClick={handleSave} disabled={updateInitiative.isPending}>
                <Save className="mr-2 h-5 w-5" /> Save Score
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
