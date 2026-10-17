import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";
import { apiClient } from "./api";
import { clearSession, storeSession } from "./session";
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

export async function establishTrainerSession(
  idToken: string,
  emailHint: string,
): Promise<MeResponse> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  await apiClient.createWebSession({ idToken, timezone });
  storeSession(idToken, emailHint.trim().toLowerCase());
  const profile = await apiClient.me();
  if (!profile.permittedRoles.includes("trainer")) {
    clearSession();
    throw new AuthFlowError(
      "role",
      "This account is set up as a client. Open the FitBud app on your phone.",
    );
  }
  if (profile.selectedRole && profile.selectedRole !== "trainer") {
    clearSession();
    throw new AuthFlowError(
      "role",
      "This account is set up as a client. Open the FitBud app on your phone.",
    );
  }
  return profile;
}

export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<MeResponse> {
  try {
    const { token } = await stage1Api.login({ identifier, password });
    const emailHint = identifier.includes("@")
      ? identifier
      : `${identifier}@fitbud.local`;
    return await establishTrainerSession(token, emailHint);
  } catch (err) {
    if (err instanceof AuthFlowError) throw err;
    throw mapLoginError(err);
  }
}

export async function signInWithOtpToken(
  token: string,
  identifier: string,
): Promise<MeResponse> {
  try {
    return await establishTrainerSession(token, identifier);
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
    const data = (await res.json()) as {
      items?: Array<{ subject?: string }>;
    };
    const subject = data.items?.[0]?.subject ?? "";
    const match = /(\d{6})/.exec(subject);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
