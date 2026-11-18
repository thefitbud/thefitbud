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
 */
import { Vibration } from "react-native";

/** Two short buzzes when a rest reaches its end (W-05b). */
export const REST_END_PATTERN = [0, 220, 120, 220];

export function restEndHaptic(): void {
  try {
    Vibration.vibrate(REST_END_PATTERN);
  } catch {
    // No vibrator, or the platform refused: nothing to do.
  }
}
