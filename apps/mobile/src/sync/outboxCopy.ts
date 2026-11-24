import type { SyncMutationResult } from "@fitbud/contracts";
import { formatClockTime, formatRelative } from "@fitbud/core";

type Entry = {
  operation: string;
  payloadJson: string;
  clientOccurredAt: string;
  lastError: string | null;
  status: string;
};

function payload(entry: Entry): Record<string, unknown> {
  try {
    const parsed = JSON.parse(entry.payloadJson) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mealName(body: Record<string, unknown>): string {
  return (
    text(body.mealName) ??
    text(body.label) ??
    text((body.body as Record<string, unknown> | undefined)?.mealName) ??
    "Meal"
  );
}

/** Trainee-facing outbox line. Never an operation name or id. */
export function describeOutboxEntry(entry: Entry): string {
  const body = payload(entry);
  const when = formatClockTime(entry.clientOccurredAt) || "just now";
  switch (entry.operation) {
    case "meal.confirm":
      return `${mealName(body)} · Eaten as planned · ${when}`;
    case "meal.skip":
      return `${mealName(body)} · Skipped · ${when}`;
    case "meal.deviate":
      return `${mealName(body)} · Something different · ${when}`;
    case "workout.start":
      return `Workout started · ${when}`;
    case "workout.complete":
      return `Workout finished · ${when}`;
    case "workout.skip":
      return `Workout skipped · ${when}`;
    case "workout.complete_set":
      return `Set logged · ${when}`;
    case "checkin.submit":
      return `Check-in sent · ${when}`;
    case "checkin.save_draft":
      return `Check-in draft · ${when}`;
    case "measurement.create":
      return `Measurement logged · ${when}`;
    default:
      return `Saved on this phone · ${when}`;
  }
}

export function conflictCopy(lastError: string | null): string {
  const raw = (lastError ?? "").toLowerCase();
  if (raw.includes("ended") || raw.includes("coaching has ended")) {
    return "Couldn't send. Coaching has ended.";
  }
  if (raw.includes("photo") || raw.includes("too large")) {
    return "Photo too large";
  }
  if (raw.includes("closed") || raw.includes("resolved") || raw.includes("late")) {
    return "Your coach closed this before your log was sent.";
  }
  if (raw.includes("superseded") || raw.includes("replaced") || raw.includes("changed")) {
    return "Your coach updated this. Your log was kept in history.";
  }
  if (raw.includes("replaced")) {
    return "Couldn't save. The meal was replaced.";
  }
  return "Couldn't send. We'll try again when you're online.";
}

export function lastSyncedLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "Not synced yet";
  const relative = formatRelative(iso, now);
  if (!relative || relative === "just now") return "Last synced just now";
  return `Last synced ${relative}`;
}

export type IndicatorKind = "synced" | "syncing" | "waiting" | "problem";

export function indicatorFromCounts(input: {
  pending: number;
  inFlight: number;
  failed: number;
  offline: boolean;
  syncedAt: number | null;
  now: number;
}): { kind: IndicatorKind; label: string; visible: boolean } {
  if (input.failed > 0) {
    return { kind: "problem", label: "Couldn't send", visible: true };
  }
  if (input.offline && (input.pending > 0 || input.inFlight > 0)) {
    return { kind: "waiting", label: "Saved on phone", visible: true };
  }
  if (input.inFlight > 0) {
    return { kind: "syncing", label: "Sending", visible: true };
  }
  if (input.pending > 0) {
    return { kind: "waiting", label: "Saved on phone", visible: true };
  }
  if (input.syncedAt != null && input.now - input.syncedAt < 2000) {
    return { kind: "synced", label: "Synced", visible: true };
  }
  return { kind: "synced", label: "Synced", visible: false };
}

/**
 * The lock-screen (or notification) sets that were drained but could not be
 * matched to a running workout. They are kept, never dropped, so the sync
 * status screen says so. Shaped for `useSyncExternalStore`: the snapshot is the
 * store's own copy, read on every call, so it can never go stale behind a
 * drain. `null` means there is nothing to report and the screen renders nothing.
 */
export type KeptRowsStore = {
  copy: () => string | null;
  subscribe: (listener: (next: number) => void) => () => unknown;
};

export function createKeptRowsBinding(store: KeptRowsStore): {
  subscribe: (onChange: () => void) => () => void;
  snapshot: () => string | null;
} {
  return {
    subscribe: (onChange: () => void) => {
      const unsubscribe = store.subscribe(() => onChange());
      return () => {
        unsubscribe();
      };
    },
    snapshot: () => store.copy(),
  };
}

// ---------------------------------------------------------------------------
// Sync status sheet (TR-19a) and conflict (TR-19b), Z12-41
// ---------------------------------------------------------------------------

/** The outbox row fields the sheet reads. */
export type SheetRow = {
  mutationId: string;
  operation: string;
  recordId: string;
  payloadJson: string;
  clientOccurredAt: string;
  status: string;
  lastError: string | null;
  lastErrorCode: string | null;
  lastErrorReason: string | null;
  keptAt: string | null;
};

/** Names the outbox does not carry, read from records already on the phone. */
export type SheetNames = {
  /** Meal name by meal assignment id. */
  meal: (assignmentId: string) => string | null;
  /** Workout name by execution id or assignment id. */
  workout: (id: string) => string | null;
};

export const NO_SHEET_NAMES: SheetNames = {
  meal: () => null,
  workout: () => null,
};

export type SheetItemState = "waiting" | "sending" | "failed";

/** One line of the sheet: one meal, one workout (all its sets), one weight. */
export type SheetItem = {
  key: string;
  kind: "meal" | "workout" | "progress" | "checkin";
  title: string;
  /** "Diet · eaten as planned · 5:04 pm" */
  detail: string;
  state: SheetItemState;
  /** Why it was refused, for a failed item. */
  reason: string | null;
  /** The coach changed the plan meanwhile (TR-19b). */
  conflict: boolean;
  /** The trainee already chose "Keep my log" for this conflict. */
  kept: boolean;
  mutationIds: string[];
};

function rowState(status: string): SheetItemState | null {
  if (status === "pending") return "waiting";
  if (status === "in_flight") return "sending";
  if (status === "rejected" || status === "conflicted") return "failed";
  return null;
}

/** The coach changed the plan while the log waited on the phone. */
export function isPlanChangeConflict(row: {
  status: string;
  lastErrorReason: string | null;
}): boolean {
  return row.status === "conflicted" && row.lastErrorReason === "superseded";
}

/**
 * Why the server refused a row. The API's own message is static, curated text
 * (AGENTS.md), so it is shown as it is when no better line is known.
 */
export function failureReason(
  row: Pick<SheetRow, "status" | "lastError" | "lastErrorCode" | "lastErrorReason">,
  coachFirstName: string,
): string {
  if (isPlanChangeConflict(row)) {
    return `${coachFirstName} changed this while you were offline.`;
  }
  if (row.lastErrorReason === "exception_resolved") {
    return `${coachFirstName} closed this before your log was sent.`;
  }
  if (row.lastErrorCode === "RELATIONSHIP_ENDED") {
    return "Coaching has ended.";
  }
  if (row.lastErrorCode === FINISHED_WORKOUT_CODE) {
    return "This workout was already finished, so nothing was changed.";
  }
  return row.lastError?.trim() || "Couldn't send.";
}

const MEASUREMENT_LABELS: Record<string, string> = {
  body_weight_kg: "Weight",
  waist_cm: "Waist",
  chest_cm: "Chest",
  hips_cm: "Hips",
};

function measurementTitle(body: Record<string, unknown>): string {
  const inner = (body.body ?? {}) as Record<string, unknown>;
  const label =
    typeof inner.type === "string" ? MEASUREMENT_LABELS[inner.type] : undefined;
  const value = typeof inner.value === "number" ? inner.value : null;
  const unit = text(inner.unit);
  if (!label || value === null) return "Measurement";
  return unit ? `${label} ${value} ${unit}` : `${label} ${value}`;
}

const MEAL_ACTIONS: Record<string, string> = {
  "meal.confirm": "eaten as planned",
  "meal.skip": "skipped",
  "meal.deviate": "something different",
};

const SET_OPERATION = "workout.complete_set";

/** Worst state first: a refusal outranks sending, sending outranks waiting. */
function worst(a: SheetItemState, b: SheetItemState): SheetItemState {
  const rank: Record<SheetItemState, number> = { waiting: 0, sending: 1, failed: 2 };
  return rank[b] > rank[a] ? b : a;
}

/**
 * The outbox as the sheet shows it (TR-19a). A workout is one line however
 * many of its sets are queued; everything else is one line per log. Sent rows
 * are not in the outbox, so they are not here.
 */
export function sheetItems(
  rows: readonly SheetRow[],
  options: {
    names?: SheetNames;
    coachFirstName?: string;
    timeZone?: string;
  } = {},
): SheetItem[] {
  const names = options.names ?? NO_SHEET_NAMES;
  const coach = options.coachFirstName ?? "Your coach";
  const items = new Map<string, SheetItem & { sets: number; latest: string }>();

  for (const row of rows) {
    const state = rowState(row.status);
    if (!state) continue;
    // Settled, not refused (Z14-8): the sync status says so in its note.
    if (isSettledLateWrite(row)) continue;
    const body = payload(row);
    const isWorkout = row.operation.startsWith("workout.");
    const workoutId =
      text(body.executionId) ?? text(body.assignmentId) ?? row.recordId;
    const key = isWorkout ? `workout:${workoutId}` : row.mutationId;
    const reason = state === "failed" ? failureReason(row, coach) : null;
    const existing = items.get(key);
    if (existing) {
      existing.state = worst(existing.state, state);
      existing.reason = existing.reason ?? reason;
      existing.mutationIds.push(row.mutationId);
      if (row.operation === SET_OPERATION) existing.sets += 1;
      if (row.clientOccurredAt > existing.latest) {
        existing.latest = row.clientOccurredAt;
      }
      continue;
    }
    const kind: SheetItem["kind"] = isWorkout
      ? "workout"
      : row.operation.startsWith("meal.")
        ? "meal"
        : row.operation.startsWith("checkin.")
          ? "checkin"
          : "progress";
    const title =
      kind === "workout"
        ? (names.workout(workoutId) ??
          (text(body.assignmentId) ? names.workout(text(body.assignmentId)!) : null) ??
          text(body.workoutName) ??
          "Workout")
        : kind === "meal"
          ? (names.meal(text(body.assignmentId) ?? row.recordId) ?? mealName(body))
          : kind === "checkin"
            ? "Check-in"
            : measurementTitle(body);
    items.set(key, {
      key,
      kind,
      title,
      detail: row.operation,
      state,
      reason,
      conflict: isPlanChangeConflict(row),
      kept: row.keptAt !== null,
      mutationIds: [row.mutationId],
      sets: row.operation === SET_OPERATION ? 1 : 0,
      latest: row.clientOccurredAt,
    });
  }

  return [...items.values()].map(({ sets, latest, detail, ...item }) => {
    const when = formatClockTime(latest, options.timeZone);
    const area =
      item.kind === "meal"
        ? ["Diet", MEAL_ACTIONS[detail]]
        : item.kind === "workout"
          ? ["Workout"]
          : item.kind === "checkin"
            ? ["Check-in"]
            : ["Progress"];
    return {
      ...item,
      title:
        item.kind === "workout" && sets > 0
          ? `${item.title} · ${sets} ${sets === 1 ? "set" : "sets"}`
          : item.title,
      detail: [...area, when].filter(Boolean).join(" · "),
    };
  });
}

/** "3 items waiting to send" (TR-19a). Counts lines, not outbox rows. */
export function sheetTitle(items: readonly Pick<SheetItem, "state">[]): string {
  const open = items.filter((item) => item.state !== "failed").length;
  const failed = items.length - open;
  if (open > 0) {
    return `${open} ${open === 1 ? "item" : "items"} waiting to send`;
  }
  if (failed > 0) {
    return `${failed} ${failed === 1 ? "item" : "items"} couldn't be sent`;
  }
  return "All saved";
}

export const SHEET_WAITING_BODY =
  "They're saved on this phone and send on their own when you're online.";
export const SHEET_EMPTY_BODY = "Everything you logged has been sent.";
export const SHEET_FAILED_BODY =
  "These are still on this phone. Nothing else is waiting.";

/** "Last sent 4:41 pm"; null when nothing has been sent from this phone yet. */
export function lastSentLabel(
  iso: string | null,
  timeZone?: string,
): string | null {
  if (!iso) return null;
  const time = formatClockTime(iso, timeZone);
  return time ? `Last sent ${time}` : null;
}

/**
 * What "Try sending now" did, read from the outbox after the attempt. Null
 * when there is nothing to add to what the list already shows.
 */
export function sendOutcomeLine(outcome: {
  sent: number;
  status: { waiting: number; failed: number; waitingReason: string | null };
}): string | null {
  const { sent, status } = outcome;
  if (status.waiting === 0) {
    if (sent > 0) return status.failed > 0 ? "Sent what could be sent." : "Sent.";
    return null;
  }
  switch (status.waitingReason) {
    case "UNREACHABLE":
      return "Can't reach FitBud. Check your connection.";
    case "SERVER":
      return "FitBud didn't respond. We'll keep trying.";
    case "AUTH":
      // The API turned the whole request away (401/403): say that, no code.
      return "FitBud couldn't confirm it's you yet. We'll keep trying.";
    case "CLIENT":
      // The answer could not be read: a client/server disagreement, ours.
      return "Something went wrong on our side. We'll keep trying.";
    default:
      return "Not sent yet. We'll keep trying.";
  }
}

/** The pill in the top bar. Derived only from the outbox counts. */
export function pillFromStatus(status: {
  waiting: number;
  sending: number;
  failed: number;
}): { kind: IndicatorKind; label: string } | null {
  if (status.failed > 0) return { kind: "problem", label: "Couldn't send" };
  if (status.sending > 0) return { kind: "syncing", label: "Sending…" };
  if (status.waiting > 0) return { kind: "waiting", label: "Saved on phone" };
  return null;
}

/** TR-19b copy. `subject` is the lower-cased meal name, or null. */
export function conflictSheetCopy(input: {
  coachFirstName: string;
  kind: SheetItem["kind"];
  subject: string | null;
}): { title: string; body: string; keep: string; see: string } {
  const { coachFirstName: coach, kind } = input;
  const noun = kind === "workout" ? "workout" : kind === "meal" ? "meal" : "plan";
  const what = input.subject ? `your ${input.subject}` : `this ${noun}`;
  return {
    title: `${coach} changed this ${noun}`,
    // Departure from the mock ("Your log is kept and he'll see both"): the
    // server does not record a log against a replaced plan item, so the
    // coach does not see it. The log is kept on this phone only.
    body: `While you were offline, ${coach} updated ${what}. Your log is kept on this phone.`,
    keep: "Keep my log",
    see: `See ${coach}'s change`,
  };
}

// ---------------------------------------------------------------------------
// Late workout writes, settled (Z14-8, D-W14-12, D-W14-3)
// ---------------------------------------------------------------------------

/** The server's code for a write that arrived after the workout ended. */
export const FINISHED_WORKOUT_CODE = "WORKOUT_ALREADY_FINISHED";

/**
 * The late writes that are settled rather than refused: once the workout is
 * finished a late set, skip or start no longer matters (Z14-7). A finish with
 * a different session RPE is not here; that stays a real refusal.
 */
export const MOOT_WHEN_FINISHED: ReadonlySet<string> = new Set([
  "workout.complete_set",
  "workout.skip",
  "workout.start",
]);

/**
 * A refused row that is really settled: a late set, skip or start the server
 * turned away because the workout was finished (a verdict stored before
 * Z14-7 answered these `already_applied`). Nothing was written and nothing
 * is left to do, so it is never shown as "Couldn't send".
 */
export function isSettledLateWrite(row: {
  status: string;
  operation: string;
  lastErrorCode: string | null;
  lastError?: string | null;
}): boolean {
  if (row.status !== "rejected" && row.status !== "conflicted") return false;
  if (!MOOT_WHEN_FINISHED.has(row.operation)) return false;
  if (row.lastErrorCode === FINISHED_WORKOUT_CODE) return true;
  // Before Z14-7 the API refused the same late writes as INVALID_TRANSITION
  // with these static messages, which only a finished (or discarded) workout
  // produced. Rows refused then may still be on a phone.
  return (
    row.lastErrorCode === "INVALID_TRANSITION" &&
    row.lastError != null &&
    LEGACY_FINISHED_MESSAGES.has(row.lastError.trim())
  );
}

const LEGACY_FINISHED_MESSAGES: ReadonlySet<string> = new Set([
  "Sets can only be completed during an open workout.",
  "Workout already finished and cannot be skipped.",
]);

export type ResolvedNoteSource = "lock_screen" | "app";

/** One settled late write, or several of the same kind for one workout. */
export type ResolvedNote = {
  key: string;
  operation: string;
  source: ResolvedNoteSource;
  workoutName: string | null;
  count: number;
};

/**
 * What the sync status says about a settled late write. Friendly, static
 * text built from what the phone knows: never a code or a server message.
 */
export function resolvedNoteCopy(note: ResolvedNote): string {
  const workout = note.workoutName?.trim() || null;
  const ended = workout ? `${workout} ended` : "the workout ended";
  if (note.operation === "workout.complete_set") {
    const sets = note.count === 1 ? "1 set" : `${note.count} sets`;
    const they = note.count === 1 ? "it wasn't" : "they weren't";
    return note.source === "lock_screen"
      ? `${sets} logged on your lock screen arrived after ${ended}, so ${they} added.`
      : `${sets} arrived after ${ended}, so ${they} added.`;
  }
  if (note.operation === "workout.skip") {
    return `${workout ?? "This workout"} was already finished, so it wasn't skipped.`;
  }
  return `${workout ?? "This workout"} was already finished.`;
}

const MAX_RESOLVED_NOTES = 3;

/**
 * Settled late writes seen since the app started, newest first, so the sync
 * status can say what happened to them instead of a refusal. Shaped for
 * `useSyncExternalStore`: `lines()` returns the same array until a change.
 */
export function createResolvedNotes() {
  let notes: ResolvedNote[] = [];
  let lines: readonly string[] = [];
  const listeners = new Set<() => void>();
  function changed(next: ResolvedNote[]) {
    notes = next.slice(0, MAX_RESOLVED_NOTES);
    lines = notes.map(resolvedNoteCopy);
    for (const listener of [...listeners]) listener();
  }
  return {
    add(
      input: Omit<ResolvedNote, "key" | "count"> & {
        workoutKey: string;
        count?: number;
      },
    ) {
      const count = input.count ?? 1;
      if (count <= 0) return;
      const key = `${input.workoutKey}|${input.operation}|${input.source}`;
      const existing = notes.find((note) => note.key === key);
      const merged: ResolvedNote = {
        key,
        operation: input.operation,
        source: input.source,
        workoutName: input.workoutName ?? existing?.workoutName ?? null,
        count:
          input.operation === "workout.complete_set"
            ? (existing?.count ?? 0) + count
            : 1,
      };
      changed([merged, ...notes.filter((note) => note.key !== key)]);
    },
    list: () => notes,
    lines: () => lines,
    clear() {
      if (notes.length > 0) changed([]);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ResolvedNotesStore = ReturnType<typeof createResolvedNotes>;

export const resolvedSyncNotes: ResolvedNotesStore = createResolvedNotes();

/**
 * Records the settled late writes among a push's results for one action
 * (Z14-7 answers them `already_applied` with a `WORKOUT_ALREADY_FINISHED`
 * note). Returns how many it recorded.
 */
export function recordFinishedWorkoutNotes(
  results: readonly SyncMutationResult[],
  context: {
    operation: string;
    workoutKey: string;
    workoutName: string | null;
    source?: ResolvedNoteSource;
  },
  notes: ResolvedNotesStore = resolvedSyncNotes,
): number {
  let recorded = 0;
  for (const result of results) {
    if (result.status !== "already_applied") continue;
    if (result.note?.code !== FINISHED_WORKOUT_CODE) continue;
    recorded += 1;
  }
  if (recorded > 0) {
    notes.add({
      workoutKey: context.workoutKey,
      operation: context.operation,
      source: context.source ?? "app",
      workoutName: context.workoutName,
      count: recorded,
    });
  }
  return recorded;
}
