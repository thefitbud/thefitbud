import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FitBudApiClient, ApiClientError } from "@fitbud/api-client";
import { authOtpVerifyResponseSchema } from "@fitbud/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODE_SEND_RATE_COPY,
  INVITE_CODE_COPY,
  NET_COPY,
  PARSE_COPY,
  RATE_COPY,
  RESET_CODE_COPY,
  SESSION_COPY,
  SRV_COPY,
  UNK_COPY,
  WRONG_CREDENTIALS_COPY,
  authErrorCopy,
  classifyAuthError,
  mismatchedResponseCopy,
} from "./authErrors";
import {
  OTP_FINISH_FAILED_COPY,
  OTP_INVALID_COPY,
  OTP_NETWORK_COPY,
  verifyCodeError,
} from "../screens/auth/verifyCodeError";
import { createCodeVerifier } from "../screens/auth/verifyCodeErrorFlow";

function apiError(status: number, code: string, message = "Server said no.") {
  return new ApiClientError({ code, message, requestId: "req-1", status });
}

const USER_ID = "3f2b8a9e-1c4d-4e6f-8a7b-9c0d1e2f3a4b";

/** The reply staging sends for a correct login code (firebase mode). */
function stagingVerifyReply(overrides: Record<string, unknown> = {}) {
  return {
    purpose: "login",
    token: `eyJ${"a".repeat(1097)}`,
    tokenKind: "firebase_id_token",
    refreshToken: "refresh-token-value-from-firebase",
    expiresIn: 3600,
    userId: USER_ID,
    ...overrides,
  };
}

