import { Link } from "react-router-dom";
import type { ConsistencyWarning } from "@fitbud/contracts";

export function PlanConsistencyNotice({
  warnings,
  acknowledged,
  acting = false,
  onAcknowledge,
  planTo,
  configureTo,
  showPlanLink,
  showConfigureLink,
}: {
  warnings: readonly ConsistencyWarning[];
  acknowledged: boolean;
  acting?: boolean;
  onAcknowledge?: () => void;
  planTo: string;
  configureTo: string;
  showPlanLink: boolean;
  showConfigureLink: boolean;
}) {
  if (warnings.length === 0 || acknowledged) return null;
  return (
    <section className="plan-consistency" role="status" aria-label="Plan and configuration difference">
      <h3 className="plan-section-title">Plan and configuration differ</h3>
      <ul>
        {warnings.map((warning) => (
          <li key={warning.code}>{warning.message}</li>
        ))}
      </ul>
      <div className="button-row">
        {showPlanLink ? (
          <Link className="button-secondary" to={planTo}>
            Adjust the plan
          </Link>
        ) : null}
        {showConfigureLink ? (
          <Link className="button-secondary" to={configureTo}>
            Adjust the configuration
          </Link>
        ) : null}
        {onAcknowledge ? (
          <button
            type="button"
            className="button-ghost"
            disabled={acting}
            onClick={onAcknowledge}
          >
            Acknowledge the difference
          </button>
        ) : null}
      </div>
    </section>
  );
}
