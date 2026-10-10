import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GLOBAL_CHECKIN_FORM_VERSION_ID,
  addDaysToLocalDate,
  formatLocalDate,
  weekdayFromLocalDate,
} from "@fitbud/core";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { getTestDbOverride, setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of [
    "0000_identity.sql",
    "0001_relationship_onboarding.sql",
    "0012_invitation_whatsapp.sql",
    "0002_coaching_configuration.sql",
    "0003_plans.sql",
    "0004_workouts.sql",
    "0005_meals.sql",
    "0006_checkins.sql",
    "0007_exceptions.sql",
    "0008_progress_media.sql",
    "0009_sync.sql",
    "0010_notifications.sql",
    "0013_domain_contracts.sql",
    "0014_onboarding_form_templates.sql",
    "0011_templates_libraries.sql",
    "0015_iteration_a.sql",
    "0016_food_exercise_libraries.sql",
    "0017_plan_template_ownership.sql",
    "0018_assignment_schedule_status.sql",
    "0019_checkin_form_templates.sql",
    "0020_exception_severity.sql",
  ]) {
    sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return { db, close: () => sqlite.close() };
}

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

async function readJson(response: Response): Promise<{ status: number; body: Record<string, any> }> {
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, any>) : {},
  };
}

describe("invitation through ended relationship", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("pins a form, publishes a forked plan, records execution, and blocks writes after the relationship ends", async () => {
    const trainerToken = createTestIdToken(
      "trainer-gate6-coach@example.com",
      "gate6-coach@example.com",
    );
    const sessionResponse = await app.request(
      "/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: trainerToken, timezone: "Asia/Kolkata" }),
      },
      testEnv(),
    );
    expect(sessionResponse.status).toBe(200);
    const setCookie = sessionResponse.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    const cookie = setCookie!.split(";")[0]!;

    const forms = await readJson(
      await app.request(
        "/onboarding/form-templates?limit=50",
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    expect(forms.status).toBe(200);
    const globalForm = forms.body.data.items.find(
      (item: { ownership: string }) => item.ownership === "global",
    );
    expect(globalForm).toBeTruthy();

    const forkedForm = await readJson(
      await app.request(
        `/onboarding/form-templates/${globalForm.id}/fork`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-onboarding-fork",
          },
          body: JSON.stringify({ name: "Gate 6 intake" }),
        },
        testEnv(),
      ),
    );
    expect(forkedForm.status).toBe(201);
    const pinnedVersionId = forkedForm.body.data.versions[0].id as string;

    const invited = await readJson(
      await app.request(
        "/invitations",
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-invite",
          },
          body: JSON.stringify({
            recipientEmail: "gate6-trainee@example.com",
            recipientDisplayName: "Gate Six",
            onboardingFormTemplateId: forkedForm.body.data.id,
          }),
        },
        testEnv(),
      ),
    );
    expect(invited.status, JSON.stringify(invited.body)).toBe(200);
    expect(invited.body.data.onboardingFormTemplateVersionId).toBe(pinnedVersionId);

    const laterVersion = await readJson(
      await app.request(
        `/onboarding/form-templates/${forkedForm.body.data.id}/versions`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-onboarding-v2",
          },
          body: JSON.stringify({
            fields: [
              {
                id: "emergency_contact",
                type: "short_text",
                label: "Emergency contact",
                required: true,
                maxLength: 120,
              },
            ],
          }),
        },
        testEnv(),
      ),
    );
    expect(laterVersion.status).toBe(201);
    expect(laterVersion.body.data.versions.at(-1).id).not.toBe(pinnedVersionId);

    const traineeToken = createTestIdToken(
      "trainee-gate6-trainee@example.com",
      "gate6-trainee@example.com",
    );
    const accepted = await readJson(
      await app.request(
        "/invitations/accept",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${traineeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: invited.body.data.token,
            displayName: "Gate Six",
            timezone: "Asia/Kolkata",
          }),
        },
        testEnv(),
      ),
    );
    expect(accepted.status).toBe(200);
    const relationshipId = accepted.body.data.relationship.id as string;
    const traineeHeaders = {
      Authorization: `Bearer ${traineeToken}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
    };

    const incomplete = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/draft`,
        {
          method: "PUT",
          headers: traineeHeaders,
          body: JSON.stringify({
            expectedVersion: 0,
            answers: { goals: "Get stronger" },
          }),
        },
        testEnv(),
      ),
    );
    expect(incomplete.status, JSON.stringify(incomplete.body)).toBe(201);
    const rejected = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/submit`,
        {
          method: "POST",
          headers: {
            ...traineeHeaders,
            "Idempotency-Key": "gate6-submit-incomplete",
          },
          body: JSON.stringify({ expectedVersion: incomplete.body.data.version }),
        },
        testEnv(),
      ),
    );
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe("ONBOARDING_INCOMPLETE");
    expect(rejected.body.error.details.missingFieldIds).toContain("schedule");

    const drafted = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/draft`,
        {
          method: "PUT",
          headers: traineeHeaders,
          body: JSON.stringify({
            expectedVersion: incomplete.body.data.version,
            answers: {
              goals: "Get stronger on the main lifts.",
              relevant_history: "No current injuries.",
              preferences: "Morning barbell sessions.",
              schedule: "Monday, Wednesday, and Friday.",
              limitations: "None.",
            },
          }),
        },
        testEnv(),
      ),
    );
    expect(drafted.status).toBe(200);
    expect(drafted.body.data.onboardingFormVersionId).toBe(pinnedVersionId);
    const submitted = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/submit`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-submit" },
          body: JSON.stringify({ expectedVersion: drafted.body.data.version }),
        },
        testEnv(),
      ),
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("submitted");
    expect(submitted.body.data.onboardingFormVersionId).toBe(pinnedVersionId);

    const reviewed = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/review`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-review",
          },
          body: JSON.stringify({ outcome: "coaching_ready" }),
        },
        testEnv(),
      ),
    );
    expect(reviewed.status).toBe(200);

    const configuration = await readJson(
      await app.request(
        `/configurations/relationships/${relationshipId}/draft`,
        {
          method: "PUT",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: 0,
            goalShort: "Build strength",
          }),
        },
        testEnv(),
      ),
    );
    expect(configuration.status).toBe(201);
    expect(configuration.body.data.workout.sessionsPerWeek).toBe(3);
    expect(configuration.body.data.nutrition.mealsPerDay).toBe(3);
    expect(configuration.body.data.nutrition.confirmationWindowHours).toBe(6);
    expect(configuration.body.data.checkin.cadence).toBe("weekly");
    expect(configuration.body.data.tracking.requireBodyWeight).toBe(false);

    const configured = await readJson(
      await app.request(
        `/configurations/relationships/${relationshipId}/configure`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-configure",
          },
          body: JSON.stringify({
            expectedVersion: configuration.body.data.recordVersion,
          }),
        },
        testEnv(),
      ),
    );
    expect(configured.status).toBe(200);
    const activated = await readJson(
      await app.request(
        `/configurations/relationships/${relationshipId}/activate`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-activate",
          },
          body: JSON.stringify({
            expectedVersion: configured.body.data.recordVersion,
          }),
        },
        testEnv(),
      ),
    );
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe("active");

    const templates = await readJson(
      await app.request(
        "/templates?limit=50",
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    const globalTemplate = templates.body.data.items.find(
      (item: { ownership: string; title: string }) =>
        item.ownership === "global" && item.title === "Base training and meals",
    );
    expect(globalTemplate).toBeTruthy();
    const forkedTemplate = await readJson(
      await app.request(
        `/templates/${globalTemplate.id}/fork`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-template-fork",
          },
          body: JSON.stringify({ title: "Gate 6 combined" }),
        },
        testEnv(),
      ),
    );
    expect(forkedTemplate.status).toBe(201);
    expect(forkedTemplate.body.data.ownership).toBe("trainer");

    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const weekday = weekdayFromLocalDate(today);
    const sourceContent = forkedTemplate.body.data.content;
    const firstDay = sourceContent.workoutDays[0];
    const secondDay = {
      ...firstDay,
      id: "a2222222-2222-4222-8222-222222222222",
      order: 2,
      name: "Second full body",
      weekday,
      exercises: firstDay.exercises.map((exercise: { id: string; setTargets: { id: string }[] }) => ({
        ...exercise,
        id: "a3333333-3333-4333-8333-333333333333",
        setTargets: exercise.setTargets.map((set) => ({
          ...set,
          id: "a4444444-4444-4444-8444-444444444444",
        })),
      })),
    };
    const scheduledContent = {
      ...sourceContent,
      workoutDays: [{ ...firstDay, weekday }, secondDay],
      mealPrescriptions: sourceContent.mealPrescriptions.map(
        (meal: { name: string }) => ({
          ...meal,
          mealType: "breakfast",
          applicableWeekdays: [weekday],
          localTime: "08:00",
          scheduleHint: null,
        }),
      ),
    };
    expect(scheduledContent.mealPrescriptions[0].items[0].snapshotKind).toBe(
      "calculated",
    );

    const savedTemplate = await readJson(
      await app.request(
        `/templates/${forkedTemplate.body.data.id}`,
        {
          method: "PUT",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRecordVersion: forkedTemplate.body.data.recordVersion,
            content: scheduledContent,
          }),
        },
        testEnv(),
      ),
    );
    expect(savedTemplate.status, JSON.stringify(savedTemplate.body)).toBe(200);

    const applied = await readJson(
      await app.request(
        `/plans/relationships/${relationshipId}/from-template`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-apply",
          },
          body: JSON.stringify({ templateId: forkedTemplate.body.data.id }),
        },
        testEnv(),
      ),
    );
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    expect(applied.body.data.version.creationSource).toBe("template");
    expect(applied.body.data.version.sourceTemplateId).toBe(forkedTemplate.body.data.id);
    const planId = applied.body.data.plan.id as string;
    const publishedVersionId = applied.body.data.version.id as string;

    const published = await readJson(
      await app.request(
        `/plans/${planId}/versions/${publishedVersionId}/publish`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-publish",
          },
          body: JSON.stringify({
            expectedRecordVersion: applied.body.data.version.recordVersion,
            mode: "immediate",
          }),
        },
        testEnv(),
      ),
    );
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    const publishedVersion = await readJson(
      await app.request(
        `/plans/${planId}/versions/${publishedVersionId}`,
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    expect(publishedVersion.status).toBe(200);
    const publishedContent = publishedVersion.body.data.content;
    expect(publishedContent.workoutDays.map((day: { weekday: number }) => day.weekday)).toEqual([
      weekday,
      weekday,
    ]);
    expect(publishedContent.mealPrescriptions[0].mealType).toBe("breakfast");
    expect(publishedContent.mealPrescriptions[0].items[0].snapshotKind).toBe(
      "calculated",
    );

    const immutable = await readJson(
      await app.request(
        `/plans/${planId}/versions/${publishedVersionId}`,
        {
          method: "PUT",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRecordVersion: publishedVersion.body.data.recordVersion,
            content: {
              ...publishedContent,
              workoutDays: publishedContent.workoutDays.map(
                (day: { name: string }) => ({ ...day, name: "Renamed" }),
              ),
            },
          }),
        },
        testEnv(),
      ),
    );
    expect(immutable.status).toBe(409);
    expect(immutable.body.error.code).toBe("PLAN_VERSION_IMMUTABLE");

    const rangeEnd = addDaysToLocalDate(today, 6);
    const generatedWorkouts = await readJson(
      await app.request(
        `/workouts/relationships/${relationshipId}/assignments/generate`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-workouts",
          },
          body: JSON.stringify({ fromDate: today, toDate: rangeEnd }),
        },
        testEnv(),
      ),
    );
    expect(generatedWorkouts.status, JSON.stringify(generatedWorkouts.body)).toBe(200);
    const generatedMeals = await readJson(
      await app.request(
        `/meals/relationships/${relationshipId}/assignments/generate`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-meals",
          },
          body: JSON.stringify({ fromDate: today, toDate: rangeEnd }),
        },
        testEnv(),
      ),
    );
    expect(generatedMeals.status, JSON.stringify(generatedMeals.body)).toBe(200);

    const workouts = await readJson(
      await app.request(
        `/workouts/relationships/${relationshipId}/assignments`,
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    const workoutRows = workouts.body.data.items as Array<{
      id: string;
      localDate: string;
      scheduleStatus: string;
      planVersionId: string;
    }>;
    expect(workoutRows.length).toBeGreaterThan(0);
    expect(workoutRows.every((row) => row.scheduleStatus === "scheduled")).toBe(true);
    expect(workoutRows.every((row) => weekdayFromLocalDate(row.localDate) === weekday)).toBe(
      true,
    );
    expect(workoutRows.every((row) => row.planVersionId === publishedVersionId)).toBe(true);
    expect(workoutRows.filter((row) => row.localDate === today)).toHaveLength(2);

    const meals = await readJson(
      await app.request(
        `/meals/relationships/${relationshipId}/assignments`,
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    const mealRows = meals.body.data.items as Array<{
      localDate: string;
      scheduleStatus: string;
    }>;
    expect(mealRows.length).toBeGreaterThan(0);
    expect(mealRows.every((row) => row.scheduleStatus === "scheduled")).toBe(true);
    expect(mealRows.every((row) => weekdayFromLocalDate(row.localDate) === weekday)).toBe(
      true,
    );

    const [toComplete, toSkip] = workoutRows.filter((row) => row.localDate === today);
    const started = await readJson(
      await app.request(
        `/workouts/assignments/${toComplete!.id}/start`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-start" },
        },
        testEnv(),
      ),
    );
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect(started.body.data.planVersionId).toBe(publishedVersionId);
    for (const exercise of started.body.data.exercises) {
      for (const set of exercise.sets) {
        const completedSet = await readJson(
          await app.request(
            `/workouts/executions/${started.body.data.id}/sets/${set.id}/complete`,
            {
              method: "POST",
              headers: traineeHeaders,
              body: JSON.stringify({}),
            },
            testEnv(),
          ),
        );
        expect(completedSet.status, JSON.stringify(completedSet.body)).toBe(200);
      }
    }
    const completed = await readJson(
      await app.request(
        `/workouts/executions/${started.body.data.id}/complete`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-complete" },
          body: JSON.stringify({}),
        },
        testEnv(),
      ),
    );
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.data.status).toBe("completed");
    expect(completed.body.data.planVersionId).toBe(publishedVersionId);

    const skipped = await readJson(
      await app.request(
        `/workouts/assignments/${toSkip!.id}/skip`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-skip" },
        },
        testEnv(),
      ),
    );
    expect(skipped.status, JSON.stringify(skipped.body)).toBe(200);

    const evaluated = await readJson(
      await app.request(
        `/exceptions/relationships/${relationshipId}/evaluate`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-evaluate",
          },
          body: "{}",
        },
        testEnv(),
      ),
    );
    expect(evaluated.status, JSON.stringify(evaluated.body)).toBe(200);
    const openExceptions = await readJson(
      await app.request(
        `/exceptions/relationships/${relationshipId}`,
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    const skippedException = openExceptions.body.data.items.find(
      (item: { type: string; sourceEntityId: string }) =>
        item.type === "skipped_workout" && item.sourceEntityId === toSkip!.id,
    );
    expect(skippedException).toBeTruthy();
    const sourceBefore = skippedException.sourceEntityId;
    const acknowledged = await readJson(
      await app.request(
        `/exceptions/${skippedException.id}/acknowledge`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-ack",
          },
          body: JSON.stringify({ note: "Seen, still skipped." }),
        },
        testEnv(),
      ),
    );
    expect(acknowledged.status, JSON.stringify(acknowledged.body)).toBe(200);
    expect(acknowledged.body.data.status).toBe("acknowledged");
    expect(acknowledged.body.data.sourceEntityId).toBe(sourceBefore);

    const directory = await readJson(
      await app.request(
        "/clients?status=active",
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    expect(directory.status).toBe(200);
    expect(directory.body.data.items).toHaveLength(1);
    expect(directory.body.data.items[0].adherenceState).toBe("needs_attention");

    const scheduledCheckin = await readJson(
      await app.request(
        `/checkins/relationships/${relationshipId}/schedule`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-checkin",
          },
          body: JSON.stringify({ localDate: today }),
        },
        testEnv(),
      ),
    );
    expect(scheduledCheckin.status, JSON.stringify(scheduledCheckin.body)).toBe(200);
    expect(scheduledCheckin.body.data.checkin.checkinFormVersionId).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    const checkin = scheduledCheckin.body.data.checkin;
    const submittedCheckin = await readJson(
      await app.request(
        `/checkins/${checkin.id}/submit`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-checkin-submit" },
          body: JSON.stringify({
            expectedVersion: checkin.recordVersion,
            answers: {
              wellbeing: "Energy is steady and sleep was fine.",
              notes: "No new pain.",
              bodyWeightKg: 70.4,
            },
          }),
        },
        testEnv(),
      ),
    );
    expect(submittedCheckin.status, JSON.stringify(submittedCheckin.body)).toBe(200);
    const reviewContext = await readJson(
      await app.request(
        `/checkins/${checkin.id}/review-context`,
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    expect(reviewContext.status, JSON.stringify(reviewContext.body)).toBe(200);
    expect(reviewContext.body.data.pinnedForm.id).toBe(GLOBAL_CHECKIN_FORM_VERSION_ID);
    expect(reviewContext.body.data.checkin.answers.wellbeing).toBe(
      "Energy is steady and sleep was fine.",
    );
    expect(reviewContext.body.data.checkin.recordStatus).toBe("submitted");

    const reminderCheckin = await readJson(
      await app.request(
        `/checkins/relationships/${relationshipId}/schedule`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-checkin-reminder",
          },
          body: JSON.stringify({ localDate: addDaysToLocalDate(today, -1) }),
        },
        testEnv(),
      ),
    );
    expect(reminderCheckin.status, JSON.stringify(reminderCheckin.body)).toBe(200);
    const reminderCheckinId = reminderCheckin.body.data.checkin.id as string;

    const draft = await readJson(
      await app.request(
        `/plans/${planId}/versions`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-later-draft",
          },
          body: JSON.stringify({ sourceVersionId: publishedVersionId }),
        },
        testEnv(),
      ),
    );
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);

    const endedAt = new Date().toISOString();
    const db = getTestDbOverride();
    expect(db).toBeTruthy();
    await db!
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, relationshipId));

    const blockedPublish = await readJson(
      await app.request(
        `/plans/${planId}/versions/${draft.body.data.id}/publish`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-publish-ended",
          },
          body: JSON.stringify({
            expectedRecordVersion: draft.body.data.recordVersion,
            mode: "immediate",
          }),
        },
        testEnv(),
      ),
    );
    expect(blockedPublish.status).toBe(409);
    expect(blockedPublish.body.error.code).toBe("RELATIONSHIP_ENDED");

    const blockedGenerate = await readJson(
      await app.request(
        `/workouts/relationships/${relationshipId}/assignments/generate`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-generate-ended",
          },
          body: JSON.stringify({ fromDate: today, toDate: rangeEnd }),
        },
        testEnv(),
      ),
    );
    expect(blockedGenerate.status).toBe(409);
    expect(blockedGenerate.body.error.code).toBe("RELATIONSHIP_ENDED");

    const reminders = await readJson(
      await app.request(
        "/notifications/reminders/evaluate",
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        testEnv(),
      ),
    );
    expect(reminders.status).toBe(200);
    const reminderRows = await db!
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.domainEntityId, reminderCheckinId));
    expect(reminderRows).toHaveLength(0);

    const stillPublished = await readJson(
      await app.request(
        `/plans/${planId}/versions/${publishedVersionId}`,
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    expect(stillPublished.body.data.content).toEqual(publishedContent);
    const execution = await db!
      .select()
      .from(schema.workoutExecutions)
      .where(eq(schema.workoutExecutions.id, started.body.data.id));
    expect(execution[0]?.planVersionId).toBe(publishedVersionId);
    expect(execution[0]?.status).toBe("completed");
  }, 30_000);
});
