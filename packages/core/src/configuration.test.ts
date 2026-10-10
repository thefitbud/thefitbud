import { describe, expect, it } from "vitest";
import {
  COACHING_CONFIGURATION_DEFAULTS,
  canActivateConfiguration,
  canCreateConfigurationVersion,
  canEditCoachingConfiguration,
  canMarkConfigurationConfigured,
  canSaveConfigurationDraft,
  hasGoalShort,
  resolveConfigurationDraftExpectations,
} from "./configuration.js";

describe("coaching configuration transitions", () => {
  it("gates editing to reviewed or active clients", () => {
    expect(canEditCoachingConfiguration("coaching_ready")).toBe(true);
    expect(canEditCoachingConfiguration("active")).toBe(true);
    expect(canEditCoachingConfiguration("onboarding_submitted")).toBe(false);
    expect(canEditCoachingConfiguration("onboarding_pending")).toBe(false);
    expect(canEditCoachingConfiguration("ended")).toBe(false);
  });

  it("opens a new version only when an active row has no open draft", () => {
    expect(
      canCreateConfigurationVersion({ hasActive: true, hasOpen: false }),
    ).toBe(true);
    expect(
      canCreateConfigurationVersion({ hasActive: true, hasOpen: true }),
    ).toBe(false);
    expect(
      canCreateConfigurationVersion({ hasActive: false, hasOpen: false }),
    ).toBe(false);
  });

  it("allows draft saves until activation", () => {
    expect(canSaveConfigurationDraft(null)).toBe(true);
    expect(canSaveConfigurationDraft("draft")).toBe(true);
    expect(canSaveConfigurationDraft("configured")).toBe(true);
    expect(canSaveConfigurationDraft("active")).toBe(false);
    expect(canSaveConfigurationDraft("superseded")).toBe(false);
  });

  it("gates configure and activate transitions", () => {
    expect(canMarkConfigurationConfigured("draft")).toBe(true);
    expect(canMarkConfigurationConfigured("configured")).toBe(false);
    expect(canActivateConfiguration("configured")).toBe(true);
    expect(canActivateConfiguration("draft")).toBe(false);
    expect(canActivateConfiguration("active")).toBe(false);
  });

  it("fills a new draft from the trainer-web defaults", () => {
    expect(COACHING_CONFIGURATION_DEFAULTS).toEqual({
      workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
      nutrition: {
        mealsPerDay: 3,
        confirmationWindowHours: 6,
        photoRequirement: "none",
      },
      checkin: { cadence: "weekly", dueWindowHours: 48 },
      tracking: {
        requireBodyWeight: false,
        requireProgressPhotos: false,
        requireSessionRpe: false,
      },
    });
    expect(resolveConfigurationDraftExpectations({})).toEqual(
      COACHING_CONFIGURATION_DEFAULTS,
    );
    expect(
      resolveConfigurationDraftExpectations({
        workout: { sessionsPerWeek: 4, completionWindowHours: 12 },
      }).workout.sessionsPerWeek,
    ).toBe(4);
    expect(
      resolveConfigurationDraftExpectations({
        existing: {
          ...COACHING_CONFIGURATION_DEFAULTS,
          workout: { sessionsPerWeek: 5, completionWindowHours: 24 },
        },
      }).workout.sessionsPerWeek,
    ).toBe(5);
  });

  it("requires a non-empty short goal", () => {
    expect(hasGoalShort("Build strength")).toBe(true);
    expect(hasGoalShort("  ")).toBe(false);
    expect(hasGoalShort(null)).toBe(false);
  });
});
