import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  OnboardingFormResponse,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import { formatOnboardingAnswer } from "@fitbud/core";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

export function OnboardingReviewPage() {
  const { relationshipId = "" } = useParams();
  const navigate = useNavigate();
  const [relationship, setRelationship] = useState<CoachingRelationship | null>(
    null,
  );
  const [intake, setIntake] = useState<OnboardingFormResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(null);
  const [intakeMissing, setIntakeMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    setIntakeMissing(false);
    try {
      const [rel, def] = await Promise.all([
        apiClient.getRelationship(relationshipId),
        apiClient.getCurrentOnboardingForm(relationshipId),
      ]);
      setRelationship(rel);
      setDefinition(def);

      try {
        const submission = await apiClient.getOnboardingResponse(relationshipId);
        setIntake(submission);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          setIntake(null);
          setIntakeMissing(true);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load onboarding review.",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fields = useMemo(() => {
    if (!definition || !intake) return [];
    return definition.fields.map((field) => ({
      id: field.id,
      label: field.label,
      value: formatOnboardingAnswer(field, intake.answers[field.id]).trim() || "—",
    }));
  }, [definition, intake]);

  async function configureCoaching() {
    if (!relationship) return;
    setActing(true);
    setError(null);
    try {
      if (relationship.onboardingStatus === "onboarding_submitted") {
        if (!intake || intake.status !== "submitted") {
          setError("Submitted intake is required before configuring coaching.");
          return;
        }
        const result = await apiClient.reviewOnboarding(
          relationship.id,
          { outcome: "coaching_ready" },
          createIdempotencyKey(),
        );
        setRelationship(result.relationship);
      }
      navigate(`/clients/${relationship.id}/configure`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not complete onboarding review.",
      );
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page" aria-busy="true">
        <p className="muted">Loading intake…</p>
      </div>
    );
  }

  if (error && !relationship) {
    return (
      <div className="workspace-page">
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

  if (!relationship) {
    return null;
  }

  const canConfigure =
    relationship.onboardingStatus === "onboarding_submitted" ||
    relationship.onboardingStatus === "coaching_ready";

  return (
    <div className="workspace-page">
      <div className="workspace-toolbar">
        <div>
          <p className="workspace-kicker">Onboarding</p>
          <h2 className="workspace-card-title">Review intake</h2>
          <p className="lede">
            Review the trainee’s onboarding answers, then configure coaching
            from those responses.
          </p>
        </div>
        <StatusBadge status={relationship.onboardingStatus} />
      </div>

      {intakeMissing ? (
        <div className="workspace-card">
          <div className="empty-state" role="status">
            <h2>Intake not started</h2>
            <p>The trainee has not saved or submitted intake yet.</p>
          </div>
        </div>
      ) : null}

      {intake && intake.status !== "submitted" ? (
        <p className="banner-info" role="status">
          Intake is not submitted yet. The trainee still needs to finish
          onboarding.
        </p>
      ) : null}

      {intake ? (
        <section className="workspace-card" aria-labelledby="intake-heading">
          <div className="workspace-card-head">
            <h2 id="intake-heading" className="workspace-card-title">
              Submitted intake
            </h2>
          </div>
          <dl className="detail-list intake-answers">
            {fields.map((field) => (
              <div key={field.id}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="workspace-card">
        <div className="button-row">
          <button
            type="button"
            className="button-primary"
            disabled={!canConfigure || acting}
            onClick={() => {
              void configureCoaching();
            }}
          >
            {acting ? "Working…" : "Configure Coaching"}
          </button>
          <Link
            to={`/clients/${relationship.id}/overview`}
            className="button-ghost"
          >
            Back to workspace
          </Link>
        </div>
        {!canConfigure ? (
          <p className="muted">
            Configure Coaching unlocks after the trainee submits intake.
          </p>
        ) : null}
      </div>
    </div>
  );
}
