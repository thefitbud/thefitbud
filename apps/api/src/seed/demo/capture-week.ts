/**
 * Z10-22: the demo week for the phone captures (W9 leftovers).
 *
 * One client, Lakshmi (`lakshmi.foods`, coached by Priya), gets the rows the
 * trainee Workout, Diet and Progress captures need, written as production
 * writes them (the Z6-19 coach-log path, `domain/coach-log.ts`):
 *
 * - a startable workout on the seed's today (Upper body A: weighted bench,
 *   shoulder press and curl, plus bodyweight push-ups), scheduled explicitly
 *   for today instead of by the plan's weekday pattern;
 * - a completed workout (a trainee entry the coach then edited) and a missed
 *   workout earlier this week; on a Monday or a
 *   Tuesday (fewer than two earlier days this week) the previous week's last
 *   days stand in;
 * - a coach-logged workout, a coach-logged
 *   dinner, and a coach-logged weight and waist, each with its `log_edit_events`
 *   audit row (the activity-feed event).
 *
 * Left out on purpose: the trainee's `coach_log_updated` inbox rows (their
 * dedupe key carries the audit event id, which the QA seed's identity guard
 * rejects for this QA-source client) and `change_log` rows (see below).
 *
 * Only a database that has the Z6-18 columns and `log_edit_events` (migration
 * 0039) gets these rows: `loadDemoLibraryIndex` probes it, so the migration
 * chain tests that seed an older schema are untouched.
 *
 * Every date is relative to the seed's reference date, so the week is right
 * whatever day `db:reset` runs. No `change_log` row is written: the trainee's
 * first sync pull bootstraps the log from the tables only while the trainee has
 * none (domain/sync.ts), and no other seeded record writes one.
 */
import {
  materializePlanContent,
  missedWorkoutCandidate,
  resolveCompletedWorkoutStatus,
  setCompletionIsModified,
} from "@fitbud/core";
import type { PlanContent } from "@fitbud/contracts";
import { resolveSetLoad } from "../../domain/load-parser.js";
import {
  mealLogSnapshot,
  measurementLogSnapshot,
  workoutLogSnapshot,
} from "../../domain/coach-log.js";
import { addDaysFromLocalDate, demoUuid, localDayStartIso, sqlQuote } from "./ids.js";
import { MEAL_PRESCRIPTION_IDS, buildStandardPlanContent, type DemoLibraryIndex } from "./personas.js";
import { personaConfig } from "./generator/personas.js";
import { SeedRows } from "./generator/sql.js";
import { rowsToSql } from "./generator/index.js";

export const CAPTURE_TRAINEE_EMAIL = "lakshmi.foods@demo.fitbud.test";
export const CAPTURE_TRAINER_EMAIL = "priya.coach@demo.fitbud.test";

type WorkoutDay = PlanContent["workoutDays"][number];

function weekday(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay();
}

export type CaptureWeekDates = {
  today: string;
  /** Trainee-logged, finished, and then edited by the coach. */
  completed: string;
  /** No execution; its window has closed. */
  missed: string;
  /** Logged by the coach. */
  coachLogged: string;
  /** The completed workout's day: the coach edited that trainee entry. */
  coachEdited: string;
  /** Coach-logged dinner, weight and waist. */
  mealDay: string;
  measurementDay: string;
};

/**
 * Dates of the capture week. "Earlier this week" is Monday up to yesterday;
 * with fewer than two such days it is the previous week, newest day first.
 * The coach entries stay inside the 7-day coach-log window (T-1 to T-6).
 */
