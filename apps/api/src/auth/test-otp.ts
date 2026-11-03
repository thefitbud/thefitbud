import type { Env } from "../types.js";

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
 * `Env` plus the two optional QA secrets. Declared here rather than in
 * `apps/api/src/types.ts`, which W4's BT2 owns (D-QA1-3 note in the batch file).
 */
export type TestOtpEnv = Env & {
  /** `"on"` on staging only. Any other value, or unset, keeps the normal path. */
  QA_TEST_OTP_ENABLED?: string;
  /** The 6-digit fixed code. Never logged, never written to the repo. */
  QA_TEST_OTP_CODE?: string;
};

/**
 * Allowlist (D-QA1-2): the identifier, after `normalizeIdentifier`, must be
 * exactly a `qa+<tag>@thefitbud.com` address. Mobile numbers never match, no
 * other domain matches, and plain `qa@thefitbud.com` does not match. Firoz's
 * real-email staging accounts are therefore never allowlisted.
 */
export const TEST_OTP_IDENTIFIER_RE = /^qa\+[a-z0-9-]{1,32}@thefitbud\.com$/;

/** The fixed code must be exactly six digits, or the switch stays inactive. */
const TEST_OTP_CODE_RE = /^\d{6}$/;

/** OTP purposes `/auth/otp/start` accepts; only `login` can use the fixed code. */
type OtpPurpose = "login" | "reset" | "invite";

/**
 * The configured fixed code, or `null` when it is absent or not six digits.
 * Does not look at the environment or the identifier — see `isTestOtpActive`.
 */
export function testOtpCode(env: TestOtpEnv): string | null {
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
  env: TestOtpEnv,
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
