import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDraft } from "@/services/aiInterviewService";

test("Review exports are explicit buttons, not implicit form submissions", async () => {
  // The existing test runner can server-render React; it has no browser DOM
  // implementation for dispatching click events or completing downloads.
  (globalThis as { React?: typeof React }).React = React;
  const { InitiativeReview } = await import("./initiative-review");
  const draft = buildDraft({
    idea: "Improve intake", problem: "Requests are scattered.", success: "Owners can triage requests.",
  }, "", { category: "Operations", label: "Operations", suggestedInitiativeCategory: "Operations" });
  const html = renderToStaticMarkup(<InitiativeReview
    draft={draft} aiResult={null} jira={null} submitterName="Reviewer"
    departments={["IT"]} categories={["Operations"]} levels={["Low", "Medium", "High"]}
    saving={false} onBack={() => {}} onDraftChange={() => {}} onSave={() => {}}
  />);
  for (const id of ["button-export-word", "button-export-pdf"]) {
    const button = html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0];
    assert.ok(button, `Missing ${id}`);
    assert.match(button, /type="button"/);
    assert.doesNotMatch(button, /\sdisabled(?:\s|=|>)/);
  }
});

test("Both Review save placements are initially enabled", async () => {
  (globalThis as { React?: typeof React }).React = React;
  const { InitiativeReview } = await import("./initiative-review");
  const draft = buildDraft({
    idea: "Improve intake", problem: "Requests are scattered.", success: "Owners can triage requests.",
  }, "", { category: "Operations", label: "Operations", suggestedInitiativeCategory: "Operations" });
  const html = renderToStaticMarkup(<InitiativeReview
    draft={draft} aiResult={null} jira={null} submitterName="Reviewer"
    departments={["IT"]} categories={["Operations"]} levels={["Low", "Medium", "High"]}
    saving={false} onBack={() => {}} onDraftChange={() => {}} onSave={() => {}}
  />);
  for (const id of ["button-save-initiative", "button-save-initiative-bottom"]) {
    const button = html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0];
    assert.ok(button, `Missing ${id}`);
    assert.doesNotMatch(button, /\sdisabled(?:\s|=|>)/);
  }
  // SSR does not dispatch clicks or exercise validation, private saves, or network completion.
});