function clientReplying(data: unknown) {
  return new FitBudApiClient({
    baseUrl: "https://api.example.test",
    fetch: (async () =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("classifyAuthError", () => {
  it("password-login: only 401 INVALID_CREDENTIALS says the password is wrong", () => {
    const out = classifyAuthError(apiError(401, "INVALID_CREDENTIALS"), "password-login");
    expect(out.copy).toBe(WRONG_CREDENTIALS_COPY);
    expect(classifyAuthError(apiError(401, "UNAUTHENTICATED"), "password-login").copy).not.toBe(
      WRONG_CREDENTIALS_COPY,
    );
    expect(classifyAuthError(apiError(503, "UNAVAILABLE"), "password-login").copy).not.toBe(
      WRONG_CREDENTIALS_COPY,
    );
    expect(classifyAuthError(new TypeError("Network request failed"), "password-login").copy).not.toBe(
      WRONG_CREDENTIALS_COPY,
    );
  });

  it("code-send: 'Too many codes' only for 429", () => {
    expect(classifyAuthError(apiError(429, "RATE_LIMITED"), "code-send")).toEqual({
      code: "AUTH-RATE",
      copy: CODE_SEND_RATE_COPY,
    });
    expect(classifyAuthError(apiError(500, "INTERNAL"), "code-send").copy).toBe(SRV_COPY);
    expect(classifyAuthError(new TypeError("Network request failed"), "code-send").copy).toBe(
      NET_COPY,
    );
  });

  it("429 elsewhere is AUTH-RATE", () => {
    expect(classifyAuthError(apiError(429, "RATE_LIMITED"), "reset-send")).toEqual({
      code: "AUTH-RATE",
      copy: RATE_COPY,
    });
  });

  it.each([500, 502, 503])("%i is AUTH-SRV", (status) => {
    expect(classifyAuthError(apiError(status, "INTERNAL"), "reset-send")).toEqual({
      code: "AUTH-SRV",
      copy: SRV_COPY,
    });
  });

  it("a fetch TypeError and an AbortError are AUTH-NET", () => {
    for (const err of [
      new TypeError("Network request failed"),
      new DOMException("The operation was aborted.", "AbortError"),
    ]) {
      expect(classifyAuthError(err, "invite-send")).toEqual({ code: "AUTH-NET", copy: NET_COPY });
    }
  });

  it("'That code didn't work' only for OTP_INVALID / OTP_EXPIRED", () => {
    for (const code of ["OTP_INVALID", "OTP_EXPIRED"]) {
      expect(classifyAuthError(apiError(401, code), "reset-verify").copy).toBe(RESET_CODE_COPY);
      expect(classifyAuthError(apiError(401, code), "invite-verify").copy).toBe(INVITE_CODE_COPY);
    }
    for (const err of [
      apiError(500, "INTERNAL"),
      apiError(429, "RATE_LIMITED"),
      apiError(401, "SOMETHING_ELSE"),
      new TypeError("Network request failed"),
      new Error("boom"),
    ]) {
      for (const ctx of ["reset-verify", "invite-verify"] as const) {
        expect(classifyAuthError(err, ctx).copy).not.toContain("didn't work");
      }
    }
  });

  it("reset-set: an expired reset proof is its own message, not a generic one", () => {
    expect(classifyAuthError(apiError(401, "RESET_PROOF_INVALID"), "reset-set").copy).toBe(
      "That reset has expired. Go back and request a new code.",
    );
  });

  it("invite-accept keeps the 409 and 410 copy and the API's own 4xx message", () => {
    expect(classifyAuthError(apiError(409, "ALREADY_COACHED"), "invite-accept").copy).toContain(
      "already coaching",
    );
    expect(classifyAuthError(apiError(410, "GONE"), "invite-accept").copy).toContain("expired");
    expect(classifyAuthError(apiError(404, "NOT_FOUND", "Invitation not found."), "invite-accept").copy).toBe(
      "Invitation not found.",
    );
  });

  it("a plain Error is AUTH-UNK, and AUTH-SESSION when finishing sign-in", () => {
    expect(classifyAuthError(new Error("boom"), "password-login")).toEqual({
      code: "AUTH-UNK",
      copy: UNK_COPY,
    });
    expect(classifyAuthError(new Error("boom"), "session")).toEqual({
      code: "AUTH-SESSION",
      copy: SESSION_COPY,
    });
    expect(classifyAuthError("a string", "general").code).toBe("AUTH-UNK");
  });

  it("a 4xx while starting the session is AUTH-SESSION, not the API's message", () => {
    expect(classifyAuthError(apiError(403, "FORBIDDEN", "Nope."), "session")).toEqual({
      code: "AUTH-SESSION",
      copy: SESSION_COPY,
    });
  });

  it("never shows a raw error message for an unknown error", () => {
    expect(classifyAuthError(new Error("secret internal detail"), "general").copy).not.toContain(
      "secret",
    );
  });
});

describe("incident regression: staging firebase_id_token against stale contracts", () => {
  it("the real client parses the staging-shaped reply", async () => {
    const result = await clientReplying(stagingVerifyReply()).verifyOtp({
      identifier: "trainee@example.test",
      code: "123456",
      purpose: "login",
    });
    expect(result.purpose).toBe("login");
    if (result.purpose === "login") expect(result.tokenKind).toBe("firebase_id_token");
  });

  it("a contracts build that rejects tokenKind maps to AUTH-PARSE, never the code copy", async () => {
    // Stand-in for the pre-AU1b enum: the live schema rejects this tokenKind
    // the same way the stale one rejected "firebase_id_token", on the same path.
    const stale = stagingVerifyReply({ tokenKind: "firebase_id_token_x" });
    const parsed = authOtpVerifyResponseSchema.safeParse(stale);
    expect(parsed.success).toBe(false);
    const err = parsed.success ? null : parsed.error;
    expect(err?.issues[0]?.path).toEqual(["tokenKind"]);

    // The login-code screen (where the incident happened) goes through QT9's
    // mapper and controller, not authErrors; see the dedicated test below.
    for (const ctx of ["reset-verify", "invite-verify", "password-login", "session"] as const) {
      const out = classifyAuthError(err, ctx);
      expect(out).toEqual({ code: "AUTH-PARSE", copy: PARSE_COPY });
      expect(out.copy).not.toBe(OTP_INVALID_COPY);
      expect(out.copy).not.toContain("didn't work");
    }

    await expect(
      clientReplying(stale).verifyOtp({
        identifier: "trainee@example.test",
        code: "123456",
        purpose: "login",
      }),
    ).rejects.toSatisfy((e: unknown) => classifyAuthError(e, "reset-verify").code === "AUTH-PARSE");
  });

  it("the login-code screen path (D-W3-18): a ZodError from verifyOtp shows AUTH-PARSE and logs the path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("__DEV__", true);
    const stale = stagingVerifyReply({ tokenKind: "firebase_id_token_x" });
    const finish = vi.fn(async () => {});
    // The real controller, the real client and the real schema, as AuthScreen wires them.
    const verifier = createCodeVerifier({
      verify: (code: string) =>
        clientReplying(stale).verifyOtp({
          identifier: "trainee@example.test",
          purpose: "login",
          code,
        }),
      finish,
    });
    const outcome = await verifier.submit("123456", "trainee@example.test");
    vi.unstubAllGlobals();

    expect(outcome).toEqual({ kind: "error", message: PARSE_COPY });
    expect(outcome.kind === "error" && outcome.message).not.toBe(OTP_NETWORK_COPY);
    expect(outcome.kind === "error" && outcome.message).not.toBe(OTP_INVALID_COPY);
    expect(finish).not.toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("tokenKind");
    expect(logged).not.toContain("123456");
    expect(logged).not.toContain("trainee@example.test");
  });

  it("the login-code screen keeps QT9's wording for everything else", () => {
    expect(verifyCodeError(apiError(401, "OTP_INVALID"))).toBe(OTP_INVALID_COPY);
    expect(verifyCodeError(new TypeError("Network request failed"))).toBe(OTP_NETWORK_COPY);
    expect(verifyCodeError(apiError(500, "INTERNAL"))).toBe("Something went wrong (code 500). Try again.");
  });

  it("a failure while finishing sign-in is logged, not swallowed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("__DEV__", true);
    const verifier = createCodeVerifier({
      verify: async () => ({ purpose: "login" }),
      finish: async () => {
        throw new Error("secure store unavailable");
      },
    });
    const outcome = await verifier.submit("123456", "trainee@example.test");
    vi.unstubAllGlobals();
    expect(outcome).toEqual({ kind: "error", message: OTP_FINISH_FAILED_COPY });
    expect(JSON.stringify(warn.mock.calls)).toContain("secure store unavailable");
  });

  it("a purpose mismatch is reported as a response mismatch, not a wrong code", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mismatchedResponseCopy("test")).toBe(PARSE_COPY);
  });
});

