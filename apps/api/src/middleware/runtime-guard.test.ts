import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { resetRuntimeGuardLogForTests, runtimeMisconfigurations } from "./runtime-guard.js";

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 is not used by /health");
    },
  } as unknown as D1Database;
}

/** A correctly configured deployed Worker; each case breaks one setting. */
function deployedEnv(overrides: Partial<Env>): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "thefitbud-staging",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "firebase",
    PUSH_PROVIDER_MODE: "expo",
    EMAIL_PROVIDER: "zeptomail",
    ZEPTOMAIL_TOKEN: "zepto-guard-token-do-not-log",
    MEDIA_SIGNING_SECRET: "fitbud-test-signing-secret",
    ...overrides,
  };
}

const TEST_MODES: Array<[string, Partial<Env>, string]> = [
  ["AUTH_MODE=test", { AUTH_MODE: "test" }, "AUTH_MODE=test"],
  ["AUTH_MODE unset", { AUTH_MODE: undefined as unknown as Env["AUTH_MODE"] }, "AUTH_MODE=unset"],
  ["PUSH_PROVIDER_MODE=test", { PUSH_PROVIDER_MODE: "test" }, "PUSH_PROVIDER_MODE=test"],
  ["PUSH_PROVIDER_MODE unset", { PUSH_PROVIDER_MODE: undefined }, "PUSH_PROVIDER_MODE=unset"],
  ["EMAIL_PROVIDER=dev_sink", { EMAIL_PROVIDER: "dev_sink" }, "EMAIL_PROVIDER=dev_sink"],
  ["EMAIL_PROVIDER unset", { EMAIL_PROVIDER: undefined }, "EMAIL_PROVIDER=unset"],
  // Named in Env but not implemented: every send would fail.
  ["PUSH_PROVIDER_MODE=fcm", { PUSH_PROVIDER_MODE: "fcm" }, "PUSH_PROVIDER_MODE=fcm"],
  ["EMAIL_PROVIDER=resend", { EMAIL_PROVIDER: "resend" }, "EMAIL_PROVIDER=resend"],
  ["EMAIL_PROVIDER=ses", { EMAIL_PROVIDER: "ses" }, "EMAIL_PROVIDER=ses"],
  // zeptomail without its secret would fail every OTP email.
  ["ZEPTOMAIL_TOKEN unset", { ZEPTOMAIL_TOKEN: undefined }, "ZEPTOMAIL_TOKEN=unset"],
  ["ZEPTOMAIL_TOKEN blank", { ZEPTOMAIL_TOKEN: "  " }, "ZEPTOMAIL_TOKEN=unset"],
];

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetRuntimeGuardLogForTests();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  errorLog.mockRestore();
});

function guardLogLines(): Array<Record<string, unknown>> {
  return errorLog.mock.calls
    .map((call) => JSON.parse(String(call[0])) as Record<string, unknown>)
    .filter((line) => line.message === "RUNTIME_MISCONFIGURED");
}

