import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CoachingConfiguration,
  OnboardingStatus,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { clientWhatsappHref } from "../lib/whatsapp";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

const UPCOMING_CHECKIN_STATUSES = new Set(["scheduled", "due", "overdue"]);
const OPEN_EXCEPTION_STATUSES = new Set([
  "detected",
  "active",
  "acknowledged",
]);

function shortRelationshipId(relationshipId: string): string {
  return relationshipId.slice(0, 8);
}

function clientHeading(relationshipId: string): string {
  const shortId = shortRelationshipId(relationshipId);
  return shortId ? `Client ${shortId}` : "Client";
}

function initialsFromLabel(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  }
  const compact = words[0] ?? label.replace(/[^A-Za-z0-9]/g, "");
  return (compact.slice(0, 2) || "CL").toUpperCase();
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

function checkinCue(checkin: Checkin): string {
  const when = formatLocalDate(checkin.localDate);
  if (checkin.status === "overdue") return `Check-in overdue · ${when}`;
  if (checkin.status === "due") return `Check-in due ${when}`;
  return `Next check-in ${when}`;
}

/** Client lifecycle, separate from coaching configuration and attention. */
function clientStatusLabel(status: OnboardingStatus | null): string | null {
  if (!status) return null;
  if (status === "coaching_ready" || status === "active") return "Active";
  if (status === "ended") return "Ended";
  return "Onboarding";
}

/** Coaching configuration, shown in the menu so it is not another "Active" badge. */
function coachingStatusLabel(
  status: CoachingConfiguration["status"] | null,
): string {
  if (status === "active") return "Active";
  if (status === "configured") return "Configured";
  if (status === "draft") return "Configuring";
  if (status === "superseded") return "Superseded";
  return "Not configured";
}

