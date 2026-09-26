/**
 * Build AUTH_MODE=test bearer tokens: test.<base64url({ uid, email? })>.
 * Mirrors apps/api test double — never use production credentials.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triplet =
      (a << 16) |
      ((b === undefined ? 0 : b) << 8) |
      (c === undefined ? 0 : c);
    result += alphabet[(triplet >> 18) & 63];
    result += alphabet[(triplet >> 12) & 63];
    result += b === undefined ? "=" : alphabet[(triplet >> 6) & 63];
    result += c === undefined ? "=" : alphabet[triplet & 63];
  }
  return result.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createTestIdToken(uid: string, email?: string): string {
  const trimmedUid = uid.trim();
  if (!trimmedUid) {
    throw new Error("Firebase UID is required.");
  }
  const payload: { uid: string; email?: string } = { uid: trimmedUid };
  const trimmedEmail = email?.trim();
  if (trimmedEmail) {
    payload.email = trimmedEmail;
  }
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return `test.${bytesToBase64Url(bytes)}`;
}

export function isTestIdToken(token: string): boolean {
  return token.trim().startsWith("test.");
}
