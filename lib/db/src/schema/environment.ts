import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// Snapshot of an initiative archived by the System Initialization Wizard.
// The full row (plus its versions and calculation events) is preserved as
// JSON so archiving never blocks and the live tables stay clean.
export const archivedInitiativesTable = pgTable("archived_initiatives", {
  id: serial("id").primaryKey(),
  originalId: integer("original_id").notNull(),
  title: text("title").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  archivedBy: text("archived_by").notNull().default(""),
  archivedAt: timestamp("archived_at").notNull().defaultNow(),
});

// One action performed during an environment initialization run.
export interface EnvironmentActionResult {
  action: string; // machine key, e.g. "archiveSampleInitiatives"
  label: string; // display label, e.g. "Archive sample initiatives"
  records: number; // number of records affected
  detail: string; // short outcome summary
}

// Environment History log: one row per "Initialize Environment" run.
export const environmentEventsTable = pgTable("environment_events", {
  id: serial("id").primaryKey(),
  performedBy: text("performed_by").notNull().default(""),
  environment: text("environment").notNull().default("Development"),
  actions: jsonb("actions")
    .$type<EnvironmentActionResult[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Simple key/value flags that must survive independently of any log table,
// e.g. firstTimeSetupComplete.
export const systemFlagsTable = pgTable("system_flags", {
  key: text("key").primaryKey(),
  value: boolean("value").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ArchivedInitiative = typeof archivedInitiativesTable.$inferSelect;
export type EnvironmentEvent = typeof environmentEventsTable.$inferSelect;
export type SystemFlag = typeof systemFlagsTable.$inferSelect;