export function ClientWorkspaceLayout() {
  const { relationshipId = "" } = useParams();
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [whatsappE164, setWhatsappE164] = useState<string | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null);
  const [configurationStatus, setConfigurationStatus] = useState<
    CoachingConfiguration["status"] | null
  >(null);
  const [planTitle, setPlanTitle] = useState<string | null>(null);
  const [attentionCount, setAttentionCount] = useState(0);
  const [nextCheckin, setNextCheckin] = useState<Checkin | null>(null);
  const [reviewCheckin, setReviewCheckin] = useState<Checkin | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const onOverviewIndex = useMatch({
    path: "/clients/:relationshipId",
    end: true,
  });
  const onOverviewPath = useMatch({
    path: "/clients/:relationshipId/overview",
    end: true,
  });
  const onConfigure = useMatch({
    path: "/clients/:relationshipId/configure",
    end: true,
  });
  const onOnboarding = useMatch({
    path: "/clients/:relationshipId/onboarding",
    end: true,
  });
  const overviewActive = Boolean(onOverviewIndex || onOverviewPath);

  const bump = useCallback(() => {
    setRefreshEpoch((value) => value + 1);
  }, []);

  useRealtimeHints(apiClient, relationshipId || null, bump);

  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    void (async () => {
      try {
        const relationship = await apiClient.getRelationship(relationshipId);
        if (cancelled) return;
        setOnboardingStatus(relationship.onboardingStatus);

        const invitationResult = relationship.invitationId
          ? await apiClient.getInvitation(relationship.invitationId).then(
              (value) => ({ ok: true as const, value }),
              () => ({ ok: false as const }),
            )
          : { ok: false as const };
        if (cancelled) return;
        const invitation = invitationResult.ok ? invitationResult.value : null;
        const name =
          invitation?.recipientDisplayName?.trim() ||
          invitation?.recipientEmail ||
          null;
        setDisplayName(name);
        setWhatsappE164(invitation?.recipientWhatsappE164 ?? null);

        const [planResult, exceptionResult, checkinResult, configResult] =
          await Promise.allSettled([
            apiClient.getEffectivePlan(relationshipId),
            apiClient.listExceptions(relationshipId),
            apiClient.listCheckins(relationshipId),
            apiClient.getCoachingConfiguration(relationshipId),
          ]);
        if (cancelled) return;

        if (planResult.status === "fulfilled") {
          setPlanTitle(planResult.value.plan?.title ?? null);
        } else {
          setPlanTitle(null);
        }

        if (exceptionResult.status === "fulfilled") {
          setAttentionCount(
            exceptionResult.value.items.filter((item) =>
              OPEN_EXCEPTION_STATUSES.has(item.status),
            ).length,
          );
        } else {
          setAttentionCount(0);
        }

        if (checkinResult.status === "fulfilled") {
          const upcoming = checkinResult.value.items
            .filter((item) => UPCOMING_CHECKIN_STATUSES.has(item.status))
            .sort((left, right) => left.localDate.localeCompare(right.localDate));
          setNextCheckin(upcoming[0] ?? null);
          const reviewRank = (status: string) =>
            status === "overdue" ? 0 : status === "due" ? 1 : status === "submitted" ? 2 : 3;
          const reviewable = checkinResult.value.items
            .filter((item) => reviewRank(item.status) < 3)
            .sort(
              (left, right) =>
                reviewRank(left.status) - reviewRank(right.status) ||
                left.localDate.localeCompare(right.localDate),
            );
          setReviewCheckin(reviewable[0] ?? null);
        } else {
          setNextCheckin(null);
          setReviewCheckin(null);
        }

        if (configResult.status === "fulfilled") {
          setConfigurationStatus(configResult.value.status);
          setPrimaryGoal(configResult.value.primaryGoal?.trim() || null);
        } else if (
          configResult.status === "rejected" &&
          configResult.reason instanceof ApiClientError &&
          configResult.reason.status === 404
        ) {
          setConfigurationStatus(null);
          setPrimaryGoal(null);
        } else {
          setConfigurationStatus(null);
          setPrimaryGoal(null);
        }
      } catch {
        if (!cancelled) {
          setDisplayName(null);
          setOnboardingStatus(null);
          setWhatsappE164(null);
          setPrimaryGoal(null);
          setConfigurationStatus(null);
          setPlanTitle(null);
          setAttentionCount(0);
          setNextCheckin(null);
          setReviewCheckin(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  const heading = displayName ?? clientHeading(relationshipId);
  const initials = initialsFromLabel(heading);
  const clientStatus = clientStatusLabel(onboardingStatus);
  const coachingLabel = coachingStatusLabel(configurationStatus);
  const needsReminder =
    onboardingStatus === "invited" || onboardingStatus === "onboarding_pending";
  const attentionLabel =
    attentionCount === 0
      ? null
      : attentionCount === 1
        ? "Needs attention"
        : `${attentionCount} need attention`;

  const whatsappHrefValue = clientWhatsappHref({
    phoneE164: whatsappE164,
    name: heading,
    onboardingStatus,
  });
  const messageLabel = needsReminder ? "Remind" : "Message";

  const primaryAction = useMemo(() => {
    if (onboardingStatus === "onboarding_submitted") {
      return { label: "Review intake", to: `/clients/${relationshipId}/onboarding` };
    }
    if (onboardingStatus === "onboarding_pending" && !whatsappE164) {
      return { label: "View onboarding", to: `/clients/${relationshipId}/onboarding` };
    }
    if (
      onboardingStatus === "coaching_ready" &&
      configurationStatus !== "active" &&
      !reviewCheckin
    ) {
      return { label: "Continue setup", to: `/clients/${relationshipId}/configure` };
    }
    if (reviewCheckin && (reviewCheckin.status === "due" || reviewCheckin.status === "overdue" || reviewCheckin.status === "submitted")) {
      return {
        label: "Review check-in",
        to: `/clients/${relationshipId}/check-ins/${reviewCheckin.id}`,
      };
    }
    if (planTitle) {
      return { label: "Adjust plan", to: `/clients/${relationshipId}/plan` };
    }
    if (onboardingStatus === "coaching_ready") {
      return { label: "Open plan", to: `/clients/${relationshipId}/plan` };
    }
    return null;
  }, [
    configurationStatus,
    onboardingStatus,
    planTitle,
    relationshipId,
    reviewCheckin,
    whatsappE164,
  ]);

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  const showPrimary =
    primaryAction &&
    !(onConfigure && primaryAction.to.endsWith("/configure")) &&
    !(onOnboarding && primaryAction.to.endsWith("/onboarding"));

  return (
    <section className="page workspace-shell">
      <div className="workspace-frame">
      <header className="workspace-identity">
        <div className="workspace-identity-main">
          <Link className="workspace-back" to="/clients">
            <IconChevronLeft />
            Clients
          </Link>
          <div className="workspace-identity-row">
            <span className="avatar workspace-avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="workspace-identity-copy">
              <div className="workspace-name-row">
                <h1 className="workspace-title">{heading}</h1>
                {attentionLabel ? (
                  <p className="workspace-attention-badge">
                    <span aria-hidden="true">⚠</span>
                    {attentionLabel}
                  </p>
                ) : null}
              </div>
              <p className="workspace-meta">
                {primaryGoal ? <span>{primaryGoal}</span> : null}
                {clientStatus ? (
                  <span
                    className={
                      clientStatus === "Active"
                        ? "workspace-client-status is-active"
                        : "workspace-client-status is-onboarding"
                    }
                  >
                    <span className="workspace-status-dot" aria-hidden="true" />
                    {clientStatus}
                  </span>
                ) : (
                  <span>Client workspace</span>
                )}
                {planTitle ? <span>{planTitle}</span> : null}
              </p>
              {nextCheckin ? (
                <p className="workspace-next-checkin">{checkinCue(nextCheckin)}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="workspace-header-actions">
          {showPrimary && primaryAction ? (
            <Link
              to={primaryAction.to}
              className={needsReminder && whatsappHrefValue ? "button-secondary" : "button-primary"}
            >
              {primaryAction.label}
            </Link>
          ) : null}
          {whatsappHrefValue ? (
            <a
              className={needsReminder ? "button-primary" : "button-secondary"}
              href={whatsappHrefValue}
              target="_blank"
              rel="noopener noreferrer"
            >
              {messageLabel}
            </a>
          ) : (
            <button
              type="button"
              className="button-secondary"
              disabled
              title="Add a WhatsApp number when inviting this client"
            >
              {messageLabel}
            </button>
          )}
          <details className="workspace-menu" ref={menuRef}>
            <summary className="workspace-icon-btn" aria-label="More client actions">
              <IconMore />
            </summary>
            <div className="workspace-menu-panel">
              {onConfigure ? (
                <Link to={`/clients/${relationshipId}/overview`} onClick={closeMenu}>
                  Back to overview
                </Link>
              ) : (
                <Link to={`/clients/${relationshipId}/configure`} onClick={closeMenu}>
                  Client settings
                </Link>
              )}
              <p className="workspace-menu-status">
                <span>Coaching</span>
                {coachingLabel}
              </p>
            </div>
          </details>
        </div>
      </header>

      <nav className="workspace-tabs" aria-label="Client sections">
        <Link
          to={`/clients/${relationshipId}/overview`}
          className={tabClass(overviewActive)}
          aria-current={overviewActive ? "page" : undefined}
        >
          Overview
        </Link>
        <NavLink to={`/clients/${relationshipId}/plan`} className={navClass}>
          Plan
        </NavLink>
        <NavLink
          to={`/clients/${relationshipId}/activity`}
          className={navClass}
        >
          Activity
        </NavLink>
        <NavLink
          to={`/clients/${relationshipId}/progress`}
          className={navClass}
        >
          Progress
        </NavLink>
        <NavLink
          to={`/clients/${relationshipId}/check-ins`}
          className={navClass}
        >
          Check-ins
        </NavLink>
        <NavLink to={`/clients/${relationshipId}/history`} className={navClass}>
          History
        </NavLink>
      </nav>
      </div>

      <Outlet context={{ refreshEpoch }} />
    </section>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return tabClass(isActive);
}

function tabClass(isActive: boolean): string {
  return isActive ? "workspace-tab is-active" : "workspace-tab";
}

function IconChevronLeft() {
  return (
    <svg {...iconProps()}>
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg {...iconProps(18)}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function iconProps(size = 16): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  };
}
