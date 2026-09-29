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
  validateInitiativeDraft,
  answersForReview,
  REQUIRED_INITIATIVE_FIELDS,
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
import { RULE_ENGINE_SOURCE_LABEL } from "@/lib/aiSource";
import { fetchSessionUser } from "@/lib/matrix-platform";
import { withBase } from "@/lib/base-path";
import { InterviewJiraPicker, type JiraIntakeContext } from "@/components/interview-jira-picker";
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
const MAX_QUESTIONS = 12;
interface AIInterviewResult {
  knownFacts: { category: string; value: string; evidence: string; source: "user" | "jira" }[];
  inferredSuggestions: string[];
  unknowns: string[];
  nextQuestion: string;
  interviewComplete: boolean;
  suggestedInitiativeType: string;
  suggestedTitle: string;
  draft: {
    problemStatement: string;
    currentProcess: string;
    desiredOutcome: string;
    expectedValue: string;
    successMetric: string;
    risks: string;
  };
}

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

type Phase = "jira" | "chat" | "processing" | "review";

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

  const [phase, setPhase] = useState<Phase>("jira");
  const [jira, setJira] = useState<JiraIntakeContext | null>(null);
  const [submitterName, setSubmitterName] = useState("");
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
  const [aiResult, setAiResult] = useState<AIInterviewResult | null>(null);
  const [fallback, setFallback] = useState(false);
  const [readyToReview, setReadyToReview] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  useEffect(() => {
    void fetchSessionUser().then(user => {
      if (user?.name) setSubmitterName(user.name);
    }).catch(() => { /* session unavailable: submitter can be entered at review */ });
  }, []);

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
          jira?: JiraIntakeContext | null;
          jiraChoice?: boolean;
          plan?: InterviewQuestion[];
          fallback?: boolean;
          aiResult?: AIInterviewResult | null;
          readyToReview?: boolean;
        };
        if (parsed.jiraChoice) setPhase("chat");
        if (parsed.jira) setJira(parsed.jira);
        if (parsed.answers && typeof parsed.answers === "object") {
          resumed = !!parsed.jiraChoice;
          if (!resumed) return;
          const savedAnswers = parsed.answers;
          const resumedPlan = parsed.plan?.length ? parsed.plan : interviewEngine.planQuestions(savedAnswers);
          const idx = Math.min(
            Math.max(0, parsed.currentIndex ?? 0),
            resumedPlan.length - 1,
          );
          setAnswers(savedAnswers);
          setPlan(resumedPlan);
          setFallback(!!parsed.fallback);
          setAiResult(parsed.aiResult ?? null);
          setReadyToReview(!!parsed.readyToReview);
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

    if (!resumed) setMessages([]);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const totalQuestions = plan.length;
  const isLastQuestion = readyToReview || (fallback && currentIndex === totalQuestions - 1);
  const currentQuestion = plan[currentIndex];
  const canSubmitAnswer = input.trim().length > 0 || currentQuestion?.id !== "idea";

  const persistDraft = (nextAnswers: AnswerMap, nextIndex: number, nextPlan = plan, usingFallback = fallback) => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ answers: nextAnswers, currentIndex: nextIndex, plan: nextPlan, fallback: usingFallback, aiResult: usingFallback ? null : aiResult, readyToReview, jira, jiraChoice: true }),
      );
    } catch {
      /* ignore quota errors */
    }
  };
  const startInterview = (item: JiraIntakeContext | null) => {
    setJira(item);
    const initialAnswers: AnswerMap = item
      ? { jiraIssueId: item.jiraIssueId, idea: item.summary.trim(), ...(item.description?.trim() ? { problem: item.description.trim() } : {}) }
      : {};
    const initialPlan = interviewEngine.planQuestions(initialAnswers);
    setAnswers(initialAnswers);
    setPlan(initialPlan);
    setCurrentIndex(0);
    setFallback(false);
    setReadyToReview(false);
    setAiResult(null);
    setMessages([
      { role: "ai", text: interviewEngine.getIntro() },
      ...(item ? [{ role: "ai" as const, text: `I found ${item.jiraIssueKey}: ${item.summary}. ${item.description?.trim() ? "I have its description too, so we can focus on what is missing." : "Let's add the business context that's missing."}` }] : []),
      { role: "ai", text: initialPlan[0].prompt },
    ]);
    if (item) setDetection(interviewEngine.classify(initialAnswers));
    setPhase("chat");
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: initialAnswers, currentIndex: 0, jira: item, jiraChoice: true })); } catch { /* storage unavailable */ }
  };

  const handleNext = async () => {
    if (isTyping) return;
    const trimmed = input.trim();
    if (!trimmed && currentQuestion.id === "idea") return;

    const nextAnswers: AnswerMap = { ...answers, [currentQuestion.id]: trimmed };
    if (currentQuestion.id.startsWith("ai_") && trimmed) {
      nextAnswers.aiContext = [answers.aiContext, `${currentQuestion.prompt}: ${trimmed}`].filter(Boolean).join("\n");
    }
    setAnswers(nextAnswers);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed || "(nothing to add)" },
    ]);
    setInput("");

    const newDetection = interviewEngine.classify(nextAnswers);
    setDetection(newDetection);
    const nextIndex = currentIndex + 1;
    setIsTyping(true);
    if (!fallback) {
      try {
        const turns = plan.slice(0, nextIndex).map(q => ({
          question: q.prompt, answer: nextAnswers[q.id] ?? "",
        }));
        const response = await fetch(withBase("/api/interview/advance"), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns, jira: jira ? { summary: jira.summary, description: jira.description ?? "" } : null }),
        });
        if (!response.ok) throw new Error("Interview service unavailable");
        const result = await response.json() as AIInterviewResult;
        if (typeof result.interviewComplete !== "boolean" ||
          !Array.isArray(result.knownFacts) || !Array.isArray(result.inferredSuggestions) ||
          (!result.interviewComplete && !result.nextQuestion?.trim())) throw new Error("Invalid interview response");
        setAiResult(result);
        if (result.interviewComplete || nextIndex >= MAX_QUESTIONS) {
          setReadyToReview(true);
          setMessages(prev => [...prev, { role: "ai", text: "Looks like I have enough to draft this initiative." }]);
          setIsTyping(false);
          try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: nextAnswers, currentIndex, plan, jira, jiraChoice: true, fallback: false, aiResult: result, readyToReview: true })); } catch { /* storage unavailable */ }
          return;
        }
        const nextQuestion = { id: `ai_${nextIndex}`, prompt: result.nextQuestion, hint: "A rough answer is fine. You can also skip what you don't know.", placeholder: "Share what you know..." };
        const nextPlan = [...plan.slice(0, nextIndex), nextQuestion];
        setPlan(nextPlan);
        setMessages(prev => [...prev, { role: "ai", text: nextQuestion.prompt }]);
        setCurrentIndex(nextIndex);
        setIsTyping(false);
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: nextAnswers, currentIndex: nextIndex, plan: nextPlan, jira, jiraChoice: true, fallback: false, aiResult: result, readyToReview: false })); } catch { /* storage unavailable */ }
        return;
      } catch {
        setFallback(true);
        setAiResult(null);
        setMessages(prev => [...prev, { role: "ai", text: "The guided assistant is temporarily unavailable. We'll continue with the standard interview." }]);
      }
    }
    const newPlan = interviewEngine.planQuestions(nextAnswers);
    setPlan(newPlan);
    // AI questions are not positions in the rule engine's plan. Resume at the
    // first unanswered rule question, retaining AI answers for the final draft.
    const fallbackIndex = fallback ? Math.min(nextIndex, newPlan.length) :
      newPlan.findIndex(q => !nextAnswers[q.id]?.trim() && !plan.slice(0, nextIndex).some(asked => asked.id === q.id));
    if (fallbackIndex < 0 || fallbackIndex >= newPlan.length) {
      setIsTyping(false);
      persistDraft(nextAnswers, currentIndex, newPlan, true);
      await runProcessing(nextAnswers, newPlan, false);
      return;
    }

    persistDraft(nextAnswers, fallbackIndex, newPlan, true);
    const ack = await interviewEngine.acknowledge(currentIndex);
    setMessages((prev) => [...prev, { role: "ai", text: ack }]);
    await new Promise((r) => setTimeout(r, 450));
    const nextQuestion = newPlan[fallbackIndex];
    setMessages((prev) => [...prev, { role: "ai", text: nextQuestion.prompt }]);
    setIsTyping(false);
    setCurrentIndex(fallbackIndex);
    setInput(nextAnswers[nextQuestion.id] ?? "");
  };

  const handleBack = () => {
    if (isTyping || currentIndex === 0) return;
    if (!fallback) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      setReadyToReview(false);
      setAiResult(null);
      setInput(answers[plan[prevIndex].id] ?? "");
      setMessages(prev => prev.slice(0, -2));
      return;
    }
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
    useAI = !fallback,
  ) => {
    setPhase("processing");
    const answerMap = buildAnswerMap(finalPlan, finalAnswers);
    if (finalAnswers.aiContext) answerMap.notes = [answerMap.notes, finalAnswers.aiContext].filter(Boolean).join("\n");
    const result = await interviewEngine.generateDraft(answerMap, finalPlan);
    if (aiResult && useAI) {
      const business = aiResult.draft;
      result.fields.title = aiResult.suggestedTitle.trim() || result.fields.title;
      result.fields.problemStatement = business.problemStatement.trim() || result.fields.problemStatement;
      result.fields.currentProcess = business.currentProcess.trim() || result.fields.currentProcess;
      result.fields.desiredOutcome = business.desiredOutcome.trim() || result.fields.desiredOutcome;
      result.fields.successMetric = business.successMetric.trim() || result.fields.successMetric;
      result.canvas.problem = result.fields.problemStatement;
      result.canvas.currentProcess = result.fields.currentProcess;
      result.canvas.desiredOutcome = result.fields.desiredOutcome;
      result.canvas.successMetric = result.fields.successMetric;
      result.canvas.expectedValue = business.expectedValue.trim() || "Value not yet quantified";
      result.canvas.risks = business.risks.trim();
      result.executiveSummary = `${result.fields.title} addresses: ${result.fields.problemStatement}. ${result.fields.desiredOutcome ? `Desired outcome: ${result.fields.desiredOutcome}.` : ""} ${result.canvas.expectedValue}.`;
      result.canvas.executiveSummary = result.executiveSummary;
    }
    setDraft(result);
    setPhase("review");
  };

  const handleFinish = async () => {
    if (isTyping) return;
    // A completed AI turn was already saved and the disabled input is empty.
    // Do not replace its answer when moving to review.
    const nextAnswers = answersForReview(answers, currentQuestion.id, input, readyToReview);
    setAnswers(nextAnswers);
    const finalPlan = fallback ? interviewEngine.planQuestions(nextAnswers) : plan;
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
        aiResult={!fallback ? aiResult : null}
        jira={jira}
        submitterName={submitterName}
        departments={settings?.departments ?? []}
        categories={settings?.categories ?? []}
        levels={[...LEVELS]}
        saving={createInitiative.isPending || updateInitiative.isPending}
        onBack={resumeInterview}
        onSave={(fields, scoring) => {
          createInitiative.mutate(
            { data: { ...fields, ...(jira ? { jiraIssueId: jira.jiraIssueId } : {}) } },
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
                        description: "Your initiative has been saved and scored.",
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
  if (phase === "jira") return <InterviewJiraPicker onConfirm={startInterview} onSkip={() => startInterview(null)} />;

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
          Structuring your answers and calculating an initial Innovation Score.
        </p>
      </div>
    );
  }

  // -------- Chat interview --------
  const progressValue = readyToReview ? 100 : Math.min(95, ((currentIndex + 1) / MAX_QUESTIONS) * 100);

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-8rem)]">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-secondary" />
            Innovation Interview
          </h2>
          <p className="text-muted-foreground text-sm">
            A guided conversation that adapts to your idea and turns it into a
            scored initiative.
          </p>
           <p className="text-xs text-muted-foreground">Guided interview that builds on what you tell us.{fallback ? " Standard guided questions are in use for now." : ""}</p>
        </div>
        <div className="text-right min-w-[9rem]">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
             {readyToReview ? "Ready to review" : `Business context · ${currentIndex + 1} ${currentIndex === 0 ? "answer" : "answers"}`}
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
       {currentQuestion?.hint && !readyToReview && (
            <p className="text-xs text-muted-foreground px-1">
              {currentQuestion.hint}
            </p>
          )}
          <Textarea
            value={input}
            maxLength={1000}
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
             disabled={isTyping || readyToReview}
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
                   {input.trim() ? "Next" : "Skip / Not known yet"} <ArrowRight className="ml-1 h-4 w-4" />
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
                     <CheckCircle2 className="mr-1 h-4 w-4" /> Review Initiative
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
  aiResult: AIInterviewResult | null;
  jira: JiraIntakeContext | null;
  submitterName: string;
  departments: string[];
  categories: string[];
  levels: string[];
  saving: boolean;
  onBack: () => void;
  onSave: (fields: InitiativeDraftFields, scoring: ScoringComponents) => void;
}

