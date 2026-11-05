/**
 * ZeptoMail (India region) sender for system email (D-W2-1).
 *
 * Never put the token, recipient, subject or body into an error or a log line:
 * failures carry the HTTP status only.
 */

export const ZEPTOMAIL_ENDPOINT = "https://api.zeptomail.in/v1.1/email";
export const ZEPTOMAIL_TIMEOUT_MS = 10_000;

const DEFAULT_FROM = { name: "FitBud", address: "no-reply@thefitbud.com" };

export class EmailSendError extends Error {
  readonly code = "EMAIL_SEND_FAILED" as const;
  /** HTTP status from ZeptoMail; undefined for a timeout or network error. */
  readonly status: number | undefined;

  constructor(status: number | undefined) {
    super(status === undefined ? "EMAIL_SEND_FAILED" : `EMAIL_SEND_FAILED (HTTP ${status})`);
    this.name = "EmailSendError";
    this.status = status;
  }
}

export type ZeptoMailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type ZeptoMailConfig = {
  token: string;
  /** `Name <address>` or a bare address. Falls back to `FitBud <no-reply@thefitbud.com>`. */
  from?: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Parses `Name <address>` (or a bare address) into ZeptoMail's `from` object. */
export function parseSender(value: string | undefined): { name?: string; address: string } {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { ...DEFAULT_FROM };
  }
  const match = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed);
  if (match) {
    const name = match[1]!.trim().replace(/^"(.*)"$/, "$1");
    return name ? { name, address: match[2]! } : { address: match[2]! };
  }
  return { address: trimmed };
}

export async function sendZeptoMail(config: ZeptoMailConfig, message: ZeptoMailMessage): Promise<void> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const replyTo = config.replyTo?.trim();
  const body: Record<string, unknown> = {
    from: parseSender(config.from),
    to: [{ email_address: { address: message.to } }],
    subject: message.subject,
    textbody: message.text,
  };
  if (message.html) {
    body.htmlbody = message.html;
  }
  if (replyTo) {
    body.reply_to = [{ address: replyTo }];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? ZEPTOMAIL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(ZEPTOMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Zoho-enczapikey ${config.token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Timeout (abort) or network error. Drop the cause: it may echo the request.
    throw new EmailSendError(undefined);
  } finally {
    clearTimeout(timer);
  }
  // The response body is never read or logged: it may echo the recipient.
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) {
    throw new EmailSendError(response.status);
  }
}
