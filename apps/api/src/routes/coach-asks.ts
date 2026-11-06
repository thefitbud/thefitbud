import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  answerCoachAskRequestSchema,
  coachAskListResponseSchema,
  coachAskNoteRequestSchema,
  coachAskSchema,
  createCoachAskRequestSchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client.js";
import {
  checkins,
  coachAsks,
  coachingRelationships,
  mealAssignments,
  trainerNotes,
  workoutAssignments,
} from "../db/schema.js";
import { pushTrainerInboxEvent, storeInboxNotification } from "../domain/inbox-notify.js";
import { resolvePushProviderMode } from "../lib/push-provider.js";
import { createId, nowIso } from "../lib/crypto.js";
import { fail, ok } from "../lib/envelope.js";
import { requireWritableRelationship } from "../lib/relationship-write-guard.js";
import { operation } from "../openapi/document.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const coachAskRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

type Db = ReturnType<typeof createDb>;
type AskRow = typeof coachAsks.$inferSelect;

async function resolveItemMeta(
  db: Db,
  ask: AskRow,
): Promise<{ itemLabel: string | null; itemDate: string | null }> {
  if (ask.itemType === "meal_assignment") {
    const [row] = await db
      .select({
        mealName: mealAssignments.mealName,
        localDate: mealAssignments.localDate,
      })
      .from(mealAssignments)
      .where(eq(mealAssignments.id, ask.itemId))
      .limit(1);
    return {
      itemLabel: row?.mealName ?? null,
      itemDate: row?.localDate ?? null,
    };
  }
  if (ask.itemType === "workout_assignment") {
    const [row] = await db
      .select({
        workoutDayName: workoutAssignments.workoutDayName,
        localDate: workoutAssignments.localDate,
      })
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, ask.itemId))
      .limit(1);
    return {
      itemLabel: row?.workoutDayName ?? "Workout",
      itemDate: row?.localDate ?? null,
    };
  }
  if (ask.itemType === "checkin") {
    const [row] = await db
      .select({ localDate: checkins.localDate })
      .from(checkins)
      .where(eq(checkins.id, ask.itemId))
      .limit(1);
    return {
      itemLabel: "Check-in",
      itemDate: row?.localDate ?? null,
    };
  }
  return { itemLabel: null, itemDate: null };
}

async function mapAsk(
  db: Db,
  row: AskRow,
  opts?: { forTrainee?: boolean },
) {
  const meta = await resolveItemMeta(db, row);
  let answerVisibleToClient: boolean | undefined;
  if (row.trainerNoteId) {
    const [note] = await db
      .select({ visibility: trainerNotes.visibility })
      .from(trainerNotes)
      .where(eq(trainerNotes.id, row.trainerNoteId))
      .limit(1);
    answerVisibleToClient = note?.visibility === "client";
  }
  return {
    id: row.id,
    relationshipId: row.relationshipId,
    itemType: row.itemType,
    itemId: row.itemId,
    topic: row.topic,
    status: row.status,
    askCount: row.askCount,
    askedAt: row.askedAt,
    lastAskedAt: row.lastAskedAt,
    itemLabel: meta.itemLabel,
    itemDate: meta.itemDate,
    coachAnswered: row.status === "answered",
    // Trainee never learns about private notes beyond "coach answered".
    answerVisibleToClient: opts?.forTrainee
      ? answerVisibleToClient === true
      : answerVisibleToClient,
  };
}

coachAskRoutes.post(
  "/",
  operation({
    tag: "CoachAsks",
    summary: "Create coach ask",
    description: "Trainee asks the coach about a plan item.",
    roles: ["trainee"],
    body: createCoachAskRequestSchema,
    response: coachAskSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const body = await c.req.json().catch(() => null);
    const parsed = createCoachAskRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid coach ask.");
    }
    const db = createDb(c.env.DB);
    const guard = await requireWritableRelationship(
      c,
      db,
      parsed.data.relationshipId,
    );
    if (!guard.ok) {
      return guard.response;
    }
    const relationship = guard.relationship;
    if (relationship.traineeUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "Not your relationship.");
    }
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const [existing] = await db
      .select()
      .from(coachAsks)
      .where(
        and(
          eq(coachAsks.relationshipId, parsed.data.relationshipId),
          eq(coachAsks.itemId, parsed.data.itemId),
          eq(coachAsks.status, "open"),
        ),
      )
      .limit(1);
    const now = nowIso();
    if (existing && existing.lastAskedAt >= since) {
      await db
        .update(coachAsks)
        .set({
          askCount: existing.askCount + 1,
          lastAskedAt: now,
          topic: parsed.data.topic,
        })
        .where(eq(coachAsks.id, existing.id));
      const [row] = await db
        .select()
        .from(coachAsks)
        .where(eq(coachAsks.id, existing.id))
        .limit(1);
      return ok(c, coachAskSchema.parse(await mapAsk(db, row!)));
    }
    const id = createId();
    await db.insert(coachAsks).values({
      id,
      relationshipId: parsed.data.relationshipId,
      traineeUserId: actor.userId,
      itemType: parsed.data.itemType,
      itemId: parsed.data.itemId,
      topic: parsed.data.topic,
      askedAt: now,
      lastAskedAt: now,
      askCount: 1,
      status: "open",
      answeredAt: null,
      answeredBy: null,
      trainerNoteId: null,
    });
    const stored = await storeInboxNotification(db, {
      recipientUserId: relationship.trainerUserId,
      relationshipId: relationship.id,
      notificationType: "trainer_ask_coach",
      domainEntityId: id,
      dedupeKey: `coach-ask:${id}`,
    });
    if (stored.inserted) {
      await pushTrainerInboxEvent(db, stored.notificationId, {
        pushProviderMode: resolvePushProviderMode(c.env.PUSH_PROVIDER_MODE),
        expoAccessToken: c.env.EXPO_ACCESS_TOKEN,
      });
    }
    const [row] = await db.select().from(coachAsks).where(eq(coachAsks.id, id)).limit(1);
    return ok(c, coachAskSchema.parse(await mapAsk(db, row!)), 201);
  },
);

