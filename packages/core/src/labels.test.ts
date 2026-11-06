import { describe, expect, it } from "vitest";
import {
  adherenceStateSchema,
  assignmentScheduleStatusSchema,
  assignmentWindowModeSchema,
  channelPreferenceSchema,
  checkinCadenceSchema,
  checkinRecordStatusSchema,
  checkinReviewOutcomeSchema,
  checkinStatusSchema,
  coachAskItemTypeSchema,
  coachAskStatusSchema,
  coachingConfigurationStatusSchema,
  coachingRelationshipStatusSchema,
  dietAdjustmentScopeSchema,
  exceptionActionKindSchema,
  exceptionSeveritySchema,
  exceptionSourceEntityTypeSchema,
  exceptionStatusSchema,
  exceptionTypeSchema,
  exerciseDifficultySchema,
  exerciseExecutionStatusSchema,
  foodClassificationSchema,
  historyItemKindSchema,
  interventionKindSchema,
  invitationStatusSchema,
  libraryItemStatusSchema,
  mealAssignmentStatusSchema,
  mealComplianceOutcomeSchema,
  mealDeviationKindSchema,
  mealPhotoRequirementSchema,
  mealTypeSchema,
  measurementSourceSchema,
  measurementTypeSchema,
  mediaAssetStatusSchema,
  mediaTypeSchema,
  notificationStateSchema,
  notificationTypeSchema,
  nutritionBasisSchema,
  onboardingReviewOutcomeSchema,
  onboardingStatusSchema,
  paymentFrequencySchema,
  planTemplateTypeSchema,
  planVersionStatusSchema,
  progressEntryTypeSchema,
  reminderTypeSchema,
  renewalStateSchema,
  resolveExceptionOutcomeSchema,
  responsivenessLabelSchema,
  roleSchema,
  setExecutionStatusSchema,
  trainerNoteVisibilitySchema,
  weekDayStateSchema,
  workspaceActivityTypeSchema,
  workoutAssignmentStatusSchema,
  workoutExecutionStatusSchema,
} from "@fitbud/contracts";
import {
  allLabelEntries,
  enumLabel,
  labelFor,
  LABELS,
  type LabelNamespace,
} from "./labels.js";

/** Every label namespace that mirrors a contract enum, with that enum's values. */
const CONTRACT_ENUM_NAMESPACES: Array<{
  name: LabelNamespace;
  values: readonly string[];
}> = [
        { name: "adherence_state", values: adherenceStateSchema.options },
        { name: "onboarding_status", values: onboardingStatusSchema.options },
        {
          name: "relationship_status",
          values: coachingRelationshipStatusSchema.options,
        },
        { name: "invitation_status", values: invitationStatusSchema.options },
        { name: "exception_type", values: exceptionTypeSchema.options },
        { name: "exception_severity", values: exceptionSeveritySchema.options },
        { name: "exception_status", values: exceptionStatusSchema.options },
        {
          name: "exception_source",
          values: exceptionSourceEntityTypeSchema.options,
        },
        { name: "exception_action", values: exceptionActionKindSchema.options },
        {
          name: "resolve_outcome",
          values: resolveExceptionOutcomeSchema.options,
        },
        { name: "checkin_status", values: checkinStatusSchema.options },
        {
          name: "checkin_record_status",
          values: checkinRecordStatusSchema.options,
        },
        {
          name: "checkin_review_outcome",
          values: checkinReviewOutcomeSchema.options,
        },
        {
          name: "meal_assignment_status",
          values: mealAssignmentStatusSchema.options,
        },
        {
          name: "meal_compliance_outcome",
          values: mealComplianceOutcomeSchema.options,
        },
        {
          name: "meal_deviation_kind",
          values: mealDeviationKindSchema.options,
        },
        {
          name: "workout_assignment_status",
          values: workoutAssignmentStatusSchema.options,
        },
        {
          name: "workout_execution_status",
          values: workoutExecutionStatusSchema.options,
        },
        {
          name: "set_execution_status",
          values: setExecutionStatusSchema.options,
        },
        {
          name: "exercise_execution_status",
          values: exerciseExecutionStatusSchema.options,
        },
        { name: "coach_ask_status", values: coachAskStatusSchema.options },
        {
          name: "coach_ask_item_type",
          values: coachAskItemTypeSchema.options,
        },
        { name: "history_kind", values: historyItemKindSchema.options },
        { name: "measurement_type", values: measurementTypeSchema.options },
        {
          name: "measurement_source",
          values: measurementSourceSchema.options,
        },
        {
          name: "progress_entry_type",
          values: progressEntryTypeSchema.options,
        },
        { name: "media_type", values: mediaTypeSchema.options },
        {
          name: "plan_version_status",
          values: planVersionStatusSchema.options,
        },
        { name: "plan_template_type", values: planTemplateTypeSchema.options },
        { name: "meal_type", values: mealTypeSchema.options },
        {
          name: "diet_change_scope",
          values: dietAdjustmentScopeSchema.options,
        },
        {
          name: "assignment_window_mode",
          values: assignmentWindowModeSchema.options,
        },
        {
          name: "assignment_schedule_status",
          values: assignmentScheduleStatusSchema.options,
        },
        {
          name: "coaching_configuration_status",
          values: coachingConfigurationStatusSchema.options,
        },
        {
          name: "meal_photo_requirement",
          values: mealPhotoRequirementSchema.options,
        },
        { name: "checkin_cadence", values: checkinCadenceSchema.options },
        {
          name: "payment_frequency",
          values: paymentFrequencySchema.options,
        },
        {
          name: "nutrition_basis",
          values: nutritionBasisSchema.options,
        },
        {
          name: "workspace_activity_type",
          values: workspaceActivityTypeSchema.options,
        },
        {
          name: "onboarding_review_outcome",
          values: onboardingReviewOutcomeSchema.options,
        },
        {
          name: "trainer_note_visibility",
          values: trainerNoteVisibilitySchema.options,
        },
        { name: "notification_type", values: notificationTypeSchema.options },
        { name: "reminder_type", values: reminderTypeSchema.options },
        {
          name: "channel_preference",
          values: channelPreferenceSchema.options,
        },
        {
          name: "notification_state",
          values: notificationStateSchema.options,
        },
        {
          name: "responsiveness_label",
          values: responsivenessLabelSchema.options,
        },
        { name: "role", values: roleSchema.options },
        { name: "week_day_state", values: weekDayStateSchema.options },
        {
          name: "food_classification",
          values: foodClassificationSchema.options,
        },
        {
          name: "exercise_difficulty",
          values: exerciseDifficultySchema.options,
        },
        {
          name: "library_item_status",
          values: libraryItemStatusSchema.options,
        },
        { name: "renewal_state", values: renewalStateSchema.options },
        {
          name: "intervention_kind",
          values: interventionKindSchema.options,
        },
        {
          name: "media_asset_status",
          values: mediaAssetStatusSchema.options,
        },
      ];

