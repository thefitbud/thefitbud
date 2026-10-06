import { describe, expect, it } from "vitest";
import {
  canMarkCoachingReady,
  canSaveOnboardingDraft,
  canSubmitOnboarding,
  deriveClientOnboardingStatus,
  latestOnboardingFormVersion,
  missingRequiredOnboardingFields,
  onboardingAnswerErrors,
  parseOnboardingFormFields,
  resolveOnboardingForm,
} from "./onboarding.js";

const emptyFacts = {
  invitationPending: false,
  hasSubmittedResponse: false,
  hasCoachingReadyReview: false,
  hasActiveConfiguration: false,
};

describe("derived client status", () => {
  it("walks invitation through an active configuration", () => {
    expect(
      deriveClientOnboardingStatus({
        ...emptyFacts,
        relationshipStatus: null,
        invitationPending: true,
      }),
    ).toBe("invited");
    expect(
      deriveClientOnboardingStatus({
        ...emptyFacts,
        relationshipStatus: "active",
      }),
    ).toBe("onboarding_pending");
    expect(
      deriveClientOnboardingStatus({
        ...emptyFacts,
        relationshipStatus: "active",
        hasSubmittedResponse: true,
      }),
    ).toBe("onboarding_submitted");
    expect(
      deriveClientOnboardingStatus({
        ...emptyFacts,
        relationshipStatus: "active",
        hasSubmittedResponse: true,
        hasCoachingReadyReview: true,
      }),
    ).toBe("coaching_ready");
    expect(
      deriveClientOnboardingStatus({
        ...emptyFacts,
        relationshipStatus: "active",
        hasSubmittedResponse: true,
        hasCoachingReadyReview: true,
        hasActiveConfiguration: true,
      }),
    ).toBe("active");
    expect(
      deriveClientOnboardingStatus({
        ...emptyFacts,
        relationshipStatus: "ended",
        hasSubmittedResponse: true,
        hasCoachingReadyReview: true,
        hasActiveConfiguration: true,
      }),
    ).toBe("ended");
  });

  it("gates draft, submit, and coaching-ready actions on derived status", () => {
    expect(canSaveOnboardingDraft("onboarding_pending")).toBe(true);
    expect(canSaveOnboardingDraft("onboarding_submitted")).toBe(false);
    expect(canSubmitOnboarding("onboarding_pending")).toBe(true);
    expect(canSubmitOnboarding("coaching_ready")).toBe(false);
    expect(canMarkCoachingReady("onboarding_submitted")).toBe(true);
    expect(canMarkCoachingReady("onboarding_pending")).toBe(false);
    expect(canMarkCoachingReady("active")).toBe(false);
  });

  it("reports missing required onboarding fields", () => {
    const fields = [
      { id: "goals", required: true },
      { id: "schedule", required: true },
      { id: "preferences", required: false },
    ];
    expect(
      missingRequiredOnboardingFields(fields, {
        goals: "Build strength",
        schedule: "  ",
      }),
    ).toEqual(["schedule"]);
    expect(
      missingRequiredOnboardingFields(fields, {
        goals: "Build strength",
        schedule: "Evenings",
      }),
    ).toEqual([]);
  });

  it("prefers the highest trainer form and otherwise the highest global form", () => {
    const forms = [
      { id: "g1", scope: "global" as const, trainerUserId: null, version: 1 },
      { id: "g2", scope: "global" as const, trainerUserId: null, version: 3 },
      {
        id: "t1",
        scope: "trainer" as const,
        trainerUserId: "trainer-a",
        version: 1,
      },
      {
        id: "t2",
        scope: "trainer" as const,
        trainerUserId: "trainer-a",
        version: 2,
      },
      {
        id: "other",
        scope: "trainer" as const,
        trainerUserId: "trainer-b",
        version: 9,
      },
    ];
    expect(resolveOnboardingForm(forms, "trainer-a")?.id).toBe("t2");
    expect(resolveOnboardingForm(forms, "trainer-c")?.id).toBe("g2");
    expect(
      latestOnboardingFormVersion(
        [
          { id: "v1", templateId: "template-a", version: 1 },
          { id: "v2", templateId: "template-a", version: 2 },
          { id: "other", templateId: "template-b", version: 9 },
        ],
        "template-a",
      )?.id,
    ).toBe("v2");
    expect(latestOnboardingFormVersion([], "template-a")).toBeNull();
    expect(
      parseOnboardingFormFields([
        {
          id: "experience",
          type: "select",
          label: "Experience",
          required: true,
          options: ["New", "Returning"],
        },
      ]).ok,
    ).toBe(true);
    expect(
      parseOnboardingFormFields([
        { id: "experience", type: "select", label: "Experience", required: true },
      ]).ok,
    ).toBe(false);
    expect(
      onboardingAnswerErrors(
        [
          {
            id: "experience",
            type: "select",
            required: true,
            options: ["New", "Returning"],
          },
        ],
        { experience: "Expert" },
      ),
    ).toEqual({ missingFieldIds: [], invalidFieldIds: ["experience"] });
    expect(
      resolveOnboardingForm(
        forms.filter((form) => form.trainerUserId !== "trainer-a"),
        "trainer-a",
      )?.id,
    ).toBe("g2");
  });
});
