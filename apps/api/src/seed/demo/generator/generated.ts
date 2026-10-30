/**
 * Per-persona world building: deep pre-window history for the original
 * accounts and the full lifecycle for the 8 generated Rahul clients.
 */
import { formatLocalDate, overdueCheckinCandidate } from "@fitbud/core";
import { addDaysFromLocalDate, demoUuid, localDayStartIso } from "../ids.js";
import type { DemoLibraryIndex } from "../personas.js";
import { DEMO_CHECKIN_FORM_VERSION_ID } from "../personas.js";
import { coverLookback, daysBetween, simulateActivity, weekdayOf, type ActivityContext, type GeneratedItem } from "./activity.js";
import { checkinFormVersionId, onboardingFormVersionId, planTemplateId } from "./library-rows.js";
import { ASK_ANSWERS, ASK_TOPICS } from "./phrases.js";
import { buildPlanChain, insertPlanRows, insertSubscriptionChain, type ChainVersion } from "./plans.js";
import type { PersonaConfig } from "./personas.js";
import { rngFor, type Rng } from "./rng.js";
import type { SeedRows } from "./sql.js";

const HOUR = 3_600_000;

const CLEARED_LOOKBACK = new Set([
  "siddharth.yearly@demo.fitbud.test",
  "ananya.newbie@demo.fitbud.test",
  "rajesh.senior@demo.fitbud.test",
  "divya.wedding@demo.fitbud.test",
  "fatima.london@demo.fitbud.test",
  "pooja.silent@demo.fitbud.test",
]);
const iso = (ms: number) => new Date(ms).toISOString();

export type WorldInput = {
  rows: SeedRows;
  lib: DemoLibraryIndex;
  refDate: string;
  now: string;
  userId: (email: string) => string;
  relId: (trainerEmail: string, traineeEmail: string) => string;
};

export function startedAtFor(cfg: PersonaConfig, refDate: string): string {
  return new Date(Date.parse(`${refDate}T06:00:00.000Z`) - cfg.tenureDays * 86_400_000).toISOString();
}

/**
 * First local date inside detection's 3-day lookback for this client. Detection
 * counts from the client's own local today (domain/exceptions.ts
 * detectionWindowStartLocalDate), not the IST refDate: west of IST the client
 * can still be a civil day behind, so an IST-based start would leave that day
 * uncovered and the first coach read would create rows (QS4). Meal, workout
 * and check-in coverage all use this.
 */
export function clientLookbackFrom(now: string, timezone: string): string {
  return addDaysFromLocalDate(formatLocalDate(new Date(now), timezone), -2);
}

export function checkinFormFor(cfg: PersonaConfig): string {
  const trainer = cfg.trainerEmail;
  switch (cfg.checkin.form) {
    case "cf1v1": return checkinFormVersionId(trainer, "cf1", 1);
    case "cf1v2": return checkinFormVersionId(trainer, "cf1", 2);
    case "cf2": return checkinFormVersionId(trainer, "cf2", 1);
    case "cf3": return checkinFormVersionId(trainer, "cf3", 1);
    default: return DEMO_CHECKIN_FORM_VERSION_ID;
  }
}

function weightedPick(rng: Rng, entries: Array<[string, number]>): string {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.float() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[0]![0];
}

