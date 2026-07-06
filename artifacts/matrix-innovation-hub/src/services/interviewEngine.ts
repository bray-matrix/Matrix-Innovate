// interviewEngine (v0.1.3)
// -----------------------------------------------------------------------------
// The ADAPTIVE decision logic for the AI Innovation Interview.
//
// This is the single module a future OpenAI integration would replace: it owns
// (1) how an initiative is classified into a category, (2) which questions are
// asked based on that classification, and (3) how the final answers are turned
// into a draft. The scoring/draft heuristics themselves live in
// `aiInterviewService.ts` so the score model stays stable when the engine is
// swapped for a real model.
//
// To wire up OpenAI later, implement the `InterviewEngine` interface with API
// calls and export it as `interviewEngine` — nothing in the UI needs to change.

import {
  buildDraft,
  isCoreQuestion,
  type AnswerMap,
  type CategorySignal,
  type InterviewDraft,
  type InterviewQuestion,
} from "./aiInterviewService";

export type InitiativeCategory =
  | "Operations"
  | "Production"
  | "Customer Experience"
  | "Revenue Growth"
  | "Internal Productivity"
  | "Compliance"
  | "Technology"
  | "Experimental";

export interface CategoryDetection {
  category: InitiativeCategory;
  label: string;
  confidence: number;
}

export interface InterviewEngine {
  getIntro(): string;
  classify(answers: AnswerMap): CategoryDetection;
  planQuestions(answers: AnswerMap): InterviewQuestion[];
  acknowledge(index: number): Promise<string>;
  generateDraft(
    answers: AnswerMap,
    plan: InterviewQuestion[],
  ): Promise<InterviewDraft>;
}

interface CategoryDefinition {
  category: InitiativeCategory;
  label: string;
  // Which admin-configured initiative category this maps to (for pre-filling
  // the review form's Category dropdown). Must match values in settings.
  suggestedInitiativeCategory: string;
  keywords: string[];
  questions: InterviewQuestion[];
}

// -------- Core questions asked in every interview --------
const OPENING_QUESTIONS: InterviewQuestion[] = [
  {
    id: "idea",
    prompt: "Tell me about your idea.",
    hint: "A sentence or two is perfect — what are you imagining?",
    placeholder:
      "e.g. An assistant that drafts responses to routine customer emails...",
  },
  {
    id: "problem",
    prompt: "What business problem are you solving?",
    hint: "What's painful, slow, costly, or error-prone today?",
    placeholder:
      "e.g. Agents spend hours each day writing near-identical replies...",
  },
];

const CLOSING_QUESTIONS: InterviewQuestion[] = [
  {
    id: "loss",
    prompt: "Approximately how much time or money is lost today?",
    hint: "A rough estimate is fine — hours per month, dollars, or both.",
    placeholder: "e.g. Roughly 400 hours a month, around $60,000 a year in labor...",
  },
  {
    id: "success",
    prompt: "What would success look like?",
    hint: "Describe the outcome and how you'd measure it.",
    placeholder: "e.g. Reply time cut in half with quality kept high...",
  },
  {
    id: "ai",
    prompt: "How could AI help?",
    hint: "Your best guess — we'll refine it together.",
    placeholder: "e.g. Generate a draft reply from the email and our knowledge base...",
  },
  {
    id: "prototype",
    prompt: "What can realistically be proven within two weeks?",
    hint: "The smallest slice that would build confidence.",
    placeholder: "e.g. Draft replies for the top 3 request types on last month's emails...",
  },
  {
    id: "notes",
    prompt: "Anything else we should know?",
    hint: "Constraints, risks, data, stakeholders — optional but helpful.",
    placeholder: "e.g. Data lives in Zendesk; compliance must review customer-facing text...",
  },
];

