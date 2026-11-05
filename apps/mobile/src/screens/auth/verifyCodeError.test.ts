import { ApiClientError } from "@fitbud/api-client";
import { describe, expect, it } from "vitest";
import { verifyCodeError } from "./verifyCodeError";

function apiError(status: number, code: string, message = "server detail") {
  return new ApiClientError({ status, code, message, requestId: "req-1" });
}

const INVALID = "That code didn't work. Check the latest message or tap Resend.";
const NETWORK = "Couldn't reach FitBud. Check your connection and try again.";

describe("verifyCodeError", () => {
  it("401 OTP_INVALID keeps the invalid-code copy", () => {
    expect(verifyCodeError(apiError(401, "OTP_INVALID"))).toBe(INVALID);
  });

  it("401 with another code does not claim the code was wrong", () => {
    const msg = verifyCodeError(apiError(401, "UNAUTHENTICATED"));
    expect(msg).toBe("Something went wrong (code 401). Try again.");
    expect(msg).not.toBe(INVALID);
  });

  it("429 asks to wait then resend", () => {
    expect(verifyCodeError(apiError(429, "RATE_LIMITED"))).toBe(
      "Too many tries. Wait a minute, then tap Resend.",
    );
  });

  it.each([500, 503])("%i shows the status only, never the server message", (status) => {
    const msg = verifyCodeError(apiError(status, "INTERNAL", "secret stack detail"));
    expect(msg).toBe(`Something went wrong (code ${status}). Try again.`);
    expect(msg).not.toContain("secret");
  });

  it("network TypeError shows the connection copy", () => {
    expect(verifyCodeError(new TypeError("Network request failed"))).toBe(NETWORK);
  });

  it("timeout AbortError shows the connection copy", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(verifyCodeError(abort)).toBe(NETWORK);
  });

  it("a non-ApiClientError value shows the connection copy", () => {
    expect(verifyCodeError("boom")).toBe(NETWORK);
  });
});
