import { userFacingMessage } from "@fitbud/api-client";
import { useState, type ReactNode } from "react";
import { Ban, Bell, ChevronRight, CircleOff, NotebookPen } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Checkin, ClientWorkspace } from "@fitbud/contracts";
import {
  deviceTimeZone,
  formatCivilDate,
  formatLocalDate,
  formatRelative,
  labelFor,
  resolveIntlTimeZone,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../Button";
import { Button as UiButton } from "../ui";
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
import "./workspace-header.css";

const WEEK_MS = 7 * 86_400_000;

/**
 * Trainer zone for Coached/Ended dates (D-W12-26). Prefer the stored profile
 * zone; with none, use the browser zone through `resolveIntlTimeZone`.
 */
export function resolveTrainerDisplayZone(
  stored: string | null | undefined,
): string | null {
  const candidate = stored?.trim() || deviceTimeZone();
  try {
    return resolveIntlTimeZone(candidate);
  } catch {
    return null;
  }
}

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

/**
 * The v3 client header (W13-10; frames W-03, W-209 and every client frame):
 * breadcrumb, avatar, name with status pills, a one-line subtitle, the actions
 * **WhatsApp · Remind · Note · ⋯**, and the seven tabs ending in Settings.
 */
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

  const nextStep = primaryActionFor({
    relationshipId,
    onboardingStatus: header.onboardingStatus,
    configurationActive,
    reviewCheckin: reviewCheckin as Checkin | null,
    openExceptionId: workspace.overview.openException?.id ?? null,
    ended,
    reactivationPending: Boolean(pendingReactivation),
  });
  // W13-10 (DS §6, frames W-03 / W-209): a coached client's header has no
  // primary button; its actions are WhatsApp · Remind · Note · ⋯ and the
  // Overview carries Review. A client who is not coached yet keeps the one
  // lifecycle step (Review intake, Set up coaching); an ended client keeps
  // Reactivate.
  const primary =
    nextStep &&
    (nextStep.kind === "review_intake" ||
      nextStep.kind === "configure" ||
      nextStep.kind === "reactivate")
      ? nextStep
      : null;

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
        userFacingMessage(err, { fallback: "Could not cancel the request." }),
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

  // Frame 179 / D-W12-26: civil dates in the trainer's stored zone when set;
  // otherwise the browser zone through the CU17 resolver (no "Ended" without
  // dates while me.timezone is still loading or unset).
  const trainerTz = resolveTrainerDisplayZone(me?.timezone);
  const civilDay = (iso: string | null | undefined): string | null => {
    if (!iso || !trainerTz) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return formatCivilDate(formatLocalDate(at, trainerTz));
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
    navigate(primary.to);
  }

  // W13-10: Client settings, Coaching setup, Onboarding answers and Reminder
  // settings became the Settings tab and its sections, so the ⋯ menu keeps
  // only the action that is not a place: End coaching… (frame 208 icon). An
  // ended client has nothing left in it, so the ⋯ is not drawn.
  const overflowItems: OverflowMenuItem[] = ended
    ? []
    : [
        {
          id: "end",
          label: "End coaching…",
          icon: <Ban size={16} strokeWidth={1.75} />,
          onSelect: () => onOpenModal({ type: "end" }),
          destructive: true,
          disabled: !online,
        },
      ];

  return (
    <header className="wsh wsh-v3" data-testid="screen-TW-09a">
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
              {trainerTz ? (
                <TimezoneBadge
                  traineeName={header.traineeDisplayName}
                  traineeTimezone={resolveTraineeTimezone(header).timezone}
                  trainerTimezone={trainerTz}
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
                    className="ui-btn ui-btn-secondary wsh-act wsh-wa"
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
                    className="ui-btn ui-btn-secondary wsh-act wsh-wa"
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
                {/* Remind sends a reminder about one planned item; the items
                    and their Remind actions live in Activity (W14 flow). */}
                <Link
                  className="ui-btn ui-btn-secondary wsh-act"
                  to={`/clients/${relationshipId}/activity`}
                  title="Pick what to remind about in Activity"
                  data-testid="wsh-remind"
                >
                  <Bell size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>Remind</span>
                </Link>
                <UiButton
                  variant="secondary"
                  className="wsh-act"
                  disabled={!online}
                  onClick={() => onOpenModal({ type: "note" })}
                  data-testid="wsh-note"
                >
                  <NotebookPen size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>Note</span>
                </UiButton>
              </>
            ) : null}
            {ended && !pendingReactivation ? (
              <Button
                variant="primary"
                className="wsh-reactivate"
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
            {overflowItems.length > 0 ? (
              <OverflowMenu items={overflowItems} variant="wide" />
            ) : null}
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
