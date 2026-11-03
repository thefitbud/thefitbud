import { ApiClientError } from "@fitbud/api-client";
import {
  classifyAuthError,
  mismatchedResponseCopy,
  type AuthErrorContext,
} from "../../lib/authErrors";
import { reportError } from "../../lib/reportError";

/**
 * Honest failures for the password-reset screen (D-W3-12, D-W3-18).
 * A catch never blames a cause it did not check: fixed text only for an API
 * code that proves it (OTP_INVALID, OTP_EXPIRED, RESET_PROOF_INVALID, 429);
 * everything else shows a short AUTH-* code and goes through `reportError`.
 * Classification lives in `authErrors.ts`; this file only adds the one
 * non-enumeration case and the reporting rule.
 */

/** Deliberate non-enumeration copy; true only for a 2xx or a not-found answer. */
export const RESET_SENT_COPY = "If an account exists, we've sent a code.";

function failureCopy(err: unknown, context: AuthErrorContext, where: string): string {
  const failure = classifyAuthError(err, context);
  // A null code is a failure the API proved (wrong code, expired reset): the
  // user's situation, not a fault worth reporting. Everything else is reported.
  if (failure.code !== null) reportError(where, err);
  return failure.copy;
}

/** `startOtp` (purpose reset) failed. */
export function resetSendError(err: unknown): string {
  // The API's own not-found-style answer keeps the non-enumeration copy.
  // A network error, 5xx or ZodError must not: that would be a second lie.
  if (err instanceof ApiClientError && err.status === 404) return RESET_SENT_COPY;
  return failureCopy(err, "reset-send", "passwordReset.send");
}

/** `verifyOtp` (purpose reset) failed. */
export function resetVerifyError(err: unknown): string {
  return failureCopy(err, "reset-verify", "passwordReset.verify");
}

/** `verifyOtp` answered 200 with a purpose other than reset. */
export function resetVerifyMismatchCopy(): string {
  return mismatchedResponseCopy("passwordReset.verifyMismatch");
}

/** `resetPassword` failed. */
export function resetSetError(err: unknown): string {
  return failureCopy(err, "reset-set", "passwordReset.set");
}
