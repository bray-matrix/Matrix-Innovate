import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateInitiative,
  useUpdateInitiative,
  useGetSettings,
  getListInitiativesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  computeScore,
  derivePriority,
  type InterviewDraft,
  type InterviewQuestion,
  type ScoringComponents,
  type InitiativeDraftFields,
} from "@/services/aiInterviewService";
import {
  interviewEngine,
  type CategoryDetection,
} from "@/services/interviewEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  User as UserIcon,
  ArrowLeft,
  ArrowRight,
  Save,
  Sparkles,
  Loader2,
  Send,
  CheckCircle2,
  Tag,
} from "lucide-react";

const DRAFT_KEY = "matrix-interview-draft-v2";

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

type Phase = "chat" | "processing" | "review";

type AnswerMap = Record<string, string>;

const LEVELS = ["Low", "Medium", "High"] as const;

function buildAnswerMap(
  plan: InterviewQuestion[],
  byId: AnswerMap,
): AnswerMap {
  const map: AnswerMap = {};
  for (const q of plan) map[q.id] = byId[q.id] ?? "";
  return map;
}

export default function AIInnovationInterview() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useGetSettings();
  const createInitiative = useCreateInitiative();
  const updateInitiative = useUpdateInitiative();

  const [phase, setPhase] = useState<Phase>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Answers keyed by question id so the plan can grow/change adaptively.
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [plan, setPlan] = useState<InterviewQuestion[]>(() =>
    interviewEngine.planQuestions({}),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [draft, setDraft] = useState<InterviewDraft | null>(null);
  const [detection, setDetection] = useState<CategoryDetection | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Kick off the interview once (resume a saved draft if present).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let resumed = false;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          answers?: AnswerMap;
          currentIndex?: number;
        };
        if (parsed.answers && typeof parsed.answers === "object") {
          resumed = true;
          const savedAnswers = parsed.answers;
          const resumedPlan = interviewEngine.planQuestions(savedAnswers);
          const idx = Math.min(
            Math.max(0, parsed.currentIndex ?? 0),
            resumedPlan.length - 1,
          );
          setAnswers(savedAnswers);
          setPlan(resumedPlan);
          setCurrentIndex(idx);
          if ((savedAnswers.idea ?? "").trim().length > 0) {
            setDetection(interviewEngine.classify(savedAnswers));
          }

          const restored: ChatMessage[] = [
            { role: "ai", text: interviewEngine.getIntro() },
          ];
          for (let i = 0; i < idx; i++) {
            const q = resumedPlan[i];
            restored.push({ role: "ai", text: q.prompt });
            const ans = savedAnswers[q.id];
            if (ans) restored.push({ role: "user", text: ans });
          }
          restored.push({ role: "ai", text: resumedPlan[idx].prompt });
          setMessages(restored);
          setInput(savedAnswers[resumedPlan[idx].id] ?? "");
          toast({
            title: "Draft resumed",
            description: "We picked up where you left off.",
          });
        }
      }
    } catch {
      resumed = false;
    }

    if (!resumed) {
      setMessages([{ role: "ai", text: interviewEngine.getIntro() }]);
      setIsTyping(true);
      const t = setTimeout(() => {
        setMessages((prev) => [...prev, { role: "ai", text: plan[0].prompt }]);
        setIsTyping(false);
      }, 900);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const totalQuestions = plan.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const currentQuestion = plan[currentIndex];
  const canSubmitAnswer = input.trim().length > 0 || isLastQuestion;

  const persistDraft = (nextAnswers: AnswerMap, nextIndex: number) => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ answers: nextAnswers, currentIndex: nextIndex }),
      );
    } catch {
      /* ignore quota errors */
    }
  };

  const handleNext = async () => {
    if (isTyping) return;
    const trimmed = input.trim();
    if (!trimmed && !isLastQuestion) return;

    const nextAnswers: AnswerMap = { ...answers, [currentQuestion.id]: trimmed };
    setAnswers(nextAnswers);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed || "(nothing to add)" },
    ]);
    setInput("");

    // Re-plan and re-classify: the detected category (and therefore the
    // follow-up questions) can change as new answers come in.
    const newDetection = interviewEngine.classify(nextAnswers);
    setDetection(newDetection);
    const newPlan = interviewEngine.planQuestions(nextAnswers);
    setPlan(newPlan);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= newPlan.length) {
      persistDraft(nextAnswers, currentIndex);
      await runProcessing(nextAnswers, newPlan);
      return;
    }

    persistDraft(nextAnswers, nextIndex);
    setIsTyping(true);

    const ack = await interviewEngine.acknowledge(currentIndex);
    setMessages((prev) => [...prev, { role: "ai", text: ack }]);
    await new Promise((r) => setTimeout(r, 450));
    const nextQuestion = newPlan[nextIndex];
    setMessages((prev) => [...prev, { role: "ai", text: nextQuestion.prompt }]);
    setIsTyping(false);
    setCurrentIndex(nextIndex);
    setInput(nextAnswers[nextQuestion.id] ?? "");
  };

  const handleBack = () => {
    if (isTyping || currentIndex === 0) return;
    const nextAnswers: AnswerMap = {
      ...answers,
      [currentQuestion.id]: input.trim(),
    };
    setAnswers(nextAnswers);

    const rebuiltPlan = interviewEngine.planQuestions(nextAnswers);
    setPlan(rebuiltPlan);
    setDetection(interviewEngine.classify(nextAnswers));

    const prevIndex = Math.min(currentIndex - 1, rebuiltPlan.length - 1);
    const rebuilt: ChatMessage[] = [
      { role: "ai", text: interviewEngine.getIntro() },
    ];
    for (let i = 0; i < prevIndex; i++) {
      const q = rebuiltPlan[i];
      rebuilt.push({ role: "ai", text: q.prompt });
      const ans = nextAnswers[q.id];
      if (ans) rebuilt.push({ role: "user", text: ans });
    }
    rebuilt.push({ role: "ai", text: rebuiltPlan[prevIndex].prompt });
    setMessages(rebuilt);
    setCurrentIndex(prevIndex);
    setInput(nextAnswers[rebuiltPlan[prevIndex].id] ?? "");
    persistDraft(nextAnswers, prevIndex);
  };

  const handleSaveDraft = () => {
    const nextAnswers: AnswerMap = {
      ...answers,
      [currentQuestion.id]: input.trim(),
    };
    setAnswers(nextAnswers);
    persistDraft(nextAnswers, currentIndex);
    toast({
      title: "Draft saved",
      description: "Your answers are saved on this device. Resume anytime.",
    });
  };

  const runProcessing = async (
    finalAnswers: AnswerMap,
    finalPlan: InterviewQuestion[],
  ) => {
    setPhase("processing");
    const answerMap = buildAnswerMap(finalPlan, finalAnswers);
    const result = await interviewEngine.generateDraft(answerMap, finalPlan);
    setDraft(result);
    setPhase("review");
  };

  const handleFinish = async () => {
    if (isTyping) return;
    const nextAnswers: AnswerMap = {
      ...answers,
      [currentQuestion.id]: input.trim(),
    };
    setAnswers(nextAnswers);
    const finalPlan = interviewEngine.planQuestions(nextAnswers);
    setPlan(finalPlan);
    persistDraft(nextAnswers, currentIndex);
    await runProcessing(nextAnswers, finalPlan);
  };

  const resumeInterview = () => {
    setPhase("chat");
  };

  // -------- Review / edit before saving --------
  if (phase === "review" && draft) {
    return (
      <ReviewDraft
        draft={draft}
        departments={settings?.departments ?? []}
        categories={settings?.categories ?? []}
        levels={[...LEVELS]}
        saving={createInitiative.isPending || updateInitiative.isPending}
        onBack={resumeInterview}
        onSave={(fields, scoring) => {
          createInitiative.mutate(
            { data: fields },
            {
              onSuccess: (created) => {
                updateInitiative.mutate(
                  { id: created.id, data: scoring },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey: getListInitiativesQueryKey(),
                      });
                      queryClient.invalidateQueries({
                        queryKey: getGetDashboardSummaryQueryKey(),
                      });
                      try {
                        localStorage.removeItem(DRAFT_KEY);
                      } catch {
                        /* ignore */
                      }
                      toast({
                        title: "Initiative created",
                        description: "Your AI initiative has been saved and scored.",
                      });
                      setLocation(`/initiatives/${created.id}`);
                    },
                    onError: () => {
                      queryClient.invalidateQueries({
                        queryKey: getListInitiativesQueryKey(),
                      });
                      toast({
                        title: "Saved without score",
                        description:
                          "Initiative created, but scoring failed. You can score it manually.",
                        variant: "destructive",
                      });
                      setLocation(`/initiatives/${created.id}`);
                    },
                  },
                );
              },
              onError: () => {
                toast({
                  title: "Error",
                  description: "Failed to create the initiative.",
                  variant: "destructive",
                });
              },
            },
          );
        }}
      />
    );
  }

  // -------- Processing --------
  if (phase === "processing") {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-32 text-center">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <Loader2 className="h-6 w-6 text-secondary animate-spin absolute -right-2 -bottom-2" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          Structuring your initiative
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Building your AI Opportunity Canvas, calculating the initial Innovation
          Score, and drafting an executive summary from your answers.
        </p>
      </div>
    );
  }

  // -------- Chat interview --------
  const progressValue = (currentIndex / totalQuestions) * 100;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-8rem)]">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-secondary" />
            AI Innovation Interview
          </h2>
          <p className="text-muted-foreground text-sm">
            A guided conversation that adapts to your idea and turns it into a
            scored initiative.
          </p>
        </div>
        <div className="text-right min-w-[9rem]">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            Question {Math.min(currentIndex + 1, totalQuestions)} of{" "}
            {totalQuestions}
          </div>
          <Progress value={progressValue} className="h-2 mt-2 w-36" />
        </div>
      </div>

      {detection && (
        <div className="mb-4 shrink-0">
          <DetectedTypeBadge label={detection.label} />
        </div>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} text={m.text} />
          ))}
          {isTyping && <TypingIndicator />}
        </div>

        <div className="border-t bg-muted/20 p-4 space-y-3 shrink-0">
          {!isLastQuestion && currentQuestion?.hint && (
            <p className="text-xs text-muted-foreground px-1">
              {currentQuestion.hint}
            </p>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (isLastQuestion) handleFinish();
                else handleNext();
              }
            }}
            placeholder={currentQuestion?.placeholder}
            className="min-h-[80px] resize-none bg-background"
            disabled={isTyping}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                disabled={currentIndex === 0 || isTyping}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isTyping}
              >
                <Save className="mr-1 h-4 w-4" /> Save Draft
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {!isLastQuestion ? (
                <Button onClick={handleNext} disabled={!canSubmitAnswer || isTyping}>
                  Next <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleNext}
                    disabled={isTyping || !input.trim()}
                    title="Send this answer to the transcript"
                  >
                    <Send className="mr-1 h-4 w-4" /> Send
                  </Button>
                  <Button onClick={handleFinish} disabled={isTyping}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Finish Interview
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DetectedTypeBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-sm">
      <div className="h-9 w-9 rounded-md bg-secondary/15 flex items-center justify-center">
        <Tag className="h-5 w-5 text-secondary" />
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Detected Initiative Type
        </div>
        <div className="text-sm font-bold text-primary">{label}</div>
      </div>
    </div>
  );
}

