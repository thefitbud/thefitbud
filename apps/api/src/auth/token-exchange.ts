/**
 * Server-side Firebase token exchange (D-W1-2 option A): clients never load the
 * Firebase SDK. A custom token minted by the API is exchanged for an ID token +
 * refresh token through the Identity Toolkit REST API, and refresh tokens are
 * redeemed through the Secure Token API. Both use the public web API key.
 *
 * Failures collapse to `{ ok: false }`: Google's response bodies, the tokens and
 * the key are never logged or surfaced.
 */

const SIGN_IN_WITH_CUSTOM_TOKEN_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
const SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

export type FirebaseSessionTokens = {
  idToken: string;
  refreshToken: string;
  /** Seconds until the ID token expires. */
  expiresIn: number;
};

export type TokenExchangeResult =
  | ({ ok: true } & FirebaseSessionTokens)
  | { ok: false };

export async function exchangeCustomToken(
  apiKey: string,
  customToken: string,
): Promise<TokenExchangeResult> {
  const body = await postToGoogle(
    `${SIGN_IN_WITH_CUSTOM_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  return toSessionTokens(body?.idToken, body?.refreshToken, body?.expiresIn);
}

export async function refreshIdToken(
  apiKey: string,
  refreshToken: string,
): Promise<TokenExchangeResult> {
  const body = await postToGoogle(
    `${SECURE_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    },
  );
  return toSessionTokens(body?.id_token, body?.refresh_token, body?.expires_in);
}

async function postToGoogle(
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { method: "POST", ...init });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    return body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toSessionTokens(
  idToken: unknown,
  refreshToken: unknown,
  expiresIn: unknown,
): TokenExchangeResult {
  const seconds = typeof expiresIn === "string" ? Number(expiresIn) : NaN;
  if (
    typeof idToken !== "string" ||
    idToken.length === 0 ||
    typeof refreshToken !== "string" ||
    refreshToken.length === 0 ||
    !Number.isInteger(seconds) ||
    seconds <= 0
  ) {
    return { ok: false };
  }
  return { ok: true, idToken, refreshToken, expiresIn: seconds };
}
