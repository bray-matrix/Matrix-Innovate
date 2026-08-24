---
name: pdfmake server usage
description: How server-side PDF export works in this repo (pdfmake 0.3 API, esbuild external, access policies)
---

- pdfmake 0.3 server build exports a **singleton** (`setFonts`, `createPdf(doc).getBuffer()`), NOT a `new PdfPrinter(fonts)` class; @types/pdfmake covers only the browser API, so load via `createRequire` and type the small surface used.
- **Why:** `new PdfPrinter(...)` throws "not a constructor" at runtime even though older docs/examples show it.
- pdfmake must stay in esbuild `external` (api-server build.mjs) — pdfkit reads .afm font metrics from disk and bundling breaks it. Standard-14 Helvetica fonts need no font files.
- If you set `setLocalAccessPolicy`, it must allow the bare standard font names ("Helvetica", "Helvetica-Bold", …) — pdfkit resolves them through that policy too; deny-all breaks font loading.
- **How to apply:** any new PDF output should go through artifacts/api-server/src/lib/report-pdf.ts and consume the structured report model from src/lib/reporting.ts (same model as the web renderer — never compute report facts in the renderer).
