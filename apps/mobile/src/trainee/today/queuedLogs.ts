import { useEffect, useState } from "react";
import { reportError } from "../../lib/reportError";
import { useSyncEngine } from "../../sync/SyncProvider";

/** The slice of an outbox row Today reads. */
type QueuedRow = { status: string; payloadJson: string; recordId?: string };

export type QueuedLogs = {
  /** Logs saved on the phone and not yet accepted by the server. */
  count: number;
  /** Meal assignments that have one of those logs waiting. */
  mealAssignmentIds: ReadonlySet<string>;
};

export const NO_QUEUED_LOGS: QueuedLogs = {
  count: 0,
  mealAssignmentIds: new Set(),
};

/**
 * Pure: counts rows still waiting to reach the server (`pending` and
 * `in_flight`). Rejected and conflicted rows are not "waiting"; they are
 * problems the sync status screen already explains.
 */
export function summariseQueuedLogs(rows: readonly QueuedRow[]): QueuedLogs {
  const waiting = rows.filter(
    (row) => row.status === "pending" || row.status === "in_flight",
  );
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

/**
 * Reads the device outbox on mount and every second while `active`. `null`
 * means the read failed, which is not the same as an empty queue: the caller
 * must not claim "nothing is waiting".
 */
export function useQueuedLogs(active: boolean): QueuedLogs | null {
  const sync = useSyncEngine();
  const [queued, setQueued] = useState<QueuedLogs | null>(NO_QUEUED_LOGS);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function read() {
      try {
        const rows = await sync.store.listOutbox();
        if (!cancelled) setQueued(summariseQueuedLogs(rows));
      } catch (err: unknown) {
        reportError("TodayTab.listOutbox", err);
        if (!cancelled) setQueued(null);
      }
    }
    void read();
    const timer = setInterval(() => {
      void read();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, sync]);

  return queued;
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
