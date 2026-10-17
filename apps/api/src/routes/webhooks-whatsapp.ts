import { Hono } from "hono";
import { fail, ok } from "../lib/envelope.js";
import { operation } from "../openapi/document.js";
import type { Env, Variables } from "../types.js";

export const whatsappWebhookRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

whatsappWebhookRoutes.get(
  "/",
  operation({
    tag: "Webhooks",
    summary: "WhatsApp webhook verify",
    description: "Meta webhook verification handshake.",
    security: "public",
  }),
  (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    if (mode === "subscribe" && token === c.env.WA_WEBHOOK_VERIFY_TOKEN) {
      return c.text(challenge ?? "");
    }
    return fail(c, 403, "FORBIDDEN", "Verification failed.");
  },
);

whatsappWebhookRoutes.post(
  "/",
  operation({
    tag: "Webhooks",
    summary: "WhatsApp webhook events",
    description: "Receives delivery and inbound WhatsApp events.",
    security: "public",
  }),
  async (c) => {
    const signature = c.req.header("x-hub-signature-256");
    const secret = c.env.WA_APP_SECRET;
    if (!secret || !signature) {
      return fail(c, 401, "INVALID_SIGNATURE", "Missing signature.");
    }
    await c.req.json().catch(() => ({}));
    return ok(c, { received: true });
  },
);
