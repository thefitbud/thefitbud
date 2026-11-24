import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MealAssignment,
  MealCompliance,
  MealComplianceLoggedItem,
  MealDeviationKind,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { useSyncView } from "../../sync/useSyncStatus";
import { invalidateRelationshipDayData } from "../dataCache";

/** The slice of an outbox row Today reads. */
type QueuedRow = { status: string; payloadJson: string; recordId?: string };

export type QueuedLogs = {
  /** Logs saved on the phone and not yet accepted by the server. */
  count: number;
  /** Meal assignments that have one of those logs waiting. */
  mealAssignmentIds: ReadonlySet<string>;
};

function isActive(status: string): boolean {
  return status === "pending" || status === "in_flight";
}

/**
 * Pure: counts rows still waiting to reach the server (`pending` and
 * `in_flight`). Rejected and conflicted rows are not "waiting"; they are
 * problems the sync status screen already explains.
 */
export function summariseQueuedLogs(rows: readonly QueuedRow[]): QueuedLogs {
  const waiting = rows.filter((row) => isActive(row.status));
  const mealAssignmentIds = new Set<string>();
  // One logical action, not one row: a workout queues a row per set, so rows
  // are grouped by the record they act on (a meal, a workout execution).
  const actions = new Set<string>();
  for (const row of waiting) {
    let key = row.recordId ?? row.payloadJson;
    try {
      const body = JSON.parse(row.payloadJson) as {
        assignmentId?: unknown;
        executionId?: unknown;
      };
      if (typeof body.assignmentId === "string") {
        mealAssignmentIds.add(body.assignmentId);
      }
      if (typeof body.executionId === "string") key = body.executionId;
      else if (typeof body.assignmentId === "string") key = body.assignmentId;
    } catch {
      // A payload that is not JSON still counts as a waiting log; it just
      // cannot be tied to a meal row.
    }
    actions.add(key);
  }
  return { count: actions.size, mealAssignmentIds };
}

/** "1 log waiting to send" / "3 logs waiting to send" (frame 104). */
export function queuedLogsLabel(count: number): string {
  return `${count} ${count === 1 ? "log" : "logs"} waiting to send`;
}

/* -------------------------------------------------------------------------- */
/* Outbox overlay (Z14-2, D-W14-6)                                             */
/* -------------------------------------------------------------------------- */

/** The slice of an outbox row the overlay reads. */
export type OverlayRow = {
  mutationId: string;
  operation: string;
  recordId: string;
  status: string;
  payloadJson: string;
  attempts?: number;
  createdAt?: string;
};

/** What a queued (or just sent) log says about one meal. */
export type MealOverlayEntry = {
  status: Extract<MealAssignment["status"], "confirmed" | "skipped" | "modified">;
  deviationKind: MealDeviationKind | null;
  notes: string | null;
  /** Foods the log names, as far as the phone knows their figures. */
  loggedItems: MealComplianceLoggedItem[];
  /** The server has not answered this log yet (pending or in flight). */
  unsent: boolean;
  /**
   * The phone has evidence the log is held up: it was tried and not
   * answered, or the phone is offline. Drives the "Not sent yet" wording, so
   * a log that sends a moment later never flashes it.
   */
  waiting: boolean;
  mutationId: string;
};

export type WorkoutOverlayEntry = {
  status: Extract<WorkoutAssignment["status"], "in_progress" | "completed" | "skipped">;
  unsent: boolean;
  mutationId: string;
};

export type OutboxOverlay = {
  meals: ReadonlyMap<string, MealOverlayEntry>;
  /** By workout assignment id (start, skip). */
  workoutsByAssignment: ReadonlyMap<string, WorkoutOverlayEntry>;
  /** By workout execution id (sets, finish). */
  workoutsByExecution: ReadonlyMap<string, WorkoutOverlayEntry>;
};

export const EMPTY_OVERLAY: OutboxOverlay = {
  meals: new Map(),
  workoutsByAssignment: new Map(),
  workoutsByExecution: new Map(),
};

