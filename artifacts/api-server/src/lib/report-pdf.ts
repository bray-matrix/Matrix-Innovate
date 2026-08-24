import { createRequire } from "node:module";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import type { Report, ReportSection } from "./reporting";

// pdfmake 0.3 server build exports a singleton with setFonts/createPdf.
// It's kept external in build.mjs (pdfkit reads font metrics from disk),
// so load it via require and type the small surface we use.
const nodeRequire = createRequire(import.meta.url);
interface PdfmakeServer {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  setLocalAccessPolicy(cb: (path: string) => boolean): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
}
const pdfmake = nodeRequire("pdfmake") as PdfmakeServer;
// Reports contain text only — deny external URLs; local access is limited to
// the PDF standard-14 font names (pdfkit resolves these via this policy too).
const STANDARD_FONTS = new Set([
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
]);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => STANDARD_FONTS.has(path));

// PDF renderer for the structured report model. It consumes exactly the same
// Report object the web renderer receives — no business logic here, layout
// only. Uses the PDF standard-14 Helvetica fonts (no font files needed).

pdfmake.setFonts({
  // PDF standard-14 fonts — no font files required server-side.
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
});

const TONE_COLORS: Record<string, string> = {
  positive: "#15803d",
  warning: "#b45309",
  critical: "#b91c1c",
};

function sectionContent(section: ReportSection): Content[] {
  const parts: Content[] = [
    { text: section.title, style: "sectionTitle", margin: [0, 12, 0, 4] },
  ];
  if (section.kind === "cards" && section.cards) {
    parts.push({
      table: {
        widths: section.cards.map(() => "auto"),
        body: [
          section.cards.map((c) => ({ text: c.label, style: "cardLabel" })),
          section.cards.map((c) => ({
            text: c.value,
            style: "cardValue",
            color: (c.tone && TONE_COLORS[c.tone]) || undefined,
          })),
        ],
      },
      layout: "lightHorizontalLines",
    });
  } else if (section.kind === "keyValues" && section.keyValues) {
    parts.push({
      table: {
        widths: [140, "*"],
        body: section.keyValues.map((kv) => [
          { text: kv.label, style: "cardLabel" },
          {
            text: kv.value,
            color: (kv.tone && TONE_COLORS[kv.tone]) || undefined,
          },
        ]),
      },
      layout: "lightHorizontalLines",
    });
  } else if (section.kind === "table" && section.columns) {
    const rows = section.rows ?? [];
    if (rows.length === 0) {
      parts.push({
        text: section.emptyMessage ?? "No data.",
        style: "empty",
      });
    } else {
      parts.push({
        table: {
          headerRows: 1,
          widths: section.columns.map(() => "auto"),
          body: [
            section.columns.map((c) => ({ text: c.label, style: "th" })),
            ...rows.map((row) =>
              section.columns!.map((c) => ({
                text: row[c.key] ?? "—",
                style: "td",
              })),
            ),
          ],
        },
        layout: "lightHorizontalLines",
      });
    }
  } else if (section.kind === "note" && section.note) {
    parts.push({ text: section.note });
  }
  return parts;
}

export function renderReportPdf(report: Report): Promise<Buffer> {
  const generated = new Date(report.generatedAt);
  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [36, 48, 36, 40],
    defaultStyle: { font: "Helvetica", fontSize: 8 },
    info: { title: `${report.appName} — ${report.title}` },
    footer: (currentPage, pageCount) => ({
      columns: [
        {
          text: `${report.appName} ${report.appVersion} — generated ${generated.toISOString().replace("T", " ").slice(0, 16)} UTC`,
          style: "footer",
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "right",
          style: "footer",
        },
      ],
      margin: [36, 10, 36, 0],
    }),
    content: [
      { text: report.appName, style: "app" },
      { text: report.title, style: "title" },
      {
        text: [
          report.scopeLabel ? `Scope: ${report.scopeLabel}   ` : "",
          `Generated: ${generated.toISOString().replace("T", " ").slice(0, 16)} UTC   `,
          `Version: ${report.appVersion}`,
        ].join(""),
        style: "meta",
        margin: [0, 2, 0, 8],
      },
      ...report.sections.flatMap(sectionContent),
    ],
    styles: {
      app: { fontSize: 9, bold: true, color: "#6b7280" },
      title: { fontSize: 16, bold: true },
      meta: { fontSize: 8, color: "#6b7280" },
      sectionTitle: { fontSize: 11, bold: true },
      th: { bold: true, fontSize: 8 },
      td: { fontSize: 8 },
      cardLabel: { fontSize: 7, color: "#6b7280" },
      cardValue: { fontSize: 11, bold: true },
      empty: { fontSize: 8, italics: true, color: "#6b7280" },
      footer: { fontSize: 7, color: "#9ca3af" },
    },
  };
  return pdfmake.createPdf(doc).getBuffer();
}
