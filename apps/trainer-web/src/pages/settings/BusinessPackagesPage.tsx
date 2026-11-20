import { Link } from "react-router-dom";
import { SettingsCard, SettingsRow } from "./SettingsLayout";

/**
 * Packages are relationship-owned (client Settings). This page only points
 * there — it does not save a trainer-level business profile.
 */
export function BusinessPackagesPage() {
  return (
    <SettingsCard
      title="Business and packages"
      aside="Tracked on each client"
      testId="screen-settings-business"
    >
      <SettingsRow
        label="Packages and payments"
        help="Amount, renewal and paid or unpaid live on the client, not in this account."
      >
        <Link className="ui-btn ui-btn-secondary" to="/clients">
          Open clients
        </Link>
      </SettingsRow>
    </SettingsCard>
  );
}
