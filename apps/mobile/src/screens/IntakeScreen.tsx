import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  OnboardingAnswers,
  OnboardingFormResponse,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";

type Props = {
  relationshipId: string;
};

export function IntakeScreen({ relationshipId }: Props) {
  const { api, refreshSession, signOut } = useAuth();
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
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

  function updateAnswer(fieldId: string, value: string) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
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

      {definition.fields.map((field) => (
        <Field
          key={field.id}
          label={`${field.label}${field.required ? " *" : ""}`}
          value={answers[field.id] ?? ""}
          onChangeText={(value) => updateAnswer(field.id, value)}
          multiline={field.type === "textarea"}
          editable={!readOnly}
          maxLength={field.maxLength}
        />
      ))}

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
});
