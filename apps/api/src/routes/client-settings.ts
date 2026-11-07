import { Hono } from "hono";
import type { ZodTypeAny } from "zod";
import {
  clientSettingsResponseSchema,
  clientSettingsSubscriptionSchema,
  createPaymentRecordRequestSchema,
  paymentRecordSchema,
  putClientSubscriptionRequestSchema,
  updateClientBasicsRequestSchema,
  updatePaymentRecordRequestSchema,
} from "@fitbud/contracts";
import { normalizeWhatsappE164 } from "@fitbud/core";
import { operation } from "../openapi/document";
import { createDb, type Db } from "../db/client";
import { nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok, type AppContext } from "../lib/envelope";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import {
  CLIENT_SETTINGS_BASICS_OPERATION,
  CLIENT_SETTINGS_PAYMENT_CREATE_OPERATION,
  CLIENT_SETTINGS_PAYMENT_UPDATE_OPERATION,
  CLIENT_SETTINGS_SUBSCRIPTION_OPERATION,
  applyPaymentPatch,
  createPaymentRecord,
  findReceipt,
  latestSubscriptionVersion,
  loadClientSettings,
  loadOwnedRelationship,
  loadRelationshipPayment,
  saveClientBasics,
  saveSubscriptionVersion,
  updatePaymentRecord,
} from "../domain/client-settings";
import type { Env, Variables } from "../types";

/**
 * Z6-8 (v13 B3b): client settings for a trainer-owned relationship. Tracking only
 * (D-W6-5): subscription terms and payment records, never a collection, invoice,
 * reminder-to-pay or gateway. Z6-8b adds the trainer-owned client name and contact
 * phone (PATCH /basic, D-W6-42). Only the owning trainer reads or writes; an ended
 * relationship stays readable and answers 409 to every write. Error messages are
 * static and nothing here is logged.
 */
export const clientSettingsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const relationshipNotFound = (c: AppContext) =>
  fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
const relationshipEnded = (c: AppContext) =>
  fail(c, 409, "RELATIONSHIP_ENDED", "Coaching relationship has ended.");
const keyReused = (c: AppContext) =>
  fail(
    c,
    409,
    "IDEMPOTENCY_KEY_REUSE",
    "Idempotency key was reused with a different request.",
  );

function idempotencyKeyOf(c: AppContext): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

async function parseBody<T extends ZodTypeAny>(c: AppContext, schema: T) {
  return schema.safeParse(await c.req.json().catch(() => undefined));
}

/**
 * Runs a write once per idempotency key: replays the stored answer, rejects a
 * key reused with another body, and when a concurrent request with the same key
 * won the race (the whole batch rolled back) answers with that request's result.
 */
async function idempotentWrite(
  c: AppContext,
  db: Db,
  lookup: { actorUserId: string; operation: string; idempotencyKey: string; fingerprint: string },
  run: () => Promise<Response>,
): Promise<Response> {
  const prior = await findReceipt(db, lookup);
  if (prior.kind === "reuse") return keyReused(c);
  if (prior.kind === "replay") {
    return c.json(prior.body as object, prior.status as 200);
  }
  try {
    return await run();
  } catch (error) {
    const raced = await findReceipt(db, lookup);
    if (raced.kind === "replay") {
      return c.json(raced.body as object, raced.status as 200);
    }
    if (raced.kind === "reuse") return keyReused(c);
    throw error;
  }
}

clientSettingsRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Subscriptions",
    summary: "Reads a client's settings: basic details, current subscription and payment records.",
    description:
      "Returns the client's basic details as stored, the newest subscription version (amount, type, coaching mode, dates and renewal state in the trainer's timezone) and every payment record, newest due date first. Payment records are tracking only. Ended relationships stay readable and are marked read-only.",
    roles: ["trainer"],
    response: clientSettingsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadOwnedRelationship(
      db,
      c.req.param("relationshipId"),
      actor.userId,
    );
    if (!relationship) return relationshipNotFound(c);
    return ok(c, await loadClientSettings(db, relationship, nowIso()));
  },
);

