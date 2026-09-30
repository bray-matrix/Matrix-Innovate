import { db, departmentsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export const INITIAL_DEPARTMENTS = [
  "Operations", "Finance", "Customer Service", "Information Technology",
  "Compliance", "Human Resources", "Sales", "Project Management Office",
];

export function normalizeDepartmentName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

type DepartmentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The first administrative write initializes the master as part of THAT write.
// Never writes during application startup or an ordinary read.
export async function ensureDepartments(tx: DepartmentTransaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(66117011)`);
  const [first] = await tx.select({ id: departmentsTable.id }).from(departmentsTable).limit(1);
  if (first) return;
  await tx.insert(departmentsTable).values(INITIAL_DEPARTMENTS.map(name => ({ name }))).onConflictDoNothing();
  // Existing free-text values were never limited to the original settings list.
  const rows = await tx.execute(sql`
    select department from initiatives
    union select department from resources
    union select department from project_resource_assignments
  `);
  for (const row of rows.rows) {
    if (typeof row.department !== "string") continue;
    const name = normalizeDepartmentName(row.department);
    if (name && name.length <= 120) {
      await tx.insert(departmentsTable).values({ name }).onConflictDoNothing();
    }
  }
}

export async function validDepartmentSelection(value: string, current?: string | null): Promise<boolean> {
  if (current !== undefined && value === current) return true;
  const rows = await db.select({ name: departmentsTable.name, active: departmentsTable.active }).from(departmentsTable);
  if (!rows.length) return INITIAL_DEPARTMENTS.includes(value);
  return rows.some(row => row.active && row.name === value);
}