export function captureWeekDates(refDate: string): CaptureWeekDates {
  const sinceMonday = (weekday(refDate) + 6) % 7;
  const thisWeek = Array.from({ length: sinceMonday }, (_, i) => addDaysFromLocalDate(refDate, -(i + 1)));
  const monday = addDaysFromLocalDate(refDate, -sinceMonday);
  const pool =
    thisWeek.length >= 2
      ? thisWeek
      : Array.from({ length: 7 }, (_, i) => addDaysFromLocalDate(monday, -(i + 1)));
  const [completed, missed] = pool as [string, string];
  // The coach-logged day is the newest remaining day inside the coach window.
  const rest = Array.from({ length: 6 }, (_, i) => addDaysFromLocalDate(refDate, -(i + 1))).filter(
    (date) => date !== completed && date !== missed,
  );
  return {
    today: refDate,
    completed,
    missed,
    coachLogged: rest[0]!,
    coachEdited: completed,
    mealDay: addDaysFromLocalDate(refDate, -2),
    measurementDay: addDaysFromLocalDate(refDate, -1),
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** `preferred`, but never before `floor` and never after `now`. */
function between(preferred: string, floor: string, now: string): string {
  return iso(Math.min(Date.parse(now), Math.max(Date.parse(preferred), Date.parse(floor))));
}

type SetState = {
  id: string;
  targetId: string;
  order: number;
  prescribedReps: number | null;
  prescribedLoadLabel: string | null;
  actualReps: number | null;
  actualLoadLabel: string | null;
  /** Same rule as the route: reps or load off the prescription read "modified". */
  status: "completed" | "modified";
  /** Set only on a set the coach changed. */
  editedAt: string | null;
};

function setStatus(set: Pick<SetState, "prescribedReps" | "prescribedLoadLabel" | "actualReps" | "actualLoadLabel">) {
  return setCompletionIsModified(set) ? ("modified" as const) : ("completed" as const);
}

/** The coach changes a set's reps; status follows the same rule the edit route applies. */
function editReps(set: SetState, reps: number, editedAt: string) {
  set.actualReps = reps;
  set.status = setStatus(set);
  set.editedAt = editedAt;
}

type ExerciseState = {
  id: string;
  exerciseId: string;
  name: string;
  order: number;
  sets: SetState[];
};

function buildExercises(execId: string, day: WorkoutDay): ExerciseState[] {
  return day.exercises.map((exercise) => {
    const id = demoUuid("exercise-execution", execId, exercise.id);
    return {
      id,
      exerciseId: exercise.id,
      name: exercise.name,
      order: exercise.order,
      sets: exercise.setTargets.map((target) => ({
        id: demoUuid("set-execution", id, target.id),
        targetId: target.id,
        order: target.order,
        prescribedReps: target.reps,
        prescribedLoadLabel: target.loadLabel,
        actualReps: target.reps,
        actualLoadLabel: target.loadLabel,
        status: "completed" as const,
        editedAt: null,
      })),
    };
  });
}

function snapshotParts(exercises: ExerciseState[]) {
  return {
    exercises: exercises.map((e) => ({ id: e.id, name: e.name, order: e.order })),
    sets: exercises.flatMap((e) =>
      e.sets.map((s) => ({
        id: s.id,
        exerciseExecutionId: e.id,
        order: s.order,
        status: s.status,
        actualReps: s.actualReps,
        actualLoadLabel: s.actualLoadLabel,
      })),
    ),
  };
}

function mealMacros(meal: PlanContent["mealPrescriptions"][number]) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of meal.items ?? []) {
    totals.kcal += item.calculated.energyKcalScaled ?? 0;
    totals.protein += item.calculated.proteinScaled ?? 0;
    totals.carbs += item.calculated.carbsScaled ?? 0;
    totals.fat += item.calculated.fatScaled ?? 0;
  }
  return totals;
}

