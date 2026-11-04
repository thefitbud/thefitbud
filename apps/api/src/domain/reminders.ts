import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type {
  EvaluateRemindersResponse,
  NotificationDomainEntityType,
  NotificationType,
  NudgeActivityType,
  ReminderQueueMessage,
  ReminderType,
} from "@fitbud/contracts";
import { mealPrescriptionSchema } from "@fitbud/contracts";
import {
  ACTIVITY_NUDGE_HOURLY_LIMIT,
  DAILY_PUSH_CAP,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_REMINDER_TYPES,
  activityNudgeDedupeKey,
  addDaysToLocalDate,
  dailySummaryDedupeKey,
  deferredReminderDedupeKey,
  deliveryDedupeKeyFromDeferred,
  deriveRenewalState,
  domainEntityTypeForActivity,
  dueMealReminderPhases,
  dueWorkoutReminderTimes,
  formatLocalDate,
  localDateTimeToUtcIso,
  isActivityUnresolved,
  isAtOrAfterHardStopLocal,
  isCategoryEnabled,
  isCheckinReminderEligible,
  isDailySummaryClockDue,
  isSubscriptionRenewalReminderEligible,
  isWithinQuietHours,
  isWorkoutResolved,
  localDateFromDailySummaryKey,
  localTimeHhMm,
  mealReminderDedupeKey,
  reminderDeliveryDecision,
  reminderDeliveryPriority,
  reminderDedupeKey,
  reminderPreferenceForActivity,
  reminderPreferenceForNotification,
  shouldSkipReminderForBackoff,
  subscriptionRenewalDedupeKey,
  workoutReminderDedupeKey,
} from "@fitbud/core";
import type { createDb } from "../db/client";
import {
  checkins,
  coachingRelationships,
  deviceTokens,
  mealAssignments,
  mealCompliance,
  mealTimeOverrides,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  reminderRules,
  reminderStates,
  scheduledJobs,
  subscriptionVersions,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import { createId, nowIso } from "../lib/crypto";
import { writeStructuredLog, type SafeLogFields } from "../lib/log";
import { selectInChunks } from "../lib/in-array-chunks";
import {
  routingPayloadForNotification,
  sendPushToDevice,
  type PushProviderMode,
} from "../lib/push-provider";

type Db = ReturnType<typeof createDb>;

/** Name of the error thrown when a stored timezone cannot be resolved (CU20). */
export const UNRESOLVABLE_TIMEZONE_ERROR_NAME = "UnresolvableRecipientTimeZoneError";

/** An IANA-shaped zone name, e.g. `Asia/Kolkata`, `UTC`, `Etc/GMT+5`. */
const IANA_ZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** A class-identifier-shaped error name, e.g. `RangeError`. */
const ERROR_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Stand-in for a stored zone that is not even IANA-shaped, so is never printed. */
const UNPRINTABLE_ZONE = "<non-IANA zone>";

/**
 * `errorLogFields`' result. Every field is either a name this codebase sets or a
 * value that passed a shape filter: no error `message` and no stack, for any
 * error type, so a stored or request-derived string cannot ride out through here.
 */
export type ErrorLogFields = Pick<SafeLogFields, "errorName" | "errorCode"> & {
  /** The unusable zone, only when it is an IANA-shaped name. */
  timeZone?: string;
  /** `"non_iana"` when the error named a zone that failed that filter. */
  timeZoneShape?: "non_iana";
  /** The IANA-shaped aliases a zone resolver tried, comma-separated. */
  timeZonesTried?: string;
  /** The underlying error's class name, when it has one. */
  causeName?: string;
};

/** The zone as given when it is IANA-shaped, else a stand-in. Never the raw value. */
function safeZoneLabel(zone: string): string {
  return zone.length <= 64 && IANA_ZONE_RE.test(zone) ? zone : UNPRINTABLE_ZONE;
}

/** Only an IANA-shaped zone name of at most 64 characters. */
function ianaZoneOrUndefined(zone: unknown): string | undefined {
  return typeof zone === "string" && zone.length <= 64 && IANA_ZONE_RE.test(zone)
    ? zone
    : undefined;
}

/**
 * Safe fields for a caught error: its name; its `code` when that is a plain
 * constant (e.g. a D1 or domain code); and, when the error exposes them, the
 * zone it names, the zones it tried and its cause's class name — each of which
 * must pass a shape filter to be emitted at all.
 *
 * **No error's `message` is ever logged, whatever its type.** That is the whole
 * safety property of this function, and it is a filter rather than a convention:
 * `apps/api/src/index.ts` uses it in the unhandled-error handler for every
 * request, so anything that could ride out on a message would ride out from
 * everywhere. A zone resolver's message interpolates the stored zone verbatim,
 * and `users.timezone` is 64 characters the user chooses, so the zone travels in
 * `timeZone` — past `IANA_ZONE_RE` — or it does not travel.
 */
export function errorLogFields(error: unknown): ErrorLogFields {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  const fields: ErrorLogFields =
    typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)
      ? { errorName: name, errorCode: code }
      : { errorName: name };

  const named = (error as { timeZone?: unknown } | null)?.timeZone;
  if (typeof named === "string") {
    const zone = ianaZoneOrUndefined(named);
    if (zone !== undefined) fields.timeZone = zone;
    // The stored value is not printable, but that it was unprintable is itself
    // the finding: it cannot have come from any validated write path.
    else fields.timeZoneShape = "non_iana";
  }

  // CU17's `UnsupportedTimeZoneError` exposes the aliases it tried.
  const tried = (error as { tried?: unknown } | null)?.tried;
  if (Array.isArray(tried)) {
    const zones = tried
      .map(ianaZoneOrUndefined)
      .filter((zone): zone is string => zone !== undefined)
      .slice(0, 8);
    if (zones.length > 0) fields.timeZonesTried = zones.join(",");
  }

  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause instanceof Error && ERROR_NAME_RE.test(cause.name)) {
    fields.causeName = cause.name;
  }
  return fields;
}

/**
 * A stored timezone that no local time can be derived from. Thrown, or logged,
 * instead of the former `?? "12:00"`, which decided quiet hours from a
 * fabricated noon and left no trace anywhere.
 *
 * The message is built from `safeZoneLabel`, not the raw zone, so that even if
 * it is surfaced somewhere this module does not control (the local-dev handler
 * in `index.ts` returns `err.message`) it cannot carry 64 stored characters.
 * `timeZone` keeps the raw value for `errorLogFields` to filter.
 */
