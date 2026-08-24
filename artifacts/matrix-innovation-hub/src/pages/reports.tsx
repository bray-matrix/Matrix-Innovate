import { useState, useMemo } from "react";
import { 
  useListReports, 
  useGetReport,
  useListProjects,
  useListClients,
  useListPrograms,
  getGetReportQueryKey
} from "@workspace/api-client-react";
import type { ReportCatalogEntry, Report } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Printer, BarChart2, Table as TableIcon, List, Info, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withBase } from "@/lib/base-path";

// A wrapper to fetch only when enabled
function ReportViewer({ 
  reportKey, 
  projectId, 
  clientId, 
  programId, 
  onBack 
}: { 
  reportKey: string, 
  projectId?: number, 
  clientId?: number, 
  programId?: number, 
  onBack: () => void 
}) {
  const { data: report, isLoading, isError } = useGetReport(
    reportKey, 
    { projectId, clientId, programId }, 
    { query: { enabled: true, queryKey: getGetReportQueryKey(reportKey, { projectId, clientId, programId }) } }
  );

  const handleExportPdf = () => {
    let url = withBase(`/api/reports/${reportKey}/pdf`);
    const params = new URLSearchParams();
    if (projectId) params.append("projectId", projectId.toString());
    if (clientId) params.append("clientId", clientId.toString());
    if (programId) params.append("programId", programId.toString());
    if (params.toString()) url += `?${params.toString()}`;
    window.open(url, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Catalog</Button>
        <div className="p-8 text-center border rounded border-dashed bg-muted/20">
          <p className="text-destructive font-medium">Failed to generate report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 report-container">
      {/* Header - Screen only controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <Button variant="outline" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Catalog
        </Button>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handlePrint} className="flex-1 sm:flex-none">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button onClick={handleExportPdf} className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Report Document */}
      <div className="bg-card border shadow-sm rounded-xl p-8 print:p-0 print:border-none print:shadow-none print:bg-transparent text-foreground">
        
        {/* Report Header */}
        <div className="border-b pb-6 mb-8 text-center">
          <h1 className="text-3xl font-serif tracking-tight text-primary mb-2">{report.title}</h1>
          {report.scopeLabel && <h2 className="text-xl font-medium text-muted-foreground mb-4">{report.scopeLabel}</h2>}
          <div className="text-sm text-muted-foreground flex items-center justify-center gap-4">
            <span>Generated: {new Date(report.generatedAt).toLocaleString()}</span>
            <span>&bull;</span>
            <span>{report.appName} {report.appVersion}</span>
          </div>
        </div>

        {/* Report Sections */}
        <div className="space-y-12">
          {report.sections.map((section, idx) => (
            <div key={`${section.key}-${idx}`} className="space-y-4 print:break-inside-avoid">
              <h3 className="text-lg font-semibold border-b pb-2 text-foreground/90">{section.title}</h3>
              
              {section.kind === "cards" && section.cards && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {section.cards.map((c, i) => (
                    <div key={i} className={`p-4 rounded-lg border flex flex-col justify-center
                      ${c.tone === "positive" ? "bg-green-50 border-green-200" : 
                        c.tone === "warning" ? "bg-amber-50 border-amber-200" : 
                        c.tone === "critical" ? "bg-red-50 border-red-200" : "bg-muted/30"}`}
                    >
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{c.label}</div>
                      <div className={`text-2xl font-bold 
                        ${c.tone === "positive" ? "text-green-700" : 
                          c.tone === "warning" ? "text-amber-700" : 
                          c.tone === "critical" ? "text-red-700" : "text-foreground"}`}
                      >
                        {c.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {section.kind === "keyValues" && section.keyValues && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {section.keyValues.map((kv, i) => (
                    <div key={i} className="flex justify-between py-2 border-b border-muted/50">
                      <dt className="text-sm font-medium text-muted-foreground">{kv.label}</dt>
                      <dd className="text-sm font-semibold text-right">{kv.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {section.kind === "table" && section.columns && (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        {section.columns.map(col => (
                          <th key={col.key} className="px-4 py-3 font-medium border-b">{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!section.rows || section.rows.length === 0 ? (
                        <tr>
                          <td colSpan={section.columns.length} className="px-4 py-8 text-center text-muted-foreground italic">
                            {section.emptyMessage || "No data available."}
                          </td>
                        </tr>
                      ) : (
                        section.rows.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            {section.columns!.map(col => (
                              <td key={col.key} className="px-4 py-3">{row[col.key] || "—"}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {section.kind === "note" && section.note && (
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg text-sm text-blue-900 leading-relaxed">
                  {section.note}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 2cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-container { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
        }
      `}} />
    </div>
  );
}

export default function ReportsPage() {
  const { data: reports, isLoading } = useListReports();
  const { data: projectsData } = useListProjects();
  const { data: clientsData } = useListClients();
  const { data: programsData } = useListPrograms();

  const [selectedReport, setSelectedReport] = useState<ReportCatalogEntry | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const handleSelectReport = (report: ReportCatalogEntry) => {
    setSelectedReport(report);
    setSelectedEntityId("");
    if (report.scope === "none") {
      // Auto-generate if no scope required
      setGenerating(true);
    } else {
      setGenerating(false);
    }
  };

  const handleGenerate = () => {
    if (selectedReport?.scope !== "none" && !selectedEntityId) return;
    setGenerating(true);
  };

  if (generating && selectedReport) {
    const pId = selectedReport.scope === "project" ? parseInt(selectedEntityId) : undefined;
    const cId = selectedReport.scope === "client" ? parseInt(selectedEntityId) : undefined;
    const prId = selectedReport.scope === "program" ? parseInt(selectedEntityId) : undefined;

    return (
      <ReportViewer 
        reportKey={selectedReport.key}
        projectId={pId}
        clientId={cId}
        programId={prId}
        onBack={() => {
          setGenerating(false);
          setSelectedReport(null);
          setSelectedEntityId("");
        }}
      />
    );
  }

  return (
    <div className="space-y-6 print:hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Reporting
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Generate insights and summaries across the portfolio.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {reports?.map(r => (
                <Card 
                  key={r.key} 
                  className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${selectedReport?.key === r.key ? "border-primary ring-1 ring-primary" : ""}`}
                  onClick={() => handleSelectReport(r)}
                >
                  <CardHeader className="p-4">
                    <CardTitle className="text-base flex items-center justify-between">
                      {r.title}
                      {r.scope !== "none" && <Badge variant="secondary" className="text-[10px] uppercase font-semibold">{r.scope}</Badge>}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1 line-clamp-2">{r.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle>Report Configuration</CardTitle>
              <CardDescription>Select a report to configure and generate.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {!selectedReport ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm">Select a report from the catalog to begin.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-foreground">{selectedReport.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{selectedReport.description}</p>
                  </div>

                  {selectedReport.scope !== "none" && (
                    <div className="space-y-2">
                      <Label className="capitalize text-xs text-muted-foreground">Select {selectedReport.scope}</Label>
                      <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                        <SelectTrigger>
                          <SelectValue placeholder={`Choose a ${selectedReport.scope}...`} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedReport.scope === "project" && projectsData?.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                          {selectedReport.scope === "client" && clientsData?.map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                          {selectedReport.scope === "program" && programsData?.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={handleGenerate}
                    disabled={selectedReport.scope !== "none" && !selectedEntityId}
                  >
                    Generate Report
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
