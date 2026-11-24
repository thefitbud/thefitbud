import { describe, expect, it } from "vitest";
import {
  API_CLIENT_UNKNOWN_MESSAGE,
  ApiClientError,
  USER_FACING_GENERIC,
  USER_FACING_OFFLINE,
  USER_FACING_SERVER,
  UserSafeError,
  isNetworkFailure,
  isTechnicalErrorMessage,
  toApiClientError,
  userFacingError,
  userFacingMessage,
} from "./errors.js";

describe("toApiClientError", () => {
  it("keeps a curated API error envelope", () => {
    const err = toApiClientError(400, {
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid meal time.",
        requestId: "req-1",
      },
    });
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe("INVALID_REQUEST");
    expect(err.message).toBe("Invalid meal time.");
    expect(err.status).toBe(400);
  });

  it("never synthesises Request failed with status N", () => {
    const err = toApiClientError(503, { nope: true });
    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.message).toBe(API_CLIENT_UNKNOWN_MESSAGE);
    expect(err.message).not.toMatch(/Request failed with status/i);
    expect(err.message).not.toMatch(/\b503\b/);
  });
});

describe("isTechnicalErrorMessage", () => {
  it("flags the old api-client fallback and status leaks", () => {
    expect(isTechnicalErrorMessage("Request failed with status 500")).toBe(true);
    expect(isTechnicalErrorMessage("Status: 503")).toBe(true);
    expect(isTechnicalErrorMessage("FAILED_WITH_STATUS")).toBe(true);
    expect(isTechnicalErrorMessage("Invalid meal time.")).toBe(false);
  });
});

describe("userFacingError", () => {
  it("maps offline/network failures", () => {
    expect(userFacingError(new TypeError("Failed to fetch"))).toEqual({
      message: USER_FACING_OFFLINE,
      action: "retry",
    });
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(true);
    // Plain Error("network down") must not leak as looksHumanCopy (Z12-64).
    expect(isNetworkFailure(new Error("network down"))).toBe(true);
    expect(
      userFacingMessage(new Error("network down"), { fallback: "WO-UNLOG" }),
    ).toBe(USER_FACING_OFFLINE);
  });

  it("maps 5xx and UNKNOWN_ERROR to the server copy", () => {
    const five = new ApiClientError({
      code: "INTERNAL",
      message: "Request failed with status 500",
      requestId: "r",
      status: 500,
    });
    expect(userFacingMessage(five)).toBe(USER_FACING_SERVER);
    expect(userFacingMessage(five)).not.toMatch(/status|500/i);

    const unknown = new ApiClientError({
      code: "UNKNOWN_ERROR",
      message: API_CLIENT_UNKNOWN_MESSAGE,
      requestId: "r",
      status: 502,
    });
    expect(userFacingError(unknown)).toEqual({
      message: USER_FACING_SERVER,
      action: "retry",
    });
  });

  it("maps known codes to specific friendly copy", () => {
    expect(
      userFacingMessage(
        new ApiClientError({
          code: "NOT_FOUND",
          message: "Relationship not found.",
          requestId: "r",
          status: 404,
        }),
      ),
    ).toBe("We couldn't find that.");

    expect(
      userFacingMessage(
        new ApiClientError({
          code: "FORBIDDEN",
          message: "You cannot view this client's steps.",
          requestId: "r",
          status: 403,
        }),
      ),
    ).toBe("You don't have access to that.");
  });

  it("keeps curated safe ApiClientError 4xx messages", () => {
    expect(
      userFacingMessage(
        new ApiClientError({
          code: "INVALID_MEAL_TIME_GAP",
          message: "Meal times must be at least 2 hours apart.",
          requestId: "r",
          status: 400,
        }),
      ),
    ).toBe("Meal times must be at least 2 hours apart.");
  });

  it("keeps curated 403/409 bodies ahead of status generics", () => {
    expect(
      userFacingMessage(
        new ApiClientError({
          code: "RECENT_SIGN_IN_REQUIRED",
          message: "Sign in again to bring your account back.",
          requestId: "r",
          status: 403,
        }),
      ),
    ).toBe("Sign in again to bring your account back.");

    expect(
      userFacingMessage(
        new ApiClientError({
          code: "ACTIVE_CLIENTS",
          message:
            "End coaching with your active clients before deleting your account.",
          requestId: "r",
          status: 409,
        }),
      ),
    ).toBe(
      "End coaching with your active clients before deleting your account.",
    );
  });

  it("never surfaces Zod or plain Error messages", () => {
    const zodLike = Object.assign(new Error("Expected string, received number"), {
      name: "ZodError",
      issues: [{ path: ["email"], message: "Required" }],
    });
    expect(userFacingMessage(zodLike)).toBe(USER_FACING_GENERIC);
    expect(userFacingMessage(new Error("ENOENT: no such file"))).toBe(
      USER_FACING_GENERIC,
    );
  });

  it("uses a safe fallback when provided", () => {
    expect(
      userFacingMessage(new Error("boom"), {
        fallback: "Could not save profile.",
      }),
    ).toBe("Could not save profile.");
    expect(
      userFacingMessage(new Error("boom"), {
        fallback: "Request failed with status 500",
      }),
    ).toBe(USER_FACING_GENERIC);
  });

  it("maps 401 to sign-in, keeping curated session copy", () => {
    expect(
      userFacingError(
        new ApiClientError({
          code: "SESSION_EXPIRED",
          message: "Session expired.",
          requestId: "r",
          status: 401,
        }),
      ),
    ).toEqual({ message: "Session expired.", action: "sign_in" });

    expect(
      userFacingError(
        new ApiClientError({
          code: "UNKNOWN_AUTH",
          message: "Request failed with status 401",
          requestId: "r",
          status: 401,
        }),
      ),
    ).toEqual({ message: "Please sign in again.", action: "sign_in" });
  });
});