// -------- Category banks: label, keywords, and adaptive questions --------
const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    category: "Operations",
    label: "Operations Improvement",
    suggestedInitiativeCategory: "Operational Efficiency",
    keywords: [
      "manual",
      "process",
      "workflow",
      "operations",
      "back office",
      "back-office",
      "paperwork",
      "data entry",
      "repetitive",
      "routine",
      "admin",
      "spreadsheet",
      "logistics",
      "scheduling",
    ],
    questions: [
      {
        id: "ops_manual",
        prompt: "What manual work is happening today?",
        hint: "The hands-on steps people repeat.",
        placeholder: "e.g. Staff re-key order details from PDFs into the ERP...",
      },
      {
        id: "ops_headcount",
        prompt: "How many employees perform this work?",
        hint: "A rough headcount is fine.",
        placeholder: "e.g. About 6 people across two shifts...",
      },
      {
        id: "ops_frequency",
        prompt: "How often does this happen?",
        hint: "Daily, weekly, per order — whatever fits.",
        placeholder: "e.g. Continuously through the day, ~300 orders daily...",
      },
      {
        id: "ops_equipment",
        prompt: "Is there existing equipment or systems involved?",
        hint: "Tools, machines, or software already in place.",
        placeholder: "e.g. SAP ERP, barcode scanners, a shared drive...",
      },
    ],
  },
  {
    category: "Production",
    label: "Production Optimization",
    suggestedInitiativeCategory: "Operational Efficiency",
    keywords: [
      "manufactur",
      "production",
      "factory",
      "assembly",
      "machine",
      "throughput",
      "defect",
      "quality control",
      "yield",
      "line",
      "warehouse",
      "inventory",
      "supply chain",
      "maintenance",
    ],
    questions: [
      {
        id: "prod_output",
        prompt: "What is being produced or manufactured?",
        hint: "The product or output at the center of this.",
        placeholder: "e.g. Injection-molded plastic housings...",
      },
      {
        id: "prod_volume",
        prompt: "What volume or throughput is involved?",
        hint: "Units per hour/day, or overall scale.",
        placeholder: "e.g. Around 12,000 units per day across 3 lines...",
      },
      {
        id: "prod_bottleneck",
        prompt: "Where are the bottlenecks or defects?",
        hint: "Where things slow down, break, or go wrong.",
        placeholder: "e.g. Manual QC inspection misses ~4% of surface defects...",
      },
      {
        id: "prod_equipment",
        prompt: "What equipment or machinery is involved?",
        hint: "Lines, sensors, PLCs, cameras, etc.",
        placeholder: "e.g. Two vision cameras and a legacy PLC per line...",
      },
    ],
  },
  {
    category: "Customer Experience",
    label: "Customer Experience",
    suggestedInitiativeCategory: "Customer Experience",
    keywords: [
      "customer",
      "client",
      "support",
      "service",
      "experience",
      "satisfaction",
      "complaint",
      "ticket",
      "response time",
      "onboarding",
      "patient",
      "member",
      "cx",
      "nps",
    ],
    questions: [
      {
        id: "cx_audience",
        prompt: "Is this an internal or external customer?",
        hint: "Who is on the receiving end of the experience?",
        placeholder: "e.g. External — small-business account holders...",
      },
      {
        id: "cx_pain",
        prompt: "What is the current pain point?",
        hint: "The friction the customer feels today.",
        placeholder: "e.g. Customers wait 24+ hours for a first reply...",
      },
      {
        id: "cx_improvement",
        prompt: "What improvement do you expect?",
        hint: "The better experience you're aiming for.",
        placeholder: "e.g. Instant acknowledgements and same-hour resolutions...",
      },
      {
        id: "cx_outcome",
        prompt: "What measurable customer outcome defines success?",
        hint: "A number you could track — CSAT, response time, churn.",
        placeholder: "e.g. CSAT from 78% to 90%, first response under 1 hour...",
      },
    ],
  },
  {
    category: "Revenue Growth",
    label: "Revenue Growth",
    suggestedInitiativeCategory: "Revenue Growth",
    keywords: [
      "revenue",
      "sales",
      "sell",
      "market",
      "pricing",
      "upsell",
      "cross-sell",
      "lead",
      "conversion",
      "growth",
      "monetiz",
      "acquisition",
      "churn",
      "subscription",
    ],
    questions: [
      {
        id: "rev_buyer",
        prompt: "Who would buy this?",
        hint: "The buyer or segment you have in mind.",
        placeholder: "e.g. Mid-market operations managers...",
      },
      {
        id: "rev_customers",
        prompt: "Existing customers or new customers?",
        hint: "Expansion, acquisition, or both.",
        placeholder: "e.g. Mostly upsell to existing accounts, some new logos...",
      },
      {
        id: "rev_market",
        prompt: "What is the estimated market size?",
        hint: "A ballpark is fine — accounts, dollars, or reach.",
        placeholder: "e.g. ~2,000 target accounts, ~$5M addressable...",
      },
      {
        id: "rev_advantage",
        prompt: "What is the competitive advantage?",
        hint: "Why this wins versus alternatives.",
        placeholder: "e.g. Proprietary data no competitor has access to...",
      },
    ],
  },
  {
    category: "Internal Productivity",
    label: "Internal Productivity",
    suggestedInitiativeCategory: "Internal Productivity",
    keywords: [
      "employee",
      "team",
      "internal",
      "productivity",
      "meeting",
      "document",
      "report",
      "knowledge",
      "collaboration",
      "hr ",
      "onboarding staff",
      "search",
      "wiki",
      "handbook",
    ],
    questions: [
      {
        id: "int_task",
        prompt: "What internal task or workflow is slow?",
        hint: "The day-to-day work that drags.",
        placeholder: "e.g. Finding the right policy doc across scattered drives...",
      },
      {
        id: "int_teams",
        prompt: "Which teams or roles are involved?",
        hint: "Who would use or benefit from this.",
        placeholder: "e.g. HR, IT support, and all new hires...",
      },
      {
        id: "int_tools",
        prompt: "What tools are used today?",
        hint: "The current apps, docs, or systems.",
        placeholder: "e.g. SharePoint, Slack, and a set of PDFs...",
      },
      {
        id: "int_time",
        prompt: "How much time is spent on it?",
        hint: "Per person, per week — a rough figure.",
        placeholder: "e.g. About 3 hours per employee each week...",
      },
    ],
  },
  {
    category: "Compliance",
    label: "Compliance & Risk",
    suggestedInitiativeCategory: "Compliance and Security",
    keywords: [
      "compliance",
      "hipaa",
      "soc2",
      "soc 2",
      "pci",
      "gdpr",
      "usps",
      "audit",
      "regulat",
      "legal",
      "privacy",
      "security",
      "risk",
      "policy",
      "governance",
    ],
    questions: [
      {
        id: "comp_frameworks",
        prompt: "Which frameworks apply (e.g. HIPAA, SOC2, PCI, USPS)?",
        hint: "List whatever standards are in play.",
        placeholder: "e.g. HIPAA for patient data, plus SOC 2 Type II...",
      },
      {
        id: "comp_data",
        prompt: "What sensitive data is involved?",
        hint: "PII, PHI, payment data, etc.",
        placeholder: "e.g. Patient records and partial payment details...",
      },
      {
        id: "comp_audit",
        prompt: "What are the audit or reporting requirements?",
        hint: "What must be evidenced or logged.",
        placeholder: "e.g. Quarterly access reviews and an immutable audit log...",
      },
      {
        id: "comp_risk",
        prompt: "What is the risk of non-compliance?",
        hint: "Fines, exposure, or operational impact.",
        placeholder: "e.g. Fines up to $1.5M and loss of a key contract...",
      },
    ],
  },
  {
    category: "Technology",
    label: "Technology Enablement",
    suggestedInitiativeCategory: "Experimental",
    keywords: [
      "api",
      "integration",
      "integrat",
      "database",
      "software",
      "platform",
      "infrastructure",
      "data pipeline",
      "cloud",
      "migration",
      "technical",
      "backend",
      "architecture",
      "sdk",
    ],
    questions: [
      {
        id: "tech_software",
        prompt: "What existing software is involved?",
        hint: "The systems this would touch.",
        placeholder: "e.g. Salesforce, a custom .NET backend, Snowflake...",
      },
      {
        id: "tech_apis",
        prompt: "Are there APIs available?",
        hint: "What can be programmatically accessed.",
        placeholder: "e.g. Salesforce REST API, plus an internal GraphQL gateway...",
      },
      {
        id: "tech_data",
        prompt: "What database or data sources exist?",
        hint: "Where the relevant data lives.",
        placeholder: "e.g. A Snowflake warehouse and a Postgres app DB...",
      },
      {
        id: "tech_integrations",
        prompt: "What existing integrations are in place?",
        hint: "Current connections between systems.",
        placeholder: "e.g. Zapier syncs and a nightly ETL job...",
      },
      {
        id: "tech_security",
        prompt: "Any security considerations?",
        hint: "Auth, data handling, access control.",
        placeholder: "e.g. SSO required; data must stay in our VPC...",
      },
    ],
  },
  {
    category: "Experimental",
    label: "Experimental / R&D",
    suggestedInitiativeCategory: "Experimental",
    keywords: [
      "experiment",
      "research",
      "explore",
      "proof of concept",
      "poc",
      "novel",
      "r&d",
      "hypothesis",
      "uncertain",
      "prototype idea",
      "moonshot",
    ],
    questions: [
      {
        id: "exp_hypothesis",
        prompt: "What is the core hypothesis?",
        hint: "The bet you want to test.",
        placeholder: "e.g. AI can predict churn 30 days out from support tone...",
      },
      {
        id: "exp_unknown",
        prompt: "What is most uncertain or unproven?",
        hint: "The biggest open question.",
        placeholder: "e.g. Whether our data is rich enough to be predictive...",
      },
      {
        id: "exp_learn",
        prompt: "What would you learn from a prototype?",
        hint: "The insight a quick test would give you.",
        placeholder: "e.g. A signal on feasibility and rough accuracy...",
      },
      {
        id: "exp_worth",
        prompt: "What would make this worth pursuing further?",
        hint: "The result that justifies more investment.",
        placeholder: "e.g. Better-than-60% accuracy on historical data...",
      },
    ],
  },
];