clientSettingsRoutes.put(
  "/relationships/:relationshipId/subscription",
  operation({
    tag: "Subscriptions",
    summary: "Saves a client's subscription as a new version.",
    description:
      "Creates subscription version expectedVersion + 1 with the plan name, payment frequency, start and renewal dates, amount (paise, 0 or more), subscription type and coaching mode. Earlier versions are never edited, and renewals read the newest version. The renewal date must be after the start date. A stale expectedVersion answers 409 SUBSCRIPTION_VERSION_CONFLICT; an ended relationship answers 409 RELATIONSHIP_ENDED. Tracking only: nothing is collected.",
    roles: ["trainer"],
    idempotency: true,
    body: putClientSubscriptionRequestSchema,
    response: clientSettingsSubscriptionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = idempotencyKeyOf(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadOwnedRelationship(
      db,
      c.req.param("relationshipId"),
      actor.userId,
    );
    if (!relationship) return relationshipNotFound(c);
    const parsed = await parseBody(c, putClientSubscriptionRequestSchema);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid subscription request.", {
        issues: parsed.error.issues,
      });
    }
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId: relationship.id, ...parsed.data }),
    );
    return idempotentWrite(
      c,
      db,
      {
        actorUserId: actor.userId,
        operation: CLIENT_SETTINGS_SUBSCRIPTION_OPERATION,
        idempotencyKey,
        fingerprint,
      },
      async () => {
        if (relationship.status === "ended") return relationshipEnded(c);
        const current = await latestSubscriptionVersion(db, relationship.id);
        const currentVersion = current?.versionNumber ?? 0;
        if (currentVersion !== parsed.data.expectedVersion) {
          return fail(
            c,
            409,
            "SUBSCRIPTION_VERSION_CONFLICT",
            "Subscription was changed after this version was loaded.",
            { expectedVersion: parsed.data.expectedVersion, currentVersion },
          );
        }
        const result = await saveSubscriptionVersion(
          db,
          relationship,
          currentVersion,
          parsed.data,
          { actorUserId: actor.userId, idempotencyKey, fingerprint, now: nowIso() },
        );
        return c.json(result.body, result.status);
      },
    );
  },
);

clientSettingsRoutes.post(
  "/relationships/:relationshipId/payments",
  operation({
    tag: "Subscriptions",
    summary: "Records a payment against the client's current subscription (tracking only).",
    description:
      "Adds a payment record to the newest subscription version: amount in paise (more than 0), due date, status paid or unpaid, and for paid records the paid date and method (cash, UPI or bank). An unpaid record has no paid date or method. Without a subscription the call answers 409 SUBSCRIPTION_REQUIRED; an ended relationship answers 409 RELATIONSHIP_ENDED. FitBud never collects the payment.",
    roles: ["trainer"],
    idempotency: true,
    body: createPaymentRecordRequestSchema,
    response: paymentRecordSchema,
    successStatus: 201,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = idempotencyKeyOf(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadOwnedRelationship(
      db,
      c.req.param("relationshipId"),
      actor.userId,
    );
    if (!relationship) return relationshipNotFound(c);
    const parsed = await parseBody(c, createPaymentRecordRequestSchema);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid payment record.", {
        issues: parsed.error.issues,
      });
    }
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId: relationship.id, ...parsed.data }),
    );
    return idempotentWrite(
      c,
      db,
      {
        actorUserId: actor.userId,
        operation: CLIENT_SETTINGS_PAYMENT_CREATE_OPERATION,
        idempotencyKey,
        fingerprint,
      },
      async () => {
        if (relationship.status === "ended") return relationshipEnded(c);
        const subscription = await latestSubscriptionVersion(db, relationship.id);
        if (!subscription) {
          return fail(
            c,
            409,
            "SUBSCRIPTION_REQUIRED",
            "Save a subscription before recording payments.",
          );
        }
        const result = await createPaymentRecord(
          db,
          relationship,
          subscription.id,
          parsed.data,
          { actorUserId: actor.userId, idempotencyKey, fingerprint, now: nowIso() },
        );
        return c.json(result.body, result.status);
      },
    );
  },
);

