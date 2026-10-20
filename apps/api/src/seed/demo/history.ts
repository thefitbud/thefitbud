import {
  foodSnapshotFromLibrary,
  labelFor,
  materializePlanContent,
} from "@fitbud/core";
import { NUTRIENT_SCALE, type PlanContent } from "@fitbud/contracts";
import { DEMO_ACCOUNTS } from "./spec.js";
import {
  DEMO_ANITA_PENDING_INVITE_TOKEN,
  DEMO_CHECKIN_FORM_VERSION_ID,
  buildStandardPlanContent,
  type DemoLibraryIndex,
} from "./personas.js";
import { MEAL_PRESCRIPTION_IDS } from "./personas.js";
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

/** Varied roster goals (TW-06) — not the same caption on every row. */
function demoGoalShort(traineeEmail: string, state: string): string {
  const byEmail: Record<string, string> = {
    "aarav.ontrack@demo.fitbud.test": "Lean bulk",
    "rohan.slipping@demo.fitbud.test": "Lose 6 kg",
    "meera.ack@demo.fitbud.test": "PCOS-friendly fat loss",
    "farhan.paused@demo.fitbud.test": "Maintain muscle while traveling",
    "ishita.pushoff@demo.fitbud.test": "Rebuild morning routine",
    "deepak.dubai@demo.fitbud.test": "Lose 8 kg",
    "arjun.attention@demo.fitbud.test": "Build strength",
    "neha.attention@demo.fitbud.test": "Lose 4 kg",
    "tanvi.attention@demo.fitbud.test": "Stay consistent",
    "lakshmi.foods@demo.fitbud.test": "Stabilize weekday meals",
    "karan.dual@demo.fitbud.test": "Coach + train dual role",
    "kavya.ended@demo.fitbud.test": "Postpartum strength return",
    "nikhil.reactivate@demo.fitbud.test": "Restart after travel break",
  };
  if (byEmail[traineeEmail]) return byEmail[traineeEmail]!;
  if (state === "slipping") return "Lose 6 kg";
  if (state === "active_on_track") return "Lean bulk";
  return "Stay consistent this month";
}

function demoPlanTitle(traineeEmail: string): string {
  if (traineeEmail.startsWith("rohan.")) return "Fat loss \u00b7 Phase 2";
  return "Coaching plan";
}

/** Rohan has been coached ~6 weeks; everyone else ~4. */
function demoStartedAt(
  traineeEmail: string,
  refDate: string,
  defaultStartedAt: string,
): string {
  if (traineeEmail.startsWith("rohan.")) {
    return new Date(
      Date.parse(`${refDate}T06:00:00.000Z`) - 40 * 86_400_000,
    ).toISOString();
  }
  return defaultStartedAt;
}

