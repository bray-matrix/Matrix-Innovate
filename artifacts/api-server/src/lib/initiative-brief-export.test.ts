import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync, inflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { buildInitiativeBrief, parseInitiativeBrief, type BriefDraft } from "@workspace/initiative-brief";
import { briefSections, renderInitiativeBriefDocx, renderInitiativeBriefPdf } from "./initiative-brief-export";

const draft: BriefDraft = {
  fields: {
    title: "Centralized Application Inventory and Ownership System", category: "Technology",
    department: "Operations", submitterName: "Example Owner", businessOwner: "",
    executiveSponsor: "", problemStatement: "Applications have no verified owners.",
    currentProcess: "Teams track their applications in separate spreadsheets.",
    desiredOutcome: "A central inventory with validated business purpose and ownership.",
    aiConcept: "Consolidate applications in a reviewable inventory.",
    prototypeGoal: "Validate a pilot inventory with two business units.",
    successMetric: "Not yet known", estimatedHoursSavedMonthly: 0,
    estimatedRevenueOpportunity: 0, estimatedCostSavings: 0,
    customerImpact: "Medium", complianceRisk: "Medium", technicalComplexity: "Medium", aiReadiness: "Low",
  },
  canvas: { expectedValue: "Clear accountability and reduced duplication.", risks: "Ownership validation requires stakeholder review.",
    recommendedNextStep: "Confirm an inventory owner and test a pilot." },
  executiveSummary: "Create a reliable application inventory so business stakeholders can identify owners and purpose.",
  score: 45, priority: "Low",
  scoring: {
    businessValue: 25, revenuePotential: 0, costSavingsScore: 0,
    customerImpactScore: 6, strategicAlignment: 8, aiReadinessScore: 10,
    prototypeConfidence: 7, technicalComplexityPenalty: -6, riskPenalty: -5,
  },
};
const aiResult = {
  knownFacts: [{ category: "Context", value: "Applications are tracked in multiple repositories", source: "user" as const }],
  unknowns: ["Who owns the application inventory?", "Who owns the application inventory?",
    "What is the integration architecture?", "How will technical deployment be phased?"],
};
const brief = buildInitiativeBrief({
  draft, aiResult, jira: { jiraIssueKey: "APP-123" }, generatedAt: "2026-09-30T12:00:00.000Z",
  review: { candidateSuccessMeasures: ["Percentage of applications with a validated owner"] },
});

