import {
  onboardingFormDefinitionSchema,
  type OnboardingAnswers,
  type OnboardingFieldDefinition,
  type OnboardingStatus,
} from "@fitbud/contracts";

export type ClientOnboardingFacts = {
  /** Null when the invitation has not created a coaching relationship. */
  relationshipStatus: "active" | "ended" | null;
  invitationPending: boolean;
  hasSubmittedResponse: boolean;
  hasCoachingReadyReview: boolean;
  hasActiveConfiguration: boolean;
};

/**
 * Derived client lifecycle. Relationship rows only store active or ended.
 * invited → onboarding_pending → onboarding_submitted → coaching_ready → active → ended
 */
export function deriveClientOnboardingStatus(
  facts: ClientOnboardingFacts,
): OnboardingStatus | null {
  if (facts.relationshipStatus === null) {
    return facts.invitationPending ? "invited" : null;
  }
  if (facts.relationshipStatus === "ended") {
    return "ended";
  }
  if (!facts.hasSubmittedResponse) {
    return "onboarding_pending";
  }
  if (!facts.hasCoachingReadyReview) {
    return "onboarding_submitted";
  }
  if (!facts.hasActiveConfiguration) {
    return "coaching_ready";
  }
  return "active";
}

/** Draft saves are allowed only before a response is submitted. */
export function canSaveOnboardingDraft(status: OnboardingStatus): boolean {
  return status === "onboarding_pending";
}

/** Submit is allowed only from the pending onboarding state. */
export function canSubmitOnboarding(status: OnboardingStatus): boolean {
  return status === "onboarding_pending";
}

/** A trainer may record coaching-ready review only after submission. */
export function canMarkCoachingReady(status: OnboardingStatus): boolean {
  return status === "onboarding_submitted";
}

/** Reviewed clients and clients with an active configuration are past onboarding. */
export function isPastOnboardingReview(status: OnboardingStatus): boolean {
  return status === "coaching_ready" || status === "active";
}

export type OnboardingFormCandidate = {
  id: string;
  scope: "global" | "trainer";
  trainerUserId: string | null;
  version: number;
};

/**
 * Highest trainer-scoped version for this trainer, otherwise the highest global version.
 * The seeded global key is data, not the resolution rule.
 */
export function resolveOnboardingForm<T extends OnboardingFormCandidate>(
  forms: readonly T[],
  trainerUserId: string,
): T | null {
  const trainerForms = forms.filter(
    (form) => form.scope === "trainer" && form.trainerUserId === trainerUserId,
  );
  const pool =
    trainerForms.length > 0
      ? trainerForms
      : forms.filter(
          (form) => form.scope === "global" && form.trainerUserId == null,
        );
  if (pool.length === 0) {
    return null;
  }
  return pool.reduce((best, form) => (form.version > best.version ? form : best));
}

export type OnboardingAnswerValue = OnboardingAnswers[string];

/** A required answer is blank when it is absent, whitespace, or an empty selection. */
export function isBlankOnboardingAnswer(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validate required onboarding answers against field definitions.
 * Returns missing field ids (empty when valid).
 * A numeric 0 and boolean false count as answers.
 */
export function missingRequiredOnboardingFields(
  fields: ReadonlyArray<{ id: string; required: boolean }>,
  answers: Readonly<Record<string, OnboardingAnswerValue | undefined>>,
): string[] {
  return fields
    .filter((field) => field.required)
    .filter((field) => isBlankOnboardingAnswer(answers[field.id]))
    .map((field) => field.id);
}

export type OnboardingTemplateVersionCandidate = {
  id: string;
  templateId: string;
  version: number;
};

/** Highest version row for one template. Ties keep the earlier candidate. */
export function latestOnboardingFormVersion<
  T extends OnboardingTemplateVersionCandidate,
>(versions: readonly T[], templateId: string): T | null {
  const matches = versions.filter((item) => item.templateId === templateId);
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((best, item) =>
    item.version > best.version ? item : best,
  );
}

export function canTrainerReadOnboardingTemplate(
  template: { ownership: "global" | "trainer"; trainerUserId: string | null },
  trainerUserId: string,
): boolean {
  if (template.ownership === "global") {
    return template.trainerUserId == null;
  }
  return template.trainerUserId === trainerUserId;
}

/** Reject a definition that does not match the onboarding field schema. */
export function parseOnboardingFormFields(
  fields: unknown,
):
  | { ok: true; fields: OnboardingFieldDefinition[] }
  | { ok: false } {
  const parsed = onboardingFormDefinitionSchema.safeParse({ fields });
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, fields: parsed.data.fields };
}

/** Field shape accepted by answer checks. Callers pass the pinned definition. */
export type OnboardingAnswerField = OnboardingFieldDefinition;

function optionIds(field: OnboardingFieldDefinition): readonly string[] {
  if (field.type === "select") return field.options;
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return field.options.map((option) => option.id);
  }
  return [];
}

function optionLabels(field: OnboardingFieldDefinition): ReadonlyMap<string, string> {
  if (field.type === "select") {
    return new Map(field.options.map((option) => [option, option]));
  }
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    return new Map(field.options.map((option) => [option.id, option.label]));
  }
  return new Map();
}

function answerMatchesField(
  field: OnboardingFieldDefinition,
  value: unknown,
): boolean {
  switch (field.type) {
    case "text":
    case "textarea":
    case "short_text":
    case "long_text":
      return (
        typeof value === "string" &&
        (field.maxLength == null || value.length <= field.maxLength)
      );
    case "select":
    case "single_choice":
      return typeof value === "string" && optionIds(field).includes(value);
    case "multiple_choice": {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return false;
      }
      const allowed = new Set(optionIds(field));
      return (
        new Set(value).size === value.length &&
        value.every((item) => allowed.has(item))
      );
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "yes_no":
      return typeof value === "boolean";
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

/**
 * Required blanks and answers that do not match the pinned field type.
 * Legacy select answers must equal an option string. That string is the option id.
 */
export function onboardingAnswerErrors(
  fields: readonly OnboardingAnswerField[],
  answers: Readonly<Record<string, OnboardingAnswerValue | undefined>>,
): { missingFieldIds: string[]; invalidFieldIds: string[] } {
  const missingFieldIds = missingRequiredOnboardingFields(fields, answers);
  const missing = new Set(missingFieldIds);
  const invalidFieldIds = fields
    .filter((field) => !missing.has(field.id))
    .filter((field) => !isBlankOnboardingAnswer(answers[field.id]))
    .filter((field) => !answerMatchesField(field, answers[field.id]))
    .map((field) => field.id);
  return { missingFieldIds, invalidFieldIds };
}

/** Trainer-facing text for one stored answer. Option ids render as their labels. */
export function formatOnboardingAnswer(
  field: OnboardingFieldDefinition,
  value: OnboardingAnswerValue | undefined,
): string {
  if (isBlankOnboardingAnswer(value) || value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (Array.isArray(value)) {
    const labels = optionLabels(field);
    return value.map((id) => labels.get(id) ?? id).join(", ");
  }
  if (field.type === "single_choice" || field.type === "select") {
    return optionLabels(field).get(value) ?? value;
  }
  return value;
}
