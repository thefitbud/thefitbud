import { Link } from "react-router-dom";
import { AddClientForm } from "../components/invite/AddClientForm";

export function AddClientPage() {
  return (
    <section className="page add-client-page" data-testid="screen-TW-07">
      <header className="page-header">
        <p className="eyebrow">
          <Link to="/clients">Clients</Link> / Add
        </p>
        <h1>Add client</h1>
        <p className="lede">
          Invite someone to coaching with the right onboarding form.
        </p>
      </header>
      <div className="add-client-layout">
        <div className="add-client-form-card">
          <AddClientForm />
        </div>
        <aside className="add-client-side-card">
          <h2 className="t-h3">What happens next</h2>
          <ol className="whats-next-stepper">
            <li>You share the invite link on WhatsApp, email, or QR.</li>
            <li>Your client accepts and sets a password in the FitBud app.</li>
            <li>They fill the onboarding form you pinned.</li>
            <li>You review intake, configure coaching, and publish a plan.</li>
          </ol>
        </aside>
      </div>
    </section>
  );
}
