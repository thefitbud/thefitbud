import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { PushGroupId } from "./copy";

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
export const ANDROID_CHANNEL_IDS: readonly PushGroupId[] = CHANNELS.map((c) => c.id);

let channelsReady = false;

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || channelsReady) return;
  for (const channel of CHANNELS) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      description: channel.description,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  channelsReady = true;
}
