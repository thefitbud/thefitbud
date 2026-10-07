import { describe, expect, it } from "vitest";
import {
  canActivateConfiguration,
  canEditCoachingConfiguration,
  canMarkConfigurationConfigured,
  canSaveConfigurationDraft,
  hasPrimaryGoal,
} from "./configuration.js";

describe("coaching configuration transitions", () => {
  it("gates editing to coaching-ready relationships", () => {
    expect(canEditCoachingConfiguration("coaching_ready")).toBe(true);
    expect(canEditCoachingConfiguration("onboarding_submitted")).toBe(false);
    expect(canEditCoachingConfiguration("onboarding_pending")).toBe(false);
  });

  it("allows draft saves until activation", () => {
    expect(canSaveConfigurationDraft(null)).toBe(true);
    expect(canSaveConfigurationDraft("draft")).toBe(true);
    expect(canSaveConfigurationDraft("configured")).toBe(true);
    expect(canSaveConfigurationDraft("active")).toBe(false);
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