describe("the trainee edit windows (Z14-11)", () => {
  it("says what happened and what to do, never the code", () => {
    for (const code of [
      "MEAL_EDIT_WINDOW_CLOSED",
      "MEAL_REMOVE_NOT_ALLOWED",
      "MEAL_EDITED_BY_COACH",
      "COACH_LOGGED_READ_ONLY",
      "MEAL_LOG_NOT_FOUND",
      "FEEDBACK_EDIT_WINDOW_CLOSED",
    ]) {
      const copy = userFacingError(
        new ApiClientError({ code, message: "raw", requestId: "r", status: 422 }),
      ).message;
      expect(copy).not.toContain(code);
      expect(copy).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(copy.length).toBeGreaterThan(20);
    }
    expect(
      userFacingError(
        new ApiClientError({ code: "MEAL_EDIT_WINDOW_CLOSED", message: "x", requestId: "r", status: 422 }),
      ).message,
    ).toBe("Logged entries can be changed for 24 hours. Ask your coach to fix it.");
  });
});

describe("Z14-15: curated copy only", () => {
  it("does not pass a plain Error that merely reads like a sentence", () => {
    expect(userFacingMessage(new Error("database is locked by another process"))).toBe(
      USER_FACING_GENERIC,
    );
    expect(
      userFacingMessage(new Error("the migrated value did not read back"), {
        fallback: "Could not save. Try again.",
      }),
    ).toBe("Could not save. Try again.");
  });

  it("keeps the message of an error written for the screen", () => {
    expect(
      userFacingMessage(new UserSafeError("Couldn't attach the photo. Try again.")),
    ).toBe("Couldn't attach the photo. Try again.");
  });

  it("maps every known cause to its own friendly copy, never the code", () => {
    const cases: Array<[string, number]> = [
      ["NETWORK_ERROR", 0],
      ["UNAUTHENTICATED", 401],
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["RATE_LIMITED", 429],
      ["RELATIONSHIP_ENDED", 409],
      ["WORKOUT_ALREADY_FINISHED", 409],
      ["PAYLOAD_TOO_LARGE", 413],
      ["REQUEST_TIMEOUT", 408],
      ["SERVICE_UNAVAILABLE", 503],
      ["UNKNOWN_ERROR", 500],
    ];
    const seen = new Set<string>();
    for (const [code, status] of cases) {
      const copy = userFacingMessage(
        new ApiClientError({ code, message: "raw", requestId: "r", status }),
      );
      expect(copy).not.toContain(code);
      expect(copy).not.toMatch(/[A-Z]{3,}_[A-Z_]+|\(\w+-\w+\)|\b\d{3}\b/);
      seen.add(copy);
    }
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });

  it("names the cause for statuses without a known code", () => {
    const mk = (status: number) =>
      userFacingMessage(
        new ApiClientError({ code: "SOMETHING_NEW", message: "raw", requestId: "r", status }),
      );
    expect(mk(413)).toMatch(/too big/);
    expect(mk(504)).toMatch(/too long/);
    expect(mk(503)).toMatch(/busy/);
    expect(mk(500)).toBe("Something went wrong on our side. Try again.");
  });
});
