import { describe, expect, it } from "vitest";
import {
  coachingConfigurationSchema,
  createInvitationRequestSchema,
  healthResponseSchema,
  onboardingFormDefinitionSchema,
  onboardingFormVersionSchema,
  meResponseSchema,
  onboardingStatusSchema,
  planContentSchema,
  roleSchema,
  saveConfigurationDraftRequestSchema,
  mealAssignmentSchema,
  workoutAssignmentSchema,
  checkinSchema,
  exceptionSchema,
  historyItemSchema,
  measurementSchema,
  mediaAssetSchema,
  syncPushRequestSchema,
  syncPullResponseSchema,
  pushPayloadSchema,
  notificationPreferencesSchema,
  realtimeEventSchema,
  SAFE_REALTIME_EVENT_KEYS,
  planTemplateSchema,
  createExerciseLibraryItemRequestSchema,
  createFoodLibraryItemRequestSchema,
  exerciseLibraryItemSchema,
  foodLibraryItemSchema,
  mealFoodItemSchema,
  NUTRIENT_SCALE,
  applyPlanTemplateRequestSchema,
  workspaceActivityQuerySchema,
  planListFilterSchema,
  historyListFilterSchema,
} from "./index.js";

describe("contracts", () => {
  it("validates health response", () => {
    expect(
      healthResponseSchema.parse({ status: "ok", service: "fitbud-api" }),
    ).toEqual({ status: "ok", service: "fitbud-api" });
  });

  it("rejects unknown roles", () => {
    expect(() => roleSchema.parse("admin")).toThrow();
  });

  it("requires at least one permitted role on /me", () => {
    expect(() =>
      meResponseSchema.parse({
        userId: "00000000-0000-4000-8000-000000000001",
        firebaseUid: "fb-1",
        accountState: "active",
        timezone: "UTC",
        permittedRoles: [],
        selectedRole: null,
        surface: "mobile",
        trainerProfileId: null,
        traineeProfileId: null,
      }),
    ).toThrow();
  });

  it("normalizes invitation create request", () => {
    expect(
      createInvitationRequestSchema.parse({
        recipientEmail: "client@example.com",
        expiresInDays: 7,
      }),
    ).toMatchObject({
      recipientEmail: "client@example.com",
      expiresInDays: 7,
    });
  });

  it("accepts onboarding status values", () => {
    expect(onboardingStatusSchema.parse("coaching_ready")).toBe("coaching_ready");
    expect(onboardingStatusSchema.parse("active")).toBe("active");
    expect(onboardingStatusSchema.parse("ended")).toBe("ended");
  });

  it("validates onboarding form version shape", () => {
    expect(
      onboardingFormVersionSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        templateId: "10111111-1111-4111-8111-111111111111",
        key: "mvp",
        version: 1,
        scope: "global",
        fields: [
          {
            id: "goals",
            type: "textarea",
            label: "Goals",
            required: true,
          },
        ],
        createdAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ key: "mvp", version: 1 });
    expect(() =>
      onboardingFormDefinitionSchema.parse({
        fields: [
          {
            id: "experience",
            type: "select",
            label: "Experience",
            required: true,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      onboardingFormDefinitionSchema.parse({
        fields: [
          { id: "score", type: "rating", label: "Score", required: true },
        ],
      }),
    ).toThrow();
  });

  it("validates coaching configuration draft request", () => {
    expect(
      saveConfigurationDraftRequestSchema.parse({
        expectedVersion: 0,
        goalShort: "Strength",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 3,
          confirmationWindowHours: 6,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 48 },
        tracking: {
          requireBodyWeight: true,
          requireProgressPhotos: false,
          requireSessionRpe: false,
        },
      }),
    ).toMatchObject({ expectedVersion: 0, goalShort: "Strength" });
  });

  it("validates coaching configuration response shape", () => {
    expect(
      coachingConfigurationSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        versionNumber: 1,
        recordVersion: 1,
        goalShort: "Strength",
        goalDescription: null,
        notes: null,
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 3,
          confirmationWindowHours: 6,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 48 },
        tracking: {
          requireBodyWeight: true,
          requireProgressPhotos: false,
          requireSessionRpe: false,
        },
        configuredAt: null,
        activatedAt: null,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "draft", versionNumber: 1, recordVersion: 1 });
  });

  it("validates plan content snapshots", () => {
    expect(
      planContentSchema.parse({
        workoutDays: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            order: 1,
            name: "Day A",
            exercises: [],
          },
        ],
        mealPrescriptions: [],
      }),
    ).toMatchObject({
      workoutDays: [{ name: "Day A" }],
    });

    expect(
      planContentSchema.parse({
        workoutDays: [],
        mealPrescriptions: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            order: 1,
            name: "Lunch",
            scheduleHint: null,
            instructions: null,
            photoRequired: false,
          },
        ],
      }).mealPrescriptions[0]?.items,
    ).toEqual([]);
  });

  it("validates workout assignment with derived missed status", () => {
    expect(
      workoutAssignmentSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        planId: "33333333-3333-4333-8333-333333333333",
        planVersionId: "44444444-4444-4444-8444-444444444444",
        workoutDayId: "55555555-5555-4555-8555-555555555555",
        workoutDayName: "Day A",
        localDate: "2026-09-26",
        windowStartsAt: "2026-09-25T18:30:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        status: "missed",
        workoutDay: {
          id: "55555555-5555-4555-8555-555555555555",
          order: 1,
          name: "Day A",
          exercises: [],
        },
        execution: null,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "missed", localDate: "2026-09-26" });
  });

  it("validates meal assignment with derived overdue status", () => {
    expect(
      mealAssignmentSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        planId: "33333333-3333-4333-8333-333333333333",
        planVersionId: "44444444-4444-4444-8444-444444444444",
        mealPrescriptionId: "55555555-5555-4555-8555-555555555555",
        mealName: "Breakfast",
        localDate: "2026-09-26",
        windowStartsAt: "2026-09-25T18:30:00.000Z",
        windowEndsAt: "2026-09-26T00:30:00.000Z",
        photoRequired: false,
        status: "overdue",
        prescription: {
          id: "55555555-5555-4555-8555-555555555555",
          order: 1,
          name: "Breakfast",
          scheduleHint: "Morning",
          instructions: null,
          photoRequired: false,
        },
        compliance: null,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "overdue", mealName: "Breakfast" });
  });

  it("validates check-in with derived overdue status", () => {
    expect(
      checkinSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        checkinScheduleId: null,
        localDate: "2026-09-26",
        windowStartsAt: "2026-09-26T00:00:00.000Z",
        windowEndsAt: "2026-09-28T00:00:00.000Z",
        recordStatus: "draft",
        recordVersion: 0,
        definitionVersion: 1,
        answers: null,
        submittedAt: null,
        status: "overdue",
        review: null,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "overdue", localDate: "2026-09-26" });
  });

  it("validates exception lifecycle payload", () => {
    expect(
      exceptionSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        type: "overdue_checkin",
        status: "active",
        ruleVersion: "mvp.v1",
        sourceEntityType: "checkin",
        sourceEntityId: "33333333-3333-4333-8333-333333333333",
        summary: "Overdue check-in for 2026-09-26",
        details: { rule: "derived_overdue_after_due_window" },
        detectedAt: "2026-09-27T00:00:00.000Z",
        activatedAt: "2026-09-27T00:00:00.000Z",
        acknowledgedAt: null,
        resolvedAt: null,
        createdAt: "2026-09-27T00:00:00.000Z",
        updatedAt: "2026-09-27T00:00:00.000Z",
      }),
    ).toMatchObject({ type: "overdue_checkin", status: "active" });
  });

  it("validates readable history item projection", () => {
    expect(
      historyItemSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        kind: "plan_version",
        occurredAt: "2026-09-26T00:00:00.000Z",
        title: "Plan version 2 became effective",
        summary: "Adjustment published for Strength block.",
        sourceEntityType: "plan_version",
        sourceEntityId: "11111111-1111-4111-8111-111111111111",
        status: "effective",
      }),
    ).toMatchObject({ kind: "plan_version", status: "effective" });
  });

  it("validates progress measurement and media asset payloads", () => {
    expect(
      measurementSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        traineeUserId: "33333333-3333-4333-8333-333333333333",
        type: "body_weight_kg",
        value: 70,
        unit: "kg",
        observedAt: "2026-09-26T00:00:00.000Z",
        source: "trainee_entry",
        checkinId: null,
        mediaAssetId: null,
        recordVersion: 0,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ type: "body_weight_kg", value: 70 });

    expect(
      mediaAssetSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        uploaderUserId: "33333333-3333-4333-8333-333333333333",
        mediaType: "progress_photo",
        status: "ready",
        contentType: "image/png",
        byteSize: 128,
        originalFilename: "progress.png",
        domainEntityType: null,
        domainEntityId: null,
        recordVersion: 1,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
        uploadedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ mediaType: "progress_photo", status: "ready" });
  });

  it("validates sync push and pull envelopes", () => {
    expect(
      syncPushRequestSchema.parse({
        mutations: [
          {
            mutationId: "11111111-1111-4111-8111-111111111111",
            idempotencyKey: "22222222-2222-4222-8222-222222222222",
            entityType: "measurement",
            recordId: "11111111-1111-4111-8111-111111111111",
            operation: "measurement.create",
            expectedServerVersion: null,
            clientOccurredAt: "2026-09-26T00:00:00.000Z",
            payload: {
              coachingRelationshipId: "33333333-3333-4333-8333-333333333333",
              body: { type: "body_weight_kg", value: 70, unit: "kg" },
            },
          },
        ],
      }).mutations,
    ).toHaveLength(1);

    expect(
      syncPullResponseSchema.parse({
        changes: [],
        nextCursor: null,
        hasMore: false,
      }),
    ).toEqual({ changes: [], nextCursor: null, hasMore: false });
  });

  it("validates routing-only push payloads and preferences", () => {
    expect(
      pushPayloadSchema.parse({
        notificationId: "11111111-1111-4111-8111-111111111111",
        notificationType: "checkin_reminder",
        domainEntityType: "checkin",
        domainEntityId: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ notificationType: "checkin_reminder" });

    expect(() =>
      pushPayloadSchema.parse({
        notificationId: "11111111-1111-4111-8111-111111111111",
        notificationType: "checkin_reminder",
        domainEntityType: "checkin",
        domainEntityId: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-26T00:00:00.000Z",
        trainerNote: "do not put this in lock screen",
      }),
    ).toThrow();

    expect(
      notificationPreferencesSchema.parse({
        userId: "11111111-1111-4111-8111-111111111111",
        pushEnabled: true,
        categories: {
          workoutReminder: true,
          mealReminder: true,
          checkinReminder: true,
          subscriptionRenewalReminder: true,
        },
        quietHoursStart: null,
        quietHoursEnd: null,
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ pushEnabled: true });
  });

  it("validates realtime event envelope without sensitive fields", () => {
    const event = realtimeEventSchema.parse({
      eventId: "11111111-1111-4111-8111-111111111111",
      eventType: "exception_changed",
      entityType: "exception",
      entityId: "22222222-2222-4222-8222-222222222222",
      coachingRelationshipId: "33333333-3333-4333-8333-333333333333",
      serverVersion: 2,
      occurredAt: "2026-09-26T00:00:00.000Z",
    });
    expect(Object.keys(event).sort()).toEqual(
      [...SAFE_REALTIME_EVENT_KEYS].sort(),
    );
    expect(() =>
      realtimeEventSchema.parse({
        ...event,
        summary: "Missed workout — sensitive",
      }),
    ).toThrow();
  });

  it("validates plan templates and library copy-source shapes", () => {
    expect(
      planTemplateSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        trainerUserId: "22222222-2222-4222-8222-222222222222",
        title: "Beginner strength",
        templateType: "workout",
        content: {
          workoutDays: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              order: 1,
              name: "Day A",
              exercises: [],
            },
          ],
          mealPrescriptions: [],
        },
        recordVersion: 1,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ templateType: "workout" });

    expect(
      exerciseLibraryItemSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownership: "global",
        trainerUserId: null,
        name: "Goblet squat",
        instructions: null,
        primaryMuscles: ["quads"],
        secondaryMuscles: ["glutes"],
        equipment: ["dumbbell"],
        difficulty: "beginner",
        status: "active",
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ ownership: "global", primaryMuscles: ["quads"] });
    expect(exerciseLibraryItemSchema.shape).not.toHaveProperty("defaultReps");
    expect(exerciseLibraryItemSchema.shape).not.toHaveProperty("defaultLoadLabel");
    expect(exerciseLibraryItemSchema.shape).not.toHaveProperty("parentExerciseId");
    expect(
      createExerciseLibraryItemRequestSchema.parse({
        name: "Cable face pull",
        defaultReps: 12,
      }),
    ).not.toHaveProperty("defaultReps");

    expect(
      foodLibraryItemSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownership: "global",
        trainerUserId: null,
        name: "Dal tadka",
        cuisineRegion: "indian",
        classification: "prepared_food",
        basis: "per_100_g",
        energyKcalScaled: 140 * NUTRIENT_SCALE,
        proteinScaled: 8 * NUTRIENT_SCALE,
        carbsScaled: 18 * NUTRIENT_SCALE,
        fatScaled: 4 * NUTRIENT_SCALE,
        servings: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            label: "1 katori",
            unit: "katori",
            conversionScaled: 180 * NUTRIENT_SCALE,
          },
        ],
        notes: null,
        description: null,
        status: "active",
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toMatchObject({ cuisineRegion: "indian", basis: "per_100_g" });

    expect(
      applyPlanTemplateRequestSchema.parse({
        templateId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({
      templateId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("rejects a food without classification or basis and reads legacy snapshots", () => {
    expect(
      createFoodLibraryItemRequestSchema.safeParse({
        name: "Dal tadka",
        basis: "per_100_g",
        servings: [{ label: "1 katori", unit: "katori", conversion: 180 }],
      }).success,
    ).toBe(false);
    expect(
      createFoodLibraryItemRequestSchema.safeParse({
        name: "Dal tadka",
        classification: "prepared_food",
        servings: [{ label: "1 katori", unit: "katori", conversion: 180 }],
      }).success,
    ).toBe(false);

    const legacy = mealFoodItemSchema.parse({
      name: "Dal",
      portionLabel: "1 katori",
      calories: 180,
      proteinGrams: 9,
      carbsGrams: 28,
      fatGrams: 0,
      sourceFoodLibraryItemId: "55555555-5555-4555-8555-555555555555",
    });
    expect(legacy).toMatchObject({
      snapshotKind: "legacy",
      quantityScaled: NUTRIENT_SCALE,
      basis: null,
      classification: null,
      canonical: null,
      serving: { label: "1 katori", conversionScaled: null },
      calculated: {
        energyKcalScaled: 180 * NUTRIENT_SCALE,
        proteinScaled: 9 * NUTRIENT_SCALE,
        fatScaled: 0,
        partial: false,
      },
    });

    const partial = mealFoodItemSchema.parse({
      name: "Dal",
      portionLabel: "1 katori",
      calories: 180,
      proteinGrams: null,
      carbsGrams: 28,
      fatGrams: 0,
    });
    expect(partial.snapshotKind === "legacy" && partial.calculated.proteinScaled).toBe(
      null,
    );
    expect(partial.snapshotKind === "legacy" && partial.calculated.partial).toBe(
      true,
    );
  });

  it("rejects an activity state that does not belong to the type", () => {
    expect(
      workspaceActivityQuerySchema.safeParse({
        type: "workout",
        state: "overdue",
      }).success,
    ).toBe(false);
    expect(
      workspaceActivityQuerySchema.safeParse({
        type: "checkin",
        state: "overdue",
        occurredFrom: "2026-10-01",
      }).success,
    ).toBe(true);
    expect(
      planListFilterSchema.safeParse({ versionStatus: "draft" }).success,
    ).toBe(true);
    expect(
      historyListFilterSchema.safeParse({ kind: "subscription_revision" }).success,
    ).toBe(true);
  });
});
