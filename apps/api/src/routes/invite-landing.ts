import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client.js";
import { clientInvitations, trainerProfiles } from "../db/schema.js";
import { nowIso, sha256Hex } from "../lib/crypto.js";
import type { Env, Variables } from "../types.js";

/**
 * Public invite deep-link landing at APP_HOST/i/:token (TR-02).
 * Serves HTML so WhatsApp / browser opens don't 404; deep-links into the app.
 */
export const inviteLandingRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

inviteLandingRoutes.get("/:token", async (c) => {
  const token = c.req.param("token")?.trim() ?? "";
  if (!token || token.length < 8) {
    return c.html(
      `<!doctype html><html><head><meta charset="utf-8"/><title>Invite</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:28rem;margin:auto">
<h1>Invite link not found</h1>
<p>Ask your coach to send a new invite.</p>
</body></html>`,
      404,
    );
  }

  const db = createDb(c.env.DB);
  const tokenHash = await sha256Hex(token);
  const [invitation] = await db
    .select()
    .from(clientInvitations)
    .where(eq(clientInvitations.tokenHash, tokenHash))
    .limit(1);

  let trainerName = "Your coach";
  let status: string = "missing";
  if (invitation) {
    const timestamp = nowIso();
    status = invitation.status;
    if (status === "pending" && invitation.expiresAt <= timestamp) {
      status = "expired";
    }
    const [trainer] = await db
      .select()
      .from(trainerProfiles)
      .where(eq(trainerProfiles.userId, invitation.trainerUserId))
      .limit(1);
    trainerName = trainer?.displayName ?? "Your coach";
  }

  const first = escapeHtml(trainerName.split(/\s+/)[0] ?? "Your coach");
  const safeName = escapeHtml(trainerName);
  const safeToken = encodeURIComponent(token);
  const emailParam = invitation?.recipientEmail
    ? `&email=${encodeURIComponent(invitation.recipientEmail)}`
    : "";
  const appDeepLink = `fitbud://invite/${safeToken}`;
  const expoWeb = `http://localhost:8081/?invite=${safeToken}${emailParam}`;
  const expired = status === "expired" || status === "revoked" || status === "missing";

  const body = expired
    ? `<h1>This invite link has expired or was already used</h1>
       <p>Ask ${safeName} for a new one.</p>`
    : `<h1>${safeName} invited you to coaching on FitBud</h1>
       <ul>
         <li>Your plan, day by day</li>
         <li>Log meals and workouts in a tap</li>
         <li>${first} sees your progress</li>
       </ul>
       <p><a class="btn" href="${appDeepLink}">Open in FitBud</a></p>
       <p><a href="${expoWeb}">Continue on web</a></p>
       <p class="muted">Have a code instead? Open the app and tap <strong>Have a code?</strong> on the sign-in screen.</p>`;

  return c.html(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Join ${safeName} on FitBud</title>
  <meta name="apple-itunes-app" content="app-id=0, app-argument=${appDeepLink}"/>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#f4f5fb;color:#1a1248;
      margin:0;padding:2rem 1.25rem;line-height:1.45}
    main{max-width:26rem;margin:0 auto;background:#fff;border-radius:20px;
      padding:1.5rem;border:1px solid #e7e9f2}
    h1{font-size:1.35rem;margin:0 0 1rem}
    ul{padding-left:1.1rem;margin:0 0 1.25rem}
    .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;
      padding:0.75rem 1.25rem;background:#4527c6;color:#fff;border-radius:12px;
      text-decoration:none;font-weight:700}
    a{color:#4527c6;font-weight:600}
    .muted{color:#5b616b;font-size:0.9rem}
  </style>
  ${expired ? "" : `<meta http-equiv="refresh" content="0;url=${expoWeb}"/>`}
</head>
<body>
  <main>${body}</main>
</body>
</html>`,
    invitation ? 200 : 404,
  );
});
