import test from "node:test";
import assert from "node:assert/strict";
import { resolveActiveNav, defaultExpanded, countVisibleLinks, headerTitle, NAV_SECTIONS } from "./nav-model.ts";
import { hasCreatedMarker, stripCreatedMarker, initialNextStepsMode } from "./next-steps-state.ts";

test("default navigation shows only the six section links", () => {
  assert.equal(countVisibleLinks({}), 6);
  const total = NAV_SECTIONS.reduce((n, s) => n + 1 + s.children.length, 0);
  assert.ok(total > 15);
});

test("primary destinations resolve to their section without expanding it", () => {
  for (const [path, id] of [["/", "home"], ["/initiatives", "ideas"], ["/projects", "projects"], ["/portfolio", "portfolio"], ["/documents", "help"]] as const) {
    const a = resolveActiveNav(path, "");
    assert.equal(a.sectionId, id, path);
    assert.equal(a.isChild, false, path);
    assert.deepEqual(defaultExpanded(a), {});
  }
});

test("child destinations expand their section and mark the child active", () => {
  const a = resolveActiveNav("/projects/new", "");
  assert.deepEqual(a, { sectionId: "projects", href: "/projects/new", isChild: true });
  assert.deepEqual(defaultExpanded(a), { projects: true });
  assert.equal(resolveActiveNav("/kanban", "").sectionId, "ideas");
  assert.equal(resolveActiveNav("/reports", "").href, "/reports");
});

test("project detail deep link highlights Projects, not Create project", () => {
  const a = resolveActiveNav("/projects/42", "");
  assert.deepEqual(a, { sectionId: "projects", href: "/projects", isChild: false });
  assert.equal(headerTitle("/projects/42", ""), "Project");
});

test("backlog tab param selects the right admin child", () => {
  assert.equal(resolveActiveNav("/backlog", "").href, "/backlog");
  assert.equal(resolveActiveNav("/backlog", "?tab=deferred").href, "/backlog?tab=deferred");
  assert.equal(resolveActiveNav("/admin", "").href, "/admin");
  assert.equal(resolveActiveNav("/admin", "").isChild, true);
});

test("unknown route has no active section", () => {
  assert.deepEqual(resolveActiveNav("/nope", ""), { sectionId: null, href: null, isChild: false });
});

test("created marker is detected and stripped while preserving other params", () => {
  assert.equal(hasCreatedMarker("?created=1"), true);
  assert.equal(hasCreatedMarker("?created=0"), false);
  assert.equal(stripCreatedMarker("?created=1"), "");
  assert.equal(stripCreatedMarker("?tab=risks&created=1&x=2"), "?tab=risks&x=2");
  assert.equal(stripCreatedMarker(""), "");
});

test("next steps expand only on the first post-creation visit", () => {
  assert.equal(initialNextStepsMode(true, false), "expanded");
  assert.equal(initialNextStepsMode(true, true), "compact");
  assert.equal(initialNextStepsMode(false, false), "compact");
});
