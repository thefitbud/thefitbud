import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CreateInvitationResponse,
  OnboardingFormTemplateSummary,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import { formatPersonName, normalizeWhatsappE164 } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../Button";
import { InviteShareCard } from "./InviteShareCard";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { intakeFieldPreview } from "../../lib/intakePrefill";
import { useOnline } from "../../hooks/useOnline";

type Props = {
  embedded?: boolean;
  onSuccess?: (invite: CreateInvitationResponse) => void;
};

export function AddClientForm({ embedded = false, onSuccess }: Props) {
  const { me } = useAuth();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<OnboardingFormTemplateSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [reactivateRid, setReactivateRid] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateInvitationResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);

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
          const globalDefault =
            items.find((t) => t.ownership === "global") ?? items[0];
          if (globalDefault) setTemplateId(globalDefault.id);
        }
      } catch {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!templateId) {
      setDefinition(null);
      return;
    }
    let cancelled = false;
    void apiClient
      .getOnboardingFormTemplate(templateId)
      .then((detail) => {
        if (cancelled) return;
        const latest =
          detail.versions.find((v) => v.id === detail.latestVersionId) ??
          [...detail.versions].sort((a, b) => b.version - a.version)[0] ??
          null;
        setDefinition(latest);
      })
      .catch(() => {
        if (!cancelled) setDefinition(null);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    setDuplicateId(null);
    setReactivateRid(null);
    const digits = whatsapp.trim();
    let recipientWhatsapp: string | undefined;
    if (digits) {
      const normalized = normalizeWhatsappE164(
        digits.startsWith("+") ? digits : `+91${digits.replace(/\D/g, "")}`,
      );
      if (!normalized) {
        setError("Enter a valid WhatsApp number.");
        setSubmitting(false);
        return;
      }
      recipientWhatsapp = normalized;
    }
    try {
      const invitation = await apiClient.createInvitation(
        {
          recipientEmail: email.trim(),
          recipientDisplayName: displayName.trim() || undefined,
          recipientWhatsapp,
          ...(templateId ? { onboardingFormTemplateId: templateId } : {}),
          sendEmail: true,
        },
        createIdempotencyKey(),
      );
      setCreated(invitation);
      onSuccess?.(invitation);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "INVITE_PENDING") {
          const id =
            typeof err.details === "object" &&
            err.details &&
            "invitationId" in err.details
              ? String((err.details as { invitationId: string }).invitationId)
              : null;
          setDuplicateId(id);
          // Link text supplies "Resend instead" — keep it out of the message.
          setError(
            `${formatPersonName(displayName) || "This client"} already has a pending invite.`,
          );
        } else if (err.code === "CLIENT_ENDED") {
          const rid =
            typeof err.details === "object" &&
            err.details &&
            "relationshipId" in err.details
              ? String((err.details as { relationshipId: string }).relationshipId)
              : null;
          setReactivateRid(rid);
          setError(
            `${formatPersonName(displayName) || "This client"} coached with you before. Reactivate instead?`,
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Could not create invitation.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const name =
      formatPersonName(created.recipientDisplayName) ||
      created.recipientEmail.split("@")[0] ||
      "your client";
    return (
      <InviteShareCard
        name={name}
        inviteUrl={created.inviteUrl}
        whatsappE164={created.recipientWhatsappE164}
        trainerFirstName={
          me?.trainerProfile?.displayName?.split(/\s+/)[0] ?? "I"
        }
        onInviteAnother={() => {
          setCreated(null);
          setEmail("");
          setDisplayName("");
          setWhatsapp("");
        }}
        onEmailInvite={() => {
          const subject = encodeURIComponent("You're invited to FitBud coaching");
          const body = encodeURIComponent(
            `Join me on FitBud:\n${created.inviteUrl}`,
          );
          window.location.href = `mailto:${created.recipientEmail}?subject=${subject}&body=${body}`;
        }}
      />
    );
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <form
      className={embedded ? "stack-form" : "stack-form"}
      onSubmit={onSubmit}
      data-testid={embedded ? "welcome-invite-form" : "add-client-form"}
    >
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Changes can&apos;t be saved.
        </p>
      ) : null}
      <label className="field" htmlFor="add-client-name">
        <span>Client name</span>
        <span className="input-shell">
          <input
            id="add-client-name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={submitting || !online}
          />
        </span>
      </label>
      <label className="field" htmlFor="add-client-email">
        <span>Email</span>
        <span className="input-shell">
          <input
            id="add-client-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting || !online}
          />
        </span>
      </label>
      <label className="field" htmlFor="add-client-wa">
        <span>Mobile / WhatsApp</span>
        <span className="input-shell">
          <span className="phone-prefix">+91</span>
          <input
            id="add-client-wa"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            disabled={submitting || !online}
          />
        </span>
        <span className="field-hint">
          Your client can sign in with this number, and you can message them on
          WhatsApp from FitBud.
        </span>
      </label>
      <label className="field">
        <span className="field-label-row">
          <span>Onboarding form</span>
          {templateId ? (
            <button
              type="button"
              className="link"
              onClick={() => setShowPreview(true)}
            >
              Preview
            </button>
          ) : null}
        </span>
        <span className="input-shell">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={submitting || !online}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ownership === "global"
                  ? `${t.name} (global)`
                  : t.name}
              </option>
            ))}
          </select>
        </span>
        {selectedTemplate?.ownership === "global" ? (
          <span className="field-hint">FitBud standard intake (global)</span>
        ) : null}
      </label>
      {error ? (
        <p className="form-error" role="alert" data-testid="add-client-error">
          {error}{" "}
          {duplicateId ? (
            <Link
              to={`/invitations/${duplicateId}`}
              data-testid="duplicate-invite-link"
            >
              Resend instead
            </Link>
          ) : null}
          {reactivateRid ? (
            <Link
              to={`/clients/${reactivateRid}`}
              data-testid="reactivate-client-link"
            >
              Reactivate
            </Link>
          ) : null}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        className="btn-lg"
        disabled={submitting || !online}
      >
        {submitting ? "Creating…" : "Create invite"}
      </Button>

      {showPreview && definition ? (
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
              {intakeFieldPreview(definition).map((field) => (
                <li key={field.id}>
                  {field.label}
                  {field.required ? " · required" : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </form>
  );
}
