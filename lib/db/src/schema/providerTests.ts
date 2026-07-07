import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// Result of testing one AI provider capability (e.g. classifyInitiative).
export interface ProviderTestCapabilityResult {
  capability: string; // method name, e.g. "classifyInitiative"
  passed: boolean;
  message: string; // short outcome summary or failure detail
}

// Audit trail: one row per "Test Provider" run from Admin, including failed
// runs against placeholder providers so readiness history is preserved.
export const providerTestEventsTable = pgTable("provider_test_events", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  providerLabel: text("provider_label").notNull(),
  passed: boolean("passed").notNull(),
  capabilities: jsonb("capabilities")
    .$type<ProviderTestCapabilityResult[]>()
    .notNull()
    .default([]),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProviderTestEvent = typeof providerTestEventsTable.$inferSelect;
export type InsertProviderTestEvent =
  typeof providerTestEventsTable.$inferInsert;
