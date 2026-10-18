import { foodSnapshotFromLibrary, materializePlanContent } from "@fitbud/core";
import { NUTRIENT_SCALE, type PlanContent } from "@fitbud/contracts";
import { DEMO_ACCOUNTS } from "./spec.js";
import {
  DEMO_ANITA_PENDING_INVITE_TOKEN,
  DEMO_CHECKIN_FORM_VERSION_ID,
  buildStandardPlanContent,
  type DemoLibraryIndex,
} from "./personas.js";
import {
  MEAL_PRESCRIPTION_IDS,
  WORKOUT_DAY_ID,
} from "./personas.js";
import {
  addDaysFromLocalDate,
  demoUuid,
  localDayStartIso,
  sha256HexSync,
  sqlQuote,
} from "./ids.js";

function relId(trainerEmail: string, traineeEmail: string): string {
  return demoUuid(
    "relationship",
    trainerEmail.split("@")[0]!,
    traineeEmail.split("@")[0]!,
  );
}

/** Never seed activity timestamps after "now". */
function clampIsoToNow(iso: string, nowIso: string): string {
  return Date.parse(iso) > Date.parse(nowIso) ? nowIso : iso;
}

function userId(email: string): string {
  return demoUuid("user", email);
}

function jsonQuote(value: unknown): string {
  return sqlQuote(JSON.stringify(value));
}

type HistoryInput = {
  referenceDate: string;
  referenceInstant: string;
  libraryIndex: DemoLibraryIndex;
};

function insertRelationship(input: {
  trainerEmail: string;
  traineeEmail: string;
  status: "active" | "ended";
  startedAt: string;
  now: string;
  endedAt?: string | null;
}): string {
  const id = relId(input.trainerEmail, input.traineeEmail);
  return `INSERT INTO coaching_relationships (id, trainer_user_id, trainee_user_id, status, invitation_id, started_at, ended_at, ended_by_user_id, end_reason, reactivated_at, created_at, updated_at) VALUES (${sqlQuote(id)}, ${sqlQuote(userId(input.trainerEmail))}, ${sqlQuote(userId(input.traineeEmail))}, ${sqlQuote(input.status)}, NULL, ${sqlQuote(input.startedAt)}, ${input.endedAt ? sqlQuote(input.endedAt) : "NULL"}, NULL, NULL, NULL, ${sqlQuote(input.now)}, ${sqlQuote(input.now)});`;
}

