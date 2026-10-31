import { ApiClientError, FitBudApiClient } from "@fitbud/api-client";
import {
  clearSession,
  getStoredAccessToken,
  getStoredExpiresAt,
  getStoredRefreshToken,
  storeRefreshedTokens,
} from "./session";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";

/** Refresh this long before the ID token expires. */
export const REFRESH_LEAD_MS = 60_000;
/** After a transient refresh failure (offline, 429, 5xx), try again after this long. */
export const REFRESH_RETRY_MS = 30_000;

/** Prefix a relative API path, including signed file download URLs. */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

let refreshInFlight: Promise<string | null> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let sessionExpiredListener: (() => void) | null = null;

/** AuthProvider registers here to drop to the sign-in page when refresh fails. */
export function setSessionExpiredListener(listener: (() => void) | null): void {
  sessionExpiredListener = listener;
}

export function cancelTokenRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Arm a timer that refreshes the ID token about 60 s before it expires.
 * No-op without a stored refresh token and expiry (test mode).
 */
export function scheduleTokenRefresh(now: number = Date.now()): void {
  cancelTokenRefresh();
  const expiresAt = getStoredExpiresAt();
  if (expiresAt === null || !getStoredRefreshToken()) return;
  const delay = Math.max(0, expiresAt - REFRESH_LEAD_MS - now);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshTrainerAccessToken();
  }, delay);
}

function retryLater(): void {
  cancelTokenRefresh();
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshTrainerAccessToken();
  }, REFRESH_RETRY_MS);
}

/** The API refused the refresh token: clear all three keys and sign out. */
function expireSession(): void {
  cancelTokenRefresh();
  clearSession();
  // Best effort: drop the cookie session too. Its 401 cannot loop because the
  // refresh token is already gone.
  void apiClient.endWebSession().catch(() => undefined);
  sessionExpiredListener?.();
}

/** 400/401/403 mean the refresh token was refused; anything else is transient. */
function isRefreshRefused(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    (err.status === 400 || err.status === 401 || err.status === 403)
  );
}

/**
 * Exchange the stored refresh token for a new ID token. One call at a time;
 * returns the new token, or null when there is no refresh token or the refresh
 * failed. Never logs the refresh token.
 */
export function refreshTrainerAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;
    try {
      const result = await apiClient.refreshAuth(refreshToken);
      // Signed out (or signed in again) while the call was in flight: drop the
      // result, and don't retry the old request under another session's token.
      if (getStoredRefreshToken() !== refreshToken) return null;
      storeRefreshedTokens(result.token, {
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
      scheduleTokenRefresh();
      return result.token;
    } catch (err) {
      if (getStoredRefreshToken() !== refreshToken) return null;
      if (isRefreshRefused(err)) {
        expireSession();
      } else {
        retryLater();
      }
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export const apiClient = new FitBudApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => getStoredAccessToken(),
  getSelectedRole: () => "trainer",
  refreshAccessToken: () => refreshTrainerAccessToken(),
});
