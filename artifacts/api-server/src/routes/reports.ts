import { Router, type IRouter } from "express";
import {
  generateReport,
  REPORT_CATALOG,
  type ReportScope,
} from "../lib/reporting";
import { renderReportPdf } from "../lib/report-pdf";

// Reports: JSON (web renderer) and PDF export share one report model.
// Authentication is enforced by the global /api requireMatrixSession guard.

const router: IRouter = Router();

function parseScope(query: Record<string, unknown>): ReportScope {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  return {
    projectId: num(query.projectId),
    clientId: num(query.clientId),
    programId: num(query.programId),
  };
}

router.get("/reports", (_req, res) => {
  res.json(REPORT_CATALOG);
});

async function buildReport(
  key: string,
  query: Record<string, unknown>,
): Promise<
  | { status: 200; report: Awaited<ReturnType<typeof generateReport>> }
  | { status: 400 | 404; message: string }
> {
  const result = await generateReport(key, parseScope(query));
  if ("error" in result) {
    if (result.error === "unknown")
      return { status: 404, message: "Unknown report" };
    if (result.error === "scope")
      return { status: 400, message: "This report requires a scope selection" };
    return { status: 404, message: "Scope entity not found" };
  }
  return { status: 200, report: result };
}

router.get("/reports/:key", async (req, res, next) => {
  try {
    const result = await buildReport(req.params.key, req.query);
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.json(result.report);
  } catch (err) {
    next(err);
  }
});

router.get("/reports/:key/pdf", async (req, res, next) => {
  try {
    const result = await buildReport(req.params.key, req.query);
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    const report = result.report as Exclude<
      Awaited<ReturnType<typeof generateReport>>,
      { error: string }
    >;
    const pdf = await renderReportPdf(report);
    req.log.info({ report: report.reportKey }, "report PDF generated");
    res
      .setHeader("content-type", "application/pdf")
      .setHeader(
        "content-disposition",
        `attachment; filename="compass-${report.reportKey}-${report.generatedAt.slice(0, 10)}.pdf"`,
      )
      .send(pdf);
  } catch (err) {
    next(err);
  }
});

export default router;
