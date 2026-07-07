import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { initiativesTable } from "./initiatives";

// One scoring-component change captured during a recalculation event.
export interface CalculationComponentChange {
  component: string; // machine key, e.g. "revenuePotential"
  label: string; // display label, e.g. "Revenue Opportunity"
  previous: number;
  next: number;
  reason: string; // why the new value is what it is
}

// Audit trail: one row per Recalculate action on an initiative, including
// no-change runs so the full history of recalculation attempts is preserved.
export const calculationEventsTable = pgTable("calculation_events", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .notNull()
    .references(() => initiativesTable.id, { onDelete: "cascade" }),
  changedBy: text("changed_by").notNull().default("System"),
  previousScore: integer("previous_score").notNull(),
  newScore: integer("new_score").notNull(),
  previousPriority: text("previous_priority").notNull().default(""),
  newPriority: text("new_priority").notNull().default(""),
  changes: jsonb("changes")
    .$type<CalculationComponentChange[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CalculationEvent = typeof calculationEventsTable.$inferSelect;
export type InsertCalculationEvent =
  typeof calculationEventsTable.$inferInsert;
