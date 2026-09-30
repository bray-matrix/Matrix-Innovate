// Jira Cloud foundation. No upstream bodies or credentials are logged or exposed.
import { assertSafeContent } from "./content-safety";
export class JiraError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

export interface JiraWorkItem {
  jiraIssueId: string;
  jiraIssueKey: string;
  jiraIssueType: string;
  summary: string;
  status: string;
  assignee: string | null;
  priority: string | null;
  updated: string | null;
  jiraProjectId: string;
  jiraProjectKey: string;
  jiraProjectName: string;
  url: string;
}

const issueFields = "summary,issuetype,status,assignee,priority,updated,project";
// ADF is untrusted structured content. Extract text nodes only; do not render
// marks, links, media, arbitrary attributes, or upstream HTML.
function plainDescription(value: unknown, safe: (text: string, max: number) => string): string {
  if (typeof value === "string") return safe(value, 4000);
  if (!value || typeof value !== "object") return "";
  const parts: string[] = [];
  const stack: unknown[] = [value];
  let visited = 0;
  let length = 0;
  while (stack.length && visited++ < 10000 && length < 4000) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const item = node as { type?: unknown; text?: unknown; content?: unknown };
    if (item.type === "text" && typeof item.text === "string") {
      const text = safe(item.text, 4000 - length);
      parts.push(text);
      length += text.length;
    } else if (item.type === "hardBreak") {
      parts.push("\n");
      length++;
    } else if (Array.isArray(item.content)) {
      // Bound breadth too, even for an unusually wide/hostile ADF document.
      if (["paragraph", "heading", "listItem", "tableRow", "blockquote"].includes(String(item.type))) {
        stack.push({ type: "hardBreak" });
      }
      for (const child of item.content.slice(0, 1000).reverse()) stack.push(child);
    }
  }
  return parts.join("").replace(/[ \t]*\n[ \t]*/g, "\n").trim().slice(0, 4000);
}
// Escape JQL literals separately from Lucene text-search syntax.
export const jiraLiteral = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function jiraConfig(env = process.env) {
  const raw = env.JIRA_BASE_URL?.trim();
  let baseUrl: string | null = null;
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) throw new Error();
      if (u.hostname === "localhost" || u.hostname.endsWith(".local") || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) throw new Error();
      baseUrl = u.origin;
    } catch { throw new JiraError("Jira base URL must be a public HTTPS origin without credentials, path, query, or fragment."); }
  }
  const email = env.JIRA_EMAIL?.trim() || "";
  const token = env.JIRA_API_TOKEN?.trim() || "";
  return { baseUrl, email, token, configured: Boolean(baseUrl && email && token) };
}

