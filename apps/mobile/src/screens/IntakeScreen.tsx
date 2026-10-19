import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  OnboardingAnswers,
  OnboardingFormResponse,
  OnboardingFormVersion,
  OnboardingFieldDefinition,
} from "@fitbud/contracts";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth, messageFromError } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import {
  Card2,
  DayPills,
  M2Field,
  M2InputRow,
  M2Screen,
  M2TopNav,
  Progress5,
  QuestionHeading,
  RadioCard,
  SavedBadge,
  YesNoToggle,
  NumberStepper,
} from "../components/m2";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  intakeControlForField,
  parseNumberAnswer,
  toggleSelectedOption,
} from "./intakeFields";

const STEP_TITLES = [
  "About you",
  "Your routine",
  "Food habits",
  "Health",
  "Goals",
] as const;

const TOTAL_STEPS = STEP_TITLES.length;

type Props = {
  relationshipId: string;
};

function chunkFields(fields: OnboardingFieldDefinition[], steps: number) {
  if (fields.length === 0) return Array.from({ length: steps }, () => []);
  const size = Math.max(1, Math.ceil(fields.length / steps));
  const groups: OnboardingFieldDefinition[][] = [];
  for (let i = 0; i < steps; i++) {
    groups.push(fields.slice(i * size, (i + 1) * size));
  }
  return groups;
}

function isDayField(field: OnboardingFieldDefinition): boolean {
  const label = field.label.toLowerCase();
  return label.includes("day") && label.includes("train");
}

function isSleepField(field: OnboardingFieldDefinition): boolean {
  return field.label.toLowerCase().includes("sleep");
}

