import { useState } from "react";

export function PrivacyDataPage() {
  const [toast, setToast] = useState<string | null>(null);

  function requestExport() {
    setToast(
      "We received your export request. We'll email you when your download is ready.",
    );
    window.setTimeout(() => setToast(null), 6000);
  }

  return (
    <div className="settings-panel stack-lg">
      <h2>Privacy &amp; data</h2>
      <section className="settings-copy-block">
        <h3>What FitBud stores</h3>
        <ul className="settings-bullet-list">
          <li>
            Your account details (email, display name, timezone, and sign-in
            credentials).
          </li>
          <li>
            Coaching data you create: client roster, plans, notes, check-in
            reviews, and configuration.
          </li>
          <li>
            Client-submitted intake, check-ins, meals, workouts, and progress —
            only for clients you coach.
          </li>
          <li>
            Notification preferences and quiet hours for your trainer account.
          </li>
        </ul>
        <p className="muted">
          We do not sell personal data. Export and deletion policies are being
          finalised with our legal review.
        </p>
      </section>
      <section>
        <h3>Data export</h3>
        <p className="muted">
          Request a copy of your trainer account data. We will email you a secure
          link when the export is ready.
        </p>
        <button
          type="button"
          className="button-secondary"
          onClick={requestExport}
        >
          Request data export
        </button>
      </section>
      {toast ? (
        <p className="form-success" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
