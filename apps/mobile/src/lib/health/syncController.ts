/**
 * App-wide state for the steps sync: one run at a time, once per app start
 * and again each time the app comes to the foreground, with a status the
 * Steps chip and the setup screens (Z9-10) can subscribe to.
 */
import { reportError } from "../reportError";
import { secureGet, secureSet } from "../secureSessionStore";
import { loadHealthStepsProvider } from "./provider";
import {
  runStepsSync,
  type PermissionMemory,
  type StepsDayWriter,
  type StepsSyncResult,
} from "./stepsSync";
import type { HealthStepsProvider } from "./types";

export type StepsSyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | StepsSyncResult;

export type StepsSyncSnapshot = {
  status: StepsSyncStatus;
  /** When the last successful sync read the totals; changes after each save, so the chip can refetch. */
  syncedAt: string | null;
};

export type StepsSyncRequest = {
  api: StepsDayWriter;
  timeZone: string;
  trigger: "auto" | "user";
};

export type StepsSyncDeps = {
  loadProvider: () => Promise<HealthStepsProvider>;
  memory: PermissionMemory;
  now: () => Date;
};

const ASKED_KEY = "fitbud.steps.permissionAsked";

/** Keychain / keystore flag; native only (the web provider never asks). */
export const securePermissionMemory: PermissionMemory = {
  async wasAsked() {
    try {
      return (await secureGet(ASKED_KEY)) === "1";
    } catch {
      // An unreadable flag counts as "asked": never prompt twice by accident.
      return true;
    }
  },
  async markAsked() {
    await secureSet(ASKED_KEY, "1");
  },
};

export function createStepsSyncController(deps: StepsSyncDeps) {
  let snapshot: StepsSyncSnapshot = { status: { kind: "idle" }, syncedAt: null };
  const listeners = new Set<() => void>();
  let inFlight: Promise<StepsSyncResult> | null = null;
  let launchSyncStarted = false;

  function set(next: StepsSyncSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  /** Runs a sync; a call while one is running joins it instead of starting another. */
  function sync(request: StepsSyncRequest): Promise<StepsSyncResult> {
    if (inFlight) return inFlight;
    set({ ...snapshot, status: { kind: "syncing" } });
    inFlight = (async () => {
      try {
        let provider: HealthStepsProvider;
        try {
          provider = await deps.loadProvider();
        } catch (err) {
          reportError("steps.sync.load", err);
          const failed: StepsSyncResult = { kind: "error", code: "STEPS-NATIVE" };
          set({ status: failed, syncedAt: snapshot.syncedAt });
          return failed;
        }
        const result = await runStepsSync({
          provider,
          api: request.api,
          timeZone: request.timeZone,
          now: deps.now,
          memory: deps.memory,
          trigger: request.trigger,
        });
        set({
          status: result,
          syncedAt: result.kind === "synced" ? result.syncedAt : snapshot.syncedAt,
        });
        return result;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    sync,
    /** The app-start sync: runs on the first call of this launch only. */
    syncOnLaunch(request: Omit<StepsSyncRequest, "trigger">): Promise<StepsSyncResult> | null {
      if (launchSyncStarted) return null;
      launchSyncStarted = true;
      return sync({ ...request, trigger: "auto" });
    },
    getSnapshot: (): StepsSyncSnapshot => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type StepsSyncController = ReturnType<typeof createStepsSyncController>;

/** True when an AppState change brings the app to the foreground. */
export function cameToForeground(previous: string | null | undefined, next: string): boolean {
  return next === "active" && previous !== "active";
}

/** The app's one controller. */
export const stepsSyncController = createStepsSyncController({
  loadProvider: loadHealthStepsProvider,
  memory: securePermissionMemory,
  now: () => new Date(),
});
