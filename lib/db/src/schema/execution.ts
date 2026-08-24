import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { initiativesTable } from "./initiatives";

// Compass execution domain (Phase 1 consolidation). All tables are additive —
// no existing Innovation Hub table is renamed or altered. Status-like fields
// follow the repo's text-convention style (validated at the API layer) so new
// project types / stages can be added without schema changes.

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Active | Inactive
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "set null" },
  ),
  name: text("name").notNull(),
  // Active | Inactive
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const programsTable = pgTable("programs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, {
    onDelete: "set null",
  }),
  organizationId: integer("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "set null" },
  ),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Active | On Hold | Completed | Cancelled
  status: text("status").notNull().default("Active"),
  owner: text("owner").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Projects support both client work and internal Matrix work: organization,
// client, and program are all optional by design.
export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  // Originating innovation initiative (promotion); the initiative row is
  // always preserved — this is a link, not a conversion.
  initiativeId: integer("initiative_id").references(() => initiativesTable.id, {
    onDelete: "set null",
  }),
  organizationId: integer("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "set null" },
  ),
  clientId: integer("client_id").references(() => clientsTable.id, {
    onDelete: "set null",
  }),
  programId: integer("program_id").references(() => programsTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Client Implementation | Internal Technology | Internal Operations |
  // Executive Initiative | Innovation | Other (extensible text convention)
  projectType: text("project_type").notNull().default("Other"),
  // Planning | Ready | In Progress | On Hold | Completed | Cancelled
  lifecycleStage: text("lifecycle_stage").notNull().default("Planning"),
  // Active | On Hold | Closed — kept separate from health
  state: text("state").notNull().default("Active"),
  // On Track | At Risk | Off Track | Unknown — manually stored value.
  // Treated as a manual override when health_override_at is set; effective
  // health is otherwise calculated deterministically server-side (Phase 2).
  health: text("health").notNull().default("Unknown"),
  healthOverrideReason: text("health_override_reason"),
  healthOverrideBy: text("health_override_by"),
  healthOverrideAt: timestamp("health_override_at"),
  // Low | Medium | High | Critical
  priority: text("priority").notNull().default("Medium"),
  primaryOwner: text("primary_owner").notNull().default(""),
  supportingOwners: text("supporting_owners").notNull().default(""),
  targetDate: timestamp("target_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectMilestonesTable = pgTable("project_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull().default(""),
  dueDate: timestamp("due_date"),
  // Not Started | In Progress | Completed | Missed
  status: text("status").notNull().default("Not Started"),
  stageGate: boolean("stage_gate").notNull().default(false),
  sequence: integer("sequence").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(
  organizationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProgramSchema = createInsertSchema(programsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectMilestoneSchema = createInsertSchema(
  projectMilestonesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type Organization = typeof organizationsTable.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Client = typeof clientsTable.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Program = typeof programsTable.$inferSelect;
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Project = typeof projectsTable.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectMilestone = typeof projectMilestonesTable.$inferSelect;
export type InsertProjectMilestone = z.infer<
  typeof insertProjectMilestoneSchema
>;

// --- Phase 2: governance (risks, approvals, go-live readiness) -------------

export const projectRisksTable = pgTable("project_risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Critical | High | Medium | Low
  severity: text("severity").notNull().default("Medium"),
  // High | Medium | Low
  probability: text("probability").notNull().default("Medium"),
  // High | Medium | Low
  impact: text("impact").notNull().default("Medium"),
  // Open | Mitigating | Mitigated | Closed
  status: text("status").notNull().default("Open"),
  owner: text("owner").notNull().default(""),
  mitigationPlan: text("mitigation_plan").notNull().default(""),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectApprovalsTable = pgTable("project_approvals", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  // Go-Live Sign-Off | Scope Change | Stage Gate | Hold | Resource Request | Other
  type: text("type").notNull().default("Other"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Pending | Approved | Rejected | Cancelled
  status: text("status").notNull().default("Pending"),
  requestedBy: text("requested_by").notNull().default(""),
  approver: text("approver").notNull().default(""),
  decisionNotes: text("decision_notes"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const readinessAssessmentsTable = pgTable("readiness_assessments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetDate: timestamp("target_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const readinessItemsTable = pgTable("readiness_items", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id")
    .notNull()
    .references(() => readinessAssessmentsTable.id, { onDelete: "cascade" }),
  // Extensible text convention; standard categories seeded from constants.
  category: text("category").notNull(),
  requirement: text("requirement").notNull(),
  owner: text("owner").notNull().default(""),
  // Not Tested | Pass | Fail | Not Applicable
  status: text("status").notNull().default("Not Tested"),
  notes: text("notes").notNull().default(""),
  required: boolean("required").notNull().default(true),
  sequence: integer("sequence").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectRiskSchema = createInsertSchema(
  projectRisksTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectApprovalSchema = createInsertSchema(
  projectApprovalsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReadinessAssessmentSchema = createInsertSchema(
  readinessAssessmentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReadinessItemSchema = createInsertSchema(
  readinessItemsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type ProjectRisk = typeof projectRisksTable.$inferSelect;
export type InsertProjectRisk = z.infer<typeof insertProjectRiskSchema>;
export type ProjectApproval = typeof projectApprovalsTable.$inferSelect;
export type InsertProjectApproval = z.infer<typeof insertProjectApprovalSchema>;
export type ReadinessAssessment =
  typeof readinessAssessmentsTable.$inferSelect;
export type InsertReadinessAssessment = z.infer<
  typeof insertReadinessAssessmentSchema
>;
export type ReadinessItem = typeof readinessItemsTable.$inferSelect;
export type InsertReadinessItem = z.infer<typeof insertReadinessItemSchema>;
