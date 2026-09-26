/** Local AUTH_MODE=test identity token: `test.<base64url({ uid, email? })>`. */

export function createTestIdToken(uid: string, email?: string): string {
  const payload = JSON.stringify({ uid, ...(email ? { email } : {}) });
  return `test.${bytesToBase64Url(new TextEncoder().encode(payload))}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
