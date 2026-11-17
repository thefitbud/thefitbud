import { useEffect, useState } from "react";
import { reportError } from "../lib/reportError";
import { summariseOutbox, type OutboxEntry, type SyncStatus } from "./engine";
import { useReachability, useSyncEngine } from "./SyncProvider";

export type SyncView = {
  /** The outbox, oldest first. Sent rows are not in it. */
  rows: OutboxEntry[];
  /** Counts of `rows` by state, plus "Last sent". */
  status: SyncStatus;
};

const EMPTY: SyncView = {
  rows: [],
  status: {
    waiting: 0,
    sending: 0,
    failed: 0,
    waitingReason: null,
    lastSentAt: null,
  },
};

/**
 * The outbox as it is right now (Z12-41). Re-read on every change the store
 * announces, so what a screen shows is always the outbox's real state: no
 * timer-driven guess, no flag left over from an earlier error.
 *
 * `null` means the outbox could not be read. That is not "nothing waiting",
 * and a caller must not say so.
 */
export function useSyncView(): SyncView | null {
  const sync = useSyncEngine();
  const [view, setView] = useState<SyncView | null>(EMPTY);

  useEffect(() => {
    let active = true;
    let reading = false;
    let again = false;
    async function read() {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      try {
        const [rows, meta] = await Promise.all([
          sync.store.listOutbox(),
          sync.store.getMeta(),
        ]);
        if (active) {
          setView({
            rows,
            status: summariseOutbox(rows, meta.lastSentAt ?? null),
          });
        }
      } catch (error) {
        reportError("sync.view.read", error);
        if (active) setView(null);
      } finally {
        reading = false;
        if (again && active) {
          again = false;
          void read();
        }
      }
    }
    void read();
    // The engines some screen tests pass in are partial stand-ins with no
    // change feed; for those, read once a second as the indicator used to.
    if (typeof sync.subscribe === "function") {
      const stop = sync.subscribe(() => {
        void read();
      });
      return () => {
        active = false;
        stop();
      };
    }
    const timer = setInterval(() => {
      void read();
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sync]);

  return view;
}

/**
 * Whether the API was reachable when last observed: `true`, `false`, or
 * `null` before anything was observed (and outside `SyncProvider`). Screens
 * use it for their offline wording; it never changes what the outbox says.
 */
export function useApiReachable(): boolean | null {
  const reachability = useReachability();
  const [reachable, setReachable] = useState<boolean | null>(
    () => reachability?.isReachable() ?? null,
  );
  useEffect(() => {
    if (!reachability) return;
    setReachable(reachability.isReachable());
    return reachability.subscribe(setReachable);
  }, [reachability]);
  return reachable;
}