/** Notes, asks and plan notifications derived from what was generated. */
function addCoachingTouches(input: WorldInput, ctx: ActivityContext, items: GeneratedItem[], opts: {
  fromDate: string;
  toDate: string;
  openAsk?: { topic: string; kind: "meal" | "workout"; daysAgo: number };
}): void {
  const { rows } = input;
  const rng = rngFor(ctx.cfg.email, "touches");
  const nowMs = Date.parse(input.now);
  const span = Math.max(1, daysBetween(opts.fromDate, opts.toDate));
  const askCount = Math.max(1, Math.round((span / 30) * 1.5));
  const candidates = items.filter((item) => item.localDate >= opts.fromDate && item.localDate <= opts.toDate && item.localDate < addDaysFromLocalDate(input.refDate, -2));
  for (let i = 0; i < askCount && candidates.length > 0; i += 1) {
    const item = candidates[rng.int(0, candidates.length - 1)]!;
    const topic = weightedPick(rng, ASK_TOPICS);
    const askedMs = Date.parse(localDayStartIso(item.localDate, "12:00", ctx.cfg.timezone)) + rng.int(0, 9) * HOUR;
    if (askedMs > nowMs) continue;
    const askId = demoUuid("coach_ask", ctx.relId, String(i));
    const expired = rng.chance(0.2);
    let noteId: string | null = null;
    let answeredAt: string | null = null;
    if (!expired) {
      answeredAt = iso(Math.min(askedMs + rng.int(2, 8) * HOUR, nowMs));
      noteId = demoUuid("note", ctx.relId, "ask", String(i));
      rows.add("trainer_notes", {
        id: noteId,
        coaching_relationship_id: ctx.relId,
        trainer_user_id: ctx.trainerId,
        checkin_id: null,
        body: ASK_ANSWERS[topic] ?? "Answered on WhatsApp.",
        created_at: answeredAt,
        updated_at: answeredAt,
        visibility: "client",
        subject_type: item.kind === "meal" ? "meal_assignment" : "workout_assignment",
        subject_id: item.assignmentId,
        shared_at: answeredAt,
        unshared_at: null,
        seen_at: iso(Math.min(Date.parse(answeredAt) + rng.int(1, 12) * HOUR, nowMs)),
      });
    }
    rows.add("coach_asks", {
      id: askId,
      relationship_id: ctx.relId,
      trainee_user_id: ctx.traineeId,
      item_type: item.kind === "meal" ? "meal_assignment" : "workout_assignment",
      item_id: item.assignmentId,
      topic,
      asked_at: iso(askedMs),
      last_asked_at: iso(askedMs),
      ask_count: rng.chance(0.15) ? 2 : 1,
      status: expired ? "expired" : "answered",
      answered_at: answeredAt,
      answered_by: expired ? null : ctx.trainerId,
      trainer_note_id: noteId,
    });
  }
  if (opts.openAsk) {
    const day = addDaysFromLocalDate(input.refDate, -opts.openAsk.daysAgo);
    // Only ask about an item whose window has opened (an hour before now, so
    // the ask can sit at least an hour back); otherwise roll back to the
    // latest such item of the same kind.
    const askable = items.filter(
      (entry) => entry.kind === opts.openAsk!.kind && Date.parse(entry.windowStartsAt) <= nowMs - HOUR,
    );
    const item = askable.find((entry) => entry.localDate === day) ??
      askable.filter((entry) => entry.localDate <= input.refDate).at(-1);
    if (item) {
      const askedAt = iso(
        Math.max(
          Date.parse(item.windowStartsAt),
          Math.min(Date.parse(localDayStartIso(item.localDate, "19:30", ctx.cfg.timezone)), nowMs - HOUR),
        ),
      );
      rows.add("coach_asks", {
        id: demoUuid("coach_ask", ctx.relId, "open"),
        relationship_id: ctx.relId,
        trainee_user_id: ctx.traineeId,
        item_type: item.kind === "meal" ? "meal_assignment" : "workout_assignment",
        item_id: item.assignmentId,
        topic: opts.openAsk.topic,
        asked_at: askedAt,
        last_asked_at: askedAt,
        ask_count: 1,
        status: "open",
        answered_at: null,
        answered_by: null,
        trainer_note_id: null,
      });
    }
  }
}

