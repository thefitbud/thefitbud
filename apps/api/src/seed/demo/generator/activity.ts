/**
 * Day-by-day simulation of assignments, logs, executions, check-ins, weights and
 * historical exceptions for one persona over a date range (SEED_DESIGN.md §6.3–6.4).
 */
import type { PlanContent } from "@fitbud/contracts";
import {
  mealAdherenceCandidate,
  missedWorkoutCandidate,
  overdueMealCandidate,
  skippedMealCandidate,
  skippedWorkoutCandidate,
  workoutAdherenceCandidate,
  type ExceptionCandidate,
} from "@fitbud/core";
import { addDaysFromLocalDate, demoUuid, localDayStartIso } from "../ids.js";
import type { DemoLibraryIndex } from "../personas.js";
import { DEMO_DEVIATION_FOOD_SLUGS } from "../personas.js";
import { foodByGrams } from "./content.js";
import type { ChainVersion } from "./plans.js";
import { versionForDate } from "./plans.js";
import type { PersonaConfig } from "./personas.js";
import {
  OBSTACLES,
  QUESTIONS,
  RESOLUTION_NOTES,
  REVIEW_NOTES,
  WELLBEING_GOOD,
  WELLBEING_MEH,
  WINS,
} from "./phrases.js";
import { rngFor, type Rng } from "./rng.js";
import type { SeedRows } from "./sql.js";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
/** Facts that already happened are never stamped after the seed's "now". */
const atMost = (at: string, now: string) => (Date.parse(at) > Date.parse(now) ? now : at);
const WEEKDAY_MULT = [0.8, 1.0, 1.0, 0.98, 0.93, 0.85, 0.75];

export function weekdayOf(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay();
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export type ActivityContext = {
  rows: SeedRows;
  lib: DemoLibraryIndex;
  cfg: PersonaConfig;
  relId: string;
  planId: string;
  chain: ChainVersion[];
  traineeId: string;
  trainerId: string;
  refDate: string;
  now: string;
  startDate: string;
  checkinScheduleId: string;
  checkinFormVersionId: string;
};

export type GeneratedItem =
  | { kind: "meal"; assignmentId: string; localDate: string; mealName: string; windowStartsAt: string; windowEndsAt: string; outcome: string | null; loggedAt: string | null; deviationKind: string | null }
  | { kind: "workout"; assignmentId: string; localDate: string; windowStartsAt: string; windowEndsAt: string; status: string | null };

/** Logging probability for a day (0..1). */
function logProbability(cfg: PersonaConfig, ctx: ActivityContext, localDate: string, kind: "meal" | "workout", rng: Rng): number {
  const dayOffset = daysBetween(ctx.refDate, localDate);
  const week = Math.floor(daysBetween(ctx.startDate, localDate) / 7);
  let base: number;
  switch (cfg.profile) {
    case "A": base = 0.94; break;
    case "B": base = 0.86 - Math.min(week, 20) * 0.003; break;
    case "C": base = 0.66 + Math.sin(week * 1.7) * 0.08; break;
    case "D": base = dayOffset < -45 ? 0.88 : Math.max(0.4, 0.88 * Math.exp(-0.06 * ((dayOffset + 45) / 7))); break;
    case "E": base = 0.62; break;
    case "H": base = 0.97; break;
  }
  if (week < 3 && cfg.profile !== "D") base += 0.05;
  let mult = WEEKDAY_MULT[weekdayOf(localDate)]!;
  if (kind === "workout" && weekdayOf(localDate) === 0) mult /= 1.2;
  if (cfg.profile === "A" || cfg.profile === "H") mult = 1 - (1 - mult) * 0.4;
  for (const event of cfg.events ?? []) {
    if (dayOffset >= event.from && dayOffset <= event.to) {
      mult *= kind === "meal" ? event.mealMult : event.workoutMult;
    }
  }
  return Math.max(0, Math.min(0.99, base * mult + rng.normal(0, 0.02)));
}

export function isPaused(cfg: PersonaConfig, refDate: string, localDate: string): boolean {
  const offset = daysBetween(refDate, localDate);
  return (cfg.events ?? []).some((e) => e.kind === "pause" && offset >= e.from && offset <= e.to);
}

function mealMacros(items: PlanContent["mealPrescriptions"][number]["items"]) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items ?? []) {
    t.kcal += item.calculated.energyKcalScaled ?? 0;
    t.protein += item.calculated.proteinScaled ?? 0;
    t.carbs += item.calculated.carbsScaled ?? 0;
    t.fat += item.calculated.fatScaled ?? 0;
  }
  return t;
}

