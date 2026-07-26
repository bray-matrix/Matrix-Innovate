// Gateway base-path support (MAS-001 Gateway-Compatible Applications).
// The inline bootstrap script in index.html detects whether the app is being
// served beneath a configured public prefix (e.g. /innovation via an upstream
// gateway) and records it on window.__BASE_PATH__ before any module runs.
// Standalone operation (no prefix) yields an empty string.

declare global {
  interface Window {
    __BASE_PATH__?: string;
  }
}

export function getBasePath(): string {
  return typeof window !== "undefined" ? (window.__BASE_PATH__ ?? "") : "";
}

// Prefix a root-relative path (e.g. "/api/initiatives") with the detected
// public base path so requests stay beneath the gateway prefix.
export function withBase(path: string): string {
  return `${getBasePath()}${path}`;
}
