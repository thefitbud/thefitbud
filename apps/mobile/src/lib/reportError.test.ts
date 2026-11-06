import { authOtpVerifyResponseSchema } from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSanitisedError,
  reportError,
  sanitiseError,
  scrub,
  setErrorReporter,
  type SanitisedError,
} from "./reportError";

const TOKEN = `eyJ${"b".repeat(300)}`;
const JWT = `eyJhbGciOiJIUzI1NiJ9.${"a".repeat(40)}.${"c".repeat(43)}`;
const REFRESH = "refresh-secret-value-0123456789abcdef";
const EMAIL = "someone.private@example.test";
const PASSWORD = "sunshine";

/**
 * A bearer token too short and too plain for any catch-all rule to notice: 8
 * characters, under `LONG_OPAQUE`'s 24, no 6-digit run, not dot-segmented.
 * Only `BEARER` and `SECRET_PAIR` can redact it, which is what makes those
 * two rules testable at all — the long fixtures above are caught by
 * `LONG_OPAQUE` whether those rules exist or not, so they pass for the wrong
 * reason and give false assurance for exactly the short-token case.
 */
const SHORT_BEARER = "aB3xZ9qL";

/**
 * A compact JWT, 23 characters, likewise under `LONG_OPAQUE`'s threshold, so
 * only the `eyJ`-anchored `JWT` rule can redact it.
 */
const SHORT_JWT = "eyJhbGciOi.eyJzdWIi.Xq9";

/** Every secret a test puts into an error. Nothing here may ever come out. */
const SECRETS = [
  TOKEN,
  JWT,
  REFRESH,
  EMAIL,
  PASSWORD,
  SHORT_BEARER,
  SHORT_JWT,
  "hunter2",
  "123456",
  "not-a-uuid",
];

function expectNoSecrets(text: string): void {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

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

/** Collects what an installed reporter is handed, as the release path does. */
function captureRelease(err: unknown): SanitisedError {
  vi.stubGlobal("__DEV__", false);
  const seen: unknown[] = [];
  setErrorReporter((_where, reported) => seen.push(reported));
  reportError("where", err);
  expect(seen).toHaveLength(1);
  const only = seen[0];
  if (!isSanitisedError(only)) throw new Error("the reporter was not given a SanitisedError");
  return only;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setErrorReporter(null);
});

