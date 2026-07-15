import { setAuthTokenGetter } from "@workspace/api-client-react";

// Matrix Platform launch compatibility (Matrix SDK v1).
// The platform launches the app with launch parameters; the app trusts the
// launch token (SDK doc 02 - Authentication, no separate login).

const TOKEN_KEY = "matrix.launchToken";
const USER_KEY = "matrix.launchUser";

export function initMatrixLaunchContext(): void {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("matrix_token");
  const user = params.get("matrix_user");

  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (user) sessionStorage.setItem(USER_KEY, user);

    params.delete("matrix_token");
    params.delete("matrix_user");
    const query = params.toString();
    const cleanUrl =
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
    window.history.replaceState(null, "", cleanUrl);
  }

  setAuthTokenGetter(() => sessionStorage.getItem(TOKEN_KEY));
}

export function getMatrixLaunchUser(): string | null {
  return sessionStorage.getItem(USER_KEY);
}

export function isMatrixLaunch(): boolean {
  return sessionStorage.getItem(TOKEN_KEY) !== null;
}