function addPlanChangeNotes(input: WorldInput, ctx: ActivityContext, chain: ChainVersion[], beforeDate: string): void {
  chain.forEach((version, index) => {
    if (version.fromDate > beforeDate) return;
    const at = localDayStartIso(version.fromDate, "08:15", ctx.cfg.timezone);
    if (Date.parse(at) > Date.parse(input.now)) return;
    input.rows.add("trainer_notes", {
      id: demoUuid("note", ctx.relId, "plan", String(index)),
      coaching_relationship_id: ctx.relId,
      trainer_user_id: ctx.trainerId,
      checkin_id: null,
      body: index === 0 ? `Plan v1: ${version.reason}.` : `Plan v${version.number}: ${version.reason}.`,
      created_at: at,
      updated_at: at,
      visibility: index === 0 ? "private" : "client",
      subject_type: null,
      subject_id: null,
      shared_at: index === 0 ? null : at,
      unshared_at: null,
      seen_at: index === 0 ? null : iso(Date.parse(at) + 3 * HOUR),
    });
    if (Date.parse(input.now) - Date.parse(at) < 60 * 86_400_000) {
      input.rows.add("notifications", {
        id: demoUuid("notification", "gen-plan-published", version.id),
        recipient_user_id: ctx.traineeId,
        coaching_relationship_id: ctx.relId,
        notification_type: "plan_published",
        domain_entity_type: "coaching_relationship",
        domain_entity_id: ctx.relId,
        state: "read",
        dedupe_key: `plan_published:${version.id}`,
        created_at: at,
        read_at: iso(Date.parse(at) + 2 * HOUR),
        opened_at: iso(Date.parse(at) + 2 * HOUR),
        payload_json: JSON.stringify({ summary: `New plan: v${version.number}` }),
      });
    }
  });
}

/** Original accounts: everything before history.ts's 28-day window. */
export function addLegacyDeepHistory(input: WorldInput, cfg: PersonaConfig, chain: ChainVersion[], planId: string): void {
  const relId = input.relId(cfg.trainerEmail, cfg.email);
  const startDate = startedAtFor(cfg, input.refDate).slice(0, 10);
  const windowStart = addDaysFromLocalDate(input.refDate, -27);
  const toDate = addDaysFromLocalDate(windowStart, -1);
  if (startDate > toDate) return;
  const ctx: ActivityContext = {
    rows: input.rows,
    lib: input.lib,
    cfg,
    relId,
    planId,
    chain,
    traineeId: input.userId(cfg.email),
    trainerId: input.userId(cfg.trainerEmail),
    refDate: input.refDate,
    now: input.now,
    startDate,
    checkinScheduleId: demoUuid("checkin-schedule", relId),
    checkinFormVersionId: checkinFormFor(cfg),
  };
  // Rohan's weigh-in overlay already covers the last 8 weeks.
  const weightsUntil = cfg.email.startsWith("rohan.") ? addDaysFromLocalDate(input.refDate, -57) : toDate;
  const result = simulateActivity(ctx, { fromDate: startDate, toDate, checkins: true, weightsUntil });
  addCoachingTouches(input, ctx, result.items, { fromDate: startDate, toDate });
  addPlanChangeNotes(input, ctx, chain, toDate);
}

const OPEN_ASKS: Record<string, { topic: string; kind: "meal" | "workout"; daysAgo: number }> = {
  "rajesh.senior@demo.fitbud.test": { topic: "pain", kind: "workout", daysAgo: 1 },
  "divya.wedding@demo.fitbud.test": { topic: "festival", kind: "meal", daysAgo: 0 },
  "fatima.london@demo.fitbud.test": { topic: "eating_out", kind: "meal", daysAgo: 1 },
  "ananya.newbie@demo.fitbud.test": { topic: "exercise_form", kind: "workout", daysAgo: 2 },
};

