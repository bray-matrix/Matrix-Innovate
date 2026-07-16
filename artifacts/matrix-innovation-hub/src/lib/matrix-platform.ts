// Matrix Platform Launch Guard (Matrix SDK v1.1 Trust Model).
// The platform delivers a short-lived launch token in the URL fragment:
//   https://<app-url>#matrix_token=<JWT>
// The token is read once, immediately scrubbed from the URL, kept only in
// memory, exchanged server-side for an HttpOnly session cookie, and never
// persisted in browser storage or logs.

export interface MatrixUser {
  sub: string;
  name: string | null;
  email: string | null;
}

let pendingLaunchToken: string | null = null;

// Called synchronously at application bootstrap, before first render.
export function captureLaunchToken(): void {
  const hash = window.location.hash;
  if (!hash || !hash.includes("matrix_token=")) return;

  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("matrix_token");
  if (token) {
    pendingLaunchToken = token;
  }
  params.delete("matrix_token");
  const remaining = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + (remaining ? `#${remaining}` : ""),
  );
}

export function takePendingLaunchToken(): string | null {
  const token = pendingLaunchToken;
  pendingLaunchToken = null;
  return token;
}

export const MATRIX_PLATFORM_URL = "https://matrix-platform.replit.app";

export async function exchangeLaunchToken(token: string): Promise<MatrixUser | null> {
  const res = await fetch("/matrix/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user ?? null;
}

export async function fetchSessionUser(): Promise<MatrixUser | null> {
  const res = await fetch("/matrix/session", { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user ?? null;
}

// Logs out locally and returns the Matrix Platform URL the browser should
// navigate back to (the platform's discovered logout endpoint when available).
export async function logoutSession(): Promise<string> {
  try {
    const res = await fetch("/matrix/logout", { method: "POST", credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.logoutUrl === "string" && data.logoutUrl) return data.logoutUrl;
      if (typeof data.platformUrl === "string" && data.platformUrl) return data.platformUrl;
    }
  } catch {
    // fall through to the default platform URL
  }
  return MATRIX_PLATFORM_URL;
}
