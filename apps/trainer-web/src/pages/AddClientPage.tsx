import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { CreateInvitationResponse } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

export function AddClientPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateInvitationResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const invitation = await apiClient.createInvitation(
        {
          recipientEmail: email.trim(),
          recipientDisplayName: displayName.trim() || undefined,
        },
        createIdempotencyKey(),
      );
      setCreated(invitation);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not create invitation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section className="page narrow">
        <header className="page-header">
          <div>
            <h1>Invitation created</h1>
            <p className="lede">
              Share the invite token with {created.recipientDisplayName || created.recipientEmail}.
              The raw token is shown once.
            </p>
          </div>
        </header>
        <dl className="detail-list">
          <div>
            <dt>Recipient</dt>
            <dd>{created.recipientEmail}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Invited</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{new Date(created.expiresAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Invite token</dt>
            <dd>
              <code className="token-block">{created.token}</code>
            </dd>
          </div>
        </dl>
        <div className="button-row">
          <Link to="/clients" className="button-primary">
            Back to Clients
          </Link>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setCreated(null);
              setEmail("");
              setDisplayName("");
            }}
          >
            Invite another
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page narrow">
      <header className="page-header">
        <div>
          <h1>Add Client</h1>
          <p className="lede">
            Create an invitation. The trainee completes their own intake after
            accepting.
          </p>
        </div>
      </header>

      <form className="stack-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Client email</span>
          <input
            type="email"
            name="recipientEmail"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Display name (optional)</span>
          <input
            type="text"
            name="recipientDisplayName"
            maxLength={120}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={submitting}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? "Sending…" : "Send invitation"}
          </button>
          <Link to="/clients" className="button-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
