import { pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { initiativesTable } from "./initiatives";

export const interviewDraftsTable = pgTable("interview_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerSub: text("owner_sub").notNull(),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  revision: integer("revision").notNull().default(1),
  status: text("status").notNull().default("active"),
  savedInitiativeId: integer("saved_initiative_id").references(() => initiativesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("interview_drafts_one_active_per_owner").on(table.ownerSub).where(sql`${table.status} = 'active'`),
]);