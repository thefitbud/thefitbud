import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../auth/AuthProvider";
import { reportError } from "../lib/reportError";
import { onPushPermissionGranted, registerDeviceTokenForPush } from "./register";

export type PushPermissionState = "unknown" | "granted" | "denied" | "undetermined";

/**
 * Live OS notification permission (Z14-6): read on mount and every time the app
 * comes back to the foreground, so the "Notifications are off" card goes away
 * as soon as the person returns from phone Settings. `onGranted` runs when the
 * state turns from not-granted to granted (never on the first read).
 */
export function usePushPermission(onGranted?: () => void): {
  state: PushPermissionState;
  granted: boolean;
  denied: boolean;
  refresh: () => Promise<PushPermissionState>;
} {
  const [state, setState] = useState<PushPermissionState>("unknown");
  const previous = useRef<PushPermissionState>("unknown");
  const onGrantedRef = useRef(onGranted);
  onGrantedRef.current = onGranted;

  const refresh = useCallback(async (): Promise<PushPermissionState> => {
    if (Platform.OS === "web") return "granted";
    try {
      const settings = await Notifications.getPermissionsAsync();
      const next: PushPermissionState = settings.granted
        ? "granted"
        : settings.status === "denied"
          ? "denied"
          : "undetermined";
      const before = previous.current;
      previous.current = next;
      setState(next);
      if (next === "granted" && before !== "granted" && before !== "unknown") {
        onGrantedRef.current?.();
      }
      return next;
    } catch (err) {
      reportError("push-permission-read", err);
      return previous.current;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { state, granted: state === "granted", denied: state === "denied", refresh };
}

/**
 * Mounted once under AuthProvider: when permission turns on (back from phone
 * Settings, or a screen's own prompt) the push token is registered at once.
 * Registration is idempotent server-side, so a repeat is harmless.
 */
export function PushPermissionRegistrar(): null {
  const { api, me } = useAuth();
  const signedIn = me != null;
  const register = useCallback(() => {
    if (!signedIn) return;
    void registerDeviceTokenForPush(api).catch((err: unknown) =>
      reportError("push-register-on-grant", err),
    );
  }, [api, signedIn]);
  const { refresh } = usePushPermission(register);
  useEffect(
    () =>
      // The transition seen by refresh() runs `register` once.
      onPushPermissionGranted(() => {
        void refresh();
      }),
    [refresh],
  );
  return null;
}
