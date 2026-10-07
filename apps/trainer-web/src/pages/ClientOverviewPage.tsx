import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CoachingConfiguration,
  CoachingRelationship,
  EffectivePlanResponse,
  Exception,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";

type WorkspaceOutlet = { refreshEpoch?: number };

const UPCOMING_CHECKIN_STATUSES = new Set(["scheduled", "due", "overdue"]);
const OPEN_EXCEPTION_STATUSES = new Set([
  "detected",
  "active",
  "acknowledged",
]);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function formatLocalDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return localDate;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ClientOverviewPage() {
  const { relationshipId = "" } = useParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
  const [plan, setPlan] = useState<EffectivePlanResponse | null>(null);
  const [relationship, setRelationship] = useState<CoachingRelationship | null>(
    null,
  );
  const [configuration, setConfiguration] =
    useState<CoachingConfiguration | null>(null);
  const [exceptions, setExceptions] = useState<Exception[] | null>(null);
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [checkinsError, setCheckinsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setPlanError(null);
    setExceptionsError(null);
    setCheckinsError(null);

    const [planResult, exceptionResult, checkinResult, relationshipResult, configResult] =
      await Promise.allSettled([
        apiClient.getEffectivePlan(relationshipId),
        apiClient.listExceptions(relationshipId),
        apiClient.listCheckins(relationshipId),
        apiClient.getRelationship(relationshipId),
        apiClient.getCoachingConfiguration(relationshipId),
      ]);

    if (planResult.status === "fulfilled") {
      setPlan(planResult.value);
    } else {
      setPlan(null);
      setPlanError(errorMessage(planResult.reason, "Could not load effective plan."));
    }

    if (exceptionResult.status === "fulfilled") {
      setExceptions(exceptionResult.value.items);
    } else {
      setExceptions(null);
      setExceptionsError(
        errorMessage(exceptionResult.reason, "Could not load exceptions."),
      );
    }

    if (checkinResult.status === "fulfilled") {
      setCheckins(checkinResult.value.items);
    } else {
      setCheckins(null);
      setCheckinsError(
        errorMessage(checkinResult.reason, "Could not load check-ins."),
      );
    }

    if (relationshipResult.status === "fulfilled") {
      setRelationship(relationshipResult.value);
    } else {
      setRelationship(null);
    }

    if (configResult.status === "fulfilled") {
      setConfiguration(configResult.value);
    } else if (
      configResult.status === "rejected" &&
      configResult.reason instanceof ApiClientError &&
      configResult.reason.status === 404
    ) {
      setConfiguration(null);
    } else {
      setConfiguration(null);
    }

    setLoading(false);
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  const version = plan?.version ?? null;
  const hasEffectivePlan = Boolean(plan?.plan && version);
  const planHref = `/clients/${relationshipId}/plan`;
  const upcomingCheckins = (checkins ?? [])
    .filter((item) => UPCOMING_CHECKIN_STATUSES.has(item.status))
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const openExceptions = (exceptions ?? []).filter((item) =>
    OPEN_EXCEPTION_STATUSES.has(item.status),
  );
  const onboardingStatus = relationship?.onboardingStatus;
  const needsOnboardingReview =
    onboardingStatus === "onboarding_pending" ||
    onboardingStatus === "onboarding_submitted";
  const needsConfiguration =
    onboardingStatus === "coaching_ready" &&
    configuration?.status !== "active";
  const needsPlan = onboardingStatus === "active" && !hasEffectivePlan;

  return (
    <div className="workspace-page workspace-overview">
      {needsOnboardingReview ? (
        <p className="banner-info" role="status">
          {onboardingStatus === "onboarding_submitted"
            ? "This trainee submitted onboarding. Review the answers, then configure coaching."
            : "Waiting for the trainee to finish the onboarding form."}{" "}
          <Link to={`/clients/${relationshipId}/onboarding`}>
            Open onboarding review
          </Link>
        </p>
      ) : null}
      {needsConfiguration ? (
        <p className="banner-info" role="status">
          Onboarding is complete. Configure coaching expectations before
          publishing a plan.{" "}
          <Link to={`/clients/${relationshipId}/configure`}>
            Configure coaching
          </Link>
        </p>
      ) : null}
      {needsPlan ? (
        <p className="banner-info" role="status">
          Coaching is configured. Publish a plan so the trainee can start.{" "}
          <Link to={planHref}>Open plan</Link>
        </p>
      ) : null}
      <section className="workspace-card" aria-labelledby="overview-plan-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Plan</p>
            <h2 id="overview-plan-heading" className="workspace-card-title">
              Effective plan
            </h2>
          </div>
          {!loading && !planError ? (
            <Link className="button-primary" to={planHref}>
              {hasEffectivePlan ? "Adjust plan" : "Open plan"}
            </Link>
          ) : null}
        </div>
        {planError ? (
          <p className="form-error" role="alert">
            {planError}
          </p>
        ) : null}
        {loading ? <p className="muted">Loading plan…</p> : null}
        {!loading && !planError && hasEffectivePlan && plan?.plan && version ? (
          <dl className="workspace-facts">
            <div>
              <dt className="section-kicker">Title</dt>
              <dd>{plan.plan.title}</dd>
            </div>
            <div>
              <dt className="section-kicker">Version</dt>
              <dd>{version.versionNumber}</dd>
            </div>
            <div>
              <dt className="section-kicker">Effective</dt>
              <dd>{version.effectiveFrom ?? "now"}</dd>
            </div>
          </dl>
        ) : null}
        {!loading && !planError && !hasEffectivePlan ? (
          <p className="workspace-empty" role="status">
            No effective plan
          </p>
        ) : null}
      </section>

      <section
        className="workspace-card"
        aria-labelledby="overview-exceptions-heading"
      >
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Attention</p>
            <h2 id="overview-exceptions-heading" className="workspace-card-title">
              Open exceptions
            </h2>
          </div>
        </div>
        {exceptionsError ? (
          <p className="form-error" role="alert">
            {exceptionsError}
          </p>
        ) : null}
        {loading ? <p className="muted">Loading exceptions…</p> : null}
        {!loading && !exceptionsError && openExceptions.length === 0 ? (
          <p className="workspace-empty" role="status">
            No open exceptions
          </p>
        ) : null}
        {!loading && openExceptions.length > 0 ? (
          <ul className="workspace-list">
            {openExceptions.map((item) => (
              <li key={item.id} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">{item.summary}</p>
                  <p className="workspace-row-meta">
                    <span className="workspace-kind">{statusLabel(item.type)}</span>
                    <span className={`status-pill status-${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                  </p>
                </div>
                <Link className="button-secondary" to={`/exceptions/${item.id}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        className="workspace-card workspace-span"
        aria-labelledby="overview-checkins-heading"
      >
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Schedule</p>
            <h2 id="overview-checkins-heading" className="workspace-card-title">
              Next check-ins
            </h2>
          </div>
        </div>
        {checkinsError ? (
          <p className="form-error" role="alert">
            {checkinsError}
          </p>
        ) : null}
        {loading ? <p className="muted">Loading check-ins…</p> : null}
        {!loading && !checkinsError && upcomingCheckins.length === 0 ? (
          <p className="workspace-empty" role="status">
            {(checkins?.length ?? 0) === 0
              ? "No check-ins yet"
              : "No upcoming check-ins"}
          </p>
        ) : null}
        {!loading && upcomingCheckins.length > 0 ? (
          <ul className="workspace-list">
            {upcomingCheckins.map((item) => (
              <li key={item.id} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">
                    {formatLocalDate(item.localDate)}
                  </p>
                  <p className="workspace-row-meta">
                    <span className={`status-pill status-${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span>
                      Window ends {new Date(item.windowEndsAt).toLocaleString()}
                    </span>
                  </p>
                </div>
                <Link
                  className="button-secondary"
                  to={`/clients/${relationshipId}/check-ins/${item.id}`}
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
