const STORAGE_KEY = "fitbud.trainer.notificationCategories.v1";

export type TrainerNotificationKey =
  | "askCoach"
  | "checkinSubmitted"
  | "criticalDigest"
  | "intakeSubmitted"
  | "renewalsDue"
  | "mealTimesChanged"
  | "morningSummary";

export type TrainerNotificationPrefs = Record<TrainerNotificationKey, boolean>;

export const TRAINER_NOTIFICATION_META: Array<{
  key: TrainerNotificationKey;
  label: string;
  description: string;
  defaultOn: boolean;
}> = [
  {
    key: "askCoach",
    label: "Client asked you on WhatsApp",
    description: "When a client opens WhatsApp from an item.",
    defaultOn: true,
  },
  {
    key: "checkinSubmitted",
    label: "Check-in submitted",
    description: "When a client submits a check-in for review.",
    defaultOn: true,
  },
  {
    key: "criticalDigest",
    label: "Critical items",
    description: "Send at most one summary per hour.",
    defaultOn: true,
  },
  {
    key: "intakeSubmitted",
    label: "Intake submitted",
    description: "When a client finishes onboarding intake.",
    defaultOn: true,
  },
  {
    key: "renewalsDue",
    label: "Renewals due",
    description: "Upcoming and overdue subscription renewals.",
    defaultOn: true,
  },
  {
    key: "mealTimesChanged",
    label: "Client changed meal times",
    description: "Batched into the 15-minute digest.",
    defaultOn: true,
  },
  {
    key: "morningSummary",
    label: "Morning summary at 8:00 am",
    description: "A daily overview of who needs you.",
    defaultOn: false,
  },
];

export function defaultTrainerNotificationPrefs(): TrainerNotificationPrefs {
  return TRAINER_NOTIFICATION_META.reduce(
    (acc, item) => {
      acc[item.key] = item.defaultOn;
      return acc;
    },
    {} as TrainerNotificationPrefs,
  );
}

export function loadTrainerNotificationPrefs(): TrainerNotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTrainerNotificationPrefs();
    const parsed = JSON.parse(raw) as Partial<TrainerNotificationPrefs>;
    return { ...defaultTrainerNotificationPrefs(), ...parsed };
  } catch {
    return defaultTrainerNotificationPrefs();
  }
}

export function saveTrainerNotificationPrefs(prefs: TrainerNotificationPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
