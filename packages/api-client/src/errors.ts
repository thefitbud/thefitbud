import { apiErrorBodySchema } from "@fitbud/contracts";

/**
 * Z12-64: map any thrown value to copy that is safe to show on a user screen.
 * Never surfaces HTTP status numbers, raw error codes, stacks, Zod paths, or
 * the old api-client fallback ("Request failed with status N").
 */

export type UserFacingErrorAction = "retry" | "sign_in";

export type UserFacingError = {
  message: string;
  action?: UserFacingErrorAction;
};

export type UserFacingErrorOptions = {
  /** Context-specific copy when the error has no safer curated message. */
  fallback?: string;
};

/** Offline / network. */
export const USER_FACING_OFFLINE =
  "You're offline. We'll retry when you're back.";

/** 5xx and unknown server failures. */
export const USER_FACING_SERVER =
  "Something went wrong on our side. Try again.";

/** Last-resort generic copy. */
export const USER_FACING_GENERIC = "Something went wrong. Try again.";

/**
 * Static message for an unparseable API error body (replaces
 * `Request failed with status ${status}`). Safe to show; no status number.
 */
export const API_CLIENT_UNKNOWN_MESSAGE = USER_FACING_SERVER;

const KNOWN_CODE_COPY: Record<string, UserFacingError> = {
  NETWORK_ERROR: { message: USER_FACING_OFFLINE, action: "retry" },
  UNAUTHENTICATED: {
    message: "Please sign in again.",
    action: "sign_in",
  },
  UNAUTHORIZED: { message: "Please sign in again.", action: "sign_in" },
  FORBIDDEN: { message: "You don't have access to that." },
  NOT_FOUND: { message: "We couldn't find that." },
  CONFLICT: {
    message: "This changed elsewhere. Reload and try again.",
    action: "retry",
  },
  RATE_LIMITED: {
    message: "Too many tries. Wait a minute, then try again.",
    action: "retry",
  },
  RELATIONSHIP_ENDED: {
    message: "This client has ended, so that action isn't available.",
  },
  RELATIONSHIP_NOT_FOUND: { message: "We couldn't find that client." },
  RELATIONSHIP_ALREADY_ENDED: {
    message: "This client has already ended.",
  },
  INVALID_CREDENTIALS: {
    message: "That mobile number or email and password don't match.",
  },
  OTP_INVALID: { message: "That code didn't work. Try again." },
  OTP_EXPIRED: { message: "That code has expired. Request a new one." },
  // Z14-7: a write that would change a workout that is already finished
  // (trainee finish, skip or set; also the trainer's log on a finished one).
  WORKOUT_ALREADY_FINISHED: {
    message:
      "This workout is already finished, so nothing was changed. Reload to see what was saved.",
  },
  // Z14-11 (D-W14-22, D-W14-20): the trainee's edit windows and their locks.
  MEAL_EDIT_WINDOW_CLOSED: {
    message: "Logged entries can be changed for 24 hours. Ask your coach to fix it.",
  },
  MEAL_REMOVE_NOT_ALLOWED: {
    message:
      "This log can't be removed any more.",
  },
  MEAL_EDITED_BY_COACH: {
    message: "Your coach has already corrected this meal, so it can't be changed here.",
  },
  COACH_LOGGED_READ_ONLY: {
    message: "Your coach logged this one, so it can't be changed here.",
  },
  MEAL_LOG_NOT_FOUND: { message: "We couldn't find that meal log. It may have been removed." },
  FEEDBACK_EDIT_WINDOW_CLOSED: {
    message: "Ratings can be changed for 48 hours after a workout.",
  },
  UNKNOWN_ERROR: { message: USER_FACING_SERVER, action: "retry" },
};

const TECHNICAL_MESSAGE =
  /Request failed with status|\bStatus:\s*\d{3}\b|\bat\s+\S+\s+\(|\bECONNREFUSED\b|\bENOTFOUND\b|\bfetch failed\b|\bFailed to fetch\b|\bNetworkError\b|\bAbortError\b|\bTimeoutError\b|\bZodError\b|\b\[object Object\]\b/i;

const BARE_ERROR_CODE = /^\s*[A-Z][A-Z0-9_]{2,}\s*$/;

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    requestId: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.status = input.status;
    this.details = input.details;
  }
}

export function toApiClientError(status: number, json: unknown): ApiClientError {
  const parsedError = apiErrorBodySchema.safeParse(json);
  if (parsedError.success) {
    return new ApiClientError({
      code: parsedError.data.error.code,
      message: parsedError.data.error.message,
      requestId: parsedError.data.error.requestId,
      status,
      details: parsedError.data.error.details,
    });
  }
  return new ApiClientError({
    code: "UNKNOWN_ERROR",
    message: API_CLIENT_UNKNOWN_MESSAGE,
    requestId: "unknown",
    status,
  });
}

