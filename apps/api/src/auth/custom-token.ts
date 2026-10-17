import { createTestIdToken } from "./firebase.js";
import type { Env } from "../types.js";

export type AuthTokenResult =
  | { token: string; tokenKind: "test_id_token" | "firebase_custom_token" }
  | { error: "AUTH_PROVIDER_NOT_CONFIGURED" };

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
  if (!json) {
    return { error: "AUTH_PROVIDER_NOT_CONFIGURED" };
  }
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
    const token = `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
    return { token, tokenKind: "firebase_custom_token" };
  } catch {
    return { error: "AUTH_PROVIDER_NOT_CONFIGURED" };
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
