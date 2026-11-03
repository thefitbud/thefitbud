import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse, Role } from "@fitbud/contracts";
import type { SessionRefresh } from "../lib/api";

/**
 * Native startup restore (AB3, D-W3-11). Pure: every effect is a dependency, so
 * the rules can be tested in node.
 *
 * - A definitive refusal (400/401/403 from `/auth/refresh`, or 401 from `/me`)
 *   signs the user out and clears storage.
 * - Anything else (no network, timeout, 429, 5xx, unreadable storage) leaves
 *   storage untouched and reports `offline`, so the caller offers Retry.
 *   A user is never signed out because the network was down.
 */

export const SIGNED_OUT_MESSAGE = "You've been signed out. Please sign in again.";
export const OFFLINE_MESSAGE = "Can't reach FitBud. Check your connection.";

export type RestoreStored = {
  refreshToken: string | null;
  /** AUTH_MODE=test only: the short test token (there is no refresh token). */
  testToken: string | null;
  selectedRole: Extract<Role, "trainee" | "trainer"> | null;
};

export type RestoreDeps = {
  load: () => Promise<RestoreStored>;
  /** `POST /auth/refresh`. */
  refreshAuth: (refreshToken: string) => Promise<{
    token: string;
    refreshToken: string;
    expiresIn: number;
  }>;
  /** Hand the tokens to the token session; it persists the rotated refresh token. */
  adoptTokens: (token: string, refresh?: SessionRefresh) => void;
  fetchMe: () => Promise<MeResponse>;
  /** Clear memory and storage (the caller's sign-out path). */
  clearSession: () => void;
};

export type RestoreResult =
  | { status: "signed_out"; reason: "nothing_stored" | "refused" }
  | { status: "offline" }
  | { status: "signed_in"; me: MeResponse; preferredRole: Role | null };

/** The server said no: the session is gone for good. */
export function isDefinitiveRefusal(error: unknown, statuses: readonly number[]): boolean {
  return error instanceof ApiClientError && statuses.includes(error.status);
}

export async function restoreSession(deps: RestoreDeps): Promise<RestoreResult> {
  let stored: RestoreStored;
  try {
    stored = await deps.load();
  } catch {
    // The keystore can fail to answer (for example while the device is still
    // starting). That says nothing about the session.
    return { status: "offline" };
  }
  if (!stored.refreshToken && !stored.testToken) {
    return { status: "signed_out", reason: "nothing_stored" };
  }

  if (stored.refreshToken) {
    try {
      const fresh = await deps.refreshAuth(stored.refreshToken);
      deps.adoptTokens(fresh.token, {
        refreshToken: fresh.refreshToken,
        expiresIn: fresh.expiresIn,
      });
    } catch (error) {
      if (isDefinitiveRefusal(error, [400, 401, 403])) {
        deps.clearSession();
        return { status: "signed_out", reason: "refused" };
      }
      return { status: "offline" };
    }
  } else if (stored.testToken) {
    deps.adoptTokens(stored.testToken);
  }

  try {
    const me = await deps.fetchMe();
    return { status: "signed_in", me, preferredRole: stored.selectedRole };
  } catch (error) {
    if (isDefinitiveRefusal(error, [401])) {
      deps.clearSession();
      return { status: "signed_out", reason: "refused" };
    }
    return { status: "offline" };
  }
}
