import type { NotificationPreferences } from "@fitbud/contracts";

export type TrainerNotificationPrefs = NotificationPreferences["trainerCategories"];

export type TrainerNotificationKey = keyof TrainerNotificationPrefs;

export const TRAINER_NOTIFICATION_META: Array<{
  key: TrainerNotificationKey;
  label: string;
  description: string;
}> = [
  {
    key: "askCoach",
    label: "Client asked you on WhatsApp",
    description: "When a client opens WhatsApp from an item.",
  },
  {
    key: "checkinSubmitted",
    label: "Check-in submitted",
    description: "When a client submits a check-in for review.",
  },
  {
    key: "criticalDigest",
    label: "Critical items",
    description: "Send at most one summary per hour.",
  },
  {
    key: "intakeSubmitted",
    label: "Intake submitted",
    description: "When a client finishes onboarding intake.",
  },
  {
    key: "renewalsDue",
    label: "Renewals due",
    description: "Upcoming and overdue subscription renewals.",
  },
  {
    key: "mealTimesChanged",
    label: "Client changed meal times",
    description: "Batched into the 15-minute digest.",
  },
  {
    key: "morningSummary",
    label: "Morning summary at 8:00 am",
    description: "A daily overview of who needs you.",
  },
];

export function defaultTrainerCategories(): TrainerNotificationPrefs {
  return {
    askCoach: true,
    checkinSubmitted: true,
    criticalDigest: true,
    intakeSubmitted: true,
    renewalsDue: true,
    mealTimesChanged: true,
    morningSummary: false,
  };
}
