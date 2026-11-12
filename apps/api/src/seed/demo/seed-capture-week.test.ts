import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql, kolkataLocalDate } from "./build.js";
import {
  CAPTURE_TRAINEE_EMAIL,
  CAPTURE_TRAINER_EMAIL,
  captureWeekDates,
} from "./capture-week.js";
import { addDaysFromLocalDate, demoUuid } from "./ids.js";
import { loadDemoLibraryIndex } from "./personas.js";
import { createMemoryDb, type MemoryDbHandle } from "../../test-support/memory-db.js";

/**
 * Z10-22: the capture client (Lakshmi) has a startable workout today, a
 * completed and a missed workout earlier in the week, and coach-logged entries
 * written the way the Z6-19 coach-log path writes them (audit row, activity
 * feed event). One reference instant per weekday, plus
 * 06:00 IST, so the week logic (Monday and Tuesday fall back to last week) and
 * the "startable at any hour" rule are both exercised.
 */
const REFERENCE_INSTANTS = [
  "2026-10-26T10:00:00.000Z", // Monday
  "2026-10-27T10:00:00.000Z", // Tuesday
  "2026-10-28T10:00:00.000Z", // Wednesday
  "2026-10-29T10:00:00.000Z", // Thursday
  "2026-10-30T10:00:00.000Z", // Friday
  "2026-10-31T10:00:00.000Z", // Saturday
  "2026-11-01T10:00:00.000Z", // Sunday
  "2026-10-29T00:30:00.000Z", // Thursday 06:00 IST
];

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

describe("capture week dates", () => {
  it("uses this week's earlier days, and last week's when fewer than two exist", () => {
    for (const [today, completed, missed] of [
      ["2026-10-26", "2026-10-25", "2026-10-24"], // Monday: Sunday, Saturday
      ["2026-10-27", "2026-10-25", "2026-10-24"], // Tuesday: only Monday this week
      ["2026-10-28", "2026-10-27", "2026-10-26"], // Wednesday
      ["2026-11-01", "2026-10-31", "2026-10-30"], // Sunday
    ] as const) {
      const dates = captureWeekDates(today);
      expect([dates.completed, dates.missed]).toEqual([completed, missed]);
    }
  });

  it("never reuses a day and keeps every coach entry inside the 7-day window", () => {
    for (let offset = 0; offset < 14; offset += 1) {
      const today = addDaysFromLocalDate("2026-10-26", offset);
      const dates = captureWeekDates(today);
      const workoutDays = [dates.today, dates.completed, dates.missed, dates.coachLogged];
      expect(new Set(workoutDays).size).toBe(4);
      expect(dates.coachEdited).toBe(dates.completed);
      for (const date of [dates.coachLogged, dates.coachEdited, dates.mealDay, dates.measurementDay]) {
        expect(date < today).toBe(true);
        expect(date >= addDaysFromLocalDate(today, -6)).toBe(true);
      }
      expect(dates.completed < today && dates.missed < today).toBe(true);
    }
  });
});

