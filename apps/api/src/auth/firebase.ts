/**
 * Firebase identity verification.
 *
 * AUTH_MODE=test (local / unit tests) accepts structured unsigned tokens:
 *   test.<base64url({ "uid": "...", "email"?: "..." })>
 *
 * AUTH_MODE=firebase verifies a real Firebase ID token: RS256 only, signed by a
 * key in Google's securetoken JWKS, `iss` and `aud` bound to FIREBASE_PROJECT_ID,
 * `exp` / `iat` / `auth_time` checked with at most 60 s clock skew, non-empty
 * `sub`. Any failure returns null; token contents are never logged.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_SECONDS = 60;

let remoteJwks: JWTVerifyGetKey | null = null;
let jwksOverride: JWTVerifyGetKey | null = null;

function firebaseJwks(): JWTVerifyGetKey {
  if (jwksOverride) {
    return jwksOverride;
  }
  remoteJwks ??= createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return remoteJwks;
}

/** Tests only: verify against a local key set instead of Google's JWKS. Pass null to reset. */
export function setFirebaseJwksForTests(jwks: JWTVerifyGetKey | null): void {
  jwksOverride = jwks;
}

export type VerifiedFirebaseIdentity = {
  uid: string;
  email?: string;
};

export async function verifyFirebaseIdToken(
  idToken: string,
  options: { projectId: string; authMode: "test" | "firebase" },
): Promise<VerifiedFirebaseIdentity | null> {
  if (options.authMode === "test") {
    return verifyTestToken(idToken);
  }

  return verifyRealIdToken(idToken, options.projectId);
}

async function verifyRealIdToken(
  idToken: string,
  projectId: string,
): Promise<VerifiedFirebaseIdentity | null> {
  if (!projectId) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(idToken, firebaseJwks(), {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: CLOCK_SKEW_SECONDS,
      requiredClaims: ["exp", "iat", "sub", "auth_time"],
    });

    const now = Math.floor(Date.now() / 1000);
    const authTime = payload.auth_time;
    if (typeof payload.iat !== "number" || payload.iat > now + CLOCK_SKEW_SECONDS) {
      return null;
    }
    if (typeof authTime !== "number" || authTime > now + CLOCK_SKEW_SECONDS) {
      return null;
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }

    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}

function verifyTestToken(idToken: string): VerifiedFirebaseIdentity | null {
  if (!idToken.startsWith("test.")) {
    return null;
  }

  try {
    const payloadPart = idToken.slice("test.".length);
    const json = new TextDecoder().decode(base64UrlToBytes(payloadPart));
    const payload = JSON.parse(json) as { uid?: unknown; email?: unknown };
    if (typeof payload.uid !== "string" || payload.uid.length === 0) {
      return null;
    }
    return {
      uid: payload.uid,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}

/** Build a test identity token for unit/auth tests. */
export function createTestIdToken(uid: string, email?: string): string {
  const payload = JSON.stringify({ uid, ...(email ? { email } : {}) });
  return `test.${bytesToBase64Url(new TextEncoder().encode(payload))}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
