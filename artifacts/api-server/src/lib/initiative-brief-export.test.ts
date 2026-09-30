import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync, inflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { buildInitiativeBrief, parseInitiativeBrief, synthesizeBriefNarrative, type BriefDraft } from "@workspace/initiative-brief";
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
  unknowns: ["Who is the business owner of the application inventory?", "Who is the business owner of the application inventory?",
    "What is the integration architecture?", "How will technical deployment be phased?"],
};
const brief = buildInitiativeBrief({
  draft, aiResult, jira: { jiraIssueKey: "APP-123" }, generatedAt: "2026-09-30T12:00:00.000Z",
  review: { candidateSuccessMeasures: ["Percentage of applications with a validated owner"] },
});

function zipXml(buffer: Buffer, name: string): string {
  const part = buffer.toString("latin1").indexOf(name);
  assert.ok(part >= 30, `Missing OOXML part: ${name}`);
  const header = part - 30;
  assert.equal(buffer.readUInt32LE(header), 0x04034b50);
  const offset = header + 30 + buffer.readUInt16LE(header + 26) + buffer.readUInt16LE(header + 28);
  return inflateRawSync(buffer.subarray(offset, offset + buffer.readUInt32LE(header + 18))).toString("utf8");
}

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
  if (process.env["WRITE_REVISED_BRIEF_SAMPLES"] === "1") {
    await mkdir("attached_assets/generated", { recursive: true });
    await writeFile("attached_assets/generated/application-inventory-small-fixture-revised.docx", docx);
    await writeFile("attached_assets/generated/application-inventory-small-fixture-revised.pdf", pdf);
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
  const core = zipXml(docx, "docProps/core.xml");
  const footer = zipXml(docx, "word/footer1.xml");
  assert.match(core, /<dc:creator>Innovation Hub<\/dc:creator>/);
  assert.doesNotMatch(core, /Matrix Innovation Hub/);
  assert.match(footer, /Innovation Hub  •  2026-09-30  •  Page /);
  assert.doesNotMatch(footer, /Matrix Innovation Hub/);
  assert.match(xml, /Centralized Application Inventory and Ownership System/);
  assert.match(xml, /Percentage of applications with a validated owner/);
  assert.match(xml, /Validate a pilot inventory with two business units/);
  assert.match(xml, /Success measures have not yet been finalized/);
  assert.match(xml, /Potential Success Measures \(suggestions, not accepted\)/);
  assert.doesNotMatch(xml, /Drafted measure \(review before accepting\)|\[ai-draft\]/);
  assert.equal(xml.split("Draft narrative was generated from interview responses").length - 1, 1);
  assert.match(xml, /<w:keepNext\/>/);
  assert.doesNotMatch(xml, /<w:pageBreakBefore\/>|<w:br w:type="page"/);
  // Only section headings and the suggestions caption keep with one next row.
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(match => match[0]);
  const headingCount = briefSections(brief).length;
  const kept = paragraphs.filter(p => p.includes("<w:keepNext/>"));
  assert.equal(kept.length, headingCount + 1);
  assert.ok(kept.every(p => p.includes('w:pStyle w:val="Heading2"') ||
    p.includes("Potential Success Measures (suggestions, not accepted):")));
  assert.match(xml, /Current Assessment/);
  assert.match(xml, /Some scoring dimensions remain unquantified/);
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
  assert.match(extractedText, /Success measures have not yet been finalized/);
  assert.match(extractedText, /Potential Success Measures \(suggestions, not accepted\)/);
  assert.doesNotMatch(extractedText, /Drafted measure \(review before accepting\)|\[ai-draft\]/);
  assert.equal(extractedText.split("Draft narrative was generated from interview responses").length - 1, 1);
  assert.match(extractedText, /Some scoring dimensions remain unquantified/);
  assert.match(extractedText, /Not yet established/);
  assert.match(extractedText, /Innovation Hub  \x95  2026-09-30  \x95  Page /);
  assert.doesNotMatch(extractedText, /Matrix Innovation Hub/);
  let previousPdfSection = -1;
  let previousWordSection = -1;
  for (const section of briefSections(brief)) {
    const pdfIndex = extractedText.indexOf(section.title);
    const wordIndex = xml.indexOf(section.title.replace(/&/g, "&amp;"));
    assert.ok(pdfIndex > previousPdfSection, `PDF section missing or out of order: ${section.title}`);
    assert.ok(wordIndex > previousWordSection, `Word section missing or out of order: ${section.title}`);
    previousPdfSection = pdfIndex;
    previousWordSection = wordIndex;
    for (const r of section.rows) {
      // Both exports are projections of the same semantic rows, not separate synthesis.
      assert.ok(extractedText.includes(r.body), `PDF missing row: ${r.heading}`);
      assert.ok(xml.includes(r.body.replace(/&/g, "&amp;")), `Word missing row: ${r.heading}`);
    }
  }
  assert.equal(extractedText.split(brief.expectedValue.qualitative.text).length - 1, 1);
  assert.equal(xml.split(brief.expectedValue.qualitative.text).length - 1, 1);
});

