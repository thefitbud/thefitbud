import type {
  CoachingConfiguration,
  ConfigurationSectionId,
} from "@fitbud/contracts";
import { missingConfigurationSections } from "@fitbud/core";

/** The Coaching setup form state the section badges are derived from. */
export type ConfigureFormValues = {
  goalShort: string;
  goalDescription: string;
  sessionsPerWeek: number;
  completionWindowHours: number;
  mealsPerDay: number;
  confirmationWindowHours: number;
  photoRequirement: CoachingConfiguration["nutrition"]["photoRequirement"];
  cadence: CoachingConfiguration["checkin"]["cadence"];
  dueWindowHours: number;
  formVersionId: string | null;
  requireBodyWeight: boolean;
  requireProgressPhotos: boolean;
  requireSessionRpe: boolean;
};

/** Frames 148/149: a section reads Done, To do or Editing. */
export type SectionStatus = "done" | "todo" | "editing";

function sectionDirty(
  section: ConfigurationSectionId,
  form: ConfigureFormValues,
  saved: CoachingConfiguration,
): boolean {
  switch (section) {
    case "goal":
      return (
        form.goalShort.trim() !== (saved.goalShort ?? "").trim() ||
        form.goalDescription.trim() !== (saved.goalDescription ?? "").trim()
      );
    case "expectations":
      return (
        form.sessionsPerWeek !== saved.workout.sessionsPerWeek ||
        form.completionWindowHours !== saved.workout.completionWindowHours ||
        form.mealsPerDay !== saved.nutrition.mealsPerDay ||
        form.confirmationWindowHours !==
          saved.nutrition.confirmationWindowHours ||
        form.photoRequirement !== saved.nutrition.photoRequirement ||
        form.cadence !== saved.checkin.cadence
      );
    // The cadence is edited in the Expectations table (frame 149), so only
    // Expectations reads Editing when it changes; Check-ins owns the window
    // and the form.
    case "checkins":
      return (
        form.dueWindowHours !== saved.checkin.dueWindowHours ||
        // On an active version the form is assigned at once, outside the version.
        (saved.status !== "active" &&
          (form.formVersionId ?? null) !== (saved.checkin.formVersionId ?? null))
      );
    case "tracking":
      return (
        form.requireBodyWeight !== saved.tracking.requireBodyWeight ||
        form.requireProgressPhotos !== saved.tracking.requireProgressPhotos ||
        form.requireSessionRpe !== saved.tracking.requireSessionRpe
      );
  }
}

/**
 * Badge per section, from the saved configuration and the unsaved form only:
 * Editing when the form differs from what is saved; To do when nothing is
 * saved yet or the section is still missing (core `missingConfigurationSections`,
 * the same rule Activate enforces); otherwise Done.
 */
export function configureSectionStatus(
  section: ConfigurationSectionId,
  form: ConfigureFormValues,
  saved: CoachingConfiguration | null,
): SectionStatus {
  if (saved && sectionDirty(section, form, saved)) return "editing";
  if (!saved) {
    // Nothing saved yet: typing a goal is still editing, the rest is to do.
    return section === "goal" && form.goalShort.trim() ? "editing" : "todo";
  }
  const missing = missingConfigurationSections({
    goalShort: form.goalShort,
    workout: {
      sessionsPerWeek: form.sessionsPerWeek,
      completionWindowHours: form.completionWindowHours,
    },
    nutrition: {
      mealsPerDay: form.mealsPerDay,
      confirmationWindowHours: form.confirmationWindowHours,
      photoRequirement: form.photoRequirement,
    },
    checkin: {
      cadence: form.cadence,
      dueWindowHours: form.dueWindowHours,
      formVersionId: form.formVersionId,
    },
    tracking: {
      requireBodyWeight: form.requireBodyWeight,
      requireProgressPhotos: form.requireProgressPhotos,
      requireSessionRpe: form.requireSessionRpe,
    },
  });
  return missing.includes(section) ? "todo" : "done";
}

export const SECTION_STATUS_LABEL: Record<SectionStatus, string> = {
  done: "Done",
  todo: "To do",
  editing: "Editing",
};