type ParsedPayload = {
  assignmentId?: unknown;
  executionId?: unknown;
  body?: {
    deviationKind?: unknown;
    notes?: unknown;
    items?: unknown;
  };
};

function parsePayload(json: string): ParsedPayload | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ParsedPayload) : null;
  } catch {
    return null;
  }
}

/**
 * The foods a `meal.deviate` names, with the figures the phone has: a custom
 * food or an ate-out entry carries its own kcal; a library food carries only
 * its id, so its figures are unknown (the rings then read "≥" and "kcal left"
 * is not invented, as for any food without data).
 */
function loggedItemsFromBody(body: ParsedPayload["body"]): MealComplianceLoggedItem[] {
  const items = Array.isArray(body?.items) ? body.items : [];
  const out: MealComplianceLoggedItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as {
      quantity?: unknown;
      customFood?: {
        name?: unknown;
        kcal?: unknown;
        protein?: unknown;
        carbs?: unknown;
        fat?: unknown;
        servingLabel?: unknown;
      };
    };
    const quantity = typeof item.quantity === "number" ? item.quantity : 1;
    const custom = item.customFood;
    if (custom && typeof custom.name === "string") {
      const num = (value: unknown) =>
        typeof value === "number" ? value * quantity : null;
      out.push({
        name: custom.name,
        quantity,
        servingLabel: typeof custom.servingLabel === "string" ? custom.servingLabel : null,
        energyKcal: num(custom.kcal),
        proteinG: num(custom.protein),
        carbsG: num(custom.carbs),
        fatG: num(custom.fat),
        custom: true,
      });
      continue;
    }
    out.push({
      name: "Food",
      quantity,
      energyKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    });
  }
  return out;
}

const DEVIATION_KINDS: readonly string[] = [
  "portion_adjustment",
  "substitute",
  "restaurant",
  "repeat_recent",
  "manual",
  "other",
  "logged_foods",
];

/**
 * Pure: what the outbox says the day looks like once the server has the
 * phone's logs. `rows` are the outbox, oldest first; `sent` are rows the
 * server accepted since the day was last read (applied only until the
 * server's copy shows them, see `overlayMeals`). A refused row is not
 * applied: the server said no, and the sync status says why.
 */
