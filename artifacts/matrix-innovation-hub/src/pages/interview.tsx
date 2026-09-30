import { useState, useRef, useEffect, useCallback } from "react";
import { finalizeInterviewDraft } from "@/components/initiative-review/review-model";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateInitiative,
  useGetSettings,
  getListInitiativesQueryKey,
  getGetDashboardSummaryQueryKey,
  type InitiativeInput,
} from "@workspace/api-client-react";
import {
  answersForReview,
  countTranscriptAnswers,
  privateInterview,
  trackInterviewSave,
  waitForInterviewSave,
  type PrivateInterviewDraft,
  type InterviewDraft,
  type InterviewQuestion,
} from "@/services/aiInterviewService";
import {
  interviewEngine,
  mapConversationToFallback,
  nextFallbackQuestion,
  fallbackReadiness,
  isInterviewReadiness,
  canDraft,
  missingCriticalContext,
  shouldContinueInterview,
  type InterviewReadiness,
  type CategoryDetection,
} from "@/services/interviewEngine";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { fetchSessionUser } from "@/lib/matrix-platform";
import { withBase } from "@/lib/base-path";
import { checkedResponse, isContentBlocked, safeErrorMessage } from "@/lib/content-safety-error";
import { InitiativeReview } from "@/components/initiative-review/initiative-review";
import { InterviewJiraPicker, type JiraIntakeContext } from "@/components/interview-jira-picker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  RotateCcw,
} from "lucide-react";

const MAX_QUESTIONS = 12;
interface AIInterviewResult {
  knownFacts: { category: string; value: string; evidence: string; source: "user" | "jira" }[];
  inferredSuggestions: string[];
  unknowns: string[];
  nextQuestion: string;
  readiness: InterviewReadiness;
  readyToDraft: boolean;
  nextQuestionValue: "high" | "medium" | "low";
  missingCriticalContext: string[];
  suggestedInitiativeType: string;
  suggestedTitle: string;
}
interface FinalDraftResult {
  suggestedTitle: string;
  draft: {
    problemStatement: string; currentProcess: string; desiredOutcome: string;
    expectedValue: string; successMetric: string; risks: string; executiveSummary?: string;
  };
  knownFacts: AIInterviewResult["knownFacts"];
  inferredSuggestions: string[];
  unknowns: string[];
}

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

type Phase = "jira" | "chat" | "processing" | "review";

type AnswerMap = Record<string, string>;
interface InterviewState {
  phase: Phase; jira: JiraIntakeContext | null; answers: AnswerMap;
  plan: InterviewQuestion[]; currentIndex: number; input: string;
  messages: ChatMessage[]; fallback: boolean; aiResult: AIInterviewResult | null;
  readyToReview: boolean; draft: InterviewDraft | null; finalResult: FinalDraftResult | null;
}

const LEVELS = ["Low", "Medium", "High"] as const;

function buildAnswerMap(
  plan: InterviewQuestion[],
  byId: AnswerMap,
): AnswerMap {
  const map: AnswerMap = {};
  for (const q of plan) map[q.id] = byId[q.id] ?? "";
  return map;
}

function transcriptTurns(messages: ChatMessage[]): { question: string; answer: string }[] {
  let question = "";
  const turns: { question: string; answer: string }[] = [];
  for (const message of messages) {
    if (message.role === "ai") question = message.text;
    else if (question) turns.push({ question, answer: message.text === "(nothing to add)" ? "" : message.text });
  }
  return turns;
}

function mergeFacts(
  existing: AIInterviewResult["knownFacts"] = [],
  updates: AIInterviewResult["knownFacts"] = [],
): AIInterviewResult["knownFacts"] {
  return [...new Map([...existing, ...updates].map(f => [`${f.source}:${f.evidence}`, f])).values()].slice(-24);
}

