import { describe, expect, it } from "vitest";
import {
  canMarkCoachingReady,
  canSaveOnboardingDraft,
  canSubmitOnboarding,
  deriveClientOnboardingStatus,
  formatOnboardingAnswer,
  latestOnboardingFormVersion,
  missingRequiredOnboardingFields,
  onboardingAnswerErrors,
  parseOnboardingFormFields,
  resolveOnboardingForm,
} from "./onboarding.js";
import type { OnboardingFieldDefinition } from "@fitbud/contracts";

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
            label: "Experience",
            required: true,
            options: ["New", "Returning"],
          },
        ],
        { experience: "Expert" },
      ),
    ).toEqual({ missingFieldIds: [], invalidFieldIds: ["experience"] });
    expect(
      onboardingAnswerErrors(
        [
          {
            id: "experience",
            type: "select",
            label: "Experience",
            required: true,
            options: ["New", "Returning"],
          },
        ],
        { experience: "New" },
      ),
    ).toEqual({ missingFieldIds: [], invalidFieldIds: [] });
    expect(
      resolveOnboardingForm(
        forms.filter((form) => form.trainerUserId !== "trainer-a"),
        "trainer-a",
      )?.id,
    ).toBe("g2");
  });
});

const typedFields: OnboardingFieldDefinition[] = [
  { id: "goal", type: "short_text", label: "Goal", required: true, maxLength: 20 },
  { id: "history", type: "long_text", label: "History", required: false },
  {
    id: "focus",
    type: "single_choice",
    label: "Focus",
    required: true,
    options: [
      { id: "strength", label: "Strength" },
      { id: "endurance", label: "Endurance" },
    ],
  },
  {
    id: "equipment",
    type: "multiple_choice",
    label: "Equipment",
    required: true,
    options: [
      { id: "dumbbells", label: "Dumbbells" },
      { id: "bands", label: "Bands" },
    ],
  },
  { id: "sessions", type: "number", label: "Sessions", required: true },
  { id: "injuries", type: "yes_no", label: "Injuries", required: true },
];

describe("typed onboarding answers", () => {
  it("accepts the six field types and still accepts a pinned legacy select", () => {
    expect(parseOnboardingFormFields(typedFields).ok).toBe(true);
    expect(
      parseOnboardingFormFields([
        {
          id: "experience",
          type: "text",
          label: "Notes",
          required: false,
          maxLength: 100,
        },
      ]).ok,
    ).toBe(true);
    expect(
      parseOnboardingFormFields([
        {
          id: "focus",
          type: "single_choice",
          label: "Focus",
          required: true,
          options: [
            { id: "strength", label: "Strength" },
            { id: "strength", label: "Power" },
          ],
        },
      ]).ok,
    ).toBe(false);
  });

  it("checks each answer against the pinned field type", () => {
    expect(
      missingRequiredOnboardingFields(typedFields, {
        goal: "Strength",
        focus: "strength",
        equipment: ["dumbbells"],
        sessions: 0,
        injuries: false,
      }),
    ).toEqual([]);
    expect(
      onboardingAnswerErrors(typedFields, {
        goal: "This goal is longer than twenty",
        focus: "Strength",
        equipment: ["dumbbells", "dumbbells"],
        sessions: "4",
        injuries: "no",
      }),
    ).toEqual({
      missingFieldIds: [],
      invalidFieldIds: ["goal", "focus", "equipment", "sessions", "injuries"],
    });
    expect(
      onboardingAnswerErrors(typedFields, {
        goal: "Strength",
        history: "Knee surgery in 2024",
        focus: "strength",
        equipment: ["bands", "dumbbells"],
        sessions: 4,
        injuries: false,
      }),
    ).toEqual({ missingFieldIds: [], invalidFieldIds: [] });
    expect(
      onboardingAnswerErrors(typedFields, {
        goal: " ",
        focus: "strength",
        equipment: [],
        injuries: false,
      }),
    ).toEqual({
      missingFieldIds: ["goal", "equipment", "sessions"],
      invalidFieldIds: [],
    });
  });

  it("shows option labels and typed values without treating false or zero as empty", () => {
    const focus = typedFields.find((field) => field.id === "focus")!;
    const equipment = typedFields.find((field) => field.id === "equipment")!;
    const sessions = typedFields.find((field) => field.id === "sessions")!;
    const injuries = typedFields.find((field) => field.id === "injuries")!;
    expect(formatOnboardingAnswer(focus, "strength")).toBe("Strength");
    expect(formatOnboardingAnswer(equipment, ["bands", "dumbbells"])).toBe(
      "Bands, Dumbbells",
    );
    expect(formatOnboardingAnswer(sessions, 0)).toBe("0");
    expect(formatOnboardingAnswer(injuries, false)).toBe("No");
    expect(
      formatOnboardingAnswer(
        {
          id: "experience",
          type: "select",
          label: "Experience",
          required: true,
          options: ["New", "Returning"],
        },
        "New",
      ),
    ).toBe("New");
  });
});
