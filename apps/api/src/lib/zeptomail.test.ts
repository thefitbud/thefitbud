import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmailSendError,
  parseSender,
  sendZeptoMail,
  ZEPTOMAIL_ENDPOINT,
  ZEPTOMAIL_TIMEOUT_MS,
} from "./zeptomail.js";

const TOKEN = "test-token-zepto-123";
const MESSAGE = {
  to: "priya.client@example.test",
  subject: "Your FitBud code is 482913",
  text: "Your FitBud sign-in code is 482913.",
};

function okFetch() {
  return vi.fn<typeof fetch>(async () => new Response('{"data":[{"code":"EM_104"}]}', { status: 201 }));
}

function sentBody(fetchImpl: ReturnType<typeof okFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)) as Record<string, unknown>;
}

/** Every string a caller could see or log from a thrown error. */
function errorText(error: unknown): string {
  const e = error as Error & { cause?: unknown };
  return [String(e), e.message, e.stack ?? "", JSON.stringify(e), String(e.cause ?? "")].join("\n");
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("parseSender", () => {
  it("parses `Name <address>`", () => {
    expect(parseSender("FitBud <no-reply@thefitbud.com>")).toEqual({
      name: "FitBud",
      address: "no-reply@thefitbud.com",
    });
    expect(parseSender('"FitBud Team" <team@thefitbud.com>')).toEqual({
      name: "FitBud Team",
      address: "team@thefitbud.com",
    });
  });

  it("accepts a bare address and defaults when unset", () => {
    expect(parseSender("no-reply@thefitbud.com")).toEqual({ address: "no-reply@thefitbud.com" });
    expect(parseSender(undefined)).toEqual({ name: "FitBud", address: "no-reply@thefitbud.com" });
    expect(parseSender("  ")).toEqual({ name: "FitBud", address: "no-reply@thefitbud.com" });
  });
});

describe("sendZeptoMail", () => {
  it("posts one request to the India endpoint with the Zoho-enczapikey header and the documented body", async () => {
    const fetchImpl = okFetch();
    await sendZeptoMail(
      {
        token: TOKEN,
        from: "FitBud <no-reply@thefitbud.com>",
        replyTo: "tech@thefitbud.com",
        fetchImpl,
      },
      { ...MESSAGE, html: "<p>Your code is 482913</p>" },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.zeptomail.in/v1.1/email");
    expect(url).toBe(ZEPTOMAIL_ENDPOINT);
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Zoho-enczapikey ${TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(sentBody(fetchImpl)).toEqual({
      from: { name: "FitBud", address: "no-reply@thefitbud.com" },
      to: [{ email_address: { address: "priya.client@example.test" } }],
      reply_to: [{ address: "tech@thefitbud.com" }],
      subject: MESSAGE.subject,
      textbody: MESSAGE.text,
      htmlbody: "<p>Your code is 482913</p>",
    });
  });

  it("omits reply_to when SYSTEM_EMAIL_REPLY_TO is unset and htmlbody when there is no html", async () => {
    const fetchImpl = okFetch();
    await sendZeptoMail({ token: TOKEN, from: "FitBud <no-reply@thefitbud.com>", fetchImpl }, MESSAGE);
    const body = sentBody(fetchImpl);
    expect(body).not.toHaveProperty("reply_to");
    expect(body).not.toHaveProperty("htmlbody");
  });

  for (const status of [400, 401, 422, 500, 503]) {
    it(`HTTP ${status} throws EMAIL_SEND_FAILED with the status only`, async () => {
      const log = vi.spyOn(console, "log");
      const warn = vi.spyOn(console, "warn");
      const err = vi.spyOn(console, "error");
      const fetchImpl = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({ error: { message: `bad ${MESSAGE.to} ${TOKEN}` } }),
            { status },
          ),
      );
      const error = await captureError(sendZeptoMail({ token: TOKEN, fetchImpl }, MESSAGE));
      expect(error).toBeInstanceOf(EmailSendError);
      expect(error).toMatchObject({ code: "EMAIL_SEND_FAILED", status, name: "EmailSendError" });
      const text = errorText(error);
      for (const secret of [TOKEN, MESSAGE.to, MESSAGE.subject, MESSAGE.text, "482913"]) {
        expect(text).not.toContain(secret);
      }
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    });
  }

  it("a network error throws EMAIL_SEND_FAILED without the cause", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`fetch failed for ${TOKEN} ${MESSAGE.to}`);
    });
    const error = await captureError(sendZeptoMail({ token: TOKEN, fetchImpl }, MESSAGE));
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ code: "EMAIL_SEND_FAILED", status: undefined });
    const text = errorText(error);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(MESSAGE.to);
  });

  it("times out after 10 s and throws EMAIL_SEND_FAILED", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    const pending = captureError(sendZeptoMail({ token: TOKEN, fetchImpl }, MESSAGE));
    await vi.advanceTimersByTimeAsync(ZEPTOMAIL_TIMEOUT_MS - 1);
    expect(fetchImpl.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(ZEPTOMAIL_TIMEOUT_MS).toBe(10_000);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ code: "EMAIL_SEND_FAILED", status: undefined });
    expect(errorText(error)).not.toContain(TOKEN);
  });
});
