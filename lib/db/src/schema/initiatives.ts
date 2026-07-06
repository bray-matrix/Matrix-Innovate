import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const initiativesTable = pgTable("initiatives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  submitterName: text("submitter_name").notNull(),
  businessOwner: text("business_owner"),
  executiveSponsor: text("executive_sponsor"),
  category: text("category").notNull(),
  status: text("status").notNull().default("Idea"),
  problemStatement: text("problem_statement").notNull().default(""),
  currentProcess: text("current_process").notNull().default(""),
  desiredOutcome: text("desired_outcome").notNull().default(""),
  aiConcept: text("ai_concept").notNull().default(""),
  prototypeGoal: text("prototype_goal").notNull().default(""),
  successMetric: text("success_metric").notNull().default(""),
  estimatedHoursSavedMonthly: doublePrecision("estimated_hours_saved_monthly")
    .notNull()
    .default(0),
  estimatedRevenueOpportunity: doublePrecision("estimated_revenue_opportunity")
    .notNull()
    .default(0),
  estimatedCostSavings: doublePrecision("estimated_cost_savings")
    .notNull()
    .default(0),
  customerImpact: text("customer_impact").notNull().default(""),
  complianceRisk: text("compliance_risk").notNull().default(""),
  technicalComplexity: text("technical_complexity").notNull().default(""),
  aiReadiness: text("ai_readiness").notNull().default(""),
  businessValue: integer("business_value").notNull().default(0),
  revenuePotential: integer("revenue_potential").notNull().default(0),
  costSavingsScore: integer("cost_savings_score").notNull().default(0),
  customerImpactScore: integer("customer_impact_score").notNull().default(0),
  strategicAlignment: integer("strategic_alignment").notNull().default(0),
  aiReadinessScore: integer("ai_readiness_score").notNull().default(0),
  prototypeConfidence: integer("prototype_confidence").notNull().default(0),
  technicalComplexityPenalty: integer("technical_complexity_penalty")
    .notNull()
    .default(0),
  riskPenalty: integer("risk_penalty").notNull().default(0),
  score: integer("score").notNull().default(0),
  priority: text("priority").notNull().default("Low"),
  version: text("version").notNull().default("v0.1.0"),
  assignedTeam: text("assigned_team"),
  currentPhase: text("current_phase"),
  prototypeDay: integer("prototype_day"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  nextReviewAt: timestamp("next_review_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Append-only audit trail of every version an initiative has passed through.
export const initiativeVersionsTable = pgTable("initiative_versions", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .notNull()
    .references(() => initiativesTable.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  changedBy: text("changed_by").notNull().default("System"),
  summary: text("summary").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInitiativeSchema = createInsertSchema(initiativesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInitiative = z.infer<typeof insertInitiativeSchema>;
export type Initiative = typeof initiativesTable.$inferSelect;
export type InitiativeVersion = typeof initiativeVersionsTable.$inferSelect;
