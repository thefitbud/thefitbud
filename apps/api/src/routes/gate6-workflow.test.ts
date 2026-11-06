import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GLOBAL_CHECKIN_FORM_VERSION_ID,
  addDaysToLocalDate,
  formatLocalDate,
  weekdayFromLocalDate,
} from "@fitbud/core";
import * as schema from "../db/schema.js";
import { app } from "../index.js";
import { getTestDbOverride, setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";



import { createMemoryDb as createSharedMemoryDb } from "../test-support/memory-db.js";

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const handle = await createSharedMemoryDb();
  return { db: handle.db, close: handle.close };
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
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

type ApiJsonBody = {
  data?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

/** Integration test helper: API payloads vary; assertions narrow at runtime. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IntegrationResponse = Record<string, any>;

function responseData(body: ApiJsonBody): IntegrationResponse {
  return (body.data ?? {}) as IntegrationResponse;
}

async function readJson(
  response: Response,
): Promise<{ status: number; body: ApiJsonBody }> {
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as ApiJsonBody) : {},
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
    const globalForm = (
      responseData(forms.body).items as Array<{ id: string; ownership: string }>
    ).find((item) => item.ownership === "global");
    expect(globalForm).toBeTruthy();
    const globalFormId = globalForm!.id;

    const forkedForm = await readJson(
      await app.request(
        `/onboarding/form-templates/${globalFormId}/fork`,
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
    const pinnedVersionId = responseData(forkedForm.body).versions[0].id as string;

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
            onboardingFormTemplateId: responseData(forkedForm.body).id,
          }),
        },
        testEnv(),
      ),
    );
    expect(invited.status, JSON.stringify(invited.body)).toBe(200);
    expect(responseData(invited.body).onboardingFormTemplateVersionId).toBe(pinnedVersionId);

    const laterVersion = await readJson(
      await app.request(
        `/onboarding/form-templates/${responseData(forkedForm.body).id}/versions`,
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
    expect(responseData(laterVersion.body).versions.at(-1).id).not.toBe(pinnedVersionId);

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
            token: responseData(invited.body).token,
            displayName: "Gate Six",
            timezone: "Asia/Kolkata",
          }),
        },
        testEnv(),
      ),
    );
    expect(accepted.status).toBe(200);
    const relationshipId = responseData(accepted.body).relationship.id as string;
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
          body: JSON.stringify({ expectedVersion: responseData(incomplete.body).version }),
        },
        testEnv(),
      ),
    );
    expect(rejected.status).toBe(422);
    const incompleteError = rejected.body.error as
      | { code?: string; details?: { missingFieldIds?: string[] } }
      | undefined;
    expect(incompleteError?.code).toBe("ONBOARDING_INCOMPLETE");
    expect(incompleteError?.details?.missingFieldIds).toContain("schedule");

    const drafted = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/draft`,
        {
          method: "PUT",
          headers: traineeHeaders,
          body: JSON.stringify({
            expectedVersion: responseData(incomplete.body).version,
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
    expect(responseData(drafted.body).onboardingFormVersionId).toBe(pinnedVersionId);
    const submitted = await readJson(
      await app.request(
        `/onboarding/relationships/${relationshipId}/submit`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-submit" },
          body: JSON.stringify({ expectedVersion: responseData(drafted.body).version }),
        },
        testEnv(),
      ),
    );
    expect(submitted.status).toBe(200);
    expect(responseData(submitted.body).status).toBe("submitted");
    expect(responseData(submitted.body).onboardingFormVersionId).toBe(pinnedVersionId);

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
    expect(responseData(configuration.body).workout.sessionsPerWeek).toBe(3);
    expect(responseData(configuration.body).nutrition.mealsPerDay).toBe(3);
    expect(responseData(configuration.body).nutrition.confirmationWindowHours).toBe(6);
    expect(responseData(configuration.body).checkin.cadence).toBe("weekly");
    expect(responseData(configuration.body).tracking.requireBodyWeight).toBe(false);

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
            expectedVersion: responseData(configuration.body).recordVersion,
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
            expectedVersion: responseData(configured.body).recordVersion,
          }),
        },
        testEnv(),
      ),
    );
    expect(activated.status).toBe(200);
    expect(responseData(activated.body).status).toBe("active");

    const templates = await readJson(
      await app.request(
        "/templates?limit=50",
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    const globalTemplate = responseData(templates.body).items.find(
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
    expect(responseData(forkedTemplate.body).ownership).toBe("trainer");

    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const weekday = weekdayFromLocalDate(today);
    const sourceContent = responseData(forkedTemplate.body).content;
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
        `/templates/${responseData(forkedTemplate.body).id}`,
        {
          method: "PUT",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRecordVersion: responseData(forkedTemplate.body).recordVersion,
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
          body: JSON.stringify({ templateId: responseData(forkedTemplate.body).id }),
        },
        testEnv(),
      ),
    );
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    expect(responseData(applied.body).version.creationSource).toBe("template");
    expect(responseData(applied.body).version.sourceTemplateId).toBe(responseData(forkedTemplate.body).id);
    const planId = responseData(applied.body).plan.id as string;
    const publishedVersionId = responseData(applied.body).version.id as string;

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
            expectedRecordVersion: responseData(applied.body).version.recordVersion,
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
    const publishedContent = responseData(publishedVersion.body).content;
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
            expectedRecordVersion: responseData(publishedVersion.body).recordVersion,
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
    expect((immutable.body.error ?? {}).code).toBe("PLAN_VERSION_IMMUTABLE");

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
    const workoutRows = responseData(workouts.body).items as Array<{
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
    const mealRows = responseData(meals.body).items as Array<{
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
    expect(responseData(started.body).planVersionId).toBe(publishedVersionId);
    for (const exercise of responseData(started.body).exercises) {
      for (const set of exercise.sets) {
        const completedSet = await readJson(
          await app.request(
            `/workouts/executions/${responseData(started.body).id}/sets/${set.id}/complete`,
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
        `/workouts/executions/${responseData(started.body).id}/complete`,
        {
          method: "POST",
          headers: { ...traineeHeaders, "Idempotency-Key": "gate6-complete" },
          body: JSON.stringify({}),
        },
        testEnv(),
      ),
    );
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(responseData(completed.body).status).toBe("completed");
    expect(responseData(completed.body).planVersionId).toBe(publishedVersionId);

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
    const skippedException = responseData(openExceptions.body).items.find(
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
    expect(responseData(acknowledged.body).status).toBe("acknowledged");
    expect(responseData(acknowledged.body).sourceEntityId).toBe(sourceBefore);

    const directory = await readJson(
      await app.request(
        "/clients?status=active",
        { headers: { Cookie: cookie } },
        testEnv(),
      ),
    );
    expect(directory.status).toBe(200);
    expect(responseData(directory.body).items).toHaveLength(1);
    expect(responseData(directory.body).items[0].adherenceState).toBe("needs_attention");

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
    expect(responseData(scheduledCheckin.body).checkin.checkinFormVersionId).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    const checkin = responseData(scheduledCheckin.body).checkin as {
      id: string;
      recordVersion: number;
    };
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
    const reviewData = responseData(reviewContext.body) as {
      pinnedForm: { id: string };
      checkin: { answers: { wellbeing: string }; recordStatus: string };
    };
    expect(reviewData.pinnedForm.id).toBe(GLOBAL_CHECKIN_FORM_VERSION_ID);
    expect(reviewData.checkin.answers.wellbeing).toBe(
      "Energy is steady and sleep was fine.",
    );
    expect(reviewData.checkin.recordStatus).toBe("submitted");

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
    const reminderCheckinId = responseData(reminderCheckin.body).checkin.id as string;

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
        `/plans/${planId}/versions/${responseData(draft.body).id}/publish`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "gate6-publish-ended",
          },
          body: JSON.stringify({
            expectedRecordVersion: responseData(draft.body).recordVersion,
            mode: "immediate",
          }),
        },
        testEnv(),
      ),
    );
    expect(blockedPublish.status).toBe(409);
    expect((blockedPublish.body.error ?? {}).code).toBe("RELATIONSHIP_ENDED");

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
    expect((blockedGenerate.body.error ?? {}).code).toBe("RELATIONSHIP_ENDED");

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
    expect(responseData(stillPublished.body).content).toEqual(publishedContent);
    const execution = await db!
      .select()
      .from(schema.workoutExecutions)
      .where(
        eq(
          schema.workoutExecutions.id,
          responseData(started.body).id as string,
        ),
      );
    expect(execution[0]?.planVersionId).toBe(publishedVersionId);
    expect(execution[0]?.status).toBe("completed");
  }, 30_000);
});