/** Smooth weight trend + AR(1) noise; Monday +0.25, luteal bump for women. */
export function weightOn(cfg: PersonaConfig, ctx: { refDate: string; startDate: string }, localDate: string): number {
  const total = Math.max(1, daysBetween(ctx.startDate, ctx.refDate));
  const t = Math.min(1, Math.max(0, daysBetween(ctx.startDate, localDate) / total));
  const eased = 1 - Math.pow(1 - t, 1.4);
  let w = cfg.weight.start + (cfg.weight.now - cfg.weight.start) * eased;
  const rng = rngFor(cfg.email, "weight", localDate);
  w += rng.normal(0, cfg.weight.start * 0.004);
  if (weekdayOf(localDate) === 1) w += 0.25;
  if (cfg.sex === "Female") {
    const cycleDay = (daysBetween(ctx.startDate, localDate) + 11) % 28;
    if (cycleDay >= 22) w += 0.7;
  }
  return Math.round(w * 10) / 10;
}

function parseKg(label: string | null | undefined): number | null {
  const m = /^([\d.]+) kg$/.exec(label ?? "");
  return m ? Number(m[1]) : null;
}
function kgLabel(kg: number): string {
  const r = Math.round(kg / 1.25) * 1.25;
  return `${Number.isInteger(r) ? r.toFixed(0) : r % 0.5 === 0 ? r.toFixed(1) : r.toFixed(2)} kg`;
}

function insertException(ctx: ActivityContext, rng: Rng, input: {
  key: string;
  candidate: ExceptionCandidate;
  detectedAt: string;
  open: boolean;
  /** When the source was logged later (Client logged later; not auto-resolved). */
  loggedLateAt?: string | null;
}): void {
  const { rows } = ctx;
  const id = demoUuid("exception", ctx.relId, input.key);
  const detected = input.detectedAt;
  let status = "active";
  let acknowledgedAt: string | null = null;
  let resolvedAt: string | null = null;
  let outcome: string | null = null;
  let note: string | null = null;
  const actions: Array<{ action: string; at: string; note: string | null }> = [];
  if (!input.open) {
    status = "resolved";
    const roll = rng.float();
    const ms = Date.parse(detected);
    if (input.loggedLateAt || roll < 0.7) {
      resolvedAt = input.loggedLateAt ?? iso(ms + rng.int(2, 30) * HOUR);
    } else {
      outcome = rng.pick(["talked", "talked", "no_action", "plan_adjusted"] as const);
      note = rng.pick(RESOLUTION_NOTES);
      acknowledgedAt = atMost(iso(ms + rng.int(1, 10) * HOUR), ctx.now);
      resolvedAt = iso(Date.parse(acknowledgedAt) + rng.int(1, 40) * HOUR);
    }
    resolvedAt = atMost(resolvedAt, ctx.now);
    // The trainer's actions are stamped with the (capped) times they happened.
    if (acknowledgedAt) {
      actions.push({ action: "acknowledge", at: acknowledgedAt, note: null });
      actions.push({ action: "resolve", at: resolvedAt, note });
    }
  }
  rows.add("exceptions", {
    id,
    coaching_relationship_id: ctx.relId,
    type: input.candidate.type,
    status,
    rule_version: "mvp.v2",
    source_entity_type: input.candidate.sourceEntityType,
    source_entity_id: input.candidate.sourceEntityId,
    summary: input.candidate.summary,
    details_json: input.candidate.details ? JSON.stringify(input.candidate.details) : null,
    detected_at: detected,
    activated_at: detected,
    acknowledged_at: acknowledgedAt,
    resolved_at: resolvedAt,
    created_at: detected,
    updated_at: resolvedAt ?? detected,
    severity: input.candidate.severity,
    resolution_outcome: outcome,
    resolution_note: note,
    closed_reason: null,
    source_logged_late_at: input.loggedLateAt ?? null,
  });
  actions.forEach((action, index) => {
    rows.add("exception_actions", {
      id: demoUuid("exception-action", id, String(index)),
      exception_id: id,
      trainer_user_id: ctx.trainerId,
      action: action.action,
      note: action.note,
      created_at: action.at,
    });
  });
}

