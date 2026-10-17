import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { createId, nowIso } from "../lib/crypto.js";
import { recordUnansweredReminderIgnore } from "./reminder-backoff.js";

async function seedUser(
  db: Db,
  input: { id: string; email: string; role: "trainer" | "trainee" },
) {
  const stamp = nowIso();
  await db.insert(schema.users).values({
    id: input.id,
    firebaseUid: `fb-${input.id}`,
    accountState: "active",
    timezone: "Asia/Kolkata",
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(schema.userIdentities).values({
    userId: input.id,
    email: input.email,
    emailNorm: input.email.toLowerCase(),
    mobileE164: null,
    passwordHash: "x",
    passwordUpdatedAt: stamp,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(schema.userRoles).values({
    id: createId(),
    userId: input.id,
    role: input.role,
    createdAt: stamp,
  });
}

describe("reminder backoff state machine", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("pauses reminders and emits reminders_paused on the 5th ignore", async () => {
    const traineeUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const relationshipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    const trainerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
    const stamp = nowIso();
    await seedUser(db, {
      id: traineeUserId,
      email: "trainee@example.com",
      role: "trainee",
    });
    await seedUser(db, {
      id: trainerUserId,
      email: "trainer@example.com",
      role: "trainer",
    });
    await db.insert(schema.coachingRelationships).values({
      id: relationshipId,
      trainerUserId,
      traineeUserId,
      status: "active",
      startedAt: stamp,
      endedAt: null,
      endedByUserId: null,
      endReason: null,
      reactivatedAt: null,
      invitationId: null,
      createdAt: stamp,
      updatedAt: stamp,
    });

    for (let i = 0; i < 5; i += 1) {
      await recordUnansweredReminderIgnore(db, {
        traineeUserId,
        coachingRelationshipId: relationshipId,
        now: stamp,
      });
    }

    const [state] = await db
      .select()
      .from(schema.reminderStates)
      .where(eq(schema.reminderStates.traineeUserId, traineeUserId));
    expect(state?.mode).toBe("paused");
    expect(state?.consecutiveIgnores).toBe(5);
    expect(state?.pausedUntil).not.toBeNull();

    const pausedNotes = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationType, "reminders_paused"));
    expect(pausedNotes.length).toBeGreaterThanOrEqual(1);
  });
});
