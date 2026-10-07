import { Link, useOutletContext, useParams } from "react-router-dom";
import type { MeasurementType, RenewalState, WorkspaceActivityItem } from "@fitbud/contracts";
import {
  MEASUREMENT_SERIES,
  MeasurementTrend,
  measurementTypeLabel,
} from "../components/MeasurementTrend";
import type { WorkspaceOutletContext } from "./workspaceContext";

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

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function renewalLabel(state: RenewalState): string {
  switch (state) {
    case "current":
      return "Renewal current";
    case "upcoming":
      return "Renewal upcoming";
    case "due":
      return "Renewal due";
    case "expired":
      return "Renewal expired";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function orderedMeasurementTypes(types: string[]): string[] {
  const unique = [...new Set(types)];
  const preferred = MEASUREMENT_SERIES.filter((type) => unique.includes(type));
  const rest = unique.filter(
    (type) => !MEASUREMENT_SERIES.includes(type as MeasurementType),
  );
  return [...preferred, ...rest];
}

function activityKind(item: WorkspaceActivityItem): string {
  if (item.type === "workout") return "Workout";
  if (item.type === "meal") return "Meal";
  return "Check-in";
}

export function ClientOverviewPage() {
  const { relationshipId = "" } = useParams();
  const { workspace, workspaceLoading, workspaceError } =
    useOutletContext<WorkspaceOutletContext>();

  if (workspaceLoading && !workspace) {
    return (
      <div className="workspace-page workspace-overview" aria-busy="true">
        <p className="muted">Loading overview…</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="workspace-page workspace-overview">
        <p className="form-error" role="alert">
          {workspaceError ?? "Could not load this client."}
        </p>
      </div>
    );
  }

  const { header, overview, plan, configuration } = workspace;
  const version = plan.version;
  const hasEffectivePlan = Boolean(plan.plan && version);
  const planHref = `/clients/${relationshipId}/plan`;
  const onboardingStatus = header.onboardingStatus;
  const configurationStatus = configuration.configuration?.status ?? null;
  const needsOnboardingReview =
    onboardingStatus === "onboarding_pending" ||
    onboardingStatus === "onboarding_submitted";
  const needsConfiguration =
    onboardingStatus === "coaching_ready" && configurationStatus !== "active";
  const needsPlan = onboardingStatus === "active" && !hasEffectivePlan;
  const subscription = configuration.subscription;
  const measurementTypes = orderedMeasurementTypes(
    overview.progress.measurements.map((item) => item.type),
  );
  const recentEntries = [...overview.progress.entries]
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 3);

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
              Current program
            </h2>
          </div>
          <Link className="button-primary" to={planHref}>
            {hasEffectivePlan ? "Adjust plan" : "Open plan"}
          </Link>
        </div>
        {hasEffectivePlan && plan.plan && version ? (
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
        ) : (
          <p className="workspace-empty" role="status">
            No effective plan
          </p>
        )}
      </section>

      <section className="workspace-card" aria-labelledby="overview-renewal-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Subscription</p>
            <h2 id="overview-renewal-heading" className="workspace-card-title">
              Renewal
            </h2>
          </div>
        </div>
        {header.renewalState ? (
          <dl className="workspace-facts">
            <div>
              <dt className="section-kicker">State</dt>
              <dd>{renewalLabel(header.renewalState)}</dd>
            </div>
            {subscription ? (
              <>
                <div>
                  <dt className="section-kicker">Plan</dt>
                  <dd>{subscription.planName}</dd>
                </div>
                <div>
                  <dt className="section-kicker">Frequency</dt>
                  <dd>{statusLabel(subscription.paymentFrequency)}</dd>
                </div>
                <div>
                  <dt className="section-kicker">Renews</dt>
                  <dd>{formatLocalDate(subscription.renewsOn)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="workspace-empty" role="status">
            No subscription renewal
          </p>
        )}
      </section>

      <section
        className="workspace-card"
        aria-labelledby="overview-exceptions-heading"
      >
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Attention</p>
            <h2 id="overview-exceptions-heading" className="workspace-card-title">
              Open exception
            </h2>
          </div>
        </div>
        {overview.openException ? (
          <div className="workspace-row">
            <div className="workspace-row-copy">
              <p className="workspace-row-title">{overview.openException.summary}</p>
              <p className="workspace-row-meta">
                <span className="workspace-kind">
                  {statusLabel(overview.openException.type)}
                </span>
                <span className={`status-pill status-${overview.openException.status}`}>
                  {statusLabel(overview.openException.status)}
                </span>
              </p>
            </div>
            <Link
              className="button-secondary"
              to={`/exceptions/${overview.openException.id}`}
            >
              Open
            </Link>
          </div>
        ) : (
          <p className="workspace-empty" role="status">
            No open exception
          </p>
        )}
      </section>

      <section className="workspace-card" aria-labelledby="overview-checkins-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Schedule</p>
            <h2 id="overview-checkins-heading" className="workspace-card-title">
              Next check-in
            </h2>
          </div>
        </div>
        {overview.nextCheckin ? (
          <div className="workspace-row">
            <div className="workspace-row-copy">
              <p className="workspace-row-title">
                {formatLocalDate(overview.nextCheckin.localDate)}
              </p>
              <p className="workspace-row-meta">
                <span className={`status-pill status-${overview.nextCheckin.status}`}>
                  {statusLabel(overview.nextCheckin.status)}
                </span>
                <span>
                  Window ends {formatWhen(overview.nextCheckin.windowEndsAt)}
                </span>
              </p>
            </div>
            <Link
              className="button-secondary"
              to={`/clients/${relationshipId}/check-ins/${overview.nextCheckin.id}`}
            >
              Review
            </Link>
          </div>
        ) : (
          <p className="workspace-empty" role="status">
            No next check-in
          </p>
        )}
      </section>

      <section
        className="workspace-card workspace-span"
        aria-labelledby="overview-activity-heading"
      >
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Recent</p>
            <h2 id="overview-activity-heading" className="workspace-card-title">
              Recent activity
            </h2>
          </div>
          <Link className="button-secondary" to={`/clients/${relationshipId}/activity`}>
            Open activity
          </Link>
        </div>
        {overview.recentActivity.length === 0 ? (
          <p className="workspace-empty" role="status">
            No recent activity
          </p>
        ) : (
          <ul className="workspace-list">
            {overview.recentActivity.map((item) => (
              <li key={`${item.type}:${item.id}`} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">{item.title}</p>
                  <p className="workspace-row-meta">
                    <span className="workspace-kind">{activityKind(item)}</span>
                    <span>{formatLocalDate(item.localDate)}</span>
                    <span className={`status-pill status-${item.state}`}>
                      {statusLabel(item.state)}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="workspace-card workspace-span" aria-labelledby="overview-progress-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Progress</p>
            <h2 id="overview-progress-heading" className="workspace-card-title">
              Progress summary
            </h2>
          </div>
          <Link className="button-secondary" to={`/clients/${relationshipId}/progress`}>
            Open progress
          </Link>
        </div>
        {measurementTypes.length === 0 ? (
          <p className="workspace-empty" role="status">
            No measurements in this summary
          </p>
        ) : (
          <div className="measurement-series-list">
            {measurementTypes.map((type) => (
              <div key={type} className="measurement-series">
                <h3>{measurementTypeLabel(type)}</h3>
                <MeasurementTrend
                  compact
                  label={measurementTypeLabel(type)}
                  points={overview.progress.measurements
                    .filter((item) => item.type === type)
                    .map((item) => ({
                      id: item.id,
                      value: item.value,
                      unit: item.unit,
                      observedAt: item.observedAt,
                    }))}
                />
              </div>
            ))}
          </div>
        )}
        {recentEntries.length > 0 ? (
          <ul className="workspace-list">
            {recentEntries.map((item) => (
              <li key={item.id} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">
                    {item.title?.trim() || statusLabel(item.entryType)}
                  </p>
                  <p className="workspace-row-meta">
                    <span>{formatWhen(item.observedAt)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
