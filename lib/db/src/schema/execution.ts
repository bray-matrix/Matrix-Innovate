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
  // On Track | At Risk | Off Track | Unknown
  health: text("health").notNull().default("Unknown"),
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
