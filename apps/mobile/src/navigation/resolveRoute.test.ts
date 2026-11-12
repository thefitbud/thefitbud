import { describe, expect, it } from "vitest";
import type {
  CoachingRelationship,
  MeResponse,
  OnboardingStatus,
} from "@fitbud/contracts";
import {
  coachLinkSubject,
  coachViewSwitchPrompt,
  resolveAppRoute,
  roleForLinkKind,
  roleSwitchPrompt,
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

function relationship(onboardingStatus: OnboardingStatus): CoachingRelationship {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    trainerUserId: "55555555-5555-4555-8555-555555555555",
    traineeUserId: meTrainee.userId,
    status: onboardingStatus === "ended" ? "ended" : "active",
    onboardingStatus,
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

    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meTrainee,
        selectedRole: "trainee",
        needsAccountLink: false,
        relationships: [relationship("active")],
      }).name,
    ).toBe("trainee_shell");

    expect(
      resolveAppRoute({
        accessToken: "test.token",
        bootstrapping: false,
        me: meTrainee,
        selectedRole: "trainee",
        needsAccountLink: false,
        relationships: [relationship("ended")],
      }),
    ).toEqual({
      name: "trainee_shell",
      relationship: relationship("ended"),
    });
  });

  it("auto-selects the sole mobile role", () => {
    expect(selectInitialMobileRole(["trainee"])).toBe("trainee");
    expect(selectInitialMobileRole(["trainer"])).toBe("trainer");
    expect(selectInitialMobileRole(["trainer", "trainee"])).toBeNull();
  });
});

describe("roleSwitchPrompt (frame 61)", () => {
  it("offers coach view for a trainer link opened as a client", () => {
    expect(
      roleSwitchPrompt({
        selectedRole: "trainee",
        permittedRoles: ["trainer", "trainee"],
        linkKind: "exception",
      }),
    ).toEqual({ targetRole: "trainer" });
  });

  it("offers client view for a reactivation link opened as a coach", () => {
    expect(
      roleSwitchPrompt({
        selectedRole: "trainer",
        permittedRoles: ["trainer", "trainee"],
        linkKind: "reactivate",
      }),
    ).toEqual({ targetRole: "trainee" });
  });

  it("does not prompt for check-in or plan links (both roles open them)", () => {
    for (const selectedRole of ["trainer", "trainee"] as const) {
      for (const linkKind of ["checkin", "plan"]) {
        expect(
          roleSwitchPrompt({
            selectedRole,
            permittedRoles: ["trainer", "trainee"],
            linkKind,
          }),
        ).toBeNull();
      }
    }
  });

  it("offers client view for a trainee link opened as a coach", () => {
    expect(
      roleSwitchPrompt({
        selectedRole: "trainer",
        permittedRoles: ["trainer", "trainee"],
        linkKind: "workout",
      }),
    ).toEqual({ targetRole: "trainee" });
  });

  it("does not prompt when the link fits the selected role", () => {
    expect(
      roleSwitchPrompt({
        selectedRole: "trainer",
        permittedRoles: ["trainer", "trainee"],
        linkKind: "exception",
      }),
    ).toBeNull();
  });

  it("does not prompt a single-role account (nothing to switch to)", () => {
    expect(
      roleSwitchPrompt({
        selectedRole: "trainee",
        permittedRoles: ["trainee"],
        linkKind: "exception",
      }),
    ).toBeNull();
  });

  it("does not prompt for an unknown kind or before a role is selected", () => {
    expect(roleForLinkKind("nonsense")).toBeNull();
    expect(
      roleSwitchPrompt({
        selectedRole: null,
        permittedRoles: ["trainer", "trainee"],
        linkKind: "exception",
      }),
    ).toBeNull();
  });
});

describe("roleSelectRequested (trainer More, Switch role, Z11-14)", () => {
  const base = {
    accessToken: "test.token",
    bootstrapping: false,
    needsAccountLink: false,
    relationships: [relationship("coaching_ready")],
  };

  it("shows role select over the trainer shell for a dual-role account", () => {
    expect(
      resolveAppRoute({ ...base, me: meDual, selectedRole: "trainer", roleSelectRequested: true }).name,
    ).toBe("role_select");
    expect(
      resolveAppRoute({ ...base, me: meDual, selectedRole: "trainer", roleSelectRequested: false }).name,
    ).toBe("trainer_shell");
  });

  it("is ignored for a single-role account", () => {
    expect(
      resolveAppRoute({ ...base, me: meTrainerOnly, selectedRole: "trainer", roleSelectRequested: true }).name,
    ).toBe("trainer_shell");
  });

  it("never beats loading or a signed-out state", () => {
    expect(
      resolveAppRoute({ ...base, bootstrapping: true, me: meDual, selectedRole: "trainer", roleSelectRequested: true }).name,
    ).toBe("loading");
    expect(
      resolveAppRoute({ ...base, accessToken: null, me: meDual, selectedRole: "trainer", roleSelectRequested: true }).name,
    ).toBe("auth");
  });
});

describe("coachViewSwitchPrompt (frame 61, Z11-14)", () => {
  const dual = ["trainer", "trainee"] as const;

  it("prompts for every coach link opened in trainee mode", () => {
    for (const linkKind of ["exception", "ask", "client"]) {
      expect(
        coachViewSwitchPrompt({ selectedRole: "trainee", permittedRoles: dual, linkKind }),
      ).toEqual({ targetRole: "trainer" });
    }
  });

  it("never prompts for a trainee link in trainer mode (no client-view frame)", () => {
    for (const linkKind of ["meal", "workout", "today", "progress", "note", "reactivate"]) {
      expect(
        coachViewSwitchPrompt({ selectedRole: "trainer", permittedRoles: dual, linkKind }),
      ).toBeNull();
    }
  });

  it("never prompts for a link both roles open, or a trainee-only account", () => {
    expect(
      coachViewSwitchPrompt({ selectedRole: "trainee", permittedRoles: dual, linkKind: "checkin" }),
    ).toBeNull();
    expect(
      coachViewSwitchPrompt({ selectedRole: "trainee", permittedRoles: ["trainee"], linkKind: "exception" }),
    ).toBeNull();
  });

  it("names what the link opens without a client name", () => {
    expect(coachLinkSubject("exception")).toBe("a client's exception");
    expect(coachLinkSubject("ask")).toBe("a client's question");
    expect(coachLinkSubject("client")).toBe("a client's profile");
  });
});
