import { and, asc, eq, gte, inArray, isNotNull, lte, type SQL } from "drizzle-orm";
import type {
  StrengthExercise,
  StrengthQuery,
  StrengthReadModel,
  StrengthWeekCount,
} from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  exerciseExecutions,
  setExecutions,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";

/** Load kinds whose `actual_load_kg` is a chartable number (bodyweight-plus counts its added kg). */
const CHARTABLE_KINDS = new Set(["kg", "bodyweight_plus"]);
const DAY_MS = 86_400_000;
const MAX_WEEKS = 520;

export type StrengthRelationship = {
  id: string;
  trainerUserId: string;
  traineeUserId: string;
  traineeTimezone: string;
};

export type StrengthSetRow = {
  exerciseId: string;
  name: string;
  localDate: string;
  actualLoadKg: number | null;
  loadKind: string;
  actualReps: number | null;
};

export type StrengthWorkoutRow = { localDate: string };

export type StrengthRawData = {
  relationship: StrengthRelationship | null;
  sets: StrengthSetRow[];
  workouts: StrengthWorkoutRow[];
};

export function addDaysToLocalDate(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Monday of the week that holds `localDate`. */
export function weekStartOf(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return addDaysToLocalDate(localDate, -((weekday + 6) % 7));
}

/** The calendar date `now` falls on in `timeZone` (UTC when the zone is not recognised). */
export function localDateIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type StrengthWindow = { from: string | null; to: string | null };

/**
 * The inclusive local-date window. Explicit `from` / `to` replace `range`; `4w` and
 * `12w` are the last 28 / 84 days ending today in the trainee's timezone.
 */
export function resolveStrengthWindow(
  query: StrengthQuery,
  localToday: string,
): StrengthWindow {
  if (query.from || query.to) {
    return { from: query.from ?? null, to: query.to ?? null };
  }
  if (query.range === "all") return { from: null, to: localToday };
  const days = query.range === "4w" ? 28 : 84;
  return { from: addDaysToLocalDate(localToday, -(days - 1)), to: localToday };
}

/**
 * One D1 batch of three statements: the relationship (with the trainee's timezone),
 * the logged sets and the finished workouts. The sets and workouts are filtered by
 * relationship and by a coarse date bound only; the caller authorises the
 * relationship row before it uses either, and refines to the exact window in
 * `buildStrengthReadModel` (the trainee's timezone is only known from statement one).
 */
export async function loadStrengthRawData(
  db: Db,
  relationshipId: string,
  query: StrengthQuery,
  now: Date,
): Promise<StrengthRawData> {
  // Local dates sit within a day of the UTC date, so one extra day keeps the coarse bound safe.
  const utcToday = now.toISOString().slice(0, 10);
  const coarse = resolveStrengthWindow(query, utcToday);
  const coarseFrom = coarse.from
    ? query.from
      ? coarse.from
      : addDaysToLocalDate(coarse.from, -1)
    : null;
  const coarseTo = coarse.to
    ? query.to
      ? coarse.to
      : addDaysToLocalDate(coarse.to, 1)
    : null;

  const dateBounds = (): SQL[] => [
    ...(coarseFrom ? [gte(workoutAssignments.localDate, coarseFrom)] : []),
    ...(coarseTo ? [lte(workoutAssignments.localDate, coarseTo)] : []),
  ];

  const [relationshipRows, setRows, workoutRows] = await db.batch([
    db
      .select({
        id: coachingRelationships.id,
        trainerUserId: coachingRelationships.trainerUserId,
        traineeUserId: coachingRelationships.traineeUserId,
        traineeTimezone: users.timezone,
      })
      .from(coachingRelationships)
      .innerJoin(users, eq(users.id, coachingRelationships.traineeUserId))
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1),
    db
      .select({
        exerciseId: exerciseExecutions.exerciseId,
        name: exerciseExecutions.name,
        localDate: workoutAssignments.localDate,
        actualLoadKg: setExecutions.actualLoadKg,
        loadKind: setExecutions.loadKind,
        actualReps: setExecutions.actualReps,
      })
      .from(setExecutions)
      .innerJoin(
        exerciseExecutions,
        eq(exerciseExecutions.id, setExecutions.exerciseExecutionId),
      )
      .innerJoin(
        workoutExecutions,
        eq(workoutExecutions.id, exerciseExecutions.workoutExecutionId),
      )
      .innerJoin(
        workoutAssignments,
        eq(workoutAssignments.id, workoutExecutions.assignmentId),
      )
      .where(
        and(
          eq(workoutExecutions.coachingRelationshipId, relationshipId),
          inArray(setExecutions.status, ["completed", "modified"]),
          isNotNull(setExecutions.actualLoadLabel),
          ...dateBounds(),
        ),
      )
      .orderBy(asc(workoutAssignments.localDate)),
    db
      .select({ localDate: workoutAssignments.localDate })
      .from(workoutExecutions)
      .innerJoin(
        workoutAssignments,
        eq(workoutAssignments.id, workoutExecutions.assignmentId),
      )
      .where(
        and(
          eq(workoutExecutions.coachingRelationshipId, relationshipId),
          inArray(workoutExecutions.status, ["completed", "modified"]),
          ...dateBounds(),
        ),
      )
      .orderBy(asc(workoutAssignments.localDate)),
  ]);

  return {
    relationship: relationshipRows[0] ?? null,
    sets: setRows,
    workouts: workoutRows,
  };
}

