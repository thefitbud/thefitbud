import { useMemo, useState } from "react";
import {
  AddClientForm,
  type AddClientPhase,
} from "../components/invite/AddClientForm";
import { formatPersonName } from "@fitbud/core";
import "./AddClientPage.css";

function firstNameOf(raw: string): string {
  const formatted = formatPersonName(raw);
  return formatted.split(/\s+/)[0] || formatted || "your client";
}

export function AddClientPage() {
  const [phase, setPhase] = useState<AddClientPhase>("form");
  const [clientName, setClientName] = useState("");
  const firstName = useMemo(() => firstNameOf(clientName), [clientName]);

  return (
    <section className="page add-client-page" data-testid="screen-TW-07">
      <header className="page-header">
        <h1>Add client</h1>
      </header>
      <div
        className={`add-client-layout${phase === "success" ? " is-success" : ""}`}
      >
        <div className="add-client-form-card">
          <AddClientForm
            onPhaseChange={setPhase}
            onClientNameChange={setClientName}
          />
        </div>
        {phase === "success" ? null : (
          <aside className="add-client-side-card">
            <h2 className="t-h3">What happens next</h2>
            {phase === "reactivate" ? (
              <p className="whats-next-reactivate">
                Reactivating sends {firstName} a request they confirm in the
                app. Reminders and check-ins start again after you assign a
                plan.
              </p>
            ) : (
              <ol className="whats-next-stepper">
                <li>You create the invite and share the link.</li>
                <li>
                  {clientName.trim()
                    ? `${firstName} joins, sets a password and fills the intake.`
                    : "Your client joins, sets a password and fills the intake."}
                </li>
                <li>You review the intake and set up coaching.</li>
                <li>You publish a plan. Reminders start.</li>
              </ol>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