describe("labels", () => {
  it("covers every value of every mapped contract enum", () => {
    const schemas = CONTRACT_ENUM_NAMESPACES;

    for (const { name, values } of schemas) {
      for (const value of values) {
        const label = labelFor(name, value);
        expect(label, `${name}.${value}`).toBeTruthy();
        expect(label, `${name}.${value}`).not.toMatch(/_/);
        expect(label[0], `${name}.${value}`).toBe(label[0]?.toUpperCase());
      }
    }
  });

  it("has an explicit entry for every contract enum value, not the sentence-case fallback", () => {
    const missing: string[] = [];
    for (const { name, values } of CONTRACT_ENUM_NAMESPACES) {
      const map = LABELS[name] as Record<string, string>;
      for (const value of values) {
        if (!map[value]) missing.push(`${name}.${value}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("only open-vocabulary namespaces lack a contract enum", () => {
    const withEnum = new Set(CONTRACT_ENUM_NAMESPACES.map((n) => n.name));
    const without = (Object.keys(LABELS) as LabelNamespace[])
      .filter((name) => !withEnum.has(name))
      .sort();
    // Contracts type these as plain strings, or they are UI-derived chips.
    expect(without).toEqual([
      "body_part",
      "client_chip",
      "coach_ask_topic",
      "equipment",
    ]);
  });

  it("maps snake_case topics and body parts", () => {
    expect(labelFor("coach_ask_topic", "portion_size")).toBe("Portion size");
    expect(labelFor("body_part", "upper_back")).toBe("Upper back");
    expect(enumLabel("overdue_meal")).toBe("Overdue meal");
  });

  it("falls back to sentence case for unknown values", () => {
    expect(labelFor("exception_type", "brand_new_thing")).toBe(
      "Brand new thing",
    );
  });

  it("labels the unlogged-today day state in plain language (D-W6-10)", () => {
    expect(LABELS.week_day_state.due).toBeTruthy();
    expect(LABELS.week_day_state.due).not.toBe("due");
    expect(LABELS.week_day_state.due).not.toBe("Due");
    expect(labelFor("week_day_state", "due")).toBe("To do");
  });

  it("exposes a non-empty catalogue", () => {
    expect(allLabelEntries().length).toBeGreaterThan(80);
  });

  it("shows a live plan version as Active, never Effective (D-W6-11)", () => {
    expect(labelFor("plan_version_status", "effective")).toBe("Active");
    const statusLabels = Object.values(LABELS.plan_version_status);
    expect(statusLabels).not.toContain("Effective");
    expect(statusLabels.some((label) => /^Effective/.test(label))).toBe(false);
  });

  it("leaves date phrases such as Effective since unchanged", () => {
    const phrase = "Effective since";
    expect(`${phrase} Wed 21 Oct`).toBe("Effective since Wed 21 Oct");
    expect(Object.values(LABELS.plan_version_status)).not.toContain(phrase);
  });
});
