import { and, asc, eq, gte, inArray, isNotNull, lte, or, type SQL } from "drizzle-orm";
import {
  STRENGTH_UNCHARTED_LIST_MAX,
  type StrengthExercise,
  type StrengthPoint,
  type StrengthQuery,
  type StrengthReadModel,
  type StrengthUnchartedSet,
  type StrengthWeekCount,
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
import { isBlankLoadLabel } from "./load-parser.js";

/** Load kinds whose `actual_load_kg` is a chartable number (bodyweight-plus counts its added kg). */
const KG_KINDS = new Set(["kg", "bodyweight_plus"]);
const FINISHED = new Set(["completed", "modified"]);
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
  assignmentId: string;
  actualLoadKg: number | null;
  loadKind: string;
  actualReps: number | null;
  actualLoadLabel: string | null;
};

/** One assignment with its execution's status (null when nothing was logged). */
export type StrengthAssignmentRow = {
  assignmentId: string;
  localDate: string;
  scheduleStatus: string;
  workoutDayJson: string;
  executionStatus: string | null;
};

export type StrengthRawData = {
  relationship: StrengthRelationship | null;
  sets: StrengthSetRow[];
  assignments: StrengthAssignmentRow[];
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
 * the logged sets and the assignments with their execution status. The sets and
 * assignments are filtered by relationship and by a coarse date bound only; the
 * caller authorises the relationship row before it uses either, and refines to the
 * exact window in `buildStrengthReadModel` (the trainee's timezone is only known from
 * statement one).
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

  const dateBounds = (extraDaysAtEnd = 0): SQL[] => [
    ...(coarseFrom ? [gte(workoutAssignments.localDate, coarseFrom)] : []),
    ...(coarseTo
      ? [lte(workoutAssignments.localDate, addDaysToLocalDate(coarseTo, extraDaysAtEnd))]
      : []),
  ];

  const [relationshipRows, setRows, assignmentRows] = await db.batch([
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
        assignmentId: workoutAssignments.id,
        actualLoadKg: setExecutions.actualLoadKg,
        loadKind: setExecutions.loadKind,
        actualReps: setExecutions.actualReps,
        actualLoadLabel: setExecutions.actualLoadLabel,
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
          // A logged load, or reps logged with no load at all (reps-only lifts).
          or(isNotNull(setExecutions.actualLoadLabel), isNotNull(setExecutions.actualReps)),
          ...dateBounds(),
        ),
      )
      .orderBy(asc(workoutAssignments.localDate)),
    db
      .select({
        assignmentId: workoutAssignments.id,
        localDate: workoutAssignments.localDate,
        scheduleStatus: workoutAssignments.scheduleStatus,
        workoutDayJson: workoutAssignments.workoutDayJson,
        executionStatus: workoutExecutions.status,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, relationshipId),
          // A week past the end so the current week's later planned days are read.
          ...dateBounds(7),
        ),
      )
      .orderBy(asc(workoutAssignments.localDate)),
  ]);

  return {
    relationship: relationshipRows[0] ?? null,
    sets: setRows,
    assignments: assignmentRows,
  };
}

/**
 * The key one lift is grouped by. Each plan version gives its exercises new ids, so
 * logs are grouped by the exercise name (case and spacing ignored): a lift keeps one
 * line across plan versions.
 */
