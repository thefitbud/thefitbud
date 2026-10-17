async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function issuePurposeProof(
  secret: string,
  input: { otpId: string; identifierHash: string; purpose: "reset" | "invite" },
): Promise<string> {
  const expiresAt = Date.now() + 10 * 60_000;
  const message = `${input.purpose}:${input.otpId}:${input.identifierHash}:${expiresAt}`;
  const sig = await hmacHex(secret, message);
  return `${message}:${sig}`;
}

export async function verifyPurposeProof(
  secret: string,
  proof: string,
  purpose: "reset" | "invite",
): Promise<{ otpId: string; identifierHash: string } | null> {
  const parts = proof.split(":");
  if (parts.length !== 5) {
    return null;
  }
  const [proofPurpose, otpId, identifierHash, expiresRaw, sig] = parts;
  if (proofPurpose !== purpose || !otpId || !identifierHash || !sig) {
    return null;
  }
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }
  const message = `${proofPurpose}:${otpId}:${identifierHash}:${expiresRaw}`;
  const expected = await hmacHex(secret, message);
  if (expected !== sig) {
    return null;
  }
  return { otpId, identifierHash };
}
