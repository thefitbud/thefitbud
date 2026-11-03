import { describe, expect, it } from "vitest";
import { normalizeIdentifier } from "./identifiers.js";
import {
  isTestOtpActive,
  testOtpCode,
  TEST_OTP_IDENTIFIER_RE,
  type TestOtpEnv,
} from "./test-otp.js";

/** Only the fields the helper reads; the rest of `Env` is irrelevant here. */
function env(overrides: Partial<TestOtpEnv> = {}): TestOtpEnv {
  return {
    ENVIRONMENT: "staging",
    QA_TEST_OTP_ENABLED: "on",
    QA_TEST_OTP_CODE: "135790",
    ...overrides,
  } as TestOtpEnv;
}

const ALLOWED = "qa+trainer@thefitbud.com";

describe("TEST_OTP_IDENTIFIER_RE (D-QA1-2)", () => {
  it.each([
    "qa+trainer@thefitbud.com",
    "qa+ontrack@thefitbud.com",
    "qa+slipping@thefitbud.com",
    "qa+a@thefitbud.com",
    "qa+on-track-2@thefitbud.com",
    `qa+${"a".repeat(32)}@thefitbud.com`,
  ])("matches %s", (identifier) => {
    expect(TEST_OTP_IDENTIFIER_RE.test(identifier)).toBe(true);
  });

  it.each([
    // The negative identifiers named in the spec.
    "tech+client2@thefitbud.com",
    "qa@thefitbud.com",
    "qa+x@thefitbud.co",
    "qa+x@evil.com",
    // Neighbouring shapes that must not slip through.
    "qa+@thefitbud.com",
    `qa+${"a".repeat(33)}@thefitbud.com`,
    "qa+x@thefitbud.com.evil.com",
    "evil.com/qa+x@thefitbud.com",
    "xqa+x@thefitbud.com",
    "qa+x@sub.thefitbud.com",
    "qa+Trainer@thefitbud.com",
    "QA+TRAINER@THEFITBUD.COM",
    "qa+x_y@thefitbud.com",
    "qa+x@thefitbud.com ",
    "qa+x@thefitbud.com\n",
    "+919876543210",
  ])("does not match %s", (identifier) => {
    expect(TEST_OTP_IDENTIFIER_RE.test(identifier)).toBe(false);
  });
});

describe("testOtpCode", () => {
  it.each(["135790", "000000", "999999"])("accepts the six-digit code %s", (code) => {
    expect(testOtpCode(env({ QA_TEST_OTP_CODE: code }))).toBe(code);
  });

  it.each(["12345", "1234567", "", "12345a", "abcdef", " 123456", "123 456", "1.2345"])(
    "rejects %s",
    (code) => {
      expect(testOtpCode(env({ QA_TEST_OTP_CODE: code }))).toBeNull();
    },
  );

  it("is null when the code is unset", () => {
    expect(testOtpCode(env({ QA_TEST_OTP_CODE: undefined }))).toBeNull();
  });
});

describe("isTestOtpActive", () => {
  it("is active on staging with the flag on, a six-digit code, login and an allowlisted address", () => {
    expect(isTestOtpActive(env(), ALLOWED, "login")).toBe(true);
  });

  it.each(["local", "production", "preview", undefined] as const)(
    "is inactive on ENVIRONMENT=%s",
    (environment) => {
      expect(isTestOtpActive(env({ ENVIRONMENT: environment }), ALLOWED, "login")).toBe(false);
    },
  );

  it.each([undefined, "", "off", "ON", "On", "true", "1", "on "])(
    "is inactive when the flag is %s",
    (flag) => {
      expect(isTestOtpActive(env({ QA_TEST_OTP_ENABLED: flag }), ALLOWED, "login")).toBe(false);
    },
  );

  it.each([undefined, "", "12345", "1234567", "abcdef"])(
    "is inactive when the code is %s",
    (code) => {
      expect(isTestOtpActive(env({ QA_TEST_OTP_CODE: code }), ALLOWED, "login")).toBe(false);
    },
  );

  it.each(["reset", "invite"] as const)("is inactive for purpose %s", (purpose) => {
    expect(isTestOtpActive(env(), ALLOWED, purpose)).toBe(false);
  });

  it.each([
    "tech+client2@thefitbud.com",
    "qa@thefitbud.com",
    "qa+x@thefitbud.co",
    "qa+x@evil.com",
    "+919876543210",
    "",
  ])("is inactive for the non-allowlisted identifier %s", (identifier) => {
    expect(isTestOtpActive(env(), identifier, "login")).toBe(false);
  });

  it("is active for an upper-case QA address once normalized, and not before", () => {
    const raw = "QA+Trainer@TheFitBud.com";
    // Fails closed on the raw string: the helper takes a normalized identifier.
    expect(isTestOtpActive(env(), raw, "login")).toBe(false);
    const normalized = normalizeIdentifier(raw);
    expect(normalized).toEqual({ kind: "email", value: "qa+trainer@thefitbud.com" });
    expect(isTestOtpActive(env(), normalized!.value, "login")).toBe(true);
  });

  it("is inactive for every mobile identifier, however the flag is set", () => {
    for (const raw of ["+919876543210", "9876543210", "+1 415 555 0100"]) {
      const normalized = normalizeIdentifier(raw);
      if (!normalized) continue;
      expect(normalized.kind).toBe("mobile");
      expect(isTestOtpActive(env(), normalized.value, "login")).toBe(false);
    }
  });

  // Truth table: active only when every condition holds.
  const CONDITIONS = {
    environment: ["staging", "production"] as const,
    flag: ["on", "off"] as const,
    code: ["135790", "12345"] as const,
    identifier: [ALLOWED, "qa@thefitbud.com"] as const,
    purpose: ["login", "reset"] as const,
  };

  it("is active for exactly one row of the environment × flag × code × identifier × purpose table", () => {
    const active: string[] = [];
    for (const environment of CONDITIONS.environment) {
      for (const flag of CONDITIONS.flag) {
        for (const code of CONDITIONS.code) {
          for (const identifier of CONDITIONS.identifier) {
            for (const purpose of CONDITIONS.purpose) {
              const result = isTestOtpActive(
                env({
                  ENVIRONMENT: environment,
                  QA_TEST_OTP_ENABLED: flag,
                  QA_TEST_OTP_CODE: code,
                }),
                identifier,
                purpose,
              );
              if (result) {
                active.push([environment, flag, code, identifier, purpose].join(" "));
              }
            }
          }
        }
      }
    }
    expect(active).toEqual(["staging on 135790 qa+trainer@thefitbud.com login"]);
  });
});
