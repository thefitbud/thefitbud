import { useState, type ReactNode } from "react";
import {
  Ban,
  Bell,
  ChevronRight,
  CircleOff,
  ClipboardCheck,
  File,
  Settings,
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Checkin, ClientWorkspace } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatLocalDate,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../Button";
import { OverflowMenu, type OverflowMenuItem } from "../OverflowMenu";
import { StatusChip } from "../StatusChip";
import { WhatsAppGlyph } from "../WhatsAppGlyph";
import { clientWhatsappHref, whatsappHref } from "../../lib/whatsapp";
import { cancelReactivation } from "../../lib/http-api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import { TimezoneBadge } from "./TimezoneBadge";
import { primaryActionFor } from "./primaryAction";
import type { WorkspaceModal } from "./WorkspaceModals";
import {
  CLIENT_WORKSPACE_TABS,
  clientWorkspaceTabHref,
  isClientWorkspaceTabActive,
} from "./workspaceTabs";

const WEEK_MS = 7 * 86_400_000;

function relationshipWeek(startedAt: string | null | undefined): number | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  return Math.max(1, Math.floor((Date.now() - started) / WEEK_MS) + 1);
}

function titleCaseGender(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function WorkspaceHeader({
  workspace,
  relationshipId,
  submittedCheckinCount,
  onOpenModal,
  onWorkspaceChanged,
  online = true,
}: {
  workspace: ClientWorkspace;
  relationshipId: string;
  submittedCheckinCount: number;
  onOpenModal: (modal: WorkspaceModal) => void;
  onWorkspaceChanged?: () => void;
  online?: boolean;
}) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [, setParams] = useSearchParams();
  const header = workspace.header;
  const ended = header.onboardingStatus === "ended";
  const pendingReactivation = header.pendingReactivation ?? null;
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const configurationActive =
    workspace.configuration.configuration?.status === "active";
  // Only a real submitted-awaiting-review check-in drives the CTA. Do not
  // promote due/overdue drafts (or pre-reactivation leftovers) to "Review".
  const reviewCheckin = workspace.overview.pendingReviewCheckin ?? null;

  const primary = primaryActionFor({
    relationshipId,
    onboardingStatus: header.onboardingStatus,
    configurationActive,
    reviewCheckin: reviewCheckin as Checkin | null,
    openExceptionId: workspace.overview.openException?.id ?? null,
    ended,
    reactivationPending: Boolean(pendingReactivation),
  });

  const remindHref = header.clientWhatsappE164
    ? whatsappHref({
        phoneE164: header.clientWhatsappE164,
        draftText: `Hi ${header.traineeDisplayName.split(/\s+/)[0] ?? "there"} — please confirm the reactivation request in FitBud when you can.`,
      })
    : null;

  async function cancelPendingReactivation() {
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelReactivation(relationshipId, createIdempotencyKey());
      onWorkspaceChanged?.();
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Could not cancel the request.",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  const whatsappHrefValue = clientWhatsappHref({
    phoneE164: header.clientWhatsappE164,
    name: header.traineeDisplayName,
    onboardingStatus: header.onboardingStatus,
  });

  const initials = header.traineeDisplayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  // Frame 179: civil dates in the client's timezone, like the ended Overview body.
  const traineeTz = resolveTraineeTimezone(header).timezone;
  const civilDay = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return formatCivilDate(formatLocalDate(at, traineeTz));
  };
  const endedOn = ended ? civilDay(header.endedAt) : null;
  const coachedFrom = ended ? civilDay(header.startedAt) : null;

  const metaNodes: Array<{ key: string; node: ReactNode }> = [];
  if (header.goalShort) {
    metaNodes.push({ key: "goal", node: <span>{header.goalShort}</span> });
  }
  if (ended && coachedFrom && endedOn) {
    metaNodes.push({
      key: "coached",
      node: (
        <span>
          Coached {coachedFrom} — {endedOn}
        </span>
      ),
    });
  }
  if (!ended && header.effectivePlan?.title) {
    metaNodes.push({
      key: "plan",
      node: (
        <Link
          className="workspace-plan-link"
          to={`/clients/${relationshipId}/plan`}
        >
          {header.effectivePlan.title}
        </Link>
      ),
    });
  }
  const weekNumber = ended ? null : relationshipWeek(header.startedAt);
  if (weekNumber != null) {
    metaNodes.push({ key: "week", node: <span>Week {weekNumber}</span> });
  }
  const nextScheduled = workspace.overview.nextCheckin;
  if (
    !ended &&
    nextScheduled &&
    nextScheduled.status !== "submitted" &&
    nextScheduled.status !== "reviewed"
  ) {
    metaNodes.push({
      key: "checkin",
      node: (
        <span>
          Next check-in {formatCivilDate(nextScheduled.localDate)}
        </span>
      ),
    });
  }
  const profileParts: string[] = [];
  if (header.traineeProfile.age != null) {
    profileParts.push(String(header.traineeProfile.age));
  }
  if (header.traineeProfile.gender) {
    profileParts.push(titleCaseGender(header.traineeProfile.gender));
  }
  if (profileParts.length) {
    metaNodes.push({
      key: "profile",
      node: <span>{profileParts.join(" · ")}</span>,
    });
  }
  if (!ended && header.renewalState && header.renewalState !== "current") {
    const renewsOn = header.renewsOn
      ? formatCivilDate(header.renewsOn)
      : null;
    const stateLabel = labelFor("renewal_state", header.renewalState);
    metaNodes.push({
      key: "renewal",
      node: (
        <StatusChip
          kind="renewal"
          value={header.renewalState}
          label={`Renewal ${stateLabel.toLowerCase()}${renewsOn ? ` · ${renewsOn}` : ""}`}
          className="status-chip-xs"
        />
      ),
    });
  }

  function runPrimary() {
    if (!primary) return;
    if (primary.kind === "reactivate") {
      onOpenModal({ type: "reactivate" });
      return;
    }
    if (primary.kind === "review_exception" && primary.exceptionId) {
      setParams({ exception: primary.exceptionId });
      navigate(`/clients/${relationshipId}/overview?exception=${primary.exceptionId}`);
      return;
    }
    navigate(primary.to);
  }

  // Ended relationships: Configure is read-only (CE1) and the reminders
  // drawer only reports history (D-W7-7). Order, icons, descriptions and the
  // divider follow frames 208 and 208b; notes are added from the Overview
  // "Coach notes" card (Z9-13).
  const menuIcon = (Icon: typeof Settings) => (
    <Icon size={16} strokeWidth={1.75} />
  );
  const overflowItems: OverflowMenuItem[] = [
    {
      id: "client-settings",
      label: "Client settings",
      description: "Basic details, subscription & package",
      icon: menuIcon(Settings),
      onSelect: () => navigate(`/clients/${relationshipId}/settings`),
    },
    {
      id: "configure",
      label: ended ? "View coaching setup" : "Coaching setup",
      description: "Goal, expectations, check-ins, reminders",
      icon: menuIcon(ClipboardCheck),
      onSelect: () => navigate(`/clients/${relationshipId}/configure`),
    },
    {
      id: "onboarding",
      label: "Onboarding answers",
      icon: menuIcon(File),
      onSelect: () => navigate(`/clients/${relationshipId}/onboarding`),
    },
    {
      id: "reminders",
      label: ended ? "View reminder history" : "Reminder settings",
      icon: menuIcon(Bell),
      onSelect: () => onOpenModal({ type: "responsiveness" }),
    },
    ...(!ended
      ? [
          {
            id: "end",
            label: "End coaching…",
            icon: menuIcon(Ban),
            onSelect: () => onOpenModal({ type: "end" }),
            destructive: true,
            dividerBefore: true,
            disabled: !online,
          },
        ]
      : []),
  ];

  return (
    <header className="wsh" data-testid="screen-TW-09a">
      {ended && pendingReactivation ? (
        <div className="wsh-pending">
          <p className="banner-neutral" role="status">
            Waiting for {header.traineeDisplayName.split(/\s+/)[0] ?? header.traineeDisplayName} to confirm
            {pendingReactivation.sentAt
              ? ` · sent ${formatRelative(pendingReactivation.sentAt)}`
              : null}
          </p>
          <div className="wsh-pending-actions button-row">
            {remindHref ? (
              <a
                className="button-secondary button-whatsapp"
                href={remindHref}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppGlyph />
                Remind on WhatsApp
              </a>
            ) : (
              <button type="button" className="button-secondary" disabled>
                Remind on WhatsApp
              </button>
            )}
            <button
              type="button"
              className="button-secondary"
              disabled={!online || cancelBusy}
              onClick={() => void cancelPendingReactivation()}
            >
              Cancel request
            </button>
          </div>
          {cancelError ? (
            <p className="form-error" role="alert">
              {cancelError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        className="wsh-in"
        data-testid={ended ? "screen-TW-30" : undefined}
      >
        <nav className="wsh-crumb" aria-label="Breadcrumb">
          <Link to="/clients">Clients</Link>
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
          <span aria-current="page">{header.traineeDisplayName}</span>
        </nav>
        <div className="wsh-r1">
          <span className="avatar workspace-avatar lg" aria-hidden="true">
            {initials}
          </span>
          <div className="wsh-id">
            <div className="wsh-name-row">
              <h1 className="workspace-title">{header.traineeDisplayName}</h1>
              {ended ? (
                <span
                  className="status-chip status-chip-neutral wsh-ended-pill"
                  data-kind="lifecycle"
                  data-value="ended"
                >
                  <CircleOff size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    {labelFor("onboarding_status", "ended")}
                    {endedOn ? ` · ${endedOn}` : null}
                  </span>
                </span>
              ) : (
                <>
                  <StatusChip kind="lifecycle" value={header.onboardingStatus} />
                  <StatusChip kind="adherence" value={header.adherenceState} />
                </>
              )}
            </div>
            {metaNodes.length > 0 ? (
              <div className="wsh-meta">
                {metaNodes.map((item) => (
                  <span key={item.key} className="wsh-meta-item">
                    {item.node}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="wsh-signals">
              {me?.timezone ? (
                <TimezoneBadge
                  traineeName={header.traineeDisplayName}
                  traineeTimezone={resolveTraineeTimezone(header).timezone}
                  trainerTimezone={me.timezone}
                />
              ) : null}
              {header.hasCustomMealTimes ? (
                <Link
                  className="chip-link"
                  to={`/clients/${relationshipId}/plan`}
                >
                  Custom meal times
                </Link>
              ) : null}
            </div>
          </div>
          <div className="wsh-acts">
            {!ended ? (
              <>
              {whatsappHrefValue ? (
                <a
                  className="button-secondary button-whatsapp"
                  href={whatsappHrefValue}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Message on WhatsApp"
                >
                  <WhatsAppGlyph />
                  <span className="wsh-wa-long">Message on WhatsApp</span>
                  <span className="wsh-wa-short" aria-hidden="true">
                    WhatsApp
                  </span>
                </a>
              ) : (
                <button
                  type="button"
                  className="button-secondary button-whatsapp"
                  disabled
                  title="No WhatsApp number on file for this client"
                  aria-label="Message on WhatsApp"
                >
                  <WhatsAppGlyph />
                  <span className="wsh-wa-long">Message on WhatsApp</span>
                  <span className="wsh-wa-short" aria-hidden="true">
                    WhatsApp
                  </span>
                </button>
              )}
              </>
            ) : null}
            {ended && !pendingReactivation ? (
              <Button
                variant="primary"
                disabled={!online}
                onClick={() => onOpenModal({ type: "reactivate" })}
              >
                Reactivate
              </Button>
            ) : primary ? (
              <Button variant="primary" disabled={!online} onClick={runPrimary}>
                {primary.label}
              </Button>
            ) : null}
            <OverflowMenu items={overflowItems} variant="wide" />
          </div>
        </div>
        <nav className="wsh-tabs" aria-label="Client sections">
          {CLIENT_WORKSPACE_TABS.map((tab) => {
            const active = isClientWorkspaceTabActive(
              pathname,
              relationshipId,
              tab,
            );
            return (
              <Link
                key={tab.id}
                to={clientWorkspaceTabHref(relationshipId, tab)}
                className={active ? "wsh-tab is-active" : "wsh-tab"}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
                {"badge" in tab &&
                tab.badge === "submitted-checkins" &&
                submittedCheckinCount > 0 ? (
                  <span className="tab-badge">{submittedCheckinCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