export type SimulationResult = { items: GeneratedItem[]; checkinIds: string[]; lastCheckin: { id: string; localDate: string } | null };

/**
 * Generate activity for [fromDate, toDate]. Assignments continue to
 * `assignUntil` (future days get assignments only). Historic gaps get resolved
 * exceptions unless `openFrom` marks the start of the detection lookback.
 */
export function simulateActivity(ctx: ActivityContext, opts: {
  fromDate: string;
  toDate: string;
  assignUntil?: string;
  /** Local date from which gaps are left to the coverage scan (no historic exceptions). */
  lookbackFrom?: string;
  checkins: boolean;
  weightsUntil?: string;
}): SimulationResult {
  const { cfg, rows } = ctx;
  const email = cfg.email;
  const nowMs = Date.parse(ctx.now);
  const tz = cfg.timezone;
  const mealRng = rngFor(email, "meals");
  const workoutRng = rngFor(email, "workouts");
  const excRng = rngFor(email, "exceptions");
  const checkinRng = rngFor(email, "checkins");
  const weightRng = rngFor(email, "weights");
  const items: GeneratedItem[] = [];
  const checkinIds: string[] = [];
  let lastCheckin: SimulationResult["lastCheckin"] = null;
  const loadProgress = new Map<string, number>();
  const assignUntil = opts.assignUntil ?? opts.toDate;
  const weekStats = { mealsPlanned: 0, mealsLogged: 0, workoutsPlanned: 0, workoutsDone: 0 };
  const deviationSlugs = DEMO_DEVIATION_FOOD_SLUGS.filter((slug) => ctx.lib.foods[slug]);

  for (let date = opts.fromDate; date <= assignUntil; date = addDaysFromLocalDate(date, 1)) {
    if (date < ctx.startDate) continue;
    const version = versionForDate(ctx.chain, date);
    if (!version) continue;
    if (isPaused(cfg, ctx.refDate, date)) continue;
    const past = date <= opts.toDate;
    const historic = !opts.lookbackFrom || date < opts.lookbackFrom;
    const pMeal = logProbability(cfg, ctx, date, "meal", mealRng);
    const pWorkout = logProbability(cfg, ctx, date, "workout", workoutRng);
    let firstMealGapRecorded = false;

    for (const meal of version.content.mealPrescriptions) {
      if (!(meal.applicableWeekdays ?? [0, 1, 2, 3, 4, 5, 6]).includes(weekdayOf(date))) continue;
      const assignmentId = demoUuid("meal-assignment", email, date, meal.id);
      const windowStart = localDayStartIso(date, meal.localTime ?? "08:00", tz);
      const windowEnd = iso(Date.parse(windowStart) + 12 * HOUR);
      rows.add("meal_assignments", {
        id: assignmentId,
        coaching_relationship_id: ctx.relId,
        plan_id: ctx.planId,
        plan_version_id: version.id,
        meal_prescription_id: meal.id,
        meal_name: meal.name,
        meal_prescription_json: JSON.stringify(meal),
        local_date: date,
        window_starts_at: windowStart,
        window_ends_at: windowEnd,
        photo_required: 0,
        schedule_status: "scheduled",
        superseded_at: null,
        superseded_by_plan_version_id: null,
        created_at: atMost(`${version.fromDate}T00:00:00.000Z` < windowStart ? `${version.fromDate}T00:00:00.000Z` : windowStart, ctx.now),
        updated_at: atMost(windowStart, ctx.now),
      });
      if (!past || Date.parse(windowStart) > nowMs) continue;
      weekStats.mealsPlanned += 1;
      let outcome: string | null = null;
      let loggedAt: string | null = null;
      let deviationKind: string | null = null;
      if (mealRng.chance(pMeal)) {
        const roll = mealRng.float();
        const satBoost = weekdayOf(date) === 6 ? 2 : 1;
        outcome = roll < 0.06 && meal.mealType === "breakfast" ? "skipped" : roll < 0.06 + 0.12 * satBoost ? "modified" : "confirmed";
        const late = mealRng.chance(cfg.profile === "D" ? 0.15 : 0.05);
        const loggedMs = late
          ? Date.parse(windowEnd) + mealRng.int(1, 9) * HOUR
          : Date.parse(windowStart) + mealRng.int(10, 120) * 60_000;
        if (loggedMs > nowMs) {
          outcome = null;
        } else {
          loggedAt = iso(loggedMs);
        }
      }
      if (outcome && loggedAt) {
        weekStats.mealsLogged += 1;
        let itemsJson: string | null = null;
        let macros = mealMacros(meal.items);
        let notes: string | null = null;
        if (outcome === "modified") {
          const kinds = ["portion_adjustment", "substitute", "restaurant", "repeat_recent", "logged_foods"] as const;
          deviationKind = weekdayOf(date) === 6 && mealRng.chance(0.5) ? "restaurant" : mealRng.pick(kinds);
          if (deviationKind === "restaurant" || deviationKind === "logged_foods") {
            const slug = mealRng.pick(deviationSlugs);
            const dish = foodByGrams(ctx.lib, slug, mealRng.int(15, 30) * 10, (clamp) => {
              throw new Error(
                `Demo seed: deviation ${clamp.slug} requested ${clamp.requestedGrams} g and would silently cap at ${clamp.cappedUnits} × "${clamp.servingLabel}"`,
              );
            });
            const items = [dish];
            itemsJson = JSON.stringify(items);
            macros = mealMacros(items);
            notes = deviationKind === "restaurant" ? "Ate out" : "Had something else";
          } else if (deviationKind === "portion_adjustment") {
            const factor = mealRng.pick([0.75, 1.25, 1.5]);
            macros = { kcal: Math.round(macros.kcal * factor), protein: Math.round(macros.protein * factor), carbs: Math.round(macros.carbs * factor), fat: Math.round(macros.fat * factor) };
            notes = factor < 1 ? "Smaller portion" : "Bigger portion";
          } else {
            notes = deviationKind === "substitute" ? "Swapped one item" : "Same as yesterday";
          }
        }
        if (outcome === "skipped") {
          macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
        }
        const loggedLate = Date.parse(loggedAt) > Date.parse(windowEnd);
        rows.add("meal_compliance", {
          id: demoUuid("meal-compliance", assignmentId),
          assignment_id: assignmentId,
          coaching_relationship_id: ctx.relId,
          plan_version_id: version.id,
          trainee_user_id: ctx.traineeId,
          outcome,
          record_version: 0,
          logged_at: loggedAt,
          deviation_kind: deviationKind,
          notes,
          photo_required: 0,
          photo_intent_json: null,
          media_asset_id: null,
          items_json: itemsJson,
          kcal_scaled: outcome === "skipped" ? null : macros.kcal,
          protein_scaled: outcome === "skipped" ? null : macros.protein,
          carbs_scaled: outcome === "skipped" ? null : macros.carbs,
          fat_scaled: outcome === "skipped" ? null : macros.fat,
          logged_late: loggedLate ? 1 : 0,
          logged_after_resolve: 0,
          client_logged_at: iso(Date.parse(loggedAt) - mealRng.int(0, 120) * 1000),
          created_at: loggedAt,
          updated_at: loggedAt,
        });
        if (historic && (outcome === "skipped" || loggedLate) && meal.required !== false) {
          const candidate = outcome === "skipped"
            ? skippedMealCandidate({ assignmentId, localDate: date, mealName: meal.name, loggedLater: loggedLate })
            : overdueMealCandidate({ assignmentId, localDate: date, mealName: meal.name, windowEndsAt: windowEnd });
          insertException(ctx, excRng, {
            key: `meal-${assignmentId}`,
            candidate,
            detectedAt: outcome === "skipped" ? iso(Date.parse(loggedAt) + 60_000) : iso(Date.parse(windowEnd) + 5 * 60_000),
            open: false,
            loggedLateAt: loggedLate && outcome !== "skipped" ? loggedAt : null,
          });
        }
      } else if (historic && Date.parse(windowEnd) < nowMs && !firstMealGapRecorded && meal.required !== false) {
        firstMealGapRecorded = true;
        insertException(ctx, excRng, {
          key: `meal-${assignmentId}`,
          candidate: overdueMealCandidate({ assignmentId, localDate: date, mealName: meal.name, windowEndsAt: windowEnd }),
          detectedAt: iso(Date.parse(windowEnd) + 5 * 60_000),
          open: false,
        });
      }
      items.push({ kind: "meal", assignmentId, localDate: date, mealName: meal.name, windowStartsAt: windowStart, windowEndsAt: windowEnd, outcome, loggedAt, deviationKind });
    }

    const workoutDay = version.content.workoutDays.find((day) => day.weekday === weekdayOf(date));
    if (workoutDay) {
      const assignmentId = demoUuid("workout-assignment", email, date);
      const wStart = localDayStartIso(date, "07:00", tz);
      const wEnd = iso(Date.parse(wStart) + 24 * HOUR);
      rows.add("workout_assignments", {
        id: assignmentId,
        coaching_relationship_id: ctx.relId,
        plan_id: ctx.planId,
        plan_version_id: version.id,
        workout_day_id: workoutDay.id,
        workout_day_name: workoutDay.name,
        workout_day_json: JSON.stringify(workoutDay),
        local_date: date,
        window_starts_at: wStart,
        window_ends_at: wEnd,
        schedule_status: "scheduled",
        superseded_at: null,
        superseded_by_plan_version_id: null,
        created_at: atMost(wStart, ctx.now),
        updated_at: atMost(wStart, ctx.now),
      });
      let status: string | null = null;
      if (past && Date.parse(wStart) <= nowMs) {
        weekStats.workoutsPlanned += 1;
        if (workoutRng.chance(pWorkout)) {
          const roll = workoutRng.float();
          status = roll < 0.07 ? "skipped" : roll < 0.15 ? "modified" : "completed";
          const startedMs = Date.parse(wStart) + workoutRng.int(0, 13) * HOUR + workoutRng.int(0, 59) * 60_000;
          const durationMin = workoutRng.int(35, 75);
          const completedMs = startedMs + durationMin * 60_000;
          if (completedMs > nowMs) {
            status = null;
          } else {
            if (status !== "skipped") weekStats.workoutsDone += 1;
            const execId = demoUuid("workout-execution", assignmentId);
            const completedAt = iso(completedMs);
            rows.add("workout_executions", {
              id: execId,
              assignment_id: assignmentId,
              coaching_relationship_id: ctx.relId,
              plan_version_id: version.id,
              trainee_user_id: ctx.traineeId,
              status,
              record_version: 0,
              started_at: status === "skipped" ? completedAt : iso(startedMs),
              paused_at: null,
              completed_at: completedAt,
              session_rpe: status === "skipped" ? null : workoutRng.int(6, 9),
              require_session_rpe: 0,
              logged_late: 0,
              client_logged_at: completedAt,
              created_at: iso(startedMs),
              updated_at: completedAt,
            });
            if (status !== "skipped") {
              workoutDay.exercises.forEach((exercise, exIndex) => {
                const exExecId = demoUuid("exercise-execution", execId, exercise.id);
                rows.add("exercise_executions", {
                  id: exExecId,
                  workout_execution_id: execId,
                  exercise_id: exercise.id,
                  name: exercise.name,
                  order: exercise.order,
                  status: status === "modified" && exIndex === workoutDay.exercises.length - 1 ? "skipped" : "completed",
                  created_at: iso(startedMs),
                  updated_at: completedAt,
                });
                if (status === "modified" && exIndex === workoutDay.exercises.length - 1) return;
                const progressKey = exercise.sourceExerciseLibraryItemId ?? exercise.name;
                const sessions = (loadProgress.get(progressKey) ?? 0) + 1;
                loadProgress.set(progressKey, sessions);
                exercise.setTargets.forEach((target, setIndex) => {
                  const baseKg = parseKg(target.loadLabel);
                  // Double progression: ~+1.25 kg every 3 sessions, capped at +15 %.
                  const kg = baseKg == null ? null : Math.min(baseKg * 1.15, baseKg * (0.9 + 0.0125 * Math.floor(sessions / 3) + 0.05));
                  const lastSet = setIndex === exercise.setTargets.length - 1;
                  const reps = target.reps == null ? null : Math.max(1, target.reps + workoutRng.int(lastSet ? -2 : -1, 2));
                  rows.add("set_executions", {
                    id: demoUuid("set-execution", exExecId, target.id),
                    exercise_execution_id: exExecId,
                    set_target_id: target.id,
                    order: target.order,
                    status: "completed",
                    prescribed_reps: target.reps,
                    prescribed_load_label: target.loadLabel,
                    actual_reps: reps,
                    actual_load_label: kg == null ? target.loadLabel : kgLabel(kg),
                    completed_at: atMost(iso(startedMs + (exIndex * 4 + setIndex + 1) * 3 * 60_000), ctx.now),
                    created_at: iso(startedMs),
                    updated_at: completedAt,
                  });
                });
              });
            }
          }
        }
        if (historic && Date.parse(wEnd) < nowMs && (status === null || status === "skipped")) {
          insertException(ctx, excRng, {
            key: `workout-${assignmentId}`,
            candidate: status === "skipped"
              ? skippedWorkoutCandidate({ assignmentId, localDate: date })
              : missedWorkoutCandidate({ assignmentId, localDate: date, windowEndsAt: wEnd }),
            detectedAt: status === "skipped" ? iso(Date.parse(wStart) + 10 * HOUR) : iso(Date.parse(wEnd) + 5 * 60_000),
            open: false,
          });
        }
      }
      items.push({ kind: "workout", assignmentId, localDate: date, windowStartsAt: wStart, windowEndsAt: wEnd, status });
    }

    // Weigh-ins (trainee entries), only up to the persona's cut-off.
    if (past && (!opts.weightsUntil || date <= opts.weightsUntil)) {
      const perWeek = { A: 4, B: 2.5, C: 1.2, D: 1.5, E: 1, H: 3 }[cfg.profile];
      const pWeigh = (perWeek / 7) * Math.min(1, pMeal + 0.2);
      if (weightRng.chance(pWeigh)) {
        const at = iso(Date.parse(localDayStartIso(date, "07:15", tz)) + weightRng.int(0, 60) * 60_000);
        if (Date.parse(at) <= nowMs) {
          rows.add("measurements", {
            id: demoUuid("measurement", "gen-weight", email, date),
            coaching_relationship_id: ctx.relId,
            trainee_user_id: ctx.traineeId,
            type: "body_weight_kg",
            value: weightOn(cfg, ctx, date),
            unit: "kg",
            observed_at: at,
            source: "trainee_entry",
            checkin_id: null,
            media_asset_id: null,
            record_version: 0,
            created_at: at,
            updated_at: at,
          });
        }
      }
    }

    // Check-ins on the persona's cadence.
    if (opts.checkins && past && weekdayOf(date) === cfg.checkin.weekday && date > ctx.startDate) {
      const weekIndex = Math.floor(daysBetween(ctx.startDate, date) / 7);
      const due = cfg.checkin.cadence === "weekly" || (cfg.checkin.cadence === "biweekly" ? weekIndex % 2 === 1 : weekIndex % 4 === 3);
      if (due) {
        const result = simulateCheckin(ctx, checkinRng, date, { ...weekStats });
        if (result) {
          checkinIds.push(result.id);
          lastCheckin = { id: result.id, localDate: date };
        }
        weekStats.mealsPlanned = 0;
        weekStats.mealsLogged = 0;
        weekStats.workoutsPlanned = 0;
        weekStats.workoutsDone = 0;
      }
    }
  }
  return { items, checkinIds, lastCheckin };
}

