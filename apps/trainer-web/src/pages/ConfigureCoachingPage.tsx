import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { PencilLine } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinCadence,
  CheckinFormTemplateSummary,
  CoachingConfiguration,
  ConfigurationSectionId,
  MealPhotoRequirement,
  PlanContent,
  ReminderType,
  Subscription,
} from "@fitbud/contracts";
import {
  COACHING_CONFIGURATION_DEFAULTS,
  GLOBAL_CHECKIN_FORM_VERSION_ID,
  consistencyFingerprint,
  missingConfigurationSections,
  formatCivilDate,
  formatRelative,
  labelFor,
  planConsistencyWarnings,
  possessivePronoun,
} from "@fitbud/core";
import { Button } from "../components/Button";
import { PlanConsistencyNotice } from "../components/PlanConsistencyNotice";
import {
  ReadOnlyField,
  ReadOnlyFieldList,
} from "../components/ReadOnlyField";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import { quietHoursText } from "../components/workspace/ResponsivenessPanel";
import { apiClient } from "../lib/api";
import { useConfig, isWhatsAppAutomationEnabled } from "../lib/config";
import { createIdempotencyKey } from "../lib/idempotency";
import { coachingPrefillFromIntake } from "../lib/intakePrefill";
import { stage1Api } from "../lib/stage1-api";
import { whatsappHref } from "../lib/whatsapp";
import type { WorkspaceOutletContext } from "./workspaceContext";
import { AccordionSection } from "./configure/AccordionSection";
import {
  ClientSettingsMovedBanner,
  ConfigureToolbar,
  civilDateIn,
  configureStatusNote,
} from "./configure/ConfigureToolbar";
import {
  ActivateDialog,
  SaveVersionDialog,
  type ActivateSummaryRow,
} from "./configure/ConfigureDialogs";
import { ExpectationsTable } from "./configure/ExpectationsTable";
import { configureSectionStatus } from "./configure/sectionStatus";
import {
  SECTION_TITLES,
  traineeDayLabel,
  versionChanges,
} from "./configure/versionChanges";
import { stepsNumber, useStepsTarget } from "./configure/useStepsTarget";
import "../styles/plan.css";
import "./configure/configure.css";

/** Shown when coaching ends while this page is open (Z7-12). */
const ENDED_ELSEWHERE_MESSAGE =
  "Coaching ended. Your unsaved changes were not saved.";

const DEFAULT_FORM = {
  goalShort: "",
  goalDescription: "",
  notes: "",
  sessionsPerWeek: COACHING_CONFIGURATION_DEFAULTS.workout.sessionsPerWeek,
  completionWindowHours:
    COACHING_CONFIGURATION_DEFAULTS.workout.completionWindowHours,
  mealsPerDay: COACHING_CONFIGURATION_DEFAULTS.nutrition.mealsPerDay,
  confirmationWindowHours:
    COACHING_CONFIGURATION_DEFAULTS.nutrition.confirmationWindowHours,
  photoRequirement: COACHING_CONFIGURATION_DEFAULTS.nutrition
    .photoRequirement as MealPhotoRequirement,
  cadence: COACHING_CONFIGURATION_DEFAULTS.checkin.cadence as CheckinCadence,
  dueWindowHours: COACHING_CONFIGURATION_DEFAULTS.checkin.dueWindowHours,
  formVersionId: null as string | null,
  requireBodyWeight: COACHING_CONFIGURATION_DEFAULTS.tracking.requireBodyWeight,
  requireProgressPhotos:
    COACHING_CONFIGURATION_DEFAULTS.tracking.requireProgressPhotos,
  requireSessionRpe: COACHING_CONFIGURATION_DEFAULTS.tracking.requireSessionRpe,
};

/** Read only: the ended view still shows the subscription it last had (W7). */
const EMPTY_SUBSCRIPTION = {
  planName: "",
  paymentFrequency: "monthly" as Subscription["paymentFrequency"],
  startsOn: "",
  renewsOn: "",
};

const SECTION_ORDER: ConfigurationSectionId[] = [
  "goal",
  "expectations",
  "checkins",
  "tracking",
];

const REMINDER_CATEGORIES: Array<{
  type: ReminderType;
  label: string;
}> = [
  { type: "workout_reminder", label: "Workout" },
  { type: "meal_reminder", label: "Meal" },
  { type: "checkin_reminder", label: "Check-in" },
];

/**
 * The version a form option pins. The FitBud global form pins the version new
 * assignments use, never the global template's latest version (Z6-2c,
 * D-W6-19); a trainer's own form pins its latest version.
 */
function checkinFormOptionValue(
  item: Pick<CheckinFormTemplateSummary, "ownership" | "latestVersionId">,
): string {
  return item.ownership === "global"
    ? GLOBAL_CHECKIN_FORM_VERSION_ID
    : item.latestVersionId;
}

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Client";
}

/** Civil "Wed 21 Oct" for an ended-at instant, in the trainee's timezone. */
function endedDateLabel(
  endedAt: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  const civil = civilDateIn(endedAt, timeZone);
  if (!civil) return null;
  const label = formatCivilDate(civil);
  if (!label || /^\d{4}-\d{2}-\d{2}/.test(label)) return null;
  return label;
}


/** "Wed 21 Oct" for a stored civil date; never the raw ISO value. */
function civilDateOrNotSet(localDate: string): string {
  const label = localDate ? formatCivilDate(localDate) : "";
  return label && !/^\d{4}-\d{2}-\d{2}/.test(label) ? label : "Not set";
}

function objectPronoun(gender: string | null | undefined): string {
  const g = (gender ?? "").trim().toLowerCase();
  if (g === "female" || g === "woman" || g === "f") return "her";
  if (g === "male" || g === "man" || g === "m") return "him";
  return "them";
}

