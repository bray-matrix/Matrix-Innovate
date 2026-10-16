import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectDetailsPatch,
  projectToDetailsForm,
  validateProjectDetails,
  buildHealthIndex,
  apiErrorMessage,
  hasChanges,
} from "./project-details.ts";

const original = {
  id: 7,
  initiativeId: 12,
  name: "Scanner rollout",
  description: "Roll out scanners",
  primaryOwner: "Dana Whitfield",
  supportingOwners: "Ray Ortiz",
  projectType: "Client Implementation",
  clientId: 3,
  organizationId: 99, // unknown/inactive reference must be preserved
  programId: null,
  targetDate: "2026-11-30T00:00:00.000Z",
};

test("unchanged form produces an empty patch (no date reserialization)", () => {
  const patch = buildProjectDetailsPatch(original, projectToDetailsForm(original));
  assert.deepEqual(patch, {});
  assert.equal(hasChanges(patch), false);
});

test("only changed fields are sent and initiativeId is never included", () => {
  const form = { ...projectToDetailsForm(original), name: "  Scanner rollout phase 2 ", primaryOwner: "Lee Han" };
  const patch = buildProjectDetailsPatch(original, form);
  assert.deepEqual(patch, { name: "Scanner rollout phase 2", primaryOwner: "Lee Han" });
  assert.ok(!("initiativeId" in patch));
});

test("clearing relationships and date sends null", () => {
  const form = { ...projectToDetailsForm(original), clientId: null, organizationId: null, targetDate: "" };
  assert.deepEqual(buildProjectDetailsPatch(original, form), { clientId: null, organizationId: null, targetDate: null });
});

test("unknown reference stays untouched unless changed", () => {
  const form = { ...projectToDetailsForm(original), programId: 4 };
  const patch = buildProjectDetailsPatch(original, form);
  assert.deepEqual(patch, { programId: 4 });
  assert.equal(projectToDetailsForm(original).organizationId, 99);
});

test("changed date is sent as YYYY-MM-DD", () => {
  const form = { ...projectToDetailsForm(original), targetDate: "2027-01-15" };
  assert.deepEqual(buildProjectDetailsPatch(original, form), { targetDate: "2027-01-15" });
});

test("required validation for name, owner, work type", () => {
  const e = validateProjectDetails({ name: " ", primaryOwner: "", projectType: "" });
  assert.ok(e.name && e.primaryOwner && e.projectType);
  assert.deepEqual(validateProjectDetails({ name: "A", primaryOwner: "B", projectType: "Other" }), {});
});

test("health index joins by id and never falls back", () => {
  const lookup = buildHealthIndex([{ id: 7, effectiveHealth: "At Risk", calculatedHealth: "On Track", healthOverridden: true }], false);
  assert.deepEqual(lookup(7), { status: "ok", effective: "At Risk", calculated: "On Track", overridden: true });
  assert.deepEqual(lookup(8), { status: "unavailable" });
  assert.deepEqual(buildHealthIndex(undefined, true)(7), { status: "loading" });
  assert.deepEqual(buildHealthIndex(undefined, false)(7), { status: "unavailable" });
});

test("api error message extraction", () => {
  assert.equal(apiErrorMessage({ data: { error: "Name too long" }, message: "x" }), "Name too long");
  assert.equal(apiErrorMessage(new Error("boom")), "boom");
  assert.equal(apiErrorMessage(null, "fallback"), "fallback");
});
