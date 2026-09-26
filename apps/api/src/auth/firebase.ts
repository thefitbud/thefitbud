/**
 * Firebase identity verification.
 *
 * Local / unit tests use AUTH_MODE=test with structured unsigned tokens:
 *   test.<base64url({ "uid": "...", "email"?: "..." })>
 *
 * Production mode (AUTH_MODE=firebase) is not wired in Phase A — stop before
 * introducing production credentials. Emulator verification can be added later.
 */

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

  // Phase A: production Firebase Admin verification is intentionally not enabled.
  // Callers must use AUTH_MODE=test for local work.
  void options.projectId;
  return null;
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