class UnresolvableRecipientTimeZoneError extends Error {
  readonly timeZone: string;
  constructor(timeZone: string, cause?: unknown) {
    super(
      `Stored time zone ${safeZoneLabel(timeZone)} could not be resolved to a local time.`,
    );
    this.name = UNRESOLVABLE_TIMEZONE_ERROR_NAME;
    this.timeZone = timeZone;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Local HH:MM for a recipient's stored zone, or a throw naming the zone.
 * Every reminder decision below is computed from a real local time or from none.
 */
function recipientLocalTimeHhMm(now: string, timezone: string): string {
  const local = localTimeHhMm(now, timezone);
  if (local === null) throw new UnresolvableRecipientTimeZoneError(timezone);
  return local;
}

/**
 * A relationship's own "today" in the trainee's stored zone, or `null` and one
 * warn line naming the zone.
 *
 * `formatLocalDate` throws a `RangeError` straight out of `Intl` for a stored
 * zone the runtime has no data for, and it is the **first** thing every
 * relationship needs, so before this guard one such row ended the whole cron run
 * for every trainer in `loadReminderRunContext` or in `collectCandidates`, before
 * a single candidate existed. Contained per relationship: that relationship is
 * left out of the context, contributes no candidates, and is reported from both
 * places; the others are untouched.
 *
 * Only this one call is guarded, not the loop body around it. The other
 * zone-dependent calls there (the hard-stop check, the due-time calculations)
 * take the same zone and are reached only once it has resolved here, so they
 * cannot fail on it afterwards.
 *
 * Both call sites log, and each passes its own `operation`: the same relationship
 * fails twice in a run (once loading the context, once collecting candidates)
 * and the two lines have to be tellable apart.
 */
function relationshipLocalDate(
  now: string,
  timeZone: string,
  operation: string,
): string | null {
  try {
    return formatLocalDate(new Date(now), timeZone);
  } catch (error) {
    // Wrapped so the line can name the zone at all: a bare `RangeError` out of
    // `Intl` carries it only inside a message that is never logged.
    logCaught(operation, new UnresolvableRecipientTimeZoneError(timeZone, error));
    return null;
  }
}

/** One warn line for a caught error in reminder code; control flow is the caller's. */
function logCaught(operation: string, error: unknown): void {
  writeStructuredLog({
    level: "warn",
    message: "reminders.caught_error",
    operation,
    ...errorLogFields(error),
  });
}
type NotificationRow = typeof notifications.$inferSelect;
type RelationshipRow = typeof coachingRelationships.$inferSelect;

export type ReminderQueue = {
  send(message: ReminderQueueMessage): Promise<void>;
};

type DeliveryOptions = {
  queue: ReminderQueue | null;
  pushProviderMode: PushProviderMode;
  /** Optional Expo access token for `expo` mode (Worker secret). Never logged. */
  expoAccessToken?: string;
  deliverInline: boolean;
};

export type PushDeliveryConfig = {
  /** Optional Expo access token for `expo` mode (Worker secret). Never logged. */
  expoAccessToken?: string;
};

type ReminderCounters = {
  notificationsCreated: number;
  notificationsDeduped: number;
  deliveriesEnqueued: number;
  suppressed: number;
  deferred: number;
};

type ReminderCandidate = {
  type: NotificationType;
  preferenceType: ReminderType | null;
  /** Null reads the preference category. False is a final category-off suppression. */
  categoryAllowed: boolean | null;
  recipientUserId: string;
  coachingRelationshipId: string;
  domainEntityType: NotificationDomainEntityType;
  domainEntityId: string;
  dedupeKey: string;
};

type PersistResult =
  | { outcome: "deduped" }
  | { outcome: "stored"; notificationId: string };

type RemainingLogs = {
  workouts: number;
  meals: number;
  checkins: number;
};

export type ActivityNudgeResult =
  | {
      ok: true;
      notification: NotificationRow;
      deduped: boolean;
      deferredForQuietHours?: boolean;
      quietHoursEnd?: string | null;
    }
  | {
      ok: false;
      code:
        | "RELATIONSHIP_NOT_FOUND"
        | "RELATIONSHIP_ENDED"
        | "ACTIVITY_NOT_FOUND"
        | "ACTIVITY_RESOLVED"
        | "NUDGE_RATE_LIMITED"
        | "NUDGE_LIMIT"
        | "REMINDERS_PAUSED";
      retryAfter?: number;
    };

type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;

function preferencesFromRow(row: NotificationPreferenceRow | undefined) {
  if (row) {
    return {
      pushEnabled: row.pushEnabled,
      categories: {
        workoutReminder: row.workoutReminder,
        mealReminder: row.mealReminder,
        checkinReminder: row.checkinReminder,
        subscriptionRenewalReminder: row.subscriptionRenewalReminder,
        dailySummaryReminder: row.dailySummaryReminder,
      },
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
    };
  }
  return {
    pushEnabled: true,
    categories: {
      workoutReminder: true,
      mealReminder: true,
      checkinReminder: true,
      subscriptionRenewalReminder: true,
      dailySummaryReminder: true,
    },
    quietHoursStart: null as string | null,
    quietHoursEnd: null as string | null,
  };
}

async function loadOrDefaultPreferences(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return preferencesFromRow(rows[0]);
}

export async function ensureDefaultReminderRules(
  db: Db,
  relationshipId: string,
  now = nowIso(),
): Promise<void> {
  const existing = await db
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.coachingRelationshipId, relationshipId));
  const present = new Set(existing.map((row) => row.reminderType));
  for (const type of DEFAULT_REMINDER_TYPES) {
    if (present.has(type)) continue;
    await db.insert(reminderRules).values({
      id: createId(),
      coachingRelationshipId: relationshipId,
      reminderType: type,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function enabledReminderTypes(
  db: Db,
  relationshipId: string,
  now: string,
): Promise<Set<ReminderType>> {
  await ensureDefaultReminderRules(db, relationshipId, now);
  const rules = await db
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.coachingRelationshipId, relationshipId));
  return new Set(
    rules.filter((rule) => rule.enabled).map((rule) => rule.reminderType),
  );
}

async function findByDedupeKey(
  db: Db,
  dedupeKey: string,
): Promise<NotificationRow | null> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, dedupeKey))
    .limit(1);
  return rows[0] ?? null;
}

function readMealLocalTime(mealPrescriptionJson: string): string | null {
  try {
    const parsed = mealPrescriptionSchema.safeParse(
      JSON.parse(mealPrescriptionJson),
    );
    if (!parsed.success) return null;
    return parsed.data.localTime ?? null;
  } catch (error) {
    logCaught("reminders.meal_local_time_parse", error);
    return null;
  }
}

function mealSlotKey(mealPrescriptionJson: string): string | null {
  try {
    const parsed = mealPrescriptionSchema.safeParse(
      JSON.parse(mealPrescriptionJson),
    );
    if (!parsed.success) return null;
    return parsed.data.mealType ?? null;
  } catch (error) {
    logCaught("reminders.meal_slot_parse", error);
    return null;
  }
}

function resolveMealLocalTime(
  mealPrescriptionJson: string,
  overrideBySlot: Map<string, string>,
): string | null {
  const slot = mealSlotKey(mealPrescriptionJson);
  if (slot && overrideBySlot.has(slot)) {
    return overrideBySlot.get(slot) ?? null;
  }
  return readMealLocalTime(mealPrescriptionJson);
}

function latestMealLocalTime(
  assignments: Array<{ mealPrescriptionJson: string }>,
  overrideBySlot: Map<string, string>,
): string | null {
  let latest: string | null = null;
  for (const assignment of assignments) {
    const localTime = resolveMealLocalTime(
      assignment.mealPrescriptionJson,
      overrideBySlot,
    );
    if (!localTime) continue;
    if (!latest || localTime > latest) {
      latest = localTime;
    }
  }
  return latest;
}

const PUSH_REMINDER_TYPES = new Set<NotificationType>([
  "workout_reminder",
  "meal_reminder",
  "checkin_reminder",
  "daily_summary",
  "subscription_renewal_reminder",
  "activity_nudge",
]);

function summaryCategoryAllowed(
  prefs: Awaited<ReturnType<typeof loadOrDefaultPreferences>>,
  remaining: RemainingLogs,
): boolean {
  if (!prefs.pushEnabled || !prefs.categories.dailySummaryReminder) return false;
  if (remaining.workouts > 0 && prefs.categories.workoutReminder) return true;
  if (remaining.meals > 0 && prefs.categories.mealReminder) return true;
  if (remaining.checkins > 0 && prefs.categories.checkinReminder) return true;
  return false;
}

async function countRemainingLogs(
  db: Db,
  relationshipId: string,
  localDate: string,
  enabled: Set<ReminderType>,
  now: string,
): Promise<RemainingLogs> {
  const remaining: RemainingLogs = { workouts: 0, meals: 0, checkins: 0 };
  if (enabled.has("workout_reminder")) {
    const assignments = await db
      .select()
      .from(workoutAssignments)
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, relationshipId),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
          eq(workoutAssignments.localDate, localDate),
        ),
      )
      .limit(50);
    for (const assignment of assignments) {
      const executions = await db
        .select()
        .from(workoutExecutions)
        .where(eq(workoutExecutions.assignmentId, assignment.id))
        .limit(1);
      if (!isWorkoutResolved(executions[0]?.status ?? null)) {
        remaining.workouts += 1;
      }
    }
  }
  if (enabled.has("meal_reminder")) {
    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, relationshipId),
          eq(mealAssignments.scheduleStatus, "scheduled"),
          eq(mealAssignments.localDate, localDate),
        ),
      )
      .limit(50);
    for (const assignment of assignments) {
      const complianceRows = await db
        .select()
        .from(mealCompliance)
        .where(eq(mealCompliance.assignmentId, assignment.id))
        .limit(1);
      if (!complianceRows[0]) remaining.meals += 1;
    }
  }
  if (enabled.has("checkin_reminder")) {
    const rows = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relationshipId),
          eq(checkins.localDate, localDate),
          eq(checkins.recordStatus, "draft"),
        ),
      )
      .limit(5);
    for (const checkin of rows) {
      if (
        isCheckinReminderEligible({
          nowIso: now,
          windowStartsAt: checkin.windowStartsAt,
          windowEndsAt: checkin.windowEndsAt,
          recordStatus: checkin.recordStatus,
          hasReview: false,
        })
      ) {
        remaining.checkins += 1;
      }
    }
  }
  return remaining;
}

/** countRemainingLogs for the relationship's own "today", read from the run context. */
function remainingLogsFromContext(
  context: ReminderRunContext,
  relationshipId: string,
  today: string,
  enabled: Set<ReminderType>,
  now: string,
): RemainingLogs {
  const remaining: RemainingLogs = { workouts: 0, meals: 0, checkins: 0 };
  if (enabled.has("workout_reminder")) {
    const assignments = (context.workoutsByRelationship.get(relationshipId) ?? [])
      .filter((assignment) => assignment.localDate === today)
      .slice(0, 50);
    for (const assignment of assignments) {
      const execution = context.executionByAssignmentId.get(assignment.id);
      if (!isWorkoutResolved(execution?.status ?? null)) remaining.workouts += 1;
    }
  }
  if (enabled.has("meal_reminder")) {
    const assignments = (context.mealsByRelationship.get(relationshipId) ?? [])
      .filter((assignment) => assignment.localDate === today)
      .slice(0, 50);
    for (const assignment of assignments) {
      if (!context.loggedMealAssignmentIds.has(assignment.id)) remaining.meals += 1;
    }
  }
  if (enabled.has("checkin_reminder")) {
    const rows = (context.todaysDraftCheckinsByRelationship.get(relationshipId) ?? [])
      .filter((checkin) => checkin.localDate === today)
      .slice(0, 5);
    for (const checkin of rows) {
      if (
        isCheckinReminderEligible({
          nowIso: now,
          windowStartsAt: checkin.windowStartsAt,
          windowEndsAt: checkin.windowEndsAt,
          recordStatus: checkin.recordStatus,
          hasReview: false,
        })
      ) {
        remaining.checkins += 1;
      }
    }
  }
  return remaining;
}

