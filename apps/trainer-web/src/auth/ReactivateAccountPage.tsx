import { Info, UserRound } from "lucide-react";
import {
  accountReactivationCopy as copy,
  formatPurgeDate,
} from "@fitbud/core";
import "./ReactivateAccountPage.css";

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

type Props = {
  purgeAfter: string;
  busy: boolean;
  error: string | null;
  onReactivate: () => void;
  onSignOut: () => void;
  /** Account timezone when known; else the browser's. */
  timeZone?: string;
  /** Optional footer line under the card (frame shows signed-in email). */
  signedInAs?: string | null;
};

/**
 * Z12-30: archived trainer after sign-in (BP1-reactivate-account-web.png).
 * Copy from `accountReactivationCopy` (D-W12-6); coaching stays ended (D-W6-8).
 */
export function ReactivateAccountPage({
  purgeAfter,
  busy,
  error,
  onReactivate,
  onSignOut,
  timeZone = deviceTimeZone(),
  signedInAs,
}: Props) {
  const date = formatPurgeDate(purgeAfter, timeZone);
  return (
    <main className="reactivate-shell" data-testid="reactivate-account">
      <div className="reactivate-brand">
        <span className="reactivate-brand-dot" aria-hidden="true" />
        <span>FitBud</span>
      </div>
      <section className="auth-panel reactivate-card" aria-labelledby="reactivate-title">
        <div className="reactivate-avatar" aria-hidden="true">
          <UserRound size={34} strokeWidth={2} />
        </div>
        <h1 id="reactivate-title">{copy.title}</h1>
        <p className="reactivate-body">{copy.body(date)}</p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="reactivate-note" role="note">
          <Info size={16} strokeWidth={2} aria-hidden="true" />
          <p>{copy.trainerNote}</p>
        </div>
        <div className="reactivate-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={onSignOut}
            data-testid="reactivate-account-sign-out"
          >
            {copy.signOut}
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={onReactivate}
            data-testid="reactivate-account-confirm"
          >
            {busy ? "Working…" : copy.reactivate}
          </button>
        </div>
        <p className="muted reactivate-footnote">{copy.signOutNote}</p>
        {signedInAs ? (
          <p className="muted reactivate-signed-in">Signed in as {signedInAs}</p>
        ) : null}
      </section>
    </main>
  );
}
