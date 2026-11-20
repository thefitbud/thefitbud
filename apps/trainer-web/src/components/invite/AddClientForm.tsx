import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  CreateInvitationResponse,
  OnboardingFormTemplateSummary,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatPersonName,
  normalizeWhatsappE164,
} from "@fitbud/core";
import { Clock } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../Button";
import { InviteShareCard } from "./InviteShareCard";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";
import { intakeFieldPreview } from "../../lib/intakePrefill";
import { useOnline } from "../../hooks/useOnline";

export type AddClientPhase = "form" | "reactivate" | "success";

type Props = {
  embedded?: boolean;
  onSuccess?: (invite: CreateInvitationResponse) => void;
  onPhaseChange?: (phase: AddClientPhase) => void;
  onClientNameChange?: (name: string) => void;
};

type ReactivateInfo = {
  relationshipId: string;
  endedOnLabel: string | null;
};

/** Frame 141 label for the seeded global default (DB name is still "Default onboarding"). */
function templateOptionLabel(t: OnboardingFormTemplateSummary): string {
  const base =
    t.ownership === "global" && /^default onboarding$/i.test(t.name.trim())
      ? "FitBud standard intake"
      : t.name;
  const scope = t.ownership === "global" ? " (global)" : "";
  return `${base}${scope} · v${t.latestVersionNumber}`;
}

export function AddClientForm({
  embedded = false,
  onSuccess,
  onPhaseChange,
  onClientNameChange,
}: Props) {
  const { me } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<OnboardingFormTemplateSummary[]>(
    [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [reactivate, setReactivate] = useState<ReactivateInfo | null>(null);
  const [created, setCreated] = useState<CreateInvitationResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    onClientNameChange?.(displayName);
  }, [displayName, onClientNameChange]);

  function setPhase(next: AddClientPhase) {
    onPhaseChange?.(next);
  }

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

  async function resolveEndedOn(relationshipId: string): Promise<string | null> {
    try {
      const directory = await apiClient.listClients({
        status: ["ended"],
        limit: 100,
      });
      const match = directory.items.find(
        (row) => row.relationshipId === relationshipId,
      );
      const civil = match?.endedOn ?? match?.endedAt?.slice(0, 10) ?? null;
      return civil ? formatCivilDate(civil) : null;
    } catch {
      try {
        const rel = await apiClient.getRelationship(relationshipId);
        return rel.endedAt
          ? formatCivilDate(rel.endedAt.slice(0, 10))
          : null;
      } catch {
        return null;
      }
    }
  }

  function clearReactivateAndReset() {
    setReactivate(null);
    setError(null);
    setEmail("");
    setDisplayName("");
    setWhatsapp("");
    setPhase("form");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return;
    setSubmitting(true);
    setError(null);
    setDuplicateId(null);
    setReactivate(null);
    setPhase("form");
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
      setPhase("success");
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
          setError(
            `${formatPersonName(displayName) || "This client"} already has a pending invite.`,
          );
        } else if (err.code === "CLIENT_ENDED") {
          const rid =
            typeof err.details === "object" &&
            err.details &&
            "relationshipId" in err.details
              ? String(
                  (err.details as { relationshipId: string }).relationshipId,
                )
              : null;
          if (rid) {
            const endedOnLabel = await resolveEndedOn(rid);
            setReactivate({ relationshipId: rid, endedOnLabel });
            setPhase("reactivate");
          } else {
            setError(
              `${formatPersonName(displayName) || "This client"} coached with you before. Reactivate instead?`,
            );
          }
        } else {
          setError(userFacingMessage(err));
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
    const trainerFull =
      formatPersonName(me?.trainerProfile?.displayName) || "you";
    return (
      <InviteShareCard
        name={name}
        inviteUrl={created.inviteUrl}
        whatsappE164={created.recipientWhatsappE164}
        trainerDisplayName={trainerFull}
        onInviteAnother={() => {
          setCreated(null);
          setEmail("");
          setDisplayName("");
          setWhatsapp("");
          setReactivate(null);
          setPhase("form");
        }}
        onEmailInvite={() => {
          const subject = encodeURIComponent(
            "You're invited to FitBud coaching",
          );
          const body = encodeURIComponent(
            `Join me on FitBud:\n${created.inviteUrl}`,
          );
          window.location.href = `mailto:${created.recipientEmail}?subject=${subject}&body=${body}`;
        }}
      />
    );
  }

  const person =
    formatPersonName(displayName) || (displayName.trim() ? displayName : "This client");
  const firstName = person.split(/\s+/)[0] || person;
  const previewLabel = displayName.trim()
    ? `Preview what ${firstName} will see`
    : "Preview what your client will see";

  const reactivateCopy = reactivate
    ? reactivate.endedOnLabel
      ? `${person} coached with you until ${reactivate.endedOnLabel}. Reactivate instead? Their history and your notes come back.`
      : `${person} coached with you before. Reactivate instead? Their history and your notes come back.`
    : null;

  return (
    <form
      className="stack-form add-client-form"
      onSubmit={onSubmit}
      data-testid={embedded ? "welcome-invite-form" : "add-client-form"}
    >
      {!online ? (
        <p className="offline-inline" role="status">
          You&apos;re offline. Changes can&apos;t be saved.
        </p>
      ) : null}

      {reactivate && reactivateCopy ? (
        <div
          className="add-client-reactivate-banner"
          role="status"
          data-testid="add-client-error"
        >
          <Clock size={18} strokeWidth={1.75} aria-hidden />
          <p>{reactivateCopy}</p>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="add-client-name">Client name</label>
        <span className="input-shell">
          <input
            id="add-client-name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={submitting || !online}
          />
        </span>
      </div>
      <div className="field">
        <label htmlFor="add-client-email">Email</label>
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
        <span className="field-hint">Used to sign in and for sign-in codes.</span>
      </div>
      <div className="field">
        <label htmlFor="add-client-wa">Mobile / WhatsApp</label>
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
      </div>
      <div className="field">
        <label htmlFor="add-client-form-select">
          <span>Onboarding form</span>
        </label>
        <span className="input-shell">
          <select
            id="add-client-form-select"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={submitting || !online}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {templateOptionLabel(t)}
              </option>
            ))}
          </select>
        </span>
        {templateId ? (
          <button
            type="button"
            className="field-preview-link"
            onClick={() => setShowPreview(true)}
          >
            {previewLabel}
          </button>
        ) : null}
      </div>

      {error && !reactivate ? (
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
        </p>
      ) : null}

      <div className="add-client-actions">
        {reactivate ? (
          <>
            <Link
              to={`/clients/${reactivate.relationshipId}`}
              className="button-primary btn-lg"
              data-testid="reactivate-client-link"
            >
              Reactivate
            </Link>
            <Button
              type="button"
              variant="secondary"
              className="btn-lg"
              onClick={clearReactivateAndReset}
            >
              Create a new invite
            </Button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              variant="primary"
              className="btn-lg"
              disabled={submitting || !online}
            >
              {submitting ? "Creating…" : "Create invite"}
            </Button>
            {embedded ? null : (
              <Button
                type="button"
                variant="secondary"
                className="btn-lg"
                onClick={() => navigate("/clients")}
              >
                Cancel
              </Button>
            )}
          </>
        )}
      </div>

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
