import { describe, expect, it } from "vitest";
import type { CoachingRelationship, MeResponse } from "@fitbud/contracts";
import {
  resolveAppRoute,
  selectInitialMobileRole,
} from "./resolveRoute.js";

const meTrainee: MeResponse = {
  userId: "11111111-1111-4111-8111-111111111111",
  firebaseUid: "trainee-1",
  accountState: "active",
  timezone: "UTC",
  permittedRoles: ["trainee"],
  selectedRole: "trainee",
  surface: "mobile",
  trainerProfileId: null,
  traineeProfileId: "22222222-2222-4222-8222-222222222222",
};

const meTrainerOnly: MeResponse = {
  ...meTrainee,
  permittedRoles: ["trainer"],
  selectedRole: "trainer",
  trainerProfileId: "33333333-3333-4333-8333-333333333333",
  traineeProfileId: null,
};

const meDual: MeResponse = {
  ...meTrainee,
  permittedRoles: ["trainer", "trainee"],
  selectedRole: null,
  trainerProfileId: "33333333-3333-4333-8333-333333333333",
  traineeProfileId: "22222222-2222-4222-8222-222222222222",
};

function relationship(
  status: CoachingRelationship["status"],
): CoachingRelationship {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    trainerUserId: "55555555-5555-4555-8555-555555555555",
    traineeUserId: meTrainee.userId,
    status,
    onboardingStatus:
      status === "onboarding_pending"
        ? "onboarding_pending"
        : status === "onboarding_submitted"
          ? "onboarding_submitted"
          : status === "coaching_ready"
            ? "coaching_ready"
            : "coaching_ready",
    invitationId: null,
    startedAt: "2026-09-26T00:00:00.000Z",
    endedAt: null,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

describe("resolveAppRoute", () => {
  it("sends signed-out users to auth", () => {
    expect(
      resolveAppRoute({
        accessToken: null,
        bootstrapping: false,
        me: null,
        selectedRole: null,
        needsAccountLink: false,
        relationships: null,
      }).name,
    ).toBe("auth");
  });

  it("routes unknown FitBud accounts to accept invite", () => {
    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: null,
        selectedRole: null,
        needsAccountLink: true,
        relationships: [],
      }).name,
    ).toBe("accept_invite");
  });

  it("routes trainer-only accounts to trainer shell", () => {
    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meTrainerOnly,
        selectedRole: "trainer",
        needsAccountLink: false,
        relationships: [],
      }).name,
    ).toBe("trainer_shell");
  });

  it("asks dual-role users to select a mode when none selected", () => {
    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meDual,
        selectedRole: null,
        needsAccountLink: false,
        relationships: [],
      }).name,
    ).toBe("role_select");
  });

  it("routes dual-role trainer selection to trainer shell", () => {
    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meDual,
        selectedRole: "trainer",
        needsAccountLink: false,
        relationships: [],
      }).name,
    ).toBe("trainer_shell");
  });

  it("routes onboarding states correctly for trainee", () => {
    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meTrainee,
        selectedRole: "trainee",
        needsAccountLink: false,
        relationships: [relationship("onboarding_pending")],
      }).name,
    ).toBe("intake");

    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meTrainee,
        selectedRole: "trainee",
        needsAccountLink: false,
        relationships: [relationship("onboarding_submitted")],
      }).name,
    ).toBe("waiting_review");

    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meTrainee,
        selectedRole: "trainee",
        needsAccountLink: false,
        relationships: [relationship("coaching_ready")],
      }).name,
    ).toBe("trainee_shell");
  });

  it("auto-selects the sole mobile role", () => {
    expect(selectInitialMobileRole(["trainee"])).toBe("trainee");
    expect(selectInitialMobileRole(["trainer"])).toBe("trainer");
    expect(selectInitialMobileRole(["trainer", "trainee"])).toBeNull();
  });
});
