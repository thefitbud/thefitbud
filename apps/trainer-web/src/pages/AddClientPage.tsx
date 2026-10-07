import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CreateInvitationResponse,
  IntakeDefinition,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { intakeFieldPreview } from "../lib/intakePrefill";
import { clientWhatsappHref } from "../lib/whatsapp";

export function AddClientPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateInvitationResponse | null>(null);
  const [definition, setDefinition] = useState<IntakeDefinition | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .getCurrentIntakeDefinition()
      .then((value) => {
        if (!cancelled) setDefinition(value);
      })
      .catch(() => {
        if (!cancelled) setDefinition(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const invitation = await apiClient.createInvitation(
        {
          recipientEmail: email.trim(),
          recipientDisplayName: displayName.trim() || undefined,
          recipientWhatsapp: whatsapp.trim() || undefined,
        },
        createIdempotencyKey(),
      );
      setCreated(invitation);
      setCopied(false);
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

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const fields = intakeFieldPreview(definition);
  const inviteWhatsappHref = created
    ? clientWhatsappHref({
        phoneE164: created.recipientWhatsappE164,
        name: created.recipientDisplayName || created.recipientEmail,
        onboardingStatus: created.onboardingStatus,
        inviteToken: created.token,
      })
    : null;

  if (created) {
    return (
      <section className="page narrow add-client-page">
        <header className="page-header">
          <div>
            <h1>Invitation created</h1>
            <p className="lede">
              Share this invite code with{" "}
              {created.recipientDisplayName || created.recipientEmail}. They
              enter it in the FitBud trainee app to start the onboarding form.
              The code is shown once.
            </p>
          </div>
        </header>
        <ol className="workflow-steps" aria-label="What happens next">
          <li className="is-done">Invite created</li>
          <li className="is-current">Trainee accepts with the code</li>
          <li>Trainee submits onboarding</li>
          <li>You review answers and configure coaching</li>
        </ol>
        <div className="workspace-card">
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
              <dt>WhatsApp</dt>
              <dd>
                {created.recipientWhatsappE164
                  ? `+${created.recipientWhatsappE164}`
                  : "Not provided"}
              </dd>
            </div>
            <div>
              <dt>Invite code</dt>
              <dd>
                <code className="token-block">{created.token}</code>
                <div className="button-row">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      void copyToken(created.token);
                    }}
                  >
                    {copied ? "Copied" : "Copy invite code"}
                  </button>
                </div>
              </dd>
            </div>
          </dl>
          <p className="muted">
            FitBud does not email the code yet. Send it to the client yourself.
          </p>
          <div className="button-row">
            {inviteWhatsappHref ? (
              <a
                className="button-primary"
                href={inviteWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Message on WhatsApp
              </a>
            ) : null}
            <Link
              to="/clients"
              className={inviteWhatsappHref ? "button-secondary" : "button-primary"}
            >
              Back to Clients
            </Link>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setCreated(null);
                setEmail("");
                setDisplayName("");
                setWhatsapp("");
                setCopied(false);
              }}
            >
              Invite another
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page narrow add-client-page">
      <header className="page-header">
        <div>
          <h1>Add Client</h1>
          <p className="lede">
            Create an invitation using the current onboarding form. After the
            trainee accepts the invite code, they complete that form. You review
            the answers and configure coaching.
          </p>
        </div>
      </header>

      <ol className="workflow-steps" aria-label="Client start workflow">
        <li className="is-current">Invite</li>
        <li>Trainee accepts</li>
        <li>Onboarding form</li>
        <li>Review and configure</li>
      </ol>

      <form className="workspace-card stack-form" onSubmit={onSubmit}>
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
        <label className="field">
          <span>WhatsApp number</span>
          <input
            type="tel"
            name="recipientWhatsapp"
            inputMode="tel"
            autoComplete="tel"
            placeholder="9876543210 or +91 98765 43210"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            disabled={submitting}
          />
        </label>
        <p className="muted">
          Used for the Message shortcut in this client’s workspace. Ten-digit
          Indian numbers are stored with country code 91.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? "Creating invitation…" : "Create invitation"}
          </button>
          <Link to="/clients" className="button-ghost">
            Cancel
          </Link>
        </div>
      </form>

      <section className="workspace-card" aria-labelledby="onboarding-form-heading">
        <div className="workspace-card-head">
          <h2 id="onboarding-form-heading" className="workspace-card-title">
            Onboarding form the trainee will complete
          </h2>
        </div>
        {fields.length === 0 ? (
          <p className="muted">
            The current intake definition could not be loaded. The trainee still
            receives the platform onboarding form after accepting.
          </p>
        ) : (
          <ul className="intake-preview">
            {fields.map((field) => (
              <li key={field.id}>
                {field.label}
                {field.required ? (
                  <span className="required-mark">Required</span>
                ) : (
                  <span className="optional-mark">Optional</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Template libraries for onboarding forms, workouts, nutrition, and
          coaching configuration come later. Until then the platform form above
          is what the trainee completes.
        </p>
      </section>
    </section>
  );
}