/**
 * Everything one cron run reads per relationship, loaded in bulk (I8, D-W1-11):
 * a constant number of chunked queries instead of ~20 per active relationship.
 */
type ReminderRunContext = {
  traineeUserIds: Set<string>;
  enabledByRelationship: Map<string, Set<ReminderType>>;
  timezoneByUserId: Map<string, string>;
  preferencesByUserId: Map<string, NotificationPreferenceRow>;
  reminderStateByUserId: Map<string, typeof reminderStates.$inferSelect>;
  overridesByRelationship: Map<string, Array<typeof mealTimeOverrides.$inferSelect>>;
  workoutsByRelationship: Map<string, Array<typeof workoutAssignments.$inferSelect>>;
  executionByAssignmentId: Map<string, typeof workoutExecutions.$inferSelect>;
  mealsByRelationship: Map<string, Array<typeof mealAssignments.$inferSelect>>;
  loggedMealAssignmentIds: Set<string>;
  draftCheckinsByRelationship: Map<string, Array<typeof checkins.$inferSelect>>;
  /** Draft check-ins dated on each relationship's "today" (daily summary). */
  todaysDraftCheckinsByRelationship: Map<string, Array<typeof checkins.$inferSelect>>;
  currentSubscriptionByRelationship: Map<string, typeof subscriptionVersions.$inferSelect>;
};

/** Leaves room for the other bound parameters of a filter (D1 allows 100). */
const RUN_CONTEXT_CHUNK = 80;
/** reminder_rules has 6 columns: 15 rows stay under D1's 100 bound parameters. */
const REMINDER_RULE_INSERT_ROWS = 15;

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = grouped.get(k);
    if (list) list.push(row);
    else grouped.set(k, [row]);
  }
  return grouped;
}

/** First row per key, like the per-key `.limit(1)` reads it replaces. */
function firstBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const first = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    if (!first.has(k)) first.set(k, row);
  }
  return first;
}

