import type { SyncEngine } from "./engine";
import type { Reachability } from "./reachability";

/**
 * When the outbox sends on its own (Z12-41). Nothing here decides what the
 * status is; it only decides when to try. Every trigger ends in the same
 * call, `engine.sendNow()`, which does nothing when no row is waiting.
 *
 * - start:      the app opened with rows left from the last launch;
 * - reconnect:  the API became reachable again;
 * - foreground: the app came back to the front;
 * - interval:   every 30 s while a row is waiting (and the app is in front);
 * - api:        any other API call just succeeded, so the API is reachable.
 */
export type SyncTriggerSource =
  | "start"
  | "reconnect"
  | "foreground"
  | "interval"
  | "api";

export const SYNC_INTERVAL_MS = 30_000;
/** Closest two automatic attempts may be, whatever asks for them. */
export const SYNC_MIN_GAP_MS = 2_000;

export type SyncTriggerDeps = {
  engine: Pick<
    SyncEngine,
    "sendNow" | "getStatus" | "subscribe" | "recoverAfterRestart"
  >;
  reachability: Reachability;
  appState: {
    isActive: () => boolean;
    subscribe: (listener: (active: boolean) => void) => () => void;
  };
  /** Fires after any successful API call other than sync's own. */
  onApiSuccess: (listener: () => void) => () => void;
  /** Fires when an API call could not connect. */
  onApiUnreachable?: (listener: () => void) => () => void;
  intervalMs?: number;
  minGapMs?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /** Test hook: told about every attempt that reached the engine. */
  onAttempt?: (source: SyncTriggerSource) => void;
};

export function startSyncTriggers(deps: SyncTriggerDeps): () => void {
  const intervalMs = deps.intervalMs ?? SYNC_INTERVAL_MS;
  const minGapMs = deps.minGapMs ?? SYNC_MIN_GAP_MS;
  const now = deps.now ?? (() => Date.now());
  const startInterval =
    deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const stopInterval =
    deps.clearInterval ??
    ((handle: unknown) =>
      clearInterval(handle as ReturnType<typeof setInterval>));

  let stopped = false;
  let active = deps.appState.isActive();
  let timer: unknown = null;
  let lastAttemptAt: number | null = null;
  let running = false;
  let queued: SyncTriggerSource | null = null;
  let deferred: ReturnType<typeof setTimeout> | null = null;

  async function attempt(source: SyncTriggerSource): Promise<void> {
    if (stopped) return;
    if (running) {
      // One attempt at a time; remember that something asked meanwhile.
      queued = source;
      return;
    }
    running = true;
    try {
      const before = await deps.engine.getStatus();
      if (stopped || before.waiting === 0) return;
      const sinceLast = lastAttemptAt === null ? null : now() - lastAttemptAt;
      // The triggers that can fire in bursts are spaced out: a screen loading
      // makes many successful calls at once, and one attempt covers them
      // all. A request inside the gap is not dropped; it runs when the gap
      // ends.
      if (
        (source === "api" || source === "reconnect") &&
        sinceLast !== null &&
        sinceLast < minGapMs
      ) {
        if (deferred === null) {
          deferred = setTimeout(() => {
            deferred = null;
            void attempt(source);
          }, minGapMs - sinceLast);
        }
        return;
      }
      lastAttemptAt = now();
      deps.onAttempt?.(source);
      const outcome = await deps.engine.sendNow();
      if (stopped) return;
      if (
        outcome.status.waiting > 0 &&
        outcome.status.waitingReason === "UNREACHABLE"
      ) {
        // Start probing, so the queue goes out as soon as the API answers.
        deps.reachability.report(false);
      } else if (outcome.sent > 0) {
        deps.reachability.report(true);
      }
    } finally {
      running = false;
      const next = queued;
      queued = null;
      if (next && !stopped) void attempt(next);
    }
  }

  /** The 30 s timer exists only while a row is waiting and the app is in front. */
  async function armInterval(): Promise<void> {
    if (stopped) return;
    let waiting = 0;
    try {
      waiting = (await deps.engine.getStatus()).waiting;
    } catch {
      // An unreadable outbox: leave the timer as it is.
      return;
    }
    if (stopped) return;
    const wanted = active && waiting > 0;
    if (wanted && timer === null) {
      timer = startInterval(() => {
        void attempt("interval");
      }, intervalMs);
    } else if (!wanted && timer !== null) {
      stopInterval(timer);
      timer = null;
    }
  }

  const unsubscribers = [
    deps.engine.subscribe(() => {
      void armInterval();
    }),
    deps.reachability.subscribe((reachable) => {
      if (reachable) void attempt("reconnect");
    }),
    deps.appState.subscribe((nextActive) => {
      active = nextActive;
      deps.reachability.setForeground(nextActive);
      void armInterval();
      if (nextActive) void attempt("foreground");
    }),
    deps.onApiSuccess(() => {
      deps.reachability.report(true);
      void attempt("api");
    }),
    deps.onApiUnreachable?.(() => {
      deps.reachability.report(false);
    }) ?? (() => undefined),
  ];

  deps.reachability.setForeground(active);
  void (async () => {
    try {
      // Rows left "sending" by a killed process are waiting, not in flight.
      await deps.engine.recoverAfterRestart();
    } catch {
      // The store reports its own read failures.
    }
    await armInterval();
    await attempt("start");
  })();

  return () => {
    stopped = true;
    if (deferred !== null) {
      clearTimeout(deferred);
      deferred = null;
    }
    if (timer !== null) {
      stopInterval(timer);
      timer = null;
    }
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
