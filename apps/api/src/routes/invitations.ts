import { and, desc, eq, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  invitationListResponseSchema,
  invitationSchema,
} from "@fitbud/contracts";
import { createDb, type Db } from "../db/client";
import {
  clientInvitations,
  coachingRelationships,
  users,
} from "../db/schema";
import {
  ensureRoleAndProfile,
  findOrCreateUserFromFirebase,
  loadActorByUserId,
} from "../auth/identity";
import { verifyFirebaseIdToken } from "../auth/firebase";
import {
  mapInvitation,
  mapInvitationWithRelationshipStatus,
  mapRelationship,
  normalizeEmail,
} from "../domain/mappers";
import { buildPage, decodeCursor } from "../lib/cursor";
import {
  addDaysIso,
  createId,
  createSessionToken,
  nowIso,
  sha256Hex,
} from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import type { Env, Variables } from "../types";

const INVITE_CREATE_OPERATION = "invitation.create";
const DEFAULT_INVITE_DAYS = 14;

export const invitationRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

invitationRoutes.post(
  "/",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createInvitationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid invitation request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to create an invitation.",
      );
    }

    const fingerprint = await sha256Hex(
      JSON.stringify({
        recipientEmail: normalizeEmail(parsed.data.recipientEmail),
        recipientDisplayName: parsed.data.recipientDisplayName ?? null,
        expiresInDays: parsed.data.expiresInDays ?? DEFAULT_INVITE_DAYS,
      }),
    );

    const db = createDb(c.env.DB);
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: INVITE_CREATE_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 200);
    }

    const token = createSessionToken();
    const tokenHash = await sha256Hex(token);
    const timestamp = nowIso();
    const expiresAt = addDaysIso(
      parsed.data.expiresInDays ?? DEFAULT_INVITE_DAYS,
    );
    const invitationId = createId();
    const recipientEmail = normalizeEmail(parsed.data.recipientEmail);

    await db.insert(clientInvitations).values({
      id: invitationId,
      trainerUserId: actor.userId,
      recipientEmail,
      recipientDisplayName: parsed.data.recipientDisplayName ?? null,
      tokenHash,
      status: "pending",
      expiresAt,
      acceptedUserId: null,
      coachingRelationshipId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const rows = await db
      .select()
      .from(clientInvitations)
      .where(eq(clientInvitations.id, invitationId))
      .limit(1);
    const row = rows[0]!;
    const data = createInvitationResponseSchema.parse({
      ...mapInvitation(row),
      token,
    });
    const responseBody = { data };

    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: INVITE_CREATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });

    return ok(c, data);
  },
);

invitationRoutes.get(
  "/",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50)
      : 20;
    const cursor = c.req.query("cursor");
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      return fail(c, 400, "INVALID_CURSOR", "Cursor is invalid.");
    }

    const db = createDb(c.env.DB);
    const conditions = [eq(clientInvitations.trainerUserId, actor.userId)];
    if (decoded) {
      conditions.push(
        or(
          lt(clientInvitations.createdAt, decoded.k),
          and(
            eq(clientInvitations.createdAt, decoded.k),
            lt(clientInvitations.id, decoded.id),
          ),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(clientInvitations)
      .where(and(...conditions))
      .orderBy(desc(clientInvitations.createdAt), desc(clientInvitations.id))
      .limit(limit + 1);

    const page = buildPage(rows, limit, (item) => item.createdAt);
    const items = page.items.map((row) => mapInvitation(row));
    return ok(
      c,
      invitationListResponseSchema.parse({
        items,
        nextCursor: page.nextCursor,
      }),
    );
  },
);

invitationRoutes.get(
  "/:invitationId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const invitationId = c.req.param("invitationId");
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(clientInvitations)
      .where(eq(clientInvitations.id, invitationId))
      .limit(1);
    const row = rows[0];
    if (!row || row.trainerUserId !== actor.userId) {
      return fail(c, 404, "INVITATION_NOT_FOUND", "Invitation not found.");
    }

    let relationshipStatus: (typeof coachingRelationships.$inferSelect)["status"] | null =
      null;
    if (row.coachingRelationshipId) {
      const relationships = await db
        .select({ status: coachingRelationships.status })
        .from(coachingRelationships)
        .where(eq(coachingRelationships.id, row.coachingRelationshipId))
        .limit(1);
      relationshipStatus = relationships[0]?.status ?? null;
    }

    return ok(
      c,
      invitationSchema.parse(
        mapInvitationWithRelationshipStatus(row, relationshipStatus),
      ),
    );
  },
);

/**
 * Accept an invitation. Creates/links the FitBud user from the Firebase bearer
 * token when the trainee does not yet exist.
 */
