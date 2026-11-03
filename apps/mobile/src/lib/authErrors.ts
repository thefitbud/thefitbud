import { ApiClientError } from "@fitbud/api-client";
import { isZodError, reportError } from "./reportError";

/**
 * Honest auth failures (D-W3-12). A catch must not blame a cause it did not
 * check: every failure is classified here, known API codes get their own copy
 * and everything else shows a short code that matches the dev console line.
 *
 * `verifyCode` (the login code screen) is owned by `verifyCodeError.ts` and is
 * not routed through here.
 */

export type AuthErrorCode =
  | "AUTH-NET"
  | "AUTH-RATE"
  | "AUTH-SRV"
  | "AUTH-PARSE"
  | "AUTH-SESSION"
  | "AUTH-UNK";

/** Which call failed; decides the copy for the codes the API sends. */
export type AuthErrorContext =
  | "password-login"
  | "code-send"
  | "reset-send"
  | "reset-verify"
  | "reset-set"
  | "invite-send"
  | "invite-verify"
  | "invite-accept"
  | "general"
  | "session";

export type AuthFailure = { code: AuthErrorCode | null; copy: string };

export const PARSE_COPY = "Couldn't finish signing in (AUTH-PARSE). Try again.";
export const SESSION_COPY = "Couldn't finish signing in (AUTH-SESSION). Try again.";
export const NET_COPY =
  "Couldn't reach FitBud (AUTH-NET). Check your connection and try again.";
export const SRV_COPY =
  "FitBud had a problem on our side (AUTH-SRV). Try again in a moment.";
export const UNK_COPY = "Something went wrong (AUTH-UNK). Try again.";
export const RATE_COPY = "Too many tries (AUTH-RATE). Wait a minute, then try again.";
export const WRONG_CREDENTIALS_COPY =
  "That mobile number or email and password don't match.";
export const CODE_SEND_RATE_COPY =
  "Too many codes requested. Try again in 1 hour or use your password. (AUTH-RATE)";
export const RESET_CODE_COPY = "That code didn't work. Request a new code.";
export const INVITE_CODE_COPY =
  "That code didn't work. Check the latest email or resend.";

export function isOtpRejected(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    (err.code === "OTP_INVALID" || err.code === "OTP_EXPIRED")
  );
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiClientError) return false;
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    (err instanceof TypeError &&
      /network request failed|failed to fetch|network error|load failed/i.test(
        err.message,
      ))
  );
}

function known(err: unknown, context: AuthErrorContext): AuthFailure | null {
  if (!(err instanceof ApiClientError)) return null;
  switch (context) {
    case "password-login":
      if (err.status === 401 && err.code === "INVALID_CREDENTIALS") {
        return { code: null, copy: WRONG_CREDENTIALS_COPY };
      }
      return null;
    case "code-send":
      if (err.status === 429) return { code: "AUTH-RATE", copy: CODE_SEND_RATE_COPY };
      return null;
    case "reset-verify":
      if (isOtpRejected(err)) return { code: null, copy: RESET_CODE_COPY };
      return null;
    case "invite-verify":
      if (isOtpRejected(err)) return { code: null, copy: INVITE_CODE_COPY };
      return null;
    case "reset-set":
      if (err.code === "RESET_PROOF_INVALID") {
        return {
          code: null,
          copy: "That reset has expired. Go back and request a new code.",
        };
      }
      return null;
    case "invite-accept":
      if (err.status === 409) {
        return {
          code: null,
          copy: "You're already coaching with someone on FitBud. Sign in to continue.",
        };
      }
      if (err.status === 410) {
        return {
          code: null,
          copy: "This invite link has expired. Ask your coach to send a new one.",
        };
      }
      return null;
    default:
      return null;
  }
}

/** Pure mapping, no logging. */
export function classifyAuthError(
  err: unknown,
  context: AuthErrorContext,
): AuthFailure {
  const specific = known(err, context);
  if (specific) return specific;
  if (isZodError(err)) return { code: "AUTH-PARSE", copy: PARSE_COPY };
  if (isNetworkFailure(err)) return { code: "AUTH-NET", copy: NET_COPY };
  if (err instanceof ApiClientError) {
    if (err.status === 429) return { code: "AUTH-RATE", copy: RATE_COPY };
    if (err.status >= 500) return { code: "AUTH-SRV", copy: SRV_COPY };
  }
  // The API's own message for a 4xx on these calls is curated and says what it
  // checked (for example "invitation not found"); it is never a guess.
  if (
    err instanceof ApiClientError &&
    (context === "invite-accept" || context === "session" || context === "general") &&
    err.message
  ) {
    return { code: null, copy: err.message };
  }
  if (context === "session") return { code: "AUTH-SESSION", copy: SESSION_COPY };
  return { code: "AUTH-UNK", copy: UNK_COPY };
}

/**
 * The server answered 200 but with a different shape than this call expects
 * (for example another `purpose`). Client and server disagree; the user did
 * not type a wrong code.
 */
export function mismatchedResponseCopy(where: string): string {
  reportError(where, new Error("response did not match the request"));
  return PARSE_COPY;
}

/** Maps a failure to its copy and writes the dev log line. */
export function authErrorCopy(
  err: unknown,
  context: AuthErrorContext,
  where: string = context,
): string {
  reportError(where, err);
  return classifyAuthError(err, context).copy;
}
