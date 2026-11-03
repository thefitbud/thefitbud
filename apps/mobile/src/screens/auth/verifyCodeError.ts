import { ApiClientError } from "@fitbud/api-client";

export const OTP_INVALID_COPY =
  "That code didn't work. Check the latest message or tap Resend.";
export const OTP_RATE_LIMITED_COPY = "Too many tries. Wait a minute, then tap Resend.";
export const OTP_NETWORK_COPY =
  "Couldn't reach FitBud. Check your connection and try again.";
export const OTP_FINISH_FAILED_COPY =
  "Your code worked, but we couldn't finish signing you in. Try again.";

/**
 * Maps a failure of `/auth/otp/verify` to the inline error copy (D-QA1-4).
 * Only a 401 OTP_INVALID says the code was wrong. The server message is never
 * shown; for other statuses only the HTTP status number is.
 */
export function verifyCodeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 401 && err.code === "OTP_INVALID") return OTP_INVALID_COPY;
    if (err.status === 429) return OTP_RATE_LIMITED_COPY;
    return `Something went wrong (code ${err.status}). Try again.`;
  }
  // Network failure (TypeError), timeout (AbortError) or anything without a status.
  return OTP_NETWORK_COPY;
}