function onboardingAnswers(cfg: PersonaConfig, version: 1 | 2): Record<string, unknown> {
  const diet = cfg.plan[0]?.diet ?? "N08";
  const dietType: Record<string, string> = { N01: "veg", N02: "veg", N03: "jain", N04: "egg", N05: "egg", N06: "nonveg", N07: "nonveg", N08: version === 2 ? "veg_no_egg" : "veg", N09: "nonveg", N10: "nonveg", N11: "veg" };
  const cuisine: Record<string, string> = { N01: "north", N02: "south", N03: "gujarati", N04: "maharashtrian", N05: "gujarati", N06: "north", N07: "kerala", N08: "north", N09: "other", N10: "bengali" };
  const goal = /strength|pull-up|Glute/i.test(cfg.goalShort) ? "strength" : /prediabetes|BP/i.test(cfg.goalShort) ? "health" : /1\.6 km/.test(cfg.goalShort) ? "performance" : "fat_loss";
  const answers: Record<string, unknown> = {
    primary_goal: goal,
    goal_detail: cfg.goalDescription,
    height_cm: cfg.heightCm,
    weight_kg: cfg.weight.start,
    occupation_schedule: cfg.job,
    medical_conditions: /prediabetes/i.test(cfg.goalShort) ? ["diabetes"] : /BP/.test(cfg.goalShort) ? ["bp"] : ["none"],
    medications: /BP/.test(cfg.goalShort) ? "Telma 20 mg (morning)" : "",
    injuries: cfg.email.startsWith("rajesh.") ? "Right knee gets sore on stairs." : "",
    experience: cfg.profile === "H" ? "none" : "lt1",
    where_train: cfg.plan[0]?.workout === "W05" ? "home" : "gym",
    days_per_week: 4,
    preferred_time: cfg.email.startsWith("imran.") ? "late" : "morning",
    diet_type: dietType[diet] ?? "nonveg",
    cuisine: cuisine[diet] ?? "north",
    who_cooks: cfg.email.startsWith("pooja.") ? "self" : "family",
    allergies: "",
    alcohol: "never",
    sleep_hours: cfg.email.startsWith("imran.") ? 5 : 7,
    stress: cfg.profile === "C" || cfg.profile === "E" ? "high" : "medium",
    why_now: "Want to do this properly with someone checking in every week.",
    photos_ok: true,
  };
  if (version === 2) {
    answers.cycle_regular = cfg.sex === "Female" ? "yes" : "na";
    answers.festival_fasting = cfg.email.startsWith("divya.") ? "Karwa Chauth and Navratri fasts" : "No";
  }
  return answers;
}