test("normalizes unknowns and provenance without inventing financial value", () => {
  assert.equal(brief.expectedValue.qualitative.text, "Clear accountability and reduced duplication.");
  assert.equal(brief.expectedValue.quantified[0].status, "unknown");
  assert.equal(brief.expectedValue.quantified[1].text, "Not yet established");
  assert.equal(brief.successMeasures.candidates[0].source, "suggestion");
  assert.equal(brief.successMeasures.drafted.source, "ai-draft");
  assert.equal(brief.successMeasures.drafted.text, "Not yet established");
  assert.equal(brief.supportingContext.facts[0].source, "user");
  assert.equal(brief.unknowns.filter(v => v.priority === "critical").length, 1);
  assert.equal(brief.unknowns.filter(v => v.priority === "discovery").length, 2);
  assert.equal(brief.assessment.score, 45);
  assert.deepEqual(brief.assessment.factors.slice(0, 5), [
    { label: "Business value", value: "25/25" },
    { label: "Strategic alignment", value: "8/10" },
    { label: "Readiness score", value: "10/10" },
    { label: "Delivery confidence", value: "7/10" },
    { label: "Risk / complexity", value: "-11 (complexity -6, risk -5)" },
  ]);
  assert.equal(brief.businessNeed.businessImpact, undefined);
  assert.equal(brief.futureState.approach.text, draft.fields.aiConcept);
  assert.equal(brief.futureState.prototype?.text, draft.fields.prototypeGoal);
  assert.equal(parseInitiativeBrief(brief), brief);
  const explicitZero = buildInitiativeBrief({ draft, review: { confirmedZeroFields: ["estimatedCostSavings"] } });
  assert.equal(explicitZero.expectedValue.quantified[2].text, "0 USD");
  assert.throws(() => parseInitiativeBrief({ ...brief, unknowns: Array(13).fill(brief.unknowns[0]) }));
  assert.throws(() => parseInitiativeBrief({ ...brief, executiveSummary: { text: "x".repeat(12001), source: "ai-draft" } }));
  assert.throws(() => parseInitiativeBrief({ ...brief, businessNeed: {} }));
  assert.throws(() => parseInitiativeBrief({ ...brief, futureState: { outcome: brief.futureState.outcome } }));
  const edited = buildInitiativeBrief({
    draft: { ...draft, fields: { ...draft.fields, successMetric: "" },
      canvas: { ...draft.canvas, expectedValue: "", risks: "" } },
    aiResult: { draft: { expectedValue: "Stale AI value", risks: "Stale AI risk",
      successMetric: "Stale AI measure" } },
  });
  assert.equal(edited.expectedValue.qualitative.text, "Not yet established");
  assert.equal(edited.risks.text, "Not yet established");
  assert.equal(edited.successMeasures.drafted.text, "Not yet established");
  assert.ok(!JSON.stringify(edited).includes("Stale AI"));
  const withImpact = buildInitiativeBrief({
    draft, aiResult: { knownFacts: [
      { category: "Business Impact", value: "Duplicate renewals create avoidable spend.", source: "user" },
    ] },
  });
  assert.equal(withImpact.businessNeed.businessImpact?.source, "user");
  assert.equal(withImpact.supportingContext.facts.length, 0);
});

test("generates editable OOXML Word and text-selectable PDF with matching brief sections", async () => {
  const docx = await renderInitiativeBriefDocx(brief);
  const pdf = await renderInitiativeBriefPdf(brief);
  if (process.env["WRITE_BRIEF_SAMPLES"] === "1") {
    await mkdir("attached_assets/generated", { recursive: true });
    await writeFile("attached_assets/generated/application-inventory-brief.docx", docx);
    await writeFile("attached_assets/generated/application-inventory-brief.pdf", pdf);
  }
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(docx.length > 5000 && pdf.length > 3000);
  // OOXML zip central directory contains the editable Word document and approved brand image.
  assert.match(docx.toString("latin1"), /word\/document.xml/);
  assert.ok(/word\/media\/.*\.png/.test(docx.toString("latin1")),
    JSON.stringify(docx.toString("latin1").match(/.{0,25}(?:png|media).{0,35}/gi)?.slice(0, 5)));
  // Read the OOXML part from the ZIP local header and verify actual editable runs.
  const zip = docx.toString("latin1");
  const part = zip.indexOf("word/document.xml");
  assert.ok(part > 0);
  const header = part - 30; // local file header is 30 bytes before its filename
  assert.equal(docx.readUInt32LE(header), 0x04034b50);
  const compressedSize = docx.readUInt32LE(header + 18);
  const fileNameLength = docx.readUInt16LE(header + 26);
  const extraLength = docx.readUInt16LE(header + 28);
  const offset = header + 30 + fileNameLength + extraLength;
  const xml = inflateRawSync(docx.subarray(offset, offset + compressedSize)).toString("utf8");
  const headerPart = zip.indexOf("word/header1.xml");
  const headerOffset = headerPart - 30;
  assert.equal(docx.readUInt32LE(headerOffset), 0x04034b50);
  const headerStart = headerOffset + 30 + docx.readUInt16LE(headerOffset + 26) + docx.readUInt16LE(headerOffset + 28);
  const headerXml = inflateRawSync(docx.subarray(headerStart, headerStart + docx.readUInt32LE(headerOffset + 18))).toString("utf8");
  assert.match(headerXml, /<w:shd[^>]*w:fill="07316B"/);
  assert.match(headerXml, /<a:blip/);
  assert.match(xml, /Centralized Application Inventory and Ownership System/);
  assert.match(xml, /Percentage of applications with a validated owner/);
  assert.match(xml, /Validate a pilot inventory with two business units/);
  assert.match(xml, /Drafted measure \(review before accepting\)/);
  assert.match(xml, /Not yet established/);
  const decodedStreams: string[] = [];
  for (const match of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    // PDF stream /Length is authoritative; do not strip CRLF blindly because
    // a compressed stream's final byte can itself be 0x0D.
    const content = Buffer.from(match[1], "latin1");
    try { decodedStreams.push(inflateSync(content).toString("latin1")); } catch {
      if (content.toString("latin1").includes(" TJ")) decodedStreams.push(content.toString("latin1"));
    }
  }
  const pdfContent = decodedStreams.join("\n");
  const extractedText = [...pdfContent.matchAll(/<([0-9a-f]+)>/gi)]
    .map(match => Buffer.from(match[1], "hex").toString("latin1")).join("");
  // Standard-14 PDF text is encoded as glyphs in content streams, not a rasterized screenshot.
  assert.match(extractedText, /Centralized Application Inventory/);
  assert.match(extractedText, /Executive Summary/);
  assert.match(extractedText, /Validate a pilot inventory with two business units/);
  assert.match(extractedText, /Drafted measure \(review before accepting\)/);
  assert.match(extractedText, /Not yet established/);
  let previousPdfSection = -1;
  let previousWordSection = -1;
  for (const section of briefSections(brief)) {
    const pdfIndex = extractedText.indexOf(section.title);
    const wordIndex = xml.indexOf(section.title.replace(/&/g, "&amp;"));
    assert.ok(pdfIndex > previousPdfSection, `PDF section missing or out of order: ${section.title}`);
    assert.ok(wordIndex > previousWordSection, `Word section missing or out of order: ${section.title}`);
    previousPdfSection = pdfIndex;
    previousWordSection = wordIndex;
  }
  assert.equal(extractedText.split(brief.expectedValue.qualitative.text).length - 1, 1);
  assert.equal(xml.split(brief.expectedValue.qualitative.text).length - 1, 1);
});