export function liftKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lift keys a planned workout day holds; empty when the snapshot cannot be read. */
function plannedLiftKeys(workoutDayJson: string): Set<string> {
  try {
    const day = JSON.parse(workoutDayJson) as { exercises?: Array<{ name?: unknown }> };
    return new Set(
      (day.exercises ?? [])
        .map((exercise) => exercise.name)
        .filter((name): name is string => typeof name === "string")
        .map(liftKey),
    );
  } catch {
    return new Set();
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;

type Day = {
  /** Best kg set: highest kg, ties broken by reps. */
  load: { kg: number; reps: number | null } | null;
  /** Most reps in one bodyweight or reps-only set. */
  bodyweightReps: number | null;
  totalReps: number;
  volumeKg: number | null;
};

/** Pure: raw rows in, the contract's read model out. */
export function buildStrengthReadModel(
  raw: Pick<StrengthRawData, "sets" | "assignments">,
  window: StrengthWindow,
  localToday: string,
): StrengthReadModel {
  const inWindow = (localDate: string) =>
    (!window.from || localDate >= window.from) &&
    (!window.to || localDate <= window.to);

  const byExercise = new Map<
    string,
    {
      /** The newest plan exercise id and name the lift was logged under. */
      exerciseId: string;
      name: string;
      nameDate: string;
      days: Map<string, Day>;
      sessionDates: Set<string>;
      loggedAssignments: Set<string>;
      hasKg: boolean;
    }
  >();
  const uncharted: StrengthUnchartedSet[] = [];

  for (const set of raw.sets) {
    if (!inWindow(set.localDate)) continue;
    const key = liftKey(set.name);
    let entry = byExercise.get(key);
    if (!entry) {
      entry = {
        exerciseId: set.exerciseId,
        name: set.name,
        nameDate: set.localDate,
        days: new Map(),
        sessionDates: new Set(),
        loggedAssignments: new Set(),
        hasKg: false,
      };
      byExercise.set(key, entry);
    }
    if (set.localDate >= entry.nameDate) {
      entry.exerciseId = set.exerciseId;
      entry.name = set.name;
      entry.nameDate = set.localDate;
    }
    entry.sessionDates.add(set.localDate);
    entry.loggedAssignments.add(set.assignmentId);

    const noLoad = isBlankLoadLabel(set.actualLoadLabel);
    if (!noLoad && set.loadKind === "text") {
      // Load logged as free text ("RPE 8", "red band"): shown as "not charted".
      uncharted.push({
        localDate: set.localDate,
        exerciseName: set.name,
        loadLabel: set.actualLoadLabel!.trim(),
        reps: set.actualReps,
      });
      continue;
    }

    const day: Day = entry.days.get(set.localDate) ?? {
      load: null,
      bodyweightReps: null,
      totalReps: 0,
      volumeKg: null,
    };
    const kg = set.actualLoadKg;
    if (!noLoad && KG_KINDS.has(set.loadKind)) {
      // A kg / bodyweight-plus row without a kg value is inconsistent data (Z6-1
      // always fills it), so it is left out.
      if (kg === null || !Number.isFinite(kg)) continue;
      entry.hasKg = true;
      const beats =
        !day.load ||
        kg > day.load.kg ||
        (kg === day.load.kg && (set.actualReps ?? -1) > (day.load.reps ?? -1));
      if (beats) day.load = { kg, reps: set.actualReps };
      day.volumeKg = round2((day.volumeKg ?? 0) + kg * (set.actualReps ?? 0));
    } else if (noLoad || set.loadKind === "bodyweight") {
      // Plain bodyweight ("BW") or reps with no load: charted by reps (D-W8-7).
      if (set.actualReps === null) continue;
      day.bodyweightReps = Math.max(day.bodyweightReps ?? 0, set.actualReps);
    } else {
      continue;
    }
    day.totalReps += set.actualReps ?? 0;
    entry.days.set(set.localDate, day);
  }

  // Planned workouts: scheduled assignments (superseded ones left out) and every
  // assignment that was finished.
  const lastWeek = weekStartOf(
    window.to && window.to < localToday ? window.to : localToday,
  );
  const exerciseEnd = window.to && window.to < localToday ? window.to : localToday;
  // A window that reaches today counts all of the current week's planned days; an
  // earlier end stops there.
  const plannedEnd =
    exerciseEnd === localToday ? addDaysToLocalDate(weekStartOf(localToday), 6) : exerciseEnd;
  const finishedPerWeek = new Map<string, number>();
  const plannedPerWeek = new Map<string, number>();
  const plannedToDate: StrengthAssignmentRow[] = [];
  for (const row of raw.assignments) {
    if (window.from && row.localDate < window.from) continue;
    const finished = row.executionStatus !== null && FINISHED.has(row.executionStatus);
    const week = weekStartOf(row.localDate);
    if (finished && inWindow(row.localDate)) {
      finishedPerWeek.set(week, (finishedPerWeek.get(week) ?? 0) + 1);
    }
    if (!finished && row.scheduleStatus !== "scheduled") continue;
    if (row.localDate <= plannedEnd) {
      plannedPerWeek.set(week, (plannedPerWeek.get(week) ?? 0) + 1);
    }
    if (row.localDate <= exerciseEnd) plannedToDate.push(row);
  }

  const plannedLifts = new Map<string, Set<string>>();
  const plannedFor = (key: string, logged: Set<string>): number => {
    const ids = new Set(logged);
    for (const row of plannedToDate) {
      let held = plannedLifts.get(row.assignmentId);
      if (!held) {
        held = plannedLiftKeys(row.workoutDayJson);
        plannedLifts.set(row.assignmentId, held);
      }
      if (held.has(key)) ids.add(row.assignmentId);
    }
    return ids.size;
  };

  const byDate = (a: { localDate: string }, b: { localDate: string }) =>
    a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0;

  const exercises: StrengthExercise[] = [];
  for (const [key, entry] of byExercise) {
    const chartBy = entry.hasKg ? ("load_kg" as const) : ("reps" as const);
    const points: StrengthPoint[] = [];
    for (const [localDate, day] of entry.days) {
      if (chartBy === "load_kg") {
        if (!day.load && day.bodyweightReps === null) continue;
        points.push({
          localDate,
          topLoadKg: day.load?.kg ?? null,
          reps: day.load ? day.load.reps : day.bodyweightReps,
          totalReps: day.totalReps,
          volumeKg: day.volumeKg,
        });
      } else {
        if (day.bodyweightReps === null) continue;
        points.push({
          localDate,
          topLoadKg: null,
          reps: day.bodyweightReps,
          totalReps: day.totalReps,
          volumeKg: null,
        });
      }
    }
    if (points.length === 0) continue;
    exercises.push({
      exerciseId: entry.exerciseId,
      name: entry.name,
      chartBy,
      sessions: entry.sessionDates.size,
      plannedSessions: plannedFor(key, entry.loggedAssignments),
      points: points.sort(byDate),
    });
  }
  exercises.sort(
    (a, b) => a.name.localeCompare(b.name) || a.exerciseId.localeCompare(b.exerciseId),
  );

  const workoutsPerWeek: StrengthWeekCount[] = [];
  const knownWeeks = [...finishedPerWeek.keys(), ...plannedPerWeek.keys()].sort();
  const earliest = window.from ? weekStartOf(window.from) : knownWeeks[0];
  if (earliest) {
    // Weeks run from the window start (or the first workout) to the window end or
    // today, whichever is earlier, and never more than MAX_WEEKS back.
    const floor = addDaysToLocalDate(lastWeek, -7 * (MAX_WEEKS - 1));
    const firstWeek = earliest > floor ? earliest : floor;
    for (let week = firstWeek; week <= lastWeek; week = addDaysToLocalDate(week, 7)) {
      workoutsPerWeek.push({
        weekStart: week,
        count: finishedPerWeek.get(week) ?? 0,
        planned: plannedPerWeek.get(week) ?? 0,
      });
    }
  }

  uncharted.sort((a, b) => -byDate(a, b));
  return {
    exercises,
    workoutsPerWeek,
    notCharted: {
      sets: uncharted.length,
      items: uncharted.slice(0, STRENGTH_UNCHARTED_LIST_MAX),
    },
  };
}
