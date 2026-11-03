import { authOtpVerifyResponseSchema } from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError, setErrorReporter } from "./reportError";

const TOKEN = `eyJ${"b".repeat(300)}`;
const REFRESH = "refresh-secret-value-0123456789abcdef";
const EMAIL = "someone.private@example.test";

function zodErrorWithSecrets() {
  const parsed = authOtpVerifyResponseSchema.safeParse({
    purpose: "login",
    token: TOKEN,
    tokenKind: REFRESH,
    refreshToken: REFRESH,
    expiresIn: 3600,
    userId: "not-a-uuid",
    code: "123456",
    password: "hunter2-hunter2",
  });
  if (parsed.success) throw new Error("expected a failure");
  return parsed.error;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setErrorReporter(null);
});

describe("reportError in dev", () => {
  it("logs name and zod issue paths", () => {
    vi.stubGlobal("__DEV__", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportError("verify", zodErrorWithSecrets());
    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0]!;
    expect(args.slice(0, 3)).toEqual(["[auth]", "verify", "ZodError"]);
    const paths = (args[4] as { zodIssues: { path: string }[] }).zodIssues.map((i) => i.path);
    expect(paths).toContain("tokenKind");
    expect(paths).toContain("userId");
  });

  it("never logs a token, refresh token, code, password, email or received value", () => {
    vi.stubGlobal("__DEV__", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportError("a", zodErrorWithSecrets());
    reportError("b", new Error(`Failed for ${EMAIL} with code 123456 and ${TOKEN}`));
    reportError(
      "c",
      new ApiClientError({
        code: "X",
        message: `Bad request for ${EMAIL}`,
        requestId: "r",
        status: 400,
        details: { token: TOKEN, refreshToken: REFRESH, password: "hunter2-hunter2" },
      }),
    );
    reportError("d", { token: TOKEN, password: "hunter2-hunter2" });
    const logged = JSON.stringify(warn.mock.calls);
    for (const secret of [TOKEN, REFRESH, EMAIL, "123456", "hunter2", "not-a-uuid"]) {
      expect(logged).not.toContain(secret);
    }
    expect(logged).not.toContain("received");
  });
});

describe("reportError in a release build", () => {
  it("is a no-op without a reporter and never logs", () => {
    vi.stubGlobal("__DEV__", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => reportError("x", new Error("boom"))).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("forwards to an installed reporter, and a throwing reporter does not escape", () => {
    vi.stubGlobal("__DEV__", false);
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const err = new Error("boom");
    reportError("x", err);
    expect(reporter).toHaveBeenCalledWith("x", err);
    setErrorReporter(() => {
      throw new Error("reporter down");
    });
    expect(() => reportError("x", err)).not.toThrow();
  });
});