/** The 8 new Rahul clients: relationship → onboarding → config → plan → activity → touches. */
export function addGeneratedPersona(input: WorldInput, cfg: PersonaConfig): void {
  const { rows, refDate, now } = input;
  const nowMs = Date.parse(now);
  const relId = input.relId(cfg.trainerEmail, cfg.email);
  const traineeId = input.userId(cfg.email);
  const trainerId = input.userId(cfg.trainerEmail);
  const startedAt = startedAtFor(cfg, refDate);
  const startDate = startedAt.slice(0, 10);
  const isImran = cfg.email.startsWith("imran.");
  rows.add("coaching_relationships", {
    id: relId,
    trainer_user_id: trainerId,
    trainee_user_id: traineeId,
    status: "active",
    invitation_id: null,
    started_at: startedAt,
    ended_at: null,
    created_at: startedAt,
    updated_at: now,
    ended_by_user_id: null,
    end_reason: null,
    reactivated_at: isImran ? `${addDaysFromLocalDate(refDate, -63)}T04:30:00.000Z` : null,
  });
  const formVersion = cfg.onboardingForm === "of1v1" ? 1 : 2;
  const responseId = demoUuid("onboarding-response", cfg.email);
  const submittedAt = iso(Date.parse(startedAt) - (cfg.tenureDays <= 4 ? 30 : 20) * HOUR);
  rows.add("onboarding_form_responses", {
    id: responseId,
    coaching_relationship_id: relId,
    onboarding_form_version_id: onboardingFormVersionId(cfg.trainerEmail, "of1", formVersion),
    trainee_user_id: traineeId,
    status: "submitted",
    answers_json: JSON.stringify(onboardingAnswers(cfg, formVersion as 1 | 2)),
    version: 1,
    submitted_at: submittedAt,
    created_at: iso(Date.parse(submittedAt) - 2 * HOUR),
    updated_at: submittedAt,
  });
  const reviewedAt = cfg.plan.length === 0 ? iso(nowMs - 26 * HOUR) : startedAt;
  rows.add("onboarding_reviews", {
    id: demoUuid("onboarding-review", cfg.email),
    coaching_relationship_id: relId,
    onboarding_form_response_id: responseId,
    trainer_user_id: trainerId,
    outcome: "coaching_ready",
    created_at: reviewedAt,
  });
  rows.add("trainer_notes", {
    id: demoUuid("note", relId, "intake"),
    coaching_relationship_id: relId,
    trainer_user_id: trainerId,
    checkin_id: null,
    body: `Intake call done. ${cfg.job}, ${cfg.city}. Goal: ${cfg.goalDescription}`,
    created_at: reviewedAt,
    updated_at: reviewedAt,
    visibility: "private",
    subject_type: null,
    subject_id: null,
    shared_at: null,
    unshared_at: null,
    seen_at: null,
  });

  const chain = buildPlanChain({ lib: input.lib, cfg, relId, refDate, legacyWindow: false, windowStart: refDate });
  const current = chain.at(-1);
  const configId = demoUuid("coaching-config", relId);
  const ready = !current;
  rows.add("coaching_configurations", {
    id: configId,
    coaching_relationship_id: relId,
    status: ready ? "draft" : "active",
    record_version: 0,
    notes: null,
    configured_at: ready ? null : startedAt,
    activated_at: ready ? null : startedAt,
    created_at: ready ? reviewedAt : startedAt,
    updated_at: now,
    version_number: 1,
    goal_short: cfg.goalShort,
    goal_description: cfg.goalDescription,
  });
  const sessions = current?.content.workoutDays.length ?? 4;
  const meals = current?.content.mealPrescriptions.length ?? 4;
  rows.add("workout_expectations", { id: demoUuid("workout-exp", relId), coaching_configuration_id: configId, sessions_per_week: sessions, completion_window_hours: 24, created_at: startedAt, updated_at: now });
  rows.add("nutrition_expectations", { id: demoUuid("nutrition-exp", relId), coaching_configuration_id: configId, meals_per_day: meals, confirmation_window_hours: 12, photo_requirement: "none", created_at: startedAt, updated_at: now });
  const scheduleId = demoUuid("checkin-schedule", relId);
  rows.add("checkin_schedules", { id: scheduleId, coaching_configuration_id: configId, coaching_relationship_id: relId, cadence: cfg.checkin.cadence, due_window_hours: 48, created_at: startedAt, updated_at: now, preferred_checkin_form_version_id: checkinFormFor(cfg) });
  rows.add("tracking_requirements", { id: demoUuid("tracking", relId), coaching_configuration_id: configId, require_body_weight: 1, require_progress_photos: 0, require_session_rpe: 0, created_at: startedAt, updated_at: now });
  insertSubscriptionChain({ rows, cfg, relId, refDate, startDate });
  addPreferences(input, cfg, traineeId);
  if (ready) return;

  const planId = demoUuid("plan", relId);
  insertPlanRows({ rows, chain, planId, relId, title: cfg.planTitle, startedAt, now, templateIdFor: (code) => (code ? planTemplateId(cfg.trainerEmail, code) : null) });
  const ctx: ActivityContext = {
    rows, lib: input.lib, cfg, relId, planId, chain, traineeId, trainerId, refDate, now, startDate,
    checkinScheduleId: scheduleId, checkinFormVersionId: checkinFormFor(cfg),
  };
  const lookbackFrom = clientLookbackFrom(now, cfg.timezone);
  const result = simulateActivity(ctx, { fromDate: startDate, toDate: refDate, assignUntil: addDaysFromLocalDate(refDate, 6), lookbackFrom, checkins: true });
  // SEED_DESIGN §4 distribution: these read on_track / no_recent_data, so the
  // coach has already cleared every lookback item; the rest keep ≤4 open.
  coverLookback(ctx, result.items, lookbackFrom, CLEARED_LOOKBACK.has(cfg.email) ? 0 : 4);
  addCurrentCheckins(input, ctx, result.lastCheckin);
  addCoachingTouches(input, ctx, result.items, { fromDate: startDate, toDate: refDate, openAsk: OPEN_ASKS[cfg.email] });
  addPlanChangeNotes(input, ctx, chain, refDate);
  addReminders(input, ctx, result.items);
  if (isImran) addImranBreak(input, ctx);
}

