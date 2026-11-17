import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Invitation, OnboardingFormVersion } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
  formatPersonName,
  labelFor,
  whatsappHref,
} from "@fitbud/core";
import { Check, ChevronRight, Link2, Mail, X } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import { Button } from "../components/Button";
import { OverflowMenu } from "../components/OverflowMenu";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import { intakeFieldPreview } from "../lib/intakePrefill";
import { useOnline } from "../hooks/useOnline";
import { formatPhone } from "./client-settings/clientSettingsFormat";
import "./PendingInvitationPage.css";

type PinnedForm = {
  name: string;
  version: number;
  templateId: string;
  definition: OnboardingFormVersion;
} | null;

const STEPS = [
  { id: "invited", label: "Invited" },
  { id: "joined", label: "Joined" },
  { id: "intake", label: "Intake" },
  { id: "ready", label: "Ready to coach" },
] as const;

/** Frame 144: display name for the seeded global default. */
function formDisplayName(name: string, ownership: string): string {
  if (ownership === "global" && /^default onboarding$/i.test(name.trim())) {
    return "FitBud standard intake";
  }
  return name;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function firstNameOf(name: string): string {
  return name.split(/\s+/)[0] || name;
}

function possessiveFirstName(name: string): string {
  const first = firstNameOf(name);
  return /s$/i.test(first) ? `${first}'` : `${first}'s`;
}

function civilInZone(
  iso: string,
  timeZone: string | null | undefined,
): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  if (!timeZone) return iso.slice(0, 10);
  try {
    return formatLocalDate(at, timeZone);
  } catch {
    return iso.slice(0, 10);
  }
}