test("full application-inventory evidence fixture exports the synthesized narrative", async () => {
  // Match the complete evidence fixture in initiative-review.test.tsx, not the
  // intentionally small DOCX mechanics fixture above. No production scenario logic.
  const evidence = [
    "Time is wasted rediscovering information; troubleshooting and onboarding are slower, and renewals and changes are harder.",
    "Unclear ownership and dependencies create security and compliance exposure.",
    "Credential-management visibility is limited and knowledge is lost when people leave.",
  ].map(value => ({ value, source: "user" as const }));
  const representative: BriefDraft = {
    ...draft,
    fields: { ...draft.fields, department: "", businessOwner: "",
      problemStatement: "Application information is fragmented and depends on institutional knowledge.",
      currentProcess: "Teams consult spreadsheets and colleagues.",
      desiredOutcome: "A reliable application inventory would begin with ownership and business purpose, administered by IT and validated by business owners.",
      aiConcept: "Begin with a reliable system of record for ownership and business purpose; extend later to integrations, dependencies, licensing, cost and credential-management visibility.",
      prototypeGoal: "", successMetric: "" },
    executiveSummary: `${draft.fields.title} addresses: Application information is fragmented and depends on institutional knowledge.. Desired outcome: A reliable application inventory.`,
    canvas: { expectedValue: "Value not yet quantified.", risks: "Risks not yet known.",
      recommendedNextStep: "Advance to review and refine scoring — currently Low priority (score 45/100)." },
  };
  const ai = {
    knownFacts: [
      { category: "Impact", value: evidence[0].value, source: "user" as const },
      { category: "Security risk", value: evidence[1].value, source: "user" as const },
      { category: "Continuity risk", value: evidence[2].value, source: "user" as const },
    ],
    unknowns: ["Who is the accountable business owner?", "Which department should sponsor this work?",
      "What baseline should validate the expected value?", "What is the validation cadence?",
      "Which source systems should be integrated?", "What is the implementation timeline?"],
  };
  const narrative = synthesizeBriefNarrative({ draft: representative, aiResult: ai, evidence });
  const representativeBrief = buildInitiativeBrief({
    draft: { ...representative, executiveSummary: narrative.executiveSummary,
      canvas: { expectedValue: narrative.expectedValue, risks: narrative.risks,
        recommendedNextStep: narrative.nextSteps } },
    aiResult: ai, generatedAt: "2026-09-30T12:00:00.000Z",
    review: { candidateSuccessMeasures: ["Share of applications with validated ownership",
      "Time required to locate application ownership and configuration information"] },
  });
  assert.match(representativeBrief.expectedValue.qualitative.text, /troubleshooting and onboarding/);
  assert.match(representativeBrief.risks.text, /security and compliance exposure/);
  assert.ok(representativeBrief.expectedValue.quantified.every(v => v.status === "unknown"));
  assert.doesNotMatch(representativeBrief.executiveSummary.text, /addresses:|Desired outcome:|\.\./);
  const docx = await renderInitiativeBriefDocx(representativeBrief);
  const pdf = await renderInitiativeBriefPdf(representativeBrief);
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  if (process.env["WRITE_REVISED_BRIEF_SAMPLES"] === "1") {
    await mkdir("attached_assets/generated", { recursive: true });
    await writeFile("attached_assets/generated/application-inventory-test-fixture-revised.docx", docx);
    await writeFile("attached_assets/generated/application-inventory-test-fixture-revised.pdf", pdf);
  }
});

