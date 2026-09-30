/** Only the structured CONTENT_BLOCKED envelope is safe to surface from a failed request.
 * Never display an arbitrary server error, response body, or rejected input here. */
export const BLOCKED_MESSAGE = "This entry appears to contain sensitive or inappropriate information that should not be stored in Innovation Hub. Remove the restricted content and try again.";

const CATEGORY_LABELS: Record<string, string> = {
  CREDENTIAL_SECRET: "Possible credential or secret detected.",
  CREDENTIAL: "Possible credential or secret detected.",
  SECRET: "Possible credential or secret detected.",
  FINANCIAL_IDENTIFIER: "Possible personal financial information detected.",
  PERSONAL_IDENTIFIER: "Possible personal identifier detected.",
  PII: "Possible personal identifier detected.",
  HEALTH_PHI: "Possible individual health information detected.",
  PHI: "Possible individual health information detected.",
  SEXUAL_VULGAR_HARASSMENT: "Inappropriate workplace content detected.",
  SEXUAL_CONTENT: "Inappropriate workplace content detected.",
  VULGAR_CONTENT: "Inappropriate workplace content detected.",
  HARASSMENT: "Inappropriate workplace content detected.",
  HATE_DISCRIMINATORY_ABUSIVE: "Inappropriate workplace content detected.",
  HATE: "Inappropriate workplace content detected.",
  HATE_ABUSE: "Inappropriate workplace content detected.",
  THREATENING_CONTENT: "Threatening content detected.",
  THREAT: "Threatening content detected.",
  OTHER_RESTRICTED_CONFIDENTIAL_DATA: "Restricted confidential information detected.",
  RESTRICTED_CONFIDENTIAL: "Restricted confidential information detected.",
};

export class ContentBlockedError extends Error {
  readonly code = "CONTENT_BLOCKED";
  constructor(readonly categories: string[]) {
    const labels = [...new Set(categories.map(category => CATEGORY_LABELS[category.toUpperCase().replace(/[\s/-]+/g, "_")]).filter(Boolean))];
    const hrGuidance = categories.includes("SEXUAL_VULGAR_HARASSMENT")
      ? " Describe workplace issues professionally without explicit or identifying details. Use the appropriate Matrix HR or management reporting process for personal allegations." : "";
    super(`${BLOCKED_MESSAGE}${labels.length ? ` ${labels.join(" ")}` : ""}${hrGuidance}`);
    this.name = "ContentBlockedError";
  }
}

function asBlocked(data: unknown): ContentBlockedError | null {
  if (!data || typeof data !== "object" || !("code" in data) || data.code !== "CONTENT_BLOCKED") return null;
  const categories = "categories" in data && Array.isArray(data.categories)
    ? data.categories.filter((category): category is string => typeof category === "string") : [];
  return new ContentBlockedError(categories);
}

export function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ContentBlockedError) return error.message;
  // Generated API mutations throw ApiError with the parsed response in .data.
  if (error && typeof error === "object" && "status" in error && error.status === 422 && "data" in error) {
    return asBlocked(error.data)?.message ?? fallback;
  }
  return fallback;
}

export async function checkedResponse(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  if (response.status === 422) {
    const data: unknown = await response.json().catch(() => null);
    const blocked = asBlocked(data);
    if (blocked) throw blocked;
  }
  throw new Error(fallback);
}

export function isContentBlocked(error: unknown): boolean {
  return error instanceof ContentBlockedError ||
    !!(error && typeof error === "object" && "status" in error && error.status === 422 &&
      "data" in error && asBlocked(error.data));
}