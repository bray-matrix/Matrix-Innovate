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
import { validationRecordsTable } from "./validations";

// Internal product backlog for the Matrix Innovation Hub itself — features,
// enhancements, bugs, technical debt, architecture, UX/UI, documentation.
// Display id is derived from the serial id as PB-0001, PB-0002, ...
export const backlogItemsTable = pgTable("backlog_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Feature | Enhancement | Bug | Technical Debt | Architecture | UX/UI | Documentation
  type: text("type").notNull().default("Feature"),
  // Critical | High | Medium | Low
  priority: text("priority").notNull().default("Medium"),
  // New | Grooming | Approved | In Progress | Testing | Complete | Deferred
  status: text("status").notNull().default("New"),
  targetVersion: text("target_version").notNull().default(""),
  // Foundation | Intelligence | Portfolio | Knowledge | Collaboration | Integrations
  module: text("module").notNull().default("Foundation"),
  submittedBy: text("submitted_by").notNull().default(""),
  assignedTo: text("assigned_to").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // Optional relationships
  linkedInitiativeId: integer("linked_initiative_id").references(
    () => initiativesTable.id,
    { onDelete: "set null" },
  ),
  linkedValidationId: integer("linked_validation_id").references(
    () => validationRecordsTable.id,
    { onDelete: "set null" },
  ),
  linkedVersion: text("linked_version").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Ideas intentionally parked for later. Display id: PL-0001, PL-0002, ...
export const parkingLotItemsTable = pgTable("parking_lot_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  reasonParked: text("reason_parked").notNull().default(""),
  // Low | Medium | High free-form estimate of business value
  estimatedValue: text("estimated_value").notNull().default(""),
  futureReleaseCandidate: boolean("future_release_candidate")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBacklogItemSchema = createInsertSchema(
  backlogItemsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertParkingLotItemSchema = createInsertSchema(
  parkingLotItemsTable,
).omit({ id: true, createdAt: true });

export type BacklogItem = typeof backlogItemsTable.$inferSelect;
export type InsertBacklogItem = z.infer<typeof insertBacklogItemSchema>;
export type ParkingLotItem = typeof parkingLotItemsTable.$inferSelect;
export type InsertParkingLotItem = z.infer<typeof insertParkingLotItemSchema>;