/** True when a string must never be shown on a user screen as-is. */
export function isTechnicalErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (TECHNICAL_MESSAGE.test(trimmed)) return true;
  if (BARE_ERROR_CODE.test(trimmed)) return true;
  // "… failed with status 503" and similar status-number leaks.
  if (/\bstatus\s+\d{3}\b/i.test(trimmed)) return true;
  return false;
}

export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiClientError) {
    return (
      err.status === 0 ||
      err.code === "NETWORK_ERROR" ||
      (isTechnicalErrorMessage(err.message) &&
        /offline|network|fetch|load failed/i.test(err.message))
    );
  }
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    err.name === "NetworkError" ||
    (err instanceof TypeError &&
      /network request failed|failed to fetch|network error|network down|load failed|fetch failed/i.test(
        err.message,
      )) ||
    /offline|network request failed|failed to fetch|network error|network down|load failed/i.test(
      err.message,
    )
  );
}

function safeFallback(fallback: string | undefined): string {
  if (!fallback?.trim()) return USER_FACING_GENERIC;
  if (isTechnicalErrorMessage(fallback)) return USER_FACING_GENERIC;
  return fallback.trim();
}

/**
 * Map any error to user-facing copy. Prefer known API codes, then a curated
 * ApiClientError message (when safe), then `fallback`, then a generic line.
 *
 * Also accepts a plain string (already-extracted message) or a `{ message }`
 * holder: technical strings are replaced, safe ones are kept.
 */
export function userFacingError(
  err: unknown,
  options?: UserFacingErrorOptions,
): UserFacingError {
  const fallback = safeFallback(options?.fallback);

  if (typeof err === "string") {
    if (!isTechnicalErrorMessage(err)) return { message: err.trim() };
    return { message: fallback, action: "retry" };
  }

  if (isNetworkFailure(err)) {
    return { message: USER_FACING_OFFLINE, action: "retry" };
  }

  if (err instanceof ApiClientError) {
    const known = KNOWN_CODE_COPY[err.code];
    if (known) return { ...known };

    // Curated API body (D-W3-12 / D-W3b-7) before status generics — codes
    // like RECENT_SIGN_IN_REQUIRED (403) and ACTIVE_CLIENTS (409) carry
    // actionable human copy the UI must keep.
    if (
      err.message &&
      !isTechnicalErrorMessage(err.message) &&
      looksHumanCopy(err.message)
    ) {
      return {
        message: err.message,
        action: err.status === 401 ? "sign_in" : "retry",
      };
    }

    if (err.status === 401) {
      return { message: "Please sign in again.", action: "sign_in" };
    }
    if (err.status === 403) {
      return { message: "You don't have access to that." };
    }
    if (err.status === 404) {
      return { message: "We couldn't find that." };
    }
    if (err.status === 409) {
      return {
        message: "This changed elsewhere. Reload and try again.",
        action: "retry",
      };
    }
    if (err.status === 429) {
      return {
        message: "Too many tries. Wait a minute, then try again.",
        action: "retry",
      };
    }
    if (err.status >= 500) {
      return { message: USER_FACING_SERVER, action: "retry" };
    }

    return { message: fallback, action: "retry" };
  }

  // State holders like `{ message, kind }` from page loaders — sanitize only.
  if (
    err &&
    typeof err === "object" &&
    !(err instanceof Error) &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    const msg = (err as { message: string }).message;
    if (looksHumanCopy(msg)) return { message: msg.trim() };
    return { message: fallback, action: "retry" };
  }

  // Domain errors with curated copy (e.g. MealSyncError). Never ZodError /
  // TypeError / stack-like messages.
  if (err instanceof Error) {
    if (err.name === "ZodError") {
      return { message: fallback, action: "retry" };
    }
    if (looksHumanCopy(err.message)) {
      return { message: err.message.trim(), action: "retry" };
    }
  }

  return { message: fallback, action: "retry" };
}

/** Human sentence, not a code, stack, errno, or status leak. */
function looksHumanCopy(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 8 || trimmed.length > 220) return false;
  if (!/[a-z]/.test(trimmed)) return false;
  if (!/\s/.test(trimmed)) return false;
  // Node/system errno style ("ENOENT: no such file") and bare paths.
  if (/^[A-Z][A-Z0-9_]{2,}:/.test(trimmed)) return false;
  if (/\b(?:\/[\w.-]+){2,}/.test(trimmed)) return false;
  return !isTechnicalErrorMessage(trimmed);
}

/** Convenience: just the message string. */
export function userFacingMessage(
  err: unknown,
  options?: UserFacingErrorOptions,
): string {
  return userFacingError(err, options).message;
}