/** Bulk form of ensureDefaultReminderRules + the enabled-rules read, for many relationships. */
async function enabledReminderTypesByRelationship(
  db: Db,
  relationshipIds: string[],
  now: string,
): Promise<Map<string, Set<ReminderType>>> {
  const existing = await selectInChunks(relationshipIds, (ids) =>
    db.select().from(reminderRules).where(inArray(reminderRules.coachingRelationshipId, ids)),
  );
  const byRelationship = groupBy(existing, (row) => row.coachingRelationshipId);
  const missing: Array<typeof reminderRules.$inferInsert> = [];
  for (const relationshipId of relationshipIds) {
    const present = new Set((byRelationship.get(relationshipId) ?? []).map((row) => row.reminderType));
    for (const type of DEFAULT_REMINDER_TYPES) {
      if (present.has(type)) continue;
      missing.push({
        id: createId(),
        coachingRelationshipId: relationshipId,
        reminderType: type,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  for (let i = 0; i < missing.length; i += REMINDER_RULE_INSERT_ROWS) {
    await db.insert(reminderRules).values(missing.slice(i, i + REMINDER_RULE_INSERT_ROWS));
  }
  const enabled = new Map<string, Set<ReminderType>>();
  for (const relationshipId of relationshipIds) enabled.set(relationshipId, new Set());
  for (const rule of existing) {
    if (rule.enabled) enabled.get(rule.coachingRelationshipId)?.add(rule.reminderType);
  }
  for (const rule of missing) enabled.get(rule.coachingRelationshipId)?.add(rule.reminderType);
  return enabled;
}

async function loadReminderRunContext(
  db: Db,
  relationships: RelationshipRow[],
  now: string,
): Promise<ReminderRunContext> {
  const relationshipIds = relationships.map((r) => r.id);
  const traineeIds = relationships.map((r) => r.traineeUserId);
  const userIds = [...traineeIds, ...relationships.map((r) => r.trainerUserId)];

  const enabledByRelationship = await enabledReminderTypesByRelationship(db, relationshipIds, now);
  const userRows = await selectInChunks(userIds, (ids) =>
    db.select({ id: users.id, timezone: users.timezone }).from(users).where(inArray(users.id, ids)),
  );
  const timezoneByUserId = new Map(userRows.map((row) => [row.id, row.timezone]));
  const preferenceRows = await selectInChunks(traineeIds, (ids) =>
    db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, ids)),
  );
  const stateRows = await selectInChunks(traineeIds, (ids) =>
    db.select().from(reminderStates).where(inArray(reminderStates.traineeUserId, ids)),
  );
  const overrideRows = await selectInChunks(relationshipIds, (ids) =>
    db.select().from(mealTimeOverrides).where(inArray(mealTimeOverrides.relationshipId, ids)),
  );

  // Each relationship has its own "today" (trainee timezone); read every day any of them needs.
  // A relationship whose zone will not resolve is left out here and skipped, with
  // its warn line, when `collectCandidates` reaches the same guard below.
  const todayByRelationship = new Map(
    relationships.flatMap((r) => {
      const today = relationshipLocalDate(
        now,
        timezoneByUserId.get(r.traineeUserId) ?? "UTC",
        "reminders.run_context_local_date",
      );
      return today === null ? [] : [[r.id, today] as const];
    }),
  );
  const todays = [...new Set(todayByRelationship.values())];
  const mealDays = [...new Set(todays.flatMap((day) => [day, addDaysToLocalDate(day, 1)]))];

  const workoutRows = await selectInChunks(
    relationshipIds,
    (ids) =>
      db
        .select()
        .from(workoutAssignments)
        .where(
          and(
            inArray(workoutAssignments.coachingRelationshipId, ids),
            eq(workoutAssignments.scheduleStatus, "scheduled"),
            inArray(workoutAssignments.localDate, todays),
          ),
        ),
    RUN_CONTEXT_CHUNK,
  );
  const executionRows = await selectInChunks(
    workoutRows.map((row) => row.id),
    (ids) => db.select().from(workoutExecutions).where(inArray(workoutExecutions.assignmentId, ids)),
  );
  const mealRows = await selectInChunks(
    relationshipIds,
    (ids) =>
      db
        .select()
        .from(mealAssignments)
        .where(
          and(
            inArray(mealAssignments.coachingRelationshipId, ids),
            eq(mealAssignments.scheduleStatus, "scheduled"),
            inArray(mealAssignments.localDate, mealDays),
          ),
        ),
    RUN_CONTEXT_CHUNK,
  );
  const complianceRows = await selectInChunks(
    mealRows.map((row) => row.id),
    (ids) =>
      db
        .select({ assignmentId: mealCompliance.assignmentId })
        .from(mealCompliance)
        .where(inArray(mealCompliance.assignmentId, ids)),
  );
  const checkinRows = await selectInChunks(
    relationshipIds,
    (ids) =>
      db
        .select()
        .from(checkins)
        .where(
          and(
            inArray(checkins.coachingRelationshipId, ids),
            eq(checkins.recordStatus, "draft"),
            lte(checkins.windowStartsAt, now),
          ),
        ),
    RUN_CONTEXT_CHUNK,
  );
  const todaysDraftCheckinRows = await selectInChunks(
    relationshipIds,
    (ids) =>
      db
        .select()
        .from(checkins)
        .where(
          and(
            inArray(checkins.coachingRelationshipId, ids),
            eq(checkins.recordStatus, "draft"),
            inArray(checkins.localDate, todays),
          ),
        ),
    RUN_CONTEXT_CHUNK,
  );
  const subscriptionRows = await selectInChunks(relationshipIds, (ids) =>
    db
      .select()
      .from(subscriptionVersions)
      .where(inArray(subscriptionVersions.coachingRelationshipId, ids))
      .orderBy(desc(subscriptionVersions.versionNumber)),
  );

  return {
    traineeUserIds: new Set(traineeIds),
    enabledByRelationship,
    timezoneByUserId,
    preferencesByUserId: firstBy(preferenceRows, (row) => row.userId),
    reminderStateByUserId: firstBy(stateRows, (row) => row.traineeUserId),
    overridesByRelationship: groupBy(overrideRows, (row) => row.relationshipId),
    workoutsByRelationship: groupBy(workoutRows, (row) => row.coachingRelationshipId),
    executionByAssignmentId: firstBy(executionRows, (row) => row.assignmentId),
    mealsByRelationship: groupBy(mealRows, (row) => row.coachingRelationshipId),
    loggedMealAssignmentIds: new Set(complianceRows.map((row) => row.assignmentId)),
    draftCheckinsByRelationship: groupBy(checkinRows, (row) => row.coachingRelationshipId),
    todaysDraftCheckinsByRelationship: groupBy(
      todaysDraftCheckinRows,
      (row) => row.coachingRelationshipId,
    ),
    currentSubscriptionByRelationship: firstBy(subscriptionRows, (row) => row.coachingRelationshipId),
  };
}

async function collectCandidates(
  db: Db,
  now: string,
): Promise<{ candidates: ReminderCandidate[]; context: ReminderRunContext }> {
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.status, "active"));

  const context = await loadReminderRunContext(db, relationships, now);
  const candidates: ReminderCandidate[] = [];

  for (const relationship of relationships) {
    const enabled = context.enabledByRelationship.get(relationship.id) ?? new Set();
    const timeZone = context.timezoneByUserId.get(relationship.traineeUserId) ?? "UTC";
    const today = relationshipLocalDate(
      now,
      timeZone,
      "reminders.collect_relationship_local_date",
    );
    if (today === null) continue;
    const tomorrow = addDaysToLocalDate(today, 1);
    const prefRow = context.preferencesByUserId.get(relationship.traineeUserId);
    const reminderState = context.reminderStateByUserId.get(relationship.traineeUserId);
    const backoffMode = reminderState?.mode ?? "normal";
    const softIgnorerSkipTick =
      backoffMode === "soft_ignorer" &&
      (reminderState?.consecutiveIgnores ?? 0) % 2 === 1;
    const skipBackoff = (preferenceType: ReminderType | null) =>
      shouldSkipReminderForBackoff({
        mode: backoffMode,
        preferenceType,
        pausedUntil: reminderState?.pausedUntil,
        nowIso: now,
        softIgnorerSkipTick,
      });
    const overrideRows = context.overridesByRelationship.get(relationship.id) ?? [];
    const overrideBySlot = new Map(
      overrideRows.map((row) => [row.slotKey, row.time]),
    );
    const hardStop = isAtOrAfterHardStopLocal(now, timeZone);

    if (enabled.has("workout_reminder") && !hardStop && !skipBackoff("workout_reminder")) {
      const assignments = (context.workoutsByRelationship.get(relationship.id) ?? [])
        .filter((assignment) => assignment.localDate === today)
        .slice(0, 50);
      for (const assignment of assignments) {
        const execution = context.executionByAssignmentId.get(assignment.id);
        const slots = dueWorkoutReminderTimes({
          nowIso: now,
          assignmentLocalDate: assignment.localDate,
          timeZone,
          resolved: isWorkoutResolved(execution?.status ?? null),
          workoutStartLocalTime: prefRow?.preferredWorkoutTime ?? null,
          quietHoursStart: prefRow?.quietHoursStart ?? null,
        });
        for (const slot of slots) {
          candidates.push({
            type: "workout_reminder",
            preferenceType: "workout_reminder",
            categoryAllowed: null,
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityType: "workout_assignment",
            domainEntityId: assignment.id,
            dedupeKey: workoutReminderDedupeKey(assignment.id, slot),
          });
        }
      }
    }

    if (enabled.has("meal_reminder") && !hardStop && !skipBackoff("meal_reminder")) {
      const assignments = (context.mealsByRelationship.get(relationship.id) ?? [])
        .filter((assignment) => assignment.localDate === today || assignment.localDate === tomorrow)
        .slice(0, 50);
      for (const assignment of assignments) {
        const phases = dueMealReminderPhases({
          nowIso: now,
          localDate: assignment.localDate,
          timeZone,
          localTime: resolveMealLocalTime(
            assignment.mealPrescriptionJson,
            overrideBySlot,
          ),
          logged: context.loggedMealAssignmentIds.has(assignment.id),
          windowEndsAt: assignment.windowEndsAt,
        });
        for (const phase of phases) {
          candidates.push({
            type: "meal_reminder",
            preferenceType: "meal_reminder",
            categoryAllowed: null,
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityType: "meal_assignment",
            domainEntityId: assignment.id,
            dedupeKey: mealReminderDedupeKey(assignment.id, phase),
          });
        }
      }
    }

    if (enabled.has("checkin_reminder") && !skipBackoff("checkin_reminder")) {
      const rows = (context.draftCheckinsByRelationship.get(relationship.id) ?? []).slice(0, 50);
      for (const checkin of rows) {
        if (
          !isCheckinReminderEligible({
            nowIso: now,
            windowStartsAt: checkin.windowStartsAt,
            windowEndsAt: checkin.windowEndsAt,
            recordStatus: checkin.recordStatus,
            hasReview: false,
          })
        ) {
          continue;
        }
        candidates.push({
          type: "checkin_reminder",
          preferenceType: "checkin_reminder",
          categoryAllowed: null,
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityType: "checkin",
          domainEntityId: checkin.id,
          dedupeKey: reminderDedupeKey({
            type: "checkin_reminder",
            domainEntityId: checkin.id,
          }),
        });
      }
    }

    if (enabled.has("subscription_renewal_reminder")) {
      const current = context.currentSubscriptionByRelationship.get(relationship.id);
      if (current) {
        const trainerToday = formatLocalDate(
          new Date(now),
          context.timezoneByUserId.get(relationship.trainerUserId) ?? "UTC",
        );
        const renewalState = deriveRenewalState({
          today: trainerToday,
          renewsOn: current.renewsOn,
        });
        if (isSubscriptionRenewalReminderEligible(renewalState)) {
          candidates.push({
            type: "subscription_renewal_reminder",
            preferenceType: "subscription_renewal_reminder",
            categoryAllowed: null,
            recipientUserId: relationship.traineeUserId,
            coachingRelationshipId: relationship.id,
            domainEntityType: "coaching_relationship",
            domainEntityId: relationship.id,
            dedupeKey: subscriptionRenewalDedupeKey({
              relationshipId: relationship.id,
              renewsOn: current.renewsOn,
              renewalState,
            }),
          });
        }
      }
    }

    const todaysMealAssignments = (context.mealsByRelationship.get(relationship.id) ?? [])
      .filter((assignment) => assignment.localDate === today)
      .slice(0, 20);
    const lastMealLocalTime = latestMealLocalTime(
      todaysMealAssignments,
      overrideBySlot,
    );
    if (
      isDailySummaryClockDue({
        nowIso: now,
        timeZone,
        lastMealLocalTime,
      })
    ) {
      const remaining = remainingLogsFromContext(
        context,
        relationship.id,
        today,
        enabled,
        now,
      );
      const total = remaining.workouts + remaining.meals + remaining.checkins;
      if (total > 0) {
        const prefs = preferencesFromRow(
          context.preferencesByUserId.get(relationship.traineeUserId),
        );
        candidates.push({
          type: "daily_summary",
          preferenceType: null,
          categoryAllowed: summaryCategoryAllowed(prefs, remaining),
          recipientUserId: relationship.traineeUserId,
          coachingRelationshipId: relationship.id,
          domainEntityType: "coaching_relationship",
          domainEntityId: relationship.id,
          dedupeKey: dailySummaryDedupeKey(relationship.id, today),
        });
      }
    }
  }

  return { candidates, context };
}

/**
 * Lookups one cron run would otherwise repeat per candidate (I8), prefetched in
 * bulk. A key or user missing from a map falls back to the original query, so a
 * caller without a cache (activity nudges) behaves exactly as before.
 */
type PersistCache = {
  notificationByKey: Map<string, Pick<NotificationRow, "id" | "state"> | null>;
  existingJobKeys: Map<string, boolean>;
  context: ReminderRunContext;
};

async function findByDedupeKeyCached(
  db: Db,
  dedupeKey: string,
  cache?: PersistCache,
): Promise<Pick<NotificationRow, "id" | "state"> | null> {
  if (cache?.notificationByKey.has(dedupeKey)) {
    return cache.notificationByKey.get(dedupeKey) ?? null;
  }
  const row = await findByDedupeKey(db, dedupeKey);
  cache?.notificationByKey.set(dedupeKey, row);
  return row;
}

async function recipientTimezone(db: Db, userId: string, cache?: PersistCache): Promise<string> {
  const known = cache?.context.timezoneByUserId.get(userId);
  if (known) return known;
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return userRows[0]?.timezone ?? "UTC";
}

async function recipientPreferences(db: Db, userId: string, cache?: PersistCache) {
  if (cache?.context.traineeUserIds.has(userId)) {
    return preferencesFromRow(cache.context.preferencesByUserId.get(userId));
  }
  return loadOrDefaultPreferences(db, userId);
}