describe("scrub", () => {
  it("redacts an email, a bare JWT and a Bearer value", () => {
    expect(scrub(`mail ${EMAIL}`)).toBe("mail [email]");
    expect(scrub(JWT)).toBe("[redacted]");
    expect(scrub(`Authorization: Bearer ${JWT}`)).not.toContain(JWT);
    expect(scrub(`authorization: bearer ${REFRESH}`)).not.toContain(REFRESH);
  });

  it("redacts a short, non-opaque bearer token under an Authorization header", () => {
    // Every row here leaked before the BEARER rule was moved ahead of
    // SECRET_PAIR: the pair rule consumed the literal word `Bearer` as the
    // value and destroyed the anchor BEARER needs.
    for (const header of [
      `Authorization: Bearer ${SHORT_BEARER}`,
      `authorization: bearer ${SHORT_BEARER}`,
      `Authorization=Bearer ${SHORT_BEARER}`,
      `cookie: Bearer ${SHORT_BEARER}`,
      `Proxy-Authorization: Bearer ${SHORT_BEARER}`,
      `Bearer ${SHORT_BEARER}`,
      `Bearer "${SHORT_BEARER}"`,
    ]) {
      expect(scrub(header)).not.toContain(SHORT_BEARER);
    }
    expect(scrub(`Authorization: Bearer ${SHORT_BEARER}`)).toBe(
      "Authorization: [redacted] [redacted]",
    );
    expect(scrub(`Bearer ${SHORT_BEARER}`)).toBe("Bearer [redacted]");
  });

  it("redacts a compact JWT that is too short for the long-run rule", () => {
    expect(SHORT_JWT.length).toBeLessThan(24);
    expect(scrub(SHORT_JWT)).toBe("[redacted]");
    expect(scrub(`token is ${SHORT_JWT}.`)).not.toContain("eyJ");
    // …without eating a dotted identifier, which a generic three-segment
    // base64url rule would have destroyed.
    expect(scrub("index.android.bundle")).toBe("index.android.bundle");
  });

  it("redacts a named secret whose value is an ordinary word", () => {
    expect(scrub(`password=${PASSWORD}`)).toBe("password=[redacted]");
    expect(scrub(`{"new_password":"${PASSWORD}"}`)).not.toContain(PASSWORD);
    expect(scrub("otpCode: 4242")).toBe("otpCode: [redacted]");
  });

  it("covers prefixed spellings of the secret field names", () => {
    for (const pair of [
      `authToken=${SHORT_BEARER}`,
      `userPassword=${PASSWORD}`,
      `user_password=${PASSWORD}`,
      `passwd=${PASSWORD}`,
      `passphrase=${PASSWORD}`,
      `credential=${PASSWORD}`,
      `credentials=${PASSWORD}`,
      `accessToken=${SHORT_BEARER}`,
      `refresh_token=${SHORT_BEARER}`,
      `sessionToken=${SHORT_BEARER}`,
      `Proxy-Authorization=${SHORT_BEARER}`,
    ]) {
      expect(scrub(pair)).not.toContain(SHORT_BEARER);
      expect(scrub(pair)).not.toContain(PASSWORD);
    }
  });

  it("pins the two limits that are knowingly left open", () => {
    // 1. An unquoted multi-word value is redacted only as far as its first
    // word: free text has no closing delimiter, and consuming to end-of-line
    // would swallow the rest of a sentence. A quoted value is redacted whole.
    expect(scrub("password: my secret phrase")).toBe("password: [redacted] secret phrase");
    expect(scrub('password: "my secret phrase"')).toBe("password: [redacted]");
    // 2. A short opaque zod path segment survives, because a path segment is
    // a schema field name by construction and a value-shaped one cannot be
    // told from a legitimate field name without entropy guesswork.
    expect(scrub(["body", "482913", SHORT_BEARER].join("."))).toBe(`body.[code].${SHORT_BEARER}`);
  });

  it("redacts a 6-digit code even when it sits next to other digits", () => {
    expect(scrub("code is 123456")).toBe("code is [code]");
    expect(scrub("99123456")).toBe("[code]");
    expect(scrub("otp 0123456789 here")).toBe("otp [code] here");
    // Shorter runs are not codes and stay readable.
    expect(scrub("status 400 in 1234 ms")).toBe("status 400 in 1234 ms");
  });

  it("keeps short, non-secret text intact", () => {
    expect(scrub("RATE_LIMITED")).toBe("RATE_LIMITED");
    expect(scrub("tokenKind")).toBe("tokenKind");
    expect(scrub("purpose.0.expiresIn")).toBe("purpose.0.expiresIn");
  });
});