test("representative browser-export payload flows supporting context without a sparse final PDF page", async () => {
  // The captured synthetic brief came through baseline + final AI merge +
  // review initialization, not a handcrafted short export fixture.
  const capture = JSON.parse(await readFile("attached_assets/generated/application-inventory-neutral-validation-fresh.json", "utf8"));
  const actual = parseInitiativeBrief(capture.brief);
  const directory = await mkdtemp(path.join(tmpdir(), "innovation-brief-"));
  try {
    const pdf = await renderInitiativeBriefPdf(actual);
    const docx = await renderInitiativeBriefDocx(actual);
    const pdfPath = path.join(directory, "brief.pdf");
    const docxPath = path.join(directory, "brief.docx");
    await writeFile(pdfPath, pdf);
    await writeFile(docxPath, docx);
    if (process.env["WRITE_REPRESENTATIVE_BRIEF_SAMPLE"] === "1") {
      await writeFile("/tmp/innovation-representative-part-a.pdf", pdf);
      await writeFile("/tmp/innovation-representative-part-a.docx", docx);
    }
    const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
    assert.match(info, /^Author:\s+Innovation Hub$/m);
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.equal(pages, 2, "representative Supporting Context must not be stranded on page three");
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" })
      .replace(/-\s*\n\s*/g, "-").replace(/\s+/g, " ");
    const normalized = (value: string) => value.replace(/\s+/g, " ");
    for (const section of briefSections(actual)) {
      assert.ok(text.includes(section.title), `PDF missing ${section.title}`);
      for (const row of section.rows)
        assert.ok(text.includes(normalized(row.body)), `PDF missing ${section.title}: ${row.heading}`);
    }
    assert.equal(docx.subarray(0, 2).toString(), "PK");
    const part = docx.toString("latin1").indexOf("word/document.xml");
    const header = part - 30;
    const offset = header + 30 + docx.readUInt16LE(header + 26) + docx.readUInt16LE(header + 28);
    const xml = inflateRawSync(docx.subarray(offset, offset + docx.readUInt32LE(header + 18))).toString("utf8");
    for (const section of briefSections(actual)) {
      assert.ok(xml.includes(section.title.replace(/&/g, "&amp;")), `Word missing ${section.title}`);
      for (const row of section.rows)
        assert.ok(xml.includes(row.body.replace(/&/g, "&amp;")), `Word missing ${section.title}: ${row.heading}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("corrected browser review content does not orphan the last Supporting Context fact in Word", async () => {
  // This semantic payload reproduces the full 2026-09-30 browser download,
  // including the fourth risk sentence absent from the shorter previous fixture.
  const actual = parseInitiativeBrief(JSON.parse(
    await readFile(new URL("./initiative-brief-corrected-browser.fixture.json", import.meta.url), "utf8")));
  const docx = await renderInitiativeBriefDocx(actual);
  const xml = zipXml(docx, "word/document.xml");
  assert.equal(actual.assessment.score, 45);
  assert.equal(actual.assessment.readiness, "83% — Strong Business Context");
  assert.equal(actual.supportingContext.facts.length, 4);
  assert.match(actual.risks.text, /Limited credential-management visibility creates security and compliance exposure/);
  for (const section of briefSections(actual)) {
    assert.ok(xml.includes(section.title.replace(/&/g, "&amp;")), `Word missing ${section.title}`);
    for (const row of section.rows)
      assert.ok(xml.includes(row.body.replace(/&/g, "&amp;")), `Word missing ${section.title}: ${row.heading}`);
  }
  // LibreOffice is the offline pagination oracle, not a guarantee of identical
  // Microsoft Word layout. Leave this semantic-content test portable without LO.
  if (spawnSync("which", ["libreoffice"]).status !== 0) return;
  const directory = await mkdtemp(path.join(tmpdir(), "innovation-corrected-browser-"));
  try {
    const docxPath = path.join(directory, "browser-review.docx");
    await writeFile(docxPath, docx);
    execFileSync("libreoffice", [
      `-env:UserInstallation=file://${directory}/lo`, "--headless", "--convert-to", "pdf",
      "--outdir", directory, docxPath,
    ], { timeout: 60000 });
    const pdfPath = path.join(directory, "browser-review.pdf");
    assert.match(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" }), /^Pages:\s+2$/m,
      "the final risk fact must not occupy its own trailing page");
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" })
      .replace(/-\s*\n\s*/g, "-").replace(/\s+/g, " ");
    const normalized = (value: string) => value.replace(/\s+/g, " ");
    for (const section of briefSections(actual))
      for (const row of section.rows)
        assert.ok(text.includes(normalized(row.body)), `rendered Word missing ${section.title}: ${row.heading}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The one-request live final-generation replay is recorded separately from the
// deterministic frontend fixture. Export its corrected semantic brief verbatim.
if (process.env["WRITE_LIVE_BRIEF_SAMPLE"] === "1") {
  test("export captured live synthetic Initiative Brief without reconstructing facts", async () => {
    const capture = JSON.parse(await readFile("attached_assets/generated/application-inventory-live-synthesis.json", "utf8"));
    const actual = parseInitiativeBrief(capture.brief);
    assert.equal(capture.operation, "final-only");
    assert.equal(capture.requests, 1);
    assert.notEqual(actual.futureState.outcome.text, "Not yet established");
    const docx = await renderInitiativeBriefDocx(actual);
    const pdf = await renderInitiativeBriefPdf(actual);
    await writeFile("attached_assets/generated/application-inventory-brief-revised.docx", docx);
    await writeFile("attached_assets/generated/application-inventory-brief-revised.pdf", pdf);
  });
}

if (process.env["WRITE_REPRESENTATIVE_BRIEF_SAMPLE"] === "1") {
  test("export the offline completion replay through the production renderers", async () => {
    const replay = parseInitiativeBrief(JSON.parse(
      await readFile("/tmp/innovation-representative-part-a-brief.json", "utf8")));
    const pdf = await renderInitiativeBriefPdf(replay);
    const docx = await renderInitiativeBriefDocx(replay);
    const pdfPath = "/tmp/innovation-representative-completion-part-a.pdf";
    await writeFile(pdfPath, pdf);
    await writeFile("/tmp/innovation-representative-completion-part-a.docx", docx);
    assert.match(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" }), /^Pages:\s+2$/m);
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" })
      .replace(/-\s*\n\s*/g, "-").replace(/\s+/g, " ");
    for (const section of briefSections(replay)) {
      assert.ok(text.includes(section.title));
      for (const row of section.rows)
        assert.ok(text.includes(row.body.replace(/\s+/g, " ")), `completion PDF missing ${section.title}: ${row.heading}`);
    }
    assert.equal(docx.subarray(0, 2).toString(), "PK");
  });
}

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
  if (process.env["WRITE_LONG_BRIEF_SAMPLE"] === "1") {
    await mkdir("attached_assets/generated", { recursive: true });
    await writeFile("attached_assets/generated/application-inventory-long-revised.pdf", pdf);
    await writeFile("attached_assets/generated/application-inventory-long-revised.docx", docx);
  }
});

test("accepted metric is not presented as absent; discovery remains separate from critical questions", () => {
  const reviewed = {
    ...brief,
    successMeasures: { ...brief.successMeasures,
      drafted: { text: "Validated ownership coverage", source: "reviewed" as const } },
  };
  const rows = briefSections(reviewed);
  const measures = rows.find(s => s.title === "Success Measures")!.rows;
  assert.ok(measures.some(r => r.body === "Validated ownership coverage"));
  assert.ok(!measures.some(r => r.body === "Success measures have not yet been finalized."));
  const questions = rows.find(s => s.title === "Risks, Constraints & Unknowns")!.rows;
  assert.equal(questions.filter(r => r.heading === "Critical unknown").length,
    brief.unknowns.filter(u => u.priority === "critical").length);
  assert.equal(questions.filter(r => r.heading === "Future discovery").length,
    brief.unknowns.filter(u => u.priority === "discovery").length);
  assert.ok(questions.findIndex(r => r.heading === "Future discovery") >
    questions.findIndex(r => r.heading === "Critical unknown"));
  assert.ok(!briefSections({ ...reviewed, supportingContext: { facts: [], jiraKey: "" } })
    .some(s => s.title === "Supporting Context"), "do not render an empty last section");
});