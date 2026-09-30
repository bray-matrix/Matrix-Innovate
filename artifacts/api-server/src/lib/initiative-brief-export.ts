import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { Document, ImageRun, Packer, Paragraph, TextRun, HeadingLevel, Footer, Header, PageNumber, AlignmentType, Table, TableCell, TableRow, WidthType } from "docx";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import type { InitiativeBrief, BriefText } from "@workspace/initiative-brief";

const require = createRequire(import.meta.url);
const pdfmake = require("pdfmake") as {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};
const fonts = new Set(["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"]);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(name => fonts.has(name));
pdfmake.setFonts({ Helvetica: {
  normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique",
} });

// The existing approved asset is used by the Innovation Hub navigation. Never synthesize a brand mark.
async function brandImage(): Promise<Buffer> {
  const base = process.cwd();
  const locations = [
    path.resolve(base, "artifacts/matrix-innovation-hub/public/matrix-wordmark.png"),
    path.resolve(base, "../matrix-innovation-hub/public/matrix-wordmark.png"),
  ];
  for (const location of locations) {
    try { return await readFile(location); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Approved Matrix wordmark asset is missing from Innovation Hub public assets");
}

interface Row { heading: string; body: string; bullet?: boolean; keepNext?: boolean }
interface Section { title: string; rows: Row[] }
function row(heading: string, value: BriefText): Row {
  return { heading, body: value.text };
}
/** Shared semantic section order for both renderers. */
export function briefSections(b: InitiativeBrief): Section[] {
  const need = [
    row("Problem / Opportunity", b.businessNeed.problem),
    row("Current State / Process", b.businessNeed.currentState),
  ];
  if (b.businessNeed.businessImpact &&
    b.businessNeed.businessImpact.text !== b.expectedValue.qualitative.text)
    need.push(row("Business Impact", b.businessNeed.businessImpact));
  const future = [
    row("Desired Outcome", b.futureState.outcome), row("High-level Approach", b.futureState.approach),
  ];
  if (b.futureState.prototype) future.push(row("Initial Prototype", b.futureState.prototype));
  const finalizedMeasure = b.successMeasures.drafted.text !== "Not yet established";
  return [
    { title: "Executive Summary", rows: [row("", b.executiveSummary)] },
    { title: "Business Need", rows: need },
    { title: "Proposed Future State", rows: future },
    { title: "Expected Business Value", rows: [
      row("Qualitative Value", b.expectedValue.qualitative),
      ...b.expectedValue.quantified.map(v => ({ heading: v.label,
        body: `${v.text}${v.status === "unknown" ? "" : " (user estimate, unverified)"}` })),
    ] },
    { title: "Success Measures", rows: [
      finalizedMeasure
        ? row("Drafted measure (review before accepting)", b.successMeasures.drafted)
        : { heading: "", body: "Success measures have not yet been finalized." },
      ...(b.successMeasures.candidates.length
        ? [{ heading: "", body: "Potential Success Measures (suggestions, not accepted):", keepNext: true }] : []),
      ...b.successMeasures.candidates.map(v => ({ ...row("Suggested measure", v), bullet: true })),
    ] },
    { title: "Risks, Constraints & Unknowns", rows: [
      row("Risks / Considerations", b.risks),
      ...b.unknowns.filter(u => u.priority === "critical")
        .map(u => ({ heading: "Critical unknown", body: u.text, bullet: true })),
      ...b.unknowns.filter(u => u.priority === "discovery")
        .map(u => ({ heading: "Future discovery", body: u.text, bullet: true })),
    ] },
    { title: "Recommended Next Steps", rows: [row("", b.nextSteps)] },
    { title: "Current Assessment", rows: [
      { heading: "Overall Score", body: `${b.assessment.score}/100 · ${b.assessment.priority} (current assessment, not a decision)` },
      { heading: "Readiness", body: b.assessment.readiness },
      ...(b.expectedValue.quantified.some(v => v.status === "unknown")
        ? [{ heading: "", body: "Some scoring dimensions remain unquantified; unknown values are not confirmed zero." }] : []),
      ...b.assessment.factors.map(f => ({ heading: f.label, body: f.value })),
    ] },
    { title: "Supporting Context", rows: [
      ...(b.supportingContext.jiraKey ? [{ heading: "Linked Jira", body: b.supportingContext.jiraKey }] : []),
      ...b.supportingContext.facts.map(f => ({ heading: `${f.category} (${f.source === "jira" ? "Jira" : "interview"} fact)`, body: f.value })),
    ] },
  ].filter(section => section.rows.length > 0);
}
const blue = "164B85";
const display = (value: string) => value || "Not yet provided";
const provenanceNote = "Draft narrative was generated from interview responses and should be reviewed before approval. Supporting facts are attributed to interview or Jira; potential success measures are suggestions, not accepted targets.";
function metaRows(b: InitiativeBrief): Row[] {
  const m = b.metadata;
  return [
    { heading: "Initiative Type", body: display(m.type) },
    { heading: "Department", body: display(m.department) },
    { heading: "Submitter", body: display(m.submitter) },
    { heading: "Business Owner", body: display(m.businessOwner) },
    { heading: "Executive Sponsor", body: display(m.executiveSponsor) },
    { heading: "Status", body: m.status },
  ];
}
export async function renderInitiativeBriefDocx(b: InitiativeBrief): Promise<Buffer> {
  const logo = await brandImage();
  const paragraph = (r: Row) => new Paragraph({
    // A suggestions caption stays with its first bullet; all other body rows
    // remain free to flow instead of carrying whole sections forward.
    keepNext: r.keepNext,
    spacing: { after: 40, line: 270 },
    bullet: r.bullet ? { level: 0 } : undefined,
    children: [
      ...(r.heading ? [new TextRun({ text: `${r.heading}: `, bold: true, color: blue })] : []),
      new TextRun({ text: r.body }),
    ],
  });
  const doc = new Document({
    creator: "Innovation Hub", title: b.metadata.title,
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 800, left: 850, right: 850,
        header: 450, footer: 450 } } },
      headers: { default: new Header({ children: [new Table({
        width: { size: 2250, type: WidthType.DXA }, columnWidths: [2250],
        borders: { top: { style: "none" }, bottom: { style: "none" },
          left: { style: "none" }, right: { style: "none" } },
        rows: [new TableRow({ children: [new TableCell({
          shading: { fill: "07316B" },
          margins: { top: 75, bottom: 75, left: 150, right: 150 },
          children: [new Paragraph({ spacing: { after: 0 },
            children: [new ImageRun({ data: logo, type: "png", transformation: { width: 130, height: 32 } })] })],
        })] })],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `Innovation Hub  •  ${b.metadata.generatedAt.slice(0, 10)}  •  Page `, color: "64748B", size: 17 }),
          new TextRun({ children: [PageNumber.CURRENT], color: "64748B", size: 17 }),
        ],
      })] }) },
      children: [
        new Paragraph({ text: "INITIATIVE BRIEF", heading: HeadingLevel.HEADING_2, spacing: { after: 160 } }),
        new Paragraph({ text: b.metadata.title, heading: HeadingLevel.TITLE, spacing: { after: 160 } }),
        new Paragraph({ spacing: { after: 145 }, children: [
          new TextRun({ text: provenanceNote, italics: true, color: "64748B", size: 18 }),
        ] }),
        ...metaRows(b).map(r => new Paragraph({
          spacing: { after: 55, line: 275 },
          children: [new TextRun({ text: `${r.heading}: `, bold: true, color: blue }), new TextRun(r.body)],
        })),
        ...briefSections(b).flatMap(section => [
          new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2,
            keepNext: section.rows.length > 0, spacing: { before: 80, after: 50 } }),
          ...section.rows.map(r => paragraph(r)),
        ]),
      ],
    }],
    styles: { default: {
      document: { run: { font: "Aptos", size: 21, color: "25354B" } },
      title: { run: { font: "Aptos Display", size: 38, bold: true, color: blue } },
      heading2: { run: { font: "Aptos", size: 26, bold: true, color: blue } },
    } },
  });
  return Packer.toBuffer(doc);
}

