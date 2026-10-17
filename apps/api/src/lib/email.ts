import { createId, nowIso } from "./crypto";
import type { Db } from "../db/client";
import { devMailOutbox } from "../db/schema";
import type { Env } from "../types";

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
  throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
}
