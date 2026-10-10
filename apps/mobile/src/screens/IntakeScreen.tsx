import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  OnboardingAnswers,
  OnboardingFormResponse,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import { colors, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  intakeControlForField,
  parseNumberAnswer,
  toggleSelectedOption,
} from "./intakeFields";

type Props = {
  relationshipId: string;
};

export function IntakeScreen({ relationshipId }: Props) {
  const { api, refreshSession, signOut } = useAuth();
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<OnboardingFormResponse["status"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const submitIdempotencyKey = useRef(createIdempotencyKey());

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const currentDefinition = await api.getCurrentOnboardingForm(relationshipId);
      setDefinition(currentDefinition);

      try {
        const existing = await api.getOnboardingResponse(relationshipId);
        setAnswers(existing.answers);
        setVersion(existing.version);
        setStatus(existing.status);
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "ONBOARDING_NOT_FOUND") {
          setAnswers({});
          setVersion(0);
          setStatus(null);
        } else {
          throw error;
        }
      }
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateAnswer(fieldId: string, value: OnboardingAnswers[string] | undefined) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[fieldId];
      else next[fieldId] = value;
      return next;
    });
    setInfoMessage(null);
  }

  async function saveDraft() {
    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const saved = await api.saveOnboardingDraft(relationshipId, {
        answers,
        expectedVersion: version,
      });
      setAnswers(saved.answers);
      setVersion(saved.version);
      setStatus(saved.status);
      setInfoMessage("Draft saved.");
    } catch (error) {
      setErrorMessage(messageFromError(error));
      if (error instanceof ApiClientError && error.code === "ONBOARDING_VERSION_CONFLICT") {
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      // Persist latest answers before submit so required fields are on the server.
      const saved = await api.saveOnboardingDraft(relationshipId, {
        answers,
        expectedVersion: version,
      });
      setVersion(saved.version);
      setAnswers(saved.answers);

      const submitted = await api.submitOnboarding(
        relationshipId,
        { expectedVersion: saved.version },
        submitIdempotencyKey.current,
      );
      setStatus(submitted.status);
      setVersion(submitted.version);
      setInfoMessage("Intake submitted. Your trainer will review it.");
      submitIdempotencyKey.current = createIdempotencyKey();
      await refreshSession();
    } catch (error) {
      setErrorMessage(messageFromError(error));
      if (
        error instanceof ApiClientError &&
        (error.code === "ONBOARDING_VERSION_CONFLICT" ||
          error.code === "ONBOARDING_INCOMPLETE")
      ) {
        submitIdempotencyKey.current = createIdempotencyKey();
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Screen title="Intake" subtitle="Loading required questions from the API…">
        <Text style={styles.muted}>Loading…</Text>
      </Screen>
    );
  }

  if (!definition) {
    return (
      <Screen title="Intake" subtitle="Could not load the intake definition.">
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <PrimaryButton label="Retry" onPress={() => void load()} />
        <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  const readOnly = status === "submitted";

  return (
    <Screen
      title="Onboarding intake"
      subtitle="Share only what your trainer needs to start coaching. Required fields are marked."
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {infoMessage ? (
        <View style={styles.info}>
          <Text style={styles.infoText}>{infoMessage}</Text>
        </View>
      ) : null}

      {definition.fields.map((field) => {
        const control = intakeControlForField(field);
        const label = `${field.label}${field.required ? " *" : ""}`;
        const stored = answers[field.id];
        if (control.kind === "short_text" || control.kind === "long_text") {
          return (
            <Field
              key={field.id}
              label={label}
              hint={field.helpText}
              value={typeof stored === "string" ? stored : ""}
              onChangeText={(value) => updateAnswer(field.id, value)}
              multiline={control.kind === "long_text"}
              editable={!readOnly}
              maxLength={control.maxLength}
            />
          );
        }
        if (control.kind === "number") {
          const draft =
            numberDrafts[field.id] ??
            (typeof stored === "number" ? String(stored) : "");
          return (
            <Field
              key={field.id}
              label={label}
              hint={field.helpText}
              value={draft}
              keyboardType="decimal-pad"
              editable={!readOnly}
              onChangeText={(value) => {
                setNumberDrafts((current) => ({ ...current, [field.id]: value }));
                updateAnswer(field.id, parseNumberAnswer(value));
              }}
            />
          );
        }
        if (control.kind === "yes_no") {
          return (
            <View key={field.id} style={styles.group}>
              <Text style={styles.groupLabel}>{label}</Text>
              {field.helpText ? <Text style={styles.hint}>{field.helpText}</Text> : null}
              <View style={styles.choiceRow}>
                {([
                  ["Yes", true],
                  ["No", false],
                ] as const).map(([caption, next]) => {
                  const selected = stored === next;
                  return (
                    <Pressable
                      key={caption}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: readOnly }}
                      disabled={readOnly}
                      onPress={() => updateAnswer(field.id, next)}
                      style={[styles.choice, selected && styles.choiceSelected]}
                    >
                      <Text style={styles.choiceText}>
                        {selected ? `${caption}, selected` : caption}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }
        const selectedIds = Array.isArray(stored) ? stored : [];
        return (
          <View key={field.id} style={styles.group}>
            <Text style={styles.groupLabel}>{label}</Text>
            {field.helpText ? <Text style={styles.hint}>{field.helpText}</Text> : null}
            {control.options.map((option) => {
              const selected =
                control.kind === "multiple_choice"
                  ? selectedIds.includes(option.id)
                  : stored === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole={
                    control.kind === "multiple_choice" ? "checkbox" : "radio"
                  }
                  accessibilityState={{ selected, disabled: readOnly }}
                  disabled={readOnly}
                  onPress={() => {
                    if (control.kind === "multiple_choice") {
                      const next = toggleSelectedOption(selectedIds, option.id);
                      updateAnswer(field.id, next.length === 0 ? undefined : next);
                      return;
                    }
                    updateAnswer(field.id, option.id);
                  }}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <Text style={styles.choiceText}>
                    {selected ? `${option.label}, selected` : option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {!readOnly ? (
        <>
          <PrimaryButton
            label="Save draft"
            variant="secondary"
            loading={saving}
            disabled={submitting}
            onPress={() => {
              void saveDraft();
            }}
          />
          <View style={styles.gap} />
          <PrimaryButton
            label="Submit intake"
            loading={submitting}
            disabled={saving}
            onPress={() => {
              void submit();
            }}
          />
        </>
      ) : null}

      <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.midGrey,
    fontSize: 16,
  },
  info: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    color: colors.deepNavy,
    fontSize: 14,
    lineHeight: 20,
  },
  gap: {
    height: spacing.md,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupLabel: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  choiceRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  choice: {
    minHeight: touchTargetMin,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.lightGrey,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  choiceSelected: {
    borderColor: colors.indigo,
    backgroundColor: colors.paleLavender,
  },
  choiceText: {
    color: colors.nearBlack,
    fontSize: 16,
  },
});