/** Most recent civil date strictly before refDate on `weekday`. */
function previousWeekdayBefore(refDate: string, weekday: number): string {
  let cursor = addDaysFromLocalDate(refDate, -1);
  for (let i = 0; i < 7; i += 1) {
    if (weekdayFromDate(cursor) === weekday) return cursor;
    cursor = addDaysFromLocalDate(cursor, -1);
  }
  return cursor;
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

/** Keys match the Default onboarding form (goals, relevant_history, preferences, schedule, limitations). */
const SNEHA_ONBOARDING_ANSWERS = {
  goals:
    "Lose about 6 kg over the next four months and feel less tired in the afternoons. I would also like to build enough strength to do a proper push-up and run 5 km without stopping.",
  relevant_history: [
    "I had a desk job for the last eight years and stopped exercising regularly after my second year at work.",
    "In 2022 I joined a gym and trained four days a week for about five months, lost around 4 kg, then stopped after a knee strain and a stretch of heavy work travel.",
    "Since then my weight has crept back up and my energy dips badly after lunch.",
    "I was diagnosed with mild hypothyroidism in 2023 and take 50 mcg thyroxine every morning; my last TSH (February this year) was in range.",
    "No diabetes or blood pressure issues. My mother has type 2 diabetes, so I want to be careful with sugar.",
    "I have tried calorie counting apps twice and quit both times because logging every ingredient felt exhausting.",
    "I also tried a keto-style diet for six weeks last year, lost 3 kg quickly, and regained it within a month once I started eating normally again.",
    "Sleep is usually 6 hours on weekdays and 8 on weekends.",
  ].join("\n\n"),
  preferences:
    "Vegetarian with eggs on weekends. I like simple Maharashtrian home food, hate bitter gourd, and prefer short 30-40 minute workouts at home or the society gym.",
  schedule:
    "Weekdays: up at 6:30 am, breakfast around 8, lunch at 1 pm at the office, dinner at 8:30 pm. I can train Monday, Wednesday and Friday at 7 am, or Saturday morning.",
  limitations:
    "Right knee gets sore with deep lunges and jumping. Occasional lower-back stiffness after long sitting. No other injuries.",
};

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
    const submittedAt = new Date(
      Date.parse(input.now) - 2 * 86_400_000,
    ).toISOString();
    lines.push(
      `INSERT INTO onboarding_form_responses (id, coaching_relationship_id, onboarding_form_version_id, trainee_user_id, status, answers_json, version, submitted_at, created_at, updated_at) VALUES (${sqlQuote(responseId)}, ${sqlQuote(input.relId)}, ${formVersionSql}, ${sqlQuote(userId(input.traineeEmail))}, 'submitted', ${jsonQuote(SNEHA_ONBOARDING_ANSWERS)}, 1, ${sqlQuote(submittedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(submittedAt)});`,
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
  const goalShort = demoGoalShort(input.traineeEmail, input.state);
  lines.push(
    `INSERT INTO coaching_configurations (id, coaching_relationship_id, status, version_number, record_version, goal_short, goal_description, notes, configured_at, activated_at, created_at, updated_at) VALUES (${sqlQuote(configId)}, ${sqlQuote(input.relId)}, 'active', 1, 0, ${sqlQuote(goalShort)}, NULL, NULL, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
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
      : input.state === "acknowledged"
        ? // Meera: renewal Due (today) so Home renewals rail shows amber Due chip
          input.refDate
        : input.state === "active_on_track"
          ? addDaysFromLocalDate(input.refDate, 20)
          : addDaysFromLocalDate(input.refDate, 25);
  const planTitle = demoPlanTitle(input.traineeEmail);
  const lines = [
    `INSERT INTO plans (id, coaching_relationship_id, title, created_at, updated_at) VALUES (${sqlQuote(planId)}, ${sqlQuote(input.relId)}, ${sqlQuote(planTitle)}, ${sqlQuote(input.startedAt)}, ${sqlQuote(input.now)});`,
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

function mealMacros(meal: PlanContent["mealPrescriptions"][number]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of meal.items ?? []) {
    totals.kcal += item.calculated.energyKcalScaled ?? 0;
    totals.protein += item.calculated.proteinScaled ?? 0;
    totals.carbs += item.calculated.carbsScaled ?? 0;
    totals.fat += item.calculated.fatScaled ?? 0;
  }
  return totals;
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
  /** Inclusive last civil date that may receive activity (end date for ended clients). */
  activityUntilDate: string;
  /** Cap for logged/submitted timestamps (endedAt for ended clients). */
  activityUntilIso: string;
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
  const workoutDayByWeekday = new Map(
    input.content.workoutDays.map((day) => [day.weekday, day] as const),
  );
  const logCap = input.activityUntilIso;

  for (let offset = 0; offset < 28; offset++) {
    const localDate = addDaysFromLocalDate(historyStart, offset);
    if (localDate > input.activityUntilDate) continue;
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

      // Never log a meal whose slot time hasn't started yet, and never after end.
      const slotReached = Date.parse(windowStart) <= Date.parse(logCap);
      const shouldLog = shouldLogMeal(
        input.state,
        localDate,
        input.activityUntilDate,
        meal.name,
        adherenceStart,
      );
      if (shouldLog === "confirm" && slotReached) {
        const complianceId = demoUuid("meal-compliance", assignmentId);
        const macros = mealMacros(meal);
        const loggedAt = clampIsoToNow(
          // Log near the slot start, not the long window end (avoids future stamps).
          new Date(Date.parse(windowStart) + 30 * 60_000).toISOString(),
          logCap,
        );
        lines.push(
          `INSERT INTO meal_compliance (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, record_version, logged_at, deviation_kind, notes, photo_required, photo_intent_json, media_asset_id, items_json, kcal_scaled, protein_scaled, carbs_scaled, fat_scaled, logged_late, logged_after_resolve, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(complianceId)}, ${sqlQuote(assignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(trainee)}, 'confirmed', 0, ${sqlQuote(loggedAt)}, NULL, NULL, 0, NULL, NULL, NULL, ${macros.kcal}, ${macros.protein}, ${macros.carbs}, ${macros.fat}, 0, 0, ${sqlQuote(loggedAt)}, ${sqlQuote(loggedAt)}, ${sqlQuote(loggedAt)});`,
        );
      }
    }

    const dow = weekdayFromDate(localDate);
    const workoutDay = workoutDayByWeekday.get(dow);
    if (workoutDay) {
      const workoutAssignmentId = demoUuid(
        "workout-assignment",
        input.traineeEmail,
        localDate,
      );
      const wStart = localDayStartIso(localDate, "07:00", input.timezone);
      const wEnd = new Date(Date.parse(wStart) + 24 * 3_600_000).toISOString();
      lines.push(
        `INSERT INTO workout_assignments (id, coaching_relationship_id, plan_id, plan_version_id, workout_day_id, workout_day_name, workout_day_json, local_date, window_starts_at, window_ends_at, schedule_status, superseded_at, superseded_by_plan_version_id, created_at, updated_at) VALUES (${sqlQuote(workoutAssignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(input.planId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(workoutDay.id)}, ${sqlQuote(workoutDay.name)}, ${jsonQuote(workoutDay)}, ${sqlQuote(localDate)}, ${sqlQuote(wStart)}, ${sqlQuote(wEnd)}, 'scheduled', NULL, NULL, ${sqlQuote(wStart)}, ${sqlQuote(wStart)});`,
      );
      const workoutLog = shouldLogWorkout(
        input.state,
        localDate,
        input.activityUntilDate,
        adherenceStart,
      );
      if (workoutLog) {
        const execId = demoUuid("workout-execution", workoutAssignmentId);
        const completedAt = clampIsoToNow(
          new Date(Date.parse(wStart) + 60 * 60_000).toISOString(),
          logCap,
        );
        lines.push(
          `INSERT INTO workout_executions (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, status, record_version, started_at, paused_at, completed_at, session_rpe, require_session_rpe, logged_late, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(execId)}, ${sqlQuote(workoutAssignmentId)}, ${sqlQuote(input.relId)}, ${sqlQuote(planVersionForDay)}, ${sqlQuote(trainee)}, ${sqlQuote(workoutLog)}, 0, ${sqlQuote(wStart)}, NULL, ${sqlQuote(completedAt)}, NULL, 0, 0, ${sqlQuote(completedAt)}, ${sqlQuote(wStart)}, ${sqlQuote(completedAt)});`,
        );
      }
    }

    if (
      dow === 0 &&
      localDate < input.activityUntilDate &&
      input.state !== "reminders_paused"
    ) {
      const checkinId = demoUuid("checkin", input.traineeEmail, localDate);
      const cStart = localDayStartIso(localDate, "09:00", input.timezone);
      const cEnd = new Date(Date.parse(cStart) + 48 * 3_600_000).toISOString();
      const submittedAt = clampIsoToNow(cEnd, logCap);
      const submitted =
        input.state !== "food_deviations" ||
        localDate < input.activityUntilDate;
      lines.push(
        `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(checkinId)}, ${sqlQuote(input.relId)}, ${sqlQuote(demoUuid("checkin-schedule", input.relId))}, ${sqlQuote(localDate)}, ${sqlQuote(cStart)}, ${sqlQuote(cEnd)}, ${submitted ? "'submitted'" : "'draft'"}, 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, ${submitted ? `'{"wellbeing":"OK"}'` : "NULL"}, ${submitted ? sqlQuote(submittedAt) : "NULL"}, ${sqlQuote(cStart)}, ${sqlQuote(cStart)});`,
      );
      if (submitted && input.state === "active_on_track") {
        lines.push(
          `INSERT INTO checkin_reviews (id, checkin_id, coaching_relationship_id, trainer_user_id, outcome, notes, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin-review", checkinId))}, ${sqlQuote(checkinId)}, ${sqlQuote(input.relId)}, ${sqlQuote(userId(input.trainerEmail))}, 'acknowledged', NULL, ${sqlQuote(submittedAt)}, ${sqlQuote(submittedAt)});`,
        );
        // TW-18: Aarav needs a weigh-in series so Progress can show a chart.
        const dayOffset = Math.round(
          (Date.parse(`${input.refDate}T12:00:00.000Z`) -
            Date.parse(`${localDate}T12:00:00.000Z`)) /
            86_400_000,
        );
        const weightKg = Number((76.8 - dayOffset * 0.05).toFixed(1));
        const observedAt = clampIsoToNow(
          localDayStartIso(localDate, "08:30", input.timezone),
          input.now,
        );
        lines.push(
          `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(demoUuid("measurement", "weight", checkinId))}, ${sqlQuote(input.relId)}, ${sqlQuote(trainee)}, 'body_weight_kg', ${weightKg}, 'kg', ${sqlQuote(observedAt)}, 'checkin', ${sqlQuote(checkinId)}, NULL, 0, ${sqlQuote(observedAt)}, ${sqlQuote(observedAt)});`,
        );
        if (dayOffset % 14 === 0) {
          const waist = Number((84 - dayOffset * 0.03).toFixed(1));
          lines.push(
            `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(demoUuid("measurement", "waist", checkinId))}, ${sqlQuote(input.relId)}, ${sqlQuote(trainee)}, 'waist_cm', ${waist}, 'cm', ${sqlQuote(observedAt)}, 'checkin', ${sqlQuote(checkinId)}, NULL, 0, ${sqlQuote(observedAt)}, ${sqlQuote(observedAt)});`,
          );
        }
      } else if (submitted) {
        // Keep only the most recent past Sunday awaiting review (inbox realism).
        // Slipping (Rohan): review that Sunday too so Today can show the coach
        // reply instead of "Waiting for Rahul" (Friday overlay also reviewed).
        const refDow = new Date(`${input.refDate}T12:00:00Z`).getUTCDay();
        const daysSinceSunday = refDow === 0 ? 7 : refDow;
        const latestPastSunday = addDaysFromLocalDate(
          input.refDate,
          -daysSinceSunday,
        );
        if (
          localDate < latestPastSunday ||
          input.state === "slipping"
        ) {
          lines.push(
            `INSERT INTO checkin_reviews (id, checkin_id, coaching_relationship_id, trainer_user_id, outcome, notes, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin-review", checkinId))}, ${sqlQuote(checkinId)}, ${sqlQuote(input.relId)}, ${sqlQuote(userId(input.trainerEmail))}, 'acknowledged', NULL, ${sqlQuote(submittedAt)}, ${sqlQuote(submittedAt)});`,
          );
        }
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
  // Slipping / ack / push-off: keep almost everything logged so detection does
  // not flood attention. Leave a few deliberate holes that match persona overlays.
  if (
    state === "slipping" ||
    state === "acknowledged" ||
    state === "notifications_off" ||
    state === "attention_hole"
  ) {
    if (state === "slipping" && localDate === refDate) {
      if (mealName === "Breakfast" || mealName === "Lunch" || mealName === "Dinner") {
        return false;
      }
    }
    if (state === "acknowledged" && mealName === "Lunch") {
      const ackDay = addDaysFromLocalDate(refDate, -2);
      if (localDate === ackDay) return false;
    }
    if (state === "notifications_off") {
      // Yesterday's dinner is past-window so detection opens a critical;
      // today's lunch stays pending (coach-ask persona) without flooding.
      const yesterday = addDaysFromLocalDate(refDate, -1);
      if (localDate === yesterday && mealName === "Dinner") return false;
      if (localDate === refDate && mealName === "Lunch") return false;
    }
    // attention_hole: keep meals logged; workout hole alone drives Attention.
    return "confirm";
  }
  if (state === "food_deviations") {
    if (mealName === "Lunch" && localDate === refDate) return false;
    return "confirm";
  }
  // On-track (and default): log every prescribed meal once its slot has started,
  // including snacks — unlogged snacks become critical overdue otherwise.
  if (localDate >= adherenceStart && localDate <= refDate) {
    return "confirm";
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
  if (state === "slipping") {
    const missFrom = addDaysFromLocalDate(refDate, -2);
    // Leave the current-week Saturday (Lower body B) startable for TR-10 / TR-10b.
    const dow = new Date(`${localDate}T12:00:00Z`).getUTCDay();
    if (dow === 6 && localDate >= addDaysFromLocalDate(refDate, -6)) {
      return false;
    }
    if (localDate >= missFrom) return false;
    return "completed";
  }
  // Meera (acknowledged): keep workouts logged so detection does not open a
  // fresh active exception beside her seeded acknowledged "Missed lunch".
  if (state === "acknowledged") {
    return "completed";
  }
  // Extra attention clients: miss only yesterday's workout (Attention severity).
  if (state === "attention_hole") {
    const yesterday = addDaysFromLocalDate(refDate, -1);
    if (localDate === yesterday) return false;
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

  // Stable IDs from docs/spec/09-demo-data.md (agents verify these URLs).
  const ROHAN_ACTIVE_EXCEPTION_ID = "95af751f-156c-44ac-a945-ec30870134ae";
  const ROHAN_RESOLVED_EXCEPTION_ID = "fa80cb4f-f852-403e-9c91-318a9944f238";
  const MEERA_ACK_EXCEPTION_ID = "f588b76a-62a3-42bb-bf85-0570ea52c9eb";

  // Spread ages so attention cards aren't all "just now". Cap seeded rows so
  // detection for today's unlogged holes stays ≤10 open total per client.
  const exceptionRows = [
    ["rohan-missed-workout", ROHAN_ACTIVE_EXCEPTION_ID, rohanRel, "missed_workout", "critical", missedWorkoutId, "workout_assignment", 2, 6],
    ["rohan-skipped-workout", demoUuid("exception", "rohan-skipped-workout"), rohanRel, "skipped_workout", "attention", skippedWorkoutId, "workout_assignment", 0, 18],
    ["rohan-overdue-meal", demoUuid("exception", "rohan-overdue-meal"), rohanRel, "overdue_meal", "critical", overdueMealId, "meal_assignment", 1, 4],
    ["rohan-skipped-meal", demoUuid("exception", "rohan-skipped-meal"), rohanRel, "skipped_meal", "attention", skippedMealId, "meal_assignment", 0, 9],
    ["rohan-meal-deviation", demoUuid("exception", "rohan-meal-deviation"), rohanRel, "meal_deviation", "attention", deviationMealId, "meal_assignment", 0, 3],
    ["rohan-overdue-checkin", demoUuid("exception", "rohan-overdue-checkin-active"), rohanRel, "overdue_checkin", "attention", overdueCheckinId, "checkin", 7, 2],
  ] as const;
  for (const [, id, rel, type, severity, sourceId, sourceType, daysAgo, hoursAgo] of exceptionRows) {
    const detected = new Date(
      Date.parse(now) - daysAgo * 86_400_000 - hoursAgo * 3_600_000,
    ).toISOString();
    const summary = labelFor("exception_type", type);
    const localDate =
      type === "missed_workout"
        ? addDaysFromLocalDate(refDate, -2)
        : type === "overdue_checkin"
          ? addDaysFromLocalDate(refDate, -7)
          : refDate;
    const detailsJson = JSON.stringify({
      localDate,
      windowEndsAt: `${localDate}T18:30:00.000Z`,
    });
    lines.push(
      `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, details_json, detected_at, created_at, updated_at) VALUES (${sqlQuote(id)}, ${sqlQuote(rel)}, ${sqlQuote(type)}, ${sqlQuote(severity)}, 'active', 'demo-v1', ${sqlQuote(sourceType)}, ${sqlQuote(sourceId)}, ${sqlQuote(summary)}, ${sqlQuote(detailsJson)}, ${sqlQuote(detected)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
  }

  const rohanResolvedDetected = new Date(
    Date.parse(now) - 10 * 86_400_000,
  ).toISOString();
  const rohanResolvedAt = new Date(
    Date.parse(now) - 9 * 86_400_000,
  ).toISOString();
  lines.push(
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, resolved_at, resolution_outcome, created_at, updated_at) VALUES (${sqlQuote(ROHAN_RESOLVED_EXCEPTION_ID)}, ${sqlQuote(rohanRel)}, 'missed_workout', 'attention', 'resolved', 'demo-v1', 'workout_assignment', ${sqlQuote(demoUuid("workout-assignment", "rohan.slipping@demo.fitbud.test", addDaysFromLocalDate(refDate, -10)))}, 'Missed workout', ${sqlQuote(rohanResolvedDetected)}, ${sqlQuote(rohanResolvedAt)}, 'talked', ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  // Unlogged past meal with resolved exception → Diet shows "Closed by …".
  const rohanLockedMealId = demoUuid(
    "meal-assignment",
    "rohan.slipping@demo.fitbud.test",
    addDaysFromLocalDate(refDate, -3),
    MEAL_PRESCRIPTION_IDS.lunch,
  );
  const rohanLockedMealExceptionId = demoUuid(
    "exception",
    "rohan-resolved-meal",
  );
  const rohanLockedDetected = new Date(
    Date.parse(now) - 3 * 86_400_000 - 5 * 3_600_000,
  ).toISOString();
  const rohanLockedResolved = new Date(
    Date.parse(now) - 2 * 86_400_000,
  ).toISOString();
  lines.push(
    `DELETE FROM meal_compliance WHERE assignment_id = ${sqlQuote(rohanLockedMealId)};`,
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, resolved_at, resolution_outcome, created_at, updated_at) VALUES (${sqlQuote(rohanLockedMealExceptionId)}, ${sqlQuote(rohanRel)}, 'overdue_meal', 'attention', 'resolved', 'demo-v1', 'meal_assignment', ${sqlQuote(rohanLockedMealId)}, 'Missed lunch', ${sqlQuote(rohanLockedDetected)}, ${sqlQuote(rohanLockedResolved)}, 'talked', ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const meeraRel = relId("rahul.coach@demo.fitbud.test", "meera.ack@demo.fitbud.test");
  const ackMealId = demoUuid("meal-assignment", "meera.ack@demo.fitbud.test", addDaysFromLocalDate(refDate, -2), MEAL_PRESCRIPTION_IDS.lunch);
  const ackExceptionId = MEERA_ACK_EXCEPTION_ID;
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
  // Pre-seed Farhan exceptions with realistic ages (not detected_at=now).
  const farhanMealSlots = [
    MEAL_PRESCRIPTION_IDS.breakfast,
    MEAL_PRESCRIPTION_IDS.lunch,
    MEAL_PRESCRIPTION_IDS.dinner,
    MEAL_PRESCRIPTION_IDS.snack,
  ] as const;
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    const day = addDaysFromLocalDate(refDate, -dayOffset);
    const ageHours = 18 + dayOffset * 24;
    const detected = new Date(Date.parse(now) - ageHours * 3_600_000).toISOString();
    for (const slot of farhanMealSlots) {
      const mealId = demoUuid(
        "meal-assignment",
        "farhan.paused@demo.fitbud.test",
        day,
        slot,
      );
      lines.push(
        `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", `farhan-${day}-${slot}`))}, ${sqlQuote(farhanRel)}, 'overdue_meal', 'critical', 'active', 'demo-v1', 'meal_assignment', ${sqlQuote(mealId)}, 'Required meal still unlogged', ${sqlQuote(detected)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
      );
    }
  }
  // Re-engage eligibility: no logs in 48h (above) + ≥3 reminders in 48h.
  const reengageAt = new Date(Date.parse(now) - 6 * 3_600_000).toISOString();
  for (let i = 0; i < 3; i += 1) {
    lines.push(
      `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at, payload_json) VALUES (${sqlQuote(demoUuid("notification", `farhan-reengage-${i}`))}, ${sqlQuote(userId("farhan.paused@demo.fitbud.test"))}, ${sqlQuote(farhanRel)}, 'meal_reminder', 'meal_assignment', ${sqlQuote(demoUuid("meal-assignment", "farhan.paused@demo.fitbud.test", refDate, `reengage-${i}`))}, 'delivered', ${sqlQuote(`farhan-reengage-${i}`)}, ${sqlQuote(reengageAt)}, NULL, '{"summary":"Reminder"}');`,
    );
  }

  // Deepak + attention_hole clients: Attention-severity open items so Home
  // shows Critical/Attention across 8 clients; Aarav stays On track.
  const deepakRel = relId("rahul.coach@demo.fitbud.test", "deepak.dubai@demo.fitbud.test");
  const deepakWorkoutId = demoUuid(
    "workout-assignment",
    "deepak.dubai@demo.fitbud.test",
    addDaysFromLocalDate(refDate, -1),
  );
  const deepakDetected = new Date(Date.parse(now) - 30 * 3_600_000).toISOString();
  lines.push(
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", "deepak-skipped-workout"))}, ${sqlQuote(deepakRel)}, 'skipped_workout', 'attention', 'active', 'demo-v1', 'workout_assignment', ${sqlQuote(deepakWorkoutId)}, 'Skipped workout', ${sqlQuote(deepakDetected)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  for (const [email, key] of [
    ["arjun.attention@demo.fitbud.test", "arjun"],
    ["neha.attention@demo.fitbud.test", "neha"],
    ["tanvi.attention@demo.fitbud.test", "tanvi"],
  ] as const) {
    const holeRel = relId("rahul.coach@demo.fitbud.test", email);
    const holeMealId = demoUuid(
      "meal-assignment",
      email,
      addDaysFromLocalDate(refDate, -1),
      MEAL_PRESCRIPTION_IDS.lunch,
    );
    const holeDetected = new Date(Date.parse(now) - 20 * 3_600_000).toISOString();
    lines.push(
      `DELETE FROM meal_compliance WHERE assignment_id = ${sqlQuote(holeMealId)};`,
      `INSERT INTO meal_compliance (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, record_version, logged_at, deviation_kind, notes, photo_required, photo_intent_json, media_asset_id, items_json, kcal_scaled, protein_scaled, carbs_scaled, fat_scaled, logged_late, logged_after_resolve, client_logged_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("meal-compliance", holeMealId))}, ${sqlQuote(holeMealId)}, ${sqlQuote(holeRel)}, ${sqlQuote(demoUuid("plan-version", holeRel, "v2"))}, ${sqlQuote(userId(email))}, 'skipped', 0, ${sqlQuote(now)}, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
      `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", `${key}-skipped-lunch`))}, ${sqlQuote(holeRel)}, 'skipped_meal', 'attention', 'active', 'demo-v1', 'meal_assignment', ${sqlQuote(holeMealId)}, 'Skipped lunch', ${sqlQuote(holeDetected)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
  }

  const ishitaRel = relId("rahul.coach@demo.fitbud.test", "ishita.pushoff@demo.fitbud.test");
  const ishitaMealId = demoUuid("meal-assignment", "ishita.pushoff@demo.fitbud.test", refDate, MEAL_PRESCRIPTION_IDS.lunch);
  const ishitaDinnerId = demoUuid(
    "meal-assignment",
    "ishita.pushoff@demo.fitbud.test",
    addDaysFromLocalDate(refDate, -1),
    MEAL_PRESCRIPTION_IDS.dinner,
  );
  const ishitaDetected = new Date(Date.parse(now) - 16 * 3_600_000).toISOString();
  lines.push(
    `INSERT INTO device_tokens (id, user_id, platform, provider, token, installation_id, status, last_seen_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("device-token", "ishita"))}, ${sqlQuote(userId("ishita.pushoff@demo.fitbud.test"))}, 'android', 'fcm', 'demo-ishita-revoked', 'demo-ishita-install', 'revoked', ${sqlQuote(now)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO reminder_rules (id, coaching_relationship_id, reminder_type, enabled, created_at, updated_at) VALUES (${sqlQuote(demoUuid("reminder-rule", "ishita-workout"))}, ${sqlQuote(ishitaRel)}, 'workout_reminder', 0, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO coach_asks (id, relationship_id, trainee_user_id, item_type, item_id, topic, asked_at, last_asked_at, ask_count, status) VALUES (${sqlQuote(demoUuid("coach_ask", "ishita"))}, ${sqlQuote(ishitaRel)}, ${sqlQuote(userId("ishita.pushoff@demo.fitbud.test"))}, 'meal_assignment', ${sqlQuote(ishitaMealId)}, 'portion_size', ${sqlQuote(now)}, ${sqlQuote(now)}, 2, 'open');`,
    `INSERT INTO exceptions (id, coaching_relationship_id, type, severity, status, rule_version, source_entity_type, source_entity_id, summary, detected_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("exception", "ishita-dinner"))}, ${sqlQuote(ishitaRel)}, 'overdue_meal', 'critical', 'active', 'demo-v1', 'meal_assignment', ${sqlQuote(ishitaDinnerId)}, 'Missed dinner', ${sqlQuote(ishitaDetected)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
  );

  const nikhilRel = relId("rahul.coach@demo.fitbud.test", "nikhil.reactivate@demo.fitbud.test");
  lines.push(
    `INSERT INTO reactivation_requests (id, relationship_id, trainer_user_id, status, intake_update_requested, expires_at, created_at) VALUES (${sqlQuote(demoUuid("reactivation", "nikhil"))}, ${sqlQuote(nikhilRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'pending', 0, ${sqlQuote(new Date(Date.parse(now) + 9 * 86_400_000).toISOString())}, ${sqlQuote(now)});`,
  );

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

  // Upcoming weekly check-in drafts, staggered across the week (not all Sunday).
  const upcomingCheckins = [
    ["aarav.ontrack@demo.fitbud.test", 3],
    ["rohan.slipping@demo.fitbud.test", 5],
    ["meera.ack@demo.fitbud.test", 4],
    ["farhan.paused@demo.fitbud.test", 2],
    ["ishita.pushoff@demo.fitbud.test", 1],
    ["deepak.dubai@demo.fitbud.test", 6],
    ["arjun.attention@demo.fitbud.test", 3],
    ["neha.attention@demo.fitbud.test", 4],
    ["tanvi.attention@demo.fitbud.test", 0],
  ] as const;
  for (const [email, weekday] of upcomingCheckins) {
    const lastDue = previousWeekdayBefore(refDate, weekday);
    let nextCheckinDate = addDaysFromLocalDate(lastDue, 7);
    if (nextCheckinDate <= refDate) {
      nextCheckinDate = addDaysFromLocalDate(nextCheckinDate, 7);
    }
    const trainer =
      email.startsWith("lakshmi.") || email.startsWith("karan.")
        ? "priya.coach@demo.fitbud.test"
        : "rahul.coach@demo.fitbud.test";
    const relationship = relId(trainer, email);
    const timezone = email.startsWith("deepak.") ? "Asia/Dubai" : "Asia/Kolkata";
    lines.push(
      `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin", `${email}-next`))}, ${sqlQuote(relationship)}, ${sqlQuote(demoUuid("checkin-schedule", relationship))}, ${sqlQuote(nextCheckinDate)}, ${sqlQuote(localDayStartIso(nextCheckinDate, "09:00", timezone))}, ${sqlQuote(new Date(Date.parse(localDayStartIso(nextCheckinDate, "09:00", timezone)) + 48 * 3_600_000).toISOString())}, 'draft', 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
  }

  // Explicit Due + Overdue drafts for inbox tabs (TW-22).
  {
    const meeraRel = relId(
      "rahul.coach@demo.fitbud.test",
      "meera.ack@demo.fitbud.test",
    );
    const dueStart = new Date(Date.parse(now) - 2 * 3_600_000).toISOString();
    const dueEnd = new Date(Date.parse(now) + 22 * 3_600_000).toISOString();
    lines.push(
      `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin", "meera-due"))}, ${sqlQuote(meeraRel)}, ${sqlQuote(demoUuid("checkin-schedule", meeraRel))}, ${sqlQuote(refDate)}, ${sqlQuote(dueStart)}, ${sqlQuote(dueEnd)}, 'draft', 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)});`,
      // Prior weight so TR-14 step 1 shows "Last: …".
      `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(demoUuid("measurement", "meera-weight", "latest"))}, ${sqlQuote(meeraRel)}, ${sqlQuote(userId("meera.ack@demo.fitbud.test"))}, 'body_weight_kg', 62.4, 'kg', ${sqlQuote(localDayStartIso(addDaysFromLocalDate(refDate, -7), "08:15", "Asia/Kolkata"))}, 'trainee_entry', NULL, NULL, 0, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
    const farhanRel = relId(
      "rahul.coach@demo.fitbud.test",
      "farhan.paused@demo.fitbud.test",
    );
    const overdueDate = addDaysFromLocalDate(refDate, -2);
    const overdueStart = localDayStartIso(overdueDate, "09:00", "Asia/Kolkata");
    const overdueEnd = new Date(Date.parse(now) - 6 * 3_600_000).toISOString();
    lines.push(
      `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin", "farhan-overdue"))}, ${sqlQuote(farhanRel)}, ${sqlQuote(demoUuid("checkin-schedule", farhanRel))}, ${sqlQuote(overdueDate)}, ${sqlQuote(overdueStart)}, ${sqlQuote(overdueEnd)}, 'draft', 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
  }

  // Rohan: latest weekly (Friday) check-in submitted and reviewed (Today + Progress).
  const rohanCheckinDate = previousWeekdayBefore(refDate, 5);
  const rohanCheckinStart = localDayStartIso(rohanCheckinDate, "09:00", "Asia/Kolkata");
  const rohanSubmittedAt = clampIsoToNow(
    localDayStartIso(rohanCheckinDate, "21:30", "Asia/Kolkata"),
    now,
  );
  lines.push(
    `INSERT INTO checkins (id, coaching_relationship_id, checkin_schedule_id, local_date, window_starts_at, window_ends_at, record_status, record_version, definition_version, checkin_form_version_id, answers_json, submitted_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin", "rohan.slipping@demo.fitbud.test", rohanCheckinDate))}, ${sqlQuote(rohanRel)}, ${sqlQuote(demoUuid("checkin-schedule", rohanRel))}, ${sqlQuote(rohanCheckinDate)}, ${sqlQuote(rohanCheckinStart)}, ${sqlQuote(new Date(Date.parse(rohanCheckinStart) + 48 * 3_600_000).toISOString())}, 'submitted', 0, 1, ${sqlQuote(DEMO_CHECKIN_FORM_VERSION_ID)}, ${jsonQuote({ wellbeing: "Hit my protein most days. Walked after dinner four times.", notes: "Office travel Tue to Thu. Missed two sessions and ate out twice.", went_well: "Hit my protein most days. Walked after dinner four times.", was_hard: "Office travel Tue to Thu. Missed two sessions and ate out twice.", for_coach: "Can we move leg day to the weekend?", energy: 3, hunger: 4, stress: 4 })}, ${sqlQuote(rohanSubmittedAt)}, ${sqlQuote(rohanCheckinStart)}, ${sqlQuote(rohanSubmittedAt)});`,
    `INSERT INTO checkin_reviews (id, checkin_id, coaching_relationship_id, trainer_user_id, outcome, notes, created_at, updated_at) VALUES (${sqlQuote(demoUuid("checkin-review", "rohan.slipping@demo.fitbud.test", rohanCheckinDate))}, ${sqlQuote(demoUuid("checkin", "rohan.slipping@demo.fitbud.test", rohanCheckinDate))}, ${sqlQuote(rohanRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'acknowledged', 'Solid effort this week — lock in sleep and we will rebuild training next.', ${sqlQuote(rohanSubmittedAt)}, ${sqlQuote(rohanSubmittedAt)});`,
    // Latest Sunday is also reviewed for slipping; give it the reply so Today prefers it.
    `UPDATE checkin_reviews SET notes = 'Solid effort this week — lock in sleep and we will rebuild training next.', updated_at = ${sqlQuote(rohanSubmittedAt)} WHERE checkin_id = ${sqlQuote(demoUuid("checkin", "rohan.slipping@demo.fitbud.test", previousWeekdayBefore(refDate, 0)))};`,
  );

  // Rohan waist for Progress measurements row (TR-13).
  {
    const waistDate = previousWeekdayBefore(refDate, 5);
    const waistAt = clampIsoToNow(
      localDayStartIso(waistDate, "08:25", "Asia/Kolkata"),
      now,
    );
    const startWaistAt = clampIsoToNow(
      localDayStartIso(addDaysFromLocalDate(waistDate, -49), "08:25", "Asia/Kolkata"),
      now,
    );
    lines.push(
      `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(demoUuid("measurement", "rohan-waist", "start"))}, ${sqlQuote(rohanRel)}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, 'waist_cm', 97, 'cm', ${sqlQuote(startWaistAt)}, 'trainee_entry', NULL, NULL, 0, ${sqlQuote(startWaistAt)}, ${sqlQuote(startWaistAt)});`,
      `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(demoUuid("measurement", "rohan-waist", "latest"))}, ${sqlQuote(rohanRel)}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, 'waist_cm', 94, 'cm', ${sqlQuote(waistAt)}, 'trainee_entry', NULL, NULL, 0, ${sqlQuote(waistAt)}, ${sqlQuote(waistAt)});`,
      `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(demoUuid("measurement", "rohan-waist", "prev"))}, ${sqlQuote(rohanRel)}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, 'waist_cm', 95, 'cm', ${sqlQuote(localDayStartIso(addDaysFromLocalDate(waistDate, -7), "08:25", "Asia/Kolkata"))}, 'trainee_entry', NULL, NULL, 0, ${sqlQuote(now)}, ${sqlQuote(now)});`,
      `INSERT INTO trainer_notes (id, coaching_relationship_id, trainer_user_id, checkin_id, body, visibility, subject_type, subject_id, shared_at, unshared_at, seen_at, created_at, updated_at) VALUES (${sqlQuote(demoUuid("note", "rohan-knee"))}, ${sqlQuote(rohanRel)}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, NULL, 'Knee felt sore on walking lunges. Swapped to step-ups until the next check-in.', 'private', NULL, NULL, NULL, NULL, NULL, ${sqlQuote(localDayStartIso(addDaysFromLocalDate(refDate, -5), "10:00", "Asia/Kolkata"))}, ${sqlQuote(now)});`,
    );
  }

  // Rohan: weigh-in series for Progress chart (TR-13).
  for (let weeksAgo = 0; weeksAgo < 8; weeksAgo += 1) {
    const localDate = addDaysFromLocalDate(rohanCheckinDate, -7 * weeksAgo);
    const weightKg = Number((86.4 + weeksAgo * 0.5).toFixed(1));
    const observedAt = clampIsoToNow(
      localDayStartIso(localDate, "08:20", "Asia/Kolkata"),
      now,
    );
    const measurementId = demoUuid(
      "measurement",
      "rohan-weight",
      "rohan.slipping@demo.fitbud.test",
      localDate,
    );
    lines.push(
      `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, checkin_id, media_asset_id, record_version, created_at, updated_at) VALUES (${sqlQuote(measurementId)}, ${sqlQuote(rohanRel)}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, 'body_weight_kg', ${weightKg}, 'kg', ${sqlQuote(observedAt)}, 'trainee_entry', NULL, NULL, 0, ${sqlQuote(observedAt)}, ${sqlQuote(observedAt)});`,
    );
  }


  // Rohan inbox mix (TR-15): coach note, check-in review, workout — not only meals.
  {
    const coachNoteAt = clampIsoToNow(
      localDayStartIso(refDate, "01:08", "Asia/Kolkata"),
      now,
    );
    const workoutAt = clampIsoToNow(
      localDayStartIso(addDaysFromLocalDate(refDate, -1), "18:40", "Asia/Kolkata"),
      now,
    );
    const checkinAt = clampIsoToNow(
      localDayStartIso(rohanCheckinDate, "20:05", "Asia/Kolkata"),
      now,
    );
    lines.push(
      `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at, payload_json) VALUES (${sqlQuote(demoUuid("notification", "rohan-inbox-mixed-note"))}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, ${sqlQuote(rohanRel)}, 'trainer_note_shared', 'checkin', ${sqlQuote(demoUuid("checkin", "rohan.slipping@demo.fitbud.test", rohanCheckinDate))}, 'delivered', ${sqlQuote("rohan-inbox-mixed-note")}, ${sqlQuote(coachNoteAt)}, NULL, ${jsonQuote({ summary: "About your check-in" })});`,
      `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at, payload_json) VALUES (${sqlQuote(demoUuid("notification", "rohan-inbox-mixed-checkin"))}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, ${sqlQuote(rohanRel)}, 'checkin_reviewed', 'checkin', ${sqlQuote(demoUuid("checkin", "rohan.slipping@demo.fitbud.test", rohanCheckinDate))}, 'delivered', ${sqlQuote("checkin_reviewed:" + demoUuid("checkin", "rohan.slipping@demo.fitbud.test", rohanCheckinDate))}, ${sqlQuote(checkinAt)}, NULL, ${jsonQuote({ summary: "Acknowledged" })});`,
      `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at, payload_json) VALUES (${sqlQuote(demoUuid("notification", "rohan-inbox-mixed-workout"))}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, ${sqlQuote(rohanRel)}, 'workout_reminder', 'workout_assignment', ${sqlQuote(demoUuid("workout-assignment", "rohan.slipping@demo.fitbud.test", refDate))}, 'delivered', ${sqlQuote("rohan-inbox-mixed-workout")}, ${sqlQuote(workoutAt)}, NULL, ${jsonQuote({ summary: "Lower body B is planned for this evening" })});`,
    );
  }

  // Rohan reminders (14d window) for responsiveness; inbox still leads with mixed types.
  const rohanReminders = [
    [3, MEAL_PRESCRIPTION_IDS.breakfast, true],
    [3, MEAL_PRESCRIPTION_IDS.dinner, true],
    [2, MEAL_PRESCRIPTION_IDS.lunch, true],
    [1, MEAL_PRESCRIPTION_IDS.lunch, true],
    [1, MEAL_PRESCRIPTION_IDS.dinner, false],
  ] as const;
  rohanReminders.forEach(([daysAgo, slot, opened], index) => {
    const day = addDaysFromLocalDate(refDate, -daysAgo);
    const assignmentId = demoUuid("meal-assignment", "rohan.slipping@demo.fitbud.test", day, slot);
    const slotTime =
      slot === MEAL_PRESCRIPTION_IDS.breakfast
        ? "08:00"
        : slot === MEAL_PRESCRIPTION_IDS.lunch
          ? "13:00"
          : "20:00";
    const sentAt = new Date(
      Date.parse(localDayStartIso(day, slotTime, "Asia/Kolkata")) - 10 * 60_000,
    ).toISOString();
    const openedAt = opened
      ? new Date(Date.parse(sentAt) + 4 * 60_000).toISOString()
      : null;
    lines.push(
      `INSERT INTO notifications (id, recipient_user_id, coaching_relationship_id, notification_type, domain_entity_type, domain_entity_id, state, dedupe_key, created_at, read_at, opened_at, payload_json) VALUES (${sqlQuote(demoUuid("notification", `rohan-reminder-${index}`))}, ${sqlQuote(userId("rohan.slipping@demo.fitbud.test"))}, ${sqlQuote(rohanRel)}, 'meal_reminder', 'meal_assignment', ${sqlQuote(assignmentId)}, ${opened ? "'read'" : "'delivered'"}, ${sqlQuote(`rohan-reminder-${index}`)}, ${sqlQuote(sentAt)}, ${openedAt ? sqlQuote(openedAt) : "NULL"}, ${openedAt ? sqlQuote(openedAt) : "NULL"}, '{"summary":"Meal reminder"}');`,
    );
  });

  // Quiet hours stored per client (not only runtime defaults).
  const quietHours = [
    ["rohan.slipping@demo.fitbud.test", "22:00", "06:30"],
    ["ishita.pushoff@demo.fitbud.test", "23:00", "07:00"],
    ["deepak.dubai@demo.fitbud.test", "22:30", "06:00"],
  ] as const;
  for (const [email, start, end] of quietHours) {
    lines.push(
      `INSERT INTO notification_preferences (user_id, push_enabled, workout_reminder, meal_reminder, checkin_reminder, subscription_renewal_reminder, daily_summary_reminder, quiet_hours_start, quiet_hours_end, created_at, updated_at) VALUES (${sqlQuote(userId(email))}, 1, 1, 1, 1, 1, 1, ${sqlQuote(start)}, ${sqlQuote(end)}, ${sqlQuote(now)}, ${sqlQuote(now)});`,
    );
  }

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
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, recipient_whatsapp_e164, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-pending"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.invite@demo.fitbud.test', 'Anita Desai', '919876501111', ${sqlQuote(pendingHash)}, 'pending', ${sqlQuote(new Date(Date.parse(now) + 5 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-expired"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.expired@demo.fitbud.test', 'Anita Desai', ${sqlQuote(sha256HexSync("demo-anita-expired"))}, 'expired', ${sqlQuote(new Date(Date.parse(now) - 2 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "anita-revoked"))}, ${sqlQuote(userId("rahul.coach@demo.fitbud.test"))}, 'anita.revoked@demo.fitbud.test', 'Anita Desai', ${sqlQuote(sha256HexSync("demo-anita-revoked"))}, 'revoked', ${sqlQuote(new Date(Date.parse(now) + 3 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
    `INSERT INTO client_invitations (id, trainer_user_id, recipient_email, recipient_display_name, token_hash, status, expires_at, onboarding_form_template_version_id, created_at, updated_at) VALUES (${sqlQuote(demoUuid("invite", "kavya-priya"))}, ${sqlQuote(userId("priya.coach@demo.fitbud.test"))}, 'kavya.ended@demo.fitbud.test', 'Kavya Menon', ${sqlQuote(sha256HexSync("demo-kavya-priya-invite"))}, 'pending', ${sqlQuote(new Date(Date.parse(now) + 6 * 86_400_000).toISOString())}, (SELECT id FROM onboarding_form_versions ORDER BY version DESC LIMIT 1), ${sqlQuote(now)}, ${sqlQuote(now)});`,
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
  const defaultStartedAt = new Date(
    Date.parse(`${refDate}T06:00:00.000Z`) - 27 * 86_400_000,
  ).toISOString();
  const lines: string[] = [`-- history anchor ${refDate}`];

  lines.push(buildTrainerTemplates(now, input.libraryIndex));

  // Global form v1 is updated in migration 0029. Demo rows pin that version.


  for (const account of DEMO_ACCOUNTS) {
    if (account.role !== "trainee" || !account.trainerEmail) continue;
    const startedAt = demoStartedAt(account.email, refDate, defaultStartedAt);
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
    const activityUntilIso = endedAt ?? now;
    const activityUntilDate = endedAt
      ? activityUntilIso.slice(0, 10)
      : refDate;
    lines.push(
      buildAssignmentsAndLogs({
        relId: rid,
        traineeEmail: account.email,
        trainerEmail: account.trainerEmail,
        state: account.state,
        refDate,
        now,
        activityUntilDate,
        activityUntilIso,
        planId: plan.planId,
        planVersionId: plan.planVersionId,
        content: plan.content,
        timezone,
      }),
    );
    if (ended && endedAt) {
      // Match endCoachingRelationship: no live schedule after the end date.
      const endDay = endedAt.slice(0, 10);
      const closedTo = `${addDaysFromLocalDate(endDay, -1)}T00:00:00.000Z`;
      lines.push(
        `UPDATE workout_assignments SET schedule_status = 'superseded', superseded_at = ${sqlQuote(endedAt)}, updated_at = ${sqlQuote(endedAt)} WHERE coaching_relationship_id = ${sqlQuote(rid)} AND schedule_status = 'scheduled' AND local_date >= ${sqlQuote(endDay)};`,
        `UPDATE meal_assignments SET schedule_status = 'superseded', superseded_at = ${sqlQuote(endedAt)}, updated_at = ${sqlQuote(endedAt)} WHERE coaching_relationship_id = ${sqlQuote(rid)} AND schedule_status = 'scheduled' AND local_date >= ${sqlQuote(endDay)};`,
        `UPDATE plan_versions SET effective_to = ${sqlQuote(closedTo)}, updated_at = ${sqlQuote(endedAt)} WHERE plan_id = ${sqlQuote(plan.planId)} AND status = 'effective';`,
      );
    }
  }

  lines.push(buildPersonaOverlays(input));

  return lines.join("\n");
}

export const DEMO_PENDING_INVITE_TOKEN = DEMO_ANITA_PENDING_INVITE_TOKEN;
