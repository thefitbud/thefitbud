import { ApiClientError } from "@fitbud/api-client";
import { authOtpVerifyResponseSchema } from "@fitbud/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NET_COPY,
  PARSE_COPY,
  RATE_COPY,
  RESET_CODE_COPY,
  SRV_COPY,
  UNK_COPY,
} from "../../lib/authErrors";
import { setErrorReporter } from "../../lib/reportError";
import {
  resetSendError,
  resetSetError,
  resetVerifyError,
  resetVerifyMismatchCopy,
} from "./passwordResetErrors";

function apiError(status: number, code: string, message = "Server said no.") {
  return new ApiClientError({ code, message, requestId: "req-1", status });
}

function zodError(): Error {
  const parsed = authOtpVerifyResponseSchema.safeParse({ purpose: "nonsense" });
  if (parsed.success) throw new Error("fixture must fail to parse");
  return parsed.error;
}

const networkError = () => new TypeError("Network request failed");
const EXPIRED_RESET_COPY = "That reset has expired. Go back and request a new code.";

let reported: Array<{ where: string; err: unknown }>;
beforeEach(() => {
  reported = [];
  setErrorReporter((where, err) => reported.push({ where, err }));
});
afterEach(() => setErrorReporter(null));

describe("resetSendError (startOtp, purpose reset)", () => {
  it("a 404 (wrong base URL, gateway, renamed route) never claims a code was sent", () => {
    const copy = resetSendError(apiError(404, "NOT_FOUND", "Not found."));
    expect(copy).toBe(UNK_COPY);
    expect(copy).not.toContain("sent a code");
    expect(reported).toHaveLength(1);
  });

  it("a network failure is AUTH-NET, never the sent copy, and is reported", () => {
    const copy = resetSendError(networkError());
    expect(copy).toBe(NET_COPY);
    expect(copy).toContain("AUTH-NET");
    expect(reported).toHaveLength(1);
  });

  it.each([500, 502, 503])("a %i is AUTH-SRV, never the sent copy", (status) => {
    expect(resetSendError(apiError(status, "INTERNAL"))).toBe(SRV_COPY);
    expect(reported).toHaveLength(1);
  });

  it("a ZodError is AUTH-PARSE, never the sent copy", () => {
    expect(resetSendError(zodError())).toBe(PARSE_COPY);
    expect(reported).toHaveLength(1);
  });

  it("429 is the too-many-tries copy", () => {
    expect(resetSendError(apiError(429, "RATE_LIMITED"))).toBe(RATE_COPY);
  });

  it("an unknown 400 shows a short code, not the server message", () => {
    const copy = resetSendError(apiError(400, "INVALID_REQUEST", "Invalid request."));
    expect(copy).toBe(UNK_COPY);
    expect(copy).not.toContain("Invalid request");
  });

  it("an unknown non-API error is AUTH-UNK", () => {
    expect(resetSendError(new Error("boom"))).toBe(UNK_COPY);
  });
});

describe("resetVerifyError (verifyOtp, purpose reset)", () => {
  it.each(["OTP_INVALID", "OTP_EXPIRED"])("%s says the code did not work", (code) => {
    expect(resetVerifyError(apiError(401, code))).toBe(RESET_CODE_COPY);
    expect(reported).toEqual([]);
  });

  it("429 is the too-many-tries copy, not 'That code didn't work.'", () => {
    const copy = resetVerifyError(apiError(429, "RATE_LIMITED"));
    expect(copy).toBe(RATE_COPY);
    expect(copy).not.toBe(RESET_CODE_COPY);
  });

  it("a ZodError (stale contracts dist) is AUTH-PARSE, never a wrong code", () => {
    const copy = resetVerifyError(zodError());
    expect(copy).toBe(PARSE_COPY);
    expect(copy).not.toContain("That code didn't work");
    expect(reported).toHaveLength(1);
  });

  it("a network failure is AUTH-NET", () => {
    expect(resetVerifyError(networkError())).toBe(NET_COPY);
    expect(reported).toHaveLength(1);
  });

  it("a 500 is AUTH-SRV", () => {
    expect(resetVerifyError(apiError(500, "INTERNAL"))).toBe(SRV_COPY);
  });

  it("an unknown ApiClientError is a short code, not a wrong code", () => {
    const copy = resetVerifyError(apiError(401, "UNAUTHENTICATED", "Token xyz bad"));
    expect(copy).toBe(UNK_COPY);
    expect(copy).not.toBe(RESET_CODE_COPY);
    expect(copy).not.toContain("xyz");
    expect(reported).toHaveLength(1);
  });

  it("a purpose mismatch is AUTH-PARSE and reported", () => {
    const copy = resetVerifyMismatchCopy();
    expect(copy).toBe(PARSE_COPY);
    expect(copy).not.toContain("That code didn't work");
    expect(reported).toHaveLength(1);
  });
});

describe("resetSetError (resetPassword)", () => {
  it("RESET_PROOF_INVALID asks for a new code and is not reported", () => {
    expect(resetSetError(apiError(401, "RESET_PROOF_INVALID"))).toBe(EXPIRED_RESET_COPY);
    expect(reported).toEqual([]);
  });

  it("a ZodError is AUTH-PARSE", () => {
    expect(resetSetError(zodError())).toBe(PARSE_COPY);
    expect(reported).toHaveLength(1);
  });

  it("a network failure is AUTH-NET", () => {
    expect(resetSetError(networkError())).toBe(NET_COPY);
  });

  it("429 is the too-many-tries copy", () => {
    expect(resetSetError(apiError(429, "RATE_LIMITED"))).toBe(RATE_COPY);
  });

  it("a 500 is AUTH-SRV", () => {
    expect(resetSetError(apiError(500, "INTERNAL"))).toBe(SRV_COPY);
  });

  it.each([
    ["PASSWORD_LENGTH", "Use a password between 8 and 64 characters."],
    ["PASSWORD_BREACHED", "This password is too common."],
  ])("%s shows the API's own requirement text so the user can fix it", (code, message) => {
    expect(resetSetError(apiError(400, code, message))).toBe(message);
    expect(reported).toEqual([]);
  });

  it("an unknown 400 shows a short code, never the server message or the old generic text", () => {
    const copy = resetSetError(apiError(400, "INVALID_REQUEST", "Invalid request."));
    expect(copy).toBe(UNK_COPY);
    expect(copy).not.toBe("Could not update password.");
    expect(reported).toHaveLength(1);
  });
});

describe("no secret reaches the reporter or the copy", () => {
  it("copy never contains the server message, code, email or token", () => {
    const secret = "rahul@example.test 482913 eyJhbGciOiJIUzI1NiJ9.payload.sig";
    const errors = [
      apiError(500, "INTERNAL", secret),
      apiError(400, "INVALID_REQUEST", secret),
      new TypeError(`Network request failed ${secret}`),
      new Error(secret),
    ];
    for (const err of errors) {
      for (const copy of [resetSendError(err), resetVerifyError(err), resetSetError(err)]) {
        expect(copy).not.toContain("rahul");
        expect(copy).not.toContain("482913");
        expect(copy).not.toContain("eyJ");
      }
    }
  });

  it("reporter is only given the error and a fixed location name", () => {
    resetVerifyError(networkError());
    expect(reported.map((r) => r.where)).toEqual(["passwordReset.verify"]);
  });
});
