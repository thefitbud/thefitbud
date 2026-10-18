import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanTemplateSummary } from "@fitbud/contracts";
import { normalizeWhatsappE164 } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { listPlanTemplatesExtended } from "../lib/http-api";
import { stage1Api } from "../lib/stage1-api";
import { AddClientForm } from "../components/invite/AddClientForm";

const DRAFT_KEY = "fitbud.welcome.draft";

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

export function WelcomePage() {
  const { me, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const capturePreview =
    import.meta.env.DEV && params.get("capture") === "welcome";
  const draft = loadDraft();
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
    draft?.timezone ??
      me?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [bases, setBases] = useState<PlanTemplateSummary[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step, displayName, whatsapp, timezone }),
    );
  }, [step, displayName, whatsapp, timezone]);

  useEffect(() => {
    void listPlanTemplatesExtended({ scope: "bases", limit: 20 }).then((res) => {
      setBases(res.items.slice(0, 6));
    });
  }, []);

  const [started] = useState(() => !me?.trainerProfile?.displayName || Boolean(draft));
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
      normalized = normalizeWhatsappE164(digits.startsWith("+") ? digits : `+91${digits.replace(/\D/g, "")}`);
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
    navigate("/", { replace: true });
  }

  return (
    <section className="page welcome-page" data-testid="screen-TW-02">
      <header className="page-header">
        <h1>Welcome to FitBud</h1>
        <p className="lede">Three quick steps before your first client.</p>
        <div className="welcome-progress" aria-label="Progress">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`welcome-progress-step${
                step > n ? " is-done" : step === n ? " is-active" : ""
              }`}
            />
          ))}
        </div>
      </header>

      {step === 1 ? (
        <form className="welcome-card stack-form" onSubmit={saveProfile}>
          <h2>Your coaching profile</h2>
          <label className="field">
            <span>Display name</span>
            <span className="input-shell">
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
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
              />
            </span>
            {fieldError ? (
              <span className="form-error" role="alert">
                {fieldError}
              </span>
            ) : null}
          </label>
          <label className="field">
            <span>Timezone</span>
            <span className="input-shell">
              <input
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </span>
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={saving}>
            Continue
          </Button>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="welcome-card">
          <h2>Your starting templates</h2>
          <p className="muted">
            You can use these as they are or make your own copy later.
          </p>
          <ul className="template-bases-list">
            {bases.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
            {bases.length === 0 ? (
              <li>FitBud standard bases will appear here.</li>
            ) : null}
          </ul>
          <Button type="button" variant="primary" onClick={() => setStep(3)}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="welcome-card">
          <h2>Invite your first client</h2>
          <AddClientForm
            embedded
            onSuccess={() => {
              sessionStorage.removeItem(DRAFT_KEY);
              setDone(true);
            }}
          />
          <p className="auth-alt-links">
            <button type="button" className="link" onClick={finish}>
              Skip for now
            </button>
          </p>
          {done ? (
            <p className="form-success" role="status">
              You&apos;re set. FitBud will show you who needs attention here.
            </p>
          ) : null}
        </div>
      ) : null}

      {done ? (
        <p className="form-success" data-testid="welcome-done">
          You&apos;re set. FitBud will show you who needs attention here.{" "}
          <Link to="/">Go to Home</Link>
        </p>
      ) : null}
    </section>
  );
}