describe.each(REFERENCE_INSTANTS)("capture client rows at %s", (now) => {
  let handle: MemoryDbHandle;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
  const one = (sql: string) => q(sql)[0] ?? [];
  const today = kolkataLocalDate(now);
  const dates = captureWeekDates(today);
  const relId = demoUuid("relationship", CAPTURE_TRAINER_EMAIL.split("@")[0]!, CAPTURE_TRAINEE_EMAIL.split("@")[0]!);
  const trainerId = demoUuid("user", CAPTURE_TRAINER_EMAIL);
  const traineeId = demoUuid("user", CAPTURE_TRAINEE_EMAIL);
  const assignmentId = (date: string) => demoUuid("workout-assignment", CAPTURE_TRAINEE_EMAIL, date);
  const execIdOf = (date: string) => demoUuid("workout-execution", assignmentId(date));

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    handle.sqlite.exec(buildDemoSeedSql({ referenceInstant: now, passwordHash: "z10-22-test-hash", libraryIndex }));
  }, 60_000);

  afterAll(() => handle?.close());

  it("has a startable workout today with a weighted and a bodyweight exercise", () => {
    const [startsAt, endsAt, status, dayJson, executions] = one(
      `select window_starts_at, window_ends_at, schedule_status, workout_day_json,
        (select count(*) from workout_executions x where x.assignment_id = a.id)
       from workout_assignments a where a.id = '${assignmentId(today)}' and a.local_date = '${today}'
         and a.coaching_relationship_id = '${relId}'`,
    );
    expect(String(startsAt) <= now && now < String(endsAt)).toBe(true);
    expect(status).toBe("scheduled");
    expect(Number(executions)).toBe(0);
    const labels = (JSON.parse(String(dayJson)) as { exercises: Array<{ setTargets: Array<{ loadLabel: string | null }> }> })
      .exercises.map((exercise) => exercise.setTargets[0]!.loadLabel);
    expect(labels.some((label) => /^\d+(\.\d+)? kg$/.test(label ?? ""))).toBe(true);
    expect(labels).toContain("Bodyweight");
  });

  it("has a completed workout with its sets and a missed workout with its exception, earlier", () => {
    const [status, loggedBy, sets] = one(
      `select x.status, x.logged_by_role,
        (select count(*) from set_executions s join exercise_executions e on e.id = s.exercise_execution_id
          where e.workout_execution_id = x.id)
       from workout_executions x where x.id = '${execIdOf(dates.completed)}'`,
    );
    // The coach's edit left two sets off the prescription: "modified", as the route resolves it.
    expect(status).toBe("modified");
    expect(loggedBy).toBe("trainee");
    expect(Number(sets)).toBeGreaterThan(0);

    const [localDate, endsAt] = one(
      `select local_date, window_ends_at from workout_assignments where id = '${assignmentId(dates.missed)}'`,
    );
    expect(localDate).toBe(dates.missed);
    expect(String(endsAt) < now).toBe(true);
    expect(Number(one(`select count(*) from workout_executions where assignment_id = '${assignmentId(dates.missed)}'`)[0])).toBe(0);
    expect(
      one(`select type, status, severity from exceptions where source_entity_id = '${assignmentId(dates.missed)}'`),
    ).toEqual(["missed_workout", "active", "critical"]);
    // Same week as today, except Monday and Tuesday, which use last week.
    const sinceMonday = (weekdayOf(today) + 6) % 7;
    const monday = addDaysFromLocalDate(today, -sinceMonday);
    for (const date of [dates.completed, dates.missed]) {
      expect(date < today).toBe(true);
      if (sinceMonday >= 2) expect(date >= monday).toBe(true);
      else expect(date < monday).toBe(true);
    }
  });

  it("resolves the edited sets and the execution status by the route's rules", () => {
    const execId = execIdOf(dates.coachEdited);
    const [editedAt] = one(`select last_edited_at from workout_executions where id = '${execId}'`);
    const sets = q(
      `select s.status, s.prescribed_reps, s.actual_reps, s.updated_at from set_executions s
       join exercise_executions e on e.id = s.exercise_execution_id
       where e.workout_execution_id = '${execId}' order by e."order", s."order"`,
    );
    const modified = sets.filter((row) => row[0] === "modified");
    expect(modified).toHaveLength(2);
    for (const row of modified) expect(row[2]).not.toBe(row[1]);
    for (const row of sets.filter((r) => r[0] === "completed")) expect(row[2]).toBe(row[1]);
    // Only the edited sets carry the edit time.
    expect(sets.filter((row) => row[3] === editedAt)).toHaveLength(2);
    const audit = one(
      `select after_json from log_edit_events where entity_id = '${execId}' and action = 'edit'`,
    );
    const after = JSON.parse(String(audit[0])) as { status: string; sets: Array<{ status: string }> };
    expect(after.status).toBe("modified");
    expect(after.sets.filter((set) => set.status === "modified")).toHaveLength(2);
  });

  it("holds the coach entries as production writes them: roles, audit, activity event", () => {
    // Coach-logged workout.
    expect(
      one(`select logged_by_role, logged_by_user_id, last_edited_by_role, record_version from workout_executions where id = '${execIdOf(dates.coachLogged)}'`),
    ).toEqual(["coach", trainerId, null, 0]);
    // Trainee workout edited by the coach.
    expect(
      one(`select logged_by_role, last_edited_by_role, last_edited_by_user_id, record_version, session_rpe from workout_executions where id = '${execIdOf(dates.coachEdited)}'`),
    ).toEqual(["trainee", "coach", trainerId, 1, 8]);
    // Coach-logged dinner, weight and waist.
    const meal = one(
      `select c.id, c.logged_by_role, c.logged_by_user_id from meal_compliance c join meal_assignments m on m.id = c.assignment_id
       where c.coaching_relationship_id = '${relId}' and c.logged_by_role = 'coach' and m.meal_name = 'Dinner'`,
    );
    expect(meal.slice(1)).toEqual(["coach", trainerId]);
    const measurements = q(
      `select id, type, source, logged_by_role, logged_by_user_id from measurements
       where coaching_relationship_id = '${relId}' and logged_by_role = 'coach' order by type`,
    );
    expect(measurements.map((row) => [row[1], row[2], row[3], row[4]])).toEqual([
      ["body_weight_kg", "trainer_entry", "coach", trainerId],
      ["waist_cm", "trainer_entry", "coach", trainerId],
    ]);

    // One audit row per coach action: 4 creates + 1 edit, all by the trainer.
    const events = q(
      `select entity_type, entity_id, action, actor_role, actor_user_id, before_json is null, id, created_at
       from log_edit_events where coaching_relationship_id = '${relId}' order by entity_type, action`,
    );
    expect(events.map((row) => [row[0], row[2], row[3], row[4], row[5]])).toEqual([
      ["meal_compliance", "create", "coach", trainerId, 1],
      ["measurement", "create", "coach", trainerId, 1],
      ["measurement", "create", "coach", trainerId, 1],
      ["workout_execution", "create", "coach", trainerId, 1],
      ["workout_execution", "edit", "coach", trainerId, 0],
    ]);
    const entityIds = new Set([meal[0], execIdOf(dates.coachLogged), execIdOf(dates.coachEdited), ...measurements.map((row) => row[0])]);
    expect(new Set(events.map((row) => row[1]))).toEqual(entityIds);
    for (const row of events) expect(String(row[7]) <= now).toBe(true);
  });

  it("writes no change_log row (the trainee's first sync pull bootstraps from the tables)", () => {
    expect(Number(one(`select count(*) from change_log where trainee_user_id = '${traineeId}'`)[0])).toBe(0);
  });
});

describe("capture week on a schema older than coach-log authorship (0039)", () => {
  it("is not seeded there, so older migration states still take the demo seed", async () => {
    const handle = await createMemoryDb({
      foreignKeys: true,
      librarySeed: true,
      through: "0038_archived_account_state.sql",
    });
    try {
      const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
      expect(libraryIndex.coachLog).toBe(false);
      const sql = buildDemoSeedSql({
        referenceInstant: "2026-10-29T10:00:00.000Z",
        passwordHash: "z10-22-test-hash",
        libraryIndex,
      });
      expect(sql).not.toContain("log_edit_events");
      expect(sql).not.toContain("logged_by_role");
    } finally {
      handle.close();
    }
  }, 60_000);
});
