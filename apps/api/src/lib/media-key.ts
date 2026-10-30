/**
 * R2 object key for a media asset's stored key. Keys stored in D1 are
 * environment-agnostic; the per-environment `MEDIA_PREFIX` var (staging:
 * `staging/` inside the shared non-prod bucket) is applied only here, at the
 * R2 call.
 *
 * `Env` (types.ts) does not declare `MEDIA_PREFIX` yet, so the env is read
 * structurally.
 */
export type MediaEnv = { MEDIA_PREFIX?: string };

export function mediaKey(env: object, storedKey: string): string {
  const prefix = (env as MediaEnv).MEDIA_PREFIX ?? "";
  if (storedKey.includes("..")) {
    throw new Error("Media object key must not contain '..'.");
  }
  if (prefix && storedKey.startsWith(prefix)) {
    throw new Error("Media object key is already prefixed.");
  }
  return prefix + storedKey;
}
