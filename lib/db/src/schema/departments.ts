import { pgTable, serial, text, boolean, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  check("departments_name_not_blank", sql`length(btrim(${table.name})) > 0`),
  uniqueIndex("departments_normalized_name_unique").on(
    sql`lower(btrim(regexp_replace(${table.name}, '[[:space:]]+', ' ', 'g')))`,
  ),
]);