import { createTestIdToken } from "./firebase.js";
import { exchangeCustomToken } from "./token-exchange.js";
import type { Env } from "../types.js";

export type AuthTokenResult =
  | { token: string; tokenKind: "test_id_token" }
  | {
      token: string;
      tokenKind: "firebase_id_token";
      refreshToken: string;
      expiresIn: number;
    }
  | { error: "AUTH_PROVIDER_NOT_CONFIGURED" | "AUTH_EXCHANGE_FAILED" };

export type MintedAuthToken = Exclude<AuthTokenResult, { error: string }>;
export type AuthTokenError = Extract<AuthTokenResult, { error: string }>["error"];

/** Response fields for a minted token; test tokens keep the `{ token, tokenKind }` shape. */
export function sessionTokenFields(token: MintedAuthToken) {
  return token.tokenKind === "firebase_id_token"
    ? {
        token: token.token,
        tokenKind: token.tokenKind,
        refreshToken: token.refreshToken,
        expiresIn: token.expiresIn,
      }
    : { token: token.token, tokenKind: token.tokenKind };
}

/** HTTP status for a mint failure: Google refusing the exchange is 401, missing config is 503. */
export function authTokenErrorStatus(error: AuthTokenError): 401 | 503 {
  return error === "AUTH_EXCHANGE_FAILED" ? 401 : 503;
}

/**
 * Test mode returns the unsigned test token. Firebase mode signs a custom token
 * with the service account and exchanges it server-side for an ID token, so the
 * client receives a bearer the API can verify (AU1) plus a refresh token.
 */

export async function mintAuthToken(
  env: Env,
  input: { firebaseUid: string; email?: string },
): Promise<AuthTokenResult> {
  const mode = env.AUTH_MODE === "firebase" ? "firebase" : "test";
  if (mode === "test") {
    return {
      token: createTestIdToken(input.firebaseUid, input.email),
      tokenKind: "test_id_token",
    };
  }
  const json = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const apiKey = env.FIREBASE_WEB_API_KEY;
  if (!json || !apiKey) {
    return { error: "AUTH_PROVIDER_NOT_CONFIGURED" };
  }
  const customToken = await signCustomToken(json, input);
  if (!customToken) {
    return { error: "AUTH_PROVIDER_NOT_CONFIGURED" };
  }
  const exchanged = await exchangeCustomToken(apiKey, customToken);
  if (!exchanged.ok) {
    return { error: "AUTH_EXCHANGE_FAILED" };
  }
  return {
    token: exchanged.idToken,
    tokenKind: "firebase_id_token",
    refreshToken: exchanged.refreshToken,
    expiresIn: exchanged.expiresIn,
  };
}

async function signCustomToken(
  json: string,
  input: { firebaseUid: string; email?: string },
): Promise<string | null> {
  try {
    const serviceAccount = JSON.parse(json) as {
      client_email: string;
      private_key: string;
    };
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      uid: input.firebaseUid,
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: now,
      exp: now + 3600,
      claims: input.email ? { email: input.email } : {},
    };
    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(serviceAccount.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
  } catch {
    return null;
  }
}

function base64Url(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
