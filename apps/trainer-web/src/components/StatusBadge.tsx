import type { OnboardingStatus } from "@fitbud/contracts";
import { onboardingStatusLabel } from "../lib/clients";

export function StatusBadge({ status }: { status: OnboardingStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {onboardingStatusLabel(status)}
    </span>
  );
}
