import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler, ErrorRequestHandler } from "express";
import type { AuthenticatedRequest } from "../matrix/auth";

export const CONTENT_POLICY_VERSION = "innovation-content-v1.6.5";
export type ContentCategory = "CREDENTIAL_SECRET" | "FINANCIAL_IDENTIFIER" | "PERSONAL_IDENTIFIER" |
  "HEALTH_PHI" | "SEXUAL_VULGAR_HARASSMENT" | "HATE_ABUSE" | "THREAT" | "RESTRICTED_CONFIDENTIAL";
const message = "This entry appears to contain sensitive or inappropriate information that should not be stored in Innovation Hub. Remove the restricted content and try again.";
export class ContentBlockedError extends Error {
  constructor(public readonly categories: ContentCategory[]) { super(message); }
}
type Audit = { userId: string; action: string; route: string; emit: (event: object) => void };
const context = new AsyncLocalStorage<Audit>();
const rules: [ContentCategory, RegExp][] = [
  ["CREDENTIAL_SECRET", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/i],
  ["CREDENTIAL_SECRET", /\b(?:sk-(?:ant-|proj-)?[a-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|xox[baprs]-[a-z0-9-]{12,})\b/i],
  ["CREDENTIAL_SECRET", /\bBearer\s+[a-z0-9._~+/-]{8,}={0,2}/i],
  ["CREDENTIAL_SECRET", /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i],
  ["CREDENTIAL_SECRET", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ["CREDENTIAL_SECRET", /\b(?:password|passwd|pwd|api[_ -]?key|access[_ -]?token|auth[_ -]?token|client[_ -]?secret|secret[_ -]?key)\s*["']?\s*(?:[:=]\s*["']?|is\s+)[^\s"',;]{4,}/i],
  ["FINANCIAL_IDENTIFIER", /\b(?:bank\s*account|account\s*(?:number|no\.?|#)|(?:bank\s+)?routing\s*(?:number|no\.?|#)|bank\s+routing|routing\s*[:=]|iban)\s*[:=#-]?\s*(?:[A-Z]{2})?\d[\d -]{5,32}\b/i],
  ["PERSONAL_IDENTIFIER", /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b(?:ssn|social security(?: number)?)\s*[:=#]?\s*\d{9}\b/i],
  ["PERSONAL_IDENTIFIER", /\b(?:passport|driver'?s? licen[cs]e|government id|national id)\s*(?:number|no\.?|#)?\s*[:=]\s*[a-z0-9-]{5,}/i],
  ["HEALTH_PHI", /\b(?:[Pp]atient|[Mm]ember|[Ee]mployee)\s+(?:[A-Z][a-z]+\s+[A-Z][a-z]+|(?:id|#)\s*[:=]?\s*\d+)[\s\S]{0,100}\b(?:diagnos(?:ed|is)|HIV|cancer|diabetes|medication|pregnant|medical record)\b/],
  ["HEALTH_PHI", /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:has|was diagnosed with|is being treated for|takes)\s+(?:HIV|cancer|diabetes|insulin|antidepressants|bipolar|depression)\b/],
  ["SEXUAL_VULGAR_HARASSMENT", /\b(?:fuck(?:ing|ed|er|s)?|shit(?:ty|head|s)?|bullshit|cunt|motherfucker|cock(?:sucker)?|blowjob|porn(?:ography|ographic)?)\b/i],
  ["SEXUAL_VULGAR_HARASSMENT", /\b(?:have sex with me|send (?:me )?nudes|suck my|touch(?:ed|ing)? (?:my|her|his) (?:breasts|genitals|butt)|sexual favou?rs)\b/i],
  ["SEXUAL_VULGAR_HARASSMENT", /\b(?:[Mm]y (?:boss|manager|coworker)|[A-Z][a-z]+ [A-Z][a-z]+)\s+(?:sexually harassed|groped|molested)\s+(?:me|her|him)\b/],
  ["HATE_ABUSE", /\b(?:nigg(?:er|a)s?|faggots?|kikes?|spics?|retards?)\b/i],
  ["HATE_ABUSE", /\b(?:you (?:are|are a|are an)|that employee is (?:a|an))\s+(?:idiot|moron|worthless|stupid)\b/i],
  ["THREAT", /\b(?:I(?:'ll| will| am going to)|we(?:'ll| will)|going to)\s+(?:kill|shoot|stab|bomb|hurt)\s+(?:you|him|her|them|my|the|[A-Z][a-z]+)/i],
  ["THREAT", /\b(?:kill yourself|you deserve to die|bring a gun to (?:work|the office))\b/i],
  ["RESTRICTED_CONFIDENTIAL", /\b(?:[A-Z][a-z]+ [A-Z][a-z]+(?:'s)?|employee\s*(?:id|#)\s*\d+)\s+(?:salary|payroll|personal debt|account balance)\s*(?:is|:|=)\s*\$?\d/],
];
function luhn(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let total = 0;
  for (let i = digits.length - 1, n = 0; i >= 0; i--, n++) {
    let d = Number(digits[i]); if (n % 2) { d *= 2; if (d > 9) d -= 9; } total += d;
  }
  return total % 10 === 0;
}
// Visit every string AND key, including private-state envelopes; never return matches.
export function inspectContent(value: unknown, trustedIdentifierPaths: readonly string[] = []): ContentCategory[] {
  const found = new Set<ContentCategory>();
  const seen = new Set<object>();
  function text(raw: string, skipCard = false) {
    const s = raw.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
    for (const [category, rule] of rules) if (rule.test(s)) found.add(category);
    if (!skipCard) for (const match of s.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g))
      if (luhn(match[0])) found.add("FINANCIAL_IDENTIFIER");
  }
  const credentialKey = /^(?:password|passwd|pwd|apiKey|accessToken|authToken|clientSecret|secretKey|token|secret)$/i;
  function visit(v: unknown, depth: number, path: string, credential = false) {
    if (typeof v === "string" || typeof v === "number") {
      const scalar = String(v);
      if (credential && scalar.trim()) found.add("CREDENTIAL_SECRET");
      text(scalar, trustedIdentifierPaths.includes(path) && /^\d{1,30}$/.test(scalar));
      return;
    }
    if (!v || typeof v !== "object" || v instanceof Date) return;
    if (depth > 40 || seen.has(v)) { found.add("RESTRICTED_CONFIDENTIAL"); return; }
    seen.add(v);
    for (const [key, item] of Object.entries(v)) {
      text(key);
      const childPath = path ? `${path}.${key}` : key;
      const skipCard = trustedIdentifierPaths.includes(childPath) && typeof item === "string" && /^\d{1,30}$/.test(item);
      if (typeof item === "string" || typeof item === "number") text(`${key}: ${item}`, skipCard);
      const normalizedKey = key.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF_\s-]/g, "");
      visit(item, depth + 1, childPath, credential || credentialKey.test(normalizedKey));
    }
    seen.delete(v);
  }
  visit(value, 0, "");
  return [...found];
}
export function assertSafeContent(value: unknown, action?: string, trustedIdentifierPaths: readonly string[] = []): void {
  const categories = inspectContent(value, trustedIdentifierPaths);
  if (!categories.length) return;
  const audit = context.getStore();
  if (audit) audit.emit({ userId: audit.userId, timestamp: new Date().toISOString(),
    action: action ?? audit.action, route: audit.route, categories, blocked: true, ruleVersion: CONTENT_POLICY_VERSION });
  throw new ContentBlockedError(categories);
}
export function blockedResponse(error: ContentBlockedError) {
  return { code: "CONTENT_BLOCKED", error: message + (error.categories.includes("SEXUAL_VULGAR_HARASSMENT")
    ? " Describe workplace issues professionally without explicit or identifying details. Use the appropriate Matrix HR or management reporting process for personal allegations." : ""),
  categories: error.categories, ruleVersion: CONTENT_POLICY_VERSION };
}
export const contentSafetyBoundary: RequestHandler = (req, res, next) => {
  const userId = (req as AuthenticatedRequest).matrixIdentity?.sub;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  // Fixed workflow labels, never user-controlled URLs/keys or field paths in audit.
  const area = req.path.startsWith("/interview") ? "interview" : req.path.startsWith("/jira") ? "jira"
    : req.path.startsWith("/initiative-brief") ? "export" : "initiative";
  context.run({ userId, action: req.method, route: area,
    emit: event => req.log?.warn(event, "Content policy blocked") }, () => {
    try { assertSafeContent(req.body); assertSafeContent(req.query); next(); } catch (error) { next(error); }
  });
};
export const contentSafetyErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof ContentBlockedError)) { next(error); return; }
  res.status(422).json(blockedResponse(error));
};