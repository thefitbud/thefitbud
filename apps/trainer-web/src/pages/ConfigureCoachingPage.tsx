import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinCadence,
  CoachingConfiguration,
  CoachingRelationship,
  OnboardingFormResponse,
  OnboardingFormVersion,
  MealPhotoRequirement,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { coachingPrefillFromIntake } from "../lib/intakePrefill";
import "../styles/plan.css";

const DEFAULT_FORM = {
  primaryGoal: "",
  notes: "",
  sessionsPerWeek: 3,
  completionWindowHours: 24,
  mealsPerDay: 3,
  confirmationWindowHours: 6,
  photoRequirement: "none" as MealPhotoRequirement,
  cadence: "weekly" as CheckinCadence,
  dueWindowHours: 48,
  requireBodyWeight: false,
  requireProgressPhotos: false,
  requireSessionRpe: false,
};

function configurationStatusLabel(
  status: CoachingConfiguration["status"] | "not_configured",
): string {
  switch (status) {
    case "not_configured":
      return "Not configured";
    case "draft":
      return "Draft";
    case "configured":
      return "Configured";
    case "active":
      return "Active";
    case "superseded":
      return "Superseded";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function ConfigureCoachingPage() {
  const { relationshipId = "" } = useParams();
  const [relationship, setRelationship] = useState<CoachingRelationship | null>(
    null,
  );
  const [configuration, setConfiguration] =
    useState<CoachingConfiguration | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [intake, setIntake] = useState<OnboardingFormResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyConfiguration = useCallback((config: CoachingConfiguration) => {
    setConfiguration(config);
    setForm({
      primaryGoal: config.primaryGoal ?? "",
      notes: config.notes ?? "",
      sessionsPerWeek: config.workout.sessionsPerWeek,
      completionWindowHours: config.workout.completionWindowHours,
      mealsPerDay: config.nutrition.mealsPerDay,
      confirmationWindowHours: config.nutrition.confirmationWindowHours,
      photoRequirement: config.nutrition.photoRequirement,
      cadence: config.checkin.cadence,
      dueWindowHours: config.checkin.dueWindowHours,
      requireBodyWeight: config.tracking.requireBodyWeight,
      requireProgressPhotos: config.tracking.requireProgressPhotos,
      requireSessionRpe: config.tracking.requireSessionRpe,
    });
  }, []);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    try {
      const rel = await apiClient.getRelationship(relationshipId);
      setRelationship(rel);

      const [configResult, intakeResult, definitionResult] = await Promise.all([
        apiClient.getCoachingConfiguration(relationshipId).then(
          (value) => ({ ok: true as const, value }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        apiClient.getOnboardingResponse(relationshipId).then(
          (value) => ({ ok: true as const, value }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        apiClient.getCurrentOnboardingForm(relationshipId).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
      ]);

      const submittedIntake =
        intakeResult.ok && intakeResult.value.status === "submitted"
          ? intakeResult.value
          : null;
      setIntake(submittedIntake);
      setDefinition(definitionResult.ok ? definitionResult.value : null);

      if (configResult.ok) {
        applyConfiguration(configResult.value);
      } else if (
        configResult.err instanceof ApiClientError &&
        configResult.err.status === 404
      ) {
        setConfiguration(null);
        const prefill = submittedIntake
          ? coachingPrefillFromIntake(submittedIntake.answers)
          : { primaryGoal: "", notes: "" };
        setForm({
          ...DEFAULT_FORM,
          primaryGoal: prefill.primaryGoal,
          notes: prefill.notes,
        });
      } else {
        throw configResult.err;
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load coaching configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyConfiguration, relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = configuration?.status === "active";
  const expectedVersion = configuration?.recordVersion ?? 0;

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!relationshipId || readOnly) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await apiClient.saveConfigurationDraft(relationshipId, {
        expectedVersion,
        primaryGoal: form.primaryGoal.trim() || null,
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
        },
        tracking: {
          requireBodyWeight: form.requireBodyWeight,
          requireProgressPhotos: form.requireProgressPhotos,
          requireSessionRpe: form.requireSessionRpe,
        },
      });
      applyConfiguration(saved);
      setMessage("Draft saved.");
    } catch (err) {
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
    if (!relationshipId || !configuration) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiClient.configureConfiguration(
        relationshipId,
        { expectedVersion: configuration.recordVersion },
        createIdempotencyKey(),
      );
      applyConfiguration(updated);
      setMessage("Configuration marked configured.");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not mark configuration configured.",
      );
    } finally {
      setActing(false);
    }
  }

  async function activate() {
    if (!relationshipId || !configuration) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiClient.activateConfiguration(
        relationshipId,
        { expectedVersion: configuration.recordVersion },
        createIdempotencyKey(),
      );
      applyConfiguration(updated);
      setMessage("Configuration is active. Publish a plan so the trainee can start.");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not activate configuration.",
      );
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page plan-config-page" aria-busy="true">
        <p className="muted">Loading configuration…</p>
      </div>
    );
  }

  if (error && !relationship) {
    return (
      <div className="workspace-page plan-config-page">
        <p className="form-error" role="alert">
          {error}
        </p>
        <Link to={`/clients/${relationshipId}/overview`} className="button-secondary">
          Back to workspace
        </Link>
      </div>
    );
  }

  if (!relationship) {
    return null;
  }

  const statusKey = configuration?.status ?? "not_configured";
  const canSave =
    relationship.onboardingStatus === "coaching_ready" && !readOnly;
  const canConfigure =
    configuration?.status === "draft" &&
    Boolean(form.primaryGoal.trim()) &&
    !acting;
  const canActivate = configuration?.status === "configured" && !acting;
  const intakeFields =
    definition && intake
      ? definition.fields.map((field) => ({
          id: field.id,
          label: field.label,
          value: intake.answers[field.id]?.trim() || "—",
        }))
      : [];

  return (
    <div className="workspace-page plan-config-page">
      <div className="workspace-toolbar">
        <div>
          <p className="workspace-kicker">Client settings</p>
          <h2 className="workspace-card-title">Coaching configuration</h2>
          <p className="lede">
            Use submitted onboarding answers beside these expectations. Activate
            when the baseline is ready. This is separate from the plan.
          </p>
        </div>
        <div className="workspace-header-actions">
          <Link
            className="button-ghost"
            to={`/clients/${relationship.id}/overview`}
          >
            Back to overview
          </Link>
          <span className={`status-badge status-${statusKey}`}>
            <span className="status-dot" aria-hidden="true" />
            {configurationStatusLabel(statusKey)}
          </span>
        </div>
      </div>

      {relationship.onboardingStatus !== "coaching_ready" ? (
        <p className="banner-info" role="status">
          Finish onboarding review before editing coaching expectations.{" "}
          <Link to={`/clients/${relationship.id}/onboarding`}>
            Open onboarding review
          </Link>
        </p>
      ) : null}

      {readOnly ? (
        <p className="banner-info" role="status">
          This configuration is active and locked. Publish or adjust the plan
          for this client next. These baseline expectations stay as recorded.
        </p>
      ) : null}

      <div className="plan-config-split">
        <aside className="plan-card" aria-labelledby="intake-context-heading">
          <div className="workspace-card-head">
            <h2 id="intake-context-heading" className="plan-section-title">
              Submitted onboarding
            </h2>
            <Link
              className="text-link"
              to={`/clients/${relationship.id}/onboarding`}
            >
              Full review
            </Link>
          </div>
          {intakeFields.length > 0 ? (
            <dl className="detail-list intake-answers">
              {intakeFields.map((field) => (
                <div key={field.id}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">
              {relationship.onboardingStatus === "onboarding_pending"
                ? "The trainee has not submitted onboarding yet."
                : "No submitted onboarding answers to show."}
            </p>
          )}
        </aside>

      <form className="plan-config-form" onSubmit={saveDraft}>
        <div className="plan-card">
          <p className="plan-kicker">Baseline</p>
          <h2>Coaching intent</h2>
          <div className="plan-form">
            <label className="field">
              <span>Primary goal</span>
              <input
                type="text"
                name="primaryGoal"
                maxLength={500}
                value={form.primaryGoal}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    primaryGoal: event.target.value,
                  }))
                }
                disabled={!canSave || acting}
                required
              />
            </label>

            <label className="field">
              <span>Notes (optional)</span>
              <textarea
                name="notes"
                maxLength={2000}
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                disabled={!canSave || acting}
              />
            </label>
          </div>
        </div>

        <fieldset className="plan-card field-group" disabled={!canSave || acting}>
          <legend>Workout expectations</legend>
          <label className="field">
            <span>Sessions per week</span>
            <input
              type="number"
              min={1}
              max={14}
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

        <fieldset className="plan-card field-group" disabled={!canSave || acting}>
          <legend>Nutrition expectations</legend>
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
              <option value="none">Not required</option>
              <option value="selected_meals">Selected meals</option>
              <option value="all_meals">All meals</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="plan-card field-group" disabled={!canSave || acting}>
          <legend>Check-in schedule</legend>
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
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
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
        </fieldset>

        <fieldset className="plan-card field-group" disabled={!canSave || acting}>
          <legend>Tracking requirements</legend>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.requireBodyWeight}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  requireBodyWeight: event.target.checked,
                }))
              }
            />
            <span>Require body weight</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.requireProgressPhotos}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  requireProgressPhotos: event.target.checked,
                }))
              }
            />
            <span>Require progress photos</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.requireSessionRpe}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  requireSessionRpe: event.target.checked,
                }))
              }
            />
            <span>Require session RPE</span>
          </label>
        </fieldset>

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

        <div className="plan-card button-row">
          <button
            type="submit"
            className="button-primary"
            disabled={!canSave || acting}
          >
            {acting ? "Working…" : "Save draft"}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={!canConfigure}
            onClick={() => {
              void markConfigured();
            }}
          >
            Mark configured
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={!canActivate}
            onClick={() => {
              void activate();
            }}
          >
            Activate
          </button>
          {configuration?.status === "active" ? (
            <Link
              to={`/clients/${relationship.id}/plan`}
              className="button-primary"
            >
              Open plan
            </Link>
          ) : null}
          <Link
            to={`/clients/${relationship.id}/overview`}
            className="button-ghost"
          >
            Back to workspace
          </Link>
        </div>
      </form>
      </div>
    </div>
  );
}
