/**
 * Active-workout haptics (Z12-57).
 *
 * Primary path: `expo-haptics` (notification / impact feedback). Falls back to
 * React Native `Vibration` when the native module is missing (web, tests, an
 * old build) so Z12-45's rest-end call site never fails the screen.
 *
 * Rest-end sound needs a native audio module (`expo-av`); that stays a
 * follow-up once a rest-end asset is chosen — felt, not heard, until then.
 *
 * Android: both expo-haptics and Vibration need `android.permission.VIBRATE`
 * (declared in app.config.js). The Vibration fallback still checks the
 * permission before calling, because a missing grant throws on the native
 * side where JS try/catch cannot see it.
 */
import * as Haptics from "expo-haptics";
import { PermissionsAndroid, Platform, Vibration } from "react-native";

/** Two short buzzes when a rest reaches its end (W-05b), Vibration fallback. */
export const REST_END_PATTERN = [0, 220, 120, 220];

const ANDROID_VIBRATE = "android.permission.VIBRATE";

function vibrate(pattern: number[]): void {
  try {
    Vibration.vibrate(pattern);
  } catch {
    // No vibrator, or the platform refused: nothing to do.
  }
}

function vibrateAndroidIfGranted(pattern: number[]): void {
  try {
    void PermissionsAndroid.check(
      ANDROID_VIBRATE as Parameters<typeof PermissionsAndroid.check>[0],
    )
      .then((granted) => {
        if (granted) vibrate(pattern);
      })
      .catch(() => undefined);
  } catch {
    // The permission could not be read: stay silent.
  }
}

function vibrationFallback(pattern: number[]): void {
  if (Platform.OS !== "android") {
    vibrate(pattern);
    return;
  }
  vibrateAndroidIfGranted(pattern);
}

function fire(
  run: () => Promise<unknown>,
  fallback: () => void,
): void {
  try {
    void run().catch(() => {
      fallback();
    });
  } catch {
    fallback();
  }
}

/** Two short pulses when a rest reaches its end (W-05b). */
export function restEndHaptic(): void {
  fire(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, () => vibrationFallback(REST_END_PATTERN));
}

/** Light confirmation when a set is logged. */
export function setLoggedHaptic(): void {
  fire(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    () => vibrationFallback([0, 40]),
  );
}

/** Stronger pulse for a personal-record moment (W-12). */
export function prMomentHaptic(): void {
  fire(
    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    () => vibrationFallback([0, 80, 60, 80]),
  );
}
