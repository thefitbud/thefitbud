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

function failureCopy(err: unknown, context: AuthErrorContext, where: string): string {
  const failure = classifyAuthError(err, context);
  // A null code is a failure the API proved (wrong code, expired reset): the
  // user's situation, not a fault worth reporting. Everything else is reported.
  if (failure.code !== null) reportError(where, err);
  return failure.copy;
}

/** `startOtp` (purpose reset) failed. */
export function resetSendError(err: unknown): string {
  // The API answers 202 for every identifier (non-enumeration), so any failure
  // here is a real one: never claim a code was sent.
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
  // The API's own password-requirement text: curated, actionable, non-sensitive
  // and proved by its code. Without it a weak password would loop on AUTH-UNK.
  if (
    err instanceof ApiClientError &&
    (err.code === "PASSWORD_LENGTH" || err.code === "PASSWORD_BREACHED")
  ) {
    return err.message;
  }
  return failureCopy(err, "reset-set", "passwordReset.set");
}