function simulateCheckin(
  ctx: ActivityContext,
  rng: Rng,
  date: string,
  stats: { mealsPlanned: number; mealsLogged: number; workoutsPlanned: number; workoutsDone: number },
): { id: string } | null {
  const { cfg, rows } = ctx;
  const nowMs = Date.parse(ctx.now);
  const start = localDayStartIso(date, "09:00", cfg.timezone);
  const end = iso(Date.parse(start) + 48 * HOUR);
  if (Date.parse(end) > nowMs) return null; // current window handled by the caller
  const pSubmit = { A: 0.97, B: 0.9, C: 0.72, D: 0.55, E: 0.6, H: 0.98 }[cfg.profile];
  const dayOffset = daysBetween(ctx.refDate, date);
  const silenced = (cfg.events ?? []).some((e) => e.mealMult === 0 && dayOffset >= e.from && dayOffset <= e.to);
  if (silenced || !rng.chance(pSubmit)) return null;
  const id = demoUuid("checkin", cfg.email, date);
  const submittedMs = Date.parse(start) + (rng.chance(0.12) ? rng.int(26, 40) : rng.int(9, 14)) * HOUR;
  const submittedAt = iso(Math.min(submittedMs, nowMs));
  const adherence = stats.mealsPlanned ? stats.mealsLogged / stats.mealsPlanned : 0.5;
  const workoutRatio = stats.workoutsPlanned ? stats.workoutsDone / stats.workoutsPlanned : 0.5;
  const good = adherence > 0.75 && workoutRatio > 0.6;
  const weight = weightOn(cfg, ctx, date);
  const question = rng.pick(QUESTIONS);
  const answers = {
    wellbeing: good ? rng.pick(WELLBEING_GOOD) : rng.pick(WELLBEING_MEH),
    notes: question || null,
    bodyWeightKg: weight,
    fieldAnswers: {
      body_weight: weight,
      sessions_done: workoutRatio >= 0.99 ? "all" : workoutRatio >= 0.6 ? "most" : workoutRatio > 0 ? "some" : "none",
      diet_adherence: Math.max(1, Math.min(5, Math.round(adherence * 5))),
      energy: good ? rng.int(3, 5) : rng.int(2, 4),
      sleep: rng.int(2, 5),
      stress: rng.int(2, 4),
      training_feel: rng.int(2, 4),
      pain: rng.chance(0.08),
      win: rng.pick(WINS),
      obstacle: good && rng.chance(0.5) ? "Nothing major this week" : rng.pick(OBSTACLES),
    },
  };
  rows.add("checkins", {
    id,
    coaching_relationship_id: ctx.relId,
    checkin_schedule_id: ctx.checkinScheduleId,
    local_date: date,
    window_starts_at: start,
    window_ends_at: end,
    record_status: "submitted",
    record_version: 0,
    definition_version: 1,
    checkin_form_version_id: ctx.checkinFormVersionId,
    answers_json: JSON.stringify(answers),
    submitted_at: submittedAt,
    created_at: start,
    updated_at: submittedAt,
  });
  rows.add("measurements", {
    id: demoUuid("measurement", "gen-checkin-weight", id),
    coaching_relationship_id: ctx.relId,
    trainee_user_id: ctx.traineeId,
    type: "body_weight_kg",
    value: weight,
    unit: "kg",
    observed_at: submittedAt,
    source: "checkin",
    checkin_id: id,
    media_asset_id: null,
    record_version: 0,
    created_at: submittedAt,
    updated_at: submittedAt,
  });
  if (daysBetween(ctx.startDate, date) % 14 < 7) {
    const lost = Math.max(0, cfg.weight.start - weight);
    const waist = Math.round((cfg.waistStart - lost * 0.8 + rng.normal(0, 0.3)) * 10) / 10;
    rows.add("measurements", {
      id: demoUuid("measurement", "gen-checkin-waist", id),
      coaching_relationship_id: ctx.relId,
      trainee_user_id: ctx.traineeId,
      type: "waist_cm",
      value: waist,
      unit: "cm",
      observed_at: submittedAt,
      source: "checkin",
      checkin_id: id,
      media_asset_id: null,
      record_version: 0,
      created_at: submittedAt,
      updated_at: submittedAt,
    });
  }
  const reviewMs = Date.parse(submittedAt) + rng.int(1, 30) * HOUR;
  if (reviewMs <= nowMs) {
    const roll = rng.float();
    const outcome = roll < 0.7 ? "acknowledged" : roll < 0.9 ? "needs_follow_up" : "adjust_coaching";
    const reviewAt = iso(reviewMs);
    const note = rng.pick(REVIEW_NOTES);
    rows.add("checkin_reviews", {
      id: demoUuid("checkin-review", id),
      checkin_id: id,
      coaching_relationship_id: ctx.relId,
      trainer_user_id: ctx.trainerId,
      outcome,
      notes: note,
      created_at: reviewAt,
      updated_at: reviewAt,
    });
    if (nowMs - reviewMs < 60 * 86_400_000) {
      rows.add("notifications", {
        id: demoUuid("notification", "gen-checkin-reviewed", id),
        recipient_user_id: ctx.traineeId,
        coaching_relationship_id: ctx.relId,
        notification_type: "checkin_reviewed",
        domain_entity_type: "checkin",
        domain_entity_id: id,
        state: "read",
        dedupe_key: `checkin_reviewed:${id}`,
        created_at: reviewAt,
        read_at: iso(reviewMs + rng.int(5, 300) * 60_000 > nowMs ? nowMs : reviewMs + rng.int(5, 300) * 60_000),
        opened_at: null,
        payload_json: JSON.stringify({ summary: "Your coach reviewed your check-in" }),
      });
    }
  }
  return { id };
}

