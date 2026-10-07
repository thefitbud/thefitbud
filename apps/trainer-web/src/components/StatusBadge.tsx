import type { OnboardingStatus } from "@fitbud/contracts";
import { onboardingStatusLabel } from "../lib/clients";

export function StatusBadge({ status }: { status: OnboardingStatus }) {
  const label = onboardingStatusLabel(status);
  return (
    <span className={`status-badge status-${status}`} title={label}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