function ReviewDraft({
  draft,
  aiResult,
  jira,
  submitterName,
  departments,
  categories,
  levels,
  saving,
  onBack,
  onSave,
}: ReviewProps) {
  const [fields, setFields] = useState<InitiativeDraftFields>({ ...draft.fields, submitterName: submitterName || draft.fields.submitterName });
  const [expectedValue, setExpectedValue] = useState(draft.canvas.expectedValue);
  const [considerations, setConsiderations] = useState(draft.canvas.risks);
  const [scoring, setScoring] = useState<ScoringComponents>(draft.scoring);
  const [errors, setErrors] = useState<Partial<Record<keyof InitiativeDraftFields, string>>>({});
  useEffect(() => {
    if (submitterName) setFields(prev => prev.submitterName ? prev : { ...prev, submitterName });
  }, [submitterName]);

  const setField = <K extends keyof InitiativeDraftFields>(
    key: K,
    value: InitiativeDraftFields[K],
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const setScore = (key: keyof ScoringComponents, value: string) => {
    const num = parseInt(value, 10);
    setScoring((prev) => ({ ...prev, [key]: Number.isNaN(num) ? 0 : num }));
  };

  const liveScore = computeScore(scoring);
  const livePriority = derivePriority(liveScore);
  const executiveSummary = draft.executiveSummary;
  const canvas = draft.canvas;

  const handleSave = () => {
    const missing = validateInitiativeDraft(fields, departments, categories);
    setErrors(missing);
    if (Object.keys(missing).length) {
      const first = REQUIRED_INITIATIVE_FIELDS.find(key => missing[key]);
      if (first) requestAnimationFrame(() => {
        const element = document.getElementById(`review-${first}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.focus();
      });
      return;
    }
    onSave({
      ...fields,
      desiredOutcome: [
        fields.desiredOutcome,
        expectedValue.trim() ? `Expected business value (estimate for review): ${expectedValue.trim()}` : "",
        considerations.trim() ? `Risks / considerations (to validate): ${considerations.trim()}` : "",
      ].filter(Boolean).join("\n\n"),
    }, scoring);
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
    { key: "aiReadinessScore", label: "Readiness (scoring model)", max: 10 },
    { key: "prototypeConfidence", label: "Delivery Confidence (scoring model)", max: 10 },
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
      {jira && <div className="rounded-md border bg-muted/30 p-3 text-sm">Starting Jira request: <strong>{jira.jiraIssueKey}</strong> — {jira.summary}. This read-only link will be saved with the initiative.</div>}

      <Card className="bg-primary text-primary-foreground border-primary">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm uppercase tracking-wider opacity-90">
              Executive Summary
            </CardTitle>
            <span className="text-xs opacity-75">
               Draft for your review · scoring: {RULE_ENGINE_SOURCE_LABEL}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{executiveSummary}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-secondary" />
          <h3 className="text-lg font-bold">Innovation Canvas</h3>
          <span className="text-xs text-muted-foreground">
             Drafted from your interview.
            Review and refine the initiative fields below before saving.
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(
            [
              ["Problem", canvas.problem],
              ["Current Process", canvas.currentProcess],
              ["Desired Outcome", canvas.desiredOutcome],
              ...(fields.aiConcept ? [["AI Opportunity", canvas.aiOpportunity]] : []),
              ["Expected Value", canvas.expectedValue],
              ...(fields.prototypeGoal ? [["Prototype Goal", canvas.prototypeGoal]] : []),
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

      {aiResult && (
        <Card>
          <CardHeader><CardTitle className="text-lg">What we heard</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <h4 className="font-semibold">Supplied by you or Jira</h4>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                {aiResult.knownFacts.map((fact, i) => (
                  <li key={i}>{fact.value} <span className="text-muted-foreground">({fact.source === "jira" ? "Jira" : "your answers"})</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Ideas to consider, not established facts</h4>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                {aiResult.inferredSuggestions.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
              {!!aiResult.unknowns.length && <p className="mt-3 text-muted-foreground">Not yet known: {aiResult.unknowns.join("; ")}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {aiResult && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Expected value and considerations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">These draft notes are not established facts. Edit or remove them before saving; they will be included with the desired outcome.</p>
            <div className="space-y-2">
              <Label htmlFor="review-expectedValue">Expected business value</Label>
              <Textarea id="review-expectedValue" value={expectedValue} onChange={e => setExpectedValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-considerations">Risks / considerations</Label>
              <Textarea id="review-considerations" value={considerations} onChange={e => setConsiderations(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                 <Label htmlFor="review-title">Initiative Title <span className="text-destructive">*</span></Label>
                <Input
                   id="review-title" aria-invalid={!!errors.title} aria-describedby={errors.title ? "error-title" : undefined}
                  value={fields.title}
                  onChange={(e) => setField("title", e.target.value)}
                />
                 {errors.title && <p id="error-title" role="alert" className="text-xs text-destructive">{errors.title}</p>}
              </div>
              <div className="space-y-2">
                 <Label htmlFor="review-department">Department <span className="text-destructive">*</span></Label>
                <Select
                  value={departments.includes(fields.department) ? fields.department : ""}
                  onValueChange={(v) => setField("department", v)}
                >
                   <SelectTrigger id="review-department" aria-invalid={!!errors.department} aria-describedby={errors.department ? "error-department" : undefined}>
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
                 {errors.department && <p id="error-department" role="alert" className="text-xs text-destructive">{errors.department}</p>}
              </div>
              <div className="space-y-2">
                 <Label htmlFor="review-category">Category <span className="text-destructive">*</span></Label>
                <Select
                  value={categories.includes(fields.category) ? fields.category : ""}
                  onValueChange={(v) => setField("category", v)}
                >
                   <SelectTrigger id="review-category" aria-invalid={!!errors.category} aria-describedby={errors.category ? "error-category" : undefined}>
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
                 {errors.category && <p id="error-category" role="alert" className="text-xs text-destructive">{errors.category}</p>}
              </div>
              <div className="space-y-2">
                 <Label htmlFor="review-submitterName">Submitter Name <span className="text-destructive">*</span></Label>
                <Input
                   id="review-submitterName" aria-invalid={!!errors.submitterName} aria-describedby={errors.submitterName ? "error-submitterName" : undefined}
                  value={fields.submitterName}
                  onChange={(e) => setField("submitterName", e.target.value)}
                />
                 {errors.submitterName && <p id="error-submitterName" role="alert" className="text-xs text-destructive">{errors.submitterName}</p>}
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
                 <Label htmlFor="review-problemStatement">Problem Statement <span className="text-destructive">*</span></Label>
                <Textarea
                   id="review-problemStatement" aria-invalid={!!errors.problemStatement} aria-describedby={errors.problemStatement ? "error-problemStatement" : undefined}
                  className="min-h-[100px]"
                  value={fields.problemStatement}
                  onChange={(e) => setField("problemStatement", e.target.value)}
                />
                 {errors.problemStatement && <p id="error-problemStatement" role="alert" className="text-xs text-destructive">{errors.problemStatement}</p>}
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
               <CardTitle className="text-lg">Approach & Success</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                 <Label>AI Concept (only if relevant)</Label>
                <Textarea
                  className="min-h-[90px]"
                  value={fields.aiConcept}
                  onChange={(e) => setField("aiConcept", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                 <Label>Prototype Goal (only if appropriate)</Label>
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
              <p className="text-xs text-muted-foreground">Leave estimates blank when not yet known. Value not yet quantified is not the same as no value.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Hours Saved / mo</Label>
                  <Input
                    type="number"
                    min={0}
                     value={fields.estimatedHoursSavedMonthly || ""}
                     placeholder="Not yet quantified"
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
                     value={fields.estimatedRevenueOpportunity || ""}
                     placeholder="Not yet quantified"
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
                     value={fields.estimatedCostSavings || ""}
                     placeholder="Not yet quantified"
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
                   <Label className="text-xs">AI Readiness (if relevant)</Label>
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

      {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-destructive font-medium">Please complete all marked fields before saving.</p>}

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