async function createPersistCache(
  db: Db,
  candidates: ReminderCandidate[],
  context: ReminderRunContext,
): Promise<PersistCache> {
  const keys = candidates.flatMap((candidate) => [
    candidate.dedupeKey,
    deferredReminderDedupeKey(candidate.dedupeKey),
  ]);
  const rows = await selectInChunks(keys, (chunk) =>
    db
      .select({ id: notifications.id, state: notifications.state, dedupeKey: notifications.dedupeKey })
      .from(notifications)
      .where(inArray(notifications.dedupeKey, chunk)),
  );
  const notificationByKey = new Map<string, Pick<NotificationRow, "id" | "state"> | null>(
    keys.map((key) => [key, null]),
  );
  for (const row of rows) notificationByKey.set(row.dedupeKey, { id: row.id, state: row.state });

  const jobKeys = candidates.map((candidate) => `deliver:${candidate.dedupeKey}`);
  const jobRows = await selectInChunks(jobKeys, (chunk) =>
    db
      .select({ dedupeKey: scheduledJobs.dedupeKey })
      .from(scheduledJobs)
      .where(inArray(scheduledJobs.dedupeKey, chunk)),
  );
  const existingJobKeys = new Map(jobKeys.map((key) => [key, false]));
  for (const row of jobRows) existingJobKeys.set(row.dedupeKey, true);

  return { notificationByKey, existingJobKeys, context };
}

/** Push reminders already sent today per recipient, in one read (was one per recipient). */
async function pushRemindersSentToday(
  db: Db,
  recipientUserIds: string[],
  now: string,
  cache: PersistCache,
): Promise<Map<string, number>> {
  const dayStartByUser = new Map<string, string>();
  for (const userId of new Set(recipientUserIds)) {
    const tz = await recipientTimezone(db, userId, cache);
    dayStartByUser.set(userId, localDateTimeToUtcIso(formatLocalDate(new Date(now), tz), tz, 0, 0, 0));
  }
  const counts = new Map([...dayStartByUser.keys()].map((userId) => [userId, 0]));
  if (dayStartByUser.size === 0) return counts;
  const earliest = [...dayStartByUser.values()].sort()[0]!;
  const rows = await selectInChunks(dayStartByUser.keys(), (ids) =>
    db
      .select({
        recipientUserId: notifications.recipientUserId,
        notificationType: notifications.notificationType,
        state: notifications.state,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(inArray(notifications.recipientUserId, ids), gte(notifications.createdAt, earliest))),
  );
  for (const row of rows) {
    if (row.createdAt < dayStartByUser.get(row.recipientUserId)!) continue;
    if (!PUSH_REMINDER_TYPES.has(row.notificationType as NotificationType)) continue;
    if (row.state === "suppressed" || row.state === "deferred") continue;
    counts.set(row.recipientUserId, (counts.get(row.recipientUserId) ?? 0) + 1);
  }
  return counts;
}

async function enqueueReminderDelivery(
  db: Db,
  input: {
    notificationId: string;
    candidate: ReminderCandidate;
    now: string;
    options: DeliveryOptions;
    cache?: PersistCache;
  },
): Promise<void> {
  const deliveryId = createId();
  await db.insert(notificationDeliveries).values({
    id: deliveryId,
    notificationId: input.notificationId,
    deviceTokenId: null,
    channel: "push",
    providerStatus: "queued",
    providerMessageId: null,
    failureCategory: null,
    attemptNumber: 1,
    acceptedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });

  const jobDedupe = `deliver:${input.candidate.dedupeKey}`;
  const priorJobKnown = input.cache?.existingJobKeys.get(jobDedupe);
  const priorJob =
    priorJobKnown === undefined
      ? Boolean(
          (
            await db
              .select()
              .from(scheduledJobs)
              .where(eq(scheduledJobs.dedupeKey, jobDedupe))
              .limit(1)
          )[0],
        )
      : priorJobKnown;
  if (!priorJob) {
    await db.insert(scheduledJobs).values({
      id: createId(),
      jobType: "notification.deliver",
      dedupeKey: jobDedupe,
      dueAt: input.now,
      state: "pending",
      domainEntityType: input.candidate.domainEntityType,
      domainEntityId: input.candidate.domainEntityId,
      attemptCount: 0,
      lastErrorCategory: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    input.cache?.existingJobKeys.set(jobDedupe, true);
  }

  const message: ReminderQueueMessage = {
    notificationId: input.notificationId,
    deliveryId,
  };
  if (input.options.queue) {
    await input.options.queue.send(message);
  } else if (input.options.deliverInline) {
    await deliverReminderMessage(db, message, input.options.pushProviderMode, input.now, {
      expoAccessToken: input.options.expoAccessToken,
    });
  }
}

/**
 * Category-off writes the delivery dedupe key and is not retried.
 * Quiet hours write `deferred:<delivery key>` and leave the delivery key free.
 */
async function persistReminder(
  db: Db,
  candidate: ReminderCandidate,
  now: string,
  options: DeliveryOptions,
  counters: ReminderCounters,
  cache?: PersistCache,
): Promise<PersistResult> {
  const existingDelivery = await findByDedupeKeyCached(db, candidate.dedupeKey, cache);
  if (existingDelivery) {
    counters.notificationsDeduped += 1;
    return { outcome: "deduped" };
  }

  const prefs = await recipientPreferences(db, candidate.recipientUserId, cache);
  const timezone = await recipientTimezone(db, candidate.recipientUserId, cache);
  const localTime = recipientLocalTimeHhMm(now, timezone);
  const categoryOk =
    candidate.categoryAllowed !== null
      ? candidate.categoryAllowed
      : candidate.preferenceType
        ? isCategoryEnabled({
            pushEnabled: prefs.pushEnabled,
            categories: prefs.categories,
            type: candidate.preferenceType,
          })
        : false;
  const decision = reminderDeliveryDecision({
    categoryEnabled: categoryOk,
    withinQuietHours: isWithinQuietHours({
      localTimeHhMm: localTime,
      quietHoursStart: prefs.quietHoursStart ?? DEFAULT_QUIET_HOURS_START,
      quietHoursEnd: prefs.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END,
    }),
  });
  const deferredKey = deferredReminderDedupeKey(candidate.dedupeKey);
  const deferredRow = await findByDedupeKeyCached(db, deferredKey, cache);

  if (decision === "suppress") {
    if (deferredRow) {
      try {
        await db
          .update(notifications)
          .set({ dedupeKey: candidate.dedupeKey, state: "suppressed" })
          .where(eq(notifications.id, deferredRow.id));
      } catch (error) {
        logCaught("reminders.persist_suppressed_from_deferred", error);
        counters.notificationsDeduped += 1;
        return { outcome: "deduped" };
      }
      cache?.notificationByKey.set(deferredKey, null);
      cache?.notificationByKey.set(candidate.dedupeKey, { id: deferredRow.id, state: "suppressed" });
      counters.suppressed += 1;
      return { outcome: "stored", notificationId: deferredRow.id };
    }
    const notificationId = createId();
    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: candidate.domainEntityType,
        domainEntityId: candidate.domainEntityId,
        state: "suppressed",
        dedupeKey: candidate.dedupeKey,
        createdAt: now,
        readAt: null,
      });
    } catch (error) {
      logCaught("reminders.persist_suppressed", error);
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    cache?.notificationByKey.set(candidate.dedupeKey, { id: notificationId, state: "suppressed" });
    counters.notificationsCreated += 1;
    counters.suppressed += 1;
    return { outcome: "stored", notificationId };
  }

  if (decision === "defer") {
    if (deferredRow) {
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    const notificationId = createId();
    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: candidate.domainEntityType,
        domainEntityId: candidate.domainEntityId,
        state: "deferred",
        dedupeKey: deferredKey,
        createdAt: now,
        readAt: null,
      });
    } catch (error) {
      logCaught("reminders.persist_deferred", error);
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    cache?.notificationByKey.set(deferredKey, { id: notificationId, state: "deferred" });
    counters.notificationsCreated += 1;
    counters.deferred += 1;
    return { outcome: "stored", notificationId };
  }

  let notificationId: string;
  if (deferredRow?.state === "deferred") {
    try {
      await db
        .update(notifications)
        .set({ dedupeKey: candidate.dedupeKey, state: "queued" })
        .where(eq(notifications.id, deferredRow.id));
    } catch (error) {
      logCaught("reminders.persist_promote_deferred", error);
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    notificationId = deferredRow.id;
    cache?.notificationByKey.set(deferredKey, null);
  } else {
    notificationId = createId();
    try {
      await db.insert(notifications).values({
        id: notificationId,
        recipientUserId: candidate.recipientUserId,
        coachingRelationshipId: candidate.coachingRelationshipId,
        notificationType: candidate.type,
        domainEntityType: candidate.domainEntityType,
        domainEntityId: candidate.domainEntityId,
        // Final state straight away: the delivery below is always enqueued
        // (one write instead of insert "pending" then update "queued", I8).
        state: "queued",
        dedupeKey: candidate.dedupeKey,
        createdAt: now,
        readAt: null,
      });
    } catch (error) {
      logCaught("reminders.persist_queued", error);
      counters.notificationsDeduped += 1;
      return { outcome: "deduped" };
    }
    counters.notificationsCreated += 1;
  }
  cache?.notificationByKey.set(candidate.dedupeKey, { id: notificationId, state: "queued" });

  await enqueueReminderDelivery(db, {
    notificationId,
    candidate,
    now,
    options,
    cache,
  });
  counters.deliveriesEnqueued += 1;
  return { outcome: "stored", notificationId };
}

async function suppressDeferredRow(db: Db, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ state: "suppressed" })
    .where(eq(notifications.id, notificationId));
}