function ChatBubble({ role, text }: { role: "ai" | "user"; text: string }) {
  const isAI = role === "ai";
  return (
    <div className={`flex gap-3 ${isAI ? "" : "flex-row-reverse"}`}>
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isAI ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        }`}
      >
        {isAI ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isAI
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-primary text-primary-foreground rounded-tr-sm"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4" />
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Review & edit screen
// ------------------------------------------------------------------
interface ReviewProps {
  draft: InterviewDraft;
  departments: string[];
  categories: string[];
  levels: string[];
  saving: boolean;
  onBack: () => void;
  onSave: (fields: InitiativeDraftFields, scoring: ScoringComponents) => void;
}

function ReviewDraft({
  draft,
  departments,
  categories,
  levels,
  saving,
  onBack,
  onSave,
}: ReviewProps) {
  const [fields, setFields] = useState<InitiativeDraftFields>(draft.fields);
  const [scoring, setScoring] = useState<ScoringComponents>(draft.scoring);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof InitiativeDraftFields>(
    key: K,
    value: InitiativeDraftFields[K],
  ) => setFields((prev) => ({ ...prev, [key]: value }));

  const setScore = (key: keyof ScoringComponents, value: string) => {
    const num = parseInt(value, 10);
    setScoring((prev) => ({ ...prev, [key]: Number.isNaN(num) ? 0 : num }));
  };

  const liveScore = computeScore(scoring);
  const livePriority = derivePriority(liveScore);
  const executiveSummary = draft.executiveSummary;
  const canvas = draft.canvas;

  const handleSave = () => {
    if (!fields.title.trim()) return setError("Please provide a title.");
    if (!fields.department) return setError("Please select a department.");
    if (!fields.category) return setError("Please select a category.");
    if (!fields.submitterName.trim())
      return setError("Please provide the submitter's name.");
    if (!fields.problemStatement.trim())
      return setError("Please provide a problem statement.");
    setError(null);
    onSave(fields, scoring);
  };

  const positiveFields: {
    key: keyof ScoringComponents;
    label: string;
    max: number;
  }[] = [
    { key: "businessValue", label: "Business Value", max: 25 },
    { key: "revenuePotential", label: "Revenue Potential", max: 15 },
    { key: "costSavingsScore", label: "Cost Savings", max: 15 },
    { key: "customerImpactScore", label: "Customer Impact", max: 15 },
    { key: "strategicAlignment", label: "Strategic Alignment", max: 10 },
    { key: "aiReadinessScore", label: "AI Readiness", max: 10 },
    { key: "prototypeConfidence", label: "Prototype Confidence", max: 10 },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-secondary" />
            Review your initiative
          </h2>
          <p className="text-muted-foreground text-sm">
            Everything below was drafted from your interview. Edit anything, then save.
          </p>
        </div>
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Interview
        </Button>
      </div>

      <DetectedTypeBadge label={draft.detectedCategoryLabel} />

      <Card className="bg-primary text-primary-foreground border-primary">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider opacity-90">
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{executiveSummary}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-secondary" />
          <h3 className="text-lg font-bold">AI Opportunity Canvas</h3>
          <span className="text-xs text-muted-foreground">
            Auto-generated from your answers — edit the fields below to refine it.
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(
            [
              ["Problem", canvas.problem],
              ["Current Process", canvas.currentProcess],
              ["Desired Outcome", canvas.desiredOutcome],
              ["AI Opportunity", canvas.aiOpportunity],
              ["Expected Value", canvas.expectedValue],
              ["Prototype Goal", canvas.prototypeGoal],
              ["Success Metric", canvas.successMetric],
              ["Risks & Complexity", canvas.risks],
              ["Recommended Next Step", canvas.recommendedNextStep],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{value || "—"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Initiative Title</Label>
                <Input
                  value={fields.title}
                  onChange={(e) => setField("title", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={fields.department}
                  onValueChange={(v) => setField("department", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={fields.category}
                  onValueChange={(v) => setField("category", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Submitter Name</Label>
                <Input
                  value={fields.submitterName}
                  onChange={(e) => setField("submitterName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Business Owner (optional)</Label>
                <Input
                  value={fields.businessOwner}
                  onChange={(e) => setField("businessOwner", e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Executive Sponsor (optional)</Label>
                <Input
                  value={fields.executiveSponsor}
                  onChange={(e) => setField("executiveSponsor", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Business Problem & Future State</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Problem Statement</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={fields.problemStatement}
                  onChange={(e) => setField("problemStatement", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Current Process</Label>
                <Textarea
                  className="min-h-[90px]"
                  value={fields.currentProcess}
                  onChange={(e) => setField("currentProcess", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Desired Future State</Label>
                <Textarea
                  className="min-h-[90px]"
                  value={fields.desiredOutcome}
                  onChange={(e) => setField("desiredOutcome", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI Concept & Goal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>AI Concept</Label>
                <Textarea
                  className="min-h-[90px]"
                  value={fields.aiConcept}
                  onChange={(e) => setField("aiConcept", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Prototype Goal (2-week sprint)</Label>
                <Textarea
                  className="min-h-[80px]"
                  value={fields.prototypeGoal}
                  onChange={(e) => setField("prototypeGoal", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Success Metric</Label>
                <Input
                  value={fields.successMetric}
                  onChange={(e) => setField("successMetric", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Innovation Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-5xl font-mono font-bold">{liveScore}</div>
                <div
                  className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    livePriority === "Critical"
                      ? "bg-destructive text-destructive-foreground"
                      : livePriority === "High"
                        ? "bg-secondary text-secondary-foreground"
                        : livePriority === "Medium"
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {livePriority} priority
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {positiveFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <Label className="text-xs">{f.label}</Label>
                      <span className="text-muted-foreground">
                        max {f.max}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={f.max}
                      value={scoring[f.key]}
                      onChange={(e) => setScore(f.key, e.target.value)}
                      className="h-8"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Technical Complexity Penalty
                  </Label>
                  <Input
                    type="number"
                    min={-10}
                    max={0}
                    value={scoring.technicalComplexityPenalty}
                    onChange={(e) =>
                      setScore("technicalComplexityPenalty", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Risk Penalty</Label>
                  <Input
                    type="number"
                    min={-10}
                    max={0}
                    value={scoring.riskPenalty}
                    onChange={(e) => setScore("riskPenalty", e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Impact & Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Hours Saved / mo</Label>
                  <Input
                    type="number"
                    min={0}
                    value={fields.estimatedHoursSavedMonthly}
                    onChange={(e) =>
                      setField(
                        "estimatedHoursSavedMonthly",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Revenue Opp. ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={fields.estimatedRevenueOpportunity}
                    onChange={(e) =>
                      setField(
                        "estimatedRevenueOpportunity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Cost Savings ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={fields.estimatedCostSavings}
                    onChange={(e) =>
                      setField(
                        "estimatedCostSavings",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Customer Impact</Label>
                  <Select
                    value={fields.customerImpact}
                    onValueChange={(v) => setField("customerImpact", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Compliance Risk</Label>
                  <Select
                    value={fields.complianceRisk}
                    onValueChange={(v) => setField("complianceRisk", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Technical Complexity</Label>
                  <Select
                    value={fields.technicalComplexity}
                    onValueChange={(v) => setField("technicalComplexity", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">AI Readiness</Label>
                  <Select
                    value={fields.aiReadiness}
                    onValueChange={(v) => setField("aiReadiness", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive font-medium">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> Save Initiative
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
