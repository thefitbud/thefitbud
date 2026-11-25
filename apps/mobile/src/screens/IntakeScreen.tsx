import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Platform, Pressable, SafeAreaView, ScrollView, View } from "react-native";
import { Minus, Plus, X } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import { onboardingAnswerErrors } from "@fitbud/core";
import type {
  OnboardingAnswers,
  OnboardingFormResponse,
  OnboardingFormVersion,
  OnboardingFieldDefinition,
} from "@fitbud/contracts";
import { spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/Button";
import { BottomSheet } from "../components/BottomSheet";
import { Field } from "../components/Field";
import {
  DayPills,
  M2InputRow,
  QuestionHeading,
  RadioCard,
  YesNoToggle,
  NumberStepper,
} from "../components/m2";
import {
  consumeCaptureIntakeStep,
  isCaptureModeEnabled,
} from "../dev/captureBridge";
import { createIdempotencyKey } from "../lib/idempotency";
import { reportError } from "../lib/reportError";
import { groupIntakeSteps } from "./intakeSteps";
import {
  intakeControlForField,
  parseNumberAnswer,
  toggleSelectedOption,
} from "./intakeFields";

/** Sheet copy for the TR-03 close button (D-W14-46). */
const FINISH_LATER_BODY = "Your answers are saved. Sign in again any time to carry on.";
const FINISH_LATER_NOTHING_SAVED_BODY = "Sign out for now? You can sign in again any time to carry on.";
const FINISH_LATER_UNSAVED_BODY = "We couldn't save your last answers. Sign out anyway?";
const NO_QUESTIONS_COPY = "Your coach hasn't added any questions yet.";
/** Where the first tap on an unanswered sleep stepper starts from; nothing is stored until a tap. */
const SLEEP_START_HOURS = 6.5;

/** Line under a question the trainee still has to answer (Z14-45). */
const REQUIRED_ANSWER_COPY = "Answer this question to continue.";

/** Shown when another device or session changed the draft first (D-W14-44). */
const VERSION_CONFLICT_COPY =
  "Your answers were updated somewhere else. Check them and submit again.";

/** Mockup 21 / TR-03 capture fields when the pinned form is still legacy textareas. */
const CAPTURE_ROUTINE_FIELDS: OnboardingFieldDefinition[] = [
  {
    id: "work_activity",
    type: "single_choice",
    label: "How active is your work day?",
    required: true,
    options: [
      {
        id: "mostly_sitting",
        label: "Mostly sitting · Desk job, under 5,000 steps",
      },
      {
        id: "on_feet",
        label: "On my feet a lot · Teaching, retail, field work",
      },
      { id: "physical", label: "Physical work" },
    ],
  },
  {
    id: "training_days",
    type: "multiple_choice",
    label: "Which days can you train?",
    required: true,
    options: [
      { id: "mon", label: "Mon" },
      { id: "tue", label: "Tue" },
      { id: "wed", label: "Wed" },
      { id: "thu", label: "Thu" },
      { id: "fri", label: "Fri" },
      { id: "sat", label: "Sat" },
      { id: "sun", label: "Sun" },
    ],
  },
  {
    id: "sleep_hours",
    type: "number",
    label: "Hours of sleep on a usual night",
    required: true,
  },
  {
    id: "injury",
    type: "yes_no",
    label: "Any injury or pain we should know about?",
    required: true,
  },
];

const CAPTURE_ROUTINE_ANSWERS: OnboardingAnswers = {
  work_activity: "mostly_sitting",
  training_days: ["mon", "wed", "fri", "sat"],
  sleep_hours: 6.5,
  injury: true,
};

type Props = {
  relationshipId: string;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function isDayField(field: OnboardingFieldDefinition): boolean {
  const label = field.label.toLowerCase();
  return label.includes("day") && label.includes("train");
}

function isSleepField(field: OnboardingFieldDefinition): boolean {
  return field.label.toLowerCase().includes("sleep");
}

function hasRoutineTypedFields(fields: OnboardingFieldDefinition[]): boolean {
  return fields.some((field) => {
    const control = intakeControlForField(field);
    return (
      control.kind === "single_choice" ||
      control.kind === "yes_no" ||
      isDayField(field) ||
      isSleepField(field)
    );
  });
}

function IntakeScreenBody({ relationshipId }: Props) {
  const styles = useStyles();
  const theme = useTheme();
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const captureMode = isCaptureModeEnabled();
  const [stepIndex, setStepIndex] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSaveFailed, setCloseSaveFailed] = useState(false);
  const [closeNothingToSave, setCloseNothingToSave] = useState(false);
  const [useCaptureRoutine, setUseCaptureRoutine] = useState(false);
  const submitIdempotencyKey = useRef(createIdempotencyKey());
  const captureStepApplied = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setNumberDrafts({});
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
      reportError("IntakeScreen.load", error);
      setErrorMessage(userFacingMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId]);

  /**
   * Background refetch after a version conflict (D-W14-44): refreshes answers,
   * version and status without the full-screen loading state and without
   * touching the error banner. A failed refetch is only reported; the banner
   * already says what the trainee needs to know.
   */
  async function refetchResponse() {
    try {
      const existing = await api.getOnboardingResponse(relationshipId);
      setAnswers(existing.answers);
      setNumberDrafts({});
      setVersion(existing.version);
      setStatus(existing.status);
    } catch (error) {
      reportError("IntakeScreen.refetchResponse", error);
    }
  }

  function stepIndexOfField(fieldId: string): number {
    return fieldGroups.findIndex((group) => group.some((f) => f.id === fieldId));
  }

  /** Mark the given questions and jump to the step holding the first one. */
  function showFieldErrors(fieldIds: string[]) {
    const known = fieldIds.filter((id) => stepIndexOfField(id) >= 0);
    if (known.length === 0) return false;
    const next: Record<string, string> = {};
    for (const id of known) next[id] = REQUIRED_ANSWER_COPY;
    setFieldErrors(next);
    const firstStep = Math.min(...known.map(stepIndexOfField));
    setStepIndex(firstStep);
    return true;
  }
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!captureMode || captureStepApplied.current || loading || !definition) {
      return;
    }
    const target = consumeCaptureIntakeStep() ?? 1;
    const needsDemo = !hasRoutineTypedFields(definition.fields);
    if (needsDemo) {
      setUseCaptureRoutine(true);
      setAnswers((current) => ({ ...CAPTURE_ROUTINE_ANSWERS, ...current }));
    }
    const last = groupIntakeSteps(definition.fields).length - 1;
    setStepIndex(Math.min(last, Math.max(0, target)));
    captureStepApplied.current = true;
  }, [captureMode, definition, loading]);

  const fieldGroups = useMemo(() => {
    const groups = groupIntakeSteps(definition?.fields ?? []);
    if (useCaptureRoutine) {
      if (groups.length > 1) groups[1] = CAPTURE_ROUTINE_FIELDS;
      else groups.push(CAPTURE_ROUTINE_FIELDS);
    }
    return groups;
  }, [definition?.fields, useCaptureRoutine]);
  const totalSteps = fieldGroups.length;
  const readOnly = status === "submitted";

  function updateAnswer(fieldId: string, value: OnboardingAnswers[string] | undefined) {
    setFieldErrors((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
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
      reportError("IntakeScreen.saveDraft", error);
      if (error instanceof ApiClientError && error.code === "ONBOARDING_VERSION_CONFLICT") {
        setErrorMessage(VERSION_CONFLICT_COPY);
        await refetchResponse();
      } else {
        setErrorMessage(userFacingMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * One draft save, then one submit with the version that save returned
   * (D-W14-44). The returned version is passed on directly: React state set
   * in this handler is not visible to it until the next render.
   */
  async function submit() {
    const checked = onboardingAnswerErrors(definition?.fields ?? [], answers);
    const blocked = [...checked.missingFieldIds, ...checked.invalidFieldIds];
    if (blocked.length > 0 && showFieldErrors(blocked)) {
      setErrorMessage(null);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});
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
      reportError("IntakeScreen.submit", error);
      if (error instanceof ApiClientError && error.code === "ONBOARDING_VERSION_CONFLICT") {
        submitIdempotencyKey.current = createIdempotencyKey();
        setErrorMessage(VERSION_CONFLICT_COPY);
        await refetchResponse();
      } else if (error instanceof ApiClientError && error.code === "ONBOARDING_INCOMPLETE") {
        submitIdempotencyKey.current = createIdempotencyKey();
        const ids = [
          ...stringList(error.details?.missingFieldIds),
          ...stringList(error.details?.invalidFieldIds),
        ];
        if (!showFieldErrors(ids)) setErrorMessage(userFacingMessage(error));
      } else {
        setErrorMessage(userFacingMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function goNext() {
    if (stepIndex >= totalSteps - 1) {
      await submit();
      return;
    }
    await saveDraft();
    setStepIndex((s) => Math.min(totalSteps - 1, s + 1));
  }

  function renderField(field: OnboardingFieldDefinition, readOnly: boolean) {
    const control = intakeControlForField(field);
    const stored = answers[field.id];

    if (control.kind === "short_text" || control.kind === "long_text") {
      if (control.kind === "long_text") {
        return (
          <View key={field.id}>
            <QuestionHeading>{field.label}</QuestionHeading>
            <Field
            label=""
            accessibilityLabel={field.label}
            hint={field.helpText}
            value={typeof stored === "string" ? stored : ""}
            onChangeText={(value) => updateAnswer(field.id, value)}
            multiline
            editable={!readOnly}
            maxLength={control.maxLength}
            />
          </View>
        );
      }
      return (
        <View key={field.id}>
          <QuestionHeading>{field.label}</QuestionHeading>
          <M2InputRow
            value={typeof stored === "string" ? stored : ""}
            onChangeText={(value) => updateAnswer(field.id, value)}
            inputProps={{
              editable: !readOnly,
              maxLength: control.maxLength,
              accessibilityLabel: field.label,
            }}
          />
          {field.helpText ? <Text style={styles.hint}>{field.helpText}</Text> : null}
        </View>
      );
    }

    if (control.kind === "number") {
      if (isSleepField(field)) {
        const onChange = (next: number) => updateAnswer(field.id, next);
        return (
          <View key={field.id}>
            <QuestionHeading>{field.label}</QuestionHeading>
            {typeof stored === "number" ? (
              <NumberStepper
                value={stored}
                unit="hours"
                min={4}
                max={12}
                step={0.5}
                disabled={readOnly}
                onChange={onChange}
              />
            ) : (
              <View style={styles.sleepEmptyCard}>
                <Text style={styles.sleepEmptyValue}>—</Text>
                <View style={styles.sleepEmptyStepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decrease"
                    disabled={readOnly}
                    onPress={() => onChange(SLEEP_START_HOURS - 0.5)}
                    style={styles.sleepEmptyBtn}
                  >
                    <Minus size={18} color={theme.colors.ink} strokeWidth={2.2} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase"
                    disabled={readOnly}
                    onPress={() => onChange(SLEEP_START_HOURS + 0.5)}
                    style={styles.sleepEmptyBtn}
                  >
                    <Plus size={18} color={theme.colors.ink} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      }
      const draft =
        numberDrafts[field.id] ??
        (typeof stored === "number" ? String(stored) : "");
      return (
        <View key={field.id}>
          <QuestionHeading>{field.label}</QuestionHeading>
          <M2InputRow
            value={draft}
            onChangeText={(value) => {
              setNumberDrafts((current) => ({ ...current, [field.id]: value }));
              updateAnswer(field.id, parseNumberAnswer(value));
            }}
            inputProps={{
              keyboardType: "decimal-pad",
              editable: !readOnly,
              accessibilityLabel: field.label,
            }}
          />
          {field.helpText ? <Text style={styles.hint}>{field.helpText}</Text> : null}
        </View>
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

  /** Save the current answers before the "Finish later?" sheet opens (D-W14-46). */
  async function openCloseSheet() {
    setCloseSaveFailed(false);
    setCloseNothingToSave(!definition || loading);
    if (definition && !readOnly && !loading) {
      setSaving(true);
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
        reportError("IntakeScreen.saveForClose", error);
        setCloseSaveFailed(true);
      } finally {
        setSaving(false);
      }
    }
    setCloseOpen(true);
  }

  // Android hardware back (D-W14-24): the sheet on step 1, else the step before.
  const backState = useRef({ stepIndex, closeOpen, openCloseSheet });
  backState.current = { stepIndex, closeOpen, openCloseSheet };
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const state = backState.current;
      if (state.closeOpen) setCloseOpen(false);
      else if (state.stepIndex > 0) setStepIndex((s) => Math.max(0, s - 1));
      else void state.openCloseSheet();
      return true;
    });
    return () => sub.remove();
  }, []);

  const closeSheet = (
    <BottomSheet
      visible={closeOpen}
      title="Finish later?"
      subtitle={
        closeSaveFailed
          ? FINISH_LATER_UNSAVED_BODY
          : closeNothingToSave
            ? FINISH_LATER_NOTHING_SAVED_BODY
            : FINISH_LATER_BODY
      }
      onDismiss={() => setCloseOpen(false)}
    >
      <Button label="Keep going" onPress={() => setCloseOpen(false)} />
      <Button
        label="Sign out"
        variant="outline"
        onPress={() => {
          setCloseOpen(false);
          signOut();
        }}
      />
    </BottomSheet>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <IntakeHeader onClose={() => void openCloseSheet()} />
        <View style={styles.loading} accessibilityLabel="Loading">
          <ActivityIndicator size="large" color={theme.colors.brand} />
        </View>
        {closeSheet}
      </SafeAreaView>
    );
  }

  if (!definition) {
    return (
      <SafeAreaView style={styles.safe}>
        <IntakeHeader onClose={() => void openCloseSheet()} />
        <View style={styles.body}>
          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
          <Button label="Try again" onPress={() => void load()} />
        </View>
        {closeSheet}
      </SafeAreaView>
    );
  }

  const stepNumber = stepIndex + 1;
  const isLast = stepIndex >= totalSteps - 1;
  const stepFields = fieldGroups[stepIndex] ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <IntakeHeader
        onClose={() => void openCloseSheet()}
        step={stepNumber}
        total={totalSteps}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        {stepFields.length > 0 ? (
          stepFields.map((field) => (
            <View key={field.id}>
              {renderField(field, readOnly)}
              {fieldErrors[field.id] ? (
                <Text style={styles.fieldError}>{fieldErrors[field.id]}</Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.muted}>{NO_QUESTIONS_COPY}</Text>
        )}
      </ScrollView>
      {!readOnly ? (
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {stepIndex > 0 ? (
              <View style={styles.footerBack}>
                <Button
                  label="Back"
                  variant="secondary"
                  disabled={saving || submitting}
                  onPress={() => setStepIndex((s) => Math.max(0, s - 1))}
                />
              </View>
            ) : null}
            <View style={styles.footerMain}>
              <Button
                label={isLast ? "Submit intake" : "Continue"}
                loading={saving || submitting}
                onPress={() => {
                  void goNext();
                }}
              />
            </View>
          </View>
          {savedFlash ? <Text style={styles.savedLine}>Answers saved</Text> : null}
        </View>
      ) : null}
      {closeSheet}
    </SafeAreaView>
  );
}

/** TR-03 header: ✕ at the left, title and "Step n of N" centred, one progress bar. */
function IntakeHeader({
  onClose,
  step,
  total,
}: {
  onClose: () => void;
  step?: number;
  total?: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const showStep = step !== undefined && total !== undefined;
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={4}
          style={styles.closeBtn}
        >
          <X size={20} color={theme.colors.ink2} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Getting to know you</Text>
          {showStep ? (
            <Text style={styles.headerSub}>{`Step ${step} of ${total}`}</Text>
          ) : null}
        </View>
        <View style={styles.closeSpacer} />
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: showStep ? `${(step / total) * 100}%` : "0%" }]} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  muted: {
    color: t.colors.ink3,
    fontSize: 16,
  },
  fieldError: {
    color: t.colors.critInk,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  sleepEmptyCard: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  sleepEmptyValue: { color: t.colors.ink3, fontSize: 22, fontWeight: "700" },
  sleepEmptyStepper: {
    borderColor: t.colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  sleepEmptyBtn: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  hint: {
    color: t.colors.ink3,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: t.colors.bgPlain },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerRow: { alignItems: "center", flexDirection: "row", minHeight: 48 },
  closeBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeSpacer: { height: 44, width: 44 },
  headerCenter: { alignItems: "center", flex: 1, paddingHorizontal: spacing.sm },
  headerTitle: {
    color: t.colors.ink,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSub: { color: t.colors.ink3, fontSize: 13, marginTop: 2 },
  track: {
    backgroundColor: t.colors.fill2,
    borderRadius: 2,
    height: 4,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  fill: { backgroundColor: t.colors.brand, borderRadius: 2, height: 4 },
  footer: {
    backgroundColor: t.colors.glass,
    borderTopColor: t.colors.line,
    borderTopWidth: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerBack: { flex: 1 },
  footerMain: { flex: 2 },
  savedLine: {
    color: t.colors.ink3,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: "center",
  },
}));

/** IntakeScreen in the system theme (Z12-49): its own styles read the scope. */
export function IntakeScreen(props: Parameters<typeof IntakeScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <IntakeScreenBody {...props} />
    </ThemeScope>
  );
}