test("long narrative remains editable and can span Word/PDF pages", async () => {
  const longText = Array.from({ length: 240 }, (_, i) => `Inventory item ${i + 1} needs ownership validation.`).join(" ");
  const expanded = { ...brief, executiveSummary: { ...brief.executiveSummary, text: longText } };
  const pdf = await renderInitiativeBriefPdf(expanded);
  const docx = await renderInitiativeBriefDocx(expanded);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  const zip = docx.toString("latin1");
  const part = zip.indexOf("word/document.xml");
  const header = part - 30;
  assert.equal(docx.readUInt32LE(header), 0x04034b50);
  const offset = header + 30 + docx.readUInt16LE(header + 26) + docx.readUInt16LE(header + 28);
  const xml = inflateRawSync(docx.subarray(offset, offset + docx.readUInt32LE(header + 18))).toString("utf8");
  assert.match(xml, /Inventory item 240 needs ownership validation/);
  assert.doesNotMatch(xml, /<w:keepLines\/>/);
  const decoded = [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)]
    .flatMap(match => {
      try { return [inflateSync(Buffer.from(match[1], "latin1")).toString("latin1")]; }
      catch { return []; }
    }).join("\n");
  const text = [...decoded.matchAll(/<([0-9a-f]+)>/gi)]
    .map(match => Buffer.from(match[1], "hex").toString("latin1")).join("");
  assert.match(text, /Inventory item 1 needs ownership validation/);
  assert.match(text, /Inventory item 240 needs ownership validation/);
  if (process.env["WRITE_BRIEF_SAMPLES"] === "1") {
    await mkdir("attached_assets/generated", { recursive: true });
    await writeFile("attached_assets/generated/application-inventory-long.pdf", pdf);
    await writeFile("attached_assets/generated/application-inventory-long.docx", docx);
  }
});