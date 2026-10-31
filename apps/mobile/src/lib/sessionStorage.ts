import { Platform } from "react-native";
import type { Role } from "@fitbud/contracts";

const TOKEN_KEY = "fitbud.accessToken";
const ROLE_KEY = "fitbud.selectedRole";
const REFRESH_TOKEN_KEY = "fitbud.refreshToken";
/** Epoch milliseconds when the access token expires. */
const EXPIRES_AT_KEY = "fitbud.accessTokenExpiresAt";

type SessionRole = Extract<Role, "trainee" | "trainer">;

function webStorage(): Storage | null {
  if (Platform.OS !== "web") return null;
  if (typeof globalThis === "undefined") return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist trainee/trainer session across Expo web reloads. Native keeps
 * everything in memory (D-W2-13), so this returns nulls there.
 */
export function loadPersistedSession(): {
  accessToken: string | null;
  selectedRole: SessionRole | null;
  refreshToken: string | null;
  expiresAt: number | null;
} {
  const storage = webStorage();
  if (!storage) {
    return { accessToken: null, selectedRole: null, refreshToken: null, expiresAt: null };
  }
  const accessToken = storage.getItem(TOKEN_KEY);
  const roleRaw = storage.getItem(ROLE_KEY);
  const selectedRole: SessionRole | null =
    roleRaw === "trainee" || roleRaw === "trainer" ? roleRaw : null;
  const refreshToken = storage.getItem(REFRESH_TOKEN_KEY);
  const expiresRaw = storage.getItem(EXPIRES_AT_KEY);
  const expiresNumber = expiresRaw ? Number(expiresRaw) : NaN;
  const expiresAt = Number.isFinite(expiresNumber) ? expiresNumber : null;
  return { accessToken, selectedRole, refreshToken, expiresAt };
}

/**
 * Web only: keep the refresh token and expiry next to `fitbud.accessToken`.
 * Pass nulls to remove them (test mode, sign-out). No-op on native.
 */
export function persistRefreshState(input: {
  refreshToken: string | null;
  expiresAt: number | null;
}): void {
  const storage = webStorage();
  if (!storage) return;
  if (input.refreshToken && input.expiresAt !== null) {
    storage.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
    storage.setItem(EXPIRES_AT_KEY, String(input.expiresAt));
  } else {
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(EXPIRES_AT_KEY);
  }
}

export function persistSession(input: {
  accessToken: string | null;
  selectedRole: Role | null;
}): void {
  const storage = webStorage();
  if (!storage) return;
  if (input.accessToken) storage.setItem(TOKEN_KEY, input.accessToken);
  else storage.removeItem(TOKEN_KEY);
  if (
    input.selectedRole === "trainee" ||
    input.selectedRole === "trainer"
  ) {
    storage.setItem(ROLE_KEY, input.selectedRole);
  } else {
    storage.removeItem(ROLE_KEY);
  }
}

export function clearPersistedSession(): void {
  persistSession({ accessToken: null, selectedRole: null });
  persistRefreshState({ refreshToken: null, expiresAt: null });
}
