import type { NotificationType } from "@fitbud/contracts";
import { formatPersonName } from "./format.js";

/**
 * Trainer inbox and push share this wording.
 * Titles name the client. They never include a raw enum token.
 */
const TRAINER_CLIENT_NOTIFICATION_TYPES = [
  "trainer_ask_coach",
  "trainer_checkin_submitted",
  "trainer_intake_submitted",
  "trainer_renewal",
  "trainer_meal_times_changed",
] as const;

export type TrainerClientNotificationType =
  (typeof TRAINER_CLIENT_NOTIFICATION_TYPES)[number];

export function isTrainerClientNotificationType(
  type: NotificationType,
): type is TrainerClientNotificationType {
  return (TRAINER_CLIENT_NOTIFICATION_TYPES as readonly string[]).includes(
    type,
  );
}

/**
 * Display name safe to put in a sentence.
 * Drops empty values, the generic "Client" placeholder, and enum-like tokens.
 */
export function clientDisplayLabel(
  displayName: string | null | undefined,
): string | null {
  const formatted = formatPersonName(displayName);
  if (!formatted) return null;
  if (/_/.test(formatted)) return null;
  if (/^clients?$/i.test(formatted)) return null;
  if (/^your(\s|$)/i.test(formatted)) return null;
  return formatted;
}

export function trainerNotificationCopy(
  type: TrainerClientNotificationType,
  clientName?: string | null,
): { title: string; body: string } {
  const name = clientDisplayLabel(clientName);
  switch (type) {
    case "trainer_ask_coach":
      return {
        title: name ? `${name} asked on WhatsApp` : "Asked on WhatsApp",
        body: "Open the item they asked about.",
      };
    case "trainer_checkin_submitted":
      return {
        title: name ? `${name} sent their check-in` : "Check-in submitted",
        body: "Review when you're ready.",
      };
    case "trainer_intake_submitted":
      return {
        title: name ? `${name} finished their intake` : "Intake submitted",
        body: "Review their intake answers.",
      };
    case "trainer_renewal":
      return {
        title: name ? `${name}'s renewal is due` : "Renewal is due",
        body: "Follow up before the window closes.",
      };
    case "trainer_meal_times_changed":
      return {
        title: name ? `${name} changed meal times` : "Meal times changed",
        body: "Reminders will follow their new times.",
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