describe("runtime guard", () => {
  for (const environment of ["staging", "production"] as const) {
    it.each(TEST_MODES)(`${environment} with %s refuses with 500 RUNTIME_MISCONFIGURED`, async (_label, overrides, named) => {
      const response = await app.request("/health", {}, deployedEnv({ ENVIRONMENT: environment, ...overrides }));
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { code: string; requestId: string } };
      expect(body.error.code).toBe("RUNTIME_MISCONFIGURED");
      expect(body.error.requestId).toBeTruthy();
      const [line] = guardLogLines();
      expect(line).toMatchObject({ level: "error", environment, misconfigured: [named] });
    });

    it(`${environment} refuses every route, not only /health`, async () => {
      const env = deployedEnv({ ENVIRONMENT: environment, AUTH_MODE: "test" });
      for (const [path, init] of [
        ["/me", {}],
        ["/auth/login", { method: "POST", body: "{}" }],
        ["/openapi.json", {}],
      ] as const) {
        const response = await app.request(path, init, env);
        expect(response.status).toBe(500);
        expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
          "RUNTIME_MISCONFIGURED",
        );
      }
    });

    it(`${environment} with firebase auth, a real push mode and a real email provider serves normally`, async () => {
      const response = await app.request("/health", {}, deployedEnv({ ENVIRONMENT: environment }));
      expect(response.status).toBe(200);
      expect(guardLogLines()).toHaveLength(0);
    });

    it(`${environment} with PUSH_PROVIDER_MODE=expo serves normally (X4a)`, async () => {
      const response = await app.request(
        "/health",
        {},
        deployedEnv({ ENVIRONMENT: environment, PUSH_PROVIDER_MODE: "expo" }),
      );
      expect(response.status).toBe(200);
      expect(guardLogLines()).toHaveLength(0);
    });

    it(`${environment} with EMAIL_PROVIDER=disabled serves normally`, async () => {
      const response = await app.request(
        "/health",
        {},
        deployedEnv({ ENVIRONMENT: environment, EMAIL_PROVIDER: "disabled" }),
      );
      expect(response.status).toBe(200);
      expect(guardLogLines()).toHaveLength(0);
    });

    it(`${environment} with EMAIL_PROVIDER=zeptomail serves normally (I5)`, async () => {
      const response = await app.request(
        "/health",
        {},
        deployedEnv({ ENVIRONMENT: environment, EMAIL_PROVIDER: "zeptomail" }),
      );
      expect(response.status).toBe(200);
      expect(guardLogLines()).toHaveLength(0);
    });
  }

  // QT1 / D-QA1-1: the staging-only QA OTP secrets must make production refuse.
  describe("QA test-mode OTP secrets", () => {
    const QA_SECRET_CASES: Array<[string, Record<string, string>, string[]]> = [
      ["QA_TEST_OTP_ENABLED set", { QA_TEST_OTP_ENABLED: "on" }, ["QA_TEST_OTP_ENABLED=set"]],
      ["QA_TEST_OTP_CODE set", { QA_TEST_OTP_CODE: "135790" }, ["QA_TEST_OTP_CODE=set"]],
      [
        "both set",
        { QA_TEST_OTP_ENABLED: "on", QA_TEST_OTP_CODE: "135790" },
        ["QA_TEST_OTP_ENABLED=set", "QA_TEST_OTP_CODE=set"],
      ],
      // Even an off switch or a malformed code on production is a misconfiguration.
      ["QA_TEST_OTP_ENABLED=off", { QA_TEST_OTP_ENABLED: "off" }, ["QA_TEST_OTP_ENABLED=set"]],
      ["a short QA_TEST_OTP_CODE", { QA_TEST_OTP_CODE: "12345" }, ["QA_TEST_OTP_CODE=set"]],
    ];

    it.each(QA_SECRET_CASES)(
      "production with %s refuses every request",
      async (_label, overrides, named) => {
        const env = deployedEnv({ ENVIRONMENT: "production", ...(overrides as Partial<Env>) });
        expect(runtimeMisconfigurations(env)).toEqual(named);
        for (const [path, init] of [
          ["/health", {}],
          ["/auth/otp/start", { method: "POST", body: "{}" }],
        ] as const) {
          const response = await app.request(path, init, env);
          expect(response.status).toBe(500);
          expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
            "RUNTIME_MISCONFIGURED",
          );
        }
        const [line] = guardLogLines();
        expect(line).toMatchObject({ level: "error", environment: "production", misconfigured: named });
        // The secret's value is named, never printed.
        const raw = errorLog.mock.calls.map((call) => String(call[0])).join("\n");
        expect(raw).not.toContain("135790");
        expect(raw).not.toContain("12345");
      },
    );

    it.each(QA_SECRET_CASES)("staging with %s serves normally", async (_label, overrides) => {
      const env = deployedEnv({ ENVIRONMENT: "staging", ...(overrides as Partial<Env>) });
      expect(runtimeMisconfigurations(env)).toEqual([]);
      expect((await app.request("/health", {}, env)).status).toBe(200);
      expect(guardLogLines()).toHaveLength(0);
    });

    it("production without the QA secrets serves normally", async () => {
      const env = deployedEnv({ ENVIRONMENT: "production" });
      expect(runtimeMisconfigurations(env)).toEqual([]);
      expect((await app.request("/health", {}, env)).status).toBe(200);
    });

    it.each(["", "   "])("production ignores a blank QA secret (%s)", async (blank) => {
      const env = deployedEnv({
        ENVIRONMENT: "production",
        ...({ QA_TEST_OTP_ENABLED: blank, QA_TEST_OTP_CODE: blank } as Partial<Env>),
      });
      expect(runtimeMisconfigurations(env)).toEqual([]);
      expect((await app.request("/health", {}, env)).status).toBe(200);
    });
  });

  it("names every offending setting and never logs secret values", async () => {
    await app.request(
      "/health",
      {},
      deployedEnv({
        ENVIRONMENT: "production",
        AUTH_MODE: "test",
        PUSH_PROVIDER_MODE: undefined,
        EMAIL_PROVIDER: "dev_sink",
        FIREBASE_SERVICE_ACCOUNT_JSON: "{\"private_key\":\"do-not-log\"}",
        WA_ACCESS_TOKEN: "wa-secret-do-not-log",
      }),
    );
    const [line] = guardLogLines();
    expect(line?.misconfigured).toEqual([
      "AUTH_MODE=test",
      "PUSH_PROVIDER_MODE=unset",
      "EMAIL_PROVIDER=dev_sink",
    ]);
    const raw = errorLog.mock.calls.map((call) => String(call[0])).join("\n");
    expect(raw).not.toContain("do-not-log");
    expect(raw).not.toContain("zepto-guard-token");
    expect(raw).not.toContain("fitbud-test-signing-secret");
  });

  it("logs the misconfiguration once per isolate", async () => {
    const env = deployedEnv({ ENVIRONMENT: "staging", EMAIL_PROVIDER: "dev_sink" });
    for (let i = 0; i < 3; i += 1) {
      expect((await app.request("/health", {}, env)).status).toBe(500);
    }
    expect(guardLogLines()).toHaveLength(1);
  });

  it.each(["local", "preview", undefined] as const)(
    "does not guard ENVIRONMENT=%s",
    async (environment) => {
      const response = await app.request(
        "/health",
        {},
        deployedEnv({
          ENVIRONMENT: environment,
          AUTH_MODE: "test",
          PUSH_PROVIDER_MODE: "test",
          EMAIL_PROVIDER: "dev_sink",
        }),
      );
      expect(response.status).toBe(200);
      expect(guardLogLines()).toHaveLength(0);
    },
  );
});
