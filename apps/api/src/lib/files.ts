import { sha256Hex } from "./crypto";

const DEFAULT_TEST_SIGNING_SECRET = "fitbud-local-file-signing-secret";

export function fileSigningSecret(envSecret: string | undefined): string {
  return envSecret && envSecret.length > 0
    ? envSecret
    : DEFAULT_TEST_SIGNING_SECRET;
}

export async function signFileAccessToken(input: {
  mediaAssetId: string;
  expiresAtUnix: number;
  secret: string;
}): Promise<string> {
  return sha256Hex(
    `${input.mediaAssetId}:${input.expiresAtUnix}:${input.secret}`,
  );
}

export async function verifyFileAccessToken(input: {
  mediaAssetId: string;
  expiresAtUnix: number;
  token: string;
  secret: string;
}): Promise<boolean> {
  if (input.expiresAtUnix * 1000 < Date.now()) return false;
  const expected = await signFileAccessToken({
    mediaAssetId: input.mediaAssetId,
    expiresAtUnix: input.expiresAtUnix,
    secret: input.secret,
  });
  return expected === input.token;
}

export function buildObjectKey(input: {
  coachingRelationshipId: string;
  mediaAssetId: string;
  mediaType: string;
}): string {
  // Internal storage only — never used as an authorization credential.
  return `relationships/${input.coachingRelationshipId}/${input.mediaType}/${input.mediaAssetId}`;
}

export const UPLOAD_TARGET_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_TARGET_TTL_MS = 5 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 10_000_000;