async function rebuildDeferredCandidate(
  db: Db,
  row: NotificationRow,
  logicalKey: string,
  relationship: RelationshipRow,
  now: string,
): Promise<ReminderCandidate | null> {
  const enabled = await enabledReminderTypes(db, relationship.id, now);
  const base = {
    recipientUserId: row.recipientUserId,
    coachingRelationshipId: relationship.id,
    dedupeKey: logicalKey,
  };

  if (row.notificationType === "workout_reminder") {
    if (!enabled.has("workout_reminder")) return null;
    const assignments = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, row.domainEntityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationship.id ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const executions = await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.assignmentId, assignment.id))
      .limit(1);
    if (isWorkoutResolved(executions[0]?.status ?? null)) return null;
    return {
      ...base,
      type: "workout_reminder",
      preferenceType: "workout_reminder",
      categoryAllowed: null,
      domainEntityType: "workout_assignment",
      domainEntityId: assignment.id,
    };
  }

  if (row.notificationType === "meal_reminder") {
    if (!enabled.has("meal_reminder")) return null;
    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.id, row.domainEntityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationship.id ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const complianceRows = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.assignmentId, assignment.id))
      .limit(1);
    if (complianceRows[0]) return null;
    return {
      ...base,
      type: "meal_reminder",
      preferenceType: "meal_reminder",
      categoryAllowed: null,
      domainEntityType: "meal_assignment",
      domainEntityId: assignment.id,
    };
  }

  if (row.notificationType === "checkin_reminder") {
    if (!enabled.has("checkin_reminder")) return null;
    const rows = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, row.domainEntityId))
      .limit(1);
    const checkin = rows[0];
    if (!checkin || checkin.coachingRelationshipId !== relationship.id) {
      return null;
    }
    if (
      !isCheckinReminderEligible({
        nowIso: now,
        windowStartsAt: checkin.windowStartsAt,
        windowEndsAt: checkin.windowEndsAt,
        recordStatus: checkin.recordStatus,
        hasReview: false,
      })
    ) {
      return null;
    }
    return {
      ...base,
      type: "checkin_reminder",
      preferenceType: "checkin_reminder",
      categoryAllowed: null,
      domainEntityType: "checkin",
      domainEntityId: checkin.id,
    };
  }

  if (row.notificationType === "subscription_renewal_reminder") {
    if (!enabled.has("subscription_renewal_reminder")) return null;
    const versions = await db
      .select()
      .from(subscriptionVersions)
      .where(eq(subscriptionVersions.coachingRelationshipId, relationship.id))
      .orderBy(desc(subscriptionVersions.versionNumber))
      .limit(1);
    const current = versions[0];
    if (!current) return null;
    const trainer = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, relationship.trainerUserId))
      .limit(1);
    const renewalState = deriveRenewalState({
      today: formatLocalDate(new Date(now), trainer[0]?.timezone ?? "UTC"),
      renewsOn: current.renewsOn,
    });
    if (!isSubscriptionRenewalReminderEligible(renewalState)) return null;
    const currentKey = subscriptionRenewalDedupeKey({
      relationshipId: relationship.id,
      renewsOn: current.renewsOn,
      renewalState,
    });
    if (currentKey !== logicalKey) return null;
    return {
      ...base,
      type: "subscription_renewal_reminder",
      preferenceType: "subscription_renewal_reminder",
      categoryAllowed: null,
      domainEntityType: "coaching_relationship",
      domainEntityId: relationship.id,
    };
  }

  if (row.notificationType === "daily_summary") {
    const localDate = localDateFromDailySummaryKey(logicalKey);
    if (!localDate) return null;
    const remaining = await countRemainingLogs(
      db,
      relationship.id,
      localDate,
      enabled,
      now,
    );
    const total = remaining.workouts + remaining.meals + remaining.checkins;
    if (total === 0) return null;
    const prefs = await loadOrDefaultPreferences(db, row.recipientUserId);
    return {
      ...base,
      type: "daily_summary",
      preferenceType: null,
      categoryAllowed: summaryCategoryAllowed(prefs, remaining),
      domainEntityType: "coaching_relationship",
      domainEntityId: relationship.id,
    };
  }

  if (row.notificationType === "activity_nudge") {
    const activity = await loadNudgeActivity(
      db,
      relationship.id,
      nudgeActivityTypeForEntity(row.domainEntityType),
      row.domainEntityId,
    );
    if (!activity || !activity.unresolved) return null;
    return {
      ...base,
      type: "activity_nudge",
      preferenceType: reminderPreferenceForActivity(activity.activityType),
      categoryAllowed: null,
      domainEntityType: domainEntityTypeForActivity(activity.activityType),
      domainEntityId: activity.activityId,
    };
  }

  return null;
}

function nudgeActivityTypeForEntity(
  domainEntityType: NotificationDomainEntityType,
): NudgeActivityType | null {
  if (domainEntityType === "workout_assignment") return "workout";
  if (domainEntityType === "meal_assignment") return "meal";
  if (domainEntityType === "checkin") return "checkin";
  return null;
}

async function loadNudgeActivity(
  db: Db,
  relationshipId: string,
  activityType: NudgeActivityType | null,
  activityId: string,
): Promise<{
  activityType: NudgeActivityType;
  activityId: string;
  unresolved: boolean;
} | null> {
  if (activityType === "workout") {
    const assignments = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, activityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationshipId ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const executions = await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.assignmentId, assignment.id))
      .limit(1);
    return {
      activityType,
      activityId,
      unresolved: isActivityUnresolved({
        activityType,
        workoutExecutionStatus: executions[0]?.status ?? null,
        mealLogged: false,
        checkinRecordStatus: null,
      }),
    };
  }
  if (activityType === "meal") {
    const assignments = await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.id, activityId))
      .limit(1);
    const assignment = assignments[0];
    if (
      !assignment ||
      assignment.coachingRelationshipId !== relationshipId ||
      assignment.scheduleStatus !== "scheduled"
    ) {
      return null;
    }
    const complianceRows = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.assignmentId, assignment.id))
      .limit(1);
    return {
      activityType,
      activityId,
      unresolved: isActivityUnresolved({
        activityType,
        workoutExecutionStatus: null,
        mealLogged: Boolean(complianceRows[0]),
        checkinRecordStatus: null,
      }),
    };
  }
  if (activityType === "checkin") {
    const rows = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, activityId))
      .limit(1);
    const checkin = rows[0];
    if (!checkin || checkin.coachingRelationshipId !== relationshipId) {
      return null;
    }
    return {
      activityType,
      activityId,
      unresolved: isActivityUnresolved({
        activityType,
        workoutExecutionStatus: null,
        mealLogged: false,
        checkinRecordStatus: checkin.recordStatus,
      }),
    };
  }
  return null;
}

async function retryDeferredReminders(
  db: Db,
  now: string,
  candidateKeys: Set<string>,
  options: DeliveryOptions,
  counters: ReminderCounters,
): Promise<void> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.state, "deferred"));
  for (const row of rows) {
    const logicalKey = deliveryDedupeKeyFromDeferred(row.dedupeKey);
    if (!logicalKey || candidateKeys.has(logicalKey)) continue;
    if (!row.coachingRelationshipId) {
      await suppressDeferredRow(db, row.id);
      counters.suppressed += 1;
      continue;
    }
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, row.coachingRelationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.status !== "active") {
      await suppressDeferredRow(db, row.id);
      counters.suppressed += 1;
      continue;
    }
    const rebuilt = await rebuildDeferredCandidate(
      db,
      row,
      logicalKey,
      relationship,
      now,
    );
    if (!rebuilt) {
      await suppressDeferredRow(db, row.id);
      counters.suppressed += 1;
      continue;
    }
    try {
      await persistReminder(db, rebuilt, now, options, counters);
    } catch (error) {
      // Contained for the same reason as the candidate loop below: one unusable
      // deferred row must not end the sweep over the rest of them.
      logCaught("reminders.retry_deferred_candidate", error);
      continue;
    }
  }
}

/**
 * Cron evaluation: create deduplicated notification intents and enqueue delivery.
 * Provider acceptance is recorded separately and never completes workflow state.
 */