clientSettingsRoutes.patch(
  "/relationships/:relationshipId/payments/:paymentId",
  operation({
    tag: "Subscriptions",
    summary: "Marks a payment record paid or unpaid, or changes its paid date, method or note.",
    description:
      "Changes only status, paid date, method and note. Marking paid needs a paid date and method (sent now or already stored). Going back to unpaid clears the paid date and method; sending either with unpaid is rejected. Another relationship's payment answers 404; an ended relationship answers 409 RELATIONSHIP_ENDED. Tracking only.",
    roles: ["trainer"],
    idempotency: true,
    body: updatePaymentRecordRequestSchema,
    response: paymentRecordSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = idempotencyKeyOf(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadOwnedRelationship(
      db,
      c.req.param("relationshipId"),
      actor.userId,
    );
    if (!relationship) return relationshipNotFound(c);
    const parsed = await parseBody(c, updatePaymentRecordRequestSchema);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid payment update.", {
        issues: parsed.error.issues,
      });
    }
    const paymentId = c.req.param("paymentId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId: relationship.id, paymentId, ...parsed.data }),
    );
    return idempotentWrite(
      c,
      db,
      {
        actorUserId: actor.userId,
        operation: CLIENT_SETTINGS_PAYMENT_UPDATE_OPERATION,
        idempotencyKey,
        fingerprint,
      },
      async () => {
        if (relationship.status === "ended") return relationshipEnded(c);
        const current = await loadRelationshipPayment(db, relationship.id, paymentId);
        if (!current) {
          return fail(c, 404, "PAYMENT_NOT_FOUND", "Payment record not found.");
        }
        const patch = applyPaymentPatch(current, parsed.data);
        if (!patch.ok) {
          return patch.reason === "paid_needs_date_and_method"
            ? fail(
                c,
                400,
                "PAYMENT_PAID_DETAILS_REQUIRED",
                "A paid record needs a paid date and a method.",
              )
            : fail(
                c,
                400,
                "PAYMENT_UNPAID_HAS_DETAILS",
                "An unpaid record has no paid date or method.",
              );
        }
        const result = await updatePaymentRecord(db, current, patch.next, {
          actorUserId: actor.userId,
          idempotencyKey,
          fingerprint,
          now: nowIso(),
        });
        return c.json(result.body, result.status);
      },
    );
  },
);

clientSettingsRoutes.patch(
  "/relationships/:relationshipId/basic",
  operation({
    tag: "Subscriptions",
    summary: "Sets or clears the name and contact phone the trainer keeps for this client.",
    description:
      "Changes only the trainer-owned client name and contact phone stored on this coaching relationship. Each field is optional and null clears it; at least one must be sent. The name is trimmed, 1 to 120 characters. The phone is normalised and stored as +<digits>; a number that does not normalise answers 400. The client's own profile name and sign-in phone never change, and the client never sees these values. Returns the updated client settings. An ended relationship answers 409 RELATIONSHIP_ENDED.",
    roles: ["trainer"],
    idempotency: true,
    body: updateClientBasicsRequestSchema,
    response: clientSettingsResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const idempotencyKey = idempotencyKeyOf(c);
    if (!idempotencyKey) {
      return fail(c, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }
    const db = createDb(c.env.DB);
    const relationship = await loadOwnedRelationship(
      db,
      c.req.param("relationshipId"),
      actor.userId,
    );
    if (!relationship) return relationshipNotFound(c);
    const parsed = await parseBody(c, updateClientBasicsRequestSchema);
    if (!parsed.success) {
      // For this schema the issues carry paths, codes and bounds, never the sent text.
      return fail(c, 400, "INVALID_REQUEST", "Invalid client details.", {
        issues: parsed.error.issues,
      });
    }
    let contactPhoneE164 = relationship.contactPhoneE164;
    if (parsed.data.contactPhone !== undefined) {
      if (parsed.data.contactPhone === null) {
        contactPhoneE164 = null;
      } else {
        const digits = normalizeWhatsappE164(parsed.data.contactPhone);
        if (!digits) {
          return fail(c, 400, "INVALID_REQUEST", "Contact phone is not a valid phone number.");
        }
        contactPhoneE164 = `+${digits}`;
      }
    }
    const clientDisplayName =
      parsed.data.displayName !== undefined
        ? parsed.data.displayName
        : relationship.clientDisplayName;
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId: relationship.id, ...parsed.data }),
    );
    return idempotentWrite(
      c,
      db,
      {
        actorUserId: actor.userId,
        operation: CLIENT_SETTINGS_BASICS_OPERATION,
        idempotencyKey,
        fingerprint,
      },
      async () => {
        if (relationship.status === "ended") return relationshipEnded(c);
        const result = await saveClientBasics(
          db,
          relationship,
          { clientDisplayName, contactPhoneE164 },
          { actorUserId: actor.userId, idempotencyKey, fingerprint, now: nowIso() },
        );
        return c.json(result.body, result.status);
      },
    );
  },
);

// Every other path stays a static 404.
clientSettingsRoutes.all("*", (c) =>
  fail(c, 404, "not_implemented", "This endpoint is not available yet."),
);
