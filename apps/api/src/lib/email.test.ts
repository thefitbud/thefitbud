import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/client.js";
import { devMailOutbox } from "../db/schema.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import type { Env } from "../types.js";
import { EmailSendError, sendSystemEmail } from "./email.js";

const TOKEN = "test-token-zepto-456";
const INPUT = {
  to: "Priya.Client@example.test",
  template: "otp" as const,
  subject: "Your FitBud code is 731205",
  text: "Your FitBud sign-in code is 731205.",
};

function env(overrides: Partial<Env>): Env {
  return {
    DB: {} as D1Database,
    MEDIA: {} as R2Bucket,
    FIREBASE_PROJECT_ID: "fitbud-test",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-test-signing-secret",
    ...overrides,
  };
}

/** A Db that fails the test if any provider other than dev_sink touches it. */
const untouchableDb = new Proxy({} as Db, {
  get() {
    throw new Error("db must not be used");
  },
});

let handle: MemoryDbHandle;

beforeAll(async () => {
  handle = await createMemoryDb();
});

afterAll(() => {
  handle.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendSystemEmail provider switch", () => {
  it("disabled sends nothing", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    await sendSystemEmail(env({ EMAIL_PROVIDER: "disabled", ENVIRONMENT: "staging" }), untouchableDb, INPUT);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dev_sink (default) writes the outbox locally and calls no provider", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    await sendSystemEmail(env({ ENVIRONMENT: "local" }), handle.db, INPUT);
    const rows = await handle.db.select().from(devMailOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ toAddress: "priya.client@example.test", template: "otp" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  for (const environment of ["staging", "production", undefined] as const) {
    it(`dev_sink is refused with DEV_SINK_REFUSED when ENVIRONMENT=${environment ?? "unset"}`, async () => {
      await expect(
        sendSystemEmail(env({ EMAIL_PROVIDER: "dev_sink", ENVIRONMENT: environment }), untouchableDb, INPUT),
      ).rejects.toThrow("DEV_SINK_REFUSED");
    });
  }

  it("zeptomail sends through ZeptoMail with SYSTEM_EMAIL_FROM and SYSTEM_EMAIL_REPLY_TO", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    await sendSystemEmail(
      env({
        EMAIL_PROVIDER: "zeptomail",
        ENVIRONMENT: "staging",
        ZEPTOMAIL_TOKEN: TOKEN,
        SYSTEM_EMAIL_FROM: "FitBud <no-reply@thefitbud.com>",
        SYSTEM_EMAIL_REPLY_TO: "tech@thefitbud.com",
      }),
      untouchableDb,
      INPUT,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.zeptomail.in/v1.1/email");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Zoho-enczapikey ${TOKEN}`);
    expect(JSON.parse(String(init!.body))).toEqual({
      from: { name: "FitBud", address: "no-reply@thefitbud.com" },
      to: [{ email_address: { address: INPUT.to } }],
      reply_to: [{ address: "tech@thefitbud.com" }],
      subject: INPUT.subject,
      textbody: INPUT.text,
    });
  });

  for (const token of [undefined, "", "   "]) {
    it(`zeptomail without a token (${JSON.stringify(token)}) throws EMAIL_PROVIDER_NOT_CONFIGURED and calls nothing`, async () => {
      const fetchSpy = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchSpy);
      await expect(
        sendSystemEmail(
          env({ EMAIL_PROVIDER: "zeptomail", ENVIRONMENT: "staging", ZEPTOMAIL_TOKEN: token }),
          untouchableDb,
          INPUT,
        ),
      ).rejects.toThrow("EMAIL_PROVIDER_NOT_CONFIGURED");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("zeptomail failure surfaces EmailSendError (EMAIL_SEND_FAILED) and logs nothing sensitive", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 })));
    const error = await sendSystemEmail(
      env({ EMAIL_PROVIDER: "zeptomail", ENVIRONMENT: "production", ZEPTOMAIL_TOKEN: TOKEN }),
      untouchableDb,
      INPUT,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ code: "EMAIL_SEND_FAILED", status: 500 });
    const text = `${String(error)} ${JSON.stringify(error)} ${lines.join("\n")}`;
    for (const secret of [TOKEN, INPUT.to, INPUT.subject, INPUT.text, "731205"]) {
      expect(text).not.toContain(secret);
    }
  });

  for (const provider of ["resend", "ses"] as const) {
    it(`${provider} still throws EMAIL_PROVIDER_NOT_CONFIGURED`, async () => {
      await expect(
        sendSystemEmail(env({ EMAIL_PROVIDER: provider, ENVIRONMENT: "staging" }), untouchableDb, INPUT),
      ).rejects.toThrow("EMAIL_PROVIDER_NOT_CONFIGURED");
    });
  }
});