export function PendingInvitationPage() {
  const { invitationId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const { me } = useAuth();
  const trainerTz = me?.timezone ?? null;

  const [invite, setInvite] = useState<Invitation | null>(null);
  const [pinnedForm, setPinnedForm] = useState<PinnedForm>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmReissue, setConfirmReissue] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const revokeTitleId = useId();
  const revokeDialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!invitationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getInvitation(invitationId);
      setInvite(result);
      if (result.status === "accepted" && result.coachingRelationshipId) {
        navigate(`/clients/${result.coachingRelationshipId}`, { replace: true });
        return;
      }
      const templates = await apiClient.listOnboardingFormTemplates({
        limit: 50,
      });
      let found: PinnedForm = null;
      for (const summary of templates.items) {
        const detail = await apiClient.getOnboardingFormTemplate(summary.id);
        const version = detail.versions.find(
          (v) => v.id === result.onboardingFormTemplateVersionId,
        );
        if (version) {
          found = {
            name: formDisplayName(detail.name, detail.ownership),
            version: version.version,
            templateId: detail.id,
            definition: version,
          };
          break;
        }
      }
      setPinnedForm(found);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Invitation not found.",
      );
    } finally {
      setLoading(false);
    }
  }, [invitationId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!confirmRevoke) return;
    revokeDialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !acting) setConfirmRevoke(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmRevoke, acting]);

  async function onReissue() {
    if (!invitationId || !online) return;
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.reissueInvitation(invitationId);
      setInvite(result);
      setInviteUrl(result.inviteUrl);
      setConfirmReissue(false);
      try {
        await navigator.clipboard.writeText(result.inviteUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard may be unavailable; the new URL is still shown via state.
      }
      navigate(`/invitations/${result.id}`, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create a new link.",
      );
    } finally {
      setActing(false);
    }
  }

  async function onRevoke() {
    if (!invitationId || !online) return;
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.revokeInvitation(invitationId);
      setInvite(result);
      setConfirmRevoke(false);
      setInviteUrl(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not revoke invite.",
      );
    } finally {
      setActing(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error && !invite) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!invite) return null;

  if (invite.status === "accepted" && invite.coachingRelationshipId) {
    return (
      <Navigate
        to={`/clients/${invite.coachingRelationshipId}`}
        replace
      />
    );
  }

  const name =
    formatPersonName(invite.recipientDisplayName) || invite.recipientEmail;
  const shortName = firstNameOf(name);
  const invitedCivil = civilInZone(invite.createdAt, trainerTz);
  const expiresCivil = civilInZone(invite.expiresAt, trainerTz);
  const invitedDate = invitedCivil ? formatCivilDate(invitedCivil) : null;
  const expiresDate = expiresCivil ? formatCivilDate(expiresCivil) : null;
  const invitedClock = formatClockTime(invite.createdAt, trainerTz || undefined);
  const revokedCivil =
    invite.status === "revoked"
      ? civilInZone(invite.updatedAt, trainerTz)
      : null;
  const revokedLabel = revokedCivil
    ? `Revoked on ${formatCivilDate(revokedCivil)}`
    : null;

  const statusLabel =
    invite.status === "pending"
      ? labelFor("onboarding_status", "invited")
      : labelFor("invitation_status", invite.status);

  const whatsappDisplay = invite.recipientWhatsappE164
    ? formatPhone(invite.recipientWhatsappE164)
    : "—";

  const remindUrl = inviteUrl;
  const waLink =
    invite.recipientWhatsappE164 && invite.status === "pending"
      ? whatsappHref({
          phoneE164: invite.recipientWhatsappE164,
          draftText: remindUrl
            ? `Hi ${shortName}, here's your FitBud invite: ${remindUrl}`
            : `Hi ${shortName}, please accept your FitBud invitation so we can start onboarding.`,
        })
      : null;

  const readOnly = invite.status !== "pending";
  const formLabel = pinnedForm
    ? `${pinnedForm.name} · v${pinnedForm.version}`
    : "Pinned form";

  const inviteLinkRow =
    invitedDate && expiresDate
      ? `Sent ${invitedDate} · expires ${expiresDate}`
      : invitedDate
        ? `Sent ${invitedDate}`
        : expiresDate
          ? `Expires ${expiresDate}`
          : "—";

  const metaParts: string[] = [];
  if (invite.status === "pending") {
    if (invitedDate) metaParts.push(`Invited ${invitedDate}`);
    metaParts.push("Not joined yet");
    if (expiresDate) metaParts.push(`Link expires ${expiresDate}`);
  } else if (invite.status === "revoked" && revokedLabel) {
    metaParts.push(revokedLabel);
  } else if (invite.status === "expired" && expiresDate) {
    metaParts.push(`Expired ${expiresDate}`);
  }

  const timelineInvited =
    invitedDate && invitedClock
      ? `${invitedDate}, ${invitedClock}`
      : invitedDate;

  return (
    <section
      className="page pending-invite-page"
      data-testid="screen-TW-08"
    >
      <header className="wsh pending-invite-header">
        <div className="wsh-in">
          <nav className="wsh-crumb" aria-label="Breadcrumb">
            <Link to="/clients">Clients</Link>
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
            <span aria-current="page">{name}</span>
          </nav>
          <div className="wsh-r1">
            <span className="avatar workspace-avatar lg" aria-hidden="true">
              {initialsOf(name) || "?"}
            </span>
            <div className="wsh-id">
              <div className="wsh-name-row">
                <h1 className="workspace-title">{name}</h1>
                <span
                  className="pending-invite-pill"
                  data-kind="lifecycle"
                  data-value={
                    invite.status === "pending" ? "invited" : invite.status
                  }
                >
                  <Mail size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>{statusLabel}</span>
                </span>
              </div>
              {metaParts.length > 0 ? (
                <p className="wsh-meta pending-invite-meta">
                  {metaParts.join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="wsh-acts">
              {!readOnly ? (
                <OverflowMenu
                  label="More actions"
                  items={[
                    {
                      id: "revoke",
                      label: "Revoke invite",
                      destructive: true,
                      onSelect: () => setConfirmRevoke(true),
                      disabled: !online || acting,
                    },
                  ]}
                />
              ) : null}
            </div>
          </div>
          <nav className="wsh-tabs" aria-label="Invitation sections">
            <span className="wsh-tab is-active" aria-current="page">
              Invite
            </span>
          </nav>
        </div>
      </header>

      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Changes can&apos;t be saved.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="pending-invite-layout">
        <div className="pending-invite-main invite-detail-card">
          <ol className="pending-invite-stepper" aria-label="Onboarding progress">
            {STEPS.map((step, index) => {
              const done = index === 0 && invite.status !== "expired";
              const active = index === 0;
              const state = done ? "is-done" : active ? "is-active" : "";
              return (
                <li
                  key={step.id}
                  className={`pending-invite-step ${state}`.trim()}
                >
                  <div className="pending-invite-step-top">
                    <span className="pending-invite-step-num" aria-hidden="true">
                      {done ? <Check size={14} strokeWidth={2.5} /> : index + 1}
                    </span>
                    <span className="pending-invite-step-label">
                      {step.label}
                    </span>
                  </div>
                  <div className="pending-invite-step-rail" aria-hidden="true" />
                </li>
              );
            })}
          </ol>

          <dl className="invite-detail-meta pending-invite-fields">
            <div>
              <dt>Email</dt>
              <dd>{invite.recipientEmail}</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>{whatsappDisplay}</dd>
            </div>
            <div>
              <dt>Onboarding form</dt>
              <dd>
                <span>{formLabel}</span>
                {pinnedForm ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="link pending-invite-preview-link"
                      onClick={() => setShowPreview(true)}
                    >
                      Preview
                    </button>
                  </>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Invite link</dt>
              <dd>{inviteLinkRow}</dd>
            </div>
          </dl>

          {!readOnly ? (
            <div className="pending-invite-actions">
              {waLink ? (
                <a
                  className="button-primary btn-lg"
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsAppGlyph />
                  Remind on WhatsApp
                </a>
              ) : (
                <Button
                  variant="primary"
                  className="btn-lg"
                  disabled
                  title="No WhatsApp number on this invite"
                >
                  <WhatsAppGlyph />
                  Remind on WhatsApp
                </Button>
              )}
              {!confirmReissue ? (
                <Button
                  variant="secondary"
                  className="btn-lg"
                  disabled={acting || !online}
                  onClick={() => setConfirmReissue(true)}
                >
                  <Link2 size={16} strokeWidth={1.75} aria-hidden />
                  {copied ? "Copied" : "Copy new link"}
                </Button>
              ) : (
                <div className="pending-invite-reissue" role="group">
                  <p>
                    Create a new link? The old link will stop working.
                  </p>
                  <div className="button-row">
                    <Button
                      variant="primary"
                      disabled={acting || !online}
                      onClick={() => void onReissue()}
                    >
                      {acting ? "Creating…" : "Create new link"}
                    </Button>
                    <Button
                      variant="tertiary"
                      onClick={() => setConfirmReissue(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {!readOnly && !confirmReissue ? (
            <p className="pending-invite-helper">
              Copy new link replaces the old one. The old link will stop
              working.
            </p>
          ) : null}
        </div>

        <aside className="pending-invite-side">
          <div className="pending-invite-side-card">
            <h2 className="t-h3">What happens next</h2>
            <p>
              When {shortName} accepts, this page shows{" "}
              {possessiveFirstName(name)} intake progress. Workspace tabs open
              once {shortName} joins.
            </p>
          </div>
          <div className="pending-invite-side-card">
            <h2 className="t-h3">Timeline</h2>
            <ol className="pending-invite-timeline">
              <li>
                <span className="pending-invite-timeline-dot" aria-hidden />
                <span>
                  Invited
                  {timelineInvited ? ` · ${timelineInvited}` : null}
                </span>
              </li>
            </ol>
          </div>
        </aside>
      </div>

      {confirmRevoke ? (
        <div className="modal-scrim" role="presentation">
          <div
            className="modal-card pending-invite-revoke-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={revokeTitleId}
            tabIndex={-1}
            ref={revokeDialogRef}
          >
            <header className="pending-invite-revoke-head">
              <h2 id={revokeTitleId}>
                Revoke {possessiveFirstName(name)} invite?
              </h2>
              <button
                type="button"
                className="button-ghost pending-invite-revoke-close"
                aria-label="Close"
                disabled={acting}
                onClick={() => setConfirmRevoke(false)}
              >
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </header>
            <p>
              The invite link stops working right away. {shortName} won&apos;t
              be able to join until you invite again.
            </p>
            <div className="pending-invite-revoke-actions button-row">
              <Button
                variant="secondary"
                disabled={acting}
                onClick={() => setConfirmRevoke(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={acting || !online}
                onClick={() => void onRevoke()}
              >
                {acting ? "Revoking…" : "Revoke invite"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showPreview && pinnedForm ? (
        <div
          className="modal-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding form preview"
        >
          <div className="modal-card">
            <header className="card-h">
              <h3>Trainee preview</h3>
              <button
                type="button"
                className="button-ghost"
                onClick={() => setShowPreview(false)}
              >
                Close
              </button>
            </header>
            <ul className="template-bases-list">
              {intakeFieldPreview(pinnedForm.definition).map((field) => (
                <li key={field.id}>
                  {field.label}
                  {field.required ? " · required" : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
