import { pgTable, serial, text, boolean, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Keep the Publish-diff index simple: nested expression indexes were truncated
  // by schema introspection. PostgreSQL still owns the exact normalization rule.
  normalizedName: text("normalized_name").generatedAlwaysAs(
    sql`lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))`,
  ),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  check("departments_name_not_blank", sql`length(btrim(${table.name})) > 0`),
  uniqueIndex("departments_normalized_name_unique").on(table.normalizedName),
]);