/**
 * Coverage rule: every candidate the runtime evaluator would raise in the
 * 3-day lookback gets a seeded exception, so the API invents none. ≤10 open:
 * older extras are pre-resolved by the coach.
 */
export function coverLookback(ctx: ActivityContext, items: GeneratedItem[], lookbackFrom: string, openLimit = 4): number {
  const rng = rngFor(ctx.cfg.email, "coverage");
  const candidates: Array<{ candidate: ExceptionCandidate; detectedAt: string; loggedLateAt: string | null }> = [];
  for (const item of items) {
    if (item.localDate < lookbackFrom) continue;
    if (item.kind === "meal") {
      const candidate = mealAdherenceCandidate({
        assignmentId: item.assignmentId,
        localDate: item.localDate,
        mealName: item.mealName,
        windowEndsAt: item.windowEndsAt,
        nowIso: ctx.now,
        complianceOutcome: (item.outcome as "confirmed" | "modified" | "skipped" | null) ?? null,
        loggedAt: item.loggedAt,
        deviationKind: (item.deviationKind as never) ?? null,
      });
      if (candidate) {
        const detectedAt = item.loggedAt && Date.parse(item.loggedAt) > Date.parse(item.windowEndsAt)
          ? item.loggedAt
          : item.loggedAt ?? iso(Date.parse(item.windowEndsAt) + 5 * 60_000);
        candidates.push({ candidate, detectedAt: iso(Math.min(Date.parse(detectedAt) + 60_000, Date.parse(ctx.now))), loggedLateAt: null });
      }
    } else {
      const candidate = workoutAdherenceCandidate({
        assignmentId: item.assignmentId,
        localDate: item.localDate,
        windowEndsAt: item.windowEndsAt,
        nowIso: ctx.now,
        executionStatus: (item.status as "completed" | "skipped" | null) ?? null,
      });
      if (candidate) {
        const detectedAt = candidate.type === "missed_workout" ? iso(Date.parse(item.windowEndsAt) + 5 * 60_000) : iso(Date.parse(item.windowEndsAt) - 12 * HOUR);
        candidates.push({ candidate, detectedAt: iso(Math.min(Date.parse(detectedAt), Date.parse(ctx.now))), loggedLateAt: null });
      }
    }
  }
  candidates.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  candidates.forEach((entry, index) => {
    insertException(ctx, rng, {
      key: `lookback-${entry.candidate.type}-${entry.candidate.sourceEntityId}`,
      candidate: entry.candidate,
      detectedAt: entry.detectedAt,
      open: index < openLimit,
    });
  });
  return Math.min(openLimit, candidates.length);
}