const DEFINITION_BY_CATEGORY = new Map<InitiativeCategory, CategoryDefinition>(
  CATEGORY_DEFINITIONS.map((d) => [d.category, d]),
);

const ACKNOWLEDGEMENTS: string[] = [
  "Got it — that's a promising starting point.",
  "Understood. That helps me tailor the next questions.",
  "Thanks — that adds useful detail.",
  "Noted. That sharpens the picture.",
  "Great — that strengthens the case.",
  "Helpful context, thank you.",
  "Perfect — that's exactly what I needed.",
  "Thanks for the detail on that.",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce(
    (sum, kw) => (lower.includes(kw.toLowerCase()) ? sum + 1 : sum),
    0,
  );
}

// Rule-based classifier. Weighs the opening idea most heavily, then the problem
// statement, then everything else. Swapping this for an LLM call is all that a
// future OpenAI integration requires.
function classify(answers: AnswerMap): CategoryDetection {
  const idea = answers.idea ?? "";
  const problem = answers.problem ?? "";
  const rest = Object.entries(answers)
    .filter(([id]) => id !== "idea" && id !== "problem")
    .map(([, v]) => v)
    .join(" ");

  let best: CategoryDefinition | null = null;
  let bestScore = 0;
  let total = 0;

  for (const def of CATEGORY_DEFINITIONS) {
    const score =
      countMatches(idea, def.keywords) * 3 +
      countMatches(problem, def.keywords) * 2 +
      countMatches(rest, def.keywords);
    total += score;
    if (score > bestScore) {
      bestScore = score;
      best = def;
    }
  }

  // No signal yet (e.g. very short first answer) → treat as Experimental.
  const chosen = best ?? DEFINITION_BY_CATEGORY.get("Experimental")!;
  const confidence = total > 0 ? Math.min(1, bestScore / total) : 0;
  return {
    category: chosen.category,
    label: chosen.label,
    confidence,
  };
}

