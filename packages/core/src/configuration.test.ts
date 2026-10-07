import { describe, expect, it } from "vitest";
import {
  canActivateConfiguration,
  canCreateConfigurationVersion,
  canEditCoachingConfiguration,
  canMarkConfigurationConfigured,
  canSaveConfigurationDraft,
  hasPrimaryGoal,
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

  it("requires a non-empty primary goal", () => {
    expect(hasPrimaryGoal("Build strength")).toBe(true);
    expect(hasPrimaryGoal("  ")).toBe(false);
    expect(hasPrimaryGoal(null)).toBe(false);
  });
});
