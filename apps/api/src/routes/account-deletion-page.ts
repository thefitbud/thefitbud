import { Hono } from "hono";
import { operation } from "../openapi/document";
import type { Env, Variables } from "../types";

/**
 * Z6-14: public account-deletion page for the Google Play listing. Static HTML
 * with the spec's exact text; it reads no data and needs no sign-in.
 */
export const ACCOUNT_DELETION_PAGE_TEXT = [
  "Delete your account in the FitBud app: More → Privacy → Delete account.",
  "Your account is archived for 6 months and you can bring it back by signing in again.",
  "After 6 months it is deleted for good.",
  "To delete it permanently straight away, email tech@thefitbud.com from the email or phone number on your account.",
] as const;

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Delete your FitBud account</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem 1rem;max-width:36rem;margin:auto;line-height:1.5;color:#1a1a1a;background:#fff">
<h1>Delete your FitBud account</h1>
<p>${ACCOUNT_DELETION_PAGE_TEXT[0]} ${ACCOUNT_DELETION_PAGE_TEXT[1]} ${ACCOUNT_DELETION_PAGE_TEXT[2]} ${ACCOUNT_DELETION_PAGE_TEXT[3].replace(
  "tech@thefitbud.com",
  '<a href="mailto:tech@thefitbud.com">tech@thefitbud.com</a>',
)}</p>
</body>
</html>`;

export const accountDeletionPageRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

accountDeletionPageRoutes.get(
  "/delete",
  operation({
    tag: "Account",
    summary: "Public account deletion page",
    description:
      "Public HTML page for the store listing that explains how to delete a FitBud account: in the app, archived for 6 months and reactivatable by signing in again, then deleted for good; permanent deletion straight away by email. Reads no data.",
    security: "public",
    defaultErrors: false,
    html: true,
    successDescription: "HTML account deletion page.",
  }),
  (c) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.html(PAGE_HTML);
  },
);
