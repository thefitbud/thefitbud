import { TEST_OTP_IDENTIFIER_RE } from "@fitbud/core";
import type { Env } from "../types.js";

export { TEST_OTP_IDENTIFIER_RE };

/**
 * Staging-only test-mode email OTP for the automated QA accounts (QT1, D-QA1-1).
 *
 * The nightly QA suites (Maestro, Playwright, API smoke) sign in unattended on
 * `api-staging.thefitbud.com`. Email OTP goes through ZeptoMail and nothing on a
 * CI runner can read the mailbox, so on **staging only** `/auth/otp/start` for an
 * allowlisted `qa+…@thefitbud.com` address stores a fixed code instead of a random
 * one and sends no email. Everything else about the OTP — rate limits, expiry,
 * attempts, the 5-attempt invalidation and single use on verify — is unchanged, so
 * the fixed code behaves exactly like a real one.
 *
 * Production must be impossible, in three layers:
 *   1. `isTestOtpActive` returns false unless `ENVIRONMENT === "staging"`;
 *   2. `runtimeMisconfigurations` makes a production Worker refuse every request
 *      when either secret is present (`apps/api/src/middleware/runtime-guard.ts`);
 *   3. tests for both layers (`auth-login.test-otp.test.ts`, `runtime-guard.test.ts`).
 *
 * The two settings are Worker **secrets** set on `fitbud-api-staging` only, never
 * `wrangler.toml` vars: the repository is public, so a code in the repo would let
 * anyone sign in to the QA accounts on staging.
 */

/**
 * Allowlist (D-QA1-2) lives in `@fitbud/core` (`TEST_OTP_IDENTIFIER_RE`) so
 * trainer-web does not import this module (D-W3b-9). Re-exported above for
 * API callers that already import it from here.
 */

/** The fixed code must be exactly six digits, or the switch stays inactive. */
const TEST_OTP_CODE_RE = /^\d{6}$/;

/** OTP purposes `/auth/otp/start` accepts; only `login` can use the fixed code. */
type OtpPurpose = "login" | "reset" | "invite";

/**
 * The configured fixed code, or `null` when it is absent or not six digits.
 * Does not look at the environment or the identifier — see `isTestOtpActive`.
 */
export function testOtpCode(env: Env): string | null {
  const code = env.QA_TEST_OTP_CODE;
  return code && TEST_OTP_CODE_RE.test(code) ? code : null;
}

/**
 * True only when every condition holds: staging, the flag is exactly `"on"`, the
 * code is six digits, the purpose is `login`, and the identifier is allowlisted.
 * Pure — no I/O. `identifier` must already be normalized (the lower-cased
 * `value` of `normalizeIdentifier`); a raw or upper-case string fails closed.
 */
export function isTestOtpActive(
  env: Env,
  identifier: string,
  purpose: OtpPurpose,
): boolean {
  if (env.ENVIRONMENT !== "staging") {
    return false;
  }
  if (env.QA_TEST_OTP_ENABLED !== "on") {
    return false;
  }
  if (testOtpCode(env) === null) {
    return false;
  }
  if (purpose !== "login") {
    return false;
  }
  return TEST_OTP_IDENTIFIER_RE.test(identifier);
}