function toSignal(detection: CategoryDetection): CategorySignal {
  const def = DEFINITION_BY_CATEGORY.get(detection.category)!;
  return {
    category: def.category,
    label: def.label,
    suggestedInitiativeCategory: def.suggestedInitiativeCategory,
  };
}

// Builds the ordered question plan for the current answers: opening questions,
// then the detected category's questions (only once the idea is answered), then
// the shared closing questions.
function planQuestions(answers: AnswerMap): InterviewQuestion[] {
  const plan: InterviewQuestion[] = [...OPENING_QUESTIONS];
  const ideaAnswered = (answers.idea ?? "").trim().length > 0;
  if (ideaAnswered) {
    const detection = classify(answers);
    const def = DEFINITION_BY_CATEGORY.get(detection.category);
    if (def) plan.push(...def.questions);
  }
  plan.push(...CLOSING_QUESTIONS);
  return plan;
}

export const interviewEngine: InterviewEngine = {
  getIntro(): string {
    return (
      "Hi! I'm your AI Innovation guide. I'll ask a few short questions, one at a " +
      "time. After your first answer I'll detect what kind of initiative this is " +
      "and adapt my follow-up questions to match. There are no wrong answers — a " +
      "rough idea is enough to start. Let's begin."
    );
  },

  classify,

  planQuestions,

  async acknowledge(index: number): Promise<string> {
    await delay(600 + Math.random() * 500);
    return ACKNOWLEDGEMENTS[index % ACKNOWLEDGEMENTS.length] ?? "Thank you.";
  },

  async generateDraft(
    answers: AnswerMap,
    plan: InterviewQuestion[],
  ): Promise<InterviewDraft> {
    await delay(1400);
    const detection = classify(answers);
    const signal = toSignal(detection);

    // Assemble the category-specific Q&A into a readable "current context" block
    // for the draft's Current Process field and keyword signals.
    const contextText = plan
      .filter((q) => !isCoreQuestion(q.id) && (answers[q.id] ?? "").trim())
      .map((q) => `${q.prompt} ${(answers[q.id] ?? "").trim()}`)
      .join("\n");

    return buildDraft(answers, contextText, signal);
  },
};
