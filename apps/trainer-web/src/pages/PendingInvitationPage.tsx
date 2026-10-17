import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Invitation } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { formatIsoDateTime } from "../lib/format";
import { createIdempotencyKey } from "../lib/idempotency";
import { reissueInvitation, revokeInvitation } from "../lib/http-api";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import { whatsappHref } from "../lib/whatsapp";

export function PendingInvitationPage() {
  const { invitationId = "" } = useParams();
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!invitationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getInvitation(invitationId);
      setInvite(result);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Invitation not found.",
      );
    } finally {
      setLoading(false);
    }
  }, [invitationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onReissue() {
    if (!invitationId) return;
    setActing(true);
    try {
      const result = await reissueInvitation(invitationId, createIdempotencyKey());
      setInvite(result);
      setInviteUrl(result.inviteUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a new link.");
    } finally {
      setActing(false);
    }
  }

  async function onRevoke() {
    if (!invitationId) return;
    setActing(true);
    try {
      const result = await revokeInvitation(invitationId, createIdempotencyKey());
      setInvite(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke invite.");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error && !invite) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!invite) return null;

  const waLink =
    invite.recipientWhatsappE164 && inviteUrl
      ? whatsappHref({
          phoneE164: invite.recipientWhatsappE164,
          draftText: `Join me on FitBud: ${inviteUrl}`,
        })
      : null;

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">
          <Link to="/clients">Clients</Link> / Invitation
        </p>
        <h1>{invite.recipientDisplayName ?? invite.recipientEmail}</h1>
        <p className="lede">Status: {invite.status}</p>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <dl className="detail-list">
        <div>
          <dt>Email</dt>
          <dd>{invite.recipientEmail}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{formatIsoDateTime(invite.expiresAt)}</dd>
        </div>
      </dl>
      {inviteUrl ? (
        <p>
          <a href={inviteUrl}>{inviteUrl}</a>
        </p>
      ) : null}
      <div className="button-row">
        {invite.status === "pending" ? (
          <>
            <button
              type="button"
              className="button-primary"
              disabled={acting}
              onClick={() => void onReissue()}
            >
              Create a new link
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={acting}
              onClick={() => void onRevoke()}
            >
              Revoke invitation
            </button>
          </>
        ) : null}
        {waLink ? (
          <a className="button-secondary" href={waLink} target="_blank" rel="noreferrer">
            WhatsApp invite
          </a>
        ) : null}
      </div>
    </section>
  );
}
