/**
 * Can the phone reach the FitBud API right now? (Z12-41)
 *
 * This is the one seam between sync and the network. What matters to the
 * outbox is reaching the API, not "having a connection": mobile data off with
 * Wi-Fi to the API is reachable, and Wi-Fi with no route to the API is not.
 * So the default implementation asks the API itself (a `/health` probe) and
 * listens to what real requests report.
 *
 * Z12-57 switch-over: build a `Reachability` on NetInfo's events (call
 * `report(false)` on a lost connection and `check()` on a regained one, so
 * the probe still has the last word) and pass it to `SyncProvider` through
 * `setReachabilityFactory`. Nothing else in sync changes.
 */
export type Reachability = {
  /** `null` until something has been observed. */
  isReachable(): boolean | null;
  /** Called when the answer changes. */
  subscribe(listener: (reachable: boolean) => void): () => void;
  /** Probe now and return the answer. */
  check(): Promise<boolean>;
  /** A real request just succeeded (`true`) or could not connect (`false`). */
  report(reachable: boolean): void;
  /** Probing runs only while the app is in the foreground. */
  setForeground(active: boolean): void;
  dispose(): void;
};

export type ProbeReachabilityDeps = {
  /** Resolves when the API answered; rejects when it could not be reached. */
  probe: () => Promise<unknown>;
  /** First wait between probes while unreachable; doubles up to `maxRetryMs`. */
  retryMs?: number;
  maxRetryMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Web only: the browser's `online` / `offline` events. */
  browser?: {
    addEventListener: (type: "online" | "offline", fn: () => void) => void;
    removeEventListener: (type: "online" | "offline", fn: () => void) => void;
  } | null;
};

export const PROBE_RETRY_MS = 5_000;
export const PROBE_MAX_RETRY_MS = 30_000;

export function createProbeReachability(
  deps: ProbeReachabilityDeps,
): Reachability {
  const firstRetryMs = deps.retryMs ?? PROBE_RETRY_MS;
  const maxRetryMs = deps.maxRetryMs ?? PROBE_MAX_RETRY_MS;
  const setTimer =
    deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    deps.clearTimer ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  const listeners = new Set<(reachable: boolean) => void>();
  let state: boolean | null = null;
  let foreground = true;
  let disposed = false;
  let timer: unknown = null;
  let nextRetryMs = firstRetryMs;
  let inFlight: Promise<boolean> | null = null;

  function cancel() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function schedule() {
    cancel();
    if (disposed || !foreground || state !== false) return;
    const wait = nextRetryMs;
    nextRetryMs = Math.min(nextRetryMs * 2, maxRetryMs);
    timer = setTimer(() => {
      timer = null;
      void check();
    }, wait);
  }

  function set(next: boolean) {
    const changed = state !== next;
    state = next;
    if (next) {
      nextRetryMs = firstRetryMs;
      cancel();
    } else if (timer === null) {
      schedule();
    }
    if (changed) for (const listener of [...listeners]) listener(next);
  }

  function check(): Promise<boolean> {
    if (disposed) return Promise.resolve(state === true);
    if (inFlight) return inFlight;
    const run = deps
      .probe()
      .then(
        () => true,
        () => false,
      )
      .then((reachable) => {
        inFlight = null;
        if (disposed) return reachable;
        // Still unreachable: `set` arms the next probe, further apart each time.
        set(reachable);
        return reachable;
      });
    inFlight = run;
    return run;
  }

  const onOnline = () => {
    void check();
  };
  const onOffline = () => {
    set(false);
  };
  deps.browser?.addEventListener("online", onOnline);
  deps.browser?.addEventListener("offline", onOffline);

  return {
    isReachable: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check,
    report(reachable) {
      if (disposed) return;
      if (reachable) {
        set(true);
        return;
      }
      // One failed request is a hint, not proof: let the probe decide.
      void check();
    },
    setForeground(active) {
      foreground = active;
      if (!active) {
        cancel();
        return;
      }
      if (state === false) {
        nextRetryMs = firstRetryMs;
        void check();
      }
    },
    dispose() {
      disposed = true;
      cancel();
      listeners.clear();
      deps.browser?.removeEventListener("online", onOnline);
      deps.browser?.removeEventListener("offline", onOffline);
    },
  };
}

export type ReachabilityFactory = (deps: {
  probe: () => Promise<unknown>;
}) => Reachability;

function browserEvents(): ProbeReachabilityDeps["browser"] {
  if (
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return null;
  }
  return {
    addEventListener: (type, fn) => window.addEventListener(type, fn),
    removeEventListener: (type, fn) => window.removeEventListener(type, fn),
  };
}

let factory: ReachabilityFactory = ({ probe }) =>
  createProbeReachability({ probe, browser: browserEvents() });

/** Z12-57: install the NetInfo-backed implementation before the app renders. */
export function setReachabilityFactory(next: ReachabilityFactory): void {
  factory = next;
}

export function createReachability(deps: {
  probe: () => Promise<unknown>;
}): Reachability {
  return factory(deps);
}