export function ConfigureCoachingPage() {
  const { relationshipId = "" } = useParams();
  const { workspace, reloadWorkspace, online = true } =
    useOutletContext<WorkspaceOutletContext>();
  const { config } = useConfig();
  const waAutomationOn = isWhatsAppAutomationEnabled(config);

  const header = workspace?.header ?? null;
  const displayName = header?.traineeDisplayName ?? "Client";
  const firstName = firstNameOf(displayName);
  const pronoun = possessivePronoun(header?.traineeProfile.gender);
  const objPronoun = objectPronoun(header?.traineeProfile.gender);
  const relationshipEnded = header?.onboardingStatus === "ended";

  const [configuration, setConfiguration] =
    useState<CoachingConfiguration | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endedNotice, setEndedNotice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState(EMPTY_SUBSCRIPTION);
  const [effectivePlan, setEffectivePlan] = useState<{
    planId: string;
    versionId: string;
    title: string;
    content: PlanContent;
  } | null>(null);
  const [acknowledgedFingerprint, setAcknowledgedFingerprint] = useState<
    string | null
  >(null);
  const [forceGoalOpen, setForceGoalOpen] = useState(false);
  const [reminders, setReminders] = useState<Record<string, boolean>>({
    workout_reminder: true,
    meal_reminder: true,
    checkin_reminder: true,
  });
  const [reminderSaving, setReminderSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notificationsOff, setNotificationsOff] = useState(false);
  const [quietHours, setQuietHours] = useState<string | null>(null);
  const [checkinForms, setCheckinForms] = useState<
    CheckinFormTemplateSummary[]
  >([]);
  /** DS3: the Activate or Save as vN+1 confirmation that is open, if any. */
  const [dialog, setDialog] = useState<"activate" | "save-version" | null>(
    null,
  );
  const [dialogError, setDialogError] = useState<string | null>(null);

  const applyConfiguration = useCallback((config: CoachingConfiguration) => {
    setConfiguration(config);
    setForm({
      goalShort: config.goalShort ?? "",
      goalDescription: config.goalDescription ?? "",
      notes: config.notes ?? "",
      sessionsPerWeek: config.workout.sessionsPerWeek,
      completionWindowHours: config.workout.completionWindowHours,
      mealsPerDay: config.nutrition.mealsPerDay,
      confirmationWindowHours: config.nutrition.confirmationWindowHours,
      photoRequirement: config.nutrition.photoRequirement,
      cadence: config.checkin.cadence,
      dueWindowHours: config.checkin.dueWindowHours,
      formVersionId: config.checkin.formVersionId ?? null,
      requireBodyWeight: config.tracking.requireBodyWeight,
      requireProgressPhotos: config.tracking.requireProgressPhotos,
      requireSessionRpe: config.tracking.requireSessionRpe,
    });
  }, []);

  const applySubscription = useCallback((value: Subscription | null) => {
    setSubscriptionForm(
      value
        ? {
            planName: value.planName,
            paymentFrequency: value.paymentFrequency,
            startsOn: value.startsOn,
            renewsOn: value.renewsOn,
          }
        : EMPTY_SUBSCRIPTION,
    );
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  // Only the latest load may write state. Without this, a load that resolves
  // late (React StrictMode runs the effect twice in development, and a slow
  // network can reorder) resets the form under edits the trainer has started.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    if (!relationshipId) return;
    const seq = ++loadSeq.current;
    const isLatest = () => seq === loadSeq.current;
    setLoading(true);
    setError(null);
    setGoalError(null);
    setForceGoalOpen(false);
    try {
      const [
        configResult,
        subscriptionResult,
        planResult,
        reminderResult,
        responsivenessResult,
        intakeResult,
        formsResult,
      ] = await Promise.all([
        apiClient.getCoachingConfiguration(relationshipId, {
          notFoundAsNull: true,
        }),
        apiClient.getSubscription(relationshipId, { notFoundAsNull: true }),
        apiClient.getEffectivePlan(relationshipId).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
        apiClient.getReminderRules(relationshipId).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
        stage1Api.getResponsiveness(relationshipId, 14).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
        apiClient.getOnboardingResponse(relationshipId).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
        apiClient.listCheckinFormTemplates({ limit: 50 }).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
      ]);
      if (!isLatest()) return;

      if (configResult) {
        applyConfiguration(configResult);
      } else {
        setConfiguration(null);
        const submitted =
          intakeResult.ok && intakeResult.value.status === "submitted"
            ? intakeResult.value
            : null;
        const prefill = submitted
          ? coachingPrefillFromIntake(submitted.answers)
          : { goalDescription: "", notes: "" };
        setForm({
          ...DEFAULT_FORM,
          goalDescription: prefill.goalDescription,
          notes: prefill.notes,
        });
      }

      applySubscription(subscriptionResult);

      setEffectivePlan(
        planResult.ok && planResult.value.plan && planResult.value.version
          ? {
              planId: planResult.value.plan.id,
              versionId: planResult.value.version.id,
              title: planResult.value.plan.title,
              content: planResult.value.version.content,
            }
          : null,
      );

      if (reminderResult.ok) {
        const next: Record<string, boolean> = {
          workout_reminder: true,
          meal_reminder: true,
          checkin_reminder: true,
        };
        for (const item of reminderResult.value.items) {
          if (
            item.reminderType === "workout_reminder" ||
            item.reminderType === "meal_reminder" ||
            item.reminderType === "checkin_reminder"
          ) {
            next[item.reminderType] = item.enabled;
          }
        }
        setReminders(next);
      }

      setNotificationsOff(
        responsivenessResult.ok &&
          (responsivenessResult.value.label === "notifications_off" ||
            responsivenessResult.value.pushEnabled === false),
      );
      setQuietHours(
        responsivenessResult.ok ? quietHoursText(responsivenessResult.value) : null,
      );
      setCheckinForms(formsResult.ok ? formsResult.value.items : []);
    } catch (err) {
      if (!isLatest()) return;
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load coaching configuration.",
      );
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [applyConfiguration, applySubscription, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Z7-12: coaching can end in another tab. Realtime hints already reload the
  // workspace in the layout; on focus or visibility, refetch it too so the
  // page does not depend on realtime. The form state is never reset by this.
  useEffect(() => {
    // Offline: a failed refetch would make the layout drop the workspace and
    // unmount this page, losing unsaved text.
    if (relationshipEnded || !online) return;
    let last = 0;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      // One tab return fires both visibilitychange and focus: one reload.
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      reloadWorkspace();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [relationshipEnded, online, reloadWorkspace]);

  // Ended while open (not already ended at load): tell the trainer. Unsaved
  // text stays in the form, which is now read-only.
  const wasEndedRef = useRef(relationshipEnded);
  useEffect(() => {
    if (relationshipEnded && !wasEndedRef.current) {
      setEndedNotice(true);
    }
    wasEndedRef.current = relationshipEnded;
  }, [relationshipEnded]);

  /** A save refused with 409 RELATIONSHIP_ENDED: same message, then refetch status. */
  function noteEndedElsewhere(err: unknown): boolean {
    if (
      err instanceof ApiClientError &&
      err.status === 409 &&
      err.code === "RELATIONSHIP_ENDED"
    ) {
      setEndedNotice(true);
      setError(null);
      setMessage(null);
      reloadWorkspace();
      return true;
    }
    return false;
  }

  const status = configuration?.status ?? null;
  const expectedVersion = configuration?.recordVersion ?? 0;
  // Z8-6: an active version is edited in place on screen; the first edit
  // opens vN+1, which Save as vN+1 creates and activates. The active version
  // itself is never written (published versions are immutable).
  const canEdit =
    !relationshipEnded &&
    (header?.onboardingStatus === "coaching_ready" ||
      header?.onboardingStatus === "active");
  const readOnly = !canEdit;
  const mutationsBlocked = !online || relationshipEnded;

  // D-W8-5 (3): the steps target lives on the configuration, so it can only be
  // set once a draft or active version exists; until then it is disabled with
  // the reason shown, never a save that fails out of sight.
  const endedHandlerRef = useRef<(err: unknown) => boolean>(() => false);
  endedHandlerRef.current = noteEndedElsewhere;
  const onStepsEnded = useCallback(
    (err: unknown) => endedHandlerRef.current(err),
    [],
  );
  const onStepsSaved = useCallback(
    (target: number) => showToast(`Steps target set to ${stepsNumber(target)} a day`),
    [showToast],
  );
  const steps = useStepsTarget(relationshipId, {
    reloadKey: configuration?.id ?? null,
    onSaved: onStepsSaved,
    onEndedElsewhere: onStepsEnded,
  });
  const stepsBlockedReason = configuration
    ? null
    : "Save the draft first. Then you can set the steps target.";
  const stepsDisabled =
    !configuration ||
    mutationsBlocked ||
    steps.saving ||
    steps.target == null;

  // D-W8-5 (2): on an active version the preferred check-in form is assigned
  // for the next check-in at once (it is not part of the locked version).
  const [formAssigning, setFormAssigning] = useState(false);
  const checkinFormDisabled =
    acting ||
    formAssigning ||
    mutationsBlocked ||
    !(canEdit || status === "active");

  async function changeCheckinForm(next: string | null) {
    const previous = form.formVersionId;
    setForm((current) => ({ ...current, formVersionId: next }));
    if (!relationshipId || configuration?.status !== "active" || !next) return;
    setFormAssigning(true);
    setError(null);
    try {
      await apiClient.assignPreferredCheckinForm(relationshipId, {
        checkinFormVersionId: next,
      });
      showToast("Check-in form assigned for the next check-in");
    } catch (err) {
      setForm((current) => ({ ...current, formVersionId: previous }));
      if (noteEndedElsewhere(err)) return;
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not assign the check-in form.",
      );
    } finally {
      setFormAssigning(false);
    }
  }

  const configurationMatchesForm =
    configuration != null &&
    configuration.workout.sessionsPerWeek === form.sessionsPerWeek &&
    configuration.nutrition.mealsPerDay === form.mealsPerDay;
  const consistencyWarnings =
    effectivePlan && configuration
      ? planConsistencyWarnings({
          sessionsPerWeek: form.sessionsPerWeek,
          mealsPerDay: form.mealsPerDay,
          workoutDays: effectivePlan.content.workoutDays,
          mealPrescriptions: effectivePlan.content.mealPrescriptions,
        })
      : [];
  const consistencyFingerprintValue =
    consistencyFingerprint(consistencyWarnings);

  useEffect(() => {
    if (!effectivePlan) return;
    let cancelled = false;
    void apiClient
      .getPlanConsistency(effectivePlan.planId, effectivePlan.versionId)
      .then((result) => {
        if (cancelled) return;
        setAcknowledgedFingerprint(
          result.acknowledged ? result.fingerprint : null,
        );
      })
      .catch(() => {
        if (!cancelled) setAcknowledgedFingerprint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePlan]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const summaries = useMemo(() => {
    const goalBits = [
      form.goalShort.trim() || "No short goal yet",
      form.goalDescription.trim() ? "detailed goal added" : null,
    ].filter(Boolean);
    const cadenceLabel = labelFor("checkin_cadence", form.cadence);
    const trackingBits = [
      form.requireBodyWeight ? "Weight" : null,
      form.requireProgressPhotos ? "photos" : null,
      form.requireSessionRpe ? "RPE" : null,
    ].filter(Boolean);
    const onReminders = REMINDER_CATEGORIES.filter((c) => reminders[c.type]).map(
      (c) => c.label.toLowerCase() + "s",
    );
    const offReminders = REMINDER_CATEGORIES.filter(
      (c) => !reminders[c.type],
    ).map((c) => c.label.toLowerCase() + "s");
    let reminderSummary = "All off";
    if (relationshipEnded) {
      // Reminders are only evaluated for active relationships (D-W7-7).
      reminderSummary = "Off while coaching is ended";
    } else if (onReminders.length && offReminders.length) {
      reminderSummary = `On for ${onReminders.join(" and ")} · off for ${offReminders.join(" and ")}`;
    } else if (onReminders.length) {
      reminderSummary = `On for ${onReminders.join(" and ")}`;
    }
    const checkinFormName =
      checkinForms.find(
        (item) =>
          checkinFormOptionValue(item) ===
          (form.formVersionId ?? GLOBAL_CHECKIN_FORM_VERSION_ID),
      )?.name ?? "FitBud weekly check-in";

    return {
      goal: goalBits.join(" · "),
      checkins: `${cadenceLabel} · ${form.dueWindowHours} h window · ${checkinFormName}`,
      expectations: `${form.sessionsPerWeek} workouts a week · ${form.mealsPerDay} meals a day · ${cadenceLabel.toLowerCase()} check-in`,
      tracking:
        trackingBits.length > 0 ? trackingBits.join(" · ") : "Nothing required",
      reminders: reminderSummary,
      checkinFormName,
    };
  }, [checkinForms, form, relationshipEnded, reminders]);

  async function onAcknowledgeDifference() {
    if (
      mutationsBlocked ||
      !effectivePlan ||
      !configurationMatchesForm ||
      consistencyWarnings.length === 0
    ) {
      setError("Save the configuration before acknowledging this difference.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.acknowledgePlanConsistency(
        effectivePlan.planId,
        effectivePlan.versionId,
        { fingerprint: consistencyFingerprintValue },
      );
      setAcknowledgedFingerprint(result.fingerprint);
      setMessage(
        "The difference is acknowledged. Assignments and exceptions are unchanged.",
      );
    } catch (err) {
      if (noteEndedElsewhere(err)) return;
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not acknowledge the difference.",
      );
    } finally {
      setActing(false);
    }
  }

  /** Persist form fields (and the preferred check-in form) into the open draft. */
  async function persistConfigurationFields(
    expected: number,
    options: { assignForm?: boolean } = {},
  ): Promise<CoachingConfiguration> {
    const saved = await apiClient.saveConfigurationDraft(relationshipId, {
      expectedVersion: expected,
      goalShort: form.goalShort.trim() || null,
      goalDescription: form.goalDescription.trim() || null,
      notes: form.notes.trim() || null,
      workout: {
        sessionsPerWeek: form.sessionsPerWeek,
        completionWindowHours: form.completionWindowHours,
      },
      nutrition: {
        mealsPerDay: form.mealsPerDay,
        confirmationWindowHours: form.confirmationWindowHours,
        photoRequirement: form.photoRequirement,
      },
      checkin: {
        cadence: form.cadence,
        dueWindowHours: form.dueWindowHours,
        formVersionId: form.formVersionId,
      },
      tracking: {
        requireBodyWeight: form.requireBodyWeight,
        requireProgressPhotos: form.requireProgressPhotos,
        requireSessionRpe: form.requireSessionRpe,
      },
    });
    if (form.formVersionId && options.assignForm !== false) {
      await apiClient.assignPreferredCheckinForm(relationshipId, {
        checkinFormVersionId: form.formVersionId,
      });
    }
    return saved;
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    if (!relationshipId || readOnly || !online || status === "active") return;
    setActing(true);
    setError(null);
    setMessage(null);
    setGoalError(null);
    try {
      const saved = await persistConfigurationFields(expectedVersion);
      applyConfiguration(saved);
      setMessage("Draft saved.");
      showToast("Draft saved");
      reloadWorkspace();
    } catch (err) {
      if (noteEndedElsewhere(err)) return;
      if (
        err instanceof ApiClientError &&
        err.code === "CONFIGURATION_INCOMPLETE"
      ) {
        setGoalError("A short goal is required.");
        setForceGoalOpen(true);
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save configuration draft.",
      );
    } finally {
      setActing(false);
    }
  }

  /** Error text for a failed activate or Save as vN+1 (no misleading catch). */
  function activationErrorText(err: unknown, fallback: string): string {
    if (!(err instanceof ApiClientError)) return fallback;
    if (
      err.code === "CONFIGURATION_VERSION_CONFLICT" ||
      err.code === "IDEMPOTENCY_KEY_REUSE"
    ) {
      return "This setup changed elsewhere. Reload the page and try again.";
    }
    return err.message;
  }

  function openDialog(kind: "activate" | "save-version") {
    if (mutationsBlocked) return;
    setDialogError(null);
    setError(null);
    setMessage(null);
    setDialog(kind);
  }

  function closeDialog() {
    if (acting) return;
    setDialog(null);
    setDialogError(null);
  }

  /**
   * DS3 Activate (first setup): unsaved edits go into the draft first, then
   * one call to the atomic activate (Z5-2). On failure the dialog stays open
   * with the reason and the draft is left as it was saved.
   */
  async function confirmActivate() {
    if (!relationshipId || mutationsBlocked) return;
    setActing(true);
    setDialogError(null);
    try {
      let current = configuration;
      if (!current || hasUnsavedEdits) {
        current = await persistConfigurationFields(current?.recordVersion ?? 0);
        // Only the saved record moves; the form keeps what the trainer typed.
        setConfiguration(current);
      }
      const updated = await apiClient.activateConfiguration(
        relationshipId,
        { expectedVersion: current.recordVersion },
        createIdempotencyKey(),
      );
      applyConfiguration(updated);
      setDialog(null);
      setMessage(
        effectivePlan
          ? `Coaching with ${firstName} is active. ${firstName} starts today on ${effectivePlan.title}.`
          : `Coaching with ${firstName} is active. Nothing is scheduled until you publish a plan.`,
      );
      showToast("Coaching activated");
      reloadWorkspace();
    } catch (err) {
      if (noteEndedElsewhere(err)) {
        setDialog(null);
        return;
      }
      if (
        err instanceof ApiClientError &&
        err.code === "CONFIGURATION_INCOMPLETE" &&
        !form.goalShort.trim()
      ) {
        setGoalError("A short goal is required.");
        setForceGoalOpen(true);
      }
      setDialogError(
        activationErrorText(
          err,
          "Could not activate coaching. The draft is kept.",
        ),
      );
    } finally {
      setActing(false);
    }
  }

  /**
   * DS3 Save as vN+1. From the active version: create vN+1, write the edits
   * into it, then activate it (the API keeps today on vN and applies the new
   * targets from tomorrow, D12b). If a step fails after vN+1 was created, the
   * new draft is discarded so the active version is what stays; the edits
   * stay on screen. From a vN+1 draft saved earlier: save any edits into it,
   * then activate it.
   */
  async function confirmSaveVersion() {
    if (!relationshipId || !configuration || mutationsBlocked) return;
    setActing(true);
    setDialogError(null);
    const fromActive = configuration.status === "active";
    let created: CoachingConfiguration | null = null;
    try {
      let draft: CoachingConfiguration;
      if (fromActive) {
        created = await apiClient.createConfigurationVersion(
          relationshipId,
          { expectedVersion: configuration.recordVersion },
          createIdempotencyKey(),
        );
        // The check-in form was already assigned when it was picked (D-W8-5).
        draft = await persistConfigurationFields(created.recordVersion, {
          assignForm: false,
        });
        created = draft;
      } else {
        draft = hasUnsavedEdits
          ? await persistConfigurationFields(configuration.recordVersion)
          : configuration;
        setConfiguration(draft);
      }
      const updated = await apiClient.activateConfiguration(
        relationshipId,
        { expectedVersion: draft.recordVersion },
        createIdempotencyKey(),
      );
      applyConfiguration(updated);
      setDialog(null);
      setMessage(
        `Version ${updated.versionNumber} saved. New targets apply from ${
          tomorrowLabel ? `tomorrow, ${tomorrowLabel}` : "tomorrow"
        }.`,
      );
      showToast(`Saved as version ${updated.versionNumber}`);
      reloadWorkspace();
    } catch (err) {
      if (created) {
        // Put the server back on the active version; the edits stay on screen.
        const createdVersion = created.recordVersion;
        try {
          const remaining = await apiClient.discardConfigurationDraft(
            relationshipId,
            { expectedVersion: createdVersion },
          );
          if (remaining) setConfiguration(remaining);
        } catch {
          // Not discarded (it may have gone live after all): show what is saved.
          const latest = await apiClient
            .getCoachingConfiguration(relationshipId, { notFoundAsNull: true })
            .catch(() => null);
          if (latest) setConfiguration(latest);
        }
      }
      if (noteEndedElsewhere(err)) {
        setDialog(null);
        return;
      }
      setDialogError(
        activationErrorText(
          err,
          `Could not save version ${nextVersionNumber}. Your changes are still here.`,
        ),
      );
    } finally {
      setActing(false);
    }
  }

  /** Discard edits on an active version, or the vN+1 draft saved earlier. */
  async function discardChanges() {
    if (!configuration) return;
    if (configuration.status === "active") {
      // The check-in form was assigned on the server when it was picked
      // (D-W8-5), outside the version: Discard keeps it.
      const assignedForm = form.formVersionId;
      applyConfiguration(configuration);
      setForm((current) => ({ ...current, formVersionId: assignedForm }));
      setError(null);
      setMessage(null);
      return;
    }
    if (!relationshipId || mutationsBlocked) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const remaining = await apiClient.discardConfigurationDraft(
        relationshipId,
        { expectedVersion: configuration.recordVersion },
      );
      if (remaining) applyConfiguration(remaining);
      showToast(`Version ${configuration.versionNumber} discarded`);
      reloadWorkspace();
    } catch (err) {
      if (noteEndedElsewhere(err)) return;
      setError(activationErrorText(err, "Could not discard the draft."));
    } finally {
      setActing(false);
    }
  }

  async function toggleReminder(type: ReminderType, enabled: boolean) {
    if (!relationshipId || mutationsBlocked) return;
    const previous = reminders[type];
    setReminders((current) => ({ ...current, [type]: enabled }));
    setReminderSaving(type);
    try {
      const result = await apiClient.saveReminderRules(relationshipId, {
        rules: [{ reminderType: type, enabled }],
      });
      const next: Record<string, boolean> = { ...reminders, [type]: enabled };
      for (const item of result.items) {
        if (
          item.reminderType === "workout_reminder" ||
          item.reminderType === "meal_reminder" ||
          item.reminderType === "checkin_reminder"
        ) {
          next[item.reminderType] = item.enabled;
        }
      }
      setReminders(next);
      const label =
        REMINDER_CATEGORIES.find((c) => c.type === type)?.label ?? "Reminder";
      showToast(
        enabled ? `${label} reminders on` : `${label} reminders off`,
      );
    } catch (err) {
      setReminders((current) => ({ ...current, [type]: previous ?? true }));
      if (noteEndedElsewhere(err)) return;
      showToast(
        err instanceof ApiClientError
          ? err.message
          : "Could not update reminder.",
      );
    } finally {
      setReminderSaving(null);
    }
  }

  const clientWhatsapp = header?.clientWhatsappE164 ?? null;
  const openWhatsappHref = clientWhatsapp
    ? whatsappHref({
        phoneE164: clientWhatsapp,
        draftText: `Hi ${firstName}, checking in from FitBud about your coaching setup.`,
      })
    : null;

  const statusKey = status ?? "draft";
  const statusLabel = relationshipEnded
    ? "Ended"
    : status == null
      ? "Draft"
      : labelFor("coaching_configuration_status", statusKey);
  const endedOn = relationshipEnded
    ? endedDateLabel(header?.endedAt, header?.traineeTimezone)
    : null;
  const pageTitle = relationshipEnded
    ? "Coaching setup (ended)"
    : "Coaching setup";
  const pageLede = endedOn
    ? `Coaching with ${firstName} ended on ${endedOn}. This is the setup you last used.`
    : `Coaching with ${firstName} has ended. This is the setup you last used.`;
  const pendingReactivation = relationshipEnded
    ? (header?.pendingReactivation ?? null)
    : null;

  // ---- Z8-6 footer (frames 148/149) and DS3 dialogs ----
  const traineeZone = header?.traineeTimezone ?? null;
  const todayLabel = traineeDayLabel(traineeZone, 0);
  const tomorrowLabel = traineeDayLabel(traineeZone, 1);
  /** A vN+1 draft saved in an earlier visit (its active version sits behind it). */
  const nextDraftOpen =
    status === "draft" && (configuration?.versionNumber ?? 1) > 1;
  const editingActive = status === "active";
  const nextVersionNumber = editingActive
    ? (configuration?.versionNumber ?? 1) + 1
    : (configuration?.versionNumber ?? 1);
  const changes =
    editingActive && configuration ? versionChanges(configuration, form) : [];
  const hasUnsavedEdits =
    configuration != null &&
    (editingActive
      ? changes.length > 0
      : versionChanges(configuration, form).length > 0 ||
        (form.formVersionId ?? null) !==
          (configuration.checkin.formVersionId ?? null));
  // D17: Activate waits for every required section. A section counts as left
  // while its badge reads To do, or while its unsaved value is not valid.
  const formMissing = missingConfigurationSections({
    goalShort: form.goalShort,
    workout: {
      sessionsPerWeek: form.sessionsPerWeek,
      completionWindowHours: form.completionWindowHours,
    },
    nutrition: {
      mealsPerDay: form.mealsPerDay,
      confirmationWindowHours: form.confirmationWindowHours,
      photoRequirement: form.photoRequirement,
    },
    checkin: {
      cadence: form.cadence,
      dueWindowHours: form.dueWindowHours,
      formVersionId: form.formVersionId,
    },
    tracking: {
      requireBodyWeight: form.requireBodyWeight,
      requireProgressPhotos: form.requireProgressPhotos,
      requireSessionRpe: form.requireSessionRpe,
    },
  });
  const sectionsLeft = SECTION_ORDER.filter(
    (section) =>
      formMissing.includes(section) ||
      configureSectionStatus(section, form, configuration) === "todo",
  );
  const onboardingReady =
    header?.onboardingStatus === "coaching_ready" ||
    header?.onboardingStatus === "active";

  const activateRows: ActivateSummaryRow[] = (() => {
    const onReminders = REMINDER_CATEGORIES.filter((c) => reminders[c.type]);
    const reminderNames = onReminders.map((c) => c.label.toLowerCase() + "s");
    const reminderText =
      reminderNames.length === 0
        ? "All off"
        : reminderNames.length === 1
          ? reminderNames[0]!
          : `${reminderNames.slice(0, -1).join(", ")} and ${reminderNames.at(-1)}`;
    const rows: ActivateSummaryRow[] = [
      { label: "Start date", value: todayLabel ? `Today · ${todayLabel}` : "Today" },
      {
        label: "Workouts",
        value: `${form.sessionsPerWeek} a week${effectivePlan ? ` · ${effectivePlan.title}` : ""}`,
      },
      {
        label: "Meals",
        value: `${form.mealsPerDay} a day · log within ${form.confirmationWindowHours} h`,
      },
      {
        label: "Check-ins",
        value: `${labelFor("checkin_cadence", form.cadence)} · ${form.dueWindowHours} h window · ${summaries.checkinFormName}`,
      },
      { label: "Tracking", value: summaries.tracking },
      {
        label: "Reminders",
        value:
          reminderNames.length && quietHours
            ? `${reminderText.charAt(0).toUpperCase()}${reminderText.slice(1)} · quiet ${quietHours}`
            : `${reminderText.charAt(0).toUpperCase()}${reminderText.slice(1)}`,
      },
    ];
    if (steps.target != null) {
      rows.push({ label: "Steps target", value: `${stepsNumber(steps.target)} a day` });
    }
    rows.push({
      label: "Plan",
      value: effectivePlan
        ? `Published · ${effectivePlan.title}`
        : "Nothing scheduled until a plan is published",
    });
    return rows;
  })();
  const anyReminderOn = REMINDER_CATEGORIES.some((c) => reminders[c.type]);
  const activateNotice = anyReminderOn
    ? `Reminders follow this setup from ${todayLabel ?? "today"}, never in ${pronoun} quiet hours.`
    : null;

  if (loading) {
    return (
      <div className="workspace-page plan-config-page" aria-busy="true">
        <p className="muted">Loading configuration…</p>
      </div>
    );
  }

  if (error && !header && !configuration) {
    return (
      <div className="workspace-page plan-config-page">
        <p className="form-error" role="alert">
          {error}
        </p>
        <Link
          to={`/clients/${relationshipId}/overview`}
          className="button-secondary"
        >
          Back to workspace
        </Link>
      </div>
    );
  }

  const fieldsDisabled = acting || !canEdit;
  const sectionStatus = (section: ConfigurationSectionId) =>
    configureSectionStatus(section, form, configuration);

  return (
    <div
      className={`workspace-page plan-config-page configure-page${
        relationshipEnded ? "" : " configure-v3"
      }`}
      data-testid="screen-TW-11"
    >
      {relationshipEnded ? (
        // Z7-13 (DS7): ended title, lede and status in one quiet banner.
        <header className="configure-page-header readonly-banner">
          <svg
            className="readonly-banner-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5.6 5.6l12.8 12.8" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <div className="readonly-banner-copy">
            <h2 className="configure-page-title">{pageTitle}</h2>
            <p className="lede">{pageLede}</p>
          </div>
          <span
            className="status-badge readonly-banner-pill"
            data-testid="configure-status-pill"
          >
            {statusLabel}
          </span>
        </header>
      ) : (
        <>
          {/* Frames 148/149: no visible title; the Plans | Coaching setup switch names the page. */}
          <h2 className="sr-only">{pageTitle}</h2>
          <ConfigureToolbar
            relationshipId={relationshipId}
            note={configureStatusNote(configuration)}
          />
          <ClientSettingsMovedBanner
            relationshipId={relationshipId}
            firstName={firstName}
          />
        </>
      )}

      {header?.onboardingStatus !== "coaching_ready" &&
      header?.onboardingStatus !== "active" &&
      header?.onboardingStatus !== "ended" ? (
        <p className="banner-info" role="status">
          Finish onboarding review before editing coaching expectations.{" "}
          <Link to={`/clients/${relationshipId}/onboarding`}>
            Open onboarding review
          </Link>
        </p>
      ) : null}

      {status === "active" && !relationshipEnded ? (
        <p className="banner-info" role="status" data-testid="configure-active-banner">
          {`Version ${configuration?.versionNumber ?? 1} is active. Edits to goal, expectations, check-in window and tracking are saved as version ${nextVersionNumber}, with new targets from tomorrow. The steps target and check-in form change straight away.`}
        </p>
      ) : null}

      {endedNotice ? (
        <p
          className="banner-attention"
          role="status"
          data-testid="configure-ended-elsewhere"
        >
          {ENDED_ELSEWHERE_MESSAGE}
        </p>
      ) : null}

      {pendingReactivation ? (
        <p
          className="banner-info"
          role="status"
          data-testid="configure-pending-reactivation"
        >
          {`Waiting for ${firstName} to confirm${
            pendingReactivation.sentAt
              ? ` · sent ${formatRelative(pendingReactivation.sentAt)}`
              : ""
          }`}
        </p>
      ) : null}

      {/* Ended: reminders are off anyway (D-W7-7), so this would mislead. */}
      {notificationsOff && !relationshipEnded ? (
        <p className="banner-attention" role="status">
          {firstName} has turned off app notifications. Reminders can&apos;t
          reach {objPronoun}.
        </p>
      ) : null}

      {relationshipEnded ? (
        <>
          {/* Z7-13: frame 179 / DS7 read-only values, never greyed inputs. */}
          <section
            className="readonly-card"
            aria-label="Setup you last used"
            data-testid="configure-readonly"
          >
            <ReadOnlyFieldList>
              <ReadOnlyField
                label="Short goal"
                value={form.goalShort.trim() || "Not set"}
                wide
              />
              <ReadOnlyField
                label="Goal description"
                value={form.goalDescription.trim() || "Not set"}
                wide
              />
              <ReadOnlyField
                label="Workouts"
                value={`${form.sessionsPerWeek} a week · log within ${form.completionWindowHours} h`}
              />
              <ReadOnlyField
                label="Meals"
                value={`${form.mealsPerDay} a day · confirm within ${form.confirmationWindowHours} h · photos: ${labelFor(
                  "meal_photo_requirement",
                  form.photoRequirement,
                ).toLowerCase()}`}
              />
              <ReadOnlyField label="Check-ins" value={summaries.checkins} />
              <ReadOnlyField label="Reminders" value={summaries.reminders} />
              <ReadOnlyField label="Tracking" value={summaries.tracking} />
              <ReadOnlyField
                label="Subscription"
                value={
                  subscriptionForm.planName.trim()
                    ? `${subscriptionForm.planName.trim()} · ${labelFor(
                        "payment_frequency",
                        subscriptionForm.paymentFrequency,
                      )}`
                    : "No subscription yet"
                }
              />
              {subscriptionForm.planName.trim() ? (
                <>
                  <ReadOnlyField
                    label="Starts on"
                    value={civilDateOrNotSet(subscriptionForm.startsOn)}
                  />
                  {/* No live "renews" wording (Z7-11): the stored date was the due date. */}
                  <ReadOnlyField
                    label="Due on"
                    value={civilDateOrNotSet(subscriptionForm.renewsOn)}
                  />
                </>
              ) : null}
            </ReadOnlyFieldList>
          </section>
          <PlanConsistencyNotice
            warnings={consistencyWarnings}
            acknowledged={
              acknowledgedFingerprint === consistencyFingerprintValue
            }
            planTo={`/clients/${relationshipId}/plan`}
            configureTo={`/clients/${relationshipId}/configure`}
            showPlanLink={false}
            showConfigureLink={false}
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
      <form
        className="configure-accordion-list"
        onSubmit={(event) => {
          void saveDraft(event);
        }}
      >
        <AccordionSection
          id="configure-goal"
          title="Goal"
          summary={summaries.goal}
          status={sectionStatus("goal")}
          defaultOpen
          forceOpen={forceGoalOpen}
          error={goalError}
        >
          <div className="cs-fields">
            <label className="cs-field">
              <span className="cs-field-label">Goal</span>
              <input
                type="text"
                name="goalShort"
                maxLength={120}
                aria-describedby="configure-goal-count"
                value={form.goalShort}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goalShort: event.target.value,
                  }))
                }
                disabled={fieldsDisabled}
                required
              />
              <span className="cs-field-help" id="configure-goal-count">
                {form.goalShort.length} of 120
              </span>
            </label>
            <label className="cs-field">
              <span className="cs-field-label">Detailed goal · private</span>
              <textarea
                name="goalDescription"
                maxLength={500}
                rows={2}
                aria-describedby="configure-goal-detail-help"
                value={form.goalDescription}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goalDescription: event.target.value,
                  }))
                }
                disabled={fieldsDisabled}
              />
              <span className="cs-field-help" id="configure-goal-detail-help">
                Only you see this · {form.goalDescription.length} of 500
              </span>
            </label>
          </div>
        </AccordionSection>

        <AccordionSection
          id="configure-expectations"
          title="Expectations"
          summary={
            steps.target != null
              ? `${summaries.expectations} · ${stepsNumber(steps.target)} steps a day`
              : summaries.expectations
          }
          status={sectionStatus("expectations")}
        >
          <ExpectationsTable
            form={form}
            onChange={(patch) =>
              setForm((current) => ({ ...current, ...patch }))
            }
            disabled={fieldsDisabled}
            checkinFormName={summaries.checkinFormName}
            firstName={firstName}
            steps={{ ...steps, disabled: stepsDisabled }}
            stepsBlockedReason={stepsBlockedReason}
          />
        </AccordionSection>

        <AccordionSection
          id="configure-checkins"
          title="Check-ins"
          summary={summaries.checkins}
          status={sectionStatus("checkins")}
        >
          <div className="cs-fields cs-fields-row">
            <label className="cs-field">
              <span className="cs-field-label">Due window (hours)</span>
              <input
                disabled={fieldsDisabled}
                type="number"
                name="dueWindowHours"
                min={1}
                max={168}
                value={form.dueWindowHours}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueWindowHours: Number(event.target.value),
                  }))
                }
              />
            </label>
            {/* Not in a disabled fieldset: on an active version the form is
                still assigned for the next check-in (D-W8-5). */}
            <label className="cs-field">
              <span className="cs-field-label">Check-in form</span>
              <select
                name="checkinForm"
                aria-describedby="configure-checkin-form-help"
                disabled={checkinFormDisabled}
                value={form.formVersionId ?? GLOBAL_CHECKIN_FORM_VERSION_ID}
                onChange={(event) => {
                  void changeCheckinForm(event.target.value || null);
                }}
              >
                {checkinForms.length === 0 ? (
                  <option value={GLOBAL_CHECKIN_FORM_VERSION_ID}>
                    FitBud weekly check-in
                  </option>
                ) : (
                  checkinForms.map((item) => (
                    <option key={item.id} value={checkinFormOptionValue(item)}>
                      {item.ownership === "global"
                        ? `${item.name} (FitBud base)`
                        : `${item.name} (Mine)`}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          <p className="cs-field-help" id="configure-checkin-form-help">
            {status === "active"
              ? `Changing the form applies from ${firstName}'s next check-in. The rest of this version stays as it is.`
              : "The next scheduled check-in uses this form."}{" "}
            Fork and edit forms under Templates · Check-ins.
          </p>
        </AccordionSection>

        <AccordionSection
          id="configure-tracking"
          title="Tracking"
          summary={summaries.tracking}
          status={sectionStatus("tracking")}
        >
          <fieldset
            className="configure-switch-list"
            disabled={fieldsDisabled || !canEdit}
          >
            <label className="configure-switch">
              <span>Body weight</span>
              <input
                disabled={fieldsDisabled}
                type="checkbox"
                role="switch"
                className="configure-switch-input"
                aria-checked={form.requireBodyWeight}
                checked={form.requireBodyWeight}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requireBodyWeight: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="configure-switch">
              <span>Progress photos</span>
              <input
                disabled={fieldsDisabled}
                type="checkbox"
                role="switch"
                className="configure-switch-input"
                aria-checked={form.requireProgressPhotos}
                checked={form.requireProgressPhotos}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requireProgressPhotos: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="configure-switch">
              <span>Session RPE</span>
              <input
                disabled={fieldsDisabled}
                type="checkbox"
                role="switch"
                className="configure-switch-input"
                aria-checked={form.requireSessionRpe}
                checked={form.requireSessionRpe}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requireSessionRpe: event.target.checked,
                  }))
                }
              />
            </label>
          </fieldset>
        </AccordionSection>

        <AccordionSection
          id="configure-reminders"
          title="Automatic reminders"
          summary={summaries.reminders}
          // Rules save on change, but there is nothing to badge before the
          // first configuration exists (Z8-5 review).
          status={configuration ? "done" : undefined}
        >
          <fieldset
            className="configure-switch-list"
            disabled={mutationsBlocked}
          >
            {REMINDER_CATEGORIES.map((category) => (
              <label key={category.type} className="configure-switch">
                <span>{category.label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="configure-switch-input"
                  aria-checked={Boolean(reminders[category.type])}
                  checked={Boolean(reminders[category.type])}
                  disabled={
                    mutationsBlocked || reminderSaving === category.type
                  }
                  onChange={(event) => {
                    void toggleReminder(category.type, event.target.checked);
                  }}
                />
              </label>
            ))}
          </fieldset>
          <p className="configure-reminder-note">
            FitBud times reminders around {firstName}&apos;s meal times and
            workout time, only when something isn&apos;t logged, and never in{" "}
            {pronoun} quiet hours{quietHours ? ` (${quietHours})` : ""}.{" "}
            {firstName} controls{" "}
            {pronoun} own notification settings and can adjust {pronoun} meal
            times.
            {header?.hasCustomMealTimes
              ? ` ${firstName} has customized meal times in the app.`
              : ""}
          </p>
          <div className="configure-wa-reminders">
            {waAutomationOn ? (
              <p className="muted">
                WhatsApp reminders: used when app notifications don&apos;t reach{" "}
                {firstName}. The trainer can&apos;t opt a client in.
              </p>
            ) : (
              <p>
                WhatsApp reminders ·{" "}
                <span className="chip-coming">Coming soon</span>. FitBud reminds{" "}
                {firstName} in the app for now.
              </p>
            )}
            {relationshipEnded ? null : openWhatsappHref ? (
              <a
                className="button-secondary button-whatsapp"
                href={openWhatsappHref}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppGlyph />
                Open WhatsApp
              </a>
            ) : (
              <Button variant="whatsapp" disabled>
                <WhatsAppGlyph />
                Open WhatsApp
              </Button>
            )}
          </div>
        </AccordionSection>

        <PlanConsistencyNotice
          warnings={consistencyWarnings}
          acknowledged={
            acknowledgedFingerprint === consistencyFingerprintValue
          }
          acting={acting || mutationsBlocked}
          onAcknowledge={
            configurationMatchesForm || mutationsBlocked
              ? () => {
                  void onAcknowledgeDifference();
                }
              : undefined
          }
          planTo={`/clients/${relationshipId}/plan`}
          configureTo={`/clients/${relationshipId}/configure`}
          showPlanLink={!relationshipEnded}
          showConfigureLink={false}
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="banner-info" role="status">
            {message}
          </p>
        ) : null}
      </form>
      )}

      {/* Ended: no actions, and the status sits in the banner (DS7). */}
      {relationshipEnded ? null : (
      <footer
        className="screen-sticky-footer configure-sticky-footer"
        data-testid="configure-footer"
      >
        {editingActive || nextDraftOpen ? (
          <>
            <span
              className={`cs-footer-pill ${editingActive ? "is-active" : "is-draft"}`}
              data-testid="configure-status-pill"
            >
              {editingActive ? (
                `Active · v${configuration?.versionNumber ?? 1}`
              ) : (
                <>
                  <PencilLine size={13} strokeWidth={2.2} aria-hidden="true" />
                  {`Draft · v${nextVersionNumber}`}
                </>
              )}
            </span>
            <p className="cs-footer-hint" data-testid="configure-footer-hint">
              {editingActive
                ? hasUnsavedEdits
                  ? `Saving creates v${nextVersionNumber} from ${
                      tomorrowLabel ? `tomorrow, ${tomorrowLabel}` : "tomorrow"
                    }. Today stays on v${configuration?.versionNumber ?? 1}.`
                  : `Edit a section to start v${nextVersionNumber}.`
                : `v${nextVersionNumber} is a saved draft. Saving makes its targets apply from ${
                    tomorrowLabel ? `tomorrow, ${tomorrowLabel}` : "tomorrow"
                  }.`}
            </p>
            <div className="screen-sticky-footer-actions">
              <Button
                variant="secondary"
                disabled={
                  acting ||
                  (editingActive ? !hasUnsavedEdits : mutationsBlocked)
                }
                onClick={() => {
                  void discardChanges();
                }}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                disabled={
                  acting ||
                  mutationsBlocked ||
                  (editingActive ? !hasUnsavedEdits : sectionsLeft.length > 0)
                }
                onClick={() => openDialog("save-version")}
              >
                {`Save as v${nextVersionNumber}`}
              </Button>
            </div>
          </>
        ) : (
          <>
            <span
              className="cs-footer-pill is-draft"
              data-testid="configure-status-pill"
            >
              <PencilLine size={13} strokeWidth={2.2} aria-hidden="true" />
              Draft
            </span>
            <p className="cs-footer-hint" data-testid="configure-footer-hint">
              {sectionsLeft.length > 0
                ? `${sectionsLeft.length} ${
                    sectionsLeft.length === 1 ? "section" : "sections"
                  } left: ${sectionsLeft.map((id) => SECTION_TITLES[id]).join(", ")}`
                : "Every section is done. Activate to start coaching."}
            </p>
            <div className="screen-sticky-footer-actions">
              <Button
                variant="secondary"
                disabled={acting || mutationsBlocked || !onboardingReady}
                onClick={() => {
                  void saveDraft();
                }}
              >
                {acting && dialog == null ? "Saving…" : "Save draft"}
              </Button>
              <Button
                variant="primary"
                disabled={
                  acting ||
                  mutationsBlocked ||
                  !onboardingReady ||
                  sectionsLeft.length > 0
                }
                onClick={() => openDialog("activate")}
              >
                Activate
              </Button>
            </div>
          </>
        )}
      </footer>
      )}

      {dialog === "activate" ? (
        <ActivateDialog
          firstName={firstName}
          rows={activateRows}
          notice={activateNotice}
          busy={acting}
          error={dialogError}
          onCancel={closeDialog}
          onConfirm={() => {
            void confirmActivate();
          }}
        />
      ) : null}
      {dialog === "save-version" && configuration ? (
        <SaveVersionDialog
          firstName={firstName}
          currentVersion={
            editingActive ? configuration.versionNumber : null
          }
          nextVersion={nextVersionNumber}
          changes={editingActive ? changes : null}
          startsLabel={tomorrowLabel}
          busy={acting}
          error={dialogError}
          onCancel={closeDialog}
          onConfirm={() => {
            void confirmSaveVersion();
          }}
        />
      ) : null}

      {toast ? (
        <div className="configure-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
