import { ApiClientError } from "@fitbud/api-client";

/**
 * Resolve can lose its success on the way back (the response never arrives,
 * the trainer retries with another outcome). The API then answers 409 with one
 * of these codes although the item is already resolved. The caller re-fetches
 * the exception and treats `resolved` as success; any other state keeps the
 * error. `IDEMPOTENCY_KEY_REUSE` is what the API sends today; the `_REUSED`
 * spelling is accepted too.
 */
const RESOLVE_CONFLICT_CODES = new Set([
  "INVALID_TRANSITION",
  "IDEMPOTENCY_KEY_REUSE",
  "IDEMPOTENCY_KEY_REUSED",
]);

export function isResolveConflict(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    err.status === 409 &&
    RESOLVE_CONFLICT_CODES.has(err.code)
  );
}

/** True when a re-fetch proves the item is resolved. A failed re-fetch is "no". */
export async function isAlreadyResolved(
  getException: (id: string) => Promise<{ status: string }>,
  exceptionId: string,
): Promise<boolean> {
  try {
    return (await getException(exceptionId)).status === "resolved";
  } catch {
    // The re-fetch is only a recovery probe; the original error is still shown.
    return false;
  }
}
