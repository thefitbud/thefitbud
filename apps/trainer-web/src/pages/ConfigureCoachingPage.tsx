import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinCadence,
  CheckinFormTemplateSummary,
  CoachingConfiguration,
  MealPhotoRequirement,
  PaymentFrequency,
  PlanContent,
  ReminderType,
  Subscription,
} from "@fitbud/contracts";
import {
  checkinCadenceSchema,
  mealPhotoRequirementSchema,
  paymentFrequencySchema,
} from "@fitbud/contracts";
import {
  COACHING_CONFIGURATION_DEFAULTS,
  GLOBAL_CHECKIN_FORM_VERSION_ID,
  consistencyFingerprint,
  formatCivilDate,
  labelFor,
  planConsistencyWarnings,
  possessivePronoun,
} from "@fitbud/core";
import { Button } from "../components/Button";
import { PlanConsistencyNotice } from "../components/PlanConsistencyNotice";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import { quietHoursText } from "../components/workspace/ResponsivenessPanel";
import { apiClient } from "../lib/api";
import { useConfig, isWhatsAppAutomationEnabled } from "../lib/config";
import { createIdempotencyKey } from "../lib/idempotency";
import { coachingPrefillFromIntake } from "../lib/intakePrefill";
import { stage1Api } from "../lib/stage1-api";
import { whatsappHref } from "../lib/whatsapp";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "../styles/plan.css";

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

const EMPTY_SUBSCRIPTION = {
  planName: "",
  paymentFrequency: "monthly" as PaymentFrequency,
  startsOn: "",
  renewsOn: "",
};

const REMINDER_CATEGORIES: Array<{
  type: ReminderType;
  label: string;
}> = [
  { type: "workout_reminder", label: "Workout" },
  { type: "meal_reminder", label: "Meal" },
  { type: "checkin_reminder", label: "Check-in" },
];

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Client";
}


function objectPronoun(gender: string | null | undefined): string {
  const g = (gender ?? "").trim().toLowerCase();
  if (g === "female" || g === "woman" || g === "f") return "her";
  if (g === "male" || g === "man" || g === "m") return "him";
  return "them";
}