/** Next due check-in as a draft; a missed most-recent one stays as an overdue draft (Pooja). */
function addCurrentCheckins(input: WorldInput, ctx: ActivityContext, last: { id: string; localDate: string } | null): void {
  const { cfg, rows } = ctx;
  const nowMs = Date.parse(input.now);
  const stepDays = cfg.checkin.cadence === "weekly" ? 7 : cfg.checkin.cadence === "biweekly" ? 14 : 28;
  let due = addDaysFromLocalDate(input.refDate, -6);
  while (weekdayOf(due) !== cfg.checkin.weekday) due = addDaysFromLocalDate(due, 1);
  // align to cadence from the last submitted one
  if (last) {
    due = addDaysFromLocalDate(last.localDate, stepDays);
  }
  let guard = 0;
  while (guard++ < 8) {
    const start = localDayStartIso(due, "09:00", cfg.timezone);
    const end = iso(Date.parse(start) + 48 * HOUR);
    if (Date.parse(end) < nowMs) {
      // missed: only the most recent missed one is kept as an overdue draft
      const nextDue = addDaysFromLocalDate(due, stepDays);
      const nextEnd = Date.parse(localDayStartIso(nextDue, "09:00", cfg.timezone)) + 48 * HOUR;
      if (nextEnd >= nowMs) {
        const id = demoUuid("checkin", cfg.email, due);
        rows.add("checkins", {
          id, coaching_relationship_id: ctx.relId, checkin_schedule_id: ctx.checkinScheduleId, local_date: due,
          window_starts_at: start, window_ends_at: end, record_status: "draft", record_version: 0, definition_version: 1,
          checkin_form_version_id: ctx.checkinFormVersionId, answers_json: null, submitted_at: null, created_at: start, updated_at: start,
        });
        if (due >= clientLookbackFrom(input.now, cfg.timezone)) {
          const cleared = CLEARED_LOOKBACK.has(cfg.email);
          rows.add("exceptions", {
            id: demoUuid("exception", ctx.relId, `checkin-${id}`), coaching_relationship_id: ctx.relId, type: "overdue_checkin", status: cleared ? "resolved" : "active",
            rule_version: "mvp.v2", source_entity_type: "checkin", source_entity_id: id, summary: "Overdue check-in",
            details_json: JSON.stringify(overdueCheckinCandidate({ checkinId: id, localDate: due, windowEndsAt: end }).details),
            detected_at: iso(Date.parse(end) + 5 * 60_000), activated_at: iso(Date.parse(end) + 5 * 60_000), acknowledged_at: null, resolved_at: cleared ? input.now : null,
            created_at: iso(Date.parse(end) + 5 * 60_000), updated_at: cleared ? input.now : iso(Date.parse(end) + 5 * 60_000), severity: "attention",
            resolution_outcome: null, resolution_note: null, closed_reason: null, source_logged_late_at: null,
          });
        }
      }
      due = nextDue;
      continue;
    }
    const id = demoUuid("checkin", `${cfg.email}-next`);
    rows.add("checkins", {
      id, coaching_relationship_id: ctx.relId, checkin_schedule_id: ctx.checkinScheduleId, local_date: due,
      window_starts_at: start, window_ends_at: end, record_status: "draft", record_version: 0, definition_version: 1,
      checkin_form_version_id: ctx.checkinFormVersionId, answers_json: null, submitted_at: null, created_at: input.now, updated_at: input.now,
    });
    return;
  }
}

function addPreferences(input: WorldInput, cfg: PersonaConfig, traineeId: string): void {
  const quiet = cfg.email.startsWith("imran.") ? ["09:00", "16:00"] : ["22:30", "06:30"];
  input.rows.add("notification_preferences", {
    user_id: traineeId, push_enabled: 1, workout_reminder: 1, meal_reminder: 1, checkin_reminder: 1,
    subscription_renewal_reminder: 1, daily_summary_reminder: 1, quiet_hours_start: quiet[0], quiet_hours_end: quiet[1],
    created_at: input.now, updated_at: input.now,
  });
  input.rows.add("device_tokens", {
    id: demoUuid("device-token", cfg.email), user_id: traineeId, platform: cfg.sex === "Female" ? "ios" : "android", provider: "fcm",
    token: `demo-${cfg.email.split("@")[0]}`, installation_id: `demo-install-${cfg.email.split("@")[0]}`, status: "active",
    last_seen_at: input.now, created_at: input.now, updated_at: input.now,
  });
}