export async function renderInitiativeBriefPdf(b: InitiativeBrief): Promise<Buffer> {
  const logo = await brandImage();
  const sections: Content[] = briefSections(b).flatMap(section => [
    { text: section.title, style: "sectionTitle", headlineLevel: 2, margin: [0, 7, 0, 3] },
    ...section.rows.map(r => ({
      text: [
        ...(r.heading ? [{ text: `${r.heading}: `, bold: true, color: "#164B85" }] : []),
        { text: r.body },
      ],
      margin: [r.bullet ? 12 : 0, 0, 0, 3] as [number, number, number, number],
    })),
  ]);
  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [48, 78, 48, 53],
    // Headings can move with a row, but never force the complete following
    // section to the next page. pdfmake flows rows across pages by default.
    pageBreakBefore: (node, queries) => node.headlineLevel === 2 &&
      queries.getFollowingNodesOnPage().length === 0 && queries.getNodesOnNextPage().length > 0,
    defaultStyle: { font: "Helvetica", fontSize: 9, color: "#25354B", lineHeight: 1.28 },
    info: { title: b.metadata.title, author: "Innovation Hub" },
    header: {
      table: { widths: [150], body: [[{
        image: `data:image/png;base64,${logo.toString("base64")}`, width: 130, fillColor: "#07316B",
        border: [false, false, false, false],
      }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0,
        paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 5, paddingBottom: () => 5 },
      margin: [48, 24, 0, 0],
    },
    footer: (page, pages) => ({
      text: `Innovation Hub  •  ${b.metadata.generatedAt.slice(0, 10)}  •  Page ${page} of ${pages}`,
      alignment: "right", color: "#64748B", fontSize: 8, margin: [0, 16, 48, 0],
    }),
    content: [
      { text: "INITIATIVE BRIEF", fontSize: 9, bold: true, color: "#164B85", margin: [0, 0, 0, 8] },
      { text: b.metadata.title, style: "title", margin: [0, 0, 0, 14] },
      { text: provenanceNote, italics: true, color: "#64748B", fontSize: 8,
        margin: [0, 0, 0, 10] },
      ...metaRows(b).map(r => ({
        text: [{ text: `${r.heading}: `, bold: true, color: "#164B85" }, r.body],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      })),
      ...sections,
    ],
    styles: {
      title: { fontSize: 21, bold: true, color: "#164B85" },
      sectionTitle: { fontSize: 12, bold: true, color: "#164B85" },
    },
  };
  return pdfmake.createPdf(doc).getBuffer();
}