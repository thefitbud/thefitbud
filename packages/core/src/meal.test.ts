import { describe, expect, it } from "vitest";
import {
  deriveMealAssignmentStatus,
  mealPhotoIntentSatisfied,
  resolveMealPhotoRequired,
} from "./index.js";

describe("meal domain", () => {
  it("derives overdue after the window without compliance", () => {
    expect(
      deriveMealAssignmentStatus({
        nowIso: "2026-09-27T12:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        complianceOutcome: null,
        loggedAt: null,
      }),
    ).toBe("overdue");
  });

  it("keeps pending inside the window", () => {
    expect(
      deriveMealAssignmentStatus({
        nowIso: "2026-09-26T10:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        complianceOutcome: null,
        loggedAt: null,
      }),
    ).toBe("pending");
  });

  it("maps in-window compliance to outcome", () => {
    expect(
      deriveMealAssignmentStatus({
        nowIso: "2026-09-27T12:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        complianceOutcome: "confirmed",
        loggedAt: "2026-09-26T12:00:00.000Z",
      }),
    ).toBe("confirmed");
    expect(
      deriveMealAssignmentStatus({
        nowIso: "2026-09-26T10:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        complianceOutcome: "modified",
        loggedAt: "2026-09-26T09:00:00.000Z",
      }),
    ).toBe("modified");
  });

  it("marks logged later when compliance is after the window", () => {
    expect(
      deriveMealAssignmentStatus({
        nowIso: "2026-09-28T12:00:00.000Z",
        windowEndsAt: "2026-09-26T18:30:00.000Z",
        complianceOutcome: "confirmed",
        loggedAt: "2026-09-27T08:00:00.000Z",
      }),
    ).toBe("logged_later");
  });

  it("resolves photo requirement from config and prescription", () => {
    expect(
      resolveMealPhotoRequired({
        photoRequirement: "none",
        prescriptionPhotoRequired: true,
      }),
    ).toBe(false);
    expect(
      resolveMealPhotoRequired({
        photoRequirement: "all_meals",
        prescriptionPhotoRequired: false,
      }),
    ).toBe(true);
    expect(
      resolveMealPhotoRequired({
        photoRequirement: "selected_meals",
        prescriptionPhotoRequired: true,
      }),
    ).toBe(true);
    expect(
      resolveMealPhotoRequired({
        photoRequirement: "selected_meals",
        prescriptionPhotoRequired: false,
      }),
    ).toBe(false);
  });

  it("requires a ready media asset id when photo is configured", () => {
    expect(
      mealPhotoIntentSatisfied({
        photoRequired: false,
        mediaAssetId: null,
      }),
    ).toBe(true);
    expect(
      mealPhotoIntentSatisfied({
        photoRequired: true,
        mediaAssetId: null,
      }),
    ).toBe(false);
    expect(
      mealPhotoIntentSatisfied({
        photoRequired: true,
        mediaAssetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toBe(true);
  });
});
