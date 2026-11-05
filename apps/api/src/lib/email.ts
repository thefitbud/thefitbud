import { createId, nowIso } from "./crypto";
import type { Db } from "../db/client";
import { devMailOutbox } from "../db/schema";
import type { Env } from "../types";
import { EmailSendError, sendZeptoMail } from "./zeptomail";

export { EmailSendError } from "./zeptomail";

/** The configured provider can't send (no ZeptoMail token, or resend / ses, which aren't built). */
export class EmailNotConfiguredError extends Error {
  readonly code = "EMAIL_PROVIDER_NOT_CONFIGURED" as const;

  constructor() {
    super("EMAIL_PROVIDER_NOT_CONFIGURED");
    this.name = "EmailNotConfiguredError";
  }
}

/** True for a failed or impossible email send; false for any other error. */
export function isEmailDeliveryFailure(err: unknown): err is EmailSendError | EmailNotConfiguredError {
  return err instanceof EmailSendError || err instanceof EmailNotConfiguredError;
}

export type EmailTemplate =
  | "otp"
  | "invite"
  | "password_changed"
  | "admin_alert";

export async function sendSystemEmail(
  env: Env,
  db: Db,
  input: {
    to: string;
    template: EmailTemplate;
    subject: string;
    text: string;
    html?: string;
  },
): Promise<void> {
  const provider = env.EMAIL_PROVIDER ?? "dev_sink";
  if (provider === "disabled") {
    return;
  }
  if (provider === "dev_sink") {
    if (env.ENVIRONMENT !== "local") {
      throw new Error("DEV_SINK_REFUSED");
    }
    const createdAt = nowIso();
    await db.insert(devMailOutbox).values({
      id: createId(),
      toAddress: input.to.toLowerCase(),
      template: input.template,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html ?? null,
      createdAt,
    });
    console.log(`[DEV MAIL] to=${input.to} subject=${input.subject}`);
    return;
  }
  if (provider === "zeptomail") {
    const token = env.ZEPTOMAIL_TOKEN?.trim();
    if (!token) {
      throw new EmailNotConfiguredError();
    }
    await sendZeptoMail(
      { token, from: env.SYSTEM_EMAIL_FROM, replyTo: env.SYSTEM_EMAIL_REPLY_TO },
      { to: input.to, subject: input.subject, text: input.text, html: input.html },
    );
    return;
  }
  // resend / ses are named in the type but not implemented.
  throw new EmailNotConfiguredError();
}
