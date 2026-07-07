import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One validation record per validation run of an application version.
export const validationRecordsTable = pgTable("validation_records", {
  id: serial("id").primaryKey(),
  applicationVersion: text("application_version").notNull(),
  releaseName: text("release_name").notNull().default(""),
  // Derived from checklist items: Not Started | In Progress | Passed | Failed
  status: text("status").notNull().default("Not Started"),
  validationDate: timestamp("validation_date"),
  validatorName: text("validator_name").notNull().default(""),
  summary: text("summary").notNull().default(""),
  overallNotes: text("overall_notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const validationItemsTable = pgTable("validation_items", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id")
    .notNull()
    .references(() => validationRecordsTable.id, { onDelete: "cascade" }),
  featureArea: text("feature_area").notNull(),
  breadcrumb: text("breadcrumb").notNull().default(""),
  whatToValidate: text("what_to_validate").notNull(),
  expectedResult: text("expected_result").notNull(),
  // Pass | Fail | Not Tested
  result: text("result").notNull().default("Not Tested"),
  comments: text("comments").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertValidationRecordSchema = createInsertSchema(
  validationRecordsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertValidationItemSchema = createInsertSchema(
  validationItemsTable,
).omit({ id: true });

export type InsertValidationRecord = z.infer<
  typeof insertValidationRecordSchema
>;
export type InsertValidationItem = z.infer<typeof insertValidationItemSchema>;
export type ValidationRecord = typeof validationRecordsTable.$inferSelect;
export type ValidationItem = typeof validationItemsTable.$inferSelect;
