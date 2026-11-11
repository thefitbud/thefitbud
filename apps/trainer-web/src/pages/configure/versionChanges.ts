import type {
  CoachingConfiguration,
  ConfigurationSectionId,
} from "@fitbud/contracts";
import { addDaysToLocalDate, formatCivilDate, labelFor } from "@fitbud/core";
import { civilDateIn } from "./ConfigureToolbar";
import type { ConfigureFormValues } from "./sectionStatus";

/** One row of the DS3 "What changes" list: the saved value and the new one. */
export type VersionChange = {
  key: string;
  section: ConfigurationSectionId;
  label: string;
  /** Null when the old value is not worth repeating (the private detailed goal). */
  from: string | null;
  to: string;
};

const required = (value: boolean) => (value ? "Required" : "Not required");

/**
 * The changes Save as vN+1 would make to the active version, field by field,
 * in the order the sections appear. The check-in form is left out: on an
 * active version it is assigned at once, outside the version (D-W8-5), and the
 * steps target saves on change (Z8-18).
 */
export function versionChanges(
  saved: CoachingConfiguration,
  form: ConfigureFormValues,
): VersionChange[] {
  const changes: VersionChange[] = [];
  const add = (
    key: string,
    section: ConfigurationSectionId,
    label: string,
    from: string | null,
    to: string,
  ) => {
    changes.push({ key, section, label, from, to });
  };

  const savedGoal = (saved.goalShort ?? "").trim();
  const goal = form.goalShort.trim();
  if (goal !== savedGoal) {
    add("goalShort", "goal", "Goal", savedGoal || "Not set", goal || "Not set");
  }
  if (form.goalDescription.trim() !== (saved.goalDescription ?? "").trim()) {
    add(
      "goalDescription",
      "goal",
      "Detailed goal",
      null,
      form.goalDescription.trim() ? "Updated" : "Removed",
    );
  }
  if (form.sessionsPerWeek !== saved.workout.sessionsPerWeek) {
    add(
      "sessionsPerWeek",
      "expectations",
      "Workouts",
      `${saved.workout.sessionsPerWeek} a week`,
      `${form.sessionsPerWeek} a week`,
    );
  }
  if (form.completionWindowHours !== saved.workout.completionWindowHours) {
    add(
      "completionWindowHours",
      "expectations",
      "Workout log window",
      `${saved.workout.completionWindowHours} h`,
      `${form.completionWindowHours} h`,
    );
  }
  if (form.mealsPerDay !== saved.nutrition.mealsPerDay) {
    add(
      "mealsPerDay",
      "expectations",
      "Meals",
      `${saved.nutrition.mealsPerDay} a day`,
      `${form.mealsPerDay} a day`,
    );
  }
  if (form.confirmationWindowHours !== saved.nutrition.confirmationWindowHours) {
    add(
      "confirmationWindowHours",
      "expectations",
      "Meal log window",
      `${saved.nutrition.confirmationWindowHours} h`,
      `${form.confirmationWindowHours} h`,
    );
  }
  if (form.photoRequirement !== saved.nutrition.photoRequirement) {
    add(
      "photoRequirement",
      "expectations",
      "Meal photos",
      labelFor("meal_photo_requirement", saved.nutrition.photoRequirement),
      labelFor("meal_photo_requirement", form.photoRequirement),
    );
  }
  if (form.cadence !== saved.checkin.cadence) {
    add(
      "cadence",
      "expectations",
      "Check-ins",
      labelFor("checkin_cadence", saved.checkin.cadence),
      labelFor("checkin_cadence", form.cadence),
    );
  }
  if (form.dueWindowHours !== saved.checkin.dueWindowHours) {
    add(
      "dueWindowHours",
      "checkins",
      "Check-in window",
      `${saved.checkin.dueWindowHours} h`,
      `${form.dueWindowHours} h`,
    );
  }
  if (form.requireBodyWeight !== saved.tracking.requireBodyWeight) {
    add(
      "requireBodyWeight",
      "tracking",
      "Body weight",
      required(saved.tracking.requireBodyWeight),
      required(form.requireBodyWeight),
    );
  }
  if (form.requireProgressPhotos !== saved.tracking.requireProgressPhotos) {
    add(
      "requireProgressPhotos",
      "tracking",
      "Progress photos",
      required(saved.tracking.requireProgressPhotos),
      required(form.requireProgressPhotos),
    );
  }
  if (form.requireSessionRpe !== saved.tracking.requireSessionRpe) {
    add(
      "requireSessionRpe",
      "tracking",
      "Session RPE",
      required(saved.tracking.requireSessionRpe),
      required(form.requireSessionRpe),
    );
  }
  return changes;
}

/**
 * "Wed 21 Oct" for today (offset 0) or tomorrow (offset 1) in the trainee's
 * timezone: the day the API starts a first activation (today) and the day a
 * vN+1's new targets apply from (tomorrow, D12b). Null rather than ISO.
 */
export function traineeDayLabel(
  timeZone: string | null | undefined,
  offsetDays: number,
  now: Date = new Date(),
): string | null {
  const today = civilDateIn(now.toISOString(), timeZone);
  if (!today) return null;
  const day = offsetDays ? addDaysToLocalDate(today, offsetDays) : today;
  const label = formatCivilDate(day, { now });
  return label && !/^\d{4}-\d{2}-\d{2}/.test(label) ? label : null;
}

export const SECTION_TITLES: Record<ConfigurationSectionId, string> = {
  goal: "Goal",
  expectations: "Expectations",
  checkins: "Check-ins",
  tracking: "Tracking",
};
