import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { PushGroupId } from "./copy";

/**
 * Android channel id per push group (D-W14-13, Z14-6). Every group but the
 * daily summary moved to a `_v2` id created at IMPORTANCE_HIGH, because Android
 * never raises an existing channel's importance. Must equal the server table
 * (`EXPO_ANDROID_CHANNEL_IDS` in apps/api/src/lib/expo-push.ts, Z14-4).
 */
export const ANDROID_CHANNEL_ID_BY_GROUP: Readonly<Record<PushGroupId, string>> = {
  workout: "workout_v2",
  meal: "meal_v2",
  checkin: "checkin_v2",
  summary: "summary",
  coach: "coach_v2",
  plan: "plan_v2",
  account: "account_v2",
  clients: "clients_v2",
};

/** Channel ids from before Z14-6 (IMPORTANCE_DEFAULT); deleted once. `workout_live` is never touched. */
export const LEGACY_ANDROID_CHANNEL_IDS = [
  "workout",
  "meal",
  "checkin",
  "coach",
  "plan",
  "account",
  "clients",
] as const;

/** TR-16 §4 — Android notification channels mapped to reminder categories. */
const CHANNELS: Array<{
  id: PushGroupId;
  name: string;
  description: string;
}> = [
  {
    id: "workout",
    name: "Workout reminders",
    description: "When a workout isn't logged after your usual time.",
  },
  {
    id: "meal",
    name: "Meal reminders",
    description: "About 40 minutes after meal time if not logged.",
  },
  {
    id: "checkin",
    name: "Check-in reminders",
    description: "When your weekly check-in is due.",
  },
  {
    id: "summary",
    name: "Daily summary",
    description: "Evening note if something is still unlogged.",
  },
  {
    id: "coach",
    name: "Coach updates",
    description: "Nudges, notes, and check-in reviews from your coach.",
  },
  {
    id: "plan",
    name: "Plan updates",
    description: "When your coach publishes plan changes.",
  },
  {
    id: "account",
    name: "Coaching updates",
    description: "Renewals, paused reminders and changes to your coaching.",
  },
  {
    id: "clients",
    name: "Client updates",
    description: "Check-ins, intakes and questions from your clients.",
  },
];

/** Every push group has a channel (copy.ts `PUSH_GROUPS`; checked in copy.test.ts). */
export const ANDROID_CHANNEL_IDS: readonly string[] = CHANNELS.map(
  (c) => ANDROID_CHANNEL_ID_BY_GROUP[c.id],
);

let channelsReady = false;

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || channelsReady) return;
  for (const legacyId of LEGACY_ANDROID_CHANNEL_IDS) {
    // Deleting a channel that does not exist is a no-op on Android.
    await Notifications.deleteNotificationChannelAsync(legacyId);
  }
  for (const channel of CHANNELS) {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID_BY_GROUP[channel.id], {
      name: channel.name,
      description: channel.description,
      importance:
        channel.id === "summary"
          ? Notifications.AndroidImportance.DEFAULT
          : Notifications.AndroidImportance.HIGH,
    });
  }
  channelsReady = true;
}