export async function evaluateAndEnqueueReminders(
  db: Db,
  options: {
    now?: string;
    queue: ReminderQueue | null;
    pushProviderMode: PushProviderMode;
    expoAccessToken?: string;
    deliverInline: boolean;
  },
): Promise<EvaluateRemindersResponse> {
  const now = options.now ?? nowIso();
  const delivery: DeliveryOptions = {
    queue: options.queue,
    pushProviderMode: options.pushProviderMode,
    expoAccessToken: options.expoAccessToken,
    deliverInline: options.deliverInline,
  };
  const counters: ReminderCounters = {
    notificationsCreated: 0,
    notificationsDeduped: 0,
    deliveriesEnqueued: 0,
    suppressed: 0,
    deferred: 0,
  };
  const { candidates, context } = await collectCandidates(db, now);
  const candidateKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
  const sorted = [...candidates].sort(
    (a, b) => reminderDeliveryPriority(a.type) - reminderDeliveryPriority(b.type),
  );
  const cache = await createPersistCache(db, candidates, context);
  const pushCountCache = await pushRemindersSentToday(
    db,
    candidates
      .filter((candidate) => PUSH_REMINDER_TYPES.has(candidate.type))
      .map((candidate) => candidate.recipientUserId),
    now,
    cache,
  );
  for (const candidate of sorted) {
    if (PUSH_REMINDER_TYPES.has(candidate.type)) {
      const used = pushCountCache.get(candidate.recipientUserId) ?? 0;
      if (used >= DAILY_PUSH_CAP) {
        continue;
      }
    }
    const beforeDeliveries = counters.deliveriesEnqueued;
    try {
      await persistReminder(db, candidate, now, delivery, counters, cache);
    } catch (error) {
      // Narrowest scope that keeps the run going: one candidate. A throw here
      // used to abort the whole loop, so a single trainee with an unusable
      // stored timezone skipped every remaining candidate in the run — for every
      // trainer — and `retryDeferredReminders` below never ran at all. Contained
      // per candidate, one bad row costs exactly one reminder. This is not a
      // return to the old `?? "12:00"` silence: the failure is logged at warn
      // with its operation, error name and the zone (filtered), and nothing is
      // persisted, so the candidate is reported, not treated as delivered.
      logCaught("reminders.persist_candidate", error);
      continue;
    }
    if (
      PUSH_REMINDER_TYPES.has(candidate.type) &&
      counters.deliveriesEnqueued > beforeDeliveries
    ) {
      const used = pushCountCache.get(candidate.recipientUserId) ?? 0;
      pushCountCache.set(candidate.recipientUserId, used + 1);
    }
  }
  await retryDeferredReminders(db, now, candidateKeys, delivery, counters);
  return {
    evaluatedAt: now,
    ...counters,
  };
}

/** @deprecated Prefer evaluateAndEnqueueReminders */
export async function evaluateReminders(input: {
  db: Db;
  queue: ReminderQueue | null;
  now?: string;
}): Promise<EvaluateRemindersResponse> {
  return evaluateAndEnqueueReminders(input.db, {
    now: input.now,
    queue: input.queue,
    pushProviderMode: "test",
    deliverInline: !input.queue,
  });
}

export async function createActivityNudge(
  db: Db,
  input: {
    relationshipId: string;
    trainerUserId: string;
    activityType: NudgeActivityType;
    activityId: string;
    now?: string;
    queue: ReminderQueue | null;
    pushProviderMode: PushProviderMode;
    expoAccessToken?: string;
    deliverInline: boolean;
  },
): Promise<ActivityNudgeResult & { retryAfter?: number }> {
  const now = input.now ?? nowIso();
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  const relationship = relationships[0];
  if (!relationship) return { ok: false, code: "RELATIONSHIP_NOT_FOUND" };
  if (relationship.status !== "active") {
    return { ok: false, code: "RELATIONSHIP_ENDED" };
  }

  const [reminderState] = await db
    .select()
    .from(reminderStates)
    .where(eq(reminderStates.traineeUserId, relationship.traineeUserId))
    .limit(1);
  if (
    reminderState?.mode === "paused" &&
    (!reminderState.pausedUntil || reminderState.pausedUntil > now)
  ) {
    return { ok: false, code: "REMINDERS_PAUSED" };
  }

  const activity = await loadNudgeActivity(
    db,
    relationship.id,
    input.activityType,
    input.activityId,
  );
  if (!activity) return { ok: false, code: "ACTIVITY_NOT_FOUND" };

  const trainee = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, relationship.traineeUserId))
    .limit(1);
  const timeZone = trainee[0]?.timezone ?? "UTC";
  const localDate = formatLocalDate(new Date(now), timeZone);
  const dedupeKey = activityNudgeDedupeKey(activity.activityId, localDate);
  const deferredKey = deferredReminderDedupeKey(dedupeKey);

  if (!activity.unresolved) {
    const deferred = await findByDedupeKey(db, deferredKey);
    if (deferred?.state === "deferred") {
      await suppressDeferredRow(db, deferred.id);
    }
    return { ok: false, code: "ACTIVITY_RESOLVED" };
  }

  const existingDelivery = await findByDedupeKey(db, dedupeKey);
  if (existingDelivery) {
    return { ok: true, notification: existingDelivery, deduped: true };
  }
  const existingDeferred = await findByDedupeKey(db, deferredKey);
  if (existingDeferred?.state === "deferred") {
    return { ok: true, notification: existingDeferred, deduped: true };
  }

  const hourAgo = new Date(Date.parse(now) - 60 * 60 * 1000).toISOString();
  const itemCooldownStart = new Date(
    Date.parse(now) - 4 * 60 * 60 * 1000,
  ).toISOString();
  const [recentForTrainer, recentForItem] = await Promise.all([
    db
      .select({ id: notifications.id })
      .from(notifications)
      .innerJoin(
        coachingRelationships,
        eq(notifications.coachingRelationshipId, coachingRelationships.id),
      )
      .where(
        and(
          eq(coachingRelationships.trainerUserId, input.trainerUserId),
          eq(notifications.notificationType, "activity_nudge"),
          gte(notifications.createdAt, hourAgo),
        ),
      ),
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.domainEntityId, input.activityId),
          eq(notifications.notificationType, "activity_nudge"),
          gte(notifications.createdAt, itemCooldownStart),
        ),
      ),
  ]);
  if (recentForTrainer.length >= ACTIVITY_NUDGE_HOURLY_LIMIT) {
    return { ok: false, code: "NUDGE_LIMIT", retryAfter: 3600 };
  }
  if (recentForItem.length > 0) {
    return { ok: false, code: "NUDGE_LIMIT", retryAfter: 14_400 };
  }

  const counters: ReminderCounters = {
    notificationsCreated: 0,
    notificationsDeduped: 0,
    deliveriesEnqueued: 0,
    suppressed: 0,
    deferred: 0,
  };
  const result = await persistReminder(
    db,
    {
      type: "activity_nudge",
      preferenceType: reminderPreferenceForActivity(activity.activityType),
      categoryAllowed: null,
      recipientUserId: relationship.traineeUserId,
      coachingRelationshipId: relationship.id,
      domainEntityType: domainEntityTypeForActivity(activity.activityType),
      domainEntityId: activity.activityId,
      dedupeKey,
    },
    now,
    {
      queue: input.queue,
      pushProviderMode: input.pushProviderMode,
      expoAccessToken: input.expoAccessToken,
      deliverInline: input.deliverInline,
    },
    counters,
  );
  const notificationId =
    result.outcome === "stored"
      ? result.notificationId
      : (await findByDedupeKey(db, dedupeKey))?.id ??
        (await findByDedupeKey(db, deferredKey))?.id;
  if (!notificationId) return { ok: false, code: "NUDGE_RATE_LIMITED" };
  const stored = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .limit(1);
  if (!stored[0]) return { ok: false, code: "ACTIVITY_NOT_FOUND" };
  const deferredForQuietHours = stored[0].state === "deferred";
  let quietHoursEnd: string | null = null;
  if (deferredForQuietHours) {
    const prefs = await loadOrDefaultPreferences(db, relationship.traineeUserId);
    quietHoursEnd = prefs.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;
  }
  return {
    ok: true,
    notification: stored[0],
    deduped: result.outcome === "deduped",
    deferredForQuietHours,
    quietHoursEnd,
  };
}

/** Recorded on a delivery whose provider outcome was begun but never written. */
const UNCERTAIN_OUTCOME = "unknown_provider_outcome";

/**
 * Settles a delivery that was attempted but whose provider outcome cannot be
 * known, without sending anything. Only a delivery still carrying its attempt
 * marker reaches this: `accepted` and `skipped` rows are left untouched.
 */
async function settleUncertainDelivery(
  db: Db,
  input: { deliveryId: string; notificationDedupeKey: string; now: string },
): Promise<void> {
  const settled = await db
    .update(notificationDeliveries)
    .set({
      providerStatus: "uncertain",
      failureCategory: UNCERTAIN_OUTCOME,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(notificationDeliveries.id, input.deliveryId),
        inArray(notificationDeliveries.providerStatus, ["queued", "failed"]),
      ),
    )
    .returning({ id: notificationDeliveries.id });
  if (settled.length === 0) return;
  await db
    .update(scheduledJobs)
    .set({
      state: "failed",
      attemptCount: 1,
      lastErrorCategory: UNCERTAIN_OUTCOME,
      updatedAt: input.now,
    })
    .where(eq(scheduledJobs.dedupeKey, `deliver:${input.notificationDedupeKey}`));
}