export class JiraClient {
  private config;
  private timeout: number;
  constructor(private fetcher: typeof fetch = fetch, env = process.env) {
    this.config = jiraConfig(env);
    const timeout = Number(env.JIRA_REQUEST_TIMEOUT_MS || 10000);
    this.timeout = Number.isFinite(timeout) ? Math.max(100, Math.min(30000, timeout)) : 10000;
  }
  // Whitelist primitive fields AND redact credentials if echoed inside those fields.
  safe(value: unknown, max = 255): string {
    if (typeof value !== "string") throw new JiraError("Jira returned invalid metadata.");
    let out = value;
    const { token, email } = this.config;
    const secrets = [token, email, Buffer.from(`${email}:${token}`).toString("base64")].filter(Boolean);
    for (const secret of secrets) out = out.split(secret).join("[redacted]");
    return out.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
  }
  state() {
    return {
      configured: this.config.configured,
      baseUrl: this.config.baseUrl ? this.safe(this.config.baseUrl) : null,
      accountEmailMasked: this.config.email ? "***@***" : null,
    };
  }
  async get(path: string, options: { signal?: AbortSignal; workItem?: boolean } = {}): Promise<any> {
    if (!this.config.configured) throw new JiraError("Jira credentials are not configured.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.workItem ? Math.min(this.timeout, 5000) : this.timeout);
      try {
        const response = await this.fetcher(`${this.config.baseUrl}/rest/api/3/${path}`, {
          headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.token}`).toString("base64")}` },
          redirect: "error",
          signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
        });
        if (response.status === 429 && attempt < 2 && !options.workItem) {
          const retry = response.headers.get("retry-after") || "";
          const seconds = /^\d+(\.\d+)?$/.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
          await response.body?.cancel();
          if (Number.isFinite(seconds) && seconds > 2) throw new JiraError("Jira rate limit reached. Try again later.");
          clearTimeout(timer);
          await new Promise(resolve => setTimeout(resolve, Math.min(2000, Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : 250 * 2 ** attempt))));
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new JiraError(response.status === 429 ? "Jira rate limit reached. Try again later." : response.status === 401 || response.status === 403 ? "Jira authentication or permissions failed." : "Jira request failed.", options.workItem && response.status === 404 ? 404 : 503);
        }
        // Bound decoded response size; keep timeout active until the entire body is read.
        const reader = response.body?.getReader();
        if (!reader) throw new JiraError("Jira returned an empty response.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 5_000_000) { await reader.cancel(); throw new JiraError("Jira response exceeds the metadata size limit."); }
          chunks.push(part.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (error) {
        if (error instanceof JiraError) throw error;
        throw new JiraError(controller.signal.aborted ? "Jira request timed out." : "Jira request failed or returned invalid data.");
      } finally { clearTimeout(timer); }
    }
    throw new JiraError("Jira rate limit reached. Try again later.");
  }
  async test() { await this.get("myself"); }
  private workItem(raw: any): JiraWorkItem {
    // Only these typed upstream metadata paths may bypass card checksum checks.
    // Summary, description, unknown fields and credential-bearing keys stay checked.
    assertSafeContent(raw?.fields, "jira_context", ["project.id", "issuetype.id", "status.id", "priority.id"]);
    if (!raw || !/^\d+$/.test(raw.id) || typeof raw.key !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(raw.key)) throw new JiraError("Jira returned invalid issue identity.");
    const f = raw.fields;
    const optional = (v: unknown) => typeof v === "string" ? this.safe(v, 500) : null;
    // Deliberate whitelist: never return upstream self/avatar/account URLs or bodies.
    return {
      jiraIssueId: this.safe(raw.id), jiraIssueKey: this.safe(raw.key),
      jiraIssueType: this.safe(f?.issuetype?.name), summary: this.safe(f?.summary, 1000),
      status: this.safe(f?.status?.name), assignee: optional(f?.assignee?.displayName),
      priority: optional(f?.priority?.name), updated: optional(f?.updated),
      jiraProjectId: this.safe(f?.project?.id), jiraProjectKey: this.safe(f?.project?.key),
      jiraProjectName: this.safe(f?.project?.name),
      url: this.safe(`${this.config.baseUrl}/browse/${encodeURIComponent(raw.key)}`, 2000),
    };
  }
  async issue(id: string, signal?: AbortSignal): Promise<JiraWorkItem> {
    if (!/^\d{1,30}$/.test(id)) throw new JiraError("Invalid Jira issue ID.", 400);
    const item = this.workItem(await this.get(`issue/${encodeURIComponent(id)}?fields=${issueFields}`, { workItem: true, signal }));
    if (item.jiraIssueId !== id) throw new JiraError("Jira returned an unexpected issue identity.");
    return item;
  }
  async intakeContext(id: string): Promise<JiraWorkItem & { description: string }> {
    if (!/^\d{1,30}$/.test(id)) throw new JiraError("Invalid Jira issue ID.", 400);
    const raw = await this.get(`issue/${encodeURIComponent(id)}?fields=${issueFields},description`, { workItem: true });
    const item = this.workItem(raw);
    if (item.jiraIssueId !== id) throw new JiraError("Jira returned an unexpected issue identity.");
    const context = { ...item, description: plainDescription(raw.fields?.description, (text, max) => this.safe(text, max)) };
    assertSafeContent(context, "jira_context", ["jiraIssueId", "jiraProjectId"]);
    return context;
  }
  async searchIssues(q = "", projectKey = "", limit = 25): Promise<JiraWorkItem[]> {
    q = q.trim();
    projectKey = projectKey.trim().toUpperCase();
    if (q.length > 200 || /[\u0000-\u001f\u007f]/.test(q) || (projectKey && !/^[A-Z][A-Z0-9_]{0,99}$/.test(projectKey))) throw new JiraError("Invalid Jira search.", 400);
    if (!q && !projectKey) throw new JiraError("Enter a Jira key, text, or select a project.", 400);
    if (!Number.isInteger(limit) || limit < 1) throw new JiraError("Invalid result limit.", 400);
    limit = Math.min(25, limit);
    const clauses: string[] = [];
    if (projectKey) clauses.push(`project = ${jiraLiteral(projectKey)}`);
    const key = /^([A-Z][A-Z0-9_]*)-(\d{1,9})$/i.exec(q);
    const projectPrefix = /^([A-Z][A-Z0-9_]*)-$/i.exec(q);
    if (key) {
      // Jira has no issuekey ~ operator. Numeric prefix ranges are index-backed,
      // bounded, and include the exact key without downloading project issues.
      const prefix = key[1].toUpperCase();
      const number = key[2];
      const alternatives = [`key = ${jiraLiteral(`${prefix}-${number}`)}`];
      for (let digits = 1; digits <= 9 - number.length; digits++) {
        alternatives.push(`(key >= ${jiraLiteral(`${prefix}-${number}${"0".repeat(digits)}`)} AND key <= ${jiraLiteral(`${prefix}-${number}${"9".repeat(digits)}`)})`);
      }
      clauses.push(`(project = ${jiraLiteral(prefix)} AND (${alternatives.join(" OR ")}))`);
    } else if (projectPrefix) {
      clauses.push(`project = ${jiraLiteral(projectPrefix[1].toUpperCase())}`);
    } else if (q) {
      const text = q.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");
      clauses.push(`text ~ ${jiraLiteral(text)}`);
    }
    const params = new URLSearchParams({ jql: `${clauses.join(" AND ")} ORDER BY ${key ? "key ASC" : "updated DESC"}`, maxResults: String(limit), fields: issueFields });
    const data = await this.get(`search/jql?${params}`, { workItem: true });
    if (!Array.isArray(data?.issues)) throw new JiraError("Jira returned invalid search results.");
    return data.issues.slice(0, limit).map((item: unknown) => this.workItem(item));
  }
  async projects() {
    const projects: { jiraProjectId: string; key: string; name: string; projectType: string | null }[] = [];
    let start = 0;
    const deadline = Date.now() + 120_000;
    for (let page = 0; page < 1000; page++) {
      if (Date.now() > deadline) throw new JiraError("Jira project discovery time limit reached; no partial discovery was saved.");
      const data = await this.get(`project/search?startAt=${start}&maxResults=100`);
      if (!Array.isArray(data?.values)) throw new JiraError("Jira returned invalid project metadata.");
      for (const p of data.values) projects.push({ jiraProjectId: this.safe(p.id), key: this.safe(p.key), name: this.safe(p.name), projectType: typeof p.projectTypeKey === "string" ? this.safe(p.projectTypeKey) : null });
      if (projects.length > 100_000) throw new JiraError("Jira project discovery exceeded the metadata safety limit; no partial discovery was saved.");
      start += data.values.length;
      if (data.isLast === true || (typeof data.total === "number" && start >= data.total)) return projects;
      if (!data.values.length) throw new JiraError("Jira project pagination did not complete.");
    }
    throw new JiraError("Jira project discovery exceeded the pagination safety limit; no partial discovery was saved.");
  }
  async fields() {
    const data = await this.get("field");
    if (!Array.isArray(data)) throw new JiraError("Jira returned invalid field metadata.");
    return data.map(f => ({ id: this.safe(f.id), name: this.safe(f.name), custom: f.custom === true, fieldType: typeof f.schema?.type === "string" ? this.safe(f.schema.type) : null }));
  }
  async statuses() {
    const data = await this.get("status");
    if (!Array.isArray(data)) throw new JiraError("Jira returned invalid status metadata.");
    return data.map(s => ({ jiraStatusId: this.safe(s.id), jiraStatusName: this.safe(s.name), canonicalCategory: s.statusCategory?.key === "done" ? "done" : s.statusCategory?.key === "indeterminate" ? "in_progress" : "todo" }));
  }
}