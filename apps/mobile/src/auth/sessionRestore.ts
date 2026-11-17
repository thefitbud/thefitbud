import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse, Role } from "@fitbud/contracts";
import type { SessionRefresh } from "../lib/api";
import type { MeSnapshot } from "./meSnapshot";

/**
 * Native startup restore (AB3, D-W3-11). Pure: every effect is a dependency, so
 * the rules can be tested in node.
 *
 * - A definitive refusal (400/401/403 from `/auth/refresh`, or 401 from `/me`)
 *   signs the user out and clears storage.
 * - Anything else (no network, timeout, 429, 5xx, unreadable storage) leaves
 *   storage untouched and reports `offline`, so the caller offers Retry.
 *   A user is never signed out because the network was down.
 * - Cold start with no network (Z12-41): an `offline` result carries the
 *   snapshot of this user's last `/me`, when there is one, so the app opens
 *   on cached data. The snapshot is asked for by the stored user id only.
 */

export const SIGNED_OUT_MESSAGE = "You've been signed out. Please sign in again.";
export const OFFLINE_MESSAGE = "Can't reach FitBud. Check your connection.";

export type RestoreStored = {
  refreshToken: string | null;
  /** AUTH_MODE=test only: the short test token (there is no refresh token). */
  testToken: string | null;
  selectedRole: Extract<Role, "trainee" | "trainer"> | null;
  /** The user the stored session belongs to, once `/me` has named them. */
  userId?: string | null;
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
  /** The stored snapshot for this user id, or null (`meSnapshot.ts`). */
  loadSnapshot?: (userId: string) => Promise<MeSnapshot | null>;
  /**
   * The refresh could not reach the server: give the token session the
   * stored refresh token, so it mints an ID token as soon as it can.
   */
  holdRefreshToken?: (refreshToken: string) => void;
};

export type RestoreResult =
  | { status: "signed_out"; reason: "nothing_stored" | "refused" }
  | {
      status: "offline";
      /** Null: nothing cached for this user, so the caller offers Retry. */
      snapshot: MeSnapshot | null;
      preferredRole: Role | null;
    }
  | { status: "signed_in"; me: MeResponse; preferredRole: Role | null };

/** The server said no: the session is gone for good. */
export function isDefinitiveRefusal(error: unknown, statuses: readonly number[]): boolean {
  return error instanceof ApiClientError && statuses.includes(error.status);
}

async function offlineResult(
  deps: RestoreDeps,
  stored: RestoreStored | null,
): Promise<RestoreResult> {
  let snapshot: MeSnapshot | null = null;
  if (stored?.userId && deps.loadSnapshot) {
    try {
      snapshot = await deps.loadSnapshot(stored.userId);
    } catch {
      // Unreadable storage is "no snapshot": the caller offers Retry.
      snapshot = null;
    }
  }
  return {
    status: "offline",
    snapshot,
    preferredRole: stored?.selectedRole ?? null,
  };
}

export async function restoreSession(deps: RestoreDeps): Promise<RestoreResult> {
  let stored: RestoreStored;
  try {
    stored = await deps.load();
  } catch {
    // The keystore can fail to answer (for example while the device is still
    // starting). That says nothing about the session.
    return offlineResult(deps, null);
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
      deps.holdRefreshToken?.(stored.refreshToken);
      return offlineResult(deps, stored);
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
    return offlineResult(deps, stored);
  }
}
