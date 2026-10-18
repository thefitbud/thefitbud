import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Invitation } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatInstant,
  formatPersonName,
  whatsappHref,
} from "@fitbud/core";
import { apiClient } from "../lib/api";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import { useOnline } from "../hooks/useOnline";

type PinnedForm = { name: string; version: number } | null;

export function PendingInvitationPage() {
  const { invitationId = "" } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [pinnedForm, setPinnedForm] = useState<PinnedForm>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmReissue, setConfirmReissue] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
      // Resolve pinned form name/version from templates list.
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
          found = { name: detail.name, version: version.version };
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

  async function onReissue() {
    if (!invitationId || !online) return;
    setActing(true);
    setError(null);
    try {
      const result = await apiClient.reissueInvitation(invitationId);
      setInvite(result);
      setInviteUrl(result.inviteUrl);
      setConfirmReissue(false);
      navigate(`/invitations/${result.id}`, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create a new link.",
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
      setMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke invite.");
    } finally {
      setActing(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
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
  const invitedDate = formatCivilDate(invite.createdAt.slice(0, 10));
  const revokedLabel =
    invite.status === "revoked"
      ? `Revoked on ${formatInstant(invite.updatedAt)}`
      : null;

  const waLink =
    invite.recipientWhatsappE164 && (inviteUrl || true)
      ? whatsappHref({
          phoneE164: invite.recipientWhatsappE164,
          draftText: inviteUrl
            ? `Hi ${name.split(/\s+/)[0]}, here's your FitBud invite: ${inviteUrl}`
            : `Hi ${name.split(/\s+/)[0]}, please accept your FitBud invitation so we can start onboarding.`,
        })
      : null;

  const readOnly = invite.status !== "pending";

  return (
    <section className="page" data-testid="screen-TW-08">
      <header className="page-header">
        <p className="eyebrow">
          <Link to="/clients">Clients</Link> / Invitation
        </p>
        <h1>{name}</h1>
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

      <div className="invite-detail-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <StatusChip kind="lifecycle" value="invited" label={invite.status === "revoked" ? "Revoked" : "Invited"} />
          {!readOnly ? (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="button-ghost"
                aria-label="More actions"
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="overflow-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setConfirmRevoke(true);
                      setMenuOpen(false);
                    }}
                  >
                    Revoke invite
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <dl className="invite-detail-meta">
          <div>
            <dt>Email</dt>
            <dd>{invite.recipientEmail}</dd>
          </div>
          <div>
            <dt>WhatsApp</dt>
            <dd>
              {invite.recipientWhatsappE164
                ? `+${invite.recipientWhatsappE164}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Invited</dt>
            <dd>{invitedDate}</dd>
          </div>
          <div>
            <dt>Onboarding form</dt>
            <dd>
              {pinnedForm
                ? `${pinnedForm.name} · v${pinnedForm.version}`
                : "Pinned form"}
            </dd>
          </div>
        </dl>

        {revokedLabel ? (
          <p className="muted" role="status">
            {revokedLabel}
          </p>
        ) : null}

        {!readOnly ? (
          <div className="invite-share-actions">
            {waLink ? (
              <a
                className="button-primary btn-lg"
                href={waLink}
                target="_blank"
                rel="noreferrer"
              >
                Remind on WhatsApp
              </a>
            ) : (
              <Button variant="primary" disabled>
                Remind on WhatsApp
              </Button>
            )}
            {!confirmReissue ? (
              <Button
                variant="secondary"
                disabled={acting || !online}
                onClick={() => setConfirmReissue(true)}
              >
                Copy new link
              </Button>
            ) : (
              <div className="state-panel">
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
            {inviteUrl ? (
              <Button variant="secondary" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {confirmRevoke ? (
          <div className="state-panel is-error" style={{ marginTop: 16 }}>
            <p>Revoke this invite? Your client won&apos;t be able to accept it.</p>
            <div className="button-row">
              <Button
                variant="destructive"
                disabled={acting || !online}
                onClick={() => void onRevoke()}
              >
                Revoke invite
              </Button>
              <Button variant="tertiary" onClick={() => setConfirmRevoke(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