/**
 * Queue consumer: hand off to the push provider (Expo, or the local double) and record provider acceptance.
 * Acceptance is never treated as workflow completion.
 *
 * Delivery is at-most-once (D-W3-8): the attempt marker
 * (`notification_deliveries.attempt_started_at`) is committed before the
 * provider call, so a queue retry can tell "nothing was sent" from "something
 * was sent and the outcome was never recorded". The second case is recorded as
 * `provider_status = 'uncertain'` and never sent again — a reminder can rarely
 * be lost, never doubled.
 */
export async function deliverReminderMessage(
  db: Db,
  message: ReminderQueueMessage,
  pushMode: PushProviderMode,
  now = nowIso(),
  config: PushDeliveryConfig = {},
): Promise<void> {
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, message.notificationId))
    .limit(1);
  const notification = notificationRows[0];
  if (!notification) return;

  const deliveryRows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, message.deliveryId))
    .limit(1);
  const delivery = deliveryRows[0];
  if (!delivery) return;

  if (delivery.providerStatus === "accepted") {
    if (notification.state !== "delivered") {
      await db
        .update(notifications)
        .set({ state: "delivered" })
        .where(eq(notifications.id, notification.id));
    }
    return;
  }

  // Already settled as uncertain by an earlier retry: nothing more to send or record.
  if (delivery.providerStatus === "uncertain") return;

  // A delivery still carrying its attempt marker was handed to the provider
  // without a definite answer coming back: either the outcome was never
  // recorded (`queued`), or it was recorded as a failure the provider may never
  // have answered (`failed` with `provider_error`). At-most-once wins over
  // at-least-once: do not send again (D-W3-8). The notification state is left
  // as it is — claiming `delivered` would be an invention.
  if (
    delivery.attemptStartedAt &&
    (delivery.providerStatus === "queued" || delivery.providerStatus === "failed")
  ) {
    await settleUncertainDelivery(db, {
      deliveryId: delivery.id,
      notificationDedupeKey: notification.dedupeKey,
      now,
    });
    return;
  }

  if (notification.coachingRelationshipId) {
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, notification.coachingRelationshipId))
      .limit(1);
    if (!relationships[0] || relationships[0].status !== "active") {
      await db
        .update(notificationDeliveries)
        .set({
          providerStatus: "skipped",
          failureCategory: "relationship_inactive",
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, delivery.id));
      await db
        .update(notifications)
        .set({ state: "suppressed" })
        .where(eq(notifications.id, notification.id));
      return;
    }
  }

  const prefs = await loadOrDefaultPreferences(db, notification.recipientUserId);
  const preference = reminderPreferenceForNotification({
    notificationType: notification.notificationType,
    domainEntityType: notification.domainEntityType,
  });
  const categoryOk =
    preference === "daily_summary"
      ? prefs.pushEnabled && prefs.categories.dailySummaryReminder
      : preference
        ? isCategoryEnabled({
            pushEnabled: prefs.pushEnabled,
            categories: prefs.categories,
            type: preference,
          })
        : false;
  if (!categoryOk) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "skipped",
        failureCategory: "preferences",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "suppressed" })
      .where(eq(notifications.id, notification.id));
    return;
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, notification.recipientUserId))
    .limit(1);
  const timezone = userRows[0]?.timezone ?? "UTC";
  const localTime = recipientLocalTimeHhMm(now, timezone);
  if (
    !notification.dedupeKey.startsWith("deferred:") &&
    isWithinQuietHours({
      localTimeHhMm: localTime,
      quietHoursStart: prefs.quietHoursStart ?? DEFAULT_QUIET_HOURS_START,
      quietHoursEnd: prefs.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END,
    })
  ) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "skipped",
        failureCategory: "quiet_hours",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({
        state: "deferred",
        dedupeKey: deferredReminderDedupeKey(notification.dedupeKey),
      })
      .where(eq(notifications.id, notification.id));
    return;
  }

  const tokens = await db
    .select()
    .from(deviceTokens)
    .where(
      and(
        eq(deviceTokens.userId, notification.recipientUserId),
        eq(deviceTokens.status, "active"),
      ),
    );

  if (tokens.length === 0) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "skipped",
        failureCategory: "no_device_token",
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "failed" })
      .where(eq(notifications.id, notification.id));
    return;
  }

  const payload = routingPayloadForNotification({
    notificationId: notification.id,
    notificationType: notification.notificationType,
    domainEntityType: notification.domainEntityType,
    domainEntityId: notification.domainEntityId,
    createdAt: notification.createdAt,
  });

  // Claim the attempt before any provider call. The write is conditional on the
  // marker still being free, so two queue deliveries racing the same message
  // can never both send: the loser records `uncertain` and stops. If this write
  // fails the error propagates, nothing was sent, and the queue retry finds no
  // marker and starts a clean attempt.
  const claimed = await db
    .update(notificationDeliveries)
    .set({ attemptStartedAt: now, updatedAt: now })
    .where(
      and(
        eq(notificationDeliveries.id, delivery.id),
        isNull(notificationDeliveries.attemptStartedAt),
      ),
    )
    .returning({ id: notificationDeliveries.id });
  if (claimed.length === 0) {
    await settleUncertainDelivery(db, {
      deliveryId: delivery.id,
      notificationDedupeKey: notification.dedupeKey,
      now,
    });
    return;
  }

  let anyAccepted = false;
  let lastMessageId: string | null = null;
  let lastFailure: string | null = null;
  let acceptedTokenId: string | null = null;
  /** True once any token's failure leaves its outcome unknown. */
  let anyOutcomeUnknown = false;

  for (const token of tokens) {
    const result = await sendPushToDevice({
      mode: pushMode,
      deviceToken: token.token,
      payload,
      expoAccessToken: config.expoAccessToken,
    });
    if (result.ok) {
      anyAccepted = true;
      lastMessageId = result.providerMessageId;
      acceptedTokenId = token.id;
      break;
    }
    lastFailure = result.failureCategory;
    // The sender says whether the provider answered; this never guesses from
    // the failure category (X4q, D-W3-8).
    //
    // Tested as "not answered" rather than "=== unknown" on purpose: freeing
    // the attempt marker is the unsafe side of D-W3-8, because a redelivery
    // then sends the push a second time. Only a definite "answered" may take
    // that branch, so a third outcome added to PushSendOutcome later keeps the
    // marker and loses at most one reminder, instead of silently doubling
    // sends. The compiler cannot catch a widened union here.
    if (result.outcome !== "answered") {
      anyOutcomeUnknown = true;
    }
    if (result.failureCategory === "DeviceNotRegistered") {
      // Expo says the app is gone from this device: stop using the token now.
      await db
        .update(deviceTokens)
        .set({ status: "revoked", updatedAt: now })
        .where(and(eq(deviceTokens.id, token.id), eq(deviceTokens.status, "active")));
    }
  }

  if (anyAccepted) {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "accepted",
        providerMessageId: lastMessageId,
        deviceTokenId: acceptedTokenId,
        acceptedAt: now,
        failureCategory: null,
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "delivered" })
      .where(eq(notifications.id, notification.id));
  } else {
    await db
      .update(notificationDeliveries)
      .set({
        providerStatus: "failed",
        failureCategory: lastFailure ?? "provider_failure",
        // Free the marker only when every token that was tried got a definite
        // answer (or was never sent to). If any outcome is unknown the marker
        // stays set, and a queue redelivery settles this delivery as
        // `uncertain` instead of sending the same push again (D-W3-8). Freeing
        // it does not itself trigger a resend: the queue message is acked and
        // the cron dedupes on `notifications.dedupe_key`. It only means that if
        // this message is delivered again, sending is the correct answer.
        ...(anyOutcomeUnknown || !lastFailure ? {} : { attemptStartedAt: null }),
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await db
      .update(notifications)
      .set({ state: "failed" })
      .where(eq(notifications.id, notification.id));
  }

  const jobDedupe = `deliver:${notification.dedupeKey}`;
  await db
    .update(scheduledJobs)
    .set({
      state: anyAccepted ? "completed" : "failed",
      attemptCount: 1,
      lastErrorCategory: anyAccepted ? null : lastFailure,
      updatedAt: now,
    })
    .where(eq(scheduledJobs.dedupeKey, jobDedupe));
}

export async function listRecentNotifications(
  db: Db,
  recipientUserId: string,
  limit = 20,
) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, recipientUserId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(
  db: Db,
  recipientUserId: string,
  notificationId: string,
  now = nowIso(),
) {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, recipientUserId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.state === "read") return row;
  await db
    .update(notifications)
    .set({ state: "read", readAt: now })
    .where(eq(notifications.id, notificationId));
  return { ...row, state: "read" as const, readAt: now };
}