export default function AIInnovationInterview() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useGetSettings();
  const createInitiative = useCreateInitiative();
  const createInFlight = useRef(false);
  const [savingInitiative, setSavingInitiative] = useState(false);

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
  const [finalResult, setFinalResult] = useState<FinalDraftResult | null>(null);
  const [readiness, setReadiness] = useState<InterviewReadiness>(() => fallbackReadiness({}));
  const [savedInterview, setSavedInterview] = useState<PrivateInterviewDraft<InterviewState> | null>(null);
  const [resumeChoice, setResumeChoice] = useState(false);
  const [blockedActiveDraft, setBlockedActiveDraft] = useState(false);
  const [loadingInterview, setLoadingInterview] = useState(true);
  const [persistenceError, setPersistenceError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const ownerRef = useRef<string | null>(null);
  const sessionGeneration = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const savedRef = useRef<PrivateInterviewDraft<InterviewState> | null>(null);
  const stateRef = useRef<InterviewState | null>(null);
  const interviewGeneration = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const activeInterviewRef = useRef(false);
  activeInterviewRef.current = !resumeChoice && phase !== "jira";
  stateRef.current = { phase, jira, answers, plan, currentIndex, input, messages, fallback, aiResult, readyToReview, draft, finalResult };
  const clearInterview = useCallback(() => {
    createInFlight.current = false;
    setSavingInitiative(false);
    interviewGeneration.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    savedRef.current = null;
    setSavedInterview(null);
    setResumeChoice(false);
    setBlockedActiveDraft(false);
    setPhase("jira"); setJira(null); setMessages([]); setAnswers({});
    setPlan(interviewEngine.planQuestions({})); setCurrentIndex(0); setInput("");
    setIsTyping(false); setDraft(null); setDetection(null); setAiResult(null);
    setFinalResult(null); setFallback(false); setReadyToReview(false);
    setReadiness(fallbackReadiness({}));
  }, []);
  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const user = await fetchSessionUser();
        if (!active) return;
        if (!user?.sub) throw new Error("Sign in to use your private interview.");
        if (ownerRef.current === user.sub) return;
        const generation = ++sessionGeneration.current;
        clearInterview();
        ownerRef.current = user.sub;
        setSubmitterName(user.name ?? "");
        setLoadingInterview(true);
        await waitForInterviewSave(user.sub);
        if (!active || sessionGeneration.current !== generation) return;
        let remote: PrivateInterviewDraft<InterviewState> | null;
        try {
          ({ draft: remote } = await privateInterview.active<InterviewState>());
        } catch (error) {
          if (!active || sessionGeneration.current !== generation) return;
          if (!isContentBlocked(error)) throw error;
          // Keep the authenticated owner, but never retain or present the
          // rejected draft. Only an explicit confirmation may delete it.
          savedRef.current = null;
          setSavedInterview(null);
          setResumeChoice(false);
          setBlockedActiveDraft(true);
          setPersistenceError(safeErrorMessage(error, "This interview cannot be resumed."));
          return;
        }
        if (!active || sessionGeneration.current !== generation) return;
        savedRef.current = remote;
        setSavedInterview(remote);
        setResumeChoice(!!remote);
        setPersistenceError("");
      } catch (error) {
        if (!active) return;
        ownerRef.current = null;
        ++sessionGeneration.current;
        clearInterview();
        setPersistenceError(safeErrorMessage(error, "Could not load your interview."));
      } finally {
        if (active) setLoadingInterview(false);
      }
    };
    void checkSession();
    window.addEventListener("focus", checkSession);
    const interval = window.setInterval(checkSession, 30_000);
    return () => { active = false; window.removeEventListener("focus", checkSession); window.clearInterval(interval); };
  }, [clearInterview]);

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

  const resumeInterviewDraft = () => {
    const saved = savedRef.current?.state;
    if (!saved || !Array.isArray(saved.plan) || !saved.plan.length || !Array.isArray(saved.messages)) {
      setPersistenceError("This interview could not be resumed. You can start over.");
      return;
    }
    setJira(saved.jira); setAnswers(saved.answers); setPlan(saved.plan);
    setCurrentIndex(Math.max(0, Math.min(saved.currentIndex, saved.plan.length - 1)));
    setInput(saved.input ?? ""); setMessages(saved.messages);
    setFallback(saved.fallback); setAiResult(saved.aiResult); setDraft(saved.draft);
    setFinalResult(saved.finalResult ?? null); setReadyToReview(saved.readyToReview || saved.phase === "processing");
    setReadiness(isInterviewReadiness(saved.aiResult?.readiness) ? saved.aiResult.readiness :
      fallbackReadiness(saved.answers, transcriptTurns(saved.messages),
        saved.jira ? { summary: saved.jira.summary, description: saved.jira.description ?? "" } : null,
        saved.aiResult?.knownFacts ?? [], saved.aiResult?.unknowns ?? []));
    setDetection(saved.answers.idea ? interviewEngine.classify(saved.answers) : null);
    setPhase(saved.phase === "processing" ? "chat" : saved.phase);
    setResumeChoice(false);
  };

  const totalQuestions = plan.length;
  const isLastQuestion = readyToReview || (fallback && currentIndex === totalQuestions - 1);
  const currentQuestion = plan[currentIndex];
  const canSubmitAnswer = input.trim().length > 0 || currentQuestion?.id !== "idea";

  const persistDraft = (
    nextAnswers: AnswerMap, nextIndex: number, nextPlan = plan,
    usingFallback = fallback, nextMessages = messages, nextAIResult = aiResult,
    reviewReady = readyToReview, nextInput = "",
  ) => {
    const state: InterviewState = {
      ...stateRef.current!, phase: "chat", jira, answers: nextAnswers, currentIndex: nextIndex,
      plan: nextPlan, fallback: usingFallback, aiResult: usingFallback ? null : nextAIResult,
      readyToReview: reviewReady, messages: nextMessages, input: nextInput,
    };
    return queueSave(state);
  };
  const queueSave = (state: InterviewState): Promise<void> => {
    const generation = sessionGeneration.current;
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      const active = savedRef.current;
      if (generation !== sessionGeneration.current || !active) return;
      const updated = await privateInterview.save(active, state);
      if (generation !== sessionGeneration.current) return;
      savedRef.current = updated;
      setSavedInterview(updated);
      setPersistenceError("");
    }).catch(error => {
      if (generation === sessionGeneration.current)
        setPersistenceError(safeErrorMessage(error, "Could not save interview."));
      throw error;
    });
    saveQueue.current = operation.catch(() => {});
    if (ownerRef.current) trackInterviewSave(ownerRef.current, operation);
    return operation;
  };
  useEffect(() => () => {
    if (activeInterviewRef.current && savedRef.current && stateRef.current)
      void queueSave(stateRef.current).catch(() => {});
    interviewGeneration.current += 1;
    pendingRequest.current?.abort();
    // Only the final state is flushed; no origin-wide browser storage is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!savedRef.current || resumeChoice || phase !== "chat") return;
    const timer = window.setTimeout(() => {
      if (stateRef.current) void queueSave(stateRef.current).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
    // Inputs are autosaved; transitions also call persistDraft explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, phase, resumeChoice]);
  const startOver = async () => {
    const generation = ++sessionGeneration.current;
    const ownedId = savedRef.current?.id;
    const discardBlockedActive = blockedActiveDraft;
    const owner = ownerRef.current;
    interviewGeneration.current += 1;
    pendingRequest.current?.abort();
    try {
      await saveQueue.current;
      if (sessionGeneration.current !== generation || ownerRef.current !== owner) return;
      if (discardBlockedActive) await privateInterview.discardActive();
      else if (ownedId) await privateInterview.discard(ownedId);
      if (sessionGeneration.current !== generation) return;
    } catch (error) {
      setPersistenceError(safeErrorMessage(error, "Could not discard your interview."));
      return;
    }
    clearInterview();
    setPersistenceError("");
  };
  const startOverControl = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={savingInitiative || createInitiative.isPending}>
          <RotateCcw className="mr-1 h-4 w-4" /> Start Over
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this interview?</AlertDialogTitle>
          <AlertDialogDescription>
            Your current interview and draft, including any selected Jira context, will be discarded.
            Previously saved Initiatives will not be changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Interview</AlertDialogCancel>
          <AlertDialogAction onClick={startOver}>Discard and Start Over</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  const startInterview = async (item: JiraIntakeContext | null) => {
    if (!ownerRef.current || savedRef.current) return;
    setLoadingInterview(true);
    const initialAnswers: AnswerMap = item
      ? { jiraIssueId: item.jiraIssueId, idea: item.summary.trim(), ...(item.description?.trim() ? { problem: item.description.trim() } : {}) }
      : {};
    const initialPlan = interviewEngine.planQuestions(initialAnswers);
    const initialMessages: ChatMessage[] = [
      { role: "ai", text: interviewEngine.getIntro() },
      ...(item ? [{ role: "ai" as const, text: `I found ${item.jiraIssueKey}: ${item.summary}. ${item.description?.trim() ? "I have its description too, so we can focus on what is missing." : "Let's add the business context that's missing."}` }] : []),
      { role: "ai", text: initialPlan[0].prompt },
    ];
    const initialState: InterviewState = {
      phase: "chat", jira: item, answers: initialAnswers, plan: initialPlan,
      currentIndex: 0, fallback: false, readyToReview: false, aiResult: null,
      draft: null, finalResult: null, input: "", messages: initialMessages,
    };
    const generation = sessionGeneration.current;
    try {
      const created = await privateInterview.create(initialState);
      if (generation !== sessionGeneration.current) return;
      savedRef.current = created;
      setSavedInterview(created);
      setJira(item); setAnswers(initialAnswers); setPlan(initialPlan);
      setCurrentIndex(0); setFallback(false); setReadyToReview(false);
      setAiResult(null); setDraft(null); setFinalResult(null); setInput("");
      setReadiness(fallbackReadiness(initialAnswers, [],
        item ? { summary: item.summary, description: item.description ?? "" } : null));
      setDetection(item ? interviewEngine.classify(initialAnswers) : null);
      setMessages(initialMessages); setPhase("chat"); setPersistenceError("");
    } catch (error) {
      setPersistenceError(safeErrorMessage(error, "Could not start your interview."));
      if (!isContentBlocked(error) && error instanceof Error && /active|409/i.test(error.message)) {
        const active = await privateInterview.active<InterviewState>().catch(() => null);
        if (active?.draft && generation === sessionGeneration.current) {
          savedRef.current = active.draft; setSavedInterview(active.draft); setResumeChoice(true);
        }
      }
    } finally {
      if (generation === sessionGeneration.current) setLoadingInterview(false);
    }
  };

  const handleNext = async () => {
    if (isTyping || !savedRef.current || countTranscriptAnswers(messages) >= MAX_QUESTIONS) return;
    const generation = interviewGeneration.current;
    const trimmed = input.trim();
    if (!trimmed && currentQuestion.id === "idea") return;

    const nextAnswers: AnswerMap = { ...answers, [currentQuestion.id]: trimmed };
    if (currentQuestion.id.startsWith("ai_") && trimmed) {
      nextAnswers.aiContext = [answers.aiContext, `${currentQuestion.prompt}: ${trimmed}`].filter(Boolean).join("\n");
    }
    const answeredMessages: ChatMessage[] = [
      ...messages,
      { role: "user", text: trimmed || "(nothing to add)" },
    ];
    // Validate and persist the submitted turn before clearing the editable input,
    // advancing the transcript, or calling AI. Rejected text stays only in the input.
    try {
      await persistDraft(nextAnswers, currentIndex, plan, fallback, answeredMessages, aiResult, true);
    } catch (error) {
      setPersistenceError(safeErrorMessage(error, "Could not save interview. Please retry."));
      return;
    }
    setAnswers(nextAnswers);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed || "(nothing to add)" },
    ]);
    setInput("");
    // A navigation during AI inference must retain this submitted turn. On
    // resume, offer drafting rather than repeating the answered question.
    setReadyToReview(true);
    if (stateRef.current) stateRef.current = {
      ...stateRef.current, answers: nextAnswers, messages: answeredMessages,
      input: "", readyToReview: true,
    };
    void persistDraft(nextAnswers, currentIndex, plan, fallback, answeredMessages, aiResult, true).catch(() => {});

    const newDetection = interviewEngine.classify(nextAnswers);
    setDetection(newDetection);
    const nextIndex = currentIndex + 1;
    const turns = transcriptTurns(answeredMessages);
    const answerCount = turns.length;
    const localReadiness = fallbackReadiness(nextAnswers, turns, jira ? { summary: jira.summary, description: jira.description ?? "" } : null);
    setReadiness(localReadiness);
    setIsTyping(true);
    // The hard ceiling drafts from all submitted answers, even if AI is down.
    if (answerCount >= MAX_QUESTIONS) {
      setReadyToReview(true);
      setMessages([...answeredMessages, { role: "ai", text: "You have reached the interview limit. Let's review the best available draft." }]);
      setIsTyping(false);
      await persistDraft(nextAnswers, currentIndex, plan, fallback, answeredMessages, aiResult, true).catch(() => {});
      await runProcessing(nextAnswers, plan, !fallback, generation, answeredMessages);
      return;
    }
    if (!fallback) {
      try {
        const controller = new AbortController();
        pendingRequest.current = controller;
        const response = await fetch(withBase("/api/interview/advance"), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns, jira: jira ? { summary: jira.summary, description: jira.description ?? "" } : null,
            knownFacts: aiResult?.knownFacts?.slice(-24) ?? [] }),
          signal: controller.signal,
        });
        if (interviewGeneration.current !== generation) return;
        await checkedResponse(response, "Interview service unavailable");
        const result = await response.json() as AIInterviewResult;
        if (interviewGeneration.current !== generation) return;
        if (typeof result.readyToDraft !== "boolean" ||
          !["high", "medium", "low"].includes(result.nextQuestionValue) ||
          !Array.isArray(result.missingCriticalContext) ||
          !Array.isArray(result.knownFacts) || !Array.isArray(result.inferredSuggestions))
          throw new Error("Invalid interview response");
        result.knownFacts = mergeFacts(aiResult?.knownFacts, result.knownFacts);
        if (!isInterviewReadiness(result.readiness))
          result.readiness = fallbackReadiness(nextAnswers, turns,
            jira ? { summary: jira.summary, description: jira.description ?? "" } : null,
            result.knownFacts, result.unknowns);
        setAiResult(result);
        setReadiness(result.readiness);
        if (result.readyToDraft || !shouldContinueInterview(result.readiness, answerCount, result.nextQuestionValue, result.missingCriticalContext) ||
          !result.nextQuestion?.trim()) {
          setReadyToReview(true);
          const completedMessages: ChatMessage[] = [...answeredMessages, { role: "ai", text: "Looks like I have enough to draft this initiative." }];
          setMessages(completedMessages);
          setIsTyping(false);
          await persistDraft(nextAnswers, currentIndex, plan, false, completedMessages, result, true).catch(() => {});
          return;
        }
        const nextQuestion = { id: `ai_${nextIndex}`, prompt: result.nextQuestion, hint: "A rough answer is fine. You can also skip what you don't know.", placeholder: "Share what you know..." };
        const nextPlan = [...plan.slice(0, nextIndex), nextQuestion];
        setPlan(nextPlan);
        const continuedMessages: ChatMessage[] = [...answeredMessages, { role: "ai", text: nextQuestion.prompt }];
        setMessages(continuedMessages);
        setCurrentIndex(nextIndex);
        setReadyToReview(false);
        setIsTyping(false);
        await persistDraft(nextAnswers, nextIndex, nextPlan, false, continuedMessages, result, false).catch(() => {});
        return;
      } catch (error) {
        if (interviewGeneration.current !== generation) return;
        if (isContentBlocked(error)) {
          setPersistenceError(safeErrorMessage(error, "Interview content could not be used."));
          setIsTyping(false);
          return;
        }
        setFallback(true);
        setAiResult(null);
        answeredMessages.push({ role: "ai", text: "The guided assistant is temporarily unavailable. We'll continue with the standard interview." });
        setMessages(answeredMessages);
      } finally {
        if (interviewGeneration.current === generation) pendingRequest.current = null;
      }
    }
    const knownAnswers = mapConversationToFallback(nextAnswers, turns);
    setAnswers(knownAnswers);
    const newPlan = interviewEngine.planQuestions(knownAnswers);
    setPlan(newPlan);
    // AI questions are not positions in the rule engine's plan. Resume at the
    // first unanswered rule question, retaining AI answers for the final draft.
    const fallbackIndex = fallback
      ? (() => { const index = nextFallbackQuestion(newPlan.slice(nextIndex), knownAnswers); return index < 0 ? -1 : nextIndex + index; })()
      : nextFallbackQuestion(newPlan, knownAnswers);
    if (canDraft(localReadiness) || fallbackIndex < 0 || fallbackIndex >= newPlan.length ||
        nextFallbackQuestion(newPlan, knownAnswers) < 0) {
      setIsTyping(false);
      await persistDraft(knownAnswers, currentIndex, newPlan, true, answeredMessages, null);
      await runProcessing(knownAnswers, newPlan, false, generation, answeredMessages);
      return;
    }

    const ack = await interviewEngine.acknowledge(currentIndex);
    if (interviewGeneration.current !== generation) return;
    answeredMessages.push({ role: "ai", text: ack });
    setMessages([...answeredMessages]);
    await new Promise((r) => setTimeout(r, 450));
    if (interviewGeneration.current !== generation) return;
    const nextQuestion = newPlan[fallbackIndex];
    answeredMessages.push({ role: "ai", text: nextQuestion.prompt });
    setMessages([...answeredMessages]);
    setReadyToReview(false);
    await persistDraft(knownAnswers, fallbackIndex, newPlan, true, answeredMessages, null, false).catch(() => {});
    setIsTyping(false);
    setCurrentIndex(fallbackIndex);
    setInput(knownAnswers[nextQuestion.id] ?? "");
  };

  const handleBack = () => {
    if (isTyping || (currentIndex === 0 && !readyToReview)) return;
    if (readyToReview) {
      const previousMessages = messages.slice(0, -2);
      const previousInput = answers[currentQuestion.id] ?? "";
      setReadyToReview(false); setInput(previousInput); setMessages(previousMessages);
      void persistDraft(answers, currentIndex, plan, fallback, previousMessages, aiResult, false, previousInput).catch(() => {});
      return;
    }
    if (!fallback) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      setReadyToReview(false);
      setAiResult(null);
      setInput(answers[plan[prevIndex].id] ?? "");
      const previousMessages = messages.slice(0, -2);
      setMessages(previousMessages);
      persistDraft(answers, prevIndex, plan, false, previousMessages, null, false, answers[plan[prevIndex].id] ?? "");
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
    setReadyToReview(false);
    persistDraft(nextAnswers, prevIndex, rebuiltPlan, true, rebuilt, null, false, nextAnswers[rebuiltPlan[prevIndex].id] ?? "");
  };

  const handleSaveDraft = async () => {
    const nextAnswers: AnswerMap = {
      ...answers,
      [currentQuestion.id]: input.trim(),
    };
    try {
      await persistDraft(nextAnswers, currentIndex, plan, fallback, messages, aiResult, readyToReview, input.trim());
      setAnswers(nextAnswers);
      toast({ title: "Interview saved", description: "Only you can resume this interview." });
    } catch (error) {
      toast({ title: "Could not save", description: safeErrorMessage(error, "Please retry."), variant: "destructive" });
    }
  };

  const runProcessing = async (
    finalAnswers: AnswerMap,
    finalPlan: InterviewQuestion[],
    useAI = !fallback,
    generation = interviewGeneration.current,
    finalMessages = messages,
  ) => {
    setPhase("processing");
    const answerMap = { ...finalAnswers, ...buildAnswerMap(finalPlan, finalAnswers) };
    const turns = transcriptTurns(finalMessages);
    if (finalAnswers.aiContext) answerMap.notes = [answerMap.notes, finalAnswers.aiContext].filter(Boolean).join("\n");
    let result = await interviewEngine.generateDraft(answerMap, finalPlan);
    if (interviewGeneration.current !== generation) return;
    if (!result.fields.problemStatement.trim()) result.fields.problemStatement = finalAnswers.idea?.trim() || jira?.summary || "";
    let completed: FinalDraftResult | null = null;
    if (useAI && turns.length) {
      try {
        const controller = new AbortController();
        pendingRequest.current = controller;
        const response = await fetch(withBase("/api/interview/draft"), {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns: turns.slice(0, MAX_QUESTIONS),
            jira: jira ? { summary: jira.summary, description: jira.description ?? "" } : null,
            knownFacts: aiResult?.knownFacts?.slice(0, 24) ?? [] }),
          signal: controller.signal,
        });
        await checkedResponse(response, "Final drafting unavailable");
        const data = await response.json() as FinalDraftResult;
        if (!data.draft || !Array.isArray(data.unknowns) || !Array.isArray(data.knownFacts))
          throw new Error("Invalid final draft");
        completed = data;
      } catch (error) {
        if (isContentBlocked(error)) {
          if (interviewGeneration.current === generation) {
            setPersistenceError(safeErrorMessage(error, "Final drafting was blocked."));
            setPhase("chat");
          }
          return;
        }
        // All supplied answers remain in the deterministic draft on AI failure.
      } finally {
        pendingRequest.current = null;
      }
    }
    if (interviewGeneration.current !== generation) return;
    const reviewResult = completed ?? {
      knownFacts: aiResult?.knownFacts ?? [], inferredSuggestions: aiResult?.inferredSuggestions ?? [],
      unknowns: [...new Set([...(aiResult?.unknowns ?? []), ...missingCriticalContext(fallbackReadiness(finalAnswers, turns, jira ? { summary: jira.summary, description: jira.description ?? "" } : null))])],
      suggestedTitle: "", draft: { problemStatement: "", currentProcess: "", desiredOutcome: "", expectedValue: "", successMetric: "", risks: "" },
    };
    result = finalizeInterviewDraft(result, completed, reviewResult, [
        ...turns.map(t => ({ value: t.answer, source: "user" as const })),
        ...Object.values(finalAnswers).map(value => ({ value, source: "user" as const })),
        ...(jira ? [{ value: [jira.summary, jira.description].filter(Boolean).join("\n"), source: "jira" as const }] : []),
    ]);
    setFinalResult(reviewResult);
    setDraft(result);
    setPhase("review");
    void queueSave({ ...stateRef.current!, phase: "review", answers: finalAnswers, plan: finalPlan,
      draft: result, finalResult: reviewResult, messages: finalMessages, readyToReview: true }).catch(() => {});
  };

  const handleFinish = async () => {
    if (isTyping) return;
    // A completed AI turn was already saved and the disabled input is empty.
    // Do not replace its answer when moving to review.
    const nextAnswers = answersForReview(answers, currentQuestion.id, input, readyToReview);
    const finalMessages: ChatMessage[] = !readyToReview && input.trim()
      ? [...messages, { role: "user", text: input.trim() }] : messages;
    const finalPlan = fallback ? interviewEngine.planQuestions(nextAnswers) : plan;
    try {
      await persistDraft(nextAnswers, currentIndex, finalPlan, fallback, finalMessages, aiResult, true);
    } catch (error) {
      setPersistenceError(safeErrorMessage(error, "Could not save interview. Please retry."));
      return;
    }
    setAnswers(nextAnswers);
    setMessages(finalMessages);
    setPlan(finalPlan);
    await runProcessing(nextAnswers, finalPlan, !fallback, interviewGeneration.current, finalMessages);
  };

  const resumeInterview = () => {
    setPhase("chat");
  };
  const continueInterview = () => {
    if (!aiResult?.nextQuestion?.trim() ||
      !shouldContinueInterview(readiness, transcriptTurns(messages).length,
        aiResult.nextQuestionValue, aiResult.missingCriticalContext)) return;
    const nextIndex = currentIndex + 1;
    const question: InterviewQuestion = { id: `ai_${nextIndex}`, prompt: aiResult.nextQuestion,
      hint: "A rough answer is fine. You can skip what you don't know.", placeholder: "Share what you know..." };
    const nextPlan = [...plan.slice(0, nextIndex), question];
    const nextMessages = [...messages, { role: "ai" as const, text: question.prompt }];
    setPlan(nextPlan); setCurrentIndex(nextIndex); setMessages(nextMessages);
    setReadyToReview(false); setInput("");
    void persistDraft(answers, nextIndex, nextPlan, false, nextMessages, aiResult, false).catch(() => {});
  };

  if (loadingInterview || resumeChoice || blockedActiveDraft || (persistenceError && !savedInterview && !ownerRef.current)) {
    return <div className="max-w-3xl mx-auto py-16 space-y-5 text-center">
      <h2 className="text-2xl font-bold">Guided Idea Interview</h2>
      {loadingInterview ? <p data-testid="status-loading-interview">Loading your private interview…</p> : blockedActiveDraft ?
        <><p>A previous interview cannot be resumed under the current content policy. You may discard it and start a new interview. Nothing has been deleted yet.</p>
          <p role="alert" className="text-destructive">{persistenceError}</p>
          <div className="flex justify-center">{startOverControl}</div></> : resumeChoice ?
        <><p>You have an unfinished interview. Choose how to proceed.</p>
          {persistenceError && <p role="alert" className="text-destructive">{persistenceError}</p>}
          <div className="flex justify-center gap-3">
            <Button data-testid="button-resume-interview" onClick={resumeInterviewDraft}>Resume Interview</Button>
            {startOverControl}
          </div></> :
        <p role="alert" className="text-destructive">{persistenceError}</p>}
    </div>;
  }

  // -------- Review / edit before saving --------
  if (phase === "review" && draft) {
    return (
      <>
      {persistenceError && <p role="alert" data-print-hide className="max-w-[52rem] mx-auto text-destructive mb-3 text-sm">Autosave failed: {persistenceError}</p>}
      <InitiativeReview
        draft={draft}
        aiResult={finalResult}
        jira={jira}
        submitterName={submitterName}
        departments={settings?.departments ?? []}
        categories={settings?.categories ?? []}
        levels={[...LEVELS]}
        saving={savingInitiative || createInitiative.isPending}
        readiness={`${readiness.score}% \u2014 ${readiness.label}`}
        toolbarExtra={startOverControl}
        onBack={resumeInterview}
        onDraftChange={(updated) => {
          setDraft(updated);
          void queueSave({ ...stateRef.current!, draft: updated }).catch(() => {});
        }}
        onSave={async (fields, scoring, extras) => {
          if (createInFlight.current) return;
          createInFlight.current = true;
          setSavingInitiative(true);
          const owned = savedRef.current;
          const ownerGeneration = sessionGeneration.current;
          if (!owned || !ownerRef.current) {
            setPersistenceError("Your private interview is no longer available. Please reload.");
            createInFlight.current = false;
            setSavingInitiative(false);
            return;
          }
          try {
            await saveQueue.current;
            if (ownerGeneration !== sessionGeneration.current || savedRef.current?.id !== owned.id) { createInFlight.current = false; setSavingInitiative(false); return; }
            await queueSave({ ...stateRef.current!, phase: "review",
              draft: extras.reviewDraft });
            if (ownerGeneration !== sessionGeneration.current || savedRef.current?.id !== owned.id) { createInFlight.current = false; setSavingInitiative(false); return; }
          } catch {
            createInFlight.current = false;
            setSavingInitiative(false);
            toast({ title: "Interview not saved", description: "Please retry before saving your initiative.", variant: "destructive" });
            return;
          }
          const b = extras.reviewedBrief;
          // The generated export contract exposes nested objects as JSON records.
          // Copy each semantic object into a record without losing its reviewed shape.
          const reviewedBrief: InitiativeInput["reviewedBrief"] = {
            metadata: { ...b.metadata }, executiveSummary: { ...b.executiveSummary },
            businessNeed: { ...b.businessNeed }, futureState: { ...b.futureState },
            expectedValue: { ...b.expectedValue }, successMeasures: { ...b.successMeasures },
            risks: { ...b.risks }, unknowns: b.unknowns.map(u => ({ ...u })),
            nextSteps: { ...b.nextSteps }, assessment: { ...b.assessment },
            supportingContext: { ...b.supportingContext },
          };
          const initiativeInput: InitiativeInput = { ...fields, ...scoring, executiveSummary: extras.executiveSummary, reviewedBrief, interviewDraftId: owned.id,
            ...(jira ? { jiraIssueId: jira.jiraIssueId } : {}) };
          createInitiative.mutate(
            { data: initiativeInput },
            {
              onSuccess: (created) => {
                if (ownerGeneration !== sessionGeneration.current || savedRef.current?.id !== owned.id) { createInFlight.current = false; setSavingInitiative(false); return; }
                // Create atomically completes the private draft on the server.
                // Clear the local reference before navigation/unmount autosave.
                savedRef.current = null;
                setSavedInterview(null);
                 createInFlight.current = false;
                 setSavingInitiative(false);
                 queryClient.invalidateQueries({ queryKey: getListInitiativesQueryKey() });
                 queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
                 toast({ title: "Initiative created", description: "Your initiative has been saved and scored." });
                 setLocation(`/initiatives/${created.id}`);
              },
               onError: (error) => {
                 createInFlight.current = false;
                 setSavingInitiative(false);
                if (ownerGeneration !== sessionGeneration.current) return;
                toast({
                  title: "Error",
                   description: safeErrorMessage(error, "Failed to create the initiative."),
                  variant: "destructive",
                });
              },
            },
          );
        }}
      />
      </>
    );
  }
  if (phase === "jira") return <div>
    {persistenceError && <p role="alert" className="text-destructive mb-4">{persistenceError}</p>}
    <InterviewJiraPicker onConfirm={startInterview} onSkip={() => startInterview(null)} />
  </div>;

  // -------- Processing --------
  if (phase === "processing") {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-32 text-center">
        <div className="self-end mb-4">{startOverControl}</div>
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
  const progressValue = readiness.score;
  const answerCount = countTranscriptAnswers(messages);
  const allowEarlyDraft = canDraft(readiness) && answerCount > 0;
  const allowContinue = readyToReview && !fallback && !!aiResult?.nextQuestion?.trim() &&
    shouldContinueInterview(readiness, transcriptTurns(messages).length,
      aiResult.nextQuestionValue, aiResult.missingCriticalContext);

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
        <div className="text-right min-w-[9rem] flex flex-col items-end gap-2">
          {startOverControl}
          <div data-testid="status-interview-readiness" className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            Interview Readiness · {progressValue}% — {readiness.label}
          </div>
          <div data-testid="text-interview-answer-count" className="text-xs text-muted-foreground">{answerCount} {answerCount === 1 ? "answer" : "answers"}</div>
          <Progress value={progressValue} className="h-2 mt-2 w-36" />
        </div>
      </div>

      {detection && (
        <div className="mb-4 shrink-0">
          <DetectedTypeBadge label={detection.label} />
        </div>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden">
        {persistenceError && <p role="alert" className="text-destructive text-sm p-3 border-b">Autosave failed: {persistenceError}</p>}
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
            onChange={(e) => {
              if (stateRef.current) stateRef.current = { ...stateRef.current, input: e.target.value };
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (isLastQuestion) void handleFinish();
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
                disabled={(currentIndex === 0 && !readyToReview) || isTyping}
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
                <>
                {allowEarlyDraft && <Button data-testid="button-early-draft" variant="outline" onClick={handleFinish} disabled={isTyping}>Draft My Initiative</Button>}
                <Button onClick={handleNext} disabled={!canSubmitAnswer || isTyping}>
                   {input.trim() ? "Next" : "Skip / Not known yet"} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
                </>
              ) : (
                <>
                  {allowContinue && <Button data-testid="button-continue-interview" variant="outline" onClick={continueInterview}>Continue Interview</Button>}
                  {!readyToReview && <Button variant="outline" onClick={handleNext} disabled={isTyping || !input.trim()}>
                    <Send className="mr-1 h-4 w-4" /> Send
                  </Button>}
                   <Button onClick={handleFinish} disabled={isTyping}>
                     <CheckCircle2 className="mr-1 h-4 w-4" /> Draft My Initiative
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