/** Meal/workout reminders over the last 14 days (drives responsiveness labels). */
function addReminders(input: WorldInput, ctx: ActivityContext, items: GeneratedItem[]): void {
  const rng = rngFor(ctx.cfg.email, "reminders");
  const nowMs = Date.parse(input.now);
  const from = addDaysFromLocalDate(input.refDate, -13);
  const openRate = { A: 0.7, B: 0.55, C: 0.4, D: 0.3, E: 0.05, H: 0.75 }[ctx.cfg.profile];
  let ignores = 0;
  for (const item of items) {
    if (item.localDate < from || item.localDate > input.refDate || !rng.chance(0.6)) continue;
    const sentMs = Date.parse(item.windowEndsAt) - (item.kind === "meal" ? 12 : 17) * HOUR - 10 * 60_000;
    if (sentMs > nowMs) continue;
    const opened = rng.chance(openRate);
    ignores = opened ? 0 : ignores + 1;
    const openedAt = opened ? iso(Math.min(sentMs + rng.int(2, 40) * 60_000, nowMs)) : null;
    input.rows.add("notifications", {
      id: demoUuid("notification", "gen-reminder", item.assignmentId),
      recipient_user_id: ctx.traineeId, coaching_relationship_id: ctx.relId,
      notification_type: item.kind === "meal" ? "meal_reminder" : "workout_reminder",
      domain_entity_type: item.kind === "meal" ? "meal_assignment" : "workout_assignment",
      domain_entity_id: item.assignmentId, state: opened ? "read" : "delivered",
      dedupe_key: `reminder:${item.assignmentId}`, created_at: iso(sentMs), read_at: openedAt, opened_at: openedAt,
      payload_json: JSON.stringify({ summary: item.kind === "meal" ? `${(item as { mealName: string }).mealName} reminder` : "Workout reminder" }),
    });
  }
  input.rows.add("reminder_states", {
    trainee_user_id: ctx.traineeId, consecutive_ignores: Math.min(ignores, 4), mode: "normal", paused_until: null,
    last_evaluated_at: input.now, updated_at: input.now,
  });
}

/** Imran: June burnout pause, expired + confirmed reactivation requests, history notes. */
function addImranBreak(input: WorldInput, ctx: ActivityContext): void {
  const d = (offset: number, time = "05:00") => `${addDaysFromLocalDate(input.refDate, offset)}T${time}:00.000Z`;
  input.rows.add("reactivation_requests", { id: demoUuid("reactivation", "imran", "expired"), relationship_id: ctx.relId, trainer_user_id: ctx.trainerId, status: "expired", intake_update_requested: 0, expires_at: d(-84), created_at: d(-98), resolved_at: d(-84) });
  input.rows.add("reactivation_requests", { id: demoUuid("reactivation", "imran", "confirmed"), relationship_id: ctx.relId, trainer_user_id: ctx.trainerId, status: "confirmed", intake_update_requested: 1, expires_at: d(-52), created_at: d(-66), resolved_at: d(-63) });
  const notes: Array<[number, string]> = [
    [-101, "Imran asked to pause: ICU rota changed to back-to-back nights, too exhausted to train. Paused coaching, no plan or reminders until he's back."],
    [-98, "Sent a soft check-in + reactivation request. No reply (expired)."],
    [-66, "Imran messaged — rota is stable again. Sent reactivation with the quick intake (OF2)."],
    [-63, "Reactivated. Same duty-day plan, meal times moved for night shifts. Weight 92.1 kg (was 91.4 before the break)."],
  ];
  notes.forEach(([offset, body], index) => {
    input.rows.add("trainer_notes", {
      id: demoUuid("note", ctx.relId, "break", String(index)), coaching_relationship_id: ctx.relId, trainer_user_id: ctx.trainerId,
      checkin_id: null, body, created_at: d(offset, "06:30"), updated_at: d(offset, "06:30"), visibility: "private",
      subject_type: null, subject_id: null, shared_at: null, unshared_at: null, seen_at: null,
    });
  });
}
