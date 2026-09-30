import { Router, type IRouter } from "express";
import { db, providerTestEventsTable, departmentsTable, initiativesTable, resourcesTable, projectResourceAssignmentsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../matrix/auth";
import { INITIAL_DEPARTMENTS, ensureDepartments, normalizeDepartmentName } from "../lib/departments";
import { CreateDepartmentBody, UpdateDepartmentBody } from "@workspace/api-zod";
import {
  AI_CAPABILITY_NAMES,
  getActiveAIProviderId,
  getAIProvider,
  listAIProviders,
  runProviderTest,
} from "../lib/ai";

const router: IRouter = Router();

export const APPLICATION_VERSION = "v1.6.11";

const SETTINGS = {
  categories: [
    "Revenue Growth",
    "Operational Efficiency",
    "Customer Experience",
    "Internal Productivity",
    "Compliance and Security",
    "Experimental",
  ],
  statuses: [
    "Idea",
    "Review",
    "Approved",
    "Prototype",
    "Pilot",
    "Production",
    "Closed",
    "Declined",
  ],
  scoringWeights: [
    { name: "Business Value", weight: 25 },
    { name: "Revenue Potential", weight: 15 },
    { name: "Cost Savings", weight: 15 },
    { name: "Customer Impact", weight: 15 },
    { name: "Strategic Alignment", weight: 10 },
    { name: "AI Readiness", weight: 10 },
    { name: "Prototype Confidence", weight: 10 },
    { name: "Technical Complexity Penalty", weight: -10 },
    { name: "Risk Penalty", weight: -10 },
  ],
  applicationVersion: APPLICATION_VERSION,
};

function serializeTestEvent(
  row: typeof providerTestEventsTable.$inferSelect,
) {
  return {
    id: row.id,
    providerId: row.providerId,
    providerName: row.providerLabel,
    passed: row.passed,
    status: row.passed ? "Passed" : "Failed",
    capabilities: row.capabilities,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

// Operator-facing description of what switching to each provider would mean
// today. Switching itself is intentionally not exposed — the active provider
// is selected via the AI_PROVIDER environment variable only.
function describeSwitchImpact(status: string, isActive: boolean): string {
  if (isActive) {
    return "Currently active. All AI-generated intelligence is produced by this provider.";
  }
  if (status === "Active") {
    return (
      "Switching would route all AI-generated intelligence through this provider. " +
      "It is implemented and would pass the readiness test."
    );
  }
  return (
    "Switching now would break all AI-generated intelligence: this provider is a registered " +
    'placeholder and every capability call would fail with "Provider is registered but not configured." ' +
    "It must be implemented and configured before it can be activated."
  );
}

router.get("/settings", async (_req, res) => {
  const active = getAIProvider();
  const activeId = getActiveAIProviderId();
  const testEvents = await db
    .select()
    .from(providerTestEventsTable)
    .orderBy(desc(providerTestEventsTable.createdAt));
  const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  const latestTest = testEvents[0];
  const latestByProvider = new Map<
    string,
    (typeof testEvents)[number]
  >();
  for (const event of testEvents) {
    if (!latestByProvider.has(event.providerId)) {
      latestByProvider.set(event.providerId, event);
    }
  }
  res.json({
    ...SETTINGS,
    departments: departments.length ? departments.filter(d => d.active).map(d => d.name) : INITIAL_DEPARTMENTS,
    departmentMaster: departments.map(d => ({ id: d.id, name: d.name, active: d.active })),
    aiProvider: {
      activeProvider: active.sourceLabel,
      activeProviderId: activeId,
      providerStatus: active.status,
      availableProviders: listAIProviders().map((p) => {
        const isActive = p.id === activeId;
        const lastTest = latestByProvider.get(p.id);
        return {
          id: p.id,
          label: p.sourceLabel,
          status: p.status,
          notes: p.notes,
          isActive,
          capabilities: [...AI_CAPABILITY_NAMES],
          lastTestPassed: lastTest ? lastTest.passed : null,
          lastTestAt: lastTest ? lastTest.createdAt.toISOString() : null,
          switchImpact: describeSwitchImpact(p.status, isActive),
        };
      }),
      lastProviderTest: latestTest
        ? latestTest.createdAt.toISOString()
        : null,
      providerNotes:
        "The active provider is selected via the AI_PROVIDER environment variable. " +
        "Only the rule-based engine is active; vendor providers are registered placeholders and require no API keys yet.",
    },
  });
});

function canManageDepartments(req: AuthenticatedRequest): boolean {
  return req.matrixIdentity?.roles.some(role => ["admin", "superadmin", "super_admin", "super admin"].includes(role.toLowerCase())) ?? false;
}

function isDuplicateName(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isDuplicateName(error.cause);
}

// Explicit admin action; never writes production data as a side effect of startup or GET.
router.post("/settings/departments/initialize", async (req, res) => {
  if (!canManageDepartments(req as AuthenticatedRequest)) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  await db.transaction(async tx => ensureDepartments(tx));
  const rows = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  res.json(rows.map(d => ({ id: d.id, name: d.name, active: d.active })));
});

router.post("/settings/departments", async (req, res) => {
  if (!canManageDepartments(req as AuthenticatedRequest)) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid department name" }); return; }
  const name = normalizeDepartmentName(parsed.data.name);
  if (!name || name.length > 120) { res.status(400).json({ error: "Name must contain 1–120 characters" }); return; }
  const rows = await db.transaction(async tx => {
    await ensureDepartments(tx);
    return tx.insert(departmentsTable).values({ name }).onConflictDoNothing().returning();
  });
  if (!rows.length) { res.status(409).json({ error: "Department name already exists" }); return; }
  res.status(201).json({ id: rows[0].id, name: rows[0].name, active: rows[0].active });
});

router.patch("/settings/departments/:id", async (req, res) => {
  if (!canManageDepartments(req as AuthenticatedRequest)) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  const id = Number(req.params.id);
  const parsed = UpdateDepartmentBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success || (parsed.data.name === undefined && parsed.data.active === undefined)) {
    res.status(400).json({ error: "Invalid department update" }); return;
  }
  const name = parsed.data.name === undefined ? undefined : normalizeDepartmentName(parsed.data.name);
  if (name !== undefined && (!name || name.length > 120)) {
    res.status(400).json({ error: "Name must contain 1–120 characters" }); return;
  }
  try {
    const result = await db.transaction(async tx => {
      await ensureDepartments(tx);
      const [old] = await tx.select().from(departmentsTable).where(eq(departmentsTable.id, id)).for("update");
      if (!old) return null;
      const [updated] = await tx.update(departmentsTable)
        .set({ ...(name !== undefined ? { name } : {}), ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}), updatedAt: new Date() })
        .where(eq(departmentsTable.id, id)).returning();
      if (name !== undefined && name !== old.name) {
        // Historical free-text references can differ from the canonical master
        // in casing or repeated whitespace. Match with the SAME normalized
        // comparison used by departments_normalized_name_unique.
        await tx.update(initiativesTable).set({ department: name }).where(sql`lower(btrim(regexp_replace(${initiativesTable.department}, '[[:space:]]+', ' ', 'g'))) = lower(btrim(regexp_replace(${old.name}, '[[:space:]]+', ' ', 'g')))`);
        await tx.update(resourcesTable).set({ department: name }).where(sql`lower(btrim(regexp_replace(${resourcesTable.department}, '[[:space:]]+', ' ', 'g'))) = lower(btrim(regexp_replace(${old.name}, '[[:space:]]+', ' ', 'g')))`);
        await tx.update(projectResourceAssignmentsTable).set({ department: name }).where(sql`lower(btrim(regexp_replace(${projectResourceAssignmentsTable.department}, '[[:space:]]+', ' ', 'g'))) = lower(btrim(regexp_replace(${old.name}, '[[:space:]]+', ' ', 'g')))`);
        // Brief metadata contains a second live copy of the initiative department.
        await tx.execute(sql`update initiatives set reviewed_brief = jsonb_set(reviewed_brief, '{metadata,department}', to_jsonb(${name}::text))
          where lower(btrim(regexp_replace(reviewed_brief -> 'metadata' ->> 'department', '[[:space:]]+', ' ', 'g')))
            = lower(btrim(regexp_replace(${old.name}, '[[:space:]]+', ' ', 'g')))`);
      }
      return { id: updated.id, name: updated.name, active: updated.active };
    });
    if (!result) { res.status(404).json({ error: "Department not found" }); return; }
    res.json(result);
  } catch (error) {
    if (isDuplicateName(error)) {
      res.status(409).json({ error: "Department name already exists" }); return;
    }
    throw error;
  }
});

// Runs the readiness test against the ACTIVE provider using synthetic sample
// data only, then stores the run in the provider test history.
router.post("/settings/ai-provider/test", async (_req, res) => {
  const provider = getAIProvider();
  const result = await runProviderTest(provider);
  const [row] = await db
    .insert(providerTestEventsTable)
    .values({
      providerId: result.providerId,
      providerLabel: result.providerLabel,
      passed: result.passed,
      capabilities: result.capabilities,
      errorMessage: result.errorMessage,
    })
    .returning();
  res.json(serializeTestEvent(row));
});

router.get("/settings/ai-provider/tests", async (_req, res) => {
  const rows = await db
    .select()
    .from(providerTestEventsTable)
    .orderBy(desc(providerTestEventsTable.createdAt));
  res.json(rows.map(serializeTestEvent));
});

export default router;
