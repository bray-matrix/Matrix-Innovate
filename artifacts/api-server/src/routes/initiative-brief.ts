import { Router, type IRouter } from "express";
import { parseInitiativeBrief } from "@workspace/initiative-brief";
import { ExportInitiativeBriefBody, ExportInitiativeBriefParams } from "@workspace/api-zod";
import { renderInitiativeBriefDocx, renderInitiativeBriefPdf } from "../lib/initiative-brief-export";

const router: IRouter = Router();

// Guarded by the global /api Matrix session middleware, like every business route.
// No persistence, external requests, or AI; only the reviewed semantic model is rendered.
router.post("/initiative-brief/export/:format", async (req, res): Promise<void> => {
  const format = ExportInitiativeBriefParams.safeParse(req.params);
  const body = ExportInitiativeBriefBody.safeParse(req.body);
  if (!format.success || !body.success) {
    res.status(400).json({ error: "Invalid Initiative Brief export request" });
    return;
  }
  let brief;
  try {
    brief = parseInitiativeBrief(body.data);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid Initiative Brief" });
    return;
  }
  // A report may contain private interview data: no caching by intermediary.
  const isPdf = format.data.format === "pdf";
  const buffer = isPdf ? await renderInitiativeBriefPdf(brief) : await renderInitiativeBriefDocx(brief);
  const safeName = brief.metadata.title.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "initiative";
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", isPdf ? "application/pdf" :
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-brief.${format.data.format}"`);
  res.send(buffer);
});

export default router;