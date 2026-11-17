import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  OnboardingFormTemplateSummary,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import { formatPersonName, normalizeWhatsappE164 } from "@fitbud/core";
import {
  Check,
  CheckSquare,
  ClipboardList,
  Dumbbell,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { useOnline } from "../hooks/useOnline";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { intakeFieldPreview } from "../lib/intakePrefill";
import { stage1Api } from "../lib/stage1-api";
import "./WelcomePage.css";

const DRAFT_KEY = "fitbud.welcome.draft";

const STEPS = [
  { n: 1, title: "Your coaching profile" },
  { n: 2, title: "Your starting templates" },
  { n: 3, title: "Invite your first client" },
] as const;

const STARTING_TEMPLATES: {
  id: string;
  title: string;
  meta: string;
  Icon: LucideIcon;
}[] = [
  {
    id: "intake",
    title: "FitBud standard intake",
    meta: "Onboarding form · v3 · 5 sections",
    Icon: ClipboardList,
  },
  {
    id: "checkin",
    title: "Weekly check-in",
    meta: "Check-in form · weight, waist, 3 photos, 5 questions",
    Icon: CheckSquare,
  },
  {
    id: "workout",
    title: "Fat loss base",
    meta: "Workout · 4 sessions a week",
    Icon: Dumbbell,
  },
  {
    id: "nutrition",
    title: "Balanced Indian diet base",
    meta: "Nutrition · 5 meals a day · 1,800 kcal",
    Icon: UtensilsCrossed,
  },
];

type Draft = {
  step: number;
  displayName: string;
  whatsapp: string;
  timezone: string;
};

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

/** Frame 125: "India (IST) · detected" — never raw IANA in the control. */
function timezoneOptionLabel(iana: string, detected: string): string {
  const base =
    iana === "Asia/Kolkata" || iana === "Asia/Calcutta"
      ? "India (IST)"
      : iana;
  return iana === detected ? `${base} · detected` : base;
}

function templateSelectLabel(t: OnboardingFormTemplateSummary): string {
  const ownership = t.ownership === "global" ? " (global)" : "";
  return `${t.name}${ownership} · v${t.latestVersionNumber}`;
}

export function WelcomePage() {
  const { me, refreshMe } = useAuth();
  const online = useOnline();
  const [params] = useSearchParams();
  const capturePreview =
    import.meta.env.DEV && params.get("capture") === "welcome";
  const draft = loadDraft();
  const detectedZone = useMemo(
    () =>
      me?.timezone ??
      (typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "Asia/Kolkata"),
    [me?.timezone],
  );
  const [step, setStep] = useState(draft?.step ?? 1);
  const [displayName, setDisplayName] = useState(
    draft?.displayName ?? me?.trainerProfile?.displayName ?? "",
  );
  const [whatsapp, setWhatsapp] = useState(() => {
    if (draft?.whatsapp) return draft.whatsapp;
    const raw = me?.trainerProfile?.whatsappE164 ?? "";
    return raw.replace(/^\+?91/, "");
  });
  const [timezone, setTimezone] = useState(
    draft?.timezone ?? detectedZone,
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Invite step state (owned here so frame copy/layout stay in files_owned).
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientWhatsapp, setClientWhatsapp] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<OnboardingFormTemplateSummary[]>(
    [],
  );
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step, displayName, whatsapp, timezone }),
    );
  }, [step, displayName, whatsapp, timezone]);

  useEffect(() => {
    if (step !== 3) return;
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
  }, [step]);

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

  const [started] = useState(
    () => !me?.trainerProfile?.displayName || Boolean(draft),
  );

  const timezoneChoices = useMemo(() => {
    const set = new Set<string>(["Asia/Kolkata", detectedZone, timezone]);
    return [...set].filter(Boolean);
  }, [detectedZone, timezone]);

  if (me?.trainerProfile?.displayName && !capturePreview && !started && !done) {
    return <Navigate to="/" replace />;
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldError(null);
    const digits = whatsapp.trim();
    let normalized: string | null = null;
    if (digits) {
      normalized = normalizeWhatsappE164(
        digits.startsWith("+") ? digits : `+91${digits.replace(/\D/g, "")}`,
      );
      if (!normalized) {
        setFieldError("Enter a valid 10-digit Indian mobile number.");
        setSaving(false);
        return;
      }
    }
    try {
      await stage1Api.updateTrainerProfile({
        displayName: displayName.trim(),
        whatsappE164: normalized,
        timezone,
      });
      await refreshMe();
      setStep(2);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    sessionStorage.removeItem(DRAFT_KEY);
    setDone(true);
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    if (!online) return;
    setInviteSubmitting(true);
    setInviteError(null);
    const digits = clientWhatsapp.trim();
    let recipientWhatsapp: string | undefined;
    if (digits) {
      const normalized = normalizeWhatsappE164(
        digits.startsWith("+") ? digits : `+91${digits.replace(/\D/g, "")}`,
      );
      if (!normalized) {
        setInviteError("Enter a valid WhatsApp number.");
        setInviteSubmitting(false);
        return;
      }
      recipientWhatsapp = normalized;
    }
    try {
      await apiClient.createInvitation(
        {
          recipientEmail: clientEmail.trim(),
          recipientDisplayName: clientName.trim() || undefined,
          recipientWhatsapp,
          ...(templateId ? { onboardingFormTemplateId: templateId } : {}),
          sendEmail: true,
        },
        createIdempotencyKey(),
      );
      finish();
    } catch (err) {
      setInviteError(
        err instanceof ApiClientError
          ? err.message
          : "Could not create invitation.",
      );
    } finally {
      setInviteSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="welcome-shell" data-testid="screen-TW-02">
        <div className="welcome-done" data-testid="welcome-done">
          <BrandMark size={40} />
          <h1>You&apos;re set</h1>
          <p>FitBud will show you who needs attention here.</p>
          <Link className="button-primary" to="/">
            Go to Home
          </Link>
        </div>
      </main>
    );
  }

  const previewName =
    formatPersonName(clientName.trim()) ||
    (clientName.trim() ? clientName.trim() : "your client");

  return (
    <main className="welcome-shell" data-testid="screen-TW-02">
      <header className="welcome-top">
        <div className="welcome-brand">
          <BrandMark size={28} />
          <span>FitBud</span>
        </div>
        <p className="welcome-draft-note">
          Draft saved · you can leave and come back
        </p>
      </header>

      <div className="welcome-main">
        <ol className="welcome-stepper" aria-label="Onboarding progress">
          {STEPS.map((s) => {
            const state =
              step > s.n ? "is-done" : step === s.n ? "is-active" : "";
            return (
              <li key={s.n} className={`welcome-stepper-item ${state}`.trim()}>
                <div className="welcome-stepper-label">
                  <span className="welcome-stepper-num" aria-hidden="true">
                    {step > s.n ? <Check size={14} strokeWidth={2.5} /> : s.n}
                  </span>
                  <span className="welcome-stepper-title">{s.title}</span>
                </div>
                <div className="welcome-stepper-rail" />
              </li>
            );
          })}
        </ol>

        {step === 1 ? (
          <form className="welcome-step-block" onSubmit={saveProfile}>
            <div className="welcome-card welcome-stack">
              <p className="welcome-kicker">Step 1 of 3</p>
              <h1>Your coaching profile</h1>
              <p className="welcome-lede">This is what your clients see.</p>

              <label className="field">
                <span>Display name</span>
                <span className="input-shell">
                  <input
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </span>
                <span className="welcome-field-hint">
                  Shown to clients in the app and in reminders.
                </span>
              </label>

              <label className="field">
                <span>WhatsApp number</span>
                <span className="input-shell">
                  <span className="phone-prefix">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    autoComplete="tel-national"
                  />
                </span>
                {fieldError ? (
                  <span className="form-error" role="alert">
                    {fieldError}
                  </span>
                ) : (
                  <span className="welcome-field-hint">
                    Used for your clients&apos; Ask coach links.
                  </span>
                )}
              </label>

              <label className="field">
                <span>Timezone</span>
                <span className="input-shell">
                  <select
                    required
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    aria-label="Timezone"
                  >
                    {timezoneChoices.map((z) => (
                      <option key={z} value={z}>
                        {timezoneOptionLabel(z, detectedZone)}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="welcome-actions">
              <Button type="submit" variant="primary" disabled={saving}>
                Continue
              </Button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <div className="welcome-step-block">
            <div className="welcome-card">
              <p className="welcome-kicker">Step 2 of 3</p>
              <h1>Your starting templates</h1>
              <p className="welcome-lede">
                You can use these as they are or make your own copy later.
              </p>
              <ul className="welcome-template-grid">
                {STARTING_TEMPLATES.map(({ id, title, meta, Icon }) => (
                  <li key={id} className="welcome-template-card">
                    <span className="welcome-template-icon" aria-hidden="true">
                      <Icon size={18} strokeWidth={1.75} />
                    </span>
                    <h2>{title}</h2>
                    <p className="welcome-template-meta">{meta}</p>
                    <span className="welcome-template-tag">
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                      FitBud base
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="welcome-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button type="button" variant="primary" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <form
            className="welcome-step-block"
            onSubmit={createInvite}
            data-testid="welcome-invite-form"
          >
            <div className="welcome-card welcome-stack">
              <p className="welcome-kicker">Step 3 of 3</p>
              <h1>Invite your first client</h1>
              <p className="welcome-lede">
                They&apos;ll get a link to join and fill their intake.
              </p>

              {!online ? (
                <p className="offline-inline" role="status">
                  You&apos;re offline. Changes can&apos;t be saved.
                </p>
              ) : null}

              <label className="field" htmlFor="welcome-client-name">
                <span>Client name</span>
                <span className="input-shell">
                  <input
                    id="welcome-client-name"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    disabled={inviteSubmitting || !online}
                  />
                </span>
              </label>

              <label className="field" htmlFor="welcome-client-email">
                <span>Email</span>
                <span className="input-shell">
                  <input
                    id="welcome-client-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    disabled={inviteSubmitting || !online}
                  />
                </span>
                <span className="welcome-field-hint">
                  Used to sign in and for sign-in codes.
                </span>
              </label>

              <label className="field" htmlFor="welcome-client-wa">
                <span>Mobile / WhatsApp</span>
                <span className="input-shell">
                  <span className="phone-prefix">+91</span>
                  <input
                    id="welcome-client-wa"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={clientWhatsapp}
                    onChange={(e) => setClientWhatsapp(e.target.value)}
                    disabled={inviteSubmitting || !online}
                  />
                </span>
                <span className="welcome-field-hint">
                  Your client can sign in with this number, and you can message
                  them on WhatsApp from FitBud.
                </span>
              </label>

              <label className="field" htmlFor="welcome-onboarding-form">
                <span>Onboarding form</span>
                <span className="input-shell">
                  <select
                    id="welcome-onboarding-form"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    disabled={inviteSubmitting || !online}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {templateSelectLabel(t)}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              {templateId && definition ? (
                <p className="welcome-invite-preview">
                  <button
                    type="button"
                    className="link"
                    onClick={() => setShowPreview(true)}
                  >
                    Preview what {previewName} will see
                  </button>
                </p>
              ) : null}

              {inviteError ? (
                <p className="form-error" role="alert">
                  {inviteError}
                </p>
              ) : null}
            </div>
            <div className="welcome-actions">
              <button type="button" className="link" onClick={finish}>
                Skip for now
              </button>
              <Button
                type="submit"
                variant="primary"
                disabled={inviteSubmitting || !online}
              >
                {inviteSubmitting ? "Creating…" : "Create invite"}
              </Button>
            </div>
          </form>
        ) : null}
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
    </main>
  );
}
