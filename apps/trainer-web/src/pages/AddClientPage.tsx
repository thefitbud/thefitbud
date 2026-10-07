import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CreateInvitationResponse,
  OnboardingFormTemplateSummary,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { intakeFieldPreview } from "../lib/intakePrefill";
import { clientWhatsappHref } from "../lib/whatsapp";

export function AddClientPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<OnboardingFormTemplateSummary[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateInvitationResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items: OnboardingFormTemplateSummary[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 10; page += 1) {
          const result = await apiClient.listOnboardingFormTemplates({
            cursor,
            limit: 50,
          });
          items.push(...result.items);
          if (!result.nextCursor) break;
          cursor = result.nextCursor;
        }
        if (!cancelled) {
          setTemplates(items);
          setTemplatesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTemplates([]);
          setTemplatesError(
            err instanceof ApiClientError
              ? err.message
              : "Could not load onboarding templates.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!templateId) {
      setDefinition(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    void apiClient
      .getOnboardingFormTemplate(templateId)
      .then((detail) => {
        if (cancelled) return;
        const latest =
          detail.versions.find((version) => version.id === detail.latestVersionId) ??
          [...detail.versions].sort((left, right) => right.version - left.version)[0] ??
          null;
        setDefinition(latest);
        setPreviewError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDefinition(null);
        setPreviewError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load that template.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

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
          ...(templateId ? { onboardingFormTemplateId: templateId } : {}),
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
                setTemplateId("");
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
            Invite the client with a WhatsApp number so Message in their
            workspace can remind them to accept and finish onboarding. Leave
            the template empty to keep the server’s current form resolution, or
            pin one existing template.
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
        <label className="field">
          <span>Onboarding template</span>
          <select
            name="onboardingFormTemplateId"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            disabled={submitting}
          >
            <option value="">Resolved form</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.ownership}, v{template.latestVersionNumber})
              </option>
            ))}
          </select>
        </label>
        {templatesError ? (
          <p className="form-error" role="alert">
            {templatesError}
          </p>
        ) : null}
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
          <div>
            <h2 id="onboarding-form-heading" className="workspace-card-title">
              Onboarding form
            </h2>
            <p className="lede">
              {definition
                ? `Latest version of the selected template (${definition.key}, version ${definition.version}). The invitation pins that version.`
                : "No template selected. Create the invitation without a template id so the server pins the resolved form."}
            </p>
          </div>
        </div>
        {previewError ? (
          <p className="form-error" role="alert">
            {previewError}
          </p>
        ) : null}
        {fields.length === 0 ? (
          <p className="muted">
            {templateId
              ? "This template’s latest version could not be previewed."
              : "Select a template to preview its latest questions. An empty choice does not send a template id."}
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
      </section>
    </section>
  );
}