function AccordionSection({
  id,
  title,
  summary,
  defaultOpen = false,
  forceOpen = false,
  children,
  error,
}: {
  id: string;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
  error?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <details
      className={`configure-accordion${error ? " has-error" : ""}`}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="configure-accordion-title">{title}</span>
        <span className="configure-accordion-summary">{summary}</span>
      </summary>
      <div className="configure-accordion-body" id={id}>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </details>
  );
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
  const [message, setMessage] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState(EMPTY_SUBSCRIPTION);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [effectivePlan, setEffectivePlan] = useState<{
    planId: string;
    versionId: string;
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
    setSubscription(value);
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

  const load = useCallback(async () => {
    if (!relationshipId) return;
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
      setSubscriptionError(null);

      setEffectivePlan(
        planResult.ok && planResult.value.plan && planResult.value.version
          ? {
              planId: planResult.value.plan.id,
              versionId: planResult.value.version.id,
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
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load coaching configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyConfiguration, applySubscription, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status: string | null = configuration?.status ?? null;
  const expectedVersion = configuration?.recordVersion ?? 0;
  const canEdit =
    !relationshipEnded &&
    status !== "active" &&
    (header?.onboardingStatus === "coaching_ready" ||
      header?.onboardingStatus === "active");
  const readOnly = !canEdit;
  const mutationsBlocked = !online || relationshipEnded;

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
      form.goalDescription.trim() ? "description added" : null,
    ].filter(Boolean);
    const photoLabel = labelFor(
      "meal_photo_requirement",
      form.photoRequirement,
    );
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
    if (onReminders.length && offReminders.length) {
      reminderSummary = `On for ${onReminders.join(" and ")} · off for ${offReminders.join(" and ")}`;
    } else if (onReminders.length) {
      reminderSummary = `On for ${onReminders.join(" and ")}`;
    }
    const freqLabel = labelFor(
      "payment_frequency",
      subscriptionForm.paymentFrequency,
    );
    const renewCivil = subscriptionForm.renewsOn
      ? formatCivilDate(subscriptionForm.renewsOn, { includeWeekday: false })
      : null;

    return {
      goal: goalBits.join(" · "),
      workouts: `${form.sessionsPerWeek} sessions/week · log within ${form.completionWindowHours} h`,
      nutrition: `${form.mealsPerDay} meals/day · photo: ${photoLabel.toLowerCase()}`,
      checkins: `${cadenceLabel} · ${form.dueWindowHours} h window · ${
        checkinForms.find(
          (item) =>
            item.latestVersionId ===
            (form.formVersionId ?? GLOBAL_CHECKIN_FORM_VERSION_ID),
        )?.name ?? "FitBud weekly check-in"
      }`,
      tracking:
        trackingBits.length > 0 ? trackingBits.join(" · ") : "Nothing required",
      reminders: reminderSummary,
      subscription: subscriptionForm.planName.trim()
        ? `${freqLabel}${renewCivil ? ` · renews ${renewCivil}` : ""}`
        : "No subscription yet",
    };
  }, [checkinForms, form, reminders, subscriptionForm]);

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
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not acknowledge the difference.",
      );
    } finally {
      setActing(false);
    }
  }

  /** Persist form fields (including preferred check-in form) before status transitions. */
  async function persistConfigurationFields(
    expected: number,
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
    if (form.formVersionId) {
      await apiClient.assignPreferredCheckinForm(relationshipId, {
        checkinFormVersionId: form.formVersionId,
      });
    }
    return saved;
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    if (!relationshipId || readOnly || !online) return;
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

  async function markConfigured() {
    if (!relationshipId || mutationsBlocked || !online) return;
    if (!form.goalShort.trim()) {
      setGoalError("A short goal is required.");
      setForceGoalOpen(true);
      setError("A short goal is required before marking configured.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    setGoalError(null);
    try {
      // Always persist form fields (including check-in form) before status change.
      let current = await persistConfigurationFields(
        configuration?.recordVersion ?? expectedVersion,
      );
      applyConfiguration(current);
      if (current.status === "draft") {
        current = await apiClient.configureConfiguration(
          relationshipId,
          { expectedVersion: current.recordVersion },
          createIdempotencyKey(),
        );
        applyConfiguration(current);
      }
      showToast("Marked configured");
      reloadWorkspace();
    } catch (err) {
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
          : "Could not mark configured.",
      );
    } finally {
      setActing(false);
    }
  }

  async function activate() {
    if (!relationshipId || !configuration || mutationsBlocked) return;
    setActing(true);
    setError(null);
    setMessage(null);
    setGoalError(null);
    try {
      let current = configuration;
      const currentStatus: string = current.status;
      if (currentStatus === "draft" || currentStatus === "configured") {
        if (!form.goalShort.trim()) {
          setGoalError("A short goal is required.");
          setForceGoalOpen(true);
          setError("A short goal is required before activation.");
          return;
        }
        current = await persistConfigurationFields(current.recordVersion);
        applyConfiguration(current);
      }
      if (current.status === "draft") {
        current = await apiClient.configureConfiguration(
          relationshipId,
          { expectedVersion: current.recordVersion },
          createIdempotencyKey(),
        );
        applyConfiguration(current);
      }
      const updated = await apiClient.activateConfiguration(
        relationshipId,
        { expectedVersion: current.recordVersion },
        createIdempotencyKey(),
      );
      applyConfiguration(updated);
      setMessage(
        "Configuration is active. Publish a plan so the trainee can start.",
      );
      showToast("Configuration activated");
      reloadWorkspace();
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.code === "CONFIGURATION_INCOMPLETE"
      ) {
        setGoalError("A short goal is required.");
        setForceGoalOpen(true);
      }
      if (
        err instanceof ApiClientError &&
        err.code === "CONFIGURATION_NOT_EDITABLE"
      ) {
        setError(
          "This version is active. Create a new version to change it.",
        );
      } else if (err instanceof ApiClientError && err.status === 409) {
        setError("This configuration changed elsewhere. Reload and try again.");
      } else {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not activate configuration.",
        );
      }
    } finally {
      setActing(false);
    }
  }

  async function createNewVersion() {
    if (!relationshipId || !configuration || mutationsBlocked) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const created = await apiClient.createConfigurationVersion(
        relationshipId,
        { expectedVersion: configuration.recordVersion },
        createIdempotencyKey(),
      );
      applyConfiguration(created);
      setForceGoalOpen(true);
      setMessage("New draft version created. Edit and activate when ready.");
      showToast("New version created");
      reloadWorkspace();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not create a new version.",
      );
    } finally {
      setActing(false);
    }
  }

  async function saveSubscriptionFields() {
    if (!relationshipId || mutationsBlocked) return;
    setActing(true);
    setSubscriptionError(null);
    try {
      const saved = await apiClient.saveSubscription(
        relationshipId,
        {
          expectedVersion: subscription?.versionNumber ?? 0,
          planName: subscriptionForm.planName.trim(),
          paymentFrequency: subscriptionForm.paymentFrequency,
          startsOn: subscriptionForm.startsOn,
          renewsOn: subscriptionForm.renewsOn,
        },
        createIdempotencyKey(),
      );
      applySubscription(saved);
      showToast("Subscription saved");
      reloadWorkspace();
    } catch (err) {
      setSubscriptionError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save the subscription.",
      );
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

  const statusKey =
    status === "draft" ||
    status === "configured" ||
    status === "active" ||
    status === "superseded"
      ? status
      : "draft";
  const statusLabel =
    status == null
      ? "Draft"
      : labelFor("coaching_configuration_status", statusKey);

  const primaryAction = (() => {
    if (relationshipEnded) return null;
    if (status === "active") {
      return {
        label: "Create new version",
        onClick: () => {
          void createNewVersion();
        },
        disabled: acting || mutationsBlocked,
      };
    }
    if (status === "configured") {
      return {
        label: "Activate",
        onClick: () => {
          void activate();
        },
        disabled: acting || mutationsBlocked,
      };
    }
    return {
      label: "Save draft",
      onClick: () => {
        void saveDraft();
      },
      disabled:
        acting ||
        mutationsBlocked ||
        (header?.onboardingStatus !== "coaching_ready" &&
          header?.onboardingStatus !== "active"),
    };
  })();

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
  const subscriptionDisabled = acting || relationshipEnded;

  return (
    <div
      className="workspace-page plan-config-page configure-page"
      data-testid="screen-TW-11"
    >
      <header className="configure-page-header">
        <h2 className="configure-page-title">Configure coaching</h2>
        <p className="lede">
          Set the baseline for {firstName}: goals, expectations, reminders, and
          subscription.
        </p>
      </header>

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

      {status === "active" ? (
        <p className="banner-info" role="status">
          This version is active. Create a new version to change it.
        </p>
      ) : null}

      {header?.onboardingStatus === "ended" ? (
        <p className="banner-info" role="status">
          This coaching relationship has ended. Configuration is read-only.
        </p>
      ) : null}

      {notificationsOff ? (
        <p className="banner-attention" role="status">
          {firstName} has turned off app notifications. Reminders can&apos;t
          reach {objPronoun}.
        </p>
      ) : null}

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
          defaultOpen
          forceOpen={forceGoalOpen}
          error={goalError}
        >
          <div className="plan-form">
            <label className="field">
              <span>
                Short goal{" "}
                <span className="field-counter">
                  {form.goalShort.length}/120
                </span>
              </span>
              <input
                type="text"
                name="goalShort"
                maxLength={120}
                value={form.goalShort}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goalShort: event.target.value,
                  }))
                }
                disabled={fieldsDisabled || !canEdit}
                required
              />
            </label>
            <label className="field">
              <span>
                Goal description{" "}
                <span className="field-counter">
                  {form.goalDescription.length}/500
                </span>
              </span>
              <textarea
                name="goalDescription"
                maxLength={500}
                value={form.goalDescription}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goalDescription: event.target.value,
                  }))
                }
                disabled={fieldsDisabled || !canEdit}
              />
            </label>
          </div>
        </AccordionSection>

        <AccordionSection
          id="configure-workouts"
          title="Workouts"
          summary={summaries.workouts}
        >
          <fieldset className="plan-form" disabled={fieldsDisabled || !canEdit}>
            <label className="field">
              <span>Sessions per week</span>
              <input
                type="number"
                min={1}
                max={7}
                value={form.sessionsPerWeek}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sessionsPerWeek: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Completion window (hours)</span>
              <input
                type="number"
                min={1}
                max={72}
                value={form.completionWindowHours}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    completionWindowHours: Number(event.target.value),
                  }))
                }
              />
            </label>
          </fieldset>
        </AccordionSection>

        <AccordionSection
          id="configure-nutrition"
          title="Nutrition"
          summary={summaries.nutrition}
        >
          <fieldset className="plan-form" disabled={fieldsDisabled || !canEdit}>
            <label className="field">
              <span>Meals per day</span>
              <input
                type="number"
                min={1}
                max={8}
                value={form.mealsPerDay}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mealsPerDay: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Confirmation window (hours)</span>
              <input
                type="number"
                min={1}
                max={48}
                value={form.confirmationWindowHours}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    confirmationWindowHours: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Meal photo requirement</span>
              <select
                value={form.photoRequirement}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    photoRequirement: event.target
                      .value as MealPhotoRequirement,
                  }))
                }
              >
                {mealPhotoRequirementSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("meal_photo_requirement", option)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </AccordionSection>

        <AccordionSection
          id="configure-checkins"
          title="Check-ins"
          summary={summaries.checkins}
        >
          <fieldset className="plan-form" disabled={fieldsDisabled || !canEdit}>
            <label className="field">
              <span>Cadence</span>
              <select
                value={form.cadence}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    cadence: event.target.value as CheckinCadence,
                  }))
                }
              >
                {checkinCadenceSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("checkin_cadence", option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Due window (hours)</span>
              <input
                type="number"
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
            <label className="field">
              <span>Check-in form</span>
              <select
                value={form.formVersionId ?? GLOBAL_CHECKIN_FORM_VERSION_ID}
                onChange={(event) => {
                  const next = event.target.value || null;
                  setForm((current) => ({
                    ...current,
                    formVersionId:
                      next === GLOBAL_CHECKIN_FORM_VERSION_ID ? null : next,
                  }));
                  if (
                    relationshipId &&
                    configuration?.status === "active" &&
                    next
                  ) {
                    void apiClient
                      .assignPreferredCheckinForm(relationshipId, {
                        checkinFormVersionId: next,
                      })
                      .then(() =>
                        showToast("Check-in form assigned for next check-in"),
                      )
                      .catch((err: unknown) =>
                        setError(
                          err instanceof ApiClientError
                            ? err.message
                            : "Could not assign check-in form.",
                        ),
                      );
                  }
                }}
              >
                {checkinForms.length === 0 ? (
                  <option value={GLOBAL_CHECKIN_FORM_VERSION_ID}>
                    FitBud weekly check-in
                  </option>
                ) : (
                  checkinForms.map((item) => (
                    <option key={item.id} value={item.latestVersionId}>
                      {item.ownership === "global"
                        ? `${item.name} (FitBud base)`
                        : `${item.name} (Mine)`}
                    </option>
                  ))
                )}
              </select>
            </label>
            <p className="muted">
              Fork and edit forms under Templates · Check-ins. The next scheduled
              check-in uses this form.
            </p>
          </fieldset>
        </AccordionSection>

        <AccordionSection
          id="configure-tracking"
          title="Tracking"
          summary={summaries.tracking}
        >
          <fieldset
            className="configure-switch-list"
            disabled={fieldsDisabled || !canEdit}
          >
            <label className="configure-switch">
              <span>Body weight</span>
              <input
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
                  disabled={reminderSaving === category.type}
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
            {openWhatsappHref ? (
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

        <AccordionSection
          id="configure-subscription"
          title="Subscription"
          summary={summaries.subscription}
        >
          <div className="plan-form">
            <label className="field">
              <span>Plan name</span>
              <input
                type="text"
                name="planName"
                maxLength={120}
                value={subscriptionForm.planName}
                disabled={subscriptionDisabled}
                onChange={(event) =>
                  setSubscriptionForm((current) => ({
                    ...current,
                    planName: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Payment frequency</span>
              <select
                name="paymentFrequency"
                value={subscriptionForm.paymentFrequency}
                disabled={subscriptionDisabled}
                onChange={(event) =>
                  setSubscriptionForm((current) => ({
                    ...current,
                    paymentFrequency: event.target
                      .value as PaymentFrequency,
                  }))
                }
              >
                {paymentFrequencySchema.options.map((option) => (
                  <option key={option} value={option}>
                    {labelFor("payment_frequency", option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Starts on</span>
              <input
                type="date"
                name="startsOn"
                value={subscriptionForm.startsOn}
                disabled={subscriptionDisabled}
                onChange={(event) =>
                  setSubscriptionForm((current) => ({
                    ...current,
                    startsOn: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Renews on</span>
              <input
                type="date"
                name="renewsOn"
                value={subscriptionForm.renewsOn}
                disabled={subscriptionDisabled}
                onChange={(event) =>
                  setSubscriptionForm((current) => ({
                    ...current,
                    renewsOn: event.target.value,
                  }))
                }
              />
            </label>
            {subscriptionError ? (
              <p className="form-error" role="alert">
                {subscriptionError}
              </p>
            ) : null}
            {!relationshipEnded ? (
              <Button
                type="button"
                variant="secondary"
                disabled={acting || !online}
                onClick={() => {
                  void saveSubscriptionFields();
                }}
              >
                Save subscription
              </Button>
            ) : null}
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

      <footer className="screen-sticky-footer configure-sticky-footer">
        <span
          className={`status-badge status-${statusKey}`}
          data-testid="configure-status-pill"
        >
          <span className="status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
        <div className="screen-sticky-footer-actions">
          {status === "draft" && form.goalShort.trim() && canEdit ? (
            <Button
              variant="secondary"
              disabled={acting || mutationsBlocked}
              onClick={() => {
                void markConfigured();
              }}
            >
              Mark configured
            </Button>
          ) : null}
          {primaryAction ? (
            <Button
              variant="primary"
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {acting ? "Working…" : primaryAction.label}
            </Button>
          ) : null}
        </div>
      </footer>

      {toast ? (
        <div className="configure-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
