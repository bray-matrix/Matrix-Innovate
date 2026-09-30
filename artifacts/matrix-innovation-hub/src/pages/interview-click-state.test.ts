import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("both Draft My Initiative buttons reflect the Save Draft in-flight guard", () => {
  // Source assertion: the page depends on session, router and private API state,
  // so SSR cannot exercise this pending-save state. Browser verification remains required.
  const source = readFileSync(new URL("./interview.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(isTyping \|\| finishInFlight\.current \|\| draftSaveInFlight\.current\) return;/);
  for (const id of ["button-early-draft", "button-final-draft"]) {
    const button = source.match(new RegExp(`<Button\\b[^>]*data-testid="${id}"[^>]*>`))?.[0];
    assert.ok(button, `Missing ${id}`);
    assert.match(button, /onClick=\{handleFinish\}/);
    assert.match(button, /disabled=\{isTyping \|\| finishing \|\| savingDraft\}/);
  }
  assert.equal((source.match(/savingDraft \? "Saving draft\.\.\." : "Draft My Initiative"/g) ?? []).length, 2);
});