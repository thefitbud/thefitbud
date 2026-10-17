import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { PlanTemplateSummary } from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { listPlanTemplatesExtended } from "../lib/http-api";
import { stage1Api } from "../lib/stage1-api";

export function WelcomePage() {
  const { me, refreshMe } = useAuth();
  const [params] = useSearchParams();
  const capturePreview =
    import.meta.env.DEV && params.get("capture") === "welcome";
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(
    me?.trainerProfile?.displayName ?? "",
  );
  const [whatsapp, setWhatsapp] = useState(
    me?.trainerProfile?.whatsappE164 ?? "",
  );
  const [timezone, setTimezone] = useState(
    me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [bases, setBases] = useState<PlanTemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listPlanTemplatesExtended({ scope: "bases", limit: 20 }).then((res) => {
      setBases(res.items.slice(0, 6));
    });
  }, []);

  if (me?.trainerProfile?.displayName && !capturePreview) {
    return <Navigate to="/" replace />;
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await stage1Api.updateTrainerProfile({
        displayName: displayName.trim(),
        whatsappE164: whatsapp.trim() || null,
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

  return (
    <section className="page welcome-page" data-testid="screen-TW-02">
      <header className="page-header">
        <h1>Welcome to FitBud</h1>
        <p className="lede">Three quick steps before your first client.</p>
        <ol className="wizard-progress" aria-label="Progress">
          <li className={step >= 1 ? "is-active" : ""}>Profile</li>
          <li className={step >= 2 ? "is-active" : ""}>Templates</li>
          <li className={step >= 3 ? "is-active" : ""}>Invite</li>
        </ol>
      </header>

      {step === 1 ? (
        <form className="stack-form welcome-card" onSubmit={saveProfile}>
          <h2>Your coaching profile</h2>
          <label className="field">
            <span>Display name</span>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>WhatsApp business number</span>
            <input
              type="tel"
              placeholder="+91"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" className="button-primary" disabled={saving}>
            Continue
          </button>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="welcome-card">
          <h2>Your starting templates</h2>
          <p className="muted">
            FitBud bases are ready to use. Fork any of them later from Templates.
          </p>
          <ul className="template-bases-list">
            {bases.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
          <button type="button" className="button-primary" onClick={() => setStep(3)}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="welcome-card">
          <h2>Invite your first client</h2>
          <p className="muted">
            Send an email invite or share a WhatsApp link. FitBud never messages
            clients for you.
          </p>
          <Link className="button-primary" to="/clients/add">
            Invite a client
          </Link>
          <p>
            <Link to="/">Skip for now</Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}