/** Pure: raw rows in, the contract's read model out. */
export function buildStrengthReadModel(
  raw: Pick<StrengthRawData, "sets" | "workouts">,
  window: StrengthWindow,
  localToday: string,
): StrengthReadModel {
  const inWindow = (localDate: string) =>
    (!window.from || localDate >= window.from) &&
    (!window.to || localDate <= window.to);

  type Top = { localDate: string; topLoadKg: number; reps: number | null };
  const byExercise = new Map<
    string,
    { name: string; nameDate: string; days: Map<string, Top> }
  >();
  let notChartedSets = 0;

  for (const set of raw.sets) {
    if (!inWindow(set.localDate)) continue;
    const chartable =
      set.actualLoadKg !== null &&
      Number.isFinite(set.actualLoadKg) &&
      CHARTABLE_KINDS.has(set.loadKind);
    if (!chartable) {
      notChartedSets += 1;
      continue;
    }
    let entry = byExercise.get(set.exerciseId);
    if (!entry) {
      entry = { name: set.name, nameDate: set.localDate, days: new Map() };
      byExercise.set(set.exerciseId, entry);
    }
    if (set.localDate >= entry.nameDate) {
      entry.name = set.name;
      entry.nameDate = set.localDate;
    }
    const kg = set.actualLoadKg as number;
    const current = entry.days.get(set.localDate);
    const beats =
      !current ||
      kg > current.topLoadKg ||
      (kg === current.topLoadKg && (set.actualReps ?? -1) > (current.reps ?? -1));
    if (beats) {
      entry.days.set(set.localDate, {
        localDate: set.localDate,
        topLoadKg: kg,
        reps: set.actualReps,
      });
    }
  }

  const exercises: StrengthExercise[] = [...byExercise.entries()]
    .map(([exerciseId, entry]) => ({
      exerciseId,
      name: entry.name,
      points: [...entry.days.values()].sort((a, b) =>
        a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0,
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.exerciseId.localeCompare(b.exerciseId));

  const perWeek = new Map<string, number>();
  for (const workout of raw.workouts) {
    if (!inWindow(workout.localDate)) continue;
    const week = weekStartOf(workout.localDate);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  const workoutsPerWeek: StrengthWeekCount[] = [];
  if (perWeek.size > 0 || window.from) {
    // Weeks run from the window start (or the first workout) to the window end or today,
    // whichever is earlier, and never more than MAX_WEEKS back.
    const lastWeek = weekStartOf(
      window.to && window.to < localToday ? window.to : localToday,
    );
    const earliest = window.from
      ? weekStartOf(window.from)
      : [...perWeek.keys()].sort()[0];
    const floor = addDaysToLocalDate(lastWeek, -7 * (MAX_WEEKS - 1));
    const firstWeek = earliest && earliest > floor ? earliest : floor;
    if (earliest) {
      for (let week = firstWeek; week <= lastWeek; week = addDaysToLocalDate(week, 7)) {
        workoutsPerWeek.push({ weekStart: week, count: perWeek.get(week) ?? 0 });
      }
    }
  }

  return { exercises, workoutsPerWeek, notCharted: { sets: notChartedSets } };
}
