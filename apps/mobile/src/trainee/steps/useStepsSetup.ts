import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import {
  loadHealthStepsProvider,
  stepsSyncController,
  useStepsSyncStatus,
  type HealthStepsProvider,
  type StepsSyncResult,
} from "../../lib/health";
import { securePermissionMemory } from "../../lib/health/syncController";
import { reportError } from "../../lib/reportError";

export type StepsSetupPlatform = "ios" | "android" | "other";

export type StepsSetupState =
  | { kind: "checking" }
  /** Web, Expo Go, a build without the native module, or a device with no health store. */
  | { kind: "unavailable" }
  /** Android: Health Connect is missing or needs an update. */
  | { kind: "install"; reason: "not_installed" | "needs_update" }
  /** Available, not connected yet. `denied` is true only when the platform says so (Android). */
  | { kind: "connect"; denied: boolean }
  | { kind: "connected" };

export type StepsSetupModel = {
  platform: StepsSetupPlatform;
  state: StepsSetupState;
  busy: boolean;
  /** Short fixed text after a connect attempt that did not finish; null otherwise. */
  notice: string | null;
  install: () => void;
  connect: () => void;
};

export const HEALTH_CONNECT_STORE_URL = "market://details?id=com.google.android.apps.healthdata";
export const HEALTH_CONNECT_WEB_URL =
  "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata";

export function platformOf(provider: HealthStepsProvider | null): StepsSetupPlatform {
  if (!provider) return "other";
  return provider.source === "apple_health" ? "ios" : "android";
}

/** Fixed text for a user-triggered connect that ended without steps. Never repeats API or native error text. */
export function noticeForResult(result: StepsSyncResult, platform: StepsSetupPlatform): string | null {
  switch (result.kind) {
    case "synced":
    case "unavailable":
    case "not_installed":
    case "needs_update":
      return null;
    case "denied":
      return "Steps access is off. Allow it in Health Connect, then try again.";
    case "not_requested":
      return "Steps access was not given. Try again when you're ready.";
    case "no_data":
      return platform === "ios"
        ? "No steps yet. If they don't appear, turn on Steps for FitBud in Settings, Health, Data Access."
        : "No steps yet. They'll show once your phone has counted some.";
    case "ended":
      return "Your coaching has ended, so steps can't be saved.";
    case "error":
      return `Something went wrong (${result.code}). Try again.`;
  }
}

/**
 * State of the steps setup screens (Z9-10). All native access goes through
 * `lib/health` (Z9-9); the sync controller does the asking and saving.
 */
export function useStepsSetup(): StepsSetupModel {
  const { api, me } = useAuth();
  const timeZone = me?.timezone ?? "UTC";
  useStepsSyncStatus();
  const [provider, setProvider] = useState<HealthStepsProvider | null>(null);
  const [state, setState] = useState<StepsSetupState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadHealthStepsProvider();
      const availability = await loaded.availability();
      let next: StepsSetupState;
      if (availability === "unavailable") {
        next = { kind: "unavailable" };
      } else if (availability !== "available") {
        next = { kind: "install", reason: availability };
      } else {
        const asked = await securePermissionMemory.wasAsked();
        const permission = await loaded.permission(asked);
        const syncedNow = stepsSyncController.getSnapshot().status.kind === "synced";
        // HealthKit hides read denial, so "connected" there means steps arrived.
        next =
          permission === "granted" || (permission === "requested" && syncedNow)
            ? { kind: "connected" }
            : { kind: "connect", denied: permission === "denied" };
      }
      if (!mounted.current) return;
      setProvider(loaded);
      setState(next);
    } catch (err) {
      reportError("steps.setup.check", err);
      if (!mounted.current) return;
      setNotice("Something went wrong (STEPS-NATIVE). Try again.");
      setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    // After the Play Store or Health Connect, the app returns to the foreground.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const install = useCallback(() => {
    void (async () => {
      try {
        await Linking.openURL(HEALTH_CONNECT_STORE_URL);
      } catch {
        // No market handler: fall back to the store's web page.
        try {
          await Linking.openURL(HEALTH_CONNECT_WEB_URL);
        } catch (err) {
          reportError("steps.setup.install", err);
          if (mounted.current) setNotice("Couldn't open Play Store (STEPS-LINK). Try again.");
        }
      }
    })();
  }, []);

  const connect = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    void (async () => {
      const result = await stepsSyncController.sync({ api, timeZone, trigger: "user" });
      if (!mounted.current) return;
      setNotice(noticeForResult(result, platformOf(provider)));
      setBusy(false);
      await refresh();
    })();
  }, [api, timeZone, busy, provider, refresh]);

  return { platform: platformOf(provider), state, busy, notice, install, connect };
}
