import { useCallback, useEffect, useMemo, useState, type SVGProps } from "react";
import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  Checkin,
  CoachingConfiguration,
  OnboardingStatus,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { onboardingStatusLabel } from "../lib/clients";
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

function coachingStatusLabel(input: {
  configurationStatus: CoachingConfiguration["status"] | null;
  attentionCount: number;
}): string | null {
  if (input.attentionCount > 0) return "Needs attention";
  if (input.configurationStatus === "active") return "Active";
  if (input.configurationStatus === "configured") return "Configured";
  if (input.configurationStatus === "draft") return "Configuring";
  return null;
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
        } else {
          setNextCheckin(null);
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
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  const heading = displayName ?? clientHeading(relationshipId);
  const initials = initialsFromLabel(heading);
  const coachingLabel = coachingStatusLabel({
    configurationStatus,
    attentionCount,
  });
  const clientStatus = onboardingStatus
    ? onboardingStatusLabel(onboardingStatus)
    : null;
  const metaParts = [primaryGoal, clientStatus, planTitle].filter(
    (part): part is string => Boolean(part),
  );
  const attentionParts: string[] = [];
  if (attentionCount > 0) {
    attentionParts.push(
      attentionCount === 1
        ? "Needs attention"
        : `${attentionCount} items need attention`,
    );
  }
  if (nextCheckin) {
    attentionParts.push(checkinCue(nextCheckin));
  }

  const whatsappHrefValue = clientWhatsappHref({
    phoneE164: whatsappE164,
    name: heading,
    onboardingStatus,
  });

  const primaryAction = useMemo(() => {
    if (onboardingStatus === "onboarding_submitted") {
      return { label: "Review intake", to: `/clients/${relationshipId}/onboarding` };
    }
    if (onboardingStatus === "onboarding_pending") {
      return { label: "View onboarding", to: `/clients/${relationshipId}/onboarding` };
    }
    if (
      onboardingStatus === "coaching_ready" &&
      configurationStatus !== "active"
    ) {
      return { label: "Client settings", to: `/clients/${relationshipId}/configure` };
    }
    if (planTitle) {
      return { label: "Adjust plan", to: `/clients/${relationshipId}/plan` };
    }
    if (onboardingStatus === "coaching_ready") {
      return { label: "Open plan", to: `/clients/${relationshipId}/plan` };
    }
    return null;
  }, [configurationStatus, onboardingStatus, planTitle, relationshipId]);

  return (
    <section className="page workspace-shell">
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
              <h1 className="workspace-title">{heading}</h1>
              {metaParts.length > 0 ? (
                <p className="workspace-meta">{metaParts.join(" · ")}</p>
              ) : (
                <p className="workspace-meta">Client workspace</p>
              )}
              {coachingLabel &&
              coachingLabel !== "Needs attention" &&
              coachingLabel !== clientStatus ? (
                <p className="workspace-coaching-status">
                  Coaching: {coachingLabel}
                </p>
              ) : null}
              {attentionParts.length > 0 ? (
                <p
                  className={
                    attentionCount > 0
                      ? "workspace-attention"
                      : "workspace-next-checkin"
                  }
                >
                  {attentionCount > 0 ? <span aria-hidden="true">⚠ </span> : null}
                  {attentionParts.join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="workspace-header-actions">
          {primaryAction &&
          !(onConfigure && primaryAction.to.endsWith("/configure")) &&
          !(onOnboarding && primaryAction.to.endsWith("/onboarding")) ? (
            <Link to={primaryAction.to} className="button-primary">
              {primaryAction.label}
            </Link>
          ) : null}
          {whatsappHrefValue ? (
            <a
              className="button-secondary"
              href={whatsappHrefValue}
              target="_blank"
              rel="noopener noreferrer"
            >
              Message
            </a>
          ) : (
            <button
              type="button"
              className="button-secondary"
              disabled
              title="Add a WhatsApp number when inviting this client"
            >
              Message
            </button>
          )}
          <Link
            to={`/clients/${relationshipId}/configure`}
            className={
              onConfigure
                ? "workspace-icon-btn is-active"
                : "workspace-icon-btn"
            }
            aria-current={onConfigure ? "page" : undefined}
            aria-label="Client settings"
            title="Client settings"
          >
            <IconSettings />
          </Link>
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

function IconSettings() {
  return (
    <svg {...iconProps(18)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
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
