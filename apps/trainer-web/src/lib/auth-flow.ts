import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";
import { apiClient, cancelTokenRefresh, scheduleTokenRefresh } from "./api";
import {
  clearSession,
  pickSessionRefresh,
  storeSession,
  type SessionRefresh,
} from "./session";
import { stage1Api } from "./stage1-api";

export class AuthFlowError extends Error {
  readonly code:
    | "credentials"
    | "locked"
    | "network"
    | "role"
    | "generic";

  constructor(
    code: AuthFlowError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function mapLoginError(err: unknown): AuthFlowError {
  if (err instanceof TypeError) {
    return new AuthFlowError(
      "network",
      "Can't reach FitBud. Check your connection and try again.",
    );
  }
  if (err instanceof ApiClientError) {
    if (err.status === 429) {
      return new AuthFlowError(
        "locked",
        "Too many tries. Wait 15 minutes or sign in with a code.",
      );
    }
    if (
      err.status === 403 ||
      err.code === "FORBIDDEN_ROLE" ||
      /trainer role|set up as a client/i.test(err.message)
    ) {
      return new AuthFlowError(
        "role",
        "This account is set up as a client. Open the FitBud app on your phone.",
      );
    }
    if (err.status === 401) {
      return new AuthFlowError(
        "credentials",
        "That mobile number or email and password don't match.",
      );
    }
    return new AuthFlowError("generic", err.message);
  }
  return new AuthFlowError("generic", "Something went wrong. Try again.");
}

function isForbiddenRole(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    (err.status === 403 ||
      err.code === "FORBIDDEN_ROLE" ||
      /trainer role|set up as a client/i.test(err.message))
  );
}

/**
 * Store the bearer token (plus refresh token and expiry in Firebase mode) and
 * load `/me`. Cookie session is best-effort —
 * trainee-only accounts are rejected by POST /auth/session but must still
 * keep a client session so RequireAuth can show the trainee gate on any route.
 */
export async function establishTrainerSession(
  idToken: string,
  emailHint: string,
  refresh?: SessionRefresh,
): Promise<MeResponse> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  storeSession(idToken, emailHint.trim().toLowerCase(), refresh);
  scheduleTokenRefresh();
  try {
    await apiClient.createWebSession({ idToken, timezone });
  } catch (err) {
    if (!isForbiddenRole(err)) {
      cancelTokenRefresh();
      clearSession();
      throw mapLoginError(err);
    }
  }
  try {
    return await apiClient.me();
  } catch (err) {
    cancelTokenRefresh();
    clearSession();
    throw mapLoginError(err);
  }
}

export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<MeResponse> {
  try {
    const result = await stage1Api.login({ identifier, password });
    const emailHint = identifier.includes("@")
      ? identifier
      : `${identifier}@fitbud.local`;
    return await establishTrainerSession(
      result.token,
      emailHint,
      pickSessionRefresh(result),
    );
  } catch (err) {
    if (err instanceof AuthFlowError) throw err;
    throw mapLoginError(err);
  }
}

export async function signInWithOtpToken(
  token: string,
  identifier: string,
  refresh?: SessionRefresh,
): Promise<MeResponse> {
  try {
    return await establishTrainerSession(token, identifier, refresh);
  } catch (err) {
    if (err instanceof AuthFlowError) throw err;
    throw mapLoginError(err);
  }
}

export async function fetchDevMailCode(to: string): Promise<string | null> {
  const base =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";
  const url = `${base}/dev/mail?to=${encodeURIComponent(to)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      data?: { items?: Array<{ subject?: string; textBody?: string }> };
      items?: Array<{ subject?: string; textBody?: string }>;
    };
    const items = raw.data?.items ?? raw.items ?? [];
    const newest = items[0];
    const haystack = `${newest?.subject ?? ""} ${newest?.textBody ?? ""}`;
    return /(\d{6})/.exec(haystack)?.[1] ?? null;
  } catch {
    return null;
  }
}