export function buildCaptureWeekSql(input: {
  referenceDate: string;
  referenceInstant: string;
  libraryIndex: DemoLibraryIndex;
}): string {
  const now = input.referenceInstant;
  const email = CAPTURE_TRAINEE_EMAIL;
  const trainerEmail = CAPTURE_TRAINER_EMAIL;
  const tz = personaConfig(email)?.timezone ?? "Asia/Kolkata";
  const traineeId = demoUuid("user", email);
  const trainerId = demoUuid("user", trainerEmail);
  const relId = demoUuid("relationship", trainerEmail.split("@")[0]!, email.split("@")[0]!);
  const planId = demoUuid("plan", relId);
  const planVersionId = demoUuid("plan-version", relId, "v2");
  const content = materializePlanContent(buildStandardPlanContent(input.libraryIndex, "v2"));
  const dates = captureWeekDates(input.referenceDate);
  const rows = new SeedRows();
  const lines: string[] = [];
  const assignmentId = (date: string) => demoUuid("workout-assignment", email, date);

  const dayByName = (name: string) => content.workoutDays.find((d) => d.name === name)!;
  const upperA = dayByName("Upper body A");
  const dayFor = (date: string, fallback: WorkoutDay): WorkoutDay =>
    content.workoutDays.find((d) => d.weekday === weekday(date)) ?? fallback;

  const days = {
    today: upperA,
    completed: dayFor(dates.completed, dayByName("Upper body B")),
    missed: dayFor(dates.missed, dayByName("Upper body B")),
    coachLogged: dayFor(dates.coachLogged, dayByName("Lower body B")),
  };

  // Replace whatever the legacy window put on these days; an explicit
  // schedule beats the plan's weekday pattern.
  const assignmentRow = (date: string, day: WorkoutDay, opensAt: string) => {
    const startsAt = localDayStartIso(date, opensAt, tz);
    const createdAt = iso(Math.min(Date.parse(startsAt), Date.parse(now)));
    rows.add("workout_assignments", {
      id: assignmentId(date),
      coaching_relationship_id: relId,
      plan_id: planId,
      plan_version_id: planVersionId,
      workout_day_id: day.id,
      workout_day_name: day.name,
      workout_day_json: JSON.stringify(day),
      local_date: date,
      window_starts_at: startsAt,
      window_ends_at: iso(Date.parse(startsAt) + 24 * 3_600_000),
      schedule_status: "scheduled",
      superseded_at: null,
      superseded_by_plan_version_id: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    return { startsAt, endsAt: iso(Date.parse(startsAt) + 24 * 3_600_000) };
  };
  for (const date of [dates.today, dates.completed, dates.missed, dates.coachLogged]) {
    const id = assignmentId(date);
    lines.push(
      `DELETE FROM set_executions WHERE exercise_execution_id IN (SELECT id FROM exercise_executions WHERE workout_execution_id IN (SELECT id FROM workout_executions WHERE assignment_id = ${sqlQuote(id)}));`,
      `DELETE FROM exercise_executions WHERE workout_execution_id IN (SELECT id FROM workout_executions WHERE assignment_id = ${sqlQuote(id)});`,
      `DELETE FROM workout_executions WHERE assignment_id = ${sqlQuote(id)};`,
      `DELETE FROM exception_actions WHERE exception_id IN (SELECT id FROM exceptions WHERE source_entity_id = ${sqlQuote(id)});`,
      `DELETE FROM exceptions WHERE source_entity_id = ${sqlQuote(id)};`,
      `DELETE FROM workout_assignments WHERE id = ${sqlQuote(id)};`,
    );
  }

  // Today: open from the start of the local day, so it is startable at any hour.
  assignmentRow(dates.today, days.today, "00:00");

  const executionRow = (input2: {
    execId: string;
    date: string;
    status: "completed" | "modified";
    startedAt: string;
    completedAt: string;
    rpe: number;
    createdAt: string;
    updatedAt: string;
    coach: { loggedBy: boolean; editedAt: string | null };
  }) => {
    rows.add("workout_executions", {
      id: input2.execId,
      assignment_id: assignmentId(input2.date),
      coaching_relationship_id: relId,
      plan_version_id: planVersionId,
      trainee_user_id: traineeId,
      status: input2.status,
      record_version: input2.coach.editedAt ? 1 : 0,
      started_at: input2.startedAt,
      paused_at: null,
      completed_at: input2.completedAt,
      session_rpe: input2.rpe,
      require_session_rpe: 0,
      logged_late: 0,
      client_logged_at: input2.coach.loggedBy ? null : input2.completedAt,
      created_at: input2.createdAt,
      updated_at: input2.updatedAt,
      logged_by_role: input2.coach.loggedBy ? "coach" : "trainee",
      logged_by_user_id: input2.coach.loggedBy ? trainerId : null,
      last_edited_by_role: input2.coach.editedAt ? "coach" : null,
      last_edited_by_user_id: input2.coach.editedAt ? trainerId : null,
      last_edited_at: input2.coach.editedAt,
    });
  };
  const exerciseRows = (
    exercises: ExerciseState[],
    stamps: { createdAt: string; updatedAt: string; completedAt: string },
    execId: string,
  ) => {
    for (const exercise of exercises) {
      rows.add("exercise_executions", {
        id: exercise.id,
        workout_execution_id: execId,
        exercise_id: exercise.exerciseId,
        name: exercise.name,
        order: exercise.order,
        status: "completed",
        created_at: stamps.createdAt,
        updated_at: stamps.updatedAt,
      });
      for (const set of exercise.sets) {
        const load = resolveSetLoad({
          prescribedLoadLabel: set.prescribedLoadLabel,
          actualLoadLabel: set.actualLoadLabel,
        });
        rows.add("set_executions", {
          id: set.id,
          exercise_execution_id: exercise.id,
          set_target_id: set.targetId,
          order: set.order,
          status: set.status,
          prescribed_reps: set.prescribedReps,
          prescribed_load_label: set.prescribedLoadLabel,
          actual_reps: set.actualReps,
          actual_load_label: set.actualLoadLabel,
          prescribed_load_kg: load.prescribedLoadKg,
          actual_load_kg: load.actualLoadKg,
          load_kind: load.loadKind,
          completed_at: stamps.completedAt,
          created_at: stamps.createdAt,
          updated_at: set.editedAt ?? stamps.updatedAt,
        });
      }
    }
  };

  const auditLines: string[] = [];
  const audit = (entry: {
    action: "create" | "edit";
    entityType: "workout_execution" | "meal_compliance" | "measurement";
    entityId: string;
    before: unknown;
    after: unknown;
    at: string;
  }) => {
    const eventId = demoUuid("log-edit-event", entry.entityType, entry.entityId, entry.action);
    auditLines.push(
      `INSERT INTO log_edit_events (id, coaching_relationship_id, trainee_user_id, actor_user_id, actor_role, entity_type, entity_id, action, before_json, after_json, created_at) VALUES (${sqlQuote(eventId)}, ${sqlQuote(relId)}, ${sqlQuote(traineeId)}, ${sqlQuote(trainerId)}, 'coach', ${sqlQuote(entry.entityType)}, ${sqlQuote(entry.entityId)}, ${sqlQuote(entry.action)}, ${entry.before === null ? "NULL" : sqlQuote(JSON.stringify(entry.before))}, ${sqlQuote(JSON.stringify(entry.after))}, ${sqlQuote(entry.at)});`,
    );
  };

  // Missed: a required workout nobody logged, window closed, exception raised.
  {
    const date = dates.missed;
    const win = assignmentRow(date, days.missed, "07:00");
    const missed = missedWorkoutCandidate({
      assignmentId: assignmentId(date),
      localDate: date,
      windowEndsAt: win.endsAt,
    });
    const detected = between(iso(Date.parse(win.endsAt) + 5 * 60_000), win.endsAt, now);
    rows.add("exceptions", {
      id: demoUuid("exception", "lakshmi-missed-workout"),
      coaching_relationship_id: relId,
      type: missed.type,
      severity: missed.severity,
      status: "active",
      rule_version: "demo-v1",
      source_entity_type: missed.sourceEntityType,
      source_entity_id: missed.sourceEntityId,
      summary: missed.summary,
      details_json: JSON.stringify(missed.details),
      detected_at: detected,
      created_at: detected,
      updated_at: now,
    });
  }

  // Coach-logged workout (the Z6-19 create: execution by the coach, audited).
  {
    const date = dates.coachLogged;
    const execId = demoUuid("workout-execution", assignmentId(date));
    assignmentRow(date, days.coachLogged, "07:00");
    const performedAt = localDayStartIso(date, "19:00", tz);
    const savedAt = between(iso(Date.parse(performedAt) + 2 * 3_600_000), performedAt, now);
    const exercises = buildExercises(execId, days.coachLogged);
    executionRow({
      execId, date, status: "completed", startedAt: performedAt, completedAt: performedAt, rpe: 7,
      createdAt: savedAt, updatedAt: savedAt, coach: { loggedBy: true, editedAt: null },
    });
    exerciseRows(exercises, { createdAt: savedAt, updatedAt: savedAt, completedAt: performedAt }, execId);
    const parts = snapshotParts(exercises);
    audit({
      action: "create",
      entityType: "workout_execution",
      entityId: execId,
      before: null,
      after: workoutLogSnapshot({
        assignment: { localDate: date, workoutDayName: days.coachLogged.name },
        execution: { status: "completed", completedAt: performedAt, sessionRpe: 7 },
        ...parts,
      }),
      at: savedAt,
    });
  }

  // The completed workout: trainee-logged, then edited by the coach (record version 1).
  {
    const date = dates.coachEdited;
    const execId = demoUuid("workout-execution", assignmentId(date));
    const win = assignmentRow(date, days.completed, "07:00");
    const startedAt = iso(Date.parse(win.startsAt) + 45 * 60_000);
    const completedAt = iso(Date.parse(startedAt) + 50 * 60_000);
    const editedAt = between(
      iso(Date.parse(localDayStartIso(addDaysFromLocalDate(date, 1), "10:00", tz))),
      iso(Date.parse(completedAt) + 60_000),
      now,
    );
    const before = buildExercises(execId, days.completed);
    const beforeSnapshot = workoutLogSnapshot({
      assignment: { localDate: date, workoutDayName: days.completed.name },
      execution: { status: "completed", completedAt, sessionRpe: 7 },
      ...snapshotParts(before),
    });
    // The coach fixes two sets the client under-reported, and the session RPE.
    // Statuses come from the route's rules, so the execution reads "modified".
    const after = buildExercises(execId, days.completed);
    editReps(after[0]!.sets[2]!, (after[0]!.sets[2]!.prescribedReps ?? 10) - 2, editedAt);
    editReps(after[1]!.sets[0]!, (after[1]!.sets[0]!.prescribedReps ?? 10) + 1, editedAt);
    const afterStatus = resolveCompletedWorkoutStatus(after.flatMap((e) => e.sets.map((x) => x.status)));
    executionRow({
      execId, date, status: afterStatus, startedAt, completedAt, rpe: 8,
      createdAt: startedAt, updatedAt: editedAt, coach: { loggedBy: false, editedAt },
    });
    exerciseRows(after, { createdAt: startedAt, updatedAt: completedAt, completedAt }, execId);
    audit({
      action: "edit",
      entityType: "workout_execution",
      entityId: execId,
      before: beforeSnapshot,
      after: workoutLogSnapshot({
        assignment: { localDate: date, workoutDayName: days.completed.name },
        execution: { status: afterStatus, completedAt, sessionRpe: 8 },
        ...snapshotParts(after),
      }),
      at: editedAt,
    });
  }

  // Coach-logged dinner: a required meal the client had logged on the day; the
  // coach's entry replaces it (a normal trainee log would be refused as read-only).
  {
    const dinner = content.mealPrescriptions.find((m) => m.id === MEAL_PRESCRIPTION_IDS.dinner)!;
    const mealAssignmentId = demoUuid("meal-assignment", email, dates.mealDay, dinner.id);
    const complianceId = demoUuid("meal-compliance", mealAssignmentId, "coach");
    const windowStart = localDayStartIso(dates.mealDay, dinner.localTime ?? "20:00", tz);
    const windowEnd = iso(Date.parse(windowStart) + 12 * 3_600_000);
    const loggedAt = between(iso(Date.parse(windowStart) + 90 * 60_000), windowStart, now);
    const macros = mealMacros(dinner);
    lines.push(`DELETE FROM meal_compliance WHERE assignment_id = ${sqlQuote(mealAssignmentId)};`);
    rows.add("meal_compliance", {
      id: complianceId,
      assignment_id: mealAssignmentId,
      coaching_relationship_id: relId,
      plan_version_id: planVersionId,
      trainee_user_id: traineeId,
      outcome: "confirmed",
      record_version: 0,
      logged_at: loggedAt,
      local_date: dates.mealDay,
      deviation_kind: null,
      notes: null,
      photo_required: 0,
      photo_intent_json: null,
      media_asset_id: null,
      items_json: null,
      kcal_scaled: macros.kcal,
      protein_scaled: macros.protein,
      carbs_scaled: macros.carbs,
      fat_scaled: macros.fat,
      logged_late: Date.parse(loggedAt) > Date.parse(windowEnd) ? 1 : 0,
      logged_after_resolve: 0,
      client_logged_at: null,
      created_at: loggedAt,
      updated_at: loggedAt,
      logged_by_role: "coach",
      logged_by_user_id: trainerId,
      last_edited_by_role: null,
      last_edited_by_user_id: null,
      last_edited_at: null,
    });
    audit({
      action: "create",
      entityType: "meal_compliance",
      entityId: complianceId,
      before: null,
      after: mealLogSnapshot({
        assignment: { localDate: dates.mealDay, mealName: dinner.name },
        compliance: {
          outcome: "confirmed",
          deviationKind: null,
          notes: null,
          itemsJson: null,
          kcalScaled: macros.kcal,
          proteinScaled: macros.protein,
          carbsScaled: macros.carbs,
          fatScaled: macros.fat,
        },
      }),
      at: loggedAt,
    });
  }

  // Coach-logged weight and waist, the morning after the dinner day.
  {
    const cfg = personaConfig(email);
    const entries = [
      { key: "weight", type: "body_weight_kg", unit: "kg", value: cfg ? Math.round((cfg.weight.now - 0.2) * 10) / 10 : 68.9, time: "07:20" },
      { key: "waist", type: "waist_cm", unit: "cm", value: 82.5, time: "07:25" },
    ] as const;
    for (const entry of entries) {
      const id = demoUuid("measurement", "coach-log", email, dates.measurementDay, entry.key);
      const observedAt = between(localDayStartIso(dates.measurementDay, entry.time, tz), "1970-01-01T00:00:00.000Z", now);
      const savedAt = between(iso(Date.parse(observedAt) + 3 * 3_600_000), observedAt, now);
      rows.add("measurements", {
        id,
        coaching_relationship_id: relId,
        trainee_user_id: traineeId,
        type: entry.type,
        value: entry.value,
        unit: entry.unit,
        observed_at: observedAt,
        source: "trainer_entry",
        checkin_id: null,
        media_asset_id: null,
        record_version: 0,
        created_at: savedAt,
        updated_at: savedAt,
        logged_by_role: "coach",
        logged_by_user_id: trainerId,
        last_edited_by_role: null,
        last_edited_by_user_id: null,
        last_edited_at: null,
      });
      audit({
        action: "create",
        entityType: "measurement",
        entityId: id,
        before: null,
        after: measurementLogSnapshot({
          localDate: dates.measurementDay,
          measurement: { type: entry.type, value: entry.value, unit: entry.unit, observedAt },
        }),
        at: savedAt,
      });
    }
  }

  return [...lines, rowsToSql(rows), ...auditLines].join("\n");
}
