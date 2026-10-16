// Pure helpers for the post-creation "Next steps" experience.
// The ?created=1 marker is consumed once: the page shows expanded guidance,
// then removes only that parameter from the URL (preserving all others) so a
// reload or later visit shows the compact collapsed version.

export const CREATED_PARAM = "created";

export function hasCreatedMarker(search: string): boolean {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get(CREATED_PARAM) === "1";
}

/** Returns the search string ("" or "?a=b") with only the created marker removed. */
export function stripCreatedMarker(search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  params.delete(CREATED_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export type NextStepsMode = "expanded" | "compact";

/**
 * First visit right after creation (marker present and not already consumed
 * this session for this project) is expanded; everything else is compact.
 */
export function initialNextStepsMode(markerPresent: boolean, alreadyConsumed: boolean): NextStepsMode {
  return markerPresent && !alreadyConsumed ? "expanded" : "compact";
}

export function consumedKey(projectId: number): string {
  return `innovation-hub:next-steps-shown:${projectId}`;
}