invitationRoutes.post("/accept", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = acceptInvitationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, "INVALID_REQUEST", "Invalid accept invitation request.", {
      issues: parsed.error.issues,
    });
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return fail(c, 401, "UNAUTHENTICATED", "Bearer token required to accept an invitation.");
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  const identity = await verifyFirebaseIdToken(idToken, {
    projectId: c.env.FIREBASE_PROJECT_ID,
    authMode: c.env.AUTH_MODE === "firebase" ? "firebase" : "test",
  });
  if (!identity) {
    return fail(c, 401, "INVALID_TOKEN", "Firebase identity token was rejected.");
  }

  const db = createDb(c.env.DB);
  const tokenHash = await sha256Hex(parsed.data.token);
  const invitations = await db
    .select()
    .from(clientInvitations)
    .where(eq(clientInvitations.tokenHash, tokenHash))
    .limit(1);
  const invitation = invitations[0];
  if (!invitation) {
    return fail(c, 404, "INVITATION_NOT_FOUND", "Invitation not found.");
  }

  const timestamp = nowIso();
  if (invitation.status === "accepted" && invitation.coachingRelationshipId) {
    // Idempotent accept for the same trainee token holder.
    const { userId } = await findOrCreateUserFromFirebase(
      db,
      identity,
      parsed.data.timezone ?? "UTC",
    );
    if (invitation.acceptedUserId && invitation.acceptedUserId !== userId) {
      return fail(
        c,
        409,
        "INVITATION_ALREADY_ACCEPTED",
        "Invitation was already accepted by another user.",
      );
    }
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, invitation.coachingRelationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }
    return ok(
      c,
      acceptInvitationResponseSchema.parse({
        invitation: mapInvitationWithRelationshipStatus(
          invitation,
          relationship.status,
        ),
        relationship: mapRelationship(relationship),
      }),
    );
  }

  if (invitation.status !== "pending") {
    return fail(
      c,
      409,
      "INVITATION_NOT_ACCEPTABLE",
      "Invitation is not in an acceptable state.",
      { status: invitation.status },
    );
  }

  if (invitation.expiresAt <= timestamp) {
    await db
      .update(clientInvitations)
      .set({ status: "expired", updatedAt: timestamp })
      .where(eq(clientInvitations.id, invitation.id));
    return fail(c, 409, "INVITATION_EXPIRED", "Invitation has expired.");
  }

  const { userId } = await findOrCreateUserFromFirebase(
    db,
    identity,
    parsed.data.timezone ?? "UTC",
  );

  if (userId === invitation.trainerUserId) {
    return fail(
      c,
      400,
      "INVALID_ACCEPTANCE",
      "A trainer cannot accept their own invitation.",
    );
  }

  const displayName =
    parsed.data.displayName ??
    invitation.recipientDisplayName ??
    identity.email?.split("@")[0] ??
    "Trainee";

  await ensureRoleAndProfile(db, {
    userId,
    role: "trainee",
    displayName,
  });

  if (parsed.data.timezone) {
    await db
      .update(users)
      .set({ timezone: parsed.data.timezone, updatedAt: timestamp })
      .where(eq(users.id, userId));
  }

  const existingRelationship = await db
    .select()
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.trainerUserId, invitation.trainerUserId),
        eq(coachingRelationships.traineeUserId, userId),
      ),
    )
    .limit(1);

  let relationship = existingRelationship[0];
  if (!relationship) {
    const relationshipId = createId();
    await db.insert(coachingRelationships).values({
      id: relationshipId,
      trainerUserId: invitation.trainerUserId,
      traineeUserId: userId,
      status: "onboarding_pending",
      invitationId: invitation.id,
      startedAt: timestamp,
      endedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const created = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    relationship = created[0]!;
  }

  await db
    .update(clientInvitations)
    .set({
      status: "accepted",
      acceptedUserId: userId,
      coachingRelationshipId: relationship.id,
      updatedAt: timestamp,
    })
    .where(eq(clientInvitations.id, invitation.id));

  const updatedInvitation = (
    await db
      .select()
      .from(clientInvitations)
      .where(eq(clientInvitations.id, invitation.id))
      .limit(1)
  )[0]!;

  // Load actor so subsequent bearer calls succeed for this Firebase UID.
  await loadActorByUserId(db, {
    userId,
    surface: "mobile",
    authMethod: "bearer",
    requestedRole: "trainee",
  });

  return ok(
    c,
    acceptInvitationResponseSchema.parse({
      invitation: mapInvitationWithRelationshipStatus(
        updatedInvitation,
        relationship.status,
      ),
      relationship: mapRelationship(relationship),
    }),
  );
});

export async function getOwnedInvitation(
  db: Db,
  invitationId: string,
  trainerUserId: string,
) {
  const rows = await db
    .select()
    .from(clientInvitations)
    .where(eq(clientInvitations.id, invitationId))
    .limit(1);
  const row = rows[0];
  if (!row || row.trainerUserId !== trainerUserId) {
    return null;
  }
  return row;
}
