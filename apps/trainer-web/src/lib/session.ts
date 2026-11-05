const TOKEN_KEY = "fitbud.trainer.accessToken";
const EMAIL_KEY = "fitbud.trainer.email";
const REFRESH_TOKEN_KEY = "fitbud.trainer.refreshToken";
/** Epoch milliseconds when the access token expires. */
const EXPIRES_AT_KEY = "fitbud.trainer.accessTokenExpiresAt";

/** `refreshToken` and `expiresIn` (seconds) from a `firebase_id_token` response. */
export type SessionRefresh = { refreshToken: string; expiresIn: number };

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getStoredAccessToken(): string | null {
  return read(TOKEN_KEY);
}

export function getStoredEmail(): string | null {
  return read(EMAIL_KEY);
}

export function getStoredRefreshToken(): string | null {
  return read(REFRESH_TOKEN_KEY);
}

/** Epoch ms when the stored access token expires, or null when unknown (test mode). */
export function getStoredExpiresAt(): number | null {
  const raw = read(EXPIRES_AT_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Pick `refreshToken` / `expiresIn` off an auth response, if present.
 * Test-mode responses carry neither and return undefined.
 */
export function pickSessionRefresh(response: object): SessionRefresh | undefined {
  const { refreshToken, expiresIn } = response as {
    refreshToken?: unknown;
    expiresIn?: unknown;
  };
  if (
    typeof refreshToken === "string" &&
    refreshToken.length > 0 &&
    typeof expiresIn === "number" &&
    expiresIn > 0
  ) {
    return { refreshToken, expiresIn };
  }
  return undefined;
}

function writeTokens(token: string, refresh: SessionRefresh | undefined, now: number): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  if (refresh) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh.refreshToken);
    sessionStorage.setItem(EXPIRES_AT_KEY, String(now + refresh.expiresIn * 1000));
  } else {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_AT_KEY);
  }
}

export function storeSession(
  token: string,
  email: string,
  refresh?: SessionRefresh,
  now: number = Date.now(),
): void {
  writeTokens(token, refresh, now);
  sessionStorage.setItem(EMAIL_KEY, email);
}

/** Replace the tokens after `/auth/refresh`; the email stays. */
export function storeRefreshedTokens(
  token: string,
  refresh: SessionRefresh,
  now: number = Date.now(),
): void {
  writeTokens(token, refresh, now);
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(EXPIRES_AT_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
}
