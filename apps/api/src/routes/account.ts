import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import {
  accountDeletionResponseSchema,
  accountReactivationResponseSchema,
  accountStatusResponseSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  archiveAccount,
  isFreshDeletionProof,
  loadAccountState,
  reactivateAccount,
  signedInAfterArchive,
} from "../domain/account-deletion.js";
import { nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import { writeStructuredLog } from "../lib/log.js";
import {
  accountArchivedResponse,
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from "../middleware/auth.js";
import { operation } from "../openapi/document.js";
import type { Env, Variables } from "../types.js";
import { accountDeletionPageRoutes } from "./account-deletion-page.js";

/**
 * W6 Z6-14 (D-W6-7, D-W6-8, D-W6-31): delete (archive for 6 months), status and
 * reactivation, plus the public deletion page. The purge is Z6-17's.
 */
export const accountRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

accountRoutes.route("/", accountDeletionPageRoutes);

/**
 * For the two routes an archived account may reach: an active or archived
 * actor passes; a disabled one is refused like everywhere else.
 */
const requireAccountActor = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const actor = c.get("actor");
  if (!actor) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
  }
  if (actor.accountState !== "active" && actor.accountState !== "archived") {
    return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
  }
  await next();
});

accountRoutes.get(
  "/status",
  operation({
    tag: "Account",
    summary: "Returns the account state and, when archived, its purge date.",
    description:
      "Answers for an active or an archived account; it is one of the two routes an archived account can reach. archivedAt and purgeAfter are set exactly when the account is archived. Every other authenticated route answers an archived account with 403 ACCOUNT_ARCHIVED and purgeAfter.",
    response: accountStatusResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAccountActor,
  async (c) => {
    const actor = c.get("actor")!;
    const state = await loadAccountState(createDb(c.env.DB), actor.userId);
    if (!state) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    return ok(
      c,
      accountStatusResponseSchema.parse({
        accountState: state.accountState,
        archivedAt: state.archivedAt,
        purgeAfter: state.purgeAfter,
      }),
    );
  },
);

accountRoutes.post(
  "/deletion",
  operation({
    tag: "Account",
    summary: "Deletes the account: archives it for 6 months.",
    description:
      "Needs a sign-in within the last 5 minutes (the bearer token's sign-in time, or when the web session was issued); otherwise 403 RECENT_SIGN_IN_REQUIRED and the app signs in again first. A trainer with an active client gets 409 ACTIVE_CLIENTS. Otherwise every coaching relationship where the account is the trainee is ended (open exceptions close with coaching_ended), the account is archived with purgeAfter 6 calendar months from now, and every web session and device token is revoked. Data is kept while archived. A retry after success answers 403 ACCOUNT_ARCHIVED with the same purgeAfter.",
    response: accountDeletionResponseSchema,
    errors: [
      { status: 403, description: "RECENT_SIGN_IN_REQUIRED, or ACCOUNT_ARCHIVED with purgeAfter." },
      { status: 409, description: "ACTIVE_CLIENTS: the trainer must end coaching first." },
    ],
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  async (c) => {
    const actor = c.get("actor")!;
    const now = nowIso();
    if (!isFreshDeletionProof(actor.authTime, now)) {
      return fail(
        c,
        403,
        "RECENT_SIGN_IN_REQUIRED",
        "Sign in again, then delete your account within 5 minutes.",
      );
    }
    const db = createDb(c.env.DB);
    const result = await archiveAccount(db, { userId: actor.userId, now });
    if (result.kind === "active_clients") {
      return fail(
        c,
        409,
        "ACTIVE_CLIENTS",
        "End coaching with your clients first.",
      );
    }
    if (result.kind === "not_active") {
      // Archived by a concurrent request: answer like any later request does.
      const state = await loadAccountState(db, actor.userId);
      if (state?.accountState === "archived" && state.purgeAfter) {
        return accountArchivedResponse(c, state.purgeAfter);
      }
      return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
    }
    writeStructuredLog({
      level: "info",
      message: "Account archived",
      requestId: c.get("requestId"),
      operation: "account.archive",
      actorUserId: actor.userId,
    });
    return ok(
      c,
      accountDeletionResponseSchema.parse({
        accountState: "archived",
        archivedAt: result.archivedAt,
        purgeAfter: result.purgeAfter,
      }),
    );
  },
);

accountRoutes.post(
  "/reactivation",
  operation({
    tag: "Account",
    summary: "Brings an archived account back.",
    description:
      "Sets the account active again and clears archivedAt and purgeAfter. Needs a sign-in after the deletion (403 RECENT_SIGN_IN_REQUIRED otherwise). Coaching relationships stay ended; coaching restarts through the existing reactivation and invite flows. Refused with 410 ACCOUNT_DELETED once purgeAfter has passed. An active account gets 200 and nothing changes.",
    response: accountReactivationResponseSchema,
    errors: [
      { status: 403, description: "RECENT_SIGN_IN_REQUIRED: sign in again first." },
      { status: 410, description: "ACCOUNT_DELETED: the account is past its purge date." },
    ],
  }),
  optionalAuthMiddleware,
  requireAccountActor,
  async (c) => {
    const actor = c.get("actor")!;
    const db = createDb(c.env.DB);
    const now = nowIso();
    const state = await loadAccountState(db, actor.userId);
    if (state?.accountState === "archived" && state.archivedAt) {
      if (!signedInAfterArchive(actor.authTime, state.archivedAt)) {
        return fail(
          c,
          403,
          "RECENT_SIGN_IN_REQUIRED",
          "Sign in again to bring your account back.",
        );
      }
    }
    const result = await reactivateAccount(db, { userId: actor.userId, now });
    if (result.kind === "purge_due") {
      return fail(c, 410, "ACCOUNT_DELETED", "This account has been deleted.");
    }
    if (result.kind === "not_archived") {
      return fail(c, 403, "ACCOUNT_DISABLED", "Account is disabled.");
    }
    if (result.kind === "reactivated") {
      writeStructuredLog({
        level: "info",
        message: "Account reactivated",
        requestId: c.get("requestId"),
        operation: "account.reactivate",
        actorUserId: actor.userId,
      });
    }
    return ok(c, accountReactivationResponseSchema.parse({ accountState: "active" }));
  },
);
