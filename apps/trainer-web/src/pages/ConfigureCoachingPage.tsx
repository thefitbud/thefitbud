import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinCadence,
  CoachingConfiguration,
  CoachingRelationship,
  MealPhotoRequirement,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
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
      try {
        const config = await apiClient.getCoachingConfiguration(relationshipId);
        applyConfiguration(config);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          setConfiguration(null);
          setForm(DEFAULT_FORM);
        } else {
          throw err;
        }
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
  const expectedVersion = configuration?.version ?? 0;

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
        { expectedVersion: configuration.version },
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
        { expectedVersion: configuration.version },
        createIdempotencyKey(),
      );
      applyConfiguration(updated);
      setMessage("Configuration is active. Publish a plan next.");
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
      <section className="page plan-config-page" aria-busy="true">
        <p className="muted">Loading configuration…</p>
      </section>
    );
  }

  if (error && !relationship) {
    return (
      <section className="page plan-config-page">
        <p className="form-error" role="alert">
          {error}
        </p>
        <Link to="/clients" className="button-secondary">
          Back to Clients
        </Link>
      </section>
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

  return (
    <section className="page plan-config-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/clients">Clients</Link>
            {" / "}
            <Link to={`/clients/${relationship.id}/onboarding`}>
              Onboarding review
            </Link>
            {" / Configure Coaching"}
          </p>
          <h1>Configure Coaching</h1>
          <p className="lede">
            Set workout, nutrition, check-in, and tracking expectations. This is
            separate from the plan the trainee will follow.
          </p>
        </div>
        <span className={`status-badge status-${statusKey}`}>
          <span className="status-dot" aria-hidden="true" />
          {configurationStatusLabel(statusKey)}
        </span>
      </header>

      {relationship.onboardingStatus !== "coaching_ready" ? (
        <p className="banner-info" role="status">
          Finish onboarding review before editing coaching expectations.
        </p>
      ) : null}

      {readOnly ? (
        <p className="banner-info" role="status">
          This configuration is active and locked. Plan adjustments come later;
          they do not rewrite these baseline expectations in this slice.
        </p>
      ) : null}

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
          <Link to="/clients" className="button-ghost">
            Back to Clients
          </Link>
        </div>
      </form>
    </section>
  );
}