export function buildOutboxOverlay(
  rows: readonly OverlayRow[],
  options: { offline?: boolean; sent?: readonly OverlayRow[] } = {},
): OutboxOverlay {
  const meals = new Map<string, MealOverlayEntry>();
  const byAssignment = new Map<string, WorkoutOverlayEntry>();
  const byExecution = new Map<string, WorkoutOverlayEntry>();
  const ordered = [
    ...(options.sent ?? []).map((row) => ({ row, unsent: false })),
    ...rows.filter((row) => isActive(row.status)).map((row) => ({ row, unsent: true })),
  ].sort((a, b) => (a.row.createdAt ?? "").localeCompare(b.row.createdAt ?? ""));
  for (const { row, unsent } of ordered) {
    const payload = parsePayload(row.payloadJson);
    const waiting =
      unsent &&
      (options.offline === true ||
        (row.status === "pending" && (row.attempts ?? 0) > 0) ||
        (row.status === "in_flight" && (row.attempts ?? 0) > 1));
    const assignmentId =
      typeof payload?.assignmentId === "string" ? payload.assignmentId : row.recordId;
    switch (row.operation) {
      case "meal.confirm":
      case "meal.skip":
      case "meal.deviate": {
        const deviation = payload?.body?.deviationKind;
        meals.set(assignmentId, {
          status:
            row.operation === "meal.confirm"
              ? "confirmed"
              : row.operation === "meal.skip"
                ? "skipped"
                : "modified",
          deviationKind:
            row.operation === "meal.deviate" &&
            typeof deviation === "string" &&
            DEVIATION_KINDS.includes(deviation)
              ? (deviation as MealDeviationKind)
              : null,
          notes: typeof payload?.body?.notes === "string" ? payload.body.notes : null,
          loggedItems:
            row.operation === "meal.deviate" ? loggedItemsFromBody(payload?.body) : [],
          unsent,
          waiting,
          mutationId: row.mutationId,
        });
        break;
      }
      case "workout.start":
        byAssignment.set(assignmentId, {
          status: "in_progress",
          unsent,
          mutationId: row.mutationId,
        });
        break;
      case "workout.skip":
        byAssignment.set(assignmentId, {
          status: "skipped",
          unsent,
          mutationId: row.mutationId,
        });
        break;
      case "workout.complete": {
        const executionId =
          typeof payload?.executionId === "string" ? payload.executionId : row.recordId;
        byExecution.set(executionId, {
          status: "completed",
          unsent,
          mutationId: row.mutationId,
        });
        break;
      }
      case "workout.complete_set": {
        const executionId =
          typeof payload?.executionId === "string" ? payload.executionId : row.recordId;
        // A set never undoes a finish queued before it.
        if (byExecution.get(executionId)?.status !== "completed") {
          byExecution.set(executionId, {
            status: "in_progress",
            unsent,
            mutationId: row.mutationId,
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return { meals, workoutsByAssignment: byAssignment, workoutsByExecution: byExecution };
}

function unloggedStatus(status: MealAssignment["status"]): boolean {
  return status === "pending" || status === "overdue";
}

function overlayCompliance(
  meal: MealAssignment,
  entry: MealOverlayEntry,
): MealCompliance | null {
  if (entry.status !== "modified") return meal.compliance;
  const known = entry.loggedItems.every((item) => item.energyKcal != null);
  const sum = (pick: (item: MealComplianceLoggedItem) => number | null | undefined) => {
    let total = 0;
    for (const item of entry.loggedItems) {
      const value = pick(item);
      if (value == null) return null;
      total += value;
    }
    return total;
  };
  const now = new Date().toISOString();
  const base = meal.compliance;
  return {
    id: base?.id ?? `local-${entry.mutationId}`,
    assignmentId: meal.id,
    coachingRelationshipId: meal.coachingRelationshipId,
    planVersionId: meal.planVersionId,
    traineeUserId: base?.traineeUserId ?? meal.coachingRelationshipId,
    outcome: "modified",
    recordVersion: base?.recordVersion ?? 0,
    loggedAt: base?.loggedAt ?? now,
    deviationKind: entry.deviationKind,
    notes: entry.notes,
    photoRequired: meal.photoRequired,
    photoIntent: base?.photoIntent ?? null,
    mediaAssetId: base?.mediaAssetId ?? null,
    loggedItems: entry.loggedItems,
    // No totals when one food has no figure: "unknown", never a guess.
    ...(known && entry.loggedItems.length > 0
      ? {
          loggedTotals: {
            energyKcal: sum((item) => item.energyKcal),
            proteinG: sum((item) => item.proteinG),
            carbsG: sum((item) => item.carbsG),
            fatG: sum((item) => item.fatG),
          },
        }
      : {}),
    loggedByRole: "trainee",
    lastEditedByRole: base?.lastEditedByRole ?? null,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Pure: the cached day's meals with the phone's logs applied, so meal
 * status, rings, "kcal left" and "N of M logged" all describe the same
 * moment as "N logs waiting to send" (the inconsistent home, diagnosis #1).
 *
 * - An unsent log always applies: the server's copy predates it.
 * - A log the server has accepted applies only while the server's copy still
 *   shows the meal unlogged (the refresh that brings it back is running);
 *   once the server's copy has it, the server's copy is shown.
 */
export function overlayMeals<T extends MealAssignment>(
  meals: readonly T[],
  overlay: OutboxOverlay,
): T[] {
  if (overlay.meals.size === 0) return meals as T[];
  return meals.map((meal) => {
    const entry = overlay.meals.get(meal.id);
    if (!entry) return meal;
    if (!entry.unsent && !unloggedStatus(meal.status)) return meal;
    if (entry.unsent && meal.status === entry.status && entry.status !== "modified") {
      return meal;
    }
    return {
      ...meal,
      status: entry.status,
      compliance: overlayCompliance(meal, entry),
    };
  });
}

function workoutDone(status: WorkoutAssignment["status"]): boolean {
  return status === "completed" || status === "modified" || status === "skipped";
}

/** Pure: the day's workout with the phone's queued start, finish or skip. */
export function overlayWorkout(
  workout: WorkoutAssignment | null,
  overlay: OutboxOverlay,
): WorkoutAssignment | null {
  if (!workout) return workout;
  const byExecution = workout.execution
    ? overlay.workoutsByExecution.get(workout.execution.id)
    : undefined;
  const byAssignment = overlay.workoutsByAssignment.get(workout.id);
  // A finish or skip beats a start; an execution row beats an assignment row
  // for the same moment.
  const entry =
    [byExecution, byAssignment]
      .filter((candidate): candidate is WorkoutOverlayEntry => candidate != null)
      .sort((a, b) => rank(b.status) - rank(a.status))[0] ?? null;
  if (!entry) return workout;
  if (!entry.unsent && workoutDone(workout.status)) return workout;
  if (workoutDone(workout.status) && entry.status === "in_progress") return workout;
  if (workout.status === entry.status) return workout;
  const executionStatus =
    entry.status === "completed"
      ? ("completed" as const)
      : entry.status === "skipped"
        ? ("skipped" as const)
        : ("started" as const);
  return {
    ...workout,
    status: entry.status,
    execution: workout.execution
      ? {
          ...workout.execution,
          status: executionStatus,
          completedAt:
            entry.status === "completed"
              ? (workout.execution.completedAt ?? null)
              : workout.execution.completedAt,
        }
      : workout.execution,
  };
}

function rank(status: WorkoutOverlayEntry["status"]): number {
  return status === "in_progress" ? 0 : 1;
}

/** Sent rows are kept for the overlay at most this long (the refresh after a send). */
export const SENT_OVERLAY_MS = 2 * 60 * 1000;

export type OutboxOverlayState = {
  overlay: OutboxOverlay;
  /** Logs still waiting; null when the outbox could not be read. */
  queued: QueuedLogs | null;
};

/**
 * The outbox as an overlay for the trainee's day screens (Z14-2). Re-read on
 * every outbox change. When a log leaves the outbox because the server took
 * it, the relationship's day views are marked stale, so the screens fetch the
 * server's state behind the overlay; until that answer is in, the sent log
 * keeps the meal logged (no flicker back to "Due").
 */
export function useOutboxOverlay(input: {
  relationshipId: string;
  offline: boolean;
}): OutboxOverlayState {
  const { relationshipId, offline } = input;
  const view = useSyncView();
  const previous = useRef<Map<string, OverlayRow>>(new Map());
  const [sent, setSent] = useState<Array<{ row: OverlayRow; at: number }>>([]);
  const rows = view?.rows ?? null;

  useEffect(() => {
    if (!rows) return;
    const current = new Map<string, OverlayRow>();
    for (const row of rows) current.set(row.mutationId, row);
    const left: OverlayRow[] = [];
    for (const [id, row] of previous.current) {
      if (isActive(row.status) && !current.has(id)) left.push(row);
    }
    previous.current = current;
    if (left.length === 0) return;
    const at = Date.now();
    setSent((list) => [
      ...list.filter((item) => at - item.at < SENT_OVERLAY_MS),
      ...left.map((row) => ({ row, at })),
    ]);
    // The server has these logs now: read its state behind the overlay.
    invalidateRelationshipDayData(relationshipId);
  }, [rows, relationshipId]);

  return useMemo(() => {
    if (!rows) return { overlay: EMPTY_OVERLAY, queued: null };
    const now = Date.now();
    const recent = sent.filter((item) => now - item.at < SENT_OVERLAY_MS).map((item) => item.row);
    return {
      overlay: buildOutboxOverlay(rows, { offline, sent: recent }),
      queued: summariseQueuedLogs(rows),
    };
  }, [rows, sent, offline]);
}

function readOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * True while the device reports no network. On the web build the browser
 * fires `online` / `offline`; on native there is no such event here, and a
 * failed day load (`offlineHint` in TodayTab) covers that case.
 */
export function useDeviceOffline(): boolean {
  const [offline, setOffline] = useState(readOffline);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      return;
    }
    const update = () => setOffline(readOffline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline;
}