export function IntakeScreen({ relationshipId }: Props) {
  const { api, refreshSession } = useAuth();
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<OnboardingFormResponse["status"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);
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

  const fieldGroups = useMemo(
    () => chunkFields(definition?.fields ?? [], TOTAL_STEPS),
    [definition?.fields],
  );

  function updateAnswer(fieldId: string, value: OnboardingAnswers[string] | undefined) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[fieldId];
      else next[fieldId] = value;
      return next;
    });
    setSavedFlash(false);
  }

  async function saveDraft() {
    setSaving(true);
    setErrorMessage(null);
    try {
      const saved = await api.saveOnboardingDraft(relationshipId, {
        answers,
        expectedVersion: version,
      });
      setAnswers(saved.answers);
      setVersion(saved.version);
      setStatus(saved.status);
      setSavedFlash(true);
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
    try {
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

  async function goNext() {
    await saveDraft();
    if (stepIndex >= TOTAL_STEPS - 1) {
      await submit();
      return;
    }
    setStepIndex((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }

  function renderField(field: OnboardingFieldDefinition, readOnly: boolean) {
    const control = intakeControlForField(field);
    const stored = answers[field.id];

    if (control.kind === "short_text" || control.kind === "long_text") {
      if (control.kind === "long_text") {
        return (
          <Field
            key={field.id}
            label={field.label}
            hint={field.helpText}
            value={typeof stored === "string" ? stored : ""}
            onChangeText={(value) => updateAnswer(field.id, value)}
            multiline
            editable={!readOnly}
            maxLength={control.maxLength}
          />
        );
      }
      return (
        <M2Field key={field.id} label={field.label} help={field.helpText}>
          <M2InputRow
            value={typeof stored === "string" ? stored : ""}
            onChangeText={(value) => updateAnswer(field.id, value)}
            inputProps={{
              editable: !readOnly,
              maxLength: control.maxLength,
            }}
          />
        </M2Field>
      );
    }

    if (control.kind === "number") {
      if (isSleepField(field)) {
        const num =
          typeof stored === "number"
            ? stored
            : parseNumberAnswer(numberDrafts[field.id] ?? "") ?? 6.5;
        return (
          <View key={field.id}>
            <QuestionHeading>{field.label}</QuestionHeading>
            <NumberStepper
              value={num}
              unit="hours"
              min={4}
              max={12}
              step={0.5}
              disabled={readOnly}
              onChange={(next) => updateAnswer(field.id, next)}
            />
          </View>
        );
      }
      const draft =
        numberDrafts[field.id] ??
        (typeof stored === "number" ? String(stored) : "");
      return (
        <M2Field key={field.id} label={field.label} help={field.helpText}>
          <M2InputRow
            value={draft}
            onChangeText={(value) => {
              setNumberDrafts((current) => ({ ...current, [field.id]: value }));
              updateAnswer(field.id, parseNumberAnswer(value));
            }}
            inputProps={{ keyboardType: "decimal-pad", editable: !readOnly }}
          />
        </M2Field>
      );
    }

    if (control.kind === "yes_no") {
      return (
        <View key={field.id}>
          <QuestionHeading>{field.label}</QuestionHeading>
          {field.helpText ? (
            <Text style={styles.hint}>{field.helpText}</Text>
          ) : null}
          <YesNoToggle
            value={typeof stored === "boolean" ? stored : undefined}
            disabled={readOnly}
            onChange={(next) => updateAnswer(field.id, next)}
          />
        </View>
      );
    }

    if (control.kind === "multiple_choice" && isDayField(field)) {
      const selectedIds = Array.isArray(stored) ? stored : [];
      const selectedLabels = control.options
        .filter((o) => selectedIds.includes(o.id))
        .map((o) => o.label);
      return (
        <View key={field.id}>
          <QuestionHeading hint="pick all that work">{field.label}</QuestionHeading>
          <DayPills
            disabled={readOnly}
            selected={selectedLabels}
            onToggle={(day) => {
              const match = control.options.find((o) => o.label === day);
              if (!match) return;
              const next = toggleSelectedOption(selectedIds, match.id);
              updateAnswer(field.id, next.length === 0 ? undefined : next);
            }}
          />
        </View>
      );
    }

    if (control.kind === "single_choice") {
      return (
        <View key={field.id}>
          <QuestionHeading>{field.label}</QuestionHeading>
          {field.helpText ? (
            <Text style={styles.hint}>{field.helpText}</Text>
          ) : null}
          {control.options.map((option) => {
            const selected = stored === option.id;
            const [title, sub] = option.label.includes("·")
              ? option.label.split("·").map((s) => s.trim())
              : [option.label, undefined];
            return (
              <RadioCard
                key={option.id}
                title={title}
                subtitle={sub}
                selected={selected}
                disabled={readOnly}
                onPress={() => updateAnswer(field.id, option.id)}
              />
            );
          })}
        </View>
      );
    }

    const selectedIds = Array.isArray(stored) ? stored : [];
    return (
      <View key={field.id}>
        <QuestionHeading>{field.label}</QuestionHeading>
        {control.options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <RadioCard
              key={option.id}
              title={option.label}
              selected={selected}
              disabled={readOnly}
              onPress={() => {
                const next = toggleSelectedOption(selectedIds, option.id);
                updateAnswer(field.id, next.length === 0 ? undefined : next);
              }}
            />
          );
        })}
      </View>
    );
  }

  if (loading) {
    return (
      <M2Screen>
        <Text style={styles.muted}>Loading…</Text>
      </M2Screen>
    );
  }

  if (!definition) {
    return (
      <M2Screen>
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <Button label="Retry" onPress={() => void load()} />
</M2Screen>
    );
  }

  const readOnly = status === "submitted";
  const stepNumber = stepIndex + 1;
  const stepTitle = STEP_TITLES[stepIndex] ?? "Getting started";
  const nextTitle = STEP_TITLES[stepIndex + 1];
  const footerLabel =
    stepIndex >= TOTAL_STEPS - 1
      ? "Submit intake"
      : nextTitle
        ? `Next: ${nextTitle}`
        : "Continue";

  const footer = !readOnly ? (
    <Button
      label={footerLabel}
      loading={saving || submitting}
      onPress={() => {
        void goNext();
      }}
    />
  ) : null;

  return (
    <M2Screen footer={footer}>
      <M2TopNav
        title="Getting started"
        onBack={
          stepIndex > 0
            ? () => setStepIndex((s) => Math.max(0, s - 1))
            : undefined
        }
        right={savedFlash ? <SavedBadge /> : null}
      />
      <Progress5 step={stepNumber} />
      <View style={styles.stepLabelRow}>
        <Text style={styles.stepTitle}>
          <Text style={styles.stepTitleBold}>{stepTitle}</Text>
        </Text>
        <Text style={styles.stepCount}>{stepNumber} of {TOTAL_STEPS}</Text>
      </View>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      {fieldGroups[stepIndex]?.length
        ? fieldGroups[stepIndex]!.map((field) => renderField(field, readOnly))
        : (
          <Card2>
            <Text style={styles.muted}>
              No questions on this step. Tap continue.
            </Text>
          </Card2>
        )}

      {!readOnly ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void saveDraft()}
          style={styles.saveDraft}
        >
          <Text style={styles.saveDraftText}>Save draft</Text>
        </Pressable>
      ) : null}
</M2Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.midGrey,
    fontSize: 16,
  },
  hint: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  stepLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingHorizontal: 4,
  },
  stepTitle: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  stepTitleBold: {
    color: colors.indigo,
    fontWeight: "700",
  },
  stepCount: {
    color: colors.midGrey,
    fontSize: 13,
    fontWeight: "600",
  },
  saveDraft: {
    alignItems: "center",
    marginTop: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
  },
  saveDraftText: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
  },
});
