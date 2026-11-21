/**
 * D1 refuses every query while a `wrangler d1 execute --remote --file` import
 * runs on the same database, with "D1_ERROR: Currently processing a
 * long-running import". The nightly QA seed (.github/workflows/qa.yml,
 * `seed-<suite>`) runs four such imports into `fitbud-staging`, and Sentry
 * issues FITBUD-API-J/K/M/N/R (13-17 Nov 2026) each fell inside one.
 *
 * The refusal is transient and the query never ran, so the API answers 503
 * DATABASE_BUSY with Retry-After instead of a 500, a cron tick skips the job
 * (the next tick, 5 minutes later, picks it up), and Sentry files it as one
 * warning issue rather than an error per route.
 */

export const D1_IMPORT_BUSY_MESSAGE = "Currently processing a long-running import";

/** Seconds a client should wait before retrying. A QA seed import takes about a minute. */
export const D1_IMPORT_BUSY_RETRY_AFTER_SECONDS = 30;

/** True when the error, or any error in its `cause` chain, is D1's import-busy refusal. */
export function isD1ImportBusyError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current != null; depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && message.includes(D1_IMPORT_BUSY_MESSAGE)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** True when a Sentry exception value is the import-busy refusal. */
export function isD1ImportBusyText(value: unknown): boolean {
  return typeof value === "string" && value.includes(D1_IMPORT_BUSY_MESSAGE);
}