coachAskRoutes.get(
  "/",
  operation({
    tag: "CoachAsks",
    summary: "List coach asks",
    description: "Open coach asks for trainer or trainee.",
    roles: ["trainer", "trainee"],
    response: coachAskListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const status = c.req.query("status") ?? "open";
    const db = createDb(c.env.DB);
    const rels = await db.select().from(coachingRelationships);
    const forTrainee = actor.selectedRole === "trainee";
    const allowed = rels.filter((rel) =>
      forTrainee
        ? rel.traineeUserId === actor.userId
        : rel.trainerUserId === actor.userId,
    );
    const relIds = allowed.map((rel) => rel.id);
    if (relIds.length === 0) {
      return ok(c, coachAskListResponseSchema.parse({ items: [] }));
    }
    const rows = await db
      .select()
      .from(coachAsks)
      .where(
        and(
          eq(coachAsks.status, status as "open"),
          inArray(coachAsks.relationshipId, relIds),
        ),
      )
      .orderBy(desc(coachAsks.lastAskedAt));
    const items = [];
    for (const row of rows) {
      items.push(await mapAsk(db, row, { forTrainee }));
    }
    return ok(c, coachAskListResponseSchema.parse({ items }));
  },
);

coachAskRoutes.post(
  "/:id/answer",
  operation({
    tag: "CoachAsks",
    summary: "Answer coach ask",
    description: "Trainer answers an open coach ask; optional client-visible note.",
    roles: ["trainer"],
    body: answerCoachAskRequestSchema,
    response: coachAskSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = answerCoachAskRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid answer request.");
    }
    const db = createDb(c.env.DB);
    const [ask] = await db
      .select()
      .from(coachAsks)
      .where(eq(coachAsks.id, c.req.param("id")))
      .limit(1);
    if (!ask) {
      return fail(c, 404, "COACH_ASK_NOT_FOUND", "Coach ask not found.");
    }
    const [rel] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, ask.relationshipId))
      .limit(1);
    if (!rel || rel.trainerUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "Not your coach ask.");
    }
    if (ask.status !== "open") {
      return fail(c, 409, "COACH_ASK_CLOSED", "Coach ask is not open.");
    }
    const now = nowIso();
    const visibleToClient = parsed.data.visibleToClient === true;
    let trainerNoteId: string | null = null;
    if (parsed.data.note?.trim()) {
      trainerNoteId = createId();
      await db.insert(trainerNotes).values({
        id: trainerNoteId,
        coachingRelationshipId: rel.id,
        trainerUserId: actor.userId,
        body: parsed.data.note.trim(),
        visibility: visibleToClient ? "client" : "private",
        subjectType: ask.itemType,
        subjectId: ask.itemId,
        checkinId: null,
        sharedAt: visibleToClient ? now : null,
        seenAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db
      .update(coachAsks)
      .set({
        status: "answered",
        answeredAt: now,
        answeredBy: actor.userId,
        trainerNoteId,
      })
      .where(eq(coachAsks.id, ask.id));
    await storeInboxNotification(db, {
      recipientUserId: rel.traineeUserId,
      relationshipId: rel.id,
      notificationType: "coach_answered",
      domainEntityId: ask.id,
      dedupeKey: `coach-answered:${ask.id}`,
    });
    const [row] = await db.select().from(coachAsks).where(eq(coachAsks.id, ask.id)).limit(1);
    return ok(c, coachAskSchema.parse(await mapAsk(db, row!)));
  },
);

coachAskRoutes.post(
  "/:id/notes",
  operation({
    tag: "CoachAsks",
    summary: "Add note to coach ask",
    description: "Trainer adds a note linked to the ask without answering.",
    roles: ["trainer"],
    body: coachAskNoteRequestSchema,
    response: coachAskSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = coachAskNoteRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid note request.");
    }
    const db = createDb(c.env.DB);
    const [ask] = await db
      .select()
      .from(coachAsks)
      .where(eq(coachAsks.id, c.req.param("id")))
      .limit(1);
    if (!ask) {
      return fail(c, 404, "COACH_ASK_NOT_FOUND", "Coach ask not found.");
    }
    const [rel] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, ask.relationshipId))
      .limit(1);
    if (!rel || rel.trainerUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "Not your coach ask.");
    }
    const noteId = createId();
    const now = nowIso();
    await db.insert(trainerNotes).values({
      id: noteId,
      coachingRelationshipId: rel.id,
      trainerUserId: actor.userId,
      body: parsed.data.note,
      visibility: "private",
      subjectType: ask.itemType,
      subjectId: ask.itemId,
      checkinId: null,
      sharedAt: null,
      seenAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .update(coachAsks)
      .set({ trainerNoteId: noteId })
      .where(eq(coachAsks.id, ask.id));
    const [row] = await db.select().from(coachAsks).where(eq(coachAsks.id, ask.id)).limit(1);
    return ok(c, coachAskSchema.parse(await mapAsk(db, row!)));
  },
);
