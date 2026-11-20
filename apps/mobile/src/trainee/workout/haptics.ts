/**
 * Haptics of the active workout (Z12-45).
 *
 * JS-only for now (D-W12-13): React Native's `Vibration`, which needs no
 * native module beyond the core. Z12-57 switches these call sites to
 * `expo-haptics` (a notification-type impact) and adds the rest-end sound;
 * there is no way to play a sound from JS without a native audio module, so
 * the rest end is felt, not heard, until then.
 *
 * Every call is best effort: a device without a vibrator, the web build and
 * the test environment must never fail the screen.
 *
 * Android: `Vibrator.vibrate` throws on the native side when the app's
 * manifest lacks `android.permission.VIBRATE`, where no JS try/catch can see
 * it. The permission is a normal one (granted at install when declared), so
 * the call is made only after the system confirms the app holds it. Z12-57
 * owns the manifest and should make sure it is declared.
 */
import { PermissionsAndroid, Platform, Vibration } from "react-native";

/** Two short buzzes when a rest reaches its end (W-05b). */
export const REST_END_PATTERN = [0, 220, 120, 220];

const ANDROID_VIBRATE = "android.permission.VIBRATE";

function vibrate(pattern: number[]): void {
  try {
    Vibration.vibrate(pattern);
  } catch {
    // No vibrator, or the platform refused: nothing to do.
  }
}

export function restEndHaptic(): void {
  if (Platform.OS !== "android") {
    vibrate(REST_END_PATTERN);
    return;
  }
  try {
    void PermissionsAndroid.check(
      ANDROID_VIBRATE as Parameters<typeof PermissionsAndroid.check>[0],
    )
      .then((granted) => {
        if (granted) vibrate(REST_END_PATTERN);
      })
      .catch(() => undefined);
  } catch {
    // The permission could not be read: stay silent.
  }
}