function buildTrainerTemplates(now: string, lib: DemoLibraryIndex): string {
  const rahul = userId("rahul.coach@demo.fitbud.test");
  const workoutContent = buildStandardPlanContent(lib, "v2");
  const dietContent: PlanContent = {
    workoutDays: [],
    mealPrescriptions: buildStandardPlanContent(lib, "v2").mealPrescriptions,
  };
  const workoutId = demoUuid("plan-template", "rahul-workout");
  const dietId = demoUuid("plan-template", "rahul-diet");
  return [
    `INSERT INTO plan_templates (id, ownership, trainer_user_id, title, template_type, content_json, record_version, created_at, updated_at) VALUES (${sqlQuote(workoutId)}, 'trainer', ${sqlQuote(rahul)}, 'Demo strength block', 'workout', ${jsonQuote(materializePlanContent(workoutContent))}, 0, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO plan_templates (id, ownership, trainer_user_id, title, template_type, content_json, record_version, created_at, updated_at) VALUES (${sqlQuote(dietId)}, 'trainer', ${sqlQuote(rahul)}, 'Demo Indian meals', 'nutrition', ${jsonQuote(materializePlanContent(dietContent))}, 0, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  ].join("\n");
}

function buildOnboardingStack(input: {
  relId: string;
  traineeEmail: string;
  trainerEmail: string;
  state: string;
  now: string;
  startedAt: string;
}): string {
  const lines: string[] = [];
  const formVersionSql = `(SELECT id FROM onboarding_form_versions WHERE scope='global' ORDER BY version DESC LIMIT 1)`;
  const responseId = demoUuid("onboarding-response", input.traineeEmail);
  if (input.state === "onboarding_incomplete") {
    lines.push(
      `INSERT INTO onboarding_form_responses (id, coaching_relationship_id, onboarding_form_version_id, trainee_user_id, status, answers_json, version, submitted_at, created_at, updated_at) VALUES (${sqlQuote(responseId)}, ${sqlQuote(input.relId)}, ${formVersionSql}, ${sqlQuote(userId(input.traineeEmail))}, 'draft', '{"goals":"Build consistency"}', 1, NULL, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    );
    return lines.join("\n");
  }
  if (input.state === "awaiting_review") {
    lines.push(
      `INSERT INTO onboarding_form_responses (id, coaching_relationship_id, onboarding_form_version_id, trainee_user_id, status, answers_json, version, submitted_at, created_at, updated_at) VALUES (${sqlQuote(responseId)}, ${sqlQuote(input.relId)}, ${formVersionSql}, ${sqlQuote(userId(input.traineeEmail))}, 'submitted', '{"goals":"Fat loss"}', 1, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    );
    return lines.join("\n");
  }
  lines.push(
    `INSERT INTO onboarding_form_responses (id, coaching_relationship_id, onboarding_form_version_id, trainee_user_id, status, answers_json, version, submitted_at, created_at, updated_at) VALUES (${sqlQuote(responseId)}, ${sqlQuote(input.relId)}, ${formVersionSql}, ${sqlQuote(userId(input.traineeEmail))}, 'submitted', '{"goals":"Demo coaching"}', 1, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
  );
  lines.push(
    `INSERT INTO onboarding_reviews (id, coaching_relationship_id, onboarding_form_response_id, trainer_user_id, outcome, created_at) VALUES (${sqlQuote(demoUuid("onboarding-review", input.traineeEmail))}, ${sqlQuote(input.relId)}, ${sqlQuote(responseId)}, ${sqlQuote(userId(input.trainerEmail))}, 'coaching_ready', ${sqlQuote(input.startedAt)});`,
  );
  const configId = demoUuid("coaching-config", input.relId);
  lines.push(
    `INSERT INTO coaching_configurations (id, coaching_relationship_id, status, version_number, record_version, goal_short, goal_description, notes, configured_at, activated_at, created_at, updated_at) VALUES (${sqlQuote(configId)}, ${sqlQuote(input.relId)}, 'active', 1, 0, 'Demo goal', NULL, NULL, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
  );
  lines.push(
    `INSERT INTO workout_expectations (id, coaching_configuration_id, sessions_per_week, completion_window_hours, created_at, updated_at) VALUES (${sqlQuote(demoUuid("workout-exp", input.relId))}, ${sqlQuote(configId)}, 3, 24, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    `INSERT INTO nutrition_expectations (id, coaching_configuration_id, meals_per_day, confirmation_window_hours, photo_requirement, created_at, updated_at) VALUES (${sqlQuote(demoUuid("nutrition-exp", input.relId))}, ${sqlQuote(configId)}, 4, 12, 'none', ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    `INSERT INTO checkin_schedules (id, coaching_configuration_id, coaching_relationship_id, cadence, due_window_hours, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin-schedule", input.relId))}, ${sqlQuote(configId)}, ${sqlQuote(input.relId)}, 'weekly', 48, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    `INSERT INTO tracking_requirements (id, coaching_configuration_id, require_body_weight, require_progress_photos, require_session_rpe, created_at, updated_at) VALUES (${sqlQuote(demoUuid("tracking", input.relId))}, ${sqlQuote(configId)}, 0, 0, 0, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
  );
  return lines.join("\n");
}

function buildPlanAndSubscription(input: {
  relId: string;
  traineeEmail: string;
  state: string;
  refDate: string;
  now: string;
  startedAt: string;
  lib: DemoLibraryIndex;
}): { sql: string; planId: string; planVersionId: string; content: PlanContent } {
  const planId = demoUuid("plan", input.relId);
  const v1Id = demoUuid("plan-version", input.relId, "v1");
  const v2Id = demoUuid("plan-version", input.relId, "v2");
  const v1Content = materializePlanContent(buildStandardPlanContent(input.lib, "v1"));
  const v2Content = materializePlanContent(buildStandardPlanContent(input.lib, "v2"));
  const v2EffectiveLocal =
    input.state === "active_on_track"
      ? addDaysFromLocalDate(input.refDate, -14)
      : addDaysFromLocalDate(input.startedAt.slice(0, 10), 1);
  const v2Effective = `${v2EffectiveLocal}T00:00:00.000Z`;
  const startedLocal = input.startedAt.slice(0, 10);
  const renewsOn =
    input.state === "slipping"
      ? addDaysFromLocalDate(input.refDate, -3)
      : input.state === "active_on_track"
        ? addDaysFromLocalDate(input.refDate, 20)
        : addDaysFromLocalDate(input.refDate, 25);
  const lines = [
    `INSERT INTO plans (id, coaching_relationship_id, title, created_at, updated_at) VALUES (${sqlQuote(planId)}, ${sqlQuote(input.relId)}, 'Coaching plan', ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    `INSERT INTO plan_versions (id, plan_id, version_number, status, record_version, content_json, creation_source, source_template_id, published_at, effective_from, effective_to, created_at, updated_at) VALUES (${sqlQuote(v1Id)}, ${sqlQuote(planId)}, 1, 'superseded', 0, ${jsonQuote(v1Content)}, 'blank', NULL, ${sqlQuote(input.startedAt)}, ${sqlQuote(`${startedLocal}T00:00:00.000Z`)}, ${sqlQuote(v2Effective)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
    `INSERT INTO plan_versions (id, plan_id, version_number, status, record_version, content_json, creation_source, source_template_id, published_at, effective_from, effective_to, created_at, updated_at) VALUES (${sqlQuote(v2Id)}, ${sqlQuote(planId)}, 2, 'effective', 0, ${jsonQuote(v2Content)}, 'previous_version', NULL, ${sqlQuote(v2Effective)}, ${sqlQuote(v2Effective)}, NULL, ${sqlQuote(v2Effective)}, ${sqlQuote(input.now)});`,
    `INSERT INTO subscription_versions (id, coaching_relationship_id, version_number, plan_name, payment_frequency, starts_on, renews_on, created_at) VALUES (${sqlQuote(demoUuid("subscription", input.relId))}, ${sqlQuote(input.relId)}, 1, 'Monthly coaching', 'monthly', ${sqlQuote(input.startedAt.slice(0, 10))}, ${sqlQuote(renewsOn)}, ${sqlQuote(input.startedAt)});`,
  ];
  return {
    sql: lines.join("\n"),
    planId,
    planVersionId: v2Id,
    content: v2Content,
  };
}

function weekdayFromDate(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay();
}

function buildAssignmentsAndLogs(input: {
  relId: string;
  traineeEmail: string;
  trainerEmail: string;
  state: string;
  refDate: string;
  now: string;
  planId: string;
  planVersionId: string;
  content: PlanContent;
  timezone: string;
}): string {
  const lines: string[] = [];
  const trainee = userId(input.traineeEmail);
  const historyStart = addDaysFromLocalDate(input.refDate, -27);
  const adherenceStart = addDaysFromLocalDate(input.refDate, -13);
  const mealRx = input.content.mealPrescriptions;
  const workoutDay = input.content.workoutDays[0]!;

  for (let offset = 0; offset < 28; offset++) {
    const localDate = addDaysFromLocalDate(historyStart, offset);
    if (localDate > input.refDate) continue;
    const planVersionForDay =
      input.state === "active_on_track" &&
      localDate < addDaysFromLocalDate(input.refDate, -14)
        ? demoUuid("plan-version", input.relId, "v1")
        : input.planVersionId;

    for (const meal of mealRx) {
      const assignmentId = demoUuid(
        "meal-assignment",
        input.traineeEmail,
        localDate,
        meal.id,
      );
      const windowStart = localDayStartIso(
        localDate,
        meal.localTime ?? "08:00",
        input.timezone,
      );
      const windowEnd = new Date(
        Date.parse(windowStart) + 12 * 3_600_000,
      ).toISOString();
      lines.push(
        `INSERT INTO meal_assignments (id, coaching_relationship_id, plan_id, plan_version_id, meal_prescription_id, meal_name, meal_prescription_json, local_date, window_starts_at, window_ends_at, photo_required, schedule_status, superseded_at, superseded_by_plan_version_id, created_at, updated_at) VALUES (${sqlQuote(assignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(input.planId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(meal.id)}, ${sqlQuote(meal.name)}, ${jsonQuote(meal)}, ${sqlQuote(localDate)}, ${sqlQuote(windowStart)}, ${sqlQuote(windowEnd)}, 0, 'scheduled', NULL, NULL, ${sqlQuote(windowStart)}, ${sqlQuote(windowStart)});`,
      );

      const shouldLog = shouldLogMeal(input.state, localDate, input.refDate, meal.name, adherenceStart);
      if (shouldLog === "confirm") {
        const complianceId = demoUuid("meal-compliance", assignmentId);
        const loggedAt = clampIsoToNow(windowEnd, input.now);
        lines.push(
          `INSERT INTO meal_compliance (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, record_version, logged_at, deviation_kind, notes, photo_required, photo_intent_json, media_asset_id, items_json, kcal_scaled, protein_scaled, carbs_scaled, fat_scaled, logged_late, logged_after_resolve, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(complianceId)}, ${sqlQuote(assignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(trainee)}, 'confirmed', 0, ${sqlQuote(loggedAt)}, NULL, NULL, 0, NULL, NULL, NULL, 400000000, 20000000, 50000000, 10000000, 0, 0, ${sqlQuote(loggedAt)}, ${sqlQuote(loggedAt)}, ${sqlQuote(loggedAt)});`,
        );
      }
    }

    const dow = weekdayFromDate(localDate);
    if (dow === 1 || dow === 3 || dow === 5) {
      const workoutAssignmentId = demoUuid(
        "workout-assignment",
        input.traineeEmail,
        localDate,
      );
      const wStart = localDayStartIso(localDate, "07:00", input.timezone);
      const wEnd = new Date(Date.parse(wStart) + 24 * 3_600_000).toISOString();
      lines.push(
        `INSERT INTO workout_assignments (id, coaching_relationship_id, plan_id, plan_version_id, workout_day_id, workout_day_name, workout_day_json, local_date, window_starts_at, window_ends_at, schedule_status, superseded_at, superseded_by_plan_version_id, created_at, updated_at) VALUES (${sqlQuote(workoutAssignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(input.planId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(WORKOUT_DAY_ID)}, ${sqlQuote(workoutDay.name)}, ${jsonQuote(workoutDay)}, ${sqlQuote(localDate)}, ${sqlQuote(wStart)}, ${sqlQuote(wEnd)}, 'scheduled', NULL, NULL, ${sqlQuote(wStart)}, ${sqlQuote(wStart)});`,
      );
      const workoutLog = shouldLogWorkout(input.state, localDate, input.refDate, adherenceStart);
      if (workoutLog) {
        const execId = demoUuid("workout-execution", workoutAssignmentId);
        const completedAt = clampIsoToNow(
          new Date(Date.parse(wStart) + 60 * 60_000).toISOString(),
          input.now,
        );
        lines.push(
          `INSERT INTO workout_executions (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, status, record_version, started_at, paused_at, completed_at, session_rpe, require_session_rpe, logged_late, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(execId)}, ${sqlQuote(workoutAssignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(trainee)}, ${sqlQuote(workoutLog)}, 0, ${sqlQuote(wStart)}, NULL, ${sqlQuote(completedAt)}, NULL, 0, 0, ${sqlQuote(completedAt)}, ${sqlQuote(wStart)}, ${sqlQuote(completedAt)});`,
        );
      }
    }

    if (dow === 0 && localDate < input.refDate && input.state !== "reminders_paused") {
      const checkinId = demoUuid("checkin", input.traineeEmail, localDate);
      const cStart = localDayStartIso(localDate, "09:00", input.timezone);
      const cEnd = new Date(Date.parse(cStart) + 48 * 3_600_000).toISOString();
      const submittedAt = clampIsoToNow(cEnd, input.now);
      const submitted =
        input.state !== "food_deviations" ||
        localDate < input.refDate;
      lines.push(
        `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(checkinId)}, ${sqlQuote(input.relId)}, ${sqlQuote(demoUuid("checkin-schedule", input.relId))}, ${sqlQuote(localDate)}, ${sqlQuote(cStart)}, ${sqlQuote(cEnd)}, ${submitted ? "'submitted'" : "'draft'"}, 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, ${submitted ? `'{"wellbeing":"OK"}'` : "NULL"}, ${submitted ? sqlQuote(submittedAt) : "NULL"}, ${sqlQuote(cStart)}, ${sqlQuote(cStart)});`,
      );
      if (submitted && input.state === "active_on_track") {
        lines.push(
          `INSERT INTO checkin_reviews (id, checkin_id, coaching_relationship_id, trainer_user_id, outcome, notes, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin-review", checkinId))}, ${sqlQuote(checkinId)}, ${sqlQuote(input.relId)}, ${sqlQuote(userId(input.trainerEmail))}, 'acknowledged', NULL, ${sqlQuote(submittedAt)}, ${sqlQuote(submittedAt)});`,
        );
      }
      if (submitted && input.state === "dual_role") {
        lines.push(
          `-- karan check-in awaiting review on ${localDate}`,
        );
      }
    }
  }
  return lines.join("\n");
}

function shouldLogMeal(
  state: string,
  localDate: string,
  refDate: string,
  mealName: string,
  adherenceStart: string,
): "confirm" | "skip" | false {
  if (state === "reminders_paused") {
    return localDate < adherenceStart ? "confirm" : false;
  }
  // Slipping / acknowledged / push-off: leave only the last few days unlogged
  // so exception volume stays realistic (~a few open items per client).
  if (
    state === "slipping" ||
    state === "acknowledged" ||
    state === "notifications_off"
  ) {
    const missFrom = addDaysFromLocalDate(refDate, -2);
    if (localDate >= missFrom) return false;
    return mealName !== "Snack" ? "confirm" : false;
  }
  if (state === "food_deviations") {
    if (mealName === "Lunch" && localDate === refDate) return false;
    return mealName !== "Snack" ? "confirm" : false;
  }
  if (localDate >= adherenceStart && localDate <= refDate) {
    return mealName !== "Snack" ? "confirm" : false;
  }
  if (localDate < adherenceStart) {
    return "confirm";
  }
  return false;
}

function shouldLogWorkout(
  state: string,
  localDate: string,
  refDate: string,
  adherenceStart: string,
): "completed" | "skipped" | false {
  if (state === "reminders_paused") {
    return localDate < adherenceStart ? "completed" : false;
  }
  if (state === "slipping" || state === "acknowledged") {
    const missFrom = addDaysFromLocalDate(refDate, -2);
    if (localDate >= missFrom) return false;
    return "completed";
  }
  if (localDate >= adherenceStart && localDate <= refDate) {
    return "completed";
  }
  if (localDate < adherenceStart) {
    return "completed";
  }
  return false;
}

function buildPersonaOverlays(input: HistoryInput): string {
  const now = input.referenceInstant;
  const refDate = input.referenceDate;
  const lines: string[] = [];

  const rohanRel = relId("rahul.coach@demo.fitbud.test", "rohan.slipping@demo.fitbud.test");
  const missedWorkoutId = demoUuid("workout-assignment", "rohan.slipping@demo.fitbud.test", addDaysFromLocalDate(refDate, -2));
  const skippedWorkoutId = demoUuid("workout-assignment", "rohan.slipping@demo.fitbud.test", refDate);
  const overdueMealId = demoUuid("meal-assignment", "rohan.slipping@demo.fitbud.test", refDate, MEAL_PRESCRIPTION_IDS.dinner);
  const skippedMealId = demoUuid("meal-assignment", "rohan.slipping@demo.fitbud.test", refDate, MEAL_PRESCRIPTION_IDS.breakfast);
  const deviationMealId = demoUuid("meal-assignment", "rohan.slipping@demo.fitbud.test", refDate, MEAL_PRESCRIPTION_IDS.lunch);
  const overdueCheckinId = demoUuid("checkin", "rohan.slipping@demo.fitbud.test", addDaysFromLocalDate(refDate, -7));

  const exceptionRows = [
    ["rohan-missed-workout", rohanRel, "missed_workout", "critical", missedWorkoutId, "workout_assignment", 2],
    ["rohan-skipped-workout", rohanRel, "skipped_workout", "attention", skippedWorkoutId, "workout_assignment", 0],
    ["rohan-overdue-meal", rohanRel, "overdue_meal", "critical", overdueMealId, "meal_assignment", 0],
    ["rohan-skipped-meal", rohanRel, "skipped_meal", "attention", skippedMealId, "meal_assignment", 0],
    ["rohan-meal-deviation", rohanRel, "meal_deviation", "attention", deviationMealId, "meal_assignment", 0],
    ["rohan-overdue-checkin", rohanRel, "overdue_checkin", "attention", overdueCheckinId, "checkin", 7],
  ] as const;
  for (const [key, rel, type, severity, sourceId, sourceType, daysAgo] of exceptionRows) {
    const detected = new Date(Date.parse(now) - daysAgo * 86_400_000).toISOString();
    lines.push(
      `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", key))}, ${sqlQuote(rel)}, ${sqlQuote(type)}, ${sqlQuote(severity)}, 'active', 'demo-v1', ${sqlQuote(sourceType)}, ${sqlQuote(sourceId)}, ${sqlQuote(type)}, ${sqlQuote(detected)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
  }

  const meeraRel = relId("rahul.coach@demo.fitbud.test", "meera.ack@demo.fitbud.test");
  const ackMealId = demoUuid("meal-assignment", "meera.ack@demo.fitbud.test", addDaysFromLocalDate(refDate, -2), MEAL_PRESCRIPTION_IDS.lunch);
  const ackExceptionId = demoUuid("exception", "meera-ack-meal");
  const meeraDetected = new Date(
    Date.parse(`${addDaysFromLocalDate(refDate, -2)}T09:00:00.000Z`),
  ).toISOString();
  const meeraAcked = new Date(
    Date.parse(`${addDaysFromLocalDate(refDate, -1)}T10:00:00.000Z`),
  ).toISOString();
  lines.push(
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, acknowledged_at, created_at, updated_at) VALUES (${sqlQuote(ackExceptionId)}, ${sqlQuote(meeraRel)}, 'overdue_meal', 'critical', 'acknowledged', 'demo-v1', 'meal_assignment', ${sqlQuote(ackMealId)}, 'Missed lunch', ${sqlQuote(meeraDetected)}, ${sqlQuote(meeraAcked)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO exception_actions (id, exception_id, trainer_user_id, action, note, created_at) VALUES (${sqlQuote(demoUuid("exception-action", "meera-ack"))}, ${sqlQuote(ackExceptionId)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'acknowledge', 'Watching', ${sqlQuote(meeraAcked)});`,
  );
  const resolvedMealId = demoUuid("meal-assignment", "meera.ack@demo.fitbud.test", addDaysFromLocalDate(refDate, -5), MEAL_PRESCRIPTION_IDS.breakfast);
  const resolvedExceptionId = demoUuid("exception", "meera-resolved");
  const resolvedDetected = new Date(
    Date.parse(`${addDaysFromLocalDate(refDate, -5)}T09:00:00.000Z`),
  ).toISOString();
  const resolvedAt = new Date(
    Date.parse(`${addDaysFromLocalDate(refDate, -4)}T11:00:00.000Z`),
  ).toISOString();
  lines.push(
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, resolved_at, resolution_outcome, created_at, updated_at) VALUES (${sqlQuote(resolvedExceptionId)}, ${sqlQuote(meeraRel)}, 'skipped_meal', 'attention', 'resolved', 'demo-v1', 'meal_assignment', ${sqlQuote(resolvedMealId)}, 'Skipped breakfast', ${sqlQuote(resolvedDetected)}, ${sqlQuote(resolvedAt)}, 'client_logged_later', ${sqlQuote(now)}, ${sqlQuote(now)});`,
    // Overlay replaces any auto-seeded compliance so late-log flags stay accurate.
    `DELETE FROM meal_compliance WHERE assignment_id = ${sqlQuote(resolvedMealId)};`,
    `INSERT INTO meal_compliance (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, record_version, logged_at, deviation_kind, notes, photo_required, photo_intent_json, media_asset_id, items_json, kcal_scaled, protein_scaled, carbs_scaled, fat_scaled, logged_late, logged_after_resolve, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("meal-compliance", resolvedMealId))}, ${sqlQuote(resolvedMealId)}, ${sqlQuote(meeraRel)}, ${sqlQuote(demoUuid("plan-version", meeraRel, "v2"))}, ${sqlQuote(userId("meera.ack@demo.fitbud.test"))}, 'confirmed', 0, ${sqlQuote(`${addDaysFromLocalDate(refDate, -3)}T12:00:00.000Z`)}, NULL, 'Client logged later', 0, NULL, NULL, NULL, 300000000, 15000000, 40000000, 8000000, 1, 1, ${sqlQuote(`${addDaysFromLocalDate(refDate, -3)}T12:00:00.000Z`)}, ${sqlQuote(`${addDaysFromLocalDate(refDate, -3)}T12:00:00.000Z`)}, ${sqlQuote(now)});`,
  );

  const farhanRel = relId("rahul.coach@demo.fitbud.test", "farhan.paused@demo.fitbud.test");
  const adherenceStart = addDaysFromLocalDate(refDate, -13);
  lines.push(
    `INSERT INTO reminder_states (trainee_user_id, consecutive_ignores, mode, paused_until, last_evaluated_at, updated_at) VALUES (${sqlQuote(userId("farhan.paused@demo.fitbud.test"))}, 5, 'paused', ${sqlQuote(new Date(Date.parse(now) + 7 * 86_400_000).toISOString())}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `DELETE FROM meal_compliance WHERE coaching_relationship_id = ${sqlQuote(farhanRel)} AND assignment_id IN (SELECT id FROM meal_assignments WHERE coaching_relationship_id = ${sqlQuote(farhanRel)} AND local_date >= ${sqlQuote(adherenceStart)});`,
    `DELETE FROM workout_executions WHERE coaching_relationship_id = ${sqlQuote(farhanRel)} AND assignment_id IN (SELECT id FROM workout_assignments WHERE coaching_relationship_id = ${sqlQuote(farhanRel)} AND local_date >= ${sqlQuote(adherenceStart)});`,
    `DELETE FROM checkins WHERE coaching_relationship_id = ${sqlQuote(farhanRel)} AND local_date >= ${sqlQuote(adherenceStart)};`,
  );

  const ishitaRel = relId("rahul.coach@demo.fitbud.test", "ishita.pushoff@demo.fitbud.test");
  const ishitaMealId = demoUuid("meal-assignment", "ishita.pushoff@demo.fitbud.test", refDate, MEAL_PRESCRIPTION_IDS.lunch);
  lines.push(
    `INSERT INTO device_tokens (id, user_id, platform, provider, token, installation_id, status, last_seen_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("device-token", "ishita"))}, ${sqlQuote(userId("ishita.pushoff@demo.fitbud.test"))}, 'android', 'fcm', 'demo-ishita-revoked', 'demo-ishita-install', 'revoked', ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO coach_asks (id, relationship_id, trainee_user_id, item_type, item_id, topic, asked_at, last_asked_at, ask_count, status) VALUES (${sqlQuote(demoUuid("coach_ask", "ishita"))}, ${sqlQuote(ishitaRel)}, ${sqlQuote(userId("ishita.pushoff@demo.fitbud.test"))}, 'meal_assignment', ${sqlQuote(ishitaMealId)}, 'portion_size', ${sqlQuote(now)}, ${sqlQuote(now)}, 2, 'open');`,
  );

  const nikhilRel = relId("rahul.coach@demo.fitbud.test", "nikhil.reactivate@demo.fitbud.test");
  lines.push(
    `INSERT INTO reactivation_requests (id, relationship_id, trainer_user_id, status, intake_update_requested, expires_at, created_at) VALUES (${sqlQuote(demoUuid("reactivation", "nikhil"))}, ${sqlQuote(nikhilRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'pending', 0, ${sqlQuote(new Date(Date.parse(now) + 9 * 86_400_000).toISOString())}, ${sqlQuote(now)});`,
  );

  const deepakRel = relId("rahul.coach@demo.fitbud.test", "deepak.dubai@demo.fitbud.test");
  lines.push(
    `INSERT INTO meal_time_overrides (relationship_id, slot_key, day_pattern, time, updated_at) VALUES (${sqlQuote(deepakRel)}, 'lunch', 'all', '14:30', ${sqlQuote(now)}), (${sqlQuote(deepakRel)}, 'dinner', 'weekdays', '21:00', ${sqlQuote(now)});`,
    `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at, payload_json) VALUES (${sqlQuote(demoUuid("notification", "deepak-meal-times"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, ${sqlQuote(deepakRel)}, 'trainer_meal_times_changed', 'coaching_relationship', ${sqlQuote(deepakRel)}, 'delivered', ${sqlQuote(`meal-times-${deepakRel}`)}, ${sqlQuote(now)}, NULL, '{"summary":"Meal times updated"}');`,
  );

  const lakshmiRel = relId("priya.coach@demo.fitbud.test", "lakshmi.foods@demo.fitbud.test");
  const lib = input.libraryIndex;
  const idliItem = foodSnapshotJson(lib, "idli");
  const sambarItem = foodSnapshotJson(lib, "sambar");
  const lakshmiLunchId = demoUuid("meal-assignment", "lakshmi.foods@demo.fitbud.test", refDate, MEAL_PRESCRIPTION_IDS.lunch);
  lines.push(
    `INSERT INTO trainee_custom_foods (id, trainee_user_id, relationship_id, name, kcal_scaled, protein_scaled, carbs_scaled, fat_scaled, serving_label, created_at) VALUES (${sqlQuote(demoUuid("custom-food", "lakshmi-thali"))}, ${sqlQuote(userId("lakshmi.foods@demo.fitbud.test"))}, ${sqlQuote(lakshmiRel)}, 'Office canteen thali', 650000000, 25000000, 90000000, 20000000, '1 plate', ${sqlQuote(now)});`,
    `DELETE FROM meal_compliance WHERE assignment_id = ${sqlQuote(lakshmiLunchId)};`,
    `INSERT INTO meal_compliance (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, record_version, logged_at, deviation_kind, notes, photo_required, photo_intent_json, media_asset_id, items_json, kcal_scaled, protein_scaled, carbs_scaled, fat_scaled, logged_late, logged_after_resolve, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("meal-compliance", lakshmiLunchId))}, ${sqlQuote(lakshmiLunchId)}, ${sqlQuote(lakshmiRel)}, ${sqlQuote(demoUuid("plan-version", lakshmiRel, "v2"))}, ${sqlQuote(userId("lakshmi.foods@demo.fitbud.test"))}, 'modified', 0, ${sqlQuote(now)}, 'logged_foods', 'Idli + sambar instead of poha', 0, NULL, NULL, ${jsonQuote([idliItem, sambarItem])}, 500000000, 20000000, 80000000, 10000000, 0, 0, ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", "lakshmi-deviation"))}, ${sqlQuote(lakshmiRel)}, 'meal_deviation', 'attention', 'active', 'demo-v1', 'meal_assignment', ${sqlQuote(lakshmiLunchId)}, 'Logged different foods', ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );
  lines.push(
    `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin", "lakshmi-today"))}, ${sqlQuote(lakshmiRel)}, ${sqlQuote(demoUuid("checkin-schedule", lakshmiRel))}, ${sqlQuote(refDate)}, ${sqlQuote(localDayStartIso(refDate, "09:00", "Asia/Kolkata"))}, ${sqlQuote(new Date(Date.parse(now) + 48 * 3_600_000).toISOString())}, 'draft', 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const aaravRel = relId("rahul.coach@demo.fitbud.test", "aarav.ontrack@demo.fitbud.test");
  lines.push(
    `INSERT INTO trainer_notes (id, coaching_relationship_id, trainer_user_id, checkin_id, body, visibility, subject_type, subject_id, shared_at, unshared_at, seen_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("note", "aarav-private"))}, ${sqlQuote(aaravRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, NULL, 'Private demo note', 'private', NULL, NULL, NULL, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)}), (${sqlQuote(demoUuid("note", "aarav-client"))}, ${sqlQuote(aaravRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, NULL, 'Great consistency this week', 'client', NULL, NULL, ${sqlQuote(now)}, NULL, ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const kavyaRel = relId("rahul.coach@demo.fitbud.test", "kavya.ended@demo.fitbud.test");
  const kavyaDetected = new Date(
    Date.parse(`${addDaysFromLocalDate(refDate, -11)}T08:00:00.000Z`),
  ).toISOString();
  lines.push(
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, closed_reason, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", "kavya-ended"))}, ${sqlQuote(kavyaRel)}, 'missed_workout', 'critical', 'resolved', 'demo-v1', 'workout_assignment', ${sqlQuote(demoUuid("workout-assignment", "kavya.ended@demo.fitbud.test", addDaysFromLocalDate(refDate, -12)))}, 'Missed workout', ${sqlQuote(kavyaDetected)}, 'coaching_ended', ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const pendingHash = sha256HexSync(DEMO_ANITA_PENDING_INVITE_TOKEN);
  lines.push(
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-pending"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.invite@demo.fitbud.test', 'Anita Invite', ${sqlQuote(pendingHash)}, 'pending', ${sqlQuote(new Date(Date.parse(now) + 5 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-expired"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.expired@demo.fitbud.test', 'Anita Expired', ${sqlQuote(sha256HexSync("demo-anita-expired"))}, 'expired', ${sqlQuote(new Date(Date.parse(now) - 2 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-revoked"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.revoked@demo.fitbud.test', 'Anita Revoked', ${sqlQuote(sha256HexSync("demo-anita-revoked"))}, 'revoked', ${sqlQuote(new Date(Date.parse(now) + 3 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "kavya-priya"))}, ${sqlQuote(userId("priya.coach@demo.fitbud.test"))}, 'kavya.ended@demo.fitbud.test', 'Kavya Ended', ${sqlQuote(sha256HexSync("demo-kavya-priya-invite"))}, 'pending', ${sqlQuote(new Date(Date.parse(now) + 6 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  return lines.join("\n");
}

function foodSnapshotJson(lib: DemoLibraryIndex, slug: keyof DemoLibraryIndex["foods"]) {
  const food = lib.foods[slug];
  return foodSnapshotFromLibrary(
    food.item,
    food.defaultServingId,
    NUTRIENT_SCALE,
  );
}

/** Assignment / log / exception SQL for demo personas (T24). */
export function buildDemoHistorySql(input: HistoryInput): string {
  const now = input.referenceInstant;
  const refDate = input.referenceDate;
  const startedAt = new Date(
    Date.parse(`${refDate}T06:00:00.000Z`) - 27 * 86_400_000,
  ).toISOString();
  const lines: string[] = [`-- history anchor ${refDate}`];

  lines.push(buildTrainerTemplates(now, input.libraryIndex));

  for (const account of DEMO_ACCOUNTS) {
    if (account.role !== "trainee" || !account.trainerEmail) continue;
    const ended =
      account.state === "ended" || account.state === "reactivation_pending";
    const endedAt = ended
      ? new Date(Date.parse(now) - 10 * 86_400_000).toISOString()
      : null;
    lines.push(
      insertRelationship({
        trainerEmail: account.trainerEmail,
        traineeEmail: account.email,
        status: ended ? "ended" : "active",
        startedAt,
        now,
        endedAt,
      }),
    );

    const rid = relId(account.trainerEmail, account.email);
    if (
      account.state === "onboarding_incomplete" ||
      account.state === "awaiting_review"
    ) {
      lines.push(
        buildOnboardingStack({
          relId: rid,
          traineeEmail: account.email,
          trainerEmail: account.trainerEmail,
          state: account.state,
          now,
          startedAt,
        }),
      );
      continue;
    }

    lines.push(
      buildOnboardingStack({
        relId: rid,
        traineeEmail: account.email,
        trainerEmail: account.trainerEmail,
        state: account.state,
        now,
        startedAt,
      }),
    );

    const plan = buildPlanAndSubscription({
      relId: rid,
      traineeEmail: account.email,
      state: account.state,
      refDate,
      now,
      startedAt,
      lib: input.libraryIndex,
    });
    lines.push(plan.sql);

    const timezone = account.email.startsWith("deepak.")
      ? "Asia/Dubai"
      : "Asia/Kolkata";
    lines.push(
      buildAssignmentsAndLogs({
        relId: rid,
        traineeEmail: account.email,
        trainerEmail: account.trainerEmail,
        state: account.state,
        refDate,
        now,
        planId: plan.planId,
        planVersionId: plan.planVersionId,
        content: plan.content,
        timezone,
      }),
    );
  }

  lines.push(buildPersonaOverlays(input));

  return lines.join("\n");
}

export const DEMO_PENDING_INVITE_TOKEN = DEMO_ANITA_PENDING_INVITE_TOKEN;
