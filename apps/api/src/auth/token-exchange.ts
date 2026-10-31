/**
 * Server-side Firebase token exchange (D-W1-2 option A): clients never load the
 * Firebase SDK. A custom token minted by the API is exchanged for an ID token +
 * refresh token through the Identity Toolkit REST API, and refresh tokens are
 * redeemed through the Secure Token API. Both use the public web API key.
 *
 * Failures carry a `reason` but never Google's response body, the tokens or the
 * key: `invalid` means Google rejected the credential (the caller should make
 * the user sign in again), `unavailable` means the call never got a verdict —
 * a network error, a 429 or a 5xx — and the credential may well still be good,
 * so the caller must not treat it as a sign-out.
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

/**
 * `invalid`: Google gave a verdict and refused the credential.
 * `unavailable`: no verdict — transport failure, upstream throttling or 5xx.
 */
export type TokenExchangeFailureReason = "invalid" | "unavailable";

export type TokenExchangeResult =
  | ({ ok: true } & FirebaseSessionTokens)
  | { ok: false; reason: TokenExchangeFailureReason };

export async function exchangeCustomToken(
  apiKey: string,
  customToken: string,
): Promise<TokenExchangeResult> {
  const response = await postToGoogle(
    `${SIGN_IN_WITH_CUSTOM_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!response.ok) return { ok: false, reason: response.reason };
  const body = response.body;
  return toSessionTokens(body.idToken, body.refreshToken, body.expiresIn);
}

export async function refreshIdToken(
  apiKey: string,
  refreshToken: string,
): Promise<TokenExchangeResult> {
  const response = await postToGoogle(
    `${SECURE_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    },
  );
  if (!response.ok) return { ok: false, reason: response.reason };
  const body = response.body;
  return toSessionTokens(body.id_token, body.refresh_token, body.expires_in);
}

type GoogleResponse =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: TokenExchangeFailureReason };

/**
 * A refused credential and an unreachable provider must not look the same: a
 * Google outage used to sign every signed-in user out (W2 follow-up). Only a
 * 4xx other than 429 counts as a verdict against the credential.
 */
async function postToGoogle(
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<GoogleResponse> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", ...init });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!response.ok) {
    // Only a 400 is a verdict against the credential. Firebase answers 400 for
    // an expired, revoked or malformed refresh token and for a disabled user;
    // a 403 is the canonical answer when the web API key is restricted, the
    // Identity Toolkit or Secure Token API is disabled for the project, or
    // quota is refused — all operator faults. The harm is asymmetric: calling
    // an outage `invalid` destroys every good session, while calling a refusal
    // `unavailable` only parks one session in retry until the user signs out.
    return { ok: false, reason: response.status === 400 ? "invalid" : "unavailable" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A 200 we cannot read is not a verdict on the credential.
    return { ok: false, reason: "unavailable" };
  }
  if (body === null || typeof body !== "object") {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, body: body as Record<string, unknown> };
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
    // Accepted but unusable: not the credential's fault.
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, idToken, refreshToken, expiresIn: seconds };
}