describe("screens route every catch through the mapper", () => {
  // There is no component-render harness in apps/mobile, so the wiring is
  // pinned at source level: no bare catch, and no fixed cause text in a catch.
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = ["../screens/AuthScreen.tsx", "../screens/AcceptInviteScreen.tsx"];

  it.each(files)("%s has no bare catch", (rel) => {
    const source = readFileSync(join(dir, rel), "utf8");
    expect(source).not.toMatch(/catch\s*\{/);
  });

  it.each(files)("%s hard-codes no cause that a catch did not check", (rel) => {
    const source = readFileSync(join(dir, rel), "utf8");
    const blocks = source
      .split(/catch\s*\(/)
      .slice(1)
      .map((s) => s.slice(0, 300));
    for (const block of blocks) {
      expect(block).not.toContain("don't match");
      expect(block).not.toContain("Too many codes");
      expect(block).not.toContain("didn't work");
    }
  });

  it("AuthScreen.verifyCode is still QT9's controller", () => {
    const source = readFileSync(join(dir, "../screens/AuthScreen.tsx"), "utf8");
    expect(source).toContain("verifier.current.submit(code, identifier.trim())");
  });
});

describe("authErrorCopy", () => {
  it("returns the mapped copy and logs the zod issue path in dev", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("__DEV__", true);
    const parsed = authOtpVerifyResponseSchema.safeParse(
      stagingVerifyReply({ tokenKind: "firebase_id_token_x" }),
    );
    const copy = authErrorCopy(parsed.success ? null : parsed.error, "reset-verify", "test");
    expect(copy).toBe(PARSE_COPY);
    expect(JSON.stringify(warn.mock.calls)).toContain("tokenKind");
    vi.unstubAllGlobals();
  });
});