describe("the reporter never sees a secret", () => {
  it("is given a SanitisedError, not the caught error", () => {
    const err = new Error("boom");
    const safe = captureRelease(err);
    expect(safe).not.toBe(err);
    expect(safe instanceof Error).toBe(false);
    expect(safe.name).toBe("Error");
    expect(safe.message).toBe("boom");
    expect(JSON.parse(JSON.stringify(safe))).toEqual(safe);
  });

  it("strips secrets from a message", () => {
    const safe = captureRelease(
      new Error(`Failed for ${EMAIL} with code 123456, ${TOKEN} and password=${PASSWORD}`),
    );
    expectNoSecrets(JSON.stringify(safe));
  });

  it("strips a short bearer token and a compact JWT reported through an error", () => {
    const safe = captureRelease(
      new Error(`Authorization: Bearer ${SHORT_BEARER} (authToken=${SHORT_BEARER})`, {
        cause: new Error(`upstream rejected ${SHORT_JWT}`),
      }),
    );
    expectNoSecrets(JSON.stringify(safe));
  });

  it("strips secrets from a cause chain", () => {
    const inner = new Error(`inner ${EMAIL} ${JWT}`);
    const middle = new Error(`middle password=${PASSWORD}`, { cause: inner });
    const safe = captureRelease(new Error("outer", { cause: middle }));
    expect(safe.cause?.cause?.name).toBe("Error");
    expect(safe.cause?.cause?.message).toContain("[email]");
    expectNoSecrets(JSON.stringify(safe));
  });

  it("strips secrets from an Error.stack", () => {
    const err = new Error("plain");
    err.stack = `Error: leaked ${EMAIL} ${JWT} 123456\n    at frame (/app/index.js:1:1)`;
    const safe = captureRelease(err);
    expect(safe.stack).toContain("at frame");
    expectNoSecrets(JSON.stringify(safe));
  });

  it("keeps the ApiClientError code and status, drops every details value", () => {
    const safe = captureRelease(
      new ApiClientError({
        code: "RATE_LIMITED",
        message: `Bad request for ${EMAIL}`,
        requestId: "req-1",
        status: 429,
        details: { token: TOKEN, refreshToken: REFRESH, password: PASSWORD, field: "purpose" },
      }),
    );
    expect(safe.code).toBe("RATE_LIMITED");
    expect(safe.status).toBe(429);
    expect(safe.requestId).toBe("req-1");
    expect(safe.detailKeys).toEqual(["token", "refreshToken", "password", "field"]);
    expect(JSON.stringify(safe)).not.toContain("purpose");
    expectNoSecrets(JSON.stringify(safe));
  });

  it("keeps zod issue paths, drops the JSON dump and the received values", () => {
    const safe = captureRelease(zodErrorWithSecrets());
    const paths = (safe.zodIssues ?? []).map((issue) => issue.path);
    expect(paths).toContain("tokenKind");
    expect(paths).toContain("userId");
    expect(safe.message).toBe("response did not match schema");
    const json = JSON.stringify(safe);
    // The zod message is a JSON dump of the issues and `Error.stack` repeats
    // it, so neither may reach the reporter.
    expect(json).not.toContain("received");
    expect(json).not.toContain("options");
    expect(safe.stack).toContain("ZodError: response did not match schema");
    expectNoSecrets(json);
  });

  it("strips a secret that appears as a zod issue path segment", () => {
    const err = new Error("x");
    err.name = "ZodError";
    (err as unknown as { issues: unknown[] }).issues = [
      {
        path: [EMAIL, TOKEN, "123456", JWT],
        code: "unrecognized_keys",
        message: `Unrecognized key ${EMAIL}`,
      },
    ];
    const safe = captureRelease(err);
    expect(safe.zodIssues).toHaveLength(1);
    expectNoSecrets(JSON.stringify(safe));
  });

  it("never reads a secret-named own property off the error", () => {
    const err = new Error("plain") as Error & Record<string, unknown>;
    err.token = TOKEN;
    err.password = PASSWORD;
    Object.defineProperty(err, "refreshToken", { value: REFRESH, enumerable: false });
    Object.defineProperty(err, "email", { get: () => EMAIL, enumerable: true });
    expectNoSecrets(JSON.stringify(captureRelease(err)));
  });

  it("redacts a secret served by a getter on an allow-listed field", () => {
    const err = new Error("plain");
    Object.defineProperty(err, "code", { get: () => `token=${TOKEN}` });
    Object.defineProperty(err, "requestId", { get: () => EMAIL });
    const safe = captureRelease(err);
    expect(safe.requestId).toBe("[email]");
    expectNoSecrets(JSON.stringify(safe));
  });
});

