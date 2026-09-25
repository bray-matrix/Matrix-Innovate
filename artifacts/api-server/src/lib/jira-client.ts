// Jira Cloud foundation. No upstream bodies or credentials are logged or exposed.
export class JiraError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

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
  async get(path: string): Promise<any> {
    if (!this.config.configured) throw new JiraError("Jira credentials are not configured.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await this.fetcher(`${this.config.baseUrl}/rest/api/3/${path}`, {
          headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.token}`).toString("base64")}` },
          redirect: "error",
          signal: controller.signal,
        });
        if (response.status === 429 && attempt < 2) {
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
          throw new JiraError(response.status === 429 ? "Jira rate limit reached. Try again later." : response.status === 401 || response.status === 403 ? "Jira authentication or permissions failed." : "Jira request failed.");
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