describe("a hostile or malformed error cannot break or defeat reporting", () => {
  it("survives throwing getters on every allow-listed field", () => {
    const err = new Error("plain");
    for (const key of ["name", "message", "code", "status", "requestId", "details", "stack"]) {
      Object.defineProperty(err, key, {
        get() {
          throw new Error(`getter ${key} exploded with ${TOKEN}`);
        },
      });
    }
    const safe = captureRelease(err);
    expect(safe.name).toBe("Error");
    expectNoSecrets(JSON.stringify(safe));
  });

  it("ignores toString and toJSON overrides on the error", () => {
    const err = new Error("plain") as Error & { toJSON?: () => unknown };
    err.toString = () => `leak ${EMAIL}`;
    err.toJSON = () => ({ leak: TOKEN });
    expectNoSecrets(JSON.stringify(captureRelease(err)));
  });

  it("never uses toString for the message, and scrubs what V8 stringifies", () => {
    const err = new Error("plain");
    Object.defineProperty(err, "message", {
      // Reading `.stack` runs V8's lazy formatting, which does stringify the
      // message; the sanitiser itself never does, and the stack is scrubbed.
      value: { toString: () => `${EMAIL} ${TOKEN}` },
    });
    const safe = captureRelease(err);
    expect(safe.message).toBe("[object]");
    expectNoSecrets(JSON.stringify(safe));
  });

  it("terminates on a circular cause chain", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.defineProperty(a, "cause", { value: b, writable: true });
    const safe = captureRelease(a);
    expect(JSON.stringify(safe)).toContain("Cycle");
  });

  it("caps a deep cause chain", () => {
    let err = new Error("deepest");
    for (let i = 0; i < 20; i += 1) err = new Error(`level ${i}`, { cause: err });
    const safe = captureRelease(err);
    let depth = 0;
    for (let node: SanitisedError | undefined = safe; node?.cause; node = node.cause) depth += 1;
    expect(depth).toBe(4);
  });

  it("reports a non-Error value as its type only", () => {
    expect(captureRelease({ token: TOKEN, password: PASSWORD })).toEqual({
      name: "NonError",
      message: "",
      kind: "object",
    });
    expect(captureRelease(`a string holding ${TOKEN}`).kind).toBe("string");
    expect(sanitiseError(null)).toEqual({ name: "NonError", message: "", kind: "object" });
  });
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
    reportError("c", new Error("outer", { cause: new Error(`inner ${EMAIL} ${JWT}`) }));
    reportError(
      "d",
      new ApiClientError({
        code: "X",
        message: `Bad request for ${EMAIL}`,
        requestId: "r",
        status: 400,
        details: { token: TOKEN, refreshToken: REFRESH, password: PASSWORD },
      }),
    );
    reportError("e", { token: TOKEN, password: PASSWORD });
    const logged = JSON.stringify(warn.mock.calls);
    expectNoSecrets(logged);
    expect(logged).not.toContain("received");
  });

  it("keeps the shape it has always logged", () => {
    vi.stubGlobal("__DEV__", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportError("x", new TypeError("Network request failed"));
    reportError("y", "a string");
    expect(warn.mock.calls[0]).toEqual(["[auth]", "x", "TypeError", "Network request failed"]);
    expect(warn.mock.calls[1]).toEqual(["[auth]", "y", "string"]);
  });

  it("does not reach the reporter", () => {
    vi.stubGlobal("__DEV__", true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = vi.fn();
    setErrorReporter(reporter);
    reportError("x", new Error("boom"));
    expect(reporter).not.toHaveBeenCalled();
  });
});

describe("reportError in a release build", () => {
  it("is a no-op without a reporter and never logs", () => {
    vi.stubGlobal("__DEV__", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => reportError("x", new Error("boom"))).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a throwing reporter does not escape", () => {
    vi.stubGlobal("__DEV__", false);
    setErrorReporter(() => {
      throw new Error("reporter down");
    });
    expect(() => reportError("x", new Error("boom"))).not.toThrow();
  